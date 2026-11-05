# P6.1 — CV Match requirement semantics audit

Date: 2026-11-05. Branch: `fix/p6-match-semantics`.
Base: `9d8575385bdee888c5002614fece38161901cfc7`.

## Scope and reproducibility

The initial working tree was clean on main. `git fetch origin main` and
`git merge --ff-only origin/main` reported already up to date; the requested
branch was then created. Node v24.22.1 / pnpm 12.14.0 were used.
Production code, configuration, dependencies and database remain untouched.
No private CV, database access, network inference, commit, push or PR was used.

Read AGENTS.md, UX guidance, architecture, P1–P3 acceptance/stabilization and
CV regression investigation, matching tests/policy, and P5.5 completeness,
recovery and golden/live regression artifacts. The verified public JD is reused
from `docs/audits/fixtures/itviec-ai-solution-architect.golden.json` and
`itviec-ai-solution-architect.live-p55d.json`. No fresh source fetch was needed.
The latter's normalized fields supply the exact clauses in the new Jest fixture.

`apps/api/test/unit/cv-match.semantics-audit.spec.ts` contains synthetic CV text,
controlled proposed model responses and current-behavior assertions. Passing
characterization tests expose defects; they do not endorse the defective policy.
They call canonicalization, validation and scoring, with no Ollama mock presented
as a capture. There is no captured P6 matching response: the P5.5 capture is an
**extraction** response and establishes requirement preservation only.

## Pipeline map and safeguards

Paths are repository-relative; named functions are navigation references.

| Stage                 | Reference and actual behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JD extraction/save    | `apps/api/src/opportunities/job-import.service.ts` (`JobImportService.extract`), `job-import.sections.ts`, `job-import.contract.ts` (`mergeCandidates`, `validateImportReview`): source-backed qualification recovery, reviewed required/preferred text saved on Opportunity. P5.5 preserves nine required and four preferred clauses plus minimum duration and domain. Import evidence metadata exists but does not supply the matcher's canonical JD quotations directly.                                                                                                        |
| CV                    | `apps/api/src/matching/job-match.service.ts` (`saveCv`, `analyze`), `saved-cv.entity.ts`; `ExtractionService.parseCv`: PDF/DOCX parsed text saved for the local owner. Explicit CV Match uses this text, **not a structured extracted CV profile**. Empty/missing CV fails before inference.                                                                                                                                                                                                                                                                                       |
| Canonical input       | `apps/api/src/matching/cv-match.ts` (`canonicalRequirements`, `matchJobText`): required/preferred skills, required experience, preferred domain. Skills split by newline, then commas/semicolons unless alternative detection or generated-discovery handling bypasses splitting. Experience/domain each stay one row. Canonical quotes are requirement strings from saved fields, not necessarily full original source clauses. Title, description, post and JD also go to the prompt.                                                                                            |
| Discovery exception   | `canonicalRequirements` and `apps/api/src/extraction/jd-requirements.ts` (`jdRequirementLines`, `alternativeRequirement`): regenerate source lines only for discovery records whose fields still equal initial generated values. Edited/manual/P5.5 Add Job fields normally use ordinary splitting. Alternatives detected by lexical cues including `or`, `one of`, `such as`, Vietnamese one-of forms; this is not logical parsing.                                                                                                                                               |
| Prompt/schema         | `matchPrompt`, `matchOutputSchema`, `cvQuoteChoices` in `cv-match.evidence.ts`: preserve canonical priorities/labels, enumerate gaps, preserve OR groups and quantities, verbatim JD evidence, CV passages selected from schema enum. Instructions reject aspirations, negation, insufficient duration and AI tooling as production AI proof; these instructions are not general deterministic semantic enforcement. One cvQuote per proposed row, possibly a bounded adjacent passage; no component-level assessment.                                                             |
| Provider/raw response | `JobMatchService.analyze` → `AiService.generateStructured` / private `generate` → `OllamaProvider.generate` (`apps/api/src/ai/ai.service.ts`, `ollama.provider.ts`). Provider checks pinned profile/allocation, context/output budgets, bounded transport and completion; uses temperature 0, `/api/generate`, returns envelope response text. This non-partial path measures prompt with a one-token generation before final generation. AiService JSON-parses and schema-validates; malformed output fails explicitly. No raw response persistence is performed by this service. |
| Evidence validation   | `validateMatchAssessment`: every canonical row must link by normalized exact requirement **or** exact canonical quote; empty/invalid JD quotes reject analysis. `resolveCvQuote` accepts exact/unique whitespace-equivalent spans, preserving source text. Tooling guard downgrades/rejects production-AI misuse. Invalid CV quotes cannot be restored by recovery; if none remain verifiable, explicit failure. General semantic relevance, negation and contradictions are not checked here.                                                                                     |
| Merge/score           | `MatchingService.matchSavedCv` → `scoreCvMatch`: restore canonical category/priority, select one linked supported proposal, recover narrow Java/generic duration evidence, add unmatched source-backed proposals, deduplicate lowercase trimmed labels. Any nonempty exact CV quote earns full row credit. Only EVIDENCED/NOT_EVIDENCED exist.                                                                                                                                                                                                                                     |
| API/lifecycle         | `OpportunitiesController.match` (`opportunities.controller.ts`) POST `/api/v1/opportunities/:id/match`; analysis concurrency guard, 64 KiB prompt bound, safe typed failures and CV/job revision recheck. Returns timestamps; no job/status writes.                                                                                                                                                                                                                                                                                                                                |
| UI                    | `apps/web/src/features/inbox/CvMatchPanel.tsx` (`analyze`, `isMatchResult`, `MatchContent`, `RequirementsList`, `RequirementCard`, `EvidenceQuote`): validates two-state response, displays score/recommendation, matched/unverified lists, priority and expandable CV/JD quotes. Missing quote says “Not evidenced in CV”. Results held on page and invalidated for saved revisions. No partial/conflict state or component coverage is displayed.                                                                                                                                |

