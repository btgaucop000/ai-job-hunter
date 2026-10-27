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

Configuration uses the existing pure-function pattern, validated both before Nest bootstrap and in the module factory. Defaults: `AI_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen3:4b`, `AI_REQUEST_TIMEOUT_MS=120000`. URLs must be HTTP(S) origins without credentials, paths, queries or fragments; redirects are disabled. Models must be nonempty without whitespace. Timeout must be an integer from 1000 through 300000 ms. These are server-owned settings, never caller-selected destinations or browser variables. Checkpoint 4.2 now enforces literal loopback origins, superseding the original configurable remote-origin behavior described by Task 02. The manual smoke script explicitly pins loopback.

One AbortController deadline covers fetch and body consumption. Expiry aborts transport and cancels the body reader; finally clears the timer and releases resources. The body is counted incrementally with a fixed 1 MiB limit independent of Content-Length; overflowing responses are aborted. This bounds received data, while JSON decoding/parsing and schema validation remain synchronous local work. Errors distinguish INVALID_SCHEMA, TIMEOUT, CONNECTION_FAILURE (including interrupted body transport), UPSTREAM_HTTP_FAILURE, MALFORMED_RESPONSE, INVALID_JSON, SCHEMA_VALIDATION_FAILURE and RESPONSE_TOO_LARGE. Errors contain fixed messages and no upstream payload, cause, URL or schema diagnostics. The module performs no logging. Future controllers must map these internal errors to sanitized HTTP responses.

Jest tests mock native fetch and use synthetic streams and fake timers. They cover protocol fields, nullable/nested schemas, mutation-free validation, unsupported schemas, failure categories, stalled fetch/body cancellation, byte limits, UTF-8 chunk boundaries, recovery, configuration, and Nest provider substitution. They require no Ollama, GPU or PostgreSQL. Existing PostgreSQL integration tests remain a separate command; no migration changed. Live verification is separate from these automated tests; see Checkpoint 3.3 below.

Checkpoint 3.2 hardening keeps the schema walker limited to the supported keyword/type subset, nesting and traversal boundaries. Ajv strict compilation remains responsible for schema correctness, including `required` shapes and keyword/type compatibility. Snapshot serialization rejects non-JSON values instead of silently dropping or converting them. Reader cancellation is initiated once, with rejection handled immediately, and is never awaited; the lock is released after the active read settles even if underlying cancellation hangs or rejects. Negative schema and cleanup tests cover these boundaries.

Follow-up work, outside Checkpoint 3.2: caller-provided cancellation and inference metrics. Neither is exposed in the current provider/service contracts.

## Task 02 / Checkpoint 3.3: explicit local smoke test

`apps/api/test/manual/ollama.smoke.ts` uses `NestFactory.createApplicationContext(AiModule)` with logging disabled, then calls the actual injected `AiService`. It avoids `AppModule`, HTTP listeners and database initialization. Existing TypeScript test compilation preserves decorator metadata; the manual filename/path is outside Jest's unit/integration discovery. The dedicated `smoke:ollama` command is never part of regular tests or CI.

The script pins local loopback Ollama, `qwen3:4b` and a 120-second timeout regardless of inherited AI settings; it refuses CI invocation. Its general extraction schema uses nullable numeric durations and forbids extra properties, without embedding expected skill names or years. Independent assertions compare the returned name and sorted exact skill list, detecting duplicate/invented skills and zero instead of null. Only sanitized status and elapsed wall-clock duration are printed; assertion diagnostics and raw generated output are suppressed. Context cleanup runs on success and failure. This single synthetic generation is an integration smoke check, not an extraction-quality benchmark. Caller cancellation and inference metrics remain deferred.

Checkpoint 3.3 verification: the explicit local smoke command passed with `elapsed_ms=4615`, validating the expected name and exactly React=5, NestJS=null and PostgreSQL=null through the real module/service/provider chain. The sandboxed attempt failed with CONNECTION_FAILURE; the permitted run outside the network sandbox succeeded. No Ollama service was started or model downloaded. This records one successful generation, not a guarantee of deterministic model output.

## Task 03 / Checkpoint 4.2: contracts and safety boundaries

The extraction domain lives in `apps/api/src/extraction`, with no Nest module registration or orchestration yet. It owns CV/JD types, model-output schemas, source snapshots, validation, limits and fixed error messages. No dependency was added. The schemas use the existing AiService/Ajv subset; required properties and `additionalProperties: false` apply to all objects. Cross-field constraints are enforced deterministically after structural validation because schema composition is deliberately unsupported. Runtime-validated unknown values are narrowed at the domain boundary, with tests exercising both schemas through the actual AiService and a mocked provider.

CV fields are name, email, phone, location, skills (name, experienceText), experience (employer, title, startDateText, endDateText, descriptionText), and education (institution, qualification, dateText). JD fields are title, company, location, employmentType, requirements (text, priority), responsibilities (text facts), and compensationText. Each scalar uses `{ value, evidence }`; priority permits only required, preferred or null. Null requires empty evidence; non-null requires evidence. Empty arrays mean nothing was extracted, not proof of absence. Empty history records, unnamed skills, and null requirement/responsibility entries are rejected. Dates and durations are verbatim strings, without calculations or normalization.

Model evidence contains only `segmentId` and `quote`; supplying offsets is a schema violation. Validation resolves an exact, unique occurrence within that segment, including detection of overlapping repeated matches. Output references add global zero-based UTF-16 start/end positions, end exclusive, into the unchanged source text. A repeated quote elsewhere in another segment is not ambiguous. Normalization, whitespace rewriting and fuzzy matching are intentionally absent. Ordinary values must occur verbatim in at least one supporting quote. Duplicate references and boundaries splitting surrogate pairs are rejected.

Sources are validated, cloned and deeply frozen; caller mutations cannot change the snapshot. Segments must have unique IDs, sorted non-overlapping valid ranges and appropriate page metadata (PDF page numbers, null for DOCX/JD). Gaps are allowed for separators. CV accepts PDF/DOCX sources; JD accepts plain text. Later parsers must construct these sources from their actual output. This checkpoint does not establish authenticity of caller-provided text or file format.

Priority evidence requires an explicit whole-word required/preferred cue, case insensitive, in a passage containing the requirement value and enclosing at least one of its evidence references in the same segment. This conservative English cue rule rejects synonyms and translated cues; unknown priority remains null. Evidence establishes textual occurrence, not semantic entailment: negation, incorrect attribution and document truthfulness still require extraction-quality review. The utilities do not claim prompt-injection resistance; prompts and orchestration are deferred.

Enforced limits: 5 MiB file bytes, 12,000 UTF-16 text units and 48 KiB UTF-8 text, 64 KiB serialized model output, 1,000 characters per fact/quote, two references per fact, 50 ordinary list entries, 20 history entries, and 1,000 source segments. PDF provenance page numbers are capped at 20. Input file validation accepts a matching PDF/DOCX extension and MIME type, rejects path/control characters in names, and checks nonempty bytes. It deliberately does not interpret file signatures or ZIP structures. Parser page counts, ZIP limits, parser timeout, prompt size and concurrency constants reserve the approved policy for later checkpoints and are not runtime protections yet. No truncation, inference retry or output repair is performed. Output size checks apply to the model payload, before derived offsets are added.

Errors expose only fixed codes/messages, without payloads, diagnostic causes or logging. Data is processed in memory by pure utilities; there is no filesystem/database persistence. This does not promise secure erasure or control host swap/crash dumps.

AI configuration now checks the literal origin before WHATWG URL normalization: only HTTP(S) with `127.0.0.1` or `[::1]`, optional numeric port and optional trailing slash. DNS names (including localhost), remote addresses, IPv4 shorthand/hex/octal, expanded/mapped IPv6 and whitespace variants are rejected. Existing defaults and redirect rejection are preserved. This reduces accidental remote disclosure without coupling extraction to OllamaProvider. It assumes the local server itself is trusted; a loopback proxy forwarding data is outside this configuration guarantee.

Tests use synthetic in-memory text/bytes, mocked AI generation and no live inference. They cover contract compatibility, unknowns, invalid schemas, Unicode offsets, ambiguous/cross-segment evidence, source immutability, metadata/size bounds, sanitization and remote-origin rejection. Real parser fixtures, parser lifecycle tests, prompts and end-to-end orchestration remain later checkpoints. PostgreSQL integration tests and migrations are unchanged.

## Task 03 / Checkpoint 4.3B: worker lifecycle and PDF text

This checkpoint implements only PDF parsing. `DocumentParser` owns a single active operation; the exported `documentParser` is the intended process owner. No Nest module, controller, AI orchestration or DOCX parser is registered. Tests construct separate owners to exercise lifecycle states. Future Nest wiring must reuse the exported owner rather than construct multiple instances.

The sole new direct dependency is exactly `pdfjs-dist@6.4.299`. Its package engines accept Node 24, but its standard ESM build failed a real Node 24.22.1 probe (`hashOriginal.toHex is not a function`). The approved legacy ESM entry includes upstream compatibility support and works with the existing TypeScript/NodeNext build. No application polyfills, global patches, Node upgrades or compiler changes were introduced. The package's previously reviewed optional canvas dependency is present in the lockfile/install; workers run with `execArgv: ['--no-addons']`, so native bindings cannot load. Legacy import attempts canvas loading and emits warnings; parent-owned stdout/stderr streams are drained and discarded. This is not canvas rendering and no canvas APIs are invoked.

`pdf.resources.ts` contains exact font/CMap filename manifests for the pinned package. Resource roots are resolved from `import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs')`, independent of cwd. A request selects an exact `(kind, filename)` manifest key; it never supplies a base URL or a filesystem path. Only fixed URLs under `standard_fonts/` and `cmaps/` are read, with realpath equality against the canonical package directory and a resource byte bound. Unknown kinds, URLs, absolute paths, traversal, encoded paths and non-manifest filenames fail with a fixed error and latch resource failure. The installation and package code are trusted; this is not protection against an attacker concurrently rewriting installed dependencies. No package files are modified.

PDF loading receives bytes only, not a URL or range transport. `useWorkerFetch`, system fonts, font faces, WASM, XFA, streaming/range loading, image decoder and offscreen canvas support are disabled. A custom BinaryDataFactory supplies only approved bundled resources. No resource URLs, document base URL, browser renderer, document scripting API, or arbitrary filesystem loader is exposed. A resource failure is checked independently after text extraction because PDF.js may otherwise catch resource exceptions and continue. Tests exercise allowed fonts and CMaps and reject external resource requests; a reachable HTTP canary receives no request from a document with external actions. These are application configuration boundaries, not an OS/network security sandbox.

The parent copies input into its own transferable ArrayBuffer so caller bytes are not detached. Worker data is a narrow versioned PDF-only message without filenames or server environment; workers receive an empty environment. The worker validates input, imports the parser, returns a single sanitized terminal message and closes its port. The parent validates the response and recreates/freeze-copies the source because structured clone does not preserve frozen state. Sources and warnings are immutable in the returned result. A fixed worker URL relative to `import.meta.url` resolves to `dist/extraction/parser.worker.js` for development/production and `.test-dist/src/extraction/parser.worker.js` under Jest; no asset-copy or loader changes are required.

A 10-second parent deadline covers startup, parsing and cleanup. After a terminal message the parent initiates worker termination and waits for its exit event or fulfilled terminate promise before resolving success or releasing admission. Timeout rejects the call promptly, but admission remains occupied until termination is confirmed. A one-second termination grace bounds waiting for confirmation; rejection, synchronous termination failure or missing confirmation latches the owner unavailable, even if an exit is later observed. No replacement worker is admitted in that state. Confirmed crashes, malformed messages and parser failures release admission and permit a subsequent operation. Late/duplicate terminal messages cannot overwrite the first terminal response. Shutdown stops admission permanently, terminates an active worker and observes completion; unconfirmed termination makes shutdown reject with a sanitized error. A fresh process/owner is needed after an unavailable latch; production callers must not bypass it by constructing replacements.

