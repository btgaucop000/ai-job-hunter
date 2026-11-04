# UX foundation — design consistency audit

Date: 2026-11-04. Branch: `feat/p5-discover-page`.
Status: audit and proposal only; implementation requires checkpoint approval.

## Executive summary

The application has a coherent starting point: one React/MUI theme, teal primary
color, an 8px spacing base, shared page headings, semantic feedback and outlined
surfaces. The variation comes mainly from local component usage and incomplete
shared state conventions, rather than competing themes or a defect in MUI.

The highest-priority confirmed issue is warning-text contrast. Other confirmed
differences include selected-filter styling, link rendering, chip density,
button target sizes and asynchronous feedback. Some are legitimate contextual
differences: Review is secondary to Discover, reanalysis is less prominent after
results exist, and Application uses document scrolling while Edit JD has a
persistent save row. These should not be flattened into one layout.

Retain the brand palette and standard MUI components. First correct semantic
contrast and define consistent keyboard focus, then make small, screen-specific
usage corrections. Do not introduce an AppButton wrapper or a new design-system
framework. Many recommendations below are proposed conventions, not defects.

## Evidence and limits

Read [AGENTS.md](../../AGENTS.md) and the existing
[UX guidelines](../ux-guidelines.md). This audit supplements those guidelines;
their spacing, typography, responsive and screen-preservation rules remain the
baseline. Inspected the current working tree, including P5.3c–e work, rather than
only committed HEAD. File locations below are repository-relative and refer to
this snapshot; line numbers may move during implementation.

Evidence consists of source inspection, searches across `apps/web/src`, installed
MUI component implementation inspection, and a read-only Node palette/contrast
probe. No browser session or screenshot inspection occurred. No API, discovery,
CV upload, Ollama request, database operation or application mutation ran. Existing
tests were read for regression targets, not executed for this documentation task.
Browser acceptance and actual rendered focus/overflow checks remain pending.

Labels used in the inventory:

- **Confirmed:** the differing code or calculated token result is directly observed.
- **Recommendation:** a proposed convention or usability improvement requiring approval.
- **Context:** an intentional or defensible difference; preserve unless separately approved.

High means an accessibility barrier or material workflow risk; Medium means a
prominent clarity/interaction inconsistency; Low means minor presentation drift.
A code-level risk is not a claim of a reproduced browser failure.

## Current design-system findings

### Theme, palette and component defaults

`apps/web/src/main.tsx:16` mounts one `ThemeProvider`, `CssBaseline` and shared
`NotificationProvider`. The only `createTheme` in application source is
`apps/web/src/app/theme.ts:3`. The source hex/RGB scan found literals only in that
theme: primary `#176b5b` and page background `#f5f7f6`. Local code mostly uses
`primary.main`, `text.secondary`, `divider`, `action.selected` and other semantic
tokens. No competing custom button class system was found.

| Foundation             | Current evidence                                                                                                                                                                      | Assessment / ownership                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette                | `theme.ts:4`: only primary.main and background.default specified; MUI derives primary light/dark/contrastText; semantic colors use installed defaults.                                | Brand is consistent. Semantic foreground/background pairs need explicit verification, not wholesale recoloring. Theme owns reusable pairs.                                                  |
| Buttons                | `theme.ts:22`: sentence case via typography, elevation disabled, 32/36/44px minimum heights, 2px teal focus outline with 2px offset. No global variant override.                      | Sound foundation. Omitting a variant leaves MUI text buttons; action hierarchy therefore depends on each call site.                                                                         |
| Icon buttons / toggles | No MuiIconButton override; MuiToggleButton only changes casing at `theme.ts:36`. Installed IconButton/ToggleButton enable focus ripple unless disabled.                               | Keyboard focus differs from the explicit Button outline. This is confirmed coverage variation, not proof that focus is invisible. Inspect in browser before changing it.                    |
| Chips / alerts         | No MuiChip or MuiAlert overrides. Call sites select size, variant, severity and wrapping.                                                                                             | Absence of an override is not a defect. Avoid global Chip/Paper/Accordion styling merely for visual uniformity. Semantic warning foregrounds are a concrete exception needing a narrow fix. |
| Typography             | `theme.ts:11–18` matches most guideline metrics; subtitle1 is weight 400 / line-height 1.75 versus the guideline subsection convention of 500 / 1.6.                                  | Confirmed rule/token mismatch. Local headings often add 600; Candidate Review does not. Decide heading-specific use before globally changing subtitle1, which also serves metadata.         |
| Layout                 | `PageHeader.tsx:14` centralizes title/actions without gutters; App owns Container gutters. `JobActionLayout.tsx:30` owns fields/actions; Discovery has its own measured viewport fit. | Share conventions, retain screen ownership. These are not interchangeable generic panel layouts.                                                                                            |
| Local styling          | Repeated responsive 44px button minimums, font weights, wrapping, focus outlines and sentence-case overrides.                                                                         | Some duplication reflects incomplete defaults; much is meaningful layout/evidence presentation. Remove only proven redundant declarations in approved screens.                              |

