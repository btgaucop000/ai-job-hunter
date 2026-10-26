import { afterEach, expect, jest, test } from '@jest/globals';
import { EventEmitter, once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { DocumentParser } from '../../src/extraction/document-parser.js';
import { EXTRACTION_LIMITS as limits } from '../../src/extraction/extraction.limits.js';
import { pdfInput } from '../support/pdf-fixtures.js';
import { docxInput } from '../support/docx-fixtures.js';

class FakeWorker extends EventEmitter {
  terminate = jest.fn<() => Promise<number>>(() => new Promise(() => {}));
  stdout = { resume: jest.fn() };
  stderr = { resume: jest.fn() };
  asWorker() {
    return this as unknown as Worker;
  }
}
const success = {
  version: 1,
  ok: true,
  result: {
    source: {
      format: 'pdf',
      text: 'Synthetic',
      segments: [{ id: 'page-1', start: 0, end: 9, page: 1 }],
    },
    pageCount: 1,
    warnings: [{ code: 'IMAGE_CONTENT_NOT_INTERPRETED' }],
  },
};
afterEach(() => {
  jest.useRealTimers();
});

test('holds active slot and successful result until exit, then recovers', async () => {
  const workers = [new FakeWorker(), new FakeWorker()];
  let next = 0;
  const parser = new DocumentParser(() => workers[next++]!.asWorker());
  let settled = false;
  const first = parser.parse(pdfInput()).then((value) => {
    settled = true;
    return value;
  });
  workers[0]!.emit('message', success);
  await Promise.resolve();
  expect(settled).toBe(false);
  await expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSER_BUSY',
  });
  workers[0]!.emit('exit', 1);
  expect((await first).source.text).toBe('Synthetic');
  const second = parser.parse(pdfInput());
  workers[1]!.emit('message', success);
  workers[1]!.emit('exit', 0);
  await expect(second).resolves.toMatchObject({ pageCount: 1 });
  await parser.close();
});
test('fulfilled terminate confirms exit without an exit event', async () => {
  const worker = new FakeWorker();
  worker.terminate.mockResolvedValue(1);
  const parser = new DocumentParser(() => worker.asWorker());
  const pending = parser.parse(pdfInput());
  worker.emit('message', success);
  await expect(pending).resolves.toMatchObject({ pageCount: 1 });
  await parser.close();
});
test('timeout rejects promptly, ignores late messages and holds slot until termination', async () => {
  jest.useFakeTimers();
  const worker = new FakeWorker();
  const parser = new DocumentParser(() => worker.asWorker());
  const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSING_TIMEOUT',
  });
  await jest.advanceTimersByTimeAsync(limits.parserTimeoutMs);
  await pending;
  worker.emit('message', success);
  await expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSER_BUSY',
  });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  worker.emit('exit', 1);
  await parser.close();
  expect(jest.getTimerCount()).toBe(0);
});
test.each(['reject', 'throw', 'never'] as const)(
  'fails closed when termination %s',
  async (mode) => {
    jest.useFakeTimers();
    const worker = new FakeWorker();
    if (mode === 'reject')
      worker.terminate.mockRejectedValue(new Error('private'));
    if (mode === 'throw')
      worker.terminate.mockImplementation(() => {
        throw new Error('private');
      });
    const parser = new DocumentParser(() => worker.asWorker());
    const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
      code: 'PARSER_UNAVAILABLE',
    });
    worker.emit('message', success);
    await jest.advanceTimersByTimeAsync(limits.parserTerminationMs);
    await pending;
    worker.emit('exit', 1); // No reopening even if termination is observed after the grace period.
    await expect(parser.parse(pdfInput())).rejects.toMatchObject({
      code: 'PARSER_UNAVAILABLE',
    });
    await expect(parser.close()).rejects.toMatchObject({
      code: 'PARSER_UNAVAILABLE',
    });
    expect(jest.getTimerCount()).toBe(0);
  },
);
test.each(['error', 'messageerror', 'exit', 'malformed'] as const)(
  'sanitizes %s and recovers after observed exit',
  async (mode) => {
    const workers = [new FakeWorker(), new FakeWorker()];
    let next = 0;
    const parser = new DocumentParser(() => workers[next++]!.asWorker());
    const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
      code: 'PARSING_FAILED',
      message: 'Document parsing failed',
    });
    if (mode === 'malformed')
      workers[0]!.emit('message', { private: 'secret' });
    else if (mode !== 'exit') workers[0]!.emit(mode, new Error('private'));
    workers[0]!.emit('exit', 1);
    await pending;
    const second = parser.parse(pdfInput());
    workers[1]!.emit('message', success);
    workers[1]!.emit('exit', 0);
    await expect(second).resolves.toMatchObject({ pageCount: 1 });
    await parser.close();
  },
);
test('constructor failure releases admission and clears timers', async () => {
  jest.useFakeTimers();
  const worker = new FakeWorker();
  let calls = 0;
  const parser = new DocumentParser(() => {
    if (++calls === 1) throw new Error('private');
    return worker.asWorker();
  });
  await expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSING_FAILED',
  });
  const second = parser.parse(pdfInput());
  worker.emit('message', success);
  worker.emit('exit', 0);
  await second;
  await parser.close();
  expect(jest.getTimerCount()).toBe(0);
});
test('shutdown rejects active call, waits for termination and permanently closes admission', async () => {
  const worker = new FakeWorker();
  const parser = new DocumentParser(() => worker.asWorker());
  const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
  let closed = false;
  const closing = parser.onModuleDestroy().then(() => {
    closed = true;
  });
  await pending;
  expect(closed).toBe(false);
  await expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
  worker.emit('exit', 1);
  await closing;
  await parser.close();
});
test('duplicate terminal messages do not overwrite the first result', async () => {
  const worker = new FakeWorker();
  const parser = new DocumentParser(() => worker.asWorker());
  const pending = parser.parse(pdfInput());
  worker.emit('message', success);
  worker.emit('message', { version: 1, ok: false, code: 'PARSING_FAILED' });
  worker.emit('exit', 1);
  await expect(pending).resolves.toMatchObject({ pageCount: 1 });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  await parser.close();
});
test.each([
  { kind: 'PDF', input: pdfInput, expected: 'Synthetic PDF' },
  { kind: 'DOCX', input: docxInput, expected: 'Synthetic 😀 CV\n\n' },
])(
  'terminates a real blocked $kind worker at deadline and recovers',
  async ({ input, expected }) => {
    jest.useFakeTimers();
    let stalled: Worker | undefined;
    let first = true;
    const parser = new DocumentParser((url, options) => {
      if (!first) return new Worker(url, options);
      first = false;
      stalled = new Worker(
        new URL('../support/parser-workers/blocking.js', import.meta.url),
        options,
      );
      return stalled;
    });
    try {
      const pending = expect(parser.parse(input())).rejects.toMatchObject({
        code: 'PARSING_TIMEOUT',
      });
      await once(stalled!, 'online');
      const exited = once(stalled!, 'exit');
      await jest.advanceTimersByTimeAsync(limits.parserTimeoutMs);
      await pending;
      await exited;
      jest.useRealTimers();
      expect((await parser.parse(input())).source.text).toBe(expected);
    } finally {
      await parser.close();
    }
  },
);

