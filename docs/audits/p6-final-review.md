# P6 final Git review — P6.10 blocker corrected

Reviewed on 2026-11-05 on `fix/p6-match-semantics`, targeting `main`.
Branch HEAD and fetched main: `9d8575385bdee888c5002614fece38161901cfc7`.
P6 changes are uncommitted. Publication stopped before staging, commit, push or PR.

## Historical blocking finding: contracted negation receives recovered credit

The shared `negative()` guard in `apps/api/src/matching/cv-match.coverage.ts`
(line 200 at review) does not recognize straight or curly `can't` contractions.
With empty model evidence selections, deterministic recovery treats the following
synthetic denials as support. Each probe passed through canonical requirements,
`validateMatchAssessment`, and `scoreCvMatch`, using compiled focused-test code.
No Ollama request, private CV access or database operation was performed.

| Required synthetic parent                                                      | Synthetic CV                                                 | Actual result                   | Expected             |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------ | ------------------------------- | -------------------- |
| Architecture AND: cloud architectures, APIs, integrations, data flows, CI/CD   | I can't claim experience implementing CI/CD pipelines.       | Partial, 1/5; score 20, Low Fit | Unknown, zero credit |
| MCP or knowledge graphs                                                        | I can't claim experience with MCP.                           | Matched; score 100, Apply       | Unknown, zero credit |
| Bachelor's degree in Information Technology or equivalent practical experience | I can't claim a Bachelor's Degree in Information Technology. | Matched; score 100, Apply       | Unknown, zero credit |

This violates the required negation safeguard across AND, OR and Education
recovery. Passing existing suites does not establish acceptance for this case.
Smallest next correction: harden the shared negation guard for straight/curly
contractions, add selected/omitted-evidence and contradiction regressions across
these recovery paths, then repeat affected verification and final review.
No production correction was made during this final review.

## Inventory

The original worktree contained five modified tracked files and fourteen
untracked P6 files. All were preserved; formatting changed none of their hashes.

- `apps/api/src/matching/cv-match.ts`
- `apps/api/src/matching/job-match.service.ts`
- `apps/web/src/features/inbox/CvMatchPanel.tsx`
- `apps/web/test/cv-match.test.tsx`
- `docs/architecture.md`
- `apps/api/src/matching/cv-match.coverage.ts`
- `apps/api/test/unit/cv-match.and-recovery.spec.ts`
- `apps/api/test/unit/cv-match.cicd-practices.spec.ts`
- `apps/api/test/unit/cv-match.education-recovery.spec.ts`
- `apps/api/test/unit/cv-match.or-recovery.spec.ts`
- `apps/api/test/unit/cv-match.semantics-audit.spec.ts`
- `apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts`
- `docs/audits/fixtures/p63-synthetic-cv-match.json`
- `docs/audits/fixtures/p67-synthetic-and-match.json`
- `docs/audits/p6-match-correctness.md`
- `docs/audits/p6-match-semantics.md`
- `docs/audits/p6-runtime-discrepancy.md`
- `docs/audits/p6-runtime-discrepancy.probe.mjs`
- `docs/audits/p6-updated-cv-false-negative.md`

This review adds `docs/audits/p6-final-review.md` (twentieth changed/untracked file).
The index remains empty. No complete staged-diff approval was performed because
publication is blocked.

## Review scope and boundaries

The diff implements canonical parent scoring (required 3, preferred 1),
proportional AND credit, bounded OR recovery with shared constraints, degree
recovery and component-specific CI/CD practice recovery. Frontend presentation,
regressions and P6 audit artifacts are present. The legacy Task 04 matcher files
`matching.ts`, `matching.policy.ts`, `matching.evidence.ts`, `matching.types.ts`
and `matching.validation.ts` have no diff against main.

The new negation counterexample prevents confirming all requested recovery
boundaries. Final publication/privacy clearance and the complete staged review
remain pending; this report does not declare the branch ready for publication.
No dependencies, migrations or infrastructure were added by this review.

