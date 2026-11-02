import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { Repository } from 'typeorm';
import { AiService } from '../../src/ai/ai.service.js';
import type { ExtractionService } from '../../src/extraction/extraction.service.js';
import {
  normalizeGreenhouse,
  DISCOVERY_SOURCES,
} from '../../src/discovery/greenhouse.source.js';
import {
  canonicalRequirements,
  matchJobText,
  validateMatchAssessment,
  scoreCvMatch,
  type MatchRequirement,
} from '../../src/matching/cv-match.js';
import { JobMatchService } from '../../src/matching/job-match.service.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import type { SavedCv } from '../../src/matching/saved-cv.entity.js';
import type { Opportunity } from '../../src/opportunities/opportunity.entity.js';
import type { OpportunitiesService } from '../../src/opportunities/opportunities.service.js';
const facts = [
  '6+ years of professional software development experience',
  'Backend service experience in managed languages including Java',
  'Experience with SQL or NoSQL data stores',
  'Experience evaluating and integrating AI-assisted development tools into engineering workflows',
  'Experience designing and delivering highly-available, scalable cloud-based systems',
];
const sourceCv = [
  'Summary: 6+ years of\nprofessional software engineering.',
  'Backend — Java,\n Spring Boot, Node.js.',
  'Databases — PostgreSQL / SQL Server.',
  'Tools: Claude / ChatGPT / GitHub Copilot.',
].join('\n');
const sourceJob = normalizeGreenhouse(
  {
    jobs: [
      {
        id: 701,
        title: 'Senior Backend Engineer I',
        company_name: 'Synthetic Company',
        location: { name: 'Ho Chi Minh City' },
        absolute_url: 'https://job-boards.greenhouse.io/synthetic/jobs/701',
        content: `<h2>What You Bring</h2>${facts.map((fact) => `<p>${fact}</p>`).join('')}`,
      },
    ],
  },
  DISCOVERY_SOURCES[0],
  '2026-10-30T00:00:00Z',
).jobs[0]!;
const job = {
  ...sourceJob,
  experience: '',
  domain: '',
  postText: '',
  jdText: '',
  updatedAt: new Date('2026-10-30T00:00:00Z'),
} as Opportunity;
const canonical = canonicalRequirements(job);
const jd = matchJobText(job);
const evidence = [
  'Summary: 6+ years of professional software engineering.',
  'Backend — Java, Spring Boot, Node.js.',
  'Databases — PostgreSQL / SQL Server.',
  'Tools: Claude / ChatGPT / GitHub Copilot.',
  '',
];
const proposed = () =>
  canonical.map((seed, index) => ({ ...seed, cvQuote: evidence[index]! }));
function trace(proposals: MatchRequirement[]) {
  const verified = validateMatchAssessment(proposals, sourceCv, jd, canonical);
  return { verified, result: scoreCvMatch(verified, sourceCv, jd, canonical) };
}
test.each(['experience', 'Java backend', 'SQL databases', 'AI-assisted tools'])(
  '%s evidence survives proposal → linkage → original-span resolution → scoring',
  (kind) => {
    const index = [
      'experience',
      'Java backend',
      'SQL databases',
      'AI-assisted tools',
    ].indexOf(kind);
    const { verified, result } = trace(proposed());
    expect(verified[index]?.cvEvidenceUnverified).toBeUndefined();
    expect(sourceCv).toContain(verified[index]!.cvQuote);
    expect(result.requirements[index]).toMatchObject({
      requirement: facts[index],
      status: 'EVIDENCED',
      cvQuote: verified[index]!.cvQuote,
    });
    expect(result.score).toBeGreaterThan(0);
  },
);
test('reordered model rows and renamed labels retain linkage through exact JD evidence', () => {
  const rows = proposed()
    .map((row, index) => ({
      ...row,
      requirement: `Synthetic label ${index + 1}`,
    }))
    .reverse();
  const { result } = trace(rows);
  expect(
    result.requirements
      .filter((row) => row.status === 'EVIDENCED')
      .map((row) => row.requirement),
  ).toEqual(facts.slice(0, 4));
  expect(result.score).toBeGreaterThan(0);
});
test('a rejected SQL quote does not erase verified Java, experience or tooling matches', () => {
  const rows = proposed();
  rows[2]!.cvQuote = 'Invented SQL expertise';
  const { verified, result } = trace(rows);
  expect(verified[2]).toMatchObject({
    cvQuote: '',
    cvEvidenceUnverified: true,
  });
  expect(result.requirements[2]?.status).toBe('NOT_EVIDENCED');
  expect(
    result.requirements
      .filter((row) => row.status === 'EVIDENCED')
      .map((row) => row.requirement),
  ).toEqual([facts[0], facts[1], facts[3]]);
  expect(result.score).toBeGreaterThan(0);
});
test('all rejected positive quotations fail instead of masquerading as a negative-fit assessment', () => {
  const omitted = proposed().map((row) => ({ ...row, cvQuote: '' }));
  const rejected = proposed().map((row, index) => ({
    ...row,
    cvQuote: `Fabricated evidence ${index + 1}`,
  }));
  expect(trace(omitted).result.score).toBe(0);
  expect(() => trace(rejected)).toThrow(/evidence/i);
});
test('coding-tool evidence does not substantiate an actual production AI/ML requirement', () => {
  const production = 'Production AI/ML model development';
  const seed: MatchRequirement = {
    requirement: production,
    jdQuote: production,
    cvQuote: 'Tools: Claude / ChatGPT / GitHub Copilot.',
    priority: 'required',
    category: 'skill',
  };
  expect(() =>
    validateMatchAssessment([seed], sourceCv, production, [
      { ...seed, cvQuote: '' },
    ]),
  ).toThrow(/evidence/i);
});
test('the service sends verified rows to scoring and returns nonzero API-shaped output', async () => {
  const cvRow = {
    text: sourceCv,
    updatedAt: job.updatedAt,
    fileName: 'synthetic.pdf',
  };
  const cvs = {
    findOne: jest.fn<() => Promise<typeof cvRow>>().mockResolvedValue(cvRow),
    findOneBy: jest.fn<() => Promise<typeof cvRow>>().mockResolvedValue(cvRow),
  };
  const jobs = {
    get: jest.fn<() => Promise<Opportunity>>().mockResolvedValue(job),
  };
  const matching = new MatchingService();
  const spy = jest.spyOn(matching, 'matchSavedCv');
  const provider = {
    generate: jest.fn(async () => JSON.stringify({ requirements: proposed() })),
  };
  const service = new JobMatchService(
    cvs as unknown as Repository<SavedCv>,
    {} as ExtractionService,
    new AiService(provider),
    matching,
    jobs as unknown as OpportunitiesService,
  );
  const result = await service.analyze('synthetic');
  expect(result.score).toBeGreaterThan(0);
  expect(
    result.requirements.filter((row) => row.status === 'EVIDENCED'),
  ).toHaveLength(4);
  expect(spy.mock.calls[0]![0][0]!.cvQuote).toBe(
    'Summary: 6+ years of\nprofessional software engineering.',
  );
  expect(provider.generate).toHaveBeenCalledTimes(1); // Mock only.
});
