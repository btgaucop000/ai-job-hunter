const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const reasons = [
  'MALFORMED_CANDIDATE',
  'EVIDENCE_NOT_FOUND',
  'AMBIGUOUS_EVIDENCE',
  'VALUE_UNSUPPORTED',
  'CONTEXT_REQUIRES_REVIEW',
  'CONFLICTING_CANDIDATES',
];
export function isPartialDocument(
  value: unknown,
  text: string,
  kind: 'cv' | 'jd',
  errorCodes: readonly string[],
): boolean {
  if (
    !record(value) ||
    value.contractVersion !== 'partial-v1' ||
    value.kind !== kind ||
    (value.generationError !== null &&
      !errorCodes.includes(String(value.generationError))) ||
    !count(value.rejectedCandidateCount) ||
    value.rejectedCandidateCount > 15 ||
    !record(value.fields)
  )
    return false;
  if (
    value.rejectedProposals !== undefined &&
    (!Array.isArray(value.rejectedProposals) ||
      value.rejectedProposals.length > 15 ||
      !value.rejectedProposals.every(
        (item: unknown) =>
          record(item) &&
          count(item.index) &&
          item.index < 15 &&
          ['MALFORMED_PROPOSAL', 'UNSUPPORTED_FIELD'].includes(
            String(item.reason),
          ),
      ))
  )
    return false;
  const fields =
    kind === 'cv'
      ? ['name', 'email', 'phone', 'skills']
      : ['title', 'requirements'];
  if (Object.keys(value.fields).length !== fields.length) return false;
  return fields.every((field) => {
    const facts = (value.fields as Record<string, unknown>)[field];
    return (
      Array.isArray(facts) &&
      facts.length >= 1 &&
      facts.length <= (['skills', 'requirements'].includes(field) ? 12 : 1) &&
      facts.every((fact: unknown) => {
        if (!record(fact)) return false;
        if (fact.status === 'MISSING')
          return (
            fact.value === null &&
            fact.evidence === null &&
            fact.reason === 'NO_CANDIDATE'
          );
        const titleReview =
          fact.status === 'NEEDS_REVIEW' &&
          kind === 'jd' &&
          field === 'title' &&
          ['JD_TITLE_GENERIC_HEADING', 'JD_TITLE_AMBIGUOUS'].includes(
            String(fact.reason),
          );
        if (fact.status === 'NEEDS_REVIEW' && !titleReview)
          return (
            (fact.value === null ||
              (typeof fact.value === 'string' && fact.value.length <= 120)) &&
            fact.evidence === null &&
            reasons.includes(String(fact.reason))
          );
        if (
          (!titleReview && (fact.status !== 'VALID' || fact.reason !== null)) ||
          typeof fact.value !== 'string' ||
          !fact.value.trim() ||
          fact.value.length > 120 ||
          !record(fact.evidence)
        )
          return false;
        const e = fact.evidence;
        return (
          typeof e.segmentId === 'string' &&
          Boolean(e.segmentId) &&
          typeof e.quote === 'string' &&
          Boolean(e.quote.trim()) &&
          e.quote.length <= 240 &&
          count(e.start) &&
          count(e.end) &&
          count(e.valueStart) &&
          count(e.valueEnd) &&
          e.start <= e.valueStart &&
          e.valueStart < e.valueEnd &&
          e.valueEnd <= e.end &&
          e.end <= text.length &&
          text.slice(e.start, e.end) === e.quote &&
          text.slice(e.valueStart, e.valueEnd) === fact.value
        );
      })
    );
  });
}
