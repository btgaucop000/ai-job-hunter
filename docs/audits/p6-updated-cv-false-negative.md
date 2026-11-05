# P6.5 — Updated CV education false-negative diagnosis

Date: 2026-11-05. Branch: `fix/p6-match-semantics`.
**Local acceptance remains blocked.** Diagnosis only; no production changes.
Prior P6.4 acceptance covered its synthetic OR scenario, not this incident.

## Findings and confidence

1. **The current saved parsed CV contains the requested education evidence.**
   After explicit user authorization, a read-only SQL presence query returned only
   booleans and revision metadata. No CV text, filename, document bytes, credentials
   or connection string was returned, printed, logged or copied. The configured
   local development identity was checked through `databaseOptions('development')`;
   the connection default and transaction were read-only. No data writes or
   migrations occurred.
2. **A fresh CV can reproduce the exact reported aggregate without stale text.**
   Real synthetic PDF parsing → `saveCv` → in-memory repository → `analyze` →
   real prompt/schema/coverage/scoring yields **9/100, Matched 1, Partial 0,
   Unknown 14** when a controlled model omits all evidence selections. The sole
   supported row is recovered generic Minimum 6 years. New education text is
   verified in the actual constructed prompt. This is a controlled reproduction,
   not a capture of the user's model response.
3. **Education selection works; education omission is not recovered.** The public
   AI Solution Architect requirement forms one education OR parent, with degree
   fields as one alternative and equivalent practical experience as the other.
   Selecting the exact parsed Information Technology degree passage yields
   Matched and preserves that original source quote. Omitting it yields Unknown,
   because P6.4 recovery requires a component in the technical alias registry;
   education alternatives are outside that registry.
4. **A second backend false-negative is confirmed for split education lines.**
   An adjacent, source-valid passage containing the degree level on one line and
   field on the next validates as evidence, but `evaluateCoverage` splits it again
   and requires level and field within a single resulting passage. It yields
   Unknown. The authorized current saved-text check finds the degree and field
   together on a line, so this is not established as this incident's cause.

### Authorized saved-CV presence result

User approved a local read-only presence/revision check, with no CV content output
and no Ollama call. Only the following metadata was obtained:

| Check                                                                    | Result                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| Local-owner saved CV exists                                              | true                                                |
| Saved revision                                                           | **2026-11-05 10:57:54.950 UTC+7** (`03:57:54.950Z`) |
| Education marker present                                                 | true                                                |
| Bachelor degree word present                                             | true                                                |
| Information Technology phrase present                                    | true                                                |
| Explicit degree phrase present after whitespace/apostrophe normalization | true                                                |
| Stated graduation phrase/year present                                    | true                                                |
| Bachelor degree and Information Technology occur on the same parsed line | true                                                |

The SQL performed these checks inside PostgreSQL; plaintext was never selected
into the diagnostic process. This rules out missing requested education text in
the **current saved parse**. It does not prove which revision the prior completed
analysis used, whether its selected quote contained the necessary context, or
what the model returned. No private job, raw model response, previous result,
CV PDF bytes or full saved text was inspected. No private inference was run.

## Replacement and analysis lifecycle

Paths below are repository-relative and refer to current source.

