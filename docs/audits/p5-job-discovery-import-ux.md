# P5.1 — Job Discovery & Import UX Audit

Date: 2026-11-03. Scope: audit only; no application changes.

This is a **code-based audit**. No journey was exercised in a real browser. “Confirmed” below means the behavior follows from the inspected code, not that a browser acceptance test passed. The accepted compact Inbox and Discover Jobs layouts remain the baseline.

## A. Current user journeys

The implemented flow has two branches: Discover Jobs imports directly into the Inbox; Add Job stages individual sources for review. Discovery does not pass through Import Sources or Review & Save.

| Method                   | Entry point                  | Main steps                                                                                                                                                    | Destination                                          |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Public-feed discovery    | Inbox → expand Discover Jobs | Choose stacks/preferences → Discover Jobs → inspect counts/errors                                                                                             | Up to 50 new records saved directly; Inbox reloads   |
| ITviec direct URL        | Add Job → Job URL (default)  | Paste individual HTTPS ITviec URL → Fetch from URL → preview → optional AI extraction or manual review → confirm save                                         | Saved job detail; return to Inbox through navigation |
| TopCV bookmarklet        | Add Job → Bookmarklet        | Install bookmark → open supported individual TopCV page → run bookmark → new local Add Job window receives content → optional extraction/manual review → save | Saved job detail in the new window                   |
| VietnamWorks bookmarklet | Same bookmarklet card        | Install bookmark → open supported individual job, expand required content → run bookmark → receive/preview → review → save                                    | Saved job detail in the new window                   |
| Paste description        | Add Job → Paste JD           | Paste recruitment text (up to 12,000 characters) → optional Extract with AI → Review & Save; without extraction, enter required title manually                | Saved job detail                                     |
| Upload PDF/DOCX          | Add Job → Upload JD          | Select supported file → automatic text preview → optional extraction/manual review → save                                                                     | Saved job detail with original document preserved    |

Evidence: `apps/web/src/features/inbox/JobInbox.tsx:34`, `DiscoverJobs.tsx`, `ImportMethodCards.tsx`, `JobEditor.tsx:176,230,365,764`, `TopcvBookmarkletInstall.tsx`, and `topcv-bookmarklet.ts:431` (web paths in this report are under `apps/web/src/features/inbox/` unless fully qualified).

### Existing strengths and boundaries

- Discovery explicitly names Axon and Backbase. Stacks match using “any”; other preferences rank and retain unknown metadata. A busy indicator, disabled inputs, partial-source errors, duplicate counts, remaining-count guidance and five-minute cache disclosure exist. Collapse uses a labelled button with `aria-expanded`; hiding the panel keeps the component and its state mounted. No concrete reason to redesign the compact layout was found.
- Import cards identify supported platforms/formats. Unsupported URL guidance points to bookmarklet, paste or upload. Fetching and AI extraction are explicit actions; manual review/save is available without AI.
- Switching import methods keeps inputs. Back from review also retains the form. Save failure does not reset it. Manual edits are protected during extraction. Route navigation and unload guards warn about unsaved changes; these are warnings, not persistent draft storage.
- Review states that only title is required. Evidence quotes identify recruitment post versus document. Conflicts open their evidence, allow choosing a candidate or typing a correction, and require acknowledgement; editing a conflict resets acknowledgement. Save stays disabled for unresolved conflicts.
- New-job success navigates to its detail page. Existing-job saves display “Changes saved.” Double-click saving is guarded locally. No import-preview path itself overwrites a saved job.
- Preserve URL allowlisting, public-IP checks and pinned transport, redirect rejection, bounded responses and timeout. Preserve bookmarklet local-origin/source-window/nonce checks, one-use payload handling, size limits and omission of credentials. Recovery must not bypass these protections.

## B. Findings

### Confirmed issues from code

#### P5-UX-01 — Repeat fetching duplicates source text and can mix two jobs

- **Severity:** High.
- **Affected journey:** ITviec fetch → retry/change URL → Review & Save; shared page-preview application helper.
- **Observed behavior:** `applyUrlJobPreview` always appends incoming `sourceText` to existing `postText`, clears import review and fills only empty, unedited fields. Fetch remains available after success. Fetching the same job again adds the same text again and can exceed the 12,000-character combined-source limit. Fetching job B after job A can leave A's populated title/company/description while the user-entered URL is B and both descriptions are in source text.
- **User impact:** A normal retry can fail solely because content was duplicated. Changing the source can create a misleading draft requiring manual repair; no claim is made that a user has actually saved such a draft.
- **Evidence:** `job-url-import.ts:55` (`applyUrlJobPreview`); `JobEditor.tsx:335` (`fetchFromUrl`) and URL panel at line 782. No browser observation.
- **Smallest practical improvement:** Make repeat import of the same source idempotent. For a different URL, offer explicit replacement of the previous fetched source while preserving deliberate edits and separately entered sources. Do not silently append a second job or erase manual content. Reuse existing fetched-preview and edited-field tracking; keep network protections unchanged.

