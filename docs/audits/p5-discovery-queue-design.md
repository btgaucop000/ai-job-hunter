# P5.2a — Discovery Queue technical design and migration plan

Status: proposed design, not implemented. Date: 2026-11-03.
Inspected branch: `feat/p5-discover-page`, including its uncommitted P5.2 work.
Approved direction: **Discover → persistent queue → user review → explicit Save to Inbox**.

## 1. Current architecture and side effects

| Layer / reference | Current behavior |
| --- | --- |
| `apps/web/src/app/App.tsx`, `features/inbox/DiscoverJobsPage.tsx` | `/discover` is a navigation destination with PageHeader and outlined Paper. Inbox is separate. |
| `apps/web/src/features/inbox/DiscoverJobs.tsx`, `opportunities-api.ts` | Local form state; explicit POST `/api/v1/opportunities/discover`; sends location, stacks, workMode, seniority. Displays counts/errors and View Job Inbox. No persistent candidate state. |
| `apps/api/src/opportunities/opportunities.controller.ts` — `discover`, `localWrite`, `OpportunityErrors` | Validates local write origin/host, delegates to DiscoveryService, returns no-store responses and safe errors. Owner is server-selected, not request-provided. |
| `apps/api/src/discovery/discovery.service.ts` — `discover` | Validates filters; process-local active flag returns 409 for overlapping calls in that instance; reads sources sequentially, collects failures, normalizes, ranks, then calls `OpportunitiesService.importDiscovered`. |
| `apps/api/src/discovery/greenhouse.source.ts` | Fixed Axon and Backbase Greenhouse boards, no user-supplied destinations or redirects. Validates positive numeric source ID, title, bounded content and allowed HTTPS Greenhouse job URL. Invalid rows are omitted and counted. Plain-text description and source-derived skills/metadata are retained. |
| `apps/api/src/discovery/discovery.ts` | Stack OR eligibility; explicit foreign locations excluded; unknown/global/remote eligibility retained. Location/work mode/seniority rank locally. Rank descending then title determines import order. Contains `normalizedUrl`, `folded`, `duplicateJob`. |
| `apps/api/src/opportunities/opportunities.service.ts` — `importDiscovered` | Owner-scoped transaction and advisory lock; reads existing opportunities, skips duplicates, inserts at most 50 new jobs with status SAVED and source Website; returns imported IDs/count, duplicates, remaining. Does not modify existing jobs. |
| `opportunity.entity.ts`, `database/migrations/1793510000000-JobDiscovery.ts` | Discovery attribution is nullable JSONB on Inbox records, not a separate queue. Includes source name/ID/feed URL, discovery timestamp, technology/requirements metadata. |

Other side effects and bounds to retain:

- Greenhouse responses are cached **in process** for five minutes. Attempts set a five-minute cooldown; 429/503 Retry-After can extend it. Each feed has a 15-second abort deadline, 16 MiB response limit and at most 5,000 rows. These are not persistent caches or global cross-process rate limits.
- One failed source does not discard valid results from the other. Both failing can return a successful HTTP response with zero results and source errors. Database failure rolls back the whole import transaction; it is not a source-level partial success.
- `found` currently counts ranked rows before deduplication; `remaining` counts eligible unsaved rows after the 50-insert budget. Repeating discovery can import another batch from cached results.
- Opportunity inserts change Inbox counts/order. They contain no uploaded document, no AI output and no application/contact activity. No AI or external application submission occurs in discovery.
- The present lock coordinates discovery writes only. Manual `create` checks normalized URLs then inserts without that lock; `update` does not check duplicates. No unique normalized-URL constraint exists. Do not describe current writes as globally race-safe.

## 2. Recommended minimum storage and module boundary

Add one table, `ai_job_hunter.discovery_candidates`, owned by discovery. Keep Inbox `opportunities` and its statuses unchanged. No run-history table, worker, scheduler, shared browser entity, or new dependency.

| Column | Proposed type / purpose |
| --- | --- |
| `id` | UUID primary key, generated as existing entities are |
| `ownerId` | UUID, server-selected local owner |
| `sourceKey` | Bounded text stable key: `greenhouse:axon` or `greenhouse:workatbackbase`; independent of display labels |
| `sourceJobId` | Bounded nonempty text; current adapters emit positive integer strings |
| `status` | varchar with CHECK: NEW, SEEN, SAVED, DISMISSED; default NEW |
| `snapshot` | JSONB containing bounded validated `DiscoveredJob` fields and attribution, rendered only as text; application validation on writes, DB object check |
| `firstSeenAt`, `lastSeenAt` | timestamptz; first retained, last updated monotonically on eligible rescan |
| `updatedAt` | timestamptz for snapshot/status/link changes; not queue sort priority |
| `opportunityId` | Nullable UUID FK to opportunities, ON DELETE RESTRICT; many candidates may link to one Inbox job |

