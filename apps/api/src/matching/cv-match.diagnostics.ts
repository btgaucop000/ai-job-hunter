import type { MatchRequirement } from './cv-match.js';
import { resolveCvQuote } from './cv-match.evidence.js';

export type MatchEvidenceReason =
  | 'JD_QUOTE_EMPTY'
  | 'JD_QUOTE_NOT_VERBATIM'
  | 'AI_TOOLING_FOR_PRODUCTION_REQUIREMENT'
  | 'NO_VERIFIABLE_CV_QUOTES';

// One structured server-side event per rejected or downgraded assessment. Never serialize a
// proposal, error, source, label, or quote; copy only fixed tokens and counts.
export function emitMatchEvidenceRejection(
  reason: MatchEvidenceReason,
  requirementIndex: number,
  proposals: MatchRequirement[],
  cv: string,
  jd: string,
  outcome: 'REJECTED' | 'DOWNGRADED' = 'REJECTED',
): void {
  try {
    const category = proposals[requirementIndex]?.category;
    const cvAccepted = proposals.filter(
      (item) =>
        item.cvQuote.trim() && resolveCvQuote(cv, item.cvQuote) !== null,
    ).length;
    const cvEmpty = proposals.filter((item) => !item.cvQuote.trim()).length;
    const jdAccepted = proposals.filter(
      (item) => item.jdQuote.trim() && jd.includes(item.jdQuote),
    ).length;
    process.stderr.write(
      `${JSON.stringify({
        event: `CV_MATCH_EVIDENCE_${outcome}`,
        reason,
        requirementIndex,
        ...(['skill', 'experience', 'domain'].includes(category ?? '')
          ? { category }
          : {}),
        counts: {
          requirements: proposals.length,
          cvAccepted,
          cvRejected: proposals.length - cvAccepted - cvEmpty,
          cvEmpty,
          jdAccepted,
          jdRejected: proposals.length - jdAccepted,
        },
      })}\n`,
    );
  } catch {
    // Diagnostics must never replace or alter the original matching failure.
  }
}
