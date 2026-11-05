import {
  immutableValue,
  type Immutable,
  type MatchSnapshot,
  type SavedCvAssessment,
} from './match-context.js';
import {
  cvEvidenceReference,
  jobEvidenceReference,
  type CvEvidenceReference,
  type JobEvidenceReference,
} from './suggestion-evidence.js';

type Requirement = SavedCvAssessment['requirements'][number];
export interface SuggestionCandidate {
  readonly parentId: string;
  readonly componentIds: readonly string[];
  readonly requirement: string;
  readonly priority: Requirement['priority'];
  readonly status: Requirement['status'];
  readonly kind: 'clarify' | 'surface_evidence';
  readonly reason: string;
  readonly clarification: string | null;
  readonly wording: string | null;
  readonly jdEvidence: readonly JobEvidenceReference[];
  readonly cvEvidence: readonly CvEvidenceReference[];
}

// Deliberately narrow: no general entailment or section/role ownership inference.
function safeStandalonePassage(source: string, quote: string): boolean {
  if (
    quote.length > 2000 ||
    /\b(?:not|no|never|without|only|prototype|aspir\w*|seeking|interested|hope|plan|learning|pursuing|pending|expected|might|may|could|would|team|we|they)\b|n['’]t\b|\b(?:không|chưa)\b/iu.test(
      quote,
    )
  )
    return false;
  // Skills declarations do not assign an employer/project or experience duration.
  if (/^(?:technical )?skills:\s*[^\r\n]+$/iu.test(quote))
    return source.trim() === quote;
  // Keep the whole single entry, including attribution and qualifiers. Multiple
  // entries or missing surrounding context require clarification instead.
  return (
    source.trim() === quote &&
    !/\n\s*\n/u.test(quote) &&
    quote.split(/\r?\n/u).length <= 3 &&
    quote
      .split(/\r?\n/u)
      .slice(1)
      .every((line) => /^(?:Scope|Duration|Qualification):/u.test(line)) &&
    /^(?:Built|Developed|Designed|Implemented|Delivered|I built|I developed)\b/u.test(
      quote,
    )
  );
}
function urgency(row: Requirement): number {
  if (row.status === 'CONFLICT') return 0;
  if (row.status !== 'EVIDENCED') return row.priority === 'required' ? 1 : 2;
  return 3;
}

// The caller must resolve this immutable snapshot against current source revisions
// before and after any asynchronous operation. No AI or persistence occurs here.
export function suggestionCandidates(
  snapshot: MatchSnapshot,
  cv: string,
): readonly Immutable<SuggestionCandidate>[] {
  const seen = new Set<string>();
  const candidates: SuggestionCandidate[] = [];
  const ordered = snapshot.assessment.requirements
    .map((row, index) => ({ row, index }))
    .sort((a, b) => urgency(a.row) - urgency(b.row) || a.index - b.index);
  for (const { row } of ordered) {
    if (!row.parentId || seen.has(row.parentId)) continue;
    seen.add(row.parentId);
    const jdEvidence: JobEvidenceReference[] = [];
    const cvEvidence: CvEvidenceReference[] = [];
    const supported: { id: string; reference: CvEvidenceReference }[] = [];
    const components = row.coverage.components;
    let invalidEvidence = false;
    for (const component of components) {
      const link = {
        parentId: row.parentId,
        componentId: component.id,
        cvUpdatedAt: snapshot.cvUpdatedAt,
        jobUpdatedAt: snapshot.jobUpdatedAt,
      };
      const jd = jobEvidenceReference(row.jdQuote, component.jdQuote, link);
      if (!jd) invalidEvidence = true;
      else jdEvidence.push(jd);
      if (component.cvQuote) {
        const reference = cvEvidenceReference(
          cv,
          component.cvQuote,
          link,
          'support',
        );
        if (!reference) invalidEvidence = true;
        else {
          cvEvidence.push(reference);
          if (component.status === 'EVIDENCED')
            supported.push({ id: component.id, reference });
        }
      }
      for (const quote of component.conflictingQuotes) {
        const reference = cvEvidenceReference(cv, quote, link, 'contradiction');
        if (!reference) invalidEvidence = true;
        else cvEvidence.push(reference);
      }
    }
    // Never expose a card with unverifiable requirement provenance.
    if (jdEvidence.length !== components.length || !components.length) continue;
    const conflict =
      row.status === 'CONFLICT' ||
      components.some(
        (component) =>
          component.status === 'CONFLICT' || component.conflictingQuotes.length,
      );
    const selected =
      !conflict &&
      !invalidEvidence &&
      (row.status === 'EVIDENCED' || row.status === 'PARTIAL') &&
      row.coverage.mode !== 'UNKNOWN'
        ? supported.find(
            ({ reference }) =>
              reference.span && safeStandalonePassage(cv, reference.quote),
          )
        : undefined;
    const missing = (
      row.coverage.mode === 'OR' && row.status === 'EVIDENCED' ? [] : components
    ).filter((component) => component.status !== 'EVIDENCED');
    const reason = conflict
      ? 'Contradictory CV evidence needs review; no wording is offered.'
      : row.status === 'PARTIAL'
        ? 'Only some components are evidenced; this passage does not establish the full requirement.'
        : row.status === 'NOT_EVIDENCED'
          ? 'Not evidenced in the saved CV does not mean you lack this qualification.'
          : selected
            ? 'Consider making this existing supporting passage easier to find.'
            : 'The evidence needs context or verification before wording can be offered.';
    candidates.push({
      parentId: row.parentId,
      componentIds: selected
        ? [selected.id, ...missing.map((component) => component.id)]
        : components.map((component) => component.id),
      requirement: row.requirement,
      priority: row.priority,
      status: row.status,
      kind: selected ? 'surface_evidence' : 'clarify',
      reason,
      wording: selected?.reference.quote ?? null,
      clarification: selected
        ? null
        : conflict
          ? 'Which CV statement is accurate? Reconcile the contradictory evidence before updating your CV.'
          : 'Can you verify an accurate example? Add only what you can substantiate, with its role, scope and qualifiers.',
      jdEvidence,
      cvEvidence,
    });
    if (candidates.length === 5) break;
  }
  return immutableValue(candidates);
}
