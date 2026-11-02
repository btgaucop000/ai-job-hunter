import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import { Repository } from 'typeorm';
import { AiError } from '../../src/ai/ai.errors.js';
import { AiService } from '../../src/ai/ai.service.js';
import type { AiProvider } from '../../src/ai/ai-provider.js';
import type { ExtractionService } from '../../src/extraction/extraction.service.js';
import { JobMatchService } from '../../src/matching/job-match.service.js';
import { MatchingService } from '../../src/matching/matching.service.js';
import { SavedCv } from '../../src/matching/saved-cv.entity.js';
import {
  canonicalRequirements,
  type MatchRequirement,
} from '../../src/matching/cv-match.js';
import type { Opportunity } from '../../src/opportunities/opportunity.entity.js';
import type { OpportunitiesService } from '../../src/opportunities/opportunities.service.js';
const cvText =
  'Backend — Java, Spring Boot, Hibernate\nProfessional Summary: 6+ years of experience building enterprise applications\nTools: AI-assisted coding with Copilot.';
const job = {
  id: 'synthetic',
  title: 'Synthetic AI Developer',
  skills: 'Python, AI/ML, AI application development',
  preferredSkills: 'Backend Java, Voicebot',
  experience: 'Minimum 3 years',
  domain: 'Insurance',
  seniority: '',
  description:
    'Python, AI/ML, AI application development required. Backend Java and Voicebot preferred. Minimum 3 years.',
  postText: '',
  jdText: '',
  updatedAt: new Date('2026-10-30T00:00:00Z'),
} as Opportunity;
const output = () =>
  canonicalRequirements(job).map((item) => ({
    ...item,
    cvQuote:
      item.requirement === 'Backend Java'
        ? cvText.split('\n')[0]!
        : item.requirement === 'Minimum 3 years'
          ? cvText.split('\n')[1]!
          : '',
  }));
function setup(
  generate: AiProvider['generate'],
  text: string | null = cvText,
  savedJob = job,
) {
  const row =
    text === null
      ? null
      : { text, fileName: 'synthetic.pdf', updatedAt: job.updatedAt };
  const cvs = {
    findOne: jest.fn<() => Promise<typeof row>>().mockResolvedValue(row),
    findOneBy: jest.fn<() => Promise<typeof row>>().mockResolvedValue(row),
  };
  const jobs = {
    get: jest.fn<() => Promise<Opportunity>>().mockResolvedValue(savedJob),
  };
  const provider = { generate: jest.fn(generate) };
  const service = new JobMatchService(
    cvs as unknown as Repository<SavedCv>,
    {} as ExtractionService,
    new AiService(provider),
    new MatchingService(),
    jobs as unknown as OpportunitiesService,
  );
  return { service, provider, cvs, jobs };
}
test('synthetic accepted AI Developer still returns 27 with exact Java and duration evidence', async () => {
  const { service, provider } = setup(async (request) => {
    expect(request.prompt).toContain(cvText.split('\n')[0]);
    expect(request.prompt).toContain('Minimum 3 years');
    return JSON.stringify({ requirements: output() });
  });
  const result = await service.analyze('synthetic');
  expect(result.score).toBe(27);
  expect(
    result.requirements
      .filter((item) => item.status === 'EVIDENCED')
      .map((item) => item.requirement),
  ).toEqual(['Backend Java', 'Minimum 3 years']);
  for (const item of result.requirements.filter(
    (item) => item.status === 'EVIDENCED',
  ))
    expect(cvText).toContain(item.cvQuote);
  expect(provider.generate).toHaveBeenCalledTimes(1);
});
test.each([null, '', '   '])(
  'missing or blank saved CV never reaches inference/scoring (%p)',
  async (text) => {
    const { service, provider } = setup(
      async () => JSON.stringify({ requirements: output() }),
      text,
    );
    await expect(service.analyze('synthetic')).rejects.toThrow(/CV/i);
    expect(provider.generate).not.toHaveBeenCalled();
  },
);
test('empty model output is analysis failure, not a synthesized 0% Java match', async () => {
  const javaJob = {
    ...job,
    skills: 'Java',
    preferredSkills: '',
    experience: '',
    domain: '',
    description: 'Java required',
  };
  const { service } = setup(
    async () => JSON.stringify({ requirements: [] }),
    cvText,
    javaJob,
  );
  await expect(service.analyze('synthetic')).rejects.toThrow();
});
test.each([
  'timeout',
  'malformed JSON',
  'schema mismatch',
  'unverifiable JD quote',
  'omitted canonical requirements',
])('%s fails explicitly instead of producing a Low Fit score', async (kind) => {
  const { service } = setup(async () => {
    if (kind === 'timeout') throw new AiError('TIMEOUT');
    if (kind === 'malformed JSON') return '{';
    if (kind === 'schema mismatch') return JSON.stringify({ score: 0 });
    const rows = output();
    if (kind === 'unverifiable JD quote')
      rows.push({
        ...rows[0]!,
        requirement: 'Fabricated requirement',
        jdQuote: 'Not present in job',
      });
    if (kind === 'omitted canonical requirements') rows.splice(0, 1);
    return JSON.stringify({ requirements: rows });
  });
  await expect(service.analyze('synthetic')).rejects.toThrow();
});
test('a valid fully evaluated negative assessment is allowed to remain genuinely zero', async () => {
  const javaJob = {
    ...job,
    skills: 'Java',
    preferredSkills: '',
    experience: '',
    domain: '',
    description: 'Java required',
  };
  const { service } = setup(
    async () =>
      JSON.stringify({
        requirements: [
          {
            requirement: 'Java',
            priority: 'required',
            category: 'skill',
            jdQuote: 'Java',
            cvQuote: '',
          } satisfies MatchRequirement,
        ],
      }),
    'Synthetic CV: SQL reporting experience.',
    javaJob,
  );
  expect(await service.analyze('synthetic')).toMatchObject({
    score: 0,
    recommendation: 'Low Fit',
  });
});

