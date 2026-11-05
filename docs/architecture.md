# Architecture

## Workspace and runtime

The pnpm workspace contains `apps/web` (React, Vite, MUI, React Router) and
`apps/api` (NestJS modular monolith). TypeScript is strict. The API uses NodeNext
ESM, `.js` import specifiers, and decorator metadata. There is no shared ORM
package or separate application-tracking service.

`tsc-watch` recompiles the API and starts Node after successful compilation.
Vite serves the browser on loopback port 5173 and proxies `/api` to port 3000.
API routes use `/api/v1`; liveness is independent of database readiness.
`App.tsx` mounts Job Inbox at `/dashboard` and `/jobs`, JobEditor at `/jobs/new`
and `/jobs/:id`, and the retained CV/review dashboard at `/cv`.

## Module ownership and product flows

`opportunities` owns saved jobs, original JD content/documents, reviewed import
fields, and application tracking. Its controller exposes list/create/read/update,
parse/import/extract, saved-CV, matching, and discovery operations. Writes validate
external input and use the existing local Host/Origin policy. The service uses
TypeORM directly; no generic repository wrapper or duplicate Application entity
is needed.

JobEditor imports sources before Review & Save. Saved jobs have Overview,
CV Match, Application, and Edit JD tabs. Editing remains local until Save changes;
failed saves retain input. Saves update the whole editable record across tabs.
Existing unresolved import conflicts can prevent a save. Updates have no version
check and retain last-save-wins behavior.

`extraction` owns bounded PDF/DOCX parsing, extraction contracts, evidence handling,
and local AI orchestration. Parsing and inference are distinct actions; a parsed
document is not automatically a verified qualification. `ai` validates the local
Ollama configuration and generated output. The pinned context profile requires
Ollama 0.40.10 and the configured qwen3:4b digest: 8192 context tokens, at most
6080 measured prompt tokens, 64 safety tokens, and a final output budget of
min(4096, 8192 minus measured prompt tokens minus 64), with a minimum of 2048.
There is no automatic remote-provider fallback.

`matching` owns the saved CV and saved-job matching service as well as the
retained analysis matching code. Explicit CV Match uses the latest saved CV/job,
validates source evidence, and returns a heuristic assessment for user review.
CV quotes are selected from bounded source passages and validated against saved
text; missing/unverified evidence must not be described as proof of missing skill.
Browser matching results do not alter application status, dates, or notes.

Saved-CV compound matching uses shallow request-local parent/component identifiers
inside the existing matching module (`cv-match.coverage.ts`). Contextual source
clauses retain one required/preferred weight (3/1); only bare comma/semicolon
technology lists create independent parents. The server derives explicit flat
AND/OR components and common constraints, so model-selected passages cannot alter
the denominator, operator or component count. Optional per-component quotations
support evidence on separate CV lines while legacy parent-only proposals remain
valid. AND earns proportional component credit; OR needs one supported alternative
and any recognized shared constraints. Unknown and conflicting coverage earns zero;
any non-full required parent blocks Apply. Generic-duration and Domain weights
remain unchanged. Extra model requirements are validated but excluded from scoring.

Evidence provenance is checked separately from bounded semantic support. Explicit
term/alias and action/knowledge checks, personal production-delivery guards,
minimum-duration guards and source-backed negative/contradictory passages constrain
compound credit. Ambiguous/nested forms remain Unknown rather than being flattened
into an invented logic tree. This deliberately conservative parser is not universal
natural-language entailment or a new requirements AST; uncommon synonyms and
unrecognized equivalence need human review. Model schema/evidence failures retain
the existing typed failure paths. CV Match displays parent/component quotations,
Partial, Unknown and Conflict alongside Matched; no entity or migration is needed.
The separate Task 04 structured-extraction matcher keeps its existing policy.

When a verified proposal omits an explicit OR alternative, deterministic recovery
may select a positive original CV passage for a term in the existing alias registry.
The same component support checks enforce common context, delivery and duration;
negation, aspiration, contradictory evidence and coding-tool passages cannot become
full OR credit. Recovery keeps an exact source span, never changes raw model output,
and this OR path is disabled for rejected parent evidence, AND/SINGLE/ambiguous groups and
unrecognized aliases. Existing Java/generic-duration recovery remains unchanged.

Canonical Bachelor-level education OR groups have a separate degree recovery path,
without adding education prose to technical aliases. An explicit degree assertion
and a relevant named field are required. The scorer can retain a bounded original
span containing a degree line, an immediately adjacent field-only continuation and
nearby completion/status metadata (at most four lines, 2,000 characters). Blank
lines, another qualification or intervening institutions prevent field stitching.
Incomplete, pending, negative or contradictory degree evidence cannot earn full
credit; selected degree-only quotes cannot hide adjacent pending status. Attendance
and dates alone do not establish a degree, and generic work duration never recovers
practical equivalence. Rejected evidence stays rejected; no general AND recovery,
schema, score-weight or persistence change is involved.

AND omission recovery is a separate bounded path for explicit design-context
components: APIs, CI/CD practices, integrations, data flows and cloud-based
architectures. Each component must match its own validated term and positive
source context; non-CI/CD components require design context. Technology lists,
AWS or RabbitMQ alone are insufficient.
Future, incomplete, negative, contradictory and coding-tool evidence cannot earn
recovery credit. Original source passages are retained (at most 2,000 characters),
and rejected parent evidence disables recovery. Existing proportional credit and
one canonical-parent weight remain; one component never satisfies a five-component
parent. Knowledge/experience-only, unrecognized and ambiguous AND groups receive
no new recovery. OR and education paths keep their existing semantics.

The design-context AND component `CI/CD practices` has a narrow applied-work
exception: explicit pipeline/automation design, implementation, configuration or
optimization can satisfy that component. Implementation/configuration/optimization
must act on a named CI/CD pipeline/workflow/automation context, its spelled-out
continuous integration/delivery/deployment equivalent, or a bounded automated
build-and-test/deployment pipeline form. Using a pipeline for unrelated work is
not pipeline implementation evidence. Model-selected quotations and omission
recovery use the same component-specific predicate and existing negative/conflict
and rejected-evidence gates. Other component design predicates, OR and education
semantics, source quotations, parent weights and recommendation rules are unchanged.

