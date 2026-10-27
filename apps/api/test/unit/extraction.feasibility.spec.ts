import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import { compileOutputSchema } from '../../src/ai/ai.schema.js';
import {
  CV_OUTPUT_SCHEMA,
  JD_OUTPUT_SCHEMA,
} from '../../src/extraction/extraction.schemas.js';
import { parseDocx } from '../../src/extraction/docx.parser.js';
import {
  createExtractionSource,
  validateCvOutput,
  validateJdOutput,
} from '../../src/extraction/extraction.validation.js';
import type {
  ExtractionSource,
  QuoteReference,
  CvData,
  CvExtractionResult,
  JdExtractionResult,
} from '../../src/extraction/extraction.types.js';
import { matchExtractions } from '../../src/matching/matching.js';
import { sourceLine } from '../../src/matching/matching.evidence.js';
import { documents } from '../evaluation/datasets/v1/extraction.js';
import { livePairs } from '../evaluation/live-plan.js';
import {
  emptyCv,
  emptyJd,
  syntheticSource,
  unknownFact,
  quotedFact,
} from '../support/extraction-fixtures.js';
import {
  lineSegments,
  specializedSchema,
  legacyCollectionSchema,
} from '../support/extraction-feasibility.js';

function cv(
  source: ExtractionSource,
  data: CvData<QuoteReference>,
): CvExtractionResult {
  return {
    schemaVersion: '1',
    kind: 'cv',
    source,
    data: validateCvOutput(data, source),
    warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
  };
}
function jd(source: ExtractionSource, data: unknown): JdExtractionResult {
  return {
    schemaVersion: '1',
    kind: 'jd',
    source,
    data: validateJdOutput(data, source),
    warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
  };
}
// Author chooses a specific line in synthetic probes; this is not model-output
// repair and must never become a runtime first-occurrence fallback.
function quote(source: ExtractionSource, line: number, value?: string) {
  const segment = source.segments[line]!;
  const text = source.text.slice(segment.start, segment.end);
  return quotedFact(value ?? text, segment.id, text);
}
const supportedCv = () =>
  cv(syntheticSource('React', 'docx'), {
    ...emptyCv(),
    skills: [{ name: quotedFact('React'), experienceText: unknownFact() }],
  });
const supportedJd = () =>
  jd(syntheticSource('React', 'text'), {
    ...emptyJd(),
    requirements: [{ text: quotedFact('React'), priority: unknownFact() }],
  });
function metrics(result: ReturnType<typeof matchExtractions>) {
  return {
    score: result.overallScore,
    coverage: result.coverage,
    requirements: result.requirements.map((r) => ({
      predicate: r.predicate,
      status: r.status,
      evaluability: r.evaluability,
      included: r.includedInScore,
    })),
  };
}

