import 'reflect-metadata';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { databaseOptions } from '../../src/database/database.config.js';
import { JobDiscovery1793510000000 } from '../../src/database/migrations/1793510000000-JobDiscovery.js';
import { DatabaseModule } from '../../src/database/database.module.js';
import { OpportunitiesModule } from '../../src/opportunities/opportunities.module.js';
import { GreenhouseSource } from '../../src/discovery/greenhouse.source.js';
let database: DataSource;
let app: INestApplication;
const ids = new Set<string>();
const origin = { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:5173' };
const filters = {
  location: 'Ho Chi Minh City',
  stacks: ['Java', 'React'],
  workMode: 'All',
  seniority: 'Senior',
};
const fixture = (id: number, title: string, url: string) => ({
  id,
  title,
  company_name: 'Synthetic Discovery Company',
  absolute_url: url,
  location: { name: 'Ho Chi Minh City, Vietnam' },
  content: '<p>Required Java, Spring Boot. Hybrid work schedule.</p>',
});
let feed: unknown = { jobs: [] };
beforeAll(async () => {
  database = new DataSource(databaseOptions('test'));
  await database.initialize();
  await database.runMigrations();
  const module = await Test.createTestingModule({
    imports: [DatabaseModule, OpportunitiesModule],
  })
    .overrideProvider(GreenhouseSource)
    .useValue({ read: async () => feed })
    .compile();
  app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
});
afterAll(async () => {
  await app?.close();
  if (database?.isInitialized) {
    for (const id of ids)
      await database.query(
        'DELETE FROM ai_job_hunter.opportunities WHERE id=$1 AND company=$2',
        [id, 'Synthetic Discovery Company'],
      );
    await database.destroy();
  }
});
test('discovery migration reverts reapplies and repeat-runs without changing existing jobs', async () => {
  const history = await database.query(
    'SELECT * FROM public.typeorm_migrations ORDER BY id',
  );
  expect(history).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'JobDiscovery1793510000000' }),
    ]),
  );
  const runner = database.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    // Exercise discovery specifically, even when newer migrations are installed.
    // Roll back the fixture and DDL together so failures cannot leave schema drift.
    await runner.query(`INSERT INTO ai_job_hunter.opportunities
      ("ownerId", title, company, source, status, "originalLink", "contactNotes", description, notes, "contactDates", "followUpDate", "appliedDate", "applicationChannel")
      VALUES ('00000000-0000-4000-8000-000000000001', 'Synthetic discovery migration preservation', 'Synthetic Discovery Company', 'Other', 'APPLIED', '', '', '', 'Keep tracking notes', '["2026-10-30"]', '2026-11-03', '2026-10-25', 'Referral')`);
    const snapshot = () =>
      runner.query(
        'SELECT id, status, notes, "contactDates", "followUpDate"::text, "appliedDate"::text, "applicationChannel" FROM ai_job_hunter.opportunities ORDER BY id',
      );
    const before = await snapshot();
    const [populated] = await runner.query(
      'SELECT count(*)::int AS count FROM ai_job_hunter.opportunities WHERE discovery IS NOT NULL',
    );
    expect(populated.count).toBe(0);
    const migration = new JobDiscovery1793510000000();
    await migration.down(runner);
    expect(
      await runner.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='ai_job_hunter' AND table_name='opportunities' AND column_name='discovery'",
      ),
    ).toEqual([]);
    expect(await snapshot()).toEqual(before);
    await migration.up(runner);
    expect(
      await runner.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema='ai_job_hunter' AND table_name='opportunities' AND column_name='discovery'",
      ),
    ).toEqual([{ column_name: 'discovery' }]);
    expect(await snapshot()).toEqual(before);
  } finally {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }
  }
  expect(await database.runMigrations()).toEqual([]);
  expect(
    await database.query('SELECT * FROM public.typeorm_migrations ORDER BY id'),
  ).toEqual(history);
});
test('on-demand import deduplicates feeds and repeat runs, persists after reconnect, and preserves edits/tracker', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/opportunities/discover')
    .set({ ...origin, Origin: 'https://example.invalid' })
    .send(filters)
    .expect(403);
  const url =
    'https://job-boards.greenhouse.io/synthetic-discovery/jobs/900001';
  const title = 'Synthetic Discovery Senior Java Engineer';
  feed = { jobs: [fixture(900001, title, url)] };
  const first = await request(app.getHttpServer())
    .post('/api/v1/opportunities/discover')
    .set(origin)
    .send(filters)
    .expect(200);
  for (const id of first.body.importedIds) ids.add(id);
  expect(first.body).toMatchObject({
    found: 2,
    imported: 1,
    duplicatesSkipped: 1,
    errors: [],
  });
  const id = first.body.importedIds[0];
  const row = await request(app.getHttpServer())
    .get(`/api/v1/opportunities/${id}`)
    .expect(200);
  expect(row.body).toMatchObject({
    title,
    status: 'SAVED',
    source: 'Website',
    originalLink: url,
    discovery: { sourceName: 'Axon · Greenhouse', sourceJobId: '900001' },
  });
  const fields = Object.fromEntries(
    [
      'title',
      'company',
      'source',
      'status',
      'originalLink',
      'contactNotes',
      'description',
      'notes',
      'contactDates',
      'followUpDate',
      'agency',
      'location',
      'workMode',
      'employmentType',
      'seniority',
      'skills',
      'experience',
      'preferredSkills',
      'domain',
      'salary',
      'postText',
      'importReview',
    ].map((key) => [key, row.body[key]]),
  );
  const edited = {
    ...fields,
    title: 'Synthetic Discovery Manually corrected title',
    status: 'INTERVIEW',
    contactNotes: 'Synthetic recruiter contact',
    notes: 'Synthetic application notes',
    contactDates: ['2026-10-30'],
    followUpDate: '2026-11-02',
  };
  const saved = await request(app.getHttpServer())
    .put(`/api/v1/opportunities/${id}`)
    .set(origin)
    .send(edited)
    .expect(200);
  // Different source ID and URL still deduplicate by employer/title/location when applicable.
  feed = {
    jobs: [
      fixture(900001, title, url),
      fixture(
        900002,
        edited.title,
        'https://job-boards.greenhouse.io/another-source/jobs/900002',
      ),
    ],
  };
  const repeated = await request(app.getHttpServer())
    .post('/api/v1/opportunities/discover')
    .set(origin)
    .send(filters)
    .expect(200);
  expect(repeated.body).toMatchObject({ imported: 0, duplicatesSkipped: 4 });
  const reloaded = await request(app.getHttpServer())
    .get(`/api/v1/opportunities/${id}`)
    .expect(200);
  expect(reloaded.body).toEqual(saved.body);
  const fresh = new DataSource(databaseOptions('test'));
  await fresh.initialize();
  try {
    const [stored] = await fresh.query(
      'SELECT title,status,"contactNotes",notes,"contactDates","followUpDate"::text,discovery FROM ai_job_hunter.opportunities WHERE id=$1',
      [id],
    );
    expect(stored).toMatchObject({
      title: edited.title,
      status: 'INTERVIEW',
      contactNotes: edited.contactNotes,
      notes: edited.notes,
      contactDates: edited.contactDates,
      followUpDate: edited.followUpDate,
      discovery: saved.body.discovery,
    });
  } finally {
    await fresh.destroy();
  }
});
test('manual opportunities with tracked URL variants are skipped without any field updates', async () => {
  const url =
    'https://job-boards.greenhouse.io/synthetic-discovery/jobs/900003';
  const created = await request(app.getHttpServer())
    .post('/api/v1/opportunities')
    .set(origin)
    .send({
      title: 'Synthetic Discovery Manual role',
      company: 'Synthetic Discovery Company',
      source: 'Zalo',
      status: 'CONTACTED',
      originalLink: `${url}?utm_source=manual`,
      description: 'Synthetic private manual notes',
      contactNotes: 'Synthetic contact only',
      notes: 'Keep this',
      contactDates: ['2026-10-29'],
      followUpDate: null,
    })
    .expect(201);
  ids.add(created.body.id);
  feed = {
    jobs: [fixture(900003, 'Synthetic Discovery Updated feed title', url)],
  };
  const run = await request(app.getHttpServer())
    .post('/api/v1/opportunities/discover')
    .set(origin)
    .send(filters)
    .expect(200);
  expect(run.body).toMatchObject({ imported: 0, duplicatesSkipped: 2 });
  const unchanged = await request(app.getHttpServer())
    .get(`/api/v1/opportunities/${created.body.id}`)
    .expect(200);
  expect(unchanged.body).toEqual(created.body);
});
