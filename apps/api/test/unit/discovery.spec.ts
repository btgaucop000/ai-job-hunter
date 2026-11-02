import { expect, jest, test } from '@jest/globals';
import {
  duplicateJob,
  rankJob,
  validateFilters,
  type DiscoveryFilters,
  type DiscoveredJob,
} from '../../src/discovery/discovery.js';
import {
  DISCOVERY_SOURCES,
  GreenhouseSource,
  normalizeGreenhouse,
} from '../../src/discovery/greenhouse.source.js';
import { DiscoveryService } from '../../src/discovery/discovery.service.js';
import type { OpportunitiesService } from '../../src/opportunities/opportunities.service.js';
const filters: DiscoveryFilters = {
  location: 'Ho Chi Minh City',
  stacks: ['Java', 'Spring Boot', 'Node.js', 'React'],
  workMode: 'All',
  seniority: 'Senior',
};
const raw = {
  id: 100,
  title: 'Senior Backend Developer',
  company_name: 'Synthetic Company',
  location: { name: 'Ho Chi Minh City, Vietnam' },
  absolute_url: 'https://job-boards.greenhouse.io/synthetic/jobs/100',
  content:
    '&lt;p&gt;Required Java and Spring Boot.&lt;/p&gt;&lt;p&gt;Hybrid work schedule.&lt;/p&gt;',
};
const normalized = () =>
  normalizeGreenhouse(
    { jobs: [raw] },
    DISCOVERY_SOURCES[0],
    '2026-10-30T00:00:00.000Z',
  ).jobs[0]!;
