import { AiError } from '../../src/ai/ai.errors.js';
import { sanitizeDiagnostic } from '../../src/extraction/extraction.diagnostics.js';
import type { ExtractionDiagnostic } from '../../src/extraction/extraction.diagnostics.js';
import { errorCode, LiveError } from './live-errors.js';
import type { LiveCode } from './live-errors.js';

export const INVESTIGATION_IDS = Object.freeze([
  'cv-duration-docx',
  'jd-mixed',
  'jd-injection',
  'jd-negation',
] as const);
export type InvestigationId = (typeof INVESTIGATION_IDS)[number];
export function investigationAllowed(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): boolean {
  const options = args.filter((arg) => arg !== '--');
  return (
    env.CI === undefined &&
    options.length === 1 &&
    options[0] === '--allow-local-investigation'
  );
}
// Separate instances in parent and child; consume before work, never roll back.
export class InvestigationAdmission {
  private next = 0;
  take(id: unknown): InvestigationId {
    if (
      this.next >= INVESTIGATION_IDS.length ||
      id !== INVESTIGATION_IDS[this.next]
    )
      throw new LiveError('INVALID_INPUT');
    return INVESTIGATION_IDS[this.next++]!;
  }
}
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
export class InvestigationError extends LiveError {
  readonly diagnostic: ExtractionDiagnostic | null;
  constructor(code: LiveCode, diagnostic: unknown) {
    super(code);
    const validation = sanitizeDiagnostic(code, diagnostic);
    const expected =
      code === 'INVALID_JSON' || code === 'SCHEMA_VALIDATION_FAILURE'
        ? new AiError(code).diagnostic
        : undefined;
    this.diagnostic =
      validation ??
      (expected &&
      own(diagnostic, 'stage') === expected.stage &&
      own(diagnostic, 'rule') === expected.rule &&
      own(diagnostic, 'field') === expected.field
        ? expected
        : null);
  }
}
export function investigationError(value: unknown): InvestigationError {
  return new InvestigationError(
    errorCode({ code: own(value, 'code') }),
    own(value, 'diagnostic'),
  );
}
export function returned(value: unknown): 'RETURNED' {
  if (value !== 'RETURNED') throw new LiveError('UNEXPECTED_FAILURE');
  return value;
}
