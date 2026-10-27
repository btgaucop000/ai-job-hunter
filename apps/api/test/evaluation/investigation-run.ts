import { LIVE_DEADLINE_MS } from './live-plan.js';
import { infrastructure, LiveError } from './live-errors.js';
import type { LiveCode } from './live-errors.js';
import type { SupervisedBoundary } from './live-process.js';
import {
  INVESTIGATION_IDS,
  investigationError,
  returned,
} from './investigation-plan.js';
import type { InvestigationId } from './investigation-plan.js';
import type { ExtractionDiagnostic } from '../../src/extraction/extraction.diagnostics.js';

export interface InvestigationRow {
  id: InvestigationId;
  status: 'RETURNED' | 'REJECTED' | 'NOT_RUN';
  code: LiveCode | null;
  diagnostic: ExtractionDiagnostic | null;
  elapsedMs: number | null;
}
export async function runInvestigation(
  boundary: SupervisedBoundary<'RETURNED'>,
  options: {
    signal?: AbortSignal;
    now?: () => number;
  } = {},
) {
  const now = options.now ?? (() => performance.now());
  const controller = new AbortController();
  const interrupt = () => controller.abort(new LiveError('INTERRUPTED'));
  options.signal?.addEventListener('abort', interrupt, { once: true });
  if (options.signal?.aborted) interrupt();
  const timer = setTimeout(
    () => controller.abort(new LiveError('OUTER_DEADLINE')),
    LIVE_DEADLINE_MS,
  );
  const cases: InvestigationRow[] = INVESTIGATION_IDS.map((id) => ({
    id,
    status: 'NOT_RUN',
    code: null,
    diagnostic: null,
    elapsedMs: null,
  }));
  let code: LiveCode | null = null;
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    await boundary.prepare?.(controller.signal);
    for (const row of cases) {
      if (controller.signal.aborted) {
        code = investigationError(controller.signal.reason).code;
        break;
      }
      const started = now();
      let stop: (() => void) | undefined;
      try {
        // Race is also needed for fake/unresponsive boundaries. Supervisor owns
        // actual child termination; close below always waits for cleanup.
        const result = await Promise.race([
          boundary.extract(row.id, controller.signal),
          new Promise<never>((_, reject) => {
            stop = () => reject(controller.signal.reason);
            controller.signal.addEventListener('abort', stop, { once: true });
            if (controller.signal.aborted) stop();
          }),
        ]);
        returned(result);
        row.status = 'RETURNED';
      } catch (error) {
        const safe = investigationError(error);
        row.status = 'REJECTED';
        row.code = safe.code;
        row.diagnostic = safe.diagnostic;
        if (infrastructure(safe.code)) code = safe.code;
      } finally {
        if (stop) controller.signal.removeEventListener('abort', stop);
        const elapsed = now() - started;
        row.elapsedMs = Number.isFinite(elapsed)
          ? Math.min(LIVE_DEADLINE_MS, Math.max(0, Math.round(elapsed)))
          : null;
      }
      if (code) break;
    }
  } catch (error) {
    code = investigationError(error).code;
  } finally {
    try {
      await boundary.close(controller.signal);
    } catch {
      code = 'CLEANUP_FAILURE';
    }
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', interrupt);
  }
  return { cases, code };
}
