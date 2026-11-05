# P6.8 — Browser versus synthetic AND recovery

Date: 2026-11-05. Branch: `fix/p6-match-semantics`.
**P6.8 historical diagnosis below; approved P6.9 implementation is appended.**
P6.8 performed no production changes, restart, rebuild or model request. The
standalone probe now uses the P6.9 expected results documented in the final section.

## Conclusion

The configured API is running the P6.7 build, and the supplied analysis revisions
match current saved metadata at the service's millisecond precision. The confirmed
blocking condition for the expected API/CI-CD credit is **design context**:
API and CI/CD terms exist in the saved parse, but their passages contain none of
the design phrases accepted by P6.7. A CI/CD passage contains the optimization
verb identified by the user. Optimizing an existing pipeline is not accepted by
the current design predicate, whether the model selects that passage or omits it.

The P6.7 synthetic fixture explicitly asserted design of APIs, integrations and
pipelines. Its 3/5 result therefore exercised different evidence wording. This is
a confirmed fixture/context-policy mismatch, not evidence that technology names
should satisfy cloud, integration or data-flow design. Whether optimization should
satisfy the CI/CD qualification is a product-policy decision, not a reload fix.

## Running API and loaded-code path

Read-only process, filesystem and artifact checks found:

- Listener `127.0.0.1:3000`: **PID 17580**, parent **17436** (`tsc-watch`).
  Both working directories are the requested repository's `apps/api`.
- Parent command: `tsc-watch -p tsconfig.json --onSuccess "node --env-file-if-exists=../../.env --enable-source-maps dist/main.js"`.
  Child command: `node --env-file-if-exists=../../.env --enable-source-maps dist/main.js`.
  This is compiled JavaScript watch mode, not direct execution of TypeScript.
- API process start: **11:41:43.324 UTC+7**. Matching coverage emission:
  **11:41:43.255 UTC+7**. `cv-match.js` and `job-match.service.js` were also
  emitted before the child started. Source coverage last changed at 11:33:32.
- Start timing was calculated from process ticks and CLOCK_BOOTTIME/realtime;
  the integer `/proc/stat` boot timestamp alone loses a fractional second and
  initially makes emission/start ordering misleading. Precise ordering confirms
  emitted matching code preceded this process.
- `apps/api/dist/matching/cv-match.coverage.js`, `cv-match.js` and
  `job-match.service.js` each match their P6.7 `.test-dist/src/matching` counterpart
  **byte-for-byte**. Coverage SHA-256:
  `dc8a2bbb969503190a57f176426d7db2b5ef9120bb69db2f709e11c96d1a0183`.
- The compiled import/call chain includes `recoverAndDesign`, `andDesignTerms`,
  `evaluateCoverage(..., !item.cvEvidenceUnverified)` and the AND recovery call.
  The disk artifact was exercised separately by the synthetic probe below.
- Vite listens on 5173 and its configured `/api` proxy targets the same local
  port 3000. PID 17580 remained the listener throughout diagnosis.

These checks establish the normal running entry/import path uses the emitted
P6.7 implementation. No debugger, heap inspection, inspector activation or process
instrumentation was used. There is no evidence supporting a service restart, and
none was performed. Merely rereading the TypeScript source was not used as proof
of reload.

## Actual response and revisions

The connected Playwright context contained only `about:blank`, not the user's
application tab. No new browser analysis was triggered. The user supplied their
response directly after a request for sanitized metadata. Although that reply
included quotations, **none of its private CV quotations was copied into files,
logs, synthetic fixtures or this report**. Only metadata, public JD labels,
statuses and credit values are used here.

The supplied body is a complete success-shaped match result: score 17, Low Fit,
15 canonical parents, education and generic duration evidenced, architecture p6
AND at zero credit with five Not evidenced components. It contains:

| Metadata       | Supplied result                                   | Current read-only check                                                                                     |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `analyzedAt`   | **11:47:36.901 UTC+7**, after current API startup | Existing response supplied by user; no new model call                                                       |
| `cvUpdatedAt`  | **10:57:54.950 UTC+7** (`03:57:54.950Z`)          | Live GET `/api/v1/opportunities/cv/current`: HTTP 200, `Cache-Control: no-store`, same revision             |
| `jobUpdatedAt` | **10:19:35.373 UTC+7** (`03:19:35.373Z`)          | One configured local-owner AI Solution Architect title candidate; revision matches at millisecond precision |