#### P5-UX-02 — Paste fallback can keep a failed attachment active

- **Severity:** High.
- **Affected journey:** Malformed/unsupported-content PDF or DOCX → Paste JD → extract/save.
- **Observed behavior:** After extension/size checks, `attach` assigns `file` before parsing. Parse failure sets a source error but retains that file. Changing cards only changes `importMethod`; both extraction and saving still include `file`. Server extraction and creation parse it again. “Remove selected document” exists only in the upload panel. Some parser errors explicitly say remove the attachment, but others recommend pasting without that prerequisite.
- **User impact:** Following the apparent paste recovery route can reproduce the same parsing error and block saving a valid pasted/manual job until the user returns to Upload JD and removes the file. Merely selecting Paste JD does not isolate its input.
- **Evidence:** `JobEditor.tsx:441` (attach), `:230` (extract), `:365` (save), `:770` (method switching), `:871` (remove action); `apps/api/src/opportunities/opportunities.service.ts:110`; `apps/api/src/opportunities/job-import.service.ts:72`; `apps/api/src/opportunities/job-document.error.ts`. No browser observation.
- **Smallest practical improvement:** Expose a clear “Remove failed document and use Paste JD” recovery action, retaining other inputs. Show any still-attached failed file across methods and prevent an unexplained retry of it. Do not silently discard documents merely because the user switches cards: combining valid sources is intentional.

#### P5-UX-03 — Duplicate detection is late and recovery does not identify the record

- **Severity:** Medium.
- **Affected journey:** Any individual import with an already-saved URL → Review & Save.
- **Observed behavior:** URL and page preview endpoints do not check stored jobs. Manual creation checks the normalized URL at save and returns a clear 409 message directing the user to Job Inbox, but without the existing record ID or a link. The user may have fetched, extracted and edited before finding out. Same-title/company imports without matching URLs are not checked by manual creation.
- **User impact:** Avoidable repeated effort and manual searching; leaving a dirty draft also invokes the unsaved-change guard. URL-less duplicates can be created without a warning.
- **Evidence:** `apps/api/src/opportunities/opportunities.service.ts:110`; `apps/api/src/opportunities/opportunities.controller.ts` (`importUrl`, `importPage`, `create`); `JobEditor.tsx:365`; `opportunities-api.ts:140`; `UnsavedJobGuard.tsx`. No browser observation.
- **Smallest practical improvement:** Surface a non-destructive early warning for an exact normalized-URL match, with an explicit link to the existing job and retention of draft inputs. Reuse current matching semantics and Inbox data/API capabilities; retain server save-time validation. Do not introduce fuzzy blocking or automatic merging in P5.2.

#### P5-UX-04 — Discovery saves immediately, but action and empty-result copy are incomplete

- **Severity:** Medium.
- **Affected journey:** Discover Jobs → Inbox.
- **Observed behavior:** Introductory copy says “Import,” but the action is “Discover Jobs”; the 50-job limit is disclosed in the returned summary, after saving. There is no staging/review step. Zero matches with no source errors use a success alert containing numerical counts, without a suggestion to broaden stacks or use Add Job. Inbox refresh preserves the existing page and due-only filter, so newly saved jobs need not be visible.
- **User impact:** Users can mistake discovery for preview/search, or see an import count without finding the new rows. The code confirms these states; whether the existing wording confuses users remains a usability question.
- **Evidence:** `DiscoverJobs.tsx` (intro, action, summary); `apps/api/src/discovery/discovery.service.ts`; `apps/api/src/opportunities/opportunities.service.ts:53`; `JobInbox.tsx:34,65,119`. No browser observation.
- **Smallest practical improvement:** Explain before the action that up to 50 jobs are saved directly. Add zero-result guidance and, when applicable, explain that the current Inbox filter can hide imports. Preserve pagination/filter semantics and compact layout.

#### P5-UX-05 — Required-field errors are not attached to review fields

- **Severity:** Medium.
- **Affected journey:** Manual or incomplete import → Review & Save.
- **Observed behavior:** The form uses `noValidate`. Blank title and invalid URL produce a top-level error; review-field error props reflect conflicts, not these validation failures. There is no targeted focus of the invalid field in `save`. Backend validation returns the generic “Invalid opportunity. Check required fields, dates and HTTP(S) link.”
- **User impact:** In a long review form, users must locate the offending input. The message is useful, but does not provide adjacent correction guidance as specified by the UX guidelines.
- **Evidence:** `JobEditor.tsx:365,719,741,1019`; `apps/api/src/opportunities/opportunity.validation.ts:44`. No browser observation; scroll/focus visibility is unverified.
- **Smallest practical improvement:** Reuse field error/helper-text props for title and URL, focus the first invalid field, and keep the summary. Avoid broad form abstraction changes.

