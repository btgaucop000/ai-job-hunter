import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApplicationSchema1792598400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE SCHEMA "ai_job_hunter"');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No CASCADE: refuse to drop the schema if it contains application objects.
    await queryRunner.query('DROP SCHEMA "ai_job_hunter"');
  }
}
