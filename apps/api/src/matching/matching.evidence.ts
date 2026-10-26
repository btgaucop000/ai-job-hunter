import type {
  CvExtractionResult,
  EvidenceReference,
  ExtractionSource,
  Fact,
} from '../extraction/extraction.types.js';
import type { EvidenceLink } from './matching.types.js';
import {
  duration,
  normalize,
  parseCvLine,
  parsePhrase,
  type Parsed,
} from './matching.policy.js';

export function sourceLine(
  source: ExtractionSource,
  ref: EvidenceReference,
): EvidenceReference | null {
  // Recognize all common line separators; never collapse lines before checking.
  const separator = /[\r\n\u2028\u2029]/u;
  if (separator.test(ref.quote)) return null;
  let start = ref.start;
  let end = ref.end;
  while (start > 0 && !separator.test(source.text[start - 1]!)) start--;
  while (end < source.text.length && !separator.test(source.text[end]!)) end++;
  const segment = source.segments.find((item) => item.id === ref.segmentId)!;
  if (end - start > 1000 || start < segment.start || end > segment.end)
    return null;
  return {
    segmentId: ref.segmentId,
    start,
    end,
    quote: source.text.slice(start, end),
  };
}
export function links(
  document: 'cv' | 'jd',
  factPath: string,
  fact: Fact,
  role: EvidenceLink['role'] = 'support',
): EvidenceLink[] {
  return fact.evidence.map((reference) => ({
    document,
    factPath,
    reference: { ...reference },
    role,
  }));
}
export function stableEvidence(items: readonly EvidenceLink[]): EvidenceLink[] {
  const key = (item: EvidenceLink) =>
    JSON.stringify([
      item.document,
      item.factPath,
      item.reference.segmentId,
      item.reference.start,
      item.reference.end,
      item.role,
      item.reference.quote,
    ]);
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...new Map(items.map((item) => [key(item), item])).values()].sort(
    (a, b) =>
      compare(a.document, b.document) ||
      compare(a.factPath, b.factPath) ||
      compare(a.reference.segmentId, b.reference.segmentId) ||
      a.reference.start - b.reference.start ||
      a.reference.end - b.reference.end ||
      compare(a.role, b.role) ||
      compare(a.reference.quote, b.reference.quote),
  );
}
export interface Assertion {
  readonly parsed: Parsed;
  readonly evidence: readonly EvidenceLink[];
}
export interface CvAssertions {
  readonly accepted: readonly Assertion[];
  readonly unusable: readonly {
    term: string | null;
    evidence: readonly EvidenceLink[];
  }[];
}
export function cvAssertions(cv: CvExtractionResult): CvAssertions {
  const accepted: Assertion[] = [];
  const unusable: { term: string | null; evidence: readonly EvidenceLink[] }[] =
    [];
  function inspect(
    fact: Fact,
    path: string,
    skill: string | null,
    mode: 'name' | 'duration' | 'description',
  ): void {
    if (fact.value === null) return;
    const evidence = links('cv', path, fact);
    const candidates: Parsed[] = [];
    let usable = true;
    for (const ref of fact.evidence) {
      const context = sourceLine(cv.source, ref);
      if (!context) {
        usable = false;
        continue;
      }
      evidence.push({
        document: 'cv',
        factPath: path,
        reference: context,
        role: 'context',
      });
      const parsed = parseCvLine(context.quote);
      let selected =
        parsed?.filter((item) => skill === null || item.term === skill) ?? [];
      if (mode === 'description') {
        const own = parseCvLine(fact.value);
        selected = selected.filter((item) =>
          own?.some((value) => sameAssertion(value, item)),
        );
      } else if (mode === 'duration') {
        const stated = duration(fact.value) ?? parsePhrase(fact.value, 'cv');
        selected = selected.filter(
          (item) =>
            item.predicate === 'minimumDuration' &&
            stated !== null &&
            item.months === stated.months &&
            item.lowerBound === stated.lowerBound,
        );
      } else {
        // A name field does not recover a duration omitted from experienceText.
        selected = selected.map((item) =>
          item.predicate === 'minimumDuration'
            ? {
                ...item,
                predicate: 'termPresence' as const,
                months: null,
                lowerBound: false,
              }
            : item,
        );
      }
      if (!selected.length) usable = false;
      candidates.push(...selected);
    }
    if (!usable) {
      unusable.push({ term: skill, evidence });
      return;
    }
    for (const parsed of candidates)
      accepted.push({
        parsed,
        evidence: evidence.map((item) =>
          item.role === 'support' && parsed.negative
            ? { ...item, role: 'contradiction' }
            : item,
        ),
      });
  }
  cv.data.skills.forEach((skill, index) => {
    const name = parsePhrase(skill.name.value!, 'cv');
    if (!name || name.predicate !== 'termPresence') {
      unusable.push({
        term: null,
        evidence: links('cv', `/data/skills/${index}/name`, skill.name),
      });
      return;
    }
    inspect(skill.name, `/data/skills/${index}/name`, name.term, 'name');
    inspect(
      skill.experienceText,
      `/data/skills/${index}/experienceText`,
      name.term,
      'duration',
    );
  });
  cv.data.experience.forEach((item, index) =>
    inspect(
      item.descriptionText,
      `/data/experience/${index}/descriptionText`,
      null,
      'description',
    ),
  );
  return { accepted, unusable };
}
export function sameAssertion(a: Parsed, b: Parsed): boolean {
  return (
    a.term === b.term &&
    a.predicate === b.predicate &&
    a.months === b.months &&
    a.negative === b.negative &&
    a.lowerBound === b.lowerBound
  );
}
export function requirementKey(parsed: Parsed | null, text: string): string {
  return parsed
    ? JSON.stringify([parsed.term, parsed.predicate, parsed.months])
    : `unsupported:${normalize(text)}`;
}
