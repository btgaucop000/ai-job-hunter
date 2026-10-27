import { Controller, Post, Req, Res, Catch, UseFilters } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { AnalysisService } from './analysis.service.js';
import { AnalysisError } from './analysis.errors.js';
import { sendAnalysisError } from './analysis-http.js';
import type { AnalysisRequest } from './analysis-http.js';

@Catch()
export class AnalysisExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    sendAnalysisError(
      http.getRequest<AnalysisRequest>(),
      http.getResponse<ServerResponse>(),
      error,
    );
  }
}
@Controller('analyses')
@UseFilters(AnalysisExceptionFilter)
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}
  @Post()
  async create(
    @Req() req: AnalysisRequest,
    @Res() res: ServerResponse,
  ): Promise<void> {
    // Fail closed if bootstrap omitted the before-body security boundary.
    if (!req.analysis) throw new AnalysisError('LOCAL_REQUEST_DENIED');
    await this.analysis.run(req, res);
  }
}
