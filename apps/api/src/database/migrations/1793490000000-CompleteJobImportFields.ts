import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CompleteJobImportFields1793490000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      `ALTER TABLE ai_job_hunter.opportunities ADD COLUMN experience text NOT NULL DEFAULT '', ADD COLUMN "preferredSkills" text NOT NULL DEFAULT '', ADD COLUMN domain text NOT NULL DEFAULT ''`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(
      `ALTER TABLE ai_job_hunter.opportunities DROP COLUMN experience, DROP COLUMN "preferredSkills", DROP COLUMN domain`,
    );
  }
}
