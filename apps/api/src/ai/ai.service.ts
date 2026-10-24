import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.js';
import type { AiProvider, GenerationRequest } from './ai-provider.js';
import { AiError } from './ai.errors.js';
import { compileOutputSchema } from './ai.schema.js';

@Injectable()
export class AiService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  async generateStructured(request: GenerationRequest): Promise<unknown> {
    const { schema, validate } = compileOutputSchema(request.schema);
    const text = await this.provider.generate({
      prompt: request.prompt,
      schema,
    });
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch {
      throw new AiError('INVALID_JSON');
    }
    if (!validate(result)) throw new AiError('SCHEMA_VALIDATION_FAILURE');
    return result;
  }
}
