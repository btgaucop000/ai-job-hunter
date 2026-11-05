import type { MatchResult } from './cv-match.types';

type MatchRow = MatchResult['requirements'][number];
export type SuggestionMatch = MatchResult & {
  matchId: string;
  cvUpdatedAt: string;
  jobUpdatedAt: string;
};
interface EvidenceLink {
  parentId: string;
  componentId: string;
  cvUpdatedAt: string;
  jobUpdatedAt: string;
  quote: string;
}
export interface SuggestionCard {
  id: string;
  rank: number;
  parentId: string;
  componentIds: string[];
  requirement: string;
  priority: 'required' | 'preferred';
  status: MatchRow['status'];
  kind: 'clarify' | 'surface_evidence';
  reason: string;
  wording: string | null;
  clarification: string | null;
  jdEvidence: (EvidenceLink & { source: 'canonical_saved_job_requirement' })[];
  cvEvidence: (EvidenceLink & {
    source: 'saved_cv_text';
    role: 'support' | 'contradiction';
    span: { start: number; end: number } | null;
  })[];
}
export interface CvSuggestionsResponse {
  contractVersion: '1';
  matchId: string;
  cvUpdatedAt: string;
  jobUpdatedAt: string;
  generatedAt: string;
  suggestions: SuggestionCard[];
}
export function validSourceDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim();
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function hasSuggestionContext(
  match: MatchResult,
): match is SuggestionMatch {
  return (
    typeof match.matchId === 'string' &&
    /^[A-Za-z0-9_-]{1,100}$/u.test(match.matchId) &&
    validSourceDate(match.analyzedAt) &&
    validSourceDate(match.cvUpdatedAt) &&
    validSourceDate(match.jobUpdatedAt) &&
    match.requirements.every(
      (row) =>
        nonempty(row.parentId) &&
        row.coverage &&
        row.coverage.components.every(
          (component) =>
            nonempty(component.id) &&
            nonempty(component.label) &&
            nonempty(component.jdQuote),
        ) &&
        new Set(row.coverage.components.map(({ id }) => id)).size ===
          row.coverage.components.length,
    ) &&
    new Set(match.requirements.map(({ parentId }) => parentId)).size ===
      match.requirements.length
  );
}

export function sameSuggestionSource(
  value: unknown,
  match: SuggestionMatch,
): boolean {
  return (
    object(value) &&
    value.matchId === match.matchId &&
    value.cvUpdatedAt === match.cvUpdatedAt &&
    value.jobUpdatedAt === match.jobUpdatedAt
  );
}
export function isSuggestionsResponse(
  value: unknown,
  match: SuggestionMatch,
): value is CvSuggestionsResponse {
  if (
    !object(value) ||
    value.contractVersion !== '1' ||
    !sameSuggestionSource(value, match) ||
    !validSourceDate(value.generatedAt) ||
    !Array.isArray(value.suggestions) ||
    value.suggestions.length > 5
  )
    return false;
  const ids = new Set<string>();
  const parents = new Set<string>();
  return value.suggestions.every((candidate: unknown, index: number) => {
    if (!object(candidate)) return false;
    const row = match.requirements.find(
      ({ parentId }) => parentId === candidate.parentId,
    );
    const components = row?.coverage?.components;
    if (
      !row ||
      !components ||
      !nonempty(candidate.id) ||
      ids.has(candidate.id) ||
      parents.has(row.parentId!) ||
      candidate.rank !== index + 1 ||
      candidate.requirement !== row.requirement ||
      candidate.status !== row.status ||
      candidate.priority !== row.priority ||
      !nonempty(candidate.reason) ||
      !Array.isArray(candidate.componentIds) ||
      !candidate.componentIds.length ||
      new Set(candidate.componentIds).size !== candidate.componentIds.length ||
      !candidate.componentIds.every((id: unknown) =>
        components.some((component) => component.id === id),
      ) ||
      !Array.isArray(candidate.jdEvidence) ||
      candidate.jdEvidence.length !== components.length ||
      !Array.isArray(candidate.cvEvidence)
    )
      return false;
    const cvEvidence = candidate.cvEvidence;
    const validLink = (ref: unknown): ref is Record<string, unknown> =>
      object(ref) &&
      ref.parentId === row.parentId &&
      ref.cvUpdatedAt === match.cvUpdatedAt &&
      ref.jobUpdatedAt === match.jobUpdatedAt &&
      nonempty(ref.quote) &&
      components.some(({ id }) => id === ref.componentId);
    const jdIds = new Set<string>();
    if (
      !candidate.jdEvidence.every((ref: unknown) => {
        if (
          !validLink(ref) ||
          ref.source !== 'canonical_saved_job_requirement' ||
          components.find(({ id }) => id === ref.componentId)?.jdQuote !==
            ref.quote ||
          jdIds.has(ref.componentId as string)
        )
          return false;
        jdIds.add(ref.componentId as string);
        return true;
      })
    )
      return false;
    if (
      !cvEvidence.every((ref: unknown) => {
        if (!validLink(ref) || ref.source !== 'saved_cv_text') return false;
        const component = components.find(({ id }) => id === ref.componentId)!;
        if (
          ref.role === 'support'
            ? ref.quote !== component.cvQuote
            : ref.role !== 'contradiction' ||
              !component.conflictingQuotes.includes(ref.quote as string)
        )
          return false;
        // The browser has excerpts only: validate UTF-16 range shape/length and
        // exact match-evidence text, not an unavailable full-source slice.
        return (
          ref.span === null ||
          (object(ref.span) &&
            Number.isSafeInteger(ref.span.start) &&
            Number.isSafeInteger(ref.span.end) &&
            (ref.span.start as number) >= 0 &&
            (ref.span.end as number) - (ref.span.start as number) ===
              (ref.quote as string).length)
        );
      })
    )
      return false;
    // Do not let a malformed card silently omit contradictory/source evidence
    // already displayed by this match. No additional source interpretation.
    for (const component of components) {
      if (
        component.cvQuote &&
        !cvEvidence.some(
          (ref: unknown) =>
            validLink(ref) &&
            ref.componentId === component.id &&
            ref.role === 'support' &&
            ref.quote === component.cvQuote,
        )
      )
        return false;
      if (
        !component.conflictingQuotes.every((quote) =>
          cvEvidence.some(
            (ref: unknown) =>
              validLink(ref) &&
              ref.componentId === component.id &&
              ref.role === 'contradiction' &&
              ref.quote === quote,
          ),
        )
      )
        return false;
    }
    if (candidate.kind === 'clarify') {
      if (candidate.wording !== null || !nonempty(candidate.clarification))
        return false;
    } else if (candidate.kind === 'surface_evidence') {
      if (
        !['EVIDENCED', 'PARTIAL'].includes(row.status) ||
        row.coverage?.mode === 'UNKNOWN' ||
        components.some(
          (component) =>
            component.status === 'CONFLICT' ||
            component.conflictingQuotes.length,
        ) ||
        candidate.clarification !== null ||
        !nonempty(candidate.wording) ||
        !cvEvidence.some(
          (ref: unknown) =>
            validLink(ref) &&
            ref.role === 'support' &&
            ref.span !== null &&
            ref.quote === candidate.wording &&
            (candidate.componentIds as string[]).includes(
              ref.componentId as string,
            ) &&
            components.find(({ id }) => id === ref.componentId)?.status ===
              'EVIDENCED',
        )
      )
        return false;
    } else return false;
    ids.add(candidate.id);
    parents.add(row.parentId!);
    return true;
  });
}
