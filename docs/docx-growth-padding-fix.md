# Authorized DOCX parsing fix

## Root cause

The specified document was read locally only after explicit authorization. The
original failure was reproduced with the existing DocumentParser:
`PARSING_FAILED`, reason `ZIP_INVALID`.

Structural inspection found six local ZIP headers containing Office OPC growth
hint padding, while their corresponding central-directory extra fields were
empty. They used the expected 0xA220 identifier, 0xA028 signature and zero-filled
padding, with 256- or 512-byte padding lengths. Other inspected local/central
header values and archive record positions agreed.

The validator required these local and central extra-field buffers to be exactly
identical. It therefore rejected this padding before DOCX XML/Mammoth processing.
This is the confirmed cause for the authorized document, not an Ollama, multipart,
Origin, filename-Unicode or document-text failure. The growth-hint structure is
documented in [PKWARE's ZIP specification, section 4.6.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

No document text, private archive-part names or document copy appears in this
report or the regression fixtures.

## Fix

One production file changed: `apps/api/src/extraction/docx-zip.ts`.

The extra-field comparison retains its original equality rule and adds a narrow
exception for the observed local-only growth-hint case:

- Central-directory extra buffer must be empty.
- Local extra buffer must contain exactly one complete 0xA220 block.
- Declared extra-field length must match the actual bytes.
- Verification signature must be 0xA028.
- Padding initial value must match actual padding length in this supported subset.
- Every padding byte must be zero.

Other extra-field mismatches, malformed lengths/signatures, nonzero payloads,
duplicated fields and unknown suffixes remain rejected. CRC, filename, compression,
resource limits, archive layout, package validation, worker isolation and local-only
request security remain unchanged. No new dependency or parser replacement.

## Evidence

### Reproduction and real-file verification

- Existing parser on the authorized file before fix: PARSING_FAILED / ZIP_INVALID.
- Synthetic regression fixtures with the same structural padding pattern:
  two tests failed before the production fix.
- Same authorized file after fix, through the real parser worker: **PASS**,
  nonempty DOCX text and source segments returned.
- Original Unicode basename used for metadata validation: **PASS**.
- Same file sent only to the existing loopback parse-only endpoint,
  `POST http://127.0.0.1:5173/api/v1/opportunities/parse-document`: **HTTP 200**.
- Endpoint result matched the direct worker result; comparison occurred in memory
  and no document text was printed or saved elsewhere.
- Original SHA-256 and modification time compared against the pre-investigation
  baseline: **unchanged**.

The existing fixed IMAGE_CONTENT_NOT_INTERPRETED and DOCX_CONTENT_WARNING warnings
remain. Successful text parsing does not imply image/OCR or full-layout rendering.

### Commands and actual results

| Check                                               | Actual result                                                               |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused parser command below                        | 135 passed across 4 suites                                                  |
| `pnpm --filter @ai-job-hunter/api test:integration` | 22 passed across 3 suites; fake AI provider, no inference                   |
| `pnpm typecheck`                                    | Both applications passed                                                    |
| `pnpm build`                                        | Both applications passed; existing approximately 566 kB Vite bundle warning |
| `pnpm lint`                                         | Passed                                                                      |
| Prettier check on exact changed files               | Passed                                                                      |
| `git diff --check`                                  | Passed                                                                      |

```bash
pnpm --filter @ai-job-hunter/api test --runTestsByPath \
  .test-dist/test/unit/docx-parser.spec.js \
  .test-dist/test/unit/docx-failure.spec.js \
  .test-dist/test/unit/document-parser.spec.js \
  .test-dist/test/unit/pdf-parser.spec.js
```

Coverage includes valid 256/512-byte local padding, malformed/unknown extras,
nonzero padding, incorrect size/signature/hint, duplicate blocks, unknown suffixes,
central mismatches and CRC/filename consistency. Existing PDF/DOCX adversarial and
resource-limit tests pass. The import integration test confirms a synthetic padded
DOCX proceeds through multipart parsing into the existing structured extraction
path using a fake provider.

Only the specifically authorized private document was processed. It was not
uploaded to an external service, copied into repository/test artifacts, modified
or deleted. No Ollama/other inference was invoked. No development database write
was performed. Integration tests used isolated synthetic test records. Existing
application data, unrelated changes and Git index were preserved. No commit,
push, reset, clean, stash, merge or rebase.

### Exact files changed in this task

- `apps/api/src/extraction/docx-zip.ts`
- `apps/api/test/support/docx-fixtures.ts`
- `apps/api/test/unit/docx-parser.spec.ts`
- `apps/api/test/integration/job-import.spec.ts`
- `README.md`
- `docs/architecture.md`
- `docs/docx-growth-padding-fix.md`

The earlier diagnostic investigation report remains a historical record of the
pre-authorization state; this report supersedes its unresolved assessment.

## Remaining blockers

**None for parsing the authorized file.** The exact failure was reproduced and
resolved, and the same file passed the running parse-only endpoint.

Real-browser interaction is NOT_VERIFIED. Real AI extraction on the private file
was neither authorized nor attempted. No claim is made about inference quality or
support for every possible DOCX encoding/ZIP feature. Those are outside this
bounded parsing fix. Work stops here.
