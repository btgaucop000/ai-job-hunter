import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { EXTRACTION_OWNER, extractionOwner } from './extraction.owner.js';
import { ExtractionService } from './extraction.service.js';

@Module({
  imports: [AiModule],
  providers: [
    { provide: EXTRACTION_OWNER, useValue: extractionOwner },
    ExtractionService,
  ],
  exports: [ExtractionService],
})
export class ExtractionModule {}
