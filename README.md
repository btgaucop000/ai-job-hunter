# ai-job-hunter

Local single-user job inbox, application tracking, JD import/review, and explicit
CV–JD matching with local Ollama. The primary checkout is
`/home/tientb/projects/ai-job-hunter`. Authentication and multi-user deployment are
not implemented. Matching results require review; missing evidence is not proof
of missing ability.

## Implemented workflow

- `/` redirects to `/dashboard`; `/dashboard` and `/jobs` show Job Inbox.
- `/jobs/new` imports a job, then presents Review & Save. Manual entry, pasted
  text, PDF/DOCX, supported URL import, and supported open-page bookmarklets feed
  the same review/save flow. Extraction is an explicit action.
- `/jobs/:id` provides Overview, CV Match, Application, and Edit JD tabs.
- Application status, notes, recruiter/contact notes, contact dates, and follow-up
  dates persist in PostgreSQL. P4.1 adds applied date and application channel.
- CV Match saves parsed CV text locally and analyzes the latest saved CV/job only
  when requested. Results are shown in the UI, not written into tracking fields.
- On-demand discovery queues candidates from the configured Axon, Backbase,
  Temus and Go1 Vietnam Greenhouse boards for explicit review and Save. Discovery ranking is not CV suitability scoring.
- `/cv` retains the CV/JD parsing and review dashboard. Candidates, Matches, and
  Settings remain placeholders.

No automatic application submission, messaging, calendar sync, or status history
is implemented.

## Local development

Use Ubuntu WSL2, Bash, Node 24.22.1 and pnpm 12.14.0:

```bash
cd /home/tientb/projects/ai-job-hunter
source "$HOME/.nvm/nvm.sh"
nvm use
pnpm install --frozen-lockfile
```

Preserve existing `.env` and `.env.test`. For a new installation only, copy the
example files without overwriting existing files and set distinct local passwords.
Never commit environment files, resumes, credentials, or production data.

Development requires `NODE_ENV=development`, `DB_ENV=development`, host
`127.0.0.1`, and database/user `ai_job_hunter_dev`. The Compose default database
port is 5432; retain the existing configured `DB_PORT` when reusing a local
installation. Port 5433 is reserved for tests. Process environment values override
file settings.

After checking the target database and authorizing any change to existing data:

```bash
pnpm db:up
pnpm db:status
pnpm db:migrate
pnpm dev
```

Migrations never run automatically. The commands above are setup instructions,
not a statement that migrations have been applied to an existing installation.
Do not reset existing volumes to resolve configuration or credential problems.

Open `http://127.0.0.1:5173`. Vite proxies `/api` to
`http://127.0.0.1:3000`; the API prefix is `/api/v1`. Changing `API_PORT` alone
does not update the Vite proxy. Local write endpoints validate Host and Origin;
arbitrary alternate frontend ports are not supported by default. Vite preview
on port 4173 is not the development API integration entry point.

- `GET /api/v1/health/live` checks process liveness without querying PostgreSQL.
- `GET /api/v1/health/ready` checks database readiness. It does not verify Ollama.

The AI provider currently supports local Ollama only. Defaults are
`http://127.0.0.1:11434`, `qwen3:4b`, and a 120000 ms timeout. Generation checks
the pinned server/model profile in `apps/api/src/ai/ollama.context.ts`.
Manual tracking does not require inference. No model installation or cloud
fallback occurs automatically.

## Commands and verification

| Command                                                                | Purpose                                      |
| ---------------------------------------------------------------------- | -------------------------------------------- |
| `pnpm dev`                                                             | Run API compile/restart watcher and Vite     |
| `pnpm --filter @ai-job-hunter/api typecheck`                           | API and test TypeScript checks               |
| `pnpm --filter @ai-job-hunter/web typecheck`                           | Web TypeScript checks                        |
| `pnpm --filter @ai-job-hunter/api test:compile`                        | Compile backend tests into `.test-dist`      |
| `pnpm --filter @ai-job-hunter/web exec vitest run test/inbox.test.tsx` | Focused Inbox/Application tests              |
| `pnpm db:status` / `pnpm db:migrate` / `pnpm db:revert`                | Show/apply/revert development migrations     |
| `pnpm db:test:status` / `pnpm db:test:migrate` / `pnpm db:test:revert` | Equivalent isolated test operations          |
| `pnpm build`                                                           | Production compilation for both applications |
| `pnpm test` / `pnpm test:integration`                                  | Full unit/component suite / database suite   |
| `pnpm lint` / `pnpm format:check`                                      | Repository-wide quality checks               |

