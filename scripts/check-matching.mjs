// Run after pnpm build and API test:compile. Uses production-compiled matching
// with a real Nest application context; no database, HTTP listener or AI provider.
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
requireApi('reflect-metadata');
const { NestFactory } = requireApi('@nestjs/core');
const { MatchingModule } =
  await import('../apps/api/dist/matching/matching.module.js');
const { MatchingService } =
  await import('../apps/api/dist/matching/matching.service.js');
const { matchExtractions } =
  await import('../apps/api/dist/matching/matching.js');
const { MatchingInputError } =
  await import('../apps/api/dist/matching/matching.validation.js');
const { matchingPair, freezeMatchingFixture } =
  await import('../apps/api/.test-dist/test/support/matching-fixtures.js');
let app;
let passed;
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  throw new Error('Unexpected network call');
};
try {
  app = await NestFactory.createApplicationContext(MatchingModule, {
    logger: false,
    abortOnError: false,
  });
  const service = app.get(MatchingService);
  const input = matchingPair();
  freezeMatchingFixture(input);
  const before = JSON.stringify(input);
  const result = service.match(input);
  assert.ok(!(result instanceof Promise));
  assert.deepEqual(result, matchExtractions(input));
  assert.deepEqual(service.match(input), result);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.overallScore, 100);
  assert.equal(result.coverage.jdEvaluabilityRatio, 0.5);
  assert.equal(result.coverage.activeCategoryWeight, 35);
  assert.equal(result.categories[0].denominatorWeight, 2);
  assert.match(result.scoreExplanation, /1\/2/);
  assert.match(result.scoreExplanation, /35\/100/);
  assert.equal(result.requirements[1].includedInScore, false);
  for (const requirement of result.requirements) {
    for (const { document, reference } of requirement.evidence) {
      assert.equal(
        input[document].source.text.slice(reference.start, reference.end),
        reference.quote,
      );
    }
  }
  assert.throws(
    () =>
      service.match({
        ...input,
        cv: { ...input.cv, schemaVersion: 'invalid' },
      }),
    (error) =>
      error instanceof MatchingInputError &&
      error.code === 'INVALID_MATCHING_INPUT' &&
      error.message === 'Invalid matching input.' &&
      error.cause === undefined,
  );
  assert.equal(fetchCalls, 0);
  passed = true;
} catch {
  // Never print input envelopes, quotes or assertion diagnostics.
  passed = false;
} finally {
  try {
    await app?.close();
  } catch {
    passed = false;
  }
  globalThis.fetch = originalFetch;
}
console.log(
  `Production matching Nest module ${passed ? 'PASS' : 'FAIL'}: synchronous parity, coverage, evidence, frozen inputs and sanitized errors; no AI or database`,
);
if (!passed) process.exitCode = 1;
