# Architecture

## Scope and status

AI Job Hunter is a production-minded MVP built as a pnpm monorepo with a React browser application and a NestJS modular monolith. Checkpoints 1–4 implement the workspace, PostgreSQL foundation, health endpoints, responsive dashboard shell, automated test suites, and Ubuntu CI configuration. A GitHub-hosted CI run remains unverified.

Local development runs in Ubuntu WSL2 using Cursor, Bash, Node 24.22.1 through nvm, and pnpm 12.14.0. Keep the repository on the Linux filesystem. Docker Desktop provides PostgreSQL through WSL integration; applications run directly in WSL.

## Boundaries

- `apps/web`: React, Vite, MUI/Emotion, and React Router. Application providers and theme live under `src/app`. The dashboard and placeholder feature routes share an application shell and readiness indicator.
- `apps/api`: NestJS with its Express adapter. `AppModule` is the composition root. Business entities and logic will belong to feature modules, collaborating through exported services.
- Root configuration: version pins, workspace commands, shared strict TypeScript options, lint, and formatting. Frontend bundler settings and backend runtime settings remain separate.

Do not introduce a shared package until both apps need meaningful contracts. Server entities, secrets, and ORM configuration must never cross into the browser. No generic repository abstraction, microservices, authentication, AI providers, crawlers, or workers are part of Task 01.

## Tooling decisions

Both apps use ESM. The API uses TypeScript NodeNext resolution and explicit `.js` local import specifiers so emitted code executes directly in Node. TypeScript emits decorator metadata required by Nest dependency injection. The web app uses bundler resolution and no compiler emission.

TypeScript 5.9.3 is deliberately pinned rather than the newest major to remain within the selected lint tooling's supported range. Node type declarations match the Node 24 runtime family. Other direct dependencies are pinned to reviewed registry versions; installation enforces peer compatibility.

`tsc-watch` compiles the API and starts/restarts Node only after successful compilation. This small development dependency preserves decorator metadata without a custom process manager or bundler. Production execution uses compiled JavaScript. TypeORM uses this same ESM format; Jest runs TypeScript-compiled ESM with Node VM modules, preserving decorator metadata.

pnpm orchestrates both development processes. A Nest CLI, task cache, and additional build framework are unnecessary for this scaffold. MUI uses Emotion for styling; React Router is initialized as an application provider, with dashboard, placeholder, and not-found routes. Native fetch will be sufficient for the initial health display.

Lint uses ESLint flat configuration, TypeScript recommendations, React hooks and refresh rules, with Prettier owning formatting. Strict type checking is a separate required command. External declaration checking is skipped; application type checks remain strict.

## Database foundation

PostgreSQL 17 uses independent Compose files/projects so starting or stopping the disposable test service cannot affect the development container. Development uses a named volume; tests use tmpfs storage. Both services have `pg_isready` health checks and loopback-only published ports. Test port 5433 is reserved; development defaults to 5432.

The NestJS TypeORM adapter, TypeORM 0.3.31, and `pg` are the runtime additions. The 0.3 release line matches the adapter's stable peer range; upgrading ORM major versions is a separate decision. The development-only `ts-node` loader supports ESM plus compiler-emitted metadata. Its experimental resolver maps `.js` source import specifiers to `.ts`, keeping emitted NodeNext imports valid. Node may print loader/deprecation warnings; compiled execution does not load ts-node.

`databaseOptions` is a plain configuration function shared by `DatabaseModule` and standalone development/test DataSources. The CLI never imports or starts Nest. Each entry point fixes its expected target; test configuration requires the exact test database, role, loopback host, port, and NODE_ENV. Development entries reject test processes and the reserved port. Separate credentials and clusters provide a second boundary. These checks prevent configuration mistakes, not deliberate bypass by someone with access to both credentials.

Node loads ignored environment files for local execution, with process environment variables taking precedence. CI can inject values without files. Validation fails on missing values or password placeholders and never prints passwords. These connection options intentionally support local/CI targets only; production TLS, deployment credentials, and least-privilege role provisioning are not yet configured. The official image's POSTGRES_USER is a local cluster administrator; do not reuse this bootstrap role in a production deployment.

