# P6.2 — Saved-CV compound requirement correctness

Date: 2026-11-05. Branch: `fix/p6-match-semantics`.
P6.1 report and public extraction artifacts are preserved. Its synthetic probe
file is converted to desired-policy assertions, as approved. No commit, push,
PR, migration, dependency, database operation, private CV or live inference.

## Changes and decisions

- `apps/api/src/matching/cv-match.ts`: retain contextual source clauses as single
  canonical parents; bare comma/semicolon skill lists still split. Assign stable
  request-local p1… IDs. Extend the existing model schema/prompt with optional
  component selections; existing parent-only proposals remain accepted. Validate
  parent/component identity, source JD spans, duplicates and CV passage provenance.
  Model-added rows never enter the denominator. Score one parent at 3/1,
  proportional AND credit, OR with common constraints, zero Unknown/Conflict;
  any non-full required parent blocks Apply. Recommendation thresholds remain.
- `apps/api/src/matching/cv-match.coverage.ts`: shallow server-derived groups
  and c1… IDs, bounded explicit aliases and positive-context checks; shared
  design/knowledge context, explicit personal build/production delivery,
  generic and compound minimum-duration safeguards, education alternatives,
  negative/aspirational vetoes, and verifiable contradictory source passages.
  Operators and components are never accepted from model prose. Nested/mixed or
  unsupported quantity forms remain Unknown rather than acquiring guessed credit.
- `apps/api/src/matching/job-match.service.ts`: fail explicitly with
  CV_MATCH_INCOMPLETE if no canonical saved requirements exist; model-added
  requirements cannot manufacture a score for an empty canonical set.
- `apps/web/src/features/inbox/CvMatchPanel.tsx`: Matched, Partial, Unknown,
  Conflict / Needs review counts, filters and accessible disclosure labels;
  component coverage, JD/CV quotations and contradictory passages. Validate the
  extended response. Existing reveal/highlight, instant scroll, keyboard focus,
  page-local results and revision invalidation are retained. No other UI changes.
- `apps/api/test/unit/cv-match.semantics-audit.spec.ts`: P6.1 probes converted,
  with additional proportional, shared-constraint, conflict, separate-passage,
  schema-boundary, duplicate/fabrication, denominator, wording and priority tests.
- `apps/web/test/cv-match.test.tsx`: existing unknown-label expectations updated;
  new state/filter/component/conflict/keyboard/revision and malformed-response tests.
- `docs/architecture.md`: documents the policy and conservative boundaries.
- This report. P6.1 audit documentation is unchanged.

No complex AST, shared package, database tables or alternative matching pipeline
was introduced. A shallow group is derived per request from the canonical source
text, with source-substring components. Simple-row semantic links remain compatible
with P2, with narrow negative/duration and bare-skill relevance vetoes. Domain
remains one preferred row and generic Experience one required row; neither gets
new category weighting or overlap deduplication. Additional model proposals are
not displayed or scored; they are still subject to existing provenance validation.

## P6.1 A–E before and after

The same public P5.5 clauses and synthetic CVs are used. Isolated single-parent
scores are evidence coverage, not applicant suitability or model accuracy.

| Case                                                                                                         | P6.1 controlled proposal result                                         | P6.2 result                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: Multi-agent / MCP / knowledge graphs / multimodal / document intelligence                                 | One OR row; MCP quote → 100, no deterministic alternative verification  | One OR parent; explicit positive MCP evidence → 100 / Matched. Unrelated or negative MCP quote → 0 / Unknown. Contradictory MCP statements → 0 / Conflict.                                                          |
| B: Designing cloud architectures, APIs, integrations, data flows, CI/CD                                      | Five required rows; API-only quote linked to each → 100                 | One required parent; API design only → 20 / Partial; APIs + integrations → 40 / Partial; all five explicitly designed → 100 / Matched.                                                                              |
| C: Working knowledge of RAG, vector search, agentic workflows, tool calling, model selection, AI limitations | Six rows; RAG-only quote linked to every fragment → 100                 | One required parent; RAG skill declaration → 17 / Partial; RAG + vector search + tool calling → 50 / Partial; all six with bounded equivalent wording → 100 / Matched.                                              |
| D: Personally delivered at least one LLM/RAG/agent application beyond prototype                              | One OR row; production delivery and prototype-only proposals both → 100 | Explicit personal production delivery of one RAG app → 100 / Matched. Prototype-only, team-only or no delivery → 0 / Unknown. Verifiable contradictory prototype-only account → 0 / Conflict.                       |
| E: Bachelor's degree or equivalent practical experience                                                      | One OR row; any selected source quote treated as support                | Relevant completed degree or explicit equivalent practical software-building experience → 100 / Matched. Incomplete degree, unstated evidence, unsupported equivalence or mismatched specified field → 0 / Unknown. |

