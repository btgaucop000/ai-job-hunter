import { expect, test } from '@jest/globals';
import {
  validateMatchAssessment,
  type MatchRequirement,
} from '../../src/matching/cv-match.js';
const java =
  'Experience in at least one managed language such as Java, Scala, Go, C# or similar';
const tooling =
  'Experience evaluating and integrating AI-assisted development tools into engineering workflows';
const cvJava = 'Backend — Java, Spring Boot, Hibernate';
const cvTooling = 'Used Copilot as an AI-assisted coding tool.';
const cv = `${cvJava}\n${cvTooling}`;
const jd = `${java}\n${tooling}`;
const row = (
  requirement: string,
  jdQuote: string,
  cvQuote: string,
): MatchRequirement => ({
  requirement,
  jdQuote,
  cvQuote,
  priority: 'required',
  category: 'skill',
});
const canonical = [row(java, java, ''), row(tooling, tooling, '')];
const proposals = [
  row(java, java, cvJava),
  row('AI integration experience', tooling, cvTooling),
];

test('verified tooling JD quote accepts tool evidence despite an ambiguous generated requirement label', () => {
  expect(jd).toContain(proposals[1]!.jdQuote);
  expect(cv).toContain(proposals[1]!.cvQuote);
  expect(() =>
    validateMatchAssessment(proposals, cv, jd, canonical),
  ).not.toThrow();
});
test('valid verbatim quotes and exact requirement labels are accepted', () => {
  expect(() =>
    validateMatchAssessment(
      [proposals[0]!, row(tooling, tooling, cvTooling)],
      cv,
      jd,
      canonical,
    ),
  ).not.toThrow();
});
test.each([
  [
    'cvQuote',
    {
      ...proposals[0]!,
      cvQuote: 'Backend — Java, Spring Boot, fabricated expertise',
    },
  ],
  [
    'jdQuote',
    { ...proposals[0]!, jdQuote: 'Java is the only required language' },
  ],
  ['cvQuote wrong source', { ...proposals[0]!, cvQuote: java }],
  [
    'cvQuote whitespace',
    { ...proposals[0]!, cvQuote: 'Backend — Java,  Spring Boot, Hibernate' },
  ],
  [
    'cvQuote punctuation',
    { ...proposals[0]!, cvQuote: 'Backend - Java, Spring Boot, Hibernate' },
  ],
  ['jdQuote HTML', { ...proposals[0]!, jdQuote: `<p>${java}</p>` }],
] as const)('%s follows per-field evidence handling', (_field, bad) => {
  // Exact canonical requirement labels keep this in evidence validation, not coverage validation.
  const validate = () =>
    validateMatchAssessment(
      [bad, row(tooling, tooling, cvTooling)],
      cv,
      jd,
      canonical,
    );
  if (_field.startsWith('jdQuote')) expect(validate).toThrow(/evidence/i);
  else {
    const verified = validate();
    expect(verified[0]!.cvQuote).toBe(
      _field === 'cvQuote whitespace' ? cvJava : '',
    );
    expect(verified[1]!.cvQuote).toBe(cvTooling);
  }
});
test('Unicode normalization is not accepted as whitespace-equivalent evidence', () => {
  const text = 'Công nghệ Java';
  const seed = row(text, text, '');
  expect(() =>
    validateMatchAssessment(
      [row(text, text, text.normalize('NFD'))],
      text,
      text,
      [seed],
    ),
  ).toThrow(/evidence/i);
});
test('a valid tool quotation remains insufficient for an actual production AI/ML requirement', () => {
  const production = 'Production AI/ML model development';
  expect(() =>
    validateMatchAssessment(
      [row('AI-assisted coding tools', production, cvTooling)],
      cv,
      production,
      [row(production, production, '')],
    ),
  ).toThrow(/evidence/i);
});

test('generic JD quote cannot hide a canonical production AI requirement from the tooling guard', () => {
  const production = 'Production AI/ML model development';
  const generic = 'Experience with development tools';
  expect(() =>
    validateMatchAssessment(
      [row(production, generic, cvTooling)],
      cv,
      `${production}\n${generic}`,
      [row(production, production, '')],
    ),
  ).toThrow(/evidence/i);
});