`discovery` retrieves the configured Axon, Backbase, Temus and Go1 Vietnam public Greenhouse boards
on demand, ranks using the supplied filters, and queues candidates for explicit
Save through OpportunitiesService. Exact links preserve existing Inbox jobs. This is not
background crawling, auto-apply, or CV fit analysis. The legacy `jobs` feed module
and `analysis` transport remain in the API; they do not replace the saved-job
workflow.

URL/page import reuses review/save rather than adding a second job model.
Server-side URL fetching is restricted and bounded; open-page import validates
its supported payload, origin, and nonce handshake. Importing or saving a job
does not submit an application or send messages.

ITviec Fetch preserves the verified server-rendered job-header taxonomy in
response-only `sourceMetadata` arrays. Existing xmldom tooling parses a balanced,
scoped header fragment, avoiding unrelated page XML/SVG and excluding tooltip
content. Skills remain supplemental tags; expertise remains source classification.
Explicit domains map to the existing Domain string with `; ` separators and a
bounded, verbatim source block. Deterministic recovery treats each block entry as
atomic evidence, preserving commas/conjunctions and genuine source conflicts.
Add Job protects fetched domains against omitted AI proposals and respects manual
edits and source replacement. Generic JSON-LD industry is not a domain fallback.
No taxonomy entity, migration or new dependency is required; unknown page layouts
remain absent rather than being inferred from navigation or analytics.

Explicit qualification headings in Add Job extraction consistently enable
source-clause recovery. Mandatory and preferred qualifications preserve knowledge
levels, delivered-project constraints, education and AND/OR alternatives; plain
technology lists keep the existing safe splitting rules. The existing proposal
normalizer replaces fragments with the recovered clauses from their source row,
so generic keywords do not duplicate complete requirements. Plus-years experience
is normalized separately while the accompanying qualification remains evidence.
This applies to new suggestions; historical/manual evidence is not retroactively
rewritten. The pinned model profile, single-generation budget and strict evidence
gates remain unchanged. CV Match still consumes the existing saved text fields.

## Persistence and configuration

PostgreSQL runs in Docker. The development Compose project uses a persistent
named volume. The test project has separate identity/credentials and tmpfs
storage. Development defaults to port 5432; an existing installation may override
it. Port 5433 is reserved for tests. `databaseOptions` validates target, role,
database, loopback host, port, and required password before connecting.

`Opportunity` stores job/import data, source documents, tracking fields, discovery
metadata, and creation/update timestamps. `SavedCv` stores one current parsed CV
per local owner. The server assigns a fixed local owner; this is not authentication
or multi-user isolation. Source document bytes and saved CV text are private
local data, not fixtures or repository artifacts.

Status is one of SAVED, CONTACTED, JD_RECEIVED, APPLIED, INTERVIEW, OFFER,
REJECTED, or CLOSED. Transitions are unrestricted. Application notes and
recruiter/contact notes are separate strings. Contact dates are a bounded array
of unique valid calendar dates; array order records entry order rather than
chronological sorting. Follow-up is a nullable PostgreSQL date. Job Inbox currently
displays that date with the P4.2 due/overdue behavior described below.

TypeORM uses an explicit migration list in `database.config.ts`,
`synchronize: false`, and `migrationsRun: false`. History is in public; domain
tables are in `ai_job_hunter`. The migrations create the application schema,
opportunities, smart-import fields, complete import fields, saved CV, discovery
metadata, and P4.1 application details. CLI source execution uses ts-node ESM;
compiled commands use `dist` and require current compiled output. Startup does
not apply migrations.

## Security and operational limits

The API binds to loopback. Local write guards validate explicit Host/Origin
allowlists; opportunities also supports explicit localhost development aliases.
Those guards do not provide authentication. Credentials and server configuration
stay out of frontend bundles. Storage failures use sanitized responses.
Development/test identities are deliberately distinct; integration tests must
refuse development and production targets.

No authentication, multi-user deployment, automatic messaging, calendar sync,
or status-history timeline is implemented.
Real-browser acceptance and live inference quality are separate from synthetic
checks. Archived checkpoint reports must not be interpreted as current test
results. Apply the Fast Iteration policy in AGENTS.md when selecting checks.

## P4.1: application details

The existing Opportunity owns nullable `appliedDate` (PostgreSQL date) and
`applicationChannel` (varchar(200)). Applied date means actual submission, never
inferred from status, contact dates or timestamps. Channel is manually entered
text independent of job source; a separate application model or channel catalog
is unnecessary for this local MVP. Blank/whitespace-only channels normalize to
null. Existing records receive null without a backfill.

Existing create/update routes serialize these fields with the opportunity.
Omitted fields default to null on creation and preserve saved values on update,
so older clients do not erase them. Explicit null clears either field. The
Application tab retains the existing whole-record Save changes flow and keeps
input on failure. Contact dates record actual contact; follow-up is a plan to
contact HR if no response arrives. Neither action automatically changes the
other or status. The Application UI edits only the chronological latest contact date through
Last HR contact date. ISO date strings are compared directly without timezone
conversion, so unsorted history works. Save replaces or removes that original
latest entry, preserves earlier entries and deduplicates the replacement. An
unchanged picker sends history unchanged. After Save, the picker shows the latest
remaining date, which can reveal an older entry after clearing. Input and history
remain intact on failure, and edits survive tab switching. The existing 100-date
bound is preserved because replacement never grows nonempty history.

Application uses one outlined Paper matching Overview, with compact responsive
fields and dividers for details, contact/follow-up, and notes. Its submit button
lives in a normal-flow Paper footer and uses the existing whole-record form save;
Edit JD retains its existing action layout. No scroll container is added.

The additive ApplicationDetails migration adds only these two nullable columns.
Rollback removes only those columns (and any newly entered values), preserving
all older fields and rows. Status history and follow-up indicators remain outside
P4.1. Whole-record updates retain existing last-save-wins concurrency behavior.

P4.1 verification used `test/manual/application-details.migration.ts` against a
fresh disposable test database, first through `node --env-file=../../.env.test
--loader ts-node/esm test/manual/application-details.migration.ts` from apps/api,
then through `node --env-file=../../.env.test
.test-dist/test/manual/application-details.migration.js` after `pnpm
--filter @ai-job-hunter/api test:compile`. Recreate only the dedicated disposable
P4 test container between these runs: the harness refuses an existing opportunities
table. Each run checks database identity, applies the baseline, inserts a synthetic
row, and verifies apply/repeat/revert/reapply/repeat and preservation of older values.
This uses test compilation, not a production build.

