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
`npm run build` clean. Desktop and phone inspection is with the user.

Approach changes: avoidance now lives in truth.js so the suppression rule is
testable without a browser; signals.js caches the prerequisite projection per
item list per day and invalidates it on every overlay write.

## Phase 2: Consequence

No new overlay fields, so no merge classification; the simulator is pure over
schema, overlay, and hypothetical scores.

- `src/grade.js`, pure and node-tested: `courseStanding`, `gradePath`,
  `cushionCovered`, `pointsAtRisk`, `dayExposure`.
  - Locked outcomes are policy facts: can't submit contributes 0, an absorbed
    item banked within its group's cushion balance banks its points, a claim
    past the balance is gone. Cushion coverage comes from truth.js, and a
    cushion never lowers urgency anywhere.
  - A done item with no score is graded but unscored: the standing leaves it
    out and says so. No score is ever inferred from marking submitted.
  - The ceiling collapses to null once an unknown-weight item enters the
    ledger; the app states the unknown rather than inventing a number.
- `src/grade-ui.js`: the Plan surface gets "Where the grades stand", a single
  combined three-track chart (floor, ceiling, current) with markers on the
  remaining heavy items, per-course ledger lines, the incomplete-ledger note,
  and the ECON midterm discrepancy surfaced from the schema's unresolved note.
- The Plan header carries points at risk and the next exposed day. Both stay
  off the Now surface.
- `tests/grade.test.js`, wired into `npm test`: the September failure shape,
  cushion capacity and overflow, submit-is-not-score, the path's capped
  ceiling, points at risk excluding blocked and resolved work, and the
  two-deadlines-one-day flag.

Checks: all five suites passing, build clean, backup assertions ok.

Open product decisions for the user:
- Day-exposure threshold: 8 points and at least two deadlines. The 17 September
  day (18 points, two items) is the case it exists for, but the threshold is a
  guess. Say the word and it moves.
- Whether single-item days should ever be flagged; currently never.

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

Checks: all five suites passing, build clean, 60 backup assertions ok, dev
server responding. Desktop and phone visual inspection is with the user, who is
handling review and browser verification.

## Phase 4: blocked, with the proposal

Phase 4 is web push, the morning check-in, and the notification budget. It
needs VAPID keys, a push flow, and CI scheduling. Key creation and CI changes
are an explicit stop-and-ask boundary, so implementation waits.

Proposal, with nothing created or changed yet:

1. Keys. One VAPID keypair. Public key in the bundle, private key in
   repository secrets only. Generating it is one `npx web-push
   generate-vapid-keys` run, which is a one-off dependency download and needs
   approval.
2. Storage. Push subscriptions are per-device, like the timer: a new
   `DEVICE_LOCAL` overlay field, never synced, never exported.
3. Sending. A static GitHub Pages host cannot wake up to send anything. Two
   honest options:
   - A scheduled GitHub Actions job, once a day, reads the schema, computes the
     day's notifications against each stored subscription under the cap, and
     calls the Web Push endpoint directly. No server, no database, no
     third-party service. Needs a CI job and a repo secret: that is the ask.
   - No CI at all: notifications fire only while a device has the app open.
     Covers the exam-morning alert, weakens the morning check-in. Cheaper,
     weaker.
4. Budget. A hard cap of two a day enforced in both the sender and the service
   worker; the exam-morning alert is the only priority message. Badge counts
   stay out, per the open list.
5. What leaves the device. Subscriptions leave; the avoidance traces never do.
   `sync.js` currently serializes the whole snapshot, including them, because
   `DEVICE_LOCAL` prevents adoption, not transmission. The fix, when approved,
   strips `DEVICE_LOCAL` fields and avoidance logs at serialization time.

Nothing in that list is built. Phases 5 through 10 (Fieldwork, attention
modes, extraction, prep, intelligence) remain the target and do not depend on
Phase 4. Per the handoff, Phase 5 is not started while Phase 4 is blocked on
the stop-and-ask boundary; say the word on the proposal and work continues.


