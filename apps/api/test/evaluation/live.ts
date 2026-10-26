import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { refusal } from './live-plan.js';
import { serialize } from './report.js';
import { runLive } from './live-run.js';
import type { LiveBoundary } from './live-run.js';
import { startLocalBoundary } from './live-process.js';

const refused = refusal(process.argv.slice(2), process.env);
if (refused) {
  process.stdout.write(
    serialize({ mode: 'local-live', outcome: 'NOT_RUN', code: refused }),
  );
  process.exitCode = 1;
} else {
  const controller = new AbortController();
  let boundary: LiveBoundary | undefined;
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    let commit: string | null = null;
    let workingTreeDirty: boolean | null = null;
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      workingTreeDirty =
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
          timeout: 2000,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim().length > 0;
    } catch {
      /* Unknown provenance is explicit, never inferred. */
    }
    const hash = (path: string) =>
      createHash('sha256')
        .update(readFileSync(new URL(path, import.meta.url)))
        .digest('hex');
    const metadata = {
      commit,
      workingTreeDirty,
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      promptModuleSha256: hash('../../src/extraction/extraction.prompts.js'),
      schemaModuleSha256: hash('../../src/extraction/extraction.schemas.js'),
      providerModuleSha256: hash('../../src/ai/ollama.provider.js'),
    };
    boundary = startLocalBoundary();
    const report = await runLive(boundary, {
      provenance: 'LOCAL_OLLAMA',
      metadata,
      signal: controller.signal,
    });
    process.stdout.write(serialize(report));
    if (!report.passed) process.exitCode = 1;
  } catch {
    process.stdout.write(
      serialize({
        mode: 'local-live',
        outcome: 'FAILED',
        code: 'SETUP_FAILURE',
      }),
    );
    process.exitCode = 1;
  } finally {
    await boundary?.close(controller.signal).catch(() => {});
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}
