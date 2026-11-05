# P6 remaining evidence gaps — diagnosis only

## Scope and evidence limits

Synthetic evidence only; no saved private CV/job queries, private source files,
private diagnostics, database access, live application mutation or production code
changes. The existing dirty working tree is preserved. Temporary diagnostics use
an isolated compiled API whose complete `src` tree was compared with the current
repository using `diff -qr` (no differences). Scores below are isolated one-parent
synthetic scores, not predictions for the user's real jobs.

## A. AI-assisted development: first failing stage

Requirement: **Familiarity with or interest in AI-assisted development tools, code
generation, and automation workflows**.

`canonicalRequirements` retains one skill parent. In
`apps/api/src/matching/cv-match.coverage.ts:176`, `requirementGroup` sees both `or`
and `and` and returns mode `UNKNOWN`, context `skill`, with one component containing
the entire sentence. This occurs before model selection. It is neither a working
AND nor a working OR decomposition. The full sentence, including “familiarity”
and “interest”, is subsequently used as a literal all-word component predicate.
At lines 803–805, UNKNOWN mode always receives zero credit even if its component
has supporting evidence. This is a conservative unsupported-grammar fallback,
not evidence that the person lacks AI-tool familiarity.

The sentence expresses a broader familiarity-or-interest qualification with a
coordinated activity scope. Its `or` relates familiarity to interest; it must not
be flattened into an OR of disconnected words or into mandatory experience with
every listed activity. Whether the activity list is exhaustive should be confirmed
from surrounding JD context before changing policy. The supplied sentence alone
does not justify an experience requirement for all three activities.

Secondary barriers exist: no scoped recovery/aliases link Claude or ChatGPT
activity to this full component, the shared `uncertain` guard rejects `interested`,
and the model prompt globally calls aspiration unsupported despite this JD
explicitly accepting interest. Simply changing UNKNOWN to SINGLE or OR would
therefore be an incomplete and potentially unsafe correction.

### Controlled synthetic traces (exact evidence)

Every source below is available in the passage enumeration and resolves exactly;
there are zero unverified quotes. Both full parent and component quote assignments
were supplied deliberately to isolate qualification from model selection.

| ID               | Exact synthetic evidence                                                                                                                               | Evidence interpretation / review expectation                                                                  | Actual current result                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ai_use           | `Used Claude and ChatGPT for refactoring, prototyping and technical documentation in professional development workflows.`                              | Strong evidence of development-tool familiarity; should be assessable without inventing all listed activities | Unknown, component Unknown, score 0                                            |
| ai_documentation | `Used ChatGPT for technical documentation.`                                                                                                            | Tool use is evidenced; development/code-generation/automation scope remains unclear                           | Unknown, 0                                                                     |
| ai_tools         | `Tools: Claude, ChatGPT`                                                                                                                               | Bare names do not establish the relevant workflow                                                             | Unknown, 0                                                                     |
| ai_interest      | `I am interested in AI-assisted development tools, code generation, and automation workflows.`                                                         | Explicitly addresses the JD's interest alternative; must not become professional experience                   | Unknown, 0                                                                     |
| ai_denial        | `I have never used AI-assisted development tools, code generation, and automation workflows.`                                                          | No affirmative familiarity/use evidence; denial alone need not prove no interest                              | Unknown, 0                                                                     |
| ai_exhaustive    | `Used AI-assisted development tools for code generation and automation workflows; gained familiarity with these tools and confirmed interest in them.` | Explicit substantive activity evidence                                                                        | Unknown, 0                                                                     |
| ai_verbatim      | `Experience and familiarity with or interest in AI-assisted development tools, code generation, and automation workflows.`                             | Artificial lexical/aggregation control, not a realistic CV recommendation                                     | Component Matched with exact quote, but parent Unknown, 0 because mode UNKNOWN |

### Real local Ollama sample

Command: `node /tmp/p6-remaining-gaps.mjs live` (temporary synthetic-only diagnostic).
Real `JobMatchService.analyze` → `AiService.generateStructured` → unchanged
`OllamaProvider`, local `qwen3:4b`, 120-second configured timeout and normal provider
preflight/schema/budget checks. Three sequential calls; no mocked provider success.
Inputs were explicitly supplied synthetic saved-parsed strings in in-memory source
stores. This run does not claim PDF parser acceptance, HTTP/browser acceptance or
real-job acceptance.

