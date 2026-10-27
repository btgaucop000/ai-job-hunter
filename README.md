# ai-job-hunter

AI-powered job matching platform that analyzes resumes and job descriptions using LLMs, with explainable scoring and local/cloud AI support.

That description is the product direction. Checkpoints 1–4 provide the workspace, PostgreSQL migrations, API health endpoints, a responsive dashboard shell, automated tests, and Ubuntu CI configuration. Task 02 Checkpoint 3.2 adds an internal AI provider layer; candidate/job management and public AI functionality are not implemented.

## Local setup (Ubuntu WSL2)

Open `/home/tientb/projects/ai-job-hunter` in Cursor connected to Ubuntu WSL2. Use Bash and the existing nvm installation. Windows-native Node and CMD are not used.

```bash
cd /home/tientb/projects/ai-job-hunter
source "$HOME/.nvm/nvm.sh"
nvm use
node --version # v24.22.1
pnpm --version # 12.14.0
pnpm install --frozen-lockfile
```

If nvm is already loaded, omit the `source` command. If a version check differs, activate the existing pinned toolchain before installing dependencies; do not replace Windows tools.

Open <http://localhost:5173> for the frontend. The API listens on `127.0.0.1:3000` with prefix `/api/v1`. The frontend proxies `/api` to that server. Stop both watchers with Ctrl+C.

Before running `pnpm dev`, complete the database setup below. Docker Desktop must be running with Ubuntu WSL integration enabled.

## Database setup

From the repository root, create the ignored configuration files only if they do not already exist:

```bash
cp -n .env.example .env
cp -n .env.test.example .env.test
chmod 600 .env .env.test
```

Edit both files and replace each password placeholder with a different strong local password. Do not commit either file. Keep the database name, role, and target values as documented. The API and migration commands load the appropriate file; existing process environment variables take precedence, so unset stale `DB_*`/`NODE_ENV` exports when switching environments.

```bash
docker compose --env-file .env config --quiet
pnpm db:up
pnpm db:migrate
pnpm db:status
pnpm dev
```

Use `config --quiet` to validate without printing interpolated credentials. Development PostgreSQL is bound to `127.0.0.1:5432` and stores data in the `ai-job-hunter-dev_postgres-data` named volume. You may change the development `DB_PORT` in `.env` to an available port except 5433.

The test database uses a separate Compose project and container, `127.0.0.1:5433`, distinct credentials/database/role, and tmpfs storage. Its contents disappear when the container stops. Start it independently:

```bash
pnpm db:test:up
pnpm build
pnpm db:test:migrate:compiled
pnpm db:test:status:compiled
pnpm db:test:down
```

Test connections require `DB_ENV=test`, `NODE_ENV=test`, database and role `ai_job_hunter_test`, host `127.0.0.1`, and port 5433. Configuration fails before connecting if these do not match. Future Ubuntu CI must publish PostgreSQL on port 5433 and supply the same variable names; environment files are optional when all values are injected.

