import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { expect, jest, test } from '@jest/globals';
import { AiService } from '../../src/ai/ai.service.js';
import { compileOutputSchema } from '../../src/ai/ai.schema.js';
import {
  CV_OUTPUT_SCHEMA,
  JD_OUTPUT_SCHEMA,
  SOURCE_SCHEMA,
} from '../../src/extraction/extraction.schemas.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { ExtractionOwner } from '../../src/extraction/extraction.owner.js';
import {
  validateCvOutput,
  validateJdOutput,
} from '../../src/extraction/extraction.validation.js';
import { legacyCollectionSchema } from '../support/extraction-feasibility.js';
import {
  emptyCv,
  emptyJd,
  quotedFact,
  syntheticSource,
  unknownFact,
} from '../support/extraction-fixtures.js';
import { pdfInput } from '../support/pdf-fixtures.js';

// Captured from schemas before 6.2F. Restoring just the three old types must
// recover these entire-schema fingerprints, including every evidence constraint.
const before = {
  cv: '758419a79e2a1c73d1df9dde916cc723710ea798208f334a346951939e945232',
  jd: '3e3d98970ed0d1bd550745a20ea0ec18ac9d3aa0dc26887992f69bcf2aeeed83',
  source: '60ab30a6e6f7d353c6840934677fa736545ac49312a0fba33dadcaf303b9a54b',
};
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('only the three reviewed types changed; all other schema content matches pre-6.2F', () => {
  expect(hash(legacyCollectionSchema('cv'))).toBe(before.cv);
  expect(hash(legacyCollectionSchema('jd'))).toBe(before.jd);
  expect(hash(SOURCE_SCHEMA)).toBe(before.source);
});
const cases = [
  {
    kind: 'cv' as const,
    field: 'skills[].name.value',
    data: {
      ...emptyCv(),
      skills: [{ name: unknownFact(), experienceText: unknownFact() }],
    },
  },
  {
    kind: 'jd' as const,
    field: 'requirements[].text.value',
    data: {
      ...emptyJd(),
      requirements: [{ text: unknownFact(), priority: unknownFact() }],
    },
  },
  {
    kind: 'jd' as const,
    field: 'responsibilities[].value',
    data: { ...emptyJd(), responsibilities: [unknownFact()] },
  },
];
test.each(cases)(
  '$kind $field rejects before evidence validation and propagates safe AI diagnostics',
  async ({ kind, data }) => {
    const schema = kind === 'cv' ? CV_OUTPUT_SCHEMA : JD_OUTPUT_SCHEMA;
    expect(
      compileOutputSchema(legacyCollectionSchema(kind)).validate(data),
    ).toBe(true);
    expect(compileOutputSchema(schema).validate(data)).toBe(false);
    const source = syntheticSource('Synthetic', kind === 'cv' ? 'pdf' : 'text');
    try {
      (kind === 'cv' ? validateCvOutput : validateJdOutput)(data, source);
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'INVALID_OUTPUT',
        diagnostic: { stage: 'OUTPUT', rule: 'SCHEMA_MISMATCH', field: kind },
      });
    }
    const generate = jest.fn(async () => JSON.stringify(data));
    const service = new ExtractionService(
      new AiService({ generate }),
      new ExtractionOwner({
        parse: async () => ({
          source: syntheticSource(),
          pageCount: 1,
          warnings: [],
        }),
        waitForIdle: async () => {},
        close: async () => {},
      }),
    );
    const result: unknown = await (
      kind === 'cv'
        ? service.extractCv(pdfInput())
        : service.extractJd({ text: 'PRIVATE_SYNTHETIC_SENTINEL' })
    ).catch((error: unknown) => error);
    expect(result).toMatchObject({
      code: 'SCHEMA_VALIDATION_FAILURE',
      diagnostic: {
        stage: 'AI_SCHEMA',
        rule: 'SCHEMA_MISMATCH',
        field: 'output',
      },
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
    expect(generate).toHaveBeenCalledTimes(1);
  },
);
test('positive required entries and every optional nullable field remain accepted', () => {
  const cv = {
    ...emptyCv(),
    skills: [{ name: quotedFact('Synthetic'), experienceText: unknownFact() }],
    experience: [
      {
        employer: quotedFact('Synthetic'),
        title: unknownFact(),
        startDateText: unknownFact(),
        endDateText: unknownFact(),
        descriptionText: unknownFact(),
      },
    ],
    education: [
      {
        institution: quotedFact('Synthetic'),
        qualification: unknownFact(),
        dateText: unknownFact(),
      },
    ],
  };
  const jd = {
    ...emptyJd(),
    requirements: [{ text: quotedFact('Synthetic'), priority: unknownFact() }],
    responsibilities: [quotedFact('Synthetic')],
  };
  expect(compileOutputSchema(CV_OUTPUT_SCHEMA).validate(cv)).toBe(true);
  expect(compileOutputSchema(JD_OUTPUT_SCHEMA).validate(jd)).toBe(true);
  expect(
    validateCvOutput(cv, syntheticSource()).skills[0]?.experienceText,
  ).toEqual(unknownFact());
  expect(
    validateJdOutput(jd, syntheticSource('Synthetic', 'text')).requirements[0]
      ?.priority,
  ).toEqual(unknownFact());
  expect(validateCvOutput(emptyCv(), syntheticSource())).toEqual(emptyCv());
  expect(
    validateJdOutput(emptyJd(), syntheticSource('Synthetic', 'text')),
  ).toEqual(emptyJd());
});
test.each(['missing', 'ambiguous', 'unsupported'])(
  'non-null required values still reject %s evidence',
  async (failure) => {
    const text = failure === 'ambiguous' ? 'Synthetic Synthetic' : 'Synthetic';
    const name =
      failure === 'missing'
        ? { value: 'Synthetic', evidence: [] }
        : failure === 'unsupported'
          ? quotedFact('Absent', 's1', 'Synthetic')
          : quotedFact('Synthetic');
    const data = {
      ...emptyCv(),
      skills: [{ name, experienceText: unknownFact() }],
    };
    const snapshot = JSON.stringify(data);
    const ai = new AiService({ generate: async () => snapshot });
    const result = await ai.generateStructured({
      prompt: 'Synthetic test',
      schema: CV_OUTPUT_SCHEMA,
    });
    expect(() => validateCvOutput(result, syntheticSource(text))).toThrow(
      'Extraction evidence',
    );
    expect(JSON.stringify(result)).toBe(snapshot);
  },
);
