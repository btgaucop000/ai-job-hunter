import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { JobsResponse, PublicJob } from './jobs.types.js';
export const JOBS_SOURCE =
  'https://www.arbeitnow.com/api/job-board-api' as const;
const MAX_BYTES = 5 * 1024 * 1024;
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && Boolean(v.trim()) && v.length <= max;
function originalUrl(value: unknown): value is string {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      [
        'www.arbeitnow.com',
        'arbeitnow.com',
        'www.arbeitnow.co.uk',
        'arbeitnow.co.uk',
        'www.arbeitnow.fr',
        'arbeitnow.fr',
        'www.arbeitnow.ch',
        'arbeitnow.ch',
        'www.arbeitnow.nl',
        'arbeitnow.nl',
      ].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname.startsWith('/jobs/')
    );
  } catch {
    return false;
  }
}
function plainText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/gu,
      (value) =>
        ({
          '&nbsp;': ' ',
          '&amp;': '&',
          '&lt;': '<',
          '&gt;': '>',
          '&quot;': '"',
          '&#39;': "'",
        })[value] ?? ' ',
    )
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 20000);
}
export function decodeJobs(payload: unknown, fetchedAt: string): JobsResponse {
  if (
    !record(payload) ||
    !Array.isArray(payload.data) ||
    payload.data.length > 1000
  )
    throw new Error('Invalid job feed');
  const jobs: PublicJob[] = [];
  const seen = new Set<string>();
  for (const raw of payload.data) {
    if (
      !record(raw) ||
      !text(raw.slug, 500) ||
      !text(raw.title, 500) ||
      !text(raw.company_name, 300) ||
      !originalUrl(raw.url) ||
      typeof raw.description !== 'string' ||
      raw.description.length > 150000 ||
      seen.has(raw.url)
    )
      continue;
    seen.add(raw.url);
    const timestamp =
      typeof raw.created_at === 'number' &&
      Number.isSafeInteger(raw.created_at) &&
      raw.created_at > 0 &&
      raw.created_at <= Date.now() / 1000 + 86400
        ? new Date(raw.created_at * 1000).toISOString()
        : null;
    jobs.push({
      id: raw.slug,
      title: raw.title.trim(),
      company: raw.company_name.trim(),
      location: text(raw.location, 500) ? raw.location.trim() : null,
      remote: typeof raw.remote === 'boolean' ? raw.remote : null,
      source: 'Arbeitnow',
      url: raw.url,
      publishedAt: timestamp,
      tags: Array.isArray(raw.tags)
        ? raw.tags.filter((tag): tag is string => text(tag, 120)).slice(0, 50)
        : [],
      description: plainText(raw.description),
    });
  }
  if (payload.data.length && !jobs.length) throw new Error('No valid job rows');
  return {
    source: 'Arbeitnow',
    sourceUrl: JOBS_SOURCE,
    fetchedAt,
    jobs,
    omittedCount: payload.data.length - jobs.length,
    scope:
      'Latest feed page; primarily Germany/Europe. Not an exhaustive search.',
  };
}
@Injectable()
export class JobsService {
  private cached: { expires: number; value: JobsResponse } | undefined;
  private pending: Promise<JobsResponse> | undefined;
  list(): Promise<JobsResponse> {
    if (this.cached && Date.now() < this.cached.expires)
      return Promise.resolve(this.cached.value);
    if (!this.pending)
      this.pending = this.fetchLatest().finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  private async fetchLatest(): Promise<JobsResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(JOBS_SOURCE, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok || !response.body) {
        void response.body?.cancel().catch(() => {});
        throw new Error('Source unavailable');
      }
      reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_BYTES) throw new Error('Feed too large');
        chunks.push(chunk.value);
      }
      const value = decodeJobs(
        JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        ),
        new Date().toISOString(),
      );
      this.cached = { expires: Date.now() + 300000, value };
      return value;
    } catch {
      throw new ServiceUnavailableException(
        'Job source unavailable. Retry later. No sample jobs were substituted.',
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      if (reader) {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
  }
}