## P4.2: actionable follow-ups

The Inbox derives urgency from validated YYYY-MM-DD strings compared to a date
constructed from the browser's local year/month/day. Stored dates are never
parsed as UTC timestamps. REJECTED and CLOSED are excluded from actionable labels
and the Due follow-ups filter without changing their persisted dates. Filtering
preserves API row order. Due links use the existing job route with
`?tab=application`; JobEditor honors this on navigation while retaining ordinary
tab switching and the existing save flow.

A local-midnight timer refreshes labels and filter membership. Focus and visibility
changes catch suspended tabs; a one-minute timer cap catches clock/timezone
changes. Timers and listeners are removed on unmount. No extra API polling, writes,
backend changes, schema changes, status transitions, or contact recording occurs.

## Inbox pagination

Job Inbox filters the already loaded records before selecting a ten-row page,
retaining API order. Filter changes reset to page one; the displayed page is
bounded by the current result count. MUI pagination below the table reports the
range and filtered total without extra API calls. Entering the Inbox loads the
current saved jobs, including jobs imported from the separate Discover page.

The table remains mounted for empty results. The Inbox pilot combines title,
company and source into a primary row identity, with status and follow-up at the
trailing edge (stacked below on narrow screens). Rows omit discovery timestamps and technology lists; persisted data is unchanged.
Valid original links remain accessible via a labelled external-link action.
Ordinary rows use two text lines with 8px vertical padding (approximately 64–72px
including status), growing naturally when text wraps. Missing follow-up dates
render no placeholder; actionable dates show urgency linked to Application.

Inbox routes now use the existing viewport-bound shell. The results container
scrolls within the remaining flex allocation, while the toolbar and pagination
remain outside it. This addresses document-height shrinkage as a likely source
of filter scroll clamping without fixed row heights or empty spacers. The results
container reserves scrollbar width and disables scroll anchoring; filtering still
uses local data and stable row keys. Its own scroll offset may clamp when results
shrink, but that should not move the toolbar. The Inbox outer area allows overflow
as a fallback; short screens, zoom and nested scrolling need real-browser
acceptance. Smoothness has not been browser verified.

Discover Jobs now lives at `/discover`, using the existing navigation and normal
document scrolling. A thin PageHeader/outlined-Paper page wrapper reuses the
existing DiscoverJobs form and request/state logic; there is no second discovery
implementation or global state store. The form is visible immediately. Copy
explains direct saving and the 50-new-job limit before submission; result counts,
partial errors, cache guidance and a View Job Inbox link remain on the page.
Navigation is explicit, not automatic. Component-local preferences/results last
while the page is mounted; leaving and returning starts a fresh form, as other
unmounted local-state screens do. Backend discovery behavior is unchanged.

The Inbox no longer embeds a disclosure or discovery form. Its empty state links
to Discover Jobs and Add Job. A Saved Jobs section groups the total count,
exclusive labelled filter buttons, compact table, and bottom pagination. The
all-jobs count is separate from the filtered pagination total. Local spacing and
cell wrapping changes do not alter global styling, data order, or source links.

## UX foundation

The frontend retains one MUI theme and the existing 8px spacing base. Shared
page titles use PageHeader; the shell owns matching header/content gutters.
Specialized job-editor headers remain local. Typography preserves CV Match's
section/body metrics and score styling; no global surface, field, icon or
accordion overrides are introduced. Button casing, minimum sizes and focus
treatment are shared defaults. This avoids a second design system or generic
table/form framework. See [UX guidelines](ux-guidelines.md) for conventions.

## Discovery queue persistence foundation (P5.2b)

Verification update: the checkpoint-era pending database checks below were
completed in P5-M2. Source/compiled migration lifecycle, PostgreSQL concurrency
tests and Chromium acceptance against an isolated live API/database passed.
See [P5 merge readiness](audits/p5-merge-readiness.md) for current evidence and
remaining scope; earlier checkpoint verification notes are historical.

`discovery_candidates` stores owner-scoped source identities, four queue states,
validated bounded JSONB snapshots, first/last-seen timestamps and an optional
restricted foreign key to an Inbox opportunity. A unique source identity, finite
ordered timestamps and SAVED/link consistency are enforced by the additive
migration. Snapshots use the existing DiscoveredJob shape with bounded fields and
metadata; ORM writes validate them, and ORM updates cannot replace the initial
snapshot. The database additionally enforces object shape and a 512 KiB JSON-text
bound. Direct SQL still requires the same application validation for full shape.

The read-only DiscoveryQueueService requires a trusted owner ID. To review sorts
NEW before SEEN, then firstSeenAt descending and UUID ascending; other filters
use chronological order with the same UUID tie-breaker. A short read-only
REPEATABLE READ transaction keeps totals and ten-row page slices consistent.
Out-of-range pages clamp to the last page; an empty result returns page 1 and zero
total pages. No read changes review state. The separate DiscoveryQueueModule
exports the read service. P5.2c adds separate API wiring as described below.

There is no backfill. P5.2d connects the Discover page to the persistent queue.
The foreign key checks existence, so Save also checks linked-job ownership in the
service. Schema rollback drops queue data only and requires explicit authorization
for any populated database.

## Discovery queue ingestion and review actions (P5.2c)

DiscoveryQueueModule now exposes `/api/v1/discovery/runs` and candidate list,
detail, status and save endpoints. It imports exported services from
OpportunitiesModule; the reverse dependency is not introduced. The queue route reuses DiscoveryService.scan (fetch/normalize/rank), including
the same GreenhouseSource instance and its cache/cooldown. In P5.2d the legacy
auto-import route returns 410 without fetching or saving; stale clients must reload.

Queue ingestion deduplicates by stable board key and provider ID, inserts at most
50 new candidates, and refreshes all existing eligible identities regardless of
state. Only lastSeenAt changes on rescan, using GREATEST to resist out-of-order
runs. Snapshots, firstSeenAt, updatedAt, links and review states are untouched.
Counts use distinct eligible identities: found = added + refreshed + remaining.
Source errors remain partial-success messages, while a persistence failure rolls
back the entire run. Fetching happens before the database transaction.

