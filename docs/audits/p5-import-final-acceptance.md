# P5.4c — Import final acceptance

Date: 2026-11-04. Branch: `fix/p5-import-reliability`.
Decision: **READY for PR review**. No commit, push, PR or merge performed.

## Acceptance results

| Item                                                   | Status | Evidence                                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edit JD remains manual-only; Discovery Queue unchanged | PASS   | Reviewed the complete tracked diff and new files. Import handlers retain existing-job guards; the duplicate notice renders only for Add Job. No Discovery files changed. Manual Edit JD regressions pass.                                                            |
| Fetch/upload recovery preserves manual edits           | PASS   | Focused tests cover repeat Fetch, confirmed source replacement, failure/retry, edits made during Fetch, failed document recovery and retained manual fields.                                                                                                         |
| Stale source data is excluded from extraction/Save     | PASS   | Generation guards reject late Fetch/parse results. Upload recovery tests inspect both extraction FormData and Save payloads after failed, pending and successful uploads followed by Paste JD.                                                                       |
| Lookup uses Save normalization, without heuristics     | PASS   | Both call the existing backend `normalizedUrl`. Real PostgreSQL/HTTP tests verify equivalent scheme/www/trailing-slash/tracking/hash/query-order variants; different URLs return null.                                                                               |
| Lookup is owner-scoped and read-only                   | PASS   | Real PostgreSQL fixtures include the current owner, another owner with the same URL and another-owner-only URL. Only the current owner's match is returned. Metadata projection is asserted, fixture snapshots remain unchanged and duplicate insertion is rejected. |
| Static route precedes dynamic ID routes                | PASS   | Controller registers `duplicate-url` before `:id`; real HTTP GET returns 200 for valid lookup and 400 URL validation for invalid input.                                                                                                                              |
| Lookup failure does not block Add Job                  | PASS   | Dedicated notice failure test plus Add Job integration test confirm advisory behavior, editable draft and authoritative Save-time 409 handling. The notice does not control Save state.                                                                              |
| No secrets, debug artifacts or unrelated files         | PASS   | Reviewed added lines and complete file inventory. Only application code, focused tests and architecture/acceptance documentation changed. No configuration, dependency, migration, AGENTS.md or production logging changes.                                          |
| Live HTTP: existing exact URL                          | PASS   | 200 with `{ match: { id, title, company } }` for the current-owner synthetic fixture; `Cache-Control: no-store`.                                                                                                                                                     |
| Live HTTP: another-owner-only URL / new URL            | PASS   | 200 with `{ match: null }` for both cases.                                                                                                                                                                                                                           |
| Live HTTP: invalid URL                                 | PASS   | 400 validation errors for malformed, non-HTTP, credential-bearing and oversized URLs.                                                                                                                                                                                |
| Live HTTP: Save-time duplicate protection              | PASS   | POST of the equivalent URL with a different title returns 409. No duplicate inserted; existing fixture snapshots unchanged.                                                                                                                                          |

## Isolated live HTTP setup

`apps/api/test/integration/duplicate-url.spec.ts` starts the real Opportunities
module/controller/services and TypeORM against the existing isolated PostgreSQL
container on `127.0.0.1:5433`. It listens on a separate ephemeral localhost TCP port;
HTTP requests use native `fetch`, without API mocks or Supertest in this file.
The actual local-write security boundary remains enabled for POST.

`databaseOptions('test')` rejects development/production targets, and the test also
asserts the connected database and role are both `ai_job_hunter_test`. Existing
migration status must be current; this acceptance run did not apply migrations.
Three fixtures use random IDs and reserved example.com URLs. Cleanup deletes only
those IDs with this run's unique synthetic title and verifies none remain. The
separate API and its connections close after the tests. Development data was not
read or modified. No job-page fetch, AI call or private document processing ran.

## Checks and actual results

- Frontend: **74 passed** across `duplicate-job-notice`, `url-import`, `job-import`,
  `url-import-extraction`, `import-methods`, `source-jd-preview` and `fact-review`.