#### P5-UX-06 — Some useful error and provenance context is hidden

- **Severity:** Low.
- **Affected journey:** Extraction busy, bookmarklet transfer, edited review fields.
- **Observed behavior:** The request helper replaces all HTTP 5xx messages with generic save/load guidance, including the explicit extraction-busy 503 recovery message. Bookmarklet payload processing sets `busy`, but its preview loading flag only tracks URL fetching; waiting for the handshake has no dedicated progress state and the card switches to Bookmarklet only after success. Evidence remains visible after manual correction without a per-field “edited” marker. Extraction success/warning notices sit inside the import step, which extraction then hides by switching to review.
- **User impact:** Users may not know what is in progress, why a safe operation failed, or whether a displayed quote supports their edited value. Visibility of these cues in a real browser is unverified.
- **Evidence:** `opportunities-api.ts:140`; `JobEditor.tsx:176,215,320,907,980`; `topcv-bookmarklet.ts:460`; `apps/api/src/opportunities/job-import.service.ts:65`.
- **Smallest practical improvement:** Add operation-specific safe fallback text and transfer status; expose extraction warnings in review and mark edited values. Keep unknown internal server errors hidden.

### Duplicate handling: confirmed rules and limits

| Operation                              | Detection                                                                                         | Result                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Discovery                              | Same source name + source job ID; normalized URL; or folded company + title + normalized location | Skip existing record; count duplicates. Transaction/advisory lock serializes discovery imports; existing records are not updated |
| Individual create                      | Nonempty normalized URL only, regardless of selected Source                                       | 409 before insert; existing record unchanged; no direct record link                                                              |
| Individual create with no matching URL | No title/company/source-ID comparison                                                             | New row can be created, including a repeat paste/upload without a URL                                                            |
| Edit existing record                   | No duplicate URL comparison                                                                       | Updates the explicitly addressed record; can make its URL match another record, without merging or overwriting that other record |

`apps/api/src/discovery/discovery.ts:118` normalizes by removing hash, selected tracking parameters, `www.` and trailing slash, sorting remaining query parameters, and comparing host/path/query (not scheme). It does not equate all alternate job links. `duplicateJob` at line 132 adds discovery identity and company/title/location matching. Creation and update are in `opportunities.service.ts:110,136`.

### Hypotheses / risks requiring reproduction

- **Concurrent duplicates:** Create uses check-then-insert without the discovery advisory lock; inspected entity/migrations contain no unique normalized-URL constraint. Two overlapping manual creates, or manual create plus discovery, could pass checks before either insert is visible. This race was **not reproduced**. A lost successful response followed by a retry can also produce a URL-less duplicate; no such failure was observed.
- **Browser transfer reliability:** CSP, popup/opener policy and external-page DOM changes may prevent bookmarklet delivery. Current code includes bounded waits and recovery messages, but neither site was exercised. No claim about current live-site compatibility is made.
- **Long waits:** Shared frontend fetch has no general deadline/cancel control (document parsing supplies an abort signal). Backend URL/AI paths have their own bounds. A stalled save/network request may leave the form busy; not reproduced.
- **Layout/accessibility:** Narrow screens, 200% zoom, focus after errors and discovery panel scrolling require browser verification. No clipping, inaccessible control or layout regression is claimed from inspection alone.

### Source reliability coverage

| Scenario                                             | Inspected behavior / recovery                                                                                             | Audit assessment                                                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unsupported/malformed URL                            | Frontend disables fetch and explains supported ITviec path or alternate method; backend validates independently           | Generally actionable; generic backend validation text still mentions TopCV although live direct transport rejects it                                                    |
| Fetch failure, redirect, blocked page, timeout       | Bounded five-second fetch, safe messages generally suggest paste; preview errors retain inputs                            | Existing recovery is useful; repeat-fetch semantics are P5-UX-01                                                                                                        |
| Missing/invalid bookmarklet payload                  | Origin/window/nonce checks; 30-second timeout; retry/manual-import guidance; source-page alert for blocked popup          | Security preserved; real browser behavior unverified                                                                                                                    |
| Empty/invalid pasted description                     | Whitespace-only text without document disables extraction; server enforces text type, 12,000-character bound and presence | Manual entry remains allowed with required title. Arbitrary nonempty text is not necessarily a valid JD; extraction/manual review handles it, with no quality guarantee |
| Wrong extension, empty/oversized file                | Frontend rejects non-PDF/DOCX, zero bytes or over 5 MiB; backend independently bounds/validates                           | Helpful format/size guidance; no new environment needed                                                                                                                 |
| Malformed, scanned or otherwise unsupported document | Preview parse errors, detailed DOCX recovery and documented 20-page PDF/no-OCR limits                                     | Failed-file retention creates P5-UX-02                                                                                                                                  |
| Extraction error                                     | AI failure returns retained source text and manual/retry guidance; review can proceed; parse failure occurs earlier       | No Ollama call made in this audit; busy 503 loses specific guidance (P5-UX-06)                                                                                          |
| Save failure                                         | Form/file retained; duplicate 409 is shown; storage 5xx gets safe API/retry message                                       | No automatic overwrite; field validation and duplicate navigation need improvement                                                                                      |