| Command                                                                                           | Purpose                                                                                 |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm db:up` / `pnpm db:down`                                                                     | Start healthy development PostgreSQL / remove its container while preserving the volume |
| `pnpm db:test:up` / `pnpm db:test:down`                                                           | Start / remove the disposable test database                                             |
| `pnpm db:migrate` / `pnpm db:status` / `pnpm db:revert`                                           | Run / show / revert development migrations from TypeScript                              |
| `pnpm db:migrate:compiled` / `pnpm db:status:compiled` / `pnpm db:revert:compiled`                | Same operations using built JavaScript                                                  |
| `pnpm db:test:migrate` / `pnpm db:test:status` / `pnpm db:test:revert`                            | TypeScript operations against the test database                                         |
| `pnpm db:test:migrate:compiled` / `pnpm db:test:status:compiled` / `pnpm db:test:revert:compiled` | Compiled operations against the test database                                           |

Rebuild before using compiled commands after source changes. Migrations never run automatically on API startup. `db:revert` explicitly reverses the most recently applied migration; inspect it before use. The initial migration creates only `ai_job_hunter`; its rollback refuses to drop a nonempty schema. There are no domain tables or seed data.

Normal shutdown never deletes development volumes. Do not use `docker compose down -v` for routine work. Changing the password in `.env` does not update a role in an existing persistent database; restore the matching value or perform a deliberate credential rotation instead of resetting data. A failed startup may indicate an occupied port or disabled Docker WSL integration.

## Commands

Run these from the repository root:

| Command                                    | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `pnpm dev`                                 | Start Vite and the NestJS compile/restart watcher |
| `pnpm typecheck`                           | Check both applications without emitting files    |
| `pnpm build`                               | Compile the API and build the web bundle          |
| `pnpm lint`                                | Check source and configuration with ESLint        |
| `pnpm format:check`                        | Check formatting                                  |
| `pnpm format`                              | Apply formatting                                  |
| `pnpm --filter @ai-job-hunter/api start`   | Run the compiled API after building               |
| `pnpm --filter @ai-job-hunter/web preview` | Preview the web build on port 4173                |

Build output lives in each application's ignored `dist/` directory. Vite preview is a local inspection server, not a production hosting setup. Direct dependencies are pinned and `pnpm-lock.yaml` records the resolved dependency graph.

If startup fails, check for an occupied port (3000 or 5173), confirm `nvm use`, and verify dependencies were installed. API source changes compile before the server restarts; Vite handles frontend hot reload.

## Checkpoints and documentation

- Checkpoint 1: workspace, application scaffolds, tooling, and initial documentation.
- Checkpoint 2: isolated PostgreSQL services, TypeORM, and reversible migrations.
- Checkpoint 3: health endpoints, startup/DTO validation, dashboard routing and states, and API proxy.
- Checkpoint 4: Jest, Vitest, PostgreSQL integration tests, and Ubuntu CI configuration. The GitHub-hosted workflow still requires an actual run.

Unit/component tests run independently of PostgreSQL; integration tests use only the disposable test database. See [architecture](docs/architecture.md) for boundaries and decisions and [AGENTS.md](AGENTS.md) for coding-agent requirements.

## API and dashboard

- `GET /api/v1/health/live`: HTTP 200, `{"status":"ok"}`; no database query.
- `GET /api/v1/health/ready`: HTTP 200, `{"status":"ok"}` when PostgreSQL responds; HTTP 503, `{"status":"unavailable"}` on failure or the 1.5-second deadline.
- Startup requires valid database configuration and initial connectivity. After startup, a database outage does not make liveness fail.
- `API_PORT` defaults to 3000. The Vite development proxy targets 3000; use a separate API port for isolated checks without altering the usual development workflow.

```bash
curl -i http://127.0.0.1:3000/api/v1/health/live
curl -i http://127.0.0.1:3000/api/v1/health/ready
curl -i http://127.0.0.1:5173/api/v1/health/ready
```

The browser redirects `/` to `/dashboard`. Candidates, Jobs, Matches, and Settings navigation leads to honest coming-soon pages. Unknown routes display a not-found page. The API indicator shows checking, ready, or unavailable and refreshes every 30 seconds after each completed check. Use **Check again** to retry immediately. A failed check does not imply that any saved records were lost.

For manual outage checks, start `pnpm db:test:up`, then run a separate API from the repository root with `API_PORT=3001 node --env-file=.env.test apps/api/dist/main.js` after building. Stop/restart only `postgres-test` using `docker compose --env-file .env.test -f compose.test.yaml stop postgres-test` and `docker compose --env-file .env.test -f compose.test.yaml up -d --wait`. Check health on port 3001 before, during, and after the outage. Do not stop development PostgreSQL to test this behavior. The disposable test database loses contents when stopped; health connectivity checks do not require application tables.

## Automated tests and CI

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm db:test:up
pnpm db:test:migrate:compiled
pnpm test:integration
pnpm db:test:down
```

Create `.env.test` from its example and set a local password first. Run commands from the repository root in WSL. Keep development and test configuration separate; exported environment variables override the files. Integration tests reject unsafe configuration before opening a connection, and also verify the connected database and role. Do not point them at development or production, and do not run multiple integration suites concurrently against the same test database.

