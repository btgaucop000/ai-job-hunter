import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { mergeCandidates, validateImportReview, type ImportCandidate } from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const title = 'Java Backend Developer Java 17+, Spring Boot, English';
const address = 'Anna Building, QTSC, Quận 12, Hồ Chí Minh, VN';
const post = `Job title: ${title}\nCompany: Synthetic bbv Vietnam\nLocation: ${address}\nJava Backend Developer\nBuild Java services in Ho Chi Minh City.`;
const candidate = (field: ImportCandidate['field'], value: string): ImportCandidate => ({ field, value, source: 'post', quote: value });
const proposed = [candidate('title', 'Java Backend Developer'), candidate('location', 'Ho Chi Minh City')];
const merge = (extra: ImportCandidate[] = [], text = post) => mergeCandidates({ candidates: [...proposed, ...sourceCandidates(text, ''), ...extra] }, text, '');
test('reproduces fetched source plus shortened model title/city and prefers full source fields', () => {
  const result = merge();
  expect(result.fields.find(f => f.field === 'title')).toMatchObject({ value: title, status: 'SUPPORTED' });
  expect(result.fields.find(f => f.field === 'location')).toMatchObject({ value: address, status: 'SUPPORTED' });
  expect(result.rejected).toBe(0);
  expect(validateImportReview(result.fields, post, '')).toEqual(result.fields);
});
test('actual extraction service with a synthetic provider returns populated fields and validates on save', async () => {
  const ai = { generateStructured: jest.fn(async () => ({ candidates: proposed })) };
  const result = await new JobImportService(ai as unknown as AiService).extract({ record: { postText: post } });
  expect(result.error).toBeNull();
  const fields = Object.fromEntries(result.fields.map(f => [f.field, f.value]));
  const saved = validateOpportunity({ ...fields, source: 'Website', status: 'SAVED', postText: post, importReview: result.fields, description: result.description, notes: '', contactDates: [], followUpDate: null });
  expect(saved).toMatchObject({ title, location: address, company: 'Synthetic bbv Vietnam' });
});
test.each(['Hà Nội', 'District 7, Ho Chi Minh City', 'Other Building, Quận 12, Hồ Chí Minh'])('preserves real location contradictions and requires explicit review: %s', other => {
  const text = `${post}\nLocation: ${other}`;
  const result = merge([candidate('location', other)], text);
  expect(result.fields.find(f => f.field === 'location')).toMatchObject({ value: '', status: 'CONFLICT', reviewed: false });
  expect(() => validateImportReview(result.fields, text, '')).toThrow('Review every conflicting');
  const reviewed = result.fields.map(f => ({ ...f, reviewed: f.status === 'CONFLICT' }));
  expect(validateImportReview(reviewed, text, '').find(f => f.field === 'location')?.reviewed).toBe(true);
});
test('does not treat different role or seniority as a shortened title', () => {
  for (const other of ['Java Backend Developer Team Lead', 'Junior Java Backend Developer', 'React Frontend Developer']) {
    const text = `${post}\nJob title: ${other}`;
    expect(merge([candidate('title', other)], text).fields.find(f => f.field === 'title')?.status).toBe('CONFLICT');
  }
});
test('plain manual paste with compatible district/city retains existing canonical behavior', () => {
  const text = 'Location: Quận 7\nLocation: HCM\nJob title: AI Developer';
  const result = mergeCandidates({ candidates: sourceCandidates(text, '') }, text, '');
  expect(result.fields.find(f => f.field === 'location')).toMatchObject({ value: 'Quận 7, TP.HCM', status: 'SUPPORTED' });
  expect(validateImportReview(result.fields, text, '')).toEqual(result.fields);
});

test('preserves previous city-only saved review metadata', () => {
  const text = 'Location: Ho Chi Minh City';
  const result = mergeCandidates({ candidates: sourceCandidates(text, '') }, text, '');
  expect(result.fields.find(f => f.field === 'location')).toMatchObject({ value: 'Ho Chi Minh City', status: 'SUPPORTED' });
  expect(validateImportReview(result.fields, text, '')).toEqual(result.fields);
});
