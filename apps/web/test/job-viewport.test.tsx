import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { App } from '../src/app/App';
import { emptyOpportunity } from '../src/features/inbox/opportunities-api';
vi.mock('../src/features/health/ApiReadiness', () => ({
  ApiReadiness: () => <span>API synthetic</span>,
}));
vi.mock('../src/features/inbox/CvMatchPanel', () => ({
  CvMatchPanel: () => <div>Synthetic CV match panel</div>,
}));
const id = '00000000-0000-4000-8000-123456789012';
function mount(path = '/jobs/new') {
  let row = {
    ...emptyOpportunity(),
    id,
    title: 'Synthetic engineer',
    jdText: '',
    documentName: null,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST' || init?.method === 'PUT')
        row = { ...row, ...JSON.parse(init.body as string) };
      return Response.json(row);
    }),
  );
  const mounted = render(
    <RouterProvider
      router={createMemoryRouter([{ path: '*', element: <App /> }], {
        initialEntries: [path],
      })}
    />,
  );
  if (path === '/jobs/new')
    fireEvent.click(screen.getByRole('button', { name: /Paste JD/ }));
  return mounted;
}
function shell() {
  return screen.getByRole('main').parentElement!.parentElement!;
}
function expectSingleFormScroll() {
  const fields = screen.getByRole('region', { name: 'Scrollable job fields' });
  expect(fields).toHaveStyle({ overflowY: 'auto' });
  let ancestor = fields.parentElement;
  while (ancestor && ancestor !== document.body) {
    expect(['auto', 'scroll', 'hidden']).not.toContain(
      getComputedStyle(ancestor).overflowY,
    );
    ancestor = ancestor.parentElement;
  }
  expect(shell()).toHaveStyle({ height: '100dvh', minHeight: '0' });
  expect(screen.getByRole('main')).toHaveStyle({ minHeight: '0', flex: '1' });
  return fields;
}

test.each([360, 1280])(
  'Add Job shares one constrained scroll owner across steps at width %s',
  (width) => {
    vi.stubGlobal('innerWidth', width);
    mount();
    const fields = expectSingleFormScroll();
    expect(fields).toContainElement(screen.getByLabelText('Recruitment post'));
    expect(fields).toContainElement(
      screen.getByRole('heading', { name: 'Add Job' }),
    );
    fields.scrollTop = 200;
    fireEvent.change(screen.getByLabelText('Recruitment post'), {
      target: { value: 'Unsaved synthetic source' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue to Review & Save' }),
    );
    expect(expectSingleFormScroll()).toBe(fields);
    expect(fields.scrollTop).toBe(0);
    expect(
      screen.getByRole('region', { name: 'Job save actions' }),
    ).toContainElement(
      screen.getByRole('button', { name: 'Confirm and save job' }),
    );
    expect(fields).toContainElement(screen.getByLabelText('Job description'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Back to Import sources' }),
    );
    expect(expectSingleFormScroll()).toBe(fields);
    expect(screen.getByLabelText('Recruitment post')).toHaveValue(
      'Unsaved synthetic source',
    );
    expect(screen.getByText('Unsaved changes')).toBeVisible();
  },
);

test('shell constraints apply to Edit JD, release for other detail tabs, and save still works', async () => {
  mount(`/jobs/${id}`);
  await screen.findByRole('heading', { name: 'Synthetic engineer' });
  expect(shell().style.height).toBe('');
  fireEvent.click(screen.getByRole('tab', { name: 'Edit JD' }));
  expectSingleFormScroll();
  fireEvent.change(screen.getByLabelText('Job description'), {
    target: { value: 'Reviewed synthetic JD' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Changes saved.')).toBeVisible();
  fireEvent.click(screen.getByRole('tab', { name: 'Application' }));
  await waitFor(() => expect(shell().style.height).toBe(''));
  expect(
    screen.queryByRole('region', { name: 'Scrollable job fields' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Edit JD' }));
  expectSingleFormScroll();
  expect(screen.getByLabelText('Job description')).toHaveValue(
    'Reviewed synthetic JD',
  );
});

test('Confirm and Save submits the original form from the persistent action row', async () => {
  mount();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to Review & Save' }),
  );
  fireEvent.change(screen.getByLabelText(/Job title/), {
    target: { value: 'Saved through bounded shell' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm and save job' }));
  expect(
    await screen.findByRole('heading', { name: 'Saved through bounded shell' }),
  ).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(shell().style.height).toBe('');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
