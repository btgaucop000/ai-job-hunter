import { afterEach, expect, jest, test } from '@jest/globals';
import { OllamaProvider } from '../../src/ai/ollama.provider.js';
import { OLLAMA_CONTEXT_PROFILE as p } from '../../src/ai/ollama.context.js';
import { aiConfig } from '../../src/ai/ai.config.js';

const input = { prompt: 'Synthetic only', schema: { type: 'object' } };
const model = {
  name: p.model,
  digest: p.digest,
  context_length: p.contextTokens,
  runner: 'llamacpp',
};
const result = {
  model: p.model,
  response: '{}',
  done: true,
  done_reason: 'stop',
  prompt_eval_count: 6080,
  prompt_eval_cached_count: 6079,
  eval_count: 1,
};
function setup(overrides: Record<number, unknown> = {}) {
  const bodies: unknown[] = [
    { version: p.version },
    { models: [model] },
    { ...result, done_reason: 'length' },
    { models: [model] },
    result,
    { models: [model] },
  ];
  const mock = jest.spyOn(globalThis, 'fetch');
  for (let i = 0; i < bodies.length; i++)
    mock.mockResolvedValueOnce(
      Response.json(i in overrides ? overrides[i] : bodies[i]),
    );
  return mock;
}
const provider = () =>
  new OllamaProvider(aiConfig({ AI_REQUEST_TIMEOUT_MS: '1000' }));
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('admits exactly 6080, discards measurement length output, preserves both request bodies', async () => {
  const mock = setup({
    2: { ...result, response: 'discard private', done_reason: 'length' },
  });
  expect(await provider().generate(input)).toBe('{}');
  expect(mock.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(
    [
      '/api/version',
      '/api/tags',
      '/api/generate',
      '/api/ps',
      '/api/generate',
      '/api/ps',
    ],
  );
  const first = JSON.parse(mock.mock.calls[2]![1]!.body as string);
  const second = JSON.parse(mock.mock.calls[4]![1]!.body as string);
  expect(first).toEqual({
    ...second,
    options: { ...second.options, num_predict: 1 },
  });
  expect(second).toEqual({
    model: p.model,
    prompt: input.prompt,
    format: input.schema,
    stream: false,
    think: false,
    truncate: false,
    shift: false,
    options: { num_ctx: 8192, num_predict: 2048, temperature: 0 },
  });
  expect(new Set(mock.mock.calls.map(([, init]) => init!.signal)).size).toBe(1);
});
test.each([
  [0, {}, 'CONTEXT_UNVERIFIED'],
  [0, { version: '0.40.11' }, 'CONTEXT_UNVERIFIED'],
  [1, { models: [] }, 'CONTEXT_UNVERIFIED'],
  [1, { models: [{ ...model, digest: 'other' }] }, 'CONTEXT_UNVERIFIED'],
  [1, { models: [model, model] }, 'CONTEXT_UNVERIFIED'],
  [2, { ...result, prompt_eval_count: 6081 }, 'CONTEXT_LIMIT_EXCEEDED'],
  [2, { ...result, prompt_eval_count: 0 }, 'MALFORMED_RESPONSE'],
  [2, { ...result, prompt_eval_count: 1.5 }, 'MALFORMED_RESPONSE'],
  [2, { ...result, prompt_eval_count: '20' }, 'MALFORMED_RESPONSE'],
  [2, { ...result, prompt_eval_count: null }, 'MALFORMED_RESPONSE'],
  [2, { ...result, eval_count: 2 }, 'MALFORMED_RESPONSE'],
  [2, { ...result, prompt_eval_cached_count: 6081 }, 'MALFORMED_RESPONSE'],
  [2, { ...result, done_reason: 'unknown' }, 'MALFORMED_RESPONSE'],
  [2, { ...result, done: false }, 'MALFORMED_RESPONSE'],
  [2, { ...result, thinking: 'private' }, 'MALFORMED_RESPONSE'],
  [3, { models: [] }, 'CONTEXT_UNVERIFIED'],
  [3, { models: [{ ...model, context_length: 4096 }] }, 'CONTEXT_UNVERIFIED'],
  [3, { models: [{ ...model, digest: 'other' }] }, 'CONTEXT_UNVERIFIED'],
  [3, { models: [{ ...model, runner: 'other' }] }, 'CONTEXT_UNVERIFIED'],
  [4, { ...result, done_reason: 'length' }, 'OUTPUT_LIMIT_EXCEEDED'],
  [4, { ...result, done_reason: null }, 'MALFORMED_RESPONSE'],
  [
    4,
    { ...result, prompt_eval_count: 6079, prompt_eval_cached_count: 0 },
    'CONTEXT_UNVERIFIED',
  ],
  [4, { ...result, eval_count: 2049 }, 'MALFORMED_RESPONSE'],
  [4, { ...result, thinking: 'private' }, 'MALFORMED_RESPONSE'],
  [5, { models: [] }, 'CONTEXT_UNVERIFIED'],
] as const)('rejects invalid stage %s metadata', async (stage, body, code) => {
  const mock = setup({ [stage]: body });
  await expect(provider().generate(input)).rejects.toMatchObject({ code });
  if (stage < 4)
    expect(
      mock.mock.calls.filter(([url]) => String(url).endsWith('/api/generate')),
    ).toHaveLength(stage < 2 ? 0 : 1);
});
test.each([
  'model',
  'done',
  'done_reason',
  'response',
  'prompt_eval_count',
  'eval_count',
  'prompt_eval_cached_count',
])('requires %s in both passes', async (field) => {
  for (const stage of [2, 4]) {
    jest.restoreAllMocks();
    const incomplete: Record<string, unknown> = { ...result };
    delete incomplete[field];
    setup({ [stage]: incomplete });
    await expect(provider().generate(input)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  }
});
test('accepts measurement stop and final full output reservation', async () => {
  setup({ 2: result, 4: { ...result, eval_count: 2048 } });
  await expect(provider().generate(input)).resolves.toBe('{}');
});
test('rejects unsupported configured model before networking', async () => {
  const mock = jest.spyOn(globalThis, 'fetch');
  await expect(
    new OllamaProvider({ ...aiConfig({}), model: 'other' }).generate(input),
  ).rejects.toMatchObject({ code: 'CONTEXT_UNVERIFIED' });
  expect(mock).not.toHaveBeenCalled();
});
test('one deadline includes metadata, measurement and final generation', async () => {
  jest.useFakeTimers();
  let calls = 0;
  const bodies = [
    { version: p.version },
    { models: [model] },
    result,
    { models: [model] },
    result,
  ];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const i = calls++;
    if (i < 4) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Response.json(bodies[i]);
    }
    return new Promise((_resolve, reject) =>
      init!.signal!.addEventListener(
        'abort',
        () => reject(new Error('private')),
        { once: true },
      ),
    );
  });
  const check = expect(provider().generate(input)).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
  await jest.advanceTimersByTimeAsync(999);
  expect(calls).toBe(5);
  await jest.advanceTimersByTimeAsync(1);
  await check;
  expect(jest.getTimerCount()).toBe(0);
});

test.each([0, 2, 3, 5])(
  'deadline bounds stalled response body at stage %s',
  async (stage) => {
    jest.useFakeTimers();
    const mock = setup();
    mock.mockReset();
    const bodies = [
      { version: p.version },
      { models: [model] },
      result,
      { models: [model] },
      result,
    ];
    for (let i = 0; i < stage; i++)
      mock.mockResolvedValueOnce(Response.json(bodies[i]));
    const cancel = jest.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({ cancel });
    mock.mockResolvedValueOnce(new Response(body));
    const check = expect(provider().generate(input)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(1000);
    await check;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(body.locked).toBe(false);
    expect(mock).toHaveBeenCalledTimes(stage + 1);
  },
);
test('invalid evidence and provider payloads are not logged or exposed', async () => {
  const log = jest.spyOn(console, 'log');
  const warn = jest.spyOn(console, 'warn');
  const error = jest.spyOn(console, 'error');
  setup({
    2: { ...result, error: 'private payload', response: 'private output' },
  });
  await expect(provider().generate(input)).rejects.toMatchObject({
    code: 'MALFORMED_RESPONSE',
    message: 'AI provider returned a malformed response',
  });
  expect(log).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});
