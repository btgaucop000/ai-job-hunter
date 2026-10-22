import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [target, format, operation] = process.argv.slice(2);
if (
  !['development', 'test'].includes(target) ||
  !['source', 'compiled'].includes(format) ||
  !['run', 'show', 'revert'].includes(operation) ||
  process.argv.length !== 5
) {
  throw new Error(
    'Usage: migrate.mjs development|test source|compiled run|show|revert',
  );
}

const api = fileURLToPath(new URL('../apps/api/', import.meta.url));
const envFile = fileURLToPath(
  new URL(target === 'test' ? '../.env.test' : '../.env', import.meta.url),
);
const source = format === 'source';
const dataSource = target === 'test' ? 'test-data-source' : 'data-source';
const result = spawnSync(
  process.execPath,
  [
    `--env-file-if-exists=${envFile}`,
    ...(source ? ['--loader', 'ts-node/esm'] : []),
    'node_modules/typeorm/cli.js',
    `migration:${operation}`,
    '-d',
    `${source ? 'src' : 'dist'}/database/${dataSource}.${source ? 'ts' : 'js'}`,
  ],
  { cwd: api, stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
