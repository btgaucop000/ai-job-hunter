import type { Fact } from '../extraction/extraction.types.js';
import type {
  MatchingInput,
  MatchingResult,
  RequirementResult,
  EvidenceLink,
  UncertaintyCode,
  Explanation,
  MatchStatus,
} from './matching.types.js';
import { validateMatchingInput } from './matching.validation.js';
import { CATEGORIES, parsePhrase, type Parsed } from './matching.policy.js';
import {
  cvAssertions,
  links,
  requirementKey,
  sameAssertion,
  sourceLine,
  stableEvidence,
  type CvAssertions,
} from './matching.evidence.js';

const sorted = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)].sort();
const round = (value: number) => Math.round(value * 100) / 100;
const messages: Record<Explanation['code'], string> = {
  EXPLICIT_SUPPORT:
    'Accepted explicit CV evidence satisfies the recognized requirement.',
  DURATION_BELOW_MINIMUM:
    'The explicitly stated duration is below the required minimum.',
  EXPLICIT_NEGATIVE:
    'An explicit negative assertion or zero duration does not satisfy this experience requirement.',
  NO_USABLE_CV_SUPPORT:
    'No usable CV evidence supports this requirement; this does not establish lack of ability.',
  UNKNOWN_DURATION:
    'The required duration cannot be determined from the available CV facts.',
  CONFLICTING_EVIDENCE: 'Conflicting CV assertions prevent a determination.',
  REQUIREMENT_NOT_EVALUABLE:
    'This requirement is outside the supported forms or has unsupported source context and is excluded from scoring.',
};
function explanation(
  code: Explanation['code'],
  params: Explanation['params'] = {},
): Explanation {
  return { code, params, text: messages[code] };
}
interface Group {
  parsed: Parsed | null;
  ambiguous: boolean;
  indexes: number[];
  texts: string[];
  priorities: (string | null)[];
  evidence: EvidenceLink[];
  rules: string[];
}
function evaluate(group: Group, cv: CvAssertions): RequirementResult {
  const p = group.parsed;
  const eligible = p !== null && !group.ambiguous;
  const priority = group.priorities.includes('required')
    ? 'required'
    : group.priorities.includes('preferred')
      ? 'preferred'
      : 'unknown';
  const uncertainty: UncertaintyCode[] = ['SEMANTICS_NOT_VERIFIED'];
  if (priority === 'unknown') uncertainty.push('PRIORITY_UNKNOWN');
  if (
    group.priorities.includes('required') &&
    group.priorities.includes('preferred')
  )
    uncertainty.push('PRIORITY_CONFLICT');
  let status: MatchStatus = 'MISSING_EVIDENCE';
  let credit: number | null = eligible ? 0 : null;
  let observedMonths: number | null = null;
  let reason: Explanation['code'] = 'REQUIREMENT_NOT_EVALUABLE';
  const evidence = [...group.evidence];
  const rules = [...group.rules];
  if (!eligible)
    uncertainty.push(
      group.ambiguous ? 'AMBIGUOUS_JD_REQUIREMENT' : 'UNSUPPORTED_REQUIREMENT',
    );
  else {
    const assertions = cv.accepted.filter(
      (item) => item.parsed.term === p.term,
    );
    const bad = cv.unusable.filter((item) => item.term === p.term);
    evidence.push(
      ...assertions.flatMap((item) => item.evidence),
      ...bad.flatMap((item) => item.evidence),
    );
    rules.push(...assertions.flatMap((item) => item.parsed.rules));
    if (bad.length) uncertainty.push('CONTEXT_NOT_SUPPORTED');
    const negative = assertions.some((item) => item.parsed.negative);
    const positive = assertions.filter((item) => !item.parsed.negative);
    const experience = positive.filter(
      (item) =>
        item.parsed.predicate === 'experiencePresence' ||
        (item.parsed.months !== null && item.parsed.months > 0),
    );
    const durations = positive
      .filter((item) => item.parsed.months !== null)
      .map((item) => item.parsed);
    const exacts = sorted(
      durations
        .filter((item) => !item.lowerBound)
        .map((item) => String(item.months)),
    );
    const lower = Math.max(
      0,
      ...durations
        .filter((item) => item.lowerBound)
        .map((item) => item.months!),
    );
    const exact = exacts.length === 1 ? Number(exacts[0]) : null;
    const conflict =
      (negative && experience.length > 0) ||
      exacts.length > 1 ||
      (exact !== null && lower > exact) ||
      (exact === 0 && experience.length > 0);
    reason = 'NO_USABLE_CV_SUPPORT';
    if (conflict) {
      reason = 'CONFLICTING_EVIDENCE';
      uncertainty.push('CONFLICTING_CV_EVIDENCE');
    } else if (p.predicate === 'minimumDuration') {
      if (negative || exact === 0) {
        status = 'NOT_MATCHED';
        reason = 'EXPLICIT_NEGATIVE';
        observedMonths = exact;
      } else if (exact !== null) {
        observedMonths = exact;
        credit = Math.min(1, exact / p.months!);
        status = credit === 1 ? 'MATCHED' : 'PARTIAL';
        reason = credit === 1 ? 'EXPLICIT_SUPPORT' : 'DURATION_BELOW_MINIMUM';
      } else if (lower >= p.months!) {
        status = 'MATCHED';
        credit = 1;
        reason = 'EXPLICIT_SUPPORT';
        observedMonths = lower;
      } else {
        reason = 'UNKNOWN_DURATION';
        uncertainty.push('DURATION_UNKNOWN');
      }
    } else if (p.predicate === 'experiencePresence') {
      if (negative) {
        status = 'NOT_MATCHED';
        reason = 'EXPLICIT_NEGATIVE';
      } else if (experience.length) {
        status = 'MATCHED';
        credit = 1;
        reason = 'EXPLICIT_SUPPORT';
      }
    } else if (!negative && positive.length) {
      status = 'MATCHED';
      credit = 1;
      reason = 'EXPLICIT_SUPPORT';
    }
    if (status === 'MISSING_EVIDENCE' && !assertions.length && !bad.length)
      uncertainty.push('CV_FACT_NOT_STATED');
  }
  return {
    id: `req-${group.indexes[0]}`,
    jdRequirementIndexes: group.indexes,
    originalTexts: group.texts,
    category: p
      ? p.predicate === 'minimumDuration'
        ? 'experience'
        : p.category
      : null,
    canonicalTerm: p?.term ?? null,
    predicate: p?.predicate ?? 'unsupported',
    minimumMonths: p?.months ?? null,
    priority,
    importanceWeight: priority === 'required' ? 2 : 1,
    status,
    evaluability: group.ambiguous
      ? 'AMBIGUOUS_JD'
      : p
        ? 'EVALUABLE'
        : 'UNSUPPORTED',
    includedInScore: eligible,
    credit,
    observedMonths,
    ruleIds: sorted(rules),
    evidence: stableEvidence(evidence),
    explanation: explanation(reason, {
      ...(p ? { term: p.term } : {}),
      ...(observedMonths !== null ? { observedMonths } : {}),
      ...(p?.months !== null && p?.months !== undefined
        ? { minimumMonths: p.months }
        : {}),
    }),
    uncertainty: sorted(uncertainty),
  };
}

