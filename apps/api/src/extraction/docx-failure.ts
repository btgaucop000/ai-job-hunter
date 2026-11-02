// Fixed tokens only: never carry filenames, document text or library messages.
export const DOCX_FAILURE_REASONS = [
  'ZIP_INVALID',
  'ZIP_UNSUPPORTED_PROFILE',
  'PACKAGE_INVALID',
  'TEXT_EXTRACTION_FAILED',
  'WORKER_FAILED',
] as const;
export type DocxFailureReason = (typeof DOCX_FAILURE_REASONS)[number];
export function sanitizeDocxFailure(
  value: unknown,
): DocxFailureReason | undefined {
  return typeof value === 'string' &&
    DOCX_FAILURE_REASONS.some((reason) => reason === value)
    ? (value as DocxFailureReason)
    : undefined;
}
