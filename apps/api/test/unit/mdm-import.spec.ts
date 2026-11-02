import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import {
  validateImportReview,
  mergeCandidates,
} from '../../src/opportunities/job-import.contract.js';
import { alternativeRequirement } from '../../src/extraction/jd-requirements.js';
import { salaryEvidence } from '../../src/opportunities/job-import.salary.js';
import { mdmJd } from '../support/mdm-import.synthetic.js';

function preview() {
  const job = {
    '@type': 'JobPosting',
    title: 'Fullstack Developer',
    description: mdmJd.replace(/\n/gu, '<br>'),
    skills: ['Java', 'Golang', 'Python', 'MetadataOnlyTag'],
    industry: 'Information Technology',
  };
  return parseJobPosting(
    `<script type="application/ld+json">${JSON.stringify(job)}</script>`,
    'https://itviec.com/it-jobs/synthetic-mdm',
    new Date('2026-11-02').getTime(),
  );
}
test('complete numbered JD reaches mocked extraction and produces source-backed comprehensive review', async () => {
  const fetched = preview();
  expect(fetched.sourceText).toContain(
    'English reading comprehension for technical documentation.',
  );
  expect(fetched.sourceText).toContain(
    'Supplemental skill tags (not requirements): Java',
  );
  const ai = {
    generateStructured: jest.fn(async (_request: unknown) => ({
      candidates: ['Java', 'Golang', 'Python', 'MetadataOnlyTag'].map(
        (value) => ({ field: 'skills', value, source: 'post', quote: value }),
      ),
    })),
  };
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: fetched.sourceText } },
  );
  expect(result.error).toBeNull();
  expect(
    (
      ai.generateStructured.mock.calls[0]![0] as { prompt: string }
    ).prompt.endsWith(JSON.stringify({ post: fetched.sourceText, jd: '' })),
  ).toBe(true);
  const fields = Object.fromEntries(
    result.fields.map((field) => [field.field, field]),
  );
  const required = fields.skills!.value;
  const preferred = fields.preferredSkills!.value;
  for (const word of [
    'Node.js or Python',
    'RESTful API',
    'SQL/NoSQL',
    'React.js or Vue.js',
    'TypeScript',
    'responsive design',
    'Android (Kotlin/Java) or iOS (Swift)',
    'AWS basic',
    'Firebase Cloud Messaging',
    'Git',
    'Docker',
    'CI/CD',
    'Agile/Scrum',
    'Working knowledge',
    'Root of Trust',
    'cryptographic algorithms',
    'TLS 1.2/1.3',
    'mTLS',
    'X.509',
    'Sign and verify',
    'Security mindset',
    'English reading',
  ])
    expect(required).toContain(word);
  for (const word of [
    'Prior experience',
    'React Native',
    'integration experience',
    'post-quantum',
    'FIPS 140-2/140-3',
  ]) {
    expect(preferred).toContain(word);
    expect(required).not.toContain(word);
  }
  expect(required.split('\n')).toContain('TypeScript');
  expect(required.split('\n')).toContain('Frontend: React.js or Vue.js');
  expect(required).not.toContain('MetadataOnlyTag');
  expect(required).not.toContain('Full Social');
  expect(required).not.toContain('deep expertise');
  expect(fields.domain!.value).toBe('Mobile Device Management (MDM)');
  expect(fields.experience!.value).toBe('3–5 years');
  expect(fields.seniority!.value).toBe('Middle/ Senior');
  expect(fields.salary!.value).toBe('Negotiable based on capability');
  expect(salaryEvidence(fields.salary!.value)).toBeNull();
  expect(required.split('\n').length).toBeLessThan(55);
  for (const field of result.fields)
    for (const candidate of field.candidates)
      expect(fetched.sourceText).toContain(candidate.quote);
  expect(validateImportReview(result.fields, fetched.sourceText, '')).toEqual(
    result.fields,
  );
});
test.each([
  'Backend: Golang, Java, Node.js or Python',
  'Frontend: React.js or Vue.js, TypeScript, responsive design.',
  'Mobile: Android (Kotlin/Java) or iOS (Swift)',
])('OR capabilities remain atomic downstream: %s', (value) => {
  expect(alternativeRequirement(value)).toBe(true);
});
test('negotiable disclosure cannot fabricate amounts or turn arbitrary benefits into salary', () => {
  const post = 'Negotiable based on capability\nFull health insurance';
  const result = mergeCandidates(
    {
      candidates: [
        {
          field: 'salary',
          value: 'Negotiable based on capability',
          source: 'post',
          quote: 'Negotiable based on capability',
        },
        {
          field: 'salary',
          value: 'Full health insurance',
          source: 'post',
          quote: 'Full health insurance',
        },
      ],
    },
    post,
    '',
  );
  expect(result.rejected).toBe(1);
  expect(result.fields.find((field) => field.field === 'salary')?.value).toBe(
    'Negotiable based on capability',
  );
});

