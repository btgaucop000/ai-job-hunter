# P6 SQL Server Partial absent — synthetic layout diagnosis

Diagnosis only. Accepted Axon managed-language and AI-assisted behavior is unchanged.
No private CV/files, saved job records, database or live application data were read.
No production code or repository test fixtures were changed. The diagnostic reused
an isolated compiled API whose complete source tree matches the current API source.

## Findings and confidence

Two distinct failure paths reproduce the reported Unknown + mention-only result:

1. **Stage 6, experience classification:** a line break between the development
   action/object and `using SQL Server` makes the exact resolved work passage fail
   `databaseObservations`' applied-work predicate. The work is available in parsed
   text and candidate choices, but is retained only as a mention.
2. **Stage 2/3, complete-context candidate construction:** employer + role + project
   headings followed by the work line require four contiguous source lines. The
   three-span source-choice window cannot include them all; attribution checks
   reject the shortened candidates. A manually supplied complete exact source
   passage classifies as Partial, but that passage is not a model choice or recovery
   candidate. The attribution guard is working; candidate construction cannot
   provide the context it requires.

Neither proves which path the actual private CV takes. That **first real-CV failing
stage remains unverified**. The visible stack quote alone cannot distinguish these
paths, different source wording, absent parsed work, stale sources or an older API.
No automatic Partial award is justified from that quote.

## Synthetic reproduction

Command: `node /tmp/p6-sql-layout-diagnosis.mjs` (temporary script outside repository).
Twelve generated synthetic PDFs pass through real PDF parsing,
`ExtractionService.parseCv` and `JobMatchService.saveCv` into in-memory source stores.
Each then runs real `JobMatchService.analyze`, structured schema validation, quote
validation, coverage, score and API-shaped result creation with two **mocked** model
selections: the actual parsed stack passage, or empty evidence. This is not live
Ollama acceptance and does not use the private CV. Real Ollama was unnecessary to
isolate these deterministic rejection stages.

All non-stack input lines and all four technology tokens survive parsing. Stack
separator spacing is parser-normalized by this generated PDF, so the diagnostic
selects the actual parsed source span rather than inventing a byte-identical quote.
Every nonempty selected quote resolves exactly, and every emitted observation is
an exact original parsed-text substring. All 24 analyses meet their expected current
statuses. Scores below refer to an isolated one-parent database requirement.

Shared stack: `Spring Boot · MyBatis · SQL Server · Thymeleaf`.
Requirement: `Thành thạo ít nhất một hệ quản trị cơ sở dữ liệu: MySQL, Oracle OR SQL Server`.

| Synthetic project/work layout, in addition to stack                                                                            | Actual component / parent                          | First relevant boundary                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Stack only                                                                                                                     | Unknown / Unknown, score 0; mention retained       | Correctly insufficient                                                              |
| `Project: Synthetic billing` then `Developed enterprise features using SQL Server.`                                            | Partial / Partial, 50; exact attributed experience | Recovery and classification succeed                                                 |
| `Project: Synthetic enterprise application using SQL Server.` then `Developed enterprise features for this application.`       | Unknown / Unknown, 0; mention only                 | Classification does not resolve the project-local relationship across these clauses |
| `Project: Synthetic billing` then `Developed enterprise features` then `using SQL Server.`                                     | Unknown / Unknown, 0; mention only                 | Stage 6: line boundary inside applied-work clause                                   |
| Same project heading, `Developed enterprise features using` then `SQL Server.`                                                 | Partial / Partial, 50                              | The whitespace matcher after `using` accepts this wrap                              |
| Same project heading, `Developed enterprise features using SQL` then `Server.`                                                 | Partial / Partial, 50                              | Database-name whitespace matcher accepts this wrap                                  |
| `Employer: Synthetic North`, `Role: Backend Engineer`, `Project: Synthetic billing`, then the single-line development sentence | Unknown / Unknown, 0; mention only                 | Stage 2/3: no complete attributed candidate                                         |
| Project + stack + `Optimized data-access logic and MyBatis queries.`                                                           | Unknown / Unknown, 0                               | Correctly insufficient SQL Server responsibility linkage                            |
| Project + `Designed SQL Server database schemas for a production billing application.`                                         | Matched / Matched, 100; exact attributed support   | Strong direct responsibility succeeds                                               |
| Project + `I have never developed enterprise features using SQL Server.`                                                       | Unknown / Unknown, 0                               | Negation preserved                                                                  |
| Project + `I plan to develop enterprise features using SQL Server.`                                                            | Unknown / Unknown, 0                               | Aspiration preserved                                                                |
| SQL Server project/stack, then a different PostgreSQL project with explicit PostgreSQL feature development                     | Unknown / Unknown for SQL Server, 0                | No cross-project database responsibility inference                                  |

