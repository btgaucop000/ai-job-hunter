import { AnalysisModule } from './analysis/analysis.module.js';
import { ExtractionModule } from './extraction/extraction.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MatchingModule } from './matching/matching.module.js';

@Module({
  imports: [
    DatabaseModule,
    HealthModule,
    ExtractionModule,
    MatchingModule,
    AnalysisModule,
  ],
})
export class AppModule {}
