import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { importTopcvPage } from '../../src/opportunities/topcv-page-import.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
import { sourceCandidates } from '../../src/opportunities/job-import.evidence.js';
const responsibilities =
  'Key Responsibilities\nBuild financial services digital channels.\nGlobal collaboration on high-traffic systems.';
const requirements =
  'Yêu cầu công việc\nMinimum 5 years experience using Java Full Stack.\nJava, Spring, Spring Boot\nJavaScript, HTML5, CSS; at least one of React, Vue, Angular\nRESTful API and RDBMS\nMandatory business English, TOEIC 700+\nMicroservices, AWS/Azure/GCP, CI/CD\nProjects in Financial Services and Insurance\nNice to have\nK8S';
const full = `${responsibilities}\n\n${requirements}`;
const input = () => ({
  version: 1,
  sourceUrl: 'https://www.vietnamworks.com/synthetic-java-123456-123-jv',
  jobPosting: {
    '@type': 'JobPosting',
    title: 'Synthetic Java Full Stack Engineer',
    description: responsibilities,
    skills: ['Java Swing'],
    industry: 'Hệ thống CNTT & Thiết bị',
    baseSalary: {
      currency: 'USD',
      value: {
        minValue: 1000,
        maxValue: 9999,
        unitText: 'HOUR',
        value: 'Thương lượng',
      },
    },
  },
  visibleText: full,
  salaryText: 'Thương lượng',
});
test('visible job sections replace partial JSON-LD, retaining source order and bullet lines', () => {
  const result = importTopcvPage(input());
  expect(result.description).toContain(full.replace(/\n\n/g, '\n'));
  expect(result.description.indexOf('Key Responsibilities')).toBeLessThan(
    result.description.indexOf('Yêu cầu công việc'),
  );
  expect(result.description.match(/Key Responsibilities/g)).toHaveLength(1);
  for (const line of requirements.split('\n'))
    expect(result.description).toContain(line);
  expect(result.importWarnings.join(' ')).not.toContain('Requirements section');
  expect(result.title).toBe('Synthetic Java Full Stack Engineer');
});
test('partial import is explicitly marked incomplete instead of silently implying a full JD', () => {
  const result = importTopcvPage({
    ...input(),
    visibleText: '',
    salaryText: '',
  });
  expect(result.importWarnings.join(' ')).toContain(
    'Requirements section was not captured',
  );
});
test('metadata-only Java Swing cannot become mandatory; genuine JD requirements and business domains survive', async () => {
  const imported = importTopcvPage(input());
  expect(imported.description).not.toContain('Required skills:\nJava Swing');
  expect(imported.sourceText).toContain(
    'Supplemental skill tags (not requirements): ["Java Swing"]',
  );
  const ai = {
    generateStructured: jest.fn<(request: unknown) => Promise<unknown>>(
      async () => ({
        candidates: [
          {
            field: 'skills',
            value: 'Java Swing',
            source: 'post',
            quote: 'Supplemental skill tags (not requirements): ["Java Swing"]',
          },
          { field: 'salary', value: '9999', source: 'post', quote: '9999' },
          {
            field: 'domain',
            value: 'Hệ thống CNTT',
            source: 'post',
            quote: 'Hệ thống CNTT & Thiết bị',
          },
        ],
      }),
    ),
  };
  const response = await new JobImportService(
    ai as unknown as AiService,
  ).extract({ record: { postText: imported.sourceText } });
  expect(response.error).toBeNull();
  const fields = Object.fromEntries(
    response.fields.map((field) => [field.field, field.value]),
  );
  expect(fields.skills).not.toContain('Java Swing');
  expect(fields.skills).toContain('Spring Boot');
  expect(fields.skills).toContain('at least one of React, Vue, Angular');
  expect(fields.preferredSkills).toContain('K8S');
  // Review preserves the explicit negotiable disclosure, never its numeric placeholder.
  expect(fields.salary).toBe('Negotiable');
  expect(fields.salary).not.toContain('9999');
  expect(
    response.fields
      .find((field) => field.field === 'salary')
      ?.candidates.every((candidate) =>
        imported.sourceText.includes(candidate.quote),
      ),
  ).toBe(true);
  expect(fields.domain).toBe('Financial Services, Insurance');
  expect(
    validateImportReview(response.fields, imported.sourceText, ''),
  ).toEqual(response.fields);
});
test('actual required Java Swing remains valid when it appears in qualification text', () => {
  const text =
    'Requirements\nRequired skills: Java Swing\nSupplemental skill tags (not requirements): ["Java Swing"]';
  const merged = mergeCandidates(
    {
      candidates: [
        {
          field: 'skills',
          value: 'Java Swing',
          source: 'post',
          quote: 'Required skills: Java Swing',
        },
        ...sourceCandidates(text, ''),
      ],
    },
    text,
    '',
  );
  expect(
    merged.fields.find((field) => field.field === 'skills')?.value,
  ).toContain('Java Swing');
});
test('negotiable salary ignores inconsistent numeric USD/hour placeholders but preserves audit evidence', () => {
  const result = importTopcvPage(input());
  expect(result.salary).toBe('');
  expect(result.salaryDetails).toBeNull();
  expect(result.sourceText).toContain('Salary disclosure: Thương lượng');
  expect(result.sourceText).toContain(
    'Ignored salary placeholders (not compensation):',
  );
  expect(result.importWarnings.join(' ')).toContain('Salary is negotiable');
});

test('explicit financial-services/insurance digital-channel work is business context, not generic IT taxonomy', () => {
  const text =
    'Build digital channels for Financial Services and Insurance.\nSource industry: Hệ thống CNTT & Thiết bị';
  const result = mergeCandidates(
    { candidates: sourceCandidates(text, '') },
    text,
    '',
  );
  expect(result.fields.find((field) => field.field === 'domain')).toMatchObject(
    { value: 'Financial Services, Insurance', status: 'SUPPORTED' },
  );
});

test('confirmed expanded DOM payload retains both browser acceptance phrases through API normalization', () => {
  const description =
    'Mô tả công việc\nKey Responsibilities\n- Design and develop Digital Distribution Channels';
  const qualification =
    'Yêu cầu công việc\n- 5 years of experience in Java Full Stack development\n- Business English, TOEIC 700+';
  const result = importTopcvPage({
    ...input(),
    jobPosting: {
      ...input().jobPosting,
      description: '<p>- Design and develop Digital Distribution Channels</p>',
    },
    visibleText: `${description}\n\n${qualification}`,
  });
  for (const phrase of [
    'Design and develop Digital Distribution Channels',
    '5 years of experience in Java Full Stack development',
  ]) {
    expect(result.description).toContain(phrase);
    expect(result.sourceText).toContain(phrase);
  }
  expect(result.description.indexOf('Mô tả công việc')).toBeLessThan(
    result.description.indexOf('Yêu cầu công việc'),
  );
  expect(result.importWarnings.join(' ')).not.toContain(
    'Requirements section was not captured',
  );
});