The wrap-before-using case has 15 choices (including empty and compact variants),
including the complete three-line work passage and its compact variant. None yields
an experience observation. Passing the entire exact CV passage directly also stays
Unknown. A temporary whitespace-flattened **diagnostic copy** becomes Partial,
isolating newline sensitivity. This is not a proposed change to stored CV text or
quote resolution. Compact model choices resolve back to original newlines, so
choosing the compact string cannot fix this by itself.

The four-context-line case has 20 choices, but no complete employer/role/project/work
span. Passing the original full source directly yields Partial; empty or stack model
selection with actual bounded recovery yields Unknown. A valid model cannot choose
that complete span under the current schema enumeration.

The project-context and four-context-line cases also reproduce the **stack-only
observation** specifically, under both controlled model selections. The wrap-before-
using case retains a shorter SQL-containing mention instead; its Unknown status
matches, but its displayed mention is not the identical stack-only symptom. This
distinction further limits what can be inferred from the browser quote alone.

## Exact pipeline trace

1. **PDF parsing:** synthetic work, SQL tokens and headings remain available.
   No substantive text loss explains these reproductions. Private parser output
   has not been inspected.
2. **Project/role attribution:** recognized headers remain in source. Truncated
   snippets are rejected by `completeAttribution` at
   `apps/api/src/matching/cv-match.coverage.ts:418`, preventing borrowed ownership.
3. **Candidate generation:** `cvQuoteChoices` at
   `apps/api/src/matching/cv-match.evidence.ts:121` builds at most three adjacent
   spans with a 2,000-character limit. This conflicts with four-line attribution.
   Sentence-level recovery does not supply the missing multi-line context.
4. **Ollama selection:** not executed this checkpoint. Controlled stack and empty
   selections reproduce the same statuses. Strong source recovery succeeds for the
   original one-line positive. In the failing cases, better model selection alone
   cannot supply a missing allowed span or repair deterministic classification.
5. **Exact quote resolution:** original and whitespace-equivalent choices resolve
   to original source spans. No selected-quote rejection occurs in these traces.
6. **Classification:** `databaseObservations` at
   `apps/api/src/matching/cv-match.coverage.ts:607` requires a development verb,
   then up to 200 characters matching `[^.!?;\r\n]`, then `using|with|on` and the
   named database. A newline **before** that preposition prevents the experience
   match; whitespace **after** it or inside SQL Server is allowed. A database named
   in an earlier project clause is not interpreted as use by a later work clause.
   The professional-context predicate and exact provenance alone do not make the
   passage an experience observation.
7. **Aggregation:** when the classifier emits an experience observation, SQL Server
   and its OR parent are Partial/.5. When it emits only a mention, both remain
   Unknown/0. Strong responsibility produces Matched/1. No aggregation or weight
   arithmetic error was demonstrated.
8. **API/UI:** the controller returns the matching service result directly; there
   is no observation-stripping mapper. The current frontend validates and renders
   `observations` and `qualificationReason`. Focused UI tests show that an experience
   observation is displayed when supplied. Mention-only synthetic responses contain
   no experience for the UI to show. The actual browser response and active frontend
   build remain unverified, so this does not conclusively exclude a real deployment
   or stale-result issue.

## Why previous acceptance passed

Previous positive fixtures explicitly placed `Developed enterprise features using
SQL Server.` on one line, with at most the adjacent project heading needed for
attribution. The live synthetic acceptance used that same straightforward layout;
the browser smoke used a synthetic API result generated from it. Those checks
established that this input becomes Partial and is displayed correctly. They did
not cover a wrap before `using`, project-local clause linkage, or four consecutive
attribution/work lines. The new traces demonstrate these precise coverage gaps;
they do not establish that the private PDF has one of those layouts.

## Smallest proposed correction, not implemented

If an opt-in private diagnostic confirms the wrapped explicit-use case, make the
**database-only applied-work predicate** tolerate soft line breaks inside an already
verified, bounded, same-entry passage. Keep the original exact quote unchanged;
reapply negation, aspiration, project boundaries and professional-attribution guards.
Do not flatten the complete CV, relax provenance or infer SQL Server from MyBatis.

