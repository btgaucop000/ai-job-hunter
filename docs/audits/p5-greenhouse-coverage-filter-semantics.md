# P5.3A — Greenhouse coverage and discovery filter semantics

Date: 2026-11-04 (public API verification approximately 03:16 UTC).
Branch: `feat/p5-discover-page`. Audit/design only; implementation requires approval.

## 1. Scope and evidence

Read AGENTS.md, UX guidelines, [P5.1 UX audit](p5-job-discovery-import-ux.md),
[P5.2 queue design](p5-discovery-queue-design.md), and current implementation.
There is no separate prior filter audit. P5.1 “Existing strengths and boundaries”
and P5.2 architecture/count definitions already describe any-stack matching,
soft preferences, and persistent identity; this report extends those findings.
Their historical direct-import descriptions are superseded by P5.2d–f: discovery
now queues candidates, explicit Save creates/links Inbox jobs, and the legacy
route returns 410. Current implementation, not historical proposed Save rules,
is authoritative (heuristic-only matches require confirmation).

Evidence is code inspection plus public, unauthenticated GET requests. No local
run endpoint, Inbox/queue database, private CV, or browser session was used.
Public JSON snapshots were temporarily retained under `/tmp/p53-*.json`. A read-only
Node probe applied the existing compiled `normalizeGreenhouse` and `rankJob`
functions to them. Their emitted JavaScript and the requirement-line helper were
checked against in-memory transpilation of current TypeScript and matched.
No build, test suite, migration, application mutation, or infrastructure setup ran.
Live listings are point-in-time evidence, not a promise of continued availability.

## 2. Current request and ingestion path

References below are repository-relative, with function names where useful.

| Stage            | Code reference                                                                  | Confirmed behavior                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controls/request | `apps/web/src/features/inbox/DiscoverJobs.tsx:20` and `:41`; `discovery-api.ts` | Hardcoded local defaults; POST `/api/v1/discovery/runs` with `{location, stacks, workMode, seniority}`. No source selection or CV lookup. Preferences are editable but reset on remount; queue data persists independently.                                                                                                                                                                                         |
| Boundary         | `apps/api/src/discovery/discovery.controller.ts`, `discovery.ts:28`             | Server-selected owner, local-write protection, no-store; rejects extra request fields, unsupported enums, empty or >4 stacks. Duplicate stack entries are allowed but add no matching weight.                                                                                                                                                                                                                       |
| Sources          | `greenhouse.source.ts:4`, `:16`, `:175`                                         | Exactly Axon and Backbase; fixed URLs including `?content=true`; source key is resolved by exact configured source URL. No external query receives the preferences.                                                                                                                                                                                                                                                 |
| Fetch/cache      | `greenhouse.source.ts:172`                                                      | In-process URL-keyed five-minute successful-payload cache; cache hit precedes cooldown check. Five-minute cooldown starts before fetch, including failures; 429/503 Retry-After can extend it. No background refresh, redirects, or caller-controlled URL. 15-second timeout, 16 MiB response limit, fatal UTF-8/JSON decoding.                                                                                     |
| Normalize        | `greenhouse.source.ts:61`                                                       | Max 5,000 feed rows; positive safe integer post ID, title, nonempty content and allowed HTTPS Greenhouse job URL required. Reject malformed/oversized rows. Decode HTML entities, remove script/style/markup, bound plain description to 26,000 characters. Company can be blank; location is a bounded free-text string. Work mode and seniority are heuristically inferred, not authoritative structured filters. |
| Scan/rank        | `discovery.service.ts:39`; `discovery.ts:71`                                    | Fetch boards sequentially; each failure becomes a safe error message, other sources continue. Normalize, evaluate eligibility/score, sort score descending then title. Invalid-row warnings and unavailable-source errors share `errors`. Successfully parsed but malformed feed payloads can remain cached until expiry.                                                                                           |
| Queue            | `discovery-queue-actions.service.ts:32`                                         | Validate bounded snapshot; dedupe by sourceKey + post ID, owner-scoped in storage. Fetch outside transaction, then owner advisory lock. Insert at most 50 new candidates; existing identities consume no insertion budget and refresh only lastSeenAt, including SAVED/DISMISSED. Snapshot/status/link remain unchanged.                                                                                            |
| Summary/display  | Same service `:100`; `DiscoverJobs.tsx`; `DiscoveryQueue.tsx`                   | `found` means distinct eligible identities, not all fetched jobs. `found = added + refreshed + remaining`. Snackbar reports counts; Run details preserves errors/scope/cache guidance. Queue GET is separate and is not filtered by the discovery request.                                                                                                                                                          |
| Queue ordering   | `discovery-queue.service.ts:51`                                                 | To review: NEW before SEEN, then firstSeenAt descending and ID ascending; other filters date/ID. Ten per page. Discovery score is not stored or used to sort the queue.                                                                                                                                                                                                                                             |

