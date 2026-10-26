import type {
  ExtractionResult,
  Fact,
} from '../../src/extraction/extraction.types.js';
import type {
  Atom,
  ExtractionGold,
  ExtractionMetrics,
  Observation,
  Ratio,
  Source,
} from './types.js';

export const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  value: denominator ? numerator / denominator : null,
});

// Explicit contract adapter: relationships are never inferred from output order.
export function atoms(result: ExtractionResult): Atom[] {
  const out: Atom[] = [];
  const add = (field: string, subject: string, fact: Fact) => {
    if (fact.value !== null)
      out.push({ field, subject, value: fact.value, evidence: fact.evidence });
  };
  if (result.kind === 'cv') {
    const d = result.data;
    for (const field of ['name', 'email', 'phone', 'location'] as const)
      add(field, '', d[field]);
    for (const skill of d.skills) {
      add('skills.name', skill.name.value ?? '', skill.name);
      add(
        'skills.experienceText',
        skill.name.value ?? '',
        skill.experienceText,
      );
    }
    for (const record of d.experience) {
      const subject = JSON.stringify([
        record.employer.value,
        record.title.value,
        record.startDateText.value,
      ]);
      for (const field of [
        'employer',
        'title',
        'startDateText',
        'endDateText',
        'descriptionText',
      ] as const)
        add(`experience.${field}`, subject, record[field]);
    }
    for (const record of d.education) {
      const subject = JSON.stringify([
        record.institution.value,
        record.qualification.value,
        record.dateText.value,
      ]);
      for (const field of ['institution', 'qualification', 'dateText'] as const)
        add(`education.${field}`, subject, record[field]);
    }
  } else {
    const d = result.data;
    for (const field of [
      'title',
      'company',
      'location',
      'employmentType',
      'compensationText',
    ] as const)
      add(field, '', d[field]);
    for (const requirement of d.requirements) {
      add('requirements.text', requirement.text.value ?? '', requirement.text);
      add(
        'requirements.priority',
        requirement.text.value ?? '',
        requirement.priority,
      );
    }
    for (const fact of d.responsibilities) add('responsibilities', '', fact);
  }
  return out;
}
const boundary = (text: string, position: number) =>
  !(
    position > 0 &&
    position < text.length &&
    /[\uD800-\uDBFF]/u.test(text[position - 1]!) &&
    /[\uDC00-\uDFFF]/u.test(text[position]!)
  );
export function validReference(
  source: Source,
  ref: Atom['evidence'][number],
): boolean {
  const segment = source.segments.find((s) => s.id === ref.segmentId);
  return (
    !!segment &&
    Number.isInteger(ref.start) &&
    Number.isInteger(ref.end) &&
    ref.start >= segment.start &&
    ref.end <= segment.end &&
    ref.start < ref.end &&
    segment.start >= 0 &&
    segment.end <= source.text.length &&
    boundary(source.text, ref.start) &&
    boundary(source.text, ref.end) &&
    source.text.slice(ref.start, ref.end) === ref.quote &&
    source.text.indexOf(ref.quote, segment.start) === ref.start &&
    (source.text.indexOf(ref.quote, ref.start + 1) < 0 ||
      source.text.indexOf(ref.quote, ref.start + 1) + ref.quote.length >
        segment.end)
  );
}

