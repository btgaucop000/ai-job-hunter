// Fixed synthetic envelopes, using the same builders as Task 04 policy tests.
import type {
  CvExtractionResult,
  JdExtractionResult,
  ExtractionSource,
  QuoteReference,
  Fact,
} from '../../../../src/extraction/extraction.types.js';
import type {
  MatchingInput,
  MatchingResult,
  RequirementResult,
} from '../../../../src/matching/matching.types.js';
import {
  validateCvOutput,
  validateJdOutput,
} from '../../../../src/extraction/extraction.validation.js';
import {
  emptyCv,
  emptyJd,
  unknownFact,
} from '../../../support/extraction-fixtures.js';
type Skill = readonly [name: string, duration?: string | null, line?: string];
type Requirement =
  string | { text: string; priority?: 'required' | 'preferred'; line?: string };
function source(lines: string[], format: 'pdf' | 'text'): ExtractionSource {
  let offset = 0;
  return {
    format,
    text: lines.join('\n'),
    segments: lines.map((line, index) => {
      const start = offset;
      offset += line.length + 1;
      return {
        id: `s${index}`,
        start,
        end: start + line.length,
        page: format === 'pdf' ? 1 : null,
      };
    }),
  };
}
const fact = (
  value: string,
  index: number,
  quote = value,
): Fact<QuoteReference> => ({
  value,
  evidence: [{ segmentId: `s${index}`, quote }],
});
function cv(
  skills: readonly Skill[] = [],
  descriptions: string[] = [],
): CvExtractionResult {
  const lines = [
    ...skills.map(
      ([name, span, line]) =>
        line ?? (span ? `${span} of experience with ${name}` : name),
    ),
    ...descriptions,
  ];
  const src = source(lines.length ? lines : ['Synthetic CV'], 'pdf');
  const data = {
    ...emptyCv(),
    skills: skills.map(([name, span], index) => ({
      name: fact(name, index, lines[index]),
      experienceText:
        span === undefined || span === null
          ? unknownFact()
          : fact(span, index, lines[index]),
    })),
    experience: descriptions.map((text, index) => ({
      employer: unknownFact(),
      title: unknownFact(),
      startDateText: unknownFact(),
      endDateText: unknownFact(),
      descriptionText: fact(text, skills.length + index),
    })),
  };
  return {
    schemaVersion: '1',
    kind: 'cv',
    source: src,
    data: validateCvOutput(data, src),
    warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
  };
}
function jd(requirements: Requirement[] = []): JdExtractionResult {
  const entries = requirements.map((item) =>
    typeof item === 'string' ? { text: item } : item,
  );
  const lines = entries.map(
    (item) =>
      item.line ?? `${item.text}${item.priority ? ` ${item.priority}` : ''}`,
  );
  const src = source(lines.length ? lines : ['Synthetic JD'], 'text');
  const data = {
    ...emptyJd(),
    requirements: entries.map((item, index) => ({
      text: fact(item.text, index),
      priority: item.priority
        ? fact(item.priority, index, lines[index])
        : unknownFact(),
    })),
  };
  return {
    schemaVersion: '1',
    kind: 'jd',
    source: src,
    data: validateJdOutput(data, src),
    warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
  };
}
export type ExpectedRequirement = Pick<
  RequirementResult,
  | 'jdRequirementIndexes'
  | 'status'
  | 'evaluability'
  | 'includedInScore'
  | 'credit'
  | 'priority'
  | 'uncertainty'