export function matchExtractions(input: MatchingInput): MatchingResult {
  validateMatchingInput(input);
  const groups = new Map<string, Group>();
  input.jd.data.requirements.forEach((item, index) => {
    const parsed = parsePhrase(item.text.value!, 'jd');
    let ambiguous = false;
    const evidence = [
      ...links('jd', `/data/requirements/${index}/text`, item.text),
      ...links(
        'jd',
        `/data/requirements/${index}/priority`,
        item.priority as Fact,
        'priority',
      ),
    ];
    for (const [field, fact] of [
      ['text', item.text],
      ['priority', item.priority],
    ] as const) {
      for (const ref of fact.evidence) {
        const context = sourceLine(input.jd.source, ref);
        const contextParsed = context && parsePhrase(context.quote, 'jd');
        if (!parsed || !contextParsed || !sameAssertion(parsed, contextParsed))
          ambiguous ||= parsed !== null;
        if (context)
          evidence.push({
            document: 'jd',
            factPath: `/data/requirements/${index}/${field}`,
            reference: context,
            role: 'context',
          });
      }
    }
    const key = requirementKey(parsed, item.text.value!);
    const group = groups.get(key) ?? {
      parsed,
      ambiguous: false,
      indexes: [],
      texts: [],
      priorities: [],
      evidence: [],
      rules: [],
    };
    group.ambiguous ||= ambiguous;
    group.indexes.push(index);
    group.texts.push(item.text.value!);
    group.priorities.push(item.priority.value);
    group.evidence.push(...evidence);
    group.rules.push(...(parsed?.rules ?? []));
    groups.set(key, group);
  });
  const cv = cvAssertions(input.cv);
  const requirements = [...groups.values()]
    .map((group) => evaluate(group, cv))
    .map((item, _, all) => {
      const overlap =
        item.predicate === 'minimumDuration' &&
        all.some(
          (other) =>
            other.id !== item.id &&
            other.predicate === item.predicate &&
            other.canonicalTerm === item.canonicalTerm &&
            other.minimumMonths !== item.minimumMonths,
        );
      return overlap
        ? {
            ...item,
            uncertainty: sorted([
              ...item.uncertainty,
              'POSSIBLE_REQUIREMENT_OVERLAP' as const,
            ]),
          }
        : item;
    });
  const raw = CATEGORIES.map(([category, configuredWeight]) => {
    const eligible = requirements.filter(
      (item) => item.category === category && item.includedInScore,
    );
    const denominatorWeight = eligible.reduce(
      (sum, item) => sum + item.importanceWeight,
      0,
    );
    const earnedWeight = eligible.reduce(
      (sum, item) => sum + item.importanceWeight * item.credit!,
      0,
    );
    return {
      category,
      configuredWeight,
      effectiveWeight: 0,
      score: denominatorWeight
        ? (100 * earnedWeight) / denominatorWeight
        : null,
      earnedWeight,
      denominatorWeight,
      eligibleRequirementCount: eligible.length,
      excludedRequirementCount: requirements.filter(
        (item) => item.category === category && !item.includedInScore,
      ).length,
      missingEvidenceCount: eligible.filter(
        (item) => item.status === 'MISSING_EVIDENCE',
      ).length,
    };
  });
  const activeCategoryWeight = raw.reduce(
    (sum, item) => sum + (item.score === null ? 0 : item.configuredWeight),
    0,
  );
  const overallScore = activeCategoryWeight
    ? round(
        raw.reduce(
          (sum, item) => sum + (item.score ?? 0) * item.configuredWeight,
          0,
        ) / activeCategoryWeight,
      )
    : null;
  const evaluableRequirementCount = requirements.filter(
    (item) => item.includedInScore,
  ).length;
  const excludedRequirementCount =
    requirements.length - evaluableRequirementCount;
  return {
    contractVersion: '1',
    policyVersion: 'matching-v1',
    scoreMeaning: 'DOCUMENTED_REQUIREMENT_SUPPORT',
    overallScore,
    scoreExplanation:
      overallScore === null
        ? null
        : `This score measures documented support for ${evaluableRequirementCount}/${requirements.length} recognized requirements after deduplication. Active categories represent ${activeCategoryWeight}/100 of the configured weight. ${excludedRequirementCount} requirements were excluded. Missing CV evidence contributes zero support; it does not establish lack of ability. Extraction completeness and semantic correctness are not verified.`,
    categories: raw.map((item) => ({
      ...item,
      score: item.score === null ? null : round(item.score),
      effectiveWeight:
        item.score === null ? 0 : item.configuredWeight / activeCategoryWeight,
    })),
    requirements,
    coverage: {
      inputRequirementCount: input.jd.data.requirements.length,
      canonicalRequirementCount: requirements.length,
      evaluableRequirementCount,
      excludedRequirementCount,
      unclassifiedRequirementCount: requirements.filter(
        (item) => item.category === null,
      ).length,
      activeCategoryWeight,
      jdEvaluabilityRatio: requirements.length
        ? evaluableRequirementCount / requirements.length
        : null,
    },
    extractionWarnings: (['cv', 'jd'] as const).flatMap((document) =>
      input[document].warnings.map((warning) => ({
        document,
        warning: { ...warning },
      })),
    ),
    uncertainty: sorted([
      'SEMANTICS_NOT_VERIFIED',
      ...requirements.flatMap((item) => item.uncertainty),
    ]),
    reviewRequired: true,
  };
}
