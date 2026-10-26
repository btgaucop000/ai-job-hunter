import 'reflect-metadata';
import { expect, test, jest } from '@jest/globals';
import { AiService } from '../../src/ai/ai.service.js';
import { aiConfig } from '../../src/ai/ai.config.js';
import { compileOutputSchema } from '../../src/ai/ai.schema.js';
import {
  CV_OUTPUT_SCHEMA,
  JD_OUTPUT_SCHEMA,
} from '../../src/extraction/extraction.schemas.js';
import { EXTRACTION_LIMITS as limits } from '../../src/extraction/extraction.limits.js';
import { ExtractionError } from '../../src/extraction/extraction.errors.js';
import {
  createExtractionSource,
  validateCvOutput,
  validateJdOutput,
  validateText,
  validateDocumentInput,
} from '../../src/extraction/extraction.validation.js';
import type {
  CvData,
  JdData,
  QuoteReference,
} from '../../src/extraction/extraction.types.js';

const unknown = () => ({ value: null, evidence: [] });
const fact = (value: string, quote = value, segmentId = 's1') => ({
  value,
  evidence: [{ segmentId, quote }],
});
const cv = (): CvData<QuoteReference> => ({
  name: unknown(),
  email: unknown(),
  phone: unknown(),
  location: unknown(),
  skills: [],
  experience: [],
  education: [],
});
const jd = (): JdData<QuoteReference> => ({
  title: unknown(),
  company: unknown(),
  location: unknown(),
  employmentType: unknown(),
  compensationText: unknown(),
  requirements: [],
  responsibilities: [],
});
const source = (
  text = 'Synthetic',
  format: 'pdf' | 'docx' | 'text' = 'pdf',
) => ({
  format,
  text,
  segments: [
    { id: 's1', start: 0, end: text.length, page: format === 'pdf' ? 1 : null },
  ],
});
const fails = (
  run: () => unknown,
  code: ConstructorParameters<typeof ExtractionError>[0],
) => expect(run).toThrow(new ExtractionError(code));

test.each([
  [CV_OUTPUT_SCHEMA, cv()],
  [JD_OUTPUT_SCHEMA, jd()],
])(
  'contracts run through actual AiService without transport',
  async (schema, data) => {
    const generate = jest
      .fn<() => Promise<string>>()
      .mockResolvedValue(JSON.stringify(data));
    const service = new AiService({ generate });
    expect(
      await service.generateStructured({ prompt: 'Synthetic', schema }),
    ).toEqual(data);
    expect(generate).toHaveBeenCalledTimes(1);
  },
);

