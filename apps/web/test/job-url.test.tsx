import { expect, test } from 'vitest';
import { jobUrlInfo } from '../src/features/inbox/opportunities-api';

test.each([
  ['https://itviec.com/jobs/synthetic', 'ITviec'],
  ['https://www.topcv.vn/viec-lam/synthetic', 'TopCV'],
  ['https://WWW.VIETNAMWORKS.COM/synthetic', 'VietnamWorks'],
  ['https://itviec.com.evil.example/job', null],
  ['https://fakeitviec.com/job', null],
  ['https://example.com/?next=itviec.com', null],
  ['', null],
])('recognizes only reliable platform hostnames: %s', (url, platform) => {
  expect(jobUrlInfo(url)).toEqual({ valid: true, platform });
});

test.each(['not a URL', 'javascript:alert(1)', 'https://user:secret@itviec.com/job'])('rejects invalid/unsafe links: %s', (url) => {
  expect(jobUrlInfo(url)).toEqual({ valid: false, platform: null });
});