Constraints/indexes: unique `(ownerId, sourceKey, sourceJobId)`; CHECK `lastSeenAt >= firstSeenAt`; CHECK `(status = 'SAVED') = (opportunityId IS NOT NULL)`; queue index `(ownerId, status, firstSeenAt DESC, id)`. A simple FK plus owner-scoped service lookup enforces the link in this single-owner app; cross-owner link rejection must be tested. No unique opportunityId: equivalent source listings may share an existing job. No URL or company/title unique constraint.

JSONB avoids duplicating every import field into a second relational schema; fields used for identity/filter/sort remain explicit columns. Add a read DTO, not an ORM entity export. Validate snapshot lengths with current source/import bounds before persistence and again when creating an opportunity. Persist the initial snapshot in MVP; rescans update **only lastSeenAt**. This avoids silently changing content a user already reviewed. A future explicit refresh can replace snapshots without resetting review state; not part of this MVP.

Create a small DiscoveryModule for its entity, service and controller. Export the necessary OpportunitiesService operation from OpportunitiesModule; DiscoveryModule imports it, never the reverse. Move discovery provider ownership out of OpportunitiesModule. The existing pure discovery identity functions can remain backend-only imports; no generic repository layer. Extract the concrete local-write/error boundary for reuse if moving controllers requires it. Register the entity and migration explicitly in `database/database.config.ts` (currently an explicit entity/migration list).

## 3. Identity, URLs, deduplication and existing Inbox jobs

**Candidate identity is the board key + provider job ID, scoped to owner.** Collapse repeated identical keys within a response before allocating the insertion budget. The first ranked occurrence supplies the initial snapshot. A rescan of an existing key, regardless of state, changes lastSeenAt only. NEW stays NEW. A changed title, location or URL must not reset state or create another candidate with that key.

Exact missing/unstable URL policy:

| Input | MVP handling |
| --- | --- |
| Missing, invalid or unsafe URL, even with stable ID | Keep current Greenhouse rejection/invalid-row count. Do not create a URL-less candidate or invent a URL. |
| Missing/invalid provider ID, even with safe URL | Keep current rejection. No title/company fingerprint fallback. |
| Same source ID with changed valid URL/tracking parameters | Same candidate, lastSeenAt updated; original snapshot/link retained. Warn in documentation that links are snapshots, not verified-live URLs. No fetch solely to resolve redirects. |
| New provider ID with same normalized URL | Separate source candidate; Save resolves against existing Inbox records. |
| New ID and changed URL but same company/title/location | Separate candidate; existing heuristic can identify a possible Inbox match at Save, subject to ambiguity rules below. No automatic merging of queue review states. |
| Same ID on a different board | Separate candidate. Source identity is namespaced, not a global numeric ID. |

This deliberately separates **queue identity** from **Inbox duplicate matching**. Reusing `duplicateJob` as a unique candidate key would conflate different openings and cannot consistently represent several source IDs in one row. A true cross-source canonical candidate would require aliases/merge policy beyond this minimum design. Approval is needed for the resulting visible separate source listings; sources, eligibility, ranking and the 50-new-row cap otherwise remain unchanged.

Safely reuse `normalizedUrl` for already-validated source URLs: it strips hash, `www.`, trailing slash and selected tracking parameters (`utm_*`, gh_src, source, ref, src), sorts other parameters, and ignores scheme. It is an equality helper, **not a URL safety validator**; it also omits ports and does not establish equivalence between the two Greenhouse hostnames. Do not broaden it globally or use it for SSRF validation. Reuse `folded`/HCMC normalization only as a matching heuristic; title/company/location is not a durable identity.

Recommended Save matching, under the write lock:

1. If already linked, return that opportunity unchanged, even if its title/URL/status has since been edited.
2. Otherwise seek same-owner opportunity by exact mapped source identity, then normalized URL, then the current company/title/location heuristic. For each tier: one match links it; multiple matches return 409 `AMBIGUOUS_INBOX_MATCH` with safe same-owner IDs/titles and no mutation. Do not choose arbitrarily or create another duplicate. Stop at the strongest tier with matches.
3. No match: create a new opportunity using the current validated discovery-to-job mapping, then link it and mark the candidate SAVED in the same transaction.

A unique heuristic match still risks linking a distinct opening. Retaining it preserves current discovery duplicate policy, but its automatic-link behavior needs approval. A safer alternative is a 409 possible-match warning requiring a later explicit choice; that would add a resolution interaction to MVP.

