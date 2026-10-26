import { Worker } from 'node:worker_threads';
import type { WorkerOptions } from 'node:worker_threads';
import { ExtractionError } from './extraction.errors.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';
import { validateDocumentInput } from './extraction.validation.js';
import { validateParseResponse } from './parser.protocol.js';
import type { ParsedDocument } from './parser.protocol.js';

type WorkerFactory = (url: URL, options: WorkerOptions) => Worker;
interface ActiveParse {
  stop: () => void;
  done: Promise<void>;
}

export class DocumentParser {
  private active: ActiveParse | undefined;
  private closed = false;
  private unavailable = false;
  // Factory is a narrow lifecycle test seam. Production uses the fixed URL below.
  constructor(
    private readonly makeWorker: WorkerFactory = (url, options) =>
      new Worker(url, options),
  ) {}

  async parse(input: {
    readonly bytes: unknown;
    readonly fileName: unknown;
    readonly mediaType: unknown;
  }): Promise<ParsedDocument> {
    if (this.closed || this.unavailable)
      throw new ExtractionError('PARSER_UNAVAILABLE');
    if (this.active) throw new ExtractionError('PARSER_BUSY');
    const format = validateDocumentInput(input);
    const bytes = new Uint8Array(input.bytes as Uint8Array); // Do not detach caller memory.
    let resolveResult!: (value: ParsedDocument) => void;
    let rejectResult!: (error: ExtractionError) => void;
    const resultPromise = new Promise<ParsedDocument>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const result = {
      promise: resultPromise,
      resolve: resolveResult,
      reject: rejectResult,
    };
    let finishCompletion!: () => void;
    const completionPromise = new Promise<void>((resolve) => {
      finishCompletion = resolve;
    });
    const completion = {
      promise: completionPromise,
      resolve: finishCompletion,
    };
    let worker: Worker | undefined;
    let terminal = false;
    let confirmed = false;
    let terminating = false;
    let finished = false;
    let value: ParsedDocument | undefined;
    let failure: ExtractionError | undefined;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    const task: ActiveParse = {
      stop: () => fail('PARSER_UNAVAILABLE', true),
      done: completion.promise,
    };
    this.active = task;
    const clearTimers = () => {
      clearTimeout(deadline);
      clearTimeout(terminationTimer);
    };
    const complete = () => {
      if (finished) return;
      finished = true;
      clearTimers();
      // Only an observed exit or fulfilled terminate() can release admission.
      if (confirmed && this.active === task) this.active = undefined;
      if (failure) result.reject(failure);
      else if (value) result.resolve(value);
      else result.reject(new ExtractionError('PARSING_FAILED'));
      completion.resolve();
    };
    const failClosed = () => {
      if (confirmed || finished) return;
      this.unavailable = true;
      failure ??= new ExtractionError('PARSER_UNAVAILABLE');
      result.reject(failure);
      complete(); // Keep active slot latched; later exit cannot reopen this parser.
    };
    const observeTermination = () => {
      confirmed = true;
      complete();
    };
    const terminate = () => {
      if (terminating || confirmed || !worker) return;
      terminating = true;
      terminationTimer = setTimeout(failClosed, limits.parserTerminationMs);
      try {
        void worker.terminate().then(observeTermination, failClosed);
      } catch {
        failClosed();
      }
    };
    function fail(
      code: ConstructorParameters<typeof ExtractionError>[0],
      immediate = false,
    ) {
      if (finished) return;
      failure ??= new ExtractionError(code);
      terminal = true;
      if (immediate) result.reject(failure);
      terminate();
    }
    const deadline = setTimeout(
      () => fail('PARSING_TIMEOUT', true),
      limits.parserTimeoutMs,
    );
    try {
      worker = this.makeWorker(new URL('./parser.worker.js', import.meta.url), {
        workerData: { version: 1, format, bytes },
        transferList: [bytes.buffer],
        execArgv: ['--no-addons'],
        env: {},
        stdout: true,
        stderr: true,
        resourceLimits: { maxOldGenerationSizeMb: limits.parserHeapMb },
      });
      // Never forward or retain library diagnostics, even during imports.
      worker.stdout?.resume();
      worker.stderr?.resume();
      worker.on('message', (message: unknown) => {
        if (terminal || finished) return;
        terminal = true;
        try {
          const response = validateParseResponse(message);
          if (response.ok) {
            if (response.result.source.format !== format) throw new Error();
            value = response.result;
          } else failure = new ExtractionError(response.code);
        } catch {
          failure = new ExtractionError('PARSING_FAILED');
        }
        terminate();
      });
      worker.on('error', () => fail('PARSING_FAILED'));
      worker.on('messageerror', () => fail('PARSING_FAILED'));
      worker.once('exit', (code: number) => {
        if (!terminal || (code !== 0 && !terminating))
          failure ??= new ExtractionError('PARSING_FAILED');
        observeTermination();
      });
    } catch {
      failure = new ExtractionError('PARSING_FAILED');
      if (worker) terminate();
      else {
        confirmed = true;
        complete();
      }
    }
    return result.promise;
  }

  // Observation only: never closes admission or terminates a healthy parse.
  // Callers must own admission; this does not reserve an idle slot.
  async waitForIdle(): Promise<void> {
    while (this.active && !this.unavailable) await this.active.done;
    if (this.unavailable || this.closed)
      throw new ExtractionError('PARSER_UNAVAILABLE');
  }

  async close(): Promise<void> {
    this.closed = true;
    const active = this.active;
    active?.stop();
    await active?.done;
    if (this.unavailable) throw new ExtractionError('PARSER_UNAVAILABLE');
  }
  onModuleDestroy(): Promise<void> {
    return this.close();
  }
}

// One production owner per process; later Nest wiring must reuse this instance.
export const documentParser = new DocumentParser();