Candidate actions and opportunity identity writes use the same owner-scoped
transaction advisory lock as legacy discovery, acquired before candidate row
locks. Manual creation now checks/inserts inside that lock; manual update only
wraps its existing persistence step, without changing validation or edit rules.
No external feed request or document parsing occurs while holding the lock.
An explicit later manual edit may still create equivalent URLs, as before.

Save uses one transaction for the candidate row lock, opportunity lookup/create,
and SAVED/link update. Opportunity entities and creation rules stay in the owning
OpportunitiesService through a transaction-aware exported operation. Exact
matches are the union of source identity and normalized URL matches; one links
without changing the existing record, multiple return AMBIGUOUS_INBOX_MATCH.
Company/title/location is only a warning: POSSIBLE_DUPLICATE requires an explicit
boolean confirmSeparate before creating a new job. Confirmation never bypasses
an exact ambiguity or permits client-supplied job content. Both conflicts expose
at most 20 same-owner IDs/titles/companies/locations, not notes or source payloads.
Every retry rechecks current matches under the lock. Already-linked candidates
return the same owner-checked opportunity without reapplying source fields.

NEW can become SEEN/DISMISSED; SEEN can become DISMISSED; all three unsaved states
can Save. Repeated same-state actions are no-ops, and SAVED cannot be changed by
the status endpoint. Reads never mark SEEN. Client owner IDs, source fields,
job IDs and arbitrary status values are rejected. Responses expose explicit
candidate DTOs and use no-store; local-write protection is shared unchanged,
with structured queue conflicts and a safe storage-error fallback.

PostgreSQL integration cases cover race/rollback behavior, source identity,
immutable rescans, exact/heuristic duplicates, owner isolation and manual-create
coordination. These require the existing isolated test database. In-memory unit
and HTTP-controller tests do not establish transaction correctness. The P5.2b
migration lifecycle remains pending until that database is available. There is
no bulk save, AI ranking or scheduler.

## Discovery Queue UI and endpoint cutover (P5.2d)

The existing Discover form now posts to `/discovery/runs` and refreshes the queue
without navigating away. DiscoveryQueue reads server-filtered, ten-row pages;
filter/page query parameters preserve browser history and direct links. Server
page clamping replaces the URL. Requests are aborted and stale responses ignored.
Candidate details use a dialog and a candidate query parameter. Reads have no
review side effects; only explicit actions change status or save. A successful
Save keeps the summary visible and offers Open Inbox job. Possible duplicates
require a separate confirmation button; exact ambiguity offers no override.
The Inbox layout and interactions are unchanged. Candidate ingestion is independent
of existing Inbox identities, so old imports still produce NEW candidates. Explicit
Save links an exact match without overwriting fields or application history.
No local data rewrite or backfill is part of this cutover.

## Shared frontend notifications (P5.2f)

The feedback audit found one Snackbar, owned by JobEditor for Application saves,
plus inline discovery completion/review success Alerts. Other Alerts represent
field/import validation, loading failures, conflicts, or persistent contextual
warnings; those remain local.

NotificationProvider wraps the router under the existing MUI theme. A typed
React context accepts success/error/warning/info messages; one bottom-right
Portal/Snackbar/Alert displays them in arrival order. Success auto-hides after
three seconds, info after six; errors and warnings require dismissal. Clickaway
never dismisses. New messages, edits and retries do not silently clear existing
errors. Pending messages exist only in memory, without history or an event bus.
Success/info announcements are polite, errors/warnings assertive. The host does
not move focus. Its responsive width and safe-area bottom offset keep it outside
page and dialog flow.

Discover stores the latest run details in its existing local state and exposes
them through a permanently positioned Run details button and an on-demand
popover. Completion and review success use the shared host, without inserting
inline success banners. Review failures and duplicate confirmation stay local
and actionable. Application saves reuse the shared host instead of owning a
second Snackbar. DOM tests verify overlay placement and unchanged dialog scroll
containers; actual scroll and narrow-screen acceptance still require a browser.

## Greenhouse source registry and coverage (P5.3b)

`discovery/greenhouse-registry.ts` owns the static registry, validated at module
startup: one to five entries, bounded lowercase tokens/keys/names, boolean enabled
flags, no duplicate tokens/keys or caller URLs. Canonical API URLs derive from the
fixed HTTPS host. Existing Axon/Backbase names, keys and URLs remain exact. All
entries, including disabled boards, remain resolvable for historical Save identity;
only enabled boards may fetch. Entries and the registry are frozen.

Discovery scans batches of at most two boards. Each board catches its own failure;
Promise.all retains registry order before existing score/title sorting. This keeps
equal-rank ordering deterministic without changing ranking rules. Batches are simpler
than a worker pool but a slow board can delay starting the next batch. Existing
15-second timeout, response bounds, five-minute cache/cooldown and Retry-After
handling remain per source. The 50-new-candidate cap, immutable snapshots, timestamp
refreshes, review states and explicit Save behavior are unchanged.

On 2026-11-04, direct public API GETs reverified Temus (HTTP 200, 46 posts) and Go1
Vietnam (HTTP 200, 2 posts), matching the audit. Browser research tool access failed,
but direct HTTPS JSON retrieval succeeded. No discovery run or database mutation
was used for this verification. Frontend static two-board explanatory copy is
unchanged under this backend-only checkpoint; the returned scope names all active
boards. Copy/semantics cleanup remains a later checkpoint.

### P5.3c discovery run accounting

The queue run response adds fetched (raw rows in valid envelopes, including
cached payloads), normalized (valid rows, including repeats), and eligible
(distinct eligible board/post identities). found remains an alias of eligible;
eligible = added + refreshed + remaining. Deduplication keeps the first ranked
occurrence, preserving existing cap selection and feed-order tie behavior.
Queue snapshots, review states, ordering and eligibility rules are unchanged.

sources follows the bounded active registry order. Each outcome includes
sourceKey/sourceName, status, fetched/normalized/invalid, cacheHit, fetchedAt,
and a safe failure code/message. Failed or malformed feeds have null counts;
aggregate counts sum only valid envelopes. fetchedAt records successful JSON
decoding time, including for a malformed envelope; cached reads retain that
timestamp. It does not imply fresh listings or successful normalization.
sourceFailures counts failed boards; warnings contains invalid-row warnings.
The existing errors array retains both categories for older clients. Failure
codes distinguish INVALID_FEED from SOURCE_UNAVAILABLE without exposing upstream
payloads or internal exceptions. No persistence or frontend contract migration
is required.

