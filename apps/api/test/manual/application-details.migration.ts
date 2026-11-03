import 'reflect-metadata';
import assert from 'node:assert/strict';
import { DataSource, type MigrationInterface } from 'typeorm';
import { databaseOptions } from '../../src/database/database.config.js';

// Run only against a freshly created disposable test database. No development target.
const options = databaseOptions('test');
const database = new DataSource(options);
await database.initialize();
try {
  const [identity] = await database.query(
    'SELECT current_database() AS db, current_user AS role',
  );
  assert.equal(identity.db, 'ai_job_hunter_test');
  assert.equal(identity.role, 'ai_job_hunter_test');
  const [existing] = await database.query(
    "SELECT to_regclass('ai_job_hunter.opportunities') AS table_name",
  );
  assert.equal(
    existing.table_name,
    null,
    'Requires a fresh disposable test database',
  );
} finally {
  await database.destroy();
}
const baseline = new DataSource({
  ...options,
  migrations: (options.migrations as (new () => MigrationInterface)[]).slice(
    0,
    -1,
  ),
});
await baseline.initialize();
await baseline.runMigrations();
const [fixture] = await baseline.query(`INSERT INTO ai_job_hunter.opportunities
  ("ownerId", title, company, source, status, "originalLink", "contactNotes", description, notes, "contactDates", "followUpDate")
  VALUES ('00000000-0000-4000-8000-000000000001', 'Synthetic P4 migration', 'Example', 'Email', 'APPLIED', '', 'Synthetic contact', '', 'Preserve notes', '["2026-10-30"]', '2026-11-03') RETURNING id`);
const snapshot = async (db: DataSource) =>
  (
    await db.query(
      "SELECT to_jsonb(o) - 'appliedDate' - 'applicationChannel' AS row FROM ai_job_hunter.opportunities o WHERE id=$1",
      [fixture.id],
    )
  )[0].row;
const before = await snapshot(baseline);
await baseline.destroy();
await database.initialize();
try {
  assert.equal((await database.runMigrations()).length, 1);
  assert.deepEqual(await snapshot(database), before);
  const [added] = await database.query(
    'SELECT "appliedDate", "applicationChannel" FROM ai_job_hunter.opportunities WHERE id=$1',
    [fixture.id],
  );
  assert.deepEqual(added, { appliedDate: null, applicationChannel: null });
  assert.equal((await database.runMigrations()).length, 0);
  await database.undoLastMigration();
  assert.deepEqual(await snapshot(database), before);
  const columns = await database.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='ai_job_hunter' AND table_name='opportunities' AND column_name IN ('appliedDate', 'applicationChannel')",
  );
  assert.equal(columns.length, 0);
  assert.equal((await database.runMigrations()).length, 1);
  assert.equal((await database.runMigrations()).length, 0);
  assert.deepEqual(await snapshot(database), before);
  console.log(
    'PASS: apply, repeat, revert, reapply, repeat; existing row unchanged; new fields null',
  );
} finally {
  await database.destroy();
}
