// Browser-owned partial-v1 projection. Never a matching input.
export type PartialField =
  'name' | 'email' | 'phone' | 'skills' | 'title' | 'requirements';
export interface PartialEvidence {
  segmentId: string;
  quote: string;
  start: number;
  end: number;
  valueStart: number;
  valueEnd: number;
}
export type PartialFact =
  | { status: 'VALID'; value: string; reason: null; evidence: PartialEvidence }
  | {
      status: 'NEEDS_REVIEW';
      value: string | null;
      reason: string;
      evidence: PartialEvidence | null;
    }
  | { status: 'MISSING'; value: null; reason: 'NO_CANDIDATE'; evidence: null };
export interface PartialDocument {
  contractVersion: 'partial-v1';
  kind: 'cv' | 'jd';
  generationError: string | null;
  rejectedCandidateCount: number;
  rejectedProposals?: readonly {
    index: number;
    reason: 'MALFORMED_PROPOSAL' | 'UNSUPPORTED_FIELD';
  }[];
  fields: Partial<Record<PartialField, readonly PartialFact[]>>;
}
