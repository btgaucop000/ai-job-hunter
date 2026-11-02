import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import type { RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { validateJobUrl, type JobPageTransport } from './job-url-import.js';

const denied = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) denied.addSubnet(network, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [network, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) denied.addSubnet(network, prefix, 'ipv6');
export function isPublicJobAddress(address: string): boolean {
  if (isIP(address) === 4) return !denied.check(address, 'ipv4');
  if (isIP(address) === 6)
    return globalV6.check(address, 'ipv6') && !denied.check(address, 'ipv6');
  return false;
}
export function permittedLiveJobUrl(value: unknown): string {
  const { url, platform } = validateJobUrl(value);
  if (platform !== 'ITviec')
    throw new ForbiddenException(`${platform} URL fetching is disabled due to published content-use restrictions. Use the page-import bookmark or paste an authorized JD.`);
  const parsed = new URL(url);
  if (!parsed.pathname.startsWith('/it-jobs/'))
    throw new BadRequestException('Use an individual ITviec job URL under /it-jobs/, or paste the JD.');
  return url;
}
type Destination = { address: string; family: number };
export interface JobHttpDependencies {
  resolve(hostname: string): Promise<Destination[]>;
  open(options: RequestOptions, callback: (response: IncomingMessage) => void): ClientRequest;
}
const liveDependencies: JobHttpDependencies = {
  resolve: hostname => lookup(hostname, { all: true, verbatim: true }),
  open: (options, callback) => request(options, callback),
};

export class PinnedJobPageTransport implements JobPageTransport {
  constructor(private readonly dependencies: JobHttpDependencies = liveDependencies) {}
  async get(value: string, options: Parameters<JobPageTransport['get']>[1]): Promise<Response> {
    const url = new URL(permittedLiveJobUrl(value));
    options.signal.throwIfAborted();
    const addresses = await this.dependencies.resolve(url.hostname);
    options.signal.throwIfAborted();
    // Reject the entire DNS answer if it includes a non-public destination.
    if (!addresses.length || addresses.some(row => !isPublicJobAddress(row.address) || isIP(row.address) !== row.family))
      throw new BadRequestException('Job hostname did not resolve exclusively to public addresses. Paste the JD instead.');
    const destination = addresses[0]!;
    return new Promise<Response>((resolve, reject) => {
      const req = this.dependencies.open({
        protocol: 'https:', hostname: destination.address, family: destination.family,
        port: 443, servername: url.hostname,
        // Connect to the checked literal IP. No second DNS lookup, reused socket,
        // proxy, redirect, cookie jar, or caller-supplied headers are involved.
        agent: false, method: 'GET', path: `${url.pathname}${url.search}`,
        signal: options.signal, rejectUnauthorized: true,
        checkServerIdentity: (_hostname, certificate) => checkServerIdentity(url.hostname, certificate),
        headers: { Host: url.hostname, Accept: 'text/html', 'Accept-Encoding': 'identity', 'User-Agent': 'AI-Job-Hunter/0.1 (personal URL import)' },
      }, response => {
        const fail = (message: string) => { response.destroy(); reject(new BadRequestException(message)); };
        const status = response.statusCode ?? 502;
        if (status >= 300 && status < 400) return fail('Redirected job pages are not supported. Use the final public job URL or paste the JD.');
        if (status === 404 || status === 410) return fail('This job page is no longer available. Paste the JD if you have it.');
        if (status !== 200) return fail('Job page access was blocked or unavailable. No retry was attempted; paste the JD instead.');
        if (!/^text\/html(?:\s*;|$)/i.test(response.headers['content-type'] ?? '')) return fail('Expected an HTML job page. Paste the JD instead.');
        if (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity') return fail('Unsupported job page encoding. Paste the JD instead.');
        if (Number(response.headers['content-length']) > 2 * 1024 * 1024) return fail('Job page exceeds the import size limit. Paste the JD instead.');
        const headers = new Headers();
        headers.set('Content-Type', response.headers['content-type']!);
        if (response.headers['content-length']) headers.set('Content-Length', response.headers['content-length']);
        resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers }));
      });
      req.once('error', reject);
      req.end();
    });
  }
}
