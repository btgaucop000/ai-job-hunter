import { Module } from '@nestjs/common';
import { AnalysisController } from './analysis.controller.js';
import {
  AnalysisService,
  ANALYSIS_TIMING,
  analysisTiming,
} from './analysis.service.js';
import { ExtractionModule } from '../extraction/extraction.module.js';
import { MatchingModule } from '../matching/matching.module.js';
import { AiModule } from '../ai/ai.module.js';
import { AI_CONFIG } from '../ai/ai.config.js';

@Module({
  imports: [ExtractionModule, MatchingModule, AiModule],
  controllers: [AnalysisController],
  providers: [
    AnalysisService,
    {
      provide: ANALYSIS_TIMING,
      inject: [AI_CONFIG],
      useFactory: analysisTiming,
    },
  ],
  exports: [AnalysisService],
})
export class AnalysisModule {}
