import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { databaseOptions } from './database.config.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        ...databaseOptions(
          process.env.NODE_ENV === 'test' ? 'test' : 'development',
        ),
        retryAttempts: 1,
      }),
    }),
  ],
})
export class DatabaseModule {}
