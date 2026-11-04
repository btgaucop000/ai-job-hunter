import 'reflect-metadata';
import { expect, jest, test } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { DiscoveryCandidate } from '../../src/discovery/discovery-candidate.entity.js';
import { DiscoveryQueueService } from '../../src/discovery/discovery-queue.service.js';
import {
  validateCandidateSnapshot,
  validateQueueQuery,
} from '../../src/discovery/discovery-candidate.validation.js';
import { candidateSnapshot } from '../support/discovery-candidate.synthetic.js';

test('accepts bounded synthetic snapshot and rejects invalid text, metadata and unsafe links', () => {
  expect(validateCandidateSnapshot(candidateSnapshot())).toEqual(
    candidateSnapshot(),
  );
  const valid = candidateSnapshot();
  for (const value of [
    null,
    [],
    { ...valid, extra: true },
    { ...valid, title: ' ' },
    { ...valid, description: 'x'.repeat(26001) },
    { ...valid, skills: 'x'.repeat(10001) },
    { ...valid, company: 42 },
    { ...valid, originalLink: 'javascript:alert(1)' },
    { ...valid, originalLink: 'https://user:password@example.com/job' },
    { ...valid, discovery: { ...valid.discovery, sourceJobId: '' } },
    {
      ...valid,
      discovery: {
        ...valid.discovery,
        discoveredAt: '2026-02-30T00:00:00.000Z',
      },
    },
    {
      ...valid,
      discovery: { ...valid.discovery, techStack: Array(5).fill('Java') },
    },
    {
      ...valid,
      discovery: {
        ...valid.discovery,
        requirementSkills: { required: 'Java', preferred: '', extra: true },
      },
    },
  ])
    expect(() => validateCandidateSnapshot(value)).toThrow(BadRequestException);
});

test('validates only supported filters and positive safe integer pages', () => {
  expect(validateQueueQuery()).toEqual({ filter: 'to-review', page: 1 });
  for (const filter of [
    'to-review',
    'new',
    'seen',
    'saved',
    'dismissed',
    'all',
  ])
    expect(validateQueueQuery({ filter, page: '2' })).toEqual({
      filter,
      page: 2,
    });
  for (const value of [
    null,
    [],
    { filter: 'NEW' },
    { filter: null },
    { page: 0 },
    { page: -1 },
    { page: 1.5 },
    { page: '1e2' },
    { page: ' 2' },
    { page: Number.MAX_SAFE_INTEGER + 1 },
    { page: ['1'] },
    { page: null },
    { ownerId: 'client-owner' },
    { pageSize: 100 },
  ])
    expect(() => validateQueueQuery(value)).toThrow(BadRequestException);
});

test('candidate lookup always includes owner, hides missing/other-owner records and rejects malformed IDs', async () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const id = '00000000-0000-4000-8000-000000000002';
  const findOneBy = jest
    .fn<Repository<DiscoveryCandidate>['findOneBy']>()
    .mockResolvedValue(null);
  const service = new DiscoveryQueueService({
    findOneBy,
  } as unknown as Repository<DiscoveryCandidate>);
  await expect(service.get(owner, id)).rejects.toThrow(NotFoundException);
  expect(findOneBy).toHaveBeenCalledWith({ ownerId: owner, id });
  await expect(service.get(owner, 'invalid')).rejects.toThrow(
    BadRequestException,
  );
  expect(findOneBy).toHaveBeenCalledTimes(1);
  const candidate = Object.assign(new DiscoveryCandidate(), {
    id,
    ownerId: owner,
    status: 'NEW',
  });
  findOneBy.mockResolvedValue(candidate);
  expect(await service.get(owner, id)).toBe(candidate);
  expect(candidate.status).toBe('NEW');
});

test.each([
  { total: 0, requested: 99, page: 1, pages: 0, offset: 0 },
  { total: 11, requested: 99, page: 2, pages: 2, offset: 10 },
  { total: 20, requested: 1, page: 1, pages: 2, offset: 0 },
])(
  'clamps page $requested for $total rows in one read transaction',
  async ({ total, requested, page, pages, offset }) => {
    const rows = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getCount: jest.fn<() => Promise<number>>().mockResolvedValue(total),
      getMany: jest
        .fn<() => Promise<DiscoveryCandidate[]>>()
        .mockResolvedValue([]),
    };
    const manager = {
      query: jest
        .fn<(sql: string) => Promise<void>>()
        .mockResolvedValue(undefined),
      getRepository: () => ({ createQueryBuilder: () => rows }),
    };
    const transaction = jest.fn(
      async (
        _isolation: string,
        run: (value: typeof manager) => Promise<unknown>,
      ) => run(manager),
    );
    const service = new DiscoveryQueueService({
      manager: { transaction },
    } as unknown as Repository<DiscoveryCandidate>);
    const owner = '00000000-0000-4000-8000-000000000001';
    expect(await service.list(owner, { page: requested })).toEqual({
      items: [],
      total,
      page,
      totalPages: pages,
      pageSize: 10,
    });
    expect(transaction).toHaveBeenCalledWith(
      'REPEATABLE READ',
      expect.any(Function),
    );
    expect(manager.query).toHaveBeenCalledWith('SET TRANSACTION READ ONLY');
    expect(rows.where).toHaveBeenCalledWith('candidate.ownerId = :ownerId', {
      ownerId: owner,
    });
    expect(rows.andWhere).toHaveBeenCalledWith(
      'candidate.status IN (:...statuses)',
      { statuses: ['NEW', 'SEEN'] },
    );
    expect(rows.offset).toHaveBeenCalledWith(offset);
    expect(rows.limit).toHaveBeenCalledWith(10);
    await expect(service.list(owner, { ownerId: 'untrusted' })).rejects.toThrow(
      BadRequestException,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  },
);