`pnpm test` runs Jest backend unit/controller tests and Vitest frontend component tests without PostgreSQL or external HTTP services. Backend tests are compiled by the existing TypeScript compiler into ignored `.test-dist`, preserving ESM and Nest decorator metadata; generated test output is cleaned before compilation. Jest uses Node's experimental VM modules flag. No Babel or ts-jest transform is needed. Frontend tests use jsdom, React Testing Library, mocked fetch, and fake timers for timeout/polling behavior.

`pnpm test:integration` compiles and runs a separate Jest suite with real PostgreSQL and Supertest. It verifies migrations, connection identity, health responses, and recovery. Failure simulation temporarily sets **only** `ai_job_hunter_test` to NOLOGIN, while retaining an established administrator connection to restore LOGIN in `finally`. It never stops development PostgreSQL or deletes volumes. If the test process is forcibly killed during that operation, recreate the disposable service using `pnpm db:test:down` then `pnpm db:test:up` and reapply migrations. The test role is a local bootstrap administrator specifically to support this isolated simulation.

The single Ubuntu workflow in `.github/workflows/ci.yml` runs on pushes and pull requests. It pins Node 24.22.1, pnpm 12.14.0, and action commit revisions; installs from the lockfile; runs format/lint/type checks, unit/component tests, and builds; then starts the digest-pinned test PostgreSQL container and runs compiled migrations plus integration tests. It generates an ephemeral masked password and removes the disposable container in an always-run cleanup step. Workflow permissions are read-only; there is no deployment.

Known limits: component tests do not replace real-browser layout checks; GitHub Actions must actually run on GitHub before its status can be called passing. Jest ESM currently emits Node's experimental VM modules warning. The pnpm install policy explicitly skips optional native build scripts for `@parcel/watcher` and `unrs-resolver`; the verified Linux tests use packaged binaries and do not need those scripts.

## Internal AI provider (Task 02 / Checkpoint 3.2)

The API includes an internal `AiModule` for schema-validated Ollama generation. It exposes no HTTP endpoint. Optional server environment settings are listed in `.env.example`: `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:4b`, and `AI_REQUEST_TIMEOUT_MS=120000` (allowed range 1000–300000 ms). Settings are validated at startup without contacting Ollama. Actual generation requires the configured Ollama service and model; there is no automatic cloud fallback. The server-owned base URL accepts only HTTP(S) origins using literal `127.0.0.1` or `[::1]`, with an optional port and trailing slash. Remote hosts, `localhost`, alternate numeric spellings, credentials, paths, queries, and fragments are rejected. The default local Ollama URL remains unchanged; redirects remain disabled.

Run `pnpm --filter @ai-job-hunter/api test` for backend unit tests, including mocked AI HTTP tests, or `pnpm test` for all unit/component tests. Neither command requires Ollama, GPU or PostgreSQL. The separate `pnpm test:integration` command still requires isolated PostgreSQL. See the architecture document for schema support, limits and error categories. Live Nest/Ollama smoke testing is available through the explicit Checkpoint 3.3 command below.

### Explicit local Ollama smoke test

With Ollama already running at `http://127.0.0.1:11434` and `qwen3:4b` already installed, run:

```bash
pnpm --filter @ai-job-hunter/api smoke:ollama
```

This compiles the existing TypeScript test tree and invokes a separate manual script using real Nest `AiModule` dependency injection. It pins the provider, URL, model and 120-second timeout for this process, without loading environment files. It sends only a synthetic fixture and verifies the name, exactly three skills, React's five years, and null durations for NestJS and PostgreSQL. Output contains only sanitized status and elapsed milliseconds. Failures exit nonzero. It neither starts Ollama nor downloads models. It opens no API listener and needs no PostgreSQL. It is excluded from Jest discovery and regular tests, is not invoked by CI, and refuses execution when `CI` is set.

## Extraction contracts (Task 03 / Checkpoint 4.2)