## Verification

| Command/check                                                                                                                                                                         | Actual result                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm format`                                                                                                                                                                         | PASS; original nineteen files unchanged               |
| `pnpm format:check`                                                                                                                                                                   | PASS                                                  |
| `pnpm lint`                                                                                                                                                                           | PASS                                                  |
| `pnpm typecheck`                                                                                                                                                                      | PASS; API and web                                     |
| `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match\|job-match.regression\|match-evidence-validation\|discovered-match\|matching.spec\|ai-solution-architect-import'` | PASS; 13 suites, 327 tests                            |
| `pnpm --filter @ai-job-hunter/web test test/cv-match.test.tsx`                                                                                                                        | PASS; 17 tests                                        |
| `pnpm build`                                                                                                                                                                          | PASS; web emits large-chunk warning (802 kB minified) |
| `git diff --check`                                                                                                                                                                    | PASS                                                  |
| Synthetic negation review probes                                                                                                                                                      | FAIL; three false-positive cases above                |

No database integration suite, browser rerun or Ollama inference was run.
Historical live/browser acceptance remains documented in the P6 reports and user
confirmation; it does not cover this counterexample.

Commit SHA: not created. PR URL: not created. GitHub Actions: not triggered.
Stop for review as requested when a blocker is found.

## P6.10 — contraction-aware negation correction

The original guard enumerated only `haven't`, `didn't` and `don't` alongside
uncontracted negatives, omitting `can't` and other common forms. The shared
`negative()` now recognizes `can't`, `couldn't`, `don't`, `doesn't`, `didn't`,
`won't`, `wouldn't`, `isn't`, `aren't`, `wasn't`, `weren't`, `hasn't`, `haven't`
and `hadn't`, with straight or curly apostrophes and whitespace around the
apostrophe (including PDF nonbreaking spaces and tabs). `cannot` remains
supported. Matching does not rewrite original evidence quotations.

Exact files changed in this checkpoint:

- `apps/api/src/matching/cv-match.coverage.ts`: only the shared negative guard and its explanatory comment.
- `apps/api/test/unit/cv-match.negation-recovery.spec.ts`: 144 synthetic end-to-end regressions, including omitted and selected evidence.
- `docs/audits/p6-final-review.md`: this checkpoint report.

The existing shared call sites apply the correction to AND, technical OR,
Education, and conflict detection. No weights, thresholds, component aliases,
positive-evidence rules, source validation or recovery eligibility gates changed.

| Original blocker scenario                                      | Before                | After                                      |
| -------------------------------------------------------------- | --------------------- | ------------------------------------------ |
| `I can't claim experience implementing CI/CD pipelines.`       | Partial, 20 / Low Fit | Unknown, 0 / Low Fit; CI/CD NOT_EVIDENCED  |
| `I can't claim experience with MCP.`                           | Matched, 100 / Apply  | Unknown, 0 / Low Fit; MCP NOT_EVIDENCED    |
| `I can't claim a Bachelor's Degree in Information Technology.` | Matched, 100 / Apply  | Unknown, 0 / Low Fit; degree NOT_EVIDENCED |

Tests assert parent/component statuses, score and recommendation through
`validateMatchAssessment` and `scoreCvMatch`. All requested contractions are
covered with straight/curly/space-separated apostrophes. The shorter user examples
(`can't design CI/CD pipelines`, `can't use MCP`, `can't claim a Bachelor's Degree`)
also earn zero credit. A separate unrelated negative sentence leaves supported
positive evidence intact with its exact quotation; an unrelated positive sentence
cannot rescue a denial. Positive and negative statements about the same component
retain Conflict status and zero credit.

Updated CI parity:

- PASS: focused negation suite, 144 tests.
- PASS: focused P2/P6 backend regression selection above, 14 suites / 471 tests (includes the new 144); fabricated/rejected evidence regressions remain passing.
- PASS: `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS: `pnpm lint` (whole repository).
- PASS: `pnpm --filter @ai-job-hunter/api build`.
- PASS: scoped Prettier write/check, repository `pnpm format:check`, and `git diff --check`.
- Reused unaffected final-review passes: frontend typecheck, 17 frontend tests and web build; no frontend/package/configuration changes in P6.10.

Remaining limitations: this remains bounded lexical negation with the existing
passage scope, not general natural-language entailment. Complex cross-sentence
references, double negatives and arbitrary PDF line wrapping are not newly
interpreted. Existing ambiguous-compound and alias limits remain. No private CV,
database or Ollama access was used. No new browser acceptance is claimed.

The three demonstrated blocker scenarios are corrected. Final publication/privacy
review and staged-diff review remain pending. No files staged, commit, push or PR;
GitHub Actions were not triggered. Stop for P6.10 review.

## Final publication review after P6.10

On 2026-11-05, branch `fix/p6-match-semantics` was confirmed against freshly
fetched `origin/main`; local main and origin/main are identical at
`9d8575385bdee888c5002614fece38161901cfc7`. The inventory above plus the P6.10
negation test comprises **21 intended P6 files**. The complete production,
frontend, regression, synthetic-fixture and audit diff was reviewed for publication.

No unrelated modifications, credentials, contact details, private saved-CV text,
private raw model responses, binary/generated artifacts or production debugging
statements were found in the intended files. Reports retain sanitized revision
metadata and boolean/count diagnostics, not private quotations. The two retained
raw model captures are explicitly synthetic. The standalone runtime-discrepancy
probe is an intentional reproducible audit artifact; its console summaries use
synthetic data only and it has no database/network/model access. It is not loaded
by production. Legacy Task 04 matching files remain unchanged.

Canonical parent weighting, proportional AND coverage and required-gap Apply veto,
OR shared constraints, completed-degree qualification safeguards, component-specific
CI/CD applied-work rules, source validation and rejected-evidence gates were
reviewed with their focused regressions. The P6.10 negation correction is included;
no further blocker was identified within the documented bounded-language policy.

CI parity reuses the unchanged P6.10 results above: **471 backend tests**, API
build/typecheck, repository lint and format checks; unchanged frontend **17 tests**,
typecheck and build are verified in the final-review logs. Only this audit report
changed after those passes; its formatting and the exact staged whitespace diff
are checked again before commit. Historical synthetic Ollama/Chromium acceptance
and user-confirmed Education/Architecture acceptance cover their previously tested
scenarios. **P6.10 was regression-tested, not browser- or Ollama-tested.**

No extra inference, private-data access, database writes or unrelated suites were
performed for publication. Commit/push/PR are now explicitly authorized by the
user; historical stop-for-review statements above describe earlier checkpoints.
The final commit and PR identifiers will be reported separately after creation.

## Post-PR full-CI regression — Axon score trace

Status: **local valid-evidence fixes implemented; CI remains blocked on an explicit
policy/test review**. No commit or push for this correction. Existing PR #13 and
commit `055cbf62d15326cf90138b217d8eb5c70a6aab0d` are unchanged.

### Reproduction and trace

`pnpm --filter @ai-job-hunter/api test --testPathPatterns axon-score-trace`
reproduced **6 failures / 3 passes**, not just the reported Java failure. Java,
SQL and AI-tooling row failures also broke reordered-row, partial-downgrade and
service aggregate assertions. The fixture is synthetic; no private CV was used.

For Java, the whitespace-compacted model quote links to the same canonical
parent by ID/requirement/JD evidence. `resolveCvQuote` restores the exact original
`Backend — Java,\n Spring Boot, Node.js.` span. Validation accepts it without
`cvEvidenceUnverified`. The failure happens later: P6.2's new
`requirementGroup` treats any `including` clause as Unknown, even this one-language
qualification. Unknown coverage forces zero credit and removes the CV quotation.
The explicit Backend declaration legitimately supports Java under the established
P2 skill-declaration policy. The test correctly expects the original multiline
span, not a rewritten whitespace-compacted quotation.

SQL also passes provenance and linkage. Its OR components are already correctly
`SQL` and `NoSQL data stores`; PostgreSQL/SQL Server match the existing SQL alias.
P6's new positive-context predicate recognizes Backend/technical-skills headers,
but not the equally explicit `Databases —` declaration, so semantic credit is lost.

The first full CI run exposed two more affected suites:
`cv-quote-resolution.spec.ts` treated generic `Experience` as a literal skill token
and rejected valid stated duration; `ai-tooling-downgrade.spec.ts` withheld one AND
component from explicit production evidence because `integration` did not match
`integrated LLM APIs`. Neither is a source-validation failure.

### Exact changed files and bounded correction

- `apps/api/src/matching/cv-match.coverage.ts`: recognize the single-token managed-language qualification as atomic; check its actual language for relevance/contradiction while retaining its full original quote. Multiple-language/qualified `including` clauses remain ambiguous. Accept explicit Databases declarations within existing component support. Preserve semantic handling of legacy generic Experience rows. Recognize explicit `integrated/integrating LLM APIs` for the named integration component, without adding an omission-recovery alias or accepting API usage alone.
- `apps/api/test/unit/cv-match.axon-coverage.spec.ts`: 17 synthetic regressions covering original-span retention, relevance/negation/aspiration/conflict, SQL/NoSQL alternatives, ambiguous language lists, generic duration and explicit integration versus mere API usage.
- `docs/audits/p6-final-review.md`: this report.

No existing failing assertion was removed, skipped or weakened. No weights,
thresholds, rejection markers, source validation or P6.10 negation rules changed.

### Before and after

| Scenario                                                    | Before               | Current local correction                              |
| ----------------------------------------------------------- | -------------------- | ----------------------------------------------------- |
| Java Backend declaration                                    | Unknown, empty quote | Matched, exact original multiline quote               |
| Selected SQL database declaration                           | Unknown              | Matched, exact original quote; one OR component       |
| Generic Experience with explicit work duration              | Unknown              | Matched                                               |
| Explicit production AI/ML and integrated LLM APIs           | Partial, 50          | Matched, 100; both components independently supported |
| Tool list versus evaluating/integrating workflow experience | Unknown              | Remains Unknown pending policy review                 |

### Remaining policy conflict — proposal for review, not implemented

The Axon tooling requirement explicitly asks for **evaluating and integrating
AI-assisted development tools into engineering workflows**, whereas its quote
only lists Claude, ChatGPT and GitHub Copilot. Provenance and tooling/production
validation accept that source passage, but it establishes neither evaluation nor
workflow integration. P6 shallow coverage splits the coordinated activities into
components; neither has support from this declaration. The prompt's broad P2
statement that coding-tool use supports tooling requirements does not establish
these stronger activities. Granting full credit just to retain the old aggregate
would undermine the P6 evidence-sufficiency goal.

Proposed explicit test/policy update for approval: retain this tool-list-only case
as Unknown, then add a separate synthetic positive example documenting actual
evaluation and workflow integration. Define how coordinated action clauses are
represented before asserting that positive case as full coverage. Update the
related aggregate expectations deliberately with that approved policy, rather
than silently making a tool list equivalent to evaluation/integration. The current
Axon assertions remain intact so this unresolved difference stays visible in CI.

### Why focused pre-push checks missed it

The final pre-push selector included `cv-match`, `job-match.regression`,
`match-evidence-validation`, `discovered-match`, `matching.spec` and the public JD
import test. It excluded `axon-score-trace`, `cv-quote-resolution` and
`ai-tooling-downgrade`, whose names do not match that expression. The stated 471
passes were real but were not a full-CI pass. Those three suites should be added
to the focused matching selector after review; a passing subset must not be
reported as satisfying the complete workspace test command.

### Verification on the local correction

- Initial Axon-only reproduction: **FAIL — 6 failed / 3 passed**.
- Expanded focused matching command including all three previously omitted suites:
  **FAIL — 4 failed / 512 passed, 1 failed / 17 passed suites**. All four remaining
  failures are the unchanged Axon tooling row and its dependent reordered,
  rejected-SQL and service aggregate expectations. The new 17 regressions pass;
  P2/P6 negation, OR, education, AND and CI/CD regressions remain passing.
- Exact requested command `pnpm -r --workspace-concurrency=1 run test`:
  **FAIL (exit 1) — API: 4 failed / 1,804 passed, 1 failed / 82 passed suites**.
  No other API suite fails on the final local code. The workspace command stops
  before frontend tests when the API fails; it is not a green full-CI result.
- A separate full frontend run reported **3 failed / 312 passed / 7 skipped**.
  It was repeated once without concurrent lint/typechecks to check contention:
  **3 failed / 312 passed / 7 skipped** again. Import-methods and job-editor-flow
  cases exceed their unchanged 5-second test deadlines; a different Inbox case
  fails between runs (first last-HR-contact, then add-job/detail lookup). These
  unchanged frontend failures are reported, not dismissed as proven flakes.
  No frontend or timeout configuration was modified.
- **PASS:** `pnpm lint` and `pnpm typecheck` (API and web) on the local correction.
- **PASS:** scoped formatting; final repository formatting and diff checks below.

No original assertion or test configuration was changed, no test was skipped,
and no private-data, model, database, commit, push or PR mutation was performed.
This working-tree correction is not ready to publish while the policy conflict
and observed full frontend failures remain unresolved.

The three affected frontend files were then run once with the existing Vitest
`--maxWorkers=1` option (no source/configuration changes): **PASS — 34/34 tests**
across `import-methods.test.tsx`, `job-editor-flow.test.tsx` and `inbox.test.tsx`.
This supports concurrency-sensitive timing as an explanation, but does not turn
the default full frontend runs into passes. No unrelated frontend fix is proposed
in this checkpoint. Repository `pnpm format:check` and `git diff --check` passed;
the final report was scoped-format-checked again after this result was added.

## P6.11 — Axon tooling contract alignment and CI stabilization

This section supersedes the preceding unresolved-tooling report. The approved
contract requires documented evaluation **and** workflow integration; a list of
AI tool names is insufficient. Classification was completed before assertions
were changed. P6.11 adds no production matching or UI rule changes; the earlier
uncommitted valid-evidence corrections remain included.

### Four-failure classification and exact assertion changes

All four failures share this exact public/synthetic JD requirement:
`Experience evaluating and integrating AI-assisted development tools into engineering workflows`.
Their exact synthetic input quote is retained unchanged:
`Tools: Claude / ChatGPT / GitHub Copilot.`. It names tools but demonstrates neither
required activity. Provenance validation accepts the source passage; semantic
coverage correctly returns **NOT_EVIDENCED, empty accepted quote, zero credit**.

| Original failing assertion                                        | Classification                                                     | Approved expectation change                                                                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-assisted tools evidence survives proposal/linkage/span/scoring | Tool-list-only; Unknown is correct                                 | Replace this member of the positive parameterization with an explicit provenance-valid but coverage-Unknown test; assert both components Unknown and final quote empty |
| Reordered/renamed rows retain linkage                             | Same unsupported tooling row counted among positives               | Matched requirement list becomes `facts.slice(0, 3)`; explicitly assert tooling Unknown/empty quote                                                                    |
| Rejected SQL does not erase other matches                         | Same unsupported tooling row counted alongside valid Java/duration | Matched list becomes `[facts[0], facts[1]]`; explicitly assert tooling Unknown/empty quote                                                                             |
| Service sends verified rows and returns API-shaped output         | Same tooling row counted as fourth supported parent                | Three supported parents, not four; explicitly assert tooling Unknown/empty quote                                                                                       |

Java/SQL/source-span, reordering/linkage, rejection, service/provider and other
Axon assertions remain intact. The unchanged five-parent fixture now scores
**60 / Consider**, rather than crediting unsupported tooling. All four historical
failures are addressed by this explicit contract alignment, not a production bypass.

### Separate positive activity fixture

The new source-backed synthetic quote in `axon-score-trace.spec.ts` is:

> Experience evaluating AI-assisted development tools, including GitHub Copilot, and integrating AI-assisted development tools into engineering workflows through code-review automation.

It directly states both activities. Both components are accepted with that exact
original quote: isolated parent **100 / Apply**. This uses the existing bounded
coverage implementation without adding aliases or recovery exceptions. Additional
cases retain zero credit for straight/curly contracted denials and aspirations;
evaluation-only is **Partial, 50 / Consider**, and genuine contradictory activity
is **Conflict, zero credit**. The tool-name-only fixture is unchanged as input.

### Frontend failure diagnosis and smallest harness change

The affected historical tests were:

- `import-methods.test.tsx`: “one contextual panel retains text but clears the document when leaving Upload JD without fetching on selection” — exceeded 5,000 ms.
- `job-editor-flow.test.tsx`: “creation is import then review; extraction advances, back preserves edits, saves SAVED without tracker” — exceeded 5,000 ms.
- `inbox.test.tsx`: “last HR contact survives create, save, reopen and replacement without changing follow-up” timed out in the first run; “adds a job, sends persistent fields, then loads its detail” failed finding the `Job overview` heading in the second run.

Inspection found mocked in-memory API flows, normal async find/wait queries and
React/jsdom/MUI rendering. Per-file test isolation remains enabled, and setup
cleans the DOM, globals and timers after each test; no cross-file isolation defect
or product UI regression was established. The local process sees **20 CPUs**.
The workflow already serializes API/web workspace runs and describes a two-core
hosted runner, but Vitest previously inherited host-dependent worker concurrency.

Controlled concurrency comparison on unchanged frontend source and assertions:
previous default full runs failed three cases; a one-worker scoped run passed
34/34; the full suite with `--maxWorkers=2` passed **315 tests / 30 files**, with
**7 existing skipped tests / 2 skipped files**, in 47.81 seconds. This supports
worker contention causing missed test/async deadlines, not a demonstrated missing
product transition. No timeouts or assertion waits were increased.

The smallest correction is `maxWorkers: 2` in `apps/web/vitest.config.ts`, used by
both local and GitHub Actions' unchanged test commands. It preserves process/file
isolation and every test/assertion, trading some total runtime for bounded
jsdom/MUI contention. There are no production UI or CI infrastructure changes.

### Process and final changed-file inventory

`AGENTS.md` now requires `pnpm -r --workspace-concurrency=1 run test` once on the
final revision before pushing a PR that changes shared matching, scoring or
evidence validation. It does not require repeated full suites during development.

The complete uncommitted diff against PR commit `055cbf6` contains:

- `AGENTS.md` — narrow pre-push rule.
- `apps/api/src/matching/cv-match.coverage.ts` — preserved preceding Java/SQL, generic Experience and explicit LLM integration corrections; no additional production change in P6.11.
- `apps/api/test/unit/cv-match.axon-coverage.spec.ts` — preserved preceding 17 valid-evidence regressions.
- `apps/api/test/unit/axon-score-trace.spec.ts` — approved tool-list assertions and separate activity/negative/partial/conflict fixtures.
- `apps/web/vitest.config.ts` — bounded two-worker test concurrency only.
- `docs/audits/p6-final-review.md` — diagnosis, classification and verification history.

### Final P6.11 verification and remaining blockers

- **PASS — 523 tests / 18 suites**: focused Axon/P2/P6 selection including
  `axon-score-trace`, `cv-quote-resolution`, `ai-tooling-downgrade`, `cv-match`,
  `job-match.regression`, `match-evidence-validation`, `discovered-match`,
  `matching.spec` and `ai-solution-architect-import`.
- **PASS (exit 0)** — exact GitHub Actions workspace command:
  `pnpm -r --workspace-concurrency=1 run test`, with no extra worker CLI options:
  - API executes its standard TypeScript test compilation and Jest `--runInBand`:
    **83 suites / 1,815 tests passed**, no failures (41.99 seconds).
  - Frontend executes standard `vitest run`, reading the shared two-worker config:
    **30 files / 315 tests passed**, **2 files / 7 tests already skipped**, no
    failures (47.85 seconds). Isolation remains enabled; cumulative worker-spawn
    diagnostics do not mean 32 workers ran concurrently.
- **PASS:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck` (both packages),
  `pnpm build`, and `git diff --check`. The existing non-failing web bundle-size
  warning remains. The final report received a scoped formatting/whitespace check
  after results were recorded.
