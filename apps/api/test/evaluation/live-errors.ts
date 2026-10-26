// Only these codes may cross the child/report boundary. Never serialize messages.
export const LIVE_CODES = [
  'CONTEXT_UNVERIFIED',
  'CONTEXT_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED',
  'INVALID_SCHEMA',
  'TIMEOUT',
  'CONNECTION_FAILURE',
  'UPSTREAM_HTTP_FAILURE',
  'MALFORMED_RESPONSE',
  'INVALID_JSON',
  'SCHEMA_VALIDATION_FAILURE',
  'RESPONSE_TOO_LARGE',
  'EXTRACTION_BUSY',
  'EXTRACTION_UNAVAILABLE',
  'EXTRACTION_FAILED',
  'PROMPT_TOO_LARGE',
  'DUPLICATE_FACT',
  'PARSING_FAILED',
  'PARSING_TIMEOUT',
  'PARSER_BUSY',
  'PARSER_UNAVAILABLE',
  'PASSWORD_PROTECTED_DOCUMENT',
  'RESOURCE_ACCESS_DENIED',
  'INVALID_INPUT',
  'UNSUPPORTED_FILE_TYPE',
  'DOCUMENT_TOO_LARGE',
  'NO_EXTRACTABLE_TEXT',
  'INVALID_SOURCE',
  'INVALID_OUTPUT',
  'OUTPUT_TOO_LARGE',
  'INVALID_EVIDENCE',
  'OUTER_DEADLINE',
  'INTERRUPTED',
  'CHILD_EXIT',
  'SETUP_FAILURE',
  'CLEANUP_FAILURE',
  'UNEXPECTED_FAILURE',
] as const;
export type LiveCode = (typeof LIVE_CODES)[number];
export function errorCode(error: unknown): LiveCode {
  const code =
    error !== null && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  return typeof code === 'string' &&
    (LIVE_CODES as readonly string[]).includes(code)
    ? (code as LiveCode)
    : 'UNEXPECTED_FAILURE';
}
export class LiveError extends Error {
  constructor(readonly code: LiveCode) {
    super(code);
  }
}
export function infrastructure(code: LiveCode): boolean {
  return ![
    'CONTEXT_LIMIT_EXCEEDED',
    'OUTPUT_LIMIT_EXCEEDED',
    'INVALID_JSON',
    'SCHEMA_VALIDATION_FAILURE',
    'RESPONSE_TOO_LARGE',
    'PROMPT_TOO_LARGE',
    'DUPLICATE_FACT',
    'PARSING_FAILED',
    'PASSWORD_PROTECTED_DOCUMENT',
    'DOCUMENT_TOO_LARGE',
    'NO_EXTRACTABLE_TEXT',
    'INVALID_OUTPUT',
    'OUTPUT_TOO_LARGE',
    'INVALID_EVIDENCE',
  ].includes(code);
}
