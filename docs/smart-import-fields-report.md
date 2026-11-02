# Complete Smart Job Import extraction and review fields

## Decision

Keep the existing canonical Opportunity model and PostgreSQL workflow. Fix
upstream field extraction/evidence handling, add three optional fields end-to-end,
and preserve manual edits, source evidence and tracking information. No parser,
security, provider, crawling or matching behavior changed. No new dependency.

Dashboard: <http://127.0.0.1:5173/dashboard>
Add Job: <http://127.0.0.1:5173/jobs/new>

## Root cause and field trace

| Field/group                            | Source → model/schema                                                                                                                 | Backend/API                                                                             | Review/state                      | Database/detail                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Job title                              | Generic instructions allowed omission; strict literal substring validation discarded case/whitespace variants or normalized proposals | Already mapped when an accepted candidate existed; no recovery from explicit headings   | Already bound to title            | Existing column and read/edit worked; absent suggestion appeared blank |
| Location                               | Post/JD components were not combined; normalized district/city text could fail verbatim-value validation                              | Already mapped, but distinct compatible component strings could be treated as conflicts | Already bound                     | Existing column; no missing persistence mapping                        |
| Work mode                              | Omission or Onsite/onsite/quote whitespace differences could fail the literal gate                                                    | Already mapped if accepted                                                              | Already bound                     | Existing column and detail mapping                                     |
| Experience                             | Not an allowed extraction field                                                                                                       | Absent from canonical entity/input                                                      | No editable field/state key       | No column/read value                                                   |
| Preferred skills                       | Not an allowed extraction field; all skills shared one generic bucket                                                                 | Absent as a separate canonical field                                                    | No editable field/state key       | No column/read value                                                   |
| Domain                                 | Not an allowed extraction field                                                                                                       | Absent from canonical entity/input                                                      | No editable field/state key       | No column/read value                                                   |
| Company/contact/required skills/salary | Existing fields                                                                                                                       | Existing mapping and persistence retained                                               | Existing editable fields retained | Existing values preserved                                              |

This identifies code-established omission/rejection paths and unsupported fields.
The latest original browser/Ollama response was not captured, and no private file
or additional inference was authorized. It is therefore not claimed that one
particular upstream rejection was observed for that private input. Focused
synthetic tests reproduce the concrete loss modes and exercise their fixes.

## Fix

- Added experience, preferredSkills and domain as first-class optional canonical
  fields, with string defaults, boundary size checks, schema enum, frontend state,
  editable controls, save/read and job detail/edit display.
- Clarified all 14 fields in the existing Ollama prompt, including Vietnamese
  recruitment cues, minimum years versus seniority, required versus preferred,
  and company/JD issuer versus an unknown end-client.
- Added bounded, source-backed recovery for explicit labels and recruitment
  wording in the provided inputs after a valid structured model result.
  This fills explicit facts even when a model omits them; it does not use a new
  provider or pretend a provider failure succeeded.
- Resolved literal case/whitespace variants to actual source fragments. Original
  quotes/raw candidates remain available; unsupported values remain rejected.
- Applied controlled normalization and compatible-evidence merging. Conflicting
  district/city, mode, years, salary or scalar values remain blank for review.
- Separated preferred skills using their source context, including narrow model
  quotes that omit the preference cue. Unrelated preferred text elsewhere in a
  multiline quote cannot reclassify a required skill.
- Kept manual field/description edits during extraction, including deliberately
  empty values. Saved differences from suggestions remain protected after read.
  Status, notes, contact dates and follow-up are not overwritten by extraction.
- Preserved historical 11-field review envelopes and old tracker requests that
  omit the new fields. No private-data backfill or retrospective reclassification.

The original canonical entity is still Opportunity. Manual and Website-source
records use the same service/table and optional defaults. No crawler currently
persists jobs in this repository; the preserved legacy feed is read-only and was
not refactored or presented as implemented crawling.

### Synthetic ground truth result

| Field                             | Verified result                                                    |
| --------------------------------- | ------------------------------------------------------------------ |
| Title                             | AI Developer                                                       |
| Company                           | Tinh Vân, from explicit JD issuer evidence; no end-client invented |
| Location                          | Quận 7, TP.HCM                                                     |
| Work mode                         | Onsite                                                             |
| Experience                        | Minimum 3 years                                                    |
| Required skills                   | AI application development, Python, AI/ML                          |
| Preferred skills                  | Backend Java, Voicebot                                             |
| Domain                            | Insurance                                                          |
| Salary                            | 23M-25M gross                                                      |
| Contact                           | recruiter@example.com                                              |
| Seniority / agency / original URL | Unknown unless explicitly provided                                 |

Neither supplied source states a monthly period, so the result intentionally does
not append `/month`. A salary period is normalized only when actually stated.
Canonical display values are derived from quotes, not required to be verbatim
substrings themselves; persisted review recomputes that derivation.

## Evidence

### Automated commands and actual results

