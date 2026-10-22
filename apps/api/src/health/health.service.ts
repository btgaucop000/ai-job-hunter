import { Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private pending: Promise<boolean> | undefined;
  private cancel: (() => void) | undefined;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  isReady(): Promise<boolean> {
    if (!this.pending) {
      this.pending = this.probe().finally(() => {
        this.pending = undefined;
      });
    }
    return this.pending;
  }

  onModuleDestroy(): void {
    this.cancel?.();
  }

  private probe(): Promise<boolean> {
    const options = this.dataSource.options;
    if (options.type !== 'postgres') return Promise.resolve(false);
    // Own this connection so the deadline can close it without harming pooled work.
    const client = new Client({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      // TypeORM uses older TLS typings for the same pg driver option.
      ssl: options.ssl as ClientConfig['ssl'],
      connectionTimeoutMillis: 1000,
      statement_timeout: 1000,
      application_name: 'ai-job-hunter-readiness',
    });
    return new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (ready: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.cancel = undefined;
        // pg forcibly closes an active query's socket; do not wait on cleanup
        // to satisfy the HTTP deadline. The rejection is handled explicitly.
        void client.end().catch(() => {});
        resolve(ready);
      };
      const timer = setTimeout(() => finish(false), 1500);
      this.cancel = () => finish(false);
      client.on('error', () => finish(false));
      void client
        .connect()
        .then(async () => {
          if (finished) return;
          await client.query('SELECT 1');
          finish(true);
        })
        .catch(() => finish(false));
    });
  }
}
