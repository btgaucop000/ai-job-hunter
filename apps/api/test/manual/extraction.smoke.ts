import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { ExtractionModule } from '../../src/extraction/extraction.module.js';
import { ExtractionService } from '../../src/extraction/extraction.service.js';
import { ExtractionError } from '../../src/extraction/extraction.errors.js';
import { AiError } from '../../src/ai/ai.errors.js';
import {
  evaluationSchedule,
  assessFields,
  classify,
} from '../support/extraction-evaluation.js';

let app: INestApplicationContext | undefined;
let qualityIssues = 0;
let attemptedCases = 0;
const schedule = evaluationSchedule();
let ordinaryAttempts = 0;
let ordinaryFailures = 0;
let priorityAcceptancePassed = false;
try {
  if (process.env.CI) throw new Error();
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
  process.env.OLLAMA_MODEL = 'qwen3:4b';
  process.env.AI_REQUEST_TIMEOUT_MS = '120000';
  app = await NestFactory.createApplicationContext(ExtractionModule, {
    logger: false,
    abortOnError: false,
  });
  const service = app.get(ExtractionService);
  for (const { fixture, attempt } of schedule) {
    const ordinary =
      fixture.id === 'cv-simple-pdf' || fixture.id === 'cv-simple-docx';
    if (ordinary) ordinaryAttempts++;
    attemptedCases++;
    const start = performance.now();
    try {
      const result =
        fixture.input.kind === 'cv'
          ? await service.extractCv(fixture.input.value)
          : await service.extractJd(fixture.input.value);
      const assessment = assessFields(fixture, result);
      const valid =
        assessment.categories.length === 1 &&
        assessment.categories[0] === 'VALID_EXTRACTION';
      if (ordinary && !valid) ordinaryFailures++;
      if (fixture.id === 'jd-priority') priorityAcceptancePassed = valid;
      const classification = classify(assessment);
      if (!valid) qualityIssues++;
      console.log(
        JSON.stringify({
          case: fixture.id,
          attempt,
          outcome: 'SUCCESS',
          code: null,
          classification,
          latencyMs: Math.round(performance.now() - start),
          ...assessment,
        }),
      );
    } catch (error: unknown) {
      qualityIssues++;
      if (ordinary) ordinaryFailures++;
      const code =
        error instanceof AiError || error instanceof ExtractionError
          ? error.code
          : 'UNEXPECTED_FAILURE';
      const classification = [
        'CONTEXT_LIMIT_EXCEEDED',
        'OUTPUT_LIMIT_EXCEEDED',
        'OUTPUT_TOO_LARGE',
        'PROMPT_TOO_LARGE',
      ].includes(code)
        ? 'BUDGET_LIMITATION'
        : 'FAIL_CLOSED_REJECTION';
      // A rejection exposes no result: do not infer hallucination or expected-fact
      // presence from INVALID_EVIDENCE alone, and never inspect raw model output.
      console.log(
        JSON.stringify({
          case: fixture.id,
          attempt,
          outcome: 'REJECTED',
          categories: ['REJECTED_EXTRACTION'],
          code,
          classification,
          latencyMs: Math.round(performance.now() - start),
          expectedFactsPresent: null,
          unsupportedFactsAppear: null,
        }),
      );
      if (
        [
          'CONNECTION_FAILURE',
          'CONTEXT_UNVERIFIED',
          'EXTRACTION_UNAVAILABLE',
        ].includes(code)
      )
        break;
    }
  }
} catch {
  qualityIssues++;
  console.log(
    JSON.stringify({
      outcome: 'NOT_RUN',
      code: process.env.CI ? 'CI_REFUSED' : 'SETUP_FAILURE',
    }),
  );
} finally {
  try {
    await app?.close();
  } catch {
    qualityIssues++;
    console.log(JSON.stringify({ outcome: 'FAILED', code: 'CLEANUP_FAILURE' }));
  }
}
console.log(
  JSON.stringify({
    outcome: 'EVALUATION_FINISHED',
    qualityIssues,
    semanticCompletenessGuaranteed: false,
    attemptedCases,
    notRunCases: schedule.length - attemptedCases,
    ordinaryAttempts,
    ordinaryFailures,
    ordinaryAcceptancePassed: ordinaryAttempts === 6 && ordinaryFailures === 0,
    priorityAcceptancePassed,
  }),
);
// Nonzero means review is needed, not necessarily a validator/security defect.
if (qualityIssues) process.exitCode = 1;