| Synthetic input                                                                     | Available passage choices | Provider | Nonempty parent/component selections | Resolution             | Parent result |
| ----------------------------------------------------------------------------------- | ------------------------- | -------- | ------------------------------------ | ---------------------- | ------------- |
| `Skills: Java, Spring Boot` followed by ai_use                                      | 5                         | Success  | 0                                    | 0 rejected             | Unknown, 0    |
| Separate Skills / Professional Experience headings followed by the identical ai_use | 15                        | Success  | 0                                    | 0 rejected             | Unknown, 0    |
| ai_interest                                                                         | 2                         | Success  | 2                                    | 2 resolved, 0 rejected | Unknown, 0    |

The ai_use passage is an exact available choice in both heading variants. The
model omitted evidence in both. That is an additional selection limitation, but
the controlled exact-quote traces prove that better selection alone cannot fix
this requirement. For interest, the provider actually selected the correct original
passage and it still failed downstream. The first structural blocker is requirement
interpretation; no quote-resolution loss or score arithmetic defect was observed.

Existing Axon tooling tests cover a **different** sentence: “Experience evaluating
and integrating AI-assisted development tools into engineering workflows”. That
legitimately models two explicit AND activities. Passing those tests does not
validate this familiarity-or-interest sentence.

## B. SQL Server proficiency: policy and presentation

Requirement: **Thành thạo ít nhất một hệ quản trị cơ sở dữ liệu: MySQL, Oracle OR SQL Server**.

This parses correctly as one proficiency OR parent with three alternatives, not
three mandatory databases. Original source choices and exact resolution work.
Ordinary work is first excluded from qualification credit by
`supportsDatabaseProficiency`, then retained separately by `databaseObservations`.
The final service/API result preserves `coverage.components[].observations` and
`qualificationReason`, plus the parent `coverage.reason`. Existing mocked service
regressions exercise that boundary. This is deliberate separation of observations
from qualification-support quotes, not accidental component aggregation loss.

| Exact synthetic evidence                                                                    | Actual current result and retained evidence                                                | Expected under current policy                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `Databases: PostgreSQL, MySQL, SQL Server and Oracle`                                       | Unknown, 0; exact mention for each listed alternative                                      | Correct: names alone do not establish proficiency                                             |
| `Developed enterprise features using SQL Server.`                                           | Unknown, 0; exact SQL Server experience observation                                        | Correct: use is not proof of proficiency                                                      |
| Previous work sentence followed by `Optimized data-access logic and MyBatis queries.`       | Unknown, 0; SQL Server work retained; generic MyBatis bullet is not assigned to a database | Correct: no inferred database ownership or qualification upgrade                              |
| `Proficient in SQL Server.`                                                                 | Matched, 100; exact support quote, one supported OR alternative                            | Correct: explicit level declaration                                                           |
| `Thành thạo SQL Server.`                                                                    | Matched, 100; exact support quote                                                          | Correct: supported Vietnamese declaration                                                     |
| `Administered production SQL Server databases with query tuning, indexing and replication.` | Matched, 100; exact support quote                                                          | Correct under the existing narrowly demonstrated-proficiency rule                             |
| `I have never used SQL Server.`                                                             | Unknown, 0; no positive observation                                                        | Correct                                                                                       |
| SQL Server work sentence plus `I have never used SQL Server.`                               | Conflict, 0; exact work and denial                                                         | Correct: contradictory use claims                                                             |
| SQL Server work sentence plus `I am not proficient in SQL Server.`                          | Unknown, 0; work retained, no fabricated use conflict                                      | Correct: use does not contradict lack of proficiency                                          |
| `Phát triển tính năng doanh nghiệp sử dụng SQL Server.`                                     | Unknown, 0; exact mention only                                                             | Demonstrates an English-only applied-work observation pattern; does not establish proficiency |

All original observation quotes were verified as exact source substrings. Positive
proficiency can also recover from empty selection. Ordinary work remains Unknown
with empty or full selected quotes, while its observation is retained. Thus this
synthetic SQL outcome does not depend on the model choosing the work passage.

### Frontend presentation boundary

`apps/web/src/features/inbox/cv-match.types.ts` has no observation or component
qualification-reason fields. `CvMatchPanel` runtime validation tolerates them, but
its requirement renderer only reads `cvQuote` and `conflictingQuotes`. Because
unqualified work intentionally leaves `component.cvQuote` empty, the renderer
shows “Not evidenced in CV”. It does render the parent coverage reason, which can
say SQL Server project experience is evidenced, while hiding the actual work quote.
The 0/3 count is valid for **proficiency-supported alternatives**, but the current
copy and missing observation evidence make it easy to interpret as absent skill.

