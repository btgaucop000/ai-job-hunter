import { Module } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.js';
import { AI_CONFIG, aiConfig } from './ai.config.js';
import { AiService } from './ai.service.js';
import { OllamaProvider } from './ollama.provider.js';

@Module({
  providers: [
    { provide: AI_CONFIG, useFactory: () => aiConfig() },
    OllamaProvider,
    { provide: AI_PROVIDER, useExisting: OllamaProvider },
    AiService,
  ],
  exports: [AiService, AI_CONFIG],
})
export class AiModule {}
