# Starlight

A semester tool built around one question: what is worth starting right now?

The full map of the term is still here, but it is no longer what opens. Seeing 106
items at once is the thing that produces avoidance, so the map became the pull-back
view and a focused **Now** surface became the default.

## Running it

```bash
npm install
npm run dev
```

`npm run build` produces a static bundle in `dist/`, `npm run preview` serves it.

## The three surfaces

**Now** shows one thing to start, a short list of what else is in range, and a quiet
line about what is further out. Everything beyond its actionable window is not on
this screen at all.

**Plan** is today laid out on the clock. Now answers "what do I open"; Plan answers
the different question of "in what order, and does it actually fit before the
deadline". Reach it from the toggle, from `?view=plan`, or from the one line Now
shows on a day that has things due on it.

**Map** is the whole semester on a shared time axis, one region per course. Reach it
from the toggle or from `?view=map`.

Now and Plan both carry a pair of large targets on their margins, so wherever you
are, the two surfaces either side are a click away in the empty space: from Now, the
plan to the left and the map to the right; from Plan, back to Now on the left and the
map on the right. They sit behind the content and only catch clicks that land on
nothing. The map keeps its own full width and has none.

Recession on the map is graded rather than binary. Being outside the actionable window
is not the same as being irrelevant, so work a couple of weeks out stays clearly
readable and only genuinely distant items sit back.

## The day plan

Everything due today, packed into blocks from the current minute forward, with the
hour markers in the flow between them.

Ordering is earliest deadline first, because that is the ordering that actually meets
deadlines. Ties break toward the cheaper thing, for the same reason the Now surface
does: an early finish is what makes the rest of the plan credible.

That is the right default and the wrong rule. The assignment you believe you can
actually knock out is often the one worth opening first, and an order you cannot
override is an order you will ignore. **Start with this**, on the first block of any
item, moves it to the front; everything else keeps its deadline order behind it, and
its first block becomes the active one with the timer ready on it. The choice shows as
a chip under **First** and is one click to undo. It lives for the day, like the rest of
the day's shape.

If choosing costs a deadline the plan says so, and only when it is true: it packs the
day a second time without the choice and compares. The line appears only if deadline
order would genuinely have fit, and it says the trade may still be the right one,
because it is not the app's call to make.

The plan is measured in pomodoros: every work block is 25 minutes, with a 5 minute
break between them and a 15 minute one after every fourth. Items span several,
labelled `pomodoro 2 of 4`. A single "3 hours on the exam" block is the shape of thing
that never gets started; a 25 minute one is.

## The timer

The block you are in, or about to be in, is the only one with controls on it. The rest
are the plan. A schedule you can press twelve buttons on is a control panel pretending
to be a schedule.

That block runs a real countdown: **Start**, then **Pause** and **Done**. It survives a
reload, mirrors into the tab title so it stays useful from whatever tab you end up in,
and holds the plan still while it runs, because a schedule that re-flowed under you mid
pomodoro would move the block you are working in.

At zero a marimba chime plays. It is synthesized rather than loaded: a tuned bar's
overtones sit near four and ten times the fundamental and die away much faster than the
body of the note, which is what makes it read as wood struck softly rather than as an
alarm. Work ends on a rising figure, breaks on a falling one, so the two are told apart
without looking. It can be turned off next to the header.