### Calculated contrast evidence

A Node probe used the installed `@mui/material/styles` `createTheme` with the same
palette inputs and inspected the derived tokens. Ratios below use sRGB relative
luminance and `(lighter + 0.05) / (darker + 0.05)`, rounded to two decimals. They
measure opaque pairs, not a browser screenshot or all composited interaction states.

| Pair                                                | Ratio  | Conclusion                                                                                                                                |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Primary teal / white (including white text on teal) | 6.38:1 | Passes 4.5:1 normal-text criterion. No evidence for replacing brand teal.                                                                 |
| Primary teal / page background                      | 5.93:1 | Passes normal-text criterion.                                                                                                             |
| Default warning main `#ed6c02` / white              | 3.11:1 | Below normal-text criterion. Current filled warning Chips use white contrastText; warning text buttons use this orange on light surfaces. |
| Default error main `#d32f2f` / white                | 4.98:1 | Suitable normal-text pair for an explicit destructive text action on white.                                                               |
| Default success main `#2e7d32` / white              | 5.13:1 | Suitable normal-text pair; keep success distinct from selection.                                                                          |

Confirmed by installed `Chip/Chip.js`: filled colored Chips use palette[color].main
and contrastText. This affects JobEditor “Unsaved changes” and API-unavailable
warning Chips. Installed standard Alert uses its own severity/variant treatment;
**do not extrapolate the filled-Chip failure to every warning Alert**. Also, simply
using warning.dark `#e65100` as white-background text is insufficient: 3.79:1.

Recommended first option: retain warning orange and choose a verified dark
warning.contrastText for filled indicators. Restyle actual destructive text actions
with error semantics locally. Alternative: scope the foreground correction to
filled warning Chips if changing the palette pair would affect other uses. Compare
both in a synthetic preview before approval; no global contrastThreshold increase
or brand-color change is justified by this evidence.

## Screen-by-screen issue inventory

