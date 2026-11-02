import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { JobEditor } from '../src/features/inbox/JobEditor';
import {
  emptyOpportunity,
  jobUrlInfo,
} from '../src/features/inbox/opportunities-api';
import {
  applyUrlJobPreview,
  canFetchJobUrl,
  type UrlJobPreview,
} from '../src/features/inbox/job-url-import';
const preview: UrlJobPreview = {
  title: 'Synthetic backend engineer',
  company: 'Synthetic company',
  location: 'HCMC',
  originalLink: 'https://www.topcv.vn/viec-lam/synthetic',
  platform: 'TopCV',
  description: 'Build Java services',
  sourceText: 'Job title: Synthetic backend engineer\nBuild Java services',
  validThrough: null,
  expired: false,
};
test('fixture import populates editable fields and provides text for existing extraction', () => {
  const form = applyUrlJobPreview(emptyOpportunity(), preview, new Set());
  expect(form).toMatchObject({
    title: preview.title,
    company: preview.company,
    description: preview.description,
    originalLink: preview.originalLink,
    postText: preview.sourceText,
    source: 'Website',
  });
  expect(jobUrlInfo(form.originalLink).platform).toBe('TopCV');
});
test('preserves user fields, contacts, tracker and original sources, including intentional blanks', () => {
  const form = {
    ...emptyOpportunity(),
    title: 'User title',
    contactNotes: 'User contact',
    notes: 'User notes',
    postText: 'Original post',
    status: 'INTERVIEW' as const,
    contactDates: ['2026-10-30'],
  };
  const next = applyUrlJobPreview(form, preview, new Set(['company']));
  expect(next).toMatchObject({
    title: form.title,
    company: '',
    contactNotes: form.contactNotes,
    notes: form.notes,
    status: 'INTERVIEW',
    contactDates: form.contactDates,
  });
  expect(next.postText).toBe(`Original post\n\n${preview.sourceText}`);
});
test('rejects oversized combined sources without mutating existing inputs', () => {
  const form = { ...emptyOpportunity(), postText: 'x'.repeat(12000) };
  const before = structuredClone(form);
  expect(() => applyUrlJobPreview(form, preview, new Set())).toThrow(
    'paste limit',
  );
  expect(form).toEqual(before);
});
test('fetch enables only for permitted URLs, never on paste, and leaves TopCV disabled', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter>
      <JobEditor />
    </MemoryRouter>,
  );
  const button = screen.getByRole('button', { name: 'Fetch from URL' });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Original Job URL (optional)'), {
    target: { value: 'https://itviec.com/it-jobs/synthetic' },
  });
  expect(button).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Original Job URL (optional)'), {
    target: { value: preview.originalLink },
  });
  expect(button).toBeDisabled();
  expect(screen.getByText(/TopCV URL fetching is disabled/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  expect(screen.getByLabelText('Recruitment post')).toBeEnabled();
});
test.each([
  'https://itviec.com.evil.example/it-jobs/a',
  'http://itviec.com/it-jobs/a',
  'https://itviec.com:3000/it-jobs/a',
  'https://user:password@itviec.com/it-jobs/a',
  'https://itviec.com/customer',
  'invalid',
])('unsupported URLs cannot enable fetch: %s', (value) => {
  expect(canFetchJobUrl(value)).toBe(false);
});
test('click imports fixture content into review, preserves edits, warns about expiry, and saves original URL', async () => {
  const link = 'https://itviec.com/it-jobs/synthetic';
  const result = {
    ...preview,
    originalLink: link,
    platform: 'ITviec',
    expired: true,
  };
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.endsWith('/import-url')) return Response.json(result);
    return Response.json({
      ...JSON.parse(init?.body as string),
      id: 'synthetic',
    });
  });
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter>
      <JobEditor />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Original Job URL (optional)'), {
    target: { value: link },
  });
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: 'My edited title' },
  });
  fireEvent.change(screen.getByLabelText('Recruiter / contact notes'), {
    target: { value: 'My contact' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Fetch from URL' }));
  expect(await screen.findByText(/This listing is expired/)).toBeVisible();
  expect(screen.getByLabelText(/Job title/)).toHaveValue('My edited title');
  expect(screen.getByLabelText('Company')).toHaveValue(result.company);
  expect(screen.getByLabelText('Location')).toHaveValue(result.location);
  expect(screen.getByLabelText('Job description')).toHaveValue(
    result.description,
  );
  fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  expect(screen.getByLabelText('Recruitment post')).toHaveValue(
    result.sourceText,
  );
  expect(screen.getByRole('button', { name: 'Extract with AI' })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
    url: link,
  });
  if (screen.queryByRole('button', { name: 'Continue to Review & Save' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Continue to Review & Save' }),
    );
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirm and save job' }),
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toMatchObject({
    originalLink: link,
    company: result.company,
    title: 'My edited title',
    contactNotes: 'My contact',
    postText: result.sourceText,
  });
});
test('busy fetch prevents overlap and blocked response preserves manual inputs', async () => {
  let release!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter>
      <JobEditor />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('Original Job URL (optional)'), {
    target: { value: 'https://itviec.com/it-jobs/synthetic' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Original post' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Job URL/ }));
  const button = screen.getByRole('button', { name: 'Fetch from URL' });
  await userEvent.click(button);
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  release(
    Response.json(
      { message: 'Job page access was blocked. Paste the JD instead.' },
      { status: 400 },
    ),
  );
  expect(await screen.findByText(/Job page access was blocked/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  expect(screen.getByLabelText('Recruitment post')).toHaveValue(
    'Original post',
  );
  fireEvent.click(screen.getByRole('button', { name: /Job URL/ }));
  expect(screen.getByRole('button', { name: 'Fetch from URL' })).toBeEnabled();
});
