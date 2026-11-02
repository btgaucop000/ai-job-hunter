import busboy from 'busboy';
import { BadRequestException } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import { validateDocumentInput } from '../extraction/extraction.validation.js';
export interface JobDocument {
  bytes: Buffer;
  fileName: string;
  mediaType: string;
}
export interface JobUpload {
  record: unknown;
  document?: JobDocument;
}
const MAX_TOTAL = 5 * 1024 * 1024 + 600 * 1024;
// One bounded JSON field and one optional document. No disk staging or orphan files.
export function readJobUpload(req: IncomingMessage): Promise<JobUpload> {
  if (
    req.headers['content-encoding'] ||
    Number(req.headers['content-length'] ?? 0) > MAX_TOTAL
  )
    throw new BadRequestException('Import exceeds upload limits.');
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        preservePath: true,
        defCharset: 'utf8',
        defParamCharset: 'utf8',
        limits: {
          files: 1,
          fields: 1,
          // Busboy emits partsLimit at the threshold; reject extra named parts below.
          parts: 3,
          fileSize: 5 * 1024 * 1024 + 1,
          fieldSize: 512 * 1024,
        },
      });
    } catch {
      reject(new BadRequestException('Invalid import upload'));
      return;
    }
    let settled = false;
    let total = 0;
    let record: unknown;
    let fieldSeen = false;
    let document: JobDocument | undefined;
    let stream: Readable | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      req.off('data', data);
      req.off('end', end);
      req.off('error', fail);
      req.off('aborted', fail);
      req.pause();
      stream?.destroy();
      parser.destroy();
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      req.pause();
      queueMicrotask(() => {
        cleanup();
        reject(
          new BadRequestException(
            'Invalid import upload. Use one PDF/DOCX up to 5 MiB and bounded text fields.',
          ),
        );
      });
    };
    const timer = setTimeout(fail, 30000);
    timer.unref();
    const data = (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > MAX_TOTAL) {
        fail();
        return;
      }
      try {
        if (!parser.write(chunk)) req.pause();
      } catch {
        fail();
      }
    };
    const end = () => parser.end();
    parser.on('drain', () => {
      if (!settled) req.resume();
    });
    parser.on('field', (name, value, info) => {
      if (settled) return;
      if (
        name !== 'record' ||
        fieldSeen ||
        info.valueTruncated ||
        info.nameTruncated
      ) {
        fail();
        return;
      }
      fieldSeen = true;
      try {
        record = JSON.parse(value);
      } catch {
        fail();
      }
    });
    parser.on('file', (name, file, info) => {
      stream = file;
      file.on('error', fail);
      if (settled) {
        file.resume();
        return;
      }
      if (name !== 'document' || document) {
        fail();
        return;
      }
      try {
        validateDocumentInput({
          bytes: new Uint8Array([1]),
          fileName: info.filename,
          mediaType: info.mimeType,
        });
      } catch {
        fail();
        return;
      }
      const chunks: Buffer[] = [];
      let fileBytes = 0;
      file.on('limit', fail);
      file.on('data', (chunk: Buffer) => {
        if (settled) return;
        fileBytes += chunk.length;
        if (fileBytes > 5 * 1024 * 1024) {
          fail();
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      file.on('end', () => {
        if (settled) return;
        const bytes = Buffer.concat(chunks);
        if (!bytes.length) {
          fail();
          return;
        }
        document = { bytes, fileName: info.filename, mediaType: info.mimeType };
      });
    });
    for (const event of ['error', 'filesLimit', 'fieldsLimit', 'partsLimit'])
      parser.on(event, fail);
    parser.on('close', () => {
      if (settled) return;
      if (!fieldSeen) {
        fail();
        return;
      }
      settled = true;
      cleanup();
      resolve({ record, ...(document ? { document } : {}) });
    });
    req.on('data', data);
    req.on('end', end);
    req.on('error', fail);
    req.on('aborted', fail);
  });
}
