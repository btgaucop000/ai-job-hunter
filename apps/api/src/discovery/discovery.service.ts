import { ConflictException, Injectable } from '@nestjs/common';
import { OpportunitiesService } from '../opportunities/opportunities.service.js';
import { rankJob, validateFilters, type DiscoveredJob } from './discovery.js';
import {
  DISCOVERY_SOURCES,
  GreenhouseSource,
  normalizeGreenhouse,
} from './greenhouse.source.js';
@Injectable()
export class DiscoveryService {
  private active = false;
  constructor(
    private readonly source: GreenhouseSource,
    private readonly jobs: OpportunitiesService,
  ) {}
  async discover(input: unknown) {
    const filters = validateFilters(input);
    if (this.active)
      throw new ConflictException(
        'Discovery is already running. Wait for it to finish.',
      );
    this.active = true;
    try {
      const errors: string[] = [];
      const candidates: DiscoveredJob[] = [];
      const at = new Date().toISOString();
      for (const source of DISCOVERY_SOURCES) {
        try {
          const decoded = normalizeGreenhouse(
            await this.source.read(source),
            source,
            at,
          );
          candidates.push(...decoded.jobs);
          if (decoded.invalid)
            errors.push(
              `${source.name}: ${decoded.invalid} unsupported or oversized listings omitted.`,
            );
        } catch {
          errors.push(
            `${source.name}: feed unavailable or rate limited. Retry later; no sample listings substituted.`,
          );
        }
      }
      const ranked = candidates
        .map((job) => ({ job, rank: rankJob(job, filters) }))
        .filter(
          (row): row is { job: DiscoveredJob; rank: number } =>
            row.rank !== null,
        )
        .sort(
          (a, b) => b.rank - a.rank || a.job.title.localeCompare(b.job.title),
        );
      const saved = await this.jobs.importDiscovered(
        ranked.map((row) => row.job),
      );
      return {
        found: ranked.length,
        ...saved,
        errors,
        discoveredAt: at,
        scope:
          'Axon and Backbase public career boards only. Filters rank locally; unknown metadata stays eligible. Up to 50 new jobs per run.',
      };
    } finally {
      this.active = false;
    }
  }
}
