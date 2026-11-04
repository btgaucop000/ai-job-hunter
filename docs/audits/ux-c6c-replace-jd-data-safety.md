# UX-C6c — Replace JD data safety audit

Branch: `feat/p5-discover-page`. Scope: characterization and regression tests only.
Production code, merge policy, persistence semantics and existing work are unchanged.

Historical note: UX-C6d subsequently removed this workflow from Edit JD for MVP.
The findings below describe C6c's implementation. Its retired replacement tests
are superseded by [manual Edit JD safety tests](../../apps/web/test/edit-jd-safety.test.tsx).
Add Job import semantics and backend endpoints were not changed by that decision.

## Conclusion

The current section is a source-import and extraction editor, **not an atomic JD
replacement or a per-field acceptance workflow**. Existing nonempty fields survive
URL fetch, and edits made through the current editor session are normally protected
from successful extraction. However, historical manual intent is inferred rather
than stored, extraction applies suggestions directly, and source changes discard
old evidence/conflict state. The requested safety expectations are not fully met.

The strongest confirmed exception to manual protection is the extraction-error
branch: if the user explicitly clears Job description, a response carrying an
extraction error can fill it again from the response description. Tests characterize
this behavior; they do not endorse it.

## Source references

- [JobEditor](../../apps/web/src/features/inbox/JobEditor.tsx): saved-row loading and
  `editedFields`, `change`, `sourcesChanged`, `extract`, `fetchFromUrl`, `attach`,
  `save`, `dirty`, import controls, candidate buttons and conflict checkboxes.
- [URL preview application](../../apps/web/src/features/inbox/job-url-import.ts):
  `applyUrlJobPreview` appends sources, clears evidence and fills unprotected blanks.
- [Opportunity request/payload](../../apps/web/src/features/inbox/opportunities-api.ts):
  editable contract, `opportunityRequest` and multipart `importUpload`.
- [Bookmarklet](../../apps/web/src/features/inbox/topcv-bookmarklet.ts): opens
  `/jobs/new`; existing-job editors do not register the receive handler.
- [Controller](../../apps/api/src/opportunities/opportunities.controller.ts): preview,
  parse/extract and PUT routes; saved-document injection for existing-job extraction.
- [Import service](../../apps/api/src/opportunities/job-import.service.ts): parse and
  extraction return results without saving opportunities, including error results
  containing raw source text and a combined description.
- [Update service](../../apps/api/src/opportunities/opportunities.service.ts):
  document preservation, validation, normalization and the database transaction.
- [Evidence validation](../../apps/api/src/opportunities/job-import.contract.ts):
  `validateImportReview` validates evidence against source text and unresolved
  conflicts; an empty review list is permitted for manual editing.

## Protection established on load

The frontend copies editable saved fields into `form` and records a JSON baseline.
It rebuilds an in-memory `editedFields` set:

- With an old review entry: a field is protected when its current value differs
  from that entry's suggested value. Equality means it remains replaceable,
  regardless of `reviewed` or whether a human deliberately retained that value.
- Without an old review entry: nonempty values are protected; empty values are not.
- Any nonempty saved Job description is protected, even if originally generated.
- Changing a structured field or description in the current session marks it
  protected, including an intentional blank. This set is not persisted. It remains
  during Save in the current mount, but is reconstructed on reload.

Thus the implementation cannot distinguish every saved manual choice from a prior
automatic suggestion, particularly equal-to-suggestion values and intentional blanks.

## Complete data flow

