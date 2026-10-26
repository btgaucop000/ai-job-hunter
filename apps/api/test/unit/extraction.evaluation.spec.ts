import { expect, test } from '@jest/globals';
import {
  evaluationCases,
  evaluationSchedule,
  assessFields,
  assess,
} from '../support/extraction-evaluation.js';
import {
  emptyCv,
  emptyJd,
  quotedFact,
  unknownFact,
  syntheticSource,
} from '../support/extraction-fixtures.js';
import type {
  CvData,
  JdData,
  QuoteReference,
  ExtractionResult,
} from '../../src/extraction/extraction.types.js';
import {
  validateCvOutput,
  validateJdOutput,
} from '../../src/extraction/extraction.validation.js';
import { DocumentParser } from '../../src/extraction/document-parser.js';
const source = syntheticSource(
  'Synthetic Candidate. React 5 years. PostgreSQL. Rust. Software Engineer. React required. PostgreSQL preferred.',
  'docx',
);
const cv = (data: CvData<QuoteReference>): ExtractionResult => ({
  schemaVersion: '1',
  kind: 'cv',
  source,
  data: validateCvOutput(data, source),
  warnings: [],
});
const base = () => ({
  ...emptyCv(),
  name: quotedFact('Synthetic Candidate'),
  skills: [
    {
      name: quotedFact('React', 's1', 'React 5 years.'),
      experienceText: quotedFact('5 years'),
    },
    {
      name: quotedFact('PostgreSQL', 's1', 'PostgreSQL.'),
      experienceText: unknownFact(),
    },
  ],
});
const fixture = evaluationCases()[0]!;
test('predeclared schedule contains all six ordinary attempts plus four diagnostic cases', () => {
  expect(
    evaluationSchedule().map(({ fixture, attempt }) => [fixture.id, attempt]),
  ).toEqual([
    ['cv-simple-pdf', 1],
    ['cv-simple-pdf', 2],
    ['cv-simple-pdf', 3],
    ['cv-simple-docx', 1],
    ['cv-simple-docx', 2],
    ['cv-simple-docx', 3],
    ['cv-negated-docx', 1],
    ['jd-priority', 1],
    ['cv-injection-docx', 1],
    ['jd-injection', 1],
  ]);
});
test('equivalent PDF and DOCX fixtures contain the same ordinary facts and preserve gold expectations', async () => {
  const parser = new DocumentParser();
  try {
    const pdf = evaluationCases().find((f) => f.id === 'cv-simple-pdf')!;
    const docx = evaluationCases().find((f) => f.id === 'cv-simple-docx')!;
    if (pdf.input.kind !== 'cv' || docx.input.kind !== 'cv')
      throw new Error('fixture kind');
    const a = await parser.parse(pdf.input.value);
    const b = await parser.parse(docx.input.value);
    expect(b.source.text === a.source.text + '\n\n').toBe(true);
    expect(
      docx.expectedSkills?.every((v, i) => v === pdf.expectedSkills?.[i]),
    ).toBe(true);
    expect(docx.expectedDuration === pdf.expectedDuration).toBe(true);
  } finally {
    await parser.close();
  }
});
test('valid ordinary result retains explicit duration and null unstated duration', () => {
  const result = cv(base());
  const report = assessFields(fixture, result);
  expect(report.categories).toEqual(['VALID_EXTRACTION']);
  expect(report.expectedFactsPresent).toBe(true);
  expect(report.unsupportedFactsAppear).toBe(false);
  expect(report.incorrectExperienceAssignmentCount).toBe(0);
  expect(assess(fixture, result)).toEqual({
    expectedFactsPresent: true,
    unsupportedFactsAppear: false,
  });
});
test('missing skill stays a failure even when remaining facts are correct', () => {
  const data = base();
  data.skills.pop();
  const report = assessFields(fixture, cv(data));
  expect(report.categories).toEqual(['MISSING_SKILL']);
  expect(report.expectedFactsPresent).toBe(false);
  expect(report.missingSkillCount).toBe(1);
});
test('copied skill name is distinguished from missing skills', () => {
  const data = base();
  data.skills[0]!.experienceText = quotedFact('React', 's1', 'React 5 years.');
  const report = assessFields(fixture, cv(data));
  expect(report.categories).toEqual(['INCORRECT_EXPERIENCE_ASSIGNMENT']);
  expect(report.skillNameCopiedToExperienceCount).toBe(1);
  expect(report.missingSkillCount).toBe(0);
  expect(report.expectedFactsPresent).toBe(false);
});
test('omitted explicit duration fails even when both skills are present', () => {
  const data = base();
  data.skills[0]!.experienceText = unknownFact();
  const report = assessFields(fixture, cv(data));
  expect(report.categories).toEqual(['INCORRECT_EXPERIENCE_ASSIGNMENT']);
  expect(report.incorrectExperienceAssignmentCount).toBe(1);
  expect(report.skillNameCopiedToExperienceCount).toBe(0);
  expect(report.missingSkillCount).toBe(0);
  expect(report.expectedFactsPresent).toBe(false);
  expect(report.unsupportedFactsAppear).toBe(false);
});
test('invented duration assignment to the other skill does not pass gold evaluation', () => {
  const data = base();
  data.skills[1]!.experienceText = quotedFact('5 years');
  const report = assessFields(fixture, cv(data));
  expect(report.categories).toEqual(['INCORRECT_EXPERIENCE_ASSIGNMENT']);
  expect(report.unsupportedFactsAppear).toBe(true);
});
test('unsupported positive skill is reported independently of experience', () => {
  const data = base();
  data.skills.push({ name: quotedFact('Rust'), experienceText: unknownFact() });
  const report = assessFields(fixture, cv(data));
  expect(report.categories).toEqual(['UNSUPPORTED_POSITIVE_SKILL']);
  expect(report.unsupportedPositiveSkillCount).toBe(1);
});
const jdFixture = evaluationCases()[2]!;
const jdBase = (): JdData<QuoteReference> => ({
  ...emptyJd(),
  title: quotedFact('Software Engineer'),
  requirements: [
    {
      text: quotedFact('React', 's1', 'React required.'),
      priority: {
        ...quotedFact('required', 's1', 'React required.'),
        value: 'required' as const,
      },
    },
    {
      text: quotedFact('PostgreSQL', 's1', 'PostgreSQL preferred.'),
      priority: {
        ...quotedFact('preferred', 's1', 'PostgreSQL preferred.'),
        value: 'preferred' as const,
      },
    },
  ],
});
const jd = (data: JdData<QuoteReference>): ExtractionResult => ({
  schemaVersion: '1',
  kind: 'jd',
  source: { ...source, format: 'text' },
  data: validateJdOutput(data, { ...source, format: 'text' }),
  warnings: [],
});
test('priority omission is reported explicitly without weakening original expectations', () => {
  const data = jdBase();
  const changed = {
    ...data,
    requirements: [
      { ...data.requirements[0]!, priority: unknownFact() },
      data.requirements[1]!,
    ],
  };
  const report = assessFields(jdFixture, jd(changed));
  expect(report.categories).toEqual(['INCORRECT_JD_PRIORITY']);
  expect(report.incorrectJdPriorityCount).toBe(1);
  expect(report.expectedFactsPresent).toBe(false);
});
test('unsupported responsibilities and requirements are counted separately', () => {
  const data = jdBase();
  const changed = {
    ...data,
    requirements: [
      ...data.requirements,
      { text: quotedFact('Rust'), priority: unknownFact() },
    ],
    responsibilities: [quotedFact('Rust')],
  };
  const report = assessFields(jdFixture, jd(changed));
  expect(report.categories).toEqual([
    'UNSUPPORTED_RESPONSIBILITY_OR_REQUIREMENT',
  ]);
  expect(report.unsupportedRequirementCount).toBe(1);
  expect(report.unsupportedResponsibilityCount).toBe(1);
});
test('sanitized field report contains neither values nor evidence', () => {
  const result = cv(base());
  const serialized = JSON.stringify(assessFields(fixture, result));
  expect(
    Object.values(result.data)
      .filter(
        (v) =>
          v &&
          typeof v === 'object' &&
          'value' in v &&
          typeof v.value === 'string',
      )
      .every((v) => !serialized.includes((v as { value: string }).value)),
  ).toBe(true);
  expect(serialized.includes('segmentId')).toBe(false);
  expect(serialized.includes('quote')).toBe(false);
});
