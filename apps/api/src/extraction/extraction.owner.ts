import { documentParser } from './document-parser.js';
import type { DocumentParser } from './document-parser.js';

export const EXTRACTION_OWNER = Symbol('EXTRACTION_OWNER');
export type ExtractionParser = Pick<
  DocumentParser,
  'parse' | 'waitForIdle' | 'close'
>;

// Shared across Nest contexts. This object has no Nest lifecycle hooks: only
// ExtractionService coordinates shutdown. Tests inject an isolated owner.
export class ExtractionOwner {
  active: Promise<void> | undefined;
  closed = false;
  unavailable = false;
  parserClosing: Promise<void> | undefined;
  shutdown: Promise<void> | undefined;
  constructor(readonly parser: ExtractionParser) {}
}
export const extractionOwner = new ExtractionOwner(documentParser);