`apps/api/src/extraction` defines internal CV/JD contracts, application-owned JSON Schemas, immutable text sources, deterministic evidence validation, input limits and sanitized errors. Model references contain only a segment ID and exact quote; validated results add global UTF-16 offsets. Unknown facts require null with empty evidence. Dates and experience durations remain source strings.

Run `pnpm test` for synthetic extraction/AI tests and the existing unit/component suites. `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` remain the static/build checks. These tests need neither Ollama nor PostgreSQL. Checkpoints 4.3B–4.3C add internal PDF/DOCX parsing through short-lived workers; Checkpoint 4.4D adds internal extraction orchestration as described below. Upload UI and public extraction endpoints are not implemented. Metadata validation remains separate from actual PDF parsing. See `docs/architecture.md` for exact guarantees and limitations.

## Internal PDF parser (Task 03 / Checkpoint 4.3B)

`apps/api/src/extraction/document-parser.ts` exports the process's `documentParser` owner. It accepts in-memory PDF bytes and returns an immutable source, page count and fixed coverage warnings. No endpoint or Nest application wiring is added. Call `close()` (or the lifecycle-compatible `onModuleDestroy()`) when its owner shuts down. Admission is limited to one active parse on that owner; later Nest wiring must reuse the exported instance.

The pinned PDF.js 6.4.299 legacy ESM build runs under Node 24 with native addons disabled in the worker. Only manifest-listed font/CMap files from that installed package may be read; document URLs and resource paths are never used as filesystem paths. PDF JavaScript, rendering and OCR are not invoked. Documents exceeding limits are rejected; blank/image-only PDFs return `NO_EXTRACTABLE_TEXT`. Mixed PDFs return available page text with warnings rather than claiming full visual coverage.

Run the production-worker check after building and compiling synthetic fixtures:

```bash
pnpm build
pnpm --filter @ai-job-hunter/api test:compile
node scripts/check-pdf-parser.mjs
```

This check now covers both PDF and DOCX through `apps/api/dist/extraction/parser.worker.js`, without Jest, Ollama or PostgreSQL. Regular `pnpm test` also covers real workers, bounded parsing, malformed/password-protected documents, resource access and termination recovery. Local listener permission is needed by the existing HTTP tests and the synthetic network canary.

## Internal DOCX parser (Task 03 / Checkpoint 4.3C)

The same `documentParser` accepts `.docx` bytes with the OOXML Word MIME type. It validates ZIP structure and expanded-byte limits, OOXML content types and relationships, then calls Mammoth with the same in-memory archive. Results retain Mammoth's text exactly, with paragraph spans, global UTF-16 offsets and null page provenance. DOCX has `pageCount: null`; fixed warnings identify ignored image content and conversion warnings without exposing library diagnostics.

Main-document relationships must identify one existing canonical part. Main targets containing dot components are rejected, including safe-looking `word/../custom/main.xml`; missing parts cannot fall back to `word/document.xml`. Canonical custom main parts are supported even when a conflicting default part exists. Internal image/header references can use safe parent components; Mammoth-consumed styles/numbering/notes/comments require spellings that agree with Mammoth's resolver.

HTTP(S)/mailto hyperlink relationships are permitted as inert document data. External images, templates, imports and other external relationships are rejected. Nothing is fetched or followed. DTDs/entities, macros, embedded executable/OLE/nested archives, unsafe or duplicate ZIP names, encryption and corrupt archives are rejected. No archive content is extracted to disk.

The initial compatibility profile is intentionally strict: UTF-8 transitional OOXML, ASCII canonical ZIP names, STORE/DEFLATE, no ZIP64, data descriptors, archive comments or ambiguous name metadata. Some valid DOCX files outside this profile are rejected. Limits are 1,000 ZIP entries, 5 MiB expanded per entry, 20 MiB expanded overall, 100:1 expansion ratio, 12,000 UTF-16 text units and 1,000 paragraph segments. Rejection never silently truncates text. Run the same tests and production-worker verification commands above; no database or live inference is needed.

## Fixed local AI context profile (Task 03 / Checkpoint 4.4C)

