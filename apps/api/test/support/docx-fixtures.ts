import { crc32, deflateRawSync } from 'node:zlib';

export interface ZipFixtureEntry {
  name: string;
  data: string | Buffer;
  deflate?: boolean;
  flags?: number;
  crc?: number;
  declaredSize?: number;
  localName?: string;
  mode?: number;
}
// Minimal synthetic ZIP encoder for adversarial fixtures, never used in production.
export function zipFixture(entries: ZipFixtureEntry[]): Uint8Array {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data)
      ? entry.data
      : Buffer.from(entry.data);
    const name = Buffer.from(entry.name);
    const localName = Buffer.from(entry.localName ?? entry.name);
    const packed = entry.deflate ? deflateRawSync(data) : data;
    const checksum = entry.crc ?? crc32(data);
    const size = entry.declaredSize ?? data.length;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(entry.flags ?? 0x800, 6);
    header.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(localName.length, 26);
    local.push(header, localName, packed);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(entry.flags ?? 0x800, 8);
    directory.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(packed.length, 20);
    directory.writeUInt32LE(size, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(((entry.mode ?? 0x81a4) << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + localName.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}
export const relNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
export const officeNamespace =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
export const wordNamespace =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const mainType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
export const documentXml = (body: string) =>
  `<w:document xmlns:w="${wordNamespace}" xmlns:r="${officeNamespace.slice(0, -1)}"><w:body>${body}</w:body></w:document>`;
export const paragraph = (text: string) =>
  `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
export const relationships = (body: string) =>
  `<Relationships xmlns="${relNamespace}">${body}</Relationships>`;
export const relationship = (
  type: string,
  target: string,
  external = false,
  id = 'r1',
) =>
  `<Relationship Id="${id}" Type="${officeNamespace}${type}" Target="${target}"${external ? ' TargetMode="External"' : ''}/>`;
export function docxEntries(
  options: {
    main?: string;
    target?: string;
    body?: string;
    fallback?: boolean;
    rels?: string;
  } = {},
): ZipFixtureEntry[] {
  const main = options.main ?? 'word/document.xml';
  const result: ZipFixtureEntry[] = [
    {
      name: '[Content_Types].xml',
      data: `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/${main}" ContentType="${mainType}"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: relationships(
        relationship('officeDocument', options.target ?? main),
      ),
    },
    {
      name: main,
      data: documentXml(options.body ?? paragraph('Synthetic 😀 CV')),
    },
  ];
  if (options.fallback && main !== 'word/document.xml')
    result.push({
      name: 'word/document.xml',
      data: documentXml(paragraph('WRONG FALLBACK')),
    });
  if (options.rels !== undefined) {
    const parts = main.split('/');
    const name = parts.pop()!;
    result.push({
      name: [...parts, '_rels', name + '.rels'].join('/'),
      data: relationships(options.rels),
    });
  }
  return result;
}
export const docxInput = (entries = docxEntries()) => ({
  bytes: zipFixture(entries),
  fileName: 'synthetic.docx',
  mediaType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
});
