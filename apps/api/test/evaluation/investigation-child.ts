import 'reflect-metadata';
import {
  investigationAllowed,
  investigationError,
} from './investigation-plan.js';
import { investigationPreflight } from './investigation-preflight.js';
import { investigationWorker } from './investigation-worker.js';
import { LOCAL_ENV } from './live-plan.js';
import { documents } from './datasets/v1/extraction.js';

if (
  !investigationAllowed(process.argv.slice(2), process.env) ||
  !process.send
) {
  process.exitCode = 1;
} else {
  Object.assign(process.env, LOCAL_ENV);
  process.on('disconnect', () => process.exit(process.exitCode ?? 0));
  const send = (message: unknown) => {
    if (process.connected) process.send?.(message);
  };
  let close: (() => Promise<void>) | undefined;
  try {
    // Must finish before constructing the extraction context or accepting work.
    await investigationPreflight();
    const { NestFactory } = await import('@nestjs/core');
    const { ExtractionModule } =
      await import('../../src/extraction/extraction.module.js');
    const { ExtractionService } =
      await import('../../src/extraction/extraction.service.js');
    const app = await NestFactory.createApplicationContext(ExtractionModule, {
      logger: false,
      abortOnError: false,
    });
    close = () => app.close();
    const service = app.get(ExtractionService);
    const worker = investigationWorker(async (id) => {
      const fixture = documents().find((item) => item.id === id)!;
      return fixture.input.kind === 'cv'
        ? service.extractCv(fixture.input.value)
        : service.extractJd(fixture.input.value);
    });
    let closing = false;
    process.on('message', async (message: unknown) => {
      if (
        !message ||
        typeof message !== 'object' ||
        !('type' in message) ||
        closing
      )
        return;
      if (message.type === 'close') {
        closing = true;
        try {
          await close?.();
        } catch {
          send({ type: 'error', code: 'CLEANUP_FAILURE' });
          process.exitCode = 1;
        }
        process.disconnect();
      } else if (message.type === 'extract' && 'id' in message) {
        send(await worker(message.id));
      }
    });
    send({ type: 'ready' });
  } catch (error) {
    const safe = investigationError(error);
    send({ type: 'error', code: safe.code, diagnostic: safe.diagnostic });
    await close?.().catch(() => {});
    process.disconnect();
  }
}
