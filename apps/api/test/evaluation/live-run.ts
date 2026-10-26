import { createHash } from 'node:crypto';
import type {
  ExtractionResult,
  CvExtractionResult,
  JdExtractionResult,
} from '../../src/extraction/extraction.types.js';
import { matchExtractions } from '../../src/matching/matching.js';
import { documents } from './datasets/v1/extraction.js';
import { matchingCases } from './datasets/v1/matching.js';
import { atoms, evaluateExtraction, ratio } from './extraction.js';
import { evaluateMatching } from './matching.js';
import { aggregateExtraction, serialize } from './report.js';
import {
  LIVE_DEADLINE_MS,
  LOCAL_ENV,
  livePairs,
  liveSchedule,
} from './live-plan.js';
import { OLLAMA_CONTEXT_PROFILE } from '../../src/ai/ollama.context.js';
import { errorCode, infrastructure, LiveError } from './live-errors.js';
import type { LiveCode } from './live-errors.js';
import type { Observation } from './types.js';
import { semanticVariance, statistics } from './live-statistics.js';

export interface LiveBoundary {
  extract(documentId: string, signal: AbortSignal): Promise<ExtractionResult>;
  close(signal?: AbortSignal): Promise<void>;
}
export interface LiveOptions {
  provenance: 'LOCAL_OLLAMA' | 'FAKE_BOUNDARY';
  metadata: Record<string, unknown>;
  signal?: AbortSignal;
  now?: () => number;
  // Test seam only. CLI always uses the fixed deadline.
  deadlineMs?: number;
}
function aborted<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => reject(new LiveError(errorCode(signal.reason)));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
    operation
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', stop));
  });
}
export function evaluateLivePair(
  pair: ReturnType<typeof livePairs>[number],
  cv: CvExtractionResult,
  jd: JdExtractionResult,
) {
  const result = matchExtractions({ cv, jd });
  // Remap only evaluation IDs. Evidence paths remain in the live input's index
  // space. Unrecognized/extra requirements get unique negative gold indexes.
  const goldTexts = pair.fixture.input.jd.data.requirements.map(
    (r) => r.text.value,
  );
  const claimed = new Set<number>();
  const indexMap = jd.data.requirements.map((r, index) => {
    const goldIndex = goldTexts.findIndex(
      (text, i) => text === r.text.value && !claimed.has(i),
    );
    if (goldIndex >= 0) claimed.add(goldIndex);
    return goldIndex >= 0 ? goldIndex : -index - 1;
  });
  const aligned = {
    ...result,
    requirements: result.requirements.map((r) => ({
      ...r,
      jdRequirementIndexes: r.jdRequirementIndexes
        .map((i) => indexMap[i]!)
        .sort((a, b) => a - b),
    })),
  };
  return evaluateMatching({ ...pair.fixture, input: { cv, jd } }, aligned);
}
export async function runLive(boundary: LiveBoundary, options: LiveOptions) {
  const now = options.now ?? (() => performance.now());
  const started = now();
  const controller = new AbortController();
  const interrupt = () => controller.abort(new LiveError('INTERRUPTED'));
  options.signal?.addEventListener('abort', interrupt, { once: true });
  if (options.signal?.aborted) interrupt();
  const timer = setTimeout(
    () => controller.abort(new LiveError('OUTER_DEADLINE')),
    options.deadlineMs ?? LIVE_DEADLINE_MS,
  );
  const schedule = liveSchedule();
  const sourceDocuments = documents();
  const rows: {
    step: (typeof schedule)[number];
    observation: Observation;
    latencyMs: number | null;
    signature: string | null;
  }[] = [];
  const pairs = livePairs();
  const pairRows: {
    id: string;
    outcome: 'SUCCESS' | 'REJECTED' | 'NOT_RUN';
    code: string | null;
    latencyMs: number | null;
    expectedRequirements: number;
    metrics: ReturnType<typeof evaluateMatching> | null;
    deliveredStatusAccuracy: ReturnType<typeof ratio>;
    deliveredDecisionAccuracy: ReturnType<typeof ratio>;
  }[] = [];
  let stopped: LiveCode | null = null;
  let cleanupCode: LiveCode | null = null;
  let cleanupMs: number;
  let workEnded: number;
  const pairStarts = new Map<string, number>();
  try {
    for (const step of schedule) {
      if (controller.signal.aborted)
        stopped = errorCode(controller.signal.reason);
      if (stopped) {
        rows.push({
          step,
          observation: { outcome: 'NOT_RUN' },
          latencyMs: null,
          signature: null,
        });
        continue;
      }
      const before = now();
      if (step.pairId && !pairStarts.has(step.pairId))
        pairStarts.set(step.pairId, before);
      let observation: Observation;
      let signature: string | null = null;
      try {
        const result = await aborted(
          boundary.extract(step.documentId, controller.signal),
          controller.signal,
        );
        if (
          result.kind !==
          sourceDocuments.find((d) => d.id === step.documentId)!.input.kind
        )
          throw new LiveError('INVALID_OUTPUT');
        observation = { outcome: 'SUCCESS', result };
        // Fingerprints stay internal; only distinct-count/disagreement is public.
        signature = serialize(
          atoms(result)
            .map(({ field, subject, value }) => ({ field, subject, value }))
            .sort((a, b) => serialize(a).localeCompare(serialize(b), 'en')),
        );
      } catch (error) {
        const code = errorCode(error);
        observation = { outcome: 'REJECTED', code };
        if (infrastructure(code)) stopped = code;
      }
      rows.push({ step, observation, latencyMs: now() - before, signature });
      if (step.pairId) {
        const pair = pairs.find((p) => p.fixture.id === step.pairId)!;
        if (step.documentId === pair.jdId) {
          const cvRow = rows.find(
            (r) =>
              r.step.pairId === step.pairId && r.step.documentId === pair.cvId,
          )!;
          let metrics: ReturnType<typeof evaluateMatching> | null = null;
          let code: string | null = null;
          if (
            cvRow.observation.outcome === 'SUCCESS' &&
            cvRow.observation.result.kind === 'cv' &&
            observation.outcome === 'SUCCESS' &&
            observation.result.kind === 'jd'
          ) {
            try {
              metrics = evaluateLivePair(
                pair,
                cvRow.observation.result,
                observation.result,
              );
            } catch {
              code = 'INVALID_MATCHING_INPUT';
            }
          } else code = 'EXTRACTION_INCOMPLETE';
          const n = pair.fixture.expected.requirements.length;
          pairRows.push({
            id: pair.fixture.id,
            outcome: metrics ? 'SUCCESS' : 'REJECTED',
            code,
            latencyMs: now() - pairStarts.get(pair.fixture.id)!,
            expectedRequirements: n,
            metrics,
            deliveredStatusAccuracy: metrics?.statusAccuracy ?? ratio(0, n),
            deliveredDecisionAccuracy: metrics?.decisionAccuracy ?? ratio(0, n),
          });
        }
      }
    }
  } finally {
    workEnded = now();
    const before = now();
    try {
      await boundary.close(controller.signal);
    } catch {
      cleanupCode = 'CLEANUP_FAILURE';
    }
    cleanupMs = now() - before;
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', interrupt);
  }
  if (controller.signal.aborted) stopped = errorCode(controller.signal.reason);
  for (const pair of pairs)
    if (!pairRows.some((r) => r.id === pair.fixture.id)) {
      const attempted = rows.some(
        (r) =>
          r.step.pairId === pair.fixture.id &&
          r.observation.outcome !== 'NOT_RUN',
      );
      const n = pair.fixture.expected.requirements.length;
      pairRows.push({
        id: pair.fixture.id,
        outcome: attempted ? 'REJECTED' : 'NOT_RUN',
        code: stopped,
        latencyMs: attempted
          ? workEnded - pairStarts.get(pair.fixture.id)!
          : null,
        expectedRequirements: n,
        metrics: null,
        deliveredStatusAccuracy: ratio(0, attempted ? n : 0),
        deliveredDecisionAccuracy: ratio(0, attempted ? n : 0),
      });
    }
  const extraction = rows.map(({ step, observation, latencyMs }) => ({
    ...step,
    outcome: observation.outcome,
    code:
      observation.outcome === 'REJECTED'
        ? observation.code
        : observation.outcome === 'NOT_RUN'
          ? stopped
          : null,
    latencyMs,
    metrics: evaluateExtraction(
      sourceDocuments.find((d) => d.id === step.documentId)!.gold,
      observation,
    ),
  }));
  // Fixed-envelope correctness is separate from live model measurements.
  const fixedMatching = [
    ...matchingCases(),
    ...pairs.map((p) => p.fixture),
  ].map((fixture) => ({
    id: fixture.id,
    provenance: 'HUMAN_AUTHORED_GOLD',
    metrics: evaluateMatching(fixture, matchExtractions(fixture.input)),
  }));
  const completed = extraction.filter((r) => r.outcome === 'SUCCESS').length;
  const latency = (outcome: 'SUCCESS' | 'REJECTED') =>
    statistics(
      extraction.filter((r) => r.outcome === outcome).map((r) => r.latencyMs!),
    );
  const repeated = ['cv-simple-pdf', 'cv-simple-docx'].map((documentId) => {
    const attempts = extraction.filter(
      (r) => r.documentId === documentId && r.pairId === null,
    );
    const successful = attempts.filter((r) => r.outcome === 'SUCCESS');
    return {
      documentId,
      planned: attempts.length,
      attempted: attempts.filter((r) => r.outcome !== 'NOT_RUN').length,
      rejected: attempts.filter((r) => r.outcome === 'REJECTED').length,
      ...semanticVariance(
        rows
          .filter(
            (r) =>
              r.step.documentId === documentId &&
              r.step.pairId === null &&
              r.signature !== null,
          )
          .map((r) => r.signature!),
      ),
      precision: statistics(
        successful.flatMap((r) =>
          r.metrics.precision?.value === null || r.metrics.precision === null
            ? []
            : [r.metrics.precision.value],
        ),
      ),
      recall: statistics(successful.map((r) => r.metrics.recall!.value!)),
      latencyMs: statistics(successful.map((r) => r.latencyMs!)),
    };
  });
  const passed =
    !stopped &&
    !cleanupCode &&
    extraction.every(
      (r) => r.outcome === 'SUCCESS' && r.metrics.failures.length === 0,
    ) &&
    pairRows.every(
      (r) => r.metrics !== null && r.metrics.failures.length === 0,
    ) &&
    fixedMatching.every((r) => r.metrics.failures.length === 0);
  return {
    reportVersion: '1',
    mode: 'local-live',
    measurementProvenance: options.provenance,
    datasetVersion: 'synthetic-v1',
    evaluationPolicyVersion: 'evaluation-v1',
    scheduleVersion: 'live-schedule-v1',
    pairPolicyVersion: 'live-pairs-v1',
    extractionSchemaVersion: '1',
    matchingPolicyVersion: 'matching-v1',
    datasetDefinitionSha256: createHash('sha256')
      .update(
        serialize(
          sourceDocuments.map(({ id, expectedText, gold, input }) => ({
            id,
            expectedText,
            gold,
            artifactSha256: createHash('sha256')
              .update(
                input.kind === 'cv' ? input.value.bytes : input.value.text,
              )
              .digest('hex'),
          })),
        ),
      )
      .digest('hex'),
    provenance: options.metadata,
    model: {
      provider: 'ollama',
      expectedProfile: OLLAMA_CONTEXT_PROFILE,
      verifiedIdentity:
        options.provenance === 'LOCAL_OLLAMA' && completed > 0
          ? {
              model: OLLAMA_CONTEXT_PROFILE.model,
              digest: OLLAMA_CONTEXT_PROFILE.digest,
              ollamaVersion: OLLAMA_CONTEXT_PROFILE.version,
              basis: 'PRODUCTION_PROVIDER_CHECKS_ON_SUCCESSFUL_EXTRACTIONS',
            }
          : null,
      baseUrl: LOCAL_ENV.OLLAMA_BASE_URL,
      temperature: 0,
      requestTimeoutMs: 120000,
      think: false,
      truncate: false,
      shift: false,
    },
    limits: { maxExtractionInvocations: 18, outerDeadlineMs: LIVE_DEADLINE_MS },
    sampleSizes: {
      planned: 18,
      attempted: extraction.filter((r) => r.outcome !== 'NOT_RUN').length,
      completed,
      rejected: extraction.filter((r) => r.outcome === 'REJECTED').length,
      notRun: extraction.filter((r) => r.outcome === 'NOT_RUN').length,
    },
    extraction,
    fixedMatching,
    endToEnd: pairRows,
    aggregate: {
      extraction: aggregateExtraction(extraction.map((r) => r.metrics)),
      endToEnd: {
        sampleSizes: {
          planned: pairRows.length,
          attempted: pairRows.filter((r) => r.outcome !== 'NOT_RUN').length,
          completed: pairRows.filter((r) => r.outcome === 'SUCCESS').length,
          rejected: pairRows.filter((r) => r.outcome === 'REJECTED').length,
          notRun: pairRows.filter((r) => r.outcome === 'NOT_RUN').length,
        },
        deliveredStatusAccuracy: ratio(
          pairRows.reduce((n, r) => n + r.deliveredStatusAccuracy.numerator, 0),
          pairRows.reduce(
            (n, r) => n + r.deliveredStatusAccuracy.denominator,
            0,
          ),
        ),
        deliveredDecisionAccuracy: ratio(
          pairRows.reduce(
            (n, r) => n + r.deliveredDecisionAccuracy.numerator,
            0,
          ),
          pairRows.reduce(
            (n, r) => n + r.deliveredDecisionAccuracy.denominator,
            0,
          ),
        ),
        completion: ratio(
          pairRows.filter((r) => r.outcome === 'SUCCESS').length,
          pairRows.filter((r) => r.outcome !== 'NOT_RUN').length,
        ),
      },
    },
    latency: {
      unit: 'milliseconds',
      successfulExtraction: latency('SUCCESS'),
      failedExtraction: latency('REJECTED'),
      successfulPair: statistics(
        pairRows
          .filter((r) => r.outcome === 'SUCCESS')
          .map((r) => r.latencyMs!),
      ),
      failedPair: statistics(
        pairRows
          .filter((r) => r.outcome === 'REJECTED')
          .map((r) => r.latencyMs!),
      ),
      totalMs: now() - started,
      cleanupMs,
    },
    variance: repeated,
    stopped,
    cleanupCode,
    passed,
    limitations: [
      'Small synthetic English regression dataset, not a general accuracy benchmark.',
      'Exact authored-value alignment; semantic equivalents may count as mismatches.',
      'Fixed-envelope matching is not live model accuracy.',
      'Three planned repeats provide descriptive variance only; first attempts are retained without assuming a cold cache.',
      'Provider verification is per extraction, not an atomic lock on the local daemon.',
    ],
  };
}
