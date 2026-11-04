// Offline audit probe, not a production extractor or a golden-completeness test.
// Run from the repository root after pnpm --filter @ai-job-hunter/api test:compile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const requireApi = createRequire(
  new URL('../../apps/api/package.json', import.meta.url),
);
requireApi('reflect-metadata');
const { JobImportService } =
  await import('../../apps/api/.test-dist/src/opportunities/job-import.service.js');
const { requirementLines, sectionCandidates, normalizeRequirementCandidates } =
  await import('../../apps/api/.test-dist/src/opportunities/job-import.sections.js');
const { sourceCandidates } =
  await import('../../apps/api/.test-dist/src/opportunities/job-import.evidence.js');
const { validateImportReview } =
  await import('../../apps/api/.test-dist/src/opportunities/job-import.contract.js');
const golden = JSON.parse(
  readFileSync(
    new URL(
      './fixtures/itviec-ai-solution-architect.golden.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const post = golden.sourceText;
const rows = [...golden.mustHave, ...golden.niceToHave];
for (const row of rows) {
  assert(post.includes(row.quote));
  for (const span of row.coverageSpans) assert(row.quote.includes(span));
}
const candidate = (id, value) => {
  const row = rows.find((item) => item.id === id);
  return {
    field: id.startsWith('P') ? 'preferredSkills' : 'skills',
    value: value ?? row.quote,
    source: 'post',
    quote: row.quote,
  };
};
const probes = {
  omitted_model: [],
  complete_clauses: [
    ...rows.map((row) => candidate(row.id)),
    {
      field: 'experience',
      value: golden.experience.sourceValue,
      source: 'post',
      quote: golden.experience.quote,
    },
  ],
  literal_atoms_and_invalid_controls: [
    ...['vector search', 'tool calling', 'model selection'].map((value) =>
      candidate('M5', value),
    ),
    ...['cloud-based architectures', 'APIs'].map((value) =>
      candidate('M6', value),
    ),
    ...['AI coding tools', 'coach engineers'].map((value) =>
      candidate('M8', value),
    ),
    candidate('M3', 'English communication'),
    candidate('P2', 'MCP'),
    {
      field: 'skills',
      value: 'Kubernetes',
      source: 'post',
      quote:
        'Supplemental skill tags (not requirements): LLM; Kubernetes; RAG; English',
    },
    candidate('M6', 'cloud architecture'),
    { ...candidate('M5', 'vector search'), source: 'jd' },
  ],
};
const output = {
  provenance: 'OFFLINE MOCKED RESPONSES: not observed Ollama output',
  sourceCharacters: post.length,
  sourceSha256: createHash('sha256').update(post).digest('hex'),
  headingClassification: requirementLines(post).filter((row) => row.kind),
  deterministicRecovery: sectionCandidates(post, 'post'),
  probes: {},
};
for (const [name, raw] of Object.entries(probes)) {
  let request;
  const service = new JobImportService({
    async generateStructured(input) {
      request = input;
      return { candidates: raw };
    },
  });
  const result = await service.extract({ record: { postText: post } });
  assert.equal(result.error, null);
  assert(request.prompt.endsWith(JSON.stringify({ post, jd: '' })));
  assert.equal(request.partial.deadline > performance.now(), true);
  assert.deepEqual(
    validateImportReview(result.fields, post, ''),
    result.fields,
  );
  output.prompt = {
    characters: request.prompt.length,
    sourceIncludedVerbatim: true,
    sourceField: 'post',
    jdField: '',
    schemaMaxCandidates: request.schema.properties.candidates.maxItems,
    tokenUsage: 'NOT_MEASURED_NO_MODEL_CALL',
  };
  const values = Object.fromEntries(
    result.fields.map((field) => [field.field, field.value]),
  );
  output.probes[name] = {
    rawMockResponse: { candidates: raw },
    independentlyNormalizedMock: normalizeRequirementCandidates(raw, post, ''),
    values,
    rejected: result.rejected,
    evidenceRoundTrip: 'PASS',
    lexicalCoverage: rows.map((row) => {
      const field = row.id.startsWith('P') ? 'preferredSkills' : 'skills';
      return {
        id: row.id,
        present: row.coverageSpans.filter((span) =>
          values[field].includes(span),
        ),
        missing: row.coverageSpans.filter(
          (span) => !values[field].includes(span),
        ),
      };
    }),
  };
}
const failed = await new JobImportService({
  async generateStructured() {
    throw new Error('Synthetic provider failure');
  },
}).extract({ record: { postText: post } });
output.providerFailure = {
  errorCode: failed.errorCode,
  required: failed.fields.find((field) => field.field === 'skills').value,
  preferred: failed.fields.find((field) => field.field === 'preferredSkills')
    .value,
};
output.sourceExperienceCandidates = sourceCandidates(post, '').filter(
  (item) => item.field === 'experience',
);
console.log(JSON.stringify(output, null, 2));
