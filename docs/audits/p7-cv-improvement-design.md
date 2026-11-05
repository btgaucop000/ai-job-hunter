# P7.1 — CV improvement suggestions: audit and MVP design

Date: 2026-11-05. Base: `305085e19955e05f04651578e56f5e34c21244d0`.
Branch: `feat/p7-cv-improvement-suggestions`.
Status: P7.1–P7.4 implemented; P7.4.1 implemented for review. P7.5 is not authorized.

## Audit scope and method

Started with a clean main, fetched origin, fast-forwarded main (already up to
date), and created the requested branch. Read AGENTS.md and UX guidelines.
Reviewed current API, frontend, parser, provider and P6 audit/final-review code
paths. Current source is authoritative where earlier P6 audit descriptions refer
to pre-fix behavior. No database, private CV, private fixture, browser session or
Ollama execution was needed. DEV-02.1 is excluded.

## Current architecture findings

Paths below are relative to repository root.

| Area                   | Current source and finding                                                                                                                                                                                                                                                                              | Reuse / limitation                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved CV               | `apps/api/src/matching/saved-cv.entity.ts`, `job-match.service.ts`: one `saved_cvs` row for `LOCAL_OWNER_ID`, containing filename, parsed text (`select: false`) and updatedAt. `saveCv` calls `ExtractionService.parseCv` and upserts only after successful parsing.                                   | Original available evidence is saved **parsed text**, not a structured CV profile or editable original file. Metadata GET does not return text.                                                                                                         |
| Parsing / structure    | `apps/api/src/extraction/extraction.service.ts`, `pdf.parser.ts`, `docx.parser.ts`: parsers produce source text plus PDF page or DOCX paragraph segments; DOCX uses Mammoth raw text.                                                                                                                   | Save discards segments, parser warnings and page metadata. Newline structure remains, but section names, role ownership and visual placement are not reliable typed fields. No page coordinates or original-document editor anchor is available.        |
| Saved-job input        | `canonicalRequirements`, `matchJobText` in `apps/api/src/matching/cv-match.ts`; `Opportunity` owns saved fields and import-review/source content.                                                                                                                                                       | Matching uses saved skill, preferred skill, experience and domain fields, with discovery-specific recovery. JD evidence can be canonical saved-field text, not a verbatim original uploaded JD passage. Label it accordingly.                           |
| Matching orchestration | `JobMatchService.analyze` reads CV/job, checks canonical requirements and 64 KiB prompt size, calls structured AI, validates evidence, rechecks revisions and scores through `MatchingService.matchSavedCv`.                                                                                            | Reuse source loading, safe failures and revision checks through owning services. Current process-local active guard protects matching, not every AI feature. No background job required.                                                                |
| Actual saved-CV result | `scoreCvMatch` returns score, recommendation, explanation, advice and requirement rows; service adds cvUpdatedAt, jobUpdatedAt, analyzedAt. Rows carry parentId, requirement, priority, category, jdQuote, cvQuote, status, credit and coverage.                                                        | This is distinct from the structured-extraction `MatchingResult` in `matching.types.ts`. Do not build P7 on that unrelated contract.                                                                                                                    |
| P6 semantics           | `cv-match.coverage.ts`, `cv-match.ts`: coverage has mode SINGLE / AND / OR / UNKNOWN, reason, credit, status and components (id, label, jdQuote, cvQuote, status, conflictingQuotes). Parent states are EVIDENCED / PARTIAL / NOT_EVIDENCED / CONFLICT.                                                 | UI labels are Matched / Partial / Unknown / Conflict / Needs review. Required weight 3, preferred 1; AND proportional, OR requires an alternative plus shared constraints; unknown/conflict zero. P7 must consume these results without modifying them. |
| Evidence validation    | `validateMatchAssessment`, `resolveCvQuote`, `cvQuoteChoices` in `cv-match.ts` / `cv-match.evidence.ts`: canonical linkage, exact JD presence, original CV passage choices, exact or unique whitespace-equivalent resolution; bounded deterministic coverage and negation checks.                       | Reuse original spans and component results. Quote provenance is not a general entailment proof. Lexical coverage is bounded, not a universal semantic validator.                                                                                        |
| Persistence            | Match assessments, raw AI output, component coverage and quotes are **not persisted**. Evidence exists in a successful response/page state; source text and saved job fields persist.                                                                                                                   | There is no existing match-result table or durable match ID to reference. Do not imply otherwise.                                                                                                                                                       |
| AI integration         | `apps/api/src/ai/ai.service.ts`, `ai.schema.ts`, `ollama.provider.ts`, `ollama.context.ts`: JSON/schema validation, bounded transport/output/time, pinned context profile and allocation checks, temperature 0. Matching uses `generateStructured`; provider preflights prompt before final generation. | Reuse AiService and existing provider/configuration. A new prompt must fit the verified budget; temperature 0 is not a safety guarantee. No model/provider infrastructure changes.                                                                      |
| Prompt convention      | `matchPrompt` treats documents as untrusted, supplies JSON, canonical parent/component IDs and schema-enumerated CV passages, preserves priorities, alternatives, duration and delivery qualifiers.                                                                                                     | Suggestions need their own selection schema/prompt; never repurpose a matching response or permit documents to become instructions.                                                                                                                     |
| API / module           | `apps/api/src/opportunities/opportunities.controller.ts`: GET/POST `/api/v1/opportunities/cv/current`, POST `/api/v1/opportunities/:id/match`; UUID validation, localWrite and no-store. `opportunities.module.ts` wires JobMatchService, SavedCv repository, AiModule and MatchingModule.              | Follow existing boundaries and local write checks. Add a matching-owned suggestions service wired alongside JobMatchService; avoid generic repositories or shared ORM contracts.                                                                        |
| UI                     | `apps/web/src/features/inbox/CvMatchPanel.tsx`, `JobEditor.tsx`: saved-job tab with CV upload, Analyze/Reanalyze, overview, strengths/gaps, requirement filters/accordions, component evidence and Application advice.                                                                                  | Document scrolling, responsive grids, existing evidence reveal/targeted focus. There is no empty reserved sidebar. Add one vertical section, not another tab or scroll owner.                                                                           |
| UI lifecycle           | Results live in CvMatchPanel state; upload success and job/form revision changes clear them; generation ref discards late match responses. Frontend currently omits parentId and source timestamps from its local MatchResult type.                                                                     | Add explicit fields/runtime checks for P7; preserve current behavior. Unsaved form revision is a UI invalidation signal, not a server source revision.                                                                                                  |

### Can a suggestion anchor to an original CV span?

Yes, to a specific range of the saved parsed text: resolve an existing verified
quote, then calculate start/end on the server. Use JavaScript UTF-16 code-unit
indices, start inclusive/end exclusive, and require
`source.slice(start, end) === quote`. Return the exact quote so the UI need not
fetch the full CV. A whitespace-equivalent model quote must resolve back to the
original text before anchoring. If a quote occurs more than once, provenance
alone cannot identify which role/section it belongs to: expose no edit target,
fall back to clarification, and do not guess an occurrence.

This is not an anchor into the original PDF/DOCX layout. MVP displays “Original
CV passage” with exact whitespace; no page number, section inference, file
highlight, automatic replacement or claim that the original document was edited.
JD anchors should identify `saved_requirement` and the parent/component quote;
do not label synthesized `matchJobText` offsets as original-document offsets.

## Recommended MVP scope and workflow

Generate on explicit request only, after a successful CV Match for a saved job.
Use the displayed, server-verified assessment as immutable input. Return up to
five actionable cards, at most one per parent, deterministically ordered:
conflicts first, then required Partial/Unknown, preferred Partial/Unknown, then
supported passages worth surfacing. Within each group use canonical parent order.
Priority is review urgency, never a forecast score increase.

Two card kinds:

- `clarify`: explain that a specific component is not evidenced or needs review;
  ask a conditional, neutral question. No copyable affirmative claim.
- `surface_evidence`: recommend making an existing supported passage more visible
  for this requirement. Show its exact original wording, optionally copied as a
  bullet using presentation-only formatting. No free-form paraphrase in MVP.

AI selects useful eligible parent/component/evidence IDs from server-built
candidates. The server owns card kind eligibility, rank, explanation templates,
clarification questions, quotes and copy text. This still provides on-demand AI
prioritization/selection, while keeping all factual wording deterministic.
A supported component of a Partial AND parent may be surfaced without claiming
the whole requirement is met; the card must name the unsupported component and
show the unchanged Partial status. An OR parent must not request every alternative
when an alternative and its shared constraints are already supported.

Users open CV Match, analyze as today, choose “Suggest CV improvements”, inspect
the requirement and exact evidence, and either copy supported original wording
or review a clarification question. They edit their CV externally, replace the
saved CV and reanalyze. No automatic CV/job writes, status changes or score changes.

### Why restrict rewritten wording?

The repository has no general deterministic entailment checker. Exact quotes,
number allowlists, a second LLM review or token overlap cannot establish that
“helped with” implies “led”, that a prototype was production work, or that facts
from separate employers can be combined. Arbitrary AI-authored affirmative
rewrites therefore cannot meet the stated guarantee with existing safeguards.

Recommendation: accept extractive wording as the first supported wording MVP.
Only add paraphrasing in a separately reviewed slice with an explicit admissible
transformation policy. If novel AI rewrites are required for the first release,
this is a scope/safety blocker to resolve before implementation; prompt-only
validation is insufficient. Human review remains necessary even for source text.

## Minimal API and lifecycle proposal

No database migration or durable suggestions persistence. Do not store suggestions
in browser localStorage, logs, analytics or the database.

There is currently no trusted assessment reference. Recommended minimal addition:
a bounded process-memory snapshot of each successful match, containing its
verified assessment, owner/job IDs, source revisions and opaque random matchId.
Return matchId additively from the existing match endpoint. Proposed policy:
15-minute TTL, maximum 20 entries process-wide, oldest eviction, latest snapshot
per owner/job; retain only assessment evidence and revisions, not another full CV.
Use native crypto randomness; no dependencies, new secret or infrastructure.
Snapshot insertion is after successful matching/revision validation. It must not
change match calculation or turn a successful match into an AI retry.

Add POST `/api/v1/opportunities/:id/cv-improvement-suggestions`, body
`{ "matchId": "opaque-server-id" }`. Validate exact body shape, size and UUID job
ID; use localWrite and Cache-Control no-store. Client-supplied statuses, scores,
quotes or CV text are not accepted as authoritative input.

