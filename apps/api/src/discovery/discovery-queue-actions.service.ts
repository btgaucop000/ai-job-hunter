import { GREENHOUSE_SCOPE } from './greenhouse-registry.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type EntityManager } from 'typeorm';
import { OpportunitiesService } from '../opportunities/opportunities.service.js';
import { lockOpportunityWrites } from '../opportunities/opportunity-write-lock.js';
import { discoverySourceKey } from './greenhouse.source.js';
import { DiscoveryService } from './discovery.service.js';
import { DiscoveryCandidate } from './discovery-candidate.entity.js';
import {
  validateCandidateSnapshot,
  validateQueueId,
} from './discovery-candidate.validation.js';
import {
  assertReviewTransition,
  validateReviewStatus,
  validateSaveConfirmation,
} from './discovery-actions.validation.js';

@Injectable()
export class DiscoveryQueueActionsService {
  private running = false;
  constructor(
    @InjectRepository(DiscoveryCandidate)
    private readonly candidates: Repository<DiscoveryCandidate>,
    private readonly discovery: DiscoveryService,
    private readonly opportunities: OpportunitiesService,
  ) {}
  async run(ownerId: string, input: unknown) {
    validateQueueId(ownerId);
    if (this.running)
      throw new ConflictException(
        'Discovery is already running. Wait for it to finish.',
      );
    this.running = true;
    try {
      // No transaction or database lock during source requests.
      const {
        jobs,
        errors,
        scannedAt,
        fetched,
        normalized,
        sources,
        sourceFailures,
        warnings,
      } = await this.discovery.scan(input);
      const unique = new Map<
        string,
        {
          sourceKey: string;
          snapshot: ReturnType<typeof validateCandidateSnapshot>;
        }
      >();
      for (const job of jobs) {
        const snapshot = validateCandidateSnapshot(job);
        const sourceKey = discoverySourceKey(snapshot.discovery);
        if (!sourceKey) throw new Error('Unrecognized discovery source');
        const key = `${sourceKey}:${snapshot.discovery.sourceJobId}`;
        if (!unique.has(key)) unique.set(key, { sourceKey, snapshot });
      }
      const counts = await this.candidates.manager.transaction(
        async (manager) => {
          await lockOpportunityWrites(manager, ownerId);
          const rows = manager.getRepository(DiscoveryCandidate);
          const existing = await rows.find({
            where: { ownerId },
            select: { id: true, sourceKey: true, sourceJobId: true },
          });
          const byKey = new Map(
            existing.map((row) => [`${row.sourceKey}:${row.sourceJobId}`, row]),
          );
          let added = 0,
            refreshed = 0,
            remaining = 0;
          for (const [key, { sourceKey, snapshot }] of unique) {
            const row = byKey.get(key);
            if (row) {
              // Deliberately do not update snapshot, status, link or updatedAt.
              await manager.query(
                'UPDATE ai_job_hunter.discovery_candidates SET "lastSeenAt"=GREATEST("lastSeenAt", $1::timestamptz) WHERE id=$2 AND "ownerId"=$3',
                [scannedAt, row.id, ownerId],
              );
              refreshed++;
            } else if (added < 50) {
              await rows.insert({
                ownerId,
                sourceKey,
                sourceJobId: snapshot.discovery.sourceJobId,
                snapshot,
                status: 'NEW',
                firstSeenAt: new Date(scannedAt),
                lastSeenAt: new Date(scannedAt),
                opportunityId: null,
              });
              added++;
            } else remaining++;
          }
          return { found: unique.size, added, refreshed, remaining };
        },
      );
      return {
        ...counts,
        eligible: counts.found,
        fetched,
        normalized,
        sources,
        sourceFailures,
        warnings,
        errors,
        scannedAt,
        scope: `${GREENHOUSE_SCOPE} Filters rank locally; unknown metadata stays eligible. Up to 50 new candidates per run. Review and save to Inbox explicitly.`,
      };
    } finally {
      this.running = false;
    }
  }
  private async locked(manager: EntityManager, ownerId: string, id: string) {
    await lockOpportunityWrites(manager, ownerId);
    const row = await manager
      .getRepository(DiscoveryCandidate)
      .findOne({ where: { id, ownerId }, lock: { mode: 'pessimistic_write' } });
    if (!row) throw new NotFoundException('Discovery candidate not found.');
    return row;
  }
  async status(ownerId: string, id: string, input: unknown) {
    validateQueueId(ownerId);
    validateQueueId(id);
    const status = validateReviewStatus(input);
    return this.candidates.manager.transaction(async (manager) => {
      const row = await this.locked(manager, ownerId, id);
      assertReviewTransition(row.status, status);
      if (row.status !== status) {
        row.status = status;
        await manager.getRepository(DiscoveryCandidate).save(row);
      }
      return row;
    });
  }
  async save(ownerId: string, id: string, input: unknown) {
    validateQueueId(ownerId);
    validateQueueId(id);
    const confirmSeparate = validateSaveConfirmation(input);
    return this.candidates.manager.transaction(async (manager) => {
      const row = await this.locked(manager, ownerId, id);
      if (row.opportunityId) {
        await this.opportunities.requireOwnedLink(
          manager,
          ownerId,
          row.opportunityId,
        );
        return {
          candidateId: row.id,
          status: 'SAVED' as const,
          opportunityId: row.opportunityId,
          outcome: 'already_saved' as const,
        };
      }
      const result = await this.opportunities.saveDiscovered(
        manager,
        ownerId,
        row.sourceKey,
        row.snapshot,
        confirmSeparate,
      );
      row.status = 'SAVED';
      row.opportunityId = result.opportunityId;
      await manager.getRepository(DiscoveryCandidate).save(row);
      return { candidateId: row.id, status: 'SAVED' as const, ...result };
    });
  }
}
