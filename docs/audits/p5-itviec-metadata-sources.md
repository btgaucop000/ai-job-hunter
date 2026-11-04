# P5.5a — Verified ITviec metadata sources

Date: 2026-11-04. Branch: `fix/p5-itviec-metadata`.
Starting revision: `0f1ba2c`, identical to freshly fetched `origin/main`;
working tree was clean. Audit and fixture preparation only.

## Verified public response

[AI Solution Architect — ITviec Recruitment Consulting](https://itviec.com/it-jobs/ai-solution-architect-itviec-recruitment-consulting-0525)

Existing tests contain synthetic URLs only. Public search located this candidate;
the application's own transport then verified it independently. One live request
through `previewJobUrl` and `PinnedJobPageTransport` returned **200**,
`text/html; charset=utf-8`, **349,469 bytes**, within the default five-second
request deadline and 2 MiB limit. No cookies, credentials, redirect following,
secondary requests, browser JavaScript, AI or database were used. A diagnostic
stream wrapper observed bytes consumed by the existing bounded preview path;
transport security and parsing were unchanged.

| Group         | Actual labels, in source order                                                                 | Server source                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills        | LLM; Kubernetes; RAG; English                                                                  | `job-show-info` header, row labeled `Skills:`, individual `a.itag` children; also JobPosting `skills` string `LLM, Kubernetes, RAG, English` |
| Job Expertise | AI Architect                                                                                   | Same header, row labeled `Job Expertise:`, `a.itag` with matching text/title                                                                 |
| Job Domain    | Banking; IT Services and IT Consulting; Software Products and Web Services; Financial Services | Same header, row labeled `Job Domain:`, individual `div.itag` children                                                                       |

All three groups are present in the initial HTML and available without executing
JavaScript. Financial Services contains a nested tooltip whose `title` is
`Consumer Finance, FinTech, Payment and other related sectors`. That tooltip is
explanatory text, **not another domain or part of the label**. Domain chips are
nested divs: a flat regex ending at the first closing div would be unsafe.

The single JobPosting JSON-LD has generic `industry: Information Technology` and
no expertise/domain property. Other JSON-LD blocks are BreadcrumbList and WebSite.
Script inspection found no separate application/json hydration payload containing
the missing groups. An HTML data attribute on the `jd-main` ancestor also repeats
the skills in `data-jobs--save-data-layer-value.job_required_skill`; this analytics
name does not establish that taxonomy tags are qualification requirements.
No secondary public request is needed for this sample. This does not establish
availability across every ITviec layout or future response.

## Current parser and Add Job comparison

The real response was passed through the current production preview parser:

- Source text is 4,536 characters and contains
  `Supplemental skill tags (not requirements): LLM, Kubernetes, RAG, English`.
- `AI Architect` and all four literal domain labels are absent from sourceText.
- Preview has no skills, expertise, domains or domain property.
- Generic industry is not appended as a separate Source industry block for this
  response: `Information Technology` already occurs in description, so the
  existing substring deduplication skips it. The reduced fixture does append it
  because its synthetic description omits that phrase. Neither case maps domain.
- `applyUrlJobPreview` copies sourceText to postText and maps only its fixed
  source-field list, which excludes domain/skills/expertise. An initially blank
  Add Job Domain and Required skills therefore stay blank after Fetch; manual
  values remain protected. This is verified from parser output and mapping code,
  **not a browser acceptance run**. No application server or real job was saved.

## Sanitized fixture

`apps/api/test/fixtures/itviec-metadata-real.html` retains the captured three
metadata rows, link boundaries, classes and nested tooltip. A minimal wrapper
retains the real `job-show-info` / `imb-3` ancestry. JSON-LD retains only context,
type, title, skills and industry; description is explicitly synthetic.
The icon asset URL is replaced with a local placeholder. Unrelated page content,
analytics payloads, scripts, CSRF/session data, company assets, location and
salary are omitted. No cookies, authentication tokens or personal information
are included. This is a reduced structural fixture, not the complete response.

This sample verifies multiple domains and labels containing “and”. It does not
contain a comma in a domain label. Future comma-label regression coverage should
be explicitly synthetic unless another real sample is approved and captured.

## Minimal proposed P5.5b

1. Parse only the confirmed job header's explicitly labeled rows. Use structural
   traversal with existing tooling, scoped to `job-show-info`, and each row's
   direct value container/chip boundaries. Exclude tooltip descendants,
   comments/executable markup and unrelated recommendations. Do not rely on
   utility-class ordering or split labels on commas, “and”, slash or ampersands.
2. Return optional response-only sourceMetadata arrays for skills, jobExpertise
   and jobDomains. Prefer individual header skill labels over splitting the
   ambiguous JSON-LD skills string; preserve existing JSON-LD evidence fallback.
   Decode entities, normalize whitespace and exact duplicates only. Preserve
   order, all four domains and complete label wording. Missing groups stay absent;
   generic industry is never substituted for Job Domain.
3. Append bounded, separately labeled metadata blocks to postText/sourceText,
   within existing limits. Skills are supplemental taxonomy, expertise is source
   evidence only. Neither becomes Required skills. Ensure metadata blocks end
   requirement sections. Recognize the domain block as atomic co-listed evidence
   in deterministic recovery, bypassing generic comma/conjunction splitting.
4. Add optional preview domain joined with `; ` and include it in the frontend's
   source-owned mapping/protection. Preserve edited/cleared values, replacement
   confirmation, stale-response guards and obsolete-source clearing. Preserve
   fetched domains when AI omits them, while retaining genuine conflicts and
   acknowledgements. Keep verbatim block quotes for evidence validation. No new
   persisted expertise field, Save DTO keys or migration is needed.
5. Regress this fixture, absent/malformed/unrelated groups, nested tooltips,
   atomic comma labels (synthetic), manual edits, replacement, missing AI values,
   real conflicts and taxonomy-versus-requirement separation. Do not call Ollama.

This refines the earlier P5.4e proposal with a verified source boundary; the prior
audit's live-response uncertainty is resolved for this URL only. Parser and UI
implementation remain a separate checkpoint.

## Verification and limitations

- `pnpm --filter @ai-job-hunter/api test:compile`: PASS.
- `pnpm --filter @ai-job-hunter/api test --runTestsByPath .test-dist/test/unit/job-url-import.spec.js .test-dist/test/unit/itviec-fields.spec.js`:
  PASS, two suites / 42 tests; transports/providers are mocked.
- In-memory Node assertions through compiled `parseJobPosting`: PASS. Reduced
  fixture parses, retains supplemental skills/generic industry, loses expertise
  and all four domains, and has no preview domain property. No permanent test
  asserting this known deficiency was introduced.
- Initial diagnostic invocation from the repository root failed to resolve the
  API-local reflect-metadata dependency before any request. Running from
  `apps/api` succeeded; no dependency change was required.
- Scoped `pnpm exec prettier --check` on both added files: PASS.
- `git diff --check`: PASS; final review confirms only the audit and fixture
  were added.
- No production code changes, migrations, dependencies, browser run, Ollama calls,
  private documents or real job writes. No commit or push. Stop for review.
