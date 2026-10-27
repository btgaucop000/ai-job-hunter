import type { RequirementResult } from './analysis.types';

export type RequirementFeedback = 'CORRECT' | 'INCORRECT' | 'UNSURE';

export function requirementFeedbackKeys(
  requirements: readonly RequirementResult[],
): readonly string[] {
  const counts = new Map<string, number>();
  for (const requirement of requirements) {
    if (requirement.id)
      counts.set(requirement.id, (counts.get(requirement.id) ?? 0) + 1);
  }
  return requirements.map((requirement, index) =>
    requirement.id && counts.get(requirement.id) === 1
      ? `requirement:${requirement.id}`
      : `requirement-fallback:${index}`,
  );
}
