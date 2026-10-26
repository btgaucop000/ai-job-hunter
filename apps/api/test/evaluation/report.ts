import { createHash } from 'node:crypto';
import { DocumentParser } from '../../src/extraction/document-parser.js';
import { matchExtractions } from '../../src/matching/matching.js';
import { documents, observations } from './datasets/v1/extraction.js';
import { matchingCases } from './datasets/v1/matching.js';
import { evaluateExtraction, ratio } from './extraction.js';
import { evaluateMatching } from './matching.js';
import type { ExtractionMetrics, Ratio, Source } from './types.js';

// Object keys and fixture ordering are canonical; no clocks or environment data.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export const serialize = (value: unknown) =>
  JSON.stringify(canonical(value), null, 2) + '\n';
const hash = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export function aggregateExtraction(metrics: ExtractionMetrics[]) {
  const keys = [
    'precision',
    'recall',
    'importantCompleteness',
    'unsupportedPositiveClaims',
    'negationHandling',
    'priorityAccuracy',
    'evidenceValidity',
    'evidenceSupport',
    'deliveredRecall',
    'deliveredImportantCompleteness',
    'deliveredNegationHandling',
    'completion',
  ] as const;
  return Object.fromEntries(
    keys.map((key) => {
      const applicable = metrics
        .map((m) => m[key])
        .filter((m): m is Ratio => m !== null);
      return [
        key,
        ratio(
          applicable.reduce((sum, m) => sum + m.numerator, 0),
          applicable.reduce((sum, m) => sum + m.denominator, 0),
        ),
      ];
    }),
  );
}
export async function offlineReport() {
  const parser = new DocumentParser();
  const extraction = [];
  const inventory = [];
  const observedDefinitions = [];
  const harnessFailures: string[] = [];
  try {
    for (const fixture of documents().sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const source: Source =
        fixture.input.kind === 'cv'
          ? (await parser.parse(fixture.input.value)).source
          : {
              format: 'text',
              text: fixture.input.value.text,
              segments: [
                {
                  id: 'jd-1',
                  start: 0,
                  end: fixture.input.value.text.length,
                  page: null,
                },
              ],
            };
      if (source.text !== fixture.expectedText)
        harnessFailures.push(`${fixture.id}:SOURCE_TEXT`);
      for (const fact of fixture.gold.sourceFacts)
        if (!source.text.includes(fact.anchor))
          harnessFailures.push(`${fixture.id}:SOURCE_ANCHOR`);
      inventory.push({
        id: fixture.id,
        format: source.format,
        artifactSha256: hash(
          fixture.input.kind === 'cv'
            ? fixture.input.value.bytes
            : fixture.input.value.text,
        ),
        expectedTextSha256: hash(fixture.expectedText),
        actualTextSha256: hash(source.text),
        expectedFacts: fixture.gold.facts.length,
        importantFacts: fixture.gold.facts.filter((f) => f.important).length,
        forbiddenClaims: fixture.gold.forbidden.length,
      });
      for (const observed of observations(fixture, source)) {
        observedDefinitions.push(observed);
        const metrics = evaluateExtraction(fixture.gold, observed.observation);
        const verified =
          serialize({ counts: metrics.counts, failures: metrics.failures }) ===
          serialize(observed.expected);
        if (!verified)
          harnessFailures.push(`${observed.id}:ASSESSMENT_MISMATCH`);
        extraction.push({
          id: observed.id,
          documentId: fixture.id,
          provenance: 'HUMAN_AUTHORED_SYNTHETIC' as const,
          outcome: observed.observation.outcome,
          code:
            observed.observation.outcome === 'REJECTED'
              ? observed.observation.code
              : null,
          expectedSyntheticFailures: observed.expected.failures,
          assessmentVerified: verified,
          metrics,
        });
      }
    }
  } finally {
    await parser.close();
  }
  const matching = matchingCases()
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((fixture) => {
      const metrics = evaluateMatching(
        fixture,
        matchExtractions(fixture.input),
      );
      if (metrics.failures.length)
        harnessFailures.push(`${fixture.id}:MATCHING_MISMATCH`);
      return { id: fixture.id, metrics };
    });
  extraction.sort((a, b) => (a.id < b.id ? -1 : 1));
  const matchingRatio = (
    key:
      | 'statusAccuracy'
      | 'decisionAccuracy'
      | 'scoreAvailability'
      | 'evidenceValidity',
  ) =>
    ratio(
      matching.reduce((sum, f) => sum + f.metrics[key].numerator, 0),
      matching.reduce((sum, f) => sum + f.metrics[key].denominator, 0),
    );
  const scoreN = matching.reduce(
    (sum, f) => sum + f.metrics.scoreDeviation.n,
    0,
  );
  return {
    reportVersion: '1',
    datasetVersion: 'synthetic-v1',
    evaluationPolicyVersion: 'evaluation-v1',
    extractionSchemaVersion: '1',
    matchingPolicyVersion: 'matching-v1',
    mode: 'offline',
    model: null,
    datasetSha256: hash(
      serialize({
        documents: documents().map(({ id, gold, expectedText }) => ({
          id,
          gold,
          expectedText,
        })),
        matching: matchingCases(),
        observations: observedDefinitions,
      }),
    ),
    sampleSizes: {
      documents: inventory.length,
      observations: extraction.length,
      attempted: extraction.filter((f) => f.outcome !== 'NOT_RUN').length,
      completed: extraction.filter((f) => f.outcome === 'SUCCESS').length,
      rejected: extraction.filter((f) => f.outcome === 'REJECTED').length,
      notRun: extraction.filter((f) => f.outcome === 'NOT_RUN').length,
      matchingScenarios: matching.length,
    },
    inventory,
    extraction,
    matching,
    aggregate: {
      extraction: {
        ...aggregateExtraction(extraction.map((f) => f.metrics)),
        counts: extraction.reduce(
          (sum, f) => ({
            tp: sum.tp + (f.metrics.counts?.tp ?? 0),
            fp: sum.fp + (f.metrics.counts?.fp ?? 0),
            fn: sum.fn + (f.metrics.counts?.fn ?? 0),
          }),
          { tp: 0, fp: 0, fn: 0 },
        ),
        completeImportantFixtures: ratio(
          extraction.filter((f) => f.metrics.importantCompleteness?.value === 1)
            .length,
          extraction.filter(
            (f) => (f.metrics.importantCompleteness?.denominator ?? 0) > 0,
          ).length,
        ),
      },
      matching: {
        statusAccuracy: matchingRatio('statusAccuracy'),
        decisionAccuracy: matchingRatio('decisionAccuracy'),
        scoreAvailability: matchingRatio('scoreAvailability'),
        evidenceValidity: matchingRatio('evidenceValidity'),
        scoreDeviation: {
          n: scoreN,
          mae: scoreN
            ? matching.reduce(
                (sum, f) =>
                  sum +
                  (f.metrics.scoreDeviation.mae ?? 0) *
                    f.metrics.scoreDeviation.n,
                0,
              ) / scoreN
            : null,
          max: scoreN
            ? Math.max(
                ...matching.map((f) => f.metrics.scoreDeviation.max ?? 0),
              )
            : null,
        },
        completion: ratio(matching.length, matching.length),
      },
    },
    latency: {
      n: 0,
      meanMs: null,
      p95Ms: null,
      reason: 'OFFLINE_CANONICAL_REPORT',
    },
    variance: { comparableLiveRuns: 0, sampleStddev: null },
    limitations: [
      'Authored observations test evaluator behavior, not live model accuracy.',
      'Synthetic English fixtures; no OCR, real layouts or general semantic judging.',
      'Exact field/subject/value alignment; no fuzzy matching.',
      'History and education alignment is implemented but not covered by this initial document set.',
      'Evidence support uses authored anchors; it is not general semantic verification.',
    ],
    harnessFailures: harnessFailures.sort(),
    passed: harnessFailures.length === 0,
  };
}
