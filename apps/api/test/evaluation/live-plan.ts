import { documents, reference } from './datasets/v1/extraction.js';
import type { DocumentCase } from './datasets/v1/extraction.js';
import type {
  MatchingCase,
  ExpectedRequirement,
} from './datasets/v1/matching.js';
import type { Source } from './types.js';

export const LIVE_DEADLINE_MS = 45 * 60 * 1000;
export const LOCAL_ENV = Object.freeze({
  AI_PROVIDER: 'ollama',
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  OLLAMA_MODEL: 'qwen3:4b',
  AI_REQUEST_TIMEOUT_MS: '120000',
});
export function refusal(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): string | null {
  if (env.CI !== undefined) return 'CI_REFUSED';
  const options = args.filter((arg) => arg !== '--');
  if (options.length !== 1 || options[0] !== '--allow-local-ollama')
    return 'OPT_IN_REQUIRED';
  return null;
}
export interface LiveStep {
  id: string;
  documentId: string;
  attempt: number;
  pairId: string | null;
}
export function liveSchedule(): LiveStep[] {
  const steps = documents().map((d) => ({
    id: `${d.id}/1`,
    documentId: d.id,
    attempt: 1,
    pairId: null as string | null,
  }));
  for (const id of ['cv-simple-pdf', 'cv-simple-docx'])
    for (const attempt of [2, 3])
      steps.push({
        id: `${id}/${attempt}`,
        documentId: id,
        attempt,
        pairId: null,
      });
  for (const pair of livePairs())
    for (const documentId of [pair.cvId, pair.jdId])
      steps.push({
        id: `${pair.fixture.id}/${documentId}`,
        documentId,
        attempt: 1,
        pairId: pair.fixture.id,
      });
  if (steps.length !== 18) throw new Error('INVALID_SCHEDULE');
  return steps;
}
export function authoredSource(document: DocumentCase): Source {
  return {
    format:
      document.input.kind === 'jd'
        ? 'text'
        : document.input.value.fileName.endsWith('.pdf')
          ? 'pdf'
          : 'docx',
    text: document.expectedText,
    segments: [
      {
        id: 'gold-1',
        start: 0,
        end: document.expectedText.length,
        page:
          document.input.kind === 'cv' &&
          document.input.value.fileName.endsWith('.pdf')
            ? 1
            : null,
      },
    ],
  };
}
// Pair expectations are human-authored, not snapshots of matching output. The
// first mixed-JD requirement has ambiguous full-document evidence because its
// short text repeats. Keep that limitation visible alongside evaluable clauses.
export function livePairs() {
  const all = documents();
  const jdDocument = all.find((d) => d.id === 'jd-mixed')!;
  const jd = jdDocument.observed(authoredSource(jdDocument));
  if (jd.kind !== 'jd') throw new Error('INVALID_PAIR');
  return ['cv-duration-docx', 'cv-sparse-docx'].map((cvId) => {
    const doc = all.find((d) => d.id === cvId)!;
    const cv = doc.observed(authoredSource(doc));
    if (cv.kind !== 'cv') throw new Error('INVALID_PAIR');
    const timed = cvId === 'cv-duration-docx';
    // Choose an explicit unique duration clause for the skill name too; do not
    // infer any new value or repair a live output.
    const candidate = timed
      ? {
          ...cv,
          data: {
            ...cv.data,
            skills: cv.data.skills.map((s) => ({
              ...s,
              name: {
                ...s.name,
                evidence: [
                  reference(cv.source, '3 years of experience with TypeScript'),
                ],
              },
            })),
          },
        }
      : cv;
    const req = (
      index: number,
      status: ExpectedRequirement['status'],
      credit: number | null,
      priority: ExpectedRequirement['priority'],
      uncertainty: ExpectedRequirement['uncertainty'],
      evaluability: ExpectedRequirement['evaluability'] = 'EVALUABLE',
    ): ExpectedRequirement => ({
      jdRequirementIndexes: [index],
      status,
      credit,
      priority,
      uncertainty: (
        [
          'SEMANTICS_NOT_VERIFIED',
          ...uncertainty,
        ] as ExpectedRequirement['uncertainty'][number][]
      ).sort(),
      evaluability,
      includedInScore: evaluability === 'EVALUABLE',
    });
    const fixture: MatchingCase = {
      id: timed ? 'pair-duration-mixed' : 'pair-sparse-mixed',
      input: { cv: candidate, jd },
      expected: {
        requirements: [
          req(
            0,
            'MISSING_EVIDENCE',
            null,
            'required',
            ['AMBIGUOUS_JD_REQUIREMENT'],
            'AMBIGUOUS_JD',
          ),
          timed
            ? req(1, 'PARTIAL', 0.6, 'required', [])
            : req(1, 'MISSING_EVIDENCE', 0, 'required', [
                'DURATION_UNKNOWN',
                'CV_FACT_NOT_STATED',
              ]),
          req(2, 'MISSING_EVIDENCE', 0, 'preferred', ['CV_FACT_NOT_STATED']),
          req(3, 'MISSING_EVIDENCE', 0, 'unknown', [
            'CV_FACT_NOT_STATED',
            'PRIORITY_UNKNOWN',
          ]),
          req(
            4,
            'MISSING_EVIDENCE',
            null,
            'unknown',
            ['PRIORITY_UNKNOWN', 'UNSUPPORTED_REQUIREMENT'],
            'UNSUPPORTED',
          ),
        ],
        overallScore: timed ? 25 : 0,
        categoryScores: [0, timed ? 60 : 0, null, null, null],
        coverage: {
          inputRequirementCount: 5,
          canonicalRequirementCount: 5,
          evaluableRequirementCount: 3,
          excludedRequirementCount: 2,
          unclassifiedRequirementCount: 1,
          activeCategoryWeight: 60,
          jdEvaluabilityRatio: 0.6,
        },
      },
    };
    return { cvId, jdId: jdDocument.id, fixture };
  });
}