| Boundary               | Actual code and safeguard                                                                                                                                                                                                                                                                                             | Remaining risk / interpretation                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace upload         | `apps/web/src/features/inbox/CvMatchPanel.tsx`, `upload` (around line 95): POST `/cv/current` with the selected file, await metadata, replace displayed CV, clear result on success. File input is reset so the same filename can be reselected. Buttons/input are disabled while busy.                               | Displayed filename is metadata, not a parse preview. It cannot attest to required phrases or the selected local file's intended contents.                                                                                                                                                                                                                                     |
| Upload parsing         | `apps/api/src/opportunities/opportunities.controller.ts`, `saveCv`; `job-import.upload.ts`, `readJobUpload`: bounded multipart PDF/DOCX bytes; no disk staging. `JobMatchService.saveCv` → `ExtractionService.parseCv` / `parseCvSource` → `DocumentParser` worker → `pdf.parser.ts`, `parsePdf` / `parsePdfAttempt`. | PDF text items are concatenated in parser order, with newlines on `hasEOL`; image content is not interpreted. A nonempty partial parse can be accepted even if some visual content is absent. Extraction warnings are not presented by the CV-save response. This remains a general risk, but requested degree text is present in the current saved parse.                    |
| Persistence            | `apps/api/src/matching/job-match.service.ts:48`, `saveCv`: upsert filename and `source.text` together by `LOCAL_OWNER_ID`. Failed/empty parsing exits before upsert. `saved-cv.entity.ts`: text is `select: false`; `updatedAt` is `UpdateDateColumn`.                                                                | Success does not independently verify every visual PDF section. No content hash, immutable CV revision ID or saved document bytes exist in this entity. Installed TypeORM's PostgreSQL upsert updates the update-date column using DEFAULT; no database mutation was needed to inspect this code.                                                                             |
| Reanalyze              | `CvMatchPanel.analyze` (around line 114) always POSTs a new `/opportunities/:id/match`; controllers mark responses `no-store`. Successful results replace state; failed reanalysis retains the previous result with an explicit error/retained-result notice.                                                         | Completed activity alone is insufficient to distinguish a successful new result from a retained old one after error. No evidence that this happened to the user was collected.                                                                                                                                                                                                |
| Saved text used        | `JobMatchService.analyze:70` explicitly selects saved `text`, filename and revision anew, then calls `matchPrompt(cv.text, jd, canonical)` and `matchOutputSchema(cv.text)`. Saved filename never drives text lookup or extraction caching.                                                                           | No service-level cached CV or match result was found. Under this code path a new request uses the current row; the actual incident's request/revision was not captured.                                                                                                                                                                                                       |
| Revisions / races      | `JobMatchService.analyze` rereads CV/job metadata after inference and rejects differing `updatedAt.getTime()` revisions before scoring. Response includes `cvUpdatedAt`, `jobUpdatedAt`, `analyzedAt`.                                                                                                                | Timestamp comparisons use millisecond precision, not content identity. Other-tab updates after the final check can outdate a displayed result. These are possibilities, not reproduced causes of the manual replacement report.                                                                                                                                               |
| UI invalidation        | `CvMatchPanel` clears on upload success or job/form revision changes; request generation guards old job/revision responses. `JobEditor.tsx` passes `revision={JSON.stringify(form)}`.                                                                                                                                 | Generation changes track the job/form, not CV revision. CV metadata is fetched on mount/job change; another tab's CV update is not broadcast. The UI does not compare returned `cvUpdatedAt` with displayed CV metadata or display that revision. Same-panel upload/reanalysis is serialized by busy controls; no stale-text defect was demonstrated in that sequential path. |
| Evidence and semantics | `cv-match.ts`, `validateMatchAssessment`, `scoreCvMatch`; `cv-match.evidence.ts`, `cvQuoteChoices`, `resolveCvQuote`; `cv-match.coverage.ts`, `requirementGroup`, `componentMention`, `supports`, `evaluateCoverage`.                                                                                                 | Provenance validity and semantic coverage are separate. Empty model selections are schema-valid; degree evidence has no deterministic omission recovery. Invalid/fabricated evidence uses typed failure/downgrade paths rather than establishing absent ability.                                                                                                              |

## Synthetic reproductions

New `apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts` contains eight
current-behavior probes. PDFs are generated in memory with existing `pdfObjects`
and `stream` helpers; the actual `ExtractionService` and isolated `DocumentParser`
worker run. `JobMatchService`, `AiService` schema validation and scoring run normally.
Only repository storage and model responses are controlled in memory. Mock storage
increments the revision explicitly; this is not a real PostgreSQL persistence test.

The requested synthetic education block uses the supplied institution, degree and
year. No other private data is used. Its Helvetica PDF encoding extracts the
apostrophe as a curly apostrophe: source-exact matching must use the parsed quote,
not rewrite it to the typed ASCII spelling. Both spellings satisfy the current
degree recognizer when an original valid passage is selected.