| ID / screen and code location                                                                                             | Current styling or interaction                                                                                                                                                                                     | Why it differs / evidence class                                                                                                                                                           | Recommended behavior                                                                                                                                                                                                             | Severity                                                | Theme or local                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| F1 — Unsaved/readiness indicators: `JobEditor.tsx:562`, `:572`; `features/health/ApiReadiness.tsx:64`                     | Small filled warning Chips use default white-on-orange.                                                                                                                                                            | **Confirmed:** 3.11:1 for small text, below 4.5:1.                                                                                                                                        | Verify a dark foreground on retained warning fill; retain status words and live announcement.                                                                                                                                    | High                                                    | Shared semantic pair or narrowly scoped MuiChip variant.            |
| F2 — Focus foundation: `theme.ts:25`; `ImportMethodCards.tsx:81`; `CvMatchPanel.tsx:771`; `JobInbox.tsx:278`              | Button and evidence summaries have 2px rings; cards use 3px; icon/toggle buttons rely on MUI focus ripple.                                                                                                         | **Confirmed variation; recommendation:** explicit ring policy does not cover all controls. No reproduced focus loss.                                                                      | Standardize a 2px/2px focus token for applicable interactive components after contrast/clipping inspection. Keep ripple and selected states distinct.                                                                            | Medium                                                  | Theme for common controls; local for cards/evidence.                |
| D1 — Discover controls: `DiscoverJobs.tsx:94–108`, `:214`                                                                 | Main action contained; preferences/details text; primary/preferences minimum 44px on xs, Run details uses default 36px.                                                                                            | **Confirmed** target-size variation, while action hierarchy is correct.                                                                                                                   | Preserve variants, compact summary and popover. Apply the approved touch target rule to Run details; check long stack label and helpers at four-column width. Label clipping is unverified.                                      | Medium                                                  | Local responsive sizing; optional shared coarse-pointer token.      |
| D2 — Discover completion: `DiscoverJobs.tsx:50–58`, `:222`                                                                | Disabled button and separate live loading text; metrics in shared success/warning Snackbar, details in popover.                                                                                                    | **Context:** behavior is accurate; differs from Saving… button copy elsewhere.                                                                                                            | Keep count semantics, failure severity and overlays. Consider consistent busy naming/aria-busy without moving the summary inline.                                                                                                | Low                                                     | Local; keep notification host.                                      |
| Q1 — Queue filters vs Inbox: `DiscoveryQueue.tsx:131–146`; `JobInbox.tsx:104–118`                                         | Selected Queue button is contained teal; Inbox uses ToggleButtonGroup with neutral default selection and 44px targets.                                                                                             | **Confirmed:** selection and primary-action emphasis have different visual grammar; Queue includes both selected fill and Discover fill. A selected filter is not a second submit action. | Prefer a common, low-emphasis selected-filter treatment; keep existing pressed/exclusive semantics and URL handlers. Treat replacing controls as a separate interaction change.                                                  | Medium                                                  | Local variants/color; theme may supply state tokens.                |
| Q2 — Queue rows: `DiscoveryQueue.tsx:211`, `:256`, `:279`                                                                 | Small filled neutral status, outlined Review, text Open Inbox job; selected row has teal edge and selected background.                                                                                             | **Context:** secondary Review fits the hierarchy; navigation is already an anchor through Router Link.                                                                                    | Keep Review outlined and the active-row cue. Define status-label casing/density alongside detail view; do not recolor SAVED as an application success.                                                                           | Low                                                     | Local only.                                                         |
| Q3 — Queue viewport: `DiscoverJobsPage.tsx:26–63`; `DiscoveryQueue.tsx:162`, `:291`                                       | Measured desktop fit; row-only scroller, separate controls and pagination; natural narrow/short fallback.                                                                                                          | **Context:** deliberately differs from document-scrolling detail tabs. Browser geometry has not been accepted in this session.                                                            | Preserve fit threshold, ten-row pages, URL state, row region continuity, overlay notifications and Review focus return.                                                                                                          | Low                                                     | Preserve local ownership; browser acceptance gate.                  |
| R1 — Candidate Review actions: `DiscoveryCandidateReview.tsx:240–277`                                                     | Close and Mark as seen text, Dismiss outlined teal, Save contained teal; Open Inbox replaces Save after linkage.                                                                                                   | **Context + recommendation:** Dismiss is reversible via Dismissed filter, not deletion. Mark as seen could be secondary, but its current lower emphasis is defensible.                    | Keep one primary Save/Open action. Approve whether Mark as seen should become outlined; do not automatically make Dismiss red or add confirmation.                                                                               | Low                                                     | Local decision.                                                     |
| R2 — Candidate Review typography/targets: `DiscoveryCandidateReview.tsx:175`, `:204`, `:240`                              | Default-size Chip, subtitle1 headings without local 600, default 36px action minimums; Queue uses small Chips and 600 row titles.                                                                                  | **Confirmed:** same candidate changes badge density and heading emphasis; mobile dialog actions differ from 44px row Review.                                                              | Use compact neutral status in both, explicitly apply subsection-heading convention and touch-safe dialog actions. Keep body text readable and one content scroller.                                                              | Medium                                                  | Local; do not change all subtitle1 or all Chips to fix this screen. |
| I1 — Inbox: `JobInbox.tsx:230–290`                                                                                        | Small outlined wrapping status Chips, 44px external-link icon with accessible name/Tooltip, title rendered as MUI Link; neutral filters.                                                                           | **Context:** table density and wrapping are intentional. Badge variant differs from filled job status on detail.                                                                          | Keep icon target/name and wrapping. Decide whether the same job status should use outlined neutral badges everywhere; no application-state color map by guesswork.                                                               | Low                                                     | Local; status convention rather than new component framework.       |
| J1 — Details Overview / import links: `JobEditor.tsx:681`, `:847`; `TopcvBookmarkletInstall.tsx:22`                       | Native anchors for original job, download and draggable bookmarklet; other destinations use MUI Link or Button-as-anchor.                                                                                          | **Confirmed:** native anchors bypass MUI link color/typography/hover conventions; actual browser default/visited appearance unobserved.                                                   | Use MUI Link presentation for content links. Preserve href, download/navigation behavior and bookmarklet ref, explicit href assignment, dragging and preventDefault. Never turn the bookmarklet into an ordinary command button. | Medium                                                  | Local usage; shared MuiLink policy only if needed.                  |
| J2 — Details CV Match: `CvMatchPanel.tsx:168–210`, `:350`, `:520`, `:725–777`                                             | Analyze contained initially, reanalyze outlined; small text CV upload; neutral score/evidence surfaces, text-colored evidence buttons, selected inset edge. Redundant disableElevation/textTransform repeat theme. | **Context:** result-dependent hierarchy and low-emphasis evidence are useful. Redundant declarations are confirmed but harmless.                                                          | Preserve score neutrality, evidence links, accordion transitions and exact navigation. Remove redundant declarations only within approved cleanup. Review touch size of CV upload without changing upload behavior.              | Low                                                     | Local; no global Accordion or score redesign.                       |
| J3 — Application vs Edit JD: `JobEditor.tsx:500–525`, `:1231–1338`; `JobActionLayout.tsx:22–29`                           | Application uses compact fields and right-aligned contained Save; Edit JD uses normal fields and stretch footer Save; validation errors can reset field scroll.                                                    | **Context:** tracking form density and persistent editor actions are deliberate. Error-triggered scrolling differs from layout-stable Discovery.                                          | Preserve save-all-sections behavior, tab state and scroll ownership. Any error-scroll/focus revision requires workflow approval; never add a global TextField size or generic sticky footer.                                     | Low                                                     | Local and separately approved if behavior changes.                  |
| A1 — Add Job source step: `JobEditor.tsx:949–980`                                                                         | Optional Extract with AI is contained, Continue to Review & Save outlined.                                                                                                                                         | **Confirmed emphasis; recommendation:** optional extraction dominates required progression, despite manual entry being supported. Not a matching/extraction defect.                       | Consider contained Continue and outlined Extract, in their existing locations. Keep explicit extraction and manual flow; no automatic AI or step advancement changes.                                                            | Medium                                                  | Local usage; approval needed.                                       |
| A2 — Add Job cards: `ImportMethodCards.tsx:57–107`                                                                        | Outlined cards, selected neutral fill/teal border/check, 3px focus ring; source input includes native file picker.                                                                                                 | **Context:** cards are selection controls, not competing primary command buttons.                                                                                                         | Keep cards, keyboard pressed states, panel controls and platform file picker. Align ring token only; do not replace cards with a new selector.                                                                                   | Low                                                     | Local focus change only.                                            |
| N1 — Shared notifications / validation: `Notifications.tsx:35–81`; `JobEditor.tsx:711`, `:1042`; `SourceJdPreview.tsx:75` | Portal Snackbar: success 3s, info 6s, warning/error persist; inline request/conflict/field feedback remains. Long success text may get 3s; persistent warnings queue ahead of later success.                       | **Confirmed policy; recommendation:** timing/backlog can affect discoverability, but no reproduced loss. Different inline/overlay roles are intentional.                                  | Keep inline actionable errors and field helpers; short successes in Snackbar. Prefer concise copy + persistent details over increasing every timeout. Approve timing or queue-policy changes separately.                         | Medium                                                  | Shared host for timing; local copy/validation.                      |
| C1 — Discard confirmation: `UnsavedJobGuard.tsx:55–64`                                                                    | Both actions are text; Discard uses warning.main; no explicit autofocus on Stay. Duplicate confirmation in `DiscoveryCandidateReview.tsx:321` explicitly focuses Cancel and uses contained primary confirmation.   | **Confirmed:** destructive-text contrast 3.11:1 on white; hierarchy/default-focus intent differs.                                                                                         | Use error styling for Discard, outline Stay and explicitly focus Stay. Keep safe action first and destructive last; do not auto-proceed or weaken guard.                                                                         | High for contrast; Medium for emphasis/focus convention | Local action usage; semantic contrast uses theme.                   |
| S1 — Spacing/heading reuse: `DiscoverJobsPage.tsx:68–78`; `JobInbox.tsx:71`; `JobEditor.tsx:489–544`; `PageHeader.tsx:14` | Discovery/Inbox use 16px compact spacing; editor uses 24px sections and a custom status/tab heading.                                                                                                               | **Context:** valid tokens serve different information density. No widespread off-scale spacing found.                                                                                     | Keep 8px base and local 4/8/12/16/24/32 rhythm. Do not force the editor into PageHeader if it changes tab/scroll behavior.                                                                                                       | Low                                                     | Preserve; optional local polish only.                               |

