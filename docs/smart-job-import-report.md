# Phase 1 UX Completion — Smart Job Import

## Decision

Implemented Smart Job Import within the existing React/NestJS application and
PostgreSQL-backed opportunities module. Reused the existing AiService, Ollama
provider, bounded DocumentParser and Busboy dependency. No new framework,
provider, dependency, repository, authentication, crawling or CV matching work.

Add Job: <http://127.0.0.1:5173/jobs/new>
Job Inbox: <http://127.0.0.1:5173/dashboard>

The flow accepts only a pasted post, only a supported PDF/DOCX, or both. The
explicit Extract with AI action produces editable, quote-backed suggestions for
all requested fields. Company is optional, and unsupported suggestions remain
blank. Differing scalar candidates produce a blank conflicting field with visible
source evidence. Users can select a candidate, type a correction or leave it
unknown, then explicitly acknowledge the conflict before saving. The backend
recomputes conflict/evidence checks at persistence. Source platform is selected
by the user; Other covers LinkedIn and other platforms.

Original post text, parsed JD text, review metadata and the original document
bytes/filename/MIME are stored in PostgreSQL separately from editable fields.
Original document bytes use a nullable bytea column and are excluded from ORM
reads/JSON responses except the attachment-download endpoint. There is no disk
staging or orphan upload lifecycle. Existing original attachments cannot be
replaced through tracker updates. Existing Phase 1 files that were never stored
cannot be reconstructed. Unsupported or unparseable attachments must be removed
and their text pasted. Manual save never invokes inference.

## Evidence

### Automated checks actually executed

| Check                                                                              | Actual result                                                                                 |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/web test`                                            | 95 passed, 7 existing opt-in tests skipped; 10 passing files, 2 skipped files                 |
| `pnpm --filter @ai-job-hunter/api test:integration`                                | 18 passed across 3 suites; rerun after adding legacy-client preservation                      |
| Focused backend command below                                                      | 173 passed across 7 suites                                                                    |
| `pnpm typecheck`                                                                   | Both applications passed                                                                      |
| `pnpm build`                                                                       | Both applications passed; API build repeated after the final service change                   |
| `pnpm lint`                                                                        | Passed with zero warnings                                                                     |
| `pnpm exec prettier --check` with this task's changed source/test/doc paths listed | Passed                                                                                        |
| `git diff --check`                                                                 | Passed                                                                                        |
| Source migration apply, revert, reapply, repeat run                                | Passed against the isolated test database after confirming it contained zero opportunity rows |
| Compiled migration discovery, revert, reapply, repeat run                          | Passed against the same empty isolated test database                                          |
| `pnpm db:migrate`                                                                  | Applied only the additive SmartJobImport migration to development                             |

Focused backend command:

```bash
pnpm --filter @ai-job-hunter/api test --runTestsByPath \
  .test-dist/test/unit/job-import.spec.js \
  .test-dist/test/unit/opportunities.spec.js \
  .test-dist/test/unit/pdf-parser.spec.js \
  .test-dist/test/unit/docx-parser.spec.js \
  .test-dist/test/unit/document-parser.spec.js \
  .test-dist/test/unit/analysis.partial.spec.js \
  .test-dist/test/unit/analysis.lifecycle.spec.js
