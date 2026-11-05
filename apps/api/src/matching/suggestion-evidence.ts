import { resolveCvQuote } from './cv-match.evidence.js';
import { immutableValue, type SourceRevisions } from './match-context.js';

interface RequirementLink extends SourceRevisions {
  readonly parentId: string;
  readonly componentId: string;
}
export interface CvEvidenceReference extends RequirementLink {
  readonly source: 'saved_cv_text';
  readonly quote: string;
  readonly span: { readonly start: number; readonly end: number } | null;
  readonly role: 'support' | 'contradiction';
}
export interface JobEvidenceReference extends RequirementLink {
  readonly source: 'canonical_saved_job_requirement';
  readonly quote: string;
}

export function cvEvidenceReference(
  source: string,
  quote: string,
  link: RequirementLink,
  role: CvEvidenceReference['role'],
): CvEvidenceReference | null {
  const original = resolveCvQuote(source, quote);
  if (!original) return null;
  const start = source.indexOf(original);
  const unique = source.indexOf(original, start + 1) < 0;
  return immutableValue({
    ...link,
    source: 'saved_cv_text' as const,
    quote: original,
    role,
    span: unique ? { start, end: start + original.length } : null,
  });
}
export function jobEvidenceReference(
  parentQuote: string,
  quote: string,
  link: RequirementLink,
): JobEvidenceReference | null {
  if (!quote.trim() || !parentQuote.includes(quote)) return null;
  return immutableValue({
    ...link,
    source: 'canonical_saved_job_requirement' as const,
    quote,
  });
}
