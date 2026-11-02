# P1–P3 stabilization

Stabilization follows accepted checkpoint `575d03d` without reopening the accepted
extraction, matching, scoring, or layout behavior. All 70 unrelated pre-existing
working-tree files were checked by SHA-256 and preserved byte-for-byte. The
checkpoint commit was not amended. No remote operation, inference, private CV
access, database integration test, or migration execution was performed.

## Failure triage

| Baseline group                             | Classification                       | Cause and targeted fix                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend inbox: 5 failures                 | Outdated test expectations           | Creation now has Import then Review & Save; Application controls belong to the saved-job Application tab. Tests now follow those steps, preserve create payload assertions, and exercise tracking persistence after creation. Save requests are selected by method rather than incidental fetch-call positions.                                                                                                                                             |
| Frontend job-import: 14 failures           | Outdated test expectations and mocks | Tests assumed all import methods, review inputs, and detail controls were simultaneously visible. They now select Paste/Upload/URL, use the current overview heading and source-preview control, navigate Edit JD for re-extraction, and account for the parse-only request and CV metadata fetch. Upload retention, conflict acknowledgement, manual corrections, unsafe links, and source attribution assertions remain.                                  |
| Frontend url-import-extraction: 6 failures | Outdated test setup                  | The tests edited the recruitment-post field before selecting Paste JD, including reanalysis from Review. They now explicitly return to Import and select the source method. Source completeness, conflict review, and manual edit protection assertions remain.                                                                                                                                                                                             |
| Backend salary: 1 failure                  | Outdated expectation                 | The source explicitly discloses negotiable pay. Review intentionally preserves the nonnumeric value Negotiable; numeric salary details remain unknown and placeholder 9999 is excluded. The test now checks the review disclosure and verifies original-source attribution. Existing parser assertions still require empty numeric salary and null salaryDetails.                                                                                           |
| PR lint: 25 errors, 1 warning              | Source/test lint debt                | Removed dead bindings; typed mocks retain call signatures without unused implementation parameters. Requirement grouping becomes a private helper. CV result invalidation and source-preview reopening now adjust state when their input changes instead of synchronously updating it in effects. The navigation guard reads current render props in its blocker callback instead of writing a ref during render. The bookmarklet timeout binding is const. |
| PR formatting: 36 files                    | Formatting debt                      | Applied Prettier only to files from checkpoint 575d03d; no unrelated experimental or historical working-tree files were formatted.                                                                                                                                                                                                                                                                                                                          |

No confirmed application regression or environment/infrastructure failure was
found in these reported test groups. The lifecycle lint fixes are covered by the
existing UI tests plus a focused stale-response regression: a result arriving
after a saved-job revision change stays discarded and a new analysis can succeed.
The rest of the source changes are formatting-only.

## Verification

| Check                                                                                        | Result                                                                           |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Frontend PR tests, excluding the two opt-in live/smoke files                                 | 202 passed across 20 files                                                       |
| Follow-up focused CV Match and URL import tests, including the new stale-response regression | 27 passed across 2 files; 203 distinct frontend tests passed across the two runs |
| Backend PR unit tests                                                                        | 991 passed across 53 suites                                                      |
| PR-scoped ESLint with zero warnings allowed                                                  | Passed: zero errors/warnings                                                     |
| PR-scoped Prettier check                                                                     | Passed                                                                           |
| Web and API typechecks                                                                       | Passed                                                                           |
| Web and API builds                                                                           | Passed                                                                           |
| git diff --check                                                                             | Passed                                                                           |

The original 25 frontend failures and one backend failure are resolved. No tests
were skipped or assertions removed to mask those failures. Two opt-in live/smoke
frontend files were deliberately not invoked. Experimental/untracked backend
suites and the repository-wide suites were not invoked.

Exact test/check selection is derived from the checkpoint's file manifest, not
from the dirty working tree. This is the equivalent runnable orchestration used
for the PR test, lint, and format commands (from the repository root):

```python
import subprocess

files = subprocess.check_output([
    'git', 'diff-tree', '--no-commit-id', '--name-only', '-r', '575d03d'
], text=True).splitlines()
web = [f.removeprefix('apps/web/') for f in files
       if f.startswith('apps/web/test/') and f.endswith('.test.tsx')
       and f not in ['apps/web/test/jobs-live.test.tsx',
                     'apps/web/test/upload-smoke.test.tsx']]
subprocess.run(['pnpm', 'exec', 'vitest', 'run', *web], cwd='apps/web', check=True)
subprocess.run(['pnpm', 'exec', 'tsc', '-p', 'tsconfig.test.json'],
               cwd='apps/api', check=True)
api = [f.replace('apps/api/test/unit/', '.test-dist/test/unit/')
        .replace('.spec.ts', '.spec.js') for f in files
       if f.startswith('apps/api/test/unit/')]
subprocess.run(['node', '--experimental-vm-modules',
                'node_modules/jest/bin/jest.js', '--config', 'jest.config.js',
                '--runInBand', '--runTestsByPath', *api],
               cwd='apps/api', check=True)
subprocess.run(['pnpm', 'exec', 'eslint', '--max-warnings', '0',
                *[f for f in files if f.endswith(('.ts', '.tsx'))]], check=True)
subprocess.run(['pnpm', 'exec', 'prettier', '--check',
                *[f for f in files if f.endswith(('.ts', '.tsx', '.md', '.json'))]],
               check=True)
```

