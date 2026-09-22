# Starlight UX friction log, September 21, 2026

Status: captured for the next design push. This document records the user's seven
screenshots and feedback. It does not claim that a cropped screenshot proves the
cause of a bug. No app behavior, personal progress, or date verification changed
as part of this log.

## Product direction from the user

- The map and its Today slice are the center of the experience. Grade information
  supports a decision; it should not crowd out the next useful action.
- The user should reach and complete a common action in at most three clicks or
  taps from a sensible starting surface. This is a usability target to test,
  including navigation, opening a disclosure, and saving. Typing is separate.
- Starlight should do the preparation: connect to a source or accept a file once,
  extract useful facts, reconcile duplicates, and present a short review. A user
  still confirms proposed facts and dates. Extraction never silently verifies a
  date or changes the semester schema.
- Reduce visible controls, forms, and repeated menus. Keep advanced controls
  available at the moment they help. Preserve the calm tone, course identity,
  source trust, and an easy path to correct a wrong suggestion.
- Icons, graphics, motion, and other web-native interactions are welcome when
  they clarify meaning or make a task faster. The user is open to useful
  dependencies and tools for the next build. Judge each by the user-facing
  improvement, maintenance cost, and how it behaves on the target devices.
- Optimize first for iPhone 16 Pro Safari and 13/14-inch MacBook Air Chrome.
  Check actual browser behavior and font scaling, not only viewport screenshots.

## Screenshot observations and proposed outcomes

| Image | What the screenshot shows | Friction or question to reproduce | Outcome to test in the next push |
| --- | --- | --- | --- |
| 1, Plan block | A due label wraps into short fragments above an isolated “Finished the whole thing” link, with large empty and ruled areas. | The item and its primary action may lose visual connection at this width or state. The crop does not identify the exact viewport or item. | A work block reads as one unit. Course, item, time trust, deadline, and next action remain legible without awkward wraps or detached controls. |
| 2, item detail | A cropped detail shows “Final Exam (ECON 2105)” above a recorded-score field labeled “out of 1.5” and a Quick 15–30 minute estimate. | Possible item/score mismatch or confusing relationship between a prerequisite and the exam it unlocks. The crop may omit the current item title. Reproduce before changing data. A timed exam also should not inherit a coursework duration. | Show the exact item's scoring basis and source. Distinguish prerequisite, exam event, and preparation. Put score and effort editing behind a relevant moment. |
| 3, Interviews | A contact card shows an Identified dropdown, a separate Move button, a prominent Remove action, and an always-visible three-field add form. | Moving one contact asks for multiple controls; management UI outweighs the interview action. The empty counters provide little guidance. | One clear next action advances a contact when appropriate. Adding a person is short and contextual; editing and removal are secondary. An interview can begin within three taps. |
| 4, Materials | “Canvas & course details” contains four large nested disclosures: Canvas calendar, Paste text to analyze, Confirmed course knowledge, and Paste context. | Several routes appear to request similar source information and expose the application's internal pipeline. The user must decide which tool to operate. | One obvious “add a source” path accepts a document, pasted text, or Canvas connection, then shows proposed changes for review. Existing sources and corrections remain easy to find. |
| 5, appearance open | The Appearance popover sits inside a crowded header with Check in, five view tabs, Jump, and Ask. | The popover competes with navigation. “Ground” and “Light” sound like implementation controls. The crop suggests weak hierarchy. | Appearance choices are understandable, previewable, persistent, and tucked away from the daily path. Header actions have distinct importance. |
| 6, appearance closed | The same dense header remains above a large Materials title; the crop shows considerable space before the content. | Top-level utilities consume attention before the page's purpose. The crop alone cannot establish a spacing bug across the full page. | The first viewport states the page's purpose and its one useful action. Navigation remains stable at Mac and phone widths. |
| 7, exam detail | “Exam preparation · details to check” expands into a long form for start, duration, location, format, sheet size, calculator, topics, submission, and source. | This looks like manual syllabus transcription, and completion depends on knowing which fields matter. It also separates source collection from review. | A syllabus or course page proposes the dossier. The user reviews grouped, source-linked facts and confirms only what is known. Missing essentials appear as a short checklist; optional fields stay folded. |

## Three-click task checks

Count taps or clicks from the named starting surface to the completed action.
Record the actual count, time, hesitation, errors, and whether the result is clear.
Do not shorten a path by silently accepting uncertain source facts.

1. From the map's Today slice, open a due item and mark it submitted or resolve
   that it cannot be submitted.
2. From Now or Plan, start the recommended coursework item or adjust its
   duration when the estimate is wrong.
3. From Interviews, open a contact, start an interview, and advance its stage.
4. From Materials, add a syllabus or course screenshot and review the proposed
   dates, rules, and files.
5. From an exam, find the actual start, duration, allowed materials, and source.
   When unknown, identify the one source to check without filling a blank form.
6. Change appearance once, then confirm the choice survives reload and follows
   the selected system or manual scheme.

The likely design move is to combine source intake, extraction, and review into
one flow, then present facts inside the task or exam they inform. Keep a separate
source library for retrieval and correction. This is a proposal, not an approved
architecture change; assess the current data paths before implementation.

For the next push, check the possible score/item mismatch first because a wrong
grade basis can mislead a decision. Then prototype the unified Materials intake
and the short exam review, since these remove the most manual work. Simplify the
Plan block and Interviews actions next, and settle header and appearance layout
as one responsive navigation pass. This order may change after reproduction.

## Evaluation and boundaries for the next push

- Reproduce each screenshot state on both target devices and inspect loading,
  first-run, empty, offline, and error states. Check narrow screens, large text,
  keyboard presence, and open/closed overlays.
- Review every visible control: keep it on the primary surface only if it helps
  the next decision. Move advanced editing closer to the item or source involved.
- Compare proposed extracted facts with Canvas or the underlying document;
  retain provenance and flag conflicts. Only the user can mark a date verified.
- Test with the user's real coursework, one missed item, a blocked prerequisite,
  and one timed exam. Measure successful decisions and satisfaction before
  measuring frequency. Irregular use must remain safe.
- Evaluate useful libraries and tools as options for the next build. Keep
  endpoint, sensitive-data, and sync changes explicit before implementation.

This log complements `AUDIT_2026-09-21.md`. The screenshots supply direct user
feedback; the audit supplies broader task scenarios and earlier code findings.