Normalization limits also include title/company 300 characters, URL 2,048,
location 2,000, raw content 150,000, skills/preferred skills 10,000 each;
`discovery-candidate.validation.ts` enforces a 512 KiB bounded snapshot.
Unsupported source identity or snapshot validation failure aborts the run; these
are not isolated per-row ingestion warnings. Persistence failures roll back the
run. Existing Inbox matches do not prevent NEW queue insertion. Explicit Save's
exact matching and possible-duplicate confirmation remain outside this audit's
proposed changes.

## 3. Current preference semantics

All UI/API option sets and defaults below are hardcoded, user-editable for a run,
and **not CV-derived**. No field searches additional companies or changes the
public GET URL. Missing values in the request are invalid; “unknown” below refers
to source metadata.

| Field      | UI/API values; default                               | Eligibility versus ranking                                                                                                                                                                                                                                                                                                                                                | Unknown handling and caveats                                                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location   | Ho Chi Minh City, Vietnam; HCMC default              | Choice affects score only. Independently, a fixed geographic gate accepts recognized Vietnam/HCMC/Hanoi/Da Nang, empty location, exact Remote/Anywhere/Worldwide/Global, or any location containing anywhere/worldwide/global. Other nonempty locations are rejected. HCMC choice adds 8 for local, 2 for missing location; Vietnam choice adds 8 for recognized Vietnam. | No All option. Country-only Vietnam remains eligible under HCMC. Other Vietnamese cities without country text can be lost. `Remote - US` is rejected even if workMode is Remote. Broad `global` text can produce false geographic acceptance; remote does not prove Vietnam eligibility.                                                 |
| Tech stack | Java, Spring Boot, Node.js, React; all four selected | Hard OR filter: at least one selected regex must match title + required-skills text + full description. No score increase for more matches. Java also matches Spring Boot; Node.js recognizes NodeJS/NestJS and certain Node backend phrases; React includes ReactJS.                                                                                                     | No Any-stack bypass. No supported evidence means exclusion. Full description includes preferred, incidental, or negated mentions; this is a keyword match, not a required-skill guarantee. `supportedStacks` stores literal Java evidence separately, so Spring Boot may match Java search without displaying Java in the snapshot tags. |
| Work mode  | All, Onsite, Hybrid, Remote; All default             | Never excludes. Selected exact mode adds 5; unknown adds 1; known mismatch adds 0. All adds 3 to HCMC Onsite/Hybrid, so it is not a neutral ranking choice.                                                                                                                                                                                                               | Empty survives. Inference recognizes specific phrases and location Remote; Hybrid has precedence. Flexible work/benefits wording is not reliable evidence.                                                                                                                                                                               |
| Seniority  | Senior, Technical Lead, All; Senior default          | Never excludes. Exact match adds 5; Senior also gives Technical Lead 5; unknown adds 1. All contributes no score.                                                                                                                                                                                                                                                         | Normalizer can produce Junior, Intern, Mid-level although UI cannot select them. Title first, then description role phrases. Staff/Principal and years alone may remain unknown. Description mentions of other roles can misclassify the opening.                                                                                        |

### Why the same eight recur

The live two-board snapshot contained **543 fetched/normalized posts, zero invalid
rows, and eight eligible identities** with all four stacks: Axon 6 + Backbase 2.
All 24 combinations of 2 locations × 4 work modes × 3 seniorities returned the
same eligible ID set (eligibility is independent of those choices). With a single
stack selected: Java 8, Spring Boot 0, Node.js 0, React 0. Thus retaining Java
while changing the other selected stacks also preserves these eight today.
These are source-snapshot observations, not counts read from the user's database.

Concrete code examples:

- An HCMC Java/Hybrid/Senior role scores 26 for HCMC/All/Senior and 23 for
  HCMC/Remote/Senior; it remains eligible despite the Remote preference.