- Backend unit/HTTP contract: **15 passed** across `duplicate-url` and `opportunities`.
- PostgreSQL/live HTTP: **9 passed**, including fixture cleanup assertion.
- Previously failing unsaved-guard focus scenarios: **3 passed**, four unrelated
  scenarios skipped by the test-name filter. No focus implementation changes.
- `pnpm --filter @ai-job-hunter/web typecheck`: **PASS**.
- `pnpm --filter @ai-job-hunter/api typecheck`: **PASS**.
- `pnpm format:check`: **PASS**.
- `pnpm lint`: **PASS**.
- `git diff --check`: **PASS**.

The source-import tests exposed timing interference from the new advisory lookup.
Two more existing test files now mock the separately tested notice component so
source-import request assertions cannot accidentally consume lookup requests.
The dedicated notice tests still mount the real Add Job and test its warning and
Save behavior. No production behavior changed during P5.4c.

Focused execution commands:

```bash
pnpm --filter @ai-job-hunter/web exec vitest run test/duplicate-job-notice.test.tsx test/url-import.test.tsx test/job-import.test.tsx test/url-import-extraction.test.tsx test/import-methods.test.tsx test/source-jd-preview.test.tsx test/fact-review.test.tsx
pnpm --filter @ai-job-hunter/web exec vitest run test/unsaved-job-guard.test.tsx -t 'B01: keyboard sidebar|Stay shows the same outline'
pnpm --filter @ai-job-hunter/api test:compile
pnpm --filter @ai-job-hunter/api exec node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.js --runInBand --runTestsByPath .test-dist/test/unit/duplicate-url.spec.js .test-dist/test/unit/opportunities.spec.js
pnpm --filter @ai-job-hunter/api exec node --env-file=/home/tientb/projects/ai-job-hunter/.env.test --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.js --runInBand --runTestsByPath .test-dist/test/integration/duplicate-url.spec.js
```

The P5.4a/P5.4b mocked Chromium acceptance remains the browser evidence. The full
browser suite was not repeated in P5.4c; no frontend production code changed in
this checkpoint, and the new API contract is exercised over real local HTTP.

## Combined changed-file inventory

API:

- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/test/unit/duplicate-url.spec.ts` (new in P5.4b)
- `apps/api/test/integration/duplicate-url.spec.ts` (new in P5.4c)

Web:

- `apps/web/src/features/inbox/DuplicateJobNotice.tsx` (new in P5.4b)
- `apps/web/src/features/inbox/JobEditor.tsx`
- `apps/web/src/features/inbox/job-url-import.ts`
- `apps/web/test/duplicate-job-notice.test.tsx` (new in P5.4b)
- `apps/web/test/import-methods.test.tsx`
- `apps/web/test/job-import.test.tsx`
- `apps/web/test/source-jd-preview.test.tsx`
- `apps/web/test/url-import-extraction.test.tsx`
- `apps/web/test/url-import.test.tsx`
- `apps/web/test/topcv-bookmarklet.test.tsx` (final CI follow-up)
- `apps/web/test/unsaved-job-guard.test.tsx` (final CI timeout adjustment only)

Documentation:

- `docs/architecture.md`
- `docs/audits/p5-import-final-acceptance.md` (new in P5.4c)
- `docs/audits/p5-itviec-metadata-extraction.md` (new in P5.4e; audit only)

## Remaining limits

Lookup retains the existing linear scan of owned URL metadata. The advisory result
can become outdated after checking; transactional server-side enforcement remains
authoritative. Live external-site imports and the full application test suite
were outside this targeted acceptance. No remaining in-scope blocker was found.

## Final CI follow-up

The first remote CI runs passed all 1,439 backend unit tests but exposed advisory
lookup requests in the bookmarklet tests' global request counts. That test file
now isolates the independently tested duplicate notice, matching the other import
regressions. The push run also timed out one B01 StrictMode keyboard scenario at
the default five-second test deadline; its bounded traversal now has a ten-second
test budget. All focus, keyboard, dialog and draft-retention assertions remain
unchanged, and no application focus behavior was modified. These are test-only CI
corrections; CI must pass again on the follow-up commit before merge.
