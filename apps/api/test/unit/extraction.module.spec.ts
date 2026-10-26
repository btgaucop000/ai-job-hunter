import 'reflect-metadata';
import { afterEach, expect, jest, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { AiModule } from '../../src/ai/ai.module.js';
import { AI_PROVIDER } from '../../src/ai/ai-provider.js';
import { ExtractionModule } from '../../src/extraction/extraction.module.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import {
  EXTRACTION_OWNER,
  ExtractionOwner,
  extractionOwner,
} from '../../src/extraction/extraction.owner.js';
import { emptyJd } from '../support/extraction-fixtures.js';

afterEach(() => {
  jest.restoreAllMocks();
});
test('real module exports only service, initializes offline and reuses process owner', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch');
  expect(Reflect.getMetadata('exports', ExtractionModule)).toEqual([
    ExtractionService,
  ]);
  expect(Reflect.getMetadata('imports', ExtractionModule)).toEqual([AiModule]);
  const app = await Test.createTestingModule({
    imports: [ExtractionModule],
  }).compile();
  try {
    await app.init();
    expect(app.get(EXTRACTION_OWNER)).toBe(extractionOwner);
    expect(app.get(ExtractionService)).toBeInstanceOf(ExtractionService);
    expect(fetch).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
test('two Nest contexts share admission and close the parser exactly once', async () => {
  const parser = {
    parse: jest.fn<() => Promise<never>>(),
    waitForIdle: jest.fn<() => Promise<void>>().mockResolvedValue(),
    close: jest.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const owner = new ExtractionOwner(parser);
  let finish!: (value: string) => void;
  const generate = jest.fn<() => Promise<string>>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const make = () =>
    Test.createTestingModule({ imports: [ExtractionModule] })
      .overrideProvider(EXTRACTION_OWNER)
      .useValue(owner)
      .overrideProvider(AI_PROVIDER)
      .useValue({ generate })
      .compile();
  const first = await make();
  const second = await make();
  await first.init();
  await second.init();
  const pending = first.get(ExtractionService).extractJd({ text: 'Synthetic' });
  await expect(
    second.get(ExtractionService).extractJd({ text: 'Synthetic' }),
  ).rejects.toMatchObject({ code: 'EXTRACTION_BUSY' });
  finish(JSON.stringify(emptyJd()));
  await pending;
  await first.close();
  await second.close();
  expect(parser.close).toHaveBeenCalledTimes(1);
});