Reordered AND/OR components and bounded equivalent terms retain credit, including
MCP / Model Context Protocol, RAG / retrieval-augmented generation, vector
search/retrieval, tool/function calling and API spelling. Explicit equivalent
personal development/deployment wording and reversed degree/practical alternatives
are covered. These are bounded aliases, not general paraphrase recognition.

## Scoring and evidence examples

- Required AND with four of five components supported plus one supported preferred
  skill: `(3 × 4/5 + 1) / 4 × 100 = 85`, **Consider**, because required coverage is
  partial. Reverse priorities: `(3 + 1 × 4/5) / 4 × 100 = 95`, **Apply**.
- Required B with one component supported and unsupported preferred Rust: **15**
  (`3 × 1/5 / 4`). P6.1's fragmented denominator gave 19; the parent policy now
  fixes total source weight at 3 regardless of component count.
- Intact “Experience designing APIs and integrations” with only APIs: **50 /
  Consider**, replacing incorrect 100 / Apply.
- Extra Rust proposal or duplicate proposal cannot change canonical Python +
  preferred Java's **75 / Apply** when only Python is evidenced. Canonical
  priority cannot be downgraded by the model.
- Separate selected “Designed APIs.” / “Designed integrations.” quotations can
  satisfy the conjunction without synthesizing a combined CV quotation.
- Explicit minimum duration shared by alternatives is checked with each selected
  supporting passage; short/unstated duration cannot receive full credit.
- Empty CV evidence is **Unknown**, zero credit, never proof of absent ability.
  Internal EVIDENCED / NOT_EVIDENCED values remain compatible for simple rows;
  new PARTIAL / CONFLICT values are explicit in the UI.
- Conflict requires matching positive and contradictory CV passages, not merely an
  unsupported claim. The full CV is checked for narrow contradictory assertions,
  even if the model selects only the positive passage. Both quotations are shown.
  A negative statement about a different OR alternative does not veto a supported
  alternative. Negated-only evidence remains Unknown rather than a full match.
- Forged component/parent IDs, duplicate component IDs or altered JD component
  spans fail with typed matching errors. Non-source component CV quotations fail
  evidence validation (and real structured schema rejects non-enumerated passages).
  Parent quote rejection/downgrade and existing tooling safeguards remain intact.

## P2 preservation

The focused run includes unchanged `cv-match.spec.ts`,
`job-match.regression.spec.ts`, `match-evidence-validation.spec.ts`,
`discovered-match.spec.ts`, diagnostics and P5.5 golden matching inputs.
Simple-row expectations remain: required/preferred **38/13**, required-only
Python **75 / Apply**, Java/generic-duration recovery variant **31** and service
AI Developer **27**. Managed-language explicit one-of declarations/recovery remain
supported; JavaScript and AI tooling cannot masquerade as production qualifications.
Typed provider/invalid/incomplete/evidence failures and legitimate all-gap zero
results remain covered. Existing tests were not weakened to accept changed scores.

The separate Task 04 `matching.spec.ts` policy remains unchanged: 2:1 importance,
category weights, aliases/deduplication, missing vs negative, 3/5-year partial
credit **60**, and unknown-duration example **58.33**. Saved-CV matching is not
rerouted through this legacy structured matcher. Compound scores intentionally
change where P6.1 demonstrated bugs; numerical parity for those bugs is not promised.