test.each(['\n', '\r\n', '\r', '\u2028', '\u2029'])(
  'line prototype preserves exact text and UTF-16 with delimiter %#',
  (separator) => {
    const text = `😀 React${separator}${separator}  ${separator}React${separator}`;
    const source = syntheticSource(text, 'text');
    const result = lineSegments(source);
    const second = text.lastIndexOf('React');
    expect(result.text).toBe(text);
    expect(result.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 8],
      [second, second + 5],
    ]);
    for (const [index, segment] of result.segments.entries()) {
      const data = validateJdOutput(
        { ...emptyJd(), title: quotedFact('React', segment.id) },
        result,
      );
      expect(data.title.evidence[0]?.start).toBe(index === 0 ? 3 : second);
      expect(sourceLine(result, data.title.evidence[0]!)).not.toBeNull();
    }
    expect(() =>
      validateJdOutput({ ...emptyJd(), title: quotedFact('React') }, source),
    ).toThrow('Extraction evidence');
  },
);
test('PDF page ownership and DOCX paragraph ownership survive splitting', () => {
  for (const format of ['pdf', 'docx'] as const) {
    const source = createExtractionSource({
      format,
      text: 'React\nDocker\n\nReact',
      segments: [
        { id: 'first', start: 0, end: 12, page: format === 'pdf' ? 1 : null },
        { id: 'second', start: 14, end: 19, page: format === 'pdf' ? 2 : null },
      ],
    });
    const split = lineSegments(source);
    expect(split.segments.map((s) => [s.start, s.end, s.page])).toEqual([
      [0, 5, format === 'pdf' ? 1 : null],
      [6, 12, format === 'pdf' ? 1 : null],
      [14, 19, format === 'pdf' ? 2 : null],
    ]);
    expect(split.text).toBe(source.text);
  }
});
test('repeated identical lines become individually unique without proving correct attribution', () => {
  const source = syntheticSource('React\nReact', 'text');
  const split = lineSegments(source);
  expect(() =>
    validateJdOutput({ ...emptyJd(), title: quotedFact('React') }, source),
  ).toThrow();
  for (const segment of split.segments)
    expect(
      validateJdOutput(
        { ...emptyJd(), title: quotedFact('React', segment.id) },
        split,
      ).title.evidence[0]?.start,
    ).toBe(segment.start);
  expect(split.segments).toHaveLength(2);
});
test('within-line duplicates and surrogate splits still reject', () => {
  const split = lineSegments(syntheticSource('😀 React React', 'text'));
  for (const value of ['React', '\ud83d', '\ude00'])
    expect(() =>
      validateJdOutput(
        { ...emptyJd(), title: quotedFact(value, split.segments[0]!.id) },
        split,
      ),
    ).toThrow();
});
test('line count explosion still respects production source limits', () => {
  expect(() =>
    lineSegments(syntheticSource(Array(1001).fill('x').join('\n'), 'text')),
  ).toThrow();
});

test('actual duration DOCX: 1 to 4 segments, short quote becomes unique, duration matching unchanged with valid authored evidence', async () => {
  const fixture = documents().find((d) => d.id === 'cv-duration-docx')!;
  if (fixture.input.kind !== 'cv') throw new Error('fixture kind');
  const current = (await parseDocx(fixture.input.value.bytes)).source;
  const split = lineSegments(current);
  expect(current.text).toBe(fixture.expectedText);
  expect(current.segments.map((s) => [s.start, s.end])).toEqual([[0, 98]]);
  expect(split.segments.map((s) => [s.start, s.end])).toEqual([
    [0, 19],
    [20, 30],
    [31, 68],
    [69, 98],
  ]);
  const name = fixture.gold.facts.find((f) => f.field === 'skills.name')!
    .values[0]!;
  expect(() =>
    validateCvOutput(
      {
        ...emptyCv(),
        skills: [
          {
            name: quotedFact(name, current.segments[0]!.id),
            experienceText: unknownFact(),
          },
        ],
      },
      current,
    ),
  ).toThrow();
  const original = livePairs()[0]!.fixture.input.cv;
  const after = cv(split, {
    ...emptyCv(),
    skills: [
      {
        name: quote(split, 1, name),
        experienceText: quote(
          split,
          2,
          original.data.skills[0]!.experienceText.value!,
        ),
      },
    ],
  });
  const target = livePairs()[0]!.fixture.input.jd;
  expect(metrics(matchExtractions({ cv: after, jd: target }))).toEqual(
    metrics(matchExtractions({ cv: original, jd: target })),
  );
  expect(matchExtractions({ cv: after, jd: target }).overallScore).toBe(25);
});