If it confirms the attribution-window case, construct a bounded database work
candidate that includes the necessary recognized adjacent attribution headers.
Keep the character bound and entry boundaries. Do not weaken `completeAttribution`
or change the accepted managed-language/AI-assisted policies globally.

Project-name/stack plus generic responsibility is a separate interpretation issue:
it should not be promoted merely for co-occurrence. Any later correction must
establish an explicit same-project database-use relationship and retain its exact
source context. No broadened matcher, UI change or scoring adjustment is justified
by this diagnosis alone.

To confirm the real failure, separately approved privacy-safe instrumentation would
need parsed-work-presence booleans, relevant layout/boundary flags, complete-candidate
counts, model-selection/resolution counts, classifier reason codes, returned
observation kinds, source freshness and the running build revision. No raw private
text, prompts or model responses should be printed. No such private diagnostic was
executed here.

## Verification and scope

- PASS — twelve synthetic real-PDF parses and twenty-four mocked-selection service
  analyses; exact source/resolution assertions and expected statuses verified.
- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match.sql-server-evidence|cv-match.proficiency-ai-semantics|cv-match.vietnamese-database-or|cv-quote-resolution'`: **4 suites, 89 tests**.
- PASS — `pnpm --filter @ai-job-hunter/web exec vitest run test/cv-match.proficiency.test.tsx`: **1 file, 3 tests**.
- No new production implementation, live Ollama, private-CV diagnostic, migration,
  dependencies, full CI, commit, push or PR. Only this diagnosis document is added
  in this checkpoint. Existing working-tree files are preserved. Stop for review.

## Follow-up: approved database PDF-line fix

The preceding sections record the historical diagnosis. The two confirmed gaps are
now fixed without changing the proficiency policy or accepted Axon behavior.

### Implementation and exact-source safeguards

- `apps/api/src/matching/cv-match.evidence.ts`: adds database-only semantic views
  for a single recognized preposition/database continuation. Whitespace is normalized
  only for classification. Sentence endings, semicolons, blank lines, new bullet
  markers, numbered bullets and section headings prevent joining. Quotes and stored
  CV text are not rewritten. The same file constructs exact contiguous attributed
  database spans from at most three adjacent unique employer/company, role and
  project headers plus one work line and an optional continuation: at most five
  nonempty source lines, 2,000 characters each and 20 extra candidates. Blank lines
  and duplicate header kinds stop expansion; existing attribution guards still run.
- `apps/api/src/matching/cv-match.coverage.ts`: only database-use observations use
  those semantic views. Only proficiency recovery receives the extra candidates;
  exact resolution, deduplication, shortest sufficient span, rejection suppression,
  negation, aspiration, professional context and contradiction precedence remain.
- `apps/api/src/matching/cv-match.ts` and `job-match.service.ts`: pass canonical
  requirements into schema construction. Extra quote choices enter the request's
  shared model quote allowlist only if it contains a recognized database-proficiency
  requirement. Requests without this family retain the same generic enumeration.
  Other recovery families receive no extra context window. No prompt or scoring
  formula change was needed for this checkpoint.
- New `apps/api/test/unit/cv-match.database-layout.spec.ts`: 27 synthetic regressions
  cover equivalent one-line/wrapped clauses, CRLF and bullet continuation, four-line
  attribution, combined five-line spans, selected/omitted/weak evidence, exact source
  slices, schema eligibility, candidate deduplication/count/size bounds, unrelated
  mentions/projects, hard boundaries, negation/aspiration/conflict, strong work,
  strongest-alternative OR and unchanged managed-language recovery bounds.
- Documentation: this follow-up record and `docs/architecture.md`. No frontend files
  were changed. Earlier working-tree changes are preserved.

### Before/after synthetic decisions

Temporary deterministic comparison: `node /tmp/p6-db-wrap-before-after.mjs`, using
frozen pre-fix and current compiled source with the same synthetic text and weak
stack selection. No provider call or private source access is involved.

| Synthetic evidence                                              | Before      | After                                          |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------- |
| Bare SQL Server stack                                           | Unknown, 0  | Unknown, 0                                     |
| `Developed enterprise features using SQL Server.`               | Partial, .5 | Partial, .5                                    |
| `Developed enterprise features` + newline + `using SQL Server.` | Unknown, 0  | Partial, .5; original newline preserved        |
| Employer + role + project + single work line                    | Unknown, 0  | Partial, .5; complete original four-line quote |
| Employer + role + project + wrapped work clause                 | Unknown, 0  | Partial, .5; complete original five-line quote |
| Stack plus generic MyBatis optimization                         | Unknown, 0  | Unknown, 0; no invented database relationship  |
| Direct production SQL Server schema design                      | Matched, 1  | Matched, 1                                     |

