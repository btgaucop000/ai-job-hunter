import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER } from './ai-provider.js';
import type {
  AiProvider,
  GenerationRequest,
  OutputSchema,
  PartialGenerationExecution,
} from './ai-provider.js';
import { AiError } from './ai.errors.js';
import { compileOutputSchema } from './ai.schema.js';

@Injectable()
export class AiService {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  async generateStructured(request: GenerationRequest): Promise<unknown> {
    return this.generate(request, request.schema);
  }

  // Partial extraction validates candidate items independently after decoding.
  // Keep the stricter model-facing schema while checking its envelope here.
  generatePartialStructured(
    request: GenerationRequest & {
      readonly partial: PartialGenerationExecution;
    },
    envelopeSchema: OutputSchema,
  ): Promise<unknown> {
    return this.generate(request, envelopeSchema);
  }

  private async generate(
    request: GenerationRequest,
    runtimeSchema: OutputSchema,
  ): Promise<unknown> {
    const { schema, validate: validateModel } = compileOutputSchema(
      request.schema,
    );
    const validate =
      runtimeSchema === request.schema
        ? validateModel
        : compileOutputSchema(runtimeSchema).validate;
    const text = await this.provider.generate({
      ...(request.partial ? { partial: request.partial } : {}),
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
