import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DiscoverJobs } from '../src/features/inbox/DiscoverJobs';
test('on-demand discovery sends editable defaults, summarizes counts and refreshes Inbox', async () => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      Response.json({
        found: 5,
        imported: 3,
        duplicatesSkipped: 2,
        remaining: 0,
        errors: [],
        scope: 'Synthetic verified feeds',
      }),
  );
  vi.stubGlobal('fetch', fetch);
  const onImported = vi.fn();
  render(<DiscoverJobs onImported={onImported} />);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Discovery location')).toHaveTextContent(
    'Ho Chi Minh City',
  );
  expect(screen.getByLabelText('Tech stack (any)')).toHaveTextContent(
    'Java, Spring Boot, Node.js, React',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Discover Jobs' }));
  await screen.findByText('Found 5 · Imported 3 · Duplicates skipped 2');
  expect(onImported).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toEqual({
    location: 'Ho Chi Minh City',
    stacks: ['Java', 'Spring Boot', 'Node.js', 'React'],
    workMode: 'All',
    seniority: 'Senior',
  });
});
test('source errors are visible without fabricating or importing jobs', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json({
        found: 0,
        imported: 0,
        duplicatesSkipped: 0,
        remaining: 0,
        errors: ['Synthetic source unavailable'],
        scope: 'Verified feeds only',
      }),
    ),
  );
  const onImported = vi.fn();
  render(<DiscoverJobs onImported={onImported} />);
  fireEvent.click(screen.getByRole('button', { name: 'Discover Jobs' }));
  await screen.findByText('Synthetic source unavailable');
  expect(onImported).not.toHaveBeenCalled();
});
