import type { PartialDocument } from '../extraction/partial-extraction.types.js';
import type { MatchingResult } from '../matching/matching.types.js';
import type { ExtractionDiagnostic } from '../extraction/extraction.diagnostics.js';
import type { AnalysisErrorCode } from './analysis.errors.js';

export type StageStatus =
  'NOT_RUN' | 'SUCCEEDED' | 'REJECTED' | 'TIMED_OUT' | 'FAILED';
export interface StageSummary {
  upload: StageStatus;
  cv: StageStatus;
  jd: StageStatus;
  matching: StageStatus;
}
// MatchingResult is already the public result projection: no source envelopes,
// raw output or CV contact data. Preserve every score, exclusion and evidence link.
export type MatchingResultDto = MatchingResult;
export interface AnalysisErrorDto {
  stage: 'REQUEST' | 'CV' | 'JD' | 'MATCHING';
  code: AnalysisErrorCode;
  diagnostic: ExtractionDiagnostic | null;
}
// Source visibility is separate from extraction-v1. A parsed document never
// implies validated facts; null facts cannot enter the matching service.
export interface AnalysisDocumentDto {
  partial?: PartialDocument;
  text: string;
  facts: readonly { path: string; value: string | null }[] | null;
}
export interface AnalysisDocumentsDto {
  cv: AnalysisDocumentDto | null;
  jd: AnalysisDocumentDto | null;
}
interface ResponseBase {
  documents?: AnalysisDocumentsDto;
  contractVersion: '1';
  requestId: string;
  stages: StageSummary;
}
export type AnalysisResponseDto = ResponseBase &
  (
    | { outcome: 'PARTIAL'; result: null; error: null }
    | { outcome: 'PARSED'; result: null; error: null }
    | { outcome: 'COMPLETED'; result: MatchingResultDto; error: null }
    | { outcome: 'INCOMPLETE'; result: null; error: AnalysisErrorDto }
  );
export const initialStages = (): StageSummary => ({
  upload: 'NOT_RUN',
  cv: 'NOT_RUN',
  jd: 'NOT_RUN',
  matching: 'NOT_RUN',
});
