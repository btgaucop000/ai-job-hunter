import {
  validateCvOutput,
  validateJdOutput,
} from '../../src/extraction/extraction.validation.js';
import type { MatchingInput } from '../../src/matching/matching.types.js';
import {
  emptyCv,
  emptyJd,
  quotedFact,
  syntheticSource,
  unknownFact,
} from './extraction-fixtures.js';

// Synthetic, validated envelopes shared by Nest tests and the compiled check.
export function matchingPair(): MatchingInput {
  const cvSource = syntheticSource('😀 Synthetic CV\nReact', 'pdf');
  const jdSource = syntheticSource(
    'React required\nreact preferred\nComplex leadership',
    'text',
  );
  return {
    cv: {
      schemaVersion: '1',
      kind: 'cv',
      source: cvSource,
      data: validateCvOutput(
        {
          ...emptyCv(),
          skills: [
            { name: quotedFact('React'), experienceText: unknownFact() },
          ],
        },
        cvSource,
      ),
      warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
    },
    jd: {
      schemaVersion: '1',
      kind: 'jd',
      source: jdSource,
      data: validateJdOutput(
        {
          ...emptyJd(),
          requirements: [
            {
              text: quotedFact('React'),
              priority: quotedFact('required', 's1', 'React required'),
            },
            {
              text: quotedFact('react'),
              priority: quotedFact('preferred', 's1', 'react preferred'),
            },
            { text: quotedFact('Complex leadership'), priority: unknownFact() },
          ],
        },
        jdSource,
      ),
      warnings: [{ code: 'EXTRACTION_COMPLETENESS_NOT_VERIFIED' }],
    },
  };
}

export function freezeMatchingFixture(value: unknown): void {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeMatchingFixture);
    Object.freeze(value);
  }
}
