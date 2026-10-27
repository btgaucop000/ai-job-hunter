import type { AiDiagnostic } from '../ai/ai.errors.js';

export const EXTRACTION_DIAGNOSTIC_FIELDS = [
  'cv',
  'jd',
  'cv.name',
  'cv.email',
  'cv.phone',
  'cv.location',
  'cv.skills[].name',
  'cv.skills[].experienceText',
  'cv.experience[]',
  'cv.education[]',
  'cv.experience[].employer',
  'cv.experience[].title',
  'cv.experience[].startDateText',
  'cv.experience[].endDateText',
  'cv.experience[].descriptionText',
  'cv.education[].institution',
  'cv.education[].qualification',
  'cv.education[].dateText',
  'jd.title',
  'jd.company',
  'jd.location',
  'jd.employmentType',
  'jd.compensationText',
  'jd.requirements[].text',
  'jd.requirements[].priority',
  'jd.responsibilities[]',
] as const;
export type DiagnosticField = (typeof EXTRACTION_DIAGNOSTIC_FIELDS)[number];

export const EXTRACTION_DIAGNOSTIC_RULES = {
  OUTPUT_NOT_SERIALIZABLE: 'OUTPUT',
  SCHEMA_MISMATCH: 'OUTPUT',
  REQUIRED_COLLECTION_VALUE_NULL: 'OUTPUT',
  EMPTY_HISTORY_RECORD: 'OUTPUT',
  SEGMENT_UNKNOWN: 'EVIDENCE',
  QUOTE_EMPTY: 'EVIDENCE',
  QUOTE_TOO_LONG: 'EVIDENCE',
  QUOTE_NOT_FOUND: 'EVIDENCE',
  QUOTE_AMBIGUOUS: 'EVIDENCE',
  QUOTE_BOUNDARY_INVALID: 'EVIDENCE',
  NULL_WITH_EVIDENCE: 'EVIDENCE',
  VALUE_EMPTY: 'EVIDENCE',
  VALUE_TOO_LONG: 'EVIDENCE',
  EVIDENCE_MISSING: 'EVIDENCE',
  EVIDENCE_DUPLICATE: 'EVIDENCE',
  VALUE_UNSUPPORTED: 'EVIDENCE',
  PRIORITY_CUE_MISSING: 'EVIDENCE',
  PRIORITY_LINK_INVALID: 'EVIDENCE',
} as const;
export type DiagnosticRule = keyof typeof EXTRACTION_DIAGNOSTIC_RULES;
export interface ValidationDiagnostic {
  readonly stage: 'OUTPUT' | 'EVIDENCE';
  readonly rule: DiagnosticRule;
  readonly field: DiagnosticField;
}
export type ExtractionDiagnostic = AiDiagnostic | ValidationDiagnostic;

// Copy only fixed tokens, including at service error reconstruction. Never spread
// an error or diagnostic supplied by another boundary.
export function sanitizeDiagnostic(
  code: string,
  input: unknown,
): ValidationDiagnostic | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const stage: unknown = descriptors.stage?.value;
  const rule: unknown = descriptors.rule?.value;
  const field: unknown = descriptors.field?.value;
  if (
    typeof rule !== 'string' ||
    !Object.hasOwn(EXTRACTION_DIAGNOSTIC_RULES, rule)
  )
    return undefined;
  const safeRule = rule as DiagnosticRule;
  if (
    stage !== EXTRACTION_DIAGNOSTIC_RULES[safeRule] ||
    (stage === 'OUTPUT'
      ? code !== 'INVALID_OUTPUT'
      : code !== 'INVALID_EVIDENCE') ||
    !EXTRACTION_DIAGNOSTIC_FIELDS.some((allowed) => allowed === field)
  )
    return undefined;
  return Object.freeze({
    stage: EXTRACTION_DIAGNOSTIC_RULES[safeRule],
    rule: safeRule,
    field: field as DiagnosticField,
  });
}
