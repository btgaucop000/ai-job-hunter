import type { OutputSchema } from '../ai/ai-provider.js';
import { EXTRACTION_LIMITS as limits } from './extraction.limits.js';

const object = (properties: Record<string, OutputSchema>): OutputSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (items: OutputSchema, maxItems: number): OutputSchema => ({
  type: 'array',
  items,
  maxItems,
});
const text = (maxLength: number): OutputSchema => ({
  type: 'string',
  minLength: 1,
  maxLength,
});
const quote = object({ segmentId: text(64), quote: text(limits.quoteUnits) });
const fact = (priority = false): OutputSchema =>
  object({
    value: priority
      ? { type: ['string', 'null'], enum: ['required', 'preferred', null] }
      : { type: ['string', 'null'], minLength: 1, maxLength: limits.factUnits },
    evidence: list(quote, limits.evidencePerFact),
  });
const requiredFact = (): OutputSchema =>
  object({
    value: text(limits.factUnits),
    evidence: list(quote, limits.evidencePerFact),
  });
const fields = (...names: string[]): Record<string, OutputSchema> =>
  Object.fromEntries(names.map((name) => [name, fact()]));
// Model contracts deliberately exclude offsets: only the application resolves them.
export const CV_OUTPUT_SCHEMA = object({
  ...fields('name', 'email', 'phone', 'location'),
  skills: list(
    object({ name: requiredFact(), experienceText: fact() }),
    limits.listItems,
  ),
  experience: list(
    object(
      fields(
        'employer',
        'title',
        'startDateText',
        'endDateText',
        'descriptionText',
      ),
    ),
    limits.historyItems,
  ),
  education: list(
    object(fields('institution', 'qualification', 'dateText')),
    limits.historyItems,
  ),
});
export const JD_OUTPUT_SCHEMA = object({
  ...fields(
    'title',
    'company',
    'location',
    'employmentType',
    'compensationText',
  ),
  requirements: list(
    object({ text: requiredFact(), priority: fact(true) }),
    limits.listItems,
  ),
  responsibilities: list(requiredFact(), limits.listItems),
});
export const SOURCE_SCHEMA = object({
  format: { type: 'string', enum: ['pdf', 'docx', 'text'] },
  text: text(limits.textUnits),
  segments: {
    ...list(
      object({
        id: text(64),
        start: { type: 'integer', minimum: 0 },
        end: { type: 'integer', minimum: 1 },
        page: {
          type: ['integer', 'null'],
          minimum: 1,
          maximum: limits.pdfPages,
        },
      }),
      limits.segments,
    ),
    minItems: 1,
  },
});
