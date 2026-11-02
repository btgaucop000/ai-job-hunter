import { expect, test } from '@jest/globals';
import type { IncomingMessage } from 'node:http';
import {
  checkAnalysisSecurity,
  localAnalysisSecurity,
} from '../../src/analysis/analysis-security.js';
import { localOpportunitySecurity } from '../../src/opportunities/opportunities.security.js';
const policy = localOpportunitySecurity(3000);
function request(
  host: string,
  origin: string | undefined,
  extra: string[] = [],
): IncomingMessage {
  return {
    headers: { host, ...(origin === undefined ? {} : { origin }) },
    rawHeaders: [
      'Host',
      host,
      ...(origin === undefined ? [] : ['Origin', origin]),
      ...extra,
    ],
  } as IncomingMessage;
}
test.each([
  '127.0.0.1:5173',
  'localhost:5173',
  '127.0.0.1:3000',
  'localhost:3000',
])('allows the explicit local workspace alias %s', (host) => {
  expect(() =>
    checkAnalysisSecurity(request(host, `http://${host}`), policy),
  ).not.toThrow();
});
test.each([
  'http://example.com',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
  'http://localhost.example.com:5173',
  'http://192.168.1.2:5173',
  'null',
  undefined,
])('rejects untrusted or missing origin %s', (origin) => {
  expect(() =>
    checkAnalysisSecurity(request('127.0.0.1:5173', origin), policy),
  ).toThrow();
});
test.each([
  'example.com:5173',
  '0.0.0.0:5173',
  '192.168.1.2:5173',
  'localhost:5174',
])('rejects non-allowlisted host %s', (host) => {
  expect(() =>
    checkAnalysisSecurity(request(host, 'http://127.0.0.1:5173'), policy),
  ).toThrow();
});
test('duplicate and spoofed forwarded headers cannot bypass checks', () => {
  expect(() =>
    checkAnalysisSecurity(
      request('127.0.0.1:5173', 'http://localhost:5173', [
        'Origin',
        'http://localhost:5173',
      ]),
      policy,
    ),
  ).toThrow();
  expect(() =>
    checkAnalysisSecurity(
      request('127.0.0.1:5173', 'http://localhost:5173', [
        'Host',
        'localhost:5173',
      ]),
      policy,
    ),
  ).toThrow();
  expect(() =>
    checkAnalysisSecurity(
      request('example.com', 'http://example.com', [
        'X-Forwarded-Host',
        '127.0.0.1:5173',
      ]),
      policy,
    ),
  ).toThrow();
});
test('does not change the existing CV analysis origin policy', () => {
  expect(() =>
    checkAnalysisSecurity(
      request('localhost:5173', 'http://localhost:5173'),
      localAnalysisSecurity(3000),
    ),
  ).toThrow();
});
