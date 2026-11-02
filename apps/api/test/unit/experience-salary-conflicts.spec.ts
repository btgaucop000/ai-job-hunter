import 'reflect-metadata';
import { importTopcvPage } from '../../src/opportunities/topcv-page-import.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { expect, test } from '@jest/globals';
import {
  mergeCandidates,
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
function field(name: 'experience' | 'salary', values: string[]) {
  const post = values.join('\n');
  const candidates: ImportCandidate[] = values.map((value) => ({
    field: name,
    value,
    quote: value,
    source: 'post',
  }));
  const result = mergeCandidates({ candidates }, post, '');
  return {
    result,
    post,
    value: result.fields.find((item) => item.field === name)!,
  };
}
test.each([
  ['3 years', '36 months'],
  [
    'tối thiểu 3 năm',
    'Có tối thiểu 3 năm kinh nghiệm phát triển Backend',
    '3',
    '36 months',
    'monthsOfExperience: 36',
  ],
  ['tối thiểu ba năm', 'minimum 36 months'],
  ['3–5 years', '36-60 months'],
  ['maximum 3 years', 'tối đa 36 tháng'],
])('equivalent experience context: %s', (...values) => {
  const result = field('experience', values);
  expect(result.value.status).toBe('SUPPORTED');
  expect(validateImportReview(result.result.fields, result.post, '')).toEqual(
    result.result.fields,
  );
});
test.each([
  ['minimum 3 years', 'minimum 5 years'],
  ['exactly 3 years', 'minimum 3 years'],
  ['maximum 3 years', 'minimum 3 years'],
  ['3-5 years', '3-6 years'],
  ['3', '36 months'],
])('different or unsupported experience stays unresolved: %s', (...values) => {
  expect(field('experience', values).value.status).toBe('CONFLICT');
});
test('equivalent numeric salary and negotiation keep the fully specified numeric range', () => {
  const result = field('salary', [
    '15000000-25000000 VND per MONTH',
    '15.000.000 - 25.000.000/tháng',
    'thỏa thuận',
    'Mức lương: 15.000.000 - 25.000.000/tháng, thỏa thuận theo năng lực và kinh nghiệm thực tế',
  ]);
  expect(result.value).toMatchObject({
    status: 'SUPPORTED',
    value: '15000000-25000000 VND per MONTH',
  });
  expect(validateImportReview(result.result.fields, result.post, '')).toEqual(
    result.result.fields,
  );
});
test('negotiable-only and unknown salary remain honest; placeholder rejected', () => {
  expect(field('salary', ['thỏa thuận']).value.value).toBe('Negotiable');
  const result = field('salary', ["You'll love it", 'USD/hour']);
  expect(result.value).toMatchObject({ value: '', status: 'MISSING' });
  expect(result.result.rejected).toBe(2);
});
test.each([
  ['15000000-25000000 VND per MONTH', '16000000-25000000 VND/month'],
  ['15000000-25000000 VND per MONTH', '15000000-25000000 USD/month'],
  ['15000000-25000000 VND per MONTH', '15000000-25000000 VND/year'],
])(
  'salary contradictions remain blocking even with negotiation: %s',
  (...values) => {
    const result = field('salary', [...values, 'thỏa thuận']);
    expect(result.value.status).toBe('CONFLICT');
    expect(() =>
      validateImportReview(result.result.fields, result.post, ''),
    ).toThrow('Review every conflicting');
  },
);

test('actual bookmarklet metadata and shortened model quotes round-trip in review', () => {
  const imported = importTopcvPage({
    version: 1,
    sourceUrl: 'https://www.topcv.vn/viec-lam/synthetic/123.html',
    jobPosting: {
      '@type': 'JobPosting',
      description: 'Có tối thiểu 3 năm kinh nghiệm phát triển Backend.',
      experienceRequirements: { monthsOfExperience: 36 },
    },
    visibleText: '',
    salaryText: '',
    workModeText: '',
  });
  const post = imported.sourceText;
  const result = mergeCandidates(
    {
      candidates: [
        ...sourceCandidates(post, ''),
        {
          field: 'experience',
          value: '36',
          quote: 'Experience metadata: {"monthsOfExperience":36}',
          source: 'post',
        },
        { field: 'experience', value: '3', quote: '3', source: 'post' },
      ],
    },
    post,
    '',
  );
  expect(
    result.fields.find((item) => item.field === 'experience'),
  ).toMatchObject({ status: 'SUPPORTED', value: 'Minimum 3 years' });
  expect(validateImportReview(result.fields, post, '')).toEqual(result.fields);
});

test('browser three-candidate set resolves a shortened year value paired with month metadata', () => {
  const requirement =
    'Có tối thiểu 3 năm kinh nghiệm phát triển Backend mảng tài chính, ngân hàng';
  const metadata = 'Experience: 36 months';
  const post = `${requirement}\n${metadata}`;
  const candidates: ImportCandidate[] = [
    {
      field: 'experience',
      value: 'tối thiểu 3 năm',
      quote: requirement,
      source: 'post',
    },
    { field: 'experience', value: '3', quote: metadata, source: 'post' },
    {
      field: 'experience',
      value: '36 months',
      quote: metadata,
      source: 'post',
    },
  ];
  const result = mergeCandidates({ candidates }, post, '');
  const experience = result.fields.find((item) => item.field === 'experience')!;
  expect(result.rejected).toBe(0);
  expect(experience).toMatchObject({
    value: 'Minimum 3 years',
    status: 'SUPPORTED',
  });
  expect(experience.candidates.find((item) => item.value === '3')?.quote).toBe(
    requirement,
  );
  expect(validateImportReview(result.fields, post, '')).toEqual(result.fields);
});

test('shortened year value cannot borrow units from unrelated month metadata', () => {
  const post = 'Experience: 36 months';
  const result = mergeCandidates(
    {
      candidates: [
        { field: 'experience', value: '3', quote: post, source: 'post' },
        {
          field: 'experience',
          value: '36 months',
          quote: post,
          source: 'post',
        },
      ],
    },
    post,
    '',
  );
  expect(
    result.fields.find((item) => item.field === 'experience')?.status,
  ).toBe('CONFLICT');
  expect(() => validateImportReview(result.fields, post, '')).toThrow(
    'Review every conflicting',
  );
});
