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