| Action                                        | Source text / document state                                                                                                                                                                                                                                                             | Job details and evidence                                                                                                                                                                                                                                     | Dirty state / persistence                                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open/close the replacement disclosure         | Native details retains its mounted controls and their state.                                                                                                                                                                                                                             | No field or evidence changes.                                                                                                                                                                                                                                | No dirty change and no request.                                                                                                                                                                                                               |
| Select URL / Bookmarklet / Paste / Upload     | Only `importMethod` changes; source text and pending file are retained. The visible preview changes with the selected method.                                                                                                                                                            | No structured-field or evidence changes from selection itself.                                                                                                                                                                                               | No dirty change or request from selection. **Method selection does not scope which retained sources are later extracted/saved.**                                                                                                              |
| Type a new URL                                | Immediately changes canonical `form.originalLink`, also displayed as Original link among job fields.                                                                                                                                                                                     | Marks originalLink edited; does not clear old evidence by itself.                                                                                                                                                                                            | Dirty if the draft differs from baseline; no fetch or Save yet.                                                                                                                                                                               |
| Fetch from URL                                | Explicit POST `/import-url` returns a preview. `preview.sourceText` is **appended** to existing postText with a blank line. Repeated fetches can append duplicates. Above the 12,000-character combined limit, application rejects the preview and retains the draft before application. | Clears importReview. Existing nonempty values survive. Unprotected empty title, company, location, description, originalLink, salary, experience and workMode may be filled immediately. No per-field acceptance is requested. Does not set document jdText. | Usually dirty from source/evidence/value changes. Preview request does not persist an opportunity. Failure does not apply the preview; prior URL typing remains.                                                                              |
| Paste or edit Recruitment post                | Replaces `form.postText` on each keystroke. Does not remove a retained pending upload or saved document.                                                                                                                                                                                 | Clears **all** importReview entries via sourcesChanged; retains structured values and Job description. The old conflict checkboxes and save-blocking conflict list disappear.                                                                                | Dirty when serialized form differs; no request or persisted write until explicit processing/Save.                                                                                                                                             |
| Change Source selector                        | Changes `form.source` immediately; AI does not infer this field.                                                                                                                                                                                                                         | Other fields stay intact.                                                                                                                                                                                                                                    | Dirty if changed; no request until Save/explicit processing.                                                                                                                                                                                  |
| Select a valid new document                   | For a job without documentName: stores File, clears local jdText, clears review and explicitly POSTs bytes to `/parse-document`. Successful response sets local jdText preview. Invalid type/size is rejected before these changes.                                                      | Structured fields and Job description stay intact; old evidence/conflicts are removed.                                                                                                                                                                       | File alone activates dirty. No opportunity write during parse. The file stays selected even on parse failure; Save becomes enabled again after parsing if other validation permits, and the server will have to parse the file again on Save. |
| Remove pending document                       | Aborts/invalidate pending parse, clears File and local jdText, clears review.                                                                                                                                                                                                            | Structured fields remain.                                                                                                                                                                                                                                    | Dirty follows the remaining form diff; can become clean if no other changes and original review was already empty.                                                                                                                            |
| Select Upload for a job with a saved document | Shows its name and download; no replacement file picker.                                                                                                                                                                                                                                 | No change.                                                                                                                                                                                                                                                   | No write. Backend also rejects replacing an existing original document.                                                                                                                                                                       |
| Run Extract with AI                           | Explicit POST `/:id/extract` sends current postText plus retained File, **regardless of selected method**. With a saved original document, backend injects that document. Local jdText becomes response jdText.                                                                          | On success, applies eligible suggestions directly to current form and replaces importReview with the new entries. The existing nonempty description normally remains protected. Details below.                                                               | Dirty if form/review changes. `jdText` alone is not included in dirty calculation. Extract endpoint returns data but does not save the opportunity.                                                                                           |
| Acknowledge a conflict checkbox               | Source is unchanged.                                                                                                                                                                                                                                                                     | Changes only that review entry's reviewed flag; the displayed current field need not equal a candidate. Save unblocks when no unresolved conflict remains.                                                                                                   | Review change activates dirty when different from baseline; no persistence.                                                                                                                                                                   |
| Choose Use this value                         | Source unchanged.                                                                                                                                                                                                                                                                        | Explicitly replaces the field, marks it edited and sets its conflict reviewed=true. Subsequent manual typing resets that conflict acknowledgement to false.                                                                                                  | Dirty; persistence waits for Save.                                                                                                                                                                                                            |
| Save                                          | Sends the whole current form draft and retained File if present, not just visible-tab values or values explicitly accepted individually. Local jdText preview is not in the JSON record.                                                                                                 | Frontend checks title, safe originalLink and unresolved conflicts. Backend validates the record and any remaining evidence; does not call AI to decide fields.                                                                                               | PUT updates persisted data only after validation and transaction save. Details below.                                                                                                                                                         |

### Bookmarklet limitation

The Bookmarklet controls are present, but the generated bookmark opens Add Job and
the existing-job component returns early before registering `receiveTopcvPage`.
It does not import into the currently edited saved job. This is an existing
workflow limitation, not a replacement capability verified by C6b's card checks.

### Extraction application and exceptions

Successful extraction skips fields in editedFields. For other fields it applies
nonempty suggested values without a field-level confirmation; supported suggestions
need not have reviewed=true before Save. Missing domain/workMode suggestions can
clear those fields if unprotected. Other missing/blank suggestions generally retain
the previous value. A new CONFLICT response blocks Save until acknowledged or until
the review list is otherwise invalidated by a source edit.

There is a further URL-preview rule: when the fetched source remains in postText,
existing fetched title/company/location/originalLink/salary/experience/workMode
are retained against later suggestions. A SUPPORTED experience suggestion is an
explicit exception and may replace unprotected experience. Current-session manual
protection is checked before these rules.

On successful extraction, description is retained if marked edited or if it belongs
to a retained fetched source; otherwise a nonempty response description can replace
it. On a response with `error`, structured suggestions are not applied, but the code
sets `description = oldDescription || responseDescription` without consulting the
edited set and clears importReview. Therefore explicitly clearing a manual
description does not protect it on this error path. A thrown/network error, in
contrast, reports the error without applying that response branch.

