import 'reflect-metadata';
import { afterEach, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  INVESTIGATION_IDS,
  InvestigationAdmission,
  investigationAllowed,
  investigationError,
} from '../evaluation/investigation-plan.js';
import { investigationWorker } from '../evaluation/investigation-worker.js';
import { investigationPreflight } from '../evaluation/investigation-preflight.js';
import { superviseInvestigation } from '../evaluation/investigation-process.js';
import { runInvestigation } from '../evaluation/investigation-run.js';
import {
  LIVE_DEADLINE_MS,
  liveSchedule,
  refusal,
} from '../evaluation/live-plan.js';
import { LiveError } from '../evaluation/live-errors.js';
import { OLLAMA_CONTEXT_PROFILE as profile } from '../../src/ai/ollama.context.js';
import { EXTRACTION_DIAGNOSTIC_RULES } from '../../src/extraction/extraction.diagnostics.js';

const signal = () => new AbortController().signal;
const fake = () => ({
  prepare: jest.fn<() => Promise<void>>().mockResolvedValue(),
  extract: jest
    .fn<(id: string, signal: AbortSignal) => Promise<'RETURNED'>>()
    .mockResolvedValue('RETURNED'),
  close: jest.fn<() => Promise<void>>().mockResolvedValue(),
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
test('only explicit investigation opt-in is accepted, never CI or selectors', () => {
  expect(investigationAllowed(['--', '--allow-local-investigation'], {})).toBe(
    true,
  );
  for (const args of [
    [],
    ['--allow-local-ollama'],
    ['--allow-local-investigation', 'jd-mixed'],
    ['--allow-local-investigation', '--allow-local-investigation'],
  ])
    expect(investigationAllowed(args, {})).toBe(false);
  expect(
    investigationAllowed(['--allow-local-investigation'], { CI: 'false' }),
  ).toBe(false);
});
test('schedule is exactly four fixed IDs, and original schedule/opt-in is unchanged', async () => {
  expect(INVESTIGATION_IDS).toEqual([
    'cv-duration-docx',
    'jd-mixed',
    'jd-injection',
    'jd-negation',
  ]);
  expect(liveSchedule()).toHaveLength(18);
  expect(refusal(['--allow-local-investigation'], {})).toBe('OPT_IN_REQUIRED');
  expect(refusal(['--allow-local-ollama'], {})).toBeNull();
  const boundary = fake();
  const result = await runInvestigation(boundary);
  expect(boundary.extract.mock.calls.map(([id]) => id)).toEqual(
    INVESTIGATION_IDS,
  );
  expect(result.cases.map((row) => row.status)).toEqual(
    Array(4).fill('RETURNED'),
  );
  expect(boundary.close).toHaveBeenCalledTimes(1);
});
test('admission refuses out-of-order, duplicates, arbitrary IDs and fifth calls', () => {
  const admission = new InvestigationAdmission();
  expect(() => admission.take('PRIVATE')).toThrow('INVALID_INPUT');
  expect(() => admission.take(INVESTIGATION_IDS[1])).toThrow('INVALID_INPUT');
  admission.take(INVESTIGATION_IDS[0]);
  expect(() => admission.take(INVESTIGATION_IDS[0])).toThrow('INVALID_INPUT');
  for (const id of INVESTIGATION_IDS.slice(1)) admission.take(id);
  expect(() => admission.take(INVESTIGATION_IDS[0])).toThrow('INVALID_INPUT');
});
test('child independently enforces four calls and never sends extraction content', async () => {
  const extract = jest.fn(async () => ({
    source: 'PRIVATE',
    prompt: 'PRIVATE',
    model: 'PRIVATE',
    evidence: [{ quote: 'PRIVATE' }],
  }));
  const worker = investigationWorker(extract);
  for (const id of INVESTIGATION_IDS)
    expect(await worker(id)).toEqual({
      type: 'result',
      id,
      result: 'RETURNED',
    });
  expect(await worker(INVESTIGATION_IDS[0])).toEqual({
    type: 'error',
    code: 'INVALID_INPUT',
    diagnostic: null,
  });
  expect(extract).toHaveBeenCalledTimes(4);
});
test.each(['PRIVATE', 'jd-mixed', 'cv-duration-docx'])(
  'child refuses invalid/duplicate request %s',
  async (id) => {
    const extract = jest.fn(async () => 'PRIVATE');
    const worker = investigationWorker(extract);
    if (id === 'cv-duration-docx') await worker(id);
    expect(await worker(id)).toMatchObject({
      type: 'error',
      code: 'INVALID_INPUT',
    });
    expect(extract).toHaveBeenCalledTimes(id === 'cv-duration-docx' ? 1 : 0);
  },
);
test('preflight uses only pinned metadata endpoints and verifies digest/version', async () => {
  const transport = jest
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ version: profile.version }))
    .mockResolvedValueOnce(
      Response.json({
        models: [{ name: profile.model, digest: profile.digest }],
      }),
    );
  await investigationPreflight(transport);
  expect(transport.mock.calls.map(([url]) => url)).toEqual([
    'http://127.0.0.1:11434/api/version',
    'http://127.0.0.1:11434/api/tags',
  ]);
  expect(
    transport.mock.calls.every(
      ([, init]) => init?.redirect === 'error' && init.body === undefined,
    ),
  ).toBe(true);
});
test.each(['version', 'digest'])(
  'profile %s mismatch leaves all cases NOT_RUN before inference',
  async (wrong) => {
    const transport = jest
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          version: wrong === 'version' ? 'PRIVATE' : profile.version,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          models: [
            {
              name: profile.model,
              digest: wrong === 'digest' ? 'PRIVATE' : profile.digest,
            },
          ],
        }),
      );
    const boundary = fake();
    boundary.prepare.mockImplementation(() =>
      investigationPreflight(transport),
    );
    const report = await runInvestigation(boundary);
    expect(report.code).toBe('CONTEXT_UNVERIFIED');
    expect(
      report.cases.every(
        (row) => row.status === 'NOT_RUN' && row.elapsedMs === null,
      ),
    ).toBe(true);
    expect(boundary.extract).not.toHaveBeenCalled();
    expect(boundary.close).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(report)).not.toContain('PRIVATE');
  },
);
test('metadata transport failure and oversized body fail closed without payloads', async () => {
  for (const transport of [
    jest.fn<typeof fetch>().mockRejectedValue(new Error('PRIVATE')),
    jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('PRIVATE'.repeat(200000))),
  ]) {
    await expect(investigationPreflight(transport)).rejects.toMatchObject({
      code: 'CONTEXT_UNVERIFIED',
    });
  }
});
test('preflight deadline aborts transport and clears timers', async () => {
  jest.useFakeTimers();
  const transport = jest
    .fn<typeof fetch>()
    .mockImplementation(
      (_url, init) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('PRIVATE')),
          ),
        ),
    );
  const pending = expect(
    investigationPreflight(transport),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(5000);
  await pending;
  expect(jest.getTimerCount()).toBe(0);
});
test('content rejection continues once, infrastructure failure stops, remaining cases NOT_RUN', async () => {
  const boundary = fake();
  boundary.extract
    .mockRejectedValueOnce({
      code: 'INVALID_EVIDENCE',
      diagnostic: {
        stage: 'EVIDENCE',
        rule: 'QUOTE_AMBIGUOUS',
        field: 'cv.skills[].name',
        quote: 'PRIVATE',
      },
    })
    .mockRejectedValueOnce(new LiveError('CONNECTION_FAILURE'));
  const report = await runInvestigation(boundary);
  expect(report.cases.map((r) => r.status)).toEqual([
    'REJECTED',
    'REJECTED',
    'NOT_RUN',
    'NOT_RUN',
  ]);
  expect(report.cases[0]?.diagnostic).toEqual({
    stage: 'EVIDENCE',
    rule: 'QUOTE_AMBIGUOUS',
    field: 'cv.skills[].name',
  });
  expect(report.code).toBe('CONNECTION_FAILURE');
  expect(boundary.extract).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
});
test('child stops independently after infrastructure failure', async () => {
  const extract = jest.fn(async () => {
    throw new LiveError('CONTEXT_UNVERIFIED');
  });
  const worker = investigationWorker(extract);
  expect(await worker(INVESTIGATION_IDS[0])).toMatchObject({
    code: 'CONTEXT_UNVERIFIED',
  });
  expect(await worker(INVESTIGATION_IDS[1])).toMatchObject({
    code: 'INVALID_INPUT',
  });
  expect(extract).toHaveBeenCalledTimes(1);
});
test('all validation rules and AI diagnostic tokens survive explicit allowlisting', () => {
  for (const [rule, stage] of Object.entries(EXTRACTION_DIAGNOSTIC_RULES)) {
    const code = stage === 'OUTPUT' ? 'INVALID_OUTPUT' : 'INVALID_EVIDENCE';
    expect(
      investigationError({
        code,
        diagnostic: { stage, rule, field: 'cv.name', extra: 'PRIVATE' },
      }).diagnostic,
    ).toEqual({ stage, rule, field: 'cv.name' });
  }
  expect(
    investigationError({
      code: 'INVALID_JSON',
      diagnostic: {
        stage: 'AI_DECODE',
        rule: 'JSON_INVALID',
        field: 'output',
        extra: 'PRIVATE',
      },
    }).diagnostic,
  ).toEqual({ stage: 'AI_DECODE', rule: 'JSON_INVALID', field: 'output' });
  expect(
    investigationError({
      code: 'SCHEMA_VALIDATION_FAILURE',
      diagnostic: {
        stage: 'AI_SCHEMA',
        rule: 'SCHEMA_MISMATCH',
        field: 'output',
      },
    }).diagnostic,
  ).toEqual({ stage: 'AI_SCHEMA', rule: 'SCHEMA_MISMATCH', field: 'output' });
});
test.each([
  null,
  'PRIVATE',
  { stage: 'EVIDENCE', rule: 'PRIVATE', field: 'cv.name' },
  {
    stage: 'EVIDENCE',
    rule: 'QUOTE_NOT_FOUND',
    field: 'cv.skills[123].PRIVATE',
  },
  { stage: 'OUTPUT', rule: 'QUOTE_NOT_FOUND', field: 'cv.name' },
  {
    get stage() {
      throw new Error('PRIVATE');
    },
  },
  { stage: 'AI_DECODE', rule: 'JSON_INVALID', field: 'output' },
])('malformed diagnostic is dropped %#', (diagnostic) => {
  expect(
    investigationError({
      code: 'INVALID_EVIDENCE',
      diagnostic,
      message: 'PRIVATE',
    }).diagnostic,
  ).toBeNull();
});
test('unknown code and private accessor messages cannot enter reports', async () => {
  const boundary = fake();
  boundary.extract.mockRejectedValueOnce({
    get code() {
      throw new Error('PRIVATE');
    },
    message: 'PRIVATE',
  });
  const report = await runInvestigation(boundary);
  expect(report.code).toBe('UNEXPECTED_FAILURE');
  expect(JSON.stringify(report)).not.toContain('PRIVATE');
});
test('interruption before work leaves all cases NOT_RUN and closes', async () => {
  const controller = new AbortController();
  controller.abort();
  const boundary = fake();
  const report = await runInvestigation(boundary, {
    signal: controller.signal,
  });
  expect(report.code).toBe('INTERRUPTED');
  expect(report.cases.every((r) => r.status === 'NOT_RUN')).toBe(true);
  expect(boundary.extract).not.toHaveBeenCalled();
  expect(boundary.close).toHaveBeenCalledTimes(1);
});
test.each(['interrupt', 'deadline'])(
  '%s during extraction rejects active case, skips remainder and cleans up',
  async (kind) => {
    jest.useFakeTimers();
    const boundary = fake();
    boundary.extract.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = runInvestigation(boundary, { signal: controller.signal });
    await Promise.resolve();
    if (kind === 'interrupt') controller.abort();
    else await jest.advanceTimersByTimeAsync(LIVE_DEADLINE_MS);
    const report = await pending;
    expect(report.cases.map((r) => r.status)).toEqual([
      'REJECTED',
      'NOT_RUN',
      'NOT_RUN',
      'NOT_RUN',
    ]);
    expect(report.code).toBe(
      kind === 'interrupt' ? 'INTERRUPTED' : 'OUTER_DEADLINE',
    );
    expect(boundary.close).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);
test('cleanup failures remain observable without changing case outcomes', async () => {
  const boundary = fake();
  boundary.close.mockRejectedValue(new Error('PRIVATE'));
  const report = await runInvestigation(boundary);
  expect(report.code).toBe('CLEANUP_FAILURE');
  expect(report.cases.every((r) => r.status === 'RETURNED')).toBe(true);
});
test.each([Number.NaN, Infinity, -100, LIVE_DEADLINE_MS * 2])(
  'elapsed times are bounded for %s',
  async (elapsed) => {
    let count = 0;
    const report = await runInvestigation(fake(), {
      now: () => (count++ % 2 === 0 ? 0 : elapsed),
    });
    expect(report.cases[0]?.elapsedMs).toBe(
      Number.isFinite(elapsed)
        ? Math.min(LIVE_DEADLINE_MS, Math.max(0, elapsed))
        : null,
    );
  },
);
class FakeChild extends EventEmitter {
  connected = true;
  sent: unknown[] = [];
  killed: string[] = [];
  graceful = true;
  send(message: unknown, callback?: (error: Error | null) => void) {
    this.sent.push(message);
    callback?.(null);
    if ((message as { type: string }).type === 'close' && this.graceful)
      queueMicrotask(() => this.finish());
    return true;
  }
  kill(value: string) {
    this.killed.push(value);
    queueMicrotask(() => this.finish());
    return true;
  }
  finish() {
    this.connected = false;
    this.emit('exit', 0);
  }
}
test('parent independently refuses duplicate/fifth calls and strips IPC diagnostics', async () => {
  const child = new FakeChild();
  const boundary = superviseInvestigation(child as unknown as ChildProcess);
  child.emit('message', { type: 'ready' });
  for (const id of INVESTIGATION_IDS) {
    const pending = boundary.extract(id, signal());
    await Promise.resolve();
    child.emit('message', {
      type: 'error',
      code: 'INVALID_EVIDENCE',
      diagnostic: {
        stage: 'EVIDENCE',
        rule: 'QUOTE_NOT_FOUND',
        field: 'cv.name',
        source: 'PRIVATE',
      },
    });
    await expect(pending).rejects.toMatchObject({
      code: 'INVALID_EVIDENCE',
      diagnostic: {
        stage: 'EVIDENCE',
        rule: 'QUOTE_NOT_FOUND',
        field: 'cv.name',
      },
    });
    await expect(boundary.extract(id, signal())).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  }
  expect(child.sent).toHaveLength(4);
  await boundary.close();
  expect(JSON.stringify(child.sent)).not.toContain('PRIVATE');
});
test('parent refuses successful extraction payload instead of forwarding content', async () => {
  const child = new FakeChild();
  const boundary = superviseInvestigation(child as unknown as ChildProcess);
  child.emit('message', { type: 'ready' });
  const pending = boundary.extract(INVESTIGATION_IDS[0], signal());
  await Promise.resolve();
  child.emit('message', {
    type: 'result',
    id: INVESTIGATION_IDS[0],
    result: { source: 'PRIVATE' },
  });
  await expect(pending).rejects.toMatchObject({ code: 'UNEXPECTED_FAILURE' });
  await boundary.close();
});
test('supervisor interruption during preflight kills child and preserves NOT_RUN', async () => {
  const child = new FakeChild();
  const boundary = superviseInvestigation(child as unknown as ChildProcess);
  const controller = new AbortController();
  const pending = runInvestigation(boundary, { signal: controller.signal });
  controller.abort();
  const report = await pending;
  expect(report.code).toBe('INTERRUPTED');
  expect(report.cases.every((r) => r.status === 'NOT_RUN')).toBe(true);
  expect(child.killed).toContain('SIGKILL');
});
test('supervisor forced cleanup fails observably', async () => {
  jest.useFakeTimers();
  const child = new FakeChild();
  child.graceful = false;
  const boundary = superviseInvestigation(child as unknown as ChildProcess, 5);
  child.emit('message', { type: 'ready' });
  const pending = expect(boundary.close()).rejects.toMatchObject({
    code: 'CLEANUP_FAILURE',
  });
  await jest.advanceTimersByTimeAsync(5);
  await pending;
  expect(child.killed).toEqual(['SIGKILL']);
  expect(jest.getTimerCount()).toBe(0);
});

test('child rejects concurrent work and cannot start a second extraction', async () => {
  let finish!: () => void;
  const extract = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const worker = investigationWorker(extract);
  const first = worker(INVESTIGATION_IDS[0]);
  expect(await worker(INVESTIGATION_IDS[1])).toMatchObject({
    code: 'INVALID_INPUT',
  });
  expect(extract).toHaveBeenCalledTimes(1);
  finish();
  expect(await first).toEqual({
    type: 'result',
    id: INVESTIGATION_IDS[0],
    result: 'RETURNED',
  });
});
test('parent prevents concurrent work even before child readiness', async () => {
  const child = new FakeChild();
  const boundary = superviseInvestigation(child as unknown as ChildProcess);
  const first = boundary.extract(INVESTIGATION_IDS[0], signal());
  await expect(
    boundary.extract(INVESTIGATION_IDS[1], signal()),
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  child.emit('message', { type: 'ready' });
  await Promise.resolve();
  child.emit('message', {
    type: 'result',
    id: INVESTIGATION_IDS[0],
    result: 'RETURNED',
  });
  await expect(first).resolves.toBe('RETURNED');
  expect(child.sent).toHaveLength(1);
  await boundary.close();
});
test('worker-to-supervisor-to-report pipeline contains only fixed tokens', async () => {
  const child = new FakeChild();
  const worker = investigationWorker(async (id) => {
    if (id === 'jd-negation')
      throw {
        code: 'INVALID_OUTPUT',
        message: 'PRIVATE',
        diagnostic: {
          stage: 'OUTPUT',
          rule: 'REQUIRED_COLLECTION_VALUE_NULL',
          field: 'jd.requirements[].text',
          model: 'PRIVATE',
        },
      };
    return { source: 'PRIVATE', prompt: 'PRIVATE', filename: 'PRIVATE' };
  });
  const original = child.send.bind(child);
  const outgoing: unknown[] = [];
  child.send = (message, callback) => {
    original(message, callback);
    const value = message as { type: string; id: string };
    if (value.type === 'extract')
      void worker(value.id).then((response) => {
        outgoing.push(response);
        child.emit('message', response);
      });
    return true;
  };
  const boundary = superviseInvestigation(child as unknown as ChildProcess);
  child.emit('message', { type: 'ready' });
  const report = await runInvestigation(boundary);
  expect(report.cases.map((r) => r.status)).toEqual([
    'RETURNED',
    'RETURNED',
    'RETURNED',
    'REJECTED',
  ]);
  expect(report.cases[3]?.diagnostic).toEqual({
    stage: 'OUTPUT',
    rule: 'REQUIRED_COLLECTION_VALUE_NULL',
    field: 'jd.requirements[].text',
  });
  expect(JSON.stringify({ outgoing, report })).not.toContain('PRIVATE');
  expect(outgoing).toHaveLength(4);
  for (const row of report.cases)
    expect(Object.keys(row).sort()).toEqual([
      'code',
      'diagnostic',
      'elapsedMs',
      'id',
      'status',
    ]);
  expect(Object.keys(report).sort()).toEqual(['cases', 'code']);
});
