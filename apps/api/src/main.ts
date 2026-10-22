import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { validateEnvironment } from './config/environment.js';
import { createValidationPipe } from './config/validation.js';

async function bootstrap(): Promise<void> {
  const { port } = validateEnvironment();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
  await app.listen(port, '127.0.0.1');
}

bootstrap().catch((error: unknown) => {
  Logger.error(
    error instanceof Error ? error.message : 'API startup failed',
    'Bootstrap',
  );
  process.exitCode = 1;
});