The suggestions service resolves the owner/job-scoped snapshot, loads the latest
saved sources through owning services, compares revisions, builds candidates,
calls AiService once for selection, validates and renders the response, then
rechecks CV/job revisions **and snapshot identity** before returning. Share a
small admission guard for match/suggestion operations within this feature to
avoid simultaneous local generations; do not redesign global extraction queues.
No AI call if there are no eligible candidates. Ignore late responses in the UI
when matchId/job/form revision/CV changes; disable duplicate requests and relevant
upload/reanalysis actions while a suggestions request is active.

Missing/expired/evicted or stale snapshots return 409 with a safe typed code and
“Reanalyze CV Match” recovery. Invalid body 400, unknown job 404, busy 409;
provider unavailable/invalid selection 503, timeout 504. Match error contracts
remain unchanged. Errors never contain raw source text, prompts or provider output.
Refresh/server restart requires reanalysis; acceptable because current match
results are already ephemeral. This is process memory, not durable persistence.
Multiple API replicas would need a different strategy; that infrastructure is out
of scope. A signed client snapshot avoids cache but adds payload/signing/key
management; rerunning matching adds latency and can differ from the shown result.
Neither is recommended for this single-process MVP.

## Proposed response contract

Design types only; keep API DTOs in the owning module and an explicit validated
web contract. No packages/shared or ORM exposure is needed yet.

```ts
type CvImprovementResponse = {
  contractVersion: '1';
  matchId: string;
  cvUpdatedAt: string;
  jobUpdatedAt: string;
  generatedAt: string;
  suggestions: {
    id: string; // server-assigned within this response
    rank: number; // 1..5, deterministic review order
    parentId: string; // scoped to matchId; not stable across job edits
    componentIds: string[];
    requirement: string;
    priority: 'required' | 'preferred';
    status: 'EVIDENCED' | 'PARTIAL' | 'NOT_EVIDENCED' | 'CONFLICT';
    kind: 'surface_evidence' | 'clarify';
    reason: string; // server template, no model-authored factual prose
    jdEvidence: { source: 'saved_requirement'; quote: string }[];
    cvEvidence: {
      quote: string;
      start: number;
      end: number;
      role: 'support' | 'contradiction';
    }[];
    wording: string | null; // exact single original support passage only
    clarification: string | null; // server question, mutually exclusive with wording
  }[];
};
```

Empty suggestions is a successful result, not an invalid model response. Unknown
can have no CV quotes; do not manufacture a “supporting” quote for it. Conflict
cards show both positive and contradictory quotes, never wording. No confidence
percentage or improved score is returned. Model output is a separate strict
selection schema containing only candidate IDs (unique, bounded to five).

### Synthetic example

Entire synthetic saved CV text: `Built Java APIs.` (16 UTF-16 code units).
Saved required requirements: `Java` and `Kubernetes`. Suppose the successful P6
assessment has p1 Matched and p2 Unknown. Illustrative IDs/times below are synthetic;
a real response echoes the actual snapshot revisions.

```json
{
  "contractVersion": "1",
  "matchId": "synthetic-match-id",
  "cvUpdatedAt": "2026-11-05T01:00:00.000Z",
  "jobUpdatedAt": "2026-11-05T01:00:00.000Z",
  "generatedAt": "2026-11-05T01:02:00.000Z",
  "suggestions": [
    {
      "id": "s1",
      "rank": 1,
      "parentId": "p2",
      "componentIds": ["c1"],
      "requirement": "Kubernetes",
      "priority": "required",
      "status": "NOT_EVIDENCED",
      "kind": "clarify",
      "reason": "This requirement is not evidenced in the saved CV; this does not establish that you lack it.",
      "jdEvidence": [{ "source": "saved_requirement", "quote": "Kubernetes" }],
      "cvEvidence": [],
      "wording": null,
      "clarification": "Do you have verifiable Kubernetes experience? If so, identify an accurate example before adding it to your CV."
    },
    {
      "id": "s2",
      "rank": 2,
      "parentId": "p1",
      "componentIds": ["c1"],
      "requirement": "Java",
      "priority": "required",
      "status": "EVIDENCED",
      "kind": "surface_evidence",
      "reason": "Consider making this existing supporting passage easier to find.",
      "jdEvidence": [{ "source": "saved_requirement", "quote": "Java" }],
      "cvEvidence": [
        {
          "quote": "Built Java APIs.",
          "start": 0,
          "end": 16,
          "role": "support"
        }
      ],
      "wording": "Built Java APIs.",
      "clarification": null
    }
  ]
}
```

This offers an existing line to surface; it does not claim the CV omitted that
line or that copying it will improve the score.

## UX placement and states

Add “CV improvement suggestions” after the requirements list and before existing
Application advice. Keep overview, filters, evidence navigation, advice and score
intact. One contained request action within this section; Reanalyze remains its
existing outlined action. Use outlined surfaces sparingly, 16px internal spacing,
24px section gaps and responsive stacked cards; no sidebar or nested page scroller.

Each card shows rank, required/preferred, unchanged status, full requirement,
reason, targeted component labels, exact JD and CV quotes, and either wording
with “Copy wording” or a clarification question. “View requirement evidence” uses
the existing inspect path (reset filter, reveal, instant scroll, focus once).
Quotes remain keyboard accessible and wrap long text. The original passage is
visible with copyable wording, not hidden behind a tooltip. Copy feedback uses a
polite live status; clipboard failure leaves selectable wording and safe retry.

| State                                | Proposed behavior                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No CV / no successful match          | Explain prerequisite; existing Save CV / Analyze action remains the route forward. No automatic suggestions call.                                       |
| Ready, not requested                 | Brief purpose: evidence-backed wording or questions to clarify; request button.                                                                         |
| Loading                              | Inline progress/status announcement, duplicate action disabled; preserve visible matching result and focus. No automatic scrolling.                     |
| Success                              | Up to five ordered cards, review reminder and explicit Regenerate action. Copy only non-null validated wording.                                         |
| Empty                                | “No additional evidence-backed suggestions found. Review the requirement evidence.” No implication that the CV is perfect or all skills are present.    |
| Error / retry                        | Local section alert and Retry for transient failures; retain same-snapshot prior cards with an explicit previous-result label. Matching remains usable. |
| Stale / expired                      | Clear suggestions, disable copy and direct user to Reanalyze; never retain actionable cards from old sources.                                           |
| Replaced CV / edited job / new match | Clear cards and pending request identity. Suppress late results; use saved-source timestamps plus matchId, not filename alone.                          |

Follow docs/ux-guidelines.md: document scrolling, natural mobile layout, visible
focus, textual statuses, 44px touch actions as needed, no color-only semantics.
P7 frontend acceptance includes keyboard operation, narrow viewport and 200% zoom.

## Evidence rules and deterministic safeguards

1. P6 is immutable input: preserve parent IDs, priorities, group modes, status,
   credit, recommendation and score. Parent/component IDs are snapshot-local.
   Missing evidence means Unknown, not absence of ability.
2. Build eligibility only from server-verified coverage. A copy candidate needs
   a supported component, an exact uniquely anchored original passage, no parent
   or component conflict, and all context necessary to interpret that passage.
   Ambiguous attribution, mixed negation/aspiration, uncertain qualification,
   unresolved section context or unsupported group mode falls back to clarification.
3. Do not delete qualifiers, negation, dates, employer/project context, prototype
   limits or attribution. No combining passages, summing durations, converting
   tool use into engineering experience, upgrading participation to ownership,
   or inventing skills, degrees, metrics, employers or achievements. A quote that
   cannot safely stand alone is not an extractive wording candidate.
4. Conflict takes precedence: show all available conflicting evidence, ask the
   user to reconcile it, and do not choose the favorable version. A negative
   passage must never become an affirmative wording candidate. No automatic
   “fix” that removes a truthful negative statement.
5. Source span validation checks range bounds, exact slice equality and current
   revision. JD quotes must resolve to the selected canonical parent/component;
   return source kind honestly. Full original uploaded JD traceability is not
   available for every saved requirement.
6. Model selects only server candidate IDs. Strict schema disallows prose and
   extra keys; reject unknown, duplicated, cross-parent or ineligible selections.
   Server assigns order, IDs, labels, quotes, wording and neutral questions.
   Invalid selections produce a safe error; do not silently present fabricated
   fragments. A legitimate empty selection produces the empty state.
7. Treat all documents/labels as untrusted data in prompts; render plain React
   text, never model HTML/Markdown. Bound candidates, source windows, request and
   output sizes within current context limits; refuse oversize rather than
   silently truncating qualifiers/contradictions. Do not send a clipped positive
   quote that omits known conflicting context.
8. No prompts, source text or generated wording in logs/error telemetry. Return
   only needed evidence excerpts. Recheck source revisions after generation;
   process-memory snapshots expire and are evicted. No full-CV browser endpoint.

These safeguards intentionally favor clarification over recall. They do not
establish universal semantic understanding of arbitrary CV prose; conservative
eligibility rules and synthetic adversarial tests are prerequisites to wording.

## Implementation slices for review

Each slice stops for approval; these are proposals, not authorization.

| Slice                                           | Scope and acceptance                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P7.2 — trusted context and deterministic policy | Define owning-module DTOs, snapshot identity/TTL/eviction and additive matchId. Implement pure candidate/anchor/template policy and synthetic unit tests. Establish safe extractive eligibility before any suggestion AI wiring. Existing match scores/statuses/evidence must remain identical. Record approved choices in docs/architecture.md.        |
| P7.3 — on-demand API                            | Wire matching-owned suggestion service, strict selection prompt/schema, provider reuse, admission guard, typed failures, no-store/localWrite and revision checks. Add mocked-provider service/controller tests and isolated PostgreSQL lifecycle coverage for source replacement/staleness/no writes where needed. No migration or live model required. |
| P7.4 — existing-tab UI                          | Add validated web contract, section/cards, request/retry/empty states, exact evidence navigation, clipboard behavior and stale-response suppression. Focused Vitest tests and frontend typecheck, then one scoped Chromium Playwright MCP smoke pass with synthetic data (keyboard, narrow layout, zoom, console).                                      |
| P7.5 — acceptance and review gate               | Review synthetic adversarial matrix and complete intended diff. Run required CI-parity checks for the final revision when PR-bound, including exact full workspace test command if matching/evidence/common infrastructure changes; isolated integration checks as required by workflows. Stop for separate commit/push approval.                       |

Focused synthetic coverage should include:

- Matched single support; Partial AND (supported wording never claims missing
  components); satisfied OR (no demand for all alternatives); unknown group.
- Unknown with no source quote; missing duration/degree; explicit negative;
  aspiration; prototype-only; positive/negative conflict including contractions.
- Numbers, employer/project attribution and role qualifiers retained exactly;
  malicious document instructions cannot become generated factual prose.
