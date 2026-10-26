import { Inject, Injectable } from '@nestjs/common';
import { AI_CONFIG } from './ai.config.js';
import type { AiConfig } from './ai.config.js';
import type { AiProvider, GenerationRequest } from './ai-provider.js';
import { AiError } from './ai.errors.js';

import {
  OLLAMA_CONTEXT_PROFILE as profile,
  verifyProfile,
  verifyAllocation,
  validateGeneration,
} from './ollama.context.js';

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
      if (this.config.model !== profile.model)
        throw new AiError('CONTEXT_UNVERIFIED');
      // Snapshot once: both passes must use the same prompt/schema/template behavior.
      const common = JSON.stringify({
        model: profile.model,
        prompt: request.prompt,
        stream: false,
        think: false,
        truncate: false,
        shift: false,
        format: request.schema,
      });
      const call = async (path: string, body?: string): Promise<unknown> => {
        if (timedOut) throw new AiError('TIMEOUT');
        const response = await fetch(`${this.config.baseUrl}${path}`, {
          method: body === undefined ? 'GET' : 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (timedOut) throw new AiError('TIMEOUT');
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new AiError('UPSTREAM_HTTP_FAILURE');
        }
        if (!response.body) throw new AiError('MALFORMED_RESPONSE');
        reader = response.body.getReader();
        readerCancelled = false;
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (timedOut) throw new AiError('TIMEOUT');
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES)
            throw new AiError('RESPONSE_TOO_LARGE');
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
        reader.releaseLock();
        reader = undefined;
        return envelope;
      };
      verifyProfile(await call('/api/version'), await call('/api/tags'));
      const generate = (numPredict: number) =>
        call(
          '/api/generate',
          JSON.stringify({
            ...JSON.parse(common),
            options: {
              num_ctx: profile.contextTokens,
              num_predict: numPredict,
              temperature: 0,
            },
          }),
        );
      const measured = validateGeneration(await generate(1), true);
      await call('/api/ps').then(verifyAllocation);
      const generated = validateGeneration(
        await generate(profile.outputTokens),
        false,
      );
      if (generated.promptTokens !== measured.promptTokens)
        throw new AiError('CONTEXT_UNVERIFIED');
      // Snapshot checks are evidence, not an atomic lock on the local daemon.
      await call('/api/ps').then(verifyAllocation);
      return generated.text;
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
