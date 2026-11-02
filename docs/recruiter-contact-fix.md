# Recruiter Contact preservation fix

## Root Cause

The confirmed upstream loss paths were:

1. The model contract already permits multiple contactNotes candidates, but source
   recovery extracted email only, with no Zalo/phone rule. A synthetic provider
   returning only email reproduced the reported email-only result before the fix.
2. Backend merge treated separate contact strings as scalar alternatives unless
   one string already contained every other value. Separate complementary methods
   could consequently become a blank CONFLICT rather than a complete contact list.

No real Ollama output was accessed, so this is not a claim that the latest actual
model omitted versus normalized the user's number. The synthetic regression
establishes the backend omission path without inference or private processing.

The frontend binds the entire contactNotes string to an existing multiline
textarea. The API, PostgreSQL text column and detail/edit path retain the entire
string. No evidence of downstream truncation was found, and focused save/read
and UI tests verify that both methods pass through intact.

## Fix

- Recover every explicitly provided email and labeled Zalo/phone number from
  supplied source text. Preserve original formatting and source evidence; do not
  infer a number, contact method or country code.
- Merge complementary supported contacts into the existing bounded multiline
  contactNotes value, retaining full-value/subset deduplication.
- Clarify the existing prompt to request every stated email and Zalo/phone method.
- Preserve already reviewed historical contact-conflict metadata on save under
  the new merge semantics. Unreviewed conflicts still require review.
- Reuse the existing manual-edit protection. No frontend production code, schema,
  migration, parser, security, provider or unrelated field change.

### Exact changed files

- `apps/api/src/opportunities/job-import.evidence.ts`
- `apps/api/src/opportunities/job-import.contract.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/test/unit/job-import.fields.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/web/test/job-import.test.tsx`
- `docs/architecture.md`
- `docs/recruiter-contact-fix.md`

## Evidence

Two new focused assertions failed before the fix: an email-only fake-model result
lost explicit Zalo, and source recovery omitted labeled phone methods. After the
fix, focused synthetic tests verify email plus Zalo/phone, source quotes, no invented
numbers from missing contacts/salary, no duplication when a full model contact
already contains both methods, and compatibility of reviewed old contact conflicts.

The integration regression saves the combined contact text, checks it through a
separate PostgreSQL connection, reads detail, manually edits the contact text,
saves again and confirms the edited value on read-back. Only isolated synthetic
test records are used. The UI regression displays both methods, saves/reloads
through the API mock, and confirms extraction keeps manually corrected contacts.
An initial multiline display matcher in that test was corrected to assert the
actual textarea value; production UI required no change.

| Command                                                                                                                                                                                    | Actual result                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/api test --runTestsByPath .test-dist/test/unit/job-import.fields.spec.js .test-dist/test/unit/job-import.spec.js .test-dist/test/unit/opportunities.spec.js` | 22 passed across 3 suites                                      |
| `pnpm --filter @ai-job-hunter/api test:integration`                                                                                                                                        | 25 passed across 3 suites, fake provider, isolated PostgreSQL  |
| `pnpm --filter @ai-job-hunter/web exec vitest run test/job-import.test.tsx`                                                                                                                | 11 passed                                                      |
| `pnpm typecheck`                                                                                                                                                                           | Both applications passed                                       |
| `pnpm build`                                                                                                                                                                               | Both applications passed; existing bundle-size warning remains |
| `pnpm lint`                                                                                                                                                                                | Passed                                                         |
| Prettier check on the exact changed paths                                                                                                                                                  | Passed                                                         |
| `git diff --check`                                                                                                                                                                         | Passed                                                         |

## Remaining Blockers

None found in the focused synthetic extraction/review/persistence path. This fix's
real-browser/Ollama verification is NOT_PERFORMED under the requested limits; the
user's acceptance of other fields is preserved and not presented as a new test.
No additional inference, private-document processing, development data rewrite,
commit or push was performed. Existing uncommitted work and Git index were preserved.
Work stops after this contact fix.
