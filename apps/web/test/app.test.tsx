import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  useLocation,
} from 'react-router-dom';
import { App } from '../src/app/App';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../src/app/theme';
import { emptyOpportunity } from '../src/features/inbox/opportunities-api';

function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}

test.each(['/dashboard', '/jobs'])(
  'opens job details and returns from %s through the app shell',
  async (path) => {
    const job = {
      ...emptyOpportunity(),
      id: '00000000-0000-4000-8000-123456789012',
      title: 'Synthetic navigation job',
      jdText: '',
      documentName: null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/health/ready'))
          return Response.json({ status: 'ok' });
        if (url.endsWith('/cv/current')) return Response.json(null);
        return Response.json(url.endsWith('/opportunities') ? [job] : job);
      }),
    );
    render(
      <ThemeProvider theme={theme}>
        <RouterProvider
          router={createMemoryRouter([{ path: '*', element: <App /> }], {
            initialEntries: [path],
          })}
        />
      </ThemeProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: job.title }));
    expect(
      await screen.findByRole('heading', { name: job.title }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('link', { name: 'Back to Job Inbox' }));
    expect(await screen.findByRole('link', { name: job.title })).toBeVisible();
  },
);
function show(path: string) {
  render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>
        <App />
        <Location />
      </MemoryRouter>
    </ThemeProvider>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      url === '/api/v1/health/ready'
        ? Promise.resolve(new Response(JSON.stringify({ status: 'ok' })))
        : Promise.resolve(new Response(JSON.stringify([]))),
    ),
  );
});
test('renders the dashboard and honest empty state', async () => {
  show('/dashboard');
  expect(
    screen.getByRole('heading', { name: 'Job Inbox' }),
  ).toBeInTheDocument();
  expect(
    await screen.findByText('No saved opportunities yet'),
  ).toBeInTheDocument();
  expect(await screen.findByText('API ready')).toBeInTheDocument();
});
test('redirects the root route to dashboard', async () => {
  show('/');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '/dashboard',
  );
  expect(await screen.findByText('API ready')).toBeInTheDocument();
});
test.each(['Candidates', 'Matches', 'Settings'])(
  'navigates to the honest %s placeholder',
  async (label) => {
    show('/dashboard');
    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: label }));
    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Coming soon' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This part of your workspace is not available yet.'),
    ).toBeInTheDocument();
  },
);
test('unknown routes show not found and allow navigation home', async () => {
  show('/does-not-exist');
  expect(
    screen.getByRole('heading', { name: 'Page not found' }),
  ).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole('link', { name: 'Back to dashboard' }));
  expect(
    screen.getByRole('heading', { name: 'Job Inbox' }),
  ).toBeInTheDocument();
});

test('keeps CV review accessible and discovery off the inbox', async () => {
  show('/dashboard');
  await userEvent
    .setup()
    .click(screen.getByRole('link', { name: 'CV & Review' }));
  expect(
    screen.getByRole('heading', { name: 'CV & Review' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Existing CV/JD extraction and fact review'),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Use CV to find jobs' }),
  ).not.toBeInTheDocument();
});