- Exact/whitespace-resolved source spans, repeated quotes, Unicode surrogate
  pairs, multiline text, ambiguous section attribution and out-of-range offsets.
- Forged/cross-job/expired snapshot ID, eviction/restart, source revision change
  before/during generation, concurrent requests and snapshot replacement.
- Invalid/duplicate candidate IDs, schema errors, timeout/unavailable provider,
  oversize context, valid zero suggestions and no-candidate/no-AI path.
- UI prerequisite/loading/error/retry, previous same-snapshot result, source-change
  invalidation, late responses, copy success/failure and targeted evidence focus.
- Assert no job/CV/tracker writes and no match score/status mutation. Reuse P6
  synthetic regression fixtures where relevant; never add private CV fixtures.

## Out of scope

Free-form affirmative AI rewrites, invented sample accomplishments or fill-in
metrics; CV editor/export, automatic document patching, original-file visual
anchors, OCR, structured CV persistence, suggestion history/accept/dismiss state,
chat-based clarification capture, scoring changes, matching fixes, JD extraction
changes, authentication, additional infrastructure/dependencies, live Ollama
benchmarking, DEV-02.1, commits, pushes and PR creation.

## Open decisions requiring review

1. Approve extractive supported wording for MVP, or require novel rewriting and
   a separate, stronger transformation policy before release? Recommendation:
   extractive first; never claim arbitrary paraphrase validation is solved.
2. Approve bounded 15-minute process-memory snapshots (20 entries, latest per
   owner/job), with reanalysis after expiry/restart? Recommendation: yes; avoids
   migrations and trusting client evidence. TTL/cap are product defaults to review.
3. Approve five cards, conflict-first review ordering, and single-card-per-parent
   behavior, including supported-component wording under a Partial parent?
4. Approve section placement before Application advice and honest
   “saved requirement” JD provenance / “Original CV passage” parsed-text anchors?

No database or infrastructure blocker for this conservative MVP was identified.
The material limits are missing durable assessment identity (addressed by the
proposed ephemeral snapshot), discarded document layout metadata, and absence of
a general safe rewrite validator. No runtime/model/browser acceptance is claimed
by this source audit. Stop for design review before P7.2.

## P7.2 — approved decisions and implemented boundary

The P7.1 proposal is approved with extractive wording only, no affirmative AI
paraphrases, on-demand generation, 15-minute process-local snapshots capped at
20 entries (latest per owner/job), five cards at most, one per parent and
conflict-first ordering. No database migration or suggestion persistence.

Product roadmap: P7 evidence-backed CV improvement suggestions → P8.1 structured
CV profile → P8.2 tailored CV draft with user review → P8.3 DOCX/PDF preview and
export. P7.2 implements only trusted context, evidence references and pure policy.
AI selection, suggestions endpoint and frontend remain deferred to P7.3 onward.

### Implemented lifecycle

`match-context.ts` retains a detached, deeply frozen assessment and primitive
owner/job/revision metadata. It does not retain another full CV document.
`JobMatchService.analyze` adds an opaque random UUID matchId only after successful
validation, revision checking and scoring. All previous response fields, scores,
statuses and credits remain unchanged. Failed matching does not replace a prior
successful snapshot. The singleton service owns the process-local store.

TTL uses monotonic time, expires exactly at 15 minutes, and is not extended by
reads. Create/lookup lazily prune expired entries; with no activity at most 20
expired snapshots may remain in memory until the next access or process exit.
Replacement removes the prior identity for that owner/job; capacity evicts the
oldest insertion. Reads do not change eviction order. No timer or persistence.
Restart loses all identities. `requireSnapshot` checks current saved CV/job
revisions plus owner/job/match identity, returning a safe 409 on missing/stale
context. P7.3 must call it before and after asynchronous generation: holding an
old frozen object alone does not establish that it is still current.

### Implemented policy and reusable evidence

`suggestion-evidence.ts` distinguishes `saved_cv_text` from
`canonical_saved_job_requirement`. Frozen references carry exact original quotes,
parent/component linkage and both source revisions. CV spans use UTF-16 indices;
repeated quotes retain their quote but have null spans. Whitespace resolution
uses the existing resolver and returns original delimiters. Invalid source quotes
are rejected. JD component quotes must occur within the canonical parent quote;
no original-uploaded-document provenance is asserted.

`suggestion-policy.ts` consumes an immutable snapshot and its corresponding saved
CV text, without inference, writes or score changes. Conflict cards precede
required gaps, preferred gaps and matched rows; canonical order breaks ties.
One card per parent and a maximum of five are deterministic. AND Partial may
surface only supported wording while explicitly preserving the incomplete parent
status. A satisfied OR does not request all unsupported alternatives. UNKNOWN
modes, unsupported evidence, contradictory evidence or ambiguous anchors never
produce copy text. Cards with unverifiable JD provenance are omitted.

Wording eligibility is intentionally narrower than source provenance: copy only
a complete single source entry, at most 2,000 characters, with an explicit action
opening or a standalone Skills declaration. Action entries allow at most three
lines; continuation lines must explicitly label Scope, Duration or Qualification.
No blank-separated entries, guessed section attribution, extracted role fragments
or concatenation across roles/projects. Negative, aspirational, uncertain,
prototype-only and collective-attribution passages fall back to clarification.
Copy text is the exact original quote, including employer, project, duration and
qualification context. Multiple-entry CVs will often receive clarification even
when P6 correctly identifies a supported component. This conservative recall
tradeoff is intentional; no general entailment checker is claimed.

Evidence references are immutable provenance values, not mutable or confirmed CV
facts. Model selection cannot expand these eligibility rules in P7.3. P7.3 will
wrap candidates in the reviewed response DTO, assign response ranks/IDs, validate
selection IDs, recheck current context and add provider/error handling; none of
those network/UI behaviors is introduced here.

### P8 reuse responsibilities

P8 can reuse the concepts of source-kind provenance, exact quotes/parsed-text
spans, requirement linkage, source revisions and supported-versus-clarification
decisions. These small types stay matching-owned: no generic document model,
shared package, profile entity or new table is introduced.

- P7 matchId is ephemeral and must never become a durable P8 profile/draft ID.
- P7 does not provide a structured CV profile, employment history or verified
  qualifications. A suggestion or a supporting quote is not a confirmed fact.
- P7 spans address saved parsed text, not PDF/DOCX pages or document layout.
- P8 must independently establish durable source identities, check current source
  revisions, validate user-approved draft content and preserve attribution,
  negation, duration, qualifiers and contradictions.
- P8 must not promote AI suggestions into employment or qualification facts,
  infer omitted achievements, or treat copied wording as user approval.

Architecture conventions require recording significant choices in the existing
`docs/architecture.md`; a short P7.2 entry links here. No separate architecture
document is added. Stop before P7.3 for review.

### P7.2 verification results

