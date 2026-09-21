# Starlight

A semester planner built around one question: what is worth starting right now?

The full map of the term exists, but it is not what opens. Seeing 106 items at
once is the thing that produces avoidance, so the map became the pull-back view
and a focused Now surface became the default. Most of this app's good decisions
are refusals. Read README.md before assuming a convention belongs here.

Vanilla JS modules, Vite, no framework, no runtime dependencies.
`npm run dev` serves it. `npm test` runs the merge and sync property tests.

## Read when relevant

- `SPEC.md` is the product being built: seven capability layers, acceptance
  criteria per feature, and the build sequence. Read it before starting any
  feature work. It is the spec, not background reading.
- `STARLIGHT_FINDINGS.md` is the evidence behind the spec, plus course ground
  truth and the table of dates that are not verified.
- `README.md` explains why each surface behaves as it does. It is the design
  record, not documentation. Read it before changing Now, Plan, or the map.
- `src/merge.js` before touching anything stored in the overlay. Its header
  explains why logs union and decisions are last-write-wins.
- `course_map_schema_v2.json` for the shape of an item.

## Where this is going

Seven capability layers. Work in any one of them should leave room for the
rest rather than foreclosing it. Truth comes first because everything else
is unsafe on unverified data: an assistant over a wrong date answers
confidently and wrongly, and a grade simulator over an incomplete ledger
produces a number that gets trusted.

1. **Truth** — knowing what is actually real. Verified dates with sources,
   exam dossiers holding format and rules, Canvas ingestion, syllabus
   extraction, attached materials, labels.
2. **Consequence** — knowing what things cost. Resolution states for missed
   work, late and drop-lowest policy per course, a grade simulator, a grade
   path over the term, points at risk.
3. **Preparation** — arriving ready rather than on time. Prep ladders
   generated behind each exam, a cheat sheet builder bounded by the real page
   size, topic coverage, Cram mode, learning cards, post-exam debriefs.
4. **Ritual** — the daily loop. A bounded morning check-in, web push with a
   hard cap of two a day, an exam-morning alert, an optional evening close.
5. **Attention** — density control. Light, Full and Deep modes, progressive
   disclosure, calm recovery after time away, theming, dark mode.
6. **Intelligence** — an assistant grounded in the user's own semester, and
   extraction pipelines that propose rather than accept. It may only state a
   date as certain when that date is verified.
7. **Fieldwork** — the Business Lab interview pipeline, findings log, and
   weekly update assembly. That course's real work is a pipeline, not an
   assignment, and a deadline tracker cannot see it.

## The 2.0 visual direction

Starlight is moving to a refreshed look and feel. This is a real redesign, not
a polish pass, and it is the reason the token layer exists.

What the current interface gets wrong:

- Every row carries the same visual weight. A 100 point exam, a 4% weekly team
  update and a 2.5 point summary are indistinguishable at a glance, so stakes
  have to be read rather than seen.
- The two action pills outweigh the item they belong to. The content should
  lead and the actions should recede until they are wanted.
- Course identity is absent from the lists even though every course already
  carries a color in the schema.
- There is one type size doing several jobs, so nothing establishes hierarchy.
- Status is carried by small rings whose meaning is not legible.

What the refresh has to preserve:

- The light ground and its calm. This app gets opened when someone is already
  overwhelmed.
- The signature touch: a small star or glow on the item to start next.
- Clean over gamified. The refusals in Product boundaries survive the redesign.
  A new look must not import conventions this app rejects.
- One thing to start, stated with its reasoning, remaining the point of the
  Now surface.

What it has to newly express, because the data model now carries states the
old design never had:

- Verified against a source, versus never checked, versus sources that
  disagree. These must never look alike.
- An item blocked by something external and broken, distinct from one not yet
  started.
- A missed item resolved into its outcome, versus one still unresolved.
- A prerequisite, and the item it unlocks, read as connected.
- Stakes, as visual weight, without becoming a count of outstanding work.

