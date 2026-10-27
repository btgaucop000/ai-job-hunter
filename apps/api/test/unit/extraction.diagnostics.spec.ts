import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import { AiError } from '../../src/ai/ai.errors.js';
import { AiService } from '../../src/ai/ai.service.js';
import { ExtractionError } from '../../src/extraction/extraction.errors.js';
import { ExtractionOwner } from '../../src/extraction/extraction.owner.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import {
  EXTRACTION_DIAGNOSTIC_RULES,
  EXTRACTION_DIAGNOSTIC_FIELDS,
} from '../../src/extraction/extraction.diagnostics.js';
import type {
  DiagnosticRule,
  DiagnosticField,
} from '../../src/extraction/extraction.diagnostics.js';
import {
  validateCvOutput,
  validateJdOutput,
} from '../../src/extraction/extraction.validation.js';
import {
  emptyCv,
  emptyJd,
  quotedFact,
  syntheticSource,
  unknownFact,
} from '../support/extraction-fixtures.js';

function rejection(run: () => unknown): ExtractionError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ExtractionError);
    return error as ExtractionError;
  }
  throw new Error('Expected rejection');
}
const cv =
  (name: unknown, text = 'Synthetic') =>
  () =>
    validateCvOutput({ ...emptyCv(), name }, syntheticSource(text));