- PASS: `pnpm --filter @ai-job-hunter/api test --testPathPatterns='suggestion-policy|match-context|job-match.regression|cv-match.spec|cv-quote-resolution|cv-match.and-recovery|cv-match.or-recovery|cv-match.negation-recovery|cv-match.axon-coverage'` — 9 suites, 291 tests. Includes synthetic policy/lifecycle tests and existing P6 regression coverage. Provider calls are mocked; no Ollama execution.
- PASS: `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS: `pnpm exec eslint apps/api/src/matching/{match-context,suggestion-evidence,suggestion-policy,job-match.service}.ts apps/api/test/unit/{match-context,suggestion-policy,job-match.regression}.spec.ts`.
- PASS: `pnpm exec prettier --check apps/api/src/matching/{match-context,suggestion-evidence,suggestion-policy,job-match.service}.ts apps/api/test/unit/{match-context,suggestion-policy,job-match.regression}.spec.ts docs/architecture.md docs/audits/p7-cv-improvement-design.md`.
- PASS: tracked diff whitespace and new-file whitespace checks; complete intended source/test changes reviewed without staging.

The first test attempt stopped at a TypeScript error in a synthetic UNKNOWN-group
fixture; replaced that mock with an actual P6 UNKNOWN-group assessment and reran.
Final focused results above passed. Full workspace tests, database integration,
full builds and browser smoke were not run for this backend-only checkpoint;
full CI parity remains a separate final pre-push gate. No commit, push, PR,
private CV access, new dependencies, database writes or frontend changes.

## P7.3 — implemented on-demand API

The requested job-scoped route is implemented as
`POST /api/v1/opportunities/:id/cv-improvement-suggestions` (the double slash in
the checkpoint request is interpreted as the saved-job ID placeholder).
Existing UUID validation, localWrite and no-store apply. Body must contain only
`matchId`, a 1–100 character opaque identifier using letters, digits, hyphens or
underscores. Client scores, statuses, quotes, CV text and all other fields fail
with a typed 400. UUID/security failures retain existing controller behavior. A route-scoped global
fallback sanitizes pre-controller JSON/body-parser failures with fixed typed
messages and no-store; other routes delegate to Nest unchanged.

### Actual request and response

```json
{ "matchId": "server-issued-match-id" }
```

The response is `CvSuggestionsResponse` in
`apps/api/src/matching/cv-suggestions.ts`:

```ts
{
  contractVersion: '1';
  matchId: string;
  cvUpdatedAt: string;
  jobUpdatedAt: string;
  generatedAt: string;
  suggestions: readonly (SuggestionCandidate & {
    id: string;
    rank: number;
  })[];
}
```

`SuggestionCandidate` is the P7.2 server-owned contract: parentId, componentIds,
requirement, priority, unchanged status, kind, reason, clarification or exact
wording, and JD/CV evidence arrays. Actual evidence references retain the P7.2
source kinds `canonical_saved_job_requirement` and `saved_cv_text`, source
revisions, parent/component linkage, exact quote, and (for CV) role plus nullable
`span: { start, end }`. A non-null span uses UTF-16 code units and slices to the
exact quote. This intentionally refines the earlier proposed flat start/end
example rather than discarding reusable P7.2 references. IDs are server-assigned
`candidate-N` values scoped to this snapshot/request candidate list; ranks are
consecutive and determined by server order after filtering model choices.

### Trusted context, selection and lifecycle

JobMatchService owns orchestration and source reads. It validates the body before
admission, then resolves the P7.2 snapshot through `requireSnapshot`, loads saved
CV text with an explicit repository selection, verifies its revision, and
rechecks current CV/job revisions and snapshot identity before generation.
The job is loaded through OpportunitiesService; no browser-supplied source or
assessment is trusted. No source text is added to snapshot storage.

CvSuggestionsService builds at most five deterministic candidates, one per parent.
The model sees those candidates as JSON-marked untrusted data and may return
only `{ candidateIds: string[] }`. The schema prohibits extra fields, limits IDs
to the exact server allowlist and bounds length. Runtime validation also rejects
duplicates (`uniqueItems` is outside the provider schema subset), malformed or
ineligible IDs. No free-form model output reaches the response. Unknown means
not evidenced; conflicts never produce affirmative wording; Partial AND cards
retain the incomplete parent status; satisfied OR cards do not request every
alternative. Model selection order cannot reorder cards or change ranks.

An empty candidate set returns successful empty suggestions without invoking AI;
a valid empty model selection also succeeds. Prompt size is capped at 64 KiB and
oversize input is rejected without truncating evidence. Existing provider context,
transport, timeout and output checks remain in force. No live model was run.

The existing feature active flag excludes simultaneous match/suggestion requests
in either direction. It releases in finally on every admitted outcome. Matching
retains its existing busy exception and result behavior; suggestions have a typed
busy error. This does not serialize unrelated AI/extraction modules or introduce
a global queue. CV replacement and saved-job edits remain possible; post-selection
checks discard stale output. Both successful and failed selection paths recheck
revisions/identity. TTL expiry or out-of-band snapshot replacement also invalidates
output. A source change wins over a concurrent provider failure.

| Application error code         | HTTP | Recovery                                                                              |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------- |
| CV_SUGGESTIONS_INVALID_REQUEST | 400  | Send only valid matchId.                                                              |
| CV_SUGGESTIONS_JOB_NOT_FOUND   | 404  | Open an existing saved job.                                                           |
| CV_SUGGESTIONS_BUSY            | 409  | Retry after current match/suggestion request finishes.                                |
| CV_SUGGESTIONS_STALE_MATCH     | 409  | Reanalyze CV Match. Includes expiry, cross-job/owner, replacement and source changes. |
| CV_SUGGESTIONS_CONTEXT_LIMIT   | 400  | Use concise sources and reanalyze; evidence is never silently truncated.              |
| CV_SUGGESTIONS_INVALID_OUTPUT  | 503  | Retry selection.                                                                      |
| CV_SUGGESTIONS_UNAVAILABLE     | 503  | Check local API/Ollama and retry.                                                     |
| CV_SUGGESTIONS_TIMEOUT         | 504  | Check Ollama and retry.                                                               |

Errors use fixed messages and never include raw source, prompt, provider output
or underlying exception detail. No new payload logging. Responses/errors use
Cache-Control no-store through the existing controller/error filter and the
route-scoped parser-error fallback registered in main.ts. The fallback recognizes
known parser error types before Nest can log their underlying error details.
No CV, job or application/tracker writes and no durable suggestions storage.

### Verification scope and compatibility

Synthetic mocked-provider tests cover strict request/output validation, valid and
empty selections, zero-candidate/no-AI behavior, deterministic ordering and exact
spans, Unknown/Conflict/Partial/OR behavior, cross-job/unknown/expired IDs,
pre/during-generation CV/job changes, identity replacement, bidirectional
admission, release after failures, oversized evidence, prompt injection and
read-only access with unchanged assessment. A real Nest HTTP pipeline with
Supertest exercises UUID, local Origin/Host protection, typed failures, malformed
JSON, oversized bodies, unrelated-route delegation and no-store.
No PostgreSQL integration test was added: no new database lifecycle or persistence
boundary is introduced, source mutations are deterministically controlled in
unit tests, and existing owning-service persistence remains unchanged.

P6 risk is limited to intentionally sharing admission with this new on-demand
request; a concurrent match receives its existing 409. P6 matching/scoring/prompt,
coverage and evidence rules are untouched. Conservative P7.2 wording eligibility
remains: multi-entry CV excerpts often require clarification rather than copy.
No frontend, migration, dependency, private CV, P8 feature, commit/push or PR.
Full CI parity (including required workspace/integration checks) is pending the
final pre-push gate. Stop for review before P7.4.

### P7.3 actual verification results

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-suggestions|suggestion-policy|match-context|job-match.regression|cv-match.spec|cv-quote-resolution|cv-match.and-recovery|cv-match.or-recovery|cv-match.negation-recovery|cv-match.axon-coverage'`: **10 suites, 342 tests**, including **51 new suggestions tests** and existing P6/snapshot/policy coverage. All AI calls mocked.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS — `pnpm --filter @ai-job-hunter/api build` (bootstrap/filter wiring compiles; no runtime model execution).
- PASS — `pnpm exec eslint apps/api/src/matching/{cv-suggestions,cv-suggestions.error,cv-suggestions-request.filter,job-match.service}.ts apps/api/src/main.ts apps/api/src/opportunities/opportunities.controller.ts apps/api/test/unit/cv-suggestions.spec.ts`.
- PASS — `pnpm exec prettier --check apps/api/src/matching/{cv-suggestions,cv-suggestions.error,cv-suggestions-request.filter,job-match.service}.ts apps/api/src/main.ts apps/api/src/opportunities/opportunities.controller.ts apps/api/test/unit/cv-suggestions.spec.ts docs/architecture.md docs/audits/p7-cv-improvement-design.md README.md`.
- PASS — `git diff --check`; new-file whitespace checked with `git diff --no-index --check /dev/null <path>`. Intended source/test/doc changes reviewed without staging.

Intermediate checks found an unused test import (fixed), a missing typed response
for malformed JSON, and a non-HttpException body-parser oversized-payload error.
The final scoped parser fallback handles both parser cases with fixed messages;
HTTP regression checks for malformed JSON, oversized payloads and unchanged
unrelated-route behavior pass. No assertions, lint rules or provider limits were
weakened. Final code checks above apply to the final source revision; only this
verification record was added afterward and formatting/whitespace rechecked.

P7.3 changes: `apps/api/src/matching/cv-suggestions.ts`,
`cv-suggestions.error.ts`, `cv-suggestions-request.filter.ts`,
`job-match.service.ts`; `apps/api/src/opportunities/opportunities.controller.ts`;
`apps/api/src/main.ts`; `apps/api/test/unit/cv-suggestions.spec.ts`; README.md;
docs/architecture.md; this design document. Existing uncommitted P7.1/P7.2 work
is preserved. No local implementation blocker identified. Full CI parity remains
pending the final pre-push gate; no database integration or browser acceptance is
claimed for this backend-only checkpoint. Stop before P7.4.

## P7.4 — implemented CV Match suggestions section

Frontend only; P7.3 API and all P6 backend behavior remain unchanged. The existing
CV Match tab now places “CV improvement suggestions” after Requirements and
before Application advice, with no new tab, sidebar or page scroll container.
The score, recommendation, filters and requirement evidence presentation remain.

### Lifecycle and rendering

Before matching, the panel explains that saved CV analysis is a prerequisite.
After a successful match with complete snapshot metadata/component linkage, the
user can explicitly choose Suggest CV improvements. Legacy match results remain
readable, but require Reanalyze to obtain a trusted suggestions context. No
suggestions request runs automatically.

The request sends only the returned matchId to the existing job-scoped endpoint.
A synchronous in-flight latch prevents duplicate requests. Matching/upload
controls are disabled during selection, preserving the visible match; suggestions
controls are disabled during matching/upload. Cards clear immediately when
reanalysis or CV replacement starts, including failed attempts, and on job/form
revision changes. Component identity and an abort/generation guard suppress late
responses and clipboard announcements after unmount. The panel's existing match
and upload generation checks also discard late completions after source changes,
without leaving controls permanently busy.

Server card order/ranks are preserved (never reranked in the browser). Cards show
full requirement, relevant component labels, required/preferred priority,
unchanged status, server reason, exact source evidence and either a clarification
or exact supported original wording. Conflict cards have no copy action. Partial
cards explicitly retain their incomplete parent meaning. Canonical saved-job
requirement text is labeled as such, and parsed CV quotes explicitly do not
claim PDF/DOCX layout positions. All content renders as plain React text.

Copy wording uses only validated non-null server wording. Success and clipboard
failure are announced in a polite live status; on failure the exact wording stays
selectable for manual copy. Copy does not write a CV, job or application field.
View requirement evidence reuses MatchContent's existing inspect callback: reset
filters, reveal the row, instant targeted scroll, highlight and focus once after
its expansion completes. No duplicate requirement-details implementation.

Initial/not-requested, loading, success, empty, transient error/retry, stale,
copy-success and copy-failure states are implemented. Same-snapshot prior cards
may remain during regeneration/transient failure with an explicit previous-result
label; copying is disabled while regeneration runs. Invalid/unreadable successful
responses clear prior cards. Stale source identities or the typed stale-match
error clear cards and offer an explicit Reanalyze action; no hidden matching call.
External source changes not represented in current page state are detected by the
server on the next request; this checkpoint adds no background polling or durable
cross-tab state.

### Frontend boundary

`cv-match.types.ts` holds local match display types/status labels previously
inside CvMatchPanel, including additive snapshot metadata. There is no shared
package or ORM exposure. `cv-suggestions.contract.ts` defines the frontend
response/evidence types and validates unknown responses without a schema library:

- Contract version, matchId, exact source revisions and a valid generatedAt.
- At most five cards, unique IDs/parents and consecutive server ranks.
- Parent/requirement/priority/status/component linkage to the displayed match.
- Exact JD/CV quotes and source kinds against that match's component evidence,
  including contradiction roles and no silently omitted known contradictory quotes.
- Clarification/wording exclusivity, supported-component wording equality and
  no affirmative copy for Conflict/Unknown/unsupported group modes.
- Nonnegative safe-integer UTF-16 offsets with span length equal to quote length;
  null anchors cannot authorize copying.

The browser receives source excerpts, not the whole CV. It can validate offset
shape/length and exact match-evidence text, but cannot independently prove
`fullSource.slice(start, end) === quote` or unique occurrence. Those guarantees
remain server-owned; no full-CV endpoint or client semantic rewriting is added.
The validator accepts current API-generated synthetic cards unchanged.

### Synthetic tests and browser smoke

`apps/web/test/fixtures/cv-suggestions.ts` contains only synthetic data generated
from the P7.3 deterministic scorer/policy (no AI call): a 50/Consider match with
Partial API/integration design, Unknown Kubernetes and Matched Java, plus a
separate Java conflict fixture. No private CV fixtures or stored production data.
Focused tests cover explicit request/body, section placement, prerequisite,
loading/duplicate suppression, empty/error/retry, expiry/replacement, late job/form
responses, CV replacement/reanalysis invalidation, exact copy and clipboard
failure, Partial/Conflict cards, existing navigation/focus and malformed contract
variants including Unicode/multiline offsets and missing contradiction evidence.

