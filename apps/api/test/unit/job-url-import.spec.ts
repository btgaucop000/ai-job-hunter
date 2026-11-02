import { expect, jest, test } from '@jest/globals';
import {
  JobUrlImportService,
  parseJobPosting,
  previewJobUrl,
  validateJobUrl,
} from '../../src/opportunities/job-url-import.js';
const url = 'https://itviec.com/it-jobs/synthetic';
const job = {
  '@type': 'JobPosting',
  title: 'Backend Engineer',
  hiringOrganization: { name: 'Synthetic &amp; Co' },
  jobLocation: {
    address: { addressLocality: 'Ho Chi Minh City', addressCountry: 'VN' },
  },
  description: '<p>Build Java &amp; Spring services.</p><p>Use SQL.</p>',
  validThrough: '2026-11-06',
};
const html = (data: unknown = job) =>
  `<html><script type="application/ld+json">${JSON.stringify(data)}</script></html>`;
const transport = (response: Response) => ({
  get: jest.fn<
    (
      url: string,
      options: { signal: AbortSignal; redirect: 'error'; credentials: 'omit' },
    ) => Promise<Response>
  >(async () => response),
});
test.each([url, 'https://www.topcv.vn/viec-lam/synthetic.html'])(
  'extracts synthetic title/company/location/description and expiry: %s',
  (link) => {
    const result = parseJobPosting(
      html(),
      link,
      Date.parse('2026-11-06T12:00:00Z'),
    );
    expect(result).toMatchObject({
      originalLink: link,
      title: 'Backend Engineer',
      company: 'Synthetic & Co',
      location: 'Ho Chi Minh City, VN',
      description: 'Build Java & Spring services.\nUse SQL.',
      validThrough: '2026-11-06',
      expired: false,
    });
    expect(
      parseJobPosting(html(), link, Date.parse('2026-11-07')).expired,
    ).toBe(true);
  },
);
test('handles arrays and graphs, ignores malformed blocks, preserves unknown fields', () => {
  const result = parseJobPosting(
    '<script type="application/ld+json">bad json</script>' +
      html({
        '@graph': [
          { '@type': 'Organization' },
          { '@type': ['JobPosting'], description: 'Synthetic JD' },
        ],
      }),
    url,
  );
  expect(result).toMatchObject({
    title: '',
    company: '',
    location: '',
    validThrough: null,
    expired: false,
  });
  expect(parseJobPosting(html([job]), url).title).toBe(job.title);
});
test('rejects missing descriptions, ambiguous listings and oversized HTML', () => {
  for (const input of [
    html({ ...job, description: '' }),
    html([job, job]),
    'x'.repeat(2 * 1024 * 1024 + 1),
    '<html>no job</html>',
  ])
    expect(() => parseJobPosting(input, url)).toThrow();
});
test.each([
  'http://itviec.com/job',
  'https://127.0.0.1/job',
  'https://[::1]/job',
  'https://itviec.com.evil.example/job',
  'https://evil.itviec.com/job',
  'https://topcv.vn:8080/job',
  'https://user:pass@topcv.vn/job',
  'file:///etc/passwd',
  'https://constructor/job',
  '',
])('rejects unsafe URL before transport: %s', async (link) => {
  const source = transport(new Response(''));
  expect(() => validateJobUrl(link)).toThrow();
  await expect(previewJobUrl(link, source)).rejects.toThrow();
  expect(source.get).not.toHaveBeenCalled();
});
test('service uses fixture transport and sanitizes network errors', async () => {
  const source = transport(
    new Response(html(), { headers: { 'Content-Type': 'text/html' } }),
  );
  expect((await new JobUrlImportService(source).preview(url)).title).toBe(
    job.title,
  );
  const failing = {
    get: jest.fn(async () => {
      throw new Error('private network details');
    }),
  };
  await expect(new JobUrlImportService(failing).preview(url)).rejects.toThrow(
    'Could not retrieve the public job page',
  );
});
test('service rejects overlapping imports without starting a second request', async () => {
  let release!: (response: Response) => void;
  const source = {
    get: jest.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ),
  };
  const service = new JobUrlImportService(source);
  const first = service.preview(url);
  await expect(service.preview(url)).rejects.toThrow('already running');
  release(new Response(html(), { headers: { 'Content-Type': 'text/html' } }));
  await first;
  expect(source.get).toHaveBeenCalledTimes(1);
});
test('fixture transport uses no cookies, refuses redirects and parses successful HTML', async () => {
  const source = transport(
    new Response(html(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }),
  );
  expect((await previewJobUrl(url, source)).title).toBe(job.title);
  expect(source.get).toHaveBeenCalledWith(url, {
    signal: expect.any(AbortSignal),
    redirect: 'error',
    credentials: 'omit',
  });
});
test.each([
  new Response(null, {
    status: 302,
    headers: { Location: 'http://127.0.0.1' },
  }),
  new Response('blocked', { status: 403 }),
  new Response('rate limit', { status: 429 }),
  new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
  new Response(html(), {
    headers: { 'Content-Type': 'text/html', 'Content-Length': '3000000' },
  }),
  new Response('x'.repeat(2 * 1024 * 1024 + 1), {
    headers: { 'Content-Type': 'text/html' },
  }),
])('rejects unsafe or oversized responses', async (response) => {
  await expect(previewJobUrl(url, transport(response))).rejects.toThrow();
});
test('bounds a stalled transport even if it ignores AbortSignal', async () => {
  const source = { get: jest.fn(() => new Promise<Response>(() => {})) };
  await expect(previewJobUrl(url, source, 5)).rejects.toThrow('timed out');
});

test('bounds stalled body reads and cancels the fixture stream', async () => {
  const cancel = jest.fn(() => undefined);
  const body = new ReadableStream<Uint8Array>({ cancel });
  const response = new Response(body, {
    headers: { 'Content-Type': 'text/html' },
  });
  await expect(previewJobUrl(url, transport(response), 5)).rejects.toThrow(
    'timed out',
  );
  expect(cancel).toHaveBeenCalled();
});
