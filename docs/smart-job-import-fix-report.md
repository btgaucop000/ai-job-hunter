# Smart Job Import end-to-end fix

## Decision

Keep the existing codebase, PostgreSQL, bounded PDF/DOCX parser and local Ollama
provider. Fix the opportunities request policy, keep local-only protections, and
verify one real synthetic inference plus editable review/save/persistence.
No matching, crawling, new provider, authentication or deployment work.

Add Job: <http://127.0.0.1:5173/jobs/new>

## Root cause

The exact error originates in `localWrite` in
`apps/api/src/opportunities/opportunities.controller.ts`. It catches rejection
from `checkAnalysisSecurity` and throws HTTP 403, previously containing only
`Local browser requests only`.

That checker requires exactly one raw Host and Origin header and exact allowlist
membership. The opportunities API reused `localAnalysisSecurity`, whose allowlist
contained only `127.0.0.1` at ports 5173 and the configured API port. It rejected
`http://localhost:5173`, although localhost is a normal local development alias.
Vite forwards Host/Origin and routes `/api` to `http://127.0.0.1:3000`; it does
not convert a browser's localhost Origin to 127.0.0.1.

Before the fix, synthetic malformed uploads through the actual Vite proxy showed:

| Origin                            | Before                                   | After                                    |
| --------------------------------- | ---------------------------------------- | ---------------------------------------- |
| `http://127.0.0.1:5173`           | 400 upload validation; security accepted | 400 upload validation; security accepted |
| `http://localhost:5173`           | 403 `Local browser requests only`        | 400 upload validation; security accepted |
| missing                           | 403                                      | Remains rejected by the checker          |
| `http://localhost:5174` or `null` | Untrusted by original allowlist          | 403, still blocked                       |

These deliberate malformed bodies never reached inference. Successful localhost
extraction is covered by the fake-provider HTTP integration test; reviewed live
save also succeeded with a localhost Origin.

**Evidence limit:** no real browser tool or original browser request headers/HAR
were available. The localhost mismatch is a reproduced cause of the exact error,
not proof that the user's original browser sent localhost. Missing/duplicate or
other untrusted headers cause the same rejection. A browser-header clarification
was requested; no reply was available before completing this fix.

The no-AI guard was a separate historical blocker. At the start of this fix the
actual API was already running through normal tsc-watch with
`node --env-file-if-exists=../../.env --enable-source-maps dist/main.js`.
There was no no-AI `--import` preload or NODE_OPTIONS guard. No environment file,
credentials, Windows tool or Ollama installation was changed.

## Fix

- Added `localOpportunitySecurity`, extending the local opportunities allowlist
  only with localhost aliases at the existing permitted ports.
- Kept exact Host/Origin checks, duplicate/missing-header rejection and the
  original stricter CV analysis policy. No wildcard origins, arbitrary ports,
  LAN addresses or forwarded-header bypass.
- Made Vite's `changeOrigin: false` explicit and improved the denial message with
  the supported workspace URLs.
- Added a safe `errorCode` to AI fallback responses, distinguishing allowlisted
  provider failures from request-security failures without exposing payloads.
- Captured the one real normalized synthetic inference result as a frontend
  fixture and verified field display, conflict acknowledgment and manual edits.

No schema migration or new dependency was needed. Existing source evidence,
unknown handling, conflict gating, manual fallback and tracker persistence remain.

## Evidence

### Running configuration and one actual inference

Metadata checks returned HTTP 200 from local Ollama:

- Provider: `ollama`
- URL: `http://127.0.0.1:11434`
- Configured model: `qwen3:4b`
- Ollama version: `0.40.10`, matching the pinned profile
- Selected model digest: matched the pinned provider profile

Exactly **one** real inference was invoked through
`POST http://127.0.0.1:5173/api/v1/opportunities/extract`, with canonical local
Origin, a synthetic recruitment post and synthetic PDF. The provider's existing
partial path performs one generation with a 90-second deadline and 2048-token
output bound; the HTTP client had a 115-second bound. There was no measurement,
retry, repair or additional inference.

Actual result: **HTTP 200, 8,743 ms, `error: null`, `errorCode: null`**.

| Field                           | Actual normalized result                                 |
| ------------------------------- | -------------------------------------------------------- |
| Company                         | `Example Labs`, supported only by JD evidence            |
| Recruitment agency              | `Example Talent Agency`, from post                       |
| Location                        | `Example City`, from JD                                  |
| Employment type                 | `Full-time`, from JD                                     |
| Required skills                 | `TypeScript`, from JD                                    |
| Original URL                    | `https://example.com/synthetic-job`, from post           |
| Work mode                       | Blank CONFLICT: post `Remote`, JD `Hybrid`               |
| Seniority and salary            | Blank MISSING                                            |
| Job title and recruiter/contact | Blank MISSING; required manual correction                |
| Job description                 | Both source texts preserved in the assembled description |

One candidate was discarded by the evidence checks. The normalized response does
not identify that candidate, so no unsupported explanation is inferred. This was
a successful structured integration call with **partial field coverage**, not
proof of complete or reliable extraction. Title/contact omissions remain a model
quality limitation and are visible for manual correction.

### UI mapping, save and persistence

The actual normalized result is in
`apps/web/test/fixtures/smart-import.synthetic-result.json`. The React DOM test
replays it without inference, verifies the displayed values and evidence, leaves
unknown fields empty, checks the blocked save on conflict, corrects title/contact,
selects Hybrid, acknowledges review and saves.

Separate live HTTP checks used that same result and original PDF, not another
extraction:

