import type { MigrationInterface, QueryRunner } from 'typeorm';
export class JobDiscovery1793510000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      'ALTER TABLE ai_job_hunter.opportunities ADD COLUMN discovery jsonb NULL',
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(
      'ALTER TABLE ai_job_hunter.opportunities DROP COLUMN discovery',
    );
  }
}
