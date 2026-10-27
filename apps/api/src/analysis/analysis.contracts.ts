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
interface ResponseBase {
  contractVersion: '1';
  requestId: string;
  stages: StageSummary;
}
export type AnalysisResponseDto = ResponseBase &
  (
    | { outcome: 'COMPLETED'; result: MatchingResultDto; error: null }
    | { outcome: 'INCOMPLETE'; result: null; error: AnalysisErrorDto }
  );
export const initialStages = (): StageSummary => ({
  upload: 'NOT_RUN',
  cv: 'NOT_RUN',
  jd: 'NOT_RUN',
  matching: 'NOT_RUN',
});
