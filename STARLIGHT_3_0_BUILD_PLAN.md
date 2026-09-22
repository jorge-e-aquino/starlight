# Starlight 3.0: personal release plan

This is the implementation filter for the larger `STARLIGHT_3_0_VISION.md`.
The first customer is Jorge in Fall 2026. Success is fewer missed or surprising
deadlines, better preparation, and an app he actually wants to open on his
iPhone. A future student product can reuse the foundations without making
Jorge fill out forms meant for that future product.

## The test case

On the days before an MGT 2250 exam, Starlight should show the sourced exam
window, test entry point, permitted materials, formula-sheet rule, topics,
technical prerequisites, and the next useful preparation action. It should
name missing facts as unknown. On exam morning it should show a compact brief
and send a useful notification if push is available. From a phone, Jorge
should be able to review and practice immediately. A date is verified only
when he marks it verified.

## Experience contract

1. The first screen is a focused Today view with the map's short due-today
   slice. The map stays one tap away and retains its position.
2. An exam opens to three readable bands: when and where, rules and materials,
   and preparation. The primary action follows its state, such as checking a
   source or studying topics. Manual editing is a secondary correction path.
3. Each important fact has source and confidence. An agent can gather facts
   and propose changes; only Jorge accepts them. Unknown and conflicting
   facts remain visible.
4. Notifications use the actual deadline, stakes, dependencies, and observed
   effort to choose an early start prompt and a later miss-prevention alert.
   They stop after completion and open the exact task. Their volume stays
   bounded.
5. The iPhone is a complete study surface. Source reading, short lessons,
   recall practice, exam briefs, and allowed sheet creation work there.
6. Keep the visible shell small. One clear action should usually be enough;
   common paths take at most three taps. The app does the gathering and
   calculation, then displays the result and the remaining uncertainty.
7. Visual polish serves orientation: strong type hierarchy, meaningful course
   color, calm dark mode, stable layout, an intentional motion vocabulary,
   and an accessible bottom sheet. No extra controls for their own sake.

## Build order

### A. Immediate reviewable slice

Make the current exam detail a compact, source-aware brief. Show known facts,
critical unknowns, preparation steps, and one useful action before any forms.
Retain every existing edit capability behind a clear correction disclosure.
Bring an upcoming exam notice into Today. Test the current progress import,
the MGT 2250 scenario, narrow Safari-like width, desktop width, and dark mode.

### B. Today and map

Bring the local prototype's focused phone dashboard and bottom task sheet into
the live app. Put a short due-today slice on the first screen; distinguish
fixed exams, prerequisite chains, and clusters. Keep full-map position through
task updates. Use observed ECON coursework duration as an estimate hypothesis,
and do not turn exams into generic work blocks.

### C. Source gathering

Unify Materials into one source inbox for Canvas information, syllabi, files,
screenshots, and pasted text. Store source receipts and original materials.
Propose extracted dates and rules with review, conflict, and unknown states.
For this personal pilot, the agent can gather from Jorge's accessible Canvas
session and place proposals into the app. Do not require manual transcription.

### D. Preparation on phone

Make a sourced exam-morning brief, topic coverage, short practice, and sheet
builder comfortable on the iPhone. Keep the sheet bound to the actual rule and
physical size. Practice should advance schoolwork, not just app engagement.

### E. Intelligent alerts and connections

Extend the existing iPhone web push path to multiple meaningful moments with
a delivery ledger, caps, cancellation, and deep links. Verify Home Screen
installation, permission, and real device delivery. Calendar and mail context
come next when they prevent a measured miss and can be connected with narrow
permissions. Keep fallback reminders when push cannot deliver.

### F. Durability and measurement

Protect sync, offline return, source provenance, multi-semester migration, and
exports. Run a weekly diary of one hard decision, one wrong source or estimate,
one thing the app helped, and whether opening felt lighter. Measure helpful
starts, exam surprises, notification usefulness, and phone study completion.
Avoid raw screen-time or notification-count goals.

## Release rule

Each slice must load the existing Fall progress file without loss, preserve
merge behavior, pass relevant checks, and be inspected at iPhone and MacBook
widths in loading, empty, error, offline, and first-run states. A source claim
must link to evidence; uncertain dates remain uncertain. The 3D game is a
separate release and does not delay this one.

The first slice is intentionally smaller than all of 3.0 so it can be reviewed
quickly. The rest of the plan remains the target, not a discard list.