Existing Inbox records are never moved, overwritten or demoted. New candidates start NEW even when their listing already exists in Inbox: explicit Save can return `linked_existing`, meaning “Already in Inbox,” without creating or updating a job. This distinguishes user queue review from inferred duplicate status. No backfill is recommended initially; historical discovered jobs remain in Inbox and get candidates only if encountered in a later eligible scan.

## 4. States and explicit actions

| Current state | Mark as seen | Dismiss | Save to Inbox |
| --- | --- | --- | --- |
| NEW | SEEN | DISMISSED | Atomic create/link → SAVED |
| SEEN | No-op SEEN | DISMISSED | Atomic create/link → SAVED |
| DISMISSED | 409 invalid transition | No-op DISMISSED | Explicit save allowed → SAVED |
| SAVED | 409 invalid transition | 409 invalid transition | Return original link, no-op |

GET/list/opening details, refresh, pagination, source-site opening and rescan never mark SEEN. No “mark new,” undismiss, bulk transition or hard-delete operation in MVP. Allowing explicit save from Dismissed is the proposed minimal recovery path and needs approval. SAVED is queue linkage, not the opportunity's application status; an Inbox job may later be APPLIED/CLOSED without changing its candidate.

## 5. Proposed API contracts

All paths below are under `/api/v1`; use JSON, UUID validation, bounded enum/query parsing, owner scope, local-write checks on mutations, no-store responses and safe errors. Bodies reject unknown fields. Clients cannot supply owner, snapshot, source ID or opportunityId when saving/updating state.

| Endpoint | Request | Response / semantics |
| --- | --- | --- |
| `POST /discovery/runs` | Existing `{location, stacks, workMode, seniority}` unchanged | 200 `{found, added, refreshed, remaining, errors: string[], scannedAt, scope}`. Queue writes only; no imported IDs or Inbox counts. |
| `GET /discovery/candidates?filter=to-review&page=1` | filter: to-review/new/seen/saved/dismissed/all; positive safe integer page; fixed size 10 | 200 `{items, page, pageSize:10, total, totalPages}`. No source fetch and no mutation. |
| `GET /discovery/candidates/:id` | UUID | 200 full candidate DTO for review; 404 absent/other owner. |
| `PATCH /discovery/candidates/:id/status` | `{status:'SEEN'\|'DISMISSED'}` | 200 current candidate DTO, including no-op retry; 409 invalid transition. SAVED cannot be set here. |
| `POST /discovery/candidates/:id/save` | Empty body | 200 `{candidateId, status:'SAVED', opportunityId, outcome:'created'\|'linked_existing'\|'already_saved'}` on first call and repeats. Link is `/jobs/:opportunityId`. |

List DTO: id, status, title, company, location, workMode, seniority, originalLink, sourceName, firstSeenAt, lastSeenAt, opportunityId. Detail adds full plain-text description, skills/preferredSkills and source attribution. Review is read-only in this minimum version; edits remain available on the saved Inbox record. Do not route candidate review through the existing Add Job create endpoint: it would bypass atomic linking/idempotency.

Run counts are defined over **distinct eligible source identities**: `found = added + refreshed + remaining`. `added <= 50`; refreshed includes NEW/SEEN/SAVED/DISMISSED identities already queued; remaining counts valid eligible new identities left after the cap. Invalid rows/source failures remain messages outside found. Process all existing identities for timestamp refresh even after reaching 50 inserts. Use the existing rank order to choose new candidates. No cap on timestamp-only refreshes; this does not increase the 50-new-job budget. A repeated run can enqueue the next 50.

`lastSeenAt` means “included in an eligible scan,” including cached responses, not “freshly checked on the live website.” Missing-from-feed or filtered-out candidates persist unchanged; no expiry inference on partial failures. `scannedAt` is scan start time; use GREATEST for updates to prevent an older concurrent run from moving lastSeenAt backwards.

Errors: 400 invalid input; 404 unknown owner-scoped candidate; 409 run-busy/state conflict/ambiguous match with stable safe code; 503 storage unavailable, retry safely. A source failure remains a partial-success 200 with errors. A DB failure rolls back all queue mutations for that run. No false “saved” state on a failed save.

## 6. Pagination, filter and UI behavior