**PASS — Chromium through Playwright MCP**, with a temporary Vite harness
rendering the actual CvMatchPanel and existing MUI theme. App fetch calls were
fulfilled exclusively from synthetic fixtures; no API/database/Ollama calls,
private CVs or actual CV upload occurred. This is mocked UI acceptance, not live
AI acceptance. Verified:

- Explicit request produces three ordered cards, with exact quoted evidence.
- Clipboard contains exactly `Designed Java APIs.` after mouse and keyboard copy.
- Navigation from a filtered list resets All, expands the matching requirement,
  moves focus to its summary, and supports Space to collapse it.
- No horizontal page overflow at 1280×900, 390×844, or 200% CSS zoom at 1280×900.
  CSS zoom is a layout stress check, not native browser-zoom certification.
- Required copy/navigation actions remain available with keyboard focus.
- Browser console: zero errors and zero warnings.

Synthetic screenshots: `p74-suggestions-desktop.png` and
`p74-suggestions-mobile.png`, retained in the local Playwright artifacts directory
(`/home/tientb/.cache/playwright-mcp/artifacts`), not added to Git. Temporary
harness files and the Vite process are removed/stopped after verification.

P7.4 changed-file inventory: CvMatchPanel.tsx; new CvSuggestionsSection.tsx,
cv-match.types.ts and cv-suggestions.contract.ts; new cv-suggestions.test.tsx and
test/fixtures/cv-suggestions.ts; README.md, docs/architecture.md and this document.
Earlier uncommitted P7.1–P7.3 work is preserved. No backend change, dependency,
migration, P8 feature, commit, push or PR. Stop for review before P7.5.

### P7.4 actual verification results

- PASS — `pnpm --filter @ai-job-hunter/web exec vitest run test/cv-suggestions.test.tsx test/cv-match.test.tsx`: **2 files, 62 tests** (45 new suggestions cases; all 17 existing CV Match tests). Final run: 4.02 seconds.
- PASS — `pnpm --filter @ai-job-hunter/web typecheck`.
- PASS — `pnpm exec eslint --max-warnings 0 apps/web/src/features/inbox/{CvMatchPanel.tsx,CvSuggestionsSection.tsx,cv-match.types.ts,cv-suggestions.contract.ts} apps/web/test/cv-suggestions.test.tsx apps/web/test/fixtures/cv-suggestions.ts`.
- PASS — `pnpm exec prettier --check apps/web/src/features/inbox/{CvMatchPanel.tsx,CvSuggestionsSection.tsx,cv-match.types.ts,cv-suggestions.contract.ts} apps/web/test/cv-suggestions.test.tsx apps/web/test/fixtures/cv-suggestions.ts README.md docs/architecture.md docs/audits/p7-cv-improvement-design.md`.
- PASS — tracked whitespace with `git diff --check`; new files checked with `git diff --no-index --check /dev/null <path>`; intended P7.4 diff reviewed without staging.
- PASS — scoped Playwright MCP Chromium component smoke with synthetic mocked API responses, real clipboard, keyboard evidence navigation, responsive/200% CSS-zoom checks, and zero console errors/warnings, as detailed above. Harness files removed and temporary Vite server stopped.

Intermediate verification corrected multi-card test queries, explicit optional
backend fields in local match display types, TypeScript narrowing and a hook-lint
warning; no assertions or lint rules were suppressed. An initial test invocation
placed a filter after an extra `--`; it was stopped without claiming a full-suite
result, then replaced by the exact scoped exec command above. The initial
screenshot destination outside browser-tool allowed roots was rejected; final
artifacts are in its allowed Playwright directory. Final passing results apply
to final source/test files; only this verification record was added afterward
and formatting/whitespace checked again.

Full workspace CI parity, builds, database integration, full app E2E and live AI
acceptance were not run for this frontend checkpoint. No remaining local blocker
identified. Existing conservative extractive eligibility remains the principal
product limitation, and native browser 200% zoom was not separately certified.
P6 compatibility risk is limited to request lifecycle controls (source-changing
actions pause during suggestions) and additive metadata validation; unchanged
score/status rendering and evidence navigation pass existing regression tests.
Stop for review before P7.5.

After stopping the temporary Vite process, its output also showed periodic
`/api/v1/health/ready` proxy attempts refused by the unavailable local API on
port 3000. The component harness overrides app fetch calls and does not import
the app-shell readiness poll; these probes were outside the scoped harness.
No live API, database or AI acceptance is inferred from this smoke pass. The
scoped browser console remained free of errors/warnings during its checks.

## P7.4.1 — dedicated Improve CV, compact UX and Vietnamese database OR

This approved checkpoint supersedes P7.4's embedded suggestions placement.
No P8, migration, new dependency, persistence, commit/push or PR is introduced.
Earlier uncommitted checkpoints and unrelated files are preserved.

### Vietnamese OR investigation and root cause

The reported requirement was reproduced using only this synthetic/public JD
clause, not the user's CV:

> Thành thạo ít nhất một hệ quản trị cơ sở dữ liệu: MySQL, Oracle OR SQL Server

Before the fix, the current compiled `requirementGroup` returned `mode: UNKNOWN`,
`context: skill`, and one component containing the whole clause. Trace:

1. Canonical saved-job construction keeps this prose as one required parent;
   English OR prevents bare-list splitting (Vietnamese-only variants are also
   prose, not independent skill tags). Its saved-field JD quote remains intact.
2. `requirementGroup` had no Vietnamese database/proficiency prefix grammar.
3. Its conservative quantity fallback detects `ít nhất` / `một trong` **before**
   general OR splitting. It therefore never reached alternative construction.
4. UNKNOWN coverage gets zero credit, so even a provenance-valid selected quote
   cannot satisfy it. This explains “UNKNOWN — 0/1” and “Compound meaning needs
   review” independently of the private CV's contents.
5. Simply flattening OR would be unsafe: the ordinary skill-context evaluator can
   accept skill declarations, losing the shared `thành thạo` proficiency level.

No user's saved CV, private fixture, raw model response or private database record
was read. The parser defect is established; the claim that the real CV supports
this qualification is **not** established by this audit.

### Narrow semantic correction and actual evidence policy

A bounded grammar now recognizes Vietnamese database one-of proficiency clauses
before that fallback: `Thành thạo` / `Sử dụng thành thạo`, `ít nhất một` /
`một trong (các)`, database-family labels, optional `sau`, colon and an alternatives
list. Commas, semicolons, slash, English OR and Vietnamese `hoặc` separators are
supported. It is not hardcoded to the reported sentence: tests include reordered
phrasing and PostgreSQL/MariaDB variants. Named alternatives are bounded to
MySQL, Oracle, SQL Server, PostgreSQL and MariaDB. Unsupported quantities,
additional prose constraints, other families or unknown database labels retain
conservative UNKNOWN parsing rather than silently dropping constraints.

The canonical parent and full JD quote remain unchanged. Exact component quotes
identify alternatives, while `context: proficiency` retains the shared qualifier
for every alternative. There was no general deterministic proficiency evaluator
for this Vietnamese family; the new scoped guard avoids reusing bare skill-name
satisfaction as proof of level. It accepts either:

- An explicit proficiency/advanced/expert declaration tied directly to a named
  alternative, including `thành thạo`; or
- A production database administration/design/optimization/tuning statement for
  that database, with at least two explicit responsibilities from query tuning,
  indexing/index optimization, replication, failover, or backup restoration.
  This branch refuses mixed-database attribution and collective/team statements.

Existing negative/uncertain guards run first; this scoped rule also rejects basic,
prototype/tutorial, future/learning and Vietnamese aspirational statements.
Oracle Cloud/Java/JDK/VirtualBox proficiency is not Oracle database proficiency.
Omitted selected evidence may be recovered only inside this bounded family with
these same level/context checks and original source passage limits. Rejected
model-evidence recovery remains disabled by P6's existing flag. This is not blanket
technology-name matching or a general Vietnamese proficiency/experience parser.

