import { Ajv } from 'ajv';
import { AiError } from './ai.errors.js';
import type { OutputSchema } from './ai-provider.js';

const keywords = new Set([
  'type',
  'description',
  'title',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
]);
// Enforce only our supported subset and traversal boundaries; Ajv checks correctness.
function checkSchema(value: unknown, depth = 0): void {
  if (depth > 32 || !value || typeof value !== 'object' || Array.isArray(value))
    throw new Error();
  const schema = value as Record<string, unknown>;
  for (const key of Object.keys(schema))
    if (!keywords.has(key)) throw new Error();
  const type = schema.type;
  if (Array.isArray(type)) {
    // Only a single concrete type plus null; no arbitrary unions.
    if (type.length !== 2 || !type.includes('null') || new Set(type).size !== 2)
      throw new Error();
  } else if (typeof type !== 'string') throw new Error();
  if (schema.properties !== undefined) {
    if (
      !schema.properties ||
      typeof schema.properties !== 'object' ||
      Array.isArray(schema.properties)
    )
      throw new Error();
    for (const child of Object.values(schema.properties))
      checkSchema(child, depth + 1);
  }
  if (schema.items !== undefined) checkSchema(schema.items, depth + 1);
  if (
    schema.additionalProperties !== undefined &&
    typeof schema.additionalProperties !== 'boolean'
  )
    throw new Error();
}

export function compileOutputSchema(schema: OutputSchema) {
  try {
    // Snapshot ensures the schema sent over HTTP matches the compiled validator.
    checkSchema(schema);
    const snapshot: OutputSchema = JSON.parse(
      JSON.stringify(schema, (_key, value: unknown) => {
        // JSON serialization must not silently drop or alter malformed schema values.
        if (
          value === undefined ||
          typeof value === 'function' ||
          typeof value === 'symbol' ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          throw new Error();
        return value;
      }),
    );
    checkSchema(snapshot);
    // Per-call compilation avoids retaining an unbounded cache of caller schemas.
    const ajv = new Ajv({
      strict: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      logger: false,
      ownProperties: true,
    });
    return { schema: snapshot, validate: ajv.compile(snapshot) };
  } catch {
    throw new AiError('INVALID_SCHEMA');
  }
}
