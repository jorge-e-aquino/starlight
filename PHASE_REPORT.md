# Starlight 2.0 phase report

One section per phase, newest last. Phases 0 through 3 are committed on
`codex/starlight-2`.

## Phase 1: Truth

- `src/truth.js`: pure projections over schema plus overlay. `dateTrust`
  (unverified / verified with named source / contradicted), `resolutionCost`
  and `resolutionSummary`, `validatePrerequisites` (unique ids, known targets,
  no self-edges, integer lead days, cycle detection), `prerequisiteProjection`,
  and `avoidance`, moved here so it runs in node tests.
- `src/truth-ui.js`: date badge and text, date trust form, resolution form with
  live cost preview, external block form. Errors surface inline, never throw.
- `src/state.js`: stamped decision setters `setDateTrust`, `setResolution`,
  `setExternalBlock`. Explicit null reopens. `markStarted` and `markDone`
  refuse to write progress over an external block or a terminal outcome.
- `src/merge.js`: canonical tie-break on equal stamps (explicit clear wins,
  unstamped legacy loses) and preservation of unstamped remote-only legacy
  fields. Algebra properties retested.
- Surfaces wired: detail carries the three forms, a "What this unlocks"
  section, and honest actions for blocked and resolved work. Now, Plan and Map
  show the three date-trust states with named sources in tooltip and aria
  text; map nodes carry `data-trust`, `data-blocked`, `data-resolution` and a
  prerequisite marker; legend updated.
- Scheduling: unknown times are now unknown. `dueAt` returns null with no time,
  unknown-time items order after timed work, and no verdict or copy rests on
  the old 23:59 assumption anywhere.
- Avoidance suppresses for external blocks and terminal outcomes.
- Workload counts removed from the Now surface: Still open, Also in range, Set
  aside, and the day-plan link no longer carry tallies.

Review rule applied: a prerequisite resolved as can't-submit or absorbed has
not fulfilled its gate. Only real completion clears an edge; gated work keeps
its `unmet` prerequisite, keeps inheriting urgency, and completing the gate is
what makes it startable. Tested for both terminal states and completion.

Overlay fields: `dateTrust`, `resolution`, `externalBlock`, all decisions, all
stamped through `patch`, all accepting explicit null as a claim. None are logs,
so no `LOG_FIELDS` caps were needed.

Checks: `npm test` passing; the personal backup loads, exports and reloads
without field loss (assertions only, contents never left the device context);
`npm run build` clean. I inspected the changed surfaces at desktop and phone
widths, including the six overdue outcomes.

Approach changes: avoidance now lives in truth.js so the suppression rule is
testable without a browser; signals.js caches the prerequisite projection per
item list per day and invalidates it on every overlay write.

## Phase 2: Consequence

New overlay field: `score` is a stamped decision. A posted result replaces an
older result across devices; it does not union like an observation log. The
simulator remains pure over schema, overlay, and hypothetical scores.

- `src/grade.js`, pure and node-tested: `courseStanding`, `gradePath`,
  `cushionCovered`, `pointsAtRisk`, `dayExposure`.
  - Locked outcomes are policy facts: can't submit contributes 0; an absorbed
    item is dropped from the counted set while its cushion balance lasts. A
    claim past the balance has a cost. Cushions never lower urgency.
  - A done item with no score is graded but unscored: the standing leaves it
    out and says so. No score is ever inferred from marking submitted.
  - Group drops and the MGT 2250 lowest-test replacement apply in each
    scenario. Forecasts appear only when modeled weights reconcile to the
    course total. ECON remains unresolved at 526.5 listed versus 500 stated.
- `src/grade-ui.js`: Plan gets separate three-track charts per reconciled
  course, with large-item markers. Courses cannot share a meaningful point
  denominator. Detail records posted scores; submission alone implies no
  score. Business Lab's chart says its peer and attendance adjustments remain
  outside base weighting until their application is confirmed.
- The schema records known late rules, group count rules, score replacement,
  Business Lab attendance and peer-factor ranges, and grade-neutral milestones.
- The Plan header carries points at risk and the next exposed day. Both stay
  off the Now surface.
- `tests/grade.test.js`, wired into `npm test`: the September failure shape,
  cushion capacity and overflow, submit-is-not-score, the path's capped
  ceiling, points at risk, a same-day cluster, and reconciliation against the
  four actual course ledgers.

