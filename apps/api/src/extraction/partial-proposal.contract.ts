import type { OutputSchema } from '../ai/ai-provider.js';

export const PARTIAL_FIELDS = {
  cv: ['name', 'email', 'phone', 'skills'],
  jd: ['title', 'requirements'],
} as const;
export type PartialField =
  (typeof PARTIAL_FIELDS)[keyof typeof PARTIAL_FIELDS][number];
export const partialFields = (
  kind: keyof typeof PARTIAL_FIELDS,
): readonly PartialField[] => PARTIAL_FIELDS[kind];
export const PARTIAL_LIMITS = Object.freeze({
  proposals: 15,
  listItems: 12,
  valueUnits: 120,
  quoteUnits: 240,
  outputBytes: 16000,
});
const stringProperties = {
  value: { type: 'string', minLength: 1, maxLength: PARTIAL_LIMITS.valueUnits },
  segmentId: { type: 'string', minLength: 1 },
  quote: { type: 'string', minLength: 1, maxLength: PARTIAL_LIMITS.quoteUnits },
} as const;
export type PartialProposal = { field: PartialField } & Record<
  keyof typeof stringProperties,
  string
>;
export function partialProposalSchema(kind: 'cv' | 'jd'): OutputSchema {
  const properties = {
    field: { type: 'string', enum: partialFields(kind) },
    ...stringProperties,
  };
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}
// Validate the bounded envelope once, then each item independently. This is not
// the model-facing schema: it deliberately permits malformed siblings to reach
// explicit per-item rejection without discarding valid proposals.
export const PARTIAL_ENVELOPE_SCHEMA: OutputSchema = {
  type: 'object',
  properties: {
    proposals: { type: 'array', maxItems: PARTIAL_LIMITS.proposals },
  },
  required: ['proposals'],
  additionalProperties: false,
};
export function partialOutputSchema(kind: 'cv' | 'jd'): OutputSchema {
  return {
    ...PARTIAL_ENVELOPE_SCHEMA,
    properties: {
      proposals: {
        type: 'array',
        maxItems: PARTIAL_LIMITS.proposals,
        items: partialProposalSchema(kind),
      },
    },
  };
}
export function proposalInstructions(kind: 'cv' | 'jd'): string {
  const schema = partialProposalSchema(kind);
  return `Each proposal must be an object with exactly these required string properties: ${(schema.required as string[]).join(', ')}. No extra properties or tuple arrays. Allowed field identifiers: ${partialFields(kind).join(', ')}.`;
}
