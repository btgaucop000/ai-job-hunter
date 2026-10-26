import { afterEach, expect, jest, test } from '@jest/globals';
import { DocumentParser } from '../../src/extraction/document-parser.js';
import { inspectDocxZip } from '../../src/extraction/docx-zip.js';
import { validateDocxPackage } from '../../src/extraction/docx-package.validation.js';
import { validateCvOutput } from '../../src/extraction/extraction.validation.js';
import { EXTRACTION_LIMITS as limits } from '../../src/extraction/extraction.limits.js';
import {
  docxEntries,
  docxInput,
  zipFixture,
  paragraph,
  relationship,
  relationships,
  mainType,
} from '../support/docx-fixtures.js';
import type { ZipFixtureEntry } from '../support/docx-fixtures.js';
import { createServer } from 'node:http';

const parsers: DocumentParser[] = [];
function parser() {
  const instance = new DocumentParser();
  parsers.push(instance);
  return instance;
}
afterEach(async () => {
  for (const instance of parsers.splice(0)) await instance.close();
});
const preflight = async (entries: ZipFixtureEntry[]) =>
  validateDocxPackage(await inspectDocxZip(Buffer.from(zipFixture(entries))));

test('preserves paragraphs, Unicode, tabs and immutable UTF-16 evidence', async () => {
  const body =
    paragraph('Synthetic 😀 CV') +
    '<w:p><w:r><w:t>React</w:t><w:tab/><w:t>5 years</w:t></w:r></w:p>';
  const result = await parser().parse(docxInput(docxEntries({ body })));
  expect(result.source.text).toBe('Synthetic 😀 CV\n\nReact\t5 years\n\n');
  expect(result.pageCount).toBeNull();
  expect(result.source.segments).toEqual([
    { id: 'paragraph-1', start: 0, end: 15, page: null },
    { id: 'paragraph-2', start: 17, end: 30, page: null },
  ]);
  expect(Object.isFrozen(result.source.segments[0])).toBe(true);
  const unknown = { value: null, evidence: [] };
  const cv = validateCvOutput(
    {
      name: unknown,
      email: unknown,
      phone: unknown,
      location: unknown,
      skills: [
        {
          name: {
            value: 'React',
            evidence: [{ segmentId: 'paragraph-2', quote: 'React' }],
          },
          experienceText: unknown,
        },
      ],
      experience: [],
      education: [],
    },
    result.source,
  );
  expect(cv.skills[0]!.name.evidence[0]).toMatchObject({ start: 17, end: 22 });
});
test.each(['word/document.xml', 'custom/main.xml', 'custom/nested/main.xml'])(
  'Mammoth and preflight agree for %s even with a conflicting fallback',
  async (main) => {
    const entries = docxEntries({ main, fallback: true });
    expect(await preflight(entries)).toBe(main);
    expect((await parser().parse(docxInput(entries))).source.text).toBe(
      'Synthetic 😀 CV\n\n',
    );
  },
);
test.each([
  'word/../custom/main.xml',
  './custom/main.xml',
  'custom/./main.xml',
  'missing/main.xml',
  '/../../private',
])(
  'rejects ambiguous/missing main target %s before fallback',
  async (target) => {
    const entries = docxEntries({
      main: 'custom/main.xml',
      target,
      fallback: true,
    });
    await expect(parser().parse(docxInput(entries))).rejects.toMatchObject({
      code: target.startsWith('/../')
        ? 'RESOURCE_ACCESS_DENIED'
        : 'PARSING_FAILED',
    });
  },
);
test('rejects missing or duplicate main relationships', async () => {
  for (const rels of [
    '',
    relationship('officeDocument', 'word/document.xml') +
      relationship('officeDocument', 'word/document.xml', false, 'other'),
  ]) {
    const entries = docxEntries();
    entries[1]!.data = relationships(rels);
    await expect(preflight(entries)).rejects.toMatchObject({
      code: 'PARSING_FAILED',
    });
  }
});
test('safe parent reference for an internal image is permitted, escape is not', async () => {
  const entries = docxEntries({
    rels: relationship('image', '../media/image.png'),
  });
  entries.push({ name: 'media/image.png', data: 'synthetic image bytes' });
  expect(await preflight(entries)).toBe('word/document.xml');
  expect((await parser().parse(docxInput(entries))).source.text).toBe(
    'Synthetic 😀 CV\n\n',
  );
  const escaping = docxEntries({
    rels: relationship('image', '../../media/image.png'),
  });
  await expect(preflight(escaping)).rejects.toMatchObject({
    code: 'RESOURCE_ACCESS_DENIED',
  });
});
test('consumed styles cannot silently resolve via a different fallback', async () => {
  const entries = docxEntries({
    rels: relationship('styles', '../styles.xml'),
  });
  entries.push({
    name: 'styles.xml',
    data: '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
  });
  await expect(preflight(entries)).rejects.toMatchObject({
    code: 'PARSING_FAILED',
  });
});
test('ordinary GitHub/LinkedIn hyperlinks are retained as text and never fetched', async () => {
  let requests = 0;
  const server = createServer((_req, response) => {
    requests++;
    response.end('private');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error();
    const rels =
      relationship(
        'hyperlink',
        'https://github.com/synthetic',
        true,
        'github',
      ) +
      relationship(
        'hyperlink',
        'https://www.linkedin.com/in/synthetic',
        true,
        'linkedin',
      ) +
      relationship(
        'hyperlink',
        `http://127.0.0.1:${address.port}/never`,
        true,
        'canary',
      );
    const body =
      '<w:p><w:hyperlink r:id="github"><w:r><w:t>GitHub</w:t></w:r></w:hyperlink><w:hyperlink r:id="linkedin"><w:r><w:t>LinkedIn</w:t></w:r></w:hyperlink><w:hyperlink r:id="canary"><w:r><w:t>Canary</w:t></w:r></w:hyperlink></w:p>';
    expect(
      (await parser().parse(docxInput(docxEntries({ rels, body })))).source
        .text,
    ).toBe('GitHubLinkedInCanary\n\n');
    expect(requests).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test.each([
  'image',
  'attachedTemplate',
  'aFChunk',
  'oleObject',
  'package',
  'unknown',
])('rejects external %s relationship', async (kind) => {
  await expect(
    preflight(
      docxEntries({
        rels: relationship(kind, 'https://example.invalid/private', true),
      }),
    ),
  ).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
});
test.each([
  'file:///etc/passwd',
  'javascript:alert(1)',
  'data:text/plain,private',
])('rejects unsafe hyperlink scheme %s', async (target) => {
  await expect(
    preflight(docxEntries({ rels: relationship('hyperlink', target, true) })),
  ).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
});
test.each([
  '../evil.xml',
  '/evil.xml',
  'word/../evil.xml',
  'word\\evil.xml',
  'word/%2e%2e/evil.xml',
  'word//evil.xml',
])('rejects unsafe ZIP path %s', async (name) => {
  await expect(
    inspectDocxZip(Buffer.from(zipFixture([{ name, data: 'private' }]))),
  ).rejects.toBeDefined();
});
test.each(
  [
    [
      { name: 'a.xml', data: 'a' },
      { name: 'a.xml', data: 'b' },
    ],
    [
      { name: 'A.xml', data: 'a' },
      { name: 'a.xml', data: 'b' },
    ],
    [{ name: 'a.xml', data: 'a', flags: 0x801 }],
    [{ name: 'a.xml', data: 'a', flags: 0x808 }],
    [{ name: 'a.xml', data: 'a', crc: 1 }],
    [{ name: 'a.xml', data: 'a', localName: 'b.xml' }],
    [{ name: 'a.xml', data: '/etc/passwd', mode: 0xa1ff }],
    [{ name: 'a.xml', data: 'actual data', deflate: true, declaredSize: 1 }],
    [{ name: 'a.xml', data: 'actual data', deflate: true, declaredSize: 100 }],
  ].map((entries) => ({ entries })),
)(
  'rejects duplicate/encrypted/corrupt/inconsistent ZIP fixture %#',
  async ({ entries }) => {
    await expect(
      inspectDocxZip(Buffer.from(zipFixture(entries))),
    ).rejects.toBeDefined();
  },
);
test('enforces archive entry count and expansion ratio', async () => {
  await expect(
    inspectDocxZip(
      Buffer.from(
        zipFixture(
          Array.from({ length: limits.archiveEntries + 1 }, (_, i) => ({
            name: `part${i}.xml`,
            data: '',
          })),
        ),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  await expect(
    inspectDocxZip(
      Buffer.from(
        zipFixture([
          { name: 'data.xml', data: 'a'.repeat(100_000), deflate: true },
        ]),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  expect(
    (
      await inspectDocxZip(
        Buffer.from(
          zipFixture(
            Array.from({ length: limits.archiveEntries }, (_, i) => ({
              name: `part${i}.xml`,
              data: '',
            })),
          ),
        ),
      )
    ).names.size,
  ).toBe(limits.archiveEntries);
});
function moderatelyCompressed(length: number): Buffer {
  const data = Buffer.alloc(length);
  let state = 1;
  for (let block = 0; block < length; block += 65536) {
    for (let i = block; i < Math.min(block + 4096, length); i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      data[i] = state >>> 24;
    }
  }
  return data;
}
test('enforces per-entry and aggregate actual decompression budgets', async () => {
  const entry = moderatelyCompressed(limits.archiveEntryBytes);
  const within = Buffer.from(
    zipFixture([{ name: 'data.dat', data: entry, deflate: true }]),
  );
  expect((await inspectDocxZip(within)).names.size).toBe(1);
  await expect(
    inspectDocxZip(
      Buffer.from(
        zipFixture([
          {
            name: 'data.dat',
            data: moderatelyCompressed(limits.archiveEntryBytes + 1),
            deflate: true,
          },
        ]),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
  await expect(
    inspectDocxZip(
      Buffer.from(
        zipFixture(
          Array.from({ length: 5 }, (_, i) => ({
            name: `data${i}.dat`,
            data: entry,
            deflate: true,
          })),
        ),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
});
test.each([
  '<!DOCTYPE w:document [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
  '<?xml version="1.0" encoding="UTF-16"?>',
])('rejects DTD/entities and unsupported XML encodings %#', async (prefix) => {
  const entries = docxEntries();
  entries[2]!.data = prefix + entries[2]!.data;
  await expect(preflight(entries)).rejects.toMatchObject({
    code: 'PARSING_FAILED',
  });
});
test.each(['<invalid>', '<w:document xmlns:w="wrong"><w:body/></w:document>'])(
  'rejects malformed/incorrect main XML',
  async (xml) => {
    const entries = docxEntries();
    entries[2]!.data = xml;
    await expect(parser().parse(docxInput(entries))).rejects.toMatchObject({
      code: 'PARSING_FAILED',
    });
  },
);
test('rejects macros, embedded executables and external imports', async () => {
  const macro = docxEntries();
  macro[0]!.data = String(macro[0]!.data).replace(
    mainType,
    'application/vnd.ms-word.document.macroEnabled.main+xml',
  );
  await expect(preflight(macro)).rejects.toMatchObject({
    code: 'RESOURCE_ACCESS_DENIED',
  });
  await expect(
    preflight([
      ...docxEntries(),
      { name: 'word/embeddings/payload.bin', data: 'private' },
    ]),
  ).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
  await expect(
    preflight(docxEntries({ body: '<w:altChunk r:id="bad"/>' })),
  ).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
});
test('rejects missing content types and duplicate relationship IDs', async () => {
  await expect(preflight(docxEntries().slice(1))).rejects.toMatchObject({
    code: 'PARSING_FAILED',
  });
  await expect(
    preflight(
      docxEntries({
        rels:
          relationship('hyperlink', 'https://github.com', true) +
          relationship('hyperlink', 'https://linkedin.com', true),
      }),
    ),
  ).rejects.toMatchObject({ code: 'PARSING_FAILED' });
});
test('text limit and empty documents reject rather than truncate', async () => {
  await expect(
    parser().parse(docxInput(docxEntries({ body: '' }))),
  ).rejects.toMatchObject({ code: 'NO_EXTRACTABLE_TEXT' });
  await expect(
    parser().parse(
      docxInput(docxEntries({ body: paragraph('a'.repeat(limits.textUnits)) })),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
});
test('failure cleans up and the same owner parses again without logging private content', async () => {
  const instance = parser();
  const spies = [
    jest.spyOn(console, 'log'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'error'),
  ];
  try {
    await expect(
      instance.parse({
        ...docxInput(),
        bytes: new Uint8Array(Buffer.from('PRIVATE_SECRET')),
      }),
    ).rejects.toMatchObject({
      code: 'PARSING_FAILED',
      message: 'Document parsing failed',
    });
    expect((await instance.parse(docxInput())).source.format).toBe('docx');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});

test.each([
  Buffer.from('MZsynthetic'),
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
])(
  'rejects executable/OLE/nested archive signatures even when disguised as an image',
  async (data) => {
    await expect(
      preflight([...docxEntries(), { name: 'word/media/image.png', data }]),
    ).rejects.toMatchObject({ code: 'RESOURCE_ACCESS_DENIED' });
  },
);
test('rejects unsupported ZIP64, multi-disk and trailing records', async () => {
  const normal = Buffer.from(
    zipFixture([{ name: 'data.xml', data: '<data/>' }]),
  );
  const disk = Buffer.from(normal);
  disk.writeUInt16LE(1, disk.length - 18);
  const zip64 = Buffer.from(normal);
  zip64.writeUInt16LE(45, 4);
  for (const bytes of [
    disk,
    zip64,
    Buffer.concat([normal, Buffer.from('trailer')]),
  ])
    await expect(inspectDocxZip(bytes)).rejects.toBeDefined();
});
test('accepts exact DOCX text/segment limits and rejects too many paragraphs', async () => {
  expect(
    (
      await parser().parse(
        docxInput(
          docxEntries({ body: paragraph('a'.repeat(limits.textUnits - 2)) }),
        ),
      )
    ).source.text.length,
  ).toBe(limits.textUnits);
  expect(
    (
      await parser().parse(
        docxInput(
          docxEntries({ body: paragraph('a').repeat(limits.segments) }),
        ),
      )
    ).source.segments.length,
  ).toBe(limits.segments);
  await expect(
    parser().parse(
      docxInput(
        docxEntries({ body: paragraph('a').repeat(limits.segments + 1) }),
      ),
    ),
  ).rejects.toMatchObject({ code: 'DOCUMENT_TOO_LARGE' });
});