>;
export interface MatchingCase {
  id: string;
  input: MatchingInput;
  expected: {
    requirements: ExpectedRequirement[];
    overallScore: number | null;
    categoryScores: readonly (number | null)[];
    coverage: MatchingResult['coverage'];
  };
}
const req = (
  index: number,
  status: RequirementResult['status'],
  credit: number | null,
  priority: RequirementResult['priority'] = 'required',
  uncertainty: RequirementResult['uncertainty'] = [],
  unsupported = false,
): ExpectedRequirement => ({
  jdRequirementIndexes: [index],
  status,
  credit,
  priority,
  evaluability: unsupported ? 'UNSUPPORTED' : 'EVALUABLE',
  includedInScore: !unsupported,
  uncertainty: (
    [
      'SEMANTICS_NOT_VERIFIED',
      ...uncertainty,
    ] as RequirementResult['uncertainty'][number][]
  ).sort(),
});
function scenario(
  id: string,
  candidate: CvExtractionResult,
  requirements: Requirement[],
  expectedRequirements: ExpectedRequirement[],
  score: number | null,
  categoryScores: readonly (number | null)[],
  activeWeight: number,
  excluded = 0,
): MatchingCase {
  const count = expectedRequirements.length;
  return {
    id,
    input: { cv: candidate, jd: jd(requirements) },
    expected: {
      requirements: expectedRequirements,
      overallScore: score,
      categoryScores,
      coverage: {
        inputRequirementCount: requirements.length,
        canonicalRequirementCount: count,
        evaluableRequirementCount: count - excluded,
        excludedRequirementCount: excluded,
        unclassifiedRequirementCount: excluded,
        activeCategoryWeight: activeWeight,
        jdEvaluabilityRatio: count ? (count - excluded) / count : null,
      },
    },
  };
}
const required = (text: string): Requirement => ({
  text,
  priority: 'required',
});
const preferred = (text: string): Requirement => ({
  text,
  priority: 'preferred',
});
// Expected scores/statuses are independently authored policy examples.
export function matchingCases(): MatchingCase[] {
  return [
    scenario(
      'alias',
      cv([['NodeJS'], ['PostgreSQL']]),
      [required('Node.js'), preferred('PostgreSQL')],
      [req(0, 'MATCHED', 1), req(1, 'MATCHED', 1, 'preferred')],
      100,
      [100, null, null, null, null],
      35,
    ),
    scenario(
      'missing',
      cv([['TypeScript']]),
      [required('TypeScript'), preferred('Experience with Kubernetes')],
      [
        req(0, 'MATCHED', 1),
        req(1, 'MISSING_EVIDENCE', 0, 'preferred', ['CV_FACT_NOT_STATED']),
      ],
      66.67,
      [66.67, null, null, null, null],
      35,
    ),
    scenario(
      'negative',
      cv([['TypeScript']], ['No experience with Kubernetes']),
      [required('TypeScript'), preferred('Experience with Kubernetes')],
      [req(0, 'MATCHED', 1), req(1, 'NOT_MATCHED', 0, 'preferred')],
      66.67,
      [66.67, null, null, null, null],
      35,
    ),
    scenario(
      'partial',
      cv([['TypeScript', '3 years']]),
      [required('5 years of experience with TypeScript')],
      [req(0, 'PARTIAL', 0.6)],
      60,
      [null, 60, null, null, null],
      25,
    ),
    scenario(
      'unknown-duration',
      cv([['TypeScript']]),
      [
        required('TypeScript'),
        required('3 years of experience with TypeScript'),
      ],
      [
        req(0, 'MATCHED', 1),
        req(1, 'MISSING_EVIDENCE', 0, 'required', ['DURATION_UNKNOWN']),
      ],
      58.33,
      [100, 0, null, null, null],
      60,
    ),
    scenario(
      'zero',
      cv([['TypeScript', '0 years']]),
      [required('3 years of experience with TypeScript')],
      [req(0, 'NOT_MATCHED', 0)],
      0,
      [null, 0, null, null, null],
      25,
    ),
    scenario(
      'sufficient-bound',
      cv([['TypeScript', '5+ years']]),
      [required('3 years of experience with TypeScript')],
      [req(0, 'MATCHED', 1)],
      100,
      [null, 100, null, null, null],
      25,
    ),
    scenario(
      'insufficient-bound',
      cv([['TypeScript', '2+ years']]),
      [required('3 years of experience with TypeScript')],
      [req(0, 'MISSING_EVIDENCE', 0, 'required', ['DURATION_UNKNOWN'])],
      0,
      [null, 0, null, null, null],
      25,
    ),
    scenario(
      'conflict',
      cv(
        [],
        [
          '3 years of experience with TypeScript',
          '5 years of experience with TypeScript',
        ],
      ),
      [required('3 years of experience with TypeScript')],
      [req(0, 'MISSING_EVIDENCE', 0, 'required', ['CONFLICTING_CV_EVIDENCE'])],
      0,
      [null, 0, null, null, null],
      25,
    ),
    scenario(
      'duplicates-and-unsupported',
      cv(
        [['NodeJS'], ['microservices'], ['unit testing']],
        ['Experience in payments'],
      ),
      [
        required('Node.js'),
        preferred('NodeJS'),
        required('microservices'),
        preferred('unit testing'),
        preferred('Experience in payments'),
        'architect systems serving millions of users',
      ],
      [
        {
          ...req(0, 'MATCHED', 1, 'required', ['PRIORITY_CONFLICT']),
          jdRequirementIndexes: [0, 1],
        },
        req(2, 'MATCHED', 1),
        req(3, 'MATCHED', 1, 'preferred'),
        req(4, 'MATCHED', 1, 'preferred'),
        req(
          5,
          'MISSING_EVIDENCE',
          null,
          'unknown',
          ['PRIORITY_UNKNOWN', 'UNSUPPORTED_REQUIREMENT'],
          true,
        ),
      ],
      100,
      [100, null, 100, 100, 100],
      75,
      1,
    ),
    scenario(
      'unknown-priority',
      cv(),
      ['React'],
      [
        req(0, 'MISSING_EVIDENCE', 0, 'unknown', [
          'PRIORITY_UNKNOWN',
          'CV_FACT_NOT_STATED',
        ]),
      ],
      0,
      [0, null, null, null, null],
      35,
    ),
    scenario(
      'all-unsupported',
      cv(),
      ['Complex leadership'],
      [
        req(
          0,
          'MISSING_EVIDENCE',
          null,
          'unknown',
          ['PRIORITY_UNKNOWN', 'UNSUPPORTED_REQUIREMENT'],
          true,
        ),
      ],
      null,
      [null, null, null, null, null],
      0,
      1,
    ),
  ];
}