The worker has a 128 MiB old-generation heap budget. This does not bound external ArrayBuffers, native allocations, total RSS, or all CPU behavior; worker threads are not a hostile-code sandbox. No generic pool, queue, retry or background service was added.

The parser checks PDF signature and the existing 5 MiB input limit, then a maximum of 20 pages. It consumes page text streams sequentially with normalization disabled, retaining item strings and `hasEOL` line breaks in PDF.js order. Pages are separated by two newline code units; all content and separators count toward the 12,000 UTF-16/48 KiB text bounds. No output truncation, column sorting or post-offset whitespace rewriting occurs. One segment describes each usable page with original page number and global exclusive UTF-16 offsets. Blank pages have warnings rather than invalid zero-length segments. All-empty/image-only input fails with the existing no-text error; mixed documents return available text, explicit empty-page warnings and the universal image-content-not-interpreted warning. A blank page warning does not assert a scan. Glyph interpretation, reading order, off-page text and visual coverage remain PDF.js limitations; offsets describe its extracted text, not original PDF bytes.

Password requests are rejected without collecting credentials. Parsing, resource access, worker protocol and runtime failures never expose raw errors, causes, filenames, source text or library diagnostics. PDF page readers are cancelled/released and pages/loading tasks cleaned up in finally blocks; parent termination covers stalled cleanup. No document is persisted. Standard font/CMap reads and dependency loading are the only intended file reads in parsing.

Synthetic PDF builders in `test/support/pdf-fixtures.ts` create reproducible page, image, encrypted and Unicode/CMap fixtures without personal data or generator dependencies. Tests cover real workers, byte/page/text bounds, immutable UTF-16 sources, allowed/denied resources, sanitization, concurrency, timeout, shutdown, termination failure, late responses and recovery. A test-only CPU-stalled worker proves real termination. `scripts/check-pdf-parser.mjs` uses the production build with synthetic compiled test support to verify text, CMap, Unicode offsets and failure recovery outside Jest. DOCX/ZIP/XML dependencies and behavior remain Checkpoint 4.3C; its approved external-hyperlink policy is not implemented here.

## Task 03 / Checkpoint 4.3C: DOCX preflight and parser agreement

The approved exact dependencies are yauzl 3.4.0, mammoth 1.13.0 and @xmldom/xmldom 0.9.12, with @types/yauzl 3.4.0 in development dependencies. Their registry metadata was verified against Node 24 before installation. Mammoth brings its own older XML parser transitively; the direct 0.9.12 parser handles strict application preflight. No additional archive writer dependency is introduced: the synthetic test encoder is test support only.

`docx-zip.ts` uses yauzl lazy enumeration, full local-header inspection and sequential decompression streams. It enforces 1,000 entries, 5 MiB expanded per entry, 20 MiB expanded total and 100:1 per-entry/aggregate expansion. Declared limits reject early; actual decompressed chunks are counted independently and checksummed with Node's CRC32. Every entry is streamed, including unused media. Only XML/relationship buffers are retained for preflight. Streams are destroyed and the archive closed in finally blocks on success and error; worker termination covers synchronous stalls.

The supported ZIP profile requires STORE/DEFLATE, canonical ASCII entry names, identical raw local/central names, consistent flags/methods/CRC/sizes/extra fields, non-overlapping contiguous local records, and a consistent single-disk directory/end record. Fixed envelope checks supplement yauzl; there is no application ZIP record scanner or decompression implementation. Duplicate names and case/path aliases, traversal, absolute paths, backslashes, encrypted entries, symlinks, ZIP64, data descriptors, alternative name encodings, archive comments and unsupported layouts are rejected. This is a deliberate compatibility restriction, not a claim that every rejected archive is malicious. Executable/OLE/nested-ZIP signatures and executable/package filenames are rejected even if disguised as ordinary media.

`docx-package.validation.ts` parses bounded XML with fatal UTF-8 decoding and @xmldom/xmldom configured to throw on all warnings/errors. It rejects DTD/entity declarations before parsing, doctypes, unsupported encoding declarations, excessive tree depth/node counts and invalid main document structure. XML parts are never resolved through external loaders. The namespace-aware checks require content types, root relationships, one internal office-document relationship and an existing main XML part with the ordinary DOCX main-document content type. Macros, embedded OLE/executable packages, external templates/images/imports and unsupported relationship types fail closed. The initial profile supports transitional OOXML; strict OOXML namespaces and non-UTF-8 XML are unsupported rather than silently translated.

The main-part differential is addressed by preconditions, pinned behavior and regression tests. Main targets cannot contain `.` or `..` components or encoded/ambiguous paths. Exactly one canonical office-document relationship must name an existing part; raw local/central ZIP name equality and restricted encodings ensure Mammoth/JSZip sees the same exact key as yauzl. With those preconditions, the pinned Mammoth resolver selects that existing target and never takes its missing-target fallback. Canonical custom main paths remain supported, including a conflicting `word/document.xml` containing different text. Tests verify actual Mammoth output is from the selected custom part. Missing targets and dot-segment targets fail before extraction even when a fallback exists. Production does not import Mammoth private APIs, rewrite relationships, or infer agreement from equal extracted text. Any dependency upgrade must rerun these differential fixtures and review resolver behavior; Mammoth does not expose selected-part metadata through its public API.

Other internal relationships are not subject to a blanket dot-component ban. They resolve relative to the owning part with explicit rejection of package escape and unsupported URI encodings. Image/header/footer paths may use safe parent components. For Mammoth-consumed styles, numbering, comments, footnotes and endnotes, ambiguous target spellings or multiple targets are rejected because its resolver does not normalize these paths. All XML parts, including conventional fallback parts, receive preflight before Mammoth can read them. HTTP(S) and mailto external hyperlink relationships are permitted, with credentialed or executable schemes rejected; hyperlinks are never fetched, dereferenced, rendered or opened. Other external relationship types fail closed. These are narrow application boundaries, not a network/filesystem security sandbox.

`docx.parser.ts` passes the same validated in-memory archive to `mammoth.extractRawText({buffer})`; no filesystem path, conversion options, image converter or external-file permission is supplied. It never calls HTML conversion. Error-severity messages fail parsing; warnings become a fixed DOCX_CONTENT_WARNING code without retaining their payloads. Text is kept exactly as returned by Mammoth, including tabs, Unicode, leading/trailing whitespace and paragraph separators. Segments are spans between Mammoth's double-newline delimiters, omitting whitespace-only spans without deleting text. Literal double-newlines within text may also form segment boundaries; these are extracted-text paragraph spans, not a full Word layout model. Every segment has page=null, global zero-based UTF-16 offsets and an exclusive end. Existing CV evidence validation accepts these sources unchanged. Empty or oversized text/segment counts reject rather than truncate.

The worker request now admits pdf or docx and dispatches inside the same short-lived worker. Parent byte-copying, admission, timeout, observed termination, fail-closed unavailability, diagnostics suppression and shutdown behavior are unchanged. The parent additionally checks response format against the request. The protocol minimally extends pageCount to number|null and adds a sanitized DOCX warning; DOCX cannot carry PDF page warnings. Returned source/warnings remain frozen after parent validation. No second worker system, module registration, endpoint or AI orchestration was added.

Synthetic fixtures cover actual raw text, tabs/Unicode, hyperlinks with a local no-fetch canary, canonical/custom/dot/missing main parts, conflicting fallbacks, safe versus escaping relative targets, macros/external content, XML/entity errors, corrupt CRC and declared sizes, duplicate/unsafe paths, encrypted/symlink/unsupported archives, real decompression budgets and source/evidence offsets. The shared real-stalled-worker test now runs for both PDF and DOCX, proving deadline termination and subsequent recovery. Production verification retains the existing script name `scripts/check-pdf-parser.mjs` but exercises both formats through the compiled production worker, including DOCX main-part agreement and failure recovery.

Limitations remain: worker heap controls do not cap all process memory, dependencies are trusted code, and a bounded parser is not a security sandbox. Mammoth raw text does not guarantee visual completeness, table/layout fidelity, image text, headers/footers or every Word feature. Semantic truth and prompt-injection handling remain later extraction concerns. No document persistence, network fetching, OCR, database changes or frontend changes are introduced.

## Task 03 / Checkpoint 4.4C: fixed Ollama context policy and parser cleanup

The provider-neutral `AiService.generateStructured({prompt, schema})` contract is unchanged. The Ollama provider supports exactly server 0.40.10 and qwen3:4b digest `359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7` (the locally verified Q4_K_M Thinking-2507 artifact). Changing the model tag, digest or server requires a reviewed profile update; configuration accepting another model name does not authorize inference with it. There is no model registry or tokenizer dependency.

Each call checks `/api/version` and `/api/tags`, generates one measurement token, checks `/api/ps`, performs actual generation, and checks `/api/ps` again. Both generations snapshot the same prompt/schema and use `num_ctx=8192`, `temperature=0`, `think=false`, `truncate=false`, `shift=false`, and non-streaming responses. Only `num_predict` differs: 1 versus 2048. The pinned release's request types and generation paths were inspected during 4.4B: https://github.com/ollama/ollama/blob/v0.40.10/api/types.go and https://github.com/ollama/ollama/blob/v0.40.10/server/routes.go. Its local synthetic over-context request with truncation disabled returned HTTP 400. These verified controls and the trusted pinned runner are necessary; token arithmetic alone does not prove input preservation.

Measurement accepts only explicit `stop` or `length`, completed envelopes, one evaluated output token, and valid prompt/cache counts. Its content is discarded. A prompt above 6080 tokens fails admission: 8192 minus 2048 reserved output minus 64 safety tokens. This is measured token accounting, not a byte conversion. Cached tokens already contribute to `prompt_eval_count`; they are not added twice. Actual generation must report `stop`, consistent prompt count, positive bounded output count and no thinking content. Missing metadata, unknown finish reasons, wrong model or malformed counts reject. Actual `length` becomes OUTPUT_LIMIT_EXCEEDED even if its text happens to be valid JSON. No retry, output repair, context expansion or truncation fallback occurs. Provider HTTP errors remain sanitized UPSTREAM_HTTP_FAILURE; their bodies are not parsed to infer context errors.

One timeout/AbortController covers every metadata request, both inference passes and response reading. Each response has the existing cumulative 1 MiB byte ceiling; response bodies are never logged. Metadata is rechecked per call, not cached across calls. `/api/ps` must identify the exact digest, 8192-token allocation and llamacpp runner. It is a snapshot, not an atomic lock: the local daemon must be trusted, and model replacement, server upgrades and competing context reconfiguration must not occur during a call. The app does not control external clients or server logging. No document persistence is introduced, but this is not a guarantee of immediate daemon/app memory erasure.

This policy performs real inference for measurement, not generation-free preflight. Larger documents may satisfy character/byte limits yet fail token admission. The 2048-token output ceiling can reject otherwise valid large extractions. The spike measured about 3.88 GB allocated VRAM at 8192 context on RTX 4060; this is not a worst-case memory/latency guarantee. Neither context admission nor JSON validity establishes semantic extraction correctness.