- A Hanoi Java role remains eligible under HCMC; only its location bonus changes.
- An unknown-location Java role remains eligible, whereas an unknown-stack role
  is excluded. “Unknown metadata stays eligible” is not true for every field.
- The same listing on a cached scan is “refreshed,” not newly queued. If all eight
  already exist, a successful unchanged run is found 8 / added 0 / refreshed 8 /
  remaining 0, regardless of their review states.
- Rescans never alter firstSeenAt or status. Even if rank changes, the queue stays
  date/status ordered. For candidates inserted together firstSeenAt is identical;
  ID tie-breaking does not preserve rank. Ranking primarily chooses which **new**
  identities enter when more than 50 are eligible, rather than reordering this UI.

## 4. Verified source coverage

Greenhouse documents public unauthenticated GET access, per-board job listing,
and `content=true`; post `id` is distinct from `internal_job_id`. Keep using the
post ID as current identity. See [official Job Board API documentation](https://docs.greenhouse.io/job-board).
There is no global search in the integration: more coverage requires curated boards.

Every API below was directly requested on **2026-11-04**, returned HTTP 200 and
valid JSON, and normalized without invalid rows. Counts are entire-board totals;
Vietnam-location rows are a location-text inspection, not eligible engineering
counts. Each named example was present in that live API response.

| Company / token / evidence                                                            | API and observed counts                                                                                                                         | Relevant example and quality concerns                                                                                                                                                                                                                                                                                                                                                                                                         | Recommendation                                                                                     |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Axon — `axon`; [board](https://job-boards.greenhouse.io/axon)                         | [API](https://boards-api.greenhouse.io/v1/boards/axon/jobs?content=true): 481 posts; 21 Vietnam-location rows; 6 eligible with current defaults | [Backend Software Engineer, 7806690003](https://job-boards.greenhouse.io/axon/jobs/7806690003), HCMC. City/state/country repeats HCMC. Current description heuristic classified this title as Junior; not an authoritative level. Global board contains many non-software roles.                                                                                                                                                              | **Include/retain** unchanged key `greenhouse:axon`.                                                |
| Backbase — `workatbackbase`; [board](https://job-boards.greenhouse.io/workatbackbase) | [API](https://boards-api.greenhouse.io/v1/boards/workatbackbase/jobs?content=true): 62 posts; 3 Vietnam-location rows; 2 eligible               | [Senior AI Applied Software Engineer, 8207480](https://job-boards.greenhouse.io/workatbackbase/jobs/8207480), “Ho Chi Minh”; [Senior SDET, 8068927](https://job-boards.greenhouse.io/workatbackbase/jobs/8068927), “Ho Chi Minh City”. Inconsistent city names; work mode unknown for SDET under current parser.                                                                                                                              | **Include/retain** `greenhouse:workatbackbase`.                                                    |
| Temus — `temus`; [board](https://job-boards.greenhouse.io/temus)                      | [API](https://boards-api.greenhouse.io/v1/boards/temus/jobs?content=true): 46 posts; 5 Vietnam-location rows; 1 eligible                        | [Full Stack AI Engineer I Vietnam, 5421659008](https://job-boards.greenhouse.io/temus/jobs/5421659008), location Vietnam. No confirmed HCMC location; work mode/level remain unknown under current parser. Other Vietnam roles include data engineering and contracts.                                                                                                                                                                        | **Include** as a Vietnam source, not advertised as HCMC-confirmed.                                 |
| Go1 Vietnam — `go1vn`; [board](https://job-boards.greenhouse.io/go1vn)                | [API](https://boards-api.greenhouse.io/v1/boards/go1vn/jobs?content=true): 2 posts; 2 Vietnam-location rows; 1 eligible                         | [Developer, 4745814005](https://job-boards.greenhouse.io/go1vn/jobs/4745814005), Vietnam; [Engineering Manager, 4746940005](https://job-boards.greenhouse.io/go1vn/jobs/4746940005), Vietnam - Remote. Developer mentions NodeJS/React; its inferred level/mode are unknown. Board heading says Go1 Australia despite Vietnam branding and API company Go1 Vietnam: use verified registry name and row location, not heading-based geography. | **Include**; do not add guessed Go1 aliases or another board for the same employer.                |
| Aperia — `aperiasolutions`; [board](https://job-boards.greenhouse.io/aperiasolutions) | [API](https://boards-api.greenhouse.io/v1/boards/aperiasolutions/jobs?content=true): 3 posts; 1 Vietnam-location row; 0 eligible                | [.NET Developer (Azure, Microsoft Copilot Studio), 5280907007](https://job-boards.greenhouse.io/aperiasolutions/jobs/5280907007), combined Danang/HCMC location. Genuine engineering opening, but no current supported-stack match.                                                                                                                                                                                                           | **Defer** activation; verified candidate for future stack scope, not a promised coverage gain now. |

Search results contained an older Aperia Java/React opening and larger board
counts; the live board/API did not corroborate it. It is deliberately not listed
as a current opening. No speculative tokens are proposed. All five snapshots had
company names and Greenhouse-hosted job URLs, but that is not a provider guarantee.

Recommended initial expansion is **four active boards total** (retain two, add
Temus and Go1 Vietnam). On this snapshot that is 591 fetched posts and ten eligible
identities, only two more than current coverage. It is a small verified gain,
not comprehensive Vietnam/HCMC coverage. HCMC-only new coverage remains uncertain.

## 5. Defects, limitations, and misunderstandings

| Classification                | Finding / action                                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirmed feedback defect     | Backend scope says filters rank locally and unknown metadata stays eligible, without identifying the hard stack/geography gates. Frontend says preferences rank results, but queue order is independent. Make the boundary and cap-selection effect explicit.                                  |
| Confirmed transparency gap    | No fetched/normalized/excluded totals; `errors.length` conflates source failures with omitted-listing warnings. Refreshed can mean cached encounter, not newly fetched or changed content. Add accurate stage counts and cache provenance.                                                     |
| Expected behavior             | Eight repeated candidates, retained SAVED/DISMISSED states, cached feeds, unchanged queue ordering, and no auto-save are consistent with implementation. No evidence of a broken filter request or duplicate ingestion from this audit.                                                        |
| Product limitation            | Two boards; four stack tokens; no CV-derived defaults, user-managed sources, required-only stack semantics, or strict preference mode. Keyword matching is not an engineering-role classifier. Broader company coverage alone will not cover Python/.NET-only roles.                           |
| Heuristic quality risk        | Location gate misses unrecognized local aliases and excludes restricted remote regions; broad global text may overinclude. Seniority/work-mode inference can misclassify. These are deterministic edge cases, not quantified prevalence or proof of a specific user-visible misclassification. |
| Intentional safety limitation | Non-Greenhouse/custom-domain job URLs are omitted even though Greenhouse supports custom career URLs. Do not weaken URL protections as part of adding these compatible boards.                                                                                                                 |

## 6. Recommended minimal design

### Curated static registry, not source-management infrastructure

Use one backend-owned typed registry `{key, token, displayName, enabled}`; derive
the canonical API URL from the token and fixed HTTPS API host. Static configuration
is versioned and reviewed; enabling/disabling requires a code/config change and
restart. Do not add database tables, source-management UI, arbitrary URLs, or
request-supplied board tokens. Database-backed management introduces migrations,
authorization and operational state without a demonstrated local-app need.

Validate token syntax, unique canonical token, unique key, bounded board count
(initial maximum five), and nonempty bounded display names at startup. Reject
duplicate tokens rather than fetching twice. Preserve existing keys, URLs and
names exactly; new keys are `greenhouse:temus` and `greenhouse:go1vn`.
Keep disabled entries resolvable for historical candidate Save/source matching;
only the scan's active list changes. Disabling a source never deletes candidates.
A token rename requires a deliberate compatibility decision, not an automatic
new key or company/title merge. `discoverySourceKey` currently depends on exact
sourceUrl; configuration must retain historical canonical URL mappings.

Keep the 15-second/16 MiB/5,000-row guards and five-minute cache/cooldown per source.
For four boards, sequential worst-case fetch time becomes roughly 60 seconds;
recommend at most two concurrent source reads, with results aggregated in registry
order and a source-key/post-ID final rank tie-breaker. No retries in the same run,
no scheduler. Warm-cache scans issue zero feed requests; cold scans issue at most
one per active board per process. Cache is not shared across restarts/processes.
An unavailable source must not discard healthy results or existing queue entries.
Retain the 50-new-candidate cap: adequate for the measured ten eligible posts;
known candidates still refresh after the cap and remaining means eligible new
identities not inserted. Report a source's failed status rather than treating it
as an empty successful feed. Do not infer job closure from absence.

### Explicit eligibility versus preference matrix

Smallest safe MVP keeps current eligibility, renames/explains controls, and avoids
silent tightening. Strict modes and broad stack expansion are separate decisions.

| Field                  | Recommended MVP semantics / All behavior                                                                                                                                                                                                 | Unknown policy                                                                                 | Minimal wording                                                                                | Should counts change?                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Location               | Ranking preference inside the existing disclosed Vietnam/unspecified/global-remote scope. HCMC vs Vietnam preserved. No new All in first checkpoint; any later “Any in scope” adds no location bonus and does not mean worldwide search. | Keep currently eligible unknown/country-only rows. Explain remote eligibility is unverified.   | “Preferred location”; “Vietnam scope; unknown/global remote locations included.”               | No, changing the preference alone should not.              |
| Tech stack             | Hard match-any keyword filter; keep four choices/defaults and nonempty validation. Java includes Spring Boot as today. All four selected means OR, not no filter. An explicit Any-stack bypass would broaden role scope and is deferred. | Without keyword evidence, exclude and count as stack-excluded; never infer from CV or company. | “Must mention any selected stack”; “Matches title or description, including preferred skills.” | May change; shared evidence can produce identical sets.    |
| Work mode              | Ranking preference only. Preserve the current All/HCMC onsite-hybrid bonus for compatibility, disclosed as local tie preference; making Any neutral is a separate approved scoring change. No strict mode in MVP.                        | Retain unknown and known nonmatching modes.                                                    | “Preferred work mode”; “Any (local onsite/hybrid first)” for current All behavior.             | No.                                                        |
| Seniority              | Ranking preference only; retain Senior including Technical Lead, and All as no bonus. No new strict exclusion.                                                                                                                           | Retain unknown and other levels; show unknown rather than fabricated certainty.                | “Preferred level”; “Senior or lead”, “Technical lead”, “Any level”.                            | No.                                                        |
| CV-derived suggestions | No CV integration in this MVP. Future explicit “Use CV suggestions” may populate supported options only after user confirmation; it must not restrict sources or silently add filters.                                                   | Missing/unsupported CV facts leave existing choices unchanged.                                 | “Suggested from CV — editable” only when actually implemented.                                 | Only if the user accepts changes to an eligibility filter. |

Separate labels into **Search filter** (stack) and **Queue priority preferences**
(location/mode/level), keeping the compact expandable controls. State: “Preferences
prioritize new candidates when a run exceeds 50. They do not filter or reorder your
saved queue.” Do not claim the queue itself is relevance-sorted. Avoid inventing a
ranked-results screen, persisted score, or change to NEW/SEEN ordering for this MVP.

## 7. Result transparency contract proposal

Additive run metadata, with no candidate schema change:

- `fetched`: raw job-array entries from successfully decoded, valid feed envelopes,
  including cached payloads. Failed/unknown-size feeds do not contribute invented
  zero matches; source outcome separately says unavailable/invalid.
- `normalized`: usable rows after source validation; `invalid = fetched - normalized`
  for valid envelopes. A malformed envelope reports an unavailable count instead.
- `eligible` (retain `found` as compatibility alias): distinct normalized identities
  passing stack and geographic eligibility. Collapse within-board duplicate post
  IDs before counting eligible. Cross-board identities remain separate.
- `added`, `refreshed`, `remaining`: preserve exact existing definitions and invariant
  `eligible = added + refreshed + remaining`; `added <= 50`. Label refreshed
  **Known candidates**, not updated jobs. Remaining is **Not queued: run limit**.
- `sources`: bounded per-active-board outcome with fetched/normalized/invalid counts,
  cache-hit flag, successful fetch timestamp where available, and safe failure code.
  Keep `scannedAt` as run start; it is not the feed fetch time or listing update time.
- Separate `sourceFailures` from invalid-row warnings; retain existing safe `errors`
  for compatibility. Optional exclusion reason counts use a documented first-failure
  order (invalid → stack → geography) to avoid double-counting. Explicitly count
  repeated source identities if presenting a full arithmetic funnel.

Compact completion: “8 eligible · 0 added · 8 known · 0 over limit · 0 source
failures.” Run details: “543 fetched (2 boards; cached/live) → 543 usable → 8 eligible,”
source outcomes and omitted/excluded reasons. No large inline banner, automatic
navigation, or extra scrolling; reuse P5.2f notification host and Run details.
Mixed-source failure is a warning with partial totals; all-source failure says
“No sources available” rather than “No matching jobs.” Keep manual retry guidance
honest about cooldown. No full payloads/internal exceptions in UI.

The persistent queue is the union of eligible past runs, not the latest result
set. Changing stack can produce eligible 0 while older queue rows remain. Known
counts include NEW/SEEN/SAVED/DISMISSED; default queue excludes the latter two.
Rescanning changes lastSeenAt only, even from cache. No state reset, automatic
merging, automatic Save, Inbox overwrite, or stale snapshot refresh is proposed.

## 8. Small implementation checkpoints (each requires approval)

1. **Registry and coverage:** introduce validated static registry, add Temus/Go1,
   retain historical identity mappings, update source names/scope from registry,
   bound concurrent fetches. Focused tests: duplicate/invalid tokens, unsupported
   URLs, historical keys and disabled-source resolution, one failed board, timeout,
   cache/cooldown, deterministic aggregation, unchanged 50-new budget and queue states.
2. **Transparent run accounting:** add stage/source/cache counters with stable old
   fields. Synthetic tests: malformed envelopes/rows, repeated IDs, partial/all-source
   failure, cached run, >50 new plus known rows, and counter invariants. No DB change.
3. **Semantics copy and compact summary:** apply the matrix labels without changing
   matching/scoring; wire new metrics into existing Snackbar/Run details. Focused
   frontend tests for request values, count labels, cached/partial/zero feedback,
   unchanged queue filters/history and no layout-affecting completion banner.
4. **Optional later policy checkpoint:** only after explicit approval, consider
   Any-stack, more stack vocabularies, neutral Any-work-mode ranking, more Vietnamese
   location aliases or strict match toggles with explicit unknown inclusion. Do not
   bundle these behavior changes into coverage or wording cleanup.

Use affected-package typechecks and focused tests per implementation checkpoint;
real integration work uses the existing isolated test database only. No new
infrastructure. No need for a database migration for the recommended MVP.

## 9. Risks and approval decisions

Approve the four-board active set and acceptance of Vietnam-unspecified jobs;
new HCMC-specific matches are not established. Approve static operator-managed
configuration and bounded two-source concurrency. Approve additive run metrics
and the proposed labels while retaining today's scoring/eligibility. Specifically
decide whether current All work-mode bias should remain visible or change to a
neutral Any in a later behavior checkpoint. Any-stack and strict geographic/mode/
level filters are **not** implicit approvals.

Risks: source changes/closures, country-only locations, title/description inference,
keyword false positives, uneven board sizes, provider URL formats, cache staleness,
process-local request controls, owner-wide ingestion lock as the queue grows, and
immutable snapshots. A broad source may dominate the 50 slots; no per-company quota
is proposed. Registry renaming can break exact source identity/Save matching;
retain old mappings. Public API accessibility is not a guarantee of stability or
unlimited request capacity. Reverify boards before activation.

## 10. Browser acceptance scenarios after implementation

These are proposed checks, **not performed acceptance**:

- Source details show enabled boards and cache/live provenance; a failed board
  yields partial results, and all failures retain the queue with actionable feedback.
- With synthetic stable feeds, work-mode/level/location preference changes retain
  eligible counts; stack changes affect eligible counts only when evidence differs.
  Verify explicit unknown retention and no unsupported “CV-personalized” claim.
- Run with >50 new candidates: preference rank selects the batch; queue remains
  NEW then SEEN/date/ID, and later runs insert the remainder without state resets.
- With existing Inbox matches, discovery still yields NEW queue candidates; explicit
  Save links exactly without editing application history. Dismissed/Saved candidates
  count as known but do not reappear in To review.
- Zero eligible does not erase old candidates. Six queue filters, ten-item pages,
  Back/Forward, reload, selected row and explicit review actions remain intact.
- Completion stays in shared overlay; Run details is keyboard accessible. Verify
  desktop, narrow viewport, 200% zoom, long names/errors, focus and scroll stability.

## Verification and stopping point

Only this report was added for P5.3A. Existing modifications/untracked audits were
preserved. Public board/API evidence and pure normalization/ranking probes ran;
no discovery ingestion or local data access occurred. No tests/builds/browser
acceptance ran for this documentation-only audit. `git diff --check` was run for
the documentation. No commit, push, or PR. Stop for design approval.