| Command/check                                       | Actual result                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/web test`             | 100 passed, 7 existing opt-in tests skipped                            |
| Focused backend command below                       | 147 passed across 6 suites                                             |
| `pnpm --filter @ai-job-hunter/api test:integration` | 24 passed across 3 suites; actual isolated PostgreSQL, fake provider   |
| `pnpm typecheck`                                    | Both applications passed                                               |
| `pnpm build`                                        | Both applications passed; existing approximately 567 kB bundle warning |
| `pnpm lint`                                         | Passed                                                                 |
| Prettier check on exact task files                  | Passed                                                                 |
| `git diff --check`                                  | Passed                                                                 |

```bash
pnpm --filter @ai-job-hunter/api test --runTestsByPath \
  .test-dist/test/unit/job-import.fields.spec.js \
  .test-dist/test/unit/job-import.spec.js \
  .test-dist/test/unit/opportunities.spec.js \
  .test-dist/test/unit/docx-parser.spec.js \
  .test-dist/test/unit/pdf-parser.spec.js \
  .test-dist/test/unit/opportunities.security.spec.js
```

The end-to-end synthetic integration sends a recruiter post plus generated DOCX
through the extraction API using the existing AiService schema validation and a
fake AI_PROVIDER, including a valid empty proposal result. It verifies the full
expected normalized preview, edits experience/preferred/domain, saves with the
original synthetic document, checks through a separate PostgreSQL connection,
reads detail, and makes a legacy tracker update that must preserve the new fields
and original sources. Manual Website-source save uses the same canonical fields
without extraction.

The frontend fixture is generated only from the supplied synthetic source texts.
Tests verify the API-shaped response populates the actual review form, manual
corrections survive save/read and component remount, and re-extraction preserves
manual title/domain/description/follow-up and previously cleared company. Other
cases cover missing facts, vague company references, negation, quote variants,
source conflicts and historical reviews. No fixture contains private HR content.

### Database migration status

`CompleteJobImportFields1793490000000` adds only experience, preferredSkills and
domain as NOT NULL text with empty defaults. Existing rows and tracking columns
are retained; the down migration removes only those three new columns.

After checking the isolated test table had zero rows, executed:

```bash
pnpm db:test:migrate
pnpm db:test:revert
pnpm db:test:migrate
pnpm db:test:migrate
pnpm db:test:migrate:compiled
pnpm db:test:revert:compiled
pnpm db:test:migrate:compiled
pnpm db:test:migrate:compiled
pnpm db:migrate
pnpm db:status:compiled
```

TypeScript and compiled apply/revert/reapply/repeat-run behavior passed. Development
received only the additive migration; compiled status reports it applied, with no
pending migrations. Development was never reverted. A synthetic migration test
also retains an older job's status, notes, contact dates and follow-up through
rollback/reapply and verifies empty defaults on the new fields. Its guard refuses
to drop columns if meaningful new-field data already exists in the test table.

No development opportunity was created, deleted or rewritten for verification.
Integration test writes were confined to the isolated synthetic database. Existing
uncommitted work, Git index, database data and private artifacts were preserved.
No commit, push, reset, clean, stash, merge or rebase.

## Exact changed files

- `apps/api/src/opportunities/job-import.contract.ts`
- `apps/api/src/opportunities/job-import.evidence.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/src/opportunities/opportunity.entity.ts`
- `apps/api/src/opportunities/opportunity.validation.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/src/database/database.config.ts`
- `apps/api/src/database/migrations/1793490000000-CompleteJobImportFields.ts`
- `apps/api/test/support/smart-import.synthetic.ts`
- `apps/api/test/unit/job-import.fields.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/api/test/integration/database.spec.ts`
- `apps/web/src/features/inbox/opportunities-api.ts`
- `apps/web/src/features/inbox/JobEditor.tsx`
- `apps/web/test/job-import.test.tsx`
- `apps/web/test/fixtures/smart-import-complete.synthetic.json`
- `README.md`
- `docs/architecture.md`
- `docs/smart-import-fields-report.md`

## Blockers and verification limits

Real browser interaction: **NOT_VERIFIED**.
Real Ollama behavior with the changed instructions: **NOT_VERIFIED / not invoked**.
Private HR file processing: **NOT_PERFORMED**.

Synthetic provider/schema tests, actual PostgreSQL persistence and DOM tests passed;
they are not a claim of real-model coverage or browser acceptance. Recovery rules
cover bounded explicit wording, not arbitrary semantic understanding. A model may
still omit or misclassify unsupported wording; source evidence and human review
remain necessary. Supported candidates cannot establish that every possible
conflict was detected. Existing bundle-size warning remains non-blocking.

## Next action

Review Add Job and existing detail fields. Any agent-run real Ollama verification
or private HR processing requires separate authorization. A separately authorized
browser check should use the supplied synthetic post/JD, review all fields, make
manual corrections, save, refresh and reopen from Job Inbox. No additional
inference or private processing was performed to obtain this report.

This task is stopped. No discovery, crawling, CV matching or other AI work started.