| Probe                                                                                                                                        | Actual result                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old synthetic CV → real replacement PDF → matching, selecting the parsed degree                                                              | New filename/revision returned; new parsed text stored and identical text sent in prompt; old text absent; education **Matched, credit 1**, exact parsed quote retained                                         |
| Same parsed degree, controlled empty model selection                                                                                         | Provenance/completeness validation succeeds; education **Unknown, credit 0**                                                                                                                                    |
| Full public P5.5 normalized JD, fresh education PDF plus synthetic explicit six-year software-experience declaration, all selections empty   | **9/100; Matched 1; Partial 0; Unknown 14**. Only generic minimum-duration recovery earns credit                                                                                                                |
| Selected adjacent degree-level/field passage split by newline                                                                                | Schema/source validation succeeds; education **Unknown** because coverage splits the passage into individual lines                                                                                              |
| Architecture with `Designed REST APIs and microservices.`, `Designed integrations using RabbitMQ.`, `Designed GitLab CI/CD pipelines.`       | **Partial, 3/5 = 60%**: APIs, integrations, CI/CD. Cloud architectures and data flows remain Unknown; no inference from microservices/RabbitMQ to those components                                              |
| Same technologies with `Integrated services using RabbitMQ.` and `Implemented GitLab CI/CD pipelines.` instead of explicit design statements | **Partial, 1/5 = 20%**, APIs only. Integration noun/verb matching is literal, and CI/CD requires the parent's designing context. These boundaries can withhold credit despite practical implementation evidence |
| Strong architecture evidence with every model selection omitted                                                                              | **Unknown, 0**; P6.4 intentionally does not recover AND components                                                                                                                                              |
| Fabricated degree quote not present in the parsed CV                                                                                         | Typed **CV_MATCH_INVALID_OUTPUT**, not a successful silent Unknown result                                                                                                                                       |

These experiments do not prove that Ollama omitted the user's degree quote. No
Ollama call was made. They establish backend behavior for source-valid selections,
selection omissions and PDF line boundaries separately.

## Classification of the reported incident

| Candidate layer                    | Assessment                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale saved CV                     | No sequential replacement bug reproduced. Current saved parse contains the requested evidence. Earlier saved state / intended file identity cannot be reconstructed from presence checks.                           |
| Stale match result                 | No ordinary successful-reanalysis cache found. Failure-retention and cross-tab/revision gaps exist; actual completed response metadata was not inspected. Unconfirmed for this incident.                            |
| PDF parsing issue                  | Current stored degree/field/year presence confirmed, including same-line degree/field. A missing-degree parse is ruled out for this saved revision; other parser/layout issues remain outside the authorized check. |
| Ollama evidence-selection omission | Reproduces the exact aggregate under controlled omissions. Plausible, not confirmed for the private analysis because its raw response was not inspected or regenerated.                                             |
| Backend coverage/alias limitation  | **Confirmed:** omitted education is not recovered; split degree/field passages are not evaluated together. Literal design/verb constraints also limit architecture credit.                                          |
| Evidence validation rejection      | Typed invalid-output behavior confirmed synthetically. Actual private rejection/downgrade was not inspected. Empty evidence passes validation and can yield successful Unknown coverage.                            |

## Smallest justified fix to propose — not implemented

1. Add a dedicated, bounded **education-degree omission recovery** branch for an
   already-canonical education OR group, reusing degree-level, allowed-field,
   positive/incomplete/negative/conflict checks and the rejection flag. Retain the
   exact supporting CV span. Do not register arbitrary education prose as a
   technical alias, infer practical equivalence from generic years, or credit an
   unrelated/pending degree. This addresses the demonstrated fresh-degree omission
   without changing weights, thresholds, generic-duration policy or AND recovery.
2. Keep split-line education as a separately tested edge: evaluate a bounded
   adjacent original passage for degree/field context, with whitespace matching
   mapped back to exact source text. Do not stitch unrelated education records or
   remove incomplete/negated statements. The authorized same-line check means this
   extension is not needed to explain the current stored degree's omission.
3. Before attributing the actual incident to the model, obtain a **sanitized**
   revision/selection outcome for that analysis under separate authorization.
   Existing response `cvUpdatedAt` can be compared with the verified saved revision;
   no hash migration or architecture change is justified by these findings.
   Exposing the already-existing analyzed revision in the UI is optional follow-up
   observability, not a substitute for the degree-recovery fix.