- Save with unreviewed conflict: HTTP 400, `Review every conflicting field before saving.`
- Save after manual corrections and conflict acknowledgment: HTTP 201.
- Fresh no-cache detail read: HTTP 200, all edited/imported values persisted.
- Original document download: HTTP 200, byte-for-byte equal to uploaded PDF.
- Exact original post and parsed JD text preserved.
- Salary and seniority remain empty.

Retained synthetic record:
`f70b72c8-4014-4683-8f9e-6a3ac27a5471`, titled
`[Synthetic verification] Synthetic Backend Engineer`.

Saved detail:
<http://127.0.0.1:5173/jobs/f70b72c8-4014-4683-8f9e-6a3ac27a5471>

Synthetic PDF download:
<http://127.0.0.1:5173/api/v1/opportunities/f70b72c8-4014-4683-8f9e-6a3ac27a5471/document>

Only synthetic content was used. Existing development data and earlier synthetic
records were preserved; none was deleted. Runtime source-watch reloads used the
normal API launch. The no-AI preload was not reintroduced.

### Automated commands and actual results

| Command                                             | Actual result                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------- |
| Focused Jest command below                          | 126 passed across 3 suites                                             |
| `pnpm --filter @ai-job-hunter/api test:integration` | 19 passed across 3 suites; fake provider, no live inference            |
| `pnpm --filter @ai-job-hunter/web test`             | 96 passed; 7 existing opt-in tests skipped                             |
| `pnpm typecheck`                                    | Both applications passed                                               |
| `pnpm build`                                        | Both applications passed; existing approximately 566 kB bundle warning |
| `pnpm lint`                                         | Passed                                                                 |
| Prettier check on exact changed paths               | Passed                                                                 |
| `git diff --check`                                  | Passed                                                                 |

```bash
pnpm --filter @ai-job-hunter/api test --runTestsByPath \
  .test-dist/test/unit/opportunities.security.spec.js \
  .test-dist/test/unit/job-import.spec.js \
  .test-dist/test/unit/analysis.transport.spec.js
```

The security tests cover explicit aliases, missing/null/foreign origins, lookalike
hosts, LAN addresses, wrong ports, duplicate headers and forwarded-header spoofing.
Existing CV policy tests still pass. Post-only, PDF-only, DOCX-only, combined,
company-only-in-JD, unknown company, source conflicts, safe fallback and tracker
updates are covered by the synthetic integration suite. Only the combined input
was sent to real Ollama under the one-call authorization.

## Exact files changed in this fix

- `apps/api/src/opportunities/opportunities.security.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/test/unit/opportunities.security.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/web/vite.config.ts`
- `apps/web/test/job-import.test.tsx`
- `apps/web/test/fixtures/smart-import.synthetic-result.json`
- `README.md`
- `docs/architecture.md`
- `docs/smart-job-import-fix-report.md`

Unrelated uncommitted work and the Git index were preserved. No commit, push,
reset, clean, stash, merge or rebase was performed.

## Blockers

Real-browser interaction, extraction-to-form rendering in a real browser, and
actual browser refresh are **NOT_VERIFIED**. No browser automation tool or
installed browser was available. HTTP acceptance/persistence and React DOM replay
are explicitly not substituted for browser acceptance.

Title and contact were not populated in the single model result; the working
manual correction path was tested and saved. Extraction completeness and broader
model quality remain limited. Local-only protections intentionally still reject
null, missing, forwarded-page and other untrusted origins. If the original 403
persists in a normal browser at 127.0.0.1, its actual Host/Origin are needed to
resolve that specific browser case rather than guessing or weakening the guard.

The single inference authorization is consumed. No further agent-run inference
may be attempted without new authorization. Authentication/public deployment and
private-document verification remain outside scope.

## Next action — exact manual browser acceptance

Without another inference:

1. Open the saved detail URL above in a normal browser at `127.0.0.1:5173`.
2. Verify company, agency, location, employment type, TypeScript skill and original
   URL. Verify Hybrid is the reviewed work mode and salary/seniority are blank.
3. Expand source evidence and parsed JD text; download the original synthetic PDF.
4. Edit Application notes, save, and refresh. Confirm the edit and original sources
   remain. This exercises the real browser's write-origin checks without inference.
5. If 403 occurs, inspect Network: request URL, Host and Origin. Supported local
   origins are explicit 127.0.0.1/localhost URLs at port 5173/configured API port.
   A null or forwarded-page origin remains deliberately denied.

For full new-job extraction acceptance, **new inference authorization is required**:

1. Download the synthetic PDF from the saved record link above.
2. Open <http://127.0.0.1:5173/jobs/new> and upload that PDF.
3. Select Facebook explicitly and paste this synthetic post:

```text
Synthetic recruitment post for verification only.
Job title: Synthetic Backend Engineer
Recruitment agency: Example Talent Agency
Recruiter/contact: Alex Example, synthetic.recruiter@example.com
Work mode: Remote
Original URL: https://example.com/synthetic-job
```

4. After authorizing one additional call, click Extract with AI once. In Network,
   confirm the same-origin `/api/v1/opportunities/extract` request is accepted.
5. Check editable populated fields, JD-only company and source quotes. Verify the
   Remote/Hybrid conflict requires review. Do not treat missing fields as facts;
   manually correct title/contact if absent. Leave unsupported values blank.
6. Acknowledge conflicts, confirm/save, open the inbox/detail, refresh and verify
   saved fields, notes, dates and original document remain.

This fix is stopped. No additional inference, matching or discovery work is running.
