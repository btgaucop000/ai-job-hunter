import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import type { AiService } from '../../src/ai/ai.service.js';
import { JobImportService } from '../../src/opportunities/job-import.service.js';
import {
  mergeCandidates,
  validateImportReview,
} from '../../src/opportunities/job-import.contract.js';
import { parseJobPosting } from '../../src/opportunities/job-url-import.js';
import {
  banking,
  digitalFinance,
  propertyPlatform,
} from '../support/job-quality.synthetic.js';
async function extract(source: string, candidates: unknown[] = []) {
  const ai = {
    generateStructured: jest.fn<(request: unknown) => Promise<unknown>>(
      async () => ({ candidates }),
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
  expect(validateImportReview(result.fields, source, '')).toEqual(
    result.fields,
  );
  return Object.fromEntries(result.fields.map((field) => [field.field, field]));
}
test('Vietnamese preferred section governs ordinary competency verbs; separate AI section uses its own wording', async () => {
  const fields = await extract(propertyPlatform, [
    {
      field: 'skills',
      value: 'Kubernetes',
      source: 'post',
      quote: 'Có kinh nghiệm Kubernetes.',
    },
    {
      field: 'skills',
      value: 'CI/CD',
      source: 'post',
      quote: 'Có kinh nghiệm CI/CD với GitLab CI, Jenkins hoặc tương đương.',
    },
  ]);
  for (const word of [
    'Java 11/17+',
    'Spring Security',
    'Spring Data JPA/Hibernate',
    'RESTful APIs',
    'Event-driven',
    'MySQL/PostgreSQL',
    'Redis',
    'Kafka OR RabbitMQ',
    'SOLID',
    'Clean Architecture',
    'Docker',
    'AI/LLM APIs',
  ])
    expect(fields.skills!.value).toContain(word);
  for (const word of [
    'Kubernetes',
    'AWS, Azure OR GCP',
    'Elasticsearch/OpenSearch',
    'Grafana OR ELK',
    'CI/CD',
    'High Concurrency',
    'AI/LLM integration experience',
  ]) {
    expect(fields.preferredSkills!.value).toContain(word);
    expect(fields.skills!.value).not.toContain(word);
  }
  expect(fields.domain!.value).toBe('real-estate');
  expect(fields.domain!.value).not.toContain('FinTech');
  expect(fields.salary!.value).toBe('Negotiable');
  expect(
    fields.salary!.candidates.every(
      (candidate) => !candidate.quote.startsWith('Ignored salary'),
    ),
  ).toBe(true);
});
test('backend requirements are complete, grouped database/message alternatives remain intact, numeric salary preserved', async () => {
  const fields = await extract(banking);
  for (const term of [
    'Java Core',
    'Struts',
    'Hibernate',
    'MySQL, Oracle, SQL Server',
    'SOAP/RESTful',
    'JSON',
    'XML',
    'Web Server',
    'Windows/Linux',
    'source control',
    'Agile',
    'Waterfall',
    'Kanban',
  ])
    expect(fields.skills!.value).toContain(term);
  for (const term of [
    'Redis OR Memcached',
    'RabbitMQ OR ActiveMQ',
    'spoken English',
  ]) {
    expect(fields.preferredSkills!.value).toContain(term);
    expect(fields.skills!.value).not.toContain(term);
  }
  expect(fields.domain!.value).toMatch(/financial.*banking/iu);
  expect(fields.salary!.value).toBe('15000000-25000000 VND per MONTH');
});
test('degree/institution/metadata cannot invent telecom skills; direct business purpose supplies domain', async () => {
  const fields = await extract(digitalFinance, [
    {
      field: 'preferredSkills',
      value: 'Viễn thông',
      source: 'post',
      quote: 'Đặc biệt ưu tiên trường Học viện Công nghệ Viễn thông.',
    },
    {
      field: 'skills',
      value: 'Java',
      source: 'post',
      quote: 'Có từ 03 năm kinh nghiệm Java trở lên.',
    },
    {
      field: 'skills',
      value: 'MetadataOnlySkill',
      source: 'post',
      quote:
        'Supplemental skill tags (not requirements): Viễn thông, MetadataOnlySkill',
    },
  ]);
  expect(
    fields.preferredSkills!.candidates.some(
      (candidate) => candidate.value.toLowerCase() === 'viễn thông',
    ),
  ).toBe(false);
  expect(fields.skills!.value.split('\n')).not.toContain('Java');
  for (const term of [
    'Java Core',
    'Java EE/Spring/Struts/Hibernate',
    'Data Structures',
    'PL/SQL',
    'Oracle/MySQL',
    'NoSQL',
  ])
    expect(fields.skills!.value).toContain(term);
  for (const term of ['Microservices', 'AI tools', 'tích hợp sản phẩm AI'])
    expect(fields.preferredSkills!.value).toContain(term);
  expect(fields.domain!.value).toContain('tài chính số');
  expect(fields.domain!.value).toContain('thanh toán');
  expect(fields.salary!.value).toBe('Negotiable');
});
test('unsupported names and placeholder-only salary evidence stay unknown', async () => {
  const fields = await extract(
    'Company: MetadataOnlySkill\nIgnored salary placeholders (not compensation): {"currency":"USD","value":{"value":"Thương lượng","unitText":"HOUR"}}',
    [
      {
        field: 'skills',
        value: 'MetadataOnlySkill',
        source: 'post',
        quote: 'Company: MetadataOnlySkill',
      },
      {
        field: 'salary',
        value: 'Thương lượng',
        source: 'post',
        quote:
          'Ignored salary placeholders (not compensation): {"currency":"USD","value":{"value":"Thương lượng","unitText":"HOUR"}}',
      },
    ],
  );
  expect(fields.skills!.value).toBe('');
  expect(fields.salary!.value).toBe('');
  expect(fields.domain!.value).toBe('');
});
function locations(values: string[]) {
  const post = values.map((value) => `Location: ${value}`).join('\n');
  return {
    post,
    ...mergeCandidates(
      {
        candidates: values.map((value) => ({
          field: 'location',
          value,
          source: 'post',
          quote: `Location: ${value}`,
        })),
      },
      post,
      '',
    ),
  };
}
test('ambiguous two-city address remains reviewable, with both cities retained in evidence', () => {
  const full =
    'TechnoPark Tower, Ocean Park, Gia Lâm, Hanoi, Việt Nam, Hồ Chí Minh, Hồ Chí Minh, VN';
  expect(
    locations([full]).fields.find((field) => field.field === 'location')
      ?.status,
  ).toBe('CONFLICT');
  const result = locations([full, 'TechnoPark Tower, Hanoi']);
  const field = result.fields.find((field) => field.field === 'location')!;
  expect(field.status).toBe('CONFLICT');
  expect(field.candidates[0]!.value).toBe(full);
  expect(() => validateImportReview(result.fields, result.post, '')).toThrow(
    'Review every conflicting',
  );
});
test('structured multi-location list preserves both offices and accepts shorter supported descriptions', () => {
  const address = [
    {
      address: {
        streetAddress: 'Synthetic Hanoi Tower',
        addressLocality: 'Hanoi',
        addressCountry: 'VN',
      },
    },
    {
      address: {
        streetAddress: 'Synthetic HCM Office',
        addressLocality: 'Hồ Chí Minh',
        addressCountry: 'VN',
      },
    },
  ];
  const parsed = parseJobPosting(
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'JobPosting', description: 'Synthetic JD', jobLocation: address })}</script>`,
    'https://www.vietnamworks.com/synthetic-jv',
  );
  expect(parsed.location).toContain('; ');
  const field = locations([parsed.location, 'Hanoi; Hồ Chí Minh']).fields.find(
    (field) => field.field === 'location',
  )!;
  expect(field.status).toBe('SUPPORTED');
  expect(field.value).toBe(parsed.location);
  expect(
    locations([
      'Anna Building, Quận 12, Hồ Chí Minh, VN',
      'Quận 12',
    ]).fields.find((field) => field.field === 'location')?.status,
  ).toBe('SUPPORTED');
  expect(
    locations(['Hanoi', 'Hồ Chí Minh']).fields.find(
      (field) => field.field === 'location',
    )?.status,
  ).toBe('CONFLICT');
});

test('preferred candidate background alone cannot establish the project domain', async () => {
  const fields = await extract(
    'Yêu cầu ứng viên\nJava Core.\nĐiểm cộng\nCó kinh nghiệm trong FinTech, CRM, Marketplace hoặc E-commerce.',
  );
  expect(fields.domain!.value).toBe('');
  expect(fields.preferredSkills!.value).toContain('FinTech');
});
test('working environments are not misclassified as educational institutions', async () => {
  const fields = await extract(
    'Yêu cầu ứng viên\nCó kinh nghiệm trong môi trường Windows/Linux.',
  );
  expect(fields.skills!.value).toContain('Windows/Linux');
});
test('historical literal Vietnamese alternatives remain saveable with verified evidence', () => {
  const source = 'Yêu cầu ứng viên\nKafka hoặc RabbitMQ.';
  const review = mergeCandidates(
    {
      candidates: [
        {
          field: 'skills',
          value: 'Kafka hoặc RabbitMQ',
          source: 'post',
          quote: 'Kafka hoặc RabbitMQ.',
        },
      ],
    },
    source,
    '',
  ).fields;
  const old = review.map((field) =>
    ['skills', 'preferredSkills'].includes(field.field)
      ? { ...field, value: field.value.replace(/OR/gu, 'hoặc') }
      : field,
  );
  expect(
    validateImportReview(old, source, '').find(
      (field) => field.field === 'skills',
    )?.value,
  ).toBe(old.find((field) => field.field === 'skills')?.value);
});

test('historical grounded negotiable wording remains saveable without altering saved values', () => {
  const source = 'Salary disclosure: Thương lượng (Negotiable; amount unknown)';
  const review = mergeCandidates(
    {
      candidates: [
        {
          field: 'salary',
          value: 'Thương lượng',
          source: 'post',
          quote: source,
        },
      ],
    },
    source,
    '',
  ).fields;
  const old = review.map((field) =>
    field.field === 'salary' ? { ...field, value: 'Thương lượng' } : field,
  );
  expect(
    validateImportReview(old, source, '').find(
      (field) => field.field === 'salary',
    )?.value,
  ).toBe('Thương lượng');
});

test('business-like employer names do not establish a domain', async () => {
  const fields = await extract(
    'Company: FinTechCorp\nResponsibilities\nDevelop APIs for FinTechCorp products.\nYêu cầu ứng viên\nJava Core.',
  );
  expect(fields.domain!.value).toBe('');
});
test('malformed review display values are rejected before normalization', () => {
  const source = 'Yêu cầu ứng viên\nKafka hoặc RabbitMQ.';
  const review = mergeCandidates(
    {
      candidates: [
        {
          field: 'skills',
          value: 'Kafka hoặc RabbitMQ',
          source: 'post',
          quote: source,
        },
      ],
    },
    source,
    '',
  ).fields;
  const malformed = review.map((field) =>
    field.field === 'skills' ? { ...field, value: 42 } : field,
  );
  expect(() => validateImportReview(malformed, source, '')).toThrow(
    'Invalid import review',
  );
});
