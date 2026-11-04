# P5.5d — Extraction recovery and normalization fix

Date: 2026-11-04. Branch: `fix/p5-itviec-metadata`.
All P5.5a/b/c work is preserved. No commit, push or PR.

## Root-cause fixes and changed files

- `apps/api/src/opportunities/job-import.sections.ts`: all recognized explicit
  qualification headings enable structured recovery, including Must Have. A
  clause mentioning years no longer disables that recovery. The existing
  source-row normalizer now reconciles mandatory fragments as consistently as
  preferred fragments. Plain technology-list splitting and existing mixed
  required/preferred clause handling are retained. A fragment does not replace
  an entire capability's modality, OR group or delivered-project constraint.
- `apps/api/src/opportunities/job-import.evidence.ts`: the existing year-experience
  patterns also accept `6+ years` and prefixed forms such as minimum 6+ years.
  Existing experience parsing preserves the minimum qualifier and original
  quotation. The accompanying qualification remains in Required skills.
- `apps/api/src/opportunities/job-import.service.ts`: one small prompt adjustment
  replaces the ambiguous one-literal-skill instruction with contextual
  qualifications, intact AND/OR constraints, plain-list exceptions and a warning
  against duplicate full-clause/fragments. No pipeline, schema, model/profile,
  output-budget, retry, error-path or evidence-validation change.
- `apps/api/test/unit/ai-solution-architect-import.spec.ts`: golden-source coverage
  with omitted/sparse/complete/captured-live proposals; evidence and Save review
  validation; plus-years/context; unfamiliar vocabulary; distinct clauses with
  shared terms; taxonomy negatives; genuine conflicts and historical evidence;
  existing CV Match input/OR checks.
- `apps/api/test/unit/java-required-import.spec.ts`: existing Java source-role
  regression now expects the complete supported role/experience alternative
  instead of a lone Java tag. Assertions still require mandatory classification,
  the exact role evidence, minimum three years, preferred qualifiers, the separate
  technology OR group, domain/salary and manual-value preservation. This strengthens
  contextual coverage rather than accepting a missing Java requirement.
- `docs/architecture.md`: documents clause recovery, proposal-only normalization
  and existing downstream matching boundaries.
- `docs/audits/fixtures/itviec-ai-solution-architect.live-p55d.json`: sanitized
  single-call public-JD raw response/envelope and normalized fields.
- This report.

No frontend, Fetch parser, metadata/Domain mapping, entity, Save API or CV Match
production file was changed in P5.5d. P5.5c's golden and historical mock results
are retained; the new live artifact does not overwrite them.

## Golden coverage and semantic preservation

All four controlled cases (omitted provider candidates, sparse fragments,
complete clauses plus duplicate fragments, and captured live output) produce:

- **9/9 Must Have clauses**, each backed by its actual source quote.
- **4/4 Nice to Have clauses**, classified preferred with OR alternatives intact.
- **Minimum 6 years**, with the broader role alternatives and recent hands-on
  Generative AI qualification preserved separately as a complete requirement.
- Education/equivalent-practical-experience alternatives and the at-least-one
  delivered application beyond prototype requirement.
- Working knowledge, understanding, designing experience, communication and
  coaching context, without isolated security/privacy/performance duplicates.
- No Kubernetes requirement from supplemental tags or AI Architect requirement
  from Job Expertise. LLM/RAG/English remain supported by actual qualifications.
- Distinct requirements sharing tool calling/vector search remain distinct;
  fragments from a full clause do not create extra output rows.

There are nine Required and four Preferred display lines, not an arbitrary target
number of isolated keywords. Tests check source spans, contextual qualifiers,
classification, evidence and absence of fragments; insignificant terminal
punctuation differences are allowed. Existing source-label and plain technology
list behavior remains, including historical Vietnamese hoặc → OR display
normalization. Each candidate's quote/value still matches the original source.

A separate explicit-domain conflict remains unsaveable until acknowledged.
Historical fragment evidence is still saveable unchanged; current normalization
is not silently applied when revalidating saved/manual review metadata.

