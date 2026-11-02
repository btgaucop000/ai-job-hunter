import { expect, test } from '@jest/globals';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const input = {
  title: 'Synthetic engineer',
  company: 'Example Company',
  source: 'Email',
  status: 'SAVED',
  originalLink: 'https://example.com/job',
  contactNotes: 'Synthetic recruiter',
  description: 'Synthetic JD',
  notes: '',
  contactDates: ['2026-10-30'],
  followUpDate: '2026-11-02',
};
test('accepts all practical statuses without a transition restriction', () => {
  for (const status of [
    'SAVED',
    'CONTACTED',
    'JD_RECEIVED',
    'APPLIED',
    'INTERVIEW',
    'OFFER',
    'REJECTED',
    'CLOSED',
  ])
    expect(validateOpportunity({ ...input, status }).status).toBe(status);
});
test('rejects unsafe links, invalid dates, owner injection and oversized content', () => {
  for (const change of [
    { originalLink: 'javascript:alert(1)' },
    { originalLink: 'https://name:secret@example.com' },
    { followUpDate: '2026-02-30' },
    { contactDates: ['2026-01-01', '2026-01-01'] },
    { ownerId: 'someone' },
    { description: 'x'.repeat(26001) },
    { title: ' ' },
    { source: 'Crawler' },
    { status: 'UNKNOWN' },
  ])
    expect(() => validateOpportunity({ ...input, ...change })).toThrow();
});