## Confirmed findings, ranked

1. **High — provenance is treated as semantic sufficiency.** Valid source text
   can be unrelated, partial, contradictory or prototype-only and still earn
   full credit if the model links it. The prompt requests better behavior but
   backend validation does not establish entailment. Even an intact AND clause
   accepts one component's quote. This proves a missing safeguard, not that
   Ollama necessarily makes each bad proposal in practice.
2. **High — contextual AND clauses fragment and multiply weight.** B splits
   into five rows, C into six; trailing labels lose their governing experience
   or working-knowledge qualifier. All fragments are independently required.
   The same logical source clause can have weight 15 or 18 instead of 3.
   Discovery-generated source rows can bypass splitting, so input provenance
   also changes granularity and scores.
3. **Medium — partial, unknown, conflict and explicit absence collapse.**
   Empty quote yields NOT_EVIDENCED, which correctly does not assert inability,
   but there is no structured distinction for contradictory or negative CV
   evidence. A selected positive quote is not checked against other CV passages.
4. **Medium — model enumeration still affects the denominator.** Canonical
   priorities are protected, but unmatched proposals with valid JD substrings
   are appended using model priority/category. Exact label deduplication does
   not merge semantic paraphrases or full-clause/fragment overlap. Canonical
   split fragments plus an additional full-clause proposal can double count.
5. **Medium — traceable text is weaker than traceable qualification.** A JD
   fragment can be present in rendered saved fields without preserving its
   parent clause/modality. Matching does not carry import-review evidence IDs
   or source offsets. Exact canonical quote linkage handles alternate model
   labels, but general equivalent/reordered wording has no backend semantic
   linkage guarantee.

## Cases A–E and deterministic actual versus expected

Scores below are isolated-fixture scores with the same selected passage proposed
for every canonical row. They are not real applicant scores. A is preferred in
the source; its priority is tested separately. Row count does not depend on that
priority. “Partial” below describes desired coverage, not an implemented status.

| Case                                                                                                                    | Canonical tokenization                                                                                                   | Synthetic evidence and actual result                                                                                       | Expected qualification interpretation                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Multi-agent systems, MCP, knowledge graphs, multimodal AI, or document intelligence                                  | One OR row; full list survives                                                                                           | “Built MCP servers.” → 100, EVIDENCED                                                                                      | One demonstrated alternative suffices; no need for all five. Empty proposal yields 0 even with that CV text: no general MCP recovery.                                      |
| B: Experience designing cloud-based architectures, APIs, integrations, data flows, and CI/CD practices                  | Five rows: “Experience designing cloud-based architectures”; “APIs”; “integrations”; “data flows”; “and CI/CD practices” | “Designed APIs.” linked to every row → 100; all five explicitly designed in one passage → 100                              | First is partial, not full support; second fully supports the conjunction. Retain designing-experience context for every component.                                        |
| C: Working knowledge of RAG, vector search, agentic workflows, tool calling, model selection, and AI system limitations | Six rows; only first retains “Working knowledge of”                                                                      | “Skills: RAG.” linked to all → 100                                                                                         | Partial evidence for the knowledge conjunction; technology mention alone cannot establish all components or their knowledge level.                                         |
| D: Personally built and delivered at least one LLM, RAG, or agent-based application beyond the prototype stage          | One OR row, including delivery constraint                                                                                | Personally built/delivered one RAG application to production → 100; “Built a RAG prototype only.” → also 100 when selected | One alternative is enough **with** personal delivery beyond prototype; prototype-only evidence fails that constraint. No deterministic delivery/quantity evaluator exists. |
| E: Bachelor's degree … or equivalent practical experience                                                               | One OR row, including degree fields                                                                                      | Explicit equivalent practical experience → 100; empty evidence → 0                                                         | Relevant degree or sufficiently evidenced equivalent practice can suffice. No degree or equivalence evaluator exists; a selected quote is trusted semantically.            |

