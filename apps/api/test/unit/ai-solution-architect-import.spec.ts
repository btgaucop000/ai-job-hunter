import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import {
  mergeCandidates,
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
import {
  canonicalRequirements,
  matchJobText,
} from '../../src/matching/cv-match.js';
import type { Opportunity } from '../../src/opportunities/opportunity.entity.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
interface Clause {
  id: string;
  quote: string;
  coverageSpans: string[];
}
const golden = JSON.parse(
  readFileSync(
    '../../docs/audits/fixtures/itviec-ai-solution-architect.golden.json',
    'utf8',
  ),
) as {
  sourceText: string;
  mustHave: Clause[];
  niceToHave: Clause[];
  experience: { value: string };
};
const live = JSON.parse(
  readFileSync(
    '../../docs/audits/fixtures/itviec-ai-solution-architect.live-p55d.json',
    'utf8',
  ),
) as { rawCandidates: ImportCandidate[] };
const post = golden.sourceText;
const proposal = (clause: Clause, value = clause.quote): ImportCandidate => ({
  field: clause.id.startsWith('P') ? 'preferredSkills' : 'skills',
  value,
  source: 'post',
  quote: clause.quote,
});
const sparse = [
  proposal(golden.mustHave[4]!, 'vector search'),
  proposal(golden.mustHave[6]!, 'security'),
  proposal(golden.niceToHave[1]!, 'MCP'),
];
const complete = [...golden.mustHave, ...golden.niceToHave].map((clause) =>
  proposal(clause),
);

test.each([
  ['omitted', []],
  ['fragments', sparse],
  ['complete plus redundant fragments', [...complete, ...sparse]],
  ['captured public-only model', live.rawCandidates],
] as const)(
  'golden case recovers all clauses with contextual evidence, without duplicating fragments: %s',
  async (_name, proposals) => {
    const ai = {
      generateStructured: jest.fn(async () => ({ candidates: proposals })),
    };
    const result = await new JobImportService(
      ai as unknown as AiService,
    ).extract({ record: { postText: post } });
    expect(result.error).toBeNull();
    const required = result.fields.find((field) => field.field === 'skills')!;
    const preferred = result.fields.find(
      (field) => field.field === 'preferredSkills',
    )!;
    for (const [field, clauses] of [
      [required, golden.mustHave],
      [preferred, golden.niceToHave],
    ] as const) {
      const values = field.value.split('\n');
      expect(values).toHaveLength(clauses.length);
      for (const clause of clauses) {
        const evidence = field.candidates.filter(
          (item) => item.quote === clause.quote,
        );
        expect(evidence.length).toBeGreaterThan(0);
        for (const span of clause.coverageSpans)
          expect(evidence.some((item) => item.value.includes(span))).toBe(true);
      }
      for (const candidate of field.candidates) {
        expect(post).toContain(candidate.quote);
        expect(candidate.quote).toContain(candidate.value);
        expect(clauses.some((clause) => clause.quote === candidate.quote)).toBe(
          true,
        );
      }
    }
    for (const fragment of [
      'security',
      'privacy',
      'performance',
      'vector search',
    ])
      expect(required.value.split('\n')).not.toContain(fragment);
    expect(required.value).not.toContain('Kubernetes');
    expect(required.value).not.toContain('AI Architect');
    expect(required.value).toContain('Working knowledge of');
    expect(required.value).toContain('beyond the prototype stage');
    expect(required.value).toContain('or equivalent practical experience');
    expect(required.value).toContain(
      'recent hands-on Generative AI experience',
    );
    expect(preferred.value).toContain('or delivery estimation');
    expect(preferred.value).toContain('or document intelligence');
    expect(
      result.fields.find((field) => field.field === 'experience')?.value,
    ).toBe(golden.experience.value);
    expect(validateImportReview(result.fields, post, '')).toEqual(
      result.fields,
    );
    const values = Object.fromEntries(
      result.fields.map((field) => [field.field, field.value]),
    );
    const saved = validateOpportunity({
      ...values,
      title: 'AI Solution Architect',
      source: 'Website',
      status: 'SAVED',
      description: post,
      postText: post,
      notes: '',
      contactDates: [],
      followUpDate: null,
      importReview: result.fields,
    });
    const matchingJob = { ...saved, jdText: '' } as Opportunity;
    const match = canonicalRequirements(matchingJob);
    expect(
      match.find((item) => item.category === 'experience')?.requirement,
    ).toBe('Minimum 6 years');
    for (const clause of [
      ...golden.mustHave.filter((row) => /\bor\b/u.test(row.quote)),
      ...golden.niceToHave,
    ]) {
      expect(
        match.some(
          (item) =>
            item.requirement.replace(/\.$/u, '') ===
            clause.quote.replace(/\.$/u, ''),
        ),
      ).toBe(true);
    }
    expect(
      match.some(
        (item) =>
          item.requirement === 'Kubernetes' ||
          item.requirement === 'AI Architect',
      ),
    ).toBe(false);
    expect(
      match.every((item) => matchJobText(matchingJob).includes(item.jdQuote)),
    ).toBe(true);
  },
);

test('distinct clauses sharing keywords survive, fragments reconcile within their evidence row', () => {
  const text =
    'Must Have\nWorking knowledge of vector search and tool calling.\nExperience testing tool calling for payment systems.\nNice to Have\nResearch experience in vector search or knowledge graphs.';
  const result = mergeCandidates(
    {
      candidates: [
        ...sourceCandidates(text, ''),
        {
          field: 'skills',
          value: 'tool calling',
          source: 'post',
          quote: 'Experience testing tool calling for payment systems.',
        },
      ],
    },
    text,
    '',
  );
  const required = result.fields.find((field) => field.field === 'skills')!;
  expect(required.value.split('\n')).toHaveLength(2);
  expect(required.value).toContain(
    'Working knowledge of vector search and tool calling',
  );
  expect(required.value).toContain(
    'Experience testing tool calling for payment systems',
  );
  expect(
    result.fields.find((field) => field.field === 'preferredSkills')?.value,
  ).toContain('Research experience');
  expect(validateImportReview(result.fields, text, '')).toEqual(result.fields);
});

test('supplemental tags and classifications cannot become qualifications, and genuine conflicts still block Save', () => {
  const text = `${post}\nDomain: Healthcare`;
  const result = mergeCandidates(
    {
      candidates: [
        ...sourceCandidates(text, ''),
        {
          field: 'skills',
          value: 'Kubernetes',
          source: 'post',
          quote:
            'Supplemental skill tags (not requirements): LLM; Kubernetes; RAG; English',
        },
        {
          field: 'preferredSkills',
          value: 'AI Architect',
          source: 'post',
          quote: 'ITviec Job Expertise: AI Architect',
        },
      ],
    },
    text,
    '',
  );
  expect(result.rejected).toBe(2);
  const domain = result.fields.find((field) => field.field === 'domain')!;
  expect(domain.status).toBe('CONFLICT');
  expect(() => validateImportReview(result.fields, text, '')).toThrow(
    'Review every conflicting',
  );
  domain.reviewed = true;
  expect(
    validateImportReview(result.fields, text, '').find(
      (field) => field.field === 'domain',
    )?.reviewed,
  ).toBe(true);
});

test.each(['6 years', '6+ years', 'minimum 6+ years'])(
  'experience with accompanying qualifications remains a complete requirement: %s',
  (duration) => {
    const clause = `${duration} of experience delivering public-sector integrations, including recent hands-on Generative AI experience.`;
    const source = `Must Have\n${clause}\nNice to Have\nExperience researching evaluation harnesses or model routing.`;
    const result = mergeCandidates(
      { candidates: sourceCandidates(source, '') },
      source,
      '',
    );
    const required = result.fields.find((field) => field.field === 'skills')!;
    expect(required.value).toContain(
      'including recent hands-on Generative AI experience',
    );
    expect(
      required.candidates.some((candidate) => candidate.quote === clause),
    ).toBe(true);
    expect(
      result.fields.find((field) => field.field === 'experience')?.value,
    ).toBe(duration === '6 years' ? '6 years' : 'Minimum 6 years');
    expect(
      result.fields.find((field) => field.field === 'preferredSkills')?.value,
    ).toContain('or model routing');
    expect(validateImportReview(result.fields, source, '')).toEqual(
      result.fields,
    );
  },
);

test('new vocabulary recovers only in qualifications, with no taxonomy or benefit leakage', () => {
  const source =
    'Responsibilities\nBuild amazing products.\nMust Have\nAbility to evaluate retrieval fidelity and coach distributed teams.\nNice to Have\nExperience designing evaluation harnesses or model routing.\nBenefits\nKubernetes training\nITviec Job Expertise: AI Architect\nSupplemental skill tags (not requirements): Kubernetes';
  const result = mergeCandidates(
    { candidates: sourceCandidates(source, '') },
    source,
    '',
  );
  expect(result.fields.find((field) => field.field === 'skills')?.value).toBe(
    'Ability to evaluate retrieval fidelity and coach distributed teams',
  );
  expect(
    result.fields.find((field) => field.field === 'preferredSkills')?.value,
  ).toBe('Experience designing evaluation harnesses or model routing');
});

test('historical fragments remain saveable without retroactive normalization', () => {
  const clause = golden.mustHave[6]!;
  const historical = mergeCandidates(
    { candidates: [proposal(clause, 'security')] },
    post,
    '',
    true,
    true,
    false,
  ).fields;
  expect(historical.find((field) => field.field === 'skills')?.value).toBe(
    'security',
  );
  expect(validateImportReview(historical, post, '')).toEqual(historical);
});