## Proposed minimal MUI usage matrix

These are proposed refinements to the [existing guidelines](../ux-guidelines.md),
not authorization to modify their current screen exceptions.

| Purpose                   | Default usage                                                                                                                                                         | Placement / state contract                                                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary command           | Button contained primary, medium; sentence case, no elevation.                                                                                                        | One dominant command per action group; right/end on desktop, wrap/stack naturally on mobile. Loading preserves label width/target, prevents duplicate submission and has an announced status.                                                        |
| Secondary action          | Button outlined, normally primary; medium.                                                                                                                            | Alternatives beside/before primary; Review, optional extraction or alternate route according to local hierarchy. Do not give every row a filled primary action.                                                                                      |
| Tertiary action           | Button text, medium or small in dense metadata.                                                                                                                       | Close, expand details, Back, incidental actions. Low emphasis is intentional, not an incomplete style.                                                                                                                                               |
| Destructive action        | Explicit label; Button error, outlined/text unless destructive confirmation is the sole primary command.                                                              | Confirmation keeps safe action first and initially focused, destructive last. Reversible Dismiss need not be red. Color never replaces the verb or confirmation context.                                                                             |
| Navigation                | MUI Link with Router Link for inline internal destinations; MUI Link with href for external/content/download links. Button component=Link/a for task-like navigation. | Preserve native anchors, browser navigation, href and external rel protections. Tabs switch panels; disclosure buttons change local state. Bookmarklet remains a draggable anchor.                                                                   |
| Selection/filter          | ToggleButtonGroup or pressed buttons with equivalent low-emphasis selected tokens.                                                                                    | Distinguish selection from submit priority; aria-pressed/selected plus persistent visual cue. Preserve URL and null-selection behavior. No blanket control conversion.                                                                               |
| Icon-only action          | IconButton with accessible name; optional Tooltip; 20px inline icon inside a sufficiently large hit target.                                                           | Preserve Inbox 44px targets; icon size does not determine target size. Pagination icons also require keyboard focus and names.                                                                                                                       |
| Status chip               | Small neutral, explicit human-readable label; allow wrapping for long statuses.                                                                                       | Prefer outlined for persistent record state if approved; neutral fill acceptable for compact metadata. Warning/success/error indicate actual severity/outcome, not a guessed stage taxonomy. Never equate saved candidate with accepted application. |
| Snackbar                  | Existing shared host, short transient completion; success/info polite, warning/error assertive as currently implemented.                                              | No page-sized success banner, auto-navigation, scroll or replacement of validation. Detailed source outcomes remain in Run details. Timing changes require separate approval.                                                                        |
| Inline validation / Alert | Field error + adjacent helper for field defects; inline Alert for request/conflict/source recovery.                                                                   | Retain entered values, explain retry/recovery, keep stable IDs where referenced. Standard semantic Alert variants; do not fill every warning to match a Chip.                                                                                        |
| Dialog actions            | Close/Cancel first; secondary actions next; primary/confirm last. Explicit safe autofocus for destructive/duplicate decisions.                                        | Wrap with 8px gap, consistent padding, 44px touch-oriented targets. Preserve DOM/tab order and content scroller; no CSS reversal that changes visual versus keyboard order.                                                                          |