## Browser acceptance

**PASS — scoped Chromium via Playwright MCP**, using a temporary Vite harness
rendering the actual CvMatchPanel with the existing MUI theme. The displayed
response was generated by the compiled current backend canonicalization,
validation and scorer from synthetic text: required B partial, required C unknown,
Python matched, preferred A conflict; **36 / Low Fit**. All `/api/**` traffic was
intercepted; only synthetic saved-CV metadata and that computed response were
fulfilled. Other API requests were blocked. No real job writes, uploads, database
or Ollama access. Temporary harness files/routes and the Vite process were removed
or stopped after the pass.

Verified Matched/Partial/Unknown/Conflict filters and component/contradictory
quotations; Enter opens and Space closes disclosure; preview navigation resets a
filter, reveals/highlights the exact row and focuses it. No page horizontal overflow
at **1280×900**, **390×844**, or **200% CSS zoom** at desktop size. Console errors:
**0** (warnings 0). CSS zoom is a layout stress check, not native browser zoom.
Saved-job revision invalidation is covered in focused automated tests, including
compound results; no production saved record was changed to exercise it in browser.

## Verification

| Command / check                                                                                                                                                                       | Actual result                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match\|job-match.regression\|match-evidence-validation\|matching.spec\|discovered-match\|ai-solution-architect-import'` | PASS — 179 tests / 8 suites; API test TypeScript compilation also passed. Expected synthetic rejection diagnostics emitted.                         |
| `pnpm --filter @ai-job-hunter/web test test/cv-match.test.tsx`                                                                                                                        | PASS — 17 tests / 1 file, including existing navigation/invalidation and new compound cases.                                                        |
| `pnpm typecheck`                                                                                                                                                                      | PASS — both API and web. After final backend-only changes, `pnpm --filter @ai-job-hunter/api typecheck` also PASS; unchanged frontend check reused. |
| `pnpm lint`                                                                                                                                                                           | PASS — repository-wide, zero warnings allowed; no rule suppression.                                                                                 |
| `pnpm format:check`                                                                                                                                                                   | PASS — repository-wide.                                                                                                                             |
| `git diff --check`                                                                                                                                                                    | PASS; new untracked files also checked individually using `git diff --no-index --check /dev/null <file>`.                                           |
| Playwright MCP Chromium                                                                                                                                                               | PASS — scoped synthetic component smoke as described above.                                                                                         |

Earlier implementation runs exposed an unsupported schema keyword, test-only
metadata serialization and an invalid Testing Library option; the causes were
fixed, with no lint-rule suppression, weakened P2 expectations or skipped tests.
The final API and frontend focused tests pass. Full suites, builds, live evaluation,
database integration and migrations were not run because this checkpoint changes
neither infrastructure nor persistence and forbids private/live processing.

## Remaining limitations

- No live inference was run. Local model conformance, context pressure from added
  component metadata and real-document accuracy remain unmeasured. Existing
  context-budget/schema/typed-error safeguards remain; optional component output
  permits legacy parent-only responses without sacrificing compound validation.
- This is conservative bounded semantic validation, not universal entailment.
  Uncommon synonyms, nested/mixed logic, unsupported quantities or nonliteral
  personal/education evidence can stay Unknown. No arbitrary equivalence or
  experience duration is inferred. Generic duration and Domain overlap policy is
  intentionally unchanged.
- Contradiction checks recognize explicit local negative/prototype assertions and
  exact term/alias context. They do not resolve historical versus current
  statements, unrelated projects, or pronoun references; ambiguous cases need
  human review. Conservative conflict can withhold credit rather than pick the
  favorable account.
- Existing simple multiword semantic model links remain trusted after narrow
  vetoes to preserve P2. The new strict component policy addresses explicit
  compounds; this does not claim complete semantic validation of every simple row.
- Browser acceptance covers the real component with synthetic intercepted APIs,
  not a live provider/database end-to-end flow. No broad E2E, build, integration
  or migration runs were warranted by this checkpoint.