test.each([0, 1])(
  'pair %i: line-aligned JD evidence changes eligibility and scores without changing matching policy',
  (index) => {
    const input = livePairs()[index]!.fixture.input;
    const split = lineSegments(input.jd.source);
    expect(input.jd.source.segments).toHaveLength(1);
    expect(split.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 19],
      [20, 66],
      [67, 87],
      [88, 94],
      [95, 138],
    ]);
    const candidate = jd(split, {
      ...emptyJd(),
      requirements: input.jd.data.requirements.map((r, i) => ({
        text: quote(split, i, r.text.value!),
        priority:
          r.priority.value === null
            ? unknownFact()
            : quote(split, i, r.priority.value),
      })),
    });
    const before = matchExtractions(input);
    const after = matchExtractions({ ...input, jd: candidate });
    expect(before.overallScore).toBe(index === 0 ? 25 : 0);
    expect(after.coverage).toMatchObject({
      inputRequirementCount: 5,
      canonicalRequirementCount: 5,
      evaluableRequirementCount: 4,
      excludedRequirementCount: 1,
      activeCategoryWeight: 60,
      jdEvaluabilityRatio: 0.8,
    });
    expect(before.coverage).toMatchObject({
      evaluableRequirementCount: 3,
      excludedRequirementCount: 2,
      jdEvaluabilityRatio: 0.6,
    });
    expect(after.requirements[0]?.evaluability).toBe('EVALUABLE');
    expect(after.requirements.map((r) => r.predicate)).toEqual(
      before.requirements.map((r) => r.predicate),
    );
    expect(after.overallScore).toBe(index === 0 ? 54.17 : 0);
  },
);

test.each([
  'No experience with\nReact',
  'Learning only; no demonstrated experience:\nReact',
])('cross-line context can be lost while support rises %#', (text) => {
  const current = syntheticSource(text, 'docx');
  const split = lineSegments(current);
  const before = cv(current, {
    ...emptyCv(),
    skills: [
      { name: quotedFact('React', 's1', text), experienceText: unknownFact() },
    ],
  });
  const after = cv(split, {
    ...emptyCv(),
    skills: [{ name: quote(split, 1), experienceText: unknownFact() }],
  });
  expect(
    sourceLine(current, before.data.skills[0]!.name.evidence[0]!),
  ).toBeNull();
  expect(
    sourceLine(split, after.data.skills[0]!.name.evidence[0]!),
  ).not.toBeNull();
  expect(matchExtractions({ cv: before, jd: supportedJd() }).overallScore).toBe(
    0,
  );
  expect(matchExtractions({ cv: after, jd: supportedJd() }).overallScore).toBe(
    100,
  );
  // Full source still contains the context, but no individual new segment does.
  expect(split.text).toBe(current.text);
  expect(() =>
    validateCvOutput(
      {
        ...emptyCv(),
        skills: [
          {
            name: quotedFact('React', split.segments[0]!.id, text),
            experienceText: unknownFact(),
          },
        ],
      },
      split,
    ),
  ).toThrow();
});
test('current bare-line evidence already misses cross-line context; segmentation does not fix this', () => {
  const current = syntheticSource('No experience with\nReact', 'docx');
  const split = lineSegments(current);
  const before = cv(current, {
    ...emptyCv(),
    skills: [{ name: quotedFact('React'), experienceText: unknownFact() }],
  });
  const after = cv(split, {
    ...emptyCv(),
    skills: [{ name: quote(split, 1), experienceText: unknownFact() }],
  });
  expect(metrics(matchExtractions({ cv: before, jd: supportedJd() }))).toEqual(
    metrics(matchExtractions({ cv: after, jd: supportedJd() })),
  );
  expect(matchExtractions({ cv: before, jd: supportedJd() }).overallScore).toBe(
    100,
  );
});
test('cross-line JD priority link becomes unrepresentable within one segment', () => {
  const text = 'required\nReact';
  const current = syntheticSource(text, 'text');
  const split = lineSegments(current);
  const before = jd(current, {
    ...emptyJd(),
    requirements: [
      {
        text: quotedFact('React'),
        priority: quotedFact('required', 's1', text),
      },
    ],
  });
  expect(
    matchExtractions({ cv: supportedCv(), jd: before }).overallScore,
  ).toBeNull();
  expect(
    matchExtractions({ cv: supportedCv(), jd: before }).coverage
      .excludedRequirementCount,
  ).toBe(1);
  expect(() =>
    jd(split, {
      ...emptyJd(),
      requirements: [{ text: quote(split, 1), priority: quote(split, 0) }],
    }),
  ).toThrow('Extraction evidence');
});
test('same-line priority and duration predicates remain intact', () => {
  const current = syntheticSource('React required', 'text');
  const split = lineSegments(current);
  const before = jd(current, {
    ...emptyJd(),
    requirements: [
      {
        text: quotedFact('React'),
        priority: quotedFact('required', 's1', current.text),
      },
    ],
  });
  const after = jd(split, {
    ...emptyJd(),
    requirements: [
      { text: quote(split, 0, 'React'), priority: quote(split, 0, 'required') },
    ],
  });
  expect(metrics(matchExtractions({ cv: supportedCv(), jd: after }))).toEqual(
    metrics(matchExtractions({ cv: supportedCv(), jd: before })),
  );
});

