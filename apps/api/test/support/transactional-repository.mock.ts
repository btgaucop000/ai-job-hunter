import { jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';
export function transactionalRepository<T extends object>(rows: T) {
  const manager = { query: jest.fn(async () => []), getRepository: () => rows };
  return Object.assign(rows, {
    manager: {
      transaction: async (run: (value: EntityManager) => Promise<unknown>) =>
        run(manager as unknown as EntityManager),
    },
  });
}
