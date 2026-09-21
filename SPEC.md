# Starlight 2.0: build specification

The product to build. Seven capability layers plus a visual redesign. Every
feature here traces to a specific failure in real use, recorded in
STARLIGHT_FINDINGS.md. A feature earns its place by answering a question the
person using this app actually had. Apply that test to anything you add that
is not listed here, and ask before adding it.

Layer 1 comes first and is not optional ordering. Everything else is unsafe on
unverified data: an assistant over a wrong date answers confidently and
wrongly, and a grade simulator over an incomplete ledger produces a number
that gets trusted.

---

## Layer 1: Truth

Knowing what is actually real. The app currently presents every fact with
total confidence, which is why a wrong date survived until the morning of an
exam.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Verified dates | Wrong date on the day | Three states: unverified, verified with a named source, contradicted where two sources disagree. Decision field, stamped. An unverified date on a live item is visibly different everywhere it appears |
| Exam dossier | Rules, format and time unknown | Start time, duration, location, question count, question format, materials permitted, cheat sheet rules and dimensions, calculator policy, topics covered, submission method, plus a free field for what is learned afterward |
| Dossier completeness | Walking in uninformed | An exam inside its window with an incomplete dossier generates its own task with a deadline |
| Canvas iCal ingestion | Manual entry, drift | Subscribe to the personal calendar feed. Incoming dates verify or contradict what is held; they never silently replace it |
| Syllabus ingestion | Late and drop policies nowhere | Upload a PDF, extract to structured fields, confirm each one. Confirming is what marks it verified |
| Document attachment | No materials on items | Files per item, stored outside the overlay |
| Slide and lecture intake | No topic model | Upload, extract topics, tag to items and exams |
| Labels | Canvas-style organization | Free tags on items, filterable |

The contradicted state is not decoration. Canvas and a syllabus routinely
differ, and silently picking one is how the original failure happened.

---

## Layer 2: Consequence

Knowing what things cost. A missed item currently sits in Still open forever,
saying nothing about whether it is recoverable or what it cost.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Resolution states | Assignments lost to time | Exactly one of: late-eligible, makeup-possible, absorbed by a cushion, or can't submit. Decision field, stamped, never resurrects |
| Resolution cost | No idea what a miss cost | Each state carries its cost: penalty applied, request and deadline, which cushion was consumed, or points gone |
| Late policy model | No penalty data | Per-course rules in the schema |
| Drop-lowest model | Cushions invisible | Per-group rules. A cushion is a resource with a balance. Applied when computing what was lost, ignored entirely when computing what to do next |
| Grade simulator | No grade path | A pure function over schema, overlay and hypothetical scores. Pure means testable, and this must not be subtly wrong |
| Grade path chart | Wanted it visualized | Three tracks over the term: current standing on graded work, ceiling if everything remaining goes perfectly, floor if nothing more is done. Markers where the remaining large items sit |
| Points at risk | Urgency without magnitude | Total weight of everything live and unstarted. Lives in the Plan header where verdicts already are. Never on the Now surface |
| Day exposure | Same-day clusters fail together | A day carrying multiple high-value deadlines is flagged before it arrives |

Verify the simulator against the real numbers in STARLIGHT_FINDINGS.md part 2.

---

## Layer 3: Preparation

Arriving ready rather than on time. A cheat sheet was never an item, so being
unprepared was invisible to the app.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Prep ladder | Cheat sheet built at the door | Real items with deadlines generated behind each exam, derived not stored so they regenerate when a date changes. Rungs that do not apply are suppressed |
| Cheat sheet builder | The artifact existed too late | An editor scoped to one exam, bounded by the real page dimensions from the dossier, so running out of room happens days early. Prints via a stylesheet, no PDF dependency |
| Topic coverage | Did not know the subjects | Topics per exam with a confidence per topic |
| Cram mode | Wanted it | A session over topics rather than deadlines. Wrong answers lower a topic's confidence, which re-ranks what comes next and adds cheat sheet candidates. Ends on a coverage picture, never a score |
| Learning cards | Progress kept resetting | The vertical card sequence, with progress persisted to the overlay as a capped log and confidence per topic as a decision. Lightweight spaced repetition |
| Practice bank | No way to self-test | Questions per topic, drawn from uploaded materials |
| Post-exam debrief | Format intelligence lost | Three questions after an exam is marked taken. What was the format, what was on it, what would you do differently. The next exam in that course inherits it |

Prep ladder timing: confirm rules at T-10, list topics at T-7, first pass on
weakest topics at T-5, draft the sheet at T-3, finalize and print at T-1, and
time, room and what to bring on the morning.

Cram mode reuses the existing pomodoro timer and chime rather than inventing
its own session mechanics.

---

## Layer 4: Ritual

