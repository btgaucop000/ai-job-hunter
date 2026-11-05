import type { GenerationRequest } from '../../src/ai/ai-provider.js';
import type { MatchRequirement } from '../../src/matching/cv-match.js';
import { SavedCv1793500000000 } from '../../src/database/migrations/1793500000000-SavedCv.js';
import 'reflect-metadata';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { databaseOptions } from '../../src/database/database.config.js';
import { DatabaseModule } from '../../src/database/database.module.js';
import { OpportunitiesModule } from '../../src/opportunities/opportunities.module.js';
import { AI_PROVIDER } from '../../src/ai/ai-provider.js';
import { LOCAL_OWNER_ID } from '../../src/opportunities/opportunities.service.js';
import { pdfFixture } from '../support/pdf-fixtures.js';
let app: INestApplication;
let database: DataSource;
let id: string;
let ownsCv = false;
let generations = 0;
const origin = { Origin: 'http://127.0.0.1:5173', Host: '127.0.0.1:3000' };
const syntheticName = 'synthetic-match-cv.pdf';
beforeAll(async () => {
  database = new DataSource(databaseOptions('test'));
  await database.initialize();
  await database.runMigrations();
  // Never replace an existing test fixture owned by another test run.
  expect(
    await database.query('SELECT "ownerId" FROM ai_job_hunter.saved_cvs'),
  ).toEqual([]);
  const module = await Test.createTestingModule({
    imports: [DatabaseModule, OpportunitiesModule],
  })
    .overrideProvider(AI_PROVIDER)
    .useValue({
      generate: async (request: GenerationRequest) => {
        generations++;
        const data = JSON.parse(request.prompt.split('\n').at(-1)!) as {
          cv: string;
          canonicalRequirements: MatchRequirement[];
        };
        return JSON.stringify({
          // Prompt-only group metadata is input context, not model output.
          requirements: data.canonicalRequirements.map((item) => ({
            parentId: item.parentId,
            requirement: item.requirement,
            priority: item.priority,
            category: item.category,
            jdQuote: item.jdQuote,
            cvQuote: data.cv.includes(`Built ${item.requirement} services.`)
              ? `Built ${item.requirement} services.`
              : '',
          })),
        });
      },
    })
    .compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
});
afterAll(async () => {
  await app?.close();
  if (database?.isInitialized) {
    if (ownsCv)
      await database.query(
        'DELETE FROM ai_job_hunter.saved_cvs WHERE "ownerId"=$1 AND "fileName"=$2',
        [LOCAL_OWNER_ID, syntheticName],
      );
    if (id)
      await database.query(
        'DELETE FROM ai_job_hunter.opportunities WHERE id=$1 AND title=$2',
        [id, 'Synthetic CV match fixture'],
      );
    await database.destroy();
  }
});
test('new migration reverses reapplies and repeat-runs without touching jobs', async () => {
  const before = await database.query(
    'SELECT id, "updatedAt" FROM ai_job_hunter.opportunities ORDER BY id',
  );
  const runner = database.createQueryRunner();
  await runner.connect();
  const migration = new SavedCv1793500000000();
  await migration.down(runner);
  expect(
    await database.query(
      "SELECT to_regclass('ai_job_hunter.saved_cvs') AS name",
    ),
  ).toEqual([{ name: null }]);
  await migration.up(runner);
  await runner.release();
  expect(await database.runMigrations()).toEqual([]);
  expect(
    await database.query(
      'SELECT id, "updatedAt" FROM ai_job_hunter.opportunities ORDER BY id',
    ),
  ).toEqual(before);
});
test('synthetic CV upload persists and matching reuses latest CV/job without modifying tracker', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/opportunities/cv/current')
    .set({ ...origin, Origin: 'https://example.invalid' })
    .expect(403);
  const saved = await request(app.getHttpServer())
    .post('/api/v1/opportunities/cv/current')
    .set(origin)
    .field('record', '{}')
    .attach('document', Buffer.from(pdfFixture(['Built Python services.'])), {
      filename: syntheticName,
      contentType: 'application/pdf',
    })
    .expect(200);
  ownsCv = true;
  expect(saved.body.fileName).toBe(syntheticName);
  expect(saved.body.text).toBeUndefined();
  expect(generations).toBe(0);
  const fresh = new DataSource(databaseOptions('test'));
  await fresh.initialize();
  try {
    const [stored] = await fresh.query(
      'SELECT text FROM ai_job_hunter.saved_cvs WHERE "ownerId"=$1',
      [LOCAL_OWNER_ID],
    );
    expect(stored.text).toContain('Built Python services.');
  } finally {
    await fresh.destroy();
  }
  await request(app.getHttpServer())
    .get('/api/v1/opportunities/cv/current')
    .expect(200)
    .expect((response) => expect(response.body.fileName).toBe(syntheticName));
  const input = {
    title: 'Synthetic CV match fixture',
    company: '',
    source: 'Other',
    status: 'INTERVIEW',
    originalLink: '',
    contactNotes: '',
    description: 'Python required',
    skills: 'Python',
    notes: 'Synthetic tracking notes',
    contactDates: ['2026-10-30'],
    followUpDate: '2026-11-02',
  };
  const created = await request(app.getHttpServer())
    .post('/api/v1/opportunities')
    .set(origin)
    .send(input)
    .expect(201);
  id = created.body.id;
  const first = await request(app.getHttpServer())
    .post(`/api/v1/opportunities/${id}/match`)
    .set(origin)
    .expect(200);
  expect(first.body).toMatchObject({ score: 100, recommendation: 'Apply' });
  const unchanged = await request(app.getHttpServer())
    .get(`/api/v1/opportunities/${id}`)
    .expect(200);
  expect(unchanged.body).toEqual(created.body);
  await request(app.getHttpServer())
    .put(`/api/v1/opportunities/${id}`)
    .set(origin)
    .send({ ...input, skills: 'Python, Java' })
    .expect(200);
  const second = await request(app.getHttpServer())
    .post(`/api/v1/opportunities/${id}/match`)
    .set(origin)
    .expect(200);
  expect(second.body.score).toBe(50);
  expect(second.body.requirements).toContainEqual(
    expect.objectContaining({ requirement: 'Java', status: 'NOT_EVIDENCED' }),
  );
  await request(app.getHttpServer())
    .post('/api/v1/opportunities/cv/current')
    .set(origin)
    .field('record', '{}')
    .attach('document', Buffer.from(pdfFixture(['Built Java services.'])), {
      filename: syntheticName,
      contentType: 'application/pdf',
    })
    .expect(200);
  const third = await request(app.getHttpServer())
    .post(`/api/v1/opportunities/${id}/match`)
    .set(origin)
    .expect(200);
  expect(third.body.score).toBe(50);
  expect(third.body.requirements).toContainEqual(
    expect.objectContaining({
      requirement: 'Java',
      status: 'EVIDENCED',
      cvQuote: 'Built Java services.',
    }),
  );
  expect(generations).toBe(3); // Mock provider only; no Ollama calls.
  const tracker = await request(app.getHttpServer())
    .get(`/api/v1/opportunities/${id}`)
    .expect(200);
  expect(tracker.body).toMatchObject({
    status: 'INTERVIEW',
    notes: input.notes,
    contactDates: input.contactDates,
    followUpDate: input.followUpDate,
  });
});