A generic refresh confirmation appears only when importReview is already nonempty.
URL fetch, pasted-text edits and document selection clear that list, so the next
extraction can run without that confirmation. The visible review notice is advisory;
there is no granular old/new replacement confirmation for supported suggestions.

### Unsaved state and Save boundary

Dirty is exactly: serialized `form` differs from its baseline, **or File exists**,
or the temporary latest-contact date differs from form.contactDates. Import method,
disclosure state, local jdText, fetched-preview ref, error and notice are not direct
dirty inputs. Evidence invalidation may itself make the draft dirty even when the
structured values are unchanged.

Save sends all current editable fields, postText and importReview, including
automatic extraction changes. It reconciles only the displayed latest contact
date while preserving hidden date history. It uses JSON unless a File exists or
the record is over 20,000 characters, in which case the record is multipart.

On the server, a new File is parsed again; its text becomes persisted jdText.
Without a File, existing persisted jdText is retained, rather than accepting the
frontend's local preview. A saved original document cannot be replaced. The server
validates evidence quotes/status/value derivation against current post/document
sources and requires unresolved conflicts to be acknowledged; an empty review list
is valid. It trims/normalizes selected fields, then saves the opportunity in a
transaction. The UI updates its baseline/document metadata after successful Save;
failure retains the draft for correction. Preview/parse/extract endpoints do not
update the opportunity.

## Findings requiring review

| ID     | Risk / expected behavior gap                                                                                                                                                                                                                                                                         | Evidence                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| C6c-01 | A saved value equal to its old suggestion is replaceable, even if a person intended to keep it. Saved manual blanks also lose their session-only protection on reload. Historical manual protection is not reliable.                                                                                 | Loader inspection; extraction regression replaces saved company equal to old review value while preserving a differing saved location. |
| C6c-02 | An extraction-error response refills a manually cleared description. This directly contradicts unconditional preservation of current manual edits.                                                                                                                                                   | Focused regression with a mocked error response.                                                                                       |
| C6c-03 | Changing pasted text, fetching a URL or selecting a document discards all old evidence/conflict acknowledgements and can enable Save without resolving the former conflict. This is the existing manual-edit path, not a new security bypass; it does not satisfy a strict retained-review workflow. | Unit tests and mocked Chromium: conflict Save disabled → paste → no checkbox and Save enabled.                                         |
| C6c-04 | URL import fills unprotected blank details; extraction automatically replaces eligible values/clears domain/workMode. Save requires no per-field acknowledgement for supported results. Values are visible/editable, but there is no explicit old/new replacement acceptance.                        | Unit payload assertions; mocked Chromium salary fill and company replacement.                                                          |
| C6c-05 | Sources are combined/retained rather than replaced: URL fetch appends to postText; pending uploads survive method selection; saved documents are reused for extraction and preserved on Save. New sources can coexist with old protected details/description.                                        | URL/upload tests and controller/service inspection.                                                                                    |
| C6c-06 | A document parse error retains a dirty pending File and permits retry through Save once parsing stops; saved-original documents cannot be replaced at all. The section title can suggest broader replacement support than exists.                                                                    | Parse-failure and saved-document regressions; server reject path inspected.                                                            |
| C6c-07 | Bookmarklet opens Add Job rather than populating the current saved job.                                                                                                                                                                                                                              | Generated URL and receive-handler guard inspection; no external page processing invoked.                                               |

No merge-policy or persistence changes are proposed as already approved. Review is
needed on what counts as protected manual intent, whether source changes should
retain old review context, and which explicit acceptance is required before applying
replacement values. Any fix to those rules is a separate implementation checkpoint.

## Verification

The C6c characterization tests (superseded in C6d, as noted above) covered
disclosure/method switching, URL append/autofill, conflict clearing on paste, document
parse success/failure and retained upload across methods, inferred versus session
manual protection, automatic field clearing, the error-description exception,
conflict acknowledgement/edit/reset/candidate selection, Save payloads and the
saved-document picker restriction. Mocks capture the outgoing draft and do not
claim to execute database validation or writes.

Mocked Playwright MCP Chromium at 1440×900 intercepted **all** API requests with
synthetic data. No Ollama, external source fetch, real parsing or real Save ran.
It confirmed disclosure has no request side effects, a blank salary is autofilled,
an unprotected company is replaced by extraction while session title/differing
location/nonempty description survive, and editing paste removes conflict gating.
The final synthetic draft showed Company=New company, title=Session manual title,
location=Manual city, description=Saved manual JD and Save enabled with no conflict
checkbox. Browser console: zero errors/warnings. These are characterization results,
**not a PASS against all requested safety expectations**.

Verification executed: 42 focused tests passed across replace-jd-safety, job-import,
import-methods and url-import-extraction; frontend typecheck passed. Whitespace
checks include the new, untracked audit and regression-test files.
No production code, dependencies, DB data/schema, commit, push or PR changes.