### P5.3d discovery semantics and run details

Discovery keeps the same preference payloads and compact expandable controls.
Labels distinguish the match-any stack keyword filter from location/work-mode/
level priorities used to select new candidates under the cap. Copy discloses
the four boards, existing geographic scope, unknown metadata, and Queue history.

The frontend consumes P5.3c stage counts and per-source outcomes directly.
Completion stays in the shared Snackbar; partial/all-source failures use warnings.
Run details uses a bounded, wrapping popover with keyboard dismissal and focus
restoration. It separates raw/valid listing counts from unique eligibility and
labels refreshed as known candidates. Failed source counts remain unavailable;
cached reads retain their original fetch timestamp. The UI uses local explanatory
copy instead of displaying the older backend scope wording, which conflates
eligibility and ranking. Queue filtering, pagination and review actions are unchanged.

### P5.3e Discovery Queue viewport layout

Discovery reuses the Inbox shell's 100dvh flex layout on desktop when there is
room for the controls plus at least 12rem of candidate rows. The page measures
its header/preferences and Queue control/pagination heights with ResizeObserver,
and rechecks on window resize. Narrow widths, expanded controls, errors or short
windows that leave insufficient row space release the shell to document scrolling.
This avoids a resolution-specific Queue height and keeps preferences accessible.

Only the candidate-row region scrolls in bounded mode; it is keyboard focusable,
uses a stable scrollbar gutter and disables scroll anchoring like the Inbox.
Queue controls and pagination remain outside it. The region stays mounted during
loading, filters and review; layout code performs no scrolling or focus changes.
Pagination retains its previous totals while a new request is loading and disabled.
Run details and shared notifications remain overlays. URL state, ten-row pages,
review states and Save behavior are unchanged. DOM tests cover fit decisions and
element continuity; real desktop/mobile scroll and zoom acceptance remains pending.

### UX-C1 semantic contrast

Compared a dark warning.contrastText palette value with a filled-warning-Chip
theme override. The palette option also changes other warning-colored consumers
that use contrastText. The narrower override uses existing grey[900] only for
MuiChip filled warning indicators, retaining warning.main and all palette values.
This corrects JobEditor/ApiReadiness indicator contrast without redesigning Chips
or changing standard warning Alerts. Unsaved confirmation keeps the same handlers
and action order; Stay is outlined/autofocused and Discard uses error semantics.

### UX-C1b unsaved-dialog keyboard entry

The safe action retains native button Enter/Space activation. Mount-time
autofocus is supplemented at dialog entering/entered transitions so focus can be
retried after visibility changes. The retry leaves an intentional focus position
inside the dialog alone and uses preventScroll. MUI retains ownership of trapping
and restoring focus; Escape continues to leave this guard open. Stay is outlined
primary and Discard outlined error, with the existing reset/proceed handlers.

### UX-C1c unsaved-dialog focus ownership (supersedes UX-C1b retries)

Lifecycle inspection confirms that sidebar NavLinks request navigation and the
router blocker leaves the current editor and sidebar mounted. The guard opens
Dialog without a close handler; Escape/backdrop cannot reset or proceed.
Modal portals the dialog, FocusTrap owns its initial surface focus and records
the previously focused sidebar link for restoration. Dialog's marked focus target
is its Paper; containment can also focus its enclosing surface.

UX-C1b separately focused Stay at React mount and animation callbacks, rather
than responding to MUI's focus selection. Those callbacks do not run for every
surface-focus event (including containment or lifecycle reactivation). This
confirmed ownership gap is fixed locally: remove button autofocus and transition
retries; use the Dialog root's supported onFocus handler to synchronously hand
focus from an ancestor surface to Stay. The root handler runs after FocusTrap's
child handler records the restoration target. Focus on Stay/Discard does not
satisfy the ancestor check, and no delayed task can override a user's selection.
MUI autofocus, enforcement and restoration remain enabled; reset/proceed handlers,
Escape behavior, outlined actions and native keyboard activation are unchanged.

The real-App StrictMode test now edits Application notes, tabs to the actual
sidebar Settings link, activates it with Enter, asserts document.activeElement,
checks Tab/Shift+Tab and confirms Enter/Space on Stay retain notes and return focus.
A separate focus trace verifies MUI surface-first/Stay-second ordering and no
focus theft after entry completes. The pre-fix sidebar test also passed in JSDOM:
it did not reproduce the reported browser failure. Thus the code ownership gap
is confirmed, but the exact browser event ordering behind B01 is not independently
confirmed here. B01 browser acceptance remains pending; no browser tooling is
available in this session.

### UX-C2a confirmed browser focus indicator diagnosis

DevTools confirmed Stay already owns initial focus inside the dialog, while
neither :focus-visible nor Mui-focusVisible applies. The browser issue is visual;
the UX-C1c lifecycle is unchanged. A Stay-only :focus style reuses the existing
2px primary outline and 2px offset. Both focus selectors set the same outline
property, so they do not create separate rings; blur removes the local rule.

### UX-C3 local button hierarchy

Queue filters retain their existing buttons, pressed states and URL handlers, but
use outlined neutral styling with action.selected fill instead of contained
primary styling. This aligns selection emphasis with Inbox without changing the
filter control's keyboard behavior. Discover and Save remain primary; preferences,
Run details, Mark as seen and Close remain low-emphasis disclosures/actions.
Task navigation uses outlined buttons (Back to Job Inbox adds one decorative 20px
arrow); content destinations use MUI Link with their existing href/route and
external-link protections. After Save, Open Inbox is outlined navigation. Add Job
Continue is contained; explicit optional extraction is outlined. No handlers,
viewport ownership, CV Match evidence controls, Application behavior, theme or
accepted unsaved-dialog focus styles/lifecycle are changed.

### UX-C4 local typography consistency

Candidate Review keeps subtitle1 metrics but gives its three subsection headings
the existing local 600 weight convention. Dialog title/content and the Job Details
header allow unbroken imported text to wrap. Overview's full-description disclosure
uses the same subsection convention; supporting “Show all” disclosures use body2,
and import evidence disclosures use subtitle2 group-label typography. They remain
native summary elements with their existing disclosure behavior.

