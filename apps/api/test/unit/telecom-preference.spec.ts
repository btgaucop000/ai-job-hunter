import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import { mergeCandidates, validateImportReview, type ImportCandidate } from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { canonicalRequirements, matchPrompt } from '../../src/matching/cv-match.js';
import { alternativeRequirement } from '../../src/extraction/jd-requirements.js';
import type { Opportunity } from '../../src/opportunities/opportunity.entity.js';
const preference = 'Ưu tiên có kiến thức hay từng tham gia dự án liên quan đến lĩnh vực viễn thông.';
const project = 'Tham gia dự án MVNO trong lĩnh vực viễn thông.';
const alternative = 'Thành thạo ít nhất một trong các công nghệ: SOAP/RESTful Web Services, WebSocket, Spring Framework, TypeScript, HTML5/CSS.';
const text = `Yêu cầu ứng viên\n${project}\n${alternative}\n${preference}\nƯu tiên container, K8S, Microservice\nExperience: ít nhất 03 năm\nExperience: 36 months`;
function extraction(extra = '') {
  const source = text + extra;
  const candidates: ImportCandidate[] = [{ field: 'skills', value: 'viễn thông', source: 'post', quote: project }, ...sourceCandidates(source, '')];
  const result = mergeCandidates({ candidates }, source, '');
  return { source, ...result };
}
test('project context under required heading cannot override explicit preferred domain knowledge', () => {
  const result = extraction();
  const required = result.fields.find(field => field.field === 'skills')!;
  const preferred = result.fields.find(field => field.field === 'preferredSkills')!;
  expect(required.value).not.toContain('viễn thông');
  expect(preferred.value).toContain('viễn thông');
  expect(preferred.candidates.find(candidate => candidate.value === 'viễn thông')?.quote).toBe(preference);
  expect(result.fields.find(field => field.field === 'domain')).toMatchObject({ value: 'MVNO', status: 'SUPPORTED' });
  expect(result.fields.find(field => field.field === 'experience')).toMatchObject({ value: 'Minimum 3 years', status: 'SUPPORTED' });
  expect(validateImportReview(result.fields, result.source, '')).toEqual(result.fields);
});
test('genuine explicit mandatory wording retains required priority', () => {
  const result = extraction('\nBắt buộc có kiến thức viễn thông.');
  expect(result.fields.find(field => field.field === 'skills')?.value).toContain('viễn thông');
  expect(result.fields.find(field => field.field === 'preferredSkills')?.value).not.toContain('viễn thông');
});
test('canonical CV matching keeps the Vietnamese alternative group as one required row', () => {
  const extracted = extraction();
  const fields = Object.fromEntries(extracted.fields.map(field => [field.field, field.value]));
  const job = { ...fields, title: 'Synthetic Java developer', description: text, postText: text, jdText: '', importReview: extracted.fields, seniority: '' } as Opportunity;
  const canonical = canonicalRequirements(job);
  const required = canonical.filter(row => row.priority === 'required' && row.category === 'skill');
  expect(alternativeRequirement(alternative)).toBe(true);
  expect(required).toHaveLength(1);
  expect(required[0]?.requirement).toBe(alternative);
  expect(canonical.find(row => row.requirement === 'viễn thông')).toMatchObject({ priority: 'preferred', category: 'domain' });
  expect(canonical.filter(row => row.requirement === 'TypeScript')).toHaveLength(0);
  expect(matchPrompt('Synthetic CV', text, canonical)).toContain('Vietnamese ít nhất một trong');
});