`DocumentParser.waitForIdle()` observes active cleanup without terminating a healthy worker or closing admission. It returns only after confirmed cleanup and rejects if the parser is closed or permanently unavailable. A timeout rejection alone still does not mean idle. Unconfirmed termination remains permanently latched, including after a late exit. Waiting does not reserve a parser slot; the future extraction owner must coordinate whole-extraction admission. No ExtractionModule, ExtractionService or extraction prompts are introduced here.

## Task 03 / Checkpoint 4.4D: internal extraction orchestration

`ExtractionModule` imports AiModule, exports only ExtractionService, and is registered in AppModule without controllers. The internal methods are `extractCv({bytes,fileName,mediaType})` and `extractJd({text})`. CV uses the existing process-owned documentParser and its production worker. JD validates unchanged plain text and creates one segment `jd-1` covering all UTF-16 code units with page=null. Repeated quotes within that segment must be disambiguated with longer exact quotes; no heuristic first-match selection is allowed. Existing source, field, evidence, date and duration contracts remain unchanged.

Fixed application-owned prompts serialize source.text exactly once in a JSON payload alongside segment metadata, surrounded by explicit extraction instructions. Filenames, caller prompts, schemas, model settings and destinations are not included or accepted as controls. The prompt says document commands/role claims/URLs are untrusted data, requires exact values/quotes and segment IDs rather than evidence offsets, and directs unknown or contradictory scalar facts to null with empty evidence. Whole assembled UTF-8 prompt size, including escaping and metadata, is limited to 64 KiB before inference. The AI layer independently enforces its verified token/context profile. No truncation, chunking, repair or retry is introduced. Delimiters and instructions reduce injection risk but are not a security boundary proving model obedience; the model has no tools or external-action capability here.

AiService handles JSON parsing/schema validation; the extraction validators then recheck output shape/size, domain constraints and exact textual grounding. Any invalid populated fact rejects the entire extraction; invalid entries are not removed or changed to null. Missing information may legitimately produce null scalars and empty collections. Deterministic validators do not establish semantic truth, interpret negation or prove completeness. A mock can return an exactly quoted but semantically misleading fact that passes validation; a regression test documents this limit. The system cannot detect every omitted fact or a model silently omitting content to satisfy list/output limits. All successful envelopes therefore carry EXTRACTION_COMPLETENESS_NOT_VERIFIED. Observed output-limit termination remains a hard AI failure, not a partial result.

Duplicate rules operate after evidence resolution: exact skill names, requirement text (regardless of priority) and responsibility text must be unique. Employment/education are duplicates only when all field values and evidence references match. Evidence arrays are compared as unordered sets of exact reference tuples (segmentId, quote, start, end), so reordering references does not evade duplicate detection. Values/quotes are never trimmed, case-folded or normalized for identity. Identical history values with different supporting references remain distinct. These rules are deterministic, not semantic deduplication.

The result is a deeply frozen discriminated envelope `{schemaVersion:"1",kind,source,data,warnings}`. Evidence offsets are exclusively computed against immutable extracted text. Parser warnings (including mixed/empty PDF pages and DOCX limitations) survive unchanged as fixed codes and safe page metadata. Result data, source, nested arrays, evidence references and warnings are frozen. There is no filename, raw model response, document persistence or cross-request result cache.

A single module-level ExtractionOwner binds the existing parser and process-wide admission state. Nest contexts share this owner, including its permanent closed/unavailable state. It has no lifecycle hook, and the parser is not separately registered as a lifecycle provider; ExtractionService alone coordinates an idempotent close. Tests can override the owner token with an isolated parser. Production callers must not construct replacement owners or invoke the documentParser outside extraction. The gate is acquired synchronously before input processing and shared by CV/JD; busy calls reject immediately, without a queue. It remains held through parsing, inference, validation, result freezing and confirmed parser cleanup. Parser timeout may reject internally before cleanup, but the service does not settle or release its gate until waitForIdle completes. Unconfirmed cleanup latches extraction unavailable, including for JD, even after a late worker exit.

Shutdown synchronously closes admission, calls parser.close exactly once, and awaits active inference and final cleanup using existing component deadlines. Active callers receive EXTRACTION_UNAVAILABLE rather than a result after shutdown. A pending waitForIdle that observes the closed parser is reconciled with the shutdown cleanup promise, avoiding a false permanent-failure report after confirmed termination. A failed close remains visible after active inference settles. There are no detached timers or inference cancellation/retry wrappers; AiService owns its deadline. Shutdown may wait for that deadline and trusts the internal provider to honor it.

EXTRACTION_BUSY, EXTRACTION_UNAVAILABLE, EXTRACTION_FAILED, PROMPT_TOO_LARGE and DUPLICATE_FACT extend the fixed extraction error taxonomy. Existing parser/validation codes and sanitized AiError codes remain available; exceptions are reconstructed without diagnostic causes or payloads. Unknown errors become EXTRACTION_FAILED. There is no extraction logging of source, filename, prompt, model output or quotes. Local inference still assumes a trusted daemon; in-memory processing does not guarantee immediate erasure or control daemon logging/host swap.

Mocked orchestration tests use the real AiService schema boundary, covering evidence, nulls, malformed responses, prompt limits, admission across service instances, errors and recovery. Real parser lifecycle tests exercise timeout/late-exit/unconfirmed termination and shutdown races through ExtractionService. Nest tests verify offline DI, the shared owner, narrow exports and one close across contexts. `node scripts/check-extraction.mjs` verifies the production compiled Nest module and actual PDF/DOCX worker paths with a substituted synthetic provider, JD Unicode evidence, deep immutability, failure recovery and shutdown. It requires the production build and compiled test fixtures, but no Ollama or PostgreSQL. No live extraction-quality claim follows from these deterministic checks.

## Task 03 / Checkpoint 4.5A: adversarial verification and live observations

No application contracts, prompts, context profile, validators or security boundaries change in this checkpoint. The coverage review found that worker security and admission/shutdown lifecycle were already well covered, while document-borne role spoofing through actual parsers, explicitly negated skills/priority cues, and real extraction-model evaluation were missing. New deterministic adversarial tests use real PDF/DOCX workers and actual AiService schema validation with synthetic provider responses. They prove command-like text remains data under the fixed prompt/schema construction, fabricated quotes reject the whole extraction, repeated quotes require unique longer passages, and UTF-16 offsets remain exact. Conflicting duplicate requirements reject despite individually valid grounding. Tests explicitly demonstrate that a negated skill, an instruction containing a skill name, or a negated priority cue can pass textual grounding while asserting the wrong meaning. No lexical heuristic is added to production to pretend to fix these semantic limitations.

Additional tests exercise the real OllamaProvider with mocked HTTP through ExtractionService for measured context overflow, final output-limit termination, invalid JSON and schema violations. They assert the precise one-measurement/two-generation-call counts, strict context flags, sanitized failures, absence of logs and no retry/repair/partial salvage. A shutdown test covers parser-close failure while inference remains active. Fixture-specific gold assessment is itself tested for valid, omitted and unsupported facts.

`test/manual/extraction.smoke.ts` creates a real Nest application context for ExtractionModule, with no provider or parser substitutions. In the original 4.5A run it pinned the existing local configuration, refused CI, executed each fixed case once and never printed model/source content. The current 4.5C schedule is described below. It reports SUCCESS/REJECTED, fixed code, latency, expectedFactsPresent and unsupportedFactsAppear. On rejection, the latter two are null; INVALID_EVIDENCE alone is not enough to claim hallucination because ambiguity and other grounding errors share that code. Infrastructure/profile unavailability stops remaining cases and the summary reports unrun cases. No automatic retry is performed. A nonzero exit signals any rejection or gold-quality issue, not necessarily an application security defect.

The synthetic evaluator is deliberately narrow: CV gold fields/skills/durations and JD title/requirement/priority pairs are specified independently of production prompts. JD requirement spans may contain their explicit cue and trailing period. Expected-fact presence and unsupported-fact checks are distinct. Passing these finite gold assertions is not proof of general semantic correctness or completeness. The result's completeness warning remains mandatory.

Live observation on 2026-10-25, after confirming the already-running Ollama 0.40.10 and exact pinned model digest, one attempt per case:

| Fixed case        | Pipeline outcome | Evaluation                          | Latency ms | Expected facts present | Unsupported facts appear |
| ----------------- | ---------------- | ----------------------------------- | ---------: | ---------------------- | ------------------------ |
| cv-simple-pdf     | SUCCESS          | INCOMPLETE_EXTRACTION               |       6398 | false                  | false                    |
| cv-negated-docx   | SUCCESS          | SEMANTICALLY_INCORRECT_BUT_GROUNDED |       3207 | true                   | true                     |
| jd-priority       | SUCCESS          | VALID_GROUNDED_EXTRACTION           |       4766 | true                   | false                    |
| cv-injection-docx | SUCCESS          | SEMANTICALLY_INCORRECT_BUT_GROUNDED |       3911 | true                   | true                     |
| jd-injection      | SUCCESS          | SEMANTICALLY_INCORRECT_BUT_GROUNDED |       4039 | true                   | true                     |

All five returned schema-valid, deterministically grounded envelopes; no live rejection or budget failure occurred. The evaluation exited 1 with four quality issues. No inference about rejected hallucinations is made from this run. Deterministic tests separately verify unsupported fabricated evidence rejection and budget failure handling. Model-derived facts can reflect negation or attack instructions despite the fixed prompts and exact-quote requirement. This is an observed semantic/prompt-injection susceptibility within the already-documented validation limitation; there was no tool execution, endpoint, cloud fallback or new persistence introduced. No workaround was implemented. These findings must accompany final Task 03 review; unconditional model-quality or prompt-injection-resistance sign-off is not supported by the evidence.

## Task 03 / Checkpoint 4.5C: minimal prompt refinement and regression results

One fixed-prompt revision adds explicit skill-list enumeration even without duration, null/empty evidence for unstated experience, prohibition on copying skill names into experience, contextual supporting clauses, and separation of supported assertions from mentions, uncertainty, negation and extractor-directed commands. A final CV checklist reinforces complete skill enumeration. No schema, evidence validator, context policy, parser, lifecycle, dependency or public contract changed. No semantic heuristics, retries or additional model calls were added to production. The revision was not tuned again after observing failures.

The manual evaluator retains the original gold expectations and adds an equivalent ordinary DOCX fixture. A fixed schedule runs each ordinary format three times, followed by four diagnostic cases. Every completed attempt is reported. Field diagnostics are fixture-specific test assertions, not production semantic validation: missing skills, experience assignment, copied skill names, unsupported positive skills, unsupported requirements/responsibilities, incorrect priorities and missing/unsupported scalar facts are distinguished. Rejections expose no rejected content and have unknown fact-presence booleans. A nonzero exit remains required for any quality issue or rejection.

Live observations on 2026-10-26 used the real ExtractionService, real PDF/DOCX workers, and the unchanged pinned local Ollama profile. No services were started or models downloaded. All ten predefined attempts ran; no outcomes were discarded:

| Fixed case        | Attempt | Pipeline outcome | Field-level result                                         | Latency ms |
| ----------------- | ------: | ---------------- | ---------------------------------------------------------- | ---------: |
| cv-simple-pdf     |       1 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       7233 |
| cv-simple-pdf     |       2 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       4061 |
| cv-simple-pdf     |       3 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       3872 |
| cv-simple-docx    |       1 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       3933 |
| cv-simple-docx    |       2 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       3839 |
| cv-simple-docx    |       3 | SUCCESS          | INCORRECT_EXPERIENCE_ASSIGNMENT: explicit duration omitted |       3835 |
| cv-negated-docx   |       1 | SUCCESS          | UNSUPPORTED_POSITIVE_SKILL: two; no copied-name experience |       4923 |
| jd-priority       |       1 | SUCCESS          | VALID_EXTRACTION: both explicit priorities correct         |       4707 |
| cv-injection-docx |       1 | SUCCESS          | UNSUPPORTED_POSITIVE_SKILL: one                            |       3948 |
| jd-injection      |       1 | REJECTED         | INVALID_EVIDENCE; rejected semantic content unknown        |       4325 |

