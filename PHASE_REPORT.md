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