Checks: all five suites passing, build clean, backup assertions ok.

Day exposure uses an 8-point threshold and at least two deadlines. That catches
the 17 September 18-point cluster while leaving single-item days to ordinary
priority. The threshold can change without migrating saved progress.

## Phase 3: the editorial visual pass

No overlay fields, no schema changes, no new dependencies. The approved
direction expressed in the token layer and stylesheet, plus three dataset hooks
on rows.

- Course-color rails on every list row. Blocked work breaks the rail in a warm
  dashed tone so it never reads as merely not started; resolved work mutes it.
- Stakes as visual weight: exam and high-weight rows lead in size and weight,
  small-point rows quiet down. Nothing counts anything; Now still shows no
  tallies.
- Quieter actions: non-primary acts are quiet text with a hairline that fills
  on hover. One primary act per surface keeps its weight.
- Stronger headings on the day plan and clear states, one type step up, and
  heavier captions on heavy map nodes.
- Text states where color alone would not carry meaning: status weight on
  resolved rows, conflict color on can't-submit.
- All values are tokens; the token layer stays open for the Phase 6 themes.

Checks: all five suites passing, build clean, 60 backup assertions ok. I ran
the app and inspected Plan and detail at desktop and phone widths, including
the grade chart and the Phase 3 visual hierarchy.

## Phase 4: ritual and reminders

The four-beat check-in is distinct from Now and completes in under two minutes:
today's dated work, one startable item, nearby dates to confirm, and one day-shape
choice. Item links name the course. Opening from this surface does not fabricate
avoidance logs. The optional evening close reports what finished and one dated
item for tomorrow without a guilt or streak frame. No date was marked verified.

Web push now has a Vercel Functions boundary, a Neon database, VAPID keys, a
per-device subscription, a scheduled GitHub Actions sender, and a database
ledger. The sender chooses one useful regular item on a morning run and never
uses more than two regular ledger slots per day. It sends nothing on a quiet
day. A separate exam-morning lane requires a user-verified source date and a
confirmed dossier with start time, location and materials; the dossier editor
belongs to Phase 8. The latest registered device receives a message, so two
devices do not double the interruption. The service worker opens the named
item. First-run never asks permission. The later check-in explains reminders,
checks the private key, and gives the browser permission ask its own click.

The push projection contains only progress decisions required to schedule:
source-backed date status/date/source, done timestamp, resolution state,
blocked boolean, and four confirmed dossier facts when they exist. It excludes
free-text block reasons, avoidance logs, focus days, and other notes. The
normal GitHub Gist sync now also strips device-local fields and avoidance
traces from outgoing progress while full local backups retain them. Existing
remote Gist revisions may retain earlier uploads; current sync does not add
new traces.

Neon `starlight-progress` is connected to the Vercel project on its free plan,
with preview branching and no built-in auth. Vercel has the runtime keys;
GitHub has the scheduled sender URL and secret. A hosted preview served the
app and push configuration, wrote a projection to Neon, accepted and revoked
a temporary subscription, rejected an unauthenticated sender call, and held
the real sender outside its morning window. The first hosted visit withheld
the permission setup; the next check-in showed it. I looked at the check-in
at desktop and 390px phone width. All test suites and the production build
passed. The September 21 backup imported and exported with all 54 recorded
fields preserved. Loading, empty, error, offline and first-run states are
covered in the state fixture and in the hosted first-run flow.

Revised assumptions: the permission ask needs its own click after key validation
for browser gesture rules. Sending two reminders at the same instant would
spend the budget badly, so the morning run chooses one regular item. The
server needs a boolean for an external block, not its free-text reason.

The workflow activates when this phase reaches the repository's default branch.
The code and preview are ready; production promotion and a phone subscription
remain deployment steps. Phase 5 needs no new user input: the Business Lab
fieldwork rules are in the findings, and the user has authorized read-only
Canvas review for any course-specific details.

## Phase 5: Fieldwork (MGT 4803)

One commit. The pipeline is overlay data, not schema data: contacts are
discovered work, and the schema stays the map of the term.

