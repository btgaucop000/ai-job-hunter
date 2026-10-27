import {
  investigationAllowed,
  INVESTIGATION_IDS,
  investigationError,
} from './investigation-plan.js';
import { runInvestigation } from './investigation-run.js';
import { startInvestigationBoundary } from './investigation-process.js';

if (!investigationAllowed(process.argv.slice(2), process.env)) {
  process.stdout.write(
    JSON.stringify({
      cases: INVESTIGATION_IDS.map((id) => ({
        id,
        status: 'NOT_RUN',
        code: null,
        diagnostic: null,
        elapsedMs: null,
      })),
      code: 'INVALID_INPUT',
    }) + '\n',
  );
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const report = await runInvestigation(startInvestigationBoundary(), {
      signal: controller.signal,
    });
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.code || report.cases.some((row) => row.status !== 'RETURNED'))
      process.exitCode = 1;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        cases: INVESTIGATION_IDS.map((id) => ({
          id,
          status: 'NOT_RUN',
          code: null,
          diagnostic: null,
          elapsedMs: null,
        })),
        code: investigationError(error).code,
      }) + '\n',
    );
    process.exitCode = 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
