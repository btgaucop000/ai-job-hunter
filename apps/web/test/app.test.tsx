import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { App } from '../src/app/App';

function Location() {
  return <output aria-label="Current route">{useLocation().pathname}</output>;
}
function show(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Location />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }))),
  );
});
test('renders the dashboard and honest empty state', async () => {
  show('/dashboard');
  expect(
    screen.getByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/There are no candidates/)).toBeInTheDocument();
  expect(await screen.findByText('API ready')).toBeInTheDocument();
});
test('redirects the root route to dashboard', async () => {
  show('/');
  expect(screen.getByLabelText('Current route')).toHaveTextContent(
    '/dashboard',
  );
  expect(await screen.findByText('API ready')).toBeInTheDocument();
});
test.each(['Candidates', 'Jobs', 'Matches', 'Settings'])(
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
    screen.getByRole('heading', { name: 'Dashboard' }),
  ).toBeInTheDocument();
});
