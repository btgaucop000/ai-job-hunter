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
import {
  configurePdfParserDiagnostics,
  withPdfParserDiagnosticRequest,
} from '../../src/extraction/pdf-parser.diagnostics.js';
import type { PdfParserDiagnosticRecord } from '../../src/extraction/pdf-parser.diagnostics.js';

const parsers: DocumentParser[] = [];
const parser = () => {
  const instance = new DocumentParser();
  parsers.push(instance);
  return instance;
};
const prefixedPdf = (prefixBytes: number): Uint8Array =>
  new Uint8Array(
    Buffer.concat([Buffer.alloc(prefixBytes, 0x20), pdfFixture()]),
  );
afterEach(async () => {
  for (const instance of parsers.splice(0)) await instance.close();
  configurePdfParserDiagnostics(false, '127.0.0.1', () => {});
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
test.each([0, 1, 17, 1019])(
  'accepts a PDF header at byte %s without modifying input or extracted source',
  async (offset) => {
    const bytes = new Uint8Array(
      Buffer.concat([Buffer.alloc(offset, 0x20), pdfFixture()]),
    );
    const before = bytes.slice();
    const instance = parser();
    const expected = await instance.parse(pdfInput());
    expect(await instance.parse(pdfInput(bytes))).toEqual(expected);
    expect(bytes).toEqual(before);
  },
);
test('accepts a non-whitespace synthetic preamble without stripping or rewriting bytes', async () => {
  const prefix = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf, 0x00, 0xff]),
    Buffer.from('SYNTHETIC-PREAMBLE\n'),
  ]);
  const bytes = new Uint8Array(Buffer.concat([prefix, pdfFixture()]));
  const before = bytes.slice();
  const instance = parser();
  const expected = await instance.parse(pdfInput());
  expect(await instance.parse(pdfInput(bytes))).toEqual(expected);
  expect(bytes).toEqual(before);
});
test.each([
  new Uint8Array(Buffer.concat([Buffer.alloc(1020, 0x20), pdfFixture()])),
  new Uint8Array(Buffer.from('SYNTHETIC non-PDF payload')),
  new Uint8Array(Buffer.from('%PDF-synthetic invalid structure')),
  new Uint8Array(Buffer.from('%PDF-')),
  new Uint8Array(Buffer.from('%PDF')),
  new Uint8Array(
    Buffer.concat([
      Buffer.from([0xa5, 0xd0, 0xc4, 0xc6, 0xad]),
      Buffer.from(pdfFixture().subarray(5)),
    ]),
  ),
])(
  'rejects out-of-window, missing, fake or inexact signatures %#',
  async (bytes) => {
    const before = bytes.slice();
    const instance = parser();
    await expect(instance.parse(pdfInput(bytes))).rejects.toMatchObject({
      code: 'PARSING_FAILED',
      message: 'Document parsing failed',
    });
    expect(bytes).toEqual(before);
    expect((await instance.parse(pdfInput())).source.text).toBe(
      'Synthetic PDF',
    );
  },
);
test.each([
  pdfFixture(Array(limits.pdfPages + 1).fill('a')),
  pdfFixture(['a'.repeat(limits.textUnits + 1)]),
])(
  'preamble compatibility preserves existing page/text limits %#',
  async (pdf) => {
    const bytes = new Uint8Array(
      Buffer.concat([Buffer.from('SYNTHETIC\n'), pdf]),
    );
    await expect(parser().parse(pdfInput(bytes))).rejects.toMatchObject({
      code: 'DOCUMENT_TOO_LARGE',
    });
  },
);
test('recovers one text-stream parse defect, reports it and remains reusable', async () => {
  let workerCount = 0;
  const instance = new DocumentParser((url, options) => {
    workerCount++;
    return new Worker(url, options);
  });
  parsers.push(instance);
  const result = await instance.parse(
    pdfInput(
      pdfFixture(['Synthetic recoverable text'], {
        recoverableTextDefect: true,
      }),
    ),
  );
  expect(result.source.text).toBe('Synthetic recoverable text');
  expect(result.warnings).toEqual([
    { code: 'IMAGE_CONTENT_NOT_INTERPRETED' },
    { code: 'PDF_RECOVERY_USED' },
  ]);
  expect(workerCount).toBe(1);

  const valid = await instance.parse(pdfInput());
  expect(valid.source.text).toBe('Synthetic PDF');
  expect(valid.warnings).toEqual([{ code: 'IMAGE_CONTENT_NOT_INTERPRETED' }]);
  expect(workerCount).toBe(2);
});
test('reports a failed recovery without changing the parser error', async () => {
  const records: PdfParserDiagnosticRecord[] = [];
  configurePdfParserDiagnostics(true, '127.0.0.1', (record) =>
    records.push(record),
  );
  const instance = parser();
  await expect(
    withPdfParserDiagnosticRequest('7ef4cc66-c25b-4db2-a846-740165d06d22', () =>
      instance.parse(
        pdfInput(
          pdfFixture(['a'.repeat(limits.textUnits + 1)], {
            recoverableTextDefect: true,
          }),
        ),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  expect(records).toEqual([
    {
      requestId: '7ef4cc66-c25b-4db2-a846-740165d06d22',
      phase: 'TEXT_STREAM',
      category: 'OTHER',
      recoveryAttempted: true,
      workerStatus: 'MESSAGE',
    },
  ]);
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
test.each([
  [
    'signature just outside the bounded prefix',
    prefixedPdf(1020),
    'HEADER_SIGNATURE_REJECTED',
  ],
  [
    'missing signature',
    new Uint8Array(Buffer.from('synthetic non-PDF payload')),
    'HEADER_SIGNATURE_REJECTED',
  ],
  [
    'fake signature in a non-PDF payload',
    new Uint8Array(Buffer.from('%PDF-synthetic non-PDF payload')),
    'PDFJS_DOCUMENT_REJECTED',
  ],
] as const)(
  'distinguishes %s rejection without changing the parser error',
  async (_boundary, bytes, category) => {
    const records: PdfParserDiagnosticRecord[] = [];
    configurePdfParserDiagnostics(true, '127.0.0.1', (record) =>
      records.push(record),
    );
    await expect(
      withPdfParserDiagnosticRequest(
        '7ef4cc66-c25b-4db2-a846-740165d06d22',
        () => parser().parse(pdfInput(bytes)),
      ),
    ).rejects.toMatchObject({
      code: 'PARSING_FAILED',
      message: 'Document parsing failed',
    });
    expect(records).toEqual([
      {
        requestId: '7ef4cc66-c25b-4db2-a846-740165d06d22',
        phase: 'DOCUMENT_LOAD',
        category,
        recoveryAttempted: false,
        workerStatus: 'MESSAGE',
      },
    ]);
  },
);
test('header distinction remains disabled by default', async () => {
  const records: PdfParserDiagnosticRecord[] = [];
  configurePdfParserDiagnostics(false, '127.0.0.1', (record) =>
    records.push(record),
  );
  const bytes = prefixedPdf(1020);
  await expect(parser().parse(pdfInput(bytes))).rejects.toMatchObject({
    code: 'PARSING_FAILED',
    message: 'Document parsing failed',
  });
  expect(records).toEqual([]);
});
test('rejects password protected documents without waiting for a password', async () => {
  await expect(
    parser().parse(
      pdfInput(
        pdfFixture(['private'], {
          encrypted: true,
          recoverableTextDefect: true,
        }),
      ),
    ),
  ).rejects.toMatchObject({ code: 'PASSWORD_PROTECTED_DOCUMENT' });
});
test('application-owned no-text failure does not become recovered output', async () => {
  const instance = parser();
  await expect(
    instance.parse(pdfInput(pdfFixture([''], { recoverableTextDefect: true }))),
  ).rejects.toMatchObject({ code: 'NO_EXTRACTABLE_TEXT' });
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
  {
    version: 2,
    format: 'pdf',
    bytes: new Uint8Array(1),
    diagnostics: false,
  },
  {
    version: 1,
    format: 'unsupported',
    bytes: new Uint8Array(1),
    diagnostics: false,
  },
  {
    version: 1,
    format: 'pdf',
    bytes: new Uint8Array(),
    diagnostics: false,
  },
  {
    version: 1,
    format: 'pdf',
    bytes: new Uint8Array(1),
    diagnostics: 'yes',
  },
])('rejects invalid worker requests %#', (input) =>
  expect(() => validateParseRequest(input)).toThrow('Document parsing failed'),
);
test.each([
  {},
  { version: 1, ok: false, code: 'private upstream error' },
  { version: 1, ok: false, code: 'PARSING_FAILED', diagnostic: null, extra: 1 },
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
