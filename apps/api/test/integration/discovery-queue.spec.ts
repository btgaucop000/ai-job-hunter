import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test } from '@jest/globals';
import { DataSource, type QueryRunner } from 'typeorm';
import { databaseOptions } from '../../src/database/database.config.js';
import { DiscoveryCandidates1793700000000 } from '../../src/database/migrations/1793700000000-DiscoveryCandidates.js';
import { DiscoveryCandidate } from '../../src/discovery/discovery-candidate.entity.js';
import { DiscoveryQueueService } from '../../src/discovery/discovery-queue.service.js';
import { candidateSnapshot } from '../support/discovery-candidate.synthetic.js';

let database: DataSource;
beforeAll(async () => {
  database = new DataSource(databaseOptions('test'));
  await database.initialize();
  expect(
    await database.query(
      'SELECT current_database() AS database, current_user AS role',
    ),
  ).toEqual([{ database: 'ai_job_hunter_test', role: 'ai_job_hunter_test' }]);
  await database.runMigrations();
});
afterAll(async () => {
  if (database?.isInitialized) await database.destroy();
});
async function transaction(run: (runner: QueryRunner) => Promise<void>) {
  const runner = database.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await run(runner);
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
}
async function job(
  runner: QueryRunner | DataSource,
  owner: string,
): Promise<string> {
  const [row] = await runner.query(
    `INSERT INTO ai_job_hunter.opportunities
    ("ownerId",title,company,source,status,"originalLink","contactNotes",description,notes)
    VALUES ($1,'Synthetic queue job','Synthetic Company','Website','SAVED','','','','Keep synthetic notes') RETURNING id`,
    [owner],
  );
  return row.id as string;
}

test('migration down/up preserves Inbox rows and repeat runner does nothing', async () => {
  expect(await database.runMigrations()).toEqual([]);
  await transaction(async (runner) => {
    const id = await job(runner, randomUUID());
    const before = await runner.query(
      'SELECT * FROM ai_job_hunter.opportunities WHERE id=$1',
      [id],
    );
    // Never drop persisted queue data, even in the isolated DB. Rollback protects all DDL.
    const [{ count }] = await runner.query(
      'SELECT count(*)::int AS count FROM ai_job_hunter.discovery_candidates',
    );
    expect(count).toBe(0);
    const migration = new DiscoveryCandidates1793700000000();
    await migration.down(runner);
    expect(
      await runner.query(
        "SELECT to_regclass('ai_job_hunter.discovery_candidates') AS table",
      ),
    ).toEqual([{ table: null }]);
    await migration.up(runner);
    expect(
      await runner.query(
        'SELECT * FROM ai_job_hunter.opportunities WHERE id=$1',
        [id],
      ),
    ).toEqual(before);
    expect(
      await runner.query('SELECT * FROM ai_job_hunter.discovery_candidates'),
    ).toEqual([]);
  });
  expect(await database.showMigrations()).toBe(false);
});

test('DB enforces identity, states, bounds, timestamps, saved links and restricted deletion', async () => {
  await transaction(async (runner) => {
    const owner = randomUUID();
    const otherOwner = randomUUID();
    const opportunity = await job(runner, owner);
    const insert = (
      sourceKey = 'greenhouse:axon',
      sourceJobId = '123',
      ownerId = owner,
    ) =>
      runner.query(
        `INSERT INTO ai_job_hunter.discovery_candidates ("ownerId","sourceKey","sourceJobId",snapshot)
        VALUES ($1,$2,$3,$4) RETURNING id`,
        [ownerId, sourceKey, sourceJobId, candidateSnapshot()],
      );
    const [candidate] = await insert();
    const reject = async (operation: () => Promise<unknown>, code: string) => {
      await runner.query('SAVEPOINT invalid_candidate');
      try {
        await expect(operation()).rejects.toMatchObject({
          driverError: { code },
        });
      } finally {
        await runner.query('ROLLBACK TO SAVEPOINT invalid_candidate');
      }
    };
    await reject(() => insert(), '23505');
    await insert('greenhouse:axon', '123', otherOwner);
    await insert('greenhouse:backbase');
    await insert('greenhouse:axon', '124');
    await reject(() => insert(' '), '23514');
    await reject(() => insert('x'.repeat(101)), '22001');
    await reject(() => insert('greenhouse:axon', ''), '23514');
    for (const assignments of [
      "status='UNKNOWN'",
      "status='SAVED'",
      "snapshot='[]'::jsonb",
      "snapshot='null'::jsonb",
      '"lastSeenAt"="firstSeenAt" - interval \'1 second\'',
      '"firstSeenAt"=\'-infinity\'::timestamptz',
    ])
      await reject(
        () =>
          runner.query(
            `UPDATE ai_job_hunter.discovery_candidates SET ${assignments} WHERE id=$1`,
            [candidate.id],
          ),
        '23514',
      );
    await reject(
      () =>
        runner.query(
          'UPDATE ai_job_hunter.discovery_candidates SET snapshot=$1 WHERE id=$2',
          [{ text: 'x'.repeat(524289) }, candidate.id],
        ),
      '23514',
    );
    await reject(
      () =>
        runner.query(
          'UPDATE ai_job_hunter.discovery_candidates SET "opportunityId"=$1 WHERE id=$2',
          [opportunity, candidate.id],
        ),
      '23514',
    );
    await reject(
      () =>
        runner.query(
          'UPDATE ai_job_hunter.discovery_candidates SET status=\'SAVED\', "opportunityId"=$1 WHERE id=$2',
          [randomUUID(), candidate.id],
        ),
      '23503',
    );
    await runner.query(
      'UPDATE ai_job_hunter.discovery_candidates SET status=\'SAVED\', "opportunityId"=$1 WHERE id=$2',
      [opportunity, candidate.id],
    );
    await reject(
      () =>
        runner.query('DELETE FROM ai_job_hunter.opportunities WHERE id=$1', [
          opportunity,
        ]),
      '23503',
    );
  });
});

