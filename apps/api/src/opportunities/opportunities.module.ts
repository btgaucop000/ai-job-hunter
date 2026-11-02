import { DiscoveryService } from '../discovery/discovery.service.js';
import { GreenhouseSource } from '../discovery/greenhouse.source.js';
import { MatchingModule } from '../matching/matching.module.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { SavedCv } from '../matching/saved-cv.entity.js';
import { JobMatchService } from '../matching/job-match.service.js';
import { AiModule } from '../ai/ai.module.js';
import { JobImportService } from './job-import.service.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity.js';
import { OpportunitiesService } from './opportunities.service.js';
import { OpportunitiesController } from './opportunities.controller.js';
@Module({
  imports: [
    AiModule,
    ExtractionModule,
    MatchingModule,
    TypeOrmModule.forFeature([Opportunity, SavedCv]),
  ],
  providers: [
    OpportunitiesService,
    JobImportService,
    JobMatchService,
    DiscoveryService,
    GreenhouseSource,
  ],
  controllers: [OpportunitiesController],
})
export class OpportunitiesModule {}
