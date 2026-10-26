import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { execFileSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { documents } from '../evaluation/datasets/v1/extraction.js';
import {
  authoredSource,
  livePairs,
  liveSchedule,
  LOCAL_ENV,
  refusal,
  LIVE_DEADLINE_MS,
} from '../evaluation/live-plan.js';
import { evaluateLivePair, runLive } from '../evaluation/live-run.js';
import type { LiveBoundary } from '../evaluation/live-run.js';
import { LiveError } from '../evaluation/live-errors.js';
import { statistics, semanticVariance } from '../evaluation/live-statistics.js';
import { supervise } from '../evaluation/live-process.js';
import { serialize } from '../evaluation/report.js';
import { matchExtractions } from '../../src/matching/matching.js';
import { evaluateMatching } from '../evaluation/matching.js';
import { aiConfig } from '../../src/ai/ai.config.js';

const options = {
  provenance: 'FAKE_BOUNDARY' as const,
  metadata: { test: true },
};
function fakeBoundary() {
  const extract = jest.fn<LiveBoundary['extract']>(async (id) => {
    const d = documents().find((d) => d.id === id)!;
    return d.observed(authoredSource(d));
  });
  const close = jest.fn<LiveBoundary['close']>(async () => {});
  return { extract, close };
}
beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('TEST_NETWORK_FORBIDDEN');
  });
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('opt-in must be exact; CI even empty is refused before initialization', () => {
  expect(refusal([], {})).toBe('OPT_IN_REQUIRED');
  expect(refusal(['--allow-local-ollama', '--other'], {})).toBe(
    'OPT_IN_REQUIRED',
  );
  expect(refusal(['--', '--allow-local-ollama'], {})).toBeNull();
  expect(refusal(['--allow-local-ollama'], { CI: '' })).toBe('CI_REFUSED');
  expect(refusal(['--allow-local-ollama'], { CI: 'false' })).toBe('CI_REFUSED');
});

test('fixed local configuration replaces inherited cloud/model/timeout settings', () => {
  const inherited: NodeJS.ProcessEnv = {
    AI_PROVIDER: 'cloud',
    OLLAMA_BASE_URL: 'https://cloud.invalid',
    OLLAMA_MODEL: 'remote',
    AI_REQUEST_TIMEOUT_MS: '1',
  };
  const env = { ...inherited, ...LOCAL_ENV };
  expect(aiConfig(env)).toEqual({
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    model: 'qwen3:4b',
    timeoutMs: 120000,
  });
  expect(LIVE_DEADLINE_MS).toBe(2700000);
});

test('schedule contains fourteen standalone attempts and four fresh pair invocations', () => {
  const steps = liveSchedule();
  expect(steps).toHaveLength(18);
  expect(new Set(steps.map((s) => s.id)).size).toBe(18);
  expect(steps.filter((s) => s.pairId === null)).toHaveLength(14);
  expect(steps.filter((s) => s.documentId === 'cv-simple-pdf')).toHaveLength(3);
  expect(steps.filter((s) => s.documentId === 'cv-simple-docx')).toHaveLength(
    3,
  );
  expect(steps.filter((s) => s.pairId !== null)).toHaveLength(4);
});

test.each(livePairs())(
  'independently authored pair $fixture.id gold agrees with deterministic policy',
  (pair) => {
    expect(
      evaluateMatching(pair.fixture, matchExtractions(pair.fixture.input))
        .failures,
    ).toEqual([]);
  },
);

test('eighteen calls are sequential, pair inputs are fresh and cleanup is once', async () => {
  const fake = fakeBoundary();
  const original = fake.extract.getMockImplementation()!;
  let active = 0;
  let peak = 0;
  fake.extract.mockImplementation(async (id, signal) => {
    active++;
    peak = Math.max(active, peak);
    await Promise.resolve();
    const result = await original(id, signal);
    active--;
    return result;
  });
  let tick = 0;
  const report = await runLive(fake, { ...options, now: () => ++tick });
  expect(fake.extract.mock.calls.map(([id]) => id)).toEqual(
    liveSchedule().map((s) => s.documentId),
  );
  expect(peak).toBe(1);
  expect(fake.close).toHaveBeenCalledTimes(1);
  expect(report.sampleSizes).toEqual({
    planned: 18,
    attempted: 18,
    completed: 18,
    rejected: 0,
    notRun: 0,
  });
  expect(report.fixedMatching).toHaveLength(14);
  expect(report.endToEnd).toHaveLength(2);
  expect(report.model.verifiedIdentity).toBeNull();
  expect(report.latency.successfulExtraction.n).toBe(18);
});

