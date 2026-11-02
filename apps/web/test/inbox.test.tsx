import { expect, test, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JobInbox } from '../src/features/inbox/JobInbox';
import { JobEditor } from '../src/features/inbox/JobEditor';
import { emptyOpportunity } from '../src/features/inbox/opportunities-api';
const id = '00000000-0000-4000-8000-123456789012';
const row = {
  ...emptyOpportunity(),
  id,
  ownerId: 'local',
  title: 'Synthetic engineer',
  company: 'Example Company',
  source: 'Email',
  followUpDate: '2026-11-02',
  createdAt: '2026-10-30',
  updatedAt: '2026-10-30',
};
function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/dashboard" element={<JobInbox />} />
        <Route path="/jobs/new" element={<JobEditor />} />
        <Route path="/jobs/:id" element={<JobEditor />} />
      </Routes>
    </MemoryRouter>,
  );
}
test('lists persisted jobs again after remount (refresh)', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([row])));
  vi.stubGlobal('fetch', fetch);
  const first = mount('/dashboard');
  expect(await screen.findByText('Synthetic engineer')).toBeVisible();
  expect(screen.getByText('2026-11-02')).toBeVisible();
  first.unmount();
  fetch.mockResolvedValue(new Response(JSON.stringify([row])));
  mount('/dashboard');
  expect(await screen.findByText('Synthetic engineer')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('adds a job, sends persistent fields, then loads its detail', async () => {
  const fetch = vi.fn(
    async (_url: string, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === 'POST' ? row : row)),
  );
  vi.stubGlobal('fetch', fetch);
  mount('/jobs/new');
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: row.title },
  });
  fireEvent.change(screen.getByLabelText(/^Company/), {
    target: { value: row.company },
  });
  fireEvent.change(screen.getByLabelText('Follow-up date'), {
    target: { value: '2026-11-02' },
  });
  fireEvent.change(screen.getByLabelText('Contact date'), {
    target: { value: '2026-10-30' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Record contact date' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  await screen.findByRole('heading', { name: 'Job details' });
  const sent = JSON.parse(fetch.mock.calls[0]![1]!.body as string);
  expect(sent).toMatchObject({
    title: row.title,
    company: row.company,
    contactDates: ['2026-10-30'],
    followUpDate: '2026-11-02',
    status: 'SAVED',
  });
});
test('edits notes and follow-up date and keeps input on save failure', async () => {
  const fetch = vi.fn(
    async (_url: string, init?: RequestInit) =>
      new Response(
        JSON.stringify(
          init?.method === 'PUT' ? { message: 'Invalid opportunity' } : row,
        ),
        { status: init?.method === 'PUT' ? 400 : 200 },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  mount(`/jobs/${id}`);
  await screen.findByDisplayValue('Synthetic engineer');
  fireEvent.change(screen.getByLabelText('Application notes'), {
    target: { value: 'Synthetic call notes' },
  });
  fireEvent.change(screen.getByLabelText('Follow-up date'), {
    target: { value: '2026-11-03' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText(/Invalid opportunity/);
  expect(screen.getByLabelText('Application notes')).toHaveValue(
    'Synthetic call notes',
  );
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1]![1]!.body as string)).toMatchObject({
    notes: 'Synthetic call notes',
    followUpDate: '2026-11-03',
  });
});

test('changes status freely and sends the selected status to the API', async () => {
  const fetch = vi.fn(async () => Response.json(row));
  vi.stubGlobal('fetch', fetch);
  mount(`/jobs/${id}`);
  await screen.findByDisplayValue('Synthetic engineer');
  await userEvent.click(
    screen.getByRole('combobox', { name: 'Application status' }),
  );
  await userEvent.click(screen.getByRole('option', { name: 'OFFER' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Changes saved.');
  expect(
    JSON.parse(
      (fetch.mock.calls as unknown as [string, RequestInit][])[1]![1]
        .body as string,
    ).status,
  ).toBe('OFFER');
});

test('Contact Date survives create save reopen edit save and refresh without recording separately', async () => {
  let saved = { ...row, contactDates: [] as string[], notes: '', status: 'SAVED' };
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST' || init?.method === 'PUT')
      saved = { ...saved, ...JSON.parse(init.body as string) };
    return Response.json(saved);
  });
  vi.stubGlobal('fetch', fetch);
  let view = mount('/jobs/new');
  fireEvent.change(screen.getByLabelText(/Job title/), { target: { value: 'Synthetic date job' } });
  fireEvent.change(screen.getByLabelText('Contact date'), { target: { value: '2026-10-30' } });
  fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '2026-11-02' } });
  fireEvent.change(screen.getByLabelText('Application notes'), { target: { value: 'Synthetic tracking notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  await screen.findByRole('heading', { name: 'Job details' });
  expect(saved.contactDates).toEqual(['2026-10-30']);
  view.unmount();
  view = mount(`/jobs/${id}`);
  await waitFor(() => expect(screen.getByLabelText('Contact date')).toHaveValue('2026-10-30'));
  // An earlier date must stay selected too; no latest-date/timezone substitution.
  fireEvent.change(screen.getByLabelText('Contact date'), { target: { value: '2026-10-29' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Changes saved.');
  expect(saved.contactDates).toEqual(['2026-10-30', '2026-10-29']);
  expect(saved).toMatchObject({ title: 'Synthetic date job', notes: 'Synthetic tracking notes', followUpDate: '2026-11-02', status: 'SAVED' });
  view.unmount();
  mount(`/jobs/${id}`);
  await waitFor(() => expect(screen.getByLabelText('Contact date')).toHaveValue('2026-10-29'));
  expect(screen.getByLabelText('Application notes')).toHaveValue('Synthetic tracking notes');
  expect(screen.getByLabelText('Follow-up date')).toHaveValue('2026-11-02');
});

test('Contact Date removed from history is not restored by the hydrated picker on save', async () => {
  let saved = { ...row, contactDates: ['2026-10-30'] };
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') saved = { ...saved, ...JSON.parse(init.body as string) };
    return Response.json(saved);
  }));
  mount(`/jobs/${id}`);
  await waitFor(() => expect(screen.getByLabelText('Contact date')).toHaveValue('2026-10-30'));
  await userEvent.click(screen.getByRole('button', { name: '2026-10-30' }));
  await userEvent.keyboard('{Delete}');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Changes saved.');
  expect(saved.contactDates).toEqual([]);
  expect(screen.getByLabelText('Contact date')).toHaveValue('');
});
