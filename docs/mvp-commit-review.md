# Accepted MVP checkpoint: commit review

P1 (JD extraction), P2 (CV–JD matching), and P3 (CV Match UI/evidence navigation)
were accepted by the user through real browser testing. This checkpoint records
that work; it does not claim that all automated checks are green.

## Commit boundary

One coherent milestone commit preserves the coupled application modules, database
registration/migrations, Job Inbox/editor flows, extraction, CV review, matching,
UI, synthetic regression tests, and relevant investigation reports. Splitting P1,
P2, and P3 at file boundaries would leave missing imports or incomplete runtime
wiring. No application behavior was changed during this review.

Benchmark/experimental runners and their support/tests remain uncommitted.
AGENTS.md remains a local workflow edit. README.md and docs/architecture.md contain
interleaved historical/experimental changes and remain untouched and uncommitted,
rather than partially staging them. Their current working-tree documentation is
therefore ahead of the committed versions; documentation reconciliation remains.

The intentional synthetic-ui-cv.pdf fixture is included because the development
preview references it. Its inspected content contains only Alex Example,
alex@example.test, and TypeScript; it is not a private CV or a build output.
No environment files, credentials, database files, imported runtime job data,
private documents, build outputs, or diagnostic output files are staged.
Credential-pattern hits in included tests were synthetic sentinels/placeholders.
Ignored .env, .env.test and .env.gemini.local were neither read nor staged.

## Verification performed

| Check                                                                 | Actual result                                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Frontend focused Vitest run, eight files listed below                 | 69 passed, 25 failed; five files passed, three failed                                  |
| CV Match within that run                                              | 14 passed                                                                              |
| API focused Jest run, all 53 included changed/new API unit-test files | 990 passed, 1 failed; 52 suites passed, 1 failed                                       |
| pnpm --filter @ai-job-hunter/web typecheck                            | Passed                                                                                 |
| pnpm --filter @ai-job-hunter/api typecheck                            | Passed                                                                                 |
| Typechecks against a separate export of the staged source snapshot    | Both passed without excluded experimental files                                        |
| pnpm --filter @ai-job-hunter/api build                                | Passed                                                                                 |
| pnpm --filter @ai-job-hunter/web build                                | Passed; 721.24 kB JS bundle, 221.21 kB gzip; >500 kB warning                           |
| Prettier --check on the 197 selected text files before this report    | Failed: 36 files need formatting                                                       |
| ESLint on the selected TypeScript/TSX files                           | Failed: 25 errors, 1 warning                                                           |
| git diff --cached --check excluding the PDF fixture                   | Passed                                                                                 |
| git diff --cached --check including the PDF fixture                   | Reports trailing spaces in valid fixed-width PDF xref entries; fixture bytes preserved |

Frontend command (from apps/web):

```sh
pnpm exec vitest run test/cv-match.test.tsx test/job-import.test.tsx test/inbox.test.tsx test/url-import-extraction.test.tsx test/job-editor-flow.test.tsx test/job-viewport.test.tsx test/source-jd-preview.test.tsx test/topcv-bookmarklet.test.tsx
```

Backend test sources were compiled with `pnpm exec tsc -p tsconfig.test.json`
from apps/api, without deleting prior generated output. Jest was invoked with
`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.js --runInBand --runTestsByPath`
and the compiled `.test-dist/test/unit/*.spec.js` counterpart of each of the 53
API unit-test paths in the included-file manifest below. No manual/live runner,
full test suite, Ollama generation, or private CV access was performed.

## Known failures and remaining risks

- The previously reported 25 frontend failures persist: inbox (5), job-import
  (14), and url-import-extraction (6). They fail locating old or inactive UI
  controls such as Recruitment post, Upload JD document, Record contact date,
  Save changes, and Application status. They appear related to the JobEditor
  workflow/layout changes included in this checkpoint, not to CV Match preview
  navigation. These are not dismissed as unrelated or silently marked passing.
  The newer editor-flow, viewport, source-preview, bookmarklet, and CV Match tests
  passed. No test expectations or application behavior were changed to hide failures.
- Backend vietnamworks-complete-jd.spec.ts expects an empty salary but receives
  Negotiable. This is an extraction-related contract/test discrepancy in the
  committed scope and remains unresolved.
