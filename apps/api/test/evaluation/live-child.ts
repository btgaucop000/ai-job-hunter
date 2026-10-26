import 'reflect-metadata';
import { refusal, LOCAL_ENV } from './live-plan.js';
import { documents } from './datasets/v1/extraction.js';
import { errorCode } from './live-errors.js';

// Direct invocation cannot silently bypass the parent opt-in/CI gate.
if (refusal(process.argv.slice(2), process.env) || !process.send) {
  process.exitCode = 1;
} else {
  Object.assign(process.env, LOCAL_ENV);
  const { NestFactory } = await import('@nestjs/core');
  const { ExtractionModule } =
    await import('../../src/extraction/extraction.module.js');
  const { ExtractionService } =
    await import('../../src/extraction/extraction.service.js');
  let app:
    | Awaited<ReturnType<typeof NestFactory.createApplicationContext>>
    | undefined;
  let busy = false;
  let calls = 0;
  const send = (message: unknown) => {
    if (process.connected) process.send?.(message);
  };
  try {
    app = await NestFactory.createApplicationContext(ExtractionModule, {
      logger: false,
      abortOnError: false,
    });
    const service = app.get(ExtractionService);
    process.on('message', async (message: unknown) => {
      if (!message || typeof message !== 'object' || !('type' in message))
        return;
      if (message.type === 'close') {
        try {
          await app?.close();
        } catch {
          send({ type: 'error', code: 'CLEANUP_FAILURE' });
          process.exitCode = 1;
        }
        process.disconnect();
        return;
      }
      if (message.type !== 'extract' || !('id' in message)) return;
      const fixture = documents().find((d) => d.id === message.id);
      if (busy || calls >= 18 || !fixture) {
        send({ type: 'error', code: 'INVALID_INPUT' });
        return;
      }
      busy = true;
      calls++;
      try {
        const result =
          fixture.input.kind === 'cv'
            ? await service.extractCv(fixture.input.value)
            : await service.extractJd(fixture.input.value);
        send({ type: 'result', id: fixture.id, result });
      } catch (error) {
        send({ type: 'error', code: errorCode(error) });
      } finally {
        busy = false;
      }
    });
    // An unexpectedly lost parent must not leave parser/provider work orphaned.
    process.on('disconnect', () => process.exit(process.exitCode ?? 0));
    send({ type: 'ready' });
  } catch {
    send({ type: 'error', code: 'SETUP_FAILURE' });
    await app?.close().catch(() => {});
    process.disconnect();
  }
}