AI generation now requires Ollama 0.40.10 and the verified qwen3:4b digest recorded in `apps/api/src/ai/ollama.context.ts`. Every call measures the prompt with one generated token before actual generation: 8192 context tokens, maximum 6080 measured prompt tokens, 2048 output tokens and 64 safety tokens. Unsupported profiles, missing metadata, allocation mismatches and incomplete generation fail closed. One timeout covers the entire operation. No model downloads or service startup occur automatically.

The existing `pnpm --filter @ai-job-hunter/api smoke:ollama` remains an explicit synthetic-only live check; it now exercises this two-pass policy through AiService. Normal tests mock Ollama and do not require it. Model/server upgrades need profile review; `/api/ps` checks are snapshots and assume no concurrent external model/context changes. See `docs/architecture.md` for the guarantees and limitations.

## Internal CV/JD extraction (Task 03 / Checkpoint 4.4D)

ExtractionModule exports ExtractionService with `extractCv({ bytes, fileName, mediaType })` for PDF/DOCX and `extractJd({ text })` for plain text. AppModule registers it internally; there are no extraction endpoints. Calls use fixed prompts/schemas through AiService and return a deeply immutable version-1 envelope containing source text, resolved data and warnings. Every non-null fact needs exact source evidence. Missing scalars remain null; invalid evidence, duplicate facts, budget overflow and incomplete generation reject the whole call without repair or retry.

One process-local slot covers parsing, inference, validation and confirmed cleanup. Busy calls reject immediately. Shutdown closes admission and drains existing work; unconfirmed worker cleanup permanently disables extraction. Exact grounding does not prove semantic truth or completeness: every result includes `EXTRACTION_COMPLETENESS_NOT_VERIFIED` alongside parser warnings. No document persistence is introduced.

Run deterministic verification without Ollama or PostgreSQL:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
node scripts/check-pdf-parser.mjs
node scripts/check-extraction.mjs
git diff --check
```

The production checks use synthetic fixtures compiled by the API test command and production JavaScript/worker entry points. The extraction check substitutes only the AI provider. See `docs/architecture.md` for duplicate identity, privacy, prompt-injection and context-profile limitations.

## Adversarial and live extraction verification (Task 03 / Checkpoints 4.5A–4.5C)

Run the explicit synthetic-only evaluation against an already-running local Ollama with the pinned model:

```bash
pnpm --filter @ai-job-hunter/api smoke:extraction
```

This command is outside regular tests and refuses CI. It uses real ExtractionService, PDF/DOCX workers and AiService; it neither starts services nor downloads models. Ten predefined attempts cover three straightforward PDF CV runs, three equivalent DOCX CV runs, a negated/uncertain CV, required/preferred JD cues, and CV/JD role-spoofing text. Repetition is scheduled before outcomes are known, not an automatic retry. Logs contain only fixed case identifiers, attempt numbers, success/rejection codes, latency, gold-expectation booleans and per-field categories/counts—no source text, prompts, names, quotes or raw model output. Categories distinguish missing skills, incorrect experience assignment, unsupported positive skills, unsupported responsibilities/requirements, incorrect priorities, valid extraction and rejection.

A nonzero exit means review is needed, including valid-looking but incomplete/semantically incorrect results. A rejection reports unknown fact-presence booleans, because the public API exposes no rejected model output. Gold checks apply only to these synthetic fixtures and are not production semantic heuristics or a general quality benchmark. The first 4.5A run found one incomplete result and three semantically incorrect but textually grounded results; see `docs/architecture.md` for sanitized observations. Structural/evidence checks do not establish resistance to prompt injection or semantic correctness.

The final fixed CV prompt enumerates explicitly supported skills, maps each stated duration verbatim into that skill’s `experienceText.value` with evidence, and keeps unstated duration null with empty evidence. Checkpoint 4.5E applies exactly the Candidate C wording selected after the controlled 4.5D comparison; historical failures and final live results are recorded in `docs/architecture.md`. Exact quotes establish textual grounding, not semantic correctness or completeness. Negation and prompt-injection susceptibility remain known limitations. Task 05 records the synthetic extraction baseline and adversarial limitations below.

## Internal deterministic matching (Task 04 / Checkpoints 4.2–4.3)

`apps/api/src/matching/matching.ts` exports the pure synchronous `matchExtractions({ cv, jd })` function for existing version-1 extraction envelopes. It returns documented-support scores, per-requirement decisions, evidence, uncertainty and mandatory coverage explanations. `MatchingModule` exports `MatchingService.match({ cv, jd })`, a synchronous delegate returning the same `MatchingResult`. `AppModule` registers it internally; no public matching endpoint is added. High scores with low coverage are not full-suitability assessments; missing evidence never implies automatic rejection. Exact evidence does not establish semantic correctness, and missing evidence does not establish missing ability. Complex natural language remains unsupported; Task 05 records finite synthetic quality measurements below; it does not establish general calibration. See `docs/architecture.md` for the finite vocabulary, accepted phrase forms and limitations.

Run the synthetic matching suite with `pnpm --filter @ai-job-hunter/api test --testPathPatterns=matching`. It requires neither Ollama nor PostgreSQL. Repository checks remain `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