| Synthetic CV evidence                                                                  | Actual result for the reported parent                                     |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Proficient in MySQL for production database administration.`                          | OR, one supported alternative, Matched, full parent credit.               |
| `Administered production MySQL databases with query tuning, indexing and replication.` | OR, demonstrated scoped production work, Matched.                         |
| `Expert in Oracle for production database administration.`                             | Matched; no need to demonstrate MySQL or SQL Server as well.              |
| `Proficient in MySQL and SQL Server.`                                                  | Two supported alternatives; still one parent, one credit.                 |
| `Skills: MySQL, SQL Server`                                                            | Unknown, zero credit; names alone do not establish requested proficiency. |
| `Used MySQL for a small internal application.`                                         | Unknown, zero credit; ordinary use is not upgraded to proficiency.        |
| Explicit denial or plans to learn Oracle                                               | Unknown, zero positive credit.                                            |
| Positive MySQL proficiency plus a denial of MySQL use                                  | Conflict / Needs review, zero credit, contradictory source retained.      |

Insufficient evidence now gets a specific reason: proficiency in one alternative
is not evidenced; names or ordinary use do not establish the requested level.
Unknown is not proof of missing ability. This OR family returns Unknown rather
than inventing fractional level credit when proficiency is absent. Other P6 AND,
OR/shared-constraint, negation, education, score weights/denominators, recommendation
and evidence resolution policies are unchanged. A required matched parent plus
one unknown preferred Rust row remains **75**, using the existing 3:1 weights.
No score target or forced match was introduced.

### Shared lifecycle and navigation decision

Job Details now has Overview | CV Match | Improve CV | Application | Edit JD,
with updated tab/tabpanel links and existing mobile-scrollable tab navigation.
Improve CV is never disabled. CV Match contains upload/Analyze, overview/score,
requirements/coverage/evidence and existing matching advice only.

Inspection showed CvMatchPanel was already retained while hidden. The smallest
maintainable change keeps it as the **single mounted match-state owner**, rendering
CV Match and Improve CV as sibling tab panels under Job Details' existing view
selection. No duplicate match state, store/provider, route, browser storage or
persistence is needed. Suggestions remain mounted when switching tabs; no tab
entry triggers Analyze or Suggest. A small inspection handle delegates parent-ID
navigation to MatchContent's existing inspection function, retaining filter reset,
expansion, instant scroll and focus. Unknown parent IDs are rejected without
navigating. Go to CV Match focuses the matching tab; evidence navigation then
focuses the exact requirement using the existing reveal timing.

A successful current matchId, source metadata and component linkage are strict
prerequisites. No saved CV and saved-but-not-analyzed states explain the next
step, keep Suggest disabled and offer Go to CV Match. Analysis/upload and
suggestion states disable conflicting/duplicate actions while preserving the
match. Starting reanalysis invalidates suggestion eligibility even if that
attempt fails; a new successful analysis restores it and replaces identity.

CV replacement, relevant form changes and saved-job changes clear old context and
cards. A successful save now advances an owner-local saved-revision signal:
form JSON alone is insufficient when saving edited values leaves that JSON
unchanged. Dirty job forms block suggestions even if the user analyzes the old
saved job while those edits remain unsaved. Matching itself retains its saved-data
behavior. Current dirty-form/revision checks are conservative across the full job
form, consistent with backend jobUpdatedAt invalidating snapshots after any save.

Abort/generation guards still prevent late responses from reviving stale state.
The parent owns a rejected/expired flag; backend stale/expired/replaced responses
clear actionable cards and disable Suggest until a fresh successful analysis.
A client timer also invalidates an elapsed 15-minute analyzedAt lifetime, including
idle Copy actions. This timer is a UX guard, not proof of backend validity: server
TTL, owner/job identity, replacement and source revisions remain authoritative on
every suggestions request. No silent reanalysis or background inference.

### Compact Improve CV presentation

“Improve your CV” has one description, Suggest/Regenerate action, count, first two
cards and Show all / Show less. Each card shows its requirement once, priority and
unchanged status, one concrete action (short clarification or exact copyable
wording) and View evidence. Evidence and details is a keyboard-operable disclosure
for full quotes, components/statuses, source provenance and qualification notes.
No default developer-facing canonical/source-offset labels or duplicate full
requirement detail renderer. Original evidence metadata is retained unchanged.

The only P7 API-generation change is the neutral clarification template:
“Can you verify an accurate example? Add only what you can substantiate, with its
role, scope and qualifiers.” The requirement already appears in the card title;
no factual wording, eligibility, selection architecture or response shape changes.
Conflict questions still explicitly ask the user to reconcile contradictory text.
All copy, Unknown/Partial/Conflict and exact-original-source safeguards remain.
No nested page scroll owner; evidence uses the existing document flow.

### Focused verification and browser smoke

Final source verification:

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match|cv-quote-resolution|match-evidence-validation|matching.spec|job-match.regression|suggestion-policy|cv-suggestions'`: **17 suites, 581 tests**. Includes the new Vietnamese database regressions and existing P6/P7 evidence, scoring, negation, AND/OR, education and provider-contract tests. Broadened once to all CV Match suites because the parser/evaluator is shared; no full workspace run.
- PASS — `pnpm --filter @ai-job-hunter/web exec vitest run test/cv-suggestions.test.tsx test/cv-match.test.tsx test/job-editor-flow.test.tsx test/job-improve-cv.test.tsx`: **4 files, 77 tests**. Real JobEditor tests cover shared identity, tab persistence, dirty/saved JD invalidation and elapsed TTL. Existing P6 display/navigation tests remain valid.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck` and `pnpm --filter @ai-job-hunter/web typecheck`.
- PASS — `pnpm exec eslint --max-warnings 0 apps/api/src/matching/{cv-match.coverage,suggestion-policy}.ts apps/api/test/unit/cv-match.vietnamese-database-or.spec.ts apps/web/src/features/inbox/{CvMatchPanel,CvSuggestionsSection,JobEditor}.tsx apps/web/src/features/inbox/cv-suggestions.contract.ts apps/web/test/{cv-suggestions,job-improve-cv,job-editor-flow}.test.tsx apps/web/test/fixtures/cv-suggestions.ts`.
- Formatting/whitespace commands and actual final results are recorded below.

PASS — scoped Playwright MCP Chromium pass with actual JobEditor, CV Match,
Improve CV, notifications, router and theme, using only synthetic mocked job/CV,
matching and suggestion responses. Local API readiness was reachable (`status: ok`),
but production saved-CV/matching endpoints were deliberately not exercised:
live matching could read a private saved CV. No private source was requested or
overwritten; the synthetic upload control was mocked before network transport.
This is UI smoke, not live Ollama or production database acceptance.

Verified no-CV and saved-not-analyzed prerequisites; Go to CV Match; explicit
analysis; tab switching preserves one match/identity; zero automatic suggestions;
first two cards; Show all (3)/Show less; optional evidence; filtered cross-tab
inspection with exact row expansion/focus; safe clipboard text; reanalysis clears
cards; unsaved JD/save and CV replacement invalidate context; server expiry clears
cards and requires explicit fresh analysis; keyboard tabs and Enter/Space disclosure;
1280×900, 390×844 and 200% CSS zoom without horizontal page overflow. Console:
zero errors, zero warnings. CSS zoom is a layout stress check, not separate native
browser-zoom certification.

Screenshots in `/home/tientb/.cache/playwright-mcp/artifacts`:
`p741-improve-desktop.png`, `p741-improve-mobile.png`. Only synthetic content.
The temporary Vite harness is removed and its separate port-5174 process stopped
after verification. A smoke continuation after a Vite refresh initially assumed
old fixture state and timed out; the state had reset, and a fresh explicit
prerequisite/analyze/suggest flow was rechecked successfully. No product failure
or hidden automatic request was inferred from that harness reset.

### Changed files, review boundaries and remaining limits

P7.4.1 changes only:

- API: `apps/api/src/matching/cv-match.coverage.ts`,
  `apps/api/src/matching/suggestion-policy.ts`, new
  `apps/api/test/unit/cv-match.vietnamese-database-or.spec.ts`.
- Web: `apps/web/src/features/inbox/JobEditor.tsx`, `CvMatchPanel.tsx`,
  `CvSuggestionsSection.tsx`, `cv-suggestions.contract.ts`;
  `apps/web/test/cv-suggestions.test.tsx`, `job-editor-flow.test.tsx`, new
  `job-improve-cv.test.tsx`, and `test/fixtures/cv-suggestions.ts`.
- Documentation: README.md, docs/architecture.md, this existing audit document.

Intermediate focused checks corrected a regex-literal escape and an outdated
four-tab/mock-panel test contract. The real unsaved-edit/save lifecycle test found
and fixed missing saved-source invalidation rather than weakening its assertion.
No assertions, lint rules, score formula or provider boundaries were suppressed.

Known limits: the new proficiency interpretation is a bounded lexical policy,
not universal natural-language understanding or real-world qualification
verification. Unsupported Vietnamese grammar and weaker evidence may remain
Unknown. The real user's MySQL/SQL Server evidence was never inspected and no
real-CV result is promised. Existing extractive-wording conservatism, local
snapshot expiry/restart behavior and lack of idle cross-tab source synchronization
remain. Full CI parity, integration gates and release acceptance remain P7.5;
no commit, push or PR is authorized. No remaining local implementation blocker
identified. Stop for review before P7.5.

P7.4.1 final documentation/whitespace verification:

- PASS — `pnpm exec prettier --check apps/api/src/matching/{cv-match.coverage,suggestion-policy}.ts apps/api/test/unit/cv-match.vietnamese-database-or.spec.ts apps/web/src/features/inbox/{CvMatchPanel,CvSuggestionsSection,JobEditor}.tsx apps/web/src/features/inbox/cv-suggestions.contract.ts apps/web/test/{cv-suggestions,job-improve-cv,job-editor-flow}.test.tsx apps/web/test/fixtures/cv-suggestions.ts README.md docs/architecture.md docs/audits/p7-cv-improvement-design.md`.
- PASS — `git diff --check` plus `git diff --no-index --check /dev/null <path>` for each of 17 new files, including preserved earlier checkpoints. Intended changes reviewed; index remains empty.
- Temporary smoke files removed and Vite stopped. Existing API process and tools were not changed or stopped. No production/private data was touched.

Only this results record was added after the final code checks; its formatting
and whitespace were checked afterward. No further implementation work is pending
within P7.4.1. Stop for review before P7.5.

## P7.4.2 — SQL Server evidence recognition priority fix

Latest user steering limits this iteration to matching and synthetic regressions.
The separate compact Improve CV request (three initial cards, Review evidence and
removing duplicated inline details) is explicitly deferred. No frontend code or
UI behavior is changed in this iteration. No private CV, fixture, model capture
or saved production document was accessed.

### Precise stage trace (synthetic reproduction)

The synthetic saved parsed text contains a Databases row naming PostgreSQL,
MySQL, SQL Server and Oracle; a fictional project line stating development of
enterprise features using SQL Server; and a separate generic MyBatis/data-access
optimization bullet. It contains no copied employer, personal or private project
information. This establishes behavior for the reported pattern, not the exact
contents or parsing of the user's saved PDF/DOCX.

| Stage                  | Actual synthetic finding                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved parsed text      | Mock repository supplies exactly the synthetic text; the real JobMatchService explicitly reads its `text` column. No source line is removed at this boundary. The user's actual parsed text was not inspected.                                                                                                                                            |
| AI passage candidates  | `cvQuoteChoices` includes the exact SQL Server project line and the contiguous project/optimization pair. The model-facing component enum contains that project quote. No candidate-generation omission in this reproduction.                                                                                                                             |
| AI selection           | Controlled responses exercise project selection, the two-line pair, skills-only selection and omitted selection. No live-model selection behavior is claimed.                                                                                                                                                                                             |
| Quote resolution       | Exact and uniquely whitespace-equivalent quotations resolve to original source spans. Fabricated quotes fail validation.                                                                                                                                                                                                                                  |
| Component assignment   | `validateMatchAssessment` retains the project pair under the SQL Server component (`c3`) without `cvEvidenceUnverified`. It is not lost by parent/component linkage.                                                                                                                                                                                      |
| Proficiency policy     | The selected project/optimization text does not meet the existing level predicate: it states application development using SQL Server and generic MyBatis optimization, not explicit proficiency or the policy's production database administration/design plus two concrete responsibilities. The policy correctly withholds qualification credit.       |
| Aggregation before fix | The component retained only qualification-support `cvQuote`; insufficient-level project text became an empty quote and Unknown. This discarded the useful distinction between “SQL Server project work is documented” and “SQL Server is absent.” OR then correctly aggregated zero qualified alternatives, but its evidence presentation was incomplete. |

The regression is therefore **loss of unqualified source observations at the
qualification/coverage boundary**, after successful source availability,
candidate generation, quote resolution and component assignment in the synthetic
pipeline. There is no evidence here that the actual user's source parsing or
live AI selection succeeded or failed; visual confirmation alone cannot prove
those private runtime stages.

### Correction without forced proficiency

Only the recognized database/proficiency family now preserves optional
`observations` on an unqualified component. Entries contain `kind: mention |
experience` and the exact original `cvQuote`. A bounded positive applied-work
pattern identifies SQL Server project development separately from a bare skills
row; no negative, aspirational or tutorial statement is promoted to work evidence.
At most one work quote and one separate skills mention are retained per component.
Each retained quote must occur in the supplied source and fit the existing
2,000-character passage limit. This is source-backed text observation, not
independently verified employment or qualification.

`qualificationReason` distinguishes documented project work or a mention from
unverified proficiency. Existing qualification-support `cvQuote`, statuses and
credit keep their previous meaning. Unknown observations never authorize
Matched, score credit, affirmative suggestion wording or copying. Rejected model
evidence cannot be restored through the observation path. Parent coverage now
explains the actual limitation, for example:

> SQL Server project experience is evidenced; proficiency at the requested level remains unverified.

MySQL and Oracle skills-row entries are retained as mentions, not inferred work
experience. The adjacent generic MyBatis bullet is available to quote selection,
but is not separately assigned to SQL Server or used to inflate proficiency; it
names no database and cannot establish ownership/level by itself. Statements from
different projects/databases are not combined to meet the responsibility count.

Strong explicit proficiency declarations and the existing narrowly demonstrated
production database work continue to satisfy one OR alternative. Qualified OR
aggregation and 3:1 required/preferred weights are unchanged. Zero of three
qualified alternatives remains correct for the ordinary enterprise-feature plus
generic optimization pattern; it no longer means zero mentions/work observations.
A genuine use denial contradicting documented work now returns Conflict with both
original statements and zero credit. “Not proficient” alone does not contradict
ordinary use: that combination remains Unknown, not a fabricated conflict.
Other requirement families are unchanged.

### Compatibility and deliberately deferred UI

These are additive server-derived coverage fields; the model output schema,
selection architecture, database, persistence and dependencies do not change.
Current frontend validation tolerates additional component metadata. The new
parent coverage reason appears through the existing match explanation path.
Detailed rendering of the new unqualified observations is **not implemented**;
that belongs to the separately deferred UI work. Current qualified-support counts
and component `cvQuote` remain qualification-only. Reanalyze is required to obtain
new coverage metadata; no automatic request or private-CV validation was run.

### Actual verification

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match.sql-server-evidence|cv-match.vietnamese-database-or|cv-match.and-recovery|cv-match.or-recovery|cv-match.negation-recovery|cv-match.spec|cv-quote-resolution|match-evidence-validation|job-match.regression|suggestion-policy|cv-suggestions'`: **11 suites, 375 tests**, including the new synthetic service pipeline trace and negative controls. All model calls mocked.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck`.
- PASS — `pnpm exec eslint --max-warnings 0 apps/api/src/matching/cv-match.coverage.ts apps/api/test/unit/cv-match.sql-server-evidence.spec.ts`.
- Scoped formatting and whitespace results are recorded after the final document update.

Changed files for this iteration: `apps/api/src/matching/cv-match.coverage.ts`;
new `apps/api/test/unit/cv-match.sql-server-evidence.spec.ts`; this audit; and the
required concise architecture note. Earlier uncommitted checkpoints are preserved.
No frontend tests/browser smoke are claimed because no UI was changed. No full
CI gate, live Ollama, private CV access, database writes, commit, push or PR.
Stop for review; compact Improve CV changes remain deferred by the latest request.

P7.4.2 final scoped checks: PASS — `pnpm exec prettier --check apps/api/src/matching/cv-match.coverage.ts apps/api/test/unit/cv-match.sql-server-evidence.spec.ts docs/architecture.md docs/audits/p7-cv-improvement-design.md`; PASS — `git diff --check` and new-file whitespace via `git diff --no-index --check /dev/null <path>`. The final regression set also checks original nonbreaking whitespace through quote resolution and observation retention. Code/tests reviewed without staging. Full CI gate and all compact-UX implementation remain deferred.

## P6 reliability: managed-language context recovery

The synthetic real-provider diagnosis reproduced the heading-sensitive failure on
both frozen main (`305085e`) and this branch. Parsed CV text retained Java,
Spring Boot and professional work. Ollama selected a bare technology-list passage;
exact quote resolution succeeded, but that selected passage did not establish
professional development experience. Existing recovery did not find the stronger
available passage. The first failing boundary was candidate sufficiency/recovery
(`SELECTED_CONTEXT_INSUFFICIENT`, a diagnostic classification), not scoring.

### Narrow recovery and integrity

Only the existing “at least one managed language such as …” experience OR family
receives the specialized recovery. It reuses `cvQuoteChoices`, `resolveCvQuote`
and the existing `allowRecovery` gate. The shortest sufficient contiguous original
passage must explicitly bind Java, Scala, Go or C# to software development work
and professional context. A different technology, role title or skills list cannot
supply the language for unrelated work. English “go live” is not Go evidence.

Adjacent recognized employer/role/project/work headings remain in the exact quote;
recovery rejects truncated attribution, repeated ambiguous source spans, merged
entries and context borrowed from a later entry. Original CRLF and blank-line
separators survive. Existing negation, uncertainty, minimum-duration, conflict and
invalid-model-evidence gates are reapplied. No source spans are concatenated and no
wording is generated. A positive work passage plus explicit denial remains Conflict
with both original quotes and zero credit.

Two old discovered-job fixtures previously credited inline skills lists for this
experience family. Their expectations now require professional work, as explicitly
required by this checkpoint. Generic OR/AND requirements, database policy, P6 parent
weights and score aggregation are unchanged. This is a bounded extension of existing
recovery, not a replacement matcher or a universal employment-section parser.

### Synthetic regression decisions

| Synthetic evidence pattern                                             | Before                             | After                                                                        |
| ---------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- |
| Weak bare-list selection, stronger professional Java passage available | Separate-heading live case Unknown | Matched; exact professional source quote                                     |
| Identical substantive work with inline/separate Skills headings        | Heading-sensitive live result      | Same recovered quote and Java component decision in deterministic regression |
| Bare inline skills only                                                | Some legacy fixtures credited it   | Unknown; no quote/credit                                                     |
| Bare separate skills, Java alone, no professional context              | Unknown                            | Unknown; zero score                                                          |
| Explicit professional Java development                                 | Matched when selected adequately   | Matched, including recovery from weak/empty selection                        |
| Learning, aspiration, negation, unrelated Spring Boot/JavaScript work  | Insufficient evidence              | Unknown; zero score                                                          |
| Explicit Java work plus explicit Java denial                           | Conflict policy applies            | Conflict; both source statements; zero score                                 |
| Multiple role/project entries                                          | Attribution must be preserved      | Exact employer/role/project/work span; no other entry borrowed               |

The deterministic inline/separate pair each scores 75 with one matched required
parent and one unknown preferred parent, verifying unchanged 3:1 weighting. Tests
also cover all four explicit language alternatives, invalid-quote recovery
suppression, minimum years, CRLF and blank-line attribution.

### Verification and limits

PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match.managed-context-recovery|discovered-match|axon-score-trace|match-evidence-validation|cv-match.axon-coverage'`: **5 suites, 91 tests**.