test('AI-assisted coding tool evidence cannot substantiate production AI/ML', async () => {
  const { service } = setup(async () => {
    const requirements = output();
    requirements.find((item) => item.requirement === 'AI/ML')!.cvQuote =
      'Tools: AI-assisted coding with Copilot.';
    return JSON.stringify({ requirements });
  });
  const result = await service.analyze('synthetic');
  expect(result.score).toBe(27);
  expect(
    result.requirements.find((item) => item.requirement === 'AI/ML'),
  ).toMatchObject({ status: 'NOT_EVIDENCED', cvQuote: '' });
});

test('HTTP pipeline returns structured success or explicit errors without a fabricated score', async () => {
  const { Test } = await import('@nestjs/testing');
  const { default: request } = await import('supertest');
  const { OpportunitiesController } =
    await import('../../src/opportunities/opportunities.controller.js');
  const { OpportunitiesService } =
    await import('../../src/opportunities/opportunities.service.js');
  const { JobImportService } =
    await import('../../src/opportunities/job-import.service.js');
  const { DiscoveryService } =
    await import('../../src/discovery/discovery.service.js');
  const { service, provider } = setup(async () =>
    JSON.stringify({ requirements: output() }),
  );
  const module = await Test.createTestingModule({
    controllers: [OpportunitiesController],
    providers: [
      { provide: JobMatchService, useValue: service },
      { provide: OpportunitiesService, useValue: {} },
      { provide: JobImportService, useValue: {} },
      { provide: DiscoveryService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  const origin = { Origin: 'http://127.0.0.1:5173', Host: '127.0.0.1:3000' };
  const route =
    '/api/v1/opportunities/00000000-0000-4000-8000-000000000123/match';
  try {
    const success = await request(app.getHttpServer())
      .post(route)
      .set(origin)
      .expect(200);
    expect(success.body.score).toBe(27);
    provider.generate.mockImplementation(async () =>
      JSON.stringify({ requirements: [] }),
    );
    const empty = await request(app.getHttpServer())
      .post(route)
      .set(origin)
      .expect(503);
    expect(empty.body.errorCode).toBe('CV_MATCH_INVALID_OUTPUT');
    expect(empty.body.score).toBeUndefined();
    provider.generate.mockImplementation(async () => {
      throw new AiError('TIMEOUT');
    });
    const timeout = await request(app.getHttpServer())
      .post(route)
      .set(origin)
      .expect(504);
    expect(timeout.body.errorCode).toBe('CV_MATCH_TIMEOUT');
    expect(timeout.body.message).toContain('no new fit score');
    expect(timeout.body.score).toBeUndefined();
  } finally {
    await app.close();
  }
});

test('explicit AI-assisted coding-tool requirements can still use tool evidence', async () => {
  const toolingJob = {
    ...job,
    skills: 'AI-assisted coding tools',
    preferredSkills: '',
    experience: '',
    domain: '',
    description: 'AI-assisted coding tools required',
  };
  const { service } = setup(
    async () =>
      JSON.stringify({
        requirements: [
          {
            requirement: 'AI-assisted coding tools',
            priority: 'required',
            category: 'skill',
            jdQuote: 'AI-assisted coding tools',
            cvQuote: 'Tools: AI-assisted coding with Copilot.',
          },
        ],
      }),
    cvText,
    toolingJob,
  );
  expect(await service.analyze('synthetic')).toMatchObject({ score: 100 });
});

test('provider output outside the allowed CV passages fails explicitly instead of returning zero', async () => {
  const { service } = setup(async () => {
    const requirements = output();
    requirements[0]!.cvQuote = 'Invented Python production experience';
    return JSON.stringify({ requirements });
  });
  await expect(service.analyze('synthetic')).rejects.toThrow(
    /invalid matching output/i,
  );
});

test('service returns source-selected quotes and keeps unsupported qualifications unverified', async () => {
  const source =
    'Backend — Java,\n  Spring Boot\n6+ years of\nexperience building enterprise applications\nTools: AI-assisted\n coding with Copilot.';
  const mixedJob = {
    ...job,
    skills: 'Java, SQL, AI-assisted coding tools',
    preferredSkills: '',
    domain: '',
    description:
      'Java, SQL and AI-assisted coding tools required. Minimum 3 years.',
  };
  const quotes: Record<string, string> = {
    Java: 'Backend — Java, Spring Boot',
    SQL: '',
    'AI-assisted coding tools': 'Tools: AI-assisted coding with Copilot.',
    'Minimum 3 years':
      '6+ years of experience building enterprise applications',
  };
  const { service } = setup(
    async () =>
      JSON.stringify({
        requirements: canonicalRequirements(mixedJob).map((item) => ({
          ...item,
          cvQuote: quotes[item.requirement] ?? '',
        })),
      }),
    source,
    mixedJob,
  );
  const result = await service.analyze('synthetic');
  expect(result.score).toBe(75);
  expect(result.recommendation).toBe('Consider');
  expect(
    result.requirements.find((item) => item.requirement === 'SQL'),
  ).toMatchObject({ cvQuote: '', status: 'NOT_EVIDENCED' });
  for (const item of result.requirements.filter(
    (item) => item.status === 'EVIDENCED',
  ))
    expect(source).toContain(item.cvQuote);
  expect(
    result.requirements.find((item) => item.requirement === 'Java')?.cvQuote,
  ).toBe('Backend — Java,\n  Spring Boot');
  expect(
    result.requirements.every((item) => !('cvEvidenceUnverified' in item)),
  ).toBe(true);
});

test('evidence rejection logs once, never scores, and never writes saved records', async () => {
  const write = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  const score = jest.spyOn(MatchingService.prototype, 'matchSavedCv');
  const { service, cvs, jobs } = setup(async () => {
    const rows = output();
    rows[0] = { ...rows[0]!, jdQuote: 'Synthetic unsupported JD quotation' };
    return JSON.stringify({ requirements: rows });
  });
  const saveCv = jest.fn(),
    saveJob = jest.fn();
  Object.assign(cvs, { upsert: saveCv, save: saveCv, update: saveCv });
  Object.assign(jobs, { save: saveJob, update: saveJob });
  try {
    await expect(service.analyze('synthetic')).rejects.toMatchObject({
      errorCode: 'CV_MATCH_EVIDENCE_REJECTED',
    });
    expect(score).not.toHaveBeenCalled();
    expect(saveCv).not.toHaveBeenCalled();
    expect(saveJob).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    write.mockRestore();
    score.mockRestore();
  }
});