test('Axon senior full JD survives HTML conversion and save/read with all verbatim evidence accepted', async () => {
  const { normalizeGreenhouse, DISCOVERY_SOURCES } =
    await import('../../src/discovery/greenhouse.source.js');
  const { canonicalRequirements, matchJobText } =
    await import('../../src/matching/cv-match.js');
  const facts = [
    '6+ years of professional software development experience',
    'Backend service experience in multiple managed languages such as Java, Scala, Go, C#, or similar',
    'Experience with SQL or NoSQL data stores',
    'Experience evaluating and integrating AI-assisted development tools into engineering workflows',
    'Experience designing and delivering highly-available, scalable cloud-based systems',
  ];
  const source = normalizeGreenhouse(
    {
      jobs: [
        {
          id: 501,
          title: 'Senior Backend Engineer',
          company_name: 'Synthetic Axon',
          location: { name: 'Ho Chi Minh City' },
          absolute_url: 'https://job-boards.greenhouse.io/synthetic/jobs/501',
          content: `&lt;h2&gt;What You Bring&lt;/h2&gt;${facts.map((value) => `&lt;p&gt;${value}&lt;/p&gt;`).join('')}`,
        },
      ],
    },
    DISCOVERY_SOURCES[0],
    '2026-10-30T00:00:00Z',
  ).jobs[0]!;
  const saved = JSON.parse(
    JSON.stringify({
      ...source,
      jdText: '',
      postText: '',
      experience: '',
      domain: '',
    }),
  );
  const canonical = canonicalRequirements(saved);
  const input = matchJobText(saved);
  const quotes = [
    '6+ years building enterprise software.',
    'Backend — Java, Spring Boot.',
    'Databases: PostgreSQL, SQL Server.',
    'Used Copilot as an AI-assisted development tool.',
    'Designed highly-available cloud services.',
  ];
  const cvText = quotes.join('\n');
  const output = canonical.map((seed, index) => ({
    ...seed,
    cvQuote: quotes[index]!,
  }));
  expect(canonical.map((item) => item.jdQuote)).toEqual(facts);
  expect(
    facts.every(
      (fact) => saved.description.includes(fact) && input.includes(fact),
    ),
  ).toBe(true);
  expect(() =>
    validateMatchAssessment(output, cvText, input, canonical),
  ).not.toThrow();
});

test.each([
  [
    'JD paraphrase',
    'jdQuote',
    '6+ years of professional software development experience',
    'At least six years of software engineering experience',
  ],
  [
    'CV quote copied from JD',
    'cvQuote',
    '6+ years building enterprise software.',
    '6+ years of professional software development experience',
  ],
  [
    'JD punctuation change',
    'jdQuote',
    'Experience designing and delivering highly-available, scalable cloud-based systems',
    'Experience designing and delivering highly available, scalable cloud based systems',
  ],
  [
    'raw HTML instead of saved JD text',
    'jdQuote',
    'Experience with SQL or NoSQL data stores',
    '<p>Experience with SQL or NoSQL data stores</p>',
  ],
] as const)(
  'Axon senior synthetic %s follows per-field evidence handling',
  (_case, field, expected, actual) => {
    const jdText = field === 'cvQuote' ? actual : expected;
    const cvText =
      field === 'cvQuote'
        ? expected
        : 'Synthetic CV: Java Spring Boot development.';
    const seed = row(jdText, jdText, '');
    const valid = row(seed.requirement, jdText, cvText);
    expect(() =>
      validateMatchAssessment([valid], cvText, jdText, [seed]),
    ).not.toThrow();
    const invalid = { ...valid, [field]: actual };
    const targetSource = field === 'cvQuote' ? cvText : jdText;
    expect(targetSource.includes(invalid[field])).toBe(false);
    expect(() =>
      validateMatchAssessment([invalid], cvText, jdText, [seed]),
    ).toThrow(/evidence/i);
  },
);