Inbox title links use body1 instead of a literal 1rem size, retaining their medium
weight and dense row layout. No global subtitle1 change is needed: that variant
also serves ordinary metadata. Discover/Queue headings, MUI field/helper/button
metrics, compact Application fields and CV Match score/evidence emphasis retain
their existing contextual hierarchy. No business or navigation handlers change.

### UX-C5 visible actions and local layout corrections

Discovery preferences/details, readiness retry, Candidate Review close/seen/cancel,
Queue retry and editor source/conflict actions now explicitly use outlined buttons.
Their previous omitted variants rendered borderless text actions. Primary commands
stay contained; inline content links and existing icon/tab controls retain their
semantics. The accepted unsaved guard, including outlined error Discard, is untouched.

Discover's controls use one outlined Paper with theme spacing and no shadow,
separate from Queue. Existing measured viewport fitting accounts for that surface's
padding; rows still own desktop scrolling and short/mobile layouts fall back to
document scrolling. Queue's inherited text color previously made borders nearly
black. Unselected borders now use action.disabled with secondary text; selection
uses primary.main text/border and the primary color at action.selectedOpacity.
No filter handlers or eligibility/ranking rules change.

Edit JD's shared wizard action row applied flex: 1 to every button. Existing-job
actions now align at the end without growing, while Add Job keeps its accepted
wizard layout. The grid's separate save row remains reachable as fields scroll;
the compact Save retains a 44px mobile touch target. Save/validation handlers and
scroll ownership are unchanged.

Application was checked at 1440×900 and 390×844: no horizontal overflow or nested
form scroller was reproduced. Its longer-than-viewport form uses normal document
scrolling, with two desktop columns and stacked mobile fields; no form compression
or layout change is justified. Browser acceptance uses intercepted synthetic data.

### UX-C6a shared discovery provenance and live layout diagnosis

Job Details now renders one provenance Alert immediately after Tabs and before
all panels. Previously it followed the Overview panel, so it appeared below
Overview content but above other active panels. SourceName retains both the
source and platform (for example, Axon · Greenhouse); discovery time is unchanged.
An explicit Open original job link uses the existing validated, credential-free
HTTP(S) job URL with noopener noreferrer. The provenance sourceUrl is a feed API
endpoint for current Greenhouse records, so it is not substituted for a missing
original job link. Jobs without provenance omit the Alert.

Live Chromium diagnosis at 1440×900 and 390×844 confirmed Application's document
scrolling, without horizontal overflow or nested form scrollers. A synthetic job
already in the live database measured document heights of 1009px / 1534px; ordinary
scrolling brought Save fully inside each viewport. Edit JD measured a 726px / 432px
field region with a stationary Save row. No Application clipping defect was
reproduced, so neither tab's scrolling model nor Save handler changes in C6a.
The smallest proposed follow-up is an in-page Jump to Save action near Application's
heading, retaining document scrolling and the existing single submit button.
That optional discoverability action is not implemented in this checkpoint.

### UX-C6a-02 Application editing workspace

The acceptance requirement is a consistent desktop editing workspace, not merely
Save reachability after page scrolling. This checkpoint supersedes C6a's proposal
to keep Application entirely document-scrolled with an optional Jump to Save.

Application reuses JobActionLayout inside its existing Paper: the compact form
scrolls in the first grid row, and the existing submit action stays in the second
row. The shared header, tabs and provenance remain outside that form scroller.
Its local height is measured from the panel's document position to the viewport
bottom, allowing for the main gutter, Paper padding/border and actual action-row
height. ResizeObserver tracks panel/main/footer geometry. No global shell height,
new layout abstraction or change to Edit JD is needed.

Bounded mode requires at least the md breakpoint and 12rem of usable form space
after accounting for the footer. Narrow/short windows remove the local height and
internal overflow, using one natural document scroller and an in-flow Save row.
Fields stay mounted when modes change. Existing field handlers, form submission,
validation, provenance and the accepted unsaved-navigation guard are unchanged.

Live Chromium at 1440×900 measured form clientHeight/scrollHeight of 331/520px,
with scrollTop 0 → 100 → 189 and Save fixed at y802.41–838.91. The document remained
900px high with scrollY 0; header/tabs/provenance did not move. At 390×844 and
1440×600 the internal scroller was absent and Save remained reachable in normal
page flow. Resize-mode switching preserved local unsaved notes without saving.

### UX-C6b Edit JD details first

Edit JD starts with the saved editable fields under Job details. The existing
source-import JSX is reused below those fields inside a native, initially closed
Replace JD from another source disclosure. Add Job renders that same JSX in its
original import step, retaining its heading, Continue and Review & Save progression.
No new import component abstraction or source-processing behavior is introduced.

Native details keeps source controls mounted when collapsed, so toggling the
section does not reset manual edits, file/source state or evidence. Expanding and
selecting methods still do not fetch or extract; the existing explicit actions
and manual-value protections remain responsible for those operations.

The existing Edit JD field scroller and compact Save row are unchanged. On entry,
a one-time check reveals Job details inside that scroller only if the heading is
below its visible boundary (reproduced on mobile with the tall shared header).
It does not focus a field or repeat on edits/disclosure toggles. The shared header,
provenance, Application workspace, CV Match and unsaved-dialog lifecycle are not
changed. Live browser acceptance uses local edits restored without saving; import
and extraction behavior remains covered with synthetic automated fixtures.

### UX-C6d MVP manual-only Edit JD

This decision supersedes the C6b replacement disclosure. Existing jobs no longer
render any source-import controls. URL fetching, document parsing and extraction
handlers reject existing-job use, and extraction targets only Add Job's `/extract`
route. Add Job retains its import components, wizard progression and current
suggestion behavior. Obsolete saved-value inference for re-extraction and loaded
document import state are removed from Edit JD.

Job description edits the existing `description` field supported by the current
frontend/PUT contract. It does not edit extracted document `jdText`, original bytes
or imported `postText`; these remain preserved. The backend does not accept raw
document-text replacement through this manual field, so no new source-editing
semantics are introduced. Source remains editable as ordinary metadata alongside
the structured fields, independently of import controls.

Save still sends the current draft, original postText and importReview. Editing
description or metadata does not clear evidence or unresolved conflicts. Existing
per-field acknowledgement reset and explicit candidate selection are preserved,
as are the compact Save footer, field scroller and accepted unsaved guard. The
retired replacement characterization tests are superseded by manual-only safety
regressions; the C6c audit remains a historical account of the removed workflow.
It does not claim that Add Job's audited suggestion semantics or historical data
have been changed, nor that backend import endpoints have been removed.