test('unknown scalars remain null and empty collections remain empty', () => {
  expect(validateCvOutput(cv(), source())).toEqual(cv());
  expect(validateJdOutput(jd(), source('Synthetic', 'text'))).toEqual(jd());
});
test('source snapshot is deeply frozen, detached and preserves text', () => {
  const input = source('  Synthetic\r\n');
  const snapshot = createExtractionSource(input);
  input.text = 'modified';
  input.segments[0]!.id = 'modified';
  expect(snapshot.text).toBe('  Synthetic\r\n');
  expect(snapshot.segments[0]!.id).toBe('s1');
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.segments)).toBe(true);
  expect(Object.isFrozen(snapshot.segments[0])).toBe(true);
});
test('resolves global UTF-16 offsets across segments, emoji, accents and CRLF', () => {
  const text = '😀 intro\r\nNguyễn uses React';
  const start = text.indexOf('Nguyễn');
  const input = {
    ...source(text),
    segments: [
      { id: 'intro', start: 0, end: start, page: 1 },
      { id: 's1', start, end: text.length, page: 2 },
    ],
  };
  const result = validateCvOutput(
    {
      ...cv(),
      name: fact('Nguyễn'),
      skills: [{ name: fact('React'), experienceText: unknown() }],
    },
    input,
  );
  expect(result.name.evidence[0]).toEqual({
    segmentId: 's1',
    quote: 'Nguyễn',
    start,
    end: start + 'Nguyễn'.length,
  });
  const evidence = result.skills[0]!.name.evidence[0]!;
  expect(text.slice(evidence.start, evidence.end)).toBe('React');
  expect(evidence.start).toBe(text.indexOf('React'));
});
test('preserves extractive dates and duration without normalization', () => {
  const text = 'React: 5 years. Engineer, March 2022–Present. Example College';
  const result = validateCvOutput(
    {
      ...cv(),
      skills: [{ name: fact('React'), experienceText: fact('5 years') }],
      experience: [
        {
          employer: unknown(),
          title: fact('Engineer'),
          startDateText: fact('March 2022'),
          endDateText: fact('Present'),
          descriptionText: unknown(),
        },
      ],
      education: [
        {
          institution: fact('Example College'),
          qualification: unknown(),
          dateText: unknown(),
        },
      ],
    },
    source(text, 'docx'),
  );
  expect(result.skills[0]!.experienceText.value).toBe('5 years');
  expect(result.experience[0]!.startDateText.value).toBe('March 2022');
});
test.each([
  fact('absent'),
  fact('Synthetic', 'Synthetic', 'missing'),
  { value: null, evidence: [{ segmentId: 's1', quote: 'Synthetic' }] },
  { value: 'Synthetic', evidence: [] },
  fact('Invented', 'Synthetic'),
  fact(' ', 'Synthetic'),
  {
    value: 'Synthetic',
    evidence: [
      { segmentId: 's1', quote: 'Synthetic' },
      { segmentId: 's1', quote: 'Synthetic' },
    ],
  },
])('rejects invalid/null/unsupported evidence %#', (name) =>
  fails(
    () => validateCvOutput({ ...cv(), name }, source()),
    'INVALID_EVIDENCE',
  ),
);
test.each([
  ['React React', 'React'],
  ['aaa', 'aa'],
])('rejects repeated and overlapping quotes in %s', (text, quote) =>
  fails(
    () => validateCvOutput({ ...cv(), name: fact(quote) }, source(text)),
    'INVALID_EVIDENCE',
  ),
);
test('identical quotes in different segments resolve independently', () => {
  const input = {
    ...source('React React'),
    segments: [
      { id: 's1', start: 0, end: 5, page: 1 },
      { id: 's2', start: 6, end: 11, page: 2 },
    ],
  };
  expect(
    validateCvOutput({ ...cv(), name: fact('React', 'React', 's2') }, input)
      .name.evidence[0]!.start,
  ).toBe(6);
});
test('rejects quote crossing a segment or splitting a surrogate pair', () => {
  fails(
    () =>
      validateCvOutput(
        { ...cv(), name: fact('React') },
        {
          ...source('React'),
          segments: [{ id: 's1', start: 0, end: 3, page: 1 }],
        },
      ),
    'INVALID_EVIDENCE',
  );
  fails(
    () => validateCvOutput({ ...cv(), name: fact('\ud83d') }, source('😀')),
    'INVALID_EVIDENCE',
  );
});
test('does not normalize canonically equivalent Unicode', () =>
  fails(
    () => validateCvOutput({ ...cv(), name: fact('é') }, source('e\u0301')),
    'INVALID_EVIDENCE',
  ));

