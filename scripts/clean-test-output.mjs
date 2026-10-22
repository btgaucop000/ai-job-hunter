import { rmSync } from 'node:fs';

// Only generated test output; prevent removed/renamed tests from running stale code.
rmSync(new URL('../apps/api/.test-dist/', import.meta.url), {
  recursive: true,
  force: true,
});
