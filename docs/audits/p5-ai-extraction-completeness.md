# P5.5c — AI extraction completeness audit

Date: 2026-11-04. Branch: `fix/p5-itviec-metadata`.
Scope: audit only; all existing P5.5a/P5.5b changes preserved. No production code,
ITviec parser, Domain mapping, schema, Job Model or matching changes.

## Finding and confidence boundary

**A confirmed backend recovery/normalization inconsistency reproduces the reported
shape without a model call.** Must Have clauses are processed differently from
Nice to Have clauses. Mandatory prose relies on a narrow prefix parser and a
hardcoded technology dictionary; preferred prose is retained as whole clauses.
Generic fragments are also appended even when a complete model clause is supplied.

This is not proof of what the user's model originally emitted. No raw response,
request-specific token metrics, or exact saved draft for that extraction was
supplied or found among repository artifacts. Existing smart-import artifacts
are synthetic; earlier reports explicitly disclaim having original Ollama output.
The P5.5a temporary public HTML capture remains available and provides the fixed
source. **Live model omissions, variability and length termination remain
unverified.** No live inference is needed to establish the backend defects, so
none was run. The probe's responses are expressly labeled mocks, never captures.

Verified source:
[AI Solution Architect — ITviec Recruitment Consulting](https://itviec.com/it-jobs/ai-solution-architect-itviec-recruitment-consulting-0525).
The audit reuses the 2026-11-04 public response already retrieved through the safe
transport; it makes no new external request.

## Complete pipeline

References below are relative to the repository root.

| Stage                   | Actual behavior and evidence                                                                                                                                                                                                                                                                                                                                                                        | Loss assessment                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetch                   | `apps/api/src/opportunities/job-url-import.ts:45` (`plain`), `:96` (`parseJobPosting`): JSON-LD description preserves all nine Must Have and four Nice to Have clauses. The P5.5b parser produces 4,704 characters of sourceText for the captured response. The fixed golden file retains that entire normalized text, including responsibility/benefit boundaries and separately labeled taxonomy. | No missing requested competencies at this stage. Existing 12,000-character bound rejects oversize input; it does not silently slice it.                                                                                                                                                                                                                  |
| Add Job input           | `apps/web/src/features/inbox/job-url-import.ts:61` (`applyUrlJobPreview`) puts fetched text in postText. `JobEditor.tsx:243` sends `{postText}` and any explicitly selected file to `/extract`.                                                                                                                                                                                                     | This URL-only case has `post=sourceText`, `jd=''`; the word JD does not mean candidates should use `source:'jd'`. That source key is for uploaded document text.                                                                                                                                                                                         |
| Prompt                  | `apps/api/src/opportunities/job-import.service.ts:81` (`extract`) constructs the prompt and appends `JSON.stringify({post,jd})` unchanged. Capturing the service call with a fake provider gives 8,939 prompt characters and a 60-candidate schema.                                                                                                                                                 | All source text reaches the constructed request. The prompt already demands every qualification, education/language, section classification, evidence and OR preservation. It also asks for one literal skill per candidate while saying not to summarize into keywords: granularity is underspecified. No coverage check enforces completeness.         |
| Ollama execution        | `apps/api/src/ai/ollama.provider.ts:145` uses the **partial request branch** because JobImportService supplies a deadline/signal. It makes one generation, reserving **2,048 output tokens**, temperature 0, think false, truncate false, shift false. Profile: Ollama 0.40.10 / qwen3:4b pinned digest, 8,192 context, 6,080 maximum prompt tokens (`ollama.context.ts:4`).                        | This path does not use the other branch's dynamically measured maximum of 4,096 output tokens. Repeated long evidence quotes can pressure the 2,048-token reservation. No token count for the user's run is available; character counts are not token measurements.                                                                                      |
| Raw response / decoding | `apps/api/src/ai/ollama.context.ts:61` (`validateGeneration`) rejects final done_reason length as OUTPUT_LIMIT_EXCEEDED, even if JSON is syntactically valid. `apps/api/src/ai/ai.service.ts:32` parses JSON and validates the complete strict schema with Ajv. Schema validation does not delete invalid items or trim a valid list to 60.                                                         | A stop-terminated valid short list can be incomplete without an error. Length, malformed JSON, oversize envelopes, schema and context failures reject the response rather than silently returning its prefix. Specific run cannot be attributed without its envelope.                                                                                    |
| Recovery                | `job-import.service.ts:112` adds `sourceCandidates(post,jd)` to model candidates. `job-import.evidence.ts:458` invokes `sectionCandidates`; its experience regex at `:565` misses the explicit `6+ years` form.                                                                                                                                                                                     | Missing model candidates are recovered incompletely. Successful empty model output reproduces eight Required entries, four Preferred clauses and no Experience value.                                                                                                                                                                                    |
| Evidence/classification | `job-import.contract.ts:98` (`mergeCandidates`) requires quote in source and value in quote, limits lengths and excludes taxonomy/benefits. It reclassifies skill candidates from requirement context and preserves known alternative clauses.                                                                                                                                                      | Valid literal vector search/tool calling/model selection/cloud-based architectures/APIs/AI coding tools/English communication/coach engineers survive when supplied. Kubernetes from taxonomy, unsupported cloud architecture wording, and a quote attributed to empty jd are correctly rejected. Validation establishes support, not complete coverage. |
| Normalization/merge     | `job-import.sections.ts:316` (`normalizeRequirementCandidates`) reconciles structured rows to deterministic recovery. `job-import.evidence.ts:295` (`mergedValues`) deduplicates exact normalized strings, then joins skill values with newlines.                                                                                                                                                   | Preferred MCP becomes its full P2 OR clause. Unstructured mandatory sentences and their independently recovered fragments coexist; they are not semantic duplicates to this merger.                                                                                                                                                                      |
| Review & Save           | `apps/web/src/features/inbox/JobEditor.tsx:258` copies returned field values, preserving edited fields; skills/preferredSkills have no fetched-field override. `:419` serializes the form with evidence into Save. `job-import.contract.ts:315` (`validateImportReview`) revalidates evidence/conflicts at Save.                                                                                    | No splitting or shortening of skill sentences occurs in this frontend mapping. Manual edits and error paths can deliberately retain previous values, so a UI screenshot alone cannot reveal the original backend list. Focused UI tests confirm payload preservation.                                                                                    |

The separate `extraction/extraction.service.ts` CV/JD pipeline and its
jdRequirementLines helper are not the Add Job JobImportService path. Tuning that
other prompt would not correct this extraction behavior.

## Exact backend causes

1. `job-import.sections.ts:9`, `requirementLines`: Your Skills and Experience sets
   structured=true, but the immediately following Must Have resets it to false
   unless the heading is numbered or matches Your skills/Yêu cầu. Nice to Have
   always sets true. On this fixed input every mandatory row is unstructured and
   every preferred row structured. This is independent of model variability.
2. `sectionCandidates` (`:397`): unstructured clauses use `qualificationParts`
   (`:201`) or the finite technology list (`:455`). Working knowledge of,
   Experience designing, Experience using, Strong English communication,
   Client-facing experience and education do not match its limited prefixes.
   The list recovers CI/CD but not vector search, APIs or the other competencies.
3. `qualificationParts`: Understanding of is a recognized prefix; it is removed
   and the comma/and list is split. This creates AI evaluation, observability,
   security, privacy, performance and cost trade-offs without their displayed
   Understanding of qualifier. Full source quotes remain attached, but the field
   presentation loses level/context. The source does not require expert security
   or privacy proficiency.
4. `normalizeRequirementCandidates` only reconciles structured rows. Complete
   mandatory model sentences therefore remain alongside CI/CD and the six AI
   fragments. Exact-string deduplication cannot remove those overlaps. Conversely,
   a preferred atomic MCP candidate is replaced with the whole supported OR group.
5. `sourceCandidates`' year regex permits `6 years`, not `6+ years`. The lower
   level experienceEvidence/candidateExperience functions do understand the plus;
   an explicit source-backed model value `6+ years` normalizes to Minimum 6 years.
   Changing the model or frontend cannot fix that recovery regex gap.

## Golden reference and expected versus actual

`fixtures/itviec-ai-solution-architect.golden.json` supplies the fixed full source,
13 evidence clauses (M1–M9, P1–P4), literal coverage spans, modality/alternative
interpretations, experience reference, taxonomy and negative controls.

The **Actual** column below is the executed successful-empty-provider probe, not
an invented transcription of the user's model output. Its shape matches the
reported symptoms. Full quotes are in the golden file; concise descriptions here
are audit explanations, not proposed unsupported candidate values.

| ID   | Minimum expected source-backed qualification                                                                                                                                                   | Actual deterministic contribution                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| M1   | Degree in Computer Science, Software Engineering, Information Technology or related field **OR equivalent practical experience**. Preserve alternatives; no new education column is proposed.  | Missing.                                                                                                                  |
| M2   | **6+ years** in software engineering, solution architecture or related technical role, including **recent hands-on Generative AI experience**. Do not require six years specifically in GenAI. | Missing in Required; Experience also missing.                                                                             |
| M3   | Strong English communication, facilitation, presentation and technical documentation.                                                                                                          | Missing. English taxonomy alone is not a substitute for this qualification.                                               |
| M4   | Personally built/delivered at least one LLM, RAG **or** agent-based application **beyond prototype**.                                                                                          | Complete long source clause retained. That length preserves important constraints.                                        |
| M5   | **Working knowledge of** RAG, vector search, agentic workflows, tool calling, model selection and AI system limitations.                                                                       | No clause-specific recovery. RAG occurs elsewhere in M4, which does not establish the M5 knowledge qualification.         |
| M6   | **Experience designing** cloud-based architectures, APIs, integrations, data flows and CI/CD practices.                                                                                        | Only CI/CD; the designing experience context and practices wording are absent from the value.                             |
| M7   | **Understanding of** AI evaluation, observability, security, privacy, performance and cost trade-offs.                                                                                         | Six fragments; lexical coverage is present but displayed modality is lost.                                                |
| M8   | **Experience using** AI coding tools **AND ability to coach engineers** in practical AI-assisted software development.                                                                         | Missing. Coaching is explicit in Must Have, not merely inferred from responsibilities. No named tool/vendor can be added. |
| M9   | **Client-facing experience in** discovery, requirement translation, architecture presentations and stakeholder communication.                                                                  | Missing.                                                                                                                  |
| P1   | Preferred experience with technical presales, proposals, RFP/RFI responses **or** delivery estimation.                                                                                         | One complete clause, terminal punctuation removed.                                                                        |
| P2   | Preferred multi-agent systems, MCP, knowledge graphs, multimodal AI **or** document intelligence.                                                                                              | One complete clause.                                                                                                      |
| P3   | Preferred experience designing technical training, engineering standards **or** reusable solution accelerators.                                                                                | One complete clause.                                                                                                      |
| P4   | Preferred spec-driven development, AI governance frameworks **or** relevant cloud and AI certifications.                                                                                       | One complete clause. Do not invent certification names or make certifications mandatory.                                  |
| Tags | LLM/Kubernetes/RAG/English are supplemental taxonomy. LLM/RAG/English require independent qualification evidence; Kubernetes has none here.                                                    | Taxonomy-only Kubernetes correctly rejected in the controlled probe.                                                      |

A minimal golden reference is **clause/evidence coverage with semantics**, not a
fixed bag of mandatory keywords. Source AND competencies may be shown separately
only when level and context survive. M1/M2/M4 and P1–P4 contain alternatives and
must remain grouped conservatively. Four Preferred compound clauses are therefore
not inherently an extraction failure; flattening all terms into independent
requirements would be a regression. Preferred and Required remain distinct.

## Controlled probe results

`p5-ai-extraction-probe.mjs` executes current compiled production functions with
three explicit mocked responses; `fixtures/itviec-ai-solution-architect.probe-results.json`
records raw mocks, independent normalization, final values, rejected counts and
lexical coverage. Lexical coverage is diagnostic only: it does not establish
correct modality, clause provenance or AND/OR semantics.

- Omitted model: 0 rejections, eight Required values and four Preferred clauses;
  Experience empty. This identifies deficient recovery, not rejected evidence.
- Complete-clause model: all 13 clauses plus the explicit experience candidate
  accepted (0 rejections), Minimum 6 years displayed; Required also contains the
  redundant CI/CD and six generic fragments. This identifies backend additions
  even when model coverage is complete.
- Literal atoms and invalid controls: valid missing terms survive. Exactly three
  rejections: taxonomy Kubernetes, unsupported cloud architecture alias, and the
  vector search candidate assigned to empty jd. Preferred MCP expands to P2.
- All three successful results pass validateImportReview against the same source.
  A separate simulated provider failure returns EXTRACTION_FAILED and empty skill
  suggestions; the frontend's existing error path keeps sources/previous fields.
  It does not silently claim successful deterministic-only extraction.

No test asserts that today's incomplete output is the desired future behavior.
The audit probe records behavior for diagnosis; the golden reference defines
coverage and semantic constraints for the later correction.

## Smallest safe correction proposal

1. Make explicit qualification-section handling consistent for Must Have and
   Nice to Have. Recover **all eligible literal qualification clauses** regardless
   of vocabulary, including education, communication, tool usage and coaching.
   Keep responsibility/benefit/taxonomy exclusions. Do not extend the keyword
   dictionary one missing tool at a time or alter the ITviec Fetch parser.
2. Reconcile candidates against those source clauses consistently: a complete
   clause and its fragments should not both inflate the list. Start with complete
   qualifications when shortening would lose knowledge level, delivery threshold
   or alternatives. Only split unambiguous AND components where the value remains
   a meaningful literal span and the full quote carries the original context.
   Do not generate Working knowledge of vector search as a literal value when
   that concatenated wording is not present in the source. Never remove OR groups
   merely to shorten the field.
3. Recover the explicit plus-years form with existing experience parsing, retaining
   minimum qualifier and full evidence. Keep recent GenAI experience as a separate
   source qualification; education/equivalence remain qualifications in skills
   under the existing model, not a new field or fabricated seniority.
4. Clarify the existing prompt's granularity instruction with a small example of
   a contextual qualification and an intact OR group. Keep current source keys,
   strict schema/evidence gates, model profile and single-call budget. Prompt-only
   changes cannot fix the proven recovery/normalization issues. Do not raise token
   limits or switch models without measured evidence that this path needs it.
5. Turn the golden reference into focused completeness/semantics regressions:
   empty/sparse/complete mocked providers, atomic candidates with context, education
   and plus-years, OR preservation, taxonomy negatives, literal quote validation,
   no duplicated clause/fragments, manual edits and actual Save payload. Keep all
   existing P1/P2 guards and conflict acknowledgement. Do not change CV Match.

If attribution to the user's original model is still required after this fix,
obtain its public-JD-only raw response and envelope metrics, or make **one** bounded
public-JD request with explicit capture of candidate stages and done_reason/token
counts. An old screenshot cannot distinguish model omissions, deliberate manual
edits, earlier parser versions or postprocessing. No production payload logging
or repeated expensive inference experiment is proposed.

## Risks to P1/P2 extraction and matching

- Broadly treating all prose as qualifications could promote responsibilities,
  benefits, taxonomy or preferred items. Restrict recovery to recognized sections
  and retain Vietnamese inline-priority and negation handling. Existing Viettel,
  numbered MDM, Java OR and bbv fixtures must continue to pass.
- Aggressive atomization can turn OR into mandatory AND, lose minimum/knowledge
  levels or education equivalence, and duplicate experience in many scored rows.
  Completeness is not achieved by counting more keywords.
- `apps/api/src/matching/cv-match.ts:97` (`canonicalRequirements`) consumes saved
  Required/Preferred strings, splits newlines and normally commas/semicolons,
  while `extraction/jd-requirements.ts:53` (`alternativeRequirement`) protects
  recognized OR groups. Thus extraction granularity can change matching inputs,
  scoring weight and evidence quality **even with matching code untouched**.
  Future tests should call existing canonicalRequirements on the corrected
  persisted fields to verify preserved alternatives and avoid extra generic rows;
  no matching or CV inference is run or modified in this audit.
- Do not change historical/manual evidence revalidation, Saved Job fields or
  conflict acknowledgement to make new suggestions pass. Accept old valid records
  and preserve intentional edits; scope new normalization to new proposals.
- More exhaustive model candidates with repeated long quotes can exceed output
  budget or the 60-model/120-merged-candidate caps. The current input is below the
  character bound; exact tokens are unknown. Prefer bounded deterministic recovery
  over adding retries, weakening validation or silently accepting length output.

## Verification and changed files

- `pnpm --filter @ai-job-hunter/api test --runTestsByPath .test-dist/test/unit/itviec-fields.spec.js .test-dist/test/unit/viettel-import.spec.js .test-dist/test/unit/mdm-import.spec.js .test-dist/test/unit/java-required-import.spec.js .test-dist/test/unit/ollama.context.spec.js`:
  **PASS — 85 tests / five suites**; includes test compilation and mocked provider
  context/output-limit checks. These passes do not establish live model quality.
- `pnpm --filter @ai-job-hunter/web test test/url-import-extraction.test.tsx`:
  **PASS — 12 tests**, including mapping, manual values, conflicts and Save payload.
- `node docs/audits/p5-ai-extraction-probe.mjs`: **PASS** against the fixed source;
  quote/coverage-span consistency, complete prompt inclusion and evidence round
  trips asserted. No network, model, document upload, database or job write.
- Initial audit-probe invocation had an incorrect relative API import path and
  failed before execution; corrected to resolve from docs/audits. Successful runs
  use the API's existing dependencies without installs.
- Scoped `pnpm exec prettier --check` on all four audit files: **PASS**.
- `git diff --check`: **PASS**. Tracked-file diff statistics match the start of
  this audit; no P5.5a/P5.5b file was edited.

Added only this report, the golden JSON, the offline probe and its clearly labeled
mock-results JSON. Existing P5.5a/P5.5b files remain unchanged by this checkpoint.
No live Ollama/private CV processing, migrations, dependencies, browser runs,
commits, pushes or PR. **Stop for review before production correction.**