Nearby stack/project co-occurrence without an explicit action/database relationship
remains insufficient. Hard sentence/bullet/section boundaries are not soft wraps.
Contradiction overrides recovered positive work; bare names and aspiration do not
authorize Partial. Multiple Partial alternatives still yield .5, while a Matched
alternative yields 1. Required/preferred weights and rounding are unchanged.

### Real local Ollama acceptance

PASS — `node /tmp/p6-db-wrap-live.mjs`: two sequential calls using real synthetic PDF
parsing → `ExtractionService` → `JobMatchService.saveCv/analyze` → `AiService` →
unchanged local `OllamaProvider`, model `qwen3:4b`. Source repositories are in memory;
no database, private CV or private job is accessed. The current isolated source
build passed `pnpm exec tsc -p /tmp/ajh-p6-db-wrap-zy0stlmw/apps/api/tsconfig.json`.

The PDF contains a competing bare stack, then this exact source passage:

```text
Employer: Synthetic North
Role: Backend Engineer
Project: Synthetic billing
Developed enterprise features
using SQL Server.
```

Both samples: 31 model choices including one extra complete attributed span; model
selected bare stack and not the complete work quote; 2 nonempty selections resolved,
0 rejected. Server recovery returned SQL Server **Partial**, OR parent **Partial**,
credit **.5**, isolated score **50/100**, with the complete exact original five-line
quote and an experience observation. Stored newlines and attribution were retained.
Only counts, statuses and provenance booleans were output by the temporary harness.
These two samples demonstrate this recovery path, not broad provider reliability
or acceptance of the unread private CV.

### Final focused verification

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match.database-layout|cv-match.sql-server-evidence|cv-match.proficiency-ai-semantics|cv-match.vietnamese-database-or|cv-quote-resolution'`: **5 suites, 116 tests**.
- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match|cv-quote-resolution|match-evidence-validation|matching.spec|job-match.regression|discovered-match|axon-score-trace|suggestion-policy|cv-suggestions'`: **23 suites, 721 tests**, on final production/test code.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS — `pnpm exec eslint --max-warnings 0 apps/api/src/matching/cv-match.evidence.ts apps/api/src/matching/cv-match.coverage.ts apps/api/src/matching/cv-match.ts apps/api/src/matching/job-match.service.ts apps/api/test/unit/cv-match.database-layout.spec.ts`.
- Scoped formatting and whitespace checks cover these five files, this report and
  the architecture note. No frontend/browser checks were needed because the UI and
  response contract are unchanged.

Remaining uncertainty: the actual saved private CV's parsed text and layout remain
unread. More than three adjacent attribution headers, more than one continuation,
unknown entry labels, unclear project-local references or bounds beyond the capped
candidate set can conservatively remain Unknown. Observable boundaries are preserved;
no PDF layout coordinates or bullet/section recovery is inferred from absent text.
Reload the updated API and explicitly Reanalyze to retest the real CV; no particular
real-job score is promised. No new dependencies, migrations, full CI gate, commit,
push or PR. Stop for review.

## Follow-up: nominal database development responsibilities

This checkpoint uses sanitized findings and new synthetic fixtures only. The
private CV, database, saved job and browser were **not accessed again**.

### Targeted classifier change

`cv-match.coverage.ts` now recognizes three bounded responsibility forms:
“Development of …”, “Implementation of …” and “Responsible for
developing/implementing …”. Each must name a software object (features, application
functionality, services, software or systems), then explicitly relate its use to
the database through using/with/on. SQL Server can be a direct object or an item
in an explicit coordinated use list. Incidental stack co-occurrence and references
to database documentation/manuals do not establish database use. Object and use
clauses are each limited to 160 characters.

Existing professional-context and exact attribution guards still apply. Nominal
context comes from the statement or preceding recognized attribution, not another
work bullet or a later role. Existing soft-continuation rules preserve sentence,
bullet, blank-line and section boundaries. The original quote and source slice
are returned without normalization or paraphrase.

`cv-match.evidence.ts` adds these responsibility starts to the existing database-only
attributed candidate builder. Its 20-candidate / 2,000-character / five-line bounds
are unchanged. Generic passage generation and unrelated requirement families are
unchanged. Ordinary nominal database use earns existing Partial/.5 credit, never
an automatic proficiency upgrade. Existing stronger responsibility/proficiency
rules, strongest-alternative OR aggregation, canonical weights and rounding remain.

