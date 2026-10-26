import { parentPort, workerData } from 'node:worker_threads';
import { ExtractionError } from './extraction.errors.js';
import { parserErrorCodes, validateParseRequest } from './parser.protocol.js';
import type { ParseResponse } from './parser.protocol.js';

if (!parentPort) throw new Error('Parser worker requires a parent port');
let response: ParseResponse;
try {
  const request = validateParseRequest(workerData);
  // Import inside the guarded path. Parent captures/discards library startup diagnostics.
  const result =
    request.format === 'pdf'
      ? await (await import('./pdf.parser.js')).parsePdf(request.bytes)
      : await (await import('./docx.parser.js')).parseDocx(request.bytes);
  response = { version: 1, ok: true, result };
} catch (error: unknown) {
  const code =
    error instanceof ExtractionError
      ? parserErrorCodes.find((code) => code === error.code)
      : undefined;
  response = { version: 1, ok: false, code: code ?? 'PARSING_FAILED' };
}
parentPort.postMessage(response);
parentPort.close();
