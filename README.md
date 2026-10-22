# ai-job-hunter

AI-powered job matching platform that analyzes resumes and job descriptions using LLMs, with explainable scoring and local/cloud AI support.

That description is the product direction. Checkpoints 1–4 provide the workspace, PostgreSQL migrations, API health endpoints, a responsive dashboard shell, automated tests, and Ubuntu CI configuration. Candidate/job management and AI functionality are not implemented.

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