After `pnpm build` and `pnpm --filter @ai-job-hunter/api test:compile`, run `node scripts/check-matching.mjs` to verify production-compiled matching in a real Nest application context. This check uses only synthetic envelopes and does not start an HTTP listener, connect to PostgreSQL or invoke AI/extraction. The focused suite also compiles `AppModule` with offline database and extraction replacements to verify registration.

### Offline evaluation (Task 05 / Checkpoint 5.2)

Run `pnpm --filter @ai-job-hunter/api eval:offline` for the versioned
`synthetic-v1` evaluator. It compiles the existing API test target, parses ten
synthetic source documents, assesses twenty human-authored observations, and
runs twelve fixed scenarios through the real deterministic matcher. It does not
invoke Ollama, start HTTP, or connect to PostgreSQL. This offline command never invokes the separate opt-in live runner.

The command prints canonical JSON to stdout and exits nonzero on a harness or
matching expectation failure. To capture only JSON after compilation:

```bash
pnpm --filter @ai-job-hunter/api test:compile
node --permission --allow-fs-read='*' --allow-worker \
  --import ./apps/api/.test-dist/test/evaluation/no-network.js \
  ./apps/api/.test-dist/test/evaluation/offline.js > /tmp/ai-job-hunter-offline.json
```

The preload rejects network entry points and HTTP listeners. Node permissions
also deny subprocesses, native addons and filesystem writes; parser workers
require `--allow-worker`. This is a regression tripwire, not a security boundary
for arbitrary untrusted code. Node may print a worker-permission warning to
stderr; it is not part of the JSON report.

Intentionally incorrect observations, two rejections, and one not-run example
are **synthetic evaluator test cases**, not observed model failures. `passed`
means the evaluator recognized their authored expectations and matching agreed
with policy expectations. It does not mean extraction quality is perfect or
that a live model was evaluated. No timestamps or measured latency enter the
report. Repeated unchanged runs produce identical bytes.