Follow-up test command (from apps/web):

```sh
pnpm exec vitest run test/cv-match.test.tsx test/url-import-extraction.test.tsx
```

Typecheck/build commands (from repository root):

```sh
pnpm --filter @ai-job-hunter/web typecheck
pnpm --filter @ai-job-hunter/api typecheck
pnpm --filter @ai-job-hunter/api build
pnpm --filter @ai-job-hunter/web build
```

## Merge assessment and remaining risks

The reported unit/UI, lint, formatting, typecheck, and build blockers are cleared.
P1–P3 is ready on those verified gates. Database integration and migration
apply/revert/reapply/repeat-run were not rerun because explicit authorization is
required. If those are required merge gates, that verification remains pending;
this report does not claim database readiness. No schema/migration behavior was
changed by stabilization. Real-browser acceptance remains the user's earlier
acceptance; no new browser verification was available.

The frontend build still warns about a 721.32 kB JS chunk (221.24 kB gzip).
Authentication/multi-user deployment and documentation reconciliation remain
outside this local MVP checkpoint. The pre-existing README.md, AGENTS.md,
docs/architecture.md and experimental files remain uncommitted and untouched.
The original mvp-commit-review.md remains a historical record of the checkpoint's
baseline failures, rather than being rewritten to imply those checks passed then.

## Changed files

Functional/test changes and formatting are limited to the following PR files,
plus this stabilization report. Files without a behavioral change were normalized
by Prettier only.

- `apps/api/src/extraction/pdf-parser.diagnostics.ts`
- `apps/api/src/extraction/pdf.parser.ts`
- `apps/api/src/matching/cv-match.ts`
- `apps/api/src/opportunities/job-url.transport.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/src/opportunities/opportunities.module.ts`
- `apps/api/src/opportunities/opportunities.service.ts`
- `apps/api/src/opportunities/opportunity.entity.ts`
- `apps/api/src/opportunities/topcv-page-import.ts`
- `apps/api/test/integration/opportunities.spec.ts`
- `apps/api/test/unit/document-parser.spec.ts`
- `apps/api/test/unit/full-jd-skills.spec.ts`
- `apps/api/test/unit/itviec-fields.spec.ts`
- `apps/api/test/unit/java-required-import.spec.ts`
- `apps/api/test/unit/job-import.domain.spec.ts`
- `apps/api/test/unit/job-import.fields.spec.ts`
- `apps/api/test/unit/job-import.location.spec.ts`
- `apps/api/test/unit/job-import.seniority.spec.ts`
- `apps/api/test/unit/job-quality.spec.ts`
- `apps/api/test/unit/job-url-import.spec.ts`
- `apps/api/test/unit/job-url.spec.ts`
- `apps/api/test/unit/job-url.transport.spec.ts`
- `apps/api/test/unit/mdm-import.spec.ts`
- `apps/api/test/unit/pdf-parser.diagnostics.spec.ts`
- `apps/api/test/unit/pdf-parser.spec.ts`
- `apps/api/test/unit/telecom-preference.spec.ts`
- `apps/api/test/unit/topcv-final-fields.spec.ts`
- `apps/api/test/unit/topcv-page-import.spec.ts`
- `apps/api/test/unit/url-import-extraction.spec.ts`
- `apps/api/test/unit/vietnamworks-complete-jd.spec.ts`
- `apps/api/test/unit/vietnamworks-page-import.spec.ts`
- `apps/api/test/unit/viettel-import.spec.ts`
- `apps/web/src/features/inbox/CvMatchPanel.tsx`
- `apps/web/src/features/inbox/JobInbox.tsx`
- `apps/web/src/features/inbox/RequirementInputs.tsx`
- `apps/web/src/features/inbox/SourceJdPreview.tsx`
- `apps/web/src/features/inbox/UnsavedJobGuard.tsx`
- `apps/web/src/features/inbox/job-url-import.ts`
- `apps/web/src/features/inbox/opportunities-api.ts`
- `apps/web/src/features/inbox/topcv-bookmarklet.ts`
- `apps/web/test/cv-match.test.tsx`
- `apps/web/test/discovery.test.tsx`
- `apps/web/test/inbox.test.tsx`
- `apps/web/test/job-import.test.tsx`
- `apps/web/test/job-url.test.tsx`
- `apps/web/test/source-jd-preview.test.tsx`
- `apps/web/test/topcv-bookmarklet.test.tsx`
- `apps/web/test/url-import-extraction.test.tsx`
- `docs/cv-match-regression-investigation.md`
- `docs/mvp-commit-review.md`