const specializedCv = compileOutputSchema(specializedSchema('cv')).validate;
const specializedJd = compileOutputSchema(specializedSchema('jd')).validate;
const originalCv = compileOutputSchema(legacyCollectionSchema('cv')).validate;
const originalJd = compileOutputSchema(legacyCollectionSchema('jd')).validate;
test.each(['skill', 'requirement', 'responsibility'])(
  'specialized %s schema rejects existing post-validation null failure earlier',
  (kind) => {
    const isCv = kind === 'skill';
    const input = isCv
      ? {
          ...emptyCv(),
          skills: [{ name: unknownFact(), experienceText: unknownFact() }],
        }
      : kind === 'requirement'
        ? {
            ...emptyJd(),
            requirements: [{ text: unknownFact(), priority: unknownFact() }],
          }
        : { ...emptyJd(), responsibilities: [unknownFact()] };
    const snapshot = JSON.stringify(input);
    expect((isCv ? originalCv : originalJd)(input)).toBe(true);
    expect((isCv ? specializedCv : specializedJd)(input)).toBe(false);
    expect(() =>
      (isCv ? validateCvOutput : validateJdOutput)(
        input,
        syntheticSource('Synthetic', isCv ? 'docx' : 'text'),
      ),
    ).toThrow('Extraction output');
    expect(JSON.stringify(input)).toBe(snapshot);
  },
);
test('empty collections and optional experience/priority remain valid', () => {
  expect(specializedCv(emptyCv())).toBe(true);
  expect(specializedJd(emptyJd())).toBe(true);
  expect(
    specializedCv({
      ...emptyCv(),
      skills: [{ name: quotedFact('React'), experienceText: unknownFact() }],
    }),
  ).toBe(true);
  expect(
    specializedJd({
      ...emptyJd(),
      requirements: [{ text: quotedFact('React'), priority: unknownFact() }],
    }),
  ).toBe(true);
});
// Remove application-resolved offsets only; retain every authored value and quote.
function wire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(wire);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => k !== 'start' && k !== 'end')
        .map(([k, v]) => [k, wire(v)]),
    );
  return value;
}
test('all ten authored dataset outputs remain schema-valid; production-valid outputs still validate', () => {
  let productionValid = 0;
  for (const fixture of documents()) {
    const source = syntheticSource(
      fixture.expectedText,
      fixture.input.kind === 'jd'
        ? 'text'
        : fixture.id.endsWith('pdf')
          ? 'pdf'
          : 'docx',
    );
    const result = fixture.observed(source);
    const input = wire(result.data);
    const snapshot = JSON.stringify(input);
    expect((result.kind === 'cv' ? originalCv : originalJd)(input)).toBe(true);
    expect((result.kind === 'cv' ? specializedCv : specializedJd)(input)).toBe(
      true,
    );
    try {
      (result.kind === 'cv' ? validateCvOutput : validateJdOutput)(
        input,
        source,
      );
      productionValid++;
    } catch {
      /* Authored evidence is not necessarily production-valid; no repair. */
    }
    expect(JSON.stringify(input)).toBe(snapshot);
  }
  expect(productionValid).toBe(10);
  expect(documents()).toHaveLength(10);
});
test('specialization does not invent support or bypass evidence checks', () => {
  const input = {
    ...emptyCv(),
    skills: [{ name: quotedFact('Absent'), experienceText: unknownFact() }],
  };
  const snapshot = JSON.stringify(input);
  expect(specializedCv(input)).toBe(true);
  expect(() => validateCvOutput(input, syntheticSource())).toThrow(
    'Extraction evidence',
  );
  expect(JSON.stringify(input)).toBe(snapshot);
});
test('legacy and production schemas differ at only three type paths', () => {
  const changes: string[] = [];
  function compare(a: unknown, b: unknown, path: string): void {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        compare(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
          `${path}/${key}`,
        );
    } else changes.push(path);
  }
  compare(legacyCollectionSchema('cv'), CV_OUTPUT_SCHEMA, 'cv');
  compare(legacyCollectionSchema('jd'), JD_OUTPUT_SCHEMA, 'jd');
  expect(changes).toEqual([
    'cv/properties/skills/items/properties/name/properties/value/type',
    'jd/properties/requirements/items/properties/text/properties/value/type',
    'jd/properties/responsibilities/items/properties/value/type',
  ]);
});

