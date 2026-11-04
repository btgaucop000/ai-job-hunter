# P5.4e — ITviec Skills, Expertise and Domain extraction audit

Date: 2026-11-04. Branch: `fix/p5-import-reliability`.
Scope: audit only. Existing P5.4 changes are preserved.

## Finding

The importer does not read the three visible metadata groups as distinct source
metadata. It reads selected JobPosting JSON-LD properties and selected public
salary markup. JSON-LD `industry` becomes **Source industry**, while JSON-LD
`skills` become **Supplemental skill tags (not requirements)**. Neither is a direct
Fetch-to-form Domain/Required skills mapping. Job Expertise has no dedicated
model field or import mapping.

An empty Domain after Fetch is therefore expected from the current contract. An
empty Domain after optional extraction can also result from evidence being lost,
unsupported label/layout handling, or the intentional rejection of generic
Information Technology. Substituting Information Technology into Domain would
hide these distinctions rather than fix the missing source taxonomy.

## Evidence boundary: are the values in the fetched response?

**Not established for the user's current ITviec page.** No concrete job URL or
captured/sanitized response was supplied, and the repository contains synthetic
JSON-LD builders rather than a captured ITviec page containing all three metadata
groups. Repository searches found no existing Job Domain/Job Expertise selectors
or fixtures using those labels. The real page might include the groups in server
HTML, another embedded payload, or later browser requests. This audit made no
live-site request and cannot choose a verified selector or assert hydration behavior.

What is established:

- Existing safe fixtures demonstrate JSON-LD requirements, skills/qualifications
  handling, business-domain prose and generic industry handling. For example,
  `apps/api/test/unit/itviec-fields.spec.ts:41` builds a synthetic JobPosting;
  `apps/api/test/unit/job-import.domain.spec.ts:83` explicitly retains generic
  industry as source evidence while recovering project domains from other prose.
- A constructed synthetic HTTP response containing Skills, Job Expertise and Job
  Domain groups loses the latter two groups when passed through the real
  `previewJobUrl`/`parseJobPosting` path. JSON-LD `occupationalCategory` is ignored
  too. This proves parser behavior **when such data is present**, not that a
  particular current ITviec server response contains it.
- If labels exist only in browser-fetched content absent from the bounded HTML
  response, a frontend-only mapping change cannot recover them. A future fix
  should leave them unknown and offer the existing manual fallback; do not add
  browser automation, extra crawling or invented values as part of a small fix.

## Current data flow and loss points

| Stage                       | Current behavior                                                                                                                                                                                                          | References                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Add Job action              | Explicit Fetch posts `{ url }` to `/api/v1/opportunities/import-url`. Existing-job use is guarded; replacement confirmation, latest draft and stale-request protections remain.                                           | `apps/web/src/features/inbox/JobEditor.tsx:332`, `:356`, `:360`                             |
| API entry                   | Local-write check, then `JobUrlImportService.preview`; no AI extraction or job creation happens here.                                                                                                                     | `apps/api/src/opportunities/opportunities.controller.ts:80`; `job-url-import.ts:399`        |
| HTTP transport              | Only individual HTTPS ITviec URLs; public-address validation and pinned TLS connection. No browser JS, credentials, redirect following or secondary page-data requests.                                                   | `apps/api/src/opportunities/job-url.transport.ts:45`, `:75`, `:95`                          |
| Bounded response            | Requires HTML, rejects redirects/errors and oversized responses, reads at most 2 MiB, decodes UTF-8, calls parser; five-second default timeout.                                                                           | `apps/api/src/opportunities/job-url-import.ts:322`, `:343`, `:361`, `:378`                  |
| JSON parsing                | Looks only at `application/ld+json` scripts, arrays and `@graph`, requiring exactly one JobPosting. Other embedded JSON is not read.                                                                                      | `job-url-import.ts:103`, `:114`, `:125`                                                     |
| Text normalization          | Strips tags/executable markup, decodes a limited entity set and normalizes whitespace. This acts on selected properties, not the whole visible page.                                                                      | `job-url-import.ts:45`                                                                      |
| Description/source evidence | Starts with JobPosting description, supplements qualifications, skills, responsibilities and industry. `skills` use a supplemental-tag label; `industry` uses `Source industry:\n<value>`.                                | `job-url-import.ts:129`                                                                     |
| Visible HTML                | Only explicitly identified salary elements are scanned. No visible Skills, Job Expertise or Job Domain group is selected.                                                                                                 | `job-url-import.ts:242`                                                                     |
| API preview                 | Returns title/company/location/description/salary/expiry/sourceText. It has no skills, expertise, domains or domain property. Source text is capped at 12,000 characters; raw HTML is not returned or saved by this path. | `job-url-import.ts:80`, `:286`, `:300`                                                      |
| Fetch form mapping          | Copies sourceText into postText and maps a fixed field list. That list omits skills and domain; the frontend preview type omits them too. No expertise field exists.                                                      | `apps/web/src/features/inbox/job-url-import.ts:31`, `:55`, `:80`                            |
| Optional extraction         | Explicit `/extract` sends postText and optional document. AI proposals are merged with deterministic candidates and checked against source quotes and semantic rules.                                                     | `JobEditor.tsx:232`; `job-import.service.ts:71`, `:81`, `:109`; `job-import.contract.ts:95` |
| Form suggestions            | Manually edited fields are protected. Unedited domain can be populated by extraction, or cleared by a MISSING result. Source-protected fields currently omit domain/skills.                                               | `JobEditor.tsx:219`, `:264`, `:277`, `:294`                                                 |
| Save                        | Sends form state; validates strings and evidence; persists the supplied domain/skills/postText. It does not refetch ITviec or reconstruct missing taxonomy.                                                               | `JobEditor.tsx:419`; `opportunities.service.ts:172`, `:188`; `opportunity.validation.ts:96` |