TypeORM always uses `synchronize: false` and `migrationsRun: false`. The CLI wrapper selects the target and source/compiled DataSource explicitly, forwards exit status, and supports only run/show/revert. Source execution uses the ESM TypeScript loader; compiled execution invokes the ordinary TypeORM CLI against `dist`. An explicit migration class list avoids mixed-extension glob discovery and stale output files being discovered automatically. New migrations must be imported into that list with `.js` specifiers.

The initial timestamped migration creates `ai_job_hunter` in a transaction. The migration history table lives in `public`, allowing tracking before the application schema exists and after rollback. Future entities must explicitly use the application schema. Rollback drops only the empty application schema without CASCADE; no domain tables are created. Migrations are explicit operations, and repeated runs use recorded history rather than changing the schema again.

The simple build emits to `dist` without cleaning it. Explicit migration imports prevent stale files from running, but renamed source modules still require care when packaging artifacts. Future CI starts from a clean checkout.

## Schema ownership

Application tables must belong to `ai_job_hunter`. Future TypeORM entities must declare `@Entity({ schema: 'ai_job_hunter' })`; migrations must qualify application objects, for example `"ai_job_hunter"."jobs"`. The default `public` schema is retained for migration history only. New migrations must join the explicit migration list. Checkpoint 3 changes no database options or migrations and creates no business tables.

## API behavior

`/api/v1/health/live` returns 200 with `{"status":"ok"}` without querying PostgreSQL. `/api/v1/health/ready` executes `SELECT 1` using a short-lived pg client configured from the injected TypeORM DataSource and returns the same body on success, or 503 with `{"status":"unavailable"}` on failure or a 1.5-second deadline. Both responses disable caching and contain no database diagnostics.

The readiness service shares one active probe across concurrent callers. A deterministic test demonstrated that the previous Promise.race implementation could retain an unresolved query forever, preventing recovery. The smallest safe fix is a dedicated short-lived pg client: the 1.5-second response deadline closes its connection and clears the pending probe, so subsequent requests can try again. Connection establishment and server statement execution also have one-second limits. Late completion cannot overwrite a newer probe, and shutdown cancels an active probe. No TypeORM pool settings or migration options changed.

The trade-off is a new database connection per completed probe batch, rather than reuse of the application pool. This checks database connectivity and authentication, not pool saturation or schema correctness. The existing pg dependency provides cancellation by closing the owned active-query connection, without disturbing pooled business work or adding a circuit breaker. Startup still requires TypeORM's initial connection; liveness independence applies after startup.

Startup validates NODE_ENV, API_PORT (default 3000), and existing database options before creating Nest. The shared global ValidationPipe transforms DTOs, whitelists fields, rejects unknown properties, and suppresses detailed validation payloads. Future DTOs must be concrete decorated classes; health routes accept no DTO input, so no artificial write endpoint was introduced merely to exercise validation.

## Frontend behavior

React Router redirects `/` to `/dashboard`. `/candidates`, `/jobs`, `/matches`, and `/settings` display explicit coming-soon pages; unknown paths display a not-found page with a dashboard link. The shell uses a sidebar on larger screens and wrapping navigation on small screens. Dashboard cards explain future capabilities without fabricated metrics, matches, or functional upload controls.

The readiness indicator starts in a loading state, then shows API ready or unavailable. Native fetch checks the status code and JSON body, aborts after three seconds, polls 30 seconds after completion, and supports manual retry. Cleanup aborts pending requests and clears timers. Status updates use a polite live region. Failure does not block navigation or hide empty states.

Vite proxies `/api` to `http://127.0.0.1:3000`. API_PORT can select another backend port for isolated checks (the test example uses 3001); the regular proxy expects 3000. Production hosting must supply SPA history fallback and same-origin API routing; no production deployment or CORS expansion is included.

## Testing and delivery

Checkpoint 1 requires dependency installation, lint, formatting, type checks, builds, and basic startup verification. Do not add tests that merely duplicate scaffold markup.

Jest unit tests cover readiness deadlines, concurrency, unresolved and late queries, shutdown, recovery, controller HTTP semantics, and environment/database guards. The existing compiler emits source and tests to ignored `.test-dist`; Jest executes that ESM with no transform. Compilation cleans only generated test output first, avoiding stale removed tests. Unit tests mock pg client operations and use fake timers; controller tests use Nest's testing module and Supertest without a database.