## P6.3 — Live Ollama compatibility smoke

2026-11-05: **schema/transport PASS; semantic acceptance FAIL. P6.2 is not yet
ready for final acceptance against this live criterion.** Earlier no-inference
statements above describe P6.2; this section records the separately authorized run.

- Exactly **one** `JobMatchService.analyze` call through the existing
  `AiService` → `OllamaProvider`, using unchanged local `.env` configuration and
  existing compiled service code. No suites or compilation were rerun. CV/job
  repository reads were supplied entirely in memory; write methods were unavailable.
  **Zero database connections/writes**, no private CV, no production code changes.
  The temporary runner was removed; all prior working-tree files were hash-checked
  as unchanged before this report update.
- Synthetic CV: `Designed APIs.` followed by `Built MCP servers.` on a new line.
  Required: `Experience designing cloud-based architectures, APIs, integrations,
and CI/CD practices.` Preferred: `MCP or knowledge graphs.`
- Ollama **0.40.10**, **qwen3:4b**; existing pinned digest/allocation checks passed.
  One provider invocation performed its normal **one-token measurement plus one
  final generation**; no retry, repair, fallback or second matching request.
- End-to-end latency **8,672 ms**. Measurement HTTP completion **3,312 ms**,
  **798 prompt tokens / 1 output token**, expected `done_reason: length`.
  Final HTTP completion **5,315 ms**, **798 prompt tokens / 337 output tokens**,
  `done: true`, `done_reason: stop`, output budget **4,096 tokens** with the
  existing **8,192-token context**. No timeout, truncation, context/output-budget,
  transport, JSON, schema or evidence-validation error.
- Both canonical parents were returned with correct priorities and IDs:
  **p1 / c1–c4**, **p2 / c1–c2**. All component JD spans validated. The model
  selected `Designed APIs.` for p1 and its APIs component; other p1 quotes were
  empty. It returned empty parent and component quotes for p2, including MCP.
  All selected CV/JD quotes were source-backed; no fabricated evidence was
  proposed or accepted. This run does not independently test fabricated-output
  rejection; P6.2's already-passed deterministic negative tests cover that gate.

| Check                         | Expected                | Actual                                                                                                    |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Required AND                  | Partial, 1/4 components | **PASS: PARTIAL, credit 0.25**, APIs only                                                                 |
| Preferred OR                  | Matched through MCP     | **FAIL: NOT_EVIDENCED / Unknown, credit 0**                                                               |
| Score / recommendation        | 44 / Consider           | **19 / Low Fit**: round(100 × (3 × 0.25 + 0) / 4)                                                         |
| Partial required cannot Apply | No Apply                | **PASS: no Apply**; this low-score run does not isolate the high-score veto already covered by P6.2 tests |

**Diagnosed boundary:** the raw final model response already omitted MCP support;
backend normalization did not discard a selected MCP quote. Offline inspection
confirmed the prompt contained the complete CV, p2 was a canonical OR group, and
both parent/component schema enums allowed the exact `Built MCP servers.` passage.
The failure is a model evidence-selection omission permitted by the empty-quote
schema contract, not a budget failure or invalid identifier. One sample does not
establish frequency or the model's internal reason. A follow-up must address that
omission before claiming live semantic acceptance; no prompt/backend fix or repeat
inference was attempted under this checkpoint.

Documentation-only verification: scoped Prettier and whitespace checks **PASS**.
Existing P6.2 suite results were reused against unchanged production/test code.
No commit, push or PR.

## P6.4 — Recover omitted explicit OR evidence

2026-11-05: **PASS — scoped P6 MVP matching acceptance criteria now pass**, including
the previously failing live P6.3 scenario. Ready for checkpoint review; this does
not establish general model accuracy or remove the conservative boundaries below.
This result supersedes P6.3's acceptance blocker, while preserving its observed failure.

### Confirmed root cause and fix

