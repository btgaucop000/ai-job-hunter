import 'reflect-metadata';
import { expect, test } from '@jest/globals';
import { mergeCandidates, validateImportReview, type ImportCandidate } from '../../src/opportunities/job-import.contract.js';
import { sectionCandidates, skillSourceKind } from '../../src/opportunities/job-import.sections.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { validateOpportunity } from '../../src/opportunities/opportunity.validation.js';
const title = 'Job title: Backend Developer (Java) - Upto 24M - Ưu Tiên Onboard Sớm';
const role = 'Có ít nhất 03 năm kinh nghiệm với vị trí Java Developer hoặc vị trí tương đương.';
const telecom = 'Ưu tiên có kiến thức hay từng tham gia dự án liên quan đến lĩnh vực viễn thông.';
const containers = 'Ưu tiên có kiến thức và kinh nghiệm triển khai container, K8S, Microservice là một lợi thế.';
const alternative = 'Thành thạo ít nhất một trong các công nghệ: SOAP/RESTful Web Services, WebSocket, Spring Framework, TypeScript, HTML5/CSS.';
const source = `${title}\nDự án MVNO\nYêu cầu ứng viên\n${role}\n${alternative}\n${telecom}\n${containers}\nExperience: 36 months\nSalary: 18000000-24000000 VND per MONTH`;
function extract(proposals: ImportCandidate[] = []) {
  return mergeCandidates({ candidates: [...proposals, ...sourceCandidates(source, '')] }, source, '');
}
test('early-onboarding preference in a job title does not classify Java as preferred', () => {
  expect(sectionCandidates(title, 'post')).toEqual([]);
  expect(skillSourceKind(source, 'Java')).toBe('skills');
  const result = extract();
  expect(result.fields.find(field => field.field === 'skills')?.value.split('\n')).toContain('Java');
  expect(result.fields.find(field => field.field === 'preferredSkills')?.value.split('\n')).not.toContain('Java');
  expect(result.fields.find(field => field.field === 'skills')?.candidates.find(candidate => candidate.value === 'Java')?.quote).toBe(role);
  expect(validateImportReview(result.fields, source, '')).toEqual(result.fields);
});
test('misclassified model Java from title is relinked to required role experience, preserving preferred qualifications', () => {
  const result = extract([{ field: 'preferredSkills', value: 'Java', source: 'post', quote: title }]);
  const fields = Object.fromEntries(result.fields.map(field => [field.field, field.value]));
  expect(fields.skills!.split('\n')).toContain('Java');
  expect(fields.skills!.split('\n')).toContain(alternative);
  expect(fields.preferredSkills!.split('\n')).not.toContain('Java');
  for (const term of ['viễn thông', 'container', 'K8S', 'Microservice']) expect(fields.preferredSkills).toContain(term);
  expect(fields.experience).toBe('Minimum 3 years');
  expect(fields.domain).toBe('MVNO');
  expect(fields.salary).toBe('18000000-24000000 VND per MONTH');
  expect(result.fields.find(field => field.field === 'skills')?.candidates.find(candidate => candidate.value === 'Java')?.quote).toBe(role);
  expect(validateImportReview(result.fields, source, '')).toEqual(result.fields);
  const saved = validateOpportunity({ ...fields, title: 'My manual title', skills: 'My manually edited required skills', preferredSkills: 'My manually edited preferred skills', source: 'Website', status: 'INTERVIEW', originalLink: '', contactNotes: 'Keep contact', description: source, notes: 'Keep notes', contactDates: [], followUpDate: null, postText: source, importReview: result.fields });
  expect(saved).toMatchObject({ skills: 'My manually edited required skills', preferredSkills: 'My manually edited preferred skills', status: 'INTERVIEW', notes: 'Keep notes' });
});
test('a genuine preferred Java qualification is not promoted by its presence in a role title', () => {
  const text = 'Job title: Java Developer\nƯu tiên có kiến thức Java.';
  const result = mergeCandidates({ candidates: sourceCandidates(text, '') }, text, '');
  expect(result.fields.find(field => field.field === 'skills')?.value).toBe('');
  expect(result.fields.find(field => field.field === 'preferredSkills')?.value).toBe('Java');
});
