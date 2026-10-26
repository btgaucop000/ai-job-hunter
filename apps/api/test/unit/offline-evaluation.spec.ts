import { expect, test, jest } from '@jest/globals';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { matchExtractions } from '../../src/matching/matching.js';
import type { ExtractionResult } from '../../src/extraction/extraction.types.js';
import {
  documents,
  observations,
  reference,
} from '../evaluation/datasets/v1/extraction.js';
import { matchingCases } from '../evaluation/datasets/v1/matching.js';
import {
  atoms,
  evaluateExtraction,
  ratio,
  validReference,
} from '../evaluation/extraction.js';
import { evaluateMatching } from '../evaluation/matching.js';
import {
  aggregateExtraction,
  offlineReport,
  serialize,
} from '../evaluation/report.js';
import type { ExtractionGold, Source } from '../evaluation/types.js';

const fixture = (id: string) => documents().find((f) => f.id === id)!;
function authored(id: string) {
  const f = fixture(id);
  const source: Source = {
    format: f.input.kind === 'jd' ? 'text' : 'docx',
    text: f.expectedText,
    segments: [{ id: 's1', start: 0, end: f.expectedText.length, page: null }],
  };
  return {
    f,
    source,
    result: f.observed(source),
    cases: observations(f, source),
  };
}
const emptyGold: ExtractionGold = {
  facts: [],
  sourceFacts: [],
  priorities: [],
  forbidden: [],
};

test('zero denominators are null; closed-world extras cannot become true positives', () => {
  expect(ratio(0, 0)).toEqual({ numerator: 0, denominator: 0, value: null });
  const { result } = authored('cv-sparse-docx');
  const m = evaluateExtraction(emptyGold, { outcome: 'SUCCESS', result });
  expect(m.counts).toEqual({ tp: 0, fp: 1, fn: 0 });
  expect(m.recall).toEqual(ratio(0, 0));
  expect(m.precision).toEqual(ratio(0, 1));
});

test('all synthetic expected failures match authored counts, not model behavior', () => {
  for (const f of documents())
    for (const c of authored(f.id).cases) {
      const m = evaluateExtraction(f.gold, c.observation);
      expect({ counts: m.counts, failures: m.failures }).toEqual(c.expected);
    }
});

test('missing skill retains false negative; wrong duration subject is FP plus FN', () => {
  const { f, cases } = authored('cv-simple-pdf');
  const missing = evaluateExtraction(
    f.gold,
    cases.find((c) => c.id.endsWith('/missing-skill'))!.observation,
  );
  expect(missing.recall).toEqual(ratio(3, 4));
  expect(missing.precision).toEqual(ratio(3, 3));
  expect(missing.importantCompleteness).toEqual(ratio(2, 3));
  const wrong = evaluateExtraction(
    f.gold,
    cases.find((c) => c.id.endsWith('/wrong-duration-subject'))!.observation,
  );
  expect(wrong.counts).toEqual({ tp: 3, fp: 1, fn: 1 });
  expect(wrong.unsupportedPositiveClaims).toEqual(ratio(1, 4));
});

test('extra duplicate cannot earn credit twice', () => {
  const { f, result } = authored('cv-simple-pdf');
  if (result.kind !== 'cv') throw new Error();
  const m = evaluateExtraction(f.gold, {
    outcome: 'SUCCESS',
    result: {
      ...result,
      data: {
        ...result.data,
        skills: [...result.data.skills, result.data.skills[0]!],
      },
    },
  });
  expect(m.counts).toEqual({ tp: 4, fp: 2, fn: 0 });
});

test('incorrect priority counts FP/FN and fails priority denominator', () => {
  const { f, cases } = authored('jd-priority');
  const m = evaluateExtraction(f.gold, cases[1]!.observation);
  expect(m.priorityAccuracy).toEqual(ratio(1, 2));
  expect(m.counts).toEqual({ tp: 4, fp: 1, fn: 1 });
});

test('unknown priority needs a recovered requirement; missing is not correct unknown', () => {
  const { f, result } = authored('jd-mixed');
  if (result.kind !== 'jd') throw new Error();
  expect(
    evaluateExtraction(f.gold, { outcome: 'SUCCESS', result }).priorityAccuracy,
  ).toEqual(ratio(5, 5));
  const missing = {
    ...result,
    data: {
      ...result.data,
      requirements: result.data.requirements.filter(
        (r) => r.text.value !== 'Docker',
      ),
    },
  };
  expect(
    evaluateExtraction(f.gold, { outcome: 'SUCCESS', result: missing })
      .priorityAccuracy,
  ).toEqual(ratio(4, 5));
});

