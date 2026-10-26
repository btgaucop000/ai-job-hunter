import { afterEach, expect, jest, test } from '@jest/globals';
import { DocumentParser } from '../../src/extraction/document-parser.js';
import { BundledPdfResources } from '../../src/extraction/pdf.resources.js';
import { EXTRACTION_LIMITS as limits } from '../../src/extraction/extraction.limits.js';
import {
  validateParseRequest,
  validateParseResponse,
} from '../../src/extraction/parser.protocol.js';
import { pdfFixture, pdfInput } from '../support/pdf-fixtures.js';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';

const parsers: DocumentParser[] = [];
const parser = () => {
  const instance = new DocumentParser();
  parsers.push(instance);
  return instance;
};
afterEach(async () => {
  for (const instance of parsers.splice(0)) await instance.close();
});

test('real legacy worker extracts text, freezes source and does not detach input', async () => {
  const bytes = pdfFixture();
  const before = bytes.slice();
  const result = await parser().parse(pdfInput(bytes));
  expect(result.source.text).toBe('Synthetic PDF');
  expect(bytes).toEqual(before);
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.source)).toBe(true);
  expect(Object.isFrozen(result.source.segments[0])).toBe(true);
});
test('Unicode text uses global UTF-16 offsets across pages', async () => {
  const result = await parser().parse(
    pdfInput(pdfFixture(['one', 'two'], { unicode: true })),
  );
  expect(result.source.text).toBe('😀éR\n\n😀éR');
  expect(result.source.segments.map(({ start, end }) => [start, end])).toEqual([
    [0, 4],
    [6, 10],
  ]);
  expect(
    result.source.text.slice(
      result.source.segments[1]!.start,
      result.source.segments[1]!.end,
    ),
  ).toBe('😀éR');
});
test('mixed pages retain original page numbers and separators', async () => {
  const result = await parser().parse(
    pdfInput(pdfFixture(['First', '', 'Last'])),
  );
  expect(result.pageCount).toBe(3);
  expect(result.source.text).toBe('First\n\n\n\nLast');
  expect(result.source.segments.map((segment) => segment.page)).toEqual([1, 3]);
  expect(result.warnings).toContainEqual({
    code: 'PAGE_WITHOUT_TEXT',
    page: 2,
  });
});
test.each([pdfFixture(['']), pdfFixture(['image'], { image: true })])(
  'empty/image-only document has no extractable text',
  async (bytes) => {
    await expect(parser().parse(pdfInput(bytes))).rejects.toMatchObject({
      code: 'NO_EXTRACTABLE_TEXT',
    });
  },
);
test.each([
  new Uint8Array(Buffer.from('private invalid')),
  new Uint8Array(Buffer.from('%PDF-1.4\nprivate invalid')),
  pdfFixture().slice(0, 70),
])('malformed document fails safely and next parse recovers', async (bytes) => {
  const instance = parser();
  await expect(instance.parse(pdfInput(bytes))).rejects.toMatchObject({
    code: 'PARSING_FAILED',
    message: 'Document parsing failed',
  });
  expect((await instance.parse(pdfInput())).source.text).toBe('Synthetic PDF');
});
test('rejects password protected documents without waiting for a password', async () => {
  await expect(
    parser().parse(pdfInput(pdfFixture(['private'], { encrypted: true }))),
  ).rejects.toMatchObject({ code: 'PASSWORD_PROTECTED_DOCUMENT' });
});
test('enforces page and text limits without truncation', async () => {
  const instance = parser();
  expect(
    (
      await instance.parse(
        pdfInput(pdfFixture(Array(limits.pdfPages).fill('a'))),
      )
    ).pageCount,
  ).toBe(limits.pdfPages);
  await expect(
    instance.parse(pdfInput(pdfFixture(Array(limits.pdfPages + 1).fill('a')))),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  expect(
    (await instance.parse(pdfInput(pdfFixture(['a'.repeat(limits.textUnits)]))))
      .source.text.length,
  ).toBe(limits.textUnits);
  await expect(
    instance.parse(pdfInput(pdfFixture(['a'.repeat(limits.textUnits + 1)]))),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  // Separators count too.
  await expect(
    instance.parse(pdfInput(pdfFixture(['a'.repeat(limits.textUnits), 'b']))),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
});
test('file limits and unsupported extension rejection occur before worker creation', async () => {
  const create = jest.fn<() => Worker>(() => {
    throw new Error('unexpected worker');
  });
  const instance = new DocumentParser(create);
  parsers.push(instance);
  await expect(
    instance.parse(pdfInput(new Uint8Array(limits.fileBytes + 1))),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  await expect(
    instance.parse({
      bytes: new Uint8Array(1),
      fileName: 'sample.doc',
      mediaType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  expect(create).not.toHaveBeenCalled();
});
test('reads exact bundled font and CMap resources', async () => {
  const resources = new BundledPdfResources();
  expect(
    (
      await resources.fetch({
        kind: 'standardFontDataUrl',
        filename: 'LiberationSans-Regular.ttf',
      })
    ).byteLength,
  ).toBeGreaterThan(100);
  expect(
    (
      await resources.fetch({
        kind: 'cMapUrl',
        filename: 'Adobe-Japan1-UCS2.bcmap',
      })
    ).byteLength,
  ).toBeGreaterThan(100);
  expect(resources.failed).toBe(false);
});
test.each([
  ['standardFontDataUrl', '../package.json'],
  ['standardFontDataUrl', '/etc/passwd'],
  ['standardFontDataUrl', 'https://example.invalid/private'],
  ['cMapUrl', '../../private'],
  ['cMapUrl', 'file:///etc/passwd'],
  ['cMapUrl', '%2e%2e%2fprivate'],
  ['cMapUrl', '..\\private'],
  ['wasmUrl', 'module.wasm'],
  ['https://example.invalid/', 'LiberationSans-Regular.ttf'],
  ['standardFontDataUrl', 'LICENSE_FOXIT'],
])('denies resource request %s %s', async (kind, filename) => {
  const resources = new BundledPdfResources();
  await expect(resources.fetch({ kind, filename })).rejects.toMatchObject({
    code: 'RESOURCE_ACCESS_DENIED',
    message: 'Document resource access is not permitted',
  });
  expect(resources.failed).toBe(true);
});
test('native addons are disabled in the actual worker configuration', async () => {
  let execArgv: string[] | undefined;
  const instance = new DocumentParser((url, options) => {
    execArgv = options.execArgv;
    return new Worker(url, options);
  });
  parsers.push(instance);
  expect((await instance.parse(pdfInput())).source.text).toBe('Synthetic PDF');
  expect(execArgv).toEqual(['--no-addons']);
});
test('ignores document JavaScript and external actions without network requests', async () => {
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end('private');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test setup');
    // Rebuild xref after substituting a reachable canary URL.
    const raw = Buffer.from(
      pdfFixture(['Synthetic PDF'], { externalAction: true }),
    ).toString('latin1');
    const { pdfObjects } = await import('../support/pdf-fixtures.js');
    const objects = Array.from(
      raw.matchAll(/\d+ 0 obj\n([\s\S]*?)\nendobj/g),
      (match) =>
        match[1]!.replace(
          'https://example.invalid/private',
          `http://127.0.0.1:${address.port}/private`,
        ),
    );
    const result = await parser().parse(pdfInput(pdfObjects(objects)));
    expect(result.source.text).toBe('Synthetic PDF');
    expect(requests).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test.each([
  {},
  { version: 2, format: 'pdf', bytes: new Uint8Array(1) },
  { version: 1, format: 'unsupported', bytes: new Uint8Array(1) },
  { version: 1, format: 'pdf', bytes: new Uint8Array() },
])('rejects invalid worker requests %#', (input) =>
  expect(() => validateParseRequest(input)).toThrow('Document parsing failed'),
);
test.each([
  {},
  { version: 1, ok: false, code: 'private upstream error' },
  { version: 1, ok: true, result: {} },
])('rejects invalid worker responses %#', (input) =>
  expect(() => validateParseResponse(input)).toThrow('Document parsing failed'),
);

test('real PDF worker resolves the allowlisted bundled CMap', async () => {
  const result = await parser().parse(
    pdfInput(
      pdfFixture(['unicode'], { unicode: true, cmap: 'UniJIS-UTF16-H' }),
    ),
  );
  expect(result.source.text).toBe('😀éR');
});
test('parser startup diagnostics and malformed content do not reach application logs', async () => {
  const spies = [
    jest.spyOn(console, 'log'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'error'),
  ];
  try {
    await parser().parse(pdfInput());
    await expect(
      parser().parse(
        pdfInput(new Uint8Array(Buffer.from('%PDF-1.4 PRIVATE_SECRET'))),
      ),
    ).rejects.toMatchObject({ message: 'Document parsing failed' });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