Additional fixtures:

- No evidence/unrelated CV with empty proposals: 0, every row NOT_EVIDENCED.
  Unknown support is not proven absence. No partial score is available.
- Conflicting “Built MCP servers” / “I have never used MCP” passage: accepted,
  100; expected conflict/needs review rather than an unqualified full match.
- Intact “Experience designing APIs and integrations” with only “Designed APIs”: 100. Merely preventing splitting will not fix semantic sufficiency.
- B with only first fragment evidenced and one unsupported preferred Rust row:
  19 = round(100 × 3/16). An intact two-component clause with the same first
  supporting passage receives 75 = 3/4 under current binary scoring. This exposes
  both row-weight inflation and the separate over-crediting of intact conjunctions;
  75 is not a proposed correct score for partial evidence.
- Reordered/expanded OR clauses (“MCP or document intelligence”, reverse order,
  “Model Context Protocol or document intelligence”) remain one row; forced exact
  selected evidence earns 100, empty proposal 0. This is not automatic acronym
  recognition. A paraphrased model label links if its jdQuote remains canonical;
  paraphrasing the label and using only substring quote “MCP” fails completeness.

Every accepted positive quote is traceable to synthetic CV text and every JD
quote to rendered job text. That proves provenance, not satisfaction of the
parent requirement. Required/preferred metadata survives canonical merge.

## Scoring and evidence risks

Saved-CV scoring is `round(100 × earnedWeight / totalWeight)` with required 3,
preferred 1; no category weights. EVIDENCED earns 100% of row weight, otherwise
zero. No fractional partial credit, component count or uncertainty adjustment.
Empty grounded requirement set gives null; valid all-gap assessment gives zero.
Apply requires score ≥75 and no required gap; Consider ≥40; otherwise Low Fit
(null also Consider). Required gaps can therefore block Apply even at high score.

One OR alternative is sufficient only because prompt/model chooses a supporting
quote; backend does not inspect alternatives. One AND component can incorrectly
satisfy the entire intact requirement by the same mechanism. With correct empty
quotes for unsupported split components, the score is proportional to fragment
count, whose weights were never allocated at parent-clause level.

P5.5 also retains a contextual six-year role/AI clause plus separate generic
Minimum 6 years. These overlap conceptually but are not exact duplicates; blindly
removing either loses constraints. Domain metadata is always a preferred scoring
row even though the prompt calls canonical domain context rather than proof of a
required prior-domain qualification. Both need an explicit scoring decision.

## P2 baseline and impact

P2 saved-CV acceptance is represented by `docs/mvp-commit-review.md`,
`docs/p1-p3-stabilization.md`, `docs/cv-match-regression-investigation.md` and
`cv-match.spec.ts`, `job-match.regression.spec.ts`, `match-evidence-validation.spec.ts`.
Keep these stable unless a demonstrated bug justifies changing a specific fixture:

- Synthetic AI Developer service score **27**, with only Backend Java and
  Minimum 3 years evidenced; direct recovery variant **31** has different rows.
- Required/preferred coverage examples **38/13**; all required Python supported
  with preferred Java gap **75 / Apply**. No change to simple-row 3:1 weighting
  is required to repair compounds.
- Explicit Java skill declarations and sufficient generic duration recover;
  JavaScript, aspirations, skill-specific duration inference and AI tooling as
  production AI proof do not. No overlap-duration summing.
- Missing CV, empty/incomplete/invalid model output, fabricated JD/CV quotes,
  provider errors and source revision races must fail explicitly or downgrade as
  specified, never fabricate a new zero score. Legitimate complete all-gap result
  can remain zero. Priority downgrade prevention and evidence navigation remain.

