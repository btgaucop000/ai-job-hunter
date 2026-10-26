import { ExtractionError } from './extraction.errors.js';
import { createExtractionSource } from './extraction.validation.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';
import type { ExtractionSource } from './extraction.types.js';

export interface ParsedDocument {
  readonly source: ExtractionSource;
  readonly pageCount: number | null;
  readonly warnings: readonly (
    | { readonly code: 'IMAGE_CONTENT_NOT_INTERPRETED' }
    | { readonly code: 'DOCX_CONTENT_WARNING' }
    | { readonly code: 'PAGE_WITHOUT_TEXT'; readonly page: number }
  )[];
}
export const parserErrorCodes = [
  'PARSING_FAILED',
  'DOCUMENT_TOO_LARGE',
  'NO_EXTRACTABLE_TEXT',
  'PASSWORD_PROTECTED_DOCUMENT',
  'RESOURCE_ACCESS_DENIED',
] as const;
export type ParserErrorCode = (typeof parserErrorCodes)[number];
export interface ParseRequest {
  readonly version: 1;
  readonly format: 'pdf' | 'docx';
  readonly bytes: Uint8Array;
}
export type ParseResponse =
  | { readonly version: 1; readonly ok: true; readonly result: ParsedDocument }
  | { readonly version: 1; readonly ok: false; readonly code: ParserErrorCode };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ExtractionError('PARSING_FAILED');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, names: string[]): void {
  if (
    Object.keys(value).length !== names.length ||
    names.some((name) => !Object.hasOwn(value, name))
  )
    throw new ExtractionError('PARSING_FAILED');
}
export function validateParseRequest(input: unknown): ParseRequest {
  const request = object(input);
  keys(request, ['version', 'format', 'bytes']);
  if (
    request.version !== 1 ||
    !['pdf', 'docx'].includes(String(request.format)) ||
    !(request.bytes instanceof Uint8Array) ||
    request.bytes.byteLength === 0 ||
    request.bytes.byteLength > limits.fileBytes
  )
    throw new ExtractionError('PARSING_FAILED');
  return request as unknown as ParseRequest;
}
export function validateParseResponse(input: unknown): ParseResponse {
  try {
    const message = object(input);
    if (message.version !== 1) throw new Error();
    if (message.ok === false) {
      keys(message, ['version', 'ok', 'code']);
      if (!parserErrorCodes.some((code) => code === message.code))
        throw new Error();
      return { version: 1, ok: false, code: message.code as ParserErrorCode };
    }
    keys(message, ['version', 'ok', 'result']);
    if (message.ok !== true) throw new Error();
    const result = object(message.result);
    keys(result, ['source', 'pageCount', 'warnings']);
    const validatedSource = createExtractionSource(result.source);
    if (validatedSource.format === 'docx') {
      if (
        result.pageCount !== null ||
        !Array.isArray(result.warnings) ||
        result.warnings.length < 1 ||
        result.warnings.length > 2
      )
        throw new Error();
      const warnings: ParsedDocument['warnings'][number][] = [];
      for (const raw of result.warnings) {
        const warning = object(raw);
        keys(warning, ['code']);
        if (
          (warning.code !== 'IMAGE_CONTENT_NOT_INTERPRETED' &&
            warning.code !== 'DOCX_CONTENT_WARNING') ||
          warnings.some((item) => item.code === warning.code)
        )
          throw new Error();
        warnings.push(Object.freeze({ code: warning.code }));
      }
      if (
        !warnings.some((item) => item.code === 'IMAGE_CONTENT_NOT_INTERPRETED')
      )
        throw new Error();
      return {
        version: 1,
        ok: true,
        result: Object.freeze({
          source: validatedSource,
          pageCount: null,
          warnings: Object.freeze(warnings),
        }),
      };
    }

    if (
      typeof result.pageCount !== 'number' ||
      !Number.isInteger(result.pageCount) ||
      result.pageCount < 1 ||
      result.pageCount > limits.pdfPages
    )
      throw new Error();
    const pageCount = result.pageCount;
    const source = validatedSource;
    if (
      source.format !== 'pdf' ||
      source.segments.some((segment) => segment.page! > pageCount)
    )
      throw new Error();
    if (
      !Array.isArray(result.warnings) ||
      result.warnings.length > result.pageCount + 1
    )
      throw new Error();
    const warnings: ParsedDocument['warnings'][number][] = [];
    const emptyPages = new Set<number>();
    for (const raw of result.warnings) {
      const warning = object(raw);
      if (warning.code === 'IMAGE_CONTENT_NOT_INTERPRETED') {
        keys(warning, ['code']);
        if (warnings.some((item) => item.code === warning.code))
          throw new Error();
        warnings.push(Object.freeze({ code: 'IMAGE_CONTENT_NOT_INTERPRETED' }));
      } else {
        keys(warning, ['code', 'page']);
        if (
          warning.code !== 'PAGE_WITHOUT_TEXT' ||
          typeof warning.page !== 'number' ||
          !Number.isInteger(warning.page) ||
          warning.page < 1 ||
          warning.page > result.pageCount ||
          emptyPages.has(warning.page)
        )
          throw new Error();
        emptyPages.add(warning.page);
        warnings.push(
          Object.freeze({ code: 'PAGE_WITHOUT_TEXT', page: warning.page }),
        );
      }
    }
    if (!warnings.some((item) => item.code === 'IMAGE_CONTENT_NOT_INTERPRETED'))
      throw new Error();
    // Each page has exactly one text segment or an explicit empty-page warning.
    const pages = new Set(source.segments.map((segment) => segment.page));
    if (pages.size !== source.segments.length) throw new Error();
    for (let page = 1; page <= result.pageCount; page++) {
      if (pages.has(page) === emptyPages.has(page)) throw new Error();
    }
    return {
      version: 1,
      ok: true,
      result: Object.freeze({
        source,
        pageCount: result.pageCount,
        warnings: Object.freeze(warnings),
      }),
    };
  } catch {
    throw new ExtractionError('PARSING_FAILED');
  }
}
