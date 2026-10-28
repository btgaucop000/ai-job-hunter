import {
  getDocument,
  PasswordResponses,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';
import { BundledPdfResources } from './pdf.resources.js';
import { createExtractionSource } from './extraction.validation.js';
import type { SourceSegment } from './extraction.types.js';
import type { ParsedDocument } from './parser.protocol.js';

const PDF_HEADER_SCAN_BYTES = 1024;
const PDF_HEADER_SIGNATURE = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function hasPdfHeader(bytes: Uint8Array): boolean {
  const scanEnd = Math.min(bytes.length, PDF_HEADER_SCAN_BYTES);
  const lastStart = scanEnd - PDF_HEADER_SIGNATURE.length;
  for (let start = 0; start <= lastStart; start++) {
    let matched = true;
    for (let index = 0; index < PDF_HEADER_SIGNATURE.length; index++) {
      if (bytes[start + index] !== PDF_HEADER_SIGNATURE[index]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

// Called only inside the short-lived parser worker.
export async function parsePdf(bytes: Uint8Array): Promise<ParsedDocument> {
  if (!bytes.length || bytes.length > limits.fileBytes)
    throw new ExtractionError('DOCUMENT_TOO_LARGE');
  if (!hasPdfHeader(bytes)) throw new ExtractionError('PARSING_FAILED');
  const resources = new BundledPdfResources();
  class ResourceFactory {
    fetch(input: { kind: string; filename: string }) {
      return resources.fetch(input);
    }
  }
  const loading = getDocument({
    data: bytes,
    BinaryDataFactory: ResourceFactory,
    useWorkerFetch: false,
    useSystemFonts: false,
    disableFontFace: true,
    useWasm: false,
    enableXfa: false,
    stopAtErrors: true,
    disableAutoFetch: true,
    disableRange: true,
    disableStream: true,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    verbosity: 0,
  });
  let passwordRequested = false;
  loading.onPassword = () => {
    passwordRequested = true;
    void loading.destroy().catch(() => {});
  };
  try {
    const document = await loading.promise;
    if (document.numPages > limits.pdfPages)
      throw new ExtractionError('DOCUMENT_TOO_LARGE');
    let text = '';
    let textBytes = 0;
    const segments: SourceSegment[] = [];
    const warnings: ParsedDocument['warnings'][number][] = [
      { code: 'IMAGE_CONTENT_NOT_INTERPRETED' },
    ];
    const append = (value: string) => {
      textBytes += Buffer.byteLength(value, 'utf8');
      if (
        text.length + value.length > limits.textUnits ||
        textBytes > limits.textBytes
      )
        throw new ExtractionError('DOCUMENT_TOO_LARGE');
      text += value;
    };
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      if (pageNumber > 1) append('\n\n');
      const start = text.length;
      const page = await document.getPage(pageNumber);
      const reader = page
        .streamTextContent({
          disableNormalization: true,
          includeMarkedContent: false,
        })
        .getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const item of value.items) {
            if ('str' in item) {
              append(item.str);
              if (item.hasEOL) append('\n');
            }
          }
          if (resources.failed)
            throw new ExtractionError('RESOURCE_ACCESS_DENIED');
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
        page.cleanup();
      }
      if (text.slice(start).trim())
        segments.push({
          id: `page-${pageNumber}`,
          start,
          end: text.length,
          page: pageNumber,
        });
      else warnings.push({ code: 'PAGE_WITHOUT_TEXT', page: pageNumber });
    }
    if (resources.failed) throw new ExtractionError('RESOURCE_ACCESS_DENIED');
    if (!text.trim()) throw new ExtractionError('NO_EXTRACTABLE_TEXT');
    return {
      source: createExtractionSource({ format: 'pdf', text, segments }),
      pageCount: document.numPages,
      warnings,
    };
  } catch (error: unknown) {
    if (
      passwordRequested ||
      (error instanceof Error &&
        error.name === 'PasswordException' &&
        'code' in error &&
        (error.code === PasswordResponses.NEED_PASSWORD ||
          error.code === PasswordResponses.INCORRECT_PASSWORD))
    )
      throw new ExtractionError('PASSWORD_PROTECTED_DOCUMENT');
    if (resources.failed) throw new ExtractionError('RESOURCE_ACCESS_DENIED');
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError('PARSING_FAILED');
  } finally {
    await loading.destroy();
  }
}