test('query service filters, orders, clamps pages and isolates owners without marking seen', async () => {
  const owner = randomUUID(),
    otherOwner = randomUUID();
  const repository = database.getRepository(DiscoveryCandidate);
  const service = new DiscoveryQueueService(repository);
  const opportunity = await job(database, owner);
  const date = new Date('2026-11-03T00:00:00Z');
  try {
    const rows = await repository.save(
      Array.from({ length: 15 }, (_, index) =>
        repository.create({
          ownerId: owner,
          sourceKey: 'synthetic:queue',
          sourceJobId: String(index),
          snapshot: candidateSnapshot(),
          status:
            index < 11
              ? 'NEW'
              : index < 13
                ? 'SEEN'
                : index === 13
                  ? 'SAVED'
                  : 'DISMISSED',
          firstSeenAt: index === 0 ? new Date('2026-11-02T00:00:00Z') : date,
          lastSeenAt: date,
          opportunityId: index === 13 ? opportunity : null,
        }),
      ),
    );
    const other = await repository.save(
      repository.create({
        ownerId: otherOwner,
        sourceKey: 'synthetic:queue',
        sourceJobId: '0',
        snapshot: candidateSnapshot(),
      }),
    );
    const expected = rows
      .filter((row) => ['NEW', 'SEEN'].includes(row.status))
      .sort(
        (a, b) =>
          (a.status === b.status ? 0 : a.status === 'NEW' ? -1 : 1) ||
          b.firstSeenAt.getTime() - a.firstSeenAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    const first = await service.list(owner);
    expect(first).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 13,
      totalPages: 2,
    });
    expect(first.items.map((row) => row.id)).toEqual(
      expected.slice(0, 10).map((row) => row.id),
    );
    const last = await service.list(owner, { page: '999' });
    expect(last.page).toBe(2);
    expect(last.items.map((row) => row.id)).toEqual(
      expected.slice(10).map((row) => row.id),
    );
    for (const [filter, total] of [
      ['new', 11],
      ['seen', 2],
      ['saved', 1],
      ['dismissed', 1],
      ['all', 15],
    ] as const) {
      const result = await service.list(owner, { filter });
      expect(result.total).toBe(total);
      expect(result.items).toHaveLength(Math.min(10, total));
      if (filter !== 'all')
        expect(
          result.items.every((row) => row.status === filter.toUpperCase()),
        ).toBe(true);
    }
    const all = await service.list(owner, { filter: 'all' });
    const chronological = [...rows].sort(
      (a, b) =>
        b.firstSeenAt.getTime() - a.firstSeenAt.getTime() ||
        a.id.localeCompare(b.id),
    );
    expect(all.items.map((row) => row.id)).toEqual(
      chronological.slice(0, 10).map((row) => row.id),
    );
    expect((await service.get(owner, rows[0]!.id)).status).toBe('NEW');
    await expect(service.get(owner, other.id)).rejects.toThrow(
      'Discovery candidate not found',
    );
    await expect(service.get(owner, randomUUID())).rejects.toThrow(
      'Discovery candidate not found',
    );
    expect(await service.list(randomUUID(), { page: 5 })).toEqual({
      items: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    expect((await service.list(otherOwner)).total).toBe(1);
    // ORM updates may refresh timestamps later, but cannot replace source evidence.
    await repository.update(rows[0]!.id, {
      snapshot: {
        ...candidateSnapshot(),
        title: 'Replacement must be ignored',
      },
      lastSeenAt: new Date('2026-11-04T00:00:00Z'),
    });
    const retained = await service.get(owner, rows[0]!.id);
    expect(retained.snapshot).toEqual(candidateSnapshot());
    expect(retained.status).toBe('NEW');
    expect(retained.lastSeenAt.toISOString()).toBe('2026-11-04T00:00:00.000Z');
  } finally {
    await repository.delete({ ownerId: owner });
    await repository.delete({ ownerId: otherOwner });
    await database.query(
      'DELETE FROM ai_job_hunter.opportunities WHERE id=$1 AND "ownerId"=$2',
      [opportunity, owner],
    );
  }
});