- Server default To review selects NEW and SEEN, ordered NEW first, then SEEN; within each state use `firstSeenAt DESC, id ASC`. Rescans do not reorder the queue.
- New/Seen/Saved/Dismissed select only that state, ordered `firstSeenAt DESC, id ASC`. All includes every state, using that same chronological order without state grouping.
- Fixed page size 10; totalPages is zero when empty. Use a short read-only REPEATABLE READ transaction for count and slice consistency. Clamp requested page to the last available page (empty: page 1), and return the effective page. Offset pagination is sufficient for local MVP; cross-request concurrent mutations can shift pages, so it is not a frozen snapshot.
- Store filter/page in `/discover` search parameters using current React Router conventions. Reload reconstructs the view; Back/Forward restores parameters. Candidate detail can use a candidate query parameter while preserving filter/page. No new state library.
- On discovery completion refetch the selected queue page; show added/refreshed/remaining/errors. Keep the user on Discover and explain that jobs await explicit Save. Existing queue stays available when one/all sources fail. Filter changes select page 1. Mutations refetch the current page and accept server clamping; no automatic scrolling or global Inbox redesign.
- Reuse PageHeader, outlined white surfaces, responsive discovery form, status text, labelled filters and bottom pagination. Give explicit row/detail Save, Dismiss and Mark as seen actions, per-item busy states, retained context on failure and “Open Inbox job” after Save. No implied Review & Save wizard and no auto-SEEN on detail opening.

## 7. Transactions and concurrent writes

Keep network fetch/normalization **outside** DB transactions. Retain the process-local busy flag for UI feedback, but do not rely on it for correctness.

Use one owner-scoped PostgreSQL transaction advisory lock for all identity-affecting writes (queue ingest, save, status actions, manual opportunity create/update). A short owner-wide lock is simpler for this local app than per-URL locks, particularly for URL-less jobs, heuristic matching and URL edits. Acquire it before candidate row locks, consistently everywhere. Unique source identity is a second DB safeguard.

- Ingest transaction: acquire lock, resolve existing keys, update only lastSeenAt, insert up to 50, commit counts together. Overlapping runs serialize persistence and cannot reset status or double-insert one source identity. Each run retains its own 50-row budget, not a global daily budget. Cross-process feed fetches may still overlap because the existing cache is per process.
- Save transaction: acquire same lock, select candidate FOR UPDATE, inspect status/link, call an exported transaction-aware OpportunitiesService create-or-find operation, then set opportunityId/status. The exported operation uses the supplied manager, owns job validation/matching/insertion, and never opens a nested independent transaction. Discovery must not directly mutate the Opportunity repository.
- Double-clicks and retries after a lost response return the same opportunityId. A transaction error rolls back both job and link. A dismiss/save race serializes; save after dismiss is allowed; dismiss after save returns 409.
- Manual creation must take the same lock around existing URL check + insert. Manual update must take it around its write, with its existing validation behavior preserved. This prevents manual create racing candidate Save; it does not promise to remove legacy duplicates or stop an explicit manual edit from making two existing URLs equal. Those remain ambiguity cases.
- Do parsing/AI-free preparation before the lock; do not hold it during document parsing, external fetching or user review. Preserve the configured 10-second statement timeout and release via transaction completion. No database-wide lock, new pool or infrastructure.

## 8. Migration, compatibility and rollout

1. Add a new explicit reversible migration after `1793600000000-ApplicationDetails`. Create only candidate table, constraints, indexes and FK. Do not rewrite previous migrations, existing jobs, attribution or application history. Register entity/migration in both runtime and CLI configuration via the existing shared databaseOptions. Keep synchronize/migrationsRun false.
2. Start with an empty queue. Do not fabricate historic review states or move old auto-imported jobs. The first scan can expose an already-saved listing as NEW; explain that Save reuses the existing record. Backfilling historical rows as SAVED is an optional separately approved data migration, complicated by duplicate/incomplete legacy metadata.
3. Deploy schema, then coordinated API/frontend changes. Use a new run endpoint to avoid silently changing the old response semantics. Disable old `POST /opportunities/discover` with 410 and a reload/use-new-page message when queue mode becomes available. Never leave an old route that still inserts Inbox jobs. Do not alias `added` to `imported` for stale clients. Keep all non-discovery opportunity routes compatible.
4. Remove the now-unused auto-import route/service call and update copy/tests/docs in the same functional rollout. A stale P5.2 tab should get a safe actionable failure rather than auto-save. No mixed-version deployment is supported for this local MVP.
5. Rollback: disable discovery writes and restore compatible application code without re-enabling automatic Inbox insertion. Keep candidate data/table for recovery. The migration down drops candidate storage only and is destructive to queue history; run it only with explicit authorization and a backup/export plan. It must never delete linked Inbox jobs. Reverting an empty synthetic test table is separate from authorization to drop real queue data.

Existing DB configuration refuses development/production targets for integration tests (`database.config.ts`), and migrations support source/compiled entry points via `scripts/migrate.mjs`. No migration or data access was executed for this design.

