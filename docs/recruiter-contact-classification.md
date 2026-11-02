# Recruiter contact classification fix

## Root Cause

Source recovery recognized labeled email/phone/hotline identically in the
recruitment post and JD. Backend merging then preserved those literal contact
values without requiring recruiter/application attribution. Thus a valid company
header number could become Recruiter Contact even though source presence did not
establish that it belonged to HR. The same gap allowed a model-proposed JD office
contact to pass quote validation.

A new synthetic regression failed before the fix: company header phone, hotline
and general email were included alongside the post's HR email/Zalo. No real model
output or private document was processed to investigate this task.

## Fix

- Apply source-aware classification only to new JD contact suggestions, including
  both AI proposals and deterministic source recovery.
- Require explicit HR/recruiter/application wording or a bounded contact run under
  an application heading. Company-name text containing HR is insufficient.
- Exclude unqualified general office, fax, hotline and letterhead contacts. An
  explicitly identified HR/application phone remains eligible.
- Use actual JD context, rather than trust the model's field assignment or shortened
  quote. Split mixed letterhead/application values to retain only eligible portions.
- Preserve recruitment-post email and labeled Zalo/phone behavior.
- Keep the complete JD text, assembled description and original document unchanged.
- Never filter existing saved contact values or manually entered contacts on
  save/read. Reuse current UI manual-edit protection.
- Clarify the contact-only prompt instruction accordingly.

No schema, migration, UI redesign, parser/security change, new provider, dependency
or unrelated feature was added. Only two production files changed.

### Exact changed files

- `apps/api/src/opportunities/job-import.evidence.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/test/unit/job-import.fields.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/web/test/job-import.test.tsx`
- `docs/architecture.md`
- `docs/recruiter-contact-classification.md`

## Evidence

| Requested case                                           | Synthetic verification                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| HR email + Zalo in post; office phone + fax in JD header | Only post contacts suggested; office/fax/hotline/general email excluded, including incorrect model proposals         |
| Explicit JD HR/application phone                         | Included with application-heading/source evidence; office header number excluded                                     |
| Post-only recruiter contacts                             | Existing focused email/Zalo/phone regressions pass unchanged                                                         |
| Manual edits and existing saved contacts                 | Manual edits survive extraction and save; historical saved contact metadata still validates without reclassification |

Additional tests cover a model combining the whole letterhead and HR section into
one value, mixed office/HR clauses, section boundaries and a company name containing
HR. Integration tests save/read the filtered contacts and verify the JD still
contains the original office phone/fax. The UI test confirms source text remains
available and manual contact edits are retained after extraction and save.

| Command/check                                                                                                                                                                              | Actual result                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/api test --runTestsByPath .test-dist/test/unit/job-import.fields.spec.js .test-dist/test/unit/job-import.spec.js .test-dist/test/unit/opportunities.spec.js` | 28 passed across 3 suites                                      |
| `pnpm --filter @ai-job-hunter/api test:integration`                                                                                                                                        | 27 passed across 3 suites; fake provider, isolated PostgreSQL  |
| `pnpm --filter @ai-job-hunter/web exec vitest run test/job-import.test.tsx`                                                                                                                | 12 passed                                                      |
| `pnpm typecheck`                                                                                                                                                                           | Both applications passed                                       |
| `pnpm build`                                                                                                                                                                               | Both applications passed; existing bundle-size warning remains |
| `pnpm lint`                                                                                                                                                                                | Passed                                                         |
| Prettier on exact changed files                                                                                                                                                            | Passed                                                         |
| `git diff --check`                                                                                                                                                                         | Passed                                                         |

## Remaining Blockers

No failure remains in the focused synthetic classification/save/review path.
This is a conservative explicit-context policy, not universal semantic attribution;
ambiguous JD contacts remain in source text for manual review.

Real-browser/real-Ollama verification was not performed under the requested limits.
No additional inference, private-document processing, development-data rewrite,
commit or push occurred. Existing uncommitted work and Git index were preserved.
Work stops after this classification fix.
