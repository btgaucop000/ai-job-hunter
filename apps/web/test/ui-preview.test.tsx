import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UiAcceptancePreview from '../src/features/dashboard/UiAcceptancePreview';

test('synthetic preview shows review evidence and all statuses without an Analyze action or requests', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<UiAcceptancePreview />);
  expect(
    screen.getByRole('heading', { name: 'Synthetic UI acceptance preview' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/SYNTHETIC DATA ONLY/)).toBeInTheDocument();
  expect(screen.getAllByText('VALID').length).toBeGreaterThan(0);
  expect(screen.getByText('NEEDS_REVIEW')).toBeInTheDocument();
  expect(screen.getByText('MISSING')).toBeInTheDocument();
  expect(
    screen.getByText(/Exact source evidence is retained below/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Analyze' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Overall documented requirement support'),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Show AI failure example' }),
  );
  expect(
    screen.getByText(/JD AI extraction failed: TIMEOUT/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'CV source' }),
  ).toBeInTheDocument();
  expect(screen.getAllByText('VALID').length).toBeGreaterThan(0);
  expect(fetch).not.toHaveBeenCalled();
});
test('preview parse action calls only the fixture asset and production parse-only endpoint', async () => {
  const response = {
    contractVersion: '1',
    requestId: '00000000-0000-4000-8000-000000000006',
    outcome: 'PARSED',
    result: null,
    error: null,
    stages: {
      upload: 'SUCCEEDED',
      cv: 'NOT_RUN',
      jd: 'NOT_RUN',
      matching: 'NOT_RUN',
    },
    documents: {
      cv: { text: 'Synthetic parsed CV', facts: null },
      jd: { text: 'Synthetic parsed JD', facts: null },
    },
  };
  const fetch = vi.fn(async (url: string) => {
    if (url === '/synthetic-ui-cv.pdf')
      return new Response('synthetic PDF bytes');
    if (url === '/api/v1/analyses?mode=parse-only')
      return new Response(JSON.stringify(response));
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetch);
  render(<UiAcceptancePreview />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Parse without AI (synthetic)' }),
  );
  expect(await screen.findByText('Synthetic parsed CV')).toBeInTheDocument();
  expect(screen.getByText('Synthetic parsed JD')).toBeInTheDocument();
  expect(fetch.mock.calls.map((call) => call[0])).toEqual([
    '/synthetic-ui-cv.pdf',
    '/api/v1/analyses?mode=parse-only',
  ]);
  expect(
    screen.queryByLabelText('Overall documented requirement support'),
  ).not.toBeInTheDocument();
});
test('preview remount restores synthetic review, rather than retaining the last example as history', async () => {
  const view = render(<UiAcceptancePreview />);
  await userEvent.click(
    screen.getByRole('button', { name: 'Show AI failure example' }),
  );
  view.unmount();
  render(<UiAcceptancePreview />);
  expect(screen.queryByText(/JD AI extraction failed/)).not.toBeInTheDocument();
  expect(screen.getByText(/looks like a document heading/)).toBeInTheDocument();
  expect(
    screen.getByText(/normal dashboard keeps inputs\/results only in memory/),
  ).toBeInTheDocument();
});
