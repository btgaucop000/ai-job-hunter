import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { infrastructure, LiveError } from './live-errors.js';
import { LOCAL_ENV } from './live-plan.js';
import { supervise } from './live-process.js';
import type { SupervisedBoundary } from './live-process.js';
import {
  InvestigationAdmission,
  investigationError,
  returned,
} from './investigation-plan.js';

export function superviseInvestigation(
  child: ChildProcess,
  cleanupGraceMs = 5000,
): SupervisedBoundary<'RETURNED'> {
  const transport = supervise(
    child,
    cleanupGraceMs,
    returned,
    investigationError,
  );
  const admission = new InvestigationAdmission();
  let busy = false;
  let stopped = false;
  return {
    prepare: (signal) => transport.prepare!(signal),
    extract: async (id, signal) => {
      if (busy || stopped) throw new LiveError('INVALID_INPUT');
      const safeId = admission.take(id);
      busy = true;
      try {
        return await transport.extract(safeId, signal);
      } catch (error) {
        const safe = investigationError(error);
        if (infrastructure(safe.code)) stopped = true;
        throw safe;
      } finally {
        busy = false;
      }
    },
    close: (signal) => transport.close(signal),
  };
}
export function startInvestigationBoundary(): SupervisedBoundary<'RETURNED'> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...LOCAL_ENV };
  delete env.NODE_OPTIONS;
  return superviseInvestigation(
    fork(
      new URL('./investigation-child.js', import.meta.url),
      ['--allow-local-investigation'],
      {
        env,
        execArgv: [],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    ),
  );
}