const cases: [DiagnosticRule, DiagnosticField, () => unknown][] = [
  [
    'OUTPUT_NOT_SERIALIZABLE',
    'cv',
    () => validateCvOutput(undefined, syntheticSource()),
  ],
  [
    'SCHEMA_MISMATCH',
    'cv',
    () => validateCvOutput({ private_key: 'PRIVATE' }, syntheticSource()),
  ],
  [
    'SCHEMA_MISMATCH',
    'cv',
    () =>
      validateCvOutput(
        {
          ...emptyCv(),
          skills: [{ name: unknownFact(), experienceText: unknownFact() }],
        },
        syntheticSource(),
      ),
  ],
  [
    'EMPTY_HISTORY_RECORD',
    'cv.experience[]',
    () =>
      validateCvOutput(
        {
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
        },
        syntheticSource(),
      ),
  ],
  [
    'EMPTY_HISTORY_RECORD',
    'cv.education[]',
    () =>
      validateCvOutput(
        {
          ...emptyCv(),
          education: [
            {
              institution: unknownFact(),
              qualification: unknownFact(),
              dateText: unknownFact(),
            },
          ],
        },
        syntheticSource(),
      ),
  ],
  ['SEGMENT_UNKNOWN', 'cv.name', cv(quotedFact('Synthetic', 'PRIVATE'))],
  ['QUOTE_EMPTY', 'cv.name', cv(quotedFact('Synthetic', 's1', ' '))],
  ['QUOTE_TOO_LONG', 'cv.name', cv(quotedFact('x', 's1', '😀'.repeat(501)))],
  ['QUOTE_NOT_FOUND', 'cv.name', cv(quotedFact('PRIVATE'))],
  ['QUOTE_AMBIGUOUS', 'cv.name', cv(quotedFact('aa'), 'aaa')],
  ['QUOTE_BOUNDARY_INVALID', 'cv.name', cv(quotedFact('\ud83d'), '😀')],
  ['QUOTE_BOUNDARY_INVALID', 'cv.name', cv(quotedFact('\ude00'), '😀')],
  [
    'NULL_WITH_EVIDENCE',
    'cv.name',
    cv({ ...quotedFact('Synthetic'), value: null }),
  ],
  ['VALUE_EMPTY', 'cv.name', cv(quotedFact(' '))],
  ['VALUE_TOO_LONG', 'cv.name', cv(quotedFact('😀'.repeat(501)))],
  ['EVIDENCE_MISSING', 'cv.name', cv({ value: 'Synthetic', evidence: [] })],
  [
    'EVIDENCE_DUPLICATE',
    'cv.name',
    cv({
      value: 'Synthetic',
      evidence: [
        quotedFact('Synthetic').evidence[0],
        quotedFact('Synthetic').evidence[0],
      ],
    }),
  ],
  ['VALUE_UNSUPPORTED', 'cv.name', cv(quotedFact('Other', 's1', 'Synthetic'))],
  [
    'PRIORITY_CUE_MISSING',
    'jd.requirements[].priority',
    () =>
      validateJdOutput(
        {
          ...emptyJd(),
          requirements: [
            {
              text: quotedFact('Synthetic'),
              priority: quotedFact('required', 's1', 'Synthetic'),
            },
          ],
        },
        syntheticSource('Synthetic', 'text'),
      ),
  ],
  [
    'PRIORITY_LINK_INVALID',
    'jd.requirements[].priority',
    () =>
      validateJdOutput(
        {
          ...emptyJd(),
          requirements: [
            { text: quotedFact('Synthetic'), priority: quotedFact('required') },
          ],
        },
        syntheticSource('Synthetic required', 'text'),
      ),
  ],
  [
    'SCHEMA_MISMATCH',
    'jd',
    () =>
      validateJdOutput(
        {
          ...emptyJd(),
          requirements: [{ text: unknownFact(), priority: unknownFact() }],
        },
        syntheticSource('Synthetic', 'text'),
      ),
  ],
  [
    'SCHEMA_MISMATCH',
    'jd',
    () =>
      validateJdOutput(
        { ...emptyJd(), responsibilities: [unknownFact()] },
        syntheticSource('Synthetic', 'text'),
      ),
  ],
];
test.each(cases)(
  '%s at fixed field %s preserves outer rejection',
  (rule, field, run) => {
    const error = rejection(run);
    const stage = EXTRACTION_DIAGNOSTIC_RULES[rule];
    expect(error.code).toBe(
      stage === 'OUTPUT' ? 'INVALID_OUTPUT' : 'INVALID_EVIDENCE',
    );
    expect(error.diagnostic).toEqual({ stage, rule, field });
    expect(Object.isFrozen(error.diagnostic)).toBe(true);
    expect(EXTRACTION_DIAGNOSTIC_FIELDS).toContain(field);
    expect(JSON.stringify(error)).not.toMatch(/PRIVATE|Synthetic|😀/u);
  },
);
test('every reachable validation rule has a rejection fixture; null collections now fail schema', () => {
  expect(new Set(cases.map(([rule]) => rule))).toEqual(
    new Set(
      Object.keys(EXTRACTION_DIAGNOSTIC_RULES).filter(
        (rule) => rule !== 'REQUIRED_COLLECTION_VALUE_NULL',
      ),
    ),
  );
});
test('schema remains first for ASCII size violations and arbitrary keys', () => {
  for (const name of [
    quotedFact('x', 's1', 'x'.repeat(1001)),
    { ...quotedFact('Synthetic'), PRIVATE: 'PRIVATE' },
  ]) {
    expect(rejection(cv(name))).toMatchObject({
      code: 'INVALID_OUTPUT',
      diagnostic: { rule: 'SCHEMA_MISMATCH', field: 'cv' },
    });
  }
});
test('null collection schema failure now precedes fact traversal', () => {
  expect(
    rejection(() =>
      validateCvOutput(
        {
          ...emptyCv(),
          name: quotedFact('absent'),
          email: { value: 'Synthetic', evidence: [] },
          skills: [{ name: unknownFact(), experienceText: unknownFact() }],
        },
        syntheticSource(),
      ),
    ).diagnostic,
  ).toEqual({ stage: 'OUTPUT', rule: 'SCHEMA_MISMATCH', field: 'cv' });
});
test('successful Unicode grounding and null facts are unchanged', () => {
  const result = validateCvOutput(
    { ...emptyCv(), name: quotedFact('😀') },
    syntheticSource(' 😀 '),
  );
  expect(result).toEqual({
    ...emptyCv(),
    name: {
      value: '😀',
      evidence: [{ segmentId: 's1', quote: '😀', start: 1, end: 3 }],
    },
  });
  expect(
    validateJdOutput(emptyJd(), syntheticSource('Synthetic', 'text')),
  ).toEqual(emptyJd());
});
test('serialization failures remain INVALID_OUTPUT without exception details', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.private = cyclic;
  for (const input of [
    cyclic,
    {
      toJSON() {
        throw new Error('PRIVATE');
      },
    },
  ]) {
    expect(
      rejection(() => validateCvOutput(input, syntheticSource())),
    ).toMatchObject({
      code: 'INVALID_OUTPUT',
      diagnostic: { rule: 'OUTPUT_NOT_SERIALIZABLE' },
    });
  }
});
test('diagnostic reconstruction drops unknown tokens, accessors and extra properties', () => {
  const safe = { stage: 'EVIDENCE', rule: 'QUOTE_NOT_FOUND', field: 'cv.name' };
  const error = new ExtractionError('INVALID_EVIDENCE', {
    ...safe,
    prompt: 'PRIVATE',
  });
  expect(error.diagnostic).toEqual(safe);
  for (const diagnostic of [
    { ...safe, stage: 'PRIVATE' },
    { ...safe, rule: '__proto__' },
    { ...safe, field: 'cv.skills[99999].PRIVATE' },
    {
      ...safe,
      get field() {
        throw new Error('PRIVATE');
      },
    },
  ]) {
    expect(
      new ExtractionError('INVALID_EVIDENCE', diagnostic).diagnostic,
    ).toBeUndefined();
  }
  expect(
    new ExtractionError('INVALID_OUTPUT', safe).diagnostic,
  ).toBeUndefined();
});
function serviceFor(generate: () => Promise<string>) {
  return new ExtractionService(
    new AiService({ generate }),
    new ExtractionOwner({
      parse: async () => ({
        source: syntheticSource(),
        pageCount: 1,
        warnings: [],
      }),
      waitForIdle: async () => {},
      close: async () => {},
    }),
  );
}
test.each([
  ['PRIVATE not JSON', 'INVALID_JSON', 'AI_DECODE', 'JSON_INVALID'],
  [
    '{"PRIVATE":"SECRET"}',
    'SCHEMA_VALIDATION_FAILURE',
    'AI_SCHEMA',
    'SCHEMA_MISMATCH',
  ],
])(
  'AI diagnostic survives service propagation: %s',
  async (output, code, stage, rule) => {
    const generate = jest.fn(async () => output);
    const service = serviceFor(generate);
    await expect(
      service.extractJd({ text: 'PRIVATE source' }),
    ).rejects.toMatchObject({
      code,
      diagnostic: { stage, rule, field: 'output' },
    });
    expect(generate).toHaveBeenCalledTimes(1);
  },
);
test('validation diagnostic survives service without payloads or retry', async () => {
  const generate = jest.fn(async () =>
    JSON.stringify({
      ...emptyJd(),
      title: quotedFact('PRIVATE value', 'jd-1'),
    }),
  );
  const service = serviceFor(generate);
  const error: unknown = await service
    .extractJd({ text: 'PRIVATE source' })
    .catch((e: unknown) => e);
  expect(error).toMatchObject({
    code: 'INVALID_EVIDENCE',
    diagnostic: {
      stage: 'EVIDENCE',
      rule: 'QUOTE_NOT_FOUND',
      field: 'jd.title',
    },
  });
  expect(JSON.stringify(error)).not.toContain('PRIVATE');
  expect(generate).toHaveBeenCalledTimes(1);
});
test('service reconstructs tainted extraction and AI errors from allowlisted metadata only', async () => {
  for (const error of [
    new ExtractionError('INVALID_EVIDENCE'),
    new AiError('INVALID_JSON'),
  ]) {
    Object.assign(error, {
      message: 'PRIVATE',
      diagnostic: {
        stage: 'EVIDENCE',
        rule: 'QUOTE_NOT_FOUND',
        field: 'PRIVATE',
        prompt: 'PRIVATE',
      },
    });
    const result: unknown = await serviceFor(async () => {
      throw error;
    })
      .extractJd({ text: 'Synthetic' })
      .catch((e: unknown) => e);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(result).toMatchObject({ code: error.code });
    if (result instanceof ExtractionError)
      expect(result.diagnostic).toBeUndefined();
    else
      expect(result).toMatchObject({
        diagnostic: {
          stage: 'AI_DECODE',
          rule: 'JSON_INVALID',
          field: 'output',
        },
      });
  }
});
