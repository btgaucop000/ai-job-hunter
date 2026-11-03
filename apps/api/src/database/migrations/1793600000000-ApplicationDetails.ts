import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ApplicationDetails1793600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE ai_job_hunter.opportunities
      ADD COLUMN "appliedDate" date,
      ADD COLUMN "applicationChannel" varchar(200)`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE ai_job_hunter.opportunities
      DROP COLUMN "applicationChannel",
      DROP COLUMN "appliedDate"`);
  }
}
