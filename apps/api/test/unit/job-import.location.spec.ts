import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import {
  mergeCandidates,
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const full = 'Anna Building, QTSC, Quận 12, Hồ Chí Minh, VN';
function assess(values: string[]) {
  const post = values.map((value) => `Location: ${value}`).join('\n');
  const candidates: ImportCandidate[] = values.map((value) => ({
    field: 'location',
    value,
    source: 'post',
    quote: `Location: ${value}`,
  }));
  return { post, ...mergeCandidates({ candidates }, post, '') };
}
test.each([
  ['Quận 12, Hồ Chí Minh, VN', 'Quận 12'],
  ['Quận 12, Hồ Chí Minh'],
  ['Quận 12'],
  ['District 12, Ho Chi Minh City, Vietnam'],
  ['Quan 12, TP. HCM, Viet Nam'],
  ['Q.12, HCMC'],
  ['District 12, Sai Gon'],
  ['District 12, Saigon'],
  ['District 12, HCM City'],
  ['QTSC, Quận 12, Hồ Chí Minh, VN'],
])(
  'compatible location hierarchy preserves full exact source address: %s',
  (...short) => {
    const result = assess([full, ...short]);
    expect(
      result.fields.find((field) => field.field === 'location'),
    ).toMatchObject({ value: full, status: 'SUPPORTED', reviewed: false });
    expect(validateImportReview(result.fields, result.post, '')).toEqual(
      result.fields,
    );
  },
);
test.each([
  'District 1, Ho Chi Minh City',
  'Quận 1',
  'District 12, Hanoi',
  'Hà Nội',
  'Other Building, QTSC, Quận 12, Hồ Chí Minh, VN',
  'District 12, Da Nang',
])('genuine contradiction remains blocking: %s', (other) => {
  const result = assess([full, other]);
  expect(
    result.fields.find((field) => field.field === 'location'),
  ).toMatchObject({ value: '', status: 'CONFLICT' });
  expect(() => validateImportReview(result.fields, result.post, '')).toThrow(
    'Review every conflicting',
  );
  const reviewed = result.fields.map((field) => ({
    ...field,
    reviewed: field.field === 'location',
  }));
  expect(
    validateImportReview(reviewed, result.post, '').find(
      (field) => field.field === 'location',
    )?.status,
  ).toBe('CONFLICT');
});
test('obsolete compatible conflict metadata clears without acknowledgment, while manual location/tracker values survive save validation', () => {
  const result = assess(['Quận 12, Hồ Chí Minh, VN', full, 'Quận 12']);
  const old = result.fields.map((field) =>
    field.field === 'location'
      ? { ...field, status: 'CONFLICT' as const, value: '', reviewed: false }
      : field,
  );
  expect(
    validateImportReview(old, result.post, '').find(
      (field) => field.field === 'location',
    ),
  ).toMatchObject({ value: full, status: 'SUPPORTED', reviewed: false });
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
    postText: result.post,
    importReview: old,
    location: 'My manually edited location',
  });
  expect(saved).toMatchObject({
    location: 'My manually edited location',
    status: 'INTERVIEW',
    notes: 'Keep notes',
    contactNotes: 'Manual contact',
  });
});