The original sanitized capture is now preserved in
`docs/audits/fixtures/p63-synthetic-cv-match.json` for offline service replay.
Actual CV input was `Designed APIs.\nBuilt MCP servers.`; canonical p2 was
preferred `MCP or knowledge graphs.` with MCP c1 / knowledge graphs c2. The prompt
contained that complete CV and group, and both quote enums allowed the exact MCP
passage. Raw parent/component selections for MCP were empty. Nothing rejected or
removed a selected quote: P6.2's scorer only credited selected passages, although
its conflict detection already searched the full CV for positive support. Existing
Java/duration recovery did not cover MCP. This confirms a missing deterministic
recovery path, without claiming the prompt caused the model's omission.

The fix reuses the existing component-support predicate and alias registry to
recover positive source passages only for explicit OR alternatives. It retains
shared design/knowledge, personal production-delivery and minimum-duration checks;
unsupported quantities/ambiguous groups stay Unknown. A recovery-specific
positive-context check rejects future/counterfactual intent, negation, aspirations,
isolated keywords and coding-tool passages. Contradictory evidence yields Conflict
and zero credit. Recovery preserves an exact CV substring at parent/component level;
raw model output is never edited. Rejected model evidence cannot be replaced by
recovery. Typed malformed/fabricated parent/component evidence failures remain.
No keyword recovery is added for AND, SINGLE or UNKNOWN groups. Parent weights and
recommendation thresholds are unchanged.

Exact files changed in P6.4 (earlier work preserved):

- `apps/api/src/matching/cv-match.coverage.ts`: bounded OR recovery using existing
  support checks and conflict handling; explicit eligibility flag.
- `apps/api/src/matching/cv-match.ts`: enables that recovery only when parent
  evidence was not rejected. No prompt/schema or scoring-policy change.
- `apps/api/test/unit/cv-match.or-recovery.spec.ts`: captured service replay,
  MCP/expanded alias, exact source spans, unrelated/missing/negated/contradictory/
  aspirational/counterfactual/tooling negatives, delivery/duration/quantity limits,
  unsupported alternatives, AND non-recovery and typed fabrication failures.
- `apps/api/test/unit/cv-match.semantics-audit.spec.ts`: updates the prior empty
  OR-selection expectation to the approved recovery behavior for MCP/alias wording.
- `docs/audits/fixtures/p63-synthetic-cv-match.json`: preserved synthetic P6.3
  raw response, inputs and original result/latency; no credentials/private data.
- `docs/architecture.md`: recovery eligibility and boundaries.
- `docs/audits/p6-match-correctness.md`: this report update.

### Before/after and one live request

The offline service replay uses the **unchanged captured P6.3 raw response**.
The single new live response also equals the P6.3 raw response structurally: Ollama
again left p2/MCP evidence empty. The corrected result therefore demonstrates
backend recovery rather than improved model selection or fabricated model output.

| Observation            | P6.3 before          | P6.4 after (offline replay and live)                                                                          |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Required p1 AND        | Partial, credit 0.25 | **Partial, credit 0.25**, only APIs c2 supported by `Designed APIs.`                                          |
| Other AND components   | Not evidenced        | Cloud architecture c1, integrations c3, CI/CD c4 remain **Not evidenced**                                     |
| Preferred p2 OR        | Unknown, credit 0    | **Matched, credit 1**, MCP c1 quote `Built MCP servers.` recovered; knowledge graphs c2 remains Not evidenced |
| Score / recommendation | 19 / Low Fit         | **44 / Consider**, round(100 × (3 × 0.25 + 1) / 4)                                                            |
| End-to-end latency     | 8,672 ms             | **9,020 ms** live                                                                                             |

