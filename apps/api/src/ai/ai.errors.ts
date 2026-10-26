const messages = {
  CONTEXT_UNVERIFIED: 'AI context profile could not be verified',
  CONTEXT_LIMIT_EXCEEDED: 'AI prompt exceeds the context budget',
  OUTPUT_LIMIT_EXCEEDED: 'AI generation exceeded the output token limit',
  INVALID_SCHEMA: 'Invalid or unsupported AI output schema',
  TIMEOUT: 'AI request timed out',
  CONNECTION_FAILURE: 'AI provider connection failed',
  UPSTREAM_HTTP_FAILURE: 'AI provider returned an unsuccessful HTTP status',
  MALFORMED_RESPONSE: 'AI provider returned a malformed response',
  INVALID_JSON: 'AI output is not valid JSON',
  SCHEMA_VALIDATION_FAILURE: 'AI output does not match the required schema',
  RESPONSE_TOO_LARGE: 'AI provider response exceeds the size limit',
} as const;

export class AiError extends Error {
  constructor(public readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = 'AiError';
  }
}