Every ordinary run included both expected skills, retained null for the unstated duration and had no unsupported facts; all six omitted the stated duration. This follows from the combined field counts and unchanged gold checks (zero missing skills/scalars, one experience mismatch and no unsupported non-null value). Thus ordinary acceptance is false (0/6), while explicit JD priority acceptance is true. The script exited 1 with nine quality issues and zero unrun cases. No context/output-limit failure or infrastructure failure occurred.

Compared with the 4.5B baseline analysis, ordinary skill-list completeness improved but duration retention regressed; the goal was not achieved. The negated CV's earlier copied-name assignment disappeared, but two unsupported positive skills appeared instead. CV injection contamination remains. JD injection now fails closed; INVALID_EVIDENCE does not establish why the model failed or prove successful attack resistance. The historical baseline is a small prior observation, not a controlled statistical comparison. Exact quote matching still proves textual grounding, not entailment or completeness.

Recommendation: do not approve this prompt candidate as meeting 4.5C acceptance. Review the observed duration/skill tradeoff before authorizing further narrowly bounded prompt work, or explicitly revise MVP acceptance and document model-quality limitations. Do not weaken gold expectations or silently merge this as an improvement. Broader quality measurement and adversarial robustness remain Task 05 work; these observations do not demonstrate a parser, lifecycle or context-policy defect.

Verification for 4.5C: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (427 backend tests across 13 suites and 16 frontend tests across 2 files), `pnpm build`, `node scripts/check-pdf-parser.mjs`, `node scripts/check-extraction.mjs`, and `git diff --check` passed. The production Nest check substitutes a synthetic AI provider; only the manual ten-attempt run uses real Ollama. Eleven new evaluator tests cover the fixed schedule, PDF/DOCX equivalence, unchanged gold expectations, omitted duration, field assignment, unsupported facts, priorities and sanitized reports. No environment-related verification failures occurred. The live evaluation exit 1 is a quality failure and must not be conflated with the passing deterministic checks.

## Task 03 / Checkpoints 4.5D–4.5E: selected prompt and final verification

The bounded 4.5D comparison used three fixed candidates without application edits: the pre-4.5C prompt (A), the 4.5C prompt (B), and B plus one explicit positive duration-to-field instruction (C). Each candidate received three ordinary PDF and three equivalent DOCX attempts through the real pipeline with identical gold checks. A passed 3/6 ordinary attempts (DOCX only), B passed 0/6, and C passed 6/6. All three passed the explicit JD priority fixture. The schema field names were already correct; the identified instructional asymmetry was explicit handling of unstated experience without equally explicit mapping of stated duration. The results support the targeted correction, but do not establish the model's internal cause or general reliability.

Checkpoint 4.5E applies the exact Candidate C sentence recovered from the temporary 4.5D probe, immediately before the existing unstated-experience rule. The rest of the fixed prompt is unchanged. For each supported skill, a stated duration is copied verbatim into `skills[].experienceText.value` with evidence for that skill; unstated duration remains null with empty evidence. Skill enumeration, contextual quotes, document-as-untrusted-data instructions and the prohibition on inferred durations remain in place. Schemas, validators, context profile, provider settings, parsing, concurrency and cleanup are unchanged.

Final live verification on 2026-10-26 ran the existing manual extraction smoke script against the already-running pinned local Ollama service, using the compiled working-tree prompt without any in-memory override. No service was started or model downloaded. Every predefined attempt is retained below:

| Fixed case        | Attempt | Outcome  | Field-level result                                                     | Latency ms |
| ----------------- | ------: | -------- | ---------------------------------------------------------------------- | ---------: |
| cv-simple-pdf     |       1 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       6681 |
| cv-simple-pdf     |       2 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       4214 |
| cv-simple-pdf     |       3 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       4212 |
| cv-simple-docx    |       1 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       4251 |
| cv-simple-docx    |       2 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       4212 |
| cv-simple-docx    |       3 | SUCCESS  | VALID_EXTRACTION: both skills, stated duration, null unstated duration |       4145 |
| cv-negated-docx   |       1 | SUCCESS  | UNSUPPORTED_POSITIVE_SKILL: two; no incorrect experience assignment    |       4831 |
| jd-priority       |       1 | SUCCESS  | VALID_EXTRACTION: required/preferred priorities correct                |       4620 |
| cv-injection-docx |       1 | SUCCESS  | UNSUPPORTED_POSITIVE_SKILL: one                                        |       3902 |
| jd-injection      |       1 | REJECTED | REJECTED_EXTRACTION: INVALID_EVIDENCE; semantic content unknown        |       4258 |

Ordinary acceptance passed 6/6 and JD priority acceptance passed. No ordinary/JD-priority schema, evidence or context failure occurred. The additional adversarial JD retains the previously observed INVALID_EVIDENCE rejection; it is not a new regression. The complete smoke command exits 1 because it correctly counts two contaminated results and one rejection as three review issues. All ten attempts ran; no failures were hidden or retried. The negated and injection CVs remain semantically incorrect despite valid textual grounding. Rejection alone does not prove attack resistance. No general completeness or semantic-correctness claim follows from these finite fixture results. Task 05 will evaluate broader extraction quality, layout and language variation, duration attribution, negation and prompt-injection robustness.

Deterministic verification passed: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (427 backend tests in 13 suites; 16 frontend tests in 2 files), `pnpm build`, `node scripts/check-pdf-parser.mjs`, `node scripts/check-extraction.mjs`, and `git diff --check`. The production Nest check uses a mocked synthetic AI provider; the separate manual smoke uses real Ollama. No environment-related failures occurred.

The Task 03 review covered the full changed/untracked file inventory (44 files), tracked changes, extraction code and test/verification boundaries. No endpoint, frontend, database or infrastructure expansion, document persistence, sensitive-data artifact, generated build file or temporary probe artifact was found in the proposed changes. Synthetic fixture builders are source code, not personal documents. Direct dependency additions remain the previously approved exact pins: pdfjs-dist 6.4.299, yauzl 3.4.0, mammoth 1.13.0, @xmldom/xmldom 0.9.12 and development-only @types/yauzl 3.4.0. PDF.js optional native canvas packages remain documented transitive lockfile entries; worker native-addon loading remains disabled. No dependency changed in 4.5E. This scope/privacy review is not a substitute for a comprehensive security audit.

Task 03 is ready for final merge review within its internal MVP scope, with the documented model-quality limitations. The ordinary duration/completeness blocker is resolved on the predefined fixtures. Model-derived facts still require review; the pipeline is not a semantic truth or prompt-injection-resistance guarantee. No commit, push or PR was performed.

## Task 04 / Checkpoint 4.2: deterministic matching core

`src/matching/matching.ts` exports the synchronous pure `matchExtractions({ cv, jd })` function. It accepts existing version-1 extraction envelopes and returns matching contract version 1 with policy `matching-v1`. It has no Nest wiring, AI/provider calls, parser execution, network, database, clock, persistence or new dependencies. The matching boundary projects resolved evidence back to Task 03's quote-only validation shape, invokes the existing pure extraction validators, then compares the resolved data against the supplied data, including offsets. This preserves source bounds, unique quotes, UTF-16 boundaries, priority grounding and duplicate guarantees without changing extraction behavior. Envelope keys, warning shapes and the mandatory completeness warning are checked separately. All failures become `MatchingInputError` with code `INVALID_MATCHING_INPUT` and fixed message; no original cause or payload is retained. The existing schema utility uses the already-installed Ajv; no AI provider is instantiated.

The vocabulary is finite: TypeScript, JavaScript, Node.js, React, Java, PostgreSQL, Docker, Kubernetes, C, C++, C#, .NET; microservices and event-driven architecture; unit testing, code review and continuous integration; payments and healthcare. The sole spelling alias is NodeJS → Node.js. Comparison uses NFC, ASCII case folding and whitespace normalization, preserving technology punctuation. No stemming, fuzzy matches, translation, technology substitution or tool-to-practice inference is performed. Rules and aliases carry stable IDs. Future vocabulary/grammar changes require policy-version review.

Complete JD forms are a term, `Experience with <term>`, `Experience in <term>`, or an integer month/year duration followed by `of experience with <term>`. Minimum durations must be positive; `At least` and a numeric `+` lower-bound suffix are supported. A `Required:`/`Preferred:` prefix or `required`/`preferred` suffix and a terminal period are accepted syntactically, but priority always comes from the validated extraction field. Complex qualifiers, conjunctions, alternatives and versions abstain. Responsibilities are not promoted to requirements. Term/experience-presence requirements use the term's category; duration requirements belong only to Experience. Unsupported text is not classified by guessing keywords.

CV inspection is limited to skill name/experienceText facts and employment descriptionText facts. No titles, employers, dates, identity, education or unrelated source passages supply qualifications. Each attached reference must fit in one complete source line of at most 1,000 UTF-16 units, wholly within its segment. CR, LF and Unicode line/paragraph separators are recognized. Multiline evidence, unsupported surrounding wording and oversized context abstain without truncation. Context references preserve source offsets and are labeled separately. Complete CV forms are a term, a comma-separated `Skills:` list containing only recognized terms, `Experience with/in <term>`, an integer duration (optionally `+`) `of experience with <term>`, or exactly `No experience with <term>`, allowing defined whitespace and terminal-period variations. This is a small allowlist, not a natural-language, negation or injection parser.

Every reference of a participating fact must have usable context. Description values must themselves agree with the recognized assertion; skill names restrict context to that canonical skill, and experienceText must explicitly match the linked duration. A duration appearing only in a skill-name context does not fill a null experienceText. Invalid contextual assertions supply no credit, although an independent supported fact can still supply support. Conflicting accepted evidence prevents a determination. No global document scan recovers omitted facts. Exact quotes and these guards do not establish semantic truth or resistance to crafted content.

Required requirements have weight 2, preferred weight 1, and unknown priority weight 1 with an uncertainty flag. Identical parsed predicates, canonical terms and thresholds group once, retaining all JD indexes, texts and evidence. A required/preferred conflict uses required weight once and reports the conflict. Unsupported duplicates group only by normalized full text. Different duration thresholds remain separate with an overlap warning; there is no semantic subsumption. A context failure in a grouped JD declaration conservatively excludes that group. Evidence order and repetition never increase credit.

`MATCHED` earns 1. `PARTIAL` is restricted to an exact positive duration below a positive JD minimum and earns observed/required months. `MISSING_EVIDENCE` earns 0 for an evaluable requirement with absent, unknown, conflicting or unusable CV information. Unsupported/ambiguous JD predicates instead have null credit and remain visible outside the denominator. `NOT_MATCHED` earns 0 only for an accepted exact negative against experiencePresence/minimumDuration, or explicitly linked zero months/years against a positive minimum, with no conflicting accepted positive evidence. A bare skill requirement is never disproved by an experience-negative statement. Zero is not inferred from null or unparseable values. A sufficient CV lower bound can match; an insufficient lower bound remains unknown rather than partial. Durations are neither summed nor inferred from dates, and inconsistent exact durations or incompatible bounds abstain.