export function evaluateExtraction(
  gold: ExtractionGold,
  observation: Observation,
): ExtractionMetrics {
  const important = gold.facts.filter((f) => f.important).length;
  const negatives = gold.forbidden.filter((p) => p.reason === 'negation');
  const attempted = observation.outcome !== 'NOT_RUN';
  if (observation.outcome !== 'SUCCESS')
    return {
      counts: null,
      precision: null,
      recall: null,
      importantCompleteness: null,
      unsupportedPositiveClaims: null,
      forbiddenClaims: null,
      negationHandling: null,
      priorityAccuracy: null,
      evidenceValidity: null,
      evidenceSupport: null,
      deliveredRecall: ratio(0, attempted ? gold.facts.length : 0),
      deliveredImportantCompleteness: ratio(0, attempted ? important : 0),
      deliveredNegationHandling: ratio(0, attempted ? negatives.length : 0),
      completion: ratio(0, attempted ? 1 : 0),
      failures: [observation.outcome],
    };
  const emitted = atoms(observation.result);
  const used = new Set<number>();
  const aligned = emitted.map((atom) => {
    const index = gold.facts.findIndex(
      (f, i) =>
        !used.has(i) &&
        f.field === atom.field &&
        f.subject === atom.subject &&
        f.values.includes(atom.value),
    );
    if (index >= 0) used.add(index);
    return index;
  });
  const tp = used.size;
  const fp = emitted.length - tp;
  const fn = gold.facts.length - tp;
  const importantFound = [...used].filter(
    (i) => gold.facts[i]!.important,
  ).length;
  const hit = (probe: ExtractionGold['forbidden'][number]) =>
    emitted.some(
      (a) =>
        a.field === probe.field &&
        a.subject === probe.subject &&
        probe.values.includes(a.value),
    );
  const forbiddenClaims = { negation: 0, uncertain: 0, injection: 0 };
  for (const probe of gold.forbidden)
    if (hit(probe)) forbiddenClaims[probe.reason]++;
  // The contract has no polarity flag. Only an exact authored negative fact is
  // negative; all unmatched non-null assertions are conservatively positive.
  const positives = aligned.filter(
    (i) => i < 0 || gold.facts[i]!.polarity === 'positive',
  ).length;
  const valid = emitted
    .flatMap((a) => a.evidence)
    .filter((ref) => validReference(observation.result.source, ref)).length;
  const supported = emitted.filter((a, i) => {
    const index = aligned[i]!;
    if (index < 0 || !a.evidence.length) return false;
    const anchor = gold.facts[index]!.anchor;
    const start = observation.result.source.text.indexOf(anchor);
    return (
      start >= 0 &&
      a.evidence.every(
        (ref) =>
          validReference(observation.result.source, ref) &&
          ref.start <= start &&
          ref.end >= start + anchor.length,
      )
    );
  }).length;
  const priorities = gold.priorities.filter((p) => {
    const recovered = emitted.filter(
      (a) =>
        a.field === 'requirements.text' &&
        a.subject === p.subject &&
        a.value === p.subject,
    );
    const priority = emitted.filter(
      (a) => a.field === 'requirements.priority' && a.subject === p.subject,
    );
    return (
      recovered.length === 1 &&
      (p.value === null
        ? priority.length === 0
        : priority.length === 1 && priority[0]!.value === p.value)
    );
  }).length;
  const refs = emitted.reduce((n, a) => n + a.evidence.length, 0);
  const safe = negatives.filter((p) => !hit(p)).length;
  const failures: string[] = [];
  if (fn) failures.push('MISSING_FACT');
  if (fp) failures.push('EXTRA_OR_INCORRECT_FACT');
  if (priorities !== gold.priorities.length)
    failures.push('INCORRECT_PRIORITY');
  if (safe !== negatives.length) failures.push('NEGATED_POSITIVE_CLAIM');
  if (forbiddenClaims.injection) failures.push('INJECTION_POSITIVE_CLAIM');
  if (forbiddenClaims.uncertain) failures.push('UNCERTAIN_POSITIVE_CLAIM');
  if (valid !== refs) failures.push('INVALID_EVIDENCE');
  if (supported !== tp) failures.push('UNSUPPORTED_EVIDENCE');
  return {
    counts: { tp, fp, fn },
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    importantCompleteness: ratio(importantFound, important),
    unsupportedPositiveClaims: ratio(fp, positives),
    forbiddenClaims,
    negationHandling: ratio(safe, negatives.length),
    priorityAccuracy: ratio(priorities, gold.priorities.length),
    evidenceValidity: ratio(valid, refs),
    evidenceSupport: ratio(supported, tp),
    deliveredRecall: ratio(tp, gold.facts.length),
    deliveredImportantCompleteness: ratio(importantFound, important),
    deliveredNegationHandling: ratio(safe, negatives.length),
    completion: ratio(1, 1),
    failures: failures.sort(),
  };
}
