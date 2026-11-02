import { AiError } from './ai.errors.js';
import { emitFinalLengthDiagnostic } from './ai-generation.diagnostics.js';

export const OLLAMA_CONTEXT_PROFILE = Object.freeze({
  version: '0.40.10',
  model: 'qwen3:4b',
  digest: '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7',
  contextTokens: 8192,
  outputTokens: 2048,
  maxOutputTokens: 4096,
  safetyTokens: 64,
  maxPromptTokens: 6080,
});
export function outputBudget(promptTokens: number): number {
  const p = OLLAMA_CONTEXT_PROFILE;
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 1)
    throw new AiError('MALFORMED_RESPONSE');
  const budget = Math.min(
    p.maxOutputTokens,
    p.contextTokens - promptTokens - p.safetyTokens,
  );
  if (budget < p.outputTokens) throw new AiError('CONTEXT_LIMIT_EXCEEDED');
  return budget;
}
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function verifyProfile(version: unknown, tags: unknown): void {
  const p = OLLAMA_CONTEXT_PROFILE;
  if (
    !record(version) ||
    version.version !== p.version ||
    !record(tags) ||
    !Array.isArray(tags.models)
  )
    throw new AiError('CONTEXT_UNVERIFIED');
  const matches = tags.models.filter(
    (m: unknown) => record(m) && m.name === p.model,
  );
  if (
    matches.length !== 1 ||
    !record(matches[0]) ||
    matches[0].digest !== p.digest
  )
    throw new AiError('CONTEXT_UNVERIFIED');
}
export function verifyAllocation(value: unknown): void {
  const p = OLLAMA_CONTEXT_PROFILE;
  if (!record(value) || !Array.isArray(value.models))
    throw new AiError('CONTEXT_UNVERIFIED');
  const matches = value.models.filter(
    (m: unknown) => record(m) && m.name === p.model,
  );
  if (
    matches.length !== 1 ||
    !record(matches[0]) ||
    matches[0].digest !== p.digest ||
    matches[0].context_length !== p.contextTokens ||
    matches[0].runner !== 'llamacpp'
  )
    throw new AiError('CONTEXT_UNVERIFIED');
}
export function validateGeneration(
  value: unknown,
  measurement: boolean,
  outputTokenLimit: number = OLLAMA_CONTEXT_PROFILE.outputTokens,
): { text: string; promptTokens: number } {
  const p = OLLAMA_CONTEXT_PROFILE;
  const integer = (n: unknown): n is number =>
    typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (
    !Number.isSafeInteger(outputTokenLimit) ||
    outputTokenLimit < p.outputTokens ||
    outputTokenLimit > p.maxOutputTokens ||
    !record(value) ||
    value.model !== p.model ||
    value.done !== true ||
    typeof value.response !== 'string' ||
    'error' in value ||
    ('thinking' in value && value.thinking !== '') ||
    !integer(value.prompt_eval_count) ||
    value.prompt_eval_count < 1 ||
    !integer(value.eval_count) ||
    value.eval_count < 1 ||
    value.eval_count > (measurement ? 1 : outputTokenLimit) ||
    !integer(value.prompt_eval_cached_count) ||
    value.prompt_eval_cached_count > value.prompt_eval_count ||
    !['stop', 'length'].includes(value.done_reason as string)
  )
    throw new AiError('MALFORMED_RESPONSE');
  if (!measurement && value.done_reason !== 'stop') {
    let jsonSyntax: 'VALID' | 'INVALID' = 'VALID';
    try {
      JSON.parse(value.response);
    } catch {
      jsonSyntax = 'INVALID';
    }
    emitFinalLengthDiagnostic({
      promptTokens: value.prompt_eval_count,
      evalCount: value.eval_count,
      outputTokenLimit,
      jsonSyntax,
    });
    throw new AiError('OUTPUT_LIMIT_EXCEEDED');
  }
  if (
    value.prompt_eval_count > p.maxPromptTokens ||
    value.prompt_eval_count + value.eval_count + p.safetyTokens >
      p.contextTokens
  )
    throw new AiError('CONTEXT_LIMIT_EXCEEDED');
  return { text: value.response, promptTokens: value.prompt_eval_count };
}