Category scores are `100 * sum(requirementWeight * credit) / sum(requirementWeight)` over evaluable JD predicates. Missing CV support remains in this denominator. Categories use fixed weights Technical skills 35, Experience 25, Architecture 20, Engineering practices 10 and Domain knowledge 10. Categories without evaluable requirements have null scores. Overall score renormalizes configured weights across active categories and is null if there are none; it uses unrounded category values, with returned percentage scores rounded to two decimals. Each non-null score includes the fixed scope explanation and coverage: input/canonical/evaluable/excluded/unclassified counts, evaluability ratio, active configured weight, category denominators and missing-evidence counts. A score of 100 with 35/100 active weight is full support only within the evaluated category, not full suitability. Scores across different evaluated scopes should not be used as suitability rankings.

Both envelopes' warnings are preserved with document attribution, without arbitrary numerical penalties. `SEMANTICS_NOT_VERIFIED` and `reviewRequired: true` are always returned. No confidence score, rejection threshold, hiring decision or automatic rejection is produced. Results contain document evidence and must not be logged. Stable requirement IDs use the earliest original JD index and are local to those envelopes; evidence/rule/uncertainty ordering is deterministic. Inputs are never mutated.

The deliberately narrow grammar creates false negatives for ordinary prose, lists containing unrecognized terms, wrapped PDF lines, ranges, approximate durations and complex requirements. Architecture, practices and domain comparisons establish only explicit textual support, not competence, scale, ownership or depth. Extraction omissions and the documented Task 03 semantic errors remain material limitations. High scores with low coverage must be presented with the scope explanation. Synthetic unit tests cover the approved examples, boundary validation, evidence order, immutability, Unicode, context limits, negative/zero/unknown distinctions, scoring and exclusions. No integration is added in this checkpoint.

## Task 04 / Checkpoint 4.3: internal Nest integration

`MatchingModule` provides and exports `MatchingService`; `AppModule` imports it alongside the existing modules. `MatchingService.match({ cv, jd }): MatchingResult` synchronously delegates to the pure `matchExtractions` function. It has no injected dependencies, asynchronous work, retries, logging, persistence or controller. Validation failures remain the fixed `MatchingInputError` from the core. Existing version-1 extraction envelopes and matching contracts are unchanged. The pure core remains usable independently of Nest.

The Nest tests resolve the service from its standalone module, compare service and pure results on frozen synthetic inputs, check sanitized synchronous failures, verify UTF-16 evidence and high-score/low-coverage explanations, and compile/initialize `AppModule` with an offline database module and extraction/provider replacements. Those replacements isolate existing infrastructure; the real MatchingModule and MatchingService remain in use. No AI or extraction invocation is required. This verifies application composition without claiming a live database boot test.

`node scripts/check-matching.mjs`, after the normal production build and API test compilation, creates a real Nest application context from the production-compiled MatchingModule. It checks synchronous result parity, repeat determinism, frozen inputs, duplicate weighting, unsupported-requirement visibility, coverage/explanation, exact evidence offsets and sanitized failures. Only synthetic fixture construction comes from test output. No HTTP listener, database, AI provider or extraction service is needed; the script prints a fixed pass/fail summary without document payloads. Compiled output remains ignored build artifacts rather than source changes.

The documented-support interpretation is unchanged: exact evidence does not establish semantic correctness; missing evidence does not establish missing ability; low evaluability can yield a high score; complex natural language remains unsupported. Scores must retain coverage and the scope explanation. Task 05 will evaluate broader quality and calibration. This checkpoint adds no suitability ranking, confidence score or rejection threshold.

## Task 05 / Checkpoint 5.2: offline evaluation

The evaluation-only implementation lives in `apps/api/test/evaluation`. There
are no production changes or new dependencies. TypeScript fixture modules under
`datasets/v1` keep annotations and contract-shaped observed fixtures type checked
without introducing a second JSON schema loader. Dataset, extraction contract,
matching policy and evaluation policy versions are reported separately. A
SHA-256 fingerprint covers authored source text/gold, observations and matching
inputs/expectations; inventory entries record generated artifact and expected
and actual parsed-text hashes. Changes require review and a dataset or policy
version change when semantics change. Hashes detect drift; they are not signed
approval records.

The ten source cases reuse all six Task 03 cases and the PDF/DOCX builders:
ordinary equivalent PDF/DOCX, negated/uncertain CV, explicit JD priorities,
CV/JD injection, a CV with skill-specific duration and negative experience,
sparse CV, mixed JD (unknown priority, duration and complex architecture), and
negated JD requirement. Source facts carry polarity, uncertainty or instruction
annotations. Extraction gold separately specifies field, subject, permitted
values, supporting anchor and importance. Forbidden positives are explicit
probes. Expected non-null facts form a closed world: any extra non-null claim is
incorrect; omitted optional scalars remain null and absent collections empty.
Gold is human-authored independently of observed outputs. Source and extraction
annotations may share anchors, but a negative source statement is not a positive
skill. The contract has no negative-skill field. Identity/history/education
breadth remains limited: this initial inventory covers synthetic identity but
not employment/education records, although the contract adapter includes them.

Twenty observations include ten correct baselines plus omitted skill, wrong
skill-duration relationship, missing evidence, invalid offsets, grounded
negated/uncertain positives, grounded injection contamination, wrong priority,
two rejections and one not-run case. Expected TP/FP/FN counts and failure-code
sets are authored literals. The harness checks these expectations rather than
requiring deliberately bad observations to achieve perfect quality. Additional
unit tests independently assert metric denominators and values. No model output
is used, and no model-quality claim follows from passing tests.

Twelve matching cases reuse Task 04 policy examples: alias/weighting, missing
versus explicit negative experience, partial duration, unknown duration, zero,
sufficient/insufficient lower bounds, conflicting evidence, duplicate priorities
and unsupported language, unknown priority, and all-unsupported requirements.
Fixed envelopes pass the existing validators. Expected statuses, decisions,
credits, priorities, uncertainty, category/overall scores and complete coverage
are authored independently of matcher output. Source observations and matching
inputs are intentionally separate: an extraction-correct ordinary sentence need
not belong to the narrow matching grammar. This checkpoint does not measure the
combined live pipeline.

Metric policy `evaluation-v1` uses exact field/subject/value alignment with
one-to-one consumption of gold facts; array order never supplies a relationship.
Skill name and skill duration are separate atoms. Wrong duration attribution is
FP plus FN. History subjects use employer/title/start date; education subjects
use institution/qualification/date. These composite keys are deliberately small
and do not resolve repeated identical records by source anchor yet. No fuzzy
matching, generated ground truth, semantic judge or automatic tuning is used.

| Metric                       | Numerator / denominator                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| Precision                    | Aligned emitted facts / all emitted non-null facts                                                       |
| Recall                       | Aligned facts / expected non-null facts                                                                  |
| Important completeness       | Aligned important facts / expected important facts                                                       |
| Complete important fixtures  | Returned observations with every important fact / returned observations with at least one important fact |
| Unsupported positive claims  | Unmatched emitted facts / emitted affirmative claims                                                     |
| Negation handling            | Negation probes with no forbidden positive / annotated negation probes                                   |
| Priority accuracy            | Recovered gold requirements with correct required/preferred/null priority / all gold requirements        |
| Matching status accuracy     | Correct aligned canonical statuses / all expected canonical groups                                       |
| Matching decision accuracy   | Correct status, evaluability and inclusion together / all expected canonical groups                      |
| Score availability           | Correct numeric/null state / overall plus five category slots                                            |
| Evidence structural validity | Structurally valid references / emitted references                                                       |
| Evidence support             | Correct emitted facts with supporting evidence / correct emitted facts                                   |
| Completion                   | Returned results / attempted observations                                                                |

All ratios include numerator, denominator and value; a zero denominator yields
null. Unmatched assertions are conservatively treated as affirmative because the
production contract has no polarity flag; exact gold negative facts are excluded
from the affirmative denominator. Forbidden-probe counts separately identify
negation, uncertainty and injection; a claim can trigger a probe without gaining
credit. Correct null priority requires a recovered requirement with no non-null
priority, so omission cannot pass as unknown.

Evidence validity checks segment existence/bounds, integer global UTF-16 offsets,
surrogate boundaries, exact source slice and unique occurrence within the
segment. Evidence support requires at least one reference and every reference
to enclose the authored supporting anchor. This deliberately conservative anchor
rule is a fixture-specific semantic check, not general entailment. Correct facts
without evidence fail support even though they emit zero references. Matching
links additionally require a resolvable fact path and either an original
reference or a containing single-line context reference; priority links must
point to priority fields. Evidence structure does not itself establish truth.

Matching requirements align by their complete original JD index groups, not
just output order. Missing groups lose accuracy; extras fail exact-case
acceptance. Unsupported requirements remain in status/decision denominators,
though production excludes them from numerical scoring. Overall and category
score deviation is absolute percentage-point error, with mean and maximum over
numeric pairs only. Numeric/null mismatch separately fails availability and is
never converted to zero. Empty numeric-pair sets produce null deviation. Exact
existing two-decimal scores are required; no tolerance hides regressions.

Rejected observations have null output-quality metrics and no inferred
hallucination count. Delivered recall/completeness and delivered negation
handling retain attempted rejection denominators with zero delivered facts/safe
outcomes. Not-run cases contribute no attempted denominator and remain visible
in counts. Aggregate ratios sum counts rather than averaging fixture ratios.
The synthetic not-run case is expected and can pass the harness assessment; an
unexpected parser/run failure produces a failed report and nonzero exit.

The CLI imports a network-denial preload before evaluation. It rejects fetch,
WebSocket, TCP connect, HTTP(S) requests, HTTP/2 connect, TLS connect, datagram
creation, common DNS lookups and listener creation. Node's permission mode
restricts writes, subprocesses and addons; worker access is needed for the
existing parser. Existing parser workers retain their production isolation.
Tests probe denied network entry points and run the entire CLI twice. These
controls establish the harness's offline behavior, not a general malicious-code
sandbox. No provider, Nest application, database, HTTP server or live runner is
instantiated. Report serialization sorts object keys and fixture IDs, and omits
clock/environment data. Latency/variance remain explicitly unavailable.

Run `pnpm --filter @ai-job-hunter/api eval:offline`; focused tests use
`pnpm --filter @ai-job-hunter/api test --testPathPatterns=offline-evaluation`.
Reports contain IDs, counts, hashes and sanitized codes, not source text or
quotes. The first dataset is English synthetic regression coverage, including
cases previously used for prompt work, not an independent generalization or
hiring-suitability benchmark. Local live evaluation remains Checkpoint 5.3.

## Task 05 / Checkpoint 5.3A: opt-in local evaluation runner

This checkpoint adds evaluation-only orchestration, without changing Task 03/04
production code or dependencies. The API `eval` script compiles the existing test
target and invokes `test/evaluation/live.ts`. Both parent and child require
`--allow-local-ollama`; any set `CI` variable (including empty or `false`) refuses
execution. No model or daemon is invoked by the deterministic tests. The offline
runner and its synthetic regression scores remain separate.

`live-plan.ts` fixes `live-schedule-v1` at 18 sequential extraction invocations:
ten synthetic-v1 documents once, two extra attempts each for `cv-simple-pdf` and
`cv-simple-docx`, then fresh extraction for two pairs. The pairs are
`cv-duration-docx`/`jd-mixed` and `cv-sparse-docx`/`jd-mixed`. Repeats are predefined
observations, never retries. A child-side 18-call ceiling provides a second guard.

