// Run after pnpm build and API test:compile. Uses the production parser/worker,
// with only synthetic fixture construction imported from compiled test support.
import { DocumentParser } from '../apps/api/dist/extraction/document-parser.js';
import {
  pdfFixture,
  pdfInput,
} from '../apps/api/.test-dist/test/support/pdf-fixtures.js';
import { strict as assert } from 'node:assert';
import {
  docxInput,
  docxEntries,
  paragraph,
  relationship,
} from '../apps/api/.test-dist/test/support/docx-fixtures.js';

const parser = new DocumentParser();
let passed;
try {
  const text = await parser.parse(pdfInput());
  assert.equal(text.source.text, 'Synthetic PDF');
  const unicode = await parser.parse(
    pdfInput(
      pdfFixture(['unicode'], { unicode: true, cmap: 'UniJIS-UTF16-H' }),
    ),
  );
  assert.equal(unicode.source.text, '😀éR');
  assert.equal(unicode.source.segments[0].end, 4);
  await assert.rejects(
    parser.parse(pdfInput(new Uint8Array(Buffer.from('%PDF-1.4 invalid')))),
    { code: 'PARSING_FAILED' },
  );
  assert.equal((await parser.parse(pdfInput())).source.text, 'Synthetic PDF');
  const docx = await parser.parse(
    docxInput(
      docxEntries({
        main: 'custom/main.xml',
        fallback: true,
        body: paragraph('Synthetic 😀 CV'),
      }),
    ),
  );
  assert.equal(docx.source.text, 'Synthetic 😀 CV\n\n');
  assert.equal(docx.pageCount, null);
  assert.equal(docx.source.segments[0].page, null);
  assert.equal(docx.source.segments[0].end, 15);
  await assert.rejects(
    parser.parse(
      docxInput(
        docxEntries({
          main: 'custom/main.xml',
          target: 'word/../custom/main.xml',
          fallback: true,
        }),
      ),
    ),
    { code: 'PARSING_FAILED' },
  );
  const linked = await parser.parse(
    docxInput(
      docxEntries({
        rels: relationship('hyperlink', 'https://github.com/synthetic', true),
      }),
    ),
  );
  assert.equal(linked.source.format, 'docx');
  passed = true;
} catch {
  // Do not expose assertion payloads or library diagnostics.
  passed = false;
} finally {
  try {
    await parser.close();
  } catch {
    passed = false;
  }
}
console.log(
  `Production PDF/DOCX worker ${passed ? 'PASS' : 'FAIL'}: synthetic text, CMap, Unicode offsets, main-part agreement, hyperlinks and failure recovery`,
);
if (!passed) process.exitCode = 1;
