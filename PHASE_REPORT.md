# Phase 1 report: Truth

Committed on `codex/starlight-2`. Phase 0 (`2622dc9`) untouched and preserved.

## What landed

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
- Surfaces wired: detail panel carries the three forms plus a "What this
  unlocks" section and honest actions for blocked and resolved work. Now, Plan
  and Map show the three date-trust states with named sources in tooltip and
  aria text. Map nodes carry `data-trust`, `data-blocked`, `data-resolution`,
  and a prerequisite marker; legend updated.
- Scheduling: unknown times are now unknown. `dueAt` returns null with no time,
  unknown-time items order after timed work, and no verdict or copy rests on
  the old 23:59 assumption anywhere.
- Avoidance suppresses for external blocks and terminal outcomes, via the pure
  `avoidance` in truth.js delegated from signals.js.
- Workload counts removed from the Now surface: Still open, Also in range, Set
  aside, and the day-plan link no longer carry tallies.

## Review rule applied

A prerequisite resolved as can't-submit or absorbed has not fulfilled its gate.
Only real completion (`doneAt` or schema done) clears an edge. Gated work keeps
its `unmet` prerequisite, keeps inheriting urgency, and completion of the gate
is what makes it startable. Covered in `tests/ground-truth.test.js` for both
terminal states and for actual completion.

## Overlay fields

Three new fields, all decisions, all stamped via the existing `patch` stamp:
`dateTrust`, `resolution`, `externalBlock`. Each is a claim about current state,
so last-write-wins applies, and each carries a field timestamp in `_t`. Null is
a legitimate claim (reopen, clear block, return to unchecked). None are logs;
nothing here unions, so nothing needed a `LOG_FIELDS` cap.

## Checks run

- `npm test`: merge, sync, state, ground truth all passing.
- `STARLIGHT_BACKUP=... npm test`: all backup assertions ok, load, export and
  reload without field loss. Backup contents were not read into any model
  context; assertions only.
- `npm run build`: clean.
- Dev server at 127.0.0.1:5178 responds 200. Desktop and phone visual
  inspection of the six true states is with the user, who is handling review.

## What changed in the approach

- Avoidance moved from signals.js into truth.js so the blocked-suppression rule
  is testable without a browser; signals.js delegates with the live overlay.
- Signals caches the prerequisite projection per item list per day and
  invalidates on every overlay write, so inherited urgency is live and cheap.

---

# Phase 2 report: Consequence

Committed after Phase 1. No new overlay fields in this phase, so no merge
classification is needed; the simulator is pure over schema, overlay, and
hypothetical scores.

## What landed

- `src/grade.js`, pure and node-tested: `courseStanding`, `gradePath`,
  `cushionCovered`, `pointsAtRisk`, `dayExposure`.
  - Locked outcomes are policy facts: can't submit contributes 0, an absorbed
    item banked within its group's cushion balance banks its points, a claim
    past the balance is gone. Cushion coverage still comes from truth.js, and
    a cushion never lowers urgency anywhere.
  - A done item with no score is graded but unscored: the standing leaves it
    out and says so. No score is ever inferred from marking submitted.
  - The ceiling collapses to null once an unknown-weight item enters the
    ledger; the app states the unknown rather than inventing a number.
- `src/grade-ui.js`: the Plan surface gets "Where the grades stand", a single
  combined three-track chart (floor, ceiling, current) with markers on the
  remaining heavy items, per-course ledger lines, the incomplete-ledger note,
  and the ECON midterm discrepancy surfaced from the schema's unresolved note.
- Plan header now carries points at risk and the next exposed day. Both stay
  off the Now surface.
- `tests/grade.test.js`, wired into `npm test`: the September failure (18 of
  45 in the synthetic course), cushion capacity and overflow, submit-is-not-
  score, the path's capped ceiling, points at risk excluding blocked and
  resolved work, and the two-deadline-one-day flag.

## Checks run

- `npm test`: all five suites passing.
- `npm run build`: clean.
- Visual inspection of the chart at desktop and phone widths is with the user,
  who is handling review and browser verification.

## Open product decisions for the user

- Day-exposure threshold: 8 points and at least two deadlines. The 17 September
  day (18 points, two items) is the case it exists for, but the threshold is a
  guess. Say the word and it moves.
- Whether single-item days should ever be flagged; currently never.

## What Phase 3 needs

Nothing new from the user. Phase 3 is the approved editorial visual pass and
must express every state Phase 1 and 2 produced: date trust, blocked, resolved,
prerequisite links, points at risk, and the grade path.
