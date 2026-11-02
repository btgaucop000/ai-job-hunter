import { expect, test } from '@jest/globals';
import { AiService } from '../../src/ai/ai.service.js';
import {
  cvQuoteChoices,
  resolveCvQuote,
} from '../../src/matching/cv-match.evidence.js';
import {
  matchOutputSchema,
  matchPrompt,
  validateMatchAssessment,
  scoreCvMatch,
  type MatchRequirement,
} from '../../src/matching/cv-match.js';
const cv =
  'Summary: 6+ years of\nprofessional software engineering.\nBackend — Java / Spring Boot.\nDatabases: PostgreSQL / SQL Server.\nTools: ChatGPT / Copilot.';
const facts = [
  'Software engineering experience',
  'Java backend experience',
  'SQL database experience',
  'AI-assisted development tools',
];
const canonical: MatchRequirement[] = facts.map((requirement) => ({
  requirement,
  jdQuote: requirement,
  cvQuote: '',
  priority: 'required',
  category: 'skill',
}));
const quotes = [
  'Summary: 6+ years of\nprofessional software engineering.',
  'Backend — Java / Spring Boot.',
  'Databases: PostgreSQL / SQL Server.',
  'Tools: ChatGPT / Copilot.',
];
test('all nonempty choices resolve to exact original passages, including long lines and line-wrap aliases', () => {
  for (const source of [cv, `Prefix ${'Synthetic words '.repeat(300)}end.`]) {
    const choices = cvQuoteChoices(source);
    expect(choices[0]).toBe('');
    expect(choices.length).toBeGreaterThan(1);
    for (const quote of choices.filter(Boolean)) {
      expect(quote.length).toBeLessThanOrEqual(2000);
      const resolved = resolveCvQuote(source, quote);
      expect(resolved).not.toBeNull();
      expect(source).toContain(resolved!);
    }
  }
});
test('prompt does not prime model to copy empty CV evidence from canonical input', () => {
  const prompt = matchPrompt(cv, facts.join('\n'), canonical);
  const payload = JSON.parse(prompt.split('\n').at(-1)!);
  expect(
    payload.canonicalRequirements.every((row: object) => !('cvQuote' in row)),
  ).toBe(true);
  expect(prompt).toContain('SELECT cvQuote');
});
test('existing structured AI validator disallows paraphrased quotes that previously became unverified zeros', async () => {
  const ai = new AiService({
    generate: async () =>
      JSON.stringify({
        requirements: canonical.map((row) => ({
          ...row,
          cvQuote: 'Paraphrased expertise not present in CV',
        })),
      }),
  });
  await expect(
    ai.generateStructured({
      prompt: 'Synthetic request',
      schema: matchOutputSchema(cv),
    }),
  ).rejects.toThrow(/schema/i);
});
test('source-selected Java, experience, SQL and tooling evidence stays verbatim and produces verified matches', async () => {
  const ai = new AiService({
    generate: async () =>
      JSON.stringify({
        requirements: canonical.map((row, index) => ({
          ...row,
          cvQuote: quotes[index],
        })),
      }),
  });
  const value = (await ai.generateStructured({
    prompt: 'Synthetic request',
    schema: matchOutputSchema(cv),
  })) as { requirements: MatchRequirement[] };
  const verified = validateMatchAssessment(
    value.requirements,
    cv,
    facts.join('\n'),
    canonical,
  );
  const result = scoreCvMatch(verified, cv, facts.join('\n'), canonical);
  expect(
    result.requirements.filter((row) => row.status === 'EVIDENCED'),
  ).toHaveLength(4);
  expect(result.score).toBeGreaterThan(0);
  expect(result.requirements.map((row) => row.cvQuote)).toEqual(quotes);
});
test('selecting unknown does not fabricate evidence or force a positive score', async () => {
  const ai = new AiService({
    generate: async () => JSON.stringify({ requirements: canonical }),
  });
  const value = (await ai.generateStructured({
    prompt: 'Synthetic request',
    schema: matchOutputSchema(cv),
  })) as { requirements: MatchRequirement[] };
  expect(value.requirements.every((row) => row.cvQuote === '')).toBe(true);
});