## 9. Small implementation checkpoints and verification plan

Each step requires its own approval; avoid exposing a partially wired auto-save workflow.

1. **Persistence foundation:** entity, schema migration, identity/state validators and queue query service. Focused unit/integration tests for unique keys, constraints, filters, stable ordering, page size/clamping, owner scoping and persistence after reconnect. Verify TS and compiled JS migration apply/revert/reapply/repeat-run against the isolated test DB, preserving existing Inbox fixtures. Compilation here is justified by migration verification.
2. **Queue ingestion and atomic actions:** reuse source fetching/ranking, implement upsert/limits, status and transactional Save through OpportunitiesService; coordinate manual write locks. Test repeated/concurrent scans, timestamp monotonicity, all four states across rescans, 50 + remaining then next run, mixed invalid rows, cache/cooldown and partial-source failure. Test same-candidate concurrent saves, two candidate identities sharing a job, manual-create race, lost-response retry, rollback between insert/link, ambiguous legacy matches and unchanged existing job fields.
3. **Discover queue UI and coordinated cutover:** page/list/detail/actions and query parameters; switch endpoint/copy and retire old auto-import route. Focused frontend tests for default/filter counts, server page requests, read-only review, explicit transitions, busy/error/retry, reload/history and no Inbox mutation before Save. Preserve Inbox tests. Update README/architecture. Run affected-package typechecks and diff checks; do not default to full suites.

Browser acceptance after implementation, with synthetic public fixtures and available environment:

- Discover creates queue entries but leaves Inbox unchanged; reload and repeat scan retain candidates/states.
- NEW precedes SEEN; opening details alone changes neither. Explicit Mark as seen, Dismiss and Save update the expected filters.
- Save double-click/retry yields one linked Inbox job; existing-job reuse preserves edits/tracker fields; Open Inbox job reaches the correct detail.
- At least 11 entries exercise pagination; removal of the last row clamps the page; filters/Back/Forward/reload preserve parameters.
- Partial/all-source failure retains queue; failed mutation retains actionable row/details; delayed requests do not apply a stale response to a newer filter.
- Keyboard actions, status announcements, narrow layout and 200% zoom; no unexpected scroll jumps; accepted Inbox list remains intact.

These are planned checks, not passing results. Existing relevant tests: `apps/api/test/unit/discovery.spec.ts`, `apps/api/test/integration/discovery.spec.ts`, and `apps/web/test/{discovery,app,follow-ups}.test.tsx`. Current integration assertions that discovery inserts opportunities must change; keep source normalization, limits, dedupe helpers and preservation fixtures as regression coverage.

## 10. Decisions for review and remaining risks

Recommended defaults needing approval before implementation:

1. **Source-listing queue identity**, not cross-source canonical merging; unchanged 50 limit applies to distinct new candidate rows. This may expose equivalent listings separately while Save still avoids an extra Inbox job.
2. **Immutable initial snapshot**, timestamp-only rescans; reject missing/unsafe URLs and missing provider IDs as today. Stale links/content need a future explicit refresh policy, not invented identity.
3. **No historical backfill; explicit Save links existing Inbox jobs.** Retain the existing heuristic only when it yields one match; return a conflict for multiple matches. Decide whether even one heuristic match requires confirmation instead.
4. **Read-only review and save-from-Dismissed**, with no reopen-to-NEW/SEEN action in MVP. If pre-save editing or undismiss is required, specify it before implementing transitions/contracts.
5. **Coordinated endpoint cutover**, returning 410 to old discovery clients; shared write lock added to manual job creation/update for Save concurrency safety.

Main risks: false positives in company/title/location matching; provider ID reuse/changes; initial snapshots becoming stale; offset pages shifting between requests; owner-wide lock contention as the local data set grows; per-process cache behavior under multiple API processes. Current in-memory matching scans all owner jobs; acceptable as a minimal continuation of existing behavior, but measure before adding indexes/identity tables or claiming scale guarantees. No live-feed or database-content audit was performed, so prevalence of legacy duplicates is unknown.

## Verification of this audit

Read AGENTS.md, UX guidelines, P5.1 audit, current P5.2 frontend, discovery source/service/helpers, opportunity controller/service/entity/module, AppModule, database configuration/migrations, migration runner and relevant test definitions. Read-only shell inspections used `cat`, `sed`, `rg` and Git status/branch. No tests, builds, migrations, browser journeys, network discovery, Ollama or private-data processing ran. Only this design document was added; existing modified and untracked P5.2/P5.1 files were preserved. No commit, push, PR, worktree or database was created.