### P5.4a Add Job import reliability

Add Job tracks the last applied page preview. A repeat Fetch replaces that
preview's exact source segment instead of appending it. A different URL requires
explicit replacement confirmation, updates automatic fields and clears obsolete
AI suggestions, while deliberate edits and separate source text survive. If the
original source segment was rewritten manually, Fetch reports a recoverable error
rather than guessing which text to remove. Responses apply to the latest draft,
with request generations rejecting results after method or URL changes and unmount.
Failed requests leave the valid draft available for retry.

A document becomes an active attachment only after a readable parse succeeds.
Leaving Upload JD cancels parsing and clears its attachment, preview
and error; Paste JD extraction and Save therefore cannot resend a failed or stale
file. Separate pasted text can still be combined with a document by entering the
text first and then choosing Upload JD. This deliberately replaces implicit
attachment retention across methods with an explicit active upload; the UI states
that leaving Upload removes the document. Evidence/conflict validation, explicit
Save, manual-only Edit JD and Discovery Queue remain unchanged. No backend,
transport policy, schema or dependency changes are needed.

### P5.4b Early exact-URL duplicate warning

Add Job debounces valid source URLs for 500 ms, including URLs populated by
imports, and calls `GET /api/v1/opportunities/duplicate-url?url=…`. The read-only,
no-store endpoint returns `{ match: { id, title, company } | null }`, validates
HTTP(S) URLs without credentials and selects only the owned Inbox rows' link
metadata. It uses the same `normalizedUrl` function as Create: tracking parameters,
hash, www and trailing slash handling remain consistent with Save. There is no
title/company heuristic, external URL fetch or Discovery Queue change.

No dedicated early lookup existed; this narrow endpoint avoids transferring the
whole Inbox and duplicating normalization rules in the browser. It retains the
current linear lookup strategy without adding a schema/index or search framework.
A future scale change can optimize both early lookup and Create together.

The warning is advisory and stays visible during review. Its existing-job link
opens a new tab to retain the draft. Lookup failure gives safe, non-blocking
guidance; URL changes abort pending requests and ignore late success/failure.
Create's transactional duplicate enforcement remains authoritative, including
when early lookup fails or another job is saved after checking. P5.4a replacement
confirmation, manual-edit protection and upload recovery remain in place.

### P7.2 Trusted CV Match context and evidence boundary

Saved-CV matching now returns an additive opaque matchId backed by an immutable,
process-local assessment snapshot: 15-minute monotonic TTL, maximum 20 entries,
latest per owner/job. Lookup checks source revisions and identity; no database
migration, duplicate full-CV storage or durable suggestion history is introduced.
This avoids trusting browser-supplied evidence or rerunning matching for future
suggestions, at the cost of reanalysis after expiry, eviction or restart.

Matching-owned evidence references identify exact saved parsed-CV text or canonical
saved-job requirement quotes, immutable source revisions and parent/component
linkage. Unique CV anchors use UTF-16 offsets; duplicate quotes have no unique
anchor. Pure policy preserves P6 scores/statuses, orders conflicts first and
returns up to five extractive-wording or clarification candidates. Wording is
restricted to complete self-contained source entries; arbitrary paraphrases and
uncertain attribution require clarification. No suggestions endpoint or AI
selection is implemented in this checkpoint.

The [P7 design and P8 boundary](audits/p7-cv-improvement-design.md) documents the
full policy and tradeoffs. P8 may reuse provenance concepts but must independently
validate durable source revisions and user-approved content. Ephemeral matchId,
parsed-text anchors and suggestions are not a structured CV profile, file-layout
model or verified employment facts.

### P7.3 On-demand CV improvement selection API

`POST /api/v1/opportunities/:id/cv-improvement-suggestions` accepts only a bounded
opaque matchId. The existing controller retains UUID/local-write/no-store
protections and exposes allowlisted `CV_SUGGESTIONS_*` errors. JobMatchService
loads saved sources, resolves the P7.2 owner/job-scoped context, verifies revisions
and shares its existing admission flag between matching and suggestions. It
rechecks source revisions and the current snapshot identity before selection and
after success or failure. A job deleted after initial resolution is stale; an
initially unknown job is 404. No CV/job/tracker writes or suggestion persistence.

The matching-owned CvSuggestionsService uses existing AiService structured
validation and provider budgets to select only unique eligible candidate IDs.
Model output cannot supply wording, evidence, status or explanations. The server
keeps P7.2 eligibility, conflict-first order, exact source passages and five-card
limit; an empty candidate set bypasses AI. Prompts include candidate evidence as
untrusted JSON data, not the full CV or raw JD, and refuse oversized input rather
than truncating context. A route-scoped global exception fallback registered at bootstrap sanitizes
JSON/body-parser failures before controller dispatch; unrelated routes use the
existing Nest behavior. No global queue, provider changes or new dependencies.
The shared guard covers CV Match/suggestions, not unrelated extraction workflows.
P6 scoring and evidence semantics remain unchanged; P7.4 UI and P8 remain deferred.

### P7.4 CV improvement suggestions in CV Match

The existing CV Match document flow hosts a compact suggestions section between
Requirements and Application advice. It explicitly requests selection using the
successful matchId and validates the response against the displayed match's
source revisions, parent/component linkage and exact evidence before enabling
copy. The UI preserves server ordering and wording; it does not generate claims,
compute scores or reinterpret requirement satisfaction.

Snapshot/component keys and abort/generation guards discard late results.
Reanalysis, CV replacement and relevant job/form changes clear cards immediately;
expired/replaced contexts require explicit Reanalyze. Source-changing actions are
disabled during selection. Evidence navigation reuses the existing reveal,
instant-scroll and focus callback. Clipboard errors leave exact wording available
for manual copy. Parsed-text and canonical-requirement provenance labels avoid
claiming original-file positions or verbatim uploaded-JD traceability.

The browser has excerpts only: its runtime checks establish source identity,
evidence equality, safe offset shape/length and wording/clarification exclusivity;
full-source span equality and unique-anchor validation remain backend-owned.
No schema library, backend correction, new persistence or P8 model is needed.

