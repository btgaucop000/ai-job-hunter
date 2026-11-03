import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
  Routes,
  Route,
} from 'react-router-dom';
import { JobEditor } from '../src/features/inbox/JobEditor';
import {
  emptyOpportunity,
  importFields,
} from '../src/features/inbox/opportunities-api';
vi.mock('../src/features/inbox/CvMatchPanel', () => ({
  CvMatchPanel: () => <div>Saved CV matching workflow</div>,
}));
const id = '00000000-0000-4000-8000-123456789012';
const row = () => ({
  ...emptyOpportunity(),
  id,
  title: 'Synthetic engineer',
  company: 'Example',
  description: 'Synthetic complete JD',
  location: 'HCMC',
  jdText: '',
  documentName: null,
  status: 'SAVED',
});
function mount(path = '/jobs/new') {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <Routes>
            <Route path="/dashboard" element={<div>Inbox destination</div>} />
            <Route path="/jobs/new" element={<JobEditor key="new" />} />
            <Route path="/jobs/:id" element={<JobEditor />} />
          </Routes>
        ),
      },
    ],
    { initialEntries: ['/dashboard', path], initialIndex: 1 },
  );
  const mounted = render(<RouterProvider router={router} />);
  if (path === '/jobs/new')
    fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  return { ...mounted, router };
}
function mockApi() {
  let saved = row();
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/parse-document'))
      return Response.json({ text: 'Parsed synthetic document', warnings: [] });
    if (url.endsWith('/extract'))
      return Response.json({
        postText: 'Synthetic post',
        jdText: '',
        description: 'Synthetic complete JD',
        error: null,
        warnings: [],
        rejected: 0,
        fields: importFields.map((field) => ({
          field,
          value: field === 'title' ? 'Synthetic engineer' : '',
          status: field === 'title' ? 'SUPPORTED' : 'MISSING',
          candidates: [],
          reviewed: false,
        })),
      });
    if (init?.method === 'POST' || init?.method === 'PUT')
      saved = { ...saved, ...JSON.parse(init.body as string) };
    return Response.json(saved);
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const tab = (name: string) =>
  fireEvent.click(screen.getByRole('tab', { name }));

test('creation is import then review; extraction advances, back preserves edits, saves SAVED without tracker', async () => {
  const fetch = mockApi();
  mount();
  expect(screen.getByLabelText('Recruitment post')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Confirm and save job' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Application status')).not.toBeVisible();
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Synthetic post' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  expect(
    await screen.findByRole('button', { name: 'Confirm and save job' }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: 'Reviewed engineer' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to Import sources' }),
  );
  expect(screen.getByLabelText('Recruitment post')).toHaveValue(
    'Synthetic post',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to Review & Save' }),
  );
  expect(screen.getByLabelText(/Job title/)).toHaveValue('Reviewed engineer');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  expect(await screen.findByRole('tab', { name: 'Overview' })).toBeVisible();
  const save = fetch.mock.calls.find(
    ([url, init]) => url === '/api/v1/opportunities' && init?.method === 'POST',
  )!;
  expect(JSON.parse(save[1]!.body as string)).toMatchObject({
    title: 'Reviewed engineer',
    status: 'SAVED',
    notes: '',
    contactDates: [],
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('detail defaults to overview, match stays mounted, application and JD edits survive switching/save/reload', async () => {
  const fetch = mockApi();
  const first = mount(`/jobs/${id}`);
  await screen.findByRole('heading', { name: 'Synthetic engineer' });
  expect(screen.getByRole('heading', { name: 'Job overview' })).toBeVisible();
  expect(screen.getByText('Saved CV matching workflow')).not.toBeVisible();
  tab('CV Match');
  expect(screen.getByText('Saved CV matching workflow')).toBeVisible();
  tab('Application');
  fireEvent.change(screen.getByLabelText('Application notes'), {
    target: { value: 'Synthetic note' },
  });
  fireEvent.change(screen.getByLabelText('Last HR contact date'), {
    target: { value: '2026-11-02' },
  });
  fireEvent.change(screen.getByLabelText('Next follow-up date'), {
    target: { value: '2026-11-09' },
  });
  fireEvent.mouseDown(screen.getByLabelText('Application status'));
  fireEvent.click(await screen.findByRole('option', { name: 'APPLIED' }));
  tab('Edit JD');
  fireEvent.change(screen.getByLabelText('Job description'), {
    target: { value: 'Updated synthetic JD' },
  });
  tab('Application');
  expect(screen.getByLabelText('Application notes')).toHaveValue(
    'Synthetic note',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Changes saved')).toBeVisible();
  const save = fetch.mock.calls.find(([, init]) => init?.method === 'PUT')!;
  expect(JSON.parse(save[1]!.body as string)).toMatchObject({
    status: 'APPLIED',
    notes: 'Synthetic note',
    description: 'Updated synthetic JD',
    contactDates: ['2026-11-02'],
    followUpDate: '2026-11-09',
  });
  first.unmount();
  mount(`/jobs/${id}`);
  await screen.findByRole('heading', { name: 'Synthetic engineer' });
  tab('Edit JD');
  expect(screen.getByLabelText('Job description')).toHaveValue(
    'Updated synthetic JD',
  );
  tab('Application');
  expect(screen.getByLabelText('Application notes')).toHaveValue(
    'Synthetic note',
  );
  fireEvent.click(screen.getByRole('link', { name: 'Back to Job Inbox' }));
  expect(await screen.findByText('Inbox destination')).toBeVisible();
});

test('manual creation validates title and keeps fields after save failure', async () => {
  const fetch = mockApi();
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to Review & Save' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  expect(
    await screen.findByText(/Enter a job title before saving/),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: 'Manual engineer' },
  });
  fetch.mockRejectedValueOnce(new Error('Synthetic save failure'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  expect(await screen.findByText(/Synthetic save failure/)).toBeVisible();
  expect(screen.getByLabelText(/Job title/)).toHaveValue('Manual engineer');
});

test('unsaved link navigation, browser back, and refresh are guarded; stay retains edits', async () => {
  mockApi();
  const { router } = mount();
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Unsaved source' },
  });
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole('link', { name: 'Back to Job Inbox' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stay and edit' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText('Recruitment post')).toHaveValue(
    'Unsaved source',
  );
  void router.navigate(-1);
  expect(await screen.findByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Discard and leave' }));
  expect(await screen.findByText('Inbox destination')).toBeVisible();
});

test('review keeps genuine conflicts blocking until explicitly resolved', async () => {
  const fetch = mockApi();
  mount();
  const candidates = ['HCMC', 'Hanoi'].map((value) => ({
    field: 'location',
    value,
    source: 'post',
    quote: value,
  }));
  fetch.mockResolvedValueOnce(
    Response.json({
      postText: 'Synthetic source',
      jdText: '',
      description: 'Synthetic JD',
      warnings: [],
      error: null,
      rejected: 0,
      fields: importFields.map((field) => ({
        field,
        value: field === 'title' ? 'Synthetic engineer' : '',
        status:
          field === 'location'
            ? 'CONFLICT'
            : field === 'title'
              ? 'SUPPORTED'
              : 'MISSING',
        candidates: field === 'location' ? candidates : [],
        reviewed: false,
      })),
    }),
  );
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Synthetic source' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  const save = await screen.findByRole('button', {
    name: 'Confirm and save job',
  });
  expect(save).toBeDisabled();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Use this value for Location' })[0]!,
  );
  expect(screen.getByLabelText('Location')).toHaveValue('HCMC');
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(await screen.findByRole('tab', { name: 'Overview' })).toBeVisible();
});

test('synthetic document stays attached across steps and reaches extraction unchanged', async () => {
  const fetch = mockApi();
  mount();
  const document = new File(['synthetic fixture'], 'synthetic.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  fireEvent.click(screen.getByRole('button', { name: /Upload JD/ }));
  fireEvent.change(screen.getByLabelText('Upload JD document (PDF or DOCX)'), {
    target: { files: [document] },
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Extract with AI' }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to Review & Save' }),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to Import sources' }),
  );
  expect(screen.getByText('synthetic.docx')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('button', { name: 'Confirm and save job' });
  const call = fetch.mock.calls.find(([url]) => url.endsWith('/extract'))!;
  const uploaded = (call[1]!.body as FormData).get('document') as File;
  expect(uploaded.name).toBe(document.name);
  expect(uploaded.size).toBe(document.size);
  expect(uploaded.type).toBe(document.type);
});

test('review actions occupy a separate row and language fields stay in the scroll region', async () => {
  const fetch = mockApi();
  mount();
  fetch.mockResolvedValueOnce(
    Response.json({
      postText: 'Synthetic source',
      jdText: '',
      description: 'Synthetic JD',
      warnings: [],
      error: null,
      rejected: 0,
      fields: importFields.map((field) => ({
        field,
        value:
          field === 'title'
            ? 'Synthetic engineer'
            : field === 'skills'
              ? 'RESTful API\nEnglish technical reading'
              : '',
        status: ['title', 'skills'].includes(field) ? 'SUPPORTED' : 'MISSING',
        candidates: [],
        reviewed: false,
      })),
    }),
  );
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Synthetic source' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  const save = await screen.findByRole('button', {
    name: 'Confirm and save job',
  });
  const actions = screen.getByRole('region', { name: 'Job save actions' });
  const fields = screen.getByRole('region', { name: 'Scrollable job fields' });
  expect(actions).toContainElement(save);
  expect(fields).not.toContainElement(save);
  expect(fields).toContainElement(
    screen.getByLabelText('Required language requirements'),
  );
  expect(screen.getByLabelText('Required language requirements')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Back to Import sources' }),
  ).toBeVisible();
});

