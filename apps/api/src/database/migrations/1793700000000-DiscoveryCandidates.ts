import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DiscoveryCandidates1793700000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE ai_job_hunter.discovery_candidates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "ownerId" uuid NOT NULL,
      "sourceKey" varchar(100) NOT NULL CHECK (length(btrim("sourceKey")) > 0),
      "sourceJobId" varchar(200) NOT NULL CHECK (length(btrim("sourceJobId")) > 0),
      status varchar(20) NOT NULL DEFAULT 'NEW'
        CHECK (status IN ('NEW', 'SEEN', 'SAVED', 'DISMISSED')),
      snapshot jsonb NOT NULL CHECK (
        jsonb_typeof(snapshot) = 'object' AND octet_length(snapshot::text) <= 524288
      ),
      "firstSeenAt" timestamptz NOT NULL DEFAULT now(),
      "lastSeenAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "opportunityId" uuid NULL REFERENCES ai_job_hunter.opportunities(id) ON DELETE RESTRICT,
      CONSTRAINT discovery_candidates_identity UNIQUE ("ownerId", "sourceKey", "sourceJobId"),
      CONSTRAINT discovery_candidates_timestamps CHECK (
        isfinite("firstSeenAt") AND isfinite("lastSeenAt") AND isfinite("updatedAt")
        AND "lastSeenAt" >= "firstSeenAt"
      ),
      CONSTRAINT discovery_candidates_saved_link CHECK ((status = 'SAVED') = ("opportunityId" IS NOT NULL))
    )`);
    await runner.query(`CREATE INDEX discovery_candidates_queue
      ON ai_job_hunter.discovery_candidates ("ownerId", status, "firstSeenAt" DESC, id)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE ai_job_hunter.discovery_candidates');
  }
}