Explicit denial of the same development responsibility now participates in the
existing database work-conflict guard. A disclaimer of proficiency or database
administration is not treated as a denial of ordinary development use.

Changed files in this checkpoint:

- `apps/api/src/matching/cv-match.coverage.ts`.
- `apps/api/src/matching/cv-match.evidence.ts`.
- New `apps/api/test/unit/cv-match.database-nominal.spec.ts`.
- This implementation record and `docs/architecture.md`.

No frontend, schema contract, service orchestration or production data changes.
Prior uncommitted work is preserved.

### Synthetic before/after results

A temporary deterministic comparison (`node /tmp/p6-nominal-before-after.mjs`)
uses pre-fix and current compiled source with identical new synthetic statements,
a preceding synthetic Backend Engineer role, and weak stack selection.

| Synthetic evidence                                                                  | Before  | After                                  |
| ----------------------------------------------------------------------------------- | ------- | -------------------------------------- |
| `Development of enterprise features using SQL Server.`                              | Unknown | Partial, .5                            |
| `Implementation of database-backed application functionality with SQL Server.`      | Unknown | Partial, .5                            |
| `Responsible for developing enterprise features using SQL Server.`                  | Unknown | Partial, .5                            |
| Nominal development clause soft-wrapped before `using SQL Server.`                  | Unknown | Partial, .5; original newline retained |
| Nominal development with SQL Server in an explicit coordinated use list             | Unknown | Partial, .5                            |
| Bare technology stack / generic MyBatis optimization / negative-only responsibility | Unknown | Unknown                                |
| Existing directly attributed strong SQL Server schema design                        | Matched | Matched, 1                             |

Regressions additionally cover complete four-/five-line attribution, CRLF, bullet
continuation, incidental versus explicit relationships, uncredited documentation
references, rejected-evidence suppression, no borrowed context, negation, aspiration,
contradictory use/responsibility claims and appropriate proficiency/admin disclaimers.
Required Partial plus unknown preferred still scores 38 using unchanged 3:1 weights.
Multiple Partial alternatives still yield .5; any Matched alternative yields 1.

### Bounded real local Ollama acceptance

PASS — final-source `node /tmp/p6-db-nominal-live.mjs`: one sample through real
synthetic PDF parsing, in-memory saved-CV storage, matching orchestration and local
`qwen3:4b` using unchanged provider safeguards. No live database was used. The exact
recovered **synthetic** quote is:

```text
Employer: Synthetic North
Role: Backend Engineer
Project: Synthetic billing
Development of enterprise features
using SQL Server.
```

A separate bare stack competes with this passage. There are 31 model choices,
including one complete attributed addition. The model selected the stack, not the
complete work quote; two nonempty selections resolved exactly, none was rejected.
Deterministic recovery returned SQL Server **Partial** and parent OR **Partial**,
credit **.5**, isolated score **50/100**, an experience observation and the exact
five-line source quote. This is not a proficiency claim or real-CV acceptance.

An earlier one-sample run also passed; the final run followed the added
reference-only documentation guard. Two local synthetic generations total during
development. No broad reliability sample or private model call was performed.

### Verification and limits

Final focused command/results are recorded below. The isolated acceptance build
compiles with `pnpm exec tsc -p /tmp/ajh-p6-db-nominal-pzqz47dz/apps/api/tsconfig.json`.

This remains a bounded English responsibility grammar, not a general entailment
engine. Other nominal forms, longer clauses or context outside existing passage
bounds may remain Unknown. The real CV was not retested; explicit Reanalyze after
API reload is needed to validate that separately. No full CI gate, migration,
dependency, infrastructure, frontend work, commit, push or PR. Stop for review.

Nominal checkpoint final results:

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match|cv-quote-resolution|match-evidence-validation|matching.spec|job-match.regression|discovered-match|axon-score-trace|suggestion-policy|cv-suggestions'`: **24 suites, 762 tests**, including 41 new nominal regressions and existing database, Axon and AND/OR behavior.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS — `pnpm exec eslint --max-warnings 0 apps/api/src/matching/cv-match.coverage.ts apps/api/src/matching/cv-match.evidence.ts apps/api/test/unit/cv-match.database-nominal.spec.ts`.
- PASS — scoped Prettier checks for these three files and the two updated documents;
  `git diff --check`; new-file whitespace checks. The final isolated acceptance
  source matches the current API source. Full CI parity remains pending.