Unqualified API source filenames in this table are under
`apps/api/src/opportunities/`; frontend source filenames are under
`apps/web/src/features/inbox/`.

## Per-field diagnosis and current Job Model

| Group                                   | Extracted/ignored today                                                                                                                                                                                                                 | Model support                                                                                                                                                    | Proposed mapping                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skills, e.g. Java/Kotlin/Spring         | JSON-LD skills survive as supplemental tags in source text. Visible-only tags are ignored. Tags alone are intentionally excluded from Required skills; explicit qualifications can produce required/preferred skills during extraction. | `skills` and `preferredSkills` are text strings, displayed as requirement lists; each accepts 10,000 characters. There is no separate saved taxonomy-tags field. | Preserve source tags separately in preview metadata and labeled postText. Populate required/preferred skills only from actual qualification evidence.                                                                                  |
| Job Expertise, e.g. Backend Developer   | Visible group and JSON-LD occupationalCategory are ignored by this parser. The job title may independently contain similar words, but that is not an expertise mapping.                                                                 | No dedicated field in the entity, browser input or extraction contract. `experience` is not job expertise. Arbitrary new Save properties are rejected.           | Preserve the literal label in response-only source metadata and postText. Do not overwrite job title, experience, skills or domain. A dedicated editable/persisted expertise field is a separate model decision.                       |
| Job Domain, potentially multiple labels | Visible group is ignored. Generic industry is retained but is not equivalent to the site's specific Job Domain taxonomy. No direct Fetch Domain mapping exists.                                                                         | `domain` is one text string, max 2,000 characters. Multiple domains are supported as a combined display value, not a typed array or relational collection.       | Preserve individual source labels as atomic array entries, then display all verified labels in the existing Domain string, separated by `; `. Keep commas and “and” inside each label. Preserve the literal labeled group in postText. |
| Generic industry                        | JobPosting industry is appended as source evidence. Information Technology is deliberately rejected as an extracted project/business domain.                                                                                            | No standalone saved source-industry column.                                                                                                                      | Retain as separately labeled source metadata. Never substitute it for missing Job Domain values.                                                                                                                                       |

Model references: `apps/api/src/opportunities/opportunity.entity.ts:49`, `:52`,
`:54`, `:57`; `opportunity.validation.ts:70`, `:112`, `:115`;
`apps/web/src/features/inbox/opportunities-api.ts:18`, `:44`, `:72`;
`apps/api/src/opportunities/job-import.contract.ts:28`.

The multi-domain merge groups co-listed evidence and preserves incompatible
separate declarations as conflicts (`job-import.domain.ts:120`). The database
column itself does not enforce a domain vocabulary or single-item cardinality.

## Source metadata versus AI proposals and manual fields

- Fetch is deterministic source parsing. **Source industry** is a generated label
  for `JobPosting.industry`, not an AI classification or a Domain form value.
- Supplemental tags are source taxonomy, not evidence that every tag is a required
  qualification. Both prompt and validation enforce this distinction:
  `job-import.service.ts:97`, `:103`; `job-import.contract.ts:130`, `:157`;
  `job-import.sections.ts:505`.