Use focused checks for small changes according to [AGENTS.md](AGENTS.md). Full
checks are for release checkpoints or explicit requests. No command listed here
is a claim of a fresh passing result.

Compiled migration commands append `:compiled` and require current API output
in `apps/api/dist`. Reverting removes the latest migration's schema additions;
review its impact before running it against a database with user data.

The separate test Compose project uses tmpfs, port 5433, database/user
`ai_job_hunter_test`, `DB_ENV=test`, and `NODE_ENV=test`. `pnpm db:test:up` and
`pnpm db:test:down` manage that disposable database. Integration tests must never
use development or production targets, and must not run concurrently against the
same test database. Some HTTP tests use Host port 3000; align their process
`API_PORT` with the test fixture when invoking them.

See [architecture](docs/architecture.md) for module boundaries, persistence,
security, and P4.1 migration verification. Older checkpoint and investigation
reports in `docs/` record historical work, not current acceptance results.

### Application details (P4.1)

Run `pnpm db:migrate` before using the updated API. In a saved job's Application
tab, optionally enter the date you actually applied and the application channel
(e.g. company website or referral), then **Save changes**. Both fields can be
edited or cleared; unknown dates remain blank and channel is separate from job
source. Contact dates represent actual contact. Follow-up date is a plan to
proactively contact HR if no response arrives, not a record of contact. Nothing
is sent automatically. Last HR contact date edits the latest stored contact date. Save replaces or
clears only that entry, preserves earlier history, and leaves follow-up unchanged.

### Due follow-ups (P4.2)

Job Inbox labels active jobs with past follow-up dates as Overdue and dates equal
to the browser's local calendar day as Due today. Future dates remain dates;
missing dates show —. REJECTED and CLOSED jobs keep their saved dates but have no
actionable label. Select **Due follow-ups** to show only overdue/due-today active
jobs in the existing order. Click a due label to open the job's Application tab.
Labels refresh across local midnight and when the page resumes. This is a planned
HR contact reminder only; it never records contact, changes status, or sends a
message.

Job Inbox displays ten jobs per page. Pagination below the table shows the current
range and filtered total. Changing Due follow-ups returns to page one; paging and
filtering reuse loaded jobs without fetching again or changing their saved order.

Open **Discover Jobs** in the navigation (or `/discover`) to use the discovery
form. It adds up to 50 new candidates per run to the persistent Discovery Queue.
Review candidates and explicitly Save to Inbox; discovery never saves automatically.
Use To review (NEW before SEEN), New, Seen, Saved, Dismissed, or All. The queue
uses ten items per page, with filter/page stored in the URL. Opening details does
not mark a candidate seen. Mark as seen and Dismiss are explicit actions.
Results stay on the Discover page; choose **View Job Inbox** when ready. If no jobs
are found, adjust preferences or use **Add Job**. The empty Inbox also links to
Discover Jobs and Add Job.
The Saved Jobs section shows the total saved count and groups the All jobs /
Due follow-ups selection with the table. The total heading counts all saved jobs;
the pagination range counts the selected filter's results.

The Discover page uses the Discovery Queue backend under `/api/v1/discovery`.
Apply the additive candidate migration using the existing migration commands
before using it; there is no historical backfill. Existing Inbox jobs stay unchanged.
The retired `/api/v1/opportunities/discover` returns 410 to stale clients.

- `POST /discovery/runs`: existing discovery preference body; returns
  `found`, `added`, `refreshed`, `remaining`, `errors`, `scannedAt`, `scope`.
- `GET /discovery/candidates?filter=to-review&page=1`: ten rows per page.
- `GET /discovery/candidates/:id`: candidate detail without changing review state.
- `PATCH /discovery/candidates/:id/status`: `{ "status": "SEEN" }` or
  `{ "status": "DISMISSED" }`.
- `POST /discovery/candidates/:id/save`: `{}` creates or links an Inbox job
  atomically. A `POSSIBLE_DUPLICATE` 409 requires explicit confirmation with
  `{ "confirmSeparate": true }` to create a separate job. An
  `AMBIGUOUS_INBOX_MATCH` 409 cannot be bypassed by that confirmation.

All paths above use the `/api/v1` prefix and mutations retain local Host/Origin
protection. Save returns `candidateId`, `status`, `opportunityId`, and an outcome
of `created`, `linked_existing`, or `already_saved`. Repeated Save returns the same
Inbox link. The UI asks for confirmation before creating a separate possible
duplicate; multiple exact matches cannot be overridden. After Save, use Open Inbox
job. Discovery reports Added / Refreshed / Remaining / Errors and stays on the page.