- `src/fieldwork.js`, pure and node-tested: `activeContacts`,
  `pipelineHealth` (the metric is how many contacts sit in contacted right
  now, with follow-ups due called out), `interviewScript` (Mom Test rules:
  last time it happened, what it cost, never "would you", and the rules sit at
  the top of the surface where the questions get asked), `tagLabel`,
  `weeklyDraft` (assembles from the seven days ending at the update deadline,
  with course and contact named), and `cadenceGap`.
- `src/field-ui.js`: the Field surface, reachable from the view toggle.
  Pipeline rows carry state selects with inline errors and follow-up dates for
  no-reply; the findings log carries tag coloring; the weekly update draft
  section has reassemble and save. The Sunday cadence line appears from the
  Wednesday schedule even without start history; after two recorded starts,
  it uses the recent lead time instead.
- `src/state.js`: `upsertContact`, `removeContact`, `upsertFinding`,
  `removeFinding`, restore actions for both removals, and `setUpdateDraft`,
  all validated and stamped. A no-reply move requires a follow-up date; moving
  back to another state clears the old date.
- `src/merge.js`: `contacts` and `findings` merge record-by-record like items
  and days. Algebra retested over both collections.
- `tests/fieldwork.test.js`, wired into `npm test`.

Overlay field classification, per the invariant that every new field is a log
or a decision:

- `contacts.<id>.{name, org, role, note, state, followUp}`: decisions. Each is
  a claim about right now, so stamped last-write-wins; none are observations.
- `contacts.<id>.deletedAt` and `findings.<id>.deletedAt`: tombstone
  decisions, stamped, so a removal wins a merge outright instead of letting a
  removed record resurrect; a later undo writes a stamped null.
- `findings.<id>.{date, contactId, assumption, text, tag}`: decisions, same
  reasoning. The assumption names the claim that the interview supports or
  breaks.
- `items.<id>.updateDraft`: a decision on the item's existing record. The
  newest edit wins; clearing is a claim too. It drafts; the person writes.
- No logs were added, so no `LOG_FIELDS` caps were needed.

What leaves the device: `sanitizeForSync` passes the new top-level collections
through the same decision-only strip as the rest of the overlay, so contacts
and findings sync like ordinary work product, and the avoidance traces still
do not. This widens synced content to include pipeline data; if the Business
Lab's contacts and findings should stay device-local instead, say so and they
move into `DEVICE_LOCAL` in a follow-up.