The matching POST's actual HTTP status was not supplied, so a directly witnessed
HTTP 200 is not claimed. Its valid result body and new timestamp support that a
new result was returned; there is no indication here of an error envelope or an
old pre-restart result. The current CV/job metadata comparisons provide no stale
revision evidence. PostgreSQL retains sub-millisecond job timestamp precision:
an exact database timestamp comparison initially differed, while the comparison
at Node Date / `getTime()` precision matches. That is not a stale job revision.

Relevant lifecycle remains `JobMatchService.analyze` reading saved text afresh,
then checking latest CV/job revision timestamps before returning a result.
`CvMatchPanel.analyze` replaces results on valid success; errors retain the previous
result with an explicit notice. The user's original network event was not captured
independently, and the result still does not expose its raw proposals/internal flags.

## Authorized boolean-only wording checks

The user explicitly authorized server-side read-only wording checks. SQL returned
only counts/booleans and revision metadata; no CV source passage left PostgreSQL.
The configured development identity was validated; connection and transaction
were read-only. The query split source into sentence/newline/semicolon passages,
matching the production scope, and compared the bounded English term/design
patterns. These are diagnostic predicates, not in-process tracing of the request.

| Saved-parse check                                                                       | Count / result                                                          |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| API term passages                                                                       | **1**                                                                   |
| API passages with P6.7 design phrase                                                    | **0**                                                                   |
| API passages with existing selected-evidence design context (also allowing `designing`) | **0**                                                                   |
| API passages with the checked past implementation verbs                                 | **0** — no actual implementation sentence is inferred from this absence |
| API passages with standalone `designing` or `design`                                    | **0 / 0**                                                               |
| Literal CI/CD passages                                                                  | **4**                                                                   |
| CI/CD pipeline/practice passages matching the recovery term pattern                     | **1**                                                                   |
| CI/CD pipeline/practice passages with P6.7 design phrase                                | **0**                                                                   |
| CI/CD passages with existing selected-evidence design context                           | **0**                                                                   |
| CI/CD passages with `optimized` / `optimised`                                           | **1**                                                                   |
| P6.7 design phrase present somewhere else in the CV                                     | **true**                                                                |

The last row matters: recovery requires term and design context in the same
passage. A design verb in unrelated CV text is not borrowed to satisfy APIs or
CI/CD. No full CV text, filename, university or additional private wording was
retrieved or reconstructed. Cloud/integration/data-flow source statements were
not inspected by these narrowly authorized checks.

## Recovery gates: eligibility, omission and rejection

| Gate                                | Finding for the supplied architecture parent                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical parent/category           | p6 is the expected public required skill clause; no unexpected splitting or priority change                                                                  |
| Group                               | `requirementGroup` produces **AND / design**, with the same five component labels shown in the response                                                      |
| Registry eligibility                | **All five labels eligible**: cloud-based architectures, APIs, integrations, data flows, CI/CD practices                                                     |
| Source support: APIs                | Term present, design-context count zero: fails both selected semantic support and omitted-design recovery                                                    |
| Source support: CI/CD               | Pipeline term present, design-context count zero; optimization wording alone does not pass                                                                   |
| Cloud/integration/data-flow support | Response says Not evidenced; exact private source predicates were not inspected. AWS/RabbitMQ alone do not establish these qualifications                    |
| Recovery entry                      | `scoreCvMatch` evaluates every canonical parent. Actual `recoverAndDesign` entry also depends on `!cvEvidenceUnverified`; that internal flag is not returned |
| Rejection                           | No hard validation error is present in the supplied success-shaped body. The raw model selections and any per-parent downgrade flag were not captured        |

`cv-match.coverage.ts`, `recoverAndDesign`, requires a recognized design component,
an original passage no longer than 2,000 characters and one of `designed`,
`architected`, `design experience` or `experience designing`, followed by the
existing `supports` checks and recovery vetoes. `Optimized` is not accepted.
`supports` itself also withholds design credit for optimization-only wording.

