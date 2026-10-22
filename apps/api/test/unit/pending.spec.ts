import 'reflect-metadata';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { HealthService } from '../../src/health/health.service.js';

const query = jest.fn<() => Promise<unknown>>();
let service: HealthService;
let end: ReturnType<typeof jest.spyOn>;
beforeEach(() => {
  jest.useFakeTimers();
  query.mockReset().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  jest
    .spyOn(Client.prototype, 'connect')
    .mockImplementation(() => Promise.resolve());
  jest
    .spyOn(Client.prototype, 'query')
    .mockImplementation((() => query()) as Client['query']);
  end = jest
    .spyOn(Client.prototype, 'end')
    .mockImplementation(() => Promise.resolve());
  service = new HealthService(new DataSource({ type: 'postgres' }));
});
afterEach(() => {
  service.onModuleDestroy();
  jest.useRealTimers();
});

test('returns ready on query success and closes its connection', async () => {
  expect(await service.isReady()).toBe(true);
  expect(end).toHaveBeenCalledTimes(1);
});
test('returns unavailable on query rejection', async () => {
  query.mockRejectedValueOnce(new Error('private connection diagnostic'));
  expect(await service.isReady()).toBe(false);
});
test('returns unavailable on connection failure', async () => {
  jest
    .spyOn(Client.prototype, 'connect')
    .mockImplementationOnce(() => Promise.reject(new Error('offline')));
  expect(await service.isReady()).toBe(false);
  expect(query).not.toHaveBeenCalled();
});
test('enforces the 1500 ms deadline, closes an unresolved query, and permits recovery', async () => {
  query.mockImplementationOnce(() => new Promise(() => {}));
  let settled = false;
  const first = service.isReady().then((value) => {
    settled = true;
    return value;
  });
  await jest.advanceTimersByTimeAsync(1499);
  expect(settled).toBe(false);
  await jest.advanceTimersByTimeAsync(1);
  expect(await first).toBe(false);
  expect(end).toHaveBeenCalledTimes(1);
  expect(await service.isReady()).toBe(true);
  expect(query).toHaveBeenCalledTimes(2);
});
test('concurrent requests share a single query', async () => {
  let complete!: (value: unknown) => void;
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const requests = [service.isReady(), service.isReady(), service.isReady()];
  await jest.advanceTimersByTimeAsync(0);
  expect(query).toHaveBeenCalledTimes(1);
  complete([]);
  expect(await Promise.all(requests)).toEqual([true, true, true]);
});
test('recovers after a rejected query settles', async () => {
  query.mockRejectedValueOnce(new Error('transient'));
  expect(await service.isReady()).toBe(false);
  expect(await service.isReady()).toBe(true);
});
test('late completion of an expired query cannot complete a newer probe', async () => {
  let complete!: (value: unknown) => void;
  query.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const first = service.isReady();
  await jest.advanceTimersByTimeAsync(1500);
  expect(await first).toBe(false);
  query.mockImplementationOnce(() => new Promise(() => {}));
  const second = service.isReady();
  await jest.advanceTimersByTimeAsync(0);
  complete([]);
  await jest.advanceTimersByTimeAsync(1500);
  expect(await second).toBe(false);
});
test('shutdown cancels a pending probe', async () => {
  query.mockImplementationOnce(() => new Promise(() => {}));
  const pending = service.isReady();
  await jest.advanceTimersByTimeAsync(0);
  service.onModuleDestroy();
  expect(await pending).toBe(false);
  expect(end).toHaveBeenCalledTimes(1);
});
