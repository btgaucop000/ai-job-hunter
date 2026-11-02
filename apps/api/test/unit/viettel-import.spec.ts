import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import { validateImportReview } from '../../src/opportunities/job-import.contract.js';
// Synthetic wording following the public listing's section structure; not a model capture.
const jd = `Job description
Build frontend and backend services. Design secure, scalable system architecture.
Your skills and experience
Bachelor's degree in computer science or equivalent.
English qualification: TOEIC 550 / IELTS 5.5 or equivalent (ưu tiên ứng viên có chứng chỉ ngoại ngữ).
Minimum 2 years of experience.
Knowledge of Angular architecture, RxJS, TypeScript, HTML5, CSS3.
Knowledge of Java, Spring Boot, Spring MVC, JPA/Hibernate and RESTful APIs.
Knowledge of system architecture, design patterns, authentication and authorization.
Understanding of Agile/Scrum.
Why you'll love working here
Learning budget and annual bonus.`;
test('complete ITviec requirements reach review with sparse mocked AI; education/language/architecture are retained', async () => {
  const source = parseJobPosting(
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', title: 'Synthetic Fullstack Developer', description: jd.replace(/\n/gu, '<br>'), industry: 'Information Technology' })}</script>`,
    'https://itviec.com/it-jobs/synthetic-viettel',
  ).sourceText;
  const ai = {
    generateStructured: jest.fn<(request: unknown) => Promise<unknown>>(
      async () => ({
        candidates: [],
      }),
    ),
  };
  const result = await new JobImportService(ai as unknown as AiService).extract(
    { record: { postText: source } },
  );
  expect(result.error).toBeNull();
  expect(
    (
      ai.generateStructured.mock.calls[0]![0] as { prompt: string }
    ).prompt.endsWith(JSON.stringify({ post: source, jd: '' })),
  ).toBe(true);
  const required = result.fields.find(
    (field) => field.field === 'skills',
  )!.value;
  for (const term of [
    "Bachelor's degree",
    'TOEIC 550',
    'IELTS 5.5',
    'Angular architecture',
    'RxJS',
    'TypeScript',
    'system architecture',
    'authentication',
    'Agile/Scrum',
  ])
    expect(required).toContain(term);
  expect(required).not.toContain('ưu tiên');
  expect(required).not.toContain('annual bonus');
  expect(result.fields.find((field) => field.field === 'domain')?.value).toBe(
    '',
  );
  expect(validateImportReview(result.fields, source, '')).toEqual(
    result.fields,
  );
});
