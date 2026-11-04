import { OpportunitiesModule } from '../opportunities/opportunities.module.js';
import { DiscoveryController } from './discovery.controller.js';
import { DiscoveryQueueActionsService } from './discovery-queue-actions.service.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DiscoveryCandidate } from './discovery-candidate.entity.js';
import { DiscoveryQueueService } from './discovery-queue.service.js';

// The legacy discovery route remains in OpportunitiesModule until frontend cutover.
@Module({
  imports: [
    OpportunitiesModule,
    TypeOrmModule.forFeature([DiscoveryCandidate]),
  ],
  providers: [DiscoveryQueueService, DiscoveryQueueActionsService],
  controllers: [DiscoveryController],
  exports: [DiscoveryQueueService],
})
export class DiscoveryQueueModule {}
