import { HttpException } from '@nestjs/common';

const failures = {
  CV_SUGGESTIONS_INVALID_REQUEST: [
    400,
    'Provide only a valid matchId from CV Match.',
  ],
  CV_SUGGESTIONS_JOB_NOT_FOUND: [404, 'Saved opportunity not found.'],
  CV_SUGGESTIONS_BUSY: [
    409,
    'A CV match or suggestions request is already running. Retry after it finishes.',
  ],
  CV_SUGGESTIONS_STALE_MATCH: [
    409,
    'Match context is unavailable or stale. Reanalyze CV Match.',
  ],
  CV_SUGGESTIONS_CONTEXT_LIMIT: [
    400,
    'Suggestion evidence exceeds the local context budget. Use concise saved sources and reanalyze.',
  ],
  CV_SUGGESTIONS_INVALID_OUTPUT: [
    503,
    'Local model returned invalid suggestion selection. Retry; no new suggestions were produced.',
  ],
  CV_SUGGESTIONS_UNAVAILABLE: [
    503,
    'Local CV suggestions are unavailable. Check the local API and Ollama, then retry.',
  ],
  CV_SUGGESTIONS_TIMEOUT: [
    504,
    'Local suggestion selection timed out. Check Ollama and retry.',
  ],
} as const;

export class CvSuggestionsError extends HttpException {
  constructor(readonly errorCode: keyof typeof failures) {
    const [status, message] = failures[errorCode];
    super(message, status);
  }
}