The pair annotations are an evaluation-only addition versioned `live-pairs-v1`;
they do not change synthetic-v1 source facts or production policy. Their gold
envelopes and expected outcomes are human-authored. The duration CV's gold skill
name uses the unique duration clause as its reference; this is not a repair of
live output. The first mixed-JD skill requirement has ambiguous broad evidence
because its short phrase repeats. Both pairs retain that exclusion and the
complex unsupported requirement. The duration pair has a partial-duration
credit of 0.6, active category weight 60 and overall score 25; the sparse pair
has score 0 at the same scope. Five expected canonical requirements remain
visible in each case. The twelve approved offline matching cases plus these two
pair gold cases are reported in `fixedMatching`, distinctly labeled human gold.

For live matching, actual JD requirement indexes are aligned back to gold by
exact requirement text with one-to-one consumption. Unknown/extra indexes get
separate non-gold IDs; omitted requirements remain missing. Only evaluation IDs
are remapped; production results and evidence paths retain their live origins.
The expected five-group denominator is never reconstructed from model output.
Matching-input rejection leaves quality metrics unavailable but contributes zero
to delivered status/decision accuracy for an attempted pair. A wholly not-run
pair contributes no attempted denominator and remains explicit in counts.
Exact alignment can penalize semantically equivalent wording; no fuzzy semantic
judge or new production normalization was introduced.

The parent owns one forked child, started only after opt-in/CI checks. The child
creates `ExtractionModule` via `NestFactory.createApplicationContext`, with
logging disabled; it never boots AppModule, HTTP or a database. PDF, DOCX and JD
all use the existing `ExtractionService`. Provider, model, literal loopback URL
and 120000 ms request timeout are pinned in the child's environment. Inherited
Node preload options are removed. Existing Ollama digest/version/allocation
verification, temperature zero, no-thinking/no-truncation/no-shifting and token
budgets are unchanged. There is no cloud adapter, pull, daemon-start command or
configuration mutation.

A parent timer enforces 45 minutes; SIGINT/SIGTERM use the same interruption
path. At interruption, the active attempt is rejected with a sanitized code;
all scheduled unstarted attempts remain NOT_RUN, including unfinished pair work.
The supervisor kills its child immediately on deadline/interruption and waits
for exit. Graceful shutdown invokes Nest close; after five seconds without exit
it sends SIGKILL and reports cleanup failure. Failed-spawn error/close events are
handled even when no exit event occurs. Child disconnection from an unexpectedly
lost parent exits the child, removing its parser threads and client sockets.
This controls local evaluation resources, not the existing Ollama daemon: it does
not guarantee when daemon-side computation stops after client disconnection.

Connection, profile, request-timeout, unavailable-service and unexpected errors
stop the schedule. Isolated schema/evidence/JSON/output-budget and supported
content rejections continue to the next scheduled case without retry. A returned
but semantically incorrect extraction also continues. Output rejections expose
no inferred hallucination/precision values; delivered recall and completeness
include their attempted gold denominators. Cleanup errors remain distinct from
quality and infrastructure outcomes. Opt-in refusal emits a compact NOT_RUN
report before child creation.

The parent receives extraction envelopes over IPC only for evaluation in memory.
Child stdout/stderr are ignored to prevent accidental payload diagnostics. The
public report has mode `local-live` and separates actual local extraction/pair
measurements from `HUMAN_AUTHORED_GOLD` matching. Tests explicitly identify
`FAKE_BOUNDARY` provenance; they cannot claim verified live model identity.
Public fields contain only fixed IDs, aggregate metrics, sanitized allowlisted
codes, hashes, configuration and timings—never source text, fact values, model
responses or quotes. The CLI exits nonzero for incomplete execution, measured
quality failures, fixed-policy disagreement or cleanup failure.

Provenance includes source dataset-definition/artifact hashes, schedule and pair
policy versions, Git commit/dirty state (null if unavailable), Node/platform/CPU
architecture and compiled prompt/schema/provider module hashes. Its source-only
dataset-definition fingerprint is deliberately distinct from the offline hash
that also includes intentionally incorrect observations. Expected model identity
is always recorded; verified identity is populated only after a successful real
extraction, relying on the production provider's per-request digest/version
checks, not an additional metadata request. A rejection can therefore leave
verified identity conservatively unavailable even if some provider checks ran.

Extraction latency measures boundary invocation through completion/rejection,
including production parsing and the provider's measurement/generation calls.
The first attempt also includes child initialization; no warm-up is hidden.
Pair latency covers fresh CV extraction, fresh JD extraction and matching, and
excludes later cleanup. Successful and failed latencies are separate. Statistics
include n, mean, median, nearest-rank p95, min/max and sample variance/stddev.
Cleanup and total elapsed time are separate. Ordinary PDF/DOCX repeat groups
report attempted/rejected counts, quality/latency variation and semantic fact-set
disagreement over successful run pairs. Fact signatures remain internal; only
counts/rates are public. Zero observations yield null statistics; fewer than two
yield null sample variance. Three repeats provide descriptive evidence only, and
the first attempt is not labeled a cold start without proof.

Deterministic tests cover refusal, local-only settings, schedule/budget,
serialization, quality versus infrastructure rejection, cancellation, cleanup,
gold pair correctness, missing/reordered JD alignment, report sanitization and
statistical arithmetic. A network-denied inert subprocess tests forced cleanup;
refusal-only CLI subprocess tests cannot reach inference. No live evaluation was
run in this checkpoint. The proposed first live command is
`pnpm --filter @ai-job-hunter/api eval -- --allow-local-ollama`, pending review.

## Task 05 / Checkpoints 5.3B–5.4: reviewed live baseline and follow-up

Task 05 is accepted as an evaluation and measurement deliverable, not proof of
production-ready AI quality. Checkpoint 5.3B ran exactly one authorized local
benchmark after read-only preflight; Checkpoint 5.4 analyzed its saved artifacts
without inference or changes to prompts, validators, matching rules, ground truth
or evaluation policy. The historical checkpoint sections above describe what was
implemented and verified at those times; the reviewed baseline is recorded here.

The command was `pnpm --filter @ai-job-hunter/api eval -- --allow-local-ollama`.
The run started 2026-10-26 at 15:32:41 UTC and finished at 15:34:08 UTC, with
85.30 seconds measured inside the runner. It used ten `synthetic-v1` source cases,
`evaluation-v1`, `live-schedule-v1`, `live-pairs-v1`, extraction schema 1 and
`matching-v1`. The provider was local Ollama 0.40.10 at
`http://127.0.0.1:11434`, model `qwen3:4b`, pinned digest
`359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7`.
Temperature was zero, context/output limits were 8192/2048 tokens, and the
existing production profile checks succeeded. No retry or second run occurred.

| Measure                                               | Reviewed result |
| ----------------------------------------------------- | --------------- |
| Planned / attempted                                   | 18 / 18         |
| Returned / rejected / not run                         | 11 / 7 / 0      |
| Passed every quality check                            | 6/18            |
| Returned but failed quality checks                    | 5               |
| Returned-output TP / FP / FN                          | 35 / 5 / 0      |
| Returned precision                                    | 35/40 = 87.50%  |
| Returned recall, conditional on successful extraction | 35/35 = 100%    |
| Returned important completeness                       | 24/24 = 100%    |
| Unsupported-positive rate on returned outputs         | 5/40 = 12.50%   |
| Delivered recall                                      | 35/70 = 50.00%  |
| Delivered important completeness                      | 24/56 = 42.86%  |
| Extraction completion                                 | 11/18 = 61.11%  |
| Fixed gold matching scenarios                         | 14 passed       |
| Fixed status / decision accuracy                      | 30/30 for each  |
| Fixed score availability / maximum score deviation    | 84/84 / 0       |
| Live end-to-end pairs completed                       | 0/2             |
| Delivered matching status / decision accuracy         | 0/10 for each   |

The seven rejected attempts account for 35 expected facts not delivered. Their
output-quality metrics are null: these are not 35 observed model false negatives.
The live returned-output FN count is zero. The earlier offline synthetic report
had 56 TP, 5 FP and 3 FN; its intentionally incorrect observations must not be
mixed into live counts. Category counts overlap and must not be added as if they
were disjoint attempts. Six ordinary PDF/DOCX attempts passed all checks; five
returned results failed quality checks; seven attempts rejected. Exit 1 reflects
quality failure, with no infrastructure, timeout or cleanup failure.

| Failure category              | Confirmed observations and limits                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INVALID_EVIDENCE              | Six attempts: jd-injection, cv-duration-docx standalone and paired, and jd-mixed standalone and in both pairs. The code does not identify whether the cause was missing/ambiguous quotes, segment references, value support, null/evidence inconsistency or priority linkage. Repeated TypeScript/required passages make short-quote ambiguity plausible, not proven. |
| INVALID_OUTPUT                | jd-negation rejected. Nullable collection entries are one plausible cause because schema-nullable fields have stricter post-validation collection rules; the rejected structure is unavailable. Do not label this confirmed malformed JSON or confirmed negation handling.                                                                                            |
| Negation and uncertainty      | cv-negated-docx returned one forbidden negated-skill claim and one uncertain-skill claim. Negation handling was 0/1 among returned probes and delivered handling 0/4 including rejected probes.                                                                                                                                                                       |
| Injection contamination       | cv-injection-docx returned one injection-derived positive claim; jd-injection rejected. Rejection does not demonstrate attack resistance.                                                                                                                                                                                                                             |
| Sparse-document contamination | cv-sparse-docx standalone and paired each returned one extra fact. The sanitized report does not identify its field/value.                                                                                                                                                                                                                                            |
| Evidence-support anchors      | jd-priority recovered all five facts and both priorities (2/2), but only 3/5 facts passed anchor support. Overall structural evidence validity was 40/40 and anchor support 33/35. Exact anchors may reject adequate shorter quotes, including quotes without terminal punctuation; this is a code-level possibility, not a reconstruction of the saved response.     |
| End-to-end failure            | pair-duration-mixed and pair-sparse-mixed both reported EXTRACTION_INCOMPLETE. Matching metrics were null, with original five-requirement denominators retained per pair. No individual live JD omission or incorrect matcher decision can be established from these rejected pairs.                                                                                  |

The prompt already prohibits negated/uncertain qualifications and document
instructions becoming facts. Lexical evidence validation establishes occurrence,
not affirmative meaning. Structural evidence validity therefore does not
establish semantic correctness. The evaluator's unsupported-positive rate counts
unmatched affirmative facts under exact authored field/subject/value alignment;
it is not independent hallucination verification. Evidence-support evaluation
requires every quote to enclose the full authored anchor and uses its first
source occurrence. Punctuation, repeated passages and alternative valid spans
can make that check annotation-sensitive. Neither observation justifies weakening
production evidence validation or retrospectively changing baseline results.

| Latency group (seconds)                          | n   | Mean  | Median | p95    | Sample SD |
| ------------------------------------------------ | --- | ----- | ------ | ------ | --------- |
| Returned extractions, including quality failures | 11  | 4.485 | 4.295  | 7.955  | 1.305     |
| Rejected extractions                             | 7   | 5.135 | 4.305  | 6.441  | 1.227     |
| Failed end-to-end pairs                          | 2   | 9.992 | 9.992  | 10.394 | 0.569     |

Each ordinary PDF/DOCX fixture returned identical fact sets across three attempts:
zero observed disagreement and zero precision/recall variance. Latency sample SD
was 2.077 seconds for PDF and 0.0265 seconds for DOCX. First-attempt initialization
is included. Three repeats and a small English synthetic dataset provide limited
coverage, not generalization, hiring-suitability or production-readiness evidence.
Offline synthetic tests establish evaluator regression behavior, not live model
accuracy; fixed matching correctness and live end-to-end quality remain separate.

