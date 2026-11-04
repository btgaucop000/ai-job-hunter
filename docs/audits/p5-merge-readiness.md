# P5 merge readiness and PR scope

Date: 2026-11-04. Branch: `feat/p5-discover-page`.
Recommendation: ready for PR preparation and review. No staging, commit, push,
PR creation or merge is authorized by this report.

## Included behavior

- Persistent owner-scoped Discovery Queue with immutable initial snapshots,
  explicit review/status actions and transactional Save to Inbox.
- Exact source/URL linking without overwriting existing jobs, explicit
  possible-duplicate confirmation, exact-ambiguity blocking and idempotent Save.
- Additive Discovery Candidates migration with identity/state/timestamp/snapshot
  constraints and restrictive opportunity linkage. No historical backfill.
- Curated Axon, Backbase, Temus and Go1 Vietnam Greenhouse sources, bounded
  fetch concurrency and per-source outcome/cache/count transparency.
- Dedicated Discover page, persistent URL filters/pagination, bounded queue,
  shared notifications and local UX Foundation corrections.
- Shared Job Details provenance, bounded desktop Application editing with a
  persistent Save row and narrow/short-viewport fallback, manual-only Edit JD.
  Original imported source text/documents and conflict acknowledgements remain
  preserved. Add Job retains its existing import/extraction workflow.

## Verification completed

These are executed results, not a proposed test plan. M3 changed documentation
only; M1/M2 results were reused without rerunning database or browser acceptance.

| Check | Actual result |
| --- | --- |
| Focused backend unit tests, pre-merge check | 9 suites, 61 tests passed. |
| M1 affected App test file | 10/10 passed after updating the discovery fixture and notification assertion. |
| M1 focused frontend suite | 18 files, 181/181 passed serially. |
| M2 focused frontend tests | App, discovery, queue and notifications: 4 files, 34/34 passed. |
| M2 PostgreSQL integration | Discovery queue/actions/retired route: 3 suites, 13/13 passed. |
| M2 migration lifecycle | All eight applied; latest Discovery Candidates migration reverted/reapplied via supported source and compiled CLI; repeat runs had no pending migrations. |
| M2 live API/DB Chromium | All seven scoped scenarios passed at 1440×900 with deterministic synthetic Greenhouse provider data. API responses and PostgreSQL transactions were real. |
| M3 lightweight checks | API/web typechecks and `git diff --check` passed. |

M2 verified `127.0.0.1:5433`, database/role `ai_job_hunter_test`, before writes.
The separate API used port 3001; browser API traffic was forwarded exclusively
there. Host port 5432 had no listener; development was on 5434 and was not mutated.
No private CV/Ollama processing occurred.

Database tests exercised owner isolation, immutable rescans across states,
concurrent/retried Save producing one job, manual-create races, exact/heuristic
matching, ambiguity blocking, rollback after insertion and referential integrity.
Browser checks exercised discovery of 12 candidates without Inbox insertion,
read-only review, explicit Save/opening the saved job, unchanged exact-linked job,
possible-duplicate Cancel/confirmation, repeated Save returning the same ID,
two rescans preserving identity/status/snapshot/link, all six filters and page 2
after reload. Captured fixture IDs were removed with narrow owner/ID/company
predicates; test counts returned to zero. No reset or broad cleanup was used.

The M2 console contained expected duplicate-conflict HTTP 409 entries and two
early CV-read HTTP 403 entries caused by a fixture-harness restriction. That
restriction was corrected and saved-job detail rechecked. No application runtime
exception was observed; this does not claim a completely empty console log.

Relevant commands:

```bash
pnpm typecheck
git diff --check
pnpm --filter @ai-job-hunter/web test test/app.test.tsx test/discovery.test.tsx test/discovery-queue.test.tsx test/notifications.test.tsx --maxWorkers=1
pnpm --filter @ai-job-hunter/api test:integration --runTestsByPath .test-dist/test/integration/discovery-queue.spec.js .test-dist/test/integration/discovery-actions.spec.js .test-dist/test/integration/discovery.spec.js
```

The database command requires the verified isolated test target and exclusive
test execution. Do not run it against development. Detailed local M1/M2 JSON,
logs, screenshots and temporary fixture harnesses are outside the repository;
they are not PR source files or newly committed reusable browser tests.

## Review findings and deferred scope

No new dependency, persistence contract, unrelated refactor, debug instrumentation
or temporary acceptance API was introduced by packaging. The old HTTP
`POST /opportunities/discover` returns 410 without fetching or saving. Unused
`DiscoveryService.discover` / `OpportunitiesService.importDiscovered` methods and
a pre-cutover module comment remain as non-blocking dead-code cleanup; do not
reactivate automatic importing. Runtime and CLI register the same migration.

Historical design/audit documents describe their original snapshots and proposals;
the later architecture decisions and this acceptance record supersede their
pending verification and removed Edit JD replacement workflow descriptions.

Known P5.4 follow-ups remain explicitly deferred:

1. Repeated/changed URL Fetch in Add Job can mix JD content.
2. Failed Upload may retain stale attachment state.
3. Duplicate URL warnings appear too late in Add Job.

These are existing import-workflow issues, not implemented or claimed fixed here.
Broader source coverage/ranking policy and explicit snapshot refresh remain
separate product decisions.

All intended P5 work is still uncommitted/untracked; HEAD has no commits ahead
of main. A PR must include the complete reviewed file manifest, especially the
new migration, modules and test helpers. Approval to stage/commit/push/create the
PR is a separate step.