Vitest runs React Testing Library in jsdom. Fetch is mocked for every component test. Tests cover root redirection, navigation, all placeholders, not-found routes, loading/success/failure, manual retry, automatic recovery, abort deadlines, and unmount cleanup. Only timer-specific cases use fake timers; no external HTTP dependencies or arbitrary sleep delays are used.

The separate integration suite validates the test target before any connection, then checks the actual database and role identity. It exercises real TypeORM migrations and real Nest HTTP responses. An established test administrator session temporarily changes only the test role to NOLOGIN and restores it in finally; this simulates a genuine authentication outage for readiness without stopping PostgreSQL or affecting development. Suites are serial and must not share the test database concurrently. A forcibly killed test can leave the test role disabled; recreate only the disposable test container to recover.

One Ubuntu CI job installs with the frozen lockfile, runs static checks and unit/component suites, builds, then starts the isolated test Compose service, executes compiled migrations, and runs integration tests. Action revisions are pinned, credentials are ephemeral and masked, permissions are read-only, and cleanup runs even on failure. No deployment or Windows job is configured. Local workflow linting cannot establish that GitHub-hosted execution passed.

## Task 01 acceptance checklist

- [x] Clean frozen-lockfile installation succeeds with the pinned toolchain.
- [x] Both development servers start and reload changes (prior checkpoint verification).
- [x] Development PostgreSQL is healthy and persists across ordinary restarts.
- [x] Test PostgreSQL is isolated and unsafe test targets are rejected.
- [x] TypeScript and compiled JavaScript migrations apply, revert, reapply, and repeat safely.
- [x] Automatic schema synchronization and startup migrations are disabled.
- [x] Liveness and readiness meet their documented status behavior.
- [x] Frontend routing, responsive layout, loading, empty, and unavailable states work (user-confirmed browser verification plus component tests).
- [x] Formatting, lint, type checks, unit/component tests, and integration tests pass.
- [x] Both production builds succeed.
- [ ] Ubuntu CI passes on GitHub (local checks alone do not satisfy this).
- [x] README and architecture instructions match the completed implementation.
- [x] No secrets, personal data, or excluded features are introduced.

This checklist combines automated results, earlier checkpoint verification, and user-confirmed browser checks. GitHub-hosted CI remains unchecked until it actually runs.

## Checkpoint 2 verification notes

Verified locally on 2026-10-21 using Node 24.22.1 and pnpm 12.14.0:

- Both Compose configurations validated with `config --quiet`; both PostgreSQL containers reached healthy status.
- Development source migrations passed apply, show, revert, reapply, and repeat-run checks. Compiled JavaScript migrations passed the same lifecycle on the isolated test database. Repeated runs reported no pending migrations.
- SQL inspection confirmed one migration-history row and an empty application schema in each database. A development container down/up cycle preserved the schema and history; recreating the test container removed its schema, after which compiled migrations applied again.
- Ten negative configuration checks rejected unsafe/missing test settings. Test credentials were also rejected by the development server with PostgreSQL authentication error 28P01.
- The compiled Nest application initialized TypeORM and responded with the expected 404 before being stopped. No health controller was introduced.
- The Docker Desktop forwarding layer rejected local port 5432. Verification used development port 5434 in the ignored `.env`; examples retain the configurable default of 5432. Test port remains 5433.
- Source CLI commands emitted ts-node ESM loader and fs.Stats deprecation warnings; compiled CLI commands did not require that loader.

These are checkpoint smoke checks, not an automated test-suite implementation. Jest, Vitest, integration suites, and GitHub Actions remain Checkpoint 4 work.

## Checkpoint 3 verification notes

Verified locally on 2026-10-22:

