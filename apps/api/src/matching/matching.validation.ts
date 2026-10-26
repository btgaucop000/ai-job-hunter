import { isDeepStrictEqual } from 'node:util';
import {
  validateCvOutput,
  validateJdOutput,
} from '../extraction/extraction.validation.js';
import { EXTRACTION_LIMITS } from '../extraction/extraction.limits.js';
import type { MatchingInput } from './matching.types.js';

export class MatchingInputError extends Error {
  readonly code = 'INVALID_MATCHING_INPUT';
  constructor() {
    super('Invalid matching input.');
    this.name = 'MatchingInputError';
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MatchingInputError();
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (!isDeepStrictEqual(Object.keys(value).sort(), expected.sort()))
    throw new MatchingInputError();
}
// Project resolved evidence back to Task 03's model shape, retaining every other
// property so its existing strict schemas reject unknown/missing fields.
function project(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new MatchingInputError();
  if (Array.isArray(value))
    return value.map((item) => project(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const record = object(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => {
      if (key !== 'evidence') return [key, project(child, depth + 1)];
      if (!Array.isArray(child)) throw new MatchingInputError();
      return [
        key,
        child.map((entry: unknown) => {
          const ref = object(entry);
          keys(ref, ['segmentId', 'quote', 'start', 'end']);
          if (
            !Number.isSafeInteger(ref.start) ||
            !Number.isSafeInteger(ref.end)
          )
            throw new MatchingInputError();
          return { segmentId: ref.segmentId, quote: ref.quote };
        }),
      ];
    }),
  );
}
export function validateMatchingInput(
  input: unknown,
): asserts input is MatchingInput {
  try {
    const pair = object(input);
    keys(pair, ['cv', 'jd']);
    for (const kind of ['cv', 'jd'] as const) {
      const envelope = object(pair[kind]);
      keys(envelope, ['schemaVersion', 'kind', 'source', 'data', 'warnings']);
      if (envelope.schemaVersion !== '1' || envelope.kind !== kind)
        throw new MatchingInputError();
      if (
        !Array.isArray(envelope.warnings) ||
        envelope.warnings.length > EXTRACTION_LIMITS.pdfPages + 3
      )
        throw new MatchingInputError();
      let completeness = false;
      for (const item of envelope.warnings) {
        const warning = object(item);
        if (warning.code === 'PAGE_WITHOUT_TEXT') {
          keys(warning, ['code', 'page']);
          if (
            !Number.isSafeInteger(warning.page) ||
            Number(warning.page) < 1 ||
            Number(warning.page) > EXTRACTION_LIMITS.pdfPages
          )
            throw new MatchingInputError();
        } else {
          keys(warning, ['code']);
          if (
            ![
              'IMAGE_CONTENT_NOT_INTERPRETED',
              'DOCX_CONTENT_WARNING',
              'EXTRACTION_COMPLETENESS_NOT_VERIFIED',
            ].includes(String(warning.code))
          )
            throw new MatchingInputError();
        }
        completeness ||=
          warning.code === 'EXTRACTION_COMPLETENESS_NOT_VERIFIED';
      }
      if (!completeness) throw new MatchingInputError();
      const projected = project(envelope.data);
      const resolved =
        kind === 'cv'
          ? validateCvOutput(projected, envelope.source)
          : validateJdOutput(projected, envelope.source);
      // Re-resolving proves exact, unique quotes, source bounds, UTF-16 boundaries,
      // priority grounding and duplicate rules. Compare supplied offsets as well.
      if (!isDeepStrictEqual(resolved, envelope.data))
        throw new MatchingInputError();
    }
  } catch {
    throw new MatchingInputError();
  }
}