### Interaction and token rules

- Preserve teal primary and page/paper surfaces. Use semantic tokens, not screen
  literals. Verify each newly used text/fill pair at 4.5:1 for normal text and
  meaningful control/focus boundaries at 3:1 against adjacent colors. Disabled
  controls are excluded from ordinary contrast requirements but still need a
  clear disabled appearance and an understandable reason where appropriate.
- Keep MUI hover/pressed behavior rather than recreating colors per screen.
  Selected filters/rows remain selected after hover ends. Focus-visible must be
  distinguishable from hover and selection; standardize ring width/offset only
  after testing nearby surfaces, clipping, forced colors and keyboard navigation.
- Keep 32/36/44px size minima. Use existing responsive/coarse-pointer conventions
  to reach 44px where touch interaction is expected; do not globally inflate all
  dense desktop controls. Large means a larger target, not a second primary role.
- Keep disabled controls non-submittable and busy state announced. Prefer a common
  pattern of clear busy wording + status/aria-busy where useful. MUI's loading
  affordance is an option, not a requirement to replace tested request guards.
- Keep local typography for score/evidence emphasis. Clarify subtitle1 heading
  usage in guidelines before changing its global metrics. Native disclosures may
  remain native; style their text locally if needed without removing semantics.
- Follow the guideline spacing scale and shell gutters. Responsive wrapping, long
  text, safe-area padding and zoom take priority over identical panel heights.
  Preserve Discovery/Inbox list regions, editor fields/action rows, and natural
  Application/CV Match document scrolling.

