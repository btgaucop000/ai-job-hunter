import { compileOutputSchema } from '../../src/ai/ai.schema.js';
import {
  partialOutputSchema,
  partialProposalSchema,
  partialFields,
} from '../../src/extraction/partial-proposal.contract.js';
import { expect, test } from '@jest/globals';
import {
  partialPrompt,
  validatePartial,
  missingPartial,
  PARTIAL_LIMITS,
} from '../../src/extraction/partial-extraction.js';
import { createExtractionSource } from '../../src/extraction/extraction.validation.js';
const source = (text: string) =>
  createExtractionSource({
    format: 'pdf',
    text,
    segments: [{ id: 'test-span', start: 0, end: text.length, page: 1 }],
  });
const proposal = (
  field: string,
  value: unknown,
  quote: string,
  id = 'test-span',
) => ({ field, value, segmentId: id, quote });

test('retains independently valid name and email when phone and skill fail', () => {
  const text = source(
    'Alex Sample\nalex@example.test\nPhone: +1 202 555 0147\nSkills: TypeScript',
  );
  const result = validatePartial(
    'cv',
    [
      proposal('name', 'Alex Sample', 'Alex Sample'),
      proposal('email', 'alex@example.test', 'alex@example.test'),
      proposal('phone', '+1 999 555 0000', 'Phone: +1 202 555 0147'),
      proposal('skills', 'Fabricated', 'Absent quote'),
    ],
    text,
  );
  expect(result.fields.name![0]).toMatchObject({
    status: 'VALID',
    value: 'Alex Sample',
  });
  expect(result.fields.email![0]).toMatchObject({
    status: 'VALID',
    value: 'alex@example.test',
  });
  expect(result.fields.phone![0]).toMatchObject({
    status: 'NEEDS_REVIEW',
    evidence: null,
    reason: 'VALUE_UNSUPPORTED',
  });
  expect(result.fields.skills![0]).toMatchObject({
    status: 'NEEDS_REVIEW',
    evidence: null,
  });
});
test.each([
  ['Java', 'Java', 'JavaScript', 'VALUE_UNSUPPORTED'],
  ['TypeScript', 'TypeScript', 'TypeScript TypeScript', 'AMBIGUOUS_EVIDENCE'],
  ['Rust', 'Rust', 'No Rust', 'CONTEXT_REQUIRES_REVIEW'],
  ['Rust', 'Skills: Rust', 'Skills: TypeScript', 'EVIDENCE_NOT_FOUND'],
  ['TS', 'TypeScript', 'TypeScript', 'VALUE_UNSUPPORTED'],
])(
  'rejects unsupported/ambiguous candidate %s (%s)',
  (value, quote, text, reason) => {
    expect(
      validatePartial('cv', [proposal('skills', value, quote)], source(text))
        .fields.skills![0],
    ).toMatchObject({ status: 'NEEDS_REVIEW', evidence: null, reason });
  },
);
test('preserves distinct occurrences, deduplicates only the same grounded occurrence', () => {
  const text = source('Skills: TypeScript\nUsed TypeScript daily');
  const result = validatePartial(
    'cv',
    [
      proposal('skills', 'TypeScript', 'Skills: TypeScript'),
      proposal('skills', 'TypeScript', 'Used TypeScript daily'),
      proposal('skills', 'TypeScript', 'Skills: TypeScript'),
    ],
    text,
  );
  const facts = result.fields.skills!;
  expect(facts).toHaveLength(2);
  expect(facts.every((fact) => fact.status === 'VALID')).toBe(true);
  expect(facts[0]!.evidence!.valueStart).not.toBe(
    facts[1]!.evidence!.valueStart,
  );
  for (const fact of facts) {
    const evidence = fact.evidence!;
    expect(text.text.slice(evidence.start, evidence.end)).toBe(evidence.quote);
    expect(text.text.slice(evidence.valueStart, evidence.valueEnd)).toBe(
      fact.value,
    );
  }
});
test('one malformed field or unknown field cannot erase valid peers', () => {
  const result = validatePartial(
    'cv',
    [
      proposal('name', 'Alex', 'Alex'),
      { field: 'phone', value: {} },
      { field: 'unknown', value: 'x' },
      null,
    ],
    source('Alex'),
  );
  expect(result.fields.name![0]!.status).toBe('VALID');
  expect(result.fields.phone![0]!.status).toBe('NEEDS_REVIEW');
  expect(result.fields.email![0]!.status).toBe('MISSING');
  expect(result.rejectedCandidateCount).toBe(3);
});
test('conflicting scalar candidates require review without affecting skill evidence', () => {
  const result = validatePartial(
    'cv',
    [
      proposal('name', 'Alex', 'Alex'),
      proposal('name', 'Sam', 'Sam'),
      proposal('skills', 'SQL', 'SQL'),
    ],
    source('Alex\nSam\nSQL'),
  );
  expect(result.fields.name![0]).toMatchObject({
    status: 'NEEDS_REVIEW',
    reason: 'CONFLICTING_CANDIDATES',
  });
  expect(result.fields.skills![0]!.status).toBe('VALID');
});
test('JD uses its own fields and does not manufacture missing requirements', () => {
  const result = validatePartial(
    'jd',
    [proposal('title', 'Engineer', 'Engineer')],
    source('Engineer'),
  );
  expect(result.fields.title![0]!.status).toBe('VALID');
  expect(result.fields.requirements![0]!.status).toBe('MISSING');
  expect(result.fields.name).toBeUndefined();
  expect(missingPartial('cv', 'TIMEOUT').generationError).toBe('TIMEOUT');
});
test('bounds proposals, values and source prompts without relaxing strict extraction', () => {
  const text = source('SQL');
  expect(() =>
    validatePartial('cv', Array(PARTIAL_LIMITS.proposals + 1).fill([]), text),
  ).toThrow();
  expect(
    validatePartial('cv', [proposal('name', 'x'.repeat(121), 'SQL')], text)
      .fields.name![0]!.status,
  ).toBe('NEEDS_REVIEW');
  expect(partialPrompt('cv', text)).toContain(JSON.stringify(text.text));
  expect(partialPrompt('cv', text)).toContain('intentionally partial');
});