- `pnpm dev` started Vite and Nest after Docker Desktop WSL integration became available. Frontend `/`, `/dashboard`, `/candidates`, and an unknown path returned the SPA entry with HTTP 200.
- Direct liveness/readiness and Vite-proxied readiness returned HTTP 200 with `{"status":"ok"}`.
- A separate API on port 3001 used only the isolated test database. Pausing that database produced readiness 503 in 1,503 ms while liveness remained 200. Unpausing restored readiness 200. Stopping/restarting the test database also produced 503/200 and recovered to 200. Development readiness remained 200 during both outages.
- Readiness failure bodies contained only `{"status":"unavailable"}`; health responses set `Cache-Control: no-store`.
- One-off validation smoke checks verified invalid environment rejection, DTO transformation, unknown-field rejection, and invalid-type rejection without returning submitted values. No automated test suite or test-only endpoint was added.
- Formatting, lint, type checking, builds, and frozen-lockfile installation passed. Initial MUI type errors were corrected by placing layout styles in `sx`.
- Browser rendering, mobile interaction, and live indicator transitions were not visually verified because no browser tooling is available in this session. HTTP SPA fallback checks alone do not verify client-side rendering. Component tests remain Checkpoint 4 work.

## Checkpoint 4 decisions and verification

The unresolved-query regression was first executed against the old implementation and failed as expected. The retained regression passes with connection cleanup and fresh-probe recovery. No test was skipped or weakened to bypass the failure. The source tree remains ESM; additional test-only dependencies are Jest, Nest testing, Supertest/types, Vitest, Testing Library, jsdom, and pg types for the existing driver.

The earlier checkpoint limitations above describe their historical verification state. The user subsequently confirmed real-browser navigation, responsive layout, readiness/retry, Vite proxy, and recovery before authorizing Checkpoint 4. Current component tests automate functional behavior but do not claim browser pixel/layout coverage.

Final local results: 31 Jest unit/controller/configuration tests, 16 Vitest component tests, and 7 PostgreSQL integration tests passed (54 total; no skipped tests, retries, or observed flaky failures). The complete required command sequence passed: frozen-lockfile installation, formatting, lint, type checking, unit/component tests, builds, integration tests, and `git diff --check`. A separate clean manifest-only workspace also installed successfully from the frozen lockfile.

Workflow validation with actionlint 1.7.7 passed; official action commit revisions were resolved from their upstream repositories. GitHub Actions itself has not run. A deliberate integration invocation with DB_ENV=development exited unsuccessfully at the configuration guard before connecting, as required. The test role's LOGIN capability was confirmed restored after the outage test. The disposable test service was stopped; development PostgreSQL remained healthy on port 5434 with its persistent volume untouched.

## Task 02 / Checkpoint 3.2: internal AI provider

The internal `AiModule` exports `AiService`; feature modules will own prompts, schemas, and business rules. `AI_PROVIDER` is the injection token for a provider-neutral text generation contract. `OllamaProvider` owns HTTP details and envelope validation. No controller, database dependency, frontend integration, or Gemini implementation is added. A future adapter can replace the token without changing business callers. There is no cloud fallback, retry, streaming output, or startup connectivity probe. Existing health semantics are unchanged.

`AiService.generateStructured` accepts an application-owned JSON Schema and returns runtime-validated `unknown`. This deliberately avoids a generic return assertion that could promise an unrelated TypeScript type. Callers will need a typed boundary when domain contracts are introduced. Ajv is the sole new runtime dependency: unlike DTO decorators, it directly validates the same JSON Schema sent to the model. Native Node fetch avoids an SDK or HTTP client dependency.

Schemas use a strict draft-07 subset: explicit `type`; `title`/`description`; `properties`, `required`, boolean `additionalProperties`; homogeneous `items`; `enum`/`const`; numeric minimum/maximum (including exclusive bounds) and multipleOf; string minLength/maxLength; array minItems/maxItems. Nullable fields use a two-member type array such as `["string", "null"]`. Nullable does not mean optional: `required` controls presence, and enums must explicitly include null when permitted. Arbitrary unions, composition, references, formats, patterns, defaults, OpenAPI `nullable`, tuple arrays, and other keywords are rejected before HTTP. Nesting is limited to 32. Schemas are trusted application code, not public user input. Ajv strict mode checks schema correctness and validates output without coercion, defaults, or property removal. Per-call compilation avoids an unbounded cache but adds compilation overhead; reuse can be introduced when stable domain schemas exist. A snapshot keeps transport and validation consistent.