The original sanitized JSON remains at the run-local path
`/tmp/ai-job-hunter-53b.bgLvHl/report.json`; summary and preflight artifacts are in
the same directory. These temporary files are not repository assets and may not
persist across environments. Report SHA-256:
`4ef9b5bbf10baea3f1acfeac2270c7a80257a3f505091478f3858925a58a4e06`.
Source dataset-definition SHA-256:
`45a2d84f1cdcb72d950f10ba6492753cf254ca7dd607178ff662ca7de8c4d383`.
The run recorded base commit `29062072f8616e9d87d8bb7c259f7d1fa074bb66` with the
approved uncommitted Task 05 implementation; 89 source-file fingerprints remained
unchanged through execution and analysis. Only sanitized findings are committed,
not real personal documents, raw model responses or captured evidence quotes.

| Priority / timing                                                      | Follow-up and acceptance evidence                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 — before a working model-backed Task 06 flow                        | Add sanitized rejection-stage/rule/field diagnostics without payload logging or changed rejection behavior. Investigate INVALID_EVIDENCE and restore both predefined pairs with complete validated inputs and reviewed matching outcomes, retaining five expected requirements per pair and strict evidence validation. Any later live verification needs separate authorization. |
| P1 — semantic correctness before presenting qualifications as reliable | Address negation, uncertainty, injection and sparse-document contamination. Retain positive controls and verify that improvement does not merely replace contamination with indiscriminate rejection or lost facts.                                                                                                                                                               |
| P1 — before using evidence-support metrics as release gates            | Audit punctuation, repeated anchors and alternative supporting references. Any approved annotation/evaluation change receives separate review and versioning; preserve the original baseline.                                                                                                                                                                                     |
| P1 — during Task 06 UI integration                                     | Show incomplete, unknown and unsupported states explicitly. Failed extraction must not become a zero-suitability score; preserve null versus zero, requirement coverage and visible exclusions.                                                                                                                                                                                   |
| P2 — after MVP                                                         | Add broader independent fixtures for employment/education, repeated entities, layouts and alternate valid wording, with larger repeat samples and reviewed holdouts separate from prompt-development cases.                                                                                                                                                                       |

No Task 06 implementation is included. The evaluation deliverable is accepted
with this backlog; neither rejected extraction nor unavailable matching is a
successful AI evaluation.

## Task 06 / Checkpoint 6.2A: sanitized rejection diagnostics

Diagnostics add metadata to errors only; extraction envelopes, schemas, prompts,
matching policy, validation order and outer rejection codes remain unchanged.
The closed diagnostic contract has `stage`, `rule` and `field`. AI owns its
`AI_DECODE`/`JSON_INVALID` and `AI_SCHEMA`/`SCHEMA_MISMATCH` diagnostics, derived
solely from existing error codes with the fixed `output` root field. Extraction
owns `OUTPUT` and `EVIDENCE` diagnostics and fixed CV/JD field templates such as
`cv.skills[].name`. This keeps AI independent of extraction-specific schemas.

Validation reports the first failure in existing traversal order. Rules distinguish
serialization/schema failures, null required collection values, empty history
records, unknown segments, empty/oversized/absent/ambiguous quotes, UTF-16 boundary
splits, null/evidence inconsistency, empty/oversized values, missing/duplicate
evidence, unsupported values, and JD priority cue/linkage failures. Existing
output-size and duplicate-fact codes remain unchanged without new diagnostics.

Error reconstruction copies only allowlisted stage/rule/field tokens, validates
the stage against the rule and outer error code, freezes the resulting diagnostic,
and drops extra properties. No document values, quotes, filenames, arbitrary keys,
array indexes, AJV details, prompts or exception messages enter diagnostics. AI
errors are reconstructed from their code, so incoming diagnostic properties are
never propagated. Nothing is logged or persisted by this addition.

Schema failures deliberately identify the output root rather than interpreting
AJV paths or revalidating model content. Schema checks still precede semantic
checks: an ASCII quote over the schema limit reports schema mismatch, whereas a
supplementary-Unicode quote can pass the schema's code-point limit and fail the
existing UTF-16 quote limit. The latter reports `QUOTE_TOO_LONG`. No earlier
rejection is bypassed to obtain a more specific diagnostic. An empty string quote
is likewise rejected by schema; whitespace-only quotes reach `QUOTE_EMPTY`.

These diagnostics cannot retrospectively determine the exact causes of the Task
05 baseline rejections. Evaluator anchor sensitivity remains distinct from
production validation and is unchanged. Checkpoint 6.2B needs separate approval
for live Ollama investigation, followed by an evidence-led remediation proposal;
this checkpoint includes no inference, repair, retry or reliability claim.

## Task 06 / Checkpoint 6.2B.1: fixed four-case investigation harness

The test-only `investigate` command is separate from `eval`. It requires exactly
`--allow-local-investigation`, refuses CI, and accepts no fixture selectors.
The fixed order is `cv-duration-docx`, `jd-mixed`, `jd-injection`, `jd-negation`.
Independent parent and child admission instances enforce order, one invocation
per fixture and a maximum of four. Admission is consumed before work and never
rolled back. Both reject overlapping calls; infrastructure failure stops further
extraction. Content rejection advances once to the next case without retry.

The new child uses the existing pinned loopback environment. Before constructing
the extraction context, a five-second, response-size-bounded metadata preflight
calls only `/api/version` and `/api/tags`, with redirects prohibited, and uses the
production `verifyProfile` function. It does not generate, pull or start a daemon.
The production provider still performs its own per-extraction profile/allocation
checks and existing measurement/generation passes within its 120-second deadline.
Four extraction invocations therefore do not mean four provider HTTP requests.

The existing supervisor is reused through optional typed result/error decoders;
its default evaluation behavior is unchanged. Investigation adds a preparation
step so startup/preflight failure leaves every fixture NOT_RUN. Existing
10-second child startup, 45-minute overall, parser/request deadlines, five-second
cleanup grace, forced child termination, signal handling and parent-disconnect
exit are retained. These bound local child ownership, not daemon-side computation.
The existing 18-attempt CLI, schedule and report shape remain unchanged.

Successful extraction content is discarded in the child worker; only a fixed
RETURNED token crosses IPC. Rejections carry only existing allowlisted outer
codes and sanitized stage/rule/field metadata. Both worker and parent reconstruct
metadata through explicit allowlists, including fixed AI diagnostic triples.
The parent rejects a successful payload object instead of forwarding it. Child
stdout/stderr are ignored and Nest logging is disabled. No source/model content
is printed or persisted, and historical baseline artifacts are not touched.

JSON output contains `cases` (four rows) and an existing outer `code` for lifecycle
failure, or null. Each row contains only fixed fixture `id`, RETURNED/REJECTED/
NOT_RUN `status`, nullable outer `code`, nullable diagnostic and nullable integer
`elapsedMs`, clamped to the overall deadline. NOT_RUN rows retain null timing.
Cleanup failure is reported at the top level without overwriting case outcomes.
Any rejection, unrun case or lifecycle error exits nonzero; RETURNED denotes
validation acceptance only, not semantic quality. Identity is checked internally;
raw metadata and model listings are not included in this minimal report.

Tests use fake extraction/transport and simulated child IPC to verify admission,
preflight, sanitization, bounded timings, cancellation and cleanup. No live
investigation is authorized by implementing or testing this harness. The first
live invocation remains pending review.

## Task 06 / Checkpoint 6.2F: required collection schema values

Only three generated-output schema types change from nullable string to string:
`cv.skills[].name.value`, `jd.requirements[].text.value`, and
`jd.responsibilities[].value`. Their existing length limits, object/evidence
structure and list limits remain identical. Optional fields, including unstated
skill experience and JD priority, retain null; empty collections remain valid.
The source schema, segmentation, prompts, validators, provider settings, matching
policy and evaluation gold are unchanged by this checkpoint.

This moves an existing final-acceptance restriction to the schema boundary.
For fixed payloads, previously accepted results remain accepted and null required
collection values remain rejected. Through AiService/ExtractionService these
payloads now fail with `SCHEMA_VALIDATION_FAILURE` and the fixed diagnostic
`AI_SCHEMA / SCHEMA_MISMATCH / output`, rather than reaching post-validation
`INVALID_OUTPUT / OUTPUT / REQUIRED_COLLECTION_VALUE_NULL`. Direct output
validator calls still use `INVALID_OUTPUT`, but report `OUTPUT / SCHEMA_MISMATCH`
at the CV/JD root. Multiply invalid payloads can report a different first failure
because schema validation precedes evidence resolution. Existing defensive
collection checks and their diagnostic allowlist remain intact.

Tests pin the complete prior schema fingerprints and verify that restoring only
the three nullable types recovers them. The 6.2E test-only comparison now explicitly
projects those legacy types; its line-segmentation experiment remains test-only.
All ten authored dataset outputs retain schema and production validation
acceptance. Fake-provider tests verify sanitized service error propagation, no
retries and continued rejection of missing, ambiguous and unsupported evidence.
No output is repaired, populated or silently dropped.

Line segmentation is deferred: the 6.2E experiment changed matching evaluability,
exclusions and scores, and exposed cross-line semantic-context risks. Narrower
segments must not be adopted merely to make quotes unique. The schema change does
not address persistent quote ambiguity. Live generation behavior, completeness,
semantic quality and any improvement to the null-responsibility failure remain
unverified; later live verification requires separate authorization. Historical
baseline reports and evaluation expectations remain unchanged.

## Task 06.3B: bounded analysis HTTP transport

`POST /api/v1/analyses` now accepts exactly one `cv` file and one `jdText`
field, in either order. This checkpoint stops at transport: a valid upload
returns HTTP 503 `ANALYSIS_UNAVAILABLE`, with upload `SUCCEEDED` and extraction
and matching `NOT_RUN`. It does not call extraction, parsing or matching and
does not fabricate results. File metadata uses the existing document validator;
actual PDF/DOCX content validation remains the parser's responsibility in 6.3C.

Busboy 1.6.0 is a direct dependency, with development-only TypeScript types.
The adapter uses memory only and enforces 5,242,880 file bytes, 49,152 field
bytes, 12,000 JD UTF-16 units, and 5,357,568 total multipart bytes, including
preamble/epilogue. JD text must be nonblank and is not trimmed or normalized.
The UTF-16 ceiling makes the UTF-8 byte ceiling redundant for valid UTF-8 text,
but both limits remain enforced. A bounded wire audit rejects invalid UTF-8
and alternate text charsets because Busboy otherwise decodes them permissively.
It retains only header/delimiter lookahead, never a second complete file.
HTTP and part headers are bounded to 16 KiB and boundaries to 70 ASCII units.
Busboy's inclusive limit notifications require maximum-plus-one byte thresholds;
the adapter independently checks actual lengths. Duplicate, missing, unexpected,
nested and wrongly typed parts reject. All Content-Encoding values reject.

Early middleware precedes Nest body parsers. It validates exact Host and Origin
allowlists and Content-Length before reading the body. API access remains bound
to 127.0.0.1; allowed authorities are 127.0.0.1 at the configured API port and
Vite port 5173, and origins are their exact HTTP origins. Missing/null/foreign
origins reject, forwarded headers are ignored, and no CORS policy is enabled.
Requests receive independent server UUIDs. Logs and error responses contain no
upload names, payloads, quotes, prompts or exception messages.

Every application-generated analysis response uses `Cache-Control: no-store`.
The version-1 discriminated response distinguishes COMPLETED (existing
MatchingResult contract, null error) from INCOMPLETE (null result, closed error).
No score conversion is introduced. The fixed HTTP mapping lives in
`analysis.errors.ts`: malformed requests 400, local-boundary denial 403, upload
timeout 408, size limits 413, unsupported media 415, rejected extraction/content
422, busy 429, unavailable/provider failures 503, execution timeout 504, and
internal failures 500. In particular SCHEMA_VALIDATION_FAILURE, INVALID_OUTPUT
and INVALID_EVIDENCE retain their codes at 422. Diagnostics are reconstructed or
explicitly allowlisted; arbitrary exception properties and AJV paths are omitted.

