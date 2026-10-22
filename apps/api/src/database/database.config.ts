import type { DataSourceOptions } from 'typeorm';
import { CreateApplicationSchema1792598400000 } from './migrations/1792598400000-CreateApplicationSchema.js';

type DatabaseTarget = 'development' | 'test';

export function databaseOptions(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  if (env.DB_ENV !== target) {
    throw new Error(`DB_ENV must be ${target} for this database entry point`);
  }
  if (env.NODE_ENV === 'test' && target !== 'test') {
    throw new Error('Test processes cannot use the development database');
  }
  const identity =
    target === 'test' ? 'ai_job_hunter_test' : 'ai_job_hunter_dev';
  if (env.DB_NAME !== identity || env.DB_USER !== identity) {
    throw new Error(`Database name and role must both be ${identity}`);
  }
  if (env.DB_HOST !== '127.0.0.1') {
    throw new Error('Local database connections require DB_HOST=127.0.0.1');
  }
  const port = Number(env.DB_PORT);
  if (!env.DB_PORT || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535');
  }
  if (target === 'test' && (port !== 5433 || env.NODE_ENV !== 'test')) {
    throw new Error('Test database requires port 5433 and NODE_ENV=test');
  }
  if (target === 'development' && port === 5433) {
    throw new Error('Port 5433 is reserved for the isolated test database');
  }
  if (!env.DB_PASSWORD || env.DB_PASSWORD.startsWith('replace-with-')) {
    throw new Error('Set a non-placeholder DB_PASSWORD in the environment');
  }
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    // History stays in public so it can exist before the application schema.
    schema: 'public',
    migrationsTableName: 'typeorm_migrations',
    entities: [],
    migrations: [CreateApplicationSchema1792598400000],
    synchronize: false,
    migrationsRun: false,
    migrationsTransactionMode: 'all',
    logging: false,
    connectTimeoutMS: 5000,
    extra: { max: 5, statement_timeout: 10000 },
  };
}