test.each(['cv', 'jd'] as const)(
  'object %s schema compiles unchanged compiler and agrees with prompt/recognizer',
  (kind) => {
    const schema = partialOutputSchema(kind);
    const validate = compileOutputSchema(schema).validate;
    for (const field of partialFields(kind)) {
      const candidate = proposal(field, 'SQL', 'SQL');
      expect(validate({ proposals: [candidate] })).toBe(true);
      expect(partialPrompt(kind, source('SQL'))).toContain(field);
    }
    expect(partialProposalSchema(kind)).toMatchObject({
      required: ['field', 'value', 'segmentId', 'quote'],
      additionalProperties: false,
    });
    const valid = proposal(
      kind === 'cv' ? 'skills' : 'requirements',
      'SQL',
      'SQL',
    );
    const { quote: omitted, ...missingQuote } = valid;
    expect(omitted).toBe('SQL');
    for (const candidate of [
      { ...valid, field: 'unsupported' },
      { ...valid, field: kind === 'cv' ? 'title' : 'skills' },
      missingQuote,
      { ...valid, extra: 'not allowed' },
      { ...valid, value: 4 },
      { ...valid, segmentId: null },
      { ...valid, quote: false },
      ['skills', 'SQL', 'test-span', 'SQL'],
    ])
      expect(validate({ proposals: [candidate] })).toBe(false);
  },
);
test('malformed and unsupported items are explicitly rejected while a valid peer survives', () => {
  const valid = proposal('skills', 'SQL', 'SQL');
  const { quote: omitted, ...missingQuote } = valid;
  expect(omitted).toBe('SQL');
  const result = validatePartial(
    'cv',
    [
      valid,
      { ...valid, field: 'skill' },
      missingQuote,
      { ...valid, field: 'phone', extra: 'not allowed' },
      { ...valid, field: 'email', value: 9 },
      ['skills', 'SQL', 'test-span', 'SQL'],
    ],
    source('SQL'),
  );
  expect(result.fields.skills!.map((fact) => fact.status)).toEqual([
    'VALID',
    'NEEDS_REVIEW',
  ]);
  expect(result.fields.phone![0]).toMatchObject({
    status: 'NEEDS_REVIEW',
    evidence: null,
    reason: 'MALFORMED_CANDIDATE',
  });
  expect(result.rejectedProposals).toEqual([
    { index: 1, reason: 'UNSUPPORTED_FIELD' },
    { index: 2, reason: 'MALFORMED_PROPOSAL' },
    { index: 3, reason: 'MALFORMED_PROPOSAL' },
    { index: 4, reason: 'MALFORMED_PROPOSAL' },
    { index: 5, reason: 'MALFORMED_PROPOSAL' },
  ]);
  expect(result.rejectedCandidateCount).toBe(5);
});

test.each([
  ['Job description', 'NEEDS_REVIEW', 'JD_TITLE_GENERIC_HEADING'],
  ['  JOB DESCRIPTION:  ', 'NEEDS_REVIEW', 'JD_TITLE_GENERIC_HEADING'],
  ['Senior Backend Engineer', 'VALID', null],
  ['Job Description Writer', 'VALID', null],
  ['Position: Engineering', 'NEEDS_REVIEW', 'JD_TITLE_AMBIGUOUS'],
  ['Title', 'NEEDS_REVIEW', 'JD_TITLE_AMBIGUOUS'],
] as const)(
  'JD title %s keeps exact evidence while applying a narrow label safeguard',
  (value, status, reason) => {
    const text = `${value}\nSkills required: SQL`;
    const jdSource = createExtractionSource({
      format: 'text',
      text,
      segments: [
        { id: 'jd-synthetic', start: 0, end: text.length, page: null },
      ],
    });
    const result = validatePartial(
      'jd',
      [
        proposal('title', value, value, 'jd-synthetic'),
        proposal('requirements', 'SQL', 'Skills required: SQL', 'jd-synthetic'),
      ],
      jdSource,
    );
    const title = result.fields.title![0]!;
    expect(title.status).toBe(status);
    expect(title.reason).toBe(reason);
    expect(title.value).toBe(value);
    expect(title.evidence).toEqual({
      segmentId: 'jd-synthetic',
      quote: value,
      start: 0,
      end: value.length,
      valueStart: 0,
      valueEnd: value.length,
    });
    expect(result.fields.requirements![0]!.status).toBe('VALID');
    expect(jdSource.text).toBe(text);
  },
);
test('JD heading safeguard never bypasses exact evidence validation', () => {
  const result = validatePartial(
    'jd',
    [proposal('title', 'Job description', 'not in source')],
    source('Job description'),
  );
  expect(result.fields.title![0]).toMatchObject({
    status: 'NEEDS_REVIEW',
    reason: 'EVIDENCE_NOT_FOUND',
    value: 'Job description',
    evidence: null,
  });
});