## Priority-ranked fixes and minimal implementation checkpoints

Approve each checkpoint separately. No production changes are part of this audit.

| Order / checkpoint              | Scope and rationale                                                                                                                                                                                    | Focused regression coverage                                                                                                                    | Browser-accepted workflow impact                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Shared semantic contrast    | F1 plus the semantic portion of C1: verify dark foreground on retained warning fill; use error for the local discard action. Update guidelines with approved pairs. No brand redesign.                 | A small token contrast check for actual rendered pairs; existing editor/readiness/unsaved-guard tests. Avoid snapshots of every MUI style.     | Shared warning pair can affect unsaved/readiness Chips and any filled warning consumers. Recheck Alerts separately; guard behavior must remain identical.                            |
| 2 — Shared focus convention     | F2: approve ring token and apply narrowly to IconButton/ToggleButton and local selection cards where needed. Keep ripple. Do not add a blanket ButtonBase override without inspecting all descendants. | Keyboard tests for Inbox icon/filter, Queue filter, import cards and pagination; synthetic hover/focus/disabled browser preview.               | Cross-screen visual change; could clip rings or alter selected evidence appearance. Reaccept evidence navigation and import-card keyboard behavior.                                  |
| 3 — High-visibility usage       | D1, Q1, R2 and local C1 hierarchy: touch targets, Candidate Review headings/status density, safe confirmation emphasis; approved selected-filter styling. Leave request and state handlers intact.     | Focused discovery, queue, viewport, editor-flow/guard tests; verify filter URL/history and conditional Save/Open actions.                      | Filter control replacement, if chosen, changes keyboard interaction; prefer styling first. Added action height can affect dialog wraps and Discovery's viewport fit.                 |
| 4 — Add Job hierarchy and links | A1 and J1, only if approved: give Continue appropriate priority, reduce optional extraction emphasis; theme content links without changing anchor behavior.                                            | Focused import-methods, editor-flow, URL/bookmarklet, source-preview tests. Use synthetic inputs; do not run extraction or upload private CVs. | Previously accepted source selection, manual entry, extraction progression, download and bookmarklet drag/install must be rechecked. Styling a bookmarklet as a command is excluded. |
| 5 — Optional polish             | Redundant local casing/elevation cleanup, documented status casing/variant choice, subtitle1 guideline alignment. Notification copy/timing is a separate optional decision, not bundled cleanup.       | Affected screen tests only; notification tests if host policy changes; CV Match tests if headings/evidence styles change.                      | Global typography can reflow every screen; prefer local headings. Timing/queue changes alter accepted notification behavior and require explicit approval.                           |