- All six working-tree file hashes were unchanged during final code verification;
  only this report was subsequently extended with the actual results. The index
  remains empty. No tests were newly skipped, dependencies/configured timeouts
  changed, production rules weakened, or unapproved files modified.

**No remaining local verification blocker identified for this checkpoint.** The
bounded lexical/evidence interpretation and arbitrary PDF line-wrap limitations
remain; this is not a large-scale accuracy benchmark or a new live model/browser
acceptance run. GitHub Actions has not been rerun because these corrections are
uncommitted. No private CV/Ollama access, database writes, commit, push or PR
mutation occurred. Stop for review.

## Post-P6.11 integration CI failure — mock output contract

The reported GitHub Actions failure was reproduced with
`pnpm --filter @ai-job-hunter/api test:integration --testPathPatterns cv-match`:
one lifecycle test failed with HTTP 503 rather than 200; the migration test passed.
Testing used only the existing isolated test PostgreSQL identity/role on port
5433 (`databaseOptions('test')` enforces it), synthetic fixtures and a mocked
provider. No development database or private CV was accessed; no Ollama ran.

Root cause: P6 adds derived `group` metadata to canonical requirement objects in
`matchPrompt`. The integration mock spread those input objects into simulated
model output. The output schema intentionally has `additionalProperties: false`
and no `group` output field. A direct synthetic schema probe confirmed rejection
at `/requirements/0`, keyword `additionalProperties`, additional property `group`.
`AiService` raises `SCHEMA_VALIDATION_FAILURE`; `JobMatchService` maps it to the
typed `CV_MATCH_INVALID_OUTPUT` response (HTTP 503). Scoring was never reached.
This is a stale mock contract, not an evidence or scoring defect.

