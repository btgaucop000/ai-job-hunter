import { verifyProfile } from '../../src/ai/ollama.context.js';
import { MAX_RESPONSE_BYTES } from '../../src/ai/ollama.provider.js';
import { LOCAL_ENV } from './live-plan.js';
import { LiveError } from './live-errors.js';

// Metadata only. No generate, pull, daemon start, redirects or caller URL.
export async function investigationPreflight(
  transport: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const read = async (
      path: '/api/version' | '/api/tags',
    ): Promise<unknown> => {
      const response = await transport(`${LOCAL_ENV.OLLAMA_BASE_URL}${path}`, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw new LiveError('CONTEXT_UNVERIFIED');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES)
            throw new LiveError('RESPONSE_TOO_LARGE');
          chunks.push(value);
        }
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        );
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    };
    verifyProfile(await read('/api/version'), await read('/api/tags'));
  } catch {
    throw new LiveError(
      controller.signal.aborted ? 'TIMEOUT' : 'CONTEXT_UNVERIFIED',
    );
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