A temporary synthetic Vitest diagnostic supplies an API-shaped result containing
one exact experience observation, opens the requirement, and checks the existing
behavior: 0/3 supported, parent reason visible, work quote and component reason
absent, and four “Not evidenced in CV” messages (parent plus three alternatives).
The diagnostic is removed after execution; a copy remains in `/tmp` only.

## C. Cross-cutting findings and smallest proposed corrections

No shared single root cause is demonstrated. Both cases expose the distinction
between valid source provenance and qualification entailment, but at different
stages. A general recovery matcher would not fix UNKNOWN grammar or missing UI
observation rendering and is not justified by these findings.

- AI case: narrowly recognize the familiarity-or-interest predicate and its
  activity scope, with evidence-grounded qualification for actual tool use or
  explicitly scoped interest. Preserve bare-name and negation controls and avoid
  treating interest as professional experience. Reconcile prompt instructions and
  deterministic qualification; do not globally weaken aspiration handling or
  change the existing evaluation-AND-integration family. A scoped recovery may
  help omitted selection only after that semantic boundary is defined.
- SQL case: retain current score/policy for the supplied ordinary-use pattern.
  Expose and validate the existing observation fields in the browser and render
  their exact quotes with “experience evidenced; proficiency unverified”. Label
  the count as qualified support. No proficiency upgrade is justified by the
  supplied evidence pattern.
- Exact terminology and English-only applied-work patterns are confirmed bounded
  limitations. The synthetic Vietnamese sentence demonstrates observation-level
  under-classification. No evidence shows that it caused these specific private
  results. Do not broaden language policies speculatively.
- Heading formatting is not the demonstrated cause here: both AI-use variants
  fail at the same structural boundary. Context/attribution boundaries remain
  important safeguards; no context-boundary loss was observed in these short
  synthetic cases. No P6 weight or aggregation formula change is proposed.

## Additional evidence and verification

These findings diagnose the supplied requirement strings and synthetic patterns,
not the unread private saved records. Confident attribution of each real result
would need explicit approval for an opt-in privacy-safe diagnostic reporting the
active API/source revision, actual canonical mode/component IDs, token-presence
booleans, provider selection/resolution counts, rejection codes, observation kinds
and revision freshness. It must not print private text, prompts or model output.
For the AI policy decision, review whether the JD's activity list is illustrative
or exhaustive. For database proficiency, an accurate explicit level statement or
concrete database-specific responsibilities at the requested level would be needed;
the user must not add an unsupported claim merely to satisfy the matcher.

PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='axon-score-trace|cv-match.axon-coverage|cv-match.sql-server-evidence|cv-match.vietnamese-database-or|match-evidence-validation'`: **5 suites, 87 tests**.

PASS — `pnpm --filter @ai-job-hunter/web exec vitest run test/p6-observation-diagnostic.test.tsx test/cv-match.test.tsx`: **2 files, 18 tests**. The temporary diagnostic confirmed hidden observation quotes and was removed afterward; its synthetic source remains at `/tmp/p6-observation-diagnostic.test.tsx`. This was a component test, not a browser smoke or live API acceptance test.

PASS — temporary output assertions verified all **17 controlled traces** and **3 live results**, including candidate availability, exact resolution and expected current-policy statuses.

Verification exception: the initial command `pnpm --filter @ai-job-hunter/web test -- test/p6-observation-diagnostic.test.tsx test/cv-match.test.tsx` did not apply its file filters and accidentally ran the web suite. Actual result: 31 files passed, 2 failed, 2 skipped; 358 tests passed, 3 failed, 7 skipped. Two failures were existing viewport assertions in `job-viewport.test.tsx`, whose cause was not investigated. The third was the temporary diagnostic's overly exact score label query (the real label includes “(heuristic)”). Only that diagnostic query was corrected before the successful scoped rerun; no product assertions or code were changed. This accidental broader run is not reported as CI parity.

Only this diagnosis document remains newly changed by this checkpoint. The initial tracked-diff SHA-256 remains identical after investigation, confirming no tracked working-tree edits; temporary frontend diagnostic was removed. No production implementation, full CI gate, commit, push or PR. Stop for review before any correction.
