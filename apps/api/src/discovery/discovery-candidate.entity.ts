import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Opportunity } from '../opportunities/opportunity.entity.js';
import type { DiscoveredJob } from './discovery.js';
import {
  CANDIDATE_STATUSES,
  validateCandidateSnapshot,
} from './discovery-candidate.validation.js';

@Entity({ schema: 'ai_job_hunter', name: 'discovery_candidates' })
export class DiscoveryCandidate {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) ownerId!: string;
  @Column({ type: 'varchar', length: 100 }) sourceKey!: string;
  @Column({ type: 'varchar', length: 200 }) sourceJobId!: string;
  @Column({ type: 'varchar', length: 20, default: 'NEW' })
  status!: (typeof CANDIDATE_STATUSES)[number];
  @Column({
    type: 'jsonb',
    update: false, // Initial source snapshot is immutable through ORM updates.
    transformer: {
      to: (value: unknown) => validateCandidateSnapshot(value),
      from: (value: DiscoveredJob) => value,
    },
  })
  snapshot!: DiscoveredJob;
  @Column({ type: 'timestamptz', default: () => 'now()' }) firstSeenAt!: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) lastSeenAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @Column({ type: 'uuid', nullable: true }) opportunityId!: string | null;
  @ManyToOne(() => Opportunity, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'opportunityId' })
  opportunity?: Opportunity | null;
}