test('waitForIdle waits past timeout for confirmed cleanup and permits recovery', async () => {
  jest.useFakeTimers();
  const worker = new FakeWorker();
  const parser = new DocumentParser(() => worker.asWorker());
  await parser.waitForIdle();
  const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSING_TIMEOUT',
  });
  await jest.advanceTimersByTimeAsync(limits.parserTimeoutMs);
  await pending;
  let idle = false;
  const waiting = parser.waitForIdle().then(() => {
    idle = true;
  });
  await Promise.resolve();
  expect(idle).toBe(false);
  worker.emit('exit', 1);
  await waiting;
  const recovered = parser.parse(pdfInput());
  worker.emit('message', success);
  worker.emit('exit', 0);
  await recovered;
  await parser.waitForIdle();
  await parser.close();
  await expect(parser.waitForIdle()).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
});
test('waitForIdle exposes permanent unavailability even after late exit', async () => {
  jest.useFakeTimers();
  const worker = new FakeWorker();
  const parser = new DocumentParser(() => worker.asWorker());
  const pending = expect(parser.parse(pdfInput())).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
  const waiting = expect(parser.waitForIdle()).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
  worker.emit('message', success);
  await jest.advanceTimersByTimeAsync(limits.parserTerminationMs);
  await pending;
  await waiting;
  worker.emit('exit', 1);
  await expect(parser.waitForIdle()).rejects.toMatchObject({
    code: 'PARSER_UNAVAILABLE',
  });
});

test('waitForIdle does not stop a healthy worker and observes terminate fulfillment', async () => {
  const worker = new FakeWorker();
  let finish!: (code: number) => void;
  worker.terminate.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const parser = new DocumentParser(() => worker.asWorker());
  const parsing = parser.parse(pdfInput());
  let idle = false;
  const waiting = parser.waitForIdle().then(() => {
    idle = true;
  });
  expect(worker.terminate).not.toHaveBeenCalled();
  worker.emit('message', success);
  await Promise.resolve();
  expect(idle).toBe(false);
  finish(1);
  await parsing;
  await waiting;
  await parser.close();
});
