export const AI_CONFIG = Symbol('AI_CONFIG');
export interface AiConfig {
  readonly provider: 'ollama';
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  if ((env.AI_PROVIDER ?? 'ollama') !== 'ollama') {
    throw new Error('AI_PROVIDER must be ollama');
  }
  let url: URL;
  try {
    url = new URL(env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new Error(
      'OLLAMA_BASE_URL must be an HTTP(S) origin without credentials, path, query or fragment',
    );
  }
  const model = env.OLLAMA_MODEL ?? 'qwen3:4b';
  if (!model.trim() || model !== model.trim() || /\s/.test(model)) {
    throw new Error(
      'OLLAMA_MODEL must be a nonempty model name without whitespace',
    );
  }
  const timeout = env.AI_REQUEST_TIMEOUT_MS ?? '120000';
  if (
    !/^\d+$/.test(timeout) ||
    Number(timeout) < 1000 ||
    Number(timeout) > 300000
  ) {
    throw new Error(
      'AI_REQUEST_TIMEOUT_MS must be an integer between 1000 and 300000',
    );
  }
  return {
    provider: 'ollama',
    baseUrl: url.origin,
    model,
    timeoutMs: Number(timeout),
  };
}