Live path: one `JobMatchService.analyze` → `AiService` → real `OllamaProvider`
request, same synthetic CV/JD and unchanged local configuration. Read-only
in-memory CV/job fixtures, zero database connections/writes, no private CV.
Ollama **0.40.10**, **qwen3:4b**, pinned digest/context/allocation checks passed.
Normal one-token measurement **3,313 ms** (798 prompt / 1 output token, expected
`length`); final generation **5,666 ms** (798 prompt / 337 output tokens,
`done: true`, `done_reason: stop`), output budget **4,096**, context **8,192**.
Schema, parent/component IDs and source evidence validation passed. No timeout,
context/output-limit, schema, fabricated-evidence or other validation failure.
Exactly one provider invocation with its normal measurement/final passes; no retry,
repair, alternate prompt or extra matching request. Temporary runner removed. A final
recovery-only guard additionally rejects explicit zero delivered applications;
focused tests/typecheck/lint were rerun after that refinement. The live raw
response equals the preserved fixture replayed by those final tests, and its
positive MCP path is unchanged. No second live request was made.

### Verification

- **PASS — 127 tests / 7 focused backend suites**:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match|job-match.regression|match-evidence-validation|discovered-match'`.
  Includes unchanged P2 simple-row scores/recommendations, Java/duration recovery,
  typed evidence/provider failures and new P6.4 regressions. Expected synthetic
  rejection diagnostics are not failures. API test compilation passed.
- **PASS — API typecheck**: `pnpm --filter @ai-job-hunter/api typecheck`.
- **PASS — scoped ESLint**, zero warnings, on the two changed backend source
  files and two changed test files; no rule suppression.
- **PASS — scoped Prettier**, changed source/tests/fixture/documentation.
- **PASS — `git diff --check`**, plus individual no-index whitespace checks for
  new/untracked checkpoint files. Pre-existing unrelated files were hash-checked.
- **PASS — one real local synthetic smoke**, as above, after deterministic checks
  passed. Existing frontend/browser and unrelated suite results were reused;
  there are no frontend changes in this checkpoint. No broad suites, database
  integration, migration, commit, push or PR.

### Remaining recovery boundaries

- Recovery uses only terms matching the existing explicit alias registry; it
  does not promote arbitrary words accepted by the model's broader exact-label
  policy. For example, an omitted **knowledge graphs** quote is not recovered by
  this new path because that label has no registry entry. Explicit model-selected
  support still follows P6.2 validation. This conservative false-negative boundary
  is intentional; no vocabulary expansion or fuzzy semantic search was added.
- Source passages over 2,000 characters, unrecognized wording, nested/mixed logic
  and unsupported quantities remain unverified. Shared constraints must be explicit
  in the supporting passage; a skill declaration cannot imply personal production
  delivery or years. The existing P2 Java/duration recovery is unchanged.
- Narrow lexical/context guards do not prove universal entailment or distinguish
  every actor, historical project, quoted statement or nuanced negation. Ambiguous
  wording can require review, and conservative conflict withholds credit rather
  than selecting the favorable account. No general AND evidence recovery exists.
- One live sample plus deterministic regression coverage establishes this scoped
  acceptance result, not repeatability across models, prompts or arbitrary CVs.
  Raw Ollama omissions still occur; backend recovery now safely covers this
  explicit recognized OR omission without inflating the required AND score.

## P6.7 — Bounded AND component evidence recovery

2026-11-05: **PASS — focused synthetic regressions and one scoped local live smoke.**
This implements component-level recovery, not a numerical fit prediction or private
CV acceptance. No private CV/job content or development database was accessed.

### Root cause and implementation

`JobMatchService.analyze` supplies saved CV text to the existing prompt/schema;
`validateMatchAssessment` verifies source selections before `scoreCvMatch` merges
canonical parents and evaluates coverage. Before P6.7, `evaluateCoverage` could
recover technical OR alternatives and bounded education evidence, but no omitted
AND component. Valid empty model selections therefore produced 0/5 even with
explicit design statements in the supplied text. Selected design evidence already
worked; canonical parent weighting/proportional scoring was not the defect.
This is a confirmed backend recovery gap. The actual private model response was
not inspected or regenerated, and implementation-only experience may also fail the
existing designing-context requirement.

P6.7 adds a separate design-component registry inside the same coverage module:
APIs, CI/CD practices, integrations, data flows and cloud-based architectures.
Each missing component independently searches original CV passages for its own
validated term plus positive design context and existing support checks. The
existing rejected-parent flag gates this search. The technical OR alias registry,
education recovery, model prompt/schema, denominator and recommendation policy
are unchanged. No generic repository, requirement AST, migration or dependency.

