import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SavedCv1793500000000 implements MigrationInterface {
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      `CREATE TABLE ai_job_hunter.saved_cvs ("ownerId" uuid PRIMARY KEY, "fileName" text NOT NULL, text text NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query('DROP TABLE ai_job_hunter.saved_cvs');
  }
}
