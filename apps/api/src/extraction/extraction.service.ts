import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { AiError } from '../ai/ai.errors.js';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_OWNER, ExtractionOwner } from './extraction.owner.js';
import { buildExtractionPrompt } from './extraction.prompts.js';
import { CV_OUTPUT_SCHEMA, JD_OUTPUT_SCHEMA } from './extraction.schemas.js';
import {
  createExtractionSource,
  validateDocumentInput,
  validateText,
  validateCvOutput,
  validateJdOutput,
} from './extraction.validation.js';
import type {
  CvExtractionInput,
  JdExtractionInput,
  CvExtractionResult,
  JdExtractionResult,
} from './extraction.types.js';

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

@Injectable()
export class ExtractionService implements OnModuleDestroy {
  constructor(
    private readonly ai: AiService,
    @Inject(EXTRACTION_OWNER) private readonly owner: ExtractionOwner,
  ) {}

  extractCv(input: CvExtractionInput): Promise<CvExtractionResult> {
    return this.run(async () => {
      const format = validateDocumentInput(input);
      // parse copies bytes synchronously before yielding; caller mutation cannot
      // alter the worker input, and caller memory is never detached.
      const parsed = await this.owner.parser.parse(input);
      this.ensureAvailable();
      const source = createExtractionSource(parsed.source);
      if (source.format !== format) throw new ExtractionError('INVALID_SOURCE');
      const prompt = buildExtractionPrompt('cv', source);
      const output = await this.ai.generateStructured({
        prompt,
        schema: CV_OUTPUT_SCHEMA,
      });
      const data = validateCvOutput(output, source);
      return freeze({
        schemaVersion: '1' as const,
        kind: 'cv' as const,
        source,
        data,
        warnings: [
          ...parsed.warnings.map((warning) => ({ ...warning })),
          { code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' as const },
        ],
      });
    });
  }

  extractJd(input: JdExtractionInput): Promise<JdExtractionResult> {
    return this.run(async () => {
      const text = validateText(input?.text);
      const source = createExtractionSource({
        format: 'text',
        text,
        segments: [{ id: 'jd-1', start: 0, end: text.length, page: null }],
      });
      // Also detect an unavailable/closed parser before JD inference. Production
      // parsing belongs exclusively to this owner; this is not a request queue.
      await this.owner.parser.waitForIdle();
      this.ensureAvailable();
      const prompt = buildExtractionPrompt('jd', source);
      const output = await this.ai.generateStructured({
        prompt,
        schema: JD_OUTPUT_SCHEMA,
      });
      return freeze({
        schemaVersion: '1' as const,
        kind: 'jd' as const,
        source,
        data: validateJdOutput(output, source),
        warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' as const }],
      });
    });
  }

  private ensureAvailable(): void {
    if (this.owner.closed || this.owner.unavailable)
      throw new ExtractionError('EXTRACTION_UNAVAILABLE');
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.ensureAvailable();
    if (this.owner.active) throw new ExtractionError('EXTRACTION_BUSY');
    let finish!: () => void;
    // Acquire synchronously, before any input processing or asynchronous work.
    this.owner.active = new Promise<void>((resolve) => {
      finish = resolve;
    });
    try {
      const result = await operation();
      this.ensureAvailable();
      return result;
    } catch (error: unknown) {
      if (error instanceof ExtractionError) {
        if (error.code === 'PARSER_UNAVAILABLE') {
          if (!this.owner.closed) this.owner.unavailable = true;
          throw new ExtractionError('EXTRACTION_UNAVAILABLE');
        }
        throw new ExtractionError(error.code);
      }
      if (error instanceof AiError) throw new AiError(error.code);
      throw new ExtractionError('EXTRACTION_FAILED');
    } finally {
      try {
        // A rejected parse can still own a terminating worker. Never release
        // the extraction slot on parse rejection alone.
        await (this.owner.parserClosing ?? this.owner.parser.waitForIdle());
      } catch {
        // Shutdown can close the parser while waitForIdle is already pending.
        // Its close promise confirms cleanup independently of admission state.
        if (this.owner.parserClosing) await this.owner.parserClosing;
        else this.owner.unavailable = true;
      } finally {
        if (!this.owner.unavailable) this.owner.active = undefined;
        finish();
      }
      this.ensureAvailable();
    }
  }

  onModuleDestroy(): Promise<void> {
    if (!this.owner.shutdown) {
      this.owner.closed = true;
      // One owner, one close. Consume cleanup failure immediately, but report it
      // after active inference settles; AiService owns its existing deadline.
      this.owner.parserClosing = this.owner.parser.close().catch(() => {
        this.owner.unavailable = true;
      });
      this.owner.shutdown = (async () => {
        await this.owner.parserClosing;
        await this.owner.active;
        if (this.owner.unavailable)
          throw new ExtractionError('EXTRACTION_UNAVAILABLE');
      })();
    }
    return this.owner.shutdown;
  }
}