No broad refactor, global Chip/Accordion redesign, global form density change,
new dependency, backend change, authentication or CV/AI processing is needed.
Tests listed above are future scoped verification, not checks run by this audit.

## Browser acceptance checklist

Run against synthetic fixtures after an approved implementation. This list is
**pending**, not a record of successful browser acceptance.

- Desktop, narrow/mobile, short viewport and 200% zoom: no clipped labels,
  actions or horizontal page overflow; verify long company/title/source/error text.
- Tab through sidebar, filters, primary/secondary buttons, pagination icons,
  disclosures and external links. Check visible focus, selected versus focused
  states, Enter/Space, Escape, focus return and forced-colors mode.
- Inspect default/hover/pressed/focus/disabled/busy states on white and page
  backgrounds. Measure rendered warning Chip text and destructive text; confirm
  primary teal remains unchanged and error/warning/success remain distinguishable.
- Discover: compact collapsed summary; unchanged defaults/payloads; expanded
  helpers readable; Run details remains a popover. Verify live/cached/partial/
  all-failed feedback, known versus updated wording and unchanged Queue history.
- Queue/Inbox: controls and pagination visible, ten-item pages and filter/history
  semantics unchanged. Only intended rows scroll in bounded mode; mobile/short
  windows use their existing fallback behavior. Notifications/Review must not
  move the page or reset Queue state. P5.3e DOM checks do not prove browser fit.
- Candidate Review: one primary Save/Open action, correct conditional Mark as seen
  and Dismiss; one content scroll area; action wraps and focus return. Duplicate
  Cancel receives focus; ambiguous matches cannot create/link through a new UI path.
- Job details: all four tabs keyboard reachable; edits persist across tabs;
  Application Save and Edit JD Save still save the intended values. Preserve
  evidence reveal, targeted instant scroll and focus-without-second-scroll in
  CV Match; do not globally disable transition callbacks for visual consistency.
- Add Job: keyboard card selection, retained source inputs, manual progression,
  Back, Review & Save, inline validation and unsaved-change Stay/Discard.
  Verify downloads and bookmarklet dragging/manual installation without changing
  its transfer protocol or triggering private/AI processing.
- Notifications: shared bottom-right host, no inline completion layout shift;
  readable long messages, close affordance, announcements, queued ordering and
  persistent warnings/errors. Form validation remains available after toast expiry.

## Open decisions requiring approval

1. Approve the semantic warning foreground strategy: palette contrastText versus
   a filled-warning-Chip-only correction. Keep warning fill and brand teal unless
   rendered evidence supports a different choice.
2. Approve a common 2px focus ring for icon/toggle/card controls, including how
   it interacts with selected backgrounds and high-contrast mode.
3. Choose whether Queue selection should visually match Inbox's neutral toggles;
   approve any component replacement separately from styling.
4. Approve local Candidate Review heading/chip density and touch target changes;
   decide whether Mark as seen should remain tertiary. Dismiss stays reversible.
5. Approve safe-focused, error-styled Discard and the proposed action ordering;
   no new confirmation flows are implied.
6. Approve whether manual Continue should dominate optional Extract in Add Job.
7. Decide whether to reconcile subtitle1 in documentation with current theme or
   introduce explicit local subsection usage; global typography is not a free fix.
8. Keep current notification timing/queue policy by default. Any longer success
   timing, warning dismissal or queue replacement policy needs separate approval.

## Verification and stopping point

Only this audit document was created. Inspected source and installed MUI defaults;
ran the read-only Node palette/contrast calculations described above. Ran
`git diff --check -- docs/audits/ux-design-consistency.md` successfully (with an
additional no-index whitespace check because the new document is untracked).
No tests, typechecks, builds, browser acceptance, API calls or private processing
were performed. Production code, tests and all pre-existing work are unchanged.
No commit, push or PR. Stop here for checkpoint approval.