A final empty quote **does not prove a raw model omission**: it can reflect an
empty selection or a source-valid selection that fails semantic context. Invalid
JSON/schema or fabricated component evidence instead fails analysis with a typed
error; invalid parent evidence can be downgraded in permitted cases, retaining an
internal rejection marker that disables recovery. The success response strips
that marker. For this public architecture clause, the AI-production tooling guard
does not apply, and normal schema quote enums are source-backed; nothing observed
suggests rejection as the cause. It is not necessary to assume a raw omission or
rejection to explain the two expected credits: the confirmed source-context gate
already fails even when recovery is enabled.

## Synthetic reproduction against the current compiled build

Run `node docs/audits/p6-runtime-discrepancy.probe.mjs`. The probe imports the same
`apps/api/dist` coverage/validation/scoring modules referenced by the running
process. It uses the public golden JD and invented CV text only; it does not
connect to the server, database or Ollama or load environment configuration.
Model selections are controlled proposals, not claimed captures.

| Synthetic case                                                               | Actual isolated architecture result                                                 |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Designed GitLab CI/CD pipelines, selection omitted                           | **Partial 1/5, 20**, CI/CD supported                                                |
| Optimized GitLab CI/CD pipelines, selection omitted                          | **Unknown 0/5, 0**                                                                  |
| Same optimization-only passage selected verbatim and source-valid            | **Unknown 0/5, 0**, **not rejected**: semantic design context fails                 |
| REST API / microservices / RabbitMQ / CI/CD keyword list                     | **Unknown 0/5, 0**                                                                  |
| Hypothetical developed-API implementation sentence                           | **Unknown 0/5, 0**; not a claim about actual private wording                        |
| Designed REST APIs, selection omitted                                        | **Partial 1/5, 20**, API supported                                                  |
| Designed API plus optimized pipeline                                         | **Partial 1/5, 20**, pipeline receives no inferred design credit                    |
| Designed AWS deployments and RabbitMQ queues                                 | **Unknown 0/5, 0**, no inferred architecture/integration/data-flow credit           |
| Three explicit API/integration/pipeline design statements from P6.7 scenario | **Partial 3/5, 60**                                                                 |
| Fabricated parent proposal plus independent valid Python evidence            | Parent rejection flag is true; otherwise valid API design recovery remains disabled |

All ten assertions pass. They distinguish a valid omission, a valid but
semantically insufficient selection, and rejected evidence. They also reproduce
the wording-dependent difference without any private CV text or new model run.

## Confirmed cause, uncertainty and smallest next action

**Confirmed:** current runtime/artifact path is P6.7; the supplied analysis is
newer than that runtime; CV and job revisions match current metadata; all five
architecture component labels are eligible; the actual API/CI-CD passages fail
the scoped design-context predicate, with optimization wording confirmed for CI/CD.
The P6.7 fixture asserted design, while the observed source feature checks do not.
No application code defect against P6.7's explicitly design-only policy is proved.

**Unverified:** original POST HTTP status/network event, raw model proposals and
internal rejection marker; exact private predicates for the other three components;
finer semantic intent beyond the authorized counts. No debugger or private-text
inspection was used to turn these unknowns into assumptions.

**Smallest recommended next action:** settle whether explicit optimization of an
existing CI/CD pipeline satisfies this JD's CI/CD-practices component. If approved,
implement a narrow **CI/CD-specific experience equivalence** with positive-context,
negation/conflict and proportional-credit tests. Do not globally equate optimizing
with designing, infer API/cloud/integration/data-flow design, or force a 3/5 match.
If the requirement must remain strictly original design experience, keep the
matching policy and clarify the missing-context explanation. Any added CV claim
must reflect genuine work; inserting the word “designed” is not a valid workaround.

A restart, another Ollama request, migration or broad alias expansion is not
justified by the evidence collected. No production correction was made.

## Verification and preservation

- **PASS:** 10 standalone synthetic diagnostic cases against current `dist`.
- **PASS:** scoped ESLint (`--max-warnings 0`), Prettier and whitespace checks on
  the new probe/report; existing P6.7 suites were not rerun against unchanged code.
- Running listener PID and all pre-existing changed/untracked repository file
  contents were checked as preserved. No rebuild, watch restart, production edit,
  new dependency, frontend change, database write, commit, push or PR.
