import { AsyncLocalStorage } from 'node:async_hooks';

export type ExtractionKind = 'CV' | 'JD';
export type JsonSyntax = 'VALID' | 'INVALID';
export interface FinalLengthDiagnosticRecord {
  readonly requestId: string;
  readonly extractionKind: ExtractionKind;
  readonly reason: 'FINAL_LENGTH';
  readonly promptTokens: number;
  readonly evalCount: number;
  readonly outputTokenLimit: number;
  readonly jsonSyntax: JsonSyntax;
}

interface Context {
  readonly requestId: string;
  readonly extractionKind: ExtractionKind;
  emitted: boolean;
}
type DiagnosticSink = (record: FinalLengthDiagnosticRecord) => void;
const context = new AsyncLocalStorage<Context>();
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
function boundedInteger(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= maximum
  );
}

export function configureAiGenerationDiagnostics(
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

export function aiGenerationDiagnosticsEnabled(): boolean {
  return enabled;
}

export function withAiGenerationDiagnosticRequest<T>(
  requestId: string,
  extractionKind: ExtractionKind,
  operation: () => T,
): T {
  return context.run({ requestId, extractionKind, emitted: false }, operation);
}

export function emitFinalLengthDiagnostic(input: unknown): void {
  if (!enabled) return;
  const owner = context.getStore();
  const value = object(input);
  if (
    !owner ||
    owner.emitted ||
    !requestIdPattern.test(owner.requestId) ||
    !value ||
    Object.keys(value).length !== 4 ||
    !boundedInteger(value.promptTokens, 8192) ||
    !boundedInteger(value.outputTokenLimit, 4096) ||
    value.outputTokenLimit < 2048 ||
    !boundedInteger(value.evalCount, value.outputTokenLimit) ||
    (value.jsonSyntax !== 'VALID' && value.jsonSyntax !== 'INVALID')
  )
    return;
  owner.emitted = true;
  try {
    sink(
      Object.freeze({
        requestId: owner.requestId,
        extractionKind: owner.extractionKind,
        reason: 'FINAL_LENGTH',
        promptTokens: value.promptTokens,
        evalCount: value.evalCount,
        outputTokenLimit: value.outputTokenLimit,
        jsonSyntax: value.jsonSyntax,
      }),
    );
  } catch {
    // Temporary observability must never affect inference behavior.
  }
}
