import type { EvidenceReference } from './extraction.types.js';

import type { PartialField } from './partial-proposal.contract.js';
export type { PartialField } from './partial-proposal.contract.js';
export type TitleReviewReason =
  'JD_TITLE_GENERIC_HEADING' | 'JD_TITLE_AMBIGUOUS';
export type PartialEvidence = EvidenceReference & {
  valueStart: number;
  valueEnd: number;
};
export type ReviewReason =
  | TitleReviewReason
  | 'MALFORMED_CANDIDATE'
  | 'EVIDENCE_NOT_FOUND'
  | 'AMBIGUOUS_EVIDENCE'
  | 'VALUE_UNSUPPORTED'
  | 'CONTEXT_REQUIRES_REVIEW'
  | 'CONFLICTING_CANDIDATES';
// Deliberately incompatible with extraction-v1 facts/envelopes.
export type PartialFact =
  | {
      status: 'VALID';
      value: string;
      evidence: PartialEvidence;
      reason: null;
    }
  | {
      status: 'NEEDS_REVIEW';
      value: string | null;
      evidence: null;
      reason: Exclude<ReviewReason, TitleReviewReason>;
    }
  | {
      status: 'NEEDS_REVIEW';
      value: string;
      evidence: PartialEvidence;
      reason: TitleReviewReason;
    }
  | { status: 'MISSING'; value: null; evidence: null; reason: 'NO_CANDIDATE' };
export interface PartialDocument {
  contractVersion: 'partial-v1';
  kind: 'cv' | 'jd';
  generationError: string | null;
  rejectedCandidateCount: number;
  rejectedProposals: readonly {
    index: number;
    reason: 'MALFORMED_PROPOSAL' | 'UNSUPPORTED_FIELD';
  }[];
  // An absent list is represented by one MISSING entry, never a fabricated fact.
  fields: PartialDocumentFields;
}
export type PartialDocumentFields = Partial<
  Record<PartialField, readonly PartialFact[]>
>;
