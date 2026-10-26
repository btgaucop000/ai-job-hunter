import { offlineReport, serialize } from './report.js';

try {
  const report = await offlineReport();
  process.stdout.write(serialize(report));
  if (!report.passed) process.exitCode = 1;
} catch {
  process.stdout.write(
    serialize({
      mode: 'offline',
      passed: false,
      harnessFailures: ['OFFLINE_RUN_FAILED'],
    }),
  );
  process.exitCode = 1;
}
