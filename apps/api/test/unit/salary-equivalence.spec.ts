import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
function merge(values: string[]) {
  const post = values.map((value) => `Salary: ${value}`).join('\n');
  const result = mergeCandidates(
    {
      candidates: values.map((value) => ({
        field: 'salary',
        value,
        source: 'post',
        quote: `Salary: ${value}`,
      })),
    },
    post,
    '',
  );
  return {
    post,
    result,
    field: result.fields.find((field) => field.field === 'salary')!,
  };
}
test.each([
  ['700 - 2,000 USD per MONTH', '700-2000 USD per MONTH'],
  ['700 – 2,000 USD / month', '700—2000 usd per monthly'],
  ['700-2000 US$ per month', '700 - 2,000 USD/month'],
])('equivalent salary punctuation and notation do not conflict: %s', (a, b) => {
  const { post, result, field } = merge([a, b]);
  expect(field.status).toBe('SUPPORTED');
  expect(field.value).toBe(a);
  expect(field.candidates.map((item) => item.quote)).toEqual([
    `Salary: ${a}`,
    `Salary: ${b}`,
  ]);
  expect(validateImportReview(result.fields, post, '')).toEqual(result.fields);
});
test.each([
  ['700-2000 USD per month', '800-2000 USD per month'],
  ['700-2000 USD per month', '700-2000 EUR per month'],
  ['700-2000 USD per month', '700-2000 USD per year'],
  ['700-2000 USD net per month', '700-2000 USD gross per month'],
  ['700 USD per month', '1700 USD per month'],
  ['23M-25M USD/month', '23M-25M VND/month'],
])('genuine conflicts still require explicit review: %s', (a, b) => {
  const { post, result, field } = merge([a, b]);
  expect(field.status).toBe('CONFLICT');
  expect(() => validateImportReview(result.fields, post, '')).toThrow(
    'Review every conflicting',
  );
  expect(
    validateImportReview(
      result.fields.map((item) =>
        item.field === 'salary' ? { ...item, reviewed: true } : item,
      ),
      post,
      '',
    ).find((item) => item.field === 'salary')?.reviewed,
  ).toBe(true);
});
test('unknown currency/period remain unknown; old false conflict can be cleared safely', () => {
  const single = merge(['700-2000']);
  expect(single.field.value).toBe('700-2000');
  const { post, result } = merge([
    '700 - 2,000 USD per MONTH',
    '700-2000 USD per MONTH',
  ]);
  const old = result.fields.map((field) =>
    field.field === 'salary'
      ? { ...field, status: 'CONFLICT' as const, value: '', reviewed: true }
      : field,
  );
  expect(
    validateImportReview(old, post, '').find(
      (field) => field.field === 'salary',
    )?.status,
  ).toBe('SUPPORTED');
});