[Pomofocus](https://pomofocus.io) is still linked there for anyone who would rather time
it in a separate tab. It cannot be deep linked, so it never arrives prefilled with the
task, which is part of why the intervals here are 25 and 5: they are what it already
defaults to.

## Start, Submitted, and what they actually mean

An assignment is broken into blocks, so an assignment's verbs cannot sit on a block
without lying. They used to: **Submitted** on "pomodoro 2 of 4" ended the entire
assignment and deleted every remaining block, and **Start** silently vanished on blocks
two onward because the item was already started.

Both are gone from the schedule. The vocabulary is now split by scope:

- **Block verbs sit on the active block only** and act on these 25 minutes. **Done**
  counts the pomodoro. It never submits anything.
- **Starting is not a separate act.** Starting the timer is starting, so it sets the
  item's status implicitly and there is no button for it.
- **The assignment's own verb is asked, not pressed.** When a pomodoro ends, the app
  asks the only question answerable at that moment: *is this finished?* Yes submits it;
  "not yet" says how many are left and moves on. Both readings are unambiguous because
  the question supplies the scope.
- The active block also carries **Finished the whole thing**, worded that way on
  purpose, for when you finish twelve minutes into a pomodoro.

Completed pomodoros are durable and separate from submission. Do two of an assignment's
four today and tomorrow's plan schedules the two that are left. Spend all four without
submitting and it does not vanish: it gets one short **wrap up and submit** block, which
also offers "needs another pomodoro" when the estimate was simply wrong.

The header states whether the day works before showing any of it. If the plan runs
past a deadline it says so, by how much, and on which item, and it says plainly that
the durations are estimates rather than implying you should move faster.

Blocks are live. Marking something submitted removes it and the rest of the day
re-flows into the freed time, and the plan re-derives every minute so its start time
never drifts out of date behind you. It will not repaint over something you are
typing.

Nothing due today is a normal day, not an empty screen. The plan falls back to a
shape for the afternoon built from what is in range, capped at about three hours and
labelled as a suggestion rather than as deadlines, with each block showing which day
its item is actually due. Work past its date stays out of the plan and is named in
one flat line at the bottom, the same way the Now surface treats it.

## The shape of the day

Packing from "now" assumes the day is empty, which it never is. Two controls sit above
the schedule and the whole plan flows around both.

**Start at** is the earliest you can actually begin. A start time that has already
gone by stops being a constraint, so this can never push the plan into the past.

**Busy** is time already claimed: lunch, a class, a shift. Add it with a name and a
range and the schedule routes around it, drawn in the timeline as a labelled gap so
the day reads as one continuous thing rather than as work with unexplained holes in
it. When a busy period lands where a break would have gone, it *is* the break, and no
second one is scheduled on top of it.

Both are stored per day on purpose. "I cannot start until 2" is true of a Monday and
not of the week, and a constraint that outlived its day would quietly distort every
plan after it. Days older than two weeks are dropped.

This is also where the plan earns the verdict at the top. Saying you cannot start
until 2 is what turns "everything makes its deadline" into a real answer rather than a
restatement of the arithmetic.

## Due times

The schema records dates. It does not record times, and a plan needs moments rather
than days, so anything without a time set is treated as due at 11:59 PM and every
place that assumption shows says so, with the assumed time underlined differently
from one you set.

The detail panel has the correction. Setting a real time re-orders the plan around
it, and can flip the verdict from fitting to not. Due times live in the same local
overlay as everything else, so setting one never means editing the JSON, and they are
carried by export and import.

Durations come from the same effort bands the rest of the app uses, budgeted at the
top of each band and rounded to whole pomodoros: quick is one, medium four, deep
seven. A plan that runs short is a good surprise; a plan that runs long is the failure
this surface exists to prevent.

The plan is where you find out an estimate was wrong, so it is also where you fix it.
The first block of every item carries a **resize** showing what the app currently
thinks, in the unit the plan is drawn in: `4 pomodoros, resize`. The options are the
same three bands, counted in blocks rather than described in hours, and the schedule
re-flows immediately. The active block has it too, because realising four blocks is
too many for a twenty minute task happens exactly when you are looking at the first
one.

## Where data comes from

`course_map_schema_v2.json` remains the source of truth for what the semester
contains: courses, colors, groups, dates, points, weights and notes. Nothing about
the term is hardcoded.

Progress is separate. What you have started, submitted, set aside, or written a first
step for lives in browser storage as an overlay on top of the schema, so marking
something submitted never means editing the JSON. Local progress wins over the
schema's `status` field.

That overlay is a single point of loss, so the bottom of the Now view exports it to a
file and imports it back.

## On your phone

Starlight is installable. Open it on a phone, use the browser's **Add to Home
Screen**, and it runs without browser chrome behind its own icon. That matters more
than it sounds: an app you have to find a URL for is an app you open on purpose, and
opening it on purpose is the step that does not happen on the days it would help most.

The build registers a service worker that caches the shell, so it opens without
waiting on the network. Everything needed to render is already on the device, since
the schema is bundled and progress is in local storage. Sync catches up when the
network returns.

Touch targets grow to 44px under `@media (pointer: coarse)` and the desktop layout is
untouched. The reason is specific rather than general tidiness: the actions sitting
next to each other are *Submitted* and *Not today*, and a mis-tap either hides work
that is still due or marks work done that is not.

## Sync

Progress decisions sync between devices through a **secret GitHub gist**. The
outgoing copy strips avoidance opens, focus days, the last visit, the running
timer and sound preference. A full local backup retains those fields. The
Vercel Functions added for reminders receive only a separate, smaller
scheduling projection; they do not store the progress overlay.

A gist-scoped GitHub token is entered once per device and kept in local storage under
a separate key from the overlay, so it is never synced, never exported, and never
present in the bundle. Disconnecting clears it; revoking it on GitHub kills every
device at once.

Devices exchange state on the events that mean the other one may have moved: returning
to the tab, regaining the network, and a slow poll for a tab left open all day. A pull
always precedes a push, so a phone that has been offline cannot flatten the laptop.

### How conflicts resolve

Both devices can write while the other is offline and there is no server to arbitrate,
so the merge (`src/merge.js`) has to be decidable from the two copies alone and give
the same answer whichever side runs it. Two kinds of field, because they fail
differently:

**Logs** are things that happened, so they union when a full local backup is
restored. Gist sync strips avoidance logs before transmission, leaving each
device with its own observations.

**Decisions** are claims about the current state, so the most recent stamped write
wins. Last-write-wins is right here specifically because it respects undo: marking
something done and then clearing it is two claims, and the clear has to beat the mark.
A "prefer the non-empty value" rule would quietly resurrect work you deliberately
un-marked.

Every field write carries a timestamp for this. Nothing local reads them.

The running timer and sound setting also stay on the device you are using.

The merge is commutative, idempotent and associative, which is what lets devices sync
in any order and still land in the same place. `node src/merge.test.js` checks those
properties along with the undo and log cases; it runs in CI before any deploy.

## How "start here" is chosen

The earliest upcoming item was the wrong rule. It pointed at whatever you had already
missed, which is the worst possible thing to open an app to.

Now the choice runs over items inside their actionable window and balances how close
the date is against how expensive the thing is to begin, deliberately favouring what
is cheap to start. Something already in progress gets a nudge up. Anything past its
date is never the glowing item; it sits in **Still open**, collapsed, worded flatly.

The card always states its reasoning, because the app should not ask for trust it has
not earned.

## The actionable window

An item becomes live a set number of days before it is due, scaled to its estimated
effort: quick work appears about 5 days out, medium about 12, deep work about 21.
Before that it is deliberately out of sight.

Effort is a heuristic. The syllabus never says how long anything takes, so Starlight
guesses from type and weight, labels it as an estimate, and lets you correct it in the
detail panel. Correcting it changes how early that item appears.

## Noticing avoidance

Three independent traces feed this, and the strongest one is the quietest:

- **Passed over.** The days an item was offered as the thing to start. If Starlight
  has put the same item in front of you on three or more separate days and it has
  never been started, that is the signal, and it needs no clicks at all.
- **Set aside.** How many times it has been deferred with Not today.
- **Read but not begun.** Opened three or more times across two or more separate days.

Whichever trace is strongest is stated as one plain sentence with a count, followed by
a field for the smallest first move. Only one sentence: piling all three on would read
as a case being built against you. The suggested remedy is shrinking the task, not
pushing harder at it. Deep links do not count as looks, so a URL cannot fabricate the
signal.

There are no streaks, no penalties, no counters of what is outstanding on the Now
surface, and nothing that degrades if you stay away.

## Evidence of movement

**Finished lately** sits collapsed near the bottom: a plain list of what actually got
done in the last two weeks, with dates. No count in the header, nothing that resets,
nothing that breaks. It exists for the days when it does not feel like anything is
moving.

## Coming back after time away

Built for irregular use. If it has been two or more days, the top of the Now view says
how long it has been and what moved: what came into range, what passed its date. It is
orientation, not a backlog, and it is dismissible.

## Interaction

- Start, Submitted (or Taken, for exams), and Not today on every item. Not today is an
  expiring deferral, and the empty state says when things have been set aside rather
  than claiming the deck is clear.
- Completing or deferring something removes it from every list, so both raise a brief
  toast with Undo. A misclick never sends work somewhere you have to go hunting for.
- The detail panel leads with actions and folds grade math away underneath.
- Click outside the panel, press Escape, or use the close button to dismiss it. There
  is no overlay, so the rest of the app stays live: clicking a different assignment
  swaps the panel's contents rather than closing it.
- The open item is in the URL (`#item=ob-journal3`), so a view can be bookmarked.
- Start and Submitted are on every plan block too, so the day can be worked from the
  schedule without going anywhere else.
- Every node on the map has a hover label with its name and course plus due date.
  It appears on keyboard focus too, and replaces the native `title` tooltip rather
  than stacking on top of it.
- Nodes and rows are real buttons and keyboard reachable. Motion respects
  `prefers-reduced-motion`.

## Time

A single live clock drives everything. Seconds refresh the readout, and a date
rollover re-derives every window, so a tab left open overnight is still correct in the
morning. Waking from sleep resyncs rather than waiting for the next tick.

## Layout

```
src/
  clock.js     the live clock everything time derived reads from
  state.js     progress, pomodoros, the day's shape, the timer, export and import
  chime.js     the synthesized marimba
  signals.js   effort, actionable window, focus choice, circling, away report
  schedule.js  due times, durations, pomodoros, packing the day around what is claimed
  now.js       the default surface
  plan.js      the day plan surface
  render.js    the map
  detail.js    the side panel
  data.js      reads the schema and normalizes it
  layout.js    time scale, axis, lane packing
  config.js    enabled courses, scale, node sizes
  main.js      shell, view switching, repaint
```

## Which courses are on the map

All four. The list is in `src/config.js`; an unknown id raises a visible error rather
than being silently dropped.