- Lint findings include unused variables/parameters, React effect state updates,
  and Fast Refresh export rules; the warning concerns the CV Match generation ref.
  Formatting and lint debt were preserved, not automatically rewritten.
- Five new explicit reversible migration files were reviewed and compiled; their
  apply/revert/reapply/repeat-run behavior and PostgreSQL integration were not
  rerun in this commit-only review. No database or persistent data was touched.
  Earlier investigation reports contain historical results, not new verification.
- Browser acceptance is the user's reported acceptance. No new browser run was
  performed in this commit review.
- The application remains a local single-user MVP, not an authenticated multi-user
  deployment. The bundle-size warning and documentation reconciliation remain.

## Included files

This report is included alongside the following 198 reviewed files:

- `apps/api/src/ai/ai-generation.diagnostics.ts`
- `apps/api/src/ai/ai-provider.ts`
- `apps/api/src/ai/ai.service.ts`
- `apps/api/src/ai/ollama.context.ts`
- `apps/api/src/ai/ollama.provider.ts`
- `apps/api/src/analysis/analysis-http.ts`
- `apps/api/src/analysis/analysis-upload.ts`
- `apps/api/src/analysis/analysis.contracts.ts`
- `apps/api/src/analysis/analysis.errors.ts`
- `apps/api/src/analysis/analysis.service.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/config/environment.ts`
- `apps/api/src/database/database.config.ts`
- `apps/api/src/database/migrations/1792800000000-CreateOpportunities.ts`
- `apps/api/src/database/migrations/1793400000000-SmartJobImport.ts`
- `apps/api/src/database/migrations/1793490000000-CompleteJobImportFields.ts`
- `apps/api/src/database/migrations/1793500000000-SavedCv.ts`
- `apps/api/src/database/migrations/1793510000000-JobDiscovery.ts`
- `apps/api/src/discovery/discovery.service.ts`
- `apps/api/src/discovery/discovery.ts`
- `apps/api/src/discovery/greenhouse.source.ts`
- `apps/api/src/extraction/document-parser.ts`
- `apps/api/src/extraction/docx-failure.ts`
- `apps/api/src/extraction/docx-zip.ts`
- `apps/api/src/extraction/docx.parser.ts`
- `apps/api/src/extraction/extraction.errors.ts`
- `apps/api/src/extraction/extraction.prompts.ts`
- `apps/api/src/extraction/extraction.service.ts`
- `apps/api/src/extraction/extraction.types.ts`
- `apps/api/src/extraction/jd-requirements.ts`
- `apps/api/src/extraction/parser.protocol.ts`
- `apps/api/src/extraction/parser.worker.ts`
- `apps/api/src/extraction/partial-extraction.ts`
- `apps/api/src/extraction/partial-extraction.types.ts`
- `apps/api/src/extraction/partial-proposal.contract.ts`
- `apps/api/src/extraction/pdf-parser.diagnostics.ts`
- `apps/api/src/extraction/pdf.parser.ts`
- `apps/api/src/jobs/jobs.controller.ts`
- `apps/api/src/jobs/jobs.module.ts`
- `apps/api/src/jobs/jobs.service.ts`
- `apps/api/src/jobs/jobs.types.ts`
- `apps/api/src/main.ts`
- `apps/api/src/matching/cv-match.diagnostics.ts`
- `apps/api/src/matching/cv-match.error.ts`
- `apps/api/src/matching/cv-match.evidence.ts`
- `apps/api/src/matching/cv-match.ts`
- `apps/api/src/matching/job-match.service.ts`
- `apps/api/src/matching/matching.service.ts`
- `apps/api/src/matching/matching.validation.ts`
- `apps/api/src/matching/saved-cv.entity.ts`
- `apps/api/src/opportunities/job-document.error.ts`
- `apps/api/src/opportunities/job-import.contract.ts`
- `apps/api/src/opportunities/job-import.domain.ts`
- `apps/api/src/opportunities/job-import.evidence.ts`
- `apps/api/src/opportunities/job-import.experience.ts`
- `apps/api/src/opportunities/job-import.salary.ts`
- `apps/api/src/opportunities/job-import.sections.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/src/opportunities/job-import.upload.ts`
- `apps/api/src/opportunities/job-import.work-mode.ts`
- `apps/api/src/opportunities/job-url-import.ts`
- `apps/api/src/opportunities/job-url.transport.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/opportunities.module.ts`
- `apps/api/src/opportunities/opportunities.security.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/src/opportunities/opportunity.entity.ts`
- `apps/api/src/opportunities/opportunity.validation.ts`
- `apps/api/src/opportunities/topcv-page-import.ts`
- `apps/api/test/integration/cv-match.spec.ts`
- `apps/api/test/integration/database.spec.ts`
- `apps/api/test/integration/discovery.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/api/test/integration/opportunities.spec.ts`
- `apps/api/test/support/docx-fixtures.ts`
- `apps/api/test/support/job-quality.synthetic.ts`
- `apps/api/test/support/mdm-import.synthetic.ts`
- `apps/api/test/support/pdf-fixtures.ts`
- `apps/api/test/support/smart-import.synthetic.ts`
- `apps/api/test/unit/ai-generation.diagnostics.spec.ts`
- `apps/api/test/unit/ai-tooling-downgrade.spec.ts`
- `apps/api/test/unit/ai.spec.ts`
- `apps/api/test/unit/analysis.lifecycle.spec.ts`
- `apps/api/test/unit/analysis.partial.spec.ts`
- `apps/api/test/unit/axon-score-trace.spec.ts`
- `apps/api/test/unit/benefits-skill-leakage.spec.ts`
- `apps/api/test/unit/config.spec.ts`
- `apps/api/test/unit/cv-match.diagnostics.spec.ts`
- `apps/api/test/unit/cv-match.spec.ts`
- `apps/api/test/unit/cv-quote-resolution.spec.ts`
- `apps/api/test/unit/cv-source-selection.spec.ts`
- `apps/api/test/unit/discovered-match.spec.ts`
- `apps/api/test/unit/discovery.spec.ts`
- `apps/api/test/unit/document-parser.spec.ts`
- `apps/api/test/unit/docx-failure.spec.ts`
- `apps/api/test/unit/docx-parser.spec.ts`
- `apps/api/test/unit/experience-salary-conflicts.spec.ts`
- `apps/api/test/unit/extraction.prompts.spec.ts`
- `apps/api/test/unit/extraction.service.spec.ts`
- `apps/api/test/unit/full-jd-skills.spec.ts`
- `apps/api/test/unit/itviec-fields.spec.ts`
- `apps/api/test/unit/java-required-import.spec.ts`
- `apps/api/test/unit/job-import.domain.spec.ts`
- `apps/api/test/unit/job-import.fields.spec.ts`
- `apps/api/test/unit/job-import.location.spec.ts`
- `apps/api/test/unit/job-import.seniority.spec.ts`
- `apps/api/test/unit/job-import.spec.ts`
- `apps/api/test/unit/job-import.work-mode.spec.ts`
- `apps/api/test/unit/job-match.regression.spec.ts`
- `apps/api/test/unit/job-quality.spec.ts`
- `apps/api/test/unit/job-url-import.spec.ts`
- `apps/api/test/unit/job-url.spec.ts`
- `apps/api/test/unit/job-url.transport.spec.ts`
- `apps/api/test/unit/jobs.spec.ts`
- `apps/api/test/unit/match-evidence-validation.spec.ts`
- `apps/api/test/unit/matching.spec.ts`
- `apps/api/test/unit/mdm-import.spec.ts`
- `apps/api/test/unit/ollama.context.spec.ts`
- `apps/api/test/unit/opportunities.security.spec.ts`
- `apps/api/test/unit/opportunities.spec.ts`
- `apps/api/test/unit/partial-budget.spec.ts`
- `apps/api/test/unit/partial-extraction.spec.ts`
- `apps/api/test/unit/pdf-parser.diagnostics.spec.ts`
- `apps/api/test/unit/pdf-parser.spec.ts`
- `apps/api/test/unit/salary-equivalence.spec.ts`
- `apps/api/test/unit/telecom-preference.spec.ts`
- `apps/api/test/unit/topcv-final-fields.spec.ts`
- `apps/api/test/unit/topcv-page-import.spec.ts`
- `apps/api/test/unit/url-import-extraction.spec.ts`
- `apps/api/test/unit/vietnamworks-complete-jd.spec.ts`
- `apps/api/test/unit/vietnamworks-page-import.spec.ts`
- `apps/api/test/unit/viettel-import.spec.ts`
- `apps/web/public/synthetic-ui-cv.pdf`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/dashboard/AnalysisForm.tsx`
- `apps/web/src/features/dashboard/AnalysisResult.tsx`
- `apps/web/src/features/dashboard/Dashboard.tsx`
- `apps/web/src/features/dashboard/FactReviewControls.tsx`
- `apps/web/src/features/dashboard/JobsPanel.tsx`
- `apps/web/src/features/dashboard/PartialFacts.tsx`
- `apps/web/src/features/dashboard/UiAcceptancePreview.tsx`
- `apps/web/src/features/dashboard/analysis-api.ts`
- `apps/web/src/features/dashboard/analysis.types.ts`
- `apps/web/src/features/dashboard/jobs-api.ts`
- `apps/web/src/features/dashboard/jobs-ranking.ts`
- `apps/web/src/features/dashboard/jobs.types.ts`
- `apps/web/src/features/dashboard/partial-validation.ts`
- `apps/web/src/features/dashboard/partial.types.ts`
- `apps/web/src/features/dashboard/useAnalysis.ts`
- `apps/web/src/features/inbox/CvMatchPanel.tsx`
- `apps/web/src/features/inbox/DiscoverJobs.tsx`
- `apps/web/src/features/inbox/ImportMethodCards.tsx`
- `apps/web/src/features/inbox/JobActionLayout.tsx`
- `apps/web/src/features/inbox/JobEditor.tsx`
- `apps/web/src/features/inbox/JobInbox.tsx`
- `apps/web/src/features/inbox/RequirementInputs.tsx`
- `apps/web/src/features/inbox/SourceJdPreview.tsx`
- `apps/web/src/features/inbox/TopcvBookmarkletInstall.tsx`
- `apps/web/src/features/inbox/UnsavedJobGuard.tsx`
- `apps/web/src/features/inbox/job-url-import.ts`
- `apps/web/src/features/inbox/opportunities-api.ts`
- `apps/web/src/features/inbox/topcv-bookmarklet.ts`
- `apps/web/src/main.tsx`
- `apps/web/test/analysis.test.tsx`
- `apps/web/test/app.test.tsx`
- `apps/web/test/cv-match.test.tsx`
- `apps/web/test/discovery.test.tsx`
- `apps/web/test/fact-review.test.tsx`
- `apps/web/test/fixtures/analysis.ts`
- `apps/web/test/fixtures/smart-import-complete.synthetic.json`
- `apps/web/test/fixtures/smart-import.synthetic-result.json`
- `apps/web/test/import-methods.test.tsx`
- `apps/web/test/inbox.test.tsx`
- `apps/web/test/job-action-layout.test.tsx`
- `apps/web/test/job-editor-flow.test.tsx`
- `apps/web/test/job-import.test.tsx`
- `apps/web/test/job-url.test.tsx`
- `apps/web/test/job-viewport.test.tsx`
- `apps/web/test/jobs-live.test.tsx`
- `apps/web/test/jobs.test.tsx`
- `apps/web/test/partial.test.tsx`
- `apps/web/test/requirement-inputs.test.tsx`
- `apps/web/test/source-jd-preview.test.tsx`
- `apps/web/test/topcv-bookmarklet.test.tsx`
- `apps/web/test/ui-preview.test.tsx`
- `apps/web/test/upload-smoke.test.tsx`
- `apps/web/test/url-import-extraction.test.tsx`
- `apps/web/test/url-import.test.tsx`
- `apps/web/vite.config.ts`
- `docs/cv-match-regression-investigation.md`
- `docs/docx-growth-padding-fix.md`
- `docs/docx-parsing-investigation.md`
- `docs/phase-1-report.md`
- `docs/recruiter-contact-classification.md`
- `docs/recruiter-contact-fix.md`
- `docs/smart-import-fields-report.md`
- `docs/smart-job-import-fix-report.md`
- `docs/smart-job-import-report.md`

## Excluded and preserved working-tree files

- `AGENTS.md`
- `README.md`
- `apps/api/test/manual/catalog-selection.run.ts`
- `apps/api/test/manual/evidence-first.child.ts`
- `apps/api/test/manual/evidence-first.compact.child.ts`
- `apps/api/test/manual/evidence-first.diagnostic.adapter.ts`
- `apps/api/test/manual/evidence-first.diagnostic.child.ts`
- `apps/api/test/manual/evidence-first.diagnostic.run.ts`
- `apps/api/test/manual/evidence-first.preflight.ts`
- `apps/api/test/manual/evidence-first.run.ts`
- `apps/api/test/manual/gemini-benchmark.run.ts`
- `apps/api/test/manual/gemini-stage-a-legacy.run.ts`
- `apps/api/test/manual/minimal-semantic.run.ts`
- `apps/api/test/manual/output-profile.preflight.ts`
- `apps/api/test/manual/output-profile.quote-ab.ts`
- `apps/api/test/manual/output-profile.run.ts`
- `apps/api/test/manual/output-profile.sparse.ts`
- `apps/api/test/manual/qwen8b-benchmark.run.ts`
- `apps/api/test/manual/upload.smoke.ts`
- `apps/api/test/support/candidate-catalog.review.md`
- `apps/api/test/support/candidate-catalog.ts`
- `apps/api/test/support/catalog-selection-experiment.ts`
- `apps/api/test/support/cv-field-groups.ts`
- `apps/api/test/support/evidence-context-feasibility.ts`
- `apps/api/test/support/evidence-first-approval-packaging.ts`
- `apps/api/test/support/evidence-first-attachments.ts`
- `apps/api/test/support/evidence-first-compact.ts`
- `apps/api/test/support/evidence-first-diagnostic-telemetry.ts`
- `apps/api/test/support/evidence-first-diagnostic.ts`
- `apps/api/test/support/evidence-first-evaluation.ts`
- `apps/api/test/support/evidence-first-experiment.ts`
- `apps/api/test/support/evidence-first-model-identity.ts`
- `apps/api/test/support/evidence-first-obligations.ts`
- `apps/api/test/support/evidence-first-readiness.ts`
- `apps/api/test/support/evidence-first-runner.ts`
- `apps/api/test/support/evidence-first-transport.ts`
- `apps/api/test/support/gemini-error-diagnostics.ts`
- `apps/api/test/support/matching-evidence-diagnostics.ts`
- `apps/api/test/support/minimal-semantic-experiment.ts`
- `apps/api/test/support/minimal-semantic-rubric.md`
- `apps/api/test/support/output-profile-fixtures.ts`
- `apps/api/test/support/output-profiler.ts`
- `apps/api/test/support/quote-prompt-ab.ts`
- `apps/api/test/support/qwen8b-benchmark.ts`
- `apps/api/test/support/validation-rejection.ts`
- `apps/api/test/unit/candidate-catalog.spec.ts`
- `apps/api/test/unit/catalog-selection-experiment.spec.ts`
- `apps/api/test/unit/clause-context.feasibility.spec.ts`
- `apps/api/test/unit/cv-field-groups.spec.ts`
- `apps/api/test/unit/evidence-first-approval-packaging.spec.ts`
- `apps/api/test/unit/evidence-first-compact-integration.spec.ts`
- `apps/api/test/unit/evidence-first-compact.spec.ts`
- `apps/api/test/unit/evidence-first-diagnostic-adapter.spec.ts`
- `apps/api/test/unit/evidence-first-diagnostic-timeout.spec.ts`
- `apps/api/test/unit/evidence-first-diagnostic.spec.ts`
- `apps/api/test/unit/evidence-first-evaluation.spec.ts`
- `apps/api/test/unit/evidence-first-experiment.spec.ts`
- `apps/api/test/unit/evidence-first-obligations.spec.ts`
- `apps/api/test/unit/evidence-first-readiness.spec.ts`
- `apps/api/test/unit/evidence-first-runner.spec.ts`
- `apps/api/test/unit/evidence-locator.feasibility.spec.ts`
- `apps/api/test/unit/gemini-error-diagnostics.spec.ts`
- `apps/api/test/unit/matching-evidence-diagnostics.spec.ts`
- `apps/api/test/unit/minimal-duplicate-diagnostics.spec.ts`
- `apps/api/test/unit/minimal-semantic-experiment.spec.ts`
- `apps/api/test/unit/output-profiler.spec.ts`
- `apps/api/test/unit/quote-prompt-ab.spec.ts`
- `apps/api/test/unit/qwen8b-benchmark.spec.ts`
- `apps/api/test/unit/validation-rejection.spec.ts`
- `docs/architecture.md`
