import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { businessDomainCandidates } from '../../src/opportunities/job-import.domain.js';
import {
  mergeCandidates,
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const sentence =
  'You will work on enterprise-grade platforms across industries such as Real Estate, Facility Management, Healthcare, MedTech, and Insurance.';
const skills =
  'Experience with TDD, Pair Programming, and enterprise software architecture.';
const names = [
  'Real Estate',
  'Facility Management',
  'Healthcare',
  'MedTech',
  'Insurance',
];
const source = `Job title: Java Backend Developer\nSource industry: Information Technology\n${sentence}\nNice to have\n${skills}`;
const proposed = [
  {
    field: 'domain',
    value: 'Information Technology',
    source: 'post',
    quote: 'Source industry: Information Technology',
  },
  {
    field: 'domain',
    value: 'enterprise software architecture',
    source: 'post',
    quote: skills,
  },
] satisfies ImportCandidate[];
const values = (fields: ReturnType<typeof mergeCandidates>['fields']) =>
  Object.fromEntries(fields.map((field) => [field.field, field.value]));
test('actual service rejects generic/architecture candidates and recovers the five explicit project domains', async () => {
  const ai = {
    generateStructured: jest.fn<(request: unknown) => Promise<unknown>>(
      async () => ({ candidates: proposed }),
    ),
  };
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: source } },
  );
  expect(result.error).toBeNull();
  const domain = result.fields.find((field) => field.field === 'domain')!;
  expect(domain).toMatchObject({
    value: names.join(', '),
    status: 'SUPPORTED',
    reviewed: false,
  });
  expect(domain.candidates.map((candidate) => candidate.value)).toEqual(names);
  expect(
    domain.candidates.every((candidate) => candidate.quote === sentence),
  ).toBe(true);
  expect(result.rejected).toBe(2);
  expect(values(result.fields).experience).toBe('');
  expect(validateImportReview(result.fields, source, '')).toEqual(
    result.fields,
  );
});
test.each([
  skills,
  'Domain: enterprise software architecture',
  'Domain: Information Technology',
  'Benefits: insurance coverage and health checks.\nBuild Java services.',
])('no genuine business-domain context stays unknown: %s', (text) => {
  const result = mergeCandidates(
    { candidates: sourceCandidates(text, '') },
    text,
    '',
  );
  expect(result.fields.find((field) => field.field === 'domain')).toMatchObject(
    { value: '', status: 'MISSING' },
  );
});
test('generic JSON-LD industry metadata remains source evidence, not a conflicting project domain', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Synthetic engineer', description: sentence, industry: 'Information Technology' })}</script>`;
  const fetched = parseJobPosting(html, 'https://itviec.com/it-jobs/synthetic');
  expect(fetched.sourceText).toContain(
    'Source industry:\nInformation Technology',
  );
  const result = mergeCandidates(
    { candidates: sourceCandidates(fetched.sourceText, '') },
    fetched.sourceText,
    '',
  );
  expect(result.fields.find((field) => field.field === 'domain')).toMatchObject(
    { value: names.join(', '), status: 'SUPPORTED' },
  );
});
test('separate incompatible business declarations still require explicit conflict review', () => {
  const post = 'Domain: Insurance',
    jd = 'Domain: Real Estate';
  const result = mergeCandidates(
    { candidates: [...sourceCandidates(post, jd)] },
    post,
    jd,
  );
  expect(result.fields.find((field) => field.field === 'domain')).toMatchObject(
    { value: '', status: 'CONFLICT', reviewed: false },
  );
  expect(() => validateImportReview(result.fields, post, jd)).toThrow(
    'Review every conflicting',
  );
  expect(
    validateImportReview(
      result.fields.map((field) => ({
        ...field,
        reviewed: field.field === 'domain',
      })),
      post,
      jd,
    ).find((field) => field.field === 'domain')?.reviewed,
  ).toBe(true);
});
test('old saved metadata and manual Domain edits remain editable without reclassification', () => {
  const text = 'Domain: Information Technology';
  const prior = mergeCandidates(
    {
      candidates: [
        {
          field: 'domain',
          value: 'Information Technology',
          source: 'post',
          quote: text,
        },
      ],
    },
    text,
    '',
    true,
    false,
  );
  const saved = validateOpportunity({
    title: 'Synthetic engineer',
    company: '',
    source: 'Website',
    status: 'INTERVIEW',
    originalLink: '',
    contactNotes: 'Manual contact',
    description: '',
    notes: 'Keep notes',
    contactDates: ['2026-10-31'],
    followUpDate: null,
    postText: text,
    importReview: prior.fields,
    domain: 'My manually selected business domain',
  });
  expect(saved).toMatchObject({
    domain: 'My manually selected business domain',
    status: 'INTERVIEW',
    notes: 'Keep notes',
    contactNotes: 'Manual contact',
  });
});
test('multiple business domains from a single explicit list are complementary', () => {
  const text =
    'Project domains: Real Estate, Facility Management, Healthcare, MedTech and Insurance';
  expect(
    businessDomainCandidates(text, 'post').map((candidate) => candidate.value),
  ).toEqual(names);
});
