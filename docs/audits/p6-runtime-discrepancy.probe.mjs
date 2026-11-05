// P6.8 diagnostic updated for the approved P6.9 CI/CD semantics, against
// the running API. No environment file, database, saved CV, server or model call.
import '../../apps/api/node_modules/reflect-metadata/Reflect.js';
import { readFileSync } from 'node:fs';
import { deepStrictEqual, strictEqual } from 'node:assert';
import {
  canonicalRequirements,
  matchJobText,
  matchOutputSchema,
  scoreCvMatch,
  validateMatchAssessment,
} from '../../apps/api/dist/matching/cv-match.js';
import { requirementGroup } from '../../apps/api/dist/matching/cv-match.coverage.js';

const golden = JSON.parse(
  readFileSync(
    new URL(
      './fixtures/itviec-ai-solution-architect.golden.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const requirement = golden.mustHave[5].quote;
const job = (skills = requirement) => ({
  title: 'Synthetic P6.8 diagnosis',
  skills,
  preferredSkills: '',
  experience: '',
  domain: '',
  seniority: '',
  description: '',
  postText: '',
  jdText: '',
});
const group = requirementGroup(requirement, 'skill');
strictEqual(group.mode, 'AND');
strictEqual(group.context, 'design');
strictEqual(group.components.length, 5);

const cases = [
  [
    'designed pipeline, omitted selection',
    'Designed GitLab CI/CD pipelines.',
    '',
    20,
    ['CI/CD practices'],
  ],
  [
    'optimized pipeline, omitted selection',
    'Optimized GitLab CI/CD pipelines.',
    '',
    20,
    ['CI/CD practices'],
  ],
  [
    'optimized pipeline, valid selected quote',
    'Optimized GitLab CI/CD pipelines.',
    'Optimized GitLab CI/CD pipelines.',
    20,
    ['CI/CD practices'],
  ],
  [
    'keyword list only',
    'Skills: REST APIs, microservices, RabbitMQ, GitLab CI/CD.',
    '',
    0,
    [],
  ],
  [
    'implementation wording (hypothetical)',
    'Developed REST APIs using microservices and RabbitMQ.',
    '',
    0,
    [],
  ],
  ['designed API, omitted selection', 'Designed REST APIs.', '', 20, ['APIs']],
  [
    'designed API and optimized pipeline',
    'Designed REST APIs.\nOptimized GitLab CI/CD pipelines.',
    '',
    40,
    ['APIs', 'CI/CD practices'],
  ],
  [
    'AWS and RabbitMQ only',
    'Designed AWS deployments and RabbitMQ queues.',
    '',
    0,
    [],
  ],
  [
    'three explicit design statements',
    'Designed REST APIs.\nDesigned service integrations using RabbitMQ.\nDesigned GitLab CI/CD pipelines.',
    '',
    60,
    ['APIs', 'integrations', 'CI/CD practices'],
  ],
];
for (const [name, cv, quote, score, labels] of cases) {
  const canonical = canonicalRequirements(job());
  const jd = matchJobText(job());
  strictEqual(
    matchOutputSchema(
      cv,
    ).properties.requirements.items.properties.cvQuote.enum.includes(quote),
    true,
  );
  const verified = validateMatchAssessment(
    [{ ...canonical[0], cvQuote: quote }],
    cv,
    jd,
    canonical,
  );
  const result = scoreCvMatch(verified, cv, jd, canonical);
  strictEqual(result.score, score);
  strictEqual(Boolean(verified[0].cvEvidenceUnverified), false);
  deepStrictEqual(
    result.requirements[0].coverage.components
      .filter((row) => row.status === 'EVIDENCED')
      .map((row) => row.label),
    labels,
  );
  console.log(
    JSON.stringify({
      name,
      score: result.score,
      status: result.requirements[0].status,
      supported: labels,
      modelEvidenceRejected: false,
    }),
  );
}

// Distinguish the rejection gate from a valid omission using source-backed
// independent Python evidence so the existing per-parent downgrade is reached.
const saved = job(`${requirement}\nPython`);
const canonical = canonicalRequirements(saved),
  jd = matchJobText(saved);
const cv = 'Designed REST APIs.\nBuilt Python services.';
const verified = validateMatchAssessment(
  canonical.map((row, index) => ({
    ...row,
    cvQuote: index
      ? 'Built Python services.'
      : 'Fabricated model qualification.',
  })),
  cv,
  jd,
  canonical,
);
strictEqual(verified[0].cvEvidenceUnverified, true);
strictEqual(
  scoreCvMatch(verified, cv, jd, canonical).requirements[0].status,
  'NOT_EVIDENCED',
);
console.log(
  JSON.stringify({
    name: 'rejected parent blocks otherwise valid design recovery',
    modelEvidenceRejected: true,
    architectureStatus: 'NOT_EVIDENCED',
  }),
);
console.log(
  'PASS: 10 synthetic diagnostic cases; no network/model/database calls.',
);
