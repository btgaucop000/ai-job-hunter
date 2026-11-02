# CV matching regression investigation — 2026-10-30

## Decision and limits

Treat the reported 27 → 0 change as unresolved until the actual inputs and model
output can be examined with authorization. No private CV/job records, private
logs or real matching requests were read or executed. No Ollama requests were
made. No discovery source/filter behavior or existing records were changed.

## Confirmed pipeline behavior

- Saved CV storage is keyed by the existing server-selected local owner. Text is
  hidden in metadata queries, but analyze explicitly selects `text: true` and
  sends it with canonical job fields, description, post and JD. Discovery has no
  code path that updates the CV; duplicate import skips existing jobs.
- Source and compiled matching code both include the accepted Java/duration
  recovery. No evidence was found that discovery changed matching weights or
  thresholds. This is code evidence, not verification of the user's saved row.
- Provider timeout, invalid JSON and schema failure already threw exceptions;
  no provider catch explicitly returned a zero score.
- However, the matching schema accepted an empty `requirements` array. Canonical
  synthesis could then create an all-unevidenced assessment and score it zero.
  A saved row with blank CV text was also not rejected. Invalid evidence quotes
  were silently discarded; incomplete model coverage became negative evidence.
  These failure modes were reproduced with synthetic tests before the fix.
- The UI displayed the returned score directly, without a default-to-zero
  conversion. It did clear the previous result before every reanalysis.

## Fix

Add boundary failures for missing CV text and empty, incomplete or unverifiable
assessments before scoring. Return safe error codes distinguishing missing input,
timeout, invalid output, incomplete coverage and evidence rejection. Do not
return a fit score on these errors. Preserve genuine zero scores for a complete
negative assessment. Reject coding-tool quotes for production AI/ML evidence,
while allowing explicit coding-tool requirements to use such evidence.

Keep the previous successful UI result after a failed reanalysis, clearly marked
as previous; invalidate after actual job/CV changes. Validate success response
shape before displaying a score. No new keyword matching fallback, weight,
threshold, schema migration or persistence change was introduced.

## Synthetic verification

The accepted-style synthetic AI Developer fixture returns **27/100**, with exact
CV quotes for Backend Java and Minimum 3 years, and no AI/ML production credit.
A mocked provider exercises the real AiService schema validator, MatchingService,
JobMatchService and HTTP controller/error filter. Errors return 400/503/504, not
score zero. DOM tests cover last-result preservation and malformed-success
rejection. The existing isolated PostgreSQL CV-upload/reanalysis test now supplies
complete evidence-grounded mocked assessments, rather than an omitted Java row
or a fabricated Python quote after changing the CV.

## Discovery source findings — public data only

One bounded read of each configured public feed, with no imports, observed:

| Feed     | Public rows | HCMC rows | Current filter eligible | Eligible mobile | Eligible outside HCMC |
| -------- | ----------: | --------: | ----------------------: | --------------: | --------------------: |
| Axon     |         462 |        21 |                       6 |               1 |                     0 |
| Backbase |          63 |         3 |                       2 |               0 |                     0 |

Feeds:

- https://boards-api.greenhouse.io/v1/boards/axon/jobs?content=true
- https://boards-api.greenhouse.io/v1/boards/workatbackbase/jobs?content=true

Greenhouse documents these GET endpoints as public:
https://docs.greenhouse.io/job-board.html . The API robots policy was checked
before reading; these paths are permitted (`/embed/` is disallowed).

Axon's eligible mobile listing is Senior Mobile Android Engineer I:
https://job-boards.greenhouse.io/axon/jobs/7624224003 . Java OR matching accepts it
because there is no backend/web role-family relevance gate. Synthetic ranking
probes give the same score (26) to Senior Backend Java and Senior Mobile Android
when both contain Java with the same location/seniority/work mode.

HCMC, seniority and work mode are **ranking preferences**, not hard constraints.
A synthetic Hanoi role still scores 15, and a junior HCMC role scores 21. The
service imports all non-null-ranked candidates, up to 50 new records, including
lower-ranked ones. Known foreign locations generally fail eligibility, but this
does not enforce HCMC. The current live snapshot having no eligible outside-HCMC
rows does not establish a strict location filter. Outside-HCMC records must not
be interpreted as local merely because the HCMC selector was used.

Useful public HCMC evidence includes Axon's Senior Backend Engineer I
(https://job-boards.greenhouse.io/axon/jobs/7694613003). Backbase's board currently
shows only three HCMC roles, including AI Applied Software Engineer and SDET;
these do not necessarily match a senior Java/backend target. Two employers are
not broad HCMC market coverage. No source replacements or discovery feature
changes were made during this investigation.

## Remaining blocker and diagnostic authorization

The actual regression's cause is **not confirmed**. Authorization is required to
locally inspect the saved CV text and the affected job's exact canonical fields,
compare availability/revisions/quotes, and reproduce evidence linkage without
inference or private text in reports/logs. If that does not identify the cause,
separate authorization is needed for one bounded local matching request with its
normal provider context preflight and structured response inspection. No such
private-data inspection or inference has been performed.

## Changed files

- `apps/api/src/matching/cv-match.error.ts`
- `apps/api/src/matching/cv-match.ts`
- `apps/api/src/matching/job-match.service.ts`
- `apps/api/src/opportunities/opportunities.controller.ts`
- `apps/web/src/features/inbox/CvMatchPanel.tsx`
- `apps/api/test/unit/job-match.regression.spec.ts`
- `apps/api/test/integration/cv-match.spec.ts`
- `apps/web/test/cv-match.test.tsx`
- `docs/architecture.md`
- `docs/cv-match-regression-investigation.md`