Additional evidence: `apps/api/src/opportunities/job-url-import.ts:322`, `job-url.transport.ts`, `job-import.upload.ts`, `job-import.service.ts`, `job-document.error.ts`, `opportunities.controller.ts` (`parse`); `SourceJdPreview.tsx`, `TopcvBookmarkletInstall.tsx`.

## C. Prioritized shortlist — proposed P5.2

At most three improvements, subject to product approval:

1. **Safe repeated/source-replacement imports (P5-UX-01).** Same-source retry must not duplicate text; importing a different URL must not silently combine unrelated jobs. Preserve explicit user edits and valid multi-source input.
2. **One-step failed-upload recovery (P5-UX-02).** Make removal of a failed attachment and transition to paste explicit and available where the error appears. Verify that subsequent extraction/save no longer resubmits the rejected file.
3. **Early exact-URL duplicate warning and navigation (P5-UX-03).** Identify the existing record before optional extraction/review work where possible, retain the draft, and preserve save-time checks. No fuzzy deduplication, automatic overwrite or merge.

Reuse the existing editor, source-preview component, input state and duplicate semantics. Future verification should use focused synthetic regression cases and browser journeys for these behaviors; race-proof persistence is a separate integrity decision. This audit does not authorize implementation.

## D. Out of scope / backlog

- Discovery wording/zero-result guidance, adjacent review validation, transfer progress and provenance/warning visibility (P5-UX-04–06).
- Product policy for URL-less or alternate-URL duplicates, edit-time duplicate warnings and concurrent-create guarantees. Company/title similarity should not automatically reject legitimate distinct openings.
- Persistent drafts, richer source replacement/history, bulk staging and selective discovery import.
- Additional sources, live-site compatibility maintenance and extraction-quality changes without a demonstrated UX regression.
- Inbox redesign, changed filtering/pagination, new infrastructure/dependencies, architecture refactoring and broader security auditing.

## E. Verification status

**Inspected in code:** Inbox/discovery entry, collapse and results; ITviec URL validation/fetch/preview; TopCV and VietnamWorks bookmarklet generation/transfer/payload validation; paste input; PDF/DOCX selection/preview/upload validation and parser error mapping; extraction orchestration/error paths (not extraction-quality reassessment); wizard navigation, evidence/conflicts, edit preservation, required-field validation, save success/failure and unsaved guard; manual/discovery duplicate matching, persistence paths and entity/migration constraints.

**Real browser flows exercised: none. Browser findings: not verified.** `ss -ltn` showed no listener on the configured frontend `127.0.0.1:5173` or API `127.0.0.1:3000`; `apps/web/vite.config.ts` confirms those development endpoints. No browser interaction tool was exposed. No servers, worktrees, Docker environments or databases were started. No external job fetch, bookmarklet execution, upload, save, application submission, private-data processing or Ollama invocation was performed.

**Unverified acceptance journeys:** successful live ITviec import; either live bookmarklet import; paste → review → save; synthetic PDF/DOCX → review; browser failure/recovery; layout/zoom/keyboard behavior; concurrent writes; current external-site markup/policies. No journey is marked passed based on source inspection or test definitions.

**Commands and actual results:** `cat`, `sed` and `rg` inspected instructions and relevant sources; `git status --short` was initially empty; `ss -ltn` produced the listener result above. `rg --files docs/audits` reported that the audit directory did not yet exist; the report creates it. Searches for `UNIQUE`, `unique` and `Index` in opportunity entity/migrations found no matches. No tests, builds, lint or typecheck ran, as requested. Existing test descriptions were consulted only as supporting context, not executed or claimed as passing.

**Changed files:** only `docs/audits/p5-job-discovery-import-ux.md`. No application/API/database/migration changes, new dependencies, commits, pushes or PRs. Stop at P5.1 and wait for product decisions.