Exact P6.7 files changed/added; earlier unrelated work preserved:

- `apps/api/src/matching/cv-match.coverage.ts`: bounded per-component design AND
  recovery; positional eligibility argument renamed internally from OR-specific
  wording to `allowRecovery`, with the same rejection gate.
- `apps/api/test/unit/cv-match.and-recovery.spec.ts`: new independent-component,
  design/alias/context, negative/conflict, invalid evidence, full-JD aggregate and
  sanitized live-response replay regressions.
- `apps/api/test/unit/cv-match.or-recovery.spec.ts`: updates the historical AND
  non-recovery assertion to approved independent recovery; its partial example
  now uses only one actually supported source component. OR expectations unchanged.
- `apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts`: omitted strong
  architecture-design evidence now expects Partial 60%; other lifecycle,
  education and architecture-context expectations remain.
- `docs/audits/fixtures/p67-synthetic-and-match.json`: retained single synthetic
  live request inputs, untouched model response, sanitized completion metrics and
  result. No configuration, credentials or private content.
- `docs/architecture.md`: recovery scope and invariants.
- `docs/audits/p6-match-correctness.md`: this appended report.

### Before/after component coverage

| Synthetic evidence with empty model selections                                                                 | Before                               | P6.7                                                                                      |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| `Designed REST APIs.` only                                                                                     | Unknown, 0/5                         | **Partial, 1/5, 20%**; APIs only                                                          |
| `Designed GitLab CI/CD pipelines.` only                                                                        | Unknown, 0/5                         | **Partial, 1/5, 20%**; CI/CD only                                                         |
| `Designed service integrations using RabbitMQ.` only                                                           | Unknown, 0/5                         | **Partial, 1/5, 20%**; integrations only, not data flows                                  |
| All three passages above                                                                                       | Unknown, 0/5                         | **Partial, 3/5, 60 / Consider** for the isolated required parent                          |
| Same three plus explicit cloud-architecture and data-flow design passages                                      | Unknown, 0/5                         | **Matched, 5/5, 100 / Apply**, after five independent term/context checks                 |
| Any one of those five passages removed                                                                         | Unknown, 0/5                         | **Partial, 4/5, 80 / Consider**; required partial still blocks Apply                      |
| AWS / RabbitMQ / technology lists without design context                                                       | Unknown                              | **Unknown**, no inference of cloud architecture, integrations or data flows               |
| Full public P5.5 JD, synthetic degree/six-year experience plus the three design passages, all selections empty | 17; Matched 2, Partial 0, Unknown 13 | **22; Matched 2, Partial 1, Unknown 12**; only the architecture parent's coverage changes |

These are synthetic fixture outcomes. The privately observed 17/100 result is
not guaranteed to change to 22: actual source wording and requirements were not
read in this checkpoint. In particular, REST API or GitLab implementation/use
without explicit designing evidence does not automatically prove design experience.

### Exact evidence and safeguards

- Restricted to parsed **AND / design** groups and the five named components.
  Knowledge-only, generic experience, unrecognized and ambiguous compounds gain
  no new recovery. This does not award keyword credit across every AND list.
- Each original passage must independently name the component (or a bounded
  equivalent) and contain `designed`, `architected`, `design experience` or
  `experience designing`, then pass the existing shared support checks.
  API/application-programming-interface wording and explicit CI/CD pipeline or
  practice wording are supported. Integration nouns and data-flow statements
  must be explicit; the broker name does not establish either qualification.
- Original contiguous sentence/line passages, up to **2,000 characters**, are
  returned verbatim for component evidence. Source quotations are never composed,
  paraphrased or attributed to fabricated model selections. Raw model responses
  remain unchanged. No cross-line borrowing of a design verb was added.
- Negation/aspiration checks and recovery-specific future/counterfactual,
  incomplete/pending/planned/draft, documentation/tutorial and coding-tool vetoes
  prevent those passages earning new recovery credit. Positive/negative assertions
  for a component yield **Conflict**, zero parent credit, with both source quotes.
