import { isDeepStrictEqual } from 'node:util';
import type { MatchingResult } from '../../src/matching/matching.types.js';
import type { MatchingCase } from './datasets/v1/matching.js';
import { ratio, validReference } from './extraction.js';

const equal = isDeepStrictEqual;
export function evaluateMatching(
  fixture: MatchingCase,
  result: MatchingResult,
) {
  const expected = fixture.expected;
  const aligned = expected.requirements.map((r) =>
    result.requirements.find((a) =>
      equal(a.jdRequirementIndexes, r.jdRequirementIndexes),
    ),
  );
  const correctStatus = aligned.filter(
    (r, i) => r?.status === expected.requirements[i]!.status,
  ).length;
  const correctDecision = aligned.filter(
    (r, i) =>
      r?.status === expected.requirements[i]!.status &&
      r?.evaluability === expected.requirements[i]!.evaluability &&
      r?.includedInScore === expected.requirements[i]!.includedInScore,
  ).length;
  const expectedScores = [expected.overallScore, ...expected.categoryScores];
  const actualScores = [
    result.overallScore,
    ...[
      'technicalSkills',
      'experience',
      'architecture',
      'engineeringPractices',
      'domainKnowledge',
    ].map((c) => result.categories.find((a) => a.category === c)?.score),
  ];
  const errors: number[] = [];
  let available = 0;
  expectedScores.forEach((score, i) => {
    const actual = actualScores[i];
    if (actual !== undefined && (score === null) === (actual === null))
      available++;
    if (score !== null && actual !== null && actual !== undefined)
      errors.push(Math.abs(score - actual));
  });
  const extra = result.requirements.filter(
    (r) =>
      !expected.requirements.some((e) =>
        equal(e.jdRequirementIndexes, r.jdRequirementIndexes),
      ),
  ).length;
  const links = result.requirements.flatMap((r) => r.evidence);
  const validLinks = links.filter((link) => {
    const document = fixture.input[link.document];
    const path = link.factPath.split('/').slice(1);
    let value: unknown = document;
    for (const key of path)
      value =
        value !== null && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined;
    if (
      !value ||
      typeof value !== 'object' ||
      !('evidence' in value) ||
      !Array.isArray(value.evidence)
    )
      return false;
    if (!validReference(document.source, link.reference)) return false;
    if (link.role === 'priority' && !link.factPath.endsWith('/priority'))
      return false;
    return value.evidence.some(
      (ref: {
        start: number;
        end: number;
        segmentId: string;
        quote: string;
      }) =>
        link.role === 'context'
          ? ref.segmentId === link.reference.segmentId &&
            link.reference.start <= ref.start &&
            link.reference.end >= ref.end &&
            !/[\r\n\u2028\u2029]/u.test(link.reference.quote)
          : equal(ref, link.reference),
    );
  }).length;
  const failures: string[] = [];
  if (correctStatus !== expected.requirements.length)
    failures.push('MATCHING_STATUS');
  if (correctDecision !== expected.requirements.length)
    failures.push('MATCHING_DECISION');
  if (extra || result.requirements.length !== expected.requirements.length)
    failures.push('REQUIREMENT_COUNT');
  if (!equal(result.coverage, expected.coverage)) failures.push('COVERAGE');
  if (available !== expectedScores.length) failures.push('SCORE_AVAILABILITY');
  if (errors.some((e) => e !== 0)) failures.push('SCORE_DEVIATION');
  if (validLinks !== links.length) failures.push('MATCHING_EVIDENCE');
  if (
    aligned.some(
      (r, i) =>
        !r ||
        r.credit !== expected.requirements[i]!.credit ||
        r.priority !== expected.requirements[i]!.priority ||
        !equal(r.uncertainty, expected.requirements[i]!.uncertainty),
    )
  )
    failures.push('POLICY_DETAILS');
  return {
    statusAccuracy: ratio(correctStatus, expected.requirements.length),
    decisionAccuracy: ratio(correctDecision, expected.requirements.length),
    extraRequirements: extra,
    scoreAvailability: ratio(available, expectedScores.length),
    scoreDeviation: {
      n: errors.length,
      mae: errors.length
        ? errors.reduce((a, b) => a + b, 0) / errors.length
        : null,
      max: errors.length ? Math.max(...errors) : null,
    },
    evidenceValidity: ratio(validLinks, links.length),
    coverage: result.coverage,
    overallScore: result.overallScore,
    failures: failures.sort(),
  };
}
