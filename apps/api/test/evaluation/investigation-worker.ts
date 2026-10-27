import {
  InvestigationAdmission,
  investigationError,
} from './investigation-plan.js';
import type { InvestigationId } from './investigation-plan.js';
import { infrastructure, LiveError } from './live-errors.js';

// Shared by real child and fake tests. Successful content is discarded here,
// before IPC. Only application-owned tokens leave the worker.
export function investigationWorker(
  extract: (id: InvestigationId) => Promise<unknown>,
) {
  const admission = new InvestigationAdmission();
  let busy = false;
  let stopped = false;
  return async (id: unknown) => {
    try {
      if (busy || stopped) throw new LiveError('INVALID_INPUT');
      const safeId = admission.take(id);
      busy = true;
      try {
        await extract(safeId);
        return {
          type: 'result' as const,
          id: safeId,
          result: 'RETURNED' as const,
        };
      } finally {
        busy = false;
      }
    } catch (error) {
      const safe = investigationError(error);
      if (infrastructure(safe.code)) stopped = true;
      return {
        type: 'error' as const,
        code: safe.code,
        diagnostic: safe.diagnostic,
      };
    }
  };
}
