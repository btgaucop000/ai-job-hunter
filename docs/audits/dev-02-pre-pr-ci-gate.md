# DEV-02 — Reliable Pre-PR CI Gate

Audited 2026-11-05 from clean, fetched `main` at
`9b7742e7a1eab315cb7b231b08f54385158775a3`; working branch:
`chore/dev-02-pre-pr-ci-gate`. This checkpoint changes documentation only.
No commit, push, PR, application tests, database writes, private CV access or
Ollama runs are part of this checkpoint.

## Authority and actual CI/local parity

Source of truth: [Foundation CI](../../.github/workflows/ci.yml), root and
application `package.json` scripts, API Jest configurations,
`apps/web/vitest.config.ts`, `compose.test.yaml`, and
`apps/api/src/database/database.config.ts`. Reinspect them before future PRs;
this matrix is a snapshot, not a replacement for workflow inspection.

There is one workflow, triggered on `push` and `pull_request`, with one `quality`
job on `ubuntu-latest`, a 15-minute timeout, and `contents: read` permission.
No path-based documentation exemption, service-container declaration, job matrix,
or workflow-level concurrency group is configured. All listed run steps are
unconditional except teardown (`if: always()`, guarded by `.env.test` existence).
Repository branch-protection required-status settings were not inspected; here
“required” means the checks needed for this workflow's success.

| CI step / exact command                                         | Script behavior and prerequisites                                                                                                    | Local parity                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Checkout: `actions/checkout` v6                                 | Pinned SHA in YAML; `persist-credentials: false`                                                                                     | Local Git checkout reproduces source; Actions execution is CI-only                                                |
| Setup: `actions/setup-node` v6; `pnpm/action-setup` v4          | Pinned SHAs; Node `24.22.1`, pnpm `12.14.0`, `run_install: false`                                                                    | Verify `node --version` and `pnpm --version`; same versions in root engines/packageManager                        |
| `pnpm install --frozen-lockfile`                                | Install exact lockfile dependencies                                                                                                  | Yes; registry/cache access needed; no lockfile regeneration                                                       |
| `pnpm format:check`                                             | `prettier --check .`                                                                                                                 | Yes, repository-wide                                                                                              |
| `pnpm lint`                                                     | `eslint . --max-warnings 0`                                                                                                          | Yes, repository-wide                                                                                              |
| `pnpm typecheck`                                                | `pnpm -r run typecheck`; API: `tsc -p tsconfig.test.json --noEmit`; web: `tsc --noEmit`                                              | Yes, both packages                                                                                                |
| `pnpm -r --workspace-concurrency=1 run test`                    | Serial workspace runs; API compiles tests then Jest unit suites with `--runInBand`; web: `vitest run`                                | Yes; exact command, no selectors or worker overrides                                                              |
| `pnpm build`                                                    | `pnpm -r run build`; API: `tsc -p tsconfig.json`; web: `tsc --noEmit && vite build`                                                  | Yes; produces API `dist` needed below                                                                             |
| Configure disposable test database: inline Node heredoc in YAML | Generates `.env.test` with random password, mode `0600`; details below                                                               | Same Node heredoc works locally; preserve any existing local configuration; masking directive is Actions-specific |
| `pnpm db:test:up`                                               | `docker compose --env-file .env.test -f compose.test.yaml up -d --wait`                                                              | Yes with Docker/Compose, image access and free port 5433                                                          |
| `pnpm db:test:migrate:compiled`                                 | `node scripts/migrate.mjs test compiled run`; TypeORM CLI against `dist/database/test-data-source.js`                                | Yes; requires successful build and isolated test DB                                                               |
| `pnpm test:integration`                                         | `pnpm --filter @ai-job-hunter/api test:integration`; recompiles tests, loads `.env.test`, Jest integration config with `--runInBand` | Yes; separate from workspace unit/frontend test command                                                           |
| `pnpm db:test:down`                                             | `docker compose --env-file .env.test -f compose.test.yaml down`                                                                      | Yes; CI runs even after failure when env file exists; local cleanup requires the same care                        |

The inline setup runs `node --input-type=module` with `randomBytes(24)` converted
to hex, emits `::add-mask::` for the password, and uses `writeFileSync` to write:

```dotenv
NODE_ENV=test
DB_ENV=test
DB_HOST=127.0.0.1
DB_PORT=5433
DB_NAME=ai_job_hunter_test
DB_USER=ai_job_hunter_test
DB_PASSWORD=<fresh-random-test-password>
```

The password above is a placeholder, not a runnable credential. Use the workflow
heredoc as the exact setup reference; do not print passwords or overwrite an
existing `.env.test`. No workflow `env:` block, GitHub secret, production data,
live model, browser or Ollama service is required. Avoid inherited shell variables
that override `.env.test`; verify the target without logging secrets.

Docker Compose supplies PostgreSQL
`17.11-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27`,
loopback `5433:5432`, the test database/role, and `POSTGRES_PASSWORD` from
`DB_PASSWORD`. Data lives in tmpfs; health checks use `pg_isready` every 2 seconds,
3-second timeout, 15 retries and 10-second start period. Starting migrations and
integration tests writes disposable test data; stopping this container discards
it. Never reuse or stop another session's database, or substitute development or
production targets. Database guards enforce test identity, loopback, port 5433,
`DB_ENV=test`, `NODE_ENV=test`, and a non-placeholder password.

Concurrency has three separate layers: pnpm serializes workspaces with
`--workspace-concurrency=1`; both API Jest scripts use `--runInBand`; web Vitest
sets `maxWorkers: 2` with isolation left enabled. API integration test timeout is
15 seconds. Do not infer frontend workers from host CPU count, run other heavy
checks concurrently with the parity test, or replace the gate with a passing
one-worker diagnostic run. Root `pnpm test` expands to `pnpm -r run test` and
therefore does **not** express the workflow's workspace concurrency setting.

All application checks are locally reproducible with these prerequisites.
GitHub event delivery, action download/setup, hosted-runner image/resources,
permissions, log masking and status publication require an actual Actions run.
Local success cannot certify those mechanisms or branch-protection policy.

## P6 root causes and preventive controls

Evidence: [P6 final review](p6-final-review.md), especially the CI diagnosis,
P6.11, and post-P6.11 integration sections. Historical counts below describe
those runs, not DEV-02 verification.

| Cause                                                             | Evidence / distinction                                                                                                                                                                                          | What a complete local gate catches                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused selection omitted legacy shared consumers                 | Selector missed `axon-score-trace`, `cv-quote-resolution`, and `ai-tooling-downgrade`. Java qualification, Databases declarations, generic Experience and explicit LLM integration lost valid credit.           | Full workspace tests exercise these consumers; names matching the new feature are insufficient coverage.                                                                                                                                                         |
| Axon tooling expectations conflicted with P6 evidence sufficiency | Four remaining assertions credited `Tools: Claude / ChatGPT / GitHub Copilot.` for evaluating AND integrating tools into workflows. Correct result is Unknown, empty accepted quote and zero credit.            | Full tests expose the conflict; triage must classify the contract before changing assertions. P6.11 deliberately aligned expectations and added separate positive/negative/partial/conflict activity fixtures. Never restore unsupported credit just to pass CI. |
| Frontend worker contention                                        | Two default full runs failed three cases each; one-worker focused run passed 34/34. Full two-worker run passed 315 tests, with seven existing skips. No product transition or isolation defect was established. | A full frontend run with CI-equivalent settings exposes timing sensitivity; current shared `maxWorkers: 2` bounds contention without timeout increases. It reduces risk, not a guarantee against all flakes.                                                     |
| Verification scope/reuse overstated parity                        | 471 focused passes omitted consumers; API failure stopped the workspace command before web. Earlier reuse/scoped checks and conditional integration guidance did not cover all CI steps.                        | Execute every required local step, report which packages actually ran, and reuse results only with unchanged affected code/dependencies/configuration. A passing subset is never full parity.                                                                    |
| Separate integration mock contract became stale                   | Post-P6.11 mock spread canonical input `group` into output forbidden by `additionalProperties: false`, yielding schema failure and HTTP 503 before scoring. Workspace tests exclude integration suites.         | Build, compiled migrations and full `pnpm test:integration` catch this. Correction selected allowed output fields; production schema was not relaxed. Subsequent historical integration result: 8 suites / 53 tests passed.                                      |

