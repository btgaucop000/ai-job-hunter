import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
import type { ImportCandidate } from '../../src/opportunities/job-import.contract.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const candidate = (
  field: ImportCandidate['field'],
  value: string,
  source: ImportCandidate['source'] = 'post',
  quote = value,
): ImportCandidate => ({ field, value, source, quote });
test('merges company only in JD, preserves missing fields and combines skills', () => {
  const result = mergeCandidates(
    {
      candidates: [
        candidate('title', 'Engineer'),
        candidate('company', 'Example Employer', 'jd'),
        candidate('skills', 'React'),
        candidate('skills', 'SQL', 'jd'),
      ],
    },
    'Engineer React',
    'Example Employer SQL',
  );
  expect(result.fields.find((f) => f.field === 'company')).toMatchObject({
    value: 'Example Employer',
    status: 'SUPPORTED',
  });
  expect(result.fields.find((f) => f.field === 'salary')).toMatchObject({
    value: '',
    status: 'MISSING',
  });
  expect(result.fields.find((f) => f.field === 'skills')?.value).toBe(
    'React\nSQL',
  );
});
test('conflicts are blank until explicitly reviewed and cannot be saved unresolved', () => {
  const result = mergeCandidates(
    {
      candidates: [
        candidate('company', 'Example A'),
        candidate('company', 'Example B', 'jd'),
      ],
    },
    'Example A',
    'Example B',
  );
  expect(result.fields.find((f) => f.field === 'company')).toMatchObject({
    value: '',
    status: 'CONFLICT',
    reviewed: false,
  });
  expect(() =>
    validateImportReview(result.fields, 'Example A', 'Example B'),
  ).toThrow('Review every conflicting');
  const reviewed = result.fields.map((f) => ({
    ...f,
    reviewed: f.status === 'CONFLICT',
  }));
  expect(
    validateImportReview(reviewed, 'Example A', 'Example B').find(
      (f) => f.field === 'company',
    )?.reviewed,
  ).toBe(true);
  expect(() =>
    validateImportReview(reviewed, 'different post', 'Example B'),
  ).toThrow();
});
test('rejects unsupported values, wrong-source quotes and unsafe links', () => {
  const result = mergeCandidates(
    {
      candidates: [
        candidate('company', 'Invented'),
        candidate('salary', '$999', 'jd'),
        candidate('location', 'Somewhere', 'post', 'Located Somewhere'),
        candidate('originalLink', 'javascript:bad'),
      ],
    },
    'Somewhere javascript:bad',
    '',
  );
  expect(result.rejected).toBe(4);
  expect(result.fields.every((f) => f.status === 'MISSING')).toBe(true);
});
test('uses real structured validation with a fake provider and preserves exact post', async () => {
  const generate = jest.fn<() => Promise<string>>().mockResolvedValue(
    JSON.stringify({
      candidates: [candidate('title', 'Synthetic engineer')],
    }),
  );
  const service = new JobImportService(new AiService({ generate }));
  const post = '  Synthetic engineer\nContact: synthetic@example.com  ';
  const result = await service.extract({ record: { postText: post } });
  expect(result.error).toBeNull();
  expect(result.postText).toBe(post);
  expect(result.description).toContain(post);
  expect(result.fields.find((f) => f.field === 'title')?.value).toBe(
    'Synthetic engineer',
  );
  expect(generate).toHaveBeenCalledTimes(1);
});
test('AI failure retains sources and returns safe manual fallback without provider details', async () => {
  const service = new JobImportService(
    new AiService({
      generate: async () => {
        throw new Error('PRIVATE PROVIDER PAYLOAD');
      },
    }),
  );
  const result = await service.extract({
    record: { postText: 'Synthetic post' },
  });
  expect(result.error).toMatch(/Enter fields manually/);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.postText).toBe('Synthetic post');
  expect(result.fields.every((f) => f.value === '')).toBe(true);
});
test('validates empty/bounded inputs without calling AI and enforces one extraction at a time', async () => {
  let release!: (v: string) => void;
  const generate = jest.fn<() => Promise<string>>(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const service = new JobImportService(new AiService({ generate }));
  await expect(service.extract({ record: { postText: '' } })).rejects.toThrow();
  await expect(
    service.extract({ record: { postText: 'x'.repeat(12001) } }),
  ).rejects.toThrow();
  expect(generate).not.toHaveBeenCalled();
  const pending = service.extract({ record: { postText: 'Synthetic' } });
  await expect(
    service.extract({ record: { postText: 'Synthetic' } }),
  ).rejects.toThrow(/busy/);
  release('{"candidates":[]}');
  await pending;
});
test('company is optional for manual saving', () => {
  expect(
    validateOpportunity({
      title: 'Synthetic job',
      company: '',
      source: 'Other',
      status: 'SAVED',
      originalLink: '',
      contactNotes: '',
      description: '',
      notes: '',
      contactDates: [],
      followUpDate: null,
    }).company,
  ).toBe('');
});