test('isolated quality rejection continues without retry and reduces delivered recall', async () => {
  const fake = fakeBoundary();
  fake.extract.mockRejectedValueOnce(new LiveError('INVALID_EVIDENCE'));
  const report = await runLive(fake, options);
  expect(fake.extract).toHaveBeenCalledTimes(18);
  expect(report.extraction[0]!.metrics.precision).toBeNull();
  expect(report.extraction[0]!.metrics.deliveredRecall).toEqual({
    numerator: 0,
    denominator: 4,
    value: 0,
  });
  expect(report.sampleSizes.rejected).toBe(1);
  expect(report.sampleSizes.notRun).toBe(0);
  expect(report.latency.failedExtraction.n).toBe(1);
  expect(report.passed).toBe(false);
});

test.each([
  'CONNECTION_FAILURE',
  'CONTEXT_UNVERIFIED',
  'TIMEOUT',
  'EXTRACTION_UNAVAILABLE',
] as const)(
  '%s stops without retry or fallback and preserves not-run cases',
  async (code) => {
    const fake = fakeBoundary();
    fake.extract.mockRejectedValueOnce(new LiveError(code));
    const report = await runLive(fake, options);
    expect(fake.extract).toHaveBeenCalledTimes(1);
    expect(fake.close).toHaveBeenCalledTimes(1);
    expect(report.stopped).toBe(code);
    expect(report.sampleSizes).toEqual({
      planned: 18,
      attempted: 1,
      completed: 0,
      rejected: 1,
      notRun: 17,
    });
    expect(report.extraction[1]!.metrics.deliveredRecall.denominator).toBe(0);
    expect(report.endToEnd.every((r) => r.outcome === 'NOT_RUN')).toBe(true);
  },
);

