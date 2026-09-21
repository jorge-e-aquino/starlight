# States and phase verification

Every phase checks the surfaces it touches at desktop and phone width. Local
progress stays separate from the semester schema. Date verification belongs to
the user.

| Surface | Loading | Empty | Error | Offline | First run |
| --- | --- | --- | --- | --- | --- |
| App shell | Opening your semester status before modules load | Existing Now clear state | Visible load failure and retry | Local semester remains usable; reconnect status | Short orientation with import route |
| Progress storage | Synchronous read before rendering | Empty items collection | Preserve unreadable original; show restore/export guidance | Local read and write work | No migration or invented progress |
| Import | File read finishes before merge | Reject missing items object | Inline file error; preserve previous state | Local file import works | Restore into an empty collection |
| New item controls | Read saved decision before rendering | Explain missing information | Keep input and show correction | Save locally and sync on reconnect | Present unchecked or unresolved state |
| Grade path | Calculate from current ledger | Explain missing scores | Identify incomplete or inconsistent policies | Pure calculation stays available | Show assumptions and unresolved ledger |
| Daily check-in | Derive four beats from the local map on open | Say when there is no due item, startable item, or near date to confirm | Use the app's load/storage error and require a valid start time | Read the cached map; save day shape locally | User starts it after orientation; it does not ask for push permission |
| Evening close | Derive from today's local progress | State plainly when no completion was recorded | Use the app's load/storage error | Local summary remains available | Optional entry from check-in |
| Web reminders | Check Vercel setup after a useful moment | Quiet days send nothing; no subscription stays a local check-in | Keep the entered key and explain service or permission failures | Save progress locally and retry projection on reconnect | No browser permission ask on the first open |
| Later phases | Define per phase | Define per phase | Define per phase | Define per phase | Define per phase |

## Required per phase

- Run all tests and the existing production build.
- Load the real September 21 backup through storage and import; compare every field.
- Inspect desktop and phone layouts, including keyboard and touch controls.
- Exercise loading, empty, error, offline and first-run states for touched surfaces.
- Record new overlay fields as logs or decisions in the phase commit.
- Report what landed, revised assumptions, and input needed for the next phase.

## Phase 0

The existing visual ground stays in place while tokens establish the redesign
boundary. Session-only orientation and storage health introduce no overlay fields.
The app reports storage failures and preserves an unreadable original rather than
overwriting it with an empty semester.