- `cvEvidenceUnverified` disables recovery for a rejected canonical parent.
  Fabricated component CV/JD evidence still fails typed validation before scoring;
  an actual design passage elsewhere cannot rescue a fabricated parent quotation.
- Each parent retains one total weight: required 3, preferred 1. Credit remains
  supported component count / total component count. A single supported component
  stays Partial; every required non-full parent prevents Apply. No extra model row
  changes the denominator.

### Verification

- **PASS — 202 tests / 10 focused backend suites** before live inference:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match|job-match.regression|match-evidence-validation|discovered-match'`.
  Covers unchanged P2 scores/recommendations, MCP OR capture/recovery, education
  recovery, compound proportional scoring and evidence failures.
- After retaining the live capture and adding its replay plus the full-JD
  aggregate regression, only the affected suite was rerun:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns '^.*cv-match.and-recovery.spec'`
  — **PASS, 34 tests**. Combined coverage is **204 distinct tests across 10
  suites**; production code did not change after the live run.
- **PASS:** `pnpm --filter @ai-job-hunter/api typecheck` on the final code/tests.
- **PASS:** scoped ESLint with zero warnings on the coverage source and three
  changed test files; scoped Prettier on all seven changed/added files.
- **PASS:** `git diff --check` and individual no-index whitespace checks for
  new/untracked checkpoint files. Pre-existing unrelated contents hash-checked.
- No broad suites, frontend/browser tests, database integration or migrations.
  No frontend changes, private data reads, database writes, commit, push or PR.

### One live compatibility request

**PASS — 9,209 ms** through the actual `JobMatchService` → `AiService` → local
`OllamaProvider` with synthetic read-only in-memory CV/job adapters. Zero database
connections/writes. Same existing local configuration; model **qwen3:4b**,
Ollama **0.40.10**, pinned model digest/context/allocation checks passed.

Synthetic CV: the three explicit design passages above plus `Built MCP servers.`
Required JD: the full five-component architecture clause; preferred JD:
`MCP or knowledge graphs.` Result:

- p1 architecture **Partial / 0.6**, with exact source quotes for APIs c2,
  integrations c3 and CI/CD c5. Cloud architecture c1 and data flows c4 remain
  Not evidenced. Three components were not promoted to full parent coverage.
- p2 preferred OR **Matched / 1**, with `Built MCP servers.` from the unchanged
  P6.4 recovery path. Knowledge graphs remains Not evidenced.
- **70 / Consider**, round(100 × (3 × 0.6 + 1) / 4).

Normal measurement pass: **2,960 ms**, 842 prompt tokens / 1 output token,
expected `done_reason: length`. Final generation: **6,205 ms**, 842 prompt /
407 output tokens, `done: true`, `done_reason: stop`, output budget **4,096**,
context **8,192**. Schema, parent/component identifiers and source evidence
validated. No timeout, context/output-budget, completion or validation failure.
Exactly one matching/provider invocation with its normal preflight/final passes;
no retry, repair or second live request. Temporary runner removed.

The live model selected all three valid AND component passages and left MCP empty.
Thus live execution proves prompt/schema compatibility and correct partial scoring;
**deterministic empty-selection tests prove the new AND recovery behavior**.
The raw live response is retained and replayed without edits. No claim is made
that this live run itself reproduced an AND omission.

### Remaining limitations

Recovery is intentionally limited to explicit design statements for the five named
components. Implementation-only experience, unfamiliar wording, other competencies,
split design/object lines or ambiguous context may remain Unknown. Lexical checks
are not universal entailment or actor/project/coreference resolution. Contradictions
across historical projects can require review; conservative vetoes can cause false
negatives. Selected model semantic links retain their existing validation policy;
this checkpoint adds bounded recovery rather than a universal semantic verifier.

The synthetic acceptance criteria pass. Private-user acceptance remains unverified;
no private CV was opened or reanalyzed, and no particular private score is promised.

Stop for review before further work or any commit/push/PR.
