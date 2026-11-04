# P5.5b — ITviec metadata implementation

Implemented on `fix/p5-itviec-metadata`; no commit, push or PR.
The untracked P5.5a audit and sanitized fixture are preserved.

## Behavior and decisions

The existing safe Fetch parser now extracts the verified `job-show-info` header's
Skills, Job Expertise and Job Domain rows. Existing xmldom handles a balanced
header fragment rather than the entire page: the P5.5a full response contains
unrelated XML/SVG that invalidates whole-document parsing. Scripts, templates,
comments and processing instructions are excluded. Direct row/chip boundaries
preserve labels and omit nested tooltips. Ambiguous headers remain unknown.
No dependency or transport-policy change was needed.

The verified fixture produces:

- Skills: LLM; Kubernetes; RAG; English.
- Job Expertise: AI Architect.
- Job Domain: Banking; IT Services and IT Consulting; Software Products and Web
  Services; Financial Services.

Response-only sourceMetadata arrays preserve source order and exact duplicates
are removed. Skills remain supplemental taxonomy, expertise remains classification,
and generic Information Technology remains source industry without becoming a
Domain fallback. Explicit domain labels are joined with `; ` for the existing
Domain string. All groups survive in labeled source text; domain entries share
one verbatim bounded block for atomic deterministic extraction and conflict review.
The existing 2,000-character domain and 12,000-character source limits remain
limits rather than silent truncation points.

Add Job maps Domain using existing manual-edit/source replacement rules, and
protects active fetched Domain from omitted/shortened AI suggestions. Conflicting
suggestions still require acknowledgement. Preview-only metadata does not enter
the Save DTO. No Edit JD, Discovery Queue, entity or Save API change was made.

## Changed files

- `apps/api/src/opportunities/itviec-metadata.ts` — scoped structural parsing and
  verbatim domain-block recovery.
- `apps/api/src/opportunities/job-url-import.ts` — response metadata, source
  evidence and explicit preview domain.
- `apps/api/src/opportunities/job-import.domain.ts` — atomic evidence and
  semicolon display for source taxonomy, retaining conflict handling.
- `apps/api/src/opportunities/job-import.sections.ts` — exclude metadata blocks
  from qualification sections.
- `apps/web/src/features/inbox/job-url-import.ts` — preview types/domain mapping.
- `apps/web/src/features/inbox/JobEditor.tsx` — preserve active fetched domain
  through later extraction without clearing conflicts.
- `apps/api/test/unit/itviec-metadata.spec.ts` — real fixture plus synthetic
  punctuation, deduplication, partial/missing/ambiguous groups, tooltip/hidden
  elements, non-ITviec behavior, evidence validation and conflict acknowledgement.
- `apps/web/test/url-import.test.tsx` — atomic domains, manual values/intentional
  blanks, same-source updates, different-source clearing and refetch confirmation.
- `apps/web/test/url-import-extraction.test.tsx` — fetched domain survives omitted
  extraction and remains in Save payload; existing manual/conflict coverage stays.
- `docs/architecture.md` — source metadata/evidence boundaries and parser choice.
- This report.

Preserved P5.5a files: `apps/api/test/fixtures/itviec-metadata-real.html` and
`docs/audits/p5-itviec-metadata-sources.md`.

## Verification

- Backend focused Jest: four existing parser/extraction/domain suites, **59 tests
  PASS**; new metadata suite, **5 tests PASS**. The five-suite run initially
  passed 63 tests; the additional XML/SVG isolation regression subsequently passed
  in the five-test metadata suite. Only affected scenarios were rerun after fixes.
- Frontend Vitest: `test/url-import.test.tsx` and
  `test/url-import-extraction.test.tsx`, **30 tests PASS**. The refetch test was
  then extended with manual Domain assertions; the affected 18-test suite passed.
- Offline parsing of the full P5.5a captured response also recovered exactly the
  same three groups. No new live-site request was needed.
- `pnpm typecheck`: PASS for backend and frontend.
- `pnpm format:check`, `pnpm lint`, `git diff --check`: PASS.

### Scoped Chromium smoke

Playwright MCP used the local Vite frontend at port 5175 because port 5173 was
already occupied. All `/api/**` requests were intercepted. Fetch returned the
actual fixture-derived production-parser preview; Save returned an intentional
400 response and never reached an API/database. No Extract call was made.

PASS evidence:

- Fetch → Continue to Review & Save displayed Domain exactly as:
  `Banking; IT Services and IT Consulting; Software Products and Web Services; Financial Services`.
- Required skills and Preferred skills stayed empty.
- Keyboard Tab moved focus from Domain to the next input.
- At 390 × 844, the page had no horizontal overflow.
- Confirm and save job sent the same complete domain string, empty skill fields,
  and the domain evidence block in postText; sourceMetadata was absent.
- Captured requests were only POST import-url and the intercepted POST
  opportunities. No private documents, Ollama calls or real job writes.
- No JavaScript page errors. The console's resource errors were the intentional
  intercepted 400 Save responses; input remained available for editing.

Initial smoke attempts needed correction for the existing Import sources →
Review & Save step and unsaved-change dialog. Those were test-navigation issues;
no product behavior was changed for them. Initial parser tests caught fragment
and full-page XML incompatibilities, which were fixed and covered by regression.

## Remaining limitations

Only the verified header layout is supported. Changed/ambiguous/malformed layouts
remain unknown with existing manual import available. Comma-containing domains
are covered synthetically; the real fixture contains conjunctions and multiple
domains. Job Expertise and taxonomy skill arrays are response-only and retained
in source text, without adding editable model fields. Browser Save was intercepted;
no database integration or real persistence claim is made.