test('grounded negated/uncertain skills remain unsupported positives', () => {
  const { f, cases } = authored('cv-negated-docx');
  const m = evaluateExtraction(f.gold, cases[1]!.observation);
  expect(m.evidenceValidity).toEqual(ratio(4, 4));
  expect(m.negationHandling).toEqual(ratio(0, 1));
  expect(m.forbiddenClaims).toEqual({
    negation: 1,
    uncertain: 1,
    injection: 0,
  });
  expect(m.unsupportedPositiveClaims).toEqual(ratio(2, 4));
});

test('injection mention does not establish a positive qualification', () => {
  const { f, cases } = authored('cv-injection-docx');
  const m = evaluateExtraction(f.gold, cases[1]!.observation);
  expect(m.evidenceValidity).toEqual(ratio(3, 3));
  expect(m.forbiddenClaims?.injection).toBe(1);
  expect(m.unsupportedPositiveClaims).toEqual(ratio(1, 3));
});

test('rejected and not-run observations cannot look like successful safe output', () => {
  const { f } = authored('cv-negated-docx');
  const rejected = evaluateExtraction(f.gold, {
    outcome: 'REJECTED',
    code: 'INVALID_EVIDENCE',
  });
  expect(rejected.precision).toBeNull();
  expect(rejected.recall).toBeNull();
  expect(rejected.negationHandling).toBeNull();
  expect(rejected.evidenceValidity).toBeNull();
  expect(rejected.deliveredRecall).toEqual(ratio(0, 2));
  expect(rejected.deliveredNegationHandling).toEqual(ratio(0, 1));
  expect(rejected.completion).toEqual(ratio(0, 1));
  const notRun = evaluateExtraction(f.gold, { outcome: 'NOT_RUN' });
  expect(notRun.deliveredRecall).toEqual(ratio(0, 0));
  expect(notRun.completion).toEqual(ratio(0, 0));
});

test('aggregate ratios sum counts, exclude not-run, retain attempted rejection denominators', () => {
  const { f, result } = authored('cv-simple-pdf');
  const m = aggregateExtraction([
    evaluateExtraction(f.gold, { outcome: 'SUCCESS', result }),
    evaluateExtraction(f.gold, {
      outcome: 'REJECTED',
      code: 'INVALID_EVIDENCE',
    }),
    evaluateExtraction(f.gold, { outcome: 'NOT_RUN' }),
  ]);
  expect(m.recall).toEqual(ratio(4, 4));
  expect(m.deliveredRecall).toEqual(ratio(4, 8));
  expect(m.completion).toEqual(ratio(1, 2));
});

test('evidence supports the correct subject anchor, not merely a valid source substring', () => {
  const { f, source, result } = authored('cv-simple-pdf');
  if (result.kind !== 'cv') throw new Error();
  const changed = {
    ...result,
    data: {
      ...result.data,
      skills: [
        {
          ...result.data.skills[0]!,
          experienceText: {
            value: '5 years',
            evidence: [reference(source, 'PostgreSQL')],
          },
        },
        result.data.skills[1]!,
      ],
    },
  };
  const m = evaluateExtraction(f.gold, { outcome: 'SUCCESS', result: changed });
  expect(m.evidenceValidity).toEqual(ratio(4, 4));
  expect(m.evidenceSupport).toEqual(ratio(3, 4));
  expect(m.failures).toEqual(['UNSUPPORTED_EVIDENCE']);
});

test('UTF-16 offsets reject split surrogates, bad segments and shifted offsets', () => {
  const source: Source = {
    format: 'text',
    text: '😀 React',
    segments: [{ id: 's1', start: 0, end: 8, page: null }],
  };
  const ref = reference(source, 'React');
  expect(ref.start).toBe(3);
  expect(validReference(source, ref)).toBe(true);
  expect(validReference(source, { ...ref, start: 2 })).toBe(false);
  expect(validReference(source, { ...ref, segmentId: 'missing' })).toBe(false);
  expect(
    validReference(source, {
      segmentId: 's1',
      quote: '\uD83D',
      start: 0,
      end: 1,
    }),
  ).toBe(false);
});

test.each(matchingCases())(
  'matching $id has exact statuses, scores, coverage, uncertainty and valid links',
  (f) => {
    const result = matchExtractions(f.input);
    const m = evaluateMatching(f, result);
    expect(m.failures).toEqual([]);
    expect(result.coverage).toEqual(f.expected.coverage);
    expect(m.scoreDeviation.max === 0 || m.scoreDeviation.max === null).toBe(
      true,
    );
  },
);

test('unsupported requirements remain in status/decision denominators and null score slots', () => {
  const f = matchingCases().find((c) => c.id === 'all-unsupported')!;
  const result = matchExtractions(f.input);
  const m = evaluateMatching(f, result);
  expect(m.statusAccuracy).toEqual(ratio(1, 1));
  expect(m.scoreAvailability).toEqual(ratio(6, 6));
  expect(m.scoreDeviation).toEqual({ n: 0, mae: null, max: null });
  const incorrect = evaluateMatching(f, { ...result, overallScore: 0 });
  expect(incorrect.scoreAvailability).toEqual(ratio(5, 6));
  expect(incorrect.failures).toContain('SCORE_AVAILABILITY');
  expect(incorrect.scoreDeviation.n).toBe(0);
  const missing = evaluateMatching(f, { ...result, requirements: [] });
  expect(missing.statusAccuracy).toEqual(ratio(0, 1));
});