test('normalizes source-backed fields, decodes HTML safely and preserves attribution', () => {
  expect(normalized()).toMatchObject({
    title: raw.title,
    company: raw.company_name,
    location: raw.location.name,
    skills: 'Required Java and Spring Boot.',
    workMode: 'Hybrid',
    seniority: 'Senior',
    description: 'Required Java and Spring Boot.\nHybrid work schedule.',
    discovery: {
      sourceName: DISCOVERY_SOURCES[0].name,
      sourceJobId: '100',
      discoveredAt: '2026-10-30T00:00:00.000Z',
    },
  });
});
test('unknown values stay empty and malformed or unsafe source rows are omitted', () => {
  const result = normalizeGreenhouse(
    {
      jobs: [
        {
          ...raw,
          company_name: null,
          location: {},
          title: 'Backend Developer',
          content: '<p>Experience with React.</p>',
        },
        { ...raw, absolute_url: 'http://127.0.0.1/private' },
      ],
    },
    DISCOVERY_SOURCES[0],
    '2026-10-30',
  );
  expect(result.invalid).toBe(1);
  expect(result.jobs[0]).toMatchObject({
    company: '',
    location: '',
    workMode: '',
    seniority: '',
  });
});
test('stack filters use OR and recognize Spring Boot and Node.js backend equivalents', () => {
  for (const description of [
    'Spring Boot',
    'NodeJS backend',
    'Node.js backend',
    'React',
  ])
    expect(
      rankJob({ ...normalized(), skills: '', description }, filters),
    ).not.toBeNull();
  expect(
    rankJob(
      {
        ...normalized(),
        title: 'JavaScript developer',
        skills: '',
        description: 'JavaScript only',
      },
      { ...filters, stacks: ['Java'] },
    ),
  ).toBeNull();
  expect(
    rankJob({ ...normalized(), skills: '', description: 'Rust only' }, filters),
  ).toBeNull();
});
test('ranks HCMC onsite/hybrid and senior/technical leads ahead without dropping unknown or remote jobs', () => {
  const base = normalized();
  const unknown = { ...base, location: '', workMode: '', seniority: '' };
  expect(rankJob(unknown, filters)).not.toBeNull();
  expect(rankJob({ ...unknown, workMode: 'Remote' }, filters)).not.toBeNull();
  expect(rankJob(base, filters)!).toBeGreaterThan(rankJob(unknown, filters)!);
  expect(rankJob({ ...base, seniority: 'Technical Lead' }, filters)).toBe(
    rankJob(base, filters),
  );
  expect(
    rankJob(
      { ...base, location: 'London, United Kingdom', workMode: 'Onsite' },
      filters,
    ),
  ).toBeNull();
});
test('rejects unsupported filters instead of pretending the API supports them', () => {
  expect(() => validateFilters({ ...filters, stacks: [] })).toThrow();
  expect(() => validateFilters({ ...filters, salary: 100 })).toThrow();
});
test('deduplicates tracked URLs, equivalent HCMC identities, and source IDs after manual edits', () => {
  const job = normalized();
  expect(
    duplicateJob(job, {
      ...job,
      originalLink: `${job.originalLink}?utm_source=test#apply`,
    }),
  ).toBe(true);
  expect(
    duplicateJob(job, {
      ...job,
      discovery: null,
      originalLink: 'https://example.com/other-source',
      location: 'HCMC',
    }),
  ).toBe(true);
  expect(
    duplicateJob(job, {
      ...job,
      title: 'Manually corrected title',
      originalLink: 'https://example.com/edited',
    }),
  ).toBe(true);
  expect(
    duplicateJob(job, {
      ...job,
      discovery: null,
      originalLink: 'https://example.com/other',
      company: 'Another Company',
    }),
  ).toBe(false);
});
test('source failure is reported while the other feed can still import', async () => {
  const source = {
    read: jest
      .fn<(value: { name: string }) => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('private internal error'))
      .mockResolvedValueOnce({ jobs: [raw] }),
  };
  const jobs = {
    importDiscovered: jest
      .fn<(rows: DiscoveredJob[]) => Promise<unknown>>()
      .mockResolvedValue({
        imported: 1,
        duplicatesSkipped: 0,
        remaining: 0,
        importedIds: ['synthetic'],
      }),
  };
  const result = await new DiscoveryService(
    source as unknown as GreenhouseSource,
    jobs as unknown as OpportunitiesService,
  ).discover(filters);
  expect(result).toMatchObject({ found: 1, imported: 1 });
  expect(result.errors[0]).toContain('feed unavailable');
  expect(result.errors.join()).not.toContain('private internal error');
  expect(jobs.importDiscovered.mock.calls[0]![0][0]!.discovery.sourceName).toBe(
    DISCOVERY_SOURCES[1].name,
  );
});
test('feed cache and 429 Retry-After prevent repeated network requests', async () => {
  const original = globalThis.fetch;
  const fetch = jest
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ jobs: [raw] }))
    .mockResolvedValueOnce(
      new Response('', { status: 429, headers: { 'Retry-After': '600' } }),
    );
  globalThis.fetch = fetch;
  try {
    const source = new GreenhouseSource();
    await source.read(DISCOVERY_SOURCES[0]);
    await source.read(DISCOVERY_SOURCES[0]);
    await expect(source.read(DISCOVERY_SOURCES[1])).rejects.toThrow();
    await expect(source.read(DISCOVERY_SOURCES[1])).rejects.toThrow('cooldown');
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    globalThis.fetch = original;
  }
});

test('technology mentions do not silently become mandatory skills', () => {
  const decoded = normalizeGreenhouse(
    {
      jobs: [
        {
          ...raw,
          title: 'Backend Developer',
          content:
            '<p>Our products use React.</p><p>Experience with Java is required.</p><p>Spring Boot is a nice to have.</p><p>We build hybrid cloud products.</p>',
        },
      ],
    },
    DISCOVERY_SOURCES[0],
    '2026-10-30',
  );
  expect(decoded.jobs[0]).toMatchObject({
    skills: 'Experience with Java is required.',
    preferredSkills: 'Spring Boot is a nice to have.',
    workMode: '',
    discovery: { techStack: ['Java', 'Spring Boot', 'React'] },
  });
});
