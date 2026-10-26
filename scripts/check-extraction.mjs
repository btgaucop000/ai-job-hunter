// Run after pnpm build and API test:compile. Real production Nest module and
// parser workers; only the provider is synthetic. No database or Ollama needed.
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { ExtractionModule } from '../apps/api/dist/extraction/extraction.module.js';
import { ExtractionService } from '../apps/api/dist/extraction/extraction.service.js';
import { AI_PROVIDER } from '../apps/api/dist/ai/ai-provider.js';
import { pdfInput } from '../apps/api/.test-dist/test/support/pdf-fixtures.js';
import { docxInput } from '../apps/api/.test-dist/test/support/docx-fixtures.js';
import {
  emptyCv,
  emptyJd,
  quotedFact,
} from '../apps/api/.test-dist/test/support/extraction-fixtures.js';
const requireApi = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
requireApi('reflect-metadata');
const { Test } = requireApi('@nestjs/testing');
let app;
let passed;
let calls = 0;
try {
  app = await Test.createTestingModule({ imports: [ExtractionModule] })
    .overrideProvider(AI_PROVIDER)
    .useValue({
      generate: async ({ schema }) => {
        calls++;
        return JSON.stringify(
          'skills' in schema.properties
            ? emptyCv()
            : { ...emptyJd(), title: quotedFact('Engineer', 'jd-1') },
        );
      },
    })
    .compile();
  await app.init();
  const service = app.get(ExtractionService);
  const pdf = await service.extractCv(pdfInput());
  assert.equal(pdf.source.text, 'Synthetic PDF');
  assert.equal(pdf.kind, 'cv');
  const docx = await service.extractCv(docxInput());
  assert.equal(docx.source.text, 'Synthetic 😀 CV\n\n');
  assert.equal(docx.source.segments[0].page, null);
  const jd = await service.extractJd({ text: '😀 Engineer' });
  assert.equal(jd.data.title.evidence[0].start, 3);
  assert.ok(Object.isFrozen(jd.data.title.evidence[0]));
  assert.equal(calls, 3);
  assert.ok(
    jd.warnings.some((w) => w.code === 'EXTRACTION_COMPLETENESS_NOT_VERIFIED'),
  );
  await assert.rejects(
    service.extractCv(
      pdfInput(new Uint8Array(Buffer.from('%PDF-1.4 invalid'))),
    ),
    { code: 'PARSING_FAILED' },
  );
  assert.equal((await service.extractJd({ text: 'Engineer' })).kind, 'jd');
  await app.close();
  await assert.rejects(service.extractJd({ text: 'Engineer' }), {
    code: 'EXTRACTION_UNAVAILABLE',
  });
  passed = true;
} catch {
  // Never print assertion diagnostics or source/model output.
  passed = false;
} finally {
  try {
    await app?.close();
  } catch {
    passed = false;
  }
}
console.log(
  `Production extraction Nest module ${passed ? 'PASS' : 'FAIL'}: PDF/DOCX workers, mocked AI, JD evidence, immutability, recovery and shutdown`,
);
if (!passed) process.exitCode = 1;