The repository also retains **Task 04 extraction matching**, a different path:
`MatchingService.match` → `matchExtractions` in `matching.ts`, with structured
CV/JD facts, restricted `parsePhrase` forms and validated evidence context.
It has required/preferred **2:1**, category weights **35/25/20/10/10**, duration
partial credit, missing/negative/conflict distinctions and exclusion of unsupported
compound requirements. It does not implement arbitrary natural-language AND/OR.
Its `matching.spec.ts` accepted examples remain 100 (aliases), 66.67 (missing vs
negative with distinct statuses), 60 (3/5 years), 58.33 (unknown duration), and
100 with excluded complex architecture and deduplicated priorities. These are
not saved-CV score expectations. Evaluation v1 fixtures in
`apps/api/test/evaluation/datasets/v1/matching.ts` cover that retained policy.
Do not silently route CV Match through it or claim it already provides the
saved-job behavior. The focused run includes its unit policy regressions.

Correcting demonstrated compound bugs may change compound-job scores and
recommendations substantially. Preserve simple-row baseline behavior and explain
changed parent coverage/denominators; do not promise numerical parity for bugs.

## Minimal P6.2 proposal for approval

1. Keep saved source qualification lines intact in `canonicalRequirements`;
   retain plain technology-list support where the input really is a simple list.
   Use stable request-local parent IDs, priority and original JD context. Reuse
   import evidence where available without rewriting historical data. No AST or
   new table is needed for these bounded forms.
2. Extend the existing structured assessment with shallow per-parent coverage:
   AND/OR mode, common constraints and explicit components with selected source
   passages. Prompt should distinguish knowledge level, personal delivery, minimum
   quantity and beyond-prototype constraints. Arbitrary ambiguous compounds must
   remain unverified rather than guessed. Preserve full parent and matched
   component evidence, including disconfirming passages.
3. Validate IDs/completeness/priorities and source passages deterministically.
   Reject invented/duplicate components and source-unsupported modes; do not trust
   a model's full-match label alone. Add narrow negation/duration/constraint guards
   where support is explicit. Semantic entailment still depends partly on model
   assessment and must remain disclosed; quote checks cannot prove it universally.
4. Allocate one total weight (required 3/preferred 1) per parent. For explicit OR,
   one fully supported alternative plus common constraints earns full credit.
   For explicit AND, full support requires every component; proposed partial
   credit is supported-components/total-components with no full match or Apply
   while a required parent is partial/unknown/conflicted. A failed shared delivery
   constraint prevents full credit. Agree on partial/unknown denominator policy
   before implementation; unknown currently contributes zero documented support.
5. Score canonical parents only; extra extracted requirements should be surfaced
   for review without silently multiplying denominator weight. Explicitly decide
   treatment of generic-duration overlap and context-only domain metadata.
6. Extend current response/UI just enough for partial, unverified and conflict
   coverage with component quotations. Preserve existing evidence reveal, keyboard
   focus, saved-revision invalidation and synthetic P2 simple-row expectations.
   Convert these characterization probes into desired-policy assertions alongside
   focused service/schema/UI regressions. No migration/infrastructure required.

## Verification and limitations

- PASS: `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match|job-match.regression|match-evidence-validation|matching.spec|ai-solution-architect-import'` — **141 tests / 7 suites**, including 14 new audit probes. The command compiles the API test TypeScript first; compilation passed. Expected synthetic rejection diagnostics were emitted.
- The first run had one new-test assertion failure: it expected the error code in the human-readable exception message. Changed that assertion to the typed `CvMatchError`; rerun passed. Production behavior and existing tests were not altered.
- PASS: `pnpm exec prettier --check apps/api/test/unit/cv-match.semantics-audit.spec.ts docs/audits/p6-match-semantics.md`.
- PASS: `git diff --check`; because both additions are untracked, also checked each with `git diff --no-index --check /dev/null <file>`.
- Not run: broad suites, builds, standalone typechecks, lint, database tests, live evaluation and Playwright; this checkpoint adds only audit documentation and deterministic API tests. The focused test command already compiles API test types.

Changed files: this report and `apps/api/test/unit/cv-match.semantics-audit.spec.ts` only. Stop for review; P6.2 is a proposal and has not been implemented.
No live model accuracy, private applicant fit, database integration or browser
acceptance is claimed. UI behavior was traced from source only; no UI changed.
