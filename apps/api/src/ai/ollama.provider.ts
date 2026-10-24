import { Inject, Injectable } from '@nestjs/common';
import { AI_CONFIG } from './ai.config.js';
import type { AiConfig } from './ai.config.js';
import type { AiProvider, GenerationRequest } from './ai-provider.js';
import { AiError } from './ai.errors.js';

export const MAX_RESPONSE_BYTES = 1024 * 1024;

@Injectable()
export class OllamaProvider implements AiProvider {
  constructor(@Inject(AI_CONFIG) private readonly config: AiConfig) {}

  async generate(request: GenerationRequest): Promise<string> {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timedOut = false;
    let readerCancelled = false;
    const cancelReader = (): void => {
      if (!reader || readerCancelled) return;
      readerCancelled = true;
      // Do not await: an underlying source's cancellation may never settle.
      // Handle rejection immediately so cleanup cannot leak an unhandled rejection.
      void reader.cancel().catch(() => {});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      cancelReader();
    }, this.config.timeoutMs);
    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          prompt: request.prompt,
          stream: false,
          think: false,
          format: request.schema,
        }),
      });
      if (!response.ok) throw new AiError('UPSTREAM_HTTP_FAILURE');
      if (!response.body) throw new AiError('MALFORMED_RESPONSE');
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (timedOut) throw new AiError('TIMEOUT');
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new AiError('RESPONSE_TOO_LARGE');
        chunks.push(value);
      }
      let envelope: unknown;
      try {
        envelope = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        );
      } catch {
        throw new AiError('MALFORMED_RESPONSE');
      }
      if (
        !envelope ||
        typeof envelope !== 'object' ||
        !('response' in envelope) ||
        typeof envelope.response !== 'string' ||
        !('done' in envelope) ||
        envelope.done !== true ||
        'error' in envelope ||
        ('done_reason' in envelope && envelope.done_reason !== 'stop')
      ) {
        throw new AiError('MALFORMED_RESPONSE');
      }
      return envelope.response;
    } catch (error: unknown) {
      if (timedOut) throw new AiError('TIMEOUT');
      if (error instanceof AiError) throw error;
      throw new AiError('CONNECTION_FAILURE');
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) {
        cancelReader();
        // The read has settled before finally; cancellation completion is not required.
        reader.releaseLock();
      }
    }
  }
}
