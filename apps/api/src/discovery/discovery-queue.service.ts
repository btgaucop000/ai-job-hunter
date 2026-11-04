import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscoveryCandidate } from './discovery-candidate.entity.js';
import {
  QUEUE_PAGE_SIZE,
  validateQueueId,
  validateQueueQuery,
} from './discovery-candidate.validation.js';

@Injectable()
export class DiscoveryQueueService {
  constructor(
    @InjectRepository(DiscoveryCandidate)
    private readonly candidates: Repository<DiscoveryCandidate>,
  ) {}

  // Owner comes from trusted server context, never a client-selected query field.
  async get(ownerId: string, id: string): Promise<DiscoveryCandidate> {
    validateQueueId(ownerId);
    validateQueueId(id);
    const candidate = await this.candidates.findOneBy({ id, ownerId });
    if (!candidate)
      throw new NotFoundException('Discovery candidate not found.');
    return candidate;
  }

  async list(ownerId: string, query: unknown = {}) {
    validateQueueId(ownerId);
    const { filter, page: requestedPage } = validateQueueQuery(query);
    return this.candidates.manager.transaction(
      'REPEATABLE READ',
      async (manager) => {
        await manager.query('SET TRANSACTION READ ONLY');
        const rows = manager
          .getRepository(DiscoveryCandidate)
          .createQueryBuilder('candidate')
          .where('candidate.ownerId = :ownerId', { ownerId });
        if (filter === 'to-review')
          rows.andWhere('candidate.status IN (:...statuses)', {
            statuses: ['NEW', 'SEEN'],
          });
        else if (filter !== 'all')
          rows.andWhere('candidate.status = :status', {
            status: filter.toUpperCase(),
          });
        const total = await rows.getCount();
        const totalPages = Math.ceil(total / QUEUE_PAGE_SIZE);
        const page = Math.min(requestedPage, Math.max(1, totalPages));
        if (filter === 'to-review')
          rows.orderBy(
            "CASE WHEN candidate.status = 'NEW' THEN 0 ELSE 1 END",
            'ASC',
          );
        const items = await rows
          .addOrderBy('candidate.firstSeenAt', 'DESC')
          .addOrderBy('candidate.id', 'ASC')
          .offset((page - 1) * QUEUE_PAGE_SIZE)
          .limit(QUEUE_PAGE_SIZE)
          .getMany();
        return { items, page, pageSize: QUEUE_PAGE_SIZE, total, totalPages };
      },
    );
  }
}
