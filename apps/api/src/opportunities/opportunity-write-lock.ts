import type { EntityManager } from 'typeorm';
// Use the legacy discovery lock namespace so both routes coordinate during cutover.
export async function lockOpportunityWrites(
  manager: EntityManager,
  ownerId: string,
) {
  await manager.query(
    "SELECT pg_advisory_xact_lock(hashtext('job-discovery'), hashtext($1))",
    [ownerId],
  );
}
