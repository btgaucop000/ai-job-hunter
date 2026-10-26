const messages = {
  EXTRACTION_BUSY: 'Extraction is busy',
  EXTRACTION_UNAVAILABLE: 'Extraction is unavailable',
  EXTRACTION_FAILED: 'Extraction failed',
  PROMPT_TOO_LARGE: 'Extraction prompt exceeds the size limit',
  DUPLICATE_FACT: 'Extraction contains duplicate facts',

  PARSING_FAILED: 'Document parsing failed',
  PARSING_TIMEOUT: 'Document parsing timed out',
  PARSER_BUSY: 'Document parser is busy',
  PARSER_UNAVAILABLE: 'Document parser is unavailable',
  PASSWORD_PROTECTED_DOCUMENT: 'Password-protected documents are unsupported',
  RESOURCE_ACCESS_DENIED: 'Document resource access is not permitted',
  INVALID_INPUT: 'Invalid extraction input',
  UNSUPPORTED_FILE_TYPE: 'Unsupported document type',
  DOCUMENT_TOO_LARGE: 'Document exceeds the size limit',
  NO_EXTRACTABLE_TEXT:
    'No usable text; image-only documents require unsupported OCR',
  INVALID_SOURCE: 'Invalid extraction source',
  INVALID_OUTPUT: 'Extraction output does not match the contract',
  OUTPUT_TOO_LARGE: 'Extraction output exceeds the size limit',
  INVALID_EVIDENCE: 'Extraction evidence is missing, ambiguous or invalid',
} as const;
export class ExtractionError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'ExtractionError';
  }
}