test('missing work-mode evidence clears obsolete automatic values but preserves manual edits', async () => {
  const fetch = mockApi();
  mount();
  const extraction = (mode: string) =>
    Response.json({
      postText: 'Synthetic',
      jdText: '',
      description: 'Synthetic JD',
      warnings: [],
      error: null,
      rejected: 0,
      fields: importFields.map((field) => ({
        field,
        value:
          field === 'title'
            ? 'Synthetic engineer'
            : field === 'workMode'
              ? mode
              : '',
        status:
          field === 'title' || (field === 'workMode' && mode)
            ? 'SUPPORTED'
            : 'MISSING',
        candidates: [],
        reviewed: false,
      })),
    });
  fetch.mockResolvedValueOnce(extraction('Remote'));
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Fully remote position' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('button', { name: 'Confirm and save job' });
  expect(screen.getByLabelText('Work mode')).toHaveValue('Remote');
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to Import sources' }),
  );
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Remote attestation and desktop agent work' },
  });
  fetch.mockResolvedValueOnce(extraction(''));
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('button', { name: 'Confirm and save job' });
  expect(screen.getByLabelText('Work mode')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('Work mode'), {
    target: { value: 'Hybrid (manually reviewed)' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Back to Import sources' }),
  );
  fireEvent.change(screen.getByLabelText('Recruitment post'), {
    target: { value: 'Remote device management' },
  });
  fetch.mockResolvedValueOnce(extraction(''));
  fireEvent.click(screen.getByRole('button', { name: 'Extract with AI' }));
  await screen.findByRole('button', { name: 'Confirm and save job' });
  expect(screen.getByLabelText('Work mode')).toHaveValue(
    'Hybrid (manually reviewed)',
  );
});

