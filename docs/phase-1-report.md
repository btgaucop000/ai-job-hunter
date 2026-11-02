# Product Rebuild Phase 1 report

## Decision

Keep the existing application and PostgreSQL/TypeORM persistence. Make Job Inbox
the dashboard and preserve CV parsing, partial extraction and Review & Edit at
`/cv`. Add a separate opportunities module, with no new dependencies. Phase 1
is complete; discovery, matching/full-source Task 06, draft restoration and
additional AI work remain on HOLD.

Dashboard: <http://127.0.0.1:5173/dashboard>

Persistence: `ai_job_hunter.opportunities` in the existing Docker PostgreSQL
development database. A reversible explicit migration adds the table and owner /
updated-time index. The API assigns a fixed local owner UUID. This is a local
single-user implementation, without authentication, authorization or tenant
isolation. Dates are stored as calendar dates. JD uploads persist extracted text,
not the original document. No browser storage is authoritative.

## Evidence

Executed checks and actual results:

| Command / check                                                                                                                                                                                                                                                                        | Actual result                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/web test`                                                                                                                                                                                                                                                | 90 passed, 7 skipped; 9 passing files, 2 skipped files                                                    |
| `pnpm --filter @ai-job-hunter/api test --runTestsByPath .test-dist/test/unit/opportunities.spec.js .test-dist/test/unit/pdf-parser.spec.js .test-dist/test/unit/document-parser.spec.js .test-dist/test/unit/analysis.partial.spec.js .test-dist/test/unit/analysis.lifecycle.spec.js` | 113 passed across 5 suites                                                                                |
| `pnpm --filter @ai-job-hunter/api test:integration`                                                                                                                                                                                                                                    | 10 passed across both integration suites                                                                  |
| `pnpm typecheck`                                                                                                                                                                                                                                                                       | Both applications passed                                                                                  |
| `pnpm build`                                                                                                                                                                                                                                                                           | Both applications passed; Vite reported a bundle-size warning (about 554 kB before gzip)                  |
| `pnpm lint`                                                                                                                                                                                                                                                                            | Passed with zero warnings                                                                                 |
| `pnpm exec prettier --check` with the Phase 1 changed files explicitly listed                                                                                                                                                                                                          | Passed                                                                                                    |
| `git diff --check`                                                                                                                                                                                                                                                                     | Passed                                                                                                    |
| `pnpm db:test:up`                                                                                                                                                                                                                                                                      | Started a fresh isolated, tmpfs-backed PostgreSQL test container on port 5433                             |
| `pnpm db:test:migrate`, `pnpm db:test:revert`, `pnpm db:test:migrate`, `pnpm db:test:migrate`                                                                                                                                                                                          | Apply, revert, reapply and repeat-run passed on the empty isolated test database                          |
| `pnpm db:test:migrate:compiled`, `pnpm db:test:revert:compiled`, `pnpm db:test:migrate:compiled`, `pnpm db:test:migrate:compiled`                                                                                                                                                      | Compiled migration discovery, revert, reapply and repeat-run passed; source and compiled histories agreed |
| `pnpm db:migrate`                                                                                                                                                                                                                                                                      | Applied only the new additive opportunities migration to development                                      |

The tests cover add/edit, list and detail reads, persistence through a new
PostgreSQL connection, inbox remount/refetch, flexible status changes, contact
dates, follow-up updates and clearing, invalid dates/links/owner injection,
non-local write rejection, synthetic PDF parsing and unsupported/malformed files.
Existing CV parsing and partial analysis tests were exercised without inference.
The 7 skipped frontend tests are existing opt-in smoke/acceptance tests, not
reported as verified.

Manual HTTP verification used Node fetch through the running Vite proxy:

- Dashboard and database readiness: HTTP 200.
- Add a synthetic opportunity: HTTP 201.
- Update directly from SAVED to INTERVIEW with notes, contact date and follow-up:
  HTTP 200.
- Fetch that opportunity again: HTTP 200, with the saved fields matching.
- Retained synthetic record: `ddb397a4-a6c7-45cd-802e-2a3744a7a7ac`, titled
  `[Synthetic verification] Phase 1 engineer`. No development records were deleted.

The existing API process was restarted with its original no-AI preload retained;
the existing Vite server remained running. No inference, external AI request,
crawling, or real CV/JD access was performed. Browser interaction and actual
browser-refresh acceptance are **NOT_VERIFIED**: no connected browser tool or
installed browser was available. DOM remount tests and HTTP refetch checks are
not browser verification.

## Exact files changed for this phase

This list excludes unrelated changes already present when work began.

- `README.md`
- `docs/architecture.md`
- `docs/phase-1-report.md`
- `apps/api/src/app.module.ts`
- `apps/api/src/database/database.config.ts`
- `apps/api/src/database/migrations/1792800000000-CreateOpportunities.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/opportunities.module.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/src/opportunities/opportunity.entity.ts`
- `apps/api/src/opportunities/opportunity.validation.ts`
- `apps/api/test/integration/database.spec.ts`
- `apps/api/test/integration/opportunities.spec.ts`
- `apps/api/test/unit/opportunities.spec.ts`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/inbox/JobInbox.tsx`
- `apps/web/src/features/inbox/opportunities-api.ts`
- `apps/web/test/app.test.tsx`
- `apps/web/test/inbox.test.tsx`
- `apps/web/test/jobs.test.tsx`

The existing migration integration assertion now checks the opportunities table
on reverting the latest migration, instead of expecting the original application
schema to disappear. Legacy job-panel tests still exercise the preserved panel
independently; the app tests now assert the inbox and separate CV review route.
Existing uncommitted work and the Git index were preserved. No commit, push,
merge, reset, clean, stash or rebase was performed.

## Blockers and practical limits

No storage/API blocker was found for local single-user use. Real-browser
acceptance remains outstanding. Public or multi-user use is blocked by absent
authentication/authorization. The current running API's existing no-AI guard
intentionally prevents live inference from the preserved CV tools. Unsupported
JD formats, OCR/scans and encrypted documents require pasted text. Unsaved edits
are discarded on navigation; concurrent edits use last-save-wins. Follow-up
dates do not send reminders. The production bundle-size warning is non-blocking.

## Next action

Review Phase 1 at the dashboard URL and perform browser acceptance with synthetic
data: add, save, refresh, open, change status, record contact dates, edit notes
and follow-up, save, and refresh again. No further implementation phase has been
started; await user review before further work.
