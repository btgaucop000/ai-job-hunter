import { Controller, Get, Header } from '@nestjs/common';
import { JobsService } from './jobs.service.js';
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list() {
    return this.jobs.list();
  }
}