Canvas review: the [Business Lab syllabus](https://gatech.instructure.com/courses/537530/assignments/syllabus)
and [Week 5 update](https://gatech.instructure.com/courses/537530/assignments/2587938)
show that updates are team slides presented in Wednesday class. The
[sample deck](https://gatech.instructure.com/courses/537530/files/76342387)
uses interview counts, hypotheses, findings, tests, and next steps. The draft
now follows that outline in text. Canvas shows a start-of-class deadline while
the schema has an unverified 11:59 p.m. time; no date or time was marked
verified. The Canvas feed will propose this difference in Phase 7.

Checks: all eight suites pass; build clean; the personal backup was loaded and
re-exported with 79 data values preserved (the export timestamp refreshes).
The Field surface was inspected on desktop and at 390 px, including first-run,
empty, form-error, offline, storage-error, and loading states. The no-reply
follow-up was entered and saved in an isolated browser profile.

## Phase 6: Attention

Light, Full, and Deep are device-local modes stored in `starlight.attention.v1`,
outside the progress overlay and sync. Light presents one item and one action;
Full keeps the existing Now surface; Deep includes Now, the grade path, a
topic coverage slot, and the map. The slot reports that coverage awaits exam
topics from Phase 8 instead of inventing confidence data. Expanded queues and
disclosures remain session-only. `src/attention.js` keeps preference validation
and recovery selection pure.

After two days away with several unresolved overdue items, recovery selects a
known late-eligible or makeup-possible item first. When recovery is unknown,
the action asks the user to check rather than claiming that submission is
possible. The rest live in one expandable list. The factual sentence is
"Resolving the missed work is the work today."

Grounds use the existing color token layer: lavender, warm paper, and slate.
The light scheme can follow the system or be chosen explicitly; dark surfaces
have their own colors. The Jump control and Command/Ctrl-K palette search all
surfaces and items with course codes. No overlay fields were added in this
phase. Preferences cannot be included in a progress export or remote sync.

Checks: nine test suites pass; build clean; the personal backup was loaded and
re-exported with all 79 data values preserved. Desktop Full/Light/Deep and
phone Full/Light were opened and visually reviewed, including warm light and
dark appearances. The isolated browser fixture showed loading, empty, read
error, offline, and first-run states. The recovery selector was tested with
known and unknown recoverability.

## Phase 7: Materials intake

The in-progress Materials view begins with one drop area. Text materials are
filed locally by course code/name from the filename or content; ambiguity asks
for the course. PDF, Word, PowerPoint, and text are read on the device, with
source-backed policy/topic review cards. Scanned PDFs explain that no selectable
text was found. Confirmations create stamped decisions; dates remain unchecked.
Canvas .ics files can enter the same drop area. The personal Canvas feed can be
checked through a read-only Vercel relay, then checks once daily when Materials
opens on that device. Calendar matches remain proposals for review.

The user found the earlier mode picker and verbose surfaces burdensome. The
picker was removed: Now starts with one item and secondary rows open detail;
Plan's grade exposure and day cluster are short disclosures; Field is now
Interviews with a visible guide and hidden findings/update tools. Sources became
Materials, with the file drop primary and Canvas/manual controls behind a
single disclosure. The five tabs fit at 390 px. The device-local theme choices
remain.

No new overlay logs. New stamped decisions are `items.<id>.labels` (user
organization), `courseFacts` (confirmed syllabus policy with source), `topics`
(confirmed lecture topics and links), and `documents` (file metadata, item
links, `remote` availability and private `pathname`; bytes are in IndexedDB and
private Blob storage). These are decisions because they are explicit
edits/confirmations and the latest edit must win across devices. All four use
the existing per-field decision stamp mechanism. File bytes are outside the
overlay and backup. A paired device authorizes uploads and reads with the same
key used by reminders; the private Blob store uses Vercel OIDC. When offline,
the file stays in IndexedDB and can sync later.

Checks: full tests and build pass. The actual September 21 backup was imported
through the app and re-exported with all 14 item records; the only changed
values were newer session timestamps. Desktop and 390 px phone material review
were visually inspected. Isolated loading, empty, read-error, offline and
first-run states were opened. A real MGT 2250 Word syllabus yielded compact
policy suggestions, none confirmed; a Business Lab PDF saved and reopened with
an explicit scanned/no-selectable-text result. A text syllabus was extracted,
reopened, and attached to a live item. Private Blob was connected to Vercel
production and preview. Hosted upload/download validation follows deployment.

## Phase 8: Exam preparation

Every exam has a source-backed dossier for start time, duration, location,
question count and format, materials, cheat sheet rule and dimensions,
calculator, covered topics, and submission method. Partial details stay
incomplete; saving them never verifies the exam date. A completed dossier can
support the exam-morning reminder. Unknown and contradictory dates retain their
truth labels throughout preparation.

Preparation steps derive from each exam's current date at T-10, T-7, T-5,
T-3, T-1, and exam day. Inapplicable steps stay out. The rules task supplies a
deadline for an incomplete dossier, and the closest relevant task appears in
Now as one contextual disclosure and in Plan as a short list. Steps have
separate completion state, while moving an exam date regenerates their dates.
Known topics show confidence and the first pass names the weakest topics.

The sheet editor is scoped to the exam's recorded width, height, and page
count. Its live page measurement blocks printing when content overflows, while
the print stylesheet uses those physical dimensions. Saves preserve earlier
drafts. After a marked-taken exam, three debrief answers record format, topics,
and what to change; the next exam in that course shows this context for review.

New overlay fields: `items.<exam>.examDossier`, `items.<exam>.cheatSheet`,
`items.<exam>.examDebrief`, derived step `doneAt` and topic `confidence` are
stamped decisions because they represent current claims or completion choices.
`items.<exam>.sheetDrafts` is a capped union log of earlier sheet versions so
editing does not erase a prior draft across devices. No schema dates were
marked verified.

Checks: exam date regeneration, rule suppression, topic ranking, previous exam
inheritance, partial and complete dossier state, draft history and merge were
tested. The real September 21 backup loaded through the importer, exported
without missing fields, and survived a reload. Desktop and 390 px phone exam
details were visually reviewed. An isolated test dossier exposed the sheet
builder; 120 lines triggered overflow and Print stayed blocked, then all test
values were cleared. The existing state fixture covers loading, empty, error,
offline and first-run shell states for the touched views.