## One live public-JD extraction

Only the fixed public source was passed to the local application-owned
OllamaProvider/AiService/JobImportService path. No CV, uploaded document, database
or real job write was involved. Exactly **one generation** was attempted.

- Local version check: **0.40.10**; provider verified the pinned model/profile.
- Model: **qwen3:4b**; elapsed approximately **24.3 seconds**.
- **1,826 prompt tokens**, **1,137 output tokens**, done_reason **stop**.
- **14 raw candidates**; no output truncation or extraction error.
- Model granularity still diverged from the instruction: Required skills were
  one aggregate value spanning eight clauses but skipping the source experience
  clause. That aggregate was not contiguous within its quote, so strict evidence
  validation rejected it. Preferred skills were one supported aggregate, then
  reconciled into the four source clauses. Four unsupported N/A candidates were
  also rejected: **five total rejections**.
- Deterministic recovery supplied all nine Required clauses and all four Preferred
  clauses despite this raw output. Experience became Minimum 6 years and the four
  explicit domains were retained in the existing semicolon form.

The artifact contains only public-JD model text, selected completion metrics,
normalized skill/experience/domain fields and their public evidence. It excludes
connection configuration, credentials, cookies and private documents. A regression
replays its raw candidates offline; tests do not contact Ollama.

One call demonstrates this run's result, not stable accuracy or variability across
runs, models or unrelated JDs. No second inference or model-tuning experiment was
performed.

## Verification

- Focused extraction/metadata/evidence and CV Match command:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'job-import|itviec|java-required-import|mdm-import|viettel-import|url-import-extraction|ai-solution-architect-import|cv-match|job-match.regression|match-evidence-validation|matching.spec'`:
  **PASS — 250 tests / 18 suites**. Includes the existing Java, MDM, Viettel, bbv,
  conflict/manual/history, metadata and matching cases. Expected rejection
  diagnostics from synthetic matching negatives are not test failures.
- After adding the live-response replay, only the affected golden suite was rerun:
  **PASS — 11 tests**, including the captured model response. No repeat of the
  expensive live call.
- Matching suites include cv-match, cv-match diagnostics, job-match regression,
  match-evidence-validation and matching. The golden test passes persisted fields
  to the existing canonicalRequirements/matchJobText functions: source-backed
  text and required/preferred priorities survive, education/role/delivered-project
  OR groups remain whole, experience is valid, and taxonomy never becomes a skill.
- Frontend code was not touched in this checkpoint; no frontend test or browser
  pass was needed. Both package typechecks are required separately below.
- `pnpm typecheck`: **PASS** for backend and frontend.
- `pnpm format:check`, `pnpm lint`, `git diff --check`: **PASS**.

Initial test feedback exposed two assumptions in the new assertions: terminal
punctuation need not match exactly, and CV Match consumes the rendered saved-job
text (including normalized Experience/Domain), not solely postText. Assertions
were corrected to verify the actual input boundary, retaining separate verbatim
source-quote checks. Existing Java tests were updated for the intentionally fuller
qualification representation described above. No lint rule or evidence gate was
suppressed.

## Remaining limitations

Unknown/unheaded prose still follows existing conservative recovery. Provider
errors retain the existing error/manual-fallback behavior; the fix does not claim
an unavailable or invalid provider succeeded. A single physical source line with
several qualifications can still use existing clause splitting rules; this is
not a new general natural-language parser.

CV Match's existing non-OR comma/semicolon splitting is unchanged: a contextual
AND-list can still become several matching inputs. This checkpoint verifies
existing matching behavior and preserves OR groups; it does not claim one scoring
row per source clause or eliminate every downstream context loss. Changing that
policy would require its own matching scope. No private CV was used to assess fit.

Complete clauses are deliberately retained when shortening would weaken meaning.
The prompt encourages this, but the live response confirms model conformance is
not guaranteed. Source-backed deterministic recovery and evidence validation
remain the reliable boundary for these explicit sections.

Stop for review before any further checkpoint or commit.