- AI is only invoked by Extract with AI. It cannot recover evidence already
  discarded from the HTML. Its domain proposals must pass
  `supportedBusinessDomain` (`job-import.contract.ts:142`). The prompt explicitly
  rejects Information Technology as a project domain (`job-import.service.ts:99`).
- Domain recovery rejects generic IT categories and architecture/technology terms
  (`job-import.domain.ts:5`). That safety rule should remain for generic prose.
- Manual edits set edited-field tracking and survive subsequent suggestions
  (`JobEditor.tsx:210`, `:265`). Saved/manual values are not reclassified as new
  suggestions when evidence is validated (`job-import.contract.ts:350`).
- P5.4 source replacement intentionally clears obsolete automatic fields while
  preserving edited fields (`job-url-import.ts:77`). New metadata must follow
  those same ownership/replacement rules.

## Safe reproduction results

Existing compiled production functions were exercised in memory with a synthetic
transport returning `Content-Type: text/html`. No external connection, AI provider,
API server, database or job write was involved.

Constructed input:

```html
<script type="application/ld+json">
  {
    "@type": "JobPosting",
    "title": "Synthetic engineer",
    "description": "<p>Build services.</p>",
    "skills": ["Java", "Kotlin", "Spring"],
    "industry": "Information Technology",
    "occupationalCategory": "Backend Developer"
  }
</script>
<section>
  <h2>Skills</h2>
  <a>Java</a><a>Kotlin</a><a>Spring</a>
</section>
<section>
  <h2>Job Expertise</h2>
  <a>Backend Developer</a>
</section>
<section>
  <h2>Job Domain</h2>
  <a>Media, Advertising and Entertainment</a>
  <a>IT Services and IT Consulting</a>
  <a>Software Development Outsourcing</a>
</section>
```

This is an illustrative synthetic response, **not a captured page or verified
production selector sample**.

| Experiment                                                   | Actual result                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Above HTML through `previewJobUrl`                           | Tags retained as supplemental skills; `Source industry:\nInformation Technology` retained; Backend Developer and all three Job Domain labels absent from sourceText. Preview has no skills/domain/expertise keys. |
| Deterministic source candidates and merge on that sourceText | skills and domain both empty, status MISSING.                                                                                                                                                                     |
| Put the three exact labels in a JSON-LD industry array       | All labels survive in sourceText, but `businessDomainCandidates` returns no domain candidates.                                                                                                                    |
| `Source industry: Information Technology`                    | No domain candidates: intentional generic exclusion.                                                                                                                                                              |
| `Job Domain: <three labels>`                                 | No candidates: this label is not recognized by the anchored label matcher.                                                                                                                                        |
| `Domain: Media, Advertising and Entertainment`               | Candidates are `Media`, `Advertising`, `Entertainment`; the atomic taxonomy label is split.                                                                                                                       |
| `Domain: IT Services and IT Consulting`                      | Candidates are `IT Services`, `IT Consulting`; the atomic taxonomy label is split.                                                                                                                                |
| `Domain: Software Development Outsourcing`                   | One intact candidate.                                                                                                                                                                                             |

The separate multiline-industry gap comes from emitting the label and content on
separate lines (`job-url-import.ts:143`) while the domain matcher requires the
label and value on the same line (`job-import.domain.ts:33`, `:47`). Arbitrary
business prose can still match other patterns, explaining why existing prose
fixtures pass. The atomic-label corruption comes from splitting on commas,
“and”, ampersands and slash (`job-import.domain.ts:98`). Merely relabeling all
industry values as Domain is therefore insufficient and would weaken semantics.

## Smallest backward-compatible fix proposal

**Recommended: a coordinated backend/frontend change, with no migration.**
A backend-only change can preserve more evidence for later extraction, but it
will not populate Domain immediately after Fetch because the preview/form
mapping does not support that field. A frontend-only change cannot recover groups
that the API discarded.

1. First obtain a sanitized response sample for a representative affected page
   using the existing authorized transport. Verify where its labeled groups
   actually reside. Add narrow group extraction for that confirmed structure;
   do not guess selectors, scan unrelated navigation/company recommendations,
   execute page scripts, or fetch additional endpoints.
