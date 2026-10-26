import mammoth from 'mammoth';
import { inspectDocxZip } from './docx-zip.js';
import { validateDocxPackage } from './docx-package.validation.js';
import {
  createExtractionSource,
  validateText,
} from './extraction.validation.js';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';
import type { SourceSegment } from './extraction.types.js';
import type { ParsedDocument } from './parser.protocol.js';

export async function parseDocx(bytes: Uint8Array): Promise<ParsedDocument> {
  try {
    const buffer = Buffer.from(bytes); // Same immutable archive is used for both passes.
    const pkg = await inspectDocxZip(buffer);
    validateDocxPackage(pkg);
    const result = await mammoth.extractRawText({ buffer });
    if (result.messages.some((message) => message.type === 'error'))
      throw new ExtractionError('PARSING_FAILED');
    const text = validateText(result.value);
    const segments: SourceSegment[] = [];
    // Retain all delimiters in text. Segments reference paragraph spans without rewriting.
    let start = 0;
    for (const match of text.matchAll(/\n\n/g)) {
      if (text.slice(start, match.index).trim())
        segments.push({
          id: `paragraph-${segments.length + 1}`,
          start,
          end: match.index,
          page: null,
        });
      start = match.index + 2;
    }
    if (text.slice(start).trim())
      segments.push({
        id: `paragraph-${segments.length + 1}`,
        start,
        end: text.length,
        page: null,
      });
    if (segments.length > limits.segments)
      throw new ExtractionError('DOCUMENT_TOO_LARGE');
    return {
      source: createExtractionSource({ format: 'docx', text, segments }),
      pageCount: null,
      warnings: [
        { code: 'IMAGE_CONTENT_NOT_INTERPRETED' },
        ...(result.messages.length
          ? [{ code: 'DOCX_CONTENT_WARNING' as const }]
          : []),
      ],
    };
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError('PARSING_FAILED');
  }
}