test('cross-line CV duration keeps source context but loses a single enclosing evidence span', () => {
  const current = syntheticSource('React\n3 years', 'docx');
  const split = lineSegments(current);
  const before = cv(current, {
    ...emptyCv(),
    skills: [
      {
        name: quotedFact('React'),
        experienceText: quotedFact('3 years', 's1', current.text),
      },
    ],
  });
  expect(split.segments.map((s) => [s.start, s.end])).toEqual([
    [0, 5],
    [6, 13],
  ]);
  expect(() =>
    cv(split, {
      ...emptyCv(),
      skills: [
        {
          name: quote(split, 0),
          experienceText: quotedFact(
            '3 years',
            split.segments[1]!.id,
            current.text,
          ),
        },
      ],
    }),
  ).toThrow('Extraction evidence');
  const after = cv(split, {
    ...emptyCv(),
    skills: [{ name: quote(split, 0), experienceText: quote(split, 1) }],
  });
  const target = jd(
    syntheticSource('5 years of experience with React', 'text'),
    {
      ...emptyJd(),
      requirements: [
        {
          text: quotedFact('5 years of experience with React'),
          priority: unknownFact(),
        },
      ],
    },
  );
  expect(metrics(matchExtractions({ cv: after, jd: target }))).toEqual(
    metrics(matchExtractions({ cv: before, jd: target })),
  );
  expect(matchExtractions({ cv: after, jd: target }).overallScore).toBe(0);
  expect(split.text).toBe(current.text);
});
test('schema specialization can change which rejection wins for multiply invalid output', () => {
  const input = {
    ...emptyJd(),
    title: quotedFact('Absent'),
    responsibilities: [unknownFact()],
  };
  expect(originalJd(input)).toBe(true);
  expect(specializedJd(input)).toBe(false);
  expect(() =>
    validateJdOutput(input, syntheticSource('Synthetic', 'text')),
  ).toThrow('Extraction output');
});
test('specialized schema does not remove other semantic rejection boundaries', () => {
  const input = {
    ...emptyCv(),
    experience: [
      {
        employer: unknownFact(),
        title: unknownFact(),
        startDateText: unknownFact(),
        endDateText: unknownFact(),
        descriptionText: unknownFact(),
      },
    ],
  };
  expect(specializedCv(input)).toBe(true);
  expect(() => validateCvOutput(input, syntheticSource())).toThrow(
    'Extraction output',
  );
});