test('narrow tab strip supports all four tabs and keyboard selection without losing edits', async () => {
  vi.stubGlobal('innerWidth', 360);
  mockApi();
  mount(`/jobs/${id}`);
  await screen.findByRole('heading', { name: 'Synthetic engineer' });
  const user = userEvent.setup();
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    'Overview',
    'CV Match',
    'Application',
    'Edit JD',
  ]);
  const strip = screen
    .getByRole('tablist', { name: 'Job sections' })
    .closest('.MuiTabs-root')!;
  expect(strip).toHaveStyle({ maxWidth: '100%', minWidth: '0' });
  expect(strip.querySelector('.MuiTabs-scrollButtonsHideMobile')).toBeNull();
  await user.click(tabs[0]!);
  await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Enter}');
  expect(screen.getByRole('tab', { name: 'Edit JD' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(
    screen.getByRole('region', { name: 'Job save actions' }),
  ).toContainElement(screen.getByRole('button', { name: 'Save changes' }));
  fireEvent.change(screen.getByLabelText('Job description'), {
    target: { value: 'Unsaved mobile JD' },
  });
  tab('Overview');
  tab('Edit JD');
  expect(screen.getByLabelText('Job description')).toHaveValue(
    'Unsaved mobile JD',
  );
  expect(screen.getByText('Unsaved changes')).toBeVisible();
  expect(screen.getAllByRole('button', { name: 'Save changes' })).toHaveLength(
    1,
  );
  tab('Application');
  expect(
    screen.queryByRole('region', { name: 'Job save actions' }),
  ).not.toBeInTheDocument();
});
