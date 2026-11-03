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

`discovery` retrieves the configured Axon and Backbase public Greenhouse boards
on demand, ranks using the supplied filters, and delegates canonical job storage
to OpportunitiesService. Duplicate imports preserve existing jobs. This is not
background crawling, auto-apply, or CV fit analysis. The legacy `jobs` feed module
and `analysis` transport remain in the API; they do not replace the saved-job
workflow.

URL/page import reuses review/save rather than adding a second job model.
Server-side URL fetching is restricted and bounded; open-page import validates
its supported payload, origin, and nonce handshake. Importing or saving a job
does not submit an application or send messages.

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
range and filtered total without extra API calls. Discover Jobs retains its
existing import-triggered refresh.

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
shrink, but that should not move the toolbar. Discovery is capped at 30% of the available Inbox allocation and scrolls when
expanded, rather than consuming 35% of the entire viewport. The Inbox outer area allows overflow
as a fallback; short screens, zoom, expanded discovery and nested scrolling need
real-browser acceptance. Smoothness has not been browser verified.

The Inbox wraps the unchanged DiscoverJobs component in a disclosure controlled by a
button with aria-expanded and aria-controls, collapsed initially. The component stays mounted so toggling preserves
input and in-flight discovery state. A Saved Jobs section groups the total count,
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