Complete pre-push parity would have caught the demonstrated test failures before
publication, including the later integration mismatch. It would not prove all
matching semantics correct: the earlier contraction-negation counterexample
required synthetic review and new regressions. Passing existing tests remains
bounded evidence, not a substitute for contract review.

## Two-level verification workflow

1. **During development / checkpoint review:** use focused regressions and scoped
   typecheck as appropriate; broaden for migrations, security and integrity risks.
   Avoid repeated full suites. Documentation-only review uses scoped formatting,
   whitespace and command-source validation. Browser smoke rules still apply to
   user-visible UI changes. Report scope precisely.
2. **Before PR commit/push:** inspect the current workflow, run all required local
   steps on the final intended code, in workflow order with cleanup after failures.
   This includes the full workspace tests even when focused tests pass, plus the
   separately configured integration suite. Shared matching, scoring, evidence,
   common libraries and test infrastructure explicitly require the exact workspace
   command. Review staged content and report evidence before seeking publication
   approval. Do not rerun unchanged checks unnecessarily.

The previous AGENTS rule omitted build/install, made integration conditional on
changed behavior, and explicitly required full tests only for matching/scoring/
evidence. DEV-02 replaces that section with one authoritative gate, expands the
shared-change trigger, adds worker/diff/reuse controls, and makes the Fast
Iteration paragraph explicitly defer to the gate. Workflow-required integration
cannot be skipped merely because a change appears unrelated to database logic.
No scripts, hooks, dependencies or workflow changes are introduced.

## Final pre-PR checklist

- Inspect current workflow commands, scripts, versions, environment and services;
  record the revision and verify workspace/Jest/Vitest concurrency settings.
- Review all intended changes, including untracked files and privacy boundaries.
- Run every local matrix step in order; obtain authorization for database writes
  if not already authorized. A missing prerequisite or permission is BLOCKED.
- Record exact commands, exit results, failures/skips and reused results with their
  revision/scope and unchanged-code/dependency/configuration justification.
- After authorized staging, inspect `git diff --cached` and run
  `git diff --cached --check`; ensure intended new files are included and unrelated
  work is excluded. Use `git diff --check` for unstaged tracked changes too.
- Identify unverified GitHub-only mechanisms; do not report Actions success from
  local execution. Stop before commit/push on any required local FAIL or BLOCKED.
- Obtain explicit commit/push approval; clean up only the disposable resources
  owned by this run. No publication is authorized by this checklist itself.

## Environment limitations and failure triage

Ubuntu WSL2 can reproduce application commands but does not reproduce the hosted
runner's exact CPU/memory, image or 15-minute scheduling budget. The workflow
comment describes a two-core runner; actual resource equivalence is not verified
here. Docker daemon availability, image downloads, registry access and a free
5433 port are local prerequisites, not reasons to bypass required checks.

When a future check fails:

1. Preserve the failing command, revision, exit code and sanitized failure output.
   Confirm tool versions, frozen lockfile, environment/DB identity and actual
   worker settings. Distinguish infrastructure/setup failure from assertions.
2. Reproduce the failing suite narrowly for diagnosis; inspect every consumer of
   changed shared behavior. For timing failures, compare bounded concurrency as a
   diagnostic, without claiming a different command passed the parity gate.
3. Classify product regression, stale fixture/mock, contract disagreement or
   harness contention. Check source provenance separately from semantic evidence
   sufficiency. Resolve policy disagreements explicitly before changing tests.
4. Fix the cause without skipped tests, relaxed schemas/assertions, suppressed
   lint or unexplained timeout increases. Rerun affected checks and required full
   tests against the final fix; invalidate prior results when their affected code,
   dependencies or configuration changed.
5. Report remaining FAIL/BLOCKED and CI-only gaps, clean up owned test resources,
   and stop publication until required local checks pass. Avoid repeated blind
   reruns that disguise a reproducible failure.

## DEV-02 verification scope

This documentation-only checkpoint intentionally stops before the pre-PR gate,
staging or publication. Full application tests, installation, builds, lint,
typechecks, migrations and integration runs are not executed here. They remain
required before a future PR commit/push under the new rule, unless eligible prior
results can be demonstrated. The no-database-writes constraint is preserved.
