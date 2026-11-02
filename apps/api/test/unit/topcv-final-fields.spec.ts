import { candidateExperience } from '../../src/opportunities/job-import.experience.js';
import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { mergeCandidates, validateImportReview, type ImportCandidate } from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
import { importTopcvPage } from '../../src/opportunities/topcv-page-import.js';
const alternatives = 'Thành thạo ít nhất một trong các công nghệ: SOAP/RESTful Web Services, WebSocket, Spring Framework, TypeScript, HTML5/CSS.';
const telecom = 'Ưu tiên có kiến thức hay từng tham gia dự án liên quan đến lĩnh vực viễn thông.';
const containers = 'Ưu tiên có kiến thức và kinh nghiệm triển khai container, K8S, Microservice là một lợi thế.';
const jd = `Dự án MVNO\nYêu cầu ứng viên\nCó ít nhất 03 năm kinh nghiệm Java Developer hoặc tương đương.\n${alternatives}\nKinh nghiệm SQL/NoSQL databases.\nOOP, data structures, algorithms, design patterns, Git và Jira.\n${telecom}\n${containers}\nExperience: 36 months`;
const candidate = (field: ImportCandidate['field'], value: string, quote = value): ImportCandidate => ({ field, value, quote, source: 'post' });
const values = (fields: ReturnType<typeof mergeCandidates>['fields']) => Object.fromEntries(fields.map(field => [field.field, field.value]));
test('synthetic provider omissions/misclassification retain preferred telecom/container qualifications and OR requirement', async () => {
  const ai = { generateStructured: jest.fn(async (_request: unknown) => ({ candidates: [candidate('skills', 'K8S', containers), candidate('skills', 'TypeScript', alternatives), candidate('experience', '3', '3')] })) };
  const response = await new JobImportService(ai as unknown as AiService).extract({ record: { postText: jd } });
  expect(response.error).toBeNull();
  const result = values(response.fields);
  expect(result.preferredSkills).toContain('viễn thông');
  for (const term of ['container', 'K8S', 'Microservice']) { expect(result.preferredSkills).toContain(term); expect(result.skills).not.toContain(term); }
  expect(result.skills!.split('\n')).toContain(alternatives);
  expect(result.skills!.split('\n')).not.toContain('TypeScript');
  expect(result.skills!.split('\n')).not.toContain('Spring Framework');
  expect(result.experience).toBe('Minimum 3 years');
  expect(result.domain).toBe('MVNO');
  expect(validateImportReview(response.fields, jd, '')).toEqual(response.fields);
});
test.each([['3 years', '03 năm', '36 months'], ['ít nhất 03 năm', '36 months'], ['3', 'ít nhất 03 năm', '36 months']])('equivalent experience merges with source units and strongest minimum: %s', (...items) => {
  const post = items.map(value => `Experience: ${value}`).join('\n');
  const result = mergeCandidates({ candidates: items.map(value => candidate('experience', value)) }, post, '');
  expect(result.fields.find(field => field.field === 'experience')).toMatchObject({ value: items.some(value => value.includes('ít nhất')) ? 'Minimum 3 years' : '3 years', status: 'SUPPORTED' });
  expect(validateImportReview(result.fields, post, '')).toEqual(result.fields);
});
test('different experience amounts remain blocking and numeric substrings are not treated as unit evidence', () => {
  const text = 'Experience: ít nhất 03 năm\nExperience: 5 years';
  const result = mergeCandidates({ candidates: sourceCandidates(text, '') }, text, '');
  const withModel = mergeCandidates({ candidates: [...sourceCandidates(text, ''), candidate('experience', '5 years')] }, text, '');
  expect(withModel.fields.find(field => field.field === 'experience')?.status).toBe('CONFLICT');
  expect(() => validateImportReview(withModel.fields, text, '')).toThrow('Review every conflicting');
  expect(result.fields.find(field => field.field === 'experience')?.status).toBe('CONFLICT');
  expect(candidateExperience('3', '36 months')).toBeNull();
});
test.each([
  [{ jobLocationType: 'TELECOMMUTE' }, '', 'Remote'],
  [{ workMode: 'Hybrid' }, '', 'Hybrid'],
  [{}, 'Onsite', 'Onsite'],
  [{}, 'Toàn thời gian', ''],
  [{}, '', ''],
])('Work Mode imports only explicit source evidence: %j', (metadata, visibleMode, expected) => {
  const result = importTopcvPage({ version: 1, sourceUrl: 'https://www.topcv.vn/viec-lam/synthetic/123.html', jobPosting: { '@type': 'JobPosting', description: '<p>Java Developer in Hà Nội</p>', ...metadata }, visibleText: '', salaryText: '', workModeText: visibleMode });
  expect(result.workMode).toBe(expected);
  expect(result.sourceText.includes('Work mode:')).toBe(Boolean(expected));
});
test('contradictory explicit Work Modes remain source evidence for review', () => {
  const result = importTopcvPage({ version: 1, sourceUrl: 'https://topcv.vn/viec-lam/synthetic/123.html', jobPosting: { '@type': 'JobPosting', description: 'Synthetic JD', jobLocationType: 'TELECOMMUTE' }, visibleText: '', salaryText: '', workModeText: 'Onsite' });
  expect(result.workMode).toBe('');
  const reviewed = mergeCandidates({ candidates: sourceCandidates(result.sourceText, '') }, result.sourceText, '');
  expect(reviewed.fields.find(field => field.field === 'workMode')?.status).toBe('CONFLICT');
});

test('saved equivalent month-based review remains valid without changing manual experience', () => {
  const post = 'Experience: 36 months';
  const result = mergeCandidates({ candidates: [candidate('experience', '36 months')] }, post, '');
  const old = result.fields.map(field => field.field === 'experience' ? { ...field, value: '36 months' } : field);
  expect(validateImportReview(old, post, '').find(field => field.field === 'experience')).toMatchObject({ value: '3 years', status: 'SUPPORTED' });
});