test('whole model sentences and component proposals reconcile to nonoverlapping source clauses', async () => {
  const fetched = preview();
  const lines = mdmJd.split('\n');
  const backend = lines.find((line) => line.startsWith('Backend:'))!;
  const mobile = lines.find((line) => line.startsWith('Mobile:'))!;
  const kms = lines.find((line) => line.startsWith('Familiarity with HSM'))!;
  const ai = {
    generateStructured: jest.fn(async () => ({
      candidates: [
        ...[
          backend,
          mobile,
          kms,
          'Java',
          'RESTful API',
          'SQL/NoSQL databases',
          'React Native',
          'HSM',
        ].map((value) => ({
          field: 'skills',
          value,
          source: 'post',
          quote: [backend, mobile, kms].find((line) => line.includes(value))!,
        })),
        {
          field: 'preferredSkills',
          value: mobile,
          source: 'post',
          quote: mobile,
        },
      ],
    })),
  };
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: fetched.sourceText } },
  );
  expect(result.error).toBeNull();
  const required = result.fields
    .find((field) => field.field === 'skills')!
    .value.split('\n');
  const preferred = result.fields
    .find((field) => field.field === 'preferredSkills')!
    .value.split('\n');
  expect(
    required.filter((value) => /Backend:|Golang|Node.js/iu.test(value)),
  ).toEqual(['Backend: Golang, Java, Node.js or Python']);
  expect(required).toContain('RESTful API');
  expect(required).toContain('SQL/NoSQL databases');
  expect(required).toContain('Mobile: Android (Kotlin/Java) or iOS (Swift)');
  expect(required).toContain('Familiarity with HSM / cloud KMS concepts');
  expect(preferred).toContain('React Native');
  expect(
    preferred.some((value) =>
      value.startsWith('integration experience (AWS KMS'),
    ),
  ).toBe(true);
  expect(
    preferred.some((value) =>
      /Backend:|Mobile:|HSM \/ cloud KMS concepts/u.test(value),
    ),
  ).toBe(false);
  expect(required.some((value) => /React Native|3–5 years/u.test(value))).toBe(
    false,
  );
  expect(
    result.fields.find((field) => field.field === 'experience')?.value,
  ).toBe('3–5 years');
  expect(required.join('\n')).toContain('TLS 1.2/1.3, mTLS');
  expect(required.join('\n')).toContain('AES-128/256');
  expect(required.join('\n')).toContain('X.509');
  expect(validateImportReview(result.fields, fetched.sourceText, '')).toEqual(
    result.fields,
  );
});

// Existing records retain their evidence and historical display values on save.
test('historical whole-sentence review metadata remains saveable without rewriting saved/manual values', () => {
  const line =
    'Backend: Golang, Java, Node.js or Python; RESTful API, SQL/NoSQL databases.';
  const source = `4. REQUIREMENTS\n${line}`;
  const review = mergeCandidates(
    {
      candidates: [
        { field: 'skills', value: line, source: 'post', quote: line },
        { field: 'skills', value: 'RESTful API', source: 'post', quote: line },
      ],
    },
    source,
    '',
    true,
    true,
    false,
  ).fields;
  expect(
    validateImportReview(review, source, '').map((field) => field.value),
  ).toEqual(review.map((field) => field.value));
});
