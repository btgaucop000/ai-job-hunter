import yauzl from 'yauzl';
import { crc32 } from 'node:zlib';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';

export interface DocxPackage {
  readonly names: ReadonlySet<string>;
  readonly xml: ReadonlyMap<string, Buffer>;
}
const invalid = () => new ExtractionError('PARSING_FAILED');
const oversized = () => new ExtractionError('DOCUMENT_TOO_LARGE');

// Strict supported ZIP profile: ASCII canonical paths, STORE/DEFLATE, no ZIP64,
// data descriptors or alternative name encodings. Parsing belongs to yauzl.
export async function inspectDocxZip(buffer: Buffer): Promise<DocxPackage> {
  if (!buffer.length || buffer.length > limits.fileBytes) throw oversized();
  const zip = await yauzl.fromBufferPromise(buffer, {
    lazyEntries: true,
    decodeStrings: true,
    validateEntrySizes: true,
    strictFileNames: true,
    autoClose: false,
  });
  try {
    // Upstream declarations incorrectly label this numeric cursor as boolean.
    const directoryStart: unknown = zip.readEntryCursor;
    if (
      typeof directoryStart !== 'number' ||
      !Number.isSafeInteger(directoryStart) ||
      directoryStart < 0 ||
      zip.comment !== ''
    )
      throw invalid();
    if (zip.entryCount > limits.archiveEntries) throw oversized();
    // Fixed envelope checks supplement yauzl's parser; no ZIP record scanning.
    const endRecord = buffer.subarray(-22);
    if (
      endRecord.length !== 22 ||
      endRecord.readUInt32LE(0) !== 0x06054b50 ||
      endRecord.readUInt16LE(4) !== 0 ||
      endRecord.readUInt16LE(6) !== 0 ||
      endRecord.readUInt16LE(8) !== zip.entryCount ||
      endRecord.readUInt16LE(10) !== zip.entryCount ||
      endRecord.readUInt16LE(20) !== 0 ||
      endRecord.readUInt32LE(16) !== directoryStart ||
      endRecord.readUInt32LE(12) !== buffer.length - 22 - directoryStart
    )
      throw invalid();
    let centralCursor = directoryStart;
    const names = new Set<string>();
    const aliases = new Set<string>();
    const xml = new Map<string, Buffer>();
    let total = 0;
    let compressed = 0;
    let count = 0;
    const ranges: [number, number][] = [];
    for await (const entry of zip.eachEntry()) {
      if (++count > limits.archiveEntries) throw oversized();
      if (buffer.readUInt16LE(centralCursor + 34) !== 0) throw invalid();
      centralCursor +=
        46 +
        entry.fileNameLength +
        entry.extraFieldLength +
        entry.fileCommentLength;
      const name = entry.fileName;
      const parts = name.replace(/\/$/, '').split('/');
      if (
        !/^[A-Za-z0-9_\-.[\]/]+$/.test(name) ||
        name.startsWith('/') ||
        parts.some((p) => !p || p === '.' || p === '..') ||
        names.has(name) ||
        aliases.has(name.replace(/\/$/, '').toLowerCase())
      )
        throw invalid();
      names.add(name);
      aliases.add(name.replace(/\/$/, '').toLowerCase());
      if (
        entry.isEncrypted() ||
        (entry.generalPurposeBitFlag & ~0x806) !== 0 ||
        ![0, 8].includes(entry.compressionMethod) ||
        entry.versionNeededToExtract >= 45 ||
        entry.extraFields.some((field) =>
          [1, 0x7075, 0x6375].includes(field.id),
        ) ||
        ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000
      )
        throw invalid();
      if (!entry.fileNameRaw.equals(Buffer.from(name, 'ascii')))
        throw invalid();
      if (
        entry.uncompressedSize > limits.archiveEntryBytes ||
        entry.uncompressedSize >
          entry.compressedSize * limits.archiveExpansionRatio
      )
        throw oversized();
      const header = await zip.readLocalFileHeaderPromise(entry);
      if (
        !header.fileName.equals(entry.fileNameRaw) ||
        header.generalPurposeBitFlag !== entry.generalPurposeBitFlag ||
        header.compressionMethod !== entry.compressionMethod ||
        header.compressedSize !== entry.compressedSize ||
        header.uncompressedSize !== entry.uncompressedSize ||
        header.crc32 !== entry.crc32 ||
        header.versionNeededToExtract !== entry.versionNeededToExtract ||
        !header.extraField.equals(entry.extraFieldRaw)
      )
        throw invalid();
      const end = header.fileDataStart + entry.compressedSize;
      if (
        end > directoryStart ||
        ranges.some(
          ([start, finish]) =>
            entry.relativeOffsetOfLocalHeader < finish && end > start,
        )
      )
        throw invalid();
      ranges.push([entry.relativeOffsetOfLocalHeader, end]);
      if (
        name.endsWith('/') &&
        (entry.compressedSize !== 0 || entry.uncompressedSize !== 0)
      )
        throw invalid();
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let actual = 0;
      let signature = Buffer.alloc(0);
      let checksum = 0;
      const isXml = name.endsWith('.xml') || name.endsWith('.rels');
      try {
        for await (const value of stream) {
          const chunk = Buffer.from(value as Uint8Array);
          if (signature.length < 8)
            signature = Buffer.concat([
              signature,
              chunk.subarray(0, 8 - signature.length),
            ]);
          actual += chunk.length;
          total += chunk.length;
          if (
            actual > limits.archiveEntryBytes ||
            total > limits.archiveExpandedBytes ||
            actual > entry.compressedSize * limits.archiveExpansionRatio
          )
            throw oversized();
          checksum = crc32(chunk, checksum);
          if (isXml) chunks.push(chunk);
        }
      } finally {
        stream.destroy();
      }
      if (actual !== entry.uncompressedSize || checksum !== entry.crc32)
        throw invalid();
      if (
        signature.subarray(0, 2).equals(Buffer.from('MZ')) ||
        signature
          .subarray(0, 4)
          .equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
        signature
          .subarray(0, 4)
          .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
        signature.equals(
          Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        )
      )
        throw new ExtractionError('RESOURCE_ACCESS_DENIED');
      compressed += entry.compressedSize;
      if (isXml) xml.set(name, Buffer.concat(chunks));
    }
    if (
      count !== zip.entryCount ||
      total > compressed * limits.archiveExpansionRatio
    )
      throw invalid();
    // No unreferenced local records, prepended payloads or gaps between records.
    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start !== cursor) throw invalid();
      cursor = end;
    }
    if (cursor !== directoryStart || centralCursor !== buffer.length - 22)
      throw invalid();
    return { names, xml };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw invalid();
  } finally {
    zip.close();
  }
}
