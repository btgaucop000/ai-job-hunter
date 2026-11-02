import type { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateOpportunities1792800000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE ai_job_hunter.opportunities (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "ownerId" uuid NOT NULL,
      "title" varchar(300) NOT NULL, "company" varchar(300) NOT NULL,
      "source" varchar(20) NOT NULL CHECK (source IN ('Website','Facebook','Zalo','Email','Other')),
      "status" varchar(20) NOT NULL CHECK (status IN ('SAVED','CONTACTED','JD_RECEIVED','APPLIED','INTERVIEW','OFFER','REJECTED','CLOSED')),
      "originalLink" text NOT NULL, "contactNotes" text NOT NULL, "description" text NOT NULL, "notes" text NOT NULL,
      "contactDates" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("contactDates") = 'array'),
      "followUpDate" date,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      'CREATE INDEX opportunities_owner_updated ON ai_job_hunter.opportunities ("ownerId", "updatedAt" DESC)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE ai_job_hunter.opportunities');
  }
}