test('outer deadline interrupts a pending extraction, counts rejection, then closes resources', async () => {
  jest.useFakeTimers();
  const fake = fakeBoundary();
  fake.extract.mockImplementation(() => new Promise(() => {}));
  const result = runLive(fake, { ...options, deadlineMs: 100 });
  await jest.advanceTimersByTimeAsync(100);
  const report = await result;
  expect(report.stopped).toBe('OUTER_DEADLINE');
  expect(report.sampleSizes.rejected).toBe(1);
  expect(report.sampleSizes.notRun).toBe(17);
  expect(fake.close.mock.calls[0]![0]!.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('interruption before execution runs no extraction; cleanup errors remain visible', async () => {
  const fake = fakeBoundary();
  const controller = new AbortController();
  controller.abort();
  fake.close.mockRejectedValueOnce(new Error('private cleanup payload'));
  const report = await runLive(fake, { ...options, signal: controller.signal });
  expect(fake.extract).not.toHaveBeenCalled();
  expect(report.sampleSizes.notRun).toBe(18);
  expect(report.cleanupCode).toBe('CLEANUP_FAILURE');
  expect(serialize(report)).not.toContain('private cleanup payload');
});

test('end-to-end omitted JD requirements cannot shrink or shift gold denominators', () => {
  const pair = livePairs()[0]!;
  const { cv, jd } = pair.fixture.input;
  const omitted = {
    ...jd,
    data: {
      ...jd.data,
      requirements: jd.data.requirements.filter((_, i) => i !== 1),
    },
  };
  const metrics = evaluateLivePair(pair, cv, omitted);
  expect(metrics.statusAccuracy.denominator).toBe(5);
  expect(metrics.statusAccuracy.numerator).toBe(4);
  expect(metrics.decisionAccuracy.denominator).toBe(5);
  expect(metrics.failures).toContain('REQUIREMENT_COUNT');
  expect(metrics.failures).toContain('COVERAGE');
  const empty = evaluateLivePair(pair, cv, {
    ...jd,
    data: { ...jd.data, requirements: [] },
  });
  expect(empty.statusAccuracy.value).toBe(0);
  expect(empty.statusAccuracy.denominator).toBe(5);
  expect(empty.scoreAvailability.value).toBeLessThan(1);
});

test('reordered live JD requirements preserve gold identity', () => {
  const pair = livePairs()[0]!;
  const { cv, jd } = pair.fixture.input;
  const result = evaluateLivePair(pair, cv, {
    ...jd,
    data: { ...jd.data, requirements: [...jd.data.requirements].reverse() },
  });
  expect(result.statusAccuracy.value).toBe(1);
  expect(result.decisionAccuracy.value).toBe(1);
});

test('rejected pair extraction retains delivered matching denominator', async () => {
  const fake = fakeBoundary();
  const original = fake.extract.getMockImplementation()!;
  let calls = 0;
  fake.extract.mockImplementation((id, signal) =>
    ++calls === 15
      ? Promise.reject(new LiveError('INVALID_EVIDENCE'))
      : original(id, signal),
  );
  const report = await runLive(fake, options);
  expect(fake.extract).toHaveBeenCalledTimes(18);
  expect(report.endToEnd[0]!.outcome).toBe('REJECTED');
  expect(report.endToEnd[0]!.deliveredStatusAccuracy).toEqual({
    numerator: 0,
    denominator: 5,
    value: 0,
  });
  expect(report.aggregate.endToEnd.deliveredStatusAccuracy.denominator).toBe(
    10,
  );
});

test('raw output, source text, evidence and private error messages never enter reports', async () => {
  const fake = fakeBoundary();
  fake.extract.mockRejectedValueOnce({
    code: 'secret-code',
    message: 'PRIVATE_SENTINEL',
  });
  const report = await runLive(fake, options);
  const json = serialize(report);
  for (const forbidden of [
    'PRIVATE_SENTINEL',
    'secret-code',
    'Synthetic Candidate',
    'segmentId',
    '"quote"',
    '"source"',
    '"result"',
  ])
    expect(json).not.toContain(forbidden);
  expect(report.stopped).toBe('UNEXPECTED_FAILURE');
});

test('latency uses nearest-rank p95 and sample variance, with explicit small samples', () => {
  expect(statistics([])).toEqual({
    n: 0,
    mean: null,
    median: null,
    p95: null,
    min: null,
    max: null,
    sampleVariance: null,
    sampleStddev: null,
  });
  expect(statistics([7]).sampleStddev).toBeNull();
  expect(statistics([1, 3, 5])).toEqual({
    n: 3,
    mean: 3,
    median: 3,
    p95: 5,
    min: 1,
    max: 5,
    sampleVariance: 4,
    sampleStddev: 2,
  });
  expect(semanticVariance(['a', 'a', 'b'])).toEqual({
    successfulRuns: 3,
    distinctFactSets: 2,
    differingPairs: 2,
    comparablePairs: 3,
    disagreementRate: 2 / 3,
  });
  expect(semanticVariance(['a']).disagreementRate).toBeNull();
});

class FakeChild extends EventEmitter {
  connected = true;
  killed: string[] = [];
  sent: unknown[] = [];
  graceful = true;
  send(message: unknown, callback?: (error: Error | null) => void) {
    this.sent.push(message);
    callback?.(null);
    if ((message as { type: string }).type === 'close' && this.graceful)
      queueMicrotask(() => this.finish());
    return true;
  }
  kill(signal: string) {
    this.killed.push(signal);
    queueMicrotask(() => this.finish());
    return true;
  }
  finish() {
    this.connected = false;
    this.emit('exit', 0);
  }
}

test('supervisor sends only fixed fixture IDs, accepts results and closes child', async () => {
  const child = new FakeChild();
  const boundary = supervise(child as unknown as ChildProcess);
  child.emit('message', { type: 'ready' });
  const promise = boundary.extract(
    'cv-simple-pdf',
    new AbortController().signal,
  );
  await Promise.resolve();
  const result = await fakeBoundary().extract(
    'cv-simple-pdf',
    new AbortController().signal,
  );
  child.emit('message', { type: 'result', id: 'cv-simple-pdf', result });
  expect(await promise).toBe(result);
  expect(child.sent[0]).toEqual({ type: 'extract', id: 'cv-simple-pdf' });
  await boundary.close();
  expect(child.killed).toEqual([]);
});

test('supervisor kills a pending child on deadline and awaits exit', async () => {
  const child = new FakeChild();
  const boundary = supervise(child as unknown as ChildProcess);
  child.emit('message', { type: 'ready' });
  const controller = new AbortController();
  const pending = boundary.extract('cv-simple-pdf', controller.signal);
  const rejection = expect(pending).rejects.toMatchObject({
    code: 'OUTER_DEADLINE',
  });
  await Promise.resolve();
  controller.abort(new LiveError('OUTER_DEADLINE'));
  await rejection;
  await boundary.close(controller.signal);
  expect(child.killed).toContain('SIGKILL');
  expect(child.connected).toBe(false);
});

test('supervisor bounds hung cleanup with kill and reports cleanup failure', async () => {
  jest.useFakeTimers();
  const child = new FakeChild();
  child.graceful = false;
  const boundary = supervise(child as unknown as ChildProcess, 50);
  child.emit('message', { type: 'ready' });
  const closed = expect(boundary.close()).rejects.toMatchObject({
    code: 'CLEANUP_FAILURE',
  });
  await jest.advanceTimersByTimeAsync(50);
  await closed;
  expect(child.killed).toEqual(['SIGKILL']);
  expect(jest.getTimerCount()).toBe(0);
});

test('CLI refusal is tested in a subprocess with all network denied; no live child starts', () => {
  const guard = fileURLToPath(
    new URL('../evaluation/no-network.js', import.meta.url),
  );
  const cli = fileURLToPath(new URL('../evaluation/live.js', import.meta.url));
  const run = (args: string[], env: NodeJS.ProcessEnv) => {
    try {
      execFileSync(process.execPath, ['--import', guard, cli, ...args], {
        env,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10000,
      });
      throw new Error('Expected refusal');
    } catch (error) {
      return JSON.parse((error as { stdout: string }).stdout);
    }
  };
  const env = { ...process.env };
  delete env.CI;
  expect(run([], env).code).toBe('OPT_IN_REQUIRED');
  expect(run(['--allow-local-ollama'], { ...env, CI: 'true' }).code).toBe(
    'CI_REFUSED',
  );
});

test('supervisor reaps a real inert child that ignores cleanup, without loading a provider', async () => {
  const child = fork(
    new URL('../support/evaluation-hanging-child.js', import.meta.url),
    [],
    {
      execArgv: [
        '--import',
        fileURLToPath(new URL('../evaluation/no-network.js', import.meta.url)),
      ],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  const boundary = supervise(child, 30);
  await new Promise((resolve) => child.once('message', resolve));
  await expect(boundary.close()).rejects.toMatchObject({
    code: 'CLEANUP_FAILURE',
  });
  expect(child.signalCode).toBe('SIGKILL');
  expect(child.connected).toBe(false);
}, 10000);

test('successful output reports retain only metrics, never model content or references', async () => {
  const report = await runLive(fakeBoundary(), options);
  const json = serialize(report);
  for (const forbidden of [
    'Synthetic Candidate',
    'segmentId',
    '"quote"',
    '"source"',
    '"result"',
  ])
    expect(json).not.toContain(forbidden);
  expect(
    report.variance.every(
      (v) => v.successfulRuns === 3 && v.disagreementRate === 0,
    ),
  ).toBe(true);
});

test('infrastructure failure mid-pair preserves attempted pair denominator and cleanup-independent latency', async () => {
  const fake = fakeBoundary();
  const original = fake.extract.getMockImplementation()!;
  let calls = 0;
  let clock = 0;
  fake.extract.mockImplementation((id, signal) => {
    clock += 10;
    return ++calls === 15
      ? Promise.reject(new LiveError('CONNECTION_FAILURE'))
      : original(id, signal);
  });
  fake.close.mockImplementation(async () => {
    clock += 100;
  });
  const report = await runLive(fake, { ...options, now: () => clock });
  expect(report.endToEnd[0]!.deliveredStatusAccuracy.denominator).toBe(5);
  expect(report.endToEnd[0]!.latencyMs).toBe(10);
  expect(report.endToEnd[1]!.outcome).toBe('NOT_RUN');
  expect(report.endToEnd[1]!.deliveredStatusAccuracy.denominator).toBe(0);
});

test('failed child spawn closes without waiting for an exit event that never arrives', async () => {
  const child = new FakeChild();
  const boundary = supervise(child as unknown as ChildProcess);
  const pending = boundary.extract(
    'cv-simple-pdf',
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toMatchObject({
    code: 'SETUP_FAILURE',
  });
  child.emit('error', new Error('private spawn details'));
  child.emit('close', -2);
  await rejected;
  await expect(boundary.close()).rejects.toMatchObject({
    code: 'CLEANUP_FAILURE',
  });
});