Focused tests: `pnpm --filter @ai-job-hunter/api test --testPathPatterns=offline-evaluation`.
The CLI tests launch child Node processes; an execution sandbox that prohibits
subprocesses must permit those tests to run. Dataset and metric details are in
[the architecture document](docs/architecture.md#task-05--checkpoint-52-offline-evaluation).

### Local evaluation runner (Task 05 / Checkpoint 5.3A)

The opt-in command for an explicitly authorized local live run is:

```bash
pnpm --filter @ai-job-hunter/api eval -- --allow-local-ollama
```

Checkpoint 5.3A implemented the runner without inference. The single approved
Checkpoint 5.3B live run is summarized below.
The CLI refuses missing opt-in, unknown arguments and any set `CI` variable.
It pins the existing loopback Ollama configuration and verified `qwen3:4b`
profile. It never starts Ollama, downloads models, changes daemon configuration,
retries a failed call or selects a cloud provider.

The fixed schedule makes at most 18 sequential extraction calls: ten source
cases, two extra attempts for each ordinary PDF/DOCX, then fresh CV/JD extraction
for the duration/mixed-JD and sparse/mixed-JD pairs. The existing 120-second
provider timeout remains unchanged. A supervising parent enforces a 45-minute
execution deadline, retains completed measurements, marks the active interrupted
attempt rejected and remaining attempts not run, and terminates its extraction
child when needed. Normal cleanup has a five-second grace period. The existing
Ollama daemon is never stopped.

JSON on stdout separates `extraction`, `fixedMatching` and `endToEnd`. It includes
version/hash provenance, configured model identity and successful production
verification, completion counts, delivered quality, latency statistics, repeat
variance and sanitized failures. Raw documents, model responses and evidence
quotes are omitted. Exit 1 means quality, infrastructure or cleanup review is
needed; it does not imply a production security defect. Offline synthetic scores
remain evaluator regression results, never live measurements.

Deterministic runner tests use fake boundaries and an inert cleanup subprocess:
`pnpm --filter @ai-job-hunter/api test --testPathPatterns=live-evaluation`.

### Reviewed baseline and follow-up (Task 05 / Checkpoints 5.3B–5.4)

Task 05 is accepted as an evaluation and measurement deliverable, not proof of
production-ready AI quality. One local run on 2026-10-26 used `synthetic-v1`
(ten source documents), `evaluation-v1` and `matching-v1`, with Ollama 0.40.10,
`qwen3:4b`, pinned digest
`359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.
Temperature was zero; no retry, tuning or second benchmark run occurred.

| Baseline measure                                      | Result              |
| ----------------------------------------------------- | ------------------- |
| Planned / attempted extractions                       | 18 / 18             |
| Returned / rejected / not run                         | 11 / 7 / 0          |
| Passed all quality checks                             | 6/18                |
| Returned-output TP / FP / FN                          | 35 / 5 / 0          |
| Returned precision                                    | 87.50% (35/40)      |
| Returned recall, conditional on successful extraction | 100% (35/35)        |
| Delivered recall, including rejected attempts         | 50.00% (35/70)      |
| Delivered important completeness                      | 42.86% (24/56)      |
| Unsupported-positive rate on returned outputs         | 12.50% (5/40)       |
| Fixed matching                                        | 14 scenarios passed |
| Live end-to-end pairs completed                       | 0/2                 |
| Delivered matching status / decision accuracy         | 0/10 for each       |

The run exited 1 for quality failures; no infrastructure, timeout or cleanup
failure occurred. Returned results are not automatically quality passes. The
ordinary PDF/DOCX cases passed three attempts each; all other attempts either
failed quality checks or were rejected. Both live pairs lacked complete validated
extraction inputs, so their matching metrics were unavailable, not successful.

Offline synthetic tests verify evaluator behavior, not live model accuracy.
Rejected model contents cannot be inferred from error codes. Structural evidence
validity does not establish semantic correctness. Unsupported-positive rate uses
exact authored alignment, not independent hallucination verification. Evidence
support anchors may be annotation-sensitive, including punctuation and repeated
passages. These small synthetic measurements establish neither hiring suitability
nor production readiness. See the [detailed baseline and analysis](docs/architecture.md#task-05--checkpoints-53b54-reviewed-live-baseline-and-follow-up).

| Priority | Follow-up                                                                                                                                                                                                               |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Add sanitized rejection diagnostics; investigate INVALID_EVIDENCE and restore both predefined end-to-end pairs without weakening validation. Address before presenting Task 06 as a working model-backed matching flow. |
| P1       | Address negation, uncertainty, injection and sparse-document contamination; audit evidence-support annotations; preserve explicit incomplete/unknown/unsupported states during Task 06 UI integration.                  |
| P2       | Broaden independent fixture coverage after MVP.                                                                                                                                                                         |

The original baseline remains unchanged. Future improvements must preserve it;
any evaluation-policy or ground-truth changes require separate review and
versioning. Temporary reports and raw inference payloads are not committed.

### Four-case extraction investigation (manual, explicit authorization only)

The test-only harness runs these synthetic fixtures once each, in order:
`cv-duration-docx`, `jd-mixed`, `jd-injection`, `jd-negation`. It has independent
parent/child four-call limits, no retries, no fixture selectors, and refuses CI.
It performs local metadata preflight and preserves existing extraction deadlines
and cleanup. Infrastructure/profile failures stop remaining cases.

After separate approval for live inference:

```bash
pnpm --filter @ai-job-hunter/api investigate -- --allow-local-investigation
```

Do not run this command as an ordinary check: it invokes local Ollama. Without
the exact opt-in it returns NOT_RUN rows and exits nonzero before starting a child.
The JSON report contains only fixture IDs, statuses, existing error codes,
allowlisted diagnostics and bounded elapsed milliseconds. Successful extraction
content never crosses child IPC. A top-level code reports lifecycle/cleanup
failure; any rejected/unrun case also exits nonzero. RETURNED does not establish
semantic correctness. The original `eval` command still runs its unchanged
18-attempt baseline schedule. Later checkpoints ran the harness only under their
separate, bounded local authorizations; the command still requires explicit
authorization for every future invocation.

## Local analysis endpoint

The `/dashboard` MVP uses this endpoint. Open **http://127.0.0.1:5173** through
the Vite development server. Vite preview has no API proxy; `localhost` is not
an allowed analysis origin. API readiness does not guarantee Ollama availability
or extraction quality. Cancel stops browser waiting, but backend cleanup may
temporarily leave the API busy. Inputs/results are memory-only; Clear removes
them from the dashboard. No history or feedback submission is implemented.

`POST /api/v1/analyses` accepts a bounded multipart upload:
one PDF/DOCX `cv` file (maximum 5 MiB) and one nonblank `jdText` field
(maximum 12,000 UTF-16 units and 49,152 UTF-8 bytes), in either order.
One admitted request runs CV extraction, then JD extraction, then deterministic
matching. Concurrent requests return **429 `ANALYSIS_BUSY`**, with no queue.
Success returns the versioned matching result; failures return a sanitized
`INCOMPLETE` response with `result: null`. This endpoint now invokes the configured
local provider when used; the deterministic tests below use fake extraction only.
Uploads have a 30-second deadline. The default overall deadline is 286 seconds;
it varies with the validated provider timeout. Disconnects/timeouts prevent later
stages, but admission remains occupied until active extraction cleanup settles.
The overall deadline bounds result acceptance, not guaranteed inference
termination. A nonsettling provider can block admission and shutdown. Parser
watchdog failure may instead settle analysis while leaving extraction unavailable.
Live AI quality remains unverified. Multipart preambles, folded headers and
extended/escaped or unknown disposition parameters are explicitly unsupported.
Access requires the exact loopback Host and HTTP Origin configured for the API
or Vite (127.0.0.1:5173). Missing Origin is rejected. Responses are not cacheable.

### Task 06 local end-to-end verification

Checkpoint 6.6 sent three synthetic analysis requests sequentially through the
local dashboard/API integration with pinned local Ollama and no retries. One of
three completed: `cv-simple-pdf + jd-priority`. Matching ran for that request and
returned two requirements with `overallScore: null`, which the dashboard contract
represents as not calculable rather than zero.

`cv-duration-docx + jd-mixed` returned INCOMPLETE during CV extraction with the
sanitized `QUOTE_AMBIGUOUS` diagnostic. `cv-sparse-docx + jd-mixed` returned
INCOMPLETE during JD extraction with the same diagnostic. Matching did not run
for either incomplete request. The two predefined mixed-JD pairs therefore remain
0/2 completed. No request was retried.

The HTTP/API-to-Ollama integration and its success/failure response handling were
exercised, but the browser DOM was not visually verified. This limited run confirms
local integration and honest failure handling; it does not establish extraction
quality, semantic correctness, model reliability or candidate suitability. The
Task 05 18-attempt baseline above remains a separate historical measurement.

Run deterministic transport and lifecycle tests without Ollama or a database:

```bash
pnpm --filter @ai-job-hunter/api test:compile
pnpm --filter @ai-job-hunter/api exec node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.js --runInBand --testPathPatterns=analysis
```