PASS — broader focused matching/evidence/suggestions compatibility:
`pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match|cv-quote-resolution|match-evidence-validation|matching.spec|job-match.regression|discovered-match|axon-score-trace|suggestion-policy|cv-suggestions'`: **21 suites, 655 tests**.

PASS — `pnpm --filter @ai-job-hunter/api typecheck`.
PASS — scoped ESLint on `cv-match.coverage.ts`,
`cv-match.managed-context-recovery.spec.ts` and `discovered-match.spec.ts`.
Formatting, whitespace and live acceptance results follow below.

The source choice window remains bounded by the existing passage architecture;
long/distant or unrecognized attribution can conservatively remain Unknown. Other
requirement families can still be omitted by the provider. Recovery does not promise
identical overall scores across model runs. No private CV, frontend change, database
write, dependency, migration, full CI gate, commit, push or PR was involved.

Changed files in this checkpoint: `apps/api/src/matching/cv-match.coverage.ts`;
new `apps/api/test/unit/cv-match.managed-context-recovery.spec.ts`;
`apps/api/test/unit/discovered-match.spec.ts`; this audit; and the architecture note.
Earlier uncommitted work is preserved.

### Real local Ollama acceptance

PASS — `python3 /tmp/ajh-p6-recovery-acceptance-lwcgz2ab/run-matrix.py`:
two sequential samples of each diagnosed synthetic case. The temporary harness
uses real PDF parsing, `ExtractionService.saveCv`, `JobMatchService.analyze`,
`AiService` and the unchanged `OllamaProvider` with local `qwen3:4b` (pinned local
Ollama 0.40.10). Source stores are synthetic in-memory repositories, not a database.
The isolated current-source build passed TypeScript compilation. Only stage counts,
booleans and statuses were output; no prompts/model payloads or private sources.

| Real-provider synthetic case               | Samples | Current managed status | Current total scores | Frozen-main same-output replay |
| ------------------------------------------ | ------- | ---------------------- | -------------------- | ------------------------------ |
| Isolated managed-language requirement      | 2       | Matched, credit 1      | 100, 100             | Matched, 100, 100              |
| Eleven requirements, inline Skills heading | 2       | Matched, credit 1      | 18, 18               | Matched, 18, 18                |
| Eleven requirements, separate headings     | 2       | Matched, credit 1      | 9, 9                 | Unknown, 0, 0                  |

All six provider calls succeeded. All six still selected context-insufficient
passages for the target; all six final target quotes were exact original CV spans
with professional context. Quote rejection counts were zero throughout. In each
separate-heading run, parent quotes: 11 total, 9 empty, 2 resolved, 0 rejected;
component quotes: 18 total, 15 empty, 3 resolved, 0 rejected. The target now has
one supported Java alternative and three unknown alternatives, satisfying one OR
parent without demanding every language. The ten other rows remain Unknown in
that case; this fix does not force their recovery or change arithmetic.

These are two samples per case, not a broad provider reliability benchmark.
Same-output frozen-main replay is a deterministic causal comparison; each current
sample itself used live Ollama, not mocked acceptance. Old inline-list credit was
replaced by stronger source evidence even where the overall score stayed the same.

The deterministic synthetic pair asserts this exact recovered source quote:
`Professional experience: Developed Java services with Spring Boot for a commercial client.`
The multi-entry regression separately asserts the exact employer + role/project +
work span. No copied or paraphrased claim is synthesized.

Final PASS — scoped ESLint and API typecheck; Prettier check on the three code/test
files and these two documents; `git diff --check`; and new-file whitespace checks
with `git diff --no-index --check /dev/null <path>`. Full CI remains pending.

Recommended real-CV retest: reload the updated API, explicitly Reanalyze the saved
Axon job with the existing saved CV, then inspect the managed-language parent,
Java component and original professional quote. A particular total score is not
promised. If it remains Unknown, obtain opt-in non-sensitive stage diagnostics
before making another policy change. No private-CV diagnostic was executed here.
Stop for review; Improve CV UX work remains deferred.