A 30-second upload watchdog bounds stalled multipart resources; this is not an
analysis/provider deadline. Rejection pauses input, destroys multipart resources,
and closes the connection with a 250-ms forced-close fallback rather than draining
an unbounded body. Parser-level HTTP failures can be rejected directly by Node
without the application JSON envelope. Client disconnect releases transport
buffers/listeners/timers. No extraction cancellation or shutdown coordination is
implemented here. Global admission before buffering, overall analysis deadlines,
sequential extraction and exactly-once admission release await 6.3C; per-request
limits alone do not bound aggregate memory under concurrent local requests.

Deterministic tests use a minimal Nest application, Supertest, controlled loopback
sockets and synthetic bytes without AppModule, database or Ollama. They cover
inclusive limits, chunking/framing, strict UTF-8, part order, security, sanitized
errors and resource cleanup. Metadata acceptance is not a claim that file contents
are valid, nor does this transport checkpoint establish extraction quality.

## Task 06.3C: synchronous analysis ownership and lifecycle

This supersedes the temporary 6.3B `ANALYSIS_UNAVAILABLE` success path. The
security middleware synchronously acquires the singleton AnalysisService slot
before multipart consumption. Security/header validation still occurs first.
There is no queue: a concurrent request receives 429 `ANALYSIS_BUSY` before body
buffering. The same owner spans upload, CV extraction, JD extraction, synchronous
matching and extraction cleanup. ExtractionService's own admission remains intact.
The transport controller delegates to AnalysisService; production imports the
existing extraction, AI configuration and matching modules. Test applications
provide fake extraction and real matching without importing production modules.

Only successful, still-active stages can start their successor. Matching receives
both complete extraction results and its existing public result is returned
without changing scores (including null versus zero), denominators, evidence,
coverage, exclusions, statuses or warnings. Extraction envelopes, full source
strings and model output are never response fields. Exceptions are mapped through
the existing closed allowlist with the current REQUEST/CV/JD/MATCHING stage.
No partial score or fabricated missing-skill judgment is produced.

Two deadlines start at admission using a monotonic clock. Upload is limited to
30,000 ms. The overall budget is twice the validated AI_REQUEST_TIMEOUT_MS plus
30,000 ms upload, 10,000 ms parser work, 1,000 ms parser termination and 5,000 ms
bounded processing overhead: 286,000 ms with the default provider configuration.
AnalysisModule consumes the same validated AI_CONFIG instance as the provider;
it does not independently read environment settings. Stage boundaries also check
elapsed time so delayed timer callbacks cannot allow late results. Synchronous
matching cannot be preempted; a deadline crossed during it suppresses the result.
These are request/result deadlines, not a guarantee that remote Ollama execution
or pathological cleanup has stopped at that instant.

Disconnect, timeout and shutdown mark ownership terminal exactly once. Upload
cancellation aborts only the bounded multipart adapter, clearing its listeners,
timer and buffers. Active extraction is deliberately not force-cancelled: its
promise includes parser cleanup, and it has no per-request abort API. A terminal
request retains admission while that promise settles, discards late results and
starts no later stage. Timeouts may send a sanitized response before that cleanup
finishes; abandoned clients receive no later response. No per-request action
closes the shared parser. The run's finally block is the sole release path after
work starts; an owner cancelled before controller execution can release directly.
Release is guarded and clears ownership timers and disconnect listeners.

Shutdown is explicit and idempotent: close admission, terminate active ownership,
stop upload, then await its completion. AnalysisService invokes this path from
its Nest destruction hook. More importantly, it registers the same shutdown
barrier with ExtractionService: extraction's destruction hook awaits it before
closing its parser/owner. Thus either hook can run first without relying on Nest
module ordering or allowing a JD stage to race parser shutdown. Existing
ExtractionService shutdown behavior is retained when no analysis coordinator is
registered. A nonsettling provider/extraction promise keeps analysis admission
and shutdown blocked; there is intentionally no unsafe forced slot release.
Parser watchdog failure is different: after an unconfirmed termination, the
parser latches unavailable and its promise can settle with failure. Analysis
ownership can then release while extraction remains unavailable. This is not
confirmation of worker exit or successful cleanup, and shutdown can report
extraction unavailability. Neither path guarantees remote inference termination.

Deterministic HTTP tests use controlled promises for in-flight extraction and
cleanup, real Nest/controller/multipart handling, and real MatchingService.
They exercise success, null/zero, failures, busy admission before body arrival,
disconnect, deadlines, shutdown, late-result suppression and resource release.
A separate real ExtractionService test pins the explicit shutdown-barrier order.
No live model verification is performed. The historical Task 05 baseline remains
0/2 completed predefined live pairs; unresolved quote ambiguity, uncertainty,
negation, injection contamination and evidence annotation sensitivity are not
fixed by HTTP integration. Successful extraction or HTTP 200 still does not prove
semantic correctness. Returned matching warnings/review requirements remain intact.

## Task 06.3E: multipart integrity and destruction races

The wire audit previously searched for an opening delimiter anywhere in preamble
bytes and classified parts by a regex over Content-Disposition. A boundary-like
preamble could stop auditing early, and parameter-looking text inside a quoted
extension could misclassify JD text as a file. Busboy would still decode that
field permissively, replacing invalid UTF-8. The audit now accepts an explicit
MIME subset: the opening delimiter must start at byte zero; headers cannot be
duplicated or folded; disposition parameters are parsed as tokens/quoted values,
with only `name` and `filename` supported. Extended/escaped parameters, unknown
headers/parameters and preambles reject rather than being interpreted differently
from Busboy. Ordinary quoted browser fields and filenames remain supported.
The part name and filename presence must agree with the endpoint's fixed CV/JD
roles. JD media type is text/plain, optionally with UTF-8 charset; its bytes use a
fatal streaming decoder. Literal valid U+FFFD remains valid input. Delimiter
suffixes are compared without ASCII high-bit masking. Existing byte limits,
epilogue counting and rejection teardown are unchanged.

Analysis stage guards now observe request abortion, incomplete request
destruction, response destruction and socket destruction directly. A fully
consumed IncomingMessage can normally be destroyed, so that flag alone must not
abandon a healthy completed upload. This closes the microtask window between
response destruction and delivery of its close event. Detection marks ownership
terminal without sending a late response; existing finally-based release still
waits for active extraction and cleanup. Real Node HTTP race tests destroy the
response during CV/JD completion before close-event delivery, and separately
verify retained admission through delayed cleanup. No inference cancellation,
extraction semantics or matching policy changes are introduced.

## Task 06.4B: in-memory analysis dashboard

The existing `/dashboard` route now uses the current React/Vite/MUI stack for
one CV/JD analysis. A native file picker validates count, nonempty size, filename,
extension and MIME agreement. JD validation checks nonblank text, UTF-16 and
UTF-8 ceilings and rejects unpaired surrogates. The application does not trim,
normalize or parse documents. The native textarea exposes its standard LF line
endings; the API helper preserves exactly the string supplied to it, including
CRLF if supplied programmatically. Client checks supplement authoritative backend
validation, including its strict multipart subset and document parser checks.

`useAnalysis` owns the request state and synchronous admission ref. Each request
has an AbortController and monotonically increasing generation. Cancellation,
Clear, edits and unmount invalidate the generation before abort; stale success,
failure and finally paths cannot replace state or unlock a newer request. Form
inputs are disabled during processing, while Cancel remains available. Cancel
retains form inputs and explains that local work may continue. Clear discards
form values, file selection, results and errors. Values remain in component memory
only; no local/session storage, history, analytics or telemetry is introduced.
Aborting is not a guarantee of immediate memory erasure inside browser networking
or termination of backend/Ollama work.

The API helper submits exactly `cv` and `jdText` as FormData, lets the browser set
the boundary, and uses the relative `/api/v1/analyses` endpoint with no-store and
no retries. Browser-owned wire types avoid backend runtime imports. The runtime
decoder checks version/discriminants, consumed nested fields, fixed statuses,
error codes and diagnostics. Valid non-2xx INCOMPLETE envelopes are shown without
scores; malformed/network failures use fixed client messages. A test-only type
comparison checks compatibility with the backend MatchingResult. No scoring,
predicate, eligibility or weighting logic is duplicated in the browser.

Results are labelled Documented requirement support. Null is Not calculable and
numeric zero is 0%. Coverage, exclusions, category values, warning codes and review
requirements remain visible. Requirement cards separately show status and
evaluability, with evidence/details collapsed by default. Quotes, explanations
and all other strings render as ordinary escaped React text with whitespace and
wrapping; no HTML/Markdown renderer, automatic links or invented page navigation
is used. Missing evidence is explicitly not proof of a missing skill. Live AI
quality and semantic correctness remain unverified.

Local integration requires `http://127.0.0.1:5173`; localhost and Vite preview
(port 4173, no API proxy) are not supported analysis entry points. API readiness
is informational and does not guarantee Ollama availability or extraction quality.
The readiness component retains its existing polling, but analysis itself never
polls. There is no short browser analysis timeout: processing is indeterminate,
the backend owns its deadlines, and the user can cancel waiting. A subsequent
request can receive ANALYSIS_BUSY while cancelled work settles.

## Task 06.5: ephemeral requirement feedback

Each requirement in a completed analysis has one optional local assessment:
Correct, Incorrect or Unsure. Selecting the active option again clears it. The
control is a labelled exclusive toggle group and has no free-text input. A visible
notice states that feedback is local, is not submitted or saved, and does not
automatically improve the model.

Feedback lives only in the mounted completed-result component. A new request,
input edit, Clear, cancellation, incomplete/client-error response or unmount
removes that component and its feedback state. Feedback does not enter FormData,
API requests, browser storage, analytics or logs. It is not projected into the
matching result, so supplied scores, statuses, evidence, exclusions and
explanations remain unchanged.

A unique nonempty matching requirement ID is the UI state key. Missing, empty or
duplicated IDs receive an index-based key within that immutable completed-result
snapshot. The fallback is deterministic and UI-local; it neither repairs nor
mutates backend data. It provides stable independent controls for the displayed
snapshot, but does not create an identity that can be carried across analyses.

## Task 06.6: local end-to-end verification

The authorized verification submitted three synthetic analysis requests
sequentially through the local dashboard/API integration and pinned local Ollama,
with no retries. One request completed: `cv-simple-pdf + jd-priority`. Matching
ran only for this completed request and returned two requirements with
`overallScore: null`. Null remains an explicit not-calculable result under the
existing matching contract and was not converted to zero.

The two predefined pairs did not complete. `cv-duration-docx + jd-mixed` returned
INCOMPLETE at the CV stage with the sanitized `QUOTE_AMBIGUOUS` diagnostic.
`cv-sparse-docx + jd-mixed` returned INCOMPLETE at the JD stage with the same
diagnostic. Matching did not run for either rejected request, so no partial or
fabricated score was produced. The predefined mixed-JD result remains 0/2
completed, separately from the preserved historical Task 05 18-attempt baseline.

The run exercised the local request path, extraction orchestration, matching gate,
versioned responses and incomplete-result handling. The browser DOM was not
visually verified. A completed response does not establish extraction completeness
or semantic correctness, and the two quote-ambiguity failures remain unresolved.
This verification supports MVP integration and honest failure handling only; it is
not evidence of model quality, reliability or candidate suitability.
