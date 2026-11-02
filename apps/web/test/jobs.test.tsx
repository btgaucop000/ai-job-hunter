import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsPanel } from '../src/features/dashboard/JobsPanel';
import {
  cvSkills,
  rankJobs,
  containsSkill,
} from '../src/features/dashboard/jobs-ranking';
import type { AnalysisResponse } from '../src/features/dashboard/analysis.types';
import type { PublicJob } from '../src/features/dashboard/jobs.types';
const job = (id: string, title: string, description: string): PublicJob => ({
  id,
  title,
  company: 'Synthetic company',
  location: 'Synthetic location',
  remote: true,
  source: 'Arbeitnow',
  url: `https://www.arbeitnow.com/jobs/companies/synthetic/${id}`,
  publishedAt: '2026-10-29T00:00:00Z',
  tags: [],
  description,
});
const jobs = [
  job('java', 'Java role', 'Java'),
  job('typescript', 'TypeScript role', 'TypeScript SQL'),
];
const feed = (data = jobs) => ({
  source: 'Arbeitnow',
  sourceUrl: 'https://www.arbeitnow.com/api/job-board-api',
  fetchedAt: '2026-10-30T00:00:00Z',
  jobs: data,
  omittedCount: 0,
  scope: 'Latest feed page',
});
function parsed(text = 'Skills: TypeScript\nSQL'): AnalysisResponse {
  return {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000009',
    outcome: 'PARSED',
    result: null,
    error: null,
    stages: {
      upload: 'SUCCEEDED',
      cv: 'NOT_RUN',
      jd: 'NOT_RUN',
      matching: 'NOT_RUN',
    },
    documents: { cv: { text, facts: null }, jd: null },
  };
}
test('synthetic CV literals affect ordering without aliases, invented experience or negated skills', () => {
  const skills = cvSkills(
    parsed('Skills: TypeScript\nSQL\nNo Python\n\nExperience\nJava'),
  );
  expect(skills.map((s) => s.name)).toEqual(['TypeScript', 'SQL']);
  expect(rankJobs(jobs, skills)[0]!.job.id).toBe('typescript');
  expect(containsSkill('JavaScript', 'Java')).toBe(false);
  expect(containsSkill('NoSQL', 'SQL')).toBe(false);
  expect(cvSkills(parsed('Experience: TypeScript'))).toEqual([]);
});
test('only source-backed VALID AI skill facts are reused, independently of confirmation', () => {
  const response = parsed('SQL');
  response.documents!.cv!.partial = {
    contractVersion: 'partial-v1',
    kind: 'cv',
    generationError: null,
    rejectedCandidateCount: 0,
    fields: {
      skills: [
        {
          status: 'VALID',
          value: 'SQL',
          reason: null,
          evidence: {
            segmentId: 'synthetic',
            quote: 'SQL',
            start: 0,
            end: 3,
            valueStart: 0,
            valueEnd: 3,
          },
        },
        {
          status: 'NEEDS_REVIEW',
          value: 'Java',
          reason: 'VALUE_UNSUPPORTED',
          evidence: null,
        },
      ],
    },
  };
  expect(cvSkills(response).map((s) => s.name)).toEqual(['SQL']);
});
test('preserved legacy panel displays actual-source-shaped listings and safe original links', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/v1/jobs') return Response.json(feed());
      throw Error('No other request allowed');
    }),
  );
  render(<JobsPanel analysis={null} />);
  expect(
    await screen.findByRole('link', { name: 'Java role' }),
  ).toHaveAttribute('href', jobs[0]!.url);
  expect(screen.getByText(/Not personalized:/)).toBeInTheDocument();
  expect(screen.getByText(/primarily Germany\/Europe/)).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Use CV to find jobs' }),
  ).toBeInTheDocument();
});
test('CV-only upload orders jobs and never sends a JD or AI request', async () => {
  const fetch = vi.fn(async (url: string, _options?: RequestInit) => {
    void _options;
    if (url === '/api/v1/jobs') return Response.json(feed());
    if (url === '/api/v1/analyses?mode=cv-only') return Response.json(parsed());
    throw Error('Unauthorized endpoint');
  });
  vi.stubGlobal('fetch', fetch);
  render(<JobsPanel analysis={null} />);
  await screen.findByRole('link', { name: 'Java role' });
  await userEvent.upload(
    screen.getByLabelText('CV for job discovery (PDF or DOCX)'),
    new File(['synthetic'], 'synthetic.pdf', { type: 'application/pdf' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Use CV to find jobs' }),
  );
  await screen.findByText(/CV terms used for ordering:/);
  const list = screen.getByRole('list', { name: 'Job listings' });
  expect(within(list).getAllByRole('heading')[0]).toHaveTextContent(
    'TypeScript role',
  );
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    '/api/v1/jobs',
    '/api/v1/analyses?mode=cv-only',
  ]);
  const options = (fetch.mock.calls[1] as unknown as [string, RequestInit])[1];
  expect((options.body as FormData).has('jdText')).toBe(false);
  expect((options.body as FormData).has('cv')).toBe(true);
});
test.each(['empty', 'error'])(
  'job %s state never substitutes fake listings',
  async (mode) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        mode === 'empty'
          ? Response.json(feed([]))
          : new Response('', { status: 503 }),
      ),
    );
    render(<JobsPanel analysis={null} />);
    await screen.findByText(
      mode === 'empty' ? /returned no job listings/ : /Could not retrieve jobs/,
    );
    expect(
      screen.queryByRole('link', { name: 'Java role' }),
    ).not.toBeInTheDocument();
  },
);
test('bad CV upload leaves real jobs available without personalization', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(feed())),
  );
  render(<JobsPanel analysis={null} />);
  await screen.findByRole('link', { name: 'Java role' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Use CV to find jobs' }),
  );
  expect(screen.getByText(/Choose exactly one/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Java role' })).toBeInTheDocument();
  fireEvent.change(
    screen.getByLabelText('CV for job discovery (PDF or DOCX)'),
    { target: { files: [] } },
  );
});
