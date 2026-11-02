import { AsyncLocalStorage } from 'node:async_hooks';

export const PDF_FAILURE_PHASES = [
  'WORKER_STARTUP',
  'DOCUMENT_LOAD',
  'PAGE_LOAD',
  'TEXT_STREAM',
  'CLEANUP',
  'WORKER_IPC',
  'RESULT_VALIDATION',
] as const;
export const PDF_FAILURE_CATEGORIES = [
  'HEADER_SIGNATURE_REJECTED',
  'PDFJS_DOCUMENT_REJECTED',
  'UNKNOWN_PDFJS',
  'PASSWORD',
  'ABORT',
  'OTHER',
] as const;
export const PDF_WORKER_STATUSES = [
  'MESSAGE',
  'ERROR',
  'MESSAGE_ERROR',
  'EXIT_ZERO',
  'EXIT_NONZERO',
  'TIMEOUT',
] as const;

export type PdfFailurePhase = (typeof PDF_FAILURE_PHASES)[number];
export type PdfFailureCategory = (typeof PDF_FAILURE_CATEGORIES)[number];
export type PdfWorkerStatus = (typeof PDF_WORKER_STATUSES)[number];
export interface PdfWorkerFailureDiagnostic {
  readonly phase: PdfFailurePhase;
  readonly category: PdfFailureCategory;
  readonly recoveryAttempted: boolean;
}
export interface PdfParserDiagnosticRecord extends PdfWorkerFailureDiagnostic {
  readonly requestId: string | null;
  readonly workerStatus: PdfWorkerStatus;
}

type DiagnosticSink = (record: PdfParserDiagnosticRecord) => void;
const requestContext = new AsyncLocalStorage<{
  readonly requestId: string | null;
}>();
const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
let enabled = false;
let sink: DiagnosticSink = (record) => {
  process.stderr.write(`${JSON.stringify(record)}\n`);
};

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function oneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && values.some((item) => item === value);
}
export function sanitizePdfWorkerFailure(
  input: unknown,
): PdfWorkerFailureDiagnostic | undefined {
  const value = object(input);
  if (
    !value ||
    Object.keys(value).length !== 3 ||
    !oneOf(PDF_FAILURE_PHASES, value.phase) ||
    !oneOf(PDF_FAILURE_CATEGORIES, value.category) ||
    typeof value.recoveryAttempted !== 'boolean'
  )
    return undefined;
  return Object.freeze({
    phase: value.phase,
    category: value.category,
    recoveryAttempted: value.recoveryAttempted,
  });
}
export function diagnosticFromError(
  error: unknown,
): PdfWorkerFailureDiagnostic | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const value = Object.getOwnPropertyDescriptor(
    error,
    'parserDiagnostic',
  )?.value;
  return sanitizePdfWorkerFailure(value);
}

export function configurePdfParserDiagnostics(
  requested: boolean,
  host: string,
  testSink?: DiagnosticSink,
): void {
  enabled = requested && (host === '127.0.0.1' || host === '::1');
  sink =
    testSink ??
    ((record) => {
      process.stderr.write(`${JSON.stringify(record)}\n`);
    });
}
export function pdfParserDiagnosticsEnabled(): boolean {
  return enabled;
}
export function withPdfParserDiagnosticRequest<T>(
  requestId: string,
  operation: () => T,
): T {
  return requestContext.run(
    { requestId: requestIdPattern.test(requestId) ? requestId : null },
    operation,
  );
}
export function currentPdfParserDiagnosticRequestId(): string | null {
  return requestContext.getStore()?.requestId ?? null;
}
export function emitPdfParserDiagnostic(
  diagnostic: unknown,
  workerStatus: unknown,
  requestId: string | null = currentPdfParserDiagnosticRequestId(),
): void {
  if (!enabled) return;
  const safe = sanitizePdfWorkerFailure(diagnostic);
  if (!safe || !oneOf(PDF_WORKER_STATUSES, workerStatus)) return;
  sink(
    Object.freeze({
      requestId:
        typeof requestId === 'string' && requestIdPattern.test(requestId)
          ? requestId
          : null,
      ...safe,
      workerStatus,
    }),
  );
}
