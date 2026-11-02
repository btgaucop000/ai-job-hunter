import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SmartJobImport1793400000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE ai_job_hunter.opportunities
      ADD COLUMN agency text NOT NULL DEFAULT '', ADD COLUMN location text NOT NULL DEFAULT '',
      ADD COLUMN "workMode" text NOT NULL DEFAULT '', ADD COLUMN "employmentType" text NOT NULL DEFAULT '',
      ADD COLUMN seniority text NOT NULL DEFAULT '', ADD COLUMN skills text NOT NULL DEFAULT '', ADD COLUMN salary text NOT NULL DEFAULT '',
      ADD COLUMN "postText" text NOT NULL DEFAULT '', ADD COLUMN "jdText" text NOT NULL DEFAULT '',
      ADD COLUMN "importReview" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN "documentName" text, ADD COLUMN "documentType" text, ADD COLUMN "documentBytes" bytea`);
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE ai_job_hunter.opportunities DROP COLUMN agency, DROP COLUMN location,
      DROP COLUMN "workMode", DROP COLUMN "employmentType", DROP COLUMN seniority, DROP COLUMN skills,
      DROP COLUMN salary, DROP COLUMN "postText", DROP COLUMN "jdText", DROP COLUMN "importReview",
      DROP COLUMN "documentName", DROP COLUMN "documentType", DROP COLUMN "documentBytes"`);
  }
}
