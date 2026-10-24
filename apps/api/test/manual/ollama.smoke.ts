import 'reflect-metadata';
import { deepStrictEqual, ok } from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AiModule } from '../../src/ai/ai.module.js';
import { AiService } from '../../src/ai/ai.service.js';
import { AiError } from '../../src/ai/ai.errors.js';

const started = performance.now();
let app: INestApplicationContext | undefined;
let failure: string | undefined;
try {
  if (process.env.CI) throw new Error('Local invocation required');
  // Pin this synthetic smoke test to local Ollama regardless of inherited settings.
  process.env.AI_PROVIDER = 'ollama';
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
  process.env.OLLAMA_MODEL = 'qwen3:4b';
  process.env.AI_REQUEST_TIMEOUT_MS = '120000';
  app = await NestFactory.createApplicationContext(AiModule, {
    logger: false,
    abortOnError: false,
  });
  const result = await app.get(AiService).generateStructured({
    prompt: `Extract the person's name and explicitly mentioned skills from the text below. Return only JSON with name and skills. Each skill has name and yearsOfExperience. Use null when no duration is explicitly stated for that skill; never substitute zero or infer duration from another skill. Do not add skills.\n\nNguyen Van A has experience with React, NestJS and PostgreSQL. He has worked with React for 5 years. No experience duration is specified for NestJS or PostgreSQL.`,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              yearsOfExperience: { type: ['number', 'null'], minimum: 0 },
            },
            required: ['name', 'yearsOfExperience'],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'skills'],
      additionalProperties: false,
    },
  });
  // Assert semantics independently of the schema; do not constrain the model to
  // the expected names/durations with enum or const values in its output schema.
  ok(
    result &&
      typeof result === 'object' &&
      'name' in result &&
      'skills' in result,
  );
  ok(Array.isArray(result.skills));
  const skills = result.skills
    .map((skill: unknown) => {
      ok(skill && typeof skill === 'object' && 'name' in skill);
      ok(typeof skill.name === 'string');
      return { ...skill, name: skill.name };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  deepStrictEqual(
    { name: result.name, skills },
    {
      name: 'Nguyen Van A',
      skills: [
        { name: 'NestJS', yearsOfExperience: null },
        { name: 'PostgreSQL', yearsOfExperience: null },
        { name: 'React', yearsOfExperience: 5 },
      ],
    },
  );
} catch (error: unknown) {
  // Never print assertion diagnostics, raw errors, prompts, or model output.
  failure =
    error instanceof AiError ? error.code : 'SETUP_OR_ASSERTION_FAILURE';
} finally {
  try {
    await app?.close();
  } catch {
    failure = 'CLEANUP_FAILURE';
  }
}
const elapsed = Math.round(performance.now() - started);
if (failure) {
  console.error(`Ollama smoke FAIL (${failure}); elapsed_ms=${elapsed}`);
  process.exitCode = 1;
} else {
  console.log(
    `Ollama smoke PASS: validated name and exactly three skills; React=5, NestJS=null, PostgreSQL=null; local qwen3:4b; elapsed_ms=${elapsed}`,
  );
}