Ollama receives POST `/api/generate` with `stream:false`, `think:false`, and the schema in `format`. The adapter rejects non-success HTTP responses, malformed UTF-8/JSON envelopes, incomplete generations, and unexpected completion reasons. The service parses generated JSON and validates it; it does not strip code fences or repair output. Schema validity does not establish factual accuracy or authorize downstream actions.

Configuration uses the existing pure-function pattern, validated both before Nest bootstrap and in the module factory. Defaults: `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:4b`, `AI_REQUEST_TIMEOUT_MS=120000`. URLs must be HTTP(S) origins without credentials, paths, queries or fragments; redirects are disabled. Models must be nonempty without whitespace. Timeout must be an integer from 1000 through 300000 ms. These are server-owned settings, never caller-selected destinations or browser variables. The adapter defaults to local loopback but does not enforce loopback for a configured origin; local-only inference requires retaining a local destination. The manual smoke script explicitly pins loopback.

One AbortController deadline covers fetch and body consumption. Expiry aborts transport and cancels the body reader; finally clears the timer and releases resources. The body is counted incrementally with a fixed 1 MiB limit independent of Content-Length; overflowing responses are aborted. This bounds received data, while JSON decoding/parsing and schema validation remain synchronous local work. Errors distinguish INVALID_SCHEMA, TIMEOUT, CONNECTION_FAILURE (including interrupted body transport), UPSTREAM_HTTP_FAILURE, MALFORMED_RESPONSE, INVALID_JSON, SCHEMA_VALIDATION_FAILURE and RESPONSE_TOO_LARGE. Errors contain fixed messages and no upstream payload, cause, URL or schema diagnostics. The module performs no logging. Future controllers must map these internal errors to sanitized HTTP responses.

Jest tests mock native fetch and use synthetic streams and fake timers. They cover protocol fields, nullable/nested schemas, mutation-free validation, unsupported schemas, failure categories, stalled fetch/body cancellation, byte limits, UTF-8 chunk boundaries, recovery, configuration, and Nest provider substitution. They require no Ollama, GPU or PostgreSQL. Existing PostgreSQL integration tests remain a separate command; no migration changed. Live verification is separate from these automated tests; see Checkpoint 3.3 below.

Checkpoint 3.2 hardening keeps the schema walker limited to the supported keyword/type subset, nesting and traversal boundaries. Ajv strict compilation remains responsible for schema correctness, including `required` shapes and keyword/type compatibility. Snapshot serialization rejects non-JSON values instead of silently dropping or converting them. Reader cancellation is initiated once, with rejection handled immediately, and is never awaited; the lock is released after the active read settles even if underlying cancellation hangs or rejects. Negative schema and cleanup tests cover these boundaries.

Follow-up work, outside Checkpoint 3.2: caller-provided cancellation and inference metrics. Neither is exposed in the current provider/service contracts.

## Task 02 / Checkpoint 3.3: explicit local smoke test

`apps/api/test/manual/ollama.smoke.ts` uses `NestFactory.createApplicationContext(AiModule)` with logging disabled, then calls the actual injected `AiService`. It avoids `AppModule`, HTTP listeners and database initialization. Existing TypeScript test compilation preserves decorator metadata; the manual filename/path is outside Jest's unit/integration discovery. The dedicated `smoke:ollama` command is never part of regular tests or CI.

The script pins local loopback Ollama, `qwen3:4b` and a 120-second timeout regardless of inherited AI settings; it refuses CI invocation. Its general extraction schema uses nullable numeric durations and forbids extra properties, without embedding expected skill names or years. Independent assertions compare the returned name and sorted exact skill list, detecting duplicate/invented skills and zero instead of null. Only sanitized status and elapsed wall-clock duration are printed; assertion diagnostics and raw generated output are suppressed. Context cleanup runs on success and failure. This single synthetic generation is an integration smoke check, not an extraction-quality benchmark. Caller cancellation and inference metrics remain deferred.

Checkpoint 3.3 verification: the explicit local smoke command passed with `elapsed_ms=4615`, validating the expected name and exactly React=5, NestJS=null and PostgreSQL=null through the real module/service/provider chain. The sandboxed attempt failed with CONNECTION_FAILURE; the permitted run outside the network sandbox succeeded. No Ollama service was started or model downloaded. This records one successful generation, not a guarantee of deterministic model output.