An app opened on purpose is an app not opened on the days it would help most.
The fix is arrival, and the reach has to be worth the interruption every time.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Morning check-in | Wanted a daily routine | A distinct surface that finishes, under two minutes. Four beats: what is due today, the one thing to start, what needs confirming, one choice about the day's shape |
| Web push | Wanted reminders that land | VAPID key pair, subscription per device, scheduled from CI. iOS requires an installed home screen app, so install becomes load-bearing |
| Notification budget | Notification fatigue | Two per day maximum, hard capped in code. Each names one thing and one action. Never a count. Nothing sent on a quiet day. Exam morning is exempt |
| Exam morning alert | The original failure | Scheduled off the dossier. Time, room, what to bring |
| Permission priming | One chance at the ask | Never on first open. Ask after the first moment the app was useful, in the app's own words, with the reason attached |
| Evening close | Nothing marks the day done | Optional, short, never guilt-shaped |

---

## Layer 5: Attention

Density as a control rather than a default.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Three modes | Wanted light and heavy sets | Light shows one item and one action. Full is the current Now surface. Deep shows everything including grade paths, coverage and the map. Device-local, never synced |
| Progressive disclosure | Wanted to minimize things | One primary object per surface, few secondary facts, everything else one gesture away. Disclosure state does not persist across sessions |
| Recovery mode | Returning to several misses | Offers one recoverable thing, moves the rest into a single resolvable list, and says plainly that resolving them is the work today. One sentence, factual |
| Theming | Personalization | Grounds exposed through the token layer |
| Dark mode | Opened at night before exams | Designed, not inverted |
| Command palette | Speed | Keyboard jump to any item or surface |

---

## Layer 6: Intelligence

Build after Layer 1, never before. An assistant over unverified data is the
original failure at scale.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Grounded assistant | Wanted in-app AI chat | Answers about this semester, every answer citing the item it came from. May only state a date as certain when that date is verified; otherwise the uncertainty is attached and confirming is offered |
| Key handling | No server exists | Follow the gist token pattern exactly: entered per device, stored apart from the overlay, never exported, never in the bundle |
| Context scope | Avoidance data is sensitive | The assistant sees items, dates, grades and materials. Behavioral traces are excluded unless a question is explicitly about them |
| Extraction pipelines | Manual entry is the bottleneck | Upload, extract, propose, confirm each. Confirmation is never skipped and is what marks data verified |
| Context import | Past chats and documents | One-time import into a notes store |
| Noticing | Wanted deeper intelligence | A periodic pass surfacing the one thing worth saying, through the same notification budget |
| Draft help | Blank page problem | Item-scoped drafting. Respects the word or character limit held on the item, keeps prior drafts, and stops at passing for pass/fail work |

---

## Layer 7: Fieldwork

MGT 4803 is 40% weekly team updates across ten Wednesdays at 4% each,
team-based. Its real work is a pipeline, and a deadline tracker cannot see it.

| Feature | Closes | Acceptance |
| --- | --- | --- |
| Contact pipeline | Outreach invisible | States: identified, contacted, scheduled, interviewed, no-reply with follow-up. The health metric is how many sit in contacted right now, since interviews next week come from messages sent this week |
| Interview script | Read the book, unused | Mom Test rules visible at the moment they apply, at the top of the interview screen. Questions about the last time something happened and what it cost, never "would you" |
| Findings log | Findings presented weekly | One note per interview, tagged by the assumption it supports or breaks |
| Update generator | Weekly deliverable | Assembles a draft from the week's tagged findings and pipeline state. It drafts, the person writes |
| Cadence health | Weekly items go quiet | A recurring item whose work starts days earlier shows the gap on Sunday, not Wednesday |

---

## Cross-cutting: prerequisites

Not a layer. An edge type the schema lacks entirely, and the cause of the
worst failure recorded.

A `blocks` relation between items. Effective priority is an item's own score
or the score of what it unlocks, whichever is higher. A prerequisite carries
lead time, since it must be done days before the thing it gates rather than on
the same day.

Also required: an externally blocked state, for an item attempted and stopped
by something broken. It suppresses avoidance scoring, records what is being
waited on, and carries its own follow-up date. Being wrong here is worse than
being wrong anywhere else, because the avoidance signal has to be trustworthy
to be worth anything.

---

## Build sequence

| Phase | Build | Unblocks |
| --- | --- | --- |
| 0 | Design tokens, states checklist | Everything after it |
| 1 | Verified dates, prerequisites, resolution states, blocked state | The failures recorded this term |
| 2 | Grade simulator, path chart, policies, day exposure | Knowing where things stand |
| 3 | The 2.0 visual pass | A design for the real set of states |
| 4 | Web push, morning check-in, notification budget | The daily loop |
| 5 | Fieldwork pipeline | 40% of one course's grade |
| 6 | Focus modes, dark mode, theming, recovery mode | Attention control |
| 7 | Canvas feed, syllabus and slide extraction | Manual entry mostly gone |
| 8 | Exam dossier, prep ladder, cheat sheet builder | Exam preparation |
| 9 | Cram mode, learning cards, practice bank | Studying |
| 10 | Grounded assistant, noticing, context import | The intelligence layer |

Phase 3 sits after phase 1 deliberately. The redesign has to express verified
versus unchecked versus contradicted dates, blocked items, resolved misses and
prerequisite chains. Designed before those exist, it gets designed twice.

Phase 8 precedes phase 9 because Cram mode needs the topic data that dossiers
and extraction produce.