2. Preserve exact source labels, array boundaries and source attribution. Add
   optional response-only `sourceMetadata` containing skills, jobExpertise and
   jobDomains arrays, plus optional preview `domain` derived only from explicit
   Job Domain entries. Keep existing preview properties compatible. Only fill
   values actually present; no fallback from title, company, skills or generic
   industry. Normalize entities/whitespace and exact duplicates, not wording.
3. Append a clearly bounded, literal ITviec Job Domain block to sourceText, with
   one source label per line. Preserve expertise and supplemental tags under
   separate non-requirement labels. Persist this evidence through existing
   postText; do not spread response-only metadata into the Save DTO or repurpose
   Discovery metadata. Keep source/paste/field limits; warn or reject safely
   instead of silently truncating labels.
4. Recognize that explicit domain block as an atomic co-listed set in the existing
   deterministic domain recovery path. Use a shared verbatim block quote so the
   list is not mistaken for separate conflicting declarations. Do not run its
   entries through generic comma/“and” splitting. Ensure new metadata blocks
   terminate qualification sections so their contents cannot become required
   skills. Retain generic IT/prose exclusions and genuine conflict validation.
5. Add optional domain to the frontend preview type and mapped source fields.
   Fill only according to existing manual-edit protections, idempotent Fetch and
   replacement confirmation. Preserve an active fetched domain against a later
   omitted/MISSING AI proposal; do not suppress genuine conflicting evidence.
   Ensure removed/replaced source domains cannot survive as stale automatic data.

For the supplied examples, the existing Domain field can hold:

```text
Media, Advertising and Entertainment; IT Services and IT Consulting; Software Development Outsourcing
```

This preserves the site's taxonomy as source-declared categories. It does not
claim the applicant must have domain expertise, or fabricate more specific
project industries. Skills/Job Expertise remain separate source metadata. A
first-class persisted Job Expertise field or typed domains array would expand
scope and is not required for this preservation fix.

## Minimal implementation and regression-test scope

Expected application files: backend `job-url-import.ts`, `job-import.domain.ts`
and any qualification-section handling needed for the new bounded block;
frontend `job-url-import.ts` and `JobEditor.tsx`. No database, transport policy,
new dependency, Discovery Queue or manual-only Edit JD changes are needed.

Meaningful synthetic regressions:

- Sanitized representative HTML contains all three groups, with generic JSON-LD
  industry also present; retain the exact groups and distinguish their origins.
- Absent groups, malformed data, unrelated sidebar/footer groups and
  client-only/unavailable metadata remain unknown; no guessing from role/title.
- All three example domain labels stay atomic and in source order, including
  commas/conjunctions, multiple items, entities and duplicates.
- Generic Information Technology stays source evidence; it does not replace
  explicit Job Domain or become fabricated domain expertise.
- Tag-only Java/Kotlin/Spring are not forced into Required skills; explicit
  requirement and preference text retains current behavior.
- Fetch → review without AI → Save preserves source domains and source text;
  Fetch → Extract with omitted/invalid proposals also retains correct values.
- Genuine conflicts remain reviewable/unsaveable until acknowledged. Historical
  evidence and manually edited/cleared Domain remain valid and unchanged.
- Same-source repeat, confirmed replacement and late responses retain P5.4
  semantics, including clearing obsolete automatic domains on replacement.
- Preview-only metadata does not leak as unknown properties into Save; multiple
  domains round-trip through the existing domain string without a migration.

## Executed verification and merge recommendation

- `pnpm --filter @ai-job-hunter/api test:compile`: PASS.
- Four focused backend suites: **59 tests passed** (`job-url-import`,
  `itviec-fields`, `job-import.domain`, `url-import-extraction`). AI responses and
  HTTP transports in those suites are synthetic.
- In-memory synthetic HTTP/parser/domain experiments above: PASS; they confirm
  the documented current gaps rather than claiming the requested fix exists.
- Audit Markdown formatting and `git diff --check`: PASS.
- No live ITviec/browser/Ollama calls, real job writes, migrations, dependency
  changes or production-code edits. No test server started.

**Do not block P5.4 merge on this finding under its approved reliability and early
exact-URL-duplicate scope.** This is an existing metadata-coverage/semantics gap,
not a regression introduced by P5.4a/P5.4b. Track a separate implementation
checkpoint, and do not describe current Fetch as preserving all ITviec taxonomy.
If full Job Domain fidelity is made a merge requirement, that requirement is
currently unmet. Current-site response availability remains unverified until a
sanitized representative response is inspected.

Changed in this checkpoint: only this audit report. Stop for review.
