import { BadRequestException } from '@nestjs/common';
import { Ajv } from 'ajv';
import type { DiscoveredJob } from './discovery.js';

export const CANDIDATE_STATUSES = [
  'NEW',
  'SEEN',
  'SAVED',
  'DISMISSED',
] as const;
export const QUEUE_FILTERS = [
  'to-review',
  'new',
  'seen',
  'saved',
  'dismissed',
  'all',
] as const;
export type QueueFilter = (typeof QUEUE_FILTERS)[number];
export const QUEUE_PAGE_SIZE = 10;
export const SNAPSHOT_MAX_BYTES = 512 * 1024;
const text = (maxLength: number) => ({ type: 'string', maxLength });
const fields = {
  title: { ...text(300), minLength: 1, pattern: '\\S' },
  company: text(300),
  location: text(2000),
  workMode: text(2000),
  seniority: text(2000),
  skills: text(10000),
  preferredSkills: text(10000),
  description: text(26000),
  originalLink: { ...text(2048), minLength: 1 },
};
const validateSnapshot = new Ajv().compile<DiscoveredJob>({
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(fields), 'discovery'],
  properties: {
    ...fields,
    discovery: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceName', 'sourceJobId', 'sourceUrl', 'discoveredAt'],
      properties: {
        sourceName: { ...text(200), minLength: 1, pattern: '\\S' },
        sourceJobId: { ...text(200), minLength: 1, pattern: '\\S' },
        sourceUrl: { ...text(2048), minLength: 1 },
        discoveredAt: text(24),
        techStack: { type: 'array', maxItems: 4, items: text(100) },
        requirementSkills: {
          type: 'object',
          additionalProperties: false,
          required: ['required', 'preferred'],
          properties: { required: text(10000), preferred: text(10000) },
        },
      },
    },
  },
});
function safeHttps(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.port
    );
  } catch {
    return false;
  }
}
// Storage validation only; source adapters still enforce their destination allowlists.
export function validateCandidateSnapshot(value: unknown): DiscoveredJob {
  if (!validateSnapshot(value))
    throw new BadRequestException('Invalid discovery candidate snapshot.');
  const at = value.discovery.discoveredAt;
  if (
    !safeHttps(value.originalLink) ||
    !safeHttps(value.discovery.sourceUrl) ||
    !Number.isFinite(Date.parse(at)) ||
    new Date(at).toISOString() !== at ||
    Buffer.byteLength(JSON.stringify(value), 'utf8') > SNAPSHOT_MAX_BYTES
  )
    throw new BadRequestException('Invalid discovery candidate snapshot.');
  return value;
}
export function validateQueueQuery(value: unknown = {}): {
  filter: QueueFilter;
  page: number;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid discovery queue query.');
  const row = value as Record<string, unknown>;
  const filter = row.filter === undefined ? 'to-review' : row.filter;
  const page = row.page === undefined ? 1 : row.page;
  const parsed =
    typeof page === 'string' && /^[1-9]\d*$/.test(page) ? Number(page) : page;
  if (
    Object.keys(row).some((key) => !['filter', 'page'].includes(key)) ||
    typeof filter !== 'string' ||
    !QUEUE_FILTERS.includes(filter as QueueFilter) ||
    typeof parsed !== 'number' ||
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  )
    throw new BadRequestException(
      'Choose a valid queue filter and positive page number.',
    );
  return { filter: filter as QueueFilter, page: parsed };
}
export function validateQueueId(value: string): void {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException('Invalid discovery queue identifier.');
}