test.each([
  {},
  { ...cv(), extra: 'private' },
  { ...cv(), name: { value: 0, evidence: [] } },
  { ...cv(), name: { value: '', evidence: [] } },
  { ...cv(), name: { ...fact('Synthetic'), start: 0 } },
  {
    ...cv(),
    name: {
      value: 'Synthetic',
      evidence: [{ segmentId: 's1', quote: 'Synthetic', start: 0, end: 9 }],
    },
  },
  {
    ...cv(),
    name: { value: 'Synthetic', evidence: [{ segmentId: 's1', quote: '' }] },
  },
  {
    ...cv(),
    skills: Array.from({ length: limits.listItems + 1 }, () => ({
      name: unknown(),
      experienceText: unknown(),
    })),
  },
  { ...cv(), name: fact('a'.repeat(limits.factUnits + 1)) },
  { ...cv(), name: { value: null } },
])(
  'rejects schema violations without coercion or property removal %#',
  (input) => fails(() => validateCvOutput(input, source()), 'INVALID_OUTPUT'),
);
test.each([CV_OUTPUT_SCHEMA, JD_OUTPUT_SCHEMA])(
  'schemas reject extra fields and missing fields',
  (schema) => {
    const validate = compileOutputSchema(schema).validate;
    expect(validate({})).toBe(false);
    expect(validate({ ...cv(), ...jd(), extra: true })).toBe(false);
  },
);
test('validates populated JD, including evidence for priority', () => {
  const text = 'Engineer. React required. Testing preferred.';
  const result = validateJdOutput(
    {
      ...jd(),
      title: fact('Engineer'),
      requirements: [
        { text: fact('React'), priority: fact('required', 'React required') },
        {
          text: fact('Testing'),
          priority: fact('preferred', 'Testing preferred'),
        },
      ],
      responsibilities: [fact('Testing')],
    },
    source(text, 'text'),
  );
  expect(result.requirements[0]!.priority.value).toBe('required');
});
test.each([
  { value: 'required', evidence: [] },
  fact('required', 'React'),
  fact('required', 'required elsewhere'),
  fact('required', 'React unrequired'),
  { value: null, evidence: [{ segmentId: 's1', quote: 'React' }] },
])('rejects unsupported priority %#', (priority) =>
  fails(
    () =>
      validateJdOutput(
        { ...jd(), requirements: [{ text: fact('React'), priority }] },
        source('React unrequired; required elsewhere', 'text'),
      ),
    'INVALID_EVIDENCE',
  ),
);
test('unlabelled requirement retains unknown priority', () => {
  expect(
    validateJdOutput(
      { ...jd(), requirements: [{ text: fact('React'), priority: unknown() }] },
      source('React', 'text'),
    ).requirements[0]!.priority,
  ).toEqual(unknown());
});
test('rejects unsupported priority enum', () =>
  fails(
    () =>
      validateJdOutput(
        {
          ...jd(),
          requirements: [{ text: fact('React'), priority: fact('mandatory') }],
        },
        source('React mandatory', 'text'),
      ),
    'INVALID_OUTPUT',
  ));
test('rejects empty records', () => {
  fails(
    () =>
      validateCvOutput(
        { ...cv(), skills: [{ name: unknown(), experienceText: unknown() }] },
        source(),
      ),
    'INVALID_OUTPUT',
  );
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          education: [
            {
              institution: unknown(),
              qualification: unknown(),
              dateText: unknown(),
            },
          ],
        },
        source(),
      ),
    'INVALID_OUTPUT',
  );
  fails(
    () =>
      validateJdOutput(
        { ...jd(), responsibilities: [unknown()] },
        source('Synthetic', 'text'),
      ),
    'INVALID_OUTPUT',
  );
});

