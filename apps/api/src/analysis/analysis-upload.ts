import { MultipartTextEncoding } from './analysis-text-encoding.js';
import busboy from 'busboy';
import type { IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';
import {
  validateDocumentInput,
  validateText,
} from '../extraction/extraction.validation.js';
import type { CvExtractionInput } from '../extraction/extraction.types.js';
import { AnalysisError } from './analysis.errors.js';

export const UPLOAD_LIMITS = Object.freeze({
  fileBytes: 5242880,
  fieldBytes: 49152,
  totalBytes: 5357568,
  headerBytes: 16384,
  boundaryUnits: 70,
  uploadMs: 30000,
});
export interface AnalysisUpload {
  cv: CvExtractionInput;
  jdText: string;
}
export function checkUploadHeaders(req: IncomingMessage): string {
  if (req.headers['content-encoding'] !== undefined)
    throw new AnalysisError('UNSUPPORTED_MEDIA_TYPE');
  const type = req.headers['content-type'];
  // One boundary parameter only, quoted or token; bounded ASCII MIME boundary.
  if (typeof type !== 'string' || !/^multipart\/form-data\s*;/iu.test(type))
    throw new AnalysisError('UNSUPPORTED_MEDIA_TYPE');
  const match =
    /^multipart\/form-data\s*;\s*boundary=(?:"([0-9A-Za-z'()+_,./:=? -]+)"|([0-9A-Za-z'()+_,./:=?-]+))\s*$/iu.exec(
      type,
    );
  const boundary = match?.[1] ?? match?.[2];
  if (
    !boundary ||
    boundary.length > UPLOAD_LIMITS.boundaryUnits ||
    boundary.endsWith(' ')
  )
    throw new AnalysisError('INVALID_REQUEST');
  let headerBytes = 0;
  for (const entry of req.rawHeaders)
    headerBytes += Buffer.byteLength(entry) + 4;
  if (headerBytes > UPLOAD_LIMITS.headerBytes)
    throw new AnalysisError('INVALID_REQUEST');
  for (const name of [
    'content-type',
    'content-length',
    'transfer-encoding',
    'content-encoding',
  ]) {
    let count = 0;
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      if (req.rawHeaders[i]!.toLowerCase() === name) count++;
    if (count > 1) throw new AnalysisError('INVALID_REQUEST');
  }
  const length = req.headers['content-length'];
  if (length !== undefined) {
    if (
      !/^\d+$/u.test(length) ||
      req.headers['transfer-encoding'] !== undefined
    )
      throw new AnalysisError('INVALID_REQUEST');
    if (BigInt(length) > BigInt(UPLOAD_LIMITS.totalBytes))
      throw new AnalysisError('REQUEST_TOO_LARGE');
  }
  return boundary;
}
export async function readAnalysisUpload(
  req: IncomingMessage,
  uploadMs: number = UPLOAD_LIMITS.uploadMs,
  signal?: AbortSignal,
): Promise<AnalysisUpload> {
  const boundary = checkUploadHeaders(req);
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
          parts: 3,
          fileSize: UPLOAD_LIMITS.fileBytes + 1,
          fieldSize: UPLOAD_LIMITS.fieldBytes + 1,
        },
      });
    } catch {
      reject(new AnalysisError('INVALID_REQUEST'));
      return;
    }
    const encoding = new MultipartTextEncoding(boundary);
    let settled = false;
    let bytes = 0;
    let cv: CvExtractionInput | undefined;
    let jdText: string | undefined;
    let files = 0;
    let fields = 0;
    let chunks: Buffer[] = [];
    let fileStream: Readable | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAborted);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('aborted', onAborted);
      req.off('error', onError);
      parser.off('drain', onDrain);
      req.pause();
      chunks = [];
      encoding.clear();
      if (fileStream) {
        fileStream.removeAllListeners('data');
        fileStream.destroy();
      }
      parser.destroy();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      // Avoid destroying Busboy from inside its synchronous write callbacks.
      req.pause();
      queueMicrotask(() => {
        cleanup();
        cv = undefined;
        jdText = undefined;
        reject(error);
      });
    };
    const timer = setTimeout(
      () => fail(new AnalysisError('UPLOAD_TIMEOUT')),
      uploadMs,
    );
    timer.unref();
    const onDrain = () => {
      if (!settled) req.resume();
    };
    const onData = (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > UPLOAD_LIMITS.totalBytes) {
        fail(new AnalysisError('REQUEST_TOO_LARGE'));
        return;
      }
      try {
        encoding.write(chunk);
        if (!parser.write(chunk)) req.pause();
      } catch {
        fail(new AnalysisError('INVALID_REQUEST'));
      }
    };
    const onEnd = () => {
      if (settled) return;
      const declared = req.headers['content-length'];
      if (declared !== undefined && Number(declared) !== bytes) {
        fail(new AnalysisError('INVALID_REQUEST'));
        return;
      }
      parser.end();
    };
    const onAborted = () => fail(new AnalysisError('INVALID_REQUEST'));
    const onError = () => fail(new AnalysisError('INVALID_REQUEST'));
    parser.on('error', () => fail(new AnalysisError('INVALID_REQUEST')));
    parser.on('filesLimit', () => fail(new AnalysisError('INVALID_REQUEST')));
    parser.on('fieldsLimit', () => fail(new AnalysisError('INVALID_REQUEST')));
    parser.on('partsLimit', () => fail(new AnalysisError('INVALID_REQUEST')));
    parser.on('file', (name, stream, info) => {
      fileStream = stream;
      stream.on('error', () => fail(new AnalysisError('INVALID_REQUEST')));
      if (settled) return;
      if (
        ++files !== 1 ||
        name !== 'cv' ||
        !info.filename ||
        !['7bit', '8bit', 'binary'].includes(info.encoding)
      ) {
        fail(new AnalysisError('INVALID_REQUEST'));
        return;
      }
      try {
        validateDocumentInput({
          bytes: new Uint8Array([1]),
          fileName: info.filename,
          mediaType: info.mimeType,
        });
      } catch (error: unknown) {
        fail(error);
        return;
      }
      let size = 0;
      stream.on('limit', () => fail(new AnalysisError('DOCUMENT_TOO_LARGE')));
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        size += chunk.length;
        if (size > UPLOAD_LIMITS.fileBytes) {
          fail(new AnalysisError('DOCUMENT_TOO_LARGE'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      stream.on('end', () => {
        if (settled) return;
        if (size === 0) {
          fail(new AnalysisError('INVALID_INPUT'));
          return;
        }
        cv = {
          bytes: Buffer.concat(chunks, size),
          fileName: info.filename,
          mediaType: info.mimeType,
        };
        chunks = [];
      });
    });
    parser.on('field', (name, value, info) => {
      if (settled) return;
      if (
        ++fields !== 1 ||
        name !== 'jdText' ||
        info.mimeType !== 'text/plain' ||
        !['7bit', '8bit', 'binary'].includes(info.encoding)
      ) {
        fail(new AnalysisError('INVALID_REQUEST'));
        return;
      }
      if (info.nameTruncated) {
        fail(new AnalysisError('INVALID_REQUEST'));
        return;
      }
      if (
        info.valueTruncated ||
        Buffer.byteLength(value, 'utf8') > UPLOAD_LIMITS.fieldBytes
      ) {
        fail(new AnalysisError('DOCUMENT_TOO_LARGE'));
        return;
      }
      try {
        jdText = validateText(value);
      } catch (error: unknown) {
        fail(error);
      }
    });
    parser.on('close', () => {
      if (settled) return;
      if (files !== 1 || fields !== 1 || !cv || jdText === undefined) {
        fail(new AnalysisError('INVALID_REQUEST'));
        return;
      }
      settled = true;
      const result = { cv, jdText };
      cleanup();
      cv = undefined;
      jdText = undefined;
      resolve(result);
    });
    parser.on('drain', onDrain);
    req.on('aborted', onAborted);
    req.on('error', onError);
    req.on('end', onEnd);
    req.on('data', onData);
    signal?.addEventListener('abort', onAborted, { once: true });
    if (signal?.aborted) onAborted();
  });
}