test('incorrect decision with the same status and extra requirements cannot pass', () => {
  const f = matchingCases().find((c) => c.id === 'all-unsupported')!;
  const result = matchExtractions(f.input);
  const m = evaluateMatching(f, {
    ...result,
    requirements: [
      {
        ...result.requirements[0]!,
        includedInScore: true,
        evaluability: 'EVALUABLE',
      },
    ],
  });
  expect(m.statusAccuracy.value).toBe(1);
  expect(m.decisionAccuracy.value).toBe(0);
  const extra = evaluateMatching(f, {
    ...result,
    requirements: [
      ...result.requirements,
      { ...result.requirements[0]!, jdRequirementIndexes: [99] },
    ],
  });
  expect(extra.extraRequirements).toBe(1);
  expect(extra.failures).toContain('REQUIREMENT_COUNT');
});

test('numeric score error does not disappear into status accuracy', () => {
  const f = matchingCases().find((c) => c.id === 'partial')!;
  const result = matchExtractions(f.input);
  const m = evaluateMatching(f, { ...result, overallScore: 50 });
  expect(m.scoreDeviation).toEqual({ n: 2, mae: 5, max: 10 });
  expect(m.failures).toContain('SCORE_DEVIATION');
});

test('matching evidence checks source offsets and fact paths', () => {
  const f = matchingCases()[0]!;
  const result = matchExtractions(f.input);
  const m = evaluateMatching(f, {
    ...result,
    requirements: result.requirements.map((r) => ({
      ...r,
      evidence: r.evidence.map((e) => ({
        ...e,
        factPath: '/data/nonexistent',
      })),
    })),
  });
  expect(m.evidenceValidity.numerator).toBe(0);
  expect(m.failures).toContain('MATCHING_EVIDENCE');
});

test('contract adapter includes all non-null fields without depending on skill order', () => {
  const { result } = authored('cv-simple-pdf');
  if (result.kind !== 'cv') throw new Error();
  expect(atoms(result)).toHaveLength(4);
  const reordered: ExtractionResult = {
    ...result,
    data: { ...result.data, skills: [...result.data.skills].reverse() },
  };
  expect(
    evaluateExtraction(fixture('cv-simple-pdf').gold, {
      outcome: 'SUCCESS',
      result: reordered,
    }).counts,
  ).toEqual({ tp: 4, fp: 0, fn: 0 });
});

test('offline report runs with fetch denied and canonical ordering is stable', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('NETWORK_FORBIDDEN');
  });
  const a = await offlineReport();
  const b = await offlineReport();
  expect(fetch).not.toHaveBeenCalled();
  expect(a.passed).toBe(true);
  expect(a.sampleSizes).toEqual({
    documents: 10,
    observations: 20,
    attempted: 19,
    completed: 17,
    rejected: 2,
    notRun: 1,
    matchingScenarios: 12,
  });
  expect(serialize(a)).toBe(serialize(b));
  expect(a.extraction.map((f) => f.id)).toEqual(
    a.extraction.map((f) => f.id).sort(),
  );
  expect(serialize({ b: 1, a: 2 })).toBe(serialize({ a: 2, b: 1 }));
  expect(a.aggregate.matching.statusAccuracy.value).toBe(1);
  expect(a.aggregate.matching.scoreDeviation.max).toBe(0);
}, 30000);

test('CLI executes twice without network and returns byte-identical JSON; network entry points fail', () => {
  const guard = fileURLToPath(
    new URL('../evaluation/no-network.js', import.meta.url),
  );
  const runner = fileURLToPath(
    new URL('../evaluation/offline.js', import.meta.url),
  );
  const args = [
    '--permission',
    '--allow-fs-read=*',
    '--allow-worker',
    '--import',
    guard,
  ];
  const run = () =>
    execFileSync(process.execPath, [...args, runner], {
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const first = run();
  expect(run()).toBe(first);
  expect(JSON.parse(first).passed).toBe(true);
  const probe = `
    import net from 'node:net'; import http from 'node:http';
    for (const call of [() => fetch('http://127.0.0.1:11434'), () => net.connect(11434), () => http.get('http://127.0.0.1:11434'), () => http.createServer().listen(0)]) {
      try { await call(); process.exit(2); } catch (e) { if (e.message !== 'OFFLINE_NETWORK_FORBIDDEN') process.exit(3); }
    }
  `;
  expect(() =>
    execFileSync(
      process.execPath,
      [...args, '--input-type=module', '-e', probe],
      { timeout: 5000, stdio: 'pipe' },
    ),
  ).not.toThrow();
}, 60000);