test.each([
  { ...source(), extra: true },
  { ...source(), segments: [] },
  { ...source(), segments: [{ id: 's1', start: -1, end: 9, page: 1 }] },
  { ...source(), segments: [{ id: 's1', start: 0.5, end: 9, page: 1 }] },
  { ...source(), segments: [{ id: 's1', start: 3, end: 3, page: 1 }] },
  { ...source(), segments: [{ id: 's1', start: 0, end: 10, page: 1 }] },
  { ...source(), segments: [{ id: 's1', start: 0, end: 9, page: null }] },
  {
    ...source('Synthetic', 'text'),
    segments: [{ id: 's1', start: 0, end: 9, page: 1 }],
  },
  {
    ...source(),
    segments: [
      { id: 's1', start: 0, end: 4, page: 1 },
      { id: 's1', start: 4, end: 9, page: 1 },
    ],
  },
  {
    ...source(),
    segments: [
      { id: 's1', start: 0, end: 5, page: 1 },
      { id: 's2', start: 4, end: 9, page: 1 },
    ],
  },
  { ...source('😀'), segments: [{ id: 's1', start: 0, end: 1, page: 1 }] },
])('rejects malformed source %#', (input) =>
  fails(() => createExtractionSource(input), 'INVALID_SOURCE'),
);
test('enforces source kind', () => {
  fails(
    () => validateCvOutput(cv(), source('Synthetic', 'text')),
    'INVALID_SOURCE',
  );
  fails(() => validateJdOutput(jd(), source()), 'INVALID_SOURCE');
});
test('text bounds preserve exact input and reject blank/non-string values', () => {
  expect(validateText('a'.repeat(limits.textUnits))).toHaveLength(
    limits.textUnits,
  );
  expect(validateText(' 😀\r\n')).toBe(' 😀\r\n');
  fails(
    () => validateText('a'.repeat(limits.textUnits + 1)),
    'DOCUMENT_TOO_LARGE',
  );
  fails(() => validateText(' \r\n\t'), 'NO_EXTRACTABLE_TEXT');
  fails(() => validateText(5), 'INVALID_INPUT');
});
test('document metadata and byte limits are checked without claiming format parsing', () => {
  const input = {
    bytes: new Uint8Array(limits.fileBytes),
    fileName: 'synthetic.PDF',
    mediaType: 'application/pdf',
  };
  expect(validateDocumentInput(input)).toBe('pdf');
  expect(
    validateDocumentInput({
      ...input,
      fileName: 'synthetic.docx',
      mediaType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  ).toBe('docx');
  fails(
    () =>
      validateDocumentInput({
        ...input,
        bytes: new Uint8Array(limits.fileBytes + 1),
      }),
    'DOCUMENT_TOO_LARGE',
  );
  fails(
    () => validateDocumentInput({ ...input, bytes: new Uint8Array() }),
    'INVALID_INPUT',
  );
  fails(
    () => validateDocumentInput({ ...input, bytes: 'private' }),
    'INVALID_INPUT',
  );
  fails(
    () => validateDocumentInput({ ...input, fileName: '../private.pdf' }),
    'INVALID_INPUT',
  );
  fails(
    () => validateDocumentInput({ ...input, fileName: 'synthetic.docx' }),
    'UNSUPPORTED_FILE_TYPE',
  );
  fails(
    () => validateDocumentInput({ ...input, fileName: 'synthetic.docm' }),
    'UNSUPPORTED_FILE_TYPE',
  );
});
test('oversize and non-JSON output fail safely', () => {
  fails(
    () =>
      validateCvOutput({ private: 'a'.repeat(limits.outputBytes) }, source()),
    'OUTPUT_TOO_LARGE',
  );
  fails(() => validateCvOutput(undefined, source()), 'INVALID_OUTPUT');
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  fails(() => validateCvOutput(cycle, source()), 'INVALID_OUTPUT');
});
test('invalid output is not mutated or logged and errors omit private payloads', () => {
  const input = { ...cv(), name: fact('PRIVATE_SECRET') };
  const before = JSON.stringify(input);
  const spies = [
    jest.spyOn(console, 'log'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'error'),
  ];
  try {
    fails(() => validateCvOutput(input, source()), 'INVALID_EVIDENCE');
    expect(JSON.stringify(input)).toBe(before);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});
test.each([
  'http://127.0.0.1:11434',
  'http://[::1]:11434/',
  'https://127.0.0.1',
  'https://[::1]',
])('accepts literal loopback %s', (url) =>
  expect(aiConfig({ OLLAMA_BASE_URL: url }).baseUrl).toBe(new URL(url).origin),
);
test.each([
  'http://localhost:11434',
  'https://example.com',
  'http://192.168.1.1:11434',
  'http://0.0.0.0',
  'http://127.0.0.2',
  'http://127.1',
  'http://2130706433',
  'http://0x7f000001',
  'http://0177.0.0.1',
  'http://[0:0:0:0:0:0:0:1]',
  'http://[::ffff:127.0.0.1]',
  'http://[::2]',
  'http://127.0.0.1.example.com',
  'http://127.0.0.1@remote.example',
  'http://private@127.0.0.1',
  'http://127.0.0.1/private',
  'http://127.0.0.1?private',
  'http://127.0.0.1#private',
  ' http://127.0.0.1',
  'http://127.0.0.1\n',
  'http://127.0.0.1:99999',
])('rejects remote or nonliteral origin %s without echoing it', (url) => {
  expect(() => aiConfig({ OLLAMA_BASE_URL: url })).toThrow('OLLAMA_BASE_URL');
  try {
    aiConfig({ OLLAMA_BASE_URL: url });
  } catch (error) {
    expect((error as Error).message).not.toContain(url);
  }
});

test('enforces UTF-16 limits even when JSON Schema counts Unicode code points', () => {
  const value = '😀'.repeat(limits.factUnits / 2 + 1);
  fails(
    () => validateCvOutput({ ...cv(), name: fact(value) }, source(value)),
    'INVALID_EVIDENCE',
  );
  fails(
    () =>
      validateCvOutput(
        { ...cv(), name: fact('x', 'x' + value) },
        source('x' + value),
      ),
    'INVALID_EVIDENCE',
  );
});
test('accepts exact fact/quote limit and rejects too many references', () => {
  const value = 'a'.repeat(limits.factUnits);
  expect(
    validateCvOutput({ ...cv(), name: fact(value) }, source(value)).name.value,
  ).toBe(value);
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          name: {
            value: 'Synthetic',
            evidence: Array.from(
              { length: limits.evidencePerFact + 1 },
              () => ({ segmentId: 's1', quote: 'Synthetic' }),
            ),
          },
        },
        source(),
      ),
    'INVALID_OUTPUT',
  );
});
test('rejects numeric durations and dates rather than normalizing them', () => {
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          skills: [
            { name: fact('React'), experienceText: { value: 5, evidence: [] } },
          ],
        },
        source('React 5 years'),
      ),
    'INVALID_OUTPUT',
  );
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          experience: [
            {
              employer: unknown(),
              title: unknown(),
              startDateText: { value: 2022, evidence: [] },
              endDateText: unknown(),
              descriptionText: unknown(),
            },
          ],
        },
        source('2022'),
      ),
    'INVALID_OUTPUT',
  );
});
test('rejects filename control characters', () =>
  fails(
    () =>
      validateDocumentInput({
        bytes: new Uint8Array(1),
        fileName: 'synthetic\n.pdf',
        mediaType: 'application/pdf',
      }),
    'INVALID_INPUT',
  ));