### P7.4.1 Dedicated Improve CV and shared match owner

Improve CV is now a separate, always-accessible Job Details tab. The already
mounted CvMatchPanel remains the single owner of saved-CV/match state and renders
sibling CV Match/Improve CV panels selected by JobEditor. This avoids lifting all
matching state into the editor or adding a global provider/store. Switching tabs
preserves one result/identity and does not invoke analysis or selection. A small
inspection handle reuses the existing exact-parent reveal/scroll/focus flow.

Suggestions require a successful current analysis. Dirty job forms, reanalysis,
CV replacement, saved-job revision changes and rejected/expired snapshots disable
selection and clear actionable cards. An owner-local save revision invalidates
matches even when saving leaves editable form JSON unchanged. A client lifetime
timer is conservative UX; backend snapshot/revision checks remain authoritative.
Cards default to two, with Show all/less and optional evidence/provenance details.
Only the neutral server clarification template was shortened; factual wording,
provenance contracts and copy validation remain server-owned and unchanged.

The Vietnamese database proficiency one-of family now parses before P6's generic
unresolved-quantity guard. Exact alternatives retain a shared proficiency context;
explicit level declarations or narrowly demonstrated production administration
with multiple database responsibilities can support one alternative. Bare names,
ordinary use, aspirations and negatives cannot. Recovery is restricted to this
recognized family and still respects rejected-evidence suppression and conflict
precedence. Existing P6 parent weights, AND/OR aggregation and other requirement
families are unchanged. The [P7 audit](audits/p7-cv-improvement-design.md) records
synthetic evidence cases, grammar bounds, shared-state tradeoffs and verification.

### P7.4.2 Database observations versus qualification support

Database/proficiency coverage now retains bounded original-source observations
(`mention` or `experience`) when the requested proficiency remains unverified.
These additive component fields and qualification reasons prevent ordinary
SQL Server project evidence from disappearing merely because it does not satisfy
a higher level predicate. Qualification-support quotes, OR credit and P6 weights
are unchanged; observations cannot authorize matching credit or copyable wording.
An explicit use denial can conflict with documented work, while a statement of
insufficient proficiency does not itself contradict ordinary use. Source text,
negation, rejected-evidence safeguards and project attribution remain intact.
Detailed observation rendering and compact Improve CV redesign are deferred;
the [P7 audit](audits/p7-cv-improvement-design.md) records the synthetic pipeline
trace and the boundary between documented work and verified requirement support.

### P6 reliability: recover managed-language work context

The recognized managed-language experience OR family now reuses bounded original
CV passage choices and exact quote resolution to recover a stronger professional
work passage after weak or empty model selection. It requires explicit language,
software development and professional context together; adjacent recognized
employment/role/project attribution is retained rather than truncated or borrowed
across entries. Bare lists, learning, aspirations and unrelated technologies cannot
authorize experience credit. Existing invalid-evidence suppression, negation,
minimum duration and conflict precedence still apply. Generic matching families,
P6 weights and aggregation remain unchanged. A broader matcher or prompt rewrite
was unnecessary for the confirmed recovery gap. The [P7 audit](audits/p7-cv-improvement-design.md)
records synthetic regressions, real-provider acceptance and bounded-context limits.

### P6 targeted proficiency and AI familiarity semantics

Recognized database-proficiency OR groups now use three bounded evidence levels:
mentions remain Unknown (0), exact substantive professional use is Partial (0.5),
and credible declarations or directly attributed practical database responsibilities
can be Matched (1). OR uses the strongest alternative, never sums evidence across
alternatives; required/preferred weights remain 3:1. The same exact-span, attribution,
negation, aspiration and conflict gates apply to selection and bounded recovery.
Generic MyBatis optimization cannot establish SQL Server responsibility/proficiency.

The exact Axon familiarity-or-interest sentence has two scoped OR predicates;
contextual development-tool use or explicitly relevant interest may satisfy it.
Interest does not establish professional experience, code generation or automation
experience, and this exception does not weaken other aspiration or AND policies.
Both families reuse existing bounded source choices, quote resolution and recovery.
CV Match renders exact source observations separately from qualification support,
including Partial reasons; uncredited mentions remain visible. No P7 redesign,
persistence, dependency or infrastructure change is needed. The [P7 implementation
record](audits/p7-cv-improvement-design.md) records acceptance and remaining bounds.

### P6 database PDF line and attribution recovery

Database-use classification now creates a temporary semantic view for a recognized
soft-wrapped preposition/database continuation, retaining the original source span
for every result. Sentence, bullet, blank-line and heading boundaries prevent joining.
Recognized database-proficiency matching may add up to 20 exact attributed work
candidates (2,000 characters each): three adjacent employer/role/project headers
plus one work line and its optional continuation. Both the model allowlist and
server recovery use these candidates. The generic three-span window, attribution
guards, database qualification levels, OR credit, weights and accepted Axon policies
are unchanged. The [SQL layout report](audits/p6-sql-server-layout-diagnosis.md)
records the focused regressions and bounded real-provider acceptance.

### P6 nominal database development responsibilities

Database observations now recognize bounded “Development of”, “Implementation of”
and “Responsible for developing/implementing” software responsibilities with an
explicit using/with/on relationship to a named database, including an explicit
coordinated use list. The software object and tool clause are bounded; raw stack
co-occurrence is insufficient. Professional context must come from the statement
or preceding recognized attribution, never an unrelated work bullet or a later role.
The existing exact-span resolver, continuation rules and candidate bounds are reused;
only database attributed-candidate starts gain these nominal forms. Experience earns
the existing Partial credit, not proficiency. Explicit denial of the same development
responsibility retains conflict precedence; lack of proficiency or administration
responsibility does not contradict ordinary use. No other requirement family,
weight, UI or infrastructure changes. The [SQL layout implementation record](audits/p6-sql-server-layout-diagnosis.md)
contains synthetic regressions and real-provider acceptance.

### P6 nominal database leadership prefix

The database-only nominal responsibility grammar accepts a past-tense leadership
verb and definite article before its existing development/implementation-of form.
This is a prefix alternative only: object/use parsing, attribution, negation,
continuation boundaries, Partial credit and proficiency qualification are unchanged.
Synthetic prefix regressions live in `cv-match.database-prefix.spec.ts`; no private
source text or diagnostic payload is retained in repository files.