```

Migration verification used, in order:

```bash
pnpm db:test:migrate
pnpm db:test:revert
pnpm db:test:migrate
pnpm db:test:migrate
pnpm db:test:migrate:compiled
pnpm db:test:revert:compiled
pnpm db:test:migrate:compiled
pnpm db:test:migrate:compiled
```

Coverage includes paste-only, PDF-only, DOCX-only and post-plus-JD extraction and
save; company found only in JD; unknown company; distinct agency/contact fields;
conflicts blocking save; source quote validation; safe AI failure and manual
fallback; original-byte download; persistence through another database connection;
frontend remount/refetch; and tracker status/date updates preserving source data.
The provider is a synthetic deterministic fake behind the real AiService schema
validation. The import integration suite also asserts no global fetch calls.
These checks validate application plumbing and evidence/merge rules, not actual
Ollama extraction quality or completeness.

The first integration run exposed a multipart parts-limit boundary rejecting a
valid record-plus-document request. It was corrected and the full integration
suite passed. Existing tests were updated for the optional company, new save
label/error text, editor file location and latest-migration assertion. Initial
formatting invocation had a mistyped migration path; the corrected explicit check
passed. No failed or unexecuted check is counted as passing.

### Manual verification actually performed

Non-inference HTTP checks used Node fetch through the running Vite proxy:

- Add Job page and database readiness: HTTP 200.
- Multipart save with a synthetic post and PDF, omitting company: HTTP 201;
  company stored as empty/unknown.
- Download original PDF: HTTP 200 and byte-for-byte equality.
- Tracker update with an older JSON payload: HTTP 200; original post, original
  attachment and additional imported fields remained intact.
- Refetch saved detail: HTTP 200; CONTACTED status, contact date and follow-up
  date persisted.

Retained development record:
`ec164097-41e7-466f-82f9-e0f409376851`, titled
`[Synthetic verification] Smart Job Import manual path`.
No development records were deleted. The previously retained Phase 1 synthetic
record was preserved. The API was restarted with its original no-AI preload;
the existing Vite server remained running.

### Browser and inference verification

- Real browser interaction and real browser refresh: **NOT_VERIFIED**. No
  connected browser tool or installed browser was available. Vitest/jsdom tests
  and HTTP refetches are not browser acceptance.
- Real Ollama import inference: **NOT_VERIFIED**. No inference or external AI
  call was run. No private CV/JD document was accessed. The running API retains
  its existing no-AI guard, which intentionally causes live extraction to use
  the manual fallback. The standard launch uses the existing configured Ollama
  integration; its live model/context compatibility and result quality require
  separately authorized verification.

## Exact files changed in this task

Unrelated uncommitted changes from earlier work are excluded from this list.

- `README.md`
- `docs/architecture.md`
- `docs/smart-job-import-report.md`
- `apps/api/src/database/database.config.ts`
- `apps/api/src/database/migrations/1793400000000-SmartJobImport.ts`
- `apps/api/src/opportunities/job-import.contract.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/src/opportunities/job-import.upload.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/opportunities.module.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/src/opportunities/opportunity.entity.ts`
- `apps/api/src/opportunities/opportunity.validation.ts`
- `apps/api/test/integration/database.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/api/test/unit/job-import.spec.ts`
- `apps/api/test/unit/opportunities.spec.ts`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/inbox/JobEditor.tsx`
- `apps/web/src/features/inbox/JobInbox.tsx`
- `apps/web/src/features/inbox/opportunities-api.ts`
- `apps/web/test/inbox.test.tsx`
- `apps/web/test/job-import.test.tsx`

The Git index and unrelated uncommitted work were preserved. No commit, push,
reset, clean, stash, merge or rebase was performed.

## Blockers and limits

The current running API's existing no-AI guard prevents live extraction; manual
save and tracking are available. Browser acceptance and real Ollama inference
quality remain unverified. Exact quote validation does not prove semantic
correctness, completeness, negation handling or resistance to source instructions;
all suggestions need human review. Conflicts not proposed by the model cannot be
guaranteed detected. Long combined sources can exceed the existing model context
budget and return a manual fallback; nothing is silently truncated or retried.

The application remains a local single-user workspace without authentication,
authorization or tenant isolation. No public-readiness claim is made. Original
files are bounded to 5 MiB and remain in PostgreSQL; no replacement/deletion or
retention UI is introduced. Unsaved edits are memory-only. The existing Vite
production bundle warning remains (approximately 566 kB before gzip).

## Next action

Review the paste-first UI with synthetic data. If live extraction verification is
wanted, explicitly authorize a bounded synthetic Ollama check and the runtime
change needed to remove the existing no-AI guard. Private-document inference
requires separate explicit approval. This task is stopped; no discovery,
matching, or additional AI work has been started.
