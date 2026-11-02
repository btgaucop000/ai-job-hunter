import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import {
  validateImportReview,
  type ImportCandidate,
} from '../../src/opportunities/job-import.contract.js';
const benefits = [
  'Mức lương thỏa thuận khi phỏng vấn.',
  'Thời gian làm việc: 8:00–17:30, thứ Hai đến thứ Sáu.',
  'Địa điểm làm việc: Văn phòng Hà Nội.',
  'Đóng BHXH, BHYT, BHTN đầy đủ.',
  'Nghỉ phép năm và nghỉ lễ.',
  'Du lịch và team building hằng năm.',
  'Ngân sách đào tạo Java.',
];
const preferences = [
  'Ưu tiên Docker, Kubernetes.',
  'Ưu tiên AI tools trong quy trình phát triển.',
];
const source = `Mô tả công việc
Phát triển nền tảng tài chính số.
Yêu cầu ứng viên
Tốt nghiệp đại học ngành máy tính.
TOEIC 550 hoặc IELTS 5.5.
Thành thạo Java, Spring Boot, RESTful API.
Có kinh nghiệm với Kafka hoặc RabbitMQ.
${preferences.join('\n')}
Quyền lợi được hưởng
${benefits.join('\n')}`;
async function extract(text: string, candidates: ImportCandidate[] = []) {
  const ai = { generateStructured: jest.fn(async () => ({ candidates })) };
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: text } },
  );
  expect(result.error).toBeNull();
  expect(validateImportReview(result.fields, text, '')).toEqual(result.fields);
  return {
    ...result,
    fieldsByName: Object.fromEntries(
      result.fields.map((field) => [field.field, field]),
    ),
  };
}
test('Vietnamese benefits boundary stops deterministic recovery without losing qualifications, domain or negotiable salary', async () => {
  const { fieldsByName: fields } = await extract(source);
  for (const term of [
    'Java',
    'Spring Boot',
    'RESTful API',
    'Kafka OR RabbitMQ',
    'đại học',
    'TOEIC 550',
  ])
    expect(fields.skills!.value).toContain(term);
  for (const term of [
    'Mức lương',
    'Thời gian làm việc',
    'Địa điểm',
    'BHXH',
    'Nghỉ phép',
    'team building',
    'Ngân sách đào tạo',
  ]) {
    expect(fields.skills!.value).not.toContain(term);
    expect(fields.preferredSkills!.value).not.toContain(term);
  }
  expect(fields.salary!.value).toBe('Negotiable');
  expect(fields.domain!.value).toContain('tài chính số');
});
test('verbatim model-proposed benefits are rejected semantically from both skill fields', async () => {
  const candidates: ImportCandidate[] = benefits.map((value, index) => ({
    field: index % 2 ? 'preferredSkills' : 'skills',
    value,
    quote: value,
    source: 'post',
  }));
  candidates.push({
    field: 'skills',
    value: benefits.join('\n'),
    quote: benefits.join('\n'),
    source: 'post',
  });
  const result = await extract(source, candidates);
  expect(result.rejected).toBeGreaterThanOrEqual(candidates.length);
  for (const field of ['skills', 'preferredSkills'])
    expect(
      result.fieldsByName[field]!.candidates.some((candidate) =>
        benefits.includes(candidate.quote),
      ),
    ).toBe(false);
});
test('simple proficiency lists are concise; multiline preferred aggregates and individual proposals reconcile once', async () => {
  const result = await extract(source, [
    {
      field: 'preferredSkills',
      value: preferences.join('\n'),
      quote: preferences.join('\n'),
      source: 'post',
    },
    {
      field: 'preferredSkills',
      value: 'Docker',
      quote: preferences[0]!,
      source: 'post',
    },
    {
      field: 'preferredSkills',
      value: 'AI tools',
      quote: preferences[1]!,
      source: 'post',
    },
  ]);
  expect(result.fieldsByName.skills!.value.split('\n')).toEqual(
    expect.arrayContaining(['Java', 'Spring Boot', 'RESTful API']),
  );
  const preferred = result.fieldsByName.preferredSkills!.value.split('\n');
  expect(preferred.filter((line) => line.includes('Docker'))).toHaveLength(1);
  expect(preferred.filter((line) => line.includes('AI tools'))).toHaveLength(1);
  expect(
    result.fieldsByName
      .skills!.value.split('\n')
      .some((line) => line === 'Kafka' || line === 'RabbitMQ'),
  ).toBe(false);
});
test('formatting variants and mixed sections retain explicit real requirements, including unfamiliar technologies', async () => {
  const text =
    '## 1) Yêu cầu ứng viên:\nỨng viên cần thành thạo Rust.\n## 2) Quyền lợi được hưởng:\nĐược đào tạo Java.\nBắt buộc có kinh nghiệm phát triển hệ thống bảo hiểm.\n## 3) Điểm cộng:\nCó kinh nghiệm Kubernetes.';
  const result = await extract(text, [
    {
      field: 'skills',
      value: 'Rust',
      quote: 'Ứng viên cần thành thạo Rust.',
      source: 'post',
    },
  ]);
  expect(result.fieldsByName.skills!.value).toContain('Rust');
  expect(result.fieldsByName.skills!.value).toContain(
    'phát triển hệ thống bảo hiểm',
  );
  expect(result.fieldsByName.skills!.value).not.toContain('Được đào tạo');
  expect(result.fieldsByName.preferredSkills!.value).toContain('Kubernetes');
});
