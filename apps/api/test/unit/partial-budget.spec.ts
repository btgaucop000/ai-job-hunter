import 'reflect-metadata';
import { afterEach, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { OllamaProvider } from '../../src/ai/ollama.provider.js';
import { AiService } from '../../src/ai/ai.service.js';
import { aiConfig } from '../../src/ai/ai.config.js';
import { OLLAMA_CONTEXT_PROFILE as profile } from '../../src/ai/ollama.context.js';
import { PARTIAL_GENERATION_MAX_MS } from '../../src/ai/ai-provider.js';
import {
  AnalysisService,
  analysisTiming,
  PARTIAL_ANALYSIS_MAX_MS,
} from '../../src/analysis/analysis.service.js';
import { initialStages } from '../../src/analysis/analysis.contracts.js';
import type { AnalysisResponseDto } from '../../src/analysis/analysis.contracts.js';
import type { AnalysisRequest } from '../../src/analysis/analysis-http.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { ExtractionOwner } from '../../src/extraction/extraction.owner.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import { syntheticSource } from '../support/extraction-fixtures.js';

const config = aiConfig({ AI_REQUEST_TIMEOUT_MS: '300000' });
const input = { prompt: 'Synthetic only', schema: { type: 'object' } };
const model = {
  name: profile.model,
  digest: profile.digest,
  context_length: profile.contextTokens,
  runner: 'llamacpp',
};
const envelope = (response = '{"proposals":[]}', extra = {}) =>
  Response.json({
    model: profile.model,
    response,
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 20,
    prompt_eval_cached_count: 0,
    eval_count: 20,
    ...extra,
  });
function transport(generate: typeof fetch) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url, init) => {
      const parsed = new URL(String(url));
      expect(parsed.origin).toBe('http://127.0.0.1:11434');
      if (parsed.pathname === '/api/version')
        return Response.json({ version: profile.version });
      if (['/api/tags', '/api/ps'].includes(parsed.pathname))
        return Response.json({ models: [model] });
      if (parsed.pathname !== '/api/generate')
        throw new Error('Unexpected HTTP call');
      return generate(url, init);
    });
}
const partial = (
  signal = new AbortController().signal,
  deadline = performance.now() + PARTIAL_ANALYSIS_MAX_MS,
) => ({ ...input, partial: { signal, deadline } });
const generationCalls = (mock: ReturnType<typeof transport>) =>
  mock.mock.calls.filter(
    ([url]) => new URL(String(url)).pathname === '/api/generate',
  );
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('partial sends exactly one generation with no measurement and keeps context flags', async () => {
  const mock = transport(async () => envelope());
  await expect(new OllamaProvider(config).generate(partial())).resolves.toBe(
    '{"proposals":[]}',
  );
  expect(mock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(
    ['/api/version', '/api/tags', '/api/generate', '/api/ps'],
  );
  const body = JSON.parse(generationCalls(mock)[0]![1]!.body as string);
  expect(body).toMatchObject({
    model: profile.model,
    truncate: false,
    shift: false,
    think: false,
    options: { num_predict: 2048, num_ctx: 8192 },
  });
});
test.each([
  [
    'length',
    () => envelope('{}', { done_reason: 'length' }),
    'OUTPUT_LIMIT_EXCEEDED',
  ],
  [
    'context',
    () => envelope('{}', { prompt_eval_count: 6081 }),
    'CONTEXT_LIMIT_EXCEEDED',
  ],
  [
    'http',
    () => new Response('private', { status: 503 }),
    'UPSTREAM_HTTP_FAILURE',
  ],
  ['invalid JSON', () => envelope('not json'), 'INVALID_JSON'],
  ['schema', () => envelope('[]'), 'SCHEMA_VALIDATION_FAILURE'],
] as const)(
  'partial %s failure never repairs, retries or falls back',
  async (_name, response, code) => {
    const mock = transport(async () => response());
    const service = new AiService(new OllamaProvider(config));
    await expect(service.generateStructured(partial())).rejects.toMatchObject({
      code,
    });
    expect(generationCalls(mock)).toHaveLength(1);
  },
);
test('90-second cap aborts generation even if the transport ignores cancellation', async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | undefined;
  const mock = transport(async (_url, init) => {
    signal = init!.signal!;
    return new Promise<Response>(() => {});
  });
  const assertion = expect(
    new OllamaProvider(config).generate(partial()),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(PARTIAL_GENERATION_MAX_MS - 1);
  expect(signal!.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await assertion;
  expect(signal!.aborted).toBe(true);
  expect(generationCalls(mock)).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});
test('shared deadline shortens a generation and cancels stalled response reading', async () => {
  jest.useFakeTimers();
  const cancel = jest.fn<() => void>();
  const mock = transport(
    async () => new Response(new ReadableStream({ cancel })),
  );
  const assertion = expect(
    new OllamaProvider(config).generate(
      partial(undefined, performance.now() + 2000),
    ),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(2000);
  await assertion;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(generationCalls(mock)[0]![1]!.signal!.aborted).toBe(true);
  expect(generationCalls(mock)).toHaveLength(1);
});
test('parent cancellation aborts the current HTTP request without retry', async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  const mock = transport(async () => new Promise<Response>(() => {}));
  const assertion = expect(
    new OllamaProvider(config).generate(partial(controller.signal)),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(0);
  controller.abort();
  await assertion;
  expect(generationCalls(mock)[0]![1]!.signal!.aborted).toBe(true);
  expect(generationCalls(mock)).toHaveLength(1);
  expect(jest.getTimerCount()).toBe(0);
});
test.each(['already expired', 'already aborted'])(
  '%s makes no HTTP request',
  async (scenario) => {
    const controller = new AbortController();
    if (scenario === 'already aborted') controller.abort();
    const mock = transport(async () => envelope());
    await expect(
      new OllamaProvider(config).generate(
        partial(
          controller.signal,
          scenario === 'already expired'
            ? performance.now() - 1
            : performance.now() + 180000,
        ),
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(mock).not.toHaveBeenCalled();
  },
);
test('metadata overhead is inside the 90-second cap and never triggers generation after expiry', async () => {
  jest.useFakeTimers();
  const mock = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Promise<Response>(() => {}));
  const assertion = expect(
    new OllamaProvider(config).generate(partial()),
  ).rejects.toMatchObject({ code: 'TIMEOUT' });
  await jest.advanceTimersByTimeAsync(90000);
  await assertion;
  expect(mock).toHaveBeenCalledTimes(1);
  expect(mock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
});

// Exercise admission → upload → parsing → extraction → real provider, with fake
// HTTP only. The fake monotonic clock makes all deadlines deterministic.
function operation(parseMs = 0) {
  const extraction = new ExtractionService(
    new AiService(new OllamaProvider(config)),
    new ExtractionOwner({
      parse: async () => {
        if (parseMs)
          await new Promise<void>((resolve) => setTimeout(resolve, parseMs));
        return {
          source: syntheticSource('TypeScript'),
          pageCount: 1,
          warnings: [],
        };
      },
      waitForIdle: async () => {},
      close: async () => {},
    }),
  );
  const matching = new MatchingService();
  const match = jest.spyOn(matching, 'match');
  const analysis = new AnalysisService(
    extraction,
    matching,
    analysisTiming(config),
  );
  const stream = new PassThrough();
  const boundary = 'budget-test';
  const socket = Object.assign(new EventEmitter(), {
    destroyed: false,
    end: () => {},
    destroy: () => {},
  });
  const req = Object.assign(stream, {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    rawHeaders: [],
    complete: true,
    aborted: false,
    socket,
    analysis: {
      requestId: '00000000-0000-4000-8000-000000000004',
      stages: initialStages(),
      partialOnly: true,
    },
  }) as unknown as AnalysisRequest;
  let response: AnalysisResponseDto | undefined;
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: () => {},
    end: (body: string) => {
      response = JSON.parse(body) as AnalysisResponseDto;
    },
  }) as unknown as ServerResponse;
  analysis.admit(req, res);
  const work = analysis.run(req, res);
  const upload = () =>
    stream.end(
      `--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="synthetic.pdf"\r\nContent-Type: application/pdf\r\n\r\nsynthetic\r\n--${boundary}\r\nContent-Disposition: form-data; name="jdText"\r\n\r\nTypeScript\r\n--${boundary}--\r\n`,
    );
  return { work, upload, match, response: () => response };
}
const proposals = (kind: 'cv' | 'jd') =>
  JSON.stringify({
    proposals: [
      {
        field: kind === 'cv' ? 'skills' : 'requirements',
        value: 'TypeScript',
        segmentId: kind === 'cv' ? 's1' : 'jd-1',
        quote: 'TypeScript',
      },
    ],
  });
test('production partial operation has a two-generation ceiling and no matching', async () => {
  const mock = transport(async () =>
    envelope(proposals(generationCalls(mock).length === 1 ? 'cv' : 'jd')),
  );
  const run = operation();
  run.upload();
  await run.work;
  const result = run.response()!;
  expect(result.outcome).toBe('PARTIAL');
  expect(result.documents!.cv!.partial!.fields.skills![0]!.status).toBe(
    'VALID',
  );
  expect(result.documents!.jd!.partial!.fields.requirements![0]!.status).toBe(
    'VALID',
  );
  expect(result.result).toBeNull();
  expect(generationCalls(mock)).toHaveLength(2);
  expect(run.match).not.toHaveBeenCalled();
});
test('overall deadline includes upload/parsing overhead, aborts JD and retains CV success', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  const mock = transport(async () => {
    if (generationCalls(mock).length === 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 80000));
      return envelope(proposals('cv'));
    }
    return new Promise<Response>(() => {});
  });
  const run = operation(20000);
  setTimeout(run.upload, 10000);
  await jest.advanceTimersByTimeAsync(179999);
  expect(run.response()).toBeUndefined();
  expect(generationCalls(mock)).toHaveLength(2);
  expect(generationCalls(mock)[1]![1]!.signal!.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  await run.work;
  const result = run.response()!;
  expect(performance.now()).toBe(PARTIAL_ANALYSIS_MAX_MS);
  expect(result.outcome).toBe('INCOMPLETE');
  expect(result.error).toMatchObject({ stage: 'JD', code: 'ANALYSIS_TIMEOUT' });
  expect(result.documents!.cv!.partial!.fields.skills![0]!.status).toBe(
    'VALID',
  );
  expect(result.documents!.cv!.text).toBe('TypeScript');
  expect(result.documents!.jd!.text).toBe('TypeScript');
  expect(result.result).toBeNull();
  expect(generationCalls(mock)[1]![1]!.signal!.aborted).toBe(true);
  await jest.advanceTimersByTimeAsync(60000);
  expect(generationCalls(mock)).toHaveLength(2);
  expect(run.match).not.toHaveBeenCalled();
});
test('per-call CV timeout permits only one JD call within the original shared budget', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  const mock = transport(async () =>
    generationCalls(mock).length === 1
      ? new Promise<Response>(() => {})
      : envelope(proposals('jd')),
  );
  const run = operation(20000);
  run.upload();
  await jest.advanceTimersByTimeAsync(110000);
  await run.work;
  const result = run.response()!;
  expect(result.outcome).toBe('PARTIAL');
  expect(result.documents!.cv!.partial!.generationError).toBe('TIMEOUT');
  expect(result.documents!.cv!.text).toBe('TypeScript');
  expect(result.documents!.jd!.partial!.fields.requirements![0]!.status).toBe(
    'VALID',
  );
  expect(result.result).toBeNull();
  expect(generationCalls(mock)).toHaveLength(2);
  expect(run.match).not.toHaveBeenCalled();
});
test('a parse that consumes the whole deadline never starts model generation', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  const mock = transport(async () => envelope());
  const run = operation(180000);
  run.upload();
  await jest.advanceTimersByTimeAsync(180000);
  await run.work;
  expect(run.response()!.outcome).toBe('INCOMPLETE');
  expect(run.response()!.documents!.jd!.text).toBe('TypeScript');
  expect(generationCalls(mock)).toHaveLength(0);
  expect(run.match).not.toHaveBeenCalled();
});