test('rejects exact duplicate skill names even with different evidence', () => {
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          skills: [
            {
              name: fact('React', 'React required'),
              experienceText: unknown(),
            },
            {
              name: fact('React', 'React preferred'),
              experienceText: unknown(),
            },
          ],
        },
        source('React required. React preferred.'),
      ),
    'DUPLICATE_FACT',
  );
});
test('rejects duplicate requirements with conflicting grounded priorities', () => {
  fails(
    () =>
      validateJdOutput(
        {
          ...jd(),
          requirements: [
            {
              text: fact('React', 'React required'),
              priority: fact('required', 'React required'),
            },
            {
              text: fact('React', 'React preferred'),
              priority: fact('preferred', 'React preferred'),
            },
          ],
        },
        source('React required. React preferred.', 'text'),
      ),
    'DUPLICATE_FACT',
  );
});
test('rejects duplicate responsibilities despite different evidence', () => {
  fails(
    () =>
      validateJdOutput(
        {
          ...jd(),
          responsibilities: [
            fact('Test', 'Test daily'),
            fact('Test', 'Test weekly'),
          ],
        },
        source('Test daily. Test weekly.', 'text'),
      ),
    'DUPLICATE_FACT',
  );
});
test('duplicate comparisons do not trim or case fold values', () => {
  const result = validateCvOutput(
    {
      ...cv(),
      skills: [
        { name: fact('React', 'React '), experienceText: unknown() },
        { name: fact('react'), experienceText: unknown() },
        { name: fact('React ', 'React '), experienceText: unknown() },
      ],
    },
    source('React react'),
  );
  expect(result.skills.map((item) => item.name.value)).toEqual([
    'React',
    'react',
    'React ',
  ]);
});
test.each(['experience', 'education'] as const)(
  'rejects identical %s records but preserves different evidence',
  (kind) => {
    const entry = (quote: string) =>
      kind === 'experience'
        ? {
            employer: fact('Acme', quote),
            title: unknown(),
            startDateText: unknown(),
            endDateText: unknown(),
            descriptionText: unknown(),
          }
        : {
            institution: fact('Acme', quote),
            qualification: unknown(),
            dateText: unknown(),
          };
    fails(
      () =>
        validateCvOutput(
          { ...cv(), [kind]: [entry('Acme'), entry('Acme')] },
          source('Acme Ltd.'),
        ),
      'DUPLICATE_FACT',
    );
    expect(
      validateCvOutput(
        { ...cv(), [kind]: [entry('Acme'), entry('Acme Ltd.')] },
        source('Acme Ltd.'),
      )[kind],
    ).toHaveLength(2);
  },
);
test('reordered references do not evade identical-history duplicate detection', () => {
  const name = {
    value: 'Acme',
    evidence: [
      { segmentId: 's1', quote: 'Acme' },
      { segmentId: 's1', quote: 'Acme Ltd.' },
    ],
  };
  const entry = {
    institution: name,
    qualification: unknown(),
    dateText: unknown(),
  };
  fails(
    () =>
      validateCvOutput(
        {
          ...cv(),
          education: [
            entry,
            {
              ...entry,
              institution: { ...name, evidence: [...name.evidence].reverse() },
            },
          ],
        },
        source('Acme Ltd.'),
      ),
    'DUPLICATE_FACT',
  );
});
