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

## What Phase 2 needs from the user

Nothing blocking. Phase 2 (grade simulator, three-track grade path, points at
risk in Plan only, day exposure) can proceed on the pure-truth layer above.
The known sync.js privacy issue (snapshot serialized wholesale, including
avoidance logs) still needs a user decision before any change to what leaves
the device; a concrete proposal is due before Phase 4 and applies earlier if
sync behavior is touched.