- Read-only operations: process/build metadata, CV metadata GET, and explicitly
  authorized server-side boolean/count checks plus job revision metadata.
  No private CV plaintext was selected into the diagnostic process, printed,
  logged or copied. User-supplied private quotations were not saved or repeated.
- Changed files: this report and
  `docs/audits/p6-runtime-discrepancy.probe.mjs` only.

## P6.9 — Narrow CI/CD practice evidence semantics

2026-11-05: **Implemented and verified with synthetic data only.** This explicitly
changes the P6.8 design-only CI/CD policy. It does not broaden the design criteria
for cloud architectures, APIs, integrations or data flows.

### Changed files and exact rule

- `apps/api/src/matching/cv-match.coverage.ts`: a predicate only for the
  **`CI/CD practices` component of an AND / design group**, used by selected
  semantic evidence and omitted-evidence recovery. Applied-work verbs and
  pipeline/automation context are checked together; other component predicates,
  the OR alias registry and education recovery retain their behavior.
- `apps/api/test/unit/cv-match.cicd-practices.spec.ts`: new positive, source-quote,
  negative, unrelated-object, contradiction, isolation, weighting, OR-scope and
  fabricated/rejected-evidence regressions. Positive and negative cases test both
  empty model selections and source-valid selected quotes.
- `apps/api/test/unit/cv-match.and-recovery.spec.ts`: the prior combined
  implementation-only negative case now isolates REST API implementation; its
  CI/CD-containing variant is explicitly covered as CI/CD-only credit in the new
  suite. Other P6.7 independent-component and partial-parent expectations remain.
- `apps/api/test/unit/cv-match.updated-cv-diagnosis.spec.ts`: the synthetic real-PDF
  case with API design plus CI/CD implementation now expects **40% / two
  components**, preserving the unsupported integration/cloud/data-flow gaps.
- `docs/audits/p6-runtime-discrepancy.probe.mjs`: updates three approved CI/CD
  expectations so the standalone compiled-code probe remains runnable; historical
  P6.8 outcomes above are preserved as the before state.
- `docs/architecture.md`: documents the CI/CD-only applied-work exception.
- `docs/audits/p6-runtime-discrepancy.md`: this implementation report.

The rule accepts original positive passages describing:

- Explicit CI/CD pipeline design, or the previously supported explicit design
  declaration of CI/CD practices.
- Implemented/configured CI/CD pipelines, including bounded modifiers such as
  automated, existing, GitLab or Jenkins.
- Optimized/optimised CI/CD pipelines, including build/test/deployment improvement
  context. A named CI/CD pipeline is sufficient explicit context; a generic tool
  name or optimization claim is not.
- Explicit experience implementing/configuring/optimizing those pipelines, and
  bounded equivalent automation forms: spelled-out continuous integration plus
  delivery/deployment pipelines, or automated build-and-test/deployment pipelines
  or workflows.

For implementation/optimization, the action must target the pipeline/automation
itself. A narrow coordinated API-and-pipeline statement is accepted for CI/CD
only; it does not establish API **design**. Using GitLab or CI/CD to deliver an
unrelated task does not satisfy this predicate. The existing exact original
sentence/line is returned unchanged for parent/component evidence navigation.

### Before and after synthetic coverage

All scores below refer to the isolated required five-component architecture
parent, unless specified. Only CI/CD eligibility changes.

