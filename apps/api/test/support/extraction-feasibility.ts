import type { OutputSchema } from '../../src/ai/ai-provider.js';
import {
  CV_OUTPUT_SCHEMA,
  JD_OUTPUT_SCHEMA,
} from '../../src/extraction/extraction.schemas.js';
import type { ExtractionSource } from '../../src/extraction/extraction.types.js';
import { createExtractionSource } from '../../src/extraction/extraction.validation.js';

// Experiment only: split within existing segments, never merge pages/paragraphs
// or rewrite text. Delimiters and blank lines stay in the source but not spans.
export function lineSegments(source: ExtractionSource): ExtractionSource {
  const segments: ExtractionSource['segments'][number][] = [];
  for (const parent of source.segments) {
    const text = source.text.slice(parent.start, parent.end);
    let start = 0;
    const add = (end: number) => {
      if (text.slice(start, end).trim())
        segments.push({
          id: `line-${segments.length + 1}`,
          start: parent.start + start,
          end: parent.start + end,
          page: parent.page,
        });
    };
    for (const delimiter of text.matchAll(/\r\n|[\r\n\u2028\u2029]/gu)) {
      add(delimiter.index);
      start = delimiter.index + delimiter[0].length;
    }
    add(text.length);
  }
  return createExtractionSource({ ...source, segments });
}

// Retain the 6.2E comparison after production adoption. The legacy projection
// restores only the three old nullable types; fingerprints pin all other fields.
export function specializedSchema(kind: 'cv' | 'jd'): OutputSchema {
  return collectionSchema(kind, true);
}
export function legacyCollectionSchema(kind: 'cv' | 'jd'): OutputSchema {
  return collectionSchema(kind, false);
}
function collectionSchema(kind: 'cv' | 'jd', required: boolean): OutputSchema {
  const schema = structuredClone(
    kind === 'cv' ? CV_OUTPUT_SCHEMA : JD_OUTPUT_SCHEMA,
  );
  const paths =
    kind === 'cv'
      ? [
          [
            'properties',
            'skills',
            'items',
            'properties',
            'name',
            'properties',
            'value',
          ],
        ]
      : [
          [
            'properties',
            'requirements',
            'items',
            'properties',
            'text',
            'properties',
            'value',
          ],
          ['properties', 'responsibilities', 'items', 'properties', 'value'],
        ];
  for (const path of paths) {
    let node = schema as Record<string, unknown>;
    for (const key of path) node = node[key] as Record<string, unknown>;
    node.type = required ? 'string' : ['string', 'null'];
  }
  return schema;
}