Exact changed files for this correction:

- `apps/api/test/integration/cv-match.spec.ts`: replace input-object spreading with explicit allowed parent output fields (`parentId`, requirement, priority, category, JD quote and selected CV quote). Input-only group metadata is not echoed. All upload/revision, source quotation, tracker-preservation, rejection and 200/score assertions remain intact.
- `docs/audits/p6-final-review.md`: this diagnosis and verification report.

Production prompt/schema, evidence validation and scoring are unchanged. No
schema relaxation, test skip, timeout increase, migration or dependency is added.

Verification: **PASS — `pnpm test:integration`: 8 suites, 53 tests**, including
synthetic CV replacement and the original scores **100 / Apply → 50 → 50** with
updated job/CV evidence and unchanged tracker fields. Before fix: one failing
integration test; after fix: none. Existing unit/frontend passes remain applicable
to unchanged production code; the integration suite also recompiles API test code.
The prior full workspace test command excludes the separately configured
integration suites, so its successful run could not detect this mock mismatch.
The previously reported local verification explicitly did not run database
integration; that coverage gap is now closed locally for this correction.

API typecheck, scoped lint/format and whitespace checks are recorded with the
checkpoint response. The disposable test database started for reproduction is
stopped afterward. No commit, push or PR update for this correction; stop for review.
