import { expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiReadiness } from '../src/features/health/ApiReadiness';

const ready = () => new Response(JSON.stringify({ status: 'ok' }));
test('shows loading until a request resolves', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  );
  render(<ApiReadiness />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking API');
  expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled();
});
test('shows success and requests the readiness endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(ready());
  vi.stubGlobal('fetch', fetch);
  render(<ApiReadiness />);
  expect(await screen.findByText('API ready')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(
    '/api/v1/health/ready',
    expect.objectContaining({
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }),
  );
});
test.each(['http', 'network', 'invalid-body'])(
  'shows unavailable for %s failure',
  async (kind) => {
    const fetch = vi.fn();
    if (kind === 'network') fetch.mockRejectedValue(new Error('offline'));
    else
      fetch.mockResolvedValue(
        kind === 'http'
          ? new Response('{}', { status: 503 })
          : new Response('{}'),
      );
    vi.stubGlobal('fetch', fetch);
    render(<ApiReadiness />);
    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
  },
);
test('manual retry makes a fresh request and recovers', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(ready());
  vi.stubGlobal('fetch', fetch);
  render(<ApiReadiness />);
  await screen.findByText('API unavailable');
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Check again' }));
  expect(await screen.findByText('API ready')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('periodic refresh recovers without real-time delays', async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response('{}', { status: 503 }))
    .mockResolvedValueOnce(ready());
  vi.stubGlobal('fetch', fetch);
  render(<ApiReadiness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('API unavailable')).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(screen.getByText('API ready')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('aborts a stalled request at 3 seconds', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ),
  );
  render(<ApiReadiness />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2999);
  });
  expect(screen.getByText('Checking API…')).toBeInTheDocument();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(screen.getByText('API unavailable')).toBeInTheDocument();
});
test('unmount aborts the current request and prevents polling', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const fetch = vi.fn((_url, options: RequestInit) => {
    signal = options.signal as AbortSignal;
    return new Promise(() => {});
  });
  vi.stubGlobal('fetch', fetch);
  const view = render(<ApiReadiness />);
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetch).toHaveBeenCalledTimes(1);
});