## Approved P6 evidence-based proficiency and familiarity implementation

This implementation supersedes the earlier ordinary-database-use Unknown policy
recorded above. It implements the approved checkpoint; no new design audit or
Suggestions redesign was performed. Historical diagnosis remains in
[p6-remaining-evidence-gaps-diagnosis.md](p6-remaining-evidence-gaps-diagnosis.md).

### Exact semantics and evidence decisions

For the recognized Vietnamese one-of database-proficiency family only:

- Unknown / 0: no evidence, bare names, lists or aspiration. Exact mentions remain
  observations; they do not authorize Partial, proficiency or copyable claims.
- Partial / 0.5: exact evidence explicitly binds a database to substantive
  professional project responsibilities (for example enterprise feature development
  using SQL Server). The component and parent can be Partial, and the original
  attributed work quote is retained. Proficiency remains unverified.
- Matched / 1: credible explicit proficiency or direct practical responsibilities,
  such as independently/explicitly attributed schema design, query tuning or
  production troubleshooting. Literal “proficient” is not required. The existing
  concrete production-administration evidence remains sufficient. Direct action
  plus professional scope is required; duration alone is neither acceptance nor
  rejection. Generic MyBatis optimization establishes no database by inference.
- OR takes the strongest alternative: any Matched gives 1; otherwise any Partial
  gives 0.5; otherwise 0. Two Partial alternatives still give 0.5. A conflict
  retains the existing conflict-first zero-credit behavior. Required/preferred
  weights and rounding are unchanged: required Partial plus unknown preferred
  scores `round(100 * (3 * .5) / 4) = 38`.

The exact Axon sentence “Familiarity with or interest in AI-assisted development
tools, code generation, and automation workflows” now has two canonical predicates
(Familiarity / interest) with original JD linkage and OR semantics. Contextual
Claude/ChatGPT/Copilot/Cursor use for relevant software development activities can
support familiarity. Explicit relevant interest supports only interest. A bare tool
list, unrelated AI interest or holiday-planning use does not qualify. No claim of
code generation, automation work or professional experience is inferred. The
separate evaluation-AND-integration requirement retains its existing semantics.

Prompt instructions now reflect these two scoped policies. Both paths reuse exact
quote resolution and bounded recovery after weak or omitted selection, preserving
the invalid-quote suppression gate. Contiguous source passages retain recognized
adjacent role/project/employer attribution, reject merged entries, and use shortest
sufficient source choices. Negation and aspiration still apply; only this JD's
explicit interest predicate permits relevant interest. A use denial is not a denial
of interest. Contradiction within the same predicate remains Conflict.

| Exact synthetic evidence                                                                                                  | Before                                          | After                                                  |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `Databases: PostgreSQL, MySQL, SQL Server and Oracle`                                                                     | Unknown                                         | Unknown, exact mentions retained                       |
| `Developed enterprise features using SQL Server.`                                                                         | Unknown, work observation                       | Partial, exact work quote and observation              |
| Previous sentence + `Optimized data-access logic and MyBatis queries.`                                                    | Unknown                                         | Partial; no inferred SQL Server expertise from MyBatis |
| `Designed SQL Server database schemas for a production billing application.`                                              | Unknown under the older narrow proficiency rule | Matched, exact direct responsibility                   |
| `Proficient in SQL Server.` / `Thành thạo SQL Server.`                                                                    | Matched                                         | Matched                                                |
| `One year using SQL Server.`                                                                                              | Unknown                                         | Unknown; duration alone is not responsibility          |
| `Used Claude and ChatGPT for refactoring, prototyping and technical documentation in professional development workflows.` | Unknown                                         | Matched familiarity; exact source quote                |
| `I am interested in AI-assisted development tools, code generation, and automation workflows.`                            | Unknown                                         | Matched interest only; exact source quote              |
| `Tools: Claude, ChatGPT` / `I am interested in AI.`                                                                       | Unknown                                         | Unknown                                                |
| Affirmative SQL/AI evidence plus corresponding explicit denial                                                            | Conflict where represented                      | Conflict, zero credit; exact contradictory quotes      |

### CV Match presentation and viewport investigation

CV Match accepts component Partial plus bounded typed observation metadata. Expanded
requirements show verified technology mentions, verified professional experience,
exact original parsed CV passages and the qualification reason. Partial components
explicitly show unverified proficiency. Relevant observations replace the misleading
“Not evidenced in CV” placeholder. The gap overview says “needing more evidence”
when Partial evidence exists; fully supported component counts distinguish Partial
from absent evidence. Existing inspection/navigation and document scrolling remain.

The two earlier viewport failures were traced to test code hard-coding Application
as `job-panel-2`, which is now Improve CV. Both geometry and containment assertions
now locate Application by its accessible tab identity. No Application layout or
product scrolling behavior was changed, and the focused viewport tests pass.

### Real local Ollama acceptance

Temporary command: `node /tmp/p6-policy-acceptance.mjs`. Six sequential real local
`qwen3:4b` calls use the unchanged provider/profile/budget/schema checks via real
`JobMatchService.analyze` and `AiService`. An isolated current-source API build
passes `pnpm exec tsc -p /tmp/ajh-p6-policy-e_a0w8ry/apps/api/tsconfig.json`.
Synthetic parsed source strings and repositories are in memory; no database or
private saved sources are accessed. This acceptance does not claim PDF parsing or
real-CV acceptance. Only counts/statuses/exactness booleans are output.

| Real-provider synthetic case                                 | Target result                                    | Overall score | Nonempty selected quotes / rejected |
| ------------------------------------------------------------ | ------------------------------------------------ | ------------- | ----------------------------------- |
| Isolated AI contextual use                                   | Matched familiarity                              | 100           | 1 / 0                               |
| Isolated relevant AI interest                                | Matched interest; familiarity Unknown            | 100           | 2 / 0                               |
| Isolated SQL Server project + MyBatis                        | Partial, credit .5                               | 50            | 4 / 0                               |
| Isolated direct SQL Server schema design                     | Matched                                          | 100           | 1 / 0                               |
| Eleven-requirement Axon-style context, inline Skills heading | AI familiarity Matched; managed language Matched | 18            | 8 / 0                               |
| Same eleven requirements, separate Skills heading            | AI familiarity Matched; managed language Matched | 18            | 8 / 0                               |

Every target quote is an exact source span. These are six bounded samples, not a
provider reliability guarantee or predicted score for the private CV/jobs.

### Chromium smoke and screenshots

PASS — one scoped Chromium session, synthetic mocked HTTP responses throughout;
the match fixture comes from the real deterministic scorer, not live browser AI.
Opened CV Match, requested matching, used keyboard Enter to inspect Partial,
checked exact work/mention quotes, focused the quote and requirement, and verified
no false “Not evidenced in CV” placeholders for the observed alternatives.
Desktop 1280×900, narrow 390×844 and 200% **CSS zoom** show readable evidence with
no page horizontal overflow. This is not a claim of native browser zoom testing.
Console: zero errors or warnings. Initial smoke selectors were corrected to click
the actual CV Match tab and distinguish work from mention labels; no API/private
sources were accessed during these attempts.

Screenshots (synthetic, browser HTTP mocked):
[desktop](../../artifacts/p6-database-partial-desktop.png),
[narrow](../../artifacts/p6-database-partial-narrow.png),
[200% CSS zoom](../../artifacts/p6-database-partial-zoom200.png).

### Changed files and remaining limits

Code/tests in this checkpoint: `apps/api/src/matching/cv-match.coverage.ts`;
`apps/api/src/matching/cv-match.ts`; new
`apps/api/test/unit/cv-match.proficiency-ai-semantics.spec.ts`;
`apps/api/test/unit/cv-match.sql-server-evidence.spec.ts`;
`apps/web/src/features/inbox/CvMatchPanel.tsx`;
`apps/web/src/features/inbox/cv-match.types.ts`; new
`apps/web/test/cv-match.proficiency.test.tsx`; and
`apps/web/test/job-viewport.test.tsx`. Also this implementation record,
`docs/architecture.md`, and the three synthetic screenshots. Prior working-tree
changes are preserved. Partial components do not authorize affirmative proficiency
wording in P7 Suggestions; a focused compatibility regression checks that boundary.

Remaining bounds: explicit family grammar and vocabulary only; source choices are
bounded and may not include long/distant attribution. Complex multilingual work
phrasing can remain Unknown. Other requirement families can still be omitted by
the model. Real saved CV/job evidence and overall score remain unverified; reload
the updated API and explicitly Reanalyze to retest. No dependencies, migration,
private CV access, full CI gate, commit, push or PR. Stop for review before P7 UX
or P7.5.

### Final focused verification results

- PASS — `pnpm --filter @ai-job-hunter/api test --testPathPatterns='cv-match|cv-quote-resolution|match-evidence-validation|matching.spec|job-match.regression|discovered-match|axon-score-trace|suggestion-policy|cv-suggestions'`: **22 suites, 694 tests**. Includes existing Axon, AND/OR, negation, exact quote, attribution and suggestions compatibility coverage. Historical SQL work-only Unknown expectations were updated to the approved Partial policy, retaining exact quote assertions.
- PASS — `pnpm --filter @ai-job-hunter/web exec vitest run test/cv-match.proficiency.test.tsx test/cv-match.test.tsx test/job-viewport.test.tsx test/cv-suggestions.test.tsx`: **4 files, 69 tests**, including the investigated viewport failures.
- PASS — `pnpm --filter @ai-job-hunter/api typecheck` and `pnpm --filter @ai-job-hunter/web typecheck` on final production/test code.
- PASS — `pnpm exec eslint --max-warnings 0 apps/api/src/matching/cv-match.coverage.ts apps/api/src/matching/cv-match.ts apps/api/test/unit/cv-match.proficiency-ai-semantics.spec.ts apps/api/test/unit/cv-match.sql-server-evidence.spec.ts apps/web/src/features/inbox/CvMatchPanel.tsx apps/web/src/features/inbox/cv-match.types.ts apps/web/test/cv-match.proficiency.test.tsx apps/web/test/job-viewport.test.tsx`.
- PASS — scoped Prettier check for these eight code/test files plus `docs/architecture.md` and this record; `git diff --check` and new-file whitespace checks. Current backend `src` and the isolated live-acceptance build source compare identically.
- PASS — bounded six-call real-Ollama acceptance and the synthetic mocked-HTTP Chromium smoke above. Final screenshot refresh includes the clarified Partial summary copy; console remains free of errors/warnings.

Full CI parity remains pending until the separately authorized final pre-push gate.
No full workspace test command, commit, push or PR was run for this checkpoint.