| Synthetic case                                                                                 | Before P6.9                            | After P6.9                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| Optimized GitLab CI/CD pipelines, selection omitted                                            | Unknown 0/5                            | **Partial 1/5, 20%**, CI/CD only                                             |
| Same optimization passage selected verbatim                                                    | Unknown 0/5                            | **Partial 1/5, 20%**, same exact source quote                                |
| Implemented automated CI/CD pipelines                                                          | Unknown 0/5                            | **Partial 1/5, 20%**, CI/CD only                                             |
| Configured GitLab CI/CD pipelines                                                              | Unknown 0/5                            | **Partial 1/5, 20%**, CI/CD only                                             |
| Designed CI/CD pipelines                                                                       | Partial 1/5, 20%                       | **Unchanged**                                                                |
| GitLab CI/CD skill list, generic pipeline or unrelated optimization                            | Unknown                                | **Unknown**, zero credit                                                     |
| Designed REST APIs plus optimized CI/CD pipelines                                              | Partial 1/5, 20%                       | **Partial 2/5, 40%**; no integration/cloud/data-flow inference               |
| API design plus RabbitMQ service integration implementation plus CI/CD pipeline implementation | Partial 1/5, 20%                       | **Partial 2/5, 40%**; integration design still unverified                    |
| CI/CD implementation/optimization with AWS, REST API and RabbitMQ mentions                     | No CI/CD recovery under the prior rule | **CI/CD only**; the other four components stay unverified                    |
| Contradictory positive/negative CI/CD assertions                                               | Existing conflict handling             | **Conflict**, zero parent credit, original positive/negative quotes retained |
| Invalid model parent/component quotations                                                      | Typed rejection or guarded downgrade   | **Unchanged**; actual CI/CD work elsewhere cannot rescue rejected evidence   |

One supported component never becomes a full AND match: the parent remains
Partial at credit 0.2, with its original required weight 3. Required partial
coverage still blocks Apply; thresholds, preferred weight 1, denominator and
rounding are unchanged. No private overall score is predicted.

### Safeguards and isolation

Shared negation, aspiration, minimum-constraint and source checks remain. The
CI/CD predicate also rejects future/counterfactual, incomplete/pending/planned,
documentation/tutorial and unrelated-object statements. A valid source quote can
therefore remain Unknown when it fails semantic context. Explicit positive and
negative pipeline assertions produce Conflict with zero parent credit.

The same predicate is used whether evidence was model-selected or recovered, so
an omitted passage and its valid selected form produce the same coverage. The
existing parent rejection marker still blocks recovery, while fabricated CV/JD
component evidence fails typed validation. No schema/evidence-validation exception
or fabricated model output was introduced.

The exception is scoped to the AND design component, not design-context OR groups
or generic technical aliases. Dedicated tests confirm optimization-only evidence
does not change OR behavior. Existing P2 simple scores, education, MCP OR recovery,
five-independent-component full coverage, and required partial recommendations
remain passing. No source change was made to the other four design components.

### Verification

- **PASS — 248 tests / 11 focused backend suites**:
  `pnpm --filter @ai-job-hunter/api test --testPathPatterns 'cv-match|job-match.regression|match-evidence-validation|discovered-match'`.
  Includes new CI/CD cases plus P2, P6 OR/education and P6.7 regressions. API test
  TypeScript compilation passed; synthetic rejection diagnostics are expected.
- **PASS:** `pnpm --filter @ai-job-hunter/api typecheck`.
- **PASS:** scoped ESLint with zero warnings on the coverage source, three changed
  backend test files and updated standalone probe; scoped Prettier on all seven
  changed/added files; `git diff --check` and individual no-index whitespace checks.
- **PASS:** `node docs/audits/p6-runtime-discrepancy.probe.mjs` — **10 synthetic
  cases**, updated for the approved policy. Before executing it, watch-emitted
  `dist` coverage was checked byte-identical to the tested compiled module.
- An initial new test accidentally asserted behavior of the separate API component
  while testing CI/CD rejection. It was corrected to isolate CI/CD; unrelated
  production component rules were not changed to satisfy that assertion.
- Earlier unrelated file contents were hash-checked as preserved. No broad suites,
  private CV reads, database operations/writes, Ollama calls, frontend changes,
  dependencies, migrations, manual restart, commit, push or PR.

### Remaining limitations

This is bounded English applied-work matching, not general semantic entailment.
Unrecognized action synonyms, passive wording, uncommon modifiers, split-line
verb/object relationships or ambiguous statements may remain Unknown. Explicit
CI/CD practice **design** declarations retain prior support; newly accepted
implementation/optimization requires the stated pipeline/automation context.
The small equivalence set is not a general assertion that any GitLab use proves
CI/CD work or that any implementation proves architecture/design competence.

Lexical contradiction checks still need human review for historical projects and
actor/context ambiguity. The checkpoint is verified synthetically; no private
browser reanalysis or live model acceptance was performed, and no particular
private CV/JD score is claimed.

Stop for review.
