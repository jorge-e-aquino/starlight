# Starlight: findings and ground truth
As of 2026-09-21. Compiled from five prior agent conversations and one week of real use.

## Part 1: what broke, in use

Five findings. Every one traces to a specific event, not a wishlist.

### 1. Items gate other items, and the schema has no edge for it
The ECON Honorlock ID Verification Quiz is worth 1.5 points. It gates proctored
testing. Starlight scores on points, deadline and effort only, so it ranked last
and sat 17 days overdue, underneath five unrecoverable items, while blocking the
largest item of the week.

A prerequisite also needs lead time. This one needed doing three days before the
test, because a failed system check takes time to fix.

### 2. Unrecoverable items have no exit, and they hide the live ones
Six items sit in Still open. Five cannot be submitted at all. One is urgent.
All six render identically with the same two verbs. The dead five dilute the
signal on the one that matters.

### 3. The verb set lies
"Start" and "Submitted" are the only options. For an item that cannot be
submitted, both are false. The user worked around this by typing
"cannot submit (skipped)" into the first-step field, which exists for recording
the smallest next action.

### 4. Externally blocked is not avoidance
Honorlock is currently failing on the user's machine. If he opens that item
repeatedly without starting it, the avoidance detector fires at three opens
across two days and reports that he has been circling something he actually
tried. The avoidance signal is the app's most original feature and the worst
place to be wrong.

### 5. Same-day clusters fail together
Price Controls and Price Change Article were both ECON 2105, both 9 points,
both due 2026-09-17, both missed. One event, not two. Nothing warned that a
single day carried 18 points of exposure.

## Part 2: what it cost

| Course | Lost | Of course total | Share of final grade |
| --- | --- | --- | --- |
| ECON 2105 | 18 pts (two 9 pt items) | 500 | 3.6% |
| ECON 2105 | 1.5 pts if Honorlock never done | 500 | 0.3% |
| MGT 2250 | 5 pts (two weekly summaries) | 585 | 0.9% |
| MGT 3101 | Journal 4 | absorbed by a drop | 0%, one drop left |

No moment in the app reported any of this.

## Part 3: the six overdue items and their true state

| id | Course | Points | True state |
| --- | --- | --- | --- |
| econ-honorlock | ECON 2105 | 1.5 | Must complete. Blocked externally. Gates proctored tests |
| mgt2250-week2 | MGT 2250 | 2.5 | Can't submit |
| mgt2250-week3 | MGT 2250 | 2.5 | Can't submit |
| ob-journal4 | MGT 3101 | pass/fail | Can't submit. Absorbed by a drop |
| econ-cw11 Price Controls | ECON 2105 | 9 | Can't submit |
| econ-cw12 Price Change Article | ECON 2105 | 9 | Can't submit |

## Part 4: course ground truth

Deadline times differ per course. Assuming a default causes missed deadlines.

**MGT 2250 Management Statistics, 585 pts.** Async, Pearson MyLab, Honorlock
proctored. Deadlines 11:30pm. 14 weekly summaries at 2.5 pts, all count.
12 homeworks at 10 pts, best 11 count. 3 tests at 100 pts, lowest replaced by
the average of all three, so every test must still be fully prepared. Final
140 pts on 2026-12-10.

**ECON 2105 Macroeconomics, 500 pts.** Dr. Danny Woodbury, fully async,
questions via Piazza. Deadlines 11:59pm. Coursework roughly 35 items at 9 pts,
63% of the grade. Assigned country is Haiti; wrong country scores zero.
Midterm 1 2026-10-02, Midterm 2 2026-11-20.

**MGT 3101 Organizational Behavior, 1000 pts.** Deadlines 11:59pm. Journals
submit 8 of 10, pass 25 pts / nonpass 1 pt, late never accepted. Case memos
submit 6 of 7, same scoring. Tests 90 + 96 + 114. Final Consulting Project
200 pts due 2026-11-17. Case Presentation 100 pts.

**MGT 4803 Business Lab.** Participation and attendance 25%, two free absences
then 3 points off the course grade each. Torneio 10%. Weekly Team Updates 40%
across 10 Wednesdays at 4% each, team-based, so missing one affects teammates.
Final presentation, prototype and video 20%. Peer evaluation 5%, sets a peer
factor of 0.75 to 1.05.

## Part 5: dates that are NOT verified

Do not mark any of these verified. Only the user can do that.

| Item | Conflict |
| --- | --- |
| MGT 2250 Test 1 time | One source recorded Canvas as available 5:00pm, due 6:10pm on 2026-09-24. Another set all four MGT 2250 exam times to unknown. The schema currently holds `time: null` |
| MGT 2250 Tests 2, 3, Final times | Unknown |
| ECON midterm point values | Syllabus says midterms total 100. Canvas shows 50 + 75 = 125. Unresolved |
| ECON final exam date | Not posted |
| MGT 3101 section | Section D or E is unconfirmed. Section E puts Test 3 on 2026-12-11; Section D moves it to 2026-12-16 |

This table is the reason the verified-date model exists. The MGT 2250 Test 1
time was known on 2026-09-07 and lost by 2026-09-21.

## Part 6: how the user works

Stated by him, across five conversations.

- Overwhelm triggers freeze. A wall of red overdue items makes him avoid the app.
- His unlock is noticing his own avoidance, not external pressure.
- He responds badly to guilt, streaks, and seeing the whole workload at once.
- He uses tools when he gravitates to them, not on a schedule.
- Async courses feel unimportant and slip past him.
- He works in bursts at roughly 60% effort, and discovers prerequisites late.
- He is a visual person and struggles with large bodies of text.
- Tone: encouraging by default, direct when something is genuinely urgent.
- He wants the course named on every task, and has asked for this more than once.
- Word and character limits on assignments are hard constraints he states
  explicitly and revises often. Keep prior drafts; he reverts to them.
- For pass/fail work he wants it passing and meeting requirements, nothing more.