Dark mode is part of 2.0 and is designed rather than inverted. This app gets
opened late at night before an exam.

Aesthetic decisions come back to the person using this app as options, with
alternatives, rather than being chosen unilaterally. The problems above are
the brief; the visual answer is theirs to pick.

## Invariants

- The schema is the source of truth for what the semester contains. The
  localStorage overlay owns what was done with it. Never write progress into
  the schema.
- The merge stays commutative, idempotent and associative. Every new overlay
  field is either a log (unions, needs a cap in `LOG_FIELDS`) or a decision
  (last-write-wins, needs a stamp). There is no third kind.
- Fields in `DEVICE_LOCAL` never sync. A running pomodoro belongs to the
  device you are sitting at.
- No secrets in the bundle. The gist token lives in localStorage under its own
  key, apart from the overlay, and is never exported.
- No runtime dependencies without asking. No analytics, no telemetry, no
  third-party endpoint other than api.github.com.
- Drop-lowest cushions and small point values never reduce an urgency signal.
  A cushion is applied when computing what was lost and ignored entirely when
  computing what to do next.
- Deadline times differ per course. Assuming a default causes missed deadlines.
- Extracted or imported data is proposed and confirmed, never auto-accepted.
  Confirming is also what marks something verified, so the flow that adds data
  is the flow that earns trust in it.
- The avoidance traces are the most sensitive data here. They never leave the
  device by default, never become a score, and never get displayed back as a
  number.

## Product boundaries

These would each make the app worse, and an agent working from a feature list
will add them without being asked.

Firm:
- Nothing that degrades if the user stays away. Irregular use is the design
  target, and coming back after a bad week has to be survivable.
- No streaks, no leaderboards, no gamified points or levels.
- No tally of outstanding work on the Now surface. That count is what produces
  the avoidance this app exists to reduce.
- No auto-accepting extracted data.
- No agent writing to the schema without confirmation.
- No submitting to Canvas from inside Starlight. Read from Canvas, submit in
  Canvas. The cost of being wrong once is a zero.

Open, ask before building:
- Badge counts, defensible for exam mornings only.
- Configurable pomodoro intervals. 25 and 5 are chosen and defended in the
  README, but the choice is arguable.
- Theming beyond the existing ground.

## Design standards

The visual quality bar is industry level, and the current gap is craft and
systematization rather than more screens.

- Values live in a token layer on `:root`: space, type, color, motion. Never
  literal values in component CSS.
- Every component has loading, empty, error, offline and first-run states.
  Empty states matter here and the app has the voice for them.
- One motion vocabulary. Appear, move and leave each get one duration and one
  easing curve, used everywhere. Respect `prefers-reduced-motion`.
- Touch targets are 44px under `@media (pointer: coarse)`. The actions sitting
  next to each other are destructive in both directions.
- Contrast is audited against the worst point of the gradient ground, not the
  average.
- The map, the plan and the cards are read on a phone, at night, in a hurry.

## UI copy

Plain, specific and calm. Match the existing strings and read three nearby
ones before writing a new one.

- No em dashes anywhere, including comments and commit messages.
- No "X, not Y" or "this isn't about X, it's about Y" constructions.
- No "delve", "leverage", "it's worth noting", "seamless", "robust".
- No passive voice.
- Name the course on every item, everywhere an item appears.
- State what the app is doing. Do not list what it will not do.
- Never invent encouragement. The app does not congratulate anyone.
- Say "can't submit", not "forfeited" or "lost".
- Observations about behavior are stated once, flatly, with a count, and never
  stacked. Piling three on reads as a case being built against someone.
- If a line already says the thing well, leave it alone.

## You may, without asking

- Run `npm test`, `npm run dev`, `npm run build`.
- Add cases to the existing test files.
- Refactor within a module you are already changing.

## Ask first

- Adding a dependency, a build step, or a CI job.
- Changing what leaves the device in `src/sync.js`.
- Anything in the "Open" list under Product boundaries.
- Marking any date as verified. Only the person using this app can do that.