Do not relax architecture requirements to award cloud architecture/data-flow
credit merely for microservices or RabbitMQ. Evaluate any future verb/CI/CD alias
change against explicit design context and supporting quotes separately.
No fix is claimed to reproduce a particular score for the private CV/JD.

## Verification and remaining uncertainty

- **PASS:** `pnpm --filter @ai-job-hunter/api test --testPathPatterns '^.*cv-match.updated-cv-diagnosis.spec'` — **8 tests / 1 suite**, including actual synthetic PDF worker parsing and API test TypeScript compilation.
- Initial probe assumptions about ASCII apostrophe extraction caused four assertion
  failures. Assertions were corrected to select/retain the actual parsed source
  passage; production evidence validation was not changed. Final run passed.
- **PASS:** scoped ESLint/Prettier and `git diff --check`; new untracked files also
  checked individually with no-index whitespace checks.
- No already-passed suites were rerun. No production/frontend changes, live
  inference, private CV plaintext access, private-job inspection, browser smoke,
  migration or database writes. One explicitly authorized read-only database
  presence/revision check was performed after synthetic reproduction.
- Only this report and the new synthetic diagnosis test file were added for P6.5;
  all earlier working-tree files were hash-checked as preserved.

The current saved parse is verified to contain the degree, but the private
analysis's exact CV revision, canonical saved JD, raw evidence selections, selected
passage context and loaded server build remain unverified. These limits prevent a
claim that the actual incident is definitively an Ollama omission rather than
another boundary. The confirmed education-recovery gap is the smallest justified
backend fix; implementation remains subject to the next checkpoint's approval.

## P6.6 — Bounded education evidence recovery

2026-11-05: **Implemented and verified with synthetic data only.** Earlier sections
record the P6.5 pre-fix diagnosis. This checkpoint fixes the confirmed backend gap;
it does not claim that the user's private analysis has been rerun or accepted.
No private CV reads, Ollama requests or database operations were performed in P6.6.

### Exact files changed

- `apps/api/src/matching/cv-match.coverage.ts`: separate Bachelor-level education
  OR recovery using exact source spans and existing support/rejection/conflict
  policies. Bounded adjacent-line context and nearby completion/status qualifiers;
  contradictions are compared against the positive degree's field, while blanket
  degree denials still require review.
- `apps/api/test/unit/cv-match.education-recovery.spec.ts`: new focused education
  positive, adjacent-line, attendance, incomplete, unrelated-field, contradiction,
  canonical-level and fabricated/rejected-evidence regressions.
- `apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts`: updates the approved
  P6.5 synthetic PDF/service probes to the P6.6 expected behavior and preserves
  architecture coverage expectations.
- `docs/architecture.md`: documents degree recovery and its source/entry bounds.
- `docs/audits/p6-updated-cv-false-negative.md`: this appended checkpoint report.

All other earlier work was preserved. No schema, technical alias registry, weights,
recommendations, migrations, dependencies, frontend or lifecycle changes.

### Before and after

| Synthetic case                                                                                                  | P6.5                                                                                      | P6.6                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Explicit Information Technology Bachelor's Degree with empty model selection                                    | Unknown, credit 0                                                                         | **Matched, credit 1**; original degree/completion span retained                                          |
| Degree level and field on immediately adjacent lines in the same entry                                          | Unknown even with a valid adjacent selected passage                                       | **Matched**, both with omitted selection and with selected adjacent evidence; original newline preserved |
| Full P5.5 JD with the synthetic education PDF and explicit six-year software experience, all selections omitted | 9/100; Matched 1; Partial 0; Unknown 14                                                   | **17/100; Matched 2; Partial 0; Unknown 13** — only Education and generic Minimum 6 years evidenced      |
| Attendance/dates without a degree, pending/incomplete degree, unrelated field                                   | Unknown                                                                                   | **Unknown**, zero credit                                                                                 |
| Positive degree plus same-field negative statement or blanket degree denial                                     | No education omission recovery                                                            | **Conflict**, zero credit; positive and contradictory original passages retained                         |
| Rejected/fabricated model degree evidence                                                                       | Typed rejection or existing downgrade                                                     | **Unchanged**; valid degree elsewhere cannot rescue rejected evidence                                    |
| Existing MCP omission capture                                                                                   | 44 / Consider after P6.4                                                                  | **44 / Consider**, unchanged offline service replay                                                      |
| Explicit architecture design evidence                                                                           | Partial, 60% or 20% depending on supported design context; omitted AND selections Unknown | **Unchanged**; no cloud/data-flow inference or general AND recovery                                      |

