# Real DOCX parsing failure investigation

## Decision

Keep the existing Mammoth/yauzl parser, limits and local-only security. Add safe,
actionable stage diagnostics rather than guess which private-file feature failed
or relax validation. **The original HR DOCX failure is not yet reproduced or
resolved.** No private document or Ollama inference was processed in this task.

## Root cause established versus still unknown

The browser adds `Your inputs are retained; you can edit fields manually.` to the
API message in JobEditor. `Document parsing failed` is the shared ExtractionError
message for `PARSING_FAILED`, converted by JobImportService.parse into HTTP 400.

The path is:

1. JobEditor retains a selected File and post text; importUpload creates FormData
   containing record JSON and the original File bytes with PDF/DOCX MIME.
2. Relative `/api/v1/opportunities/extract` goes through Vite to the Nest API.
3. localWrite checks Host/Origin; readJobUpload validates multipart fields,
   filename/MIME, upload size and timeout, then reconstructs file bytes.
4. JobImportService invokes the shared DocumentParser, which validates metadata
   and dispatches a bounded worker.
5. DOCX processing validates ZIP structure/resources, validates the DOCX XML and
   relationships, calls Mammoth, validates extracted text and builds source spans.
6. AiService is invoked only after successful parsing.

Prior to this change, ZIP/package/Mammoth exceptions all collapsed to
PARSING_FAILED and worker output was deliberately consumed/discarded. The
opportunities exception filter did not log the underlying exception. Consequently
there is no retained stage-level log for the original browser failure. This is
an established diagnostic gap; it is **not evidence that Ollama, data descriptors,
XML corruption or any particular feature caused the actual HR file to fail**.

The actual failing file was not supplied or authorized for inspection. No uploads,
private artifacts or historical payloads were searched/read. Original browser
interaction is unavailable. The exact file-level root cause is therefore unknown.

## Fix implemented within authorized scope

- Preserve the original PARSING_FAILED code and shared error message for compatibility.
- Carry fixed DOCX stage reasons through validated worker IPC:
  ZIP_INVALID, ZIP_UNSUPPORTED_PROFILE, PACKAGE_INVALID,
  TEXT_EXTRACTION_FAILED, WORKER_FAILED.
- Classify ZIP profile rejection separately without accepting new ZIP features.
- Return errorCode and parserReason at the opportunities HTTP boundary, alongside
  an actionable safe message: Save As a fresh standard DOCX, export text PDF,
  or remove the selected attachment and paste text.
- Emit a safe JD_DOCUMENT_PARSE_FAILED warning with only code/reason tokens.
  No filenames, document bytes/text, recruiter data, links, raw library messages
  or stack traces are logged.
- Reuse the same mapping in the existing parse-only endpoint.
- Keep UI post/File/manual fields after failed parsing. No UI production-code
  change was needed; the regression test confirms current retention.

No supported-format expansion, parser replacement, new dependency, ZIP bypass,
size-limit change, schema migration or local-security change was made.

## Evidence

### Automated commands and actual results

| Check                                               | Actual result                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused parser command below                        | 123 passed across 4 suites                                                  |
| `pnpm --filter @ai-job-hunter/api test:integration` | 21 passed across 3 suites; fake AI provider, no live inference              |
| `pnpm --filter @ai-job-hunter/web test`             | 97 passed, 7 existing opt-in tests skipped                                  |
| `pnpm typecheck`                                    | Both applications passed                                                    |
| `pnpm build`                                        | Both applications passed; existing approximately 566 kB Vite bundle warning |
| `pnpm lint`                                         | Passed                                                                      |
| Prettier on exact task paths                        | Passed                                                                      |
| `git diff --check`                                  | Passed                                                                      |

```bash
pnpm --filter @ai-job-hunter/api test --runTestsByPath \
  .test-dist/test/unit/docx-failure.spec.js \
  .test-dist/test/unit/docx-parser.spec.js \
  .test-dist/test/unit/document-parser.spec.js \
  .test-dist/test/unit/pdf-parser.spec.js
```

Synthetic fixtures reproduce the generic symptom for corrupt ZIP bytes, a missing
content-types package and unsupported ZIP flags. They now yield ZIP_INVALID,
PACKAGE_INVALID and ZIP_UNSUPPORTED_PROFILE respectively. A mocked Mammoth error
yields TEXT_EXTRACTION_FAILED without exposing its raw message. The test with
unsupported flags is not a claim that the actual HR file uses that feature or
that all such files are corrupt. Existing archive and external-resource security
tests still pass. The same parser recovers and parses valid DOCX after failure.

The integration suite verifies failed parses never call the fake generation
provider, valid PDF/DOCX still continue to structured extraction, and raw parse-only
success/failure never invokes AI. Worker diagnostic validation rejects arbitrary
strings/objects and mismatched codes. UI tests confirm selected File, pasted post
and manually entered title remain intact after an actionable DOCX failure.

### Running endpoint, synthetic-only verification

Node fetch through the running Vite proxy, with canonical allowed local Origin:

- `POST /api/v1/opportunities/parse-document`, valid synthetic DOCX: HTTP 200;
  expected synthetic HR JD text present.
- Multipart `POST /api/v1/opportunities/extract`, corrupt synthetic DOCX: HTTP 400,
  PARSING_FAILED / ZIP_INVALID.
- Same multipart path, invalid synthetic package: HTTP 400 / PACKAGE_INVALID.
- Same multipart path, unsupported synthetic ZIP flags: HTTP 400 /
  ZIP_UNSUPPORTED_PROFILE.

All failed inputs are rejected before generation. No live Ollama call, private
file processing, or development database write was performed. Existing data,
uncommitted changes and Git index were preserved. No prohibited Git operations.

## Exact changed files

- `apps/api/src/extraction/docx-failure.ts`
- `apps/api/src/extraction/docx-zip.ts`
- `apps/api/src/extraction/docx.parser.ts`
- `apps/api/src/extraction/extraction.errors.ts`
- `apps/api/src/extraction/parser.protocol.ts`
- `apps/api/src/extraction/parser.worker.ts`
- `apps/api/src/extraction/document-parser.ts`
- `apps/api/src/opportunities/job-document.error.ts`
- `apps/api/src/opportunities/job-import.service.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/api/test/unit/docx-failure.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `apps/web/test/job-import.test.tsx`
- `README.md`
- `docs/architecture.md`
- `docs/docx-parsing-investigation.md`

## Blockers

Original HR DOCX reproduction and resolution: **NOT_VERIFIED / unresolved**.
Real-document processing: **NOT_AUTHORIZED / NOT_PERFORMED**.
Real-browser interaction: **NOT_VERIFIED**.
Real Ollama inference: **NOT_AUTHORIZED / NOT_PERFORMED** in this task.

Valid synthetic DOCX parsing passes, so a parser behavior change cannot honestly
be attributed to the actual private failure without its safe diagnostic reason or
an authorized file-level reproduction. Existing ZIP profile restrictions may
reject some valid document encodings/packaging; none was assumed to be this case.

## Next action

Request explicit authorization and the exact path of the one failing DOCX for
local parsing only. Inspect only that file, never invoke Ollama or log its contents,
and use the fixed diagnostic reason to guide a minimal parser behavior fix and
synthetic regression fixture. Alternatively, a safe parserReason from a parse-only
request can narrow the investigation without sharing content. Do not use Extract
with AI as a private-file diagnostic probe without inference authorization.

Stop here pending that authorization/information, as required by the user's
instruction to ask before reading or processing the actual HR document.