The single-parent education fixture scores 100 / Apply when fully supported.
The full-JD synthetic fixture remains Low Fit at 17: the remaining requirements
are still unverified. These are deterministic synthetic results, not a numerical
prediction for the private CV/JD.

### Evidence and rejection safeguards

- Recovery requires an already-canonical education **OR** component explicitly
  naming a Bachelor-level degree. A Bachelor's qualification cannot silently
  satisfy a canonical Master's or an unspecified degree requirement.
- An explicit degree assertion is treated as qualification evidence unless
  negated, incomplete, pending or aspirational. Institution attendance, graduation
  dates or years of work without that assertion do not establish completion.
  Practical-equivalence recovery is deliberately absent; existing explicit
  model-selected practical evidence keeps its prior validation behavior.
- Field matching remains limited to relevant named Computer Science, Software
  Engineering and Information Technology fields present in the canonical degree
  alternative. No arbitrary related-field equivalence or qualification is inferred.
- A missing field may continue on the **immediately adjacent, field-only line**.
  Blank lines, intervening institution text, a different qualification and a field
  already stated on the degree line prevent cross-entry stitching. Adjacent
  completion/pending metadata is retained with the candidate, including preceding
  status text. At most **four lines / 2,000 characters** are considered.
- All returned quotations are literal contiguous substrings of the original CV,
  preserving apostrophes, CRLF/newlines and nearby qualifiers. No prose is
  synthesized and raw model output is not edited. A selected degree-only line
  cannot bypass pending status retained from the same bounded entry.
- Existing positive, negative and uncertain-evidence checks still apply.
  Same-field contradictory statements or a blanket degree denial yield Conflict
  and zero credit. A separately pending second degree in another field does not
  negate an evidenced completed IT degree.
- The existing `cvEvidenceUnverified` gate disables recovery after model evidence
  rejection. Fabricated component quotes/IDs/JD spans still fail existing typed
  validation before scoring. No schema or evidence-validation exception was added.

### Verification

- **PASS — 170 tests / 9 focused suites**:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match|job-match.regression|match-evidence-validation|discovered-match'`.
  Includes the new education regressions, actual synthetic PDF replacement/prompt
  probes, unchanged P2 simple-row scores, P6 compound/AND behavior, captured MCP
  omission recovery and typed evidence failures. API test compilation passed.
- **PASS — API typecheck**: `pnpm --filter @ai-job-hunter/api typecheck`.
- **PASS — scoped ESLint**, zero warnings allowed:
  `pnpm exec eslint apps/api/src/matching/cv-match.coverage.ts apps/api/test/unit/cv-match.education-recovery.spec.ts apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts --max-warnings 0`.
- **PASS — scoped Prettier** on the three source/test files above and both changed
  documentation files, plus `git diff --check` and no-index whitespace checks for
  new/untracked checkpoint files.
- All earlier unrelated file contents were hash-checked as unchanged. No broad
  suites, frontend tests/browser smoke, Ollama runs, database access/writes,
  migrations, dependency changes, commit, push or PR.

### Limitations and acceptance boundary

This remains conservative English qualification matching, not a general education
parser. Unrecognized field synonyms/degree forms, fields separated by additional
institution/prose lines, blank-separated fragments, long entries and ambiguous
entry layouts can remain Unknown. Nearby ambiguous status text can withhold
credit. Historical or same-field multiple-degree contradictions may need human
review; no graduation date arithmetic, actor attribution or academic-record
verification is inferred.

P6.6 resolves the **synthetically confirmed education omission and adjacent-line
coverage gaps**. The prior private analysis's exact selections and result revision
remain unverified. Private-user acceptance needs a separately authorized/user-run
reanalysis; no private data access or live inference was used for this checkpoint.

Stop for review. No commit, push or PR.
