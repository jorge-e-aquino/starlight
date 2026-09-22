// Run: node src/merge.test.js
// No framework on purpose. The merge is the one piece of this app that can lose
// a semester of work silently, so it gets checked with something that runs
// anywhere, with no install step, in under a second.
import { mergeState, mergeRecord } from './merge.js';

let failures = 0;
const eq = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// Key order is an artifact of which side was spread first, not a difference in
// meaning, so compare records by content.
function sorted(v) {
  if (Array.isArray(v)) return v.map(sorted);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => ((o[k] = sorted(v[k])), o), {});
  }
  return v;
}

function check(name, pass, detail) {
  if (pass) return console.log(`  ok   ${name}`);
  failures += 1;
  console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ''}`);
}

const item = (fields, t) => ({ ...fields, _t: t });

// --- decisions: the most recent claim wins, including a claim of "not done" ---
{
  const laptop = { items: { a: item({ doneAt: 100 }, { doneAt: 100 }) } };
  const phone = { items: { a: item({ doneAt: null }, { doneAt: 200 }) } };
  const m = mergeState(laptop, phone);
  check('un-marking done beats an older mark', m.items.a.doneAt === null,
    `got doneAt=${m.items.a.doneAt}`);

  const back = mergeState(phone, laptop);
  check('...and the same whichever side merges', eq(m, back));
}

{
  const stale = { items: { a: item({ doneAt: null }, { doneAt: 50 }) } };
  const fresh = { items: { a: item({ doneAt: 900 }, { doneAt: 900 }) } };
  check('a newer mark beats an older clear',
    mergeState(stale, fresh).items.a.doneAt === 900);
}

// --- an unstamped legacy write must not beat a stamped one ---
{
  const legacy = { items: { a: { doneAt: 111 } } };
  const stamped = { items: { a: item({ doneAt: null }, { doneAt: 5 }) } };
  check('stamped write beats unstamped legacy write',
    mergeState(legacy, stamped).items.a.doneAt === null);
}

// --- logs: both halves of an observation survive ---
{
  const laptop = { items: { a: item({ opens: [1, 2], focusDays: ['2026-9-7'] }, {}) } };
  const phone = { items: { a: item({ opens: [2, 3], focusDays: ['2026-9-8'] }, {}) } };
  const m = mergeState(laptop, phone);
  check('opens union without duplicates', eq(m.items.a.opens, [1, 2, 3]),
    JSON.stringify(m.items.a.opens));
  check('focusDays union', eq(m.items.a.focusDays, ['2026-9-7', '2026-9-8']),
    JSON.stringify(m.items.a.focusDays));
}

{
  // Day keys are not zero padded, so a lexical sort would order Oct before Sep
  // and the cap would then discard the wrong end.
  const a = { items: { x: item({ focusDays: ['2026-9-7'] }, {}) } };
  const b = { items: { x: item({ focusDays: ['2026-10-7'] }, {}) } };
  check('unpadded day keys order by real date',
    eq(mergeState(a, b).items.x.focusDays, ['2026-9-7', '2026-10-7']),
    JSON.stringify(mergeState(a, b).items.x.focusDays));
}

{
  const many = Array.from({ length: 40 }, (_, i) => i + 1);
  const m = mergeState(
    { items: { a: item({ opens: many }, {}) } },
    { items: { a: item({ opens: [99, 100] }, {}) } }
  );
  check('opens stay capped at 40', m.items.a.opens.length === 40, `len=${m.items.a.opens.length}`);
  check('the cap keeps the most recent', m.items.a.opens.includes(100));
}

// --- device-local fields never cross ---
{
  const a = { items: { exam: item({ cheatSheet: ['draft two'], sheetDrafts: [{ id: 'a', pages: ['draft one'], at: 1 }] }, { cheatSheet: 2 }) } };
  const b = { items: { exam: item({ cheatSheet: ['draft three'], sheetDrafts: [{ id: 'b', pages: ['draft two'], at: 3 }] }, { cheatSheet: 4 }) } };
  const merged = mergeState(a, b).items.exam;
  check('latest sheet text wins as a decision', merged.cheatSheet[0] === 'draft three');
  check('prior sheet drafts union as a capped log', merged.sheetDrafts.length === 2 && merged.sheetDrafts[0].id === 'a' && merged.sheetDrafts[1].id === 'b');
}

{
  const a = { items: { work: item({ draftText: 'first', draftHistory: [{ id: 'a', text: 'older', at: 1 }] }, { draftText: 2 }) },
    notes: { context: item({ text: 'old' }, { text: 1 }) } };
  const b = { items: { work: item({ draftText: 'second', draftHistory: [{ id: 'b', text: 'first', at: 3 }] }, { draftText: 4 }) },
    notes: { context: item({ text: 'revised' }, { text: 5 }) } };
  const merged = mergeState(a, b);
  check('later writing and imported context decisions win', merged.items.work.draftText === 'second' && merged.notes.context.text === 'revised');
  check('earlier drafts union across devices', merged.items.work.draftHistory.length === 2);
}

// --- device-local fields never cross ---
{
  const local = { timer: { endsAt: 5 }, sound: false, items: {} };
  const remote = { timer: { endsAt: 999 }, sound: true, items: {} };
  const m = mergeState(local, remote);
  check("this device's timer survives", m.timer.endsAt === 5);
  check("this device's sound setting survives", m.sound === false);
}

{
  const m = mergeState({ items: {} }, { timer: { endsAt: 999 }, items: {} });
  check('a remote timer is not adopted', !('timer' in m), JSON.stringify(m.timer));
}

// --- algebraic properties, over a spread of shapes ---
{
  const samples = [
    { items: { a: item({ doneAt: 1, opens: [1] }, { doneAt: 1 }) }, days: {} },
    { items: { a: item({ doneAt: null, firstStep: 'x', opens: [2] }, { doneAt: 9, firstStep: 9 }) } },
    { items: { b: item({ pomosDone: 3 }, { pomosDone: 4 }) }, lastVisit: 77 },
    { items: {}, days: { '2026-09-07': item({ startAt: '09:00' }, { startAt: 3 }) } },
    {}
  ];
  let commutative = true;
  let idempotent = true;
  let associative = true;
  for (const a of samples) {
    for (const b of samples) {
      const ab = mergeState(a, b);
      if (!eq(ab, mergeState(b, a))) commutative = false;
      if (!eq(mergeState(ab, a), ab)) idempotent = false;
      if (!eq(mergeState(ab, b), ab)) idempotent = false;
      for (const c of samples) {
        if (!eq(mergeState(mergeState(a, b), c), mergeState(a, mergeState(b, c)))) associative = false;
      }
    }
  }
  check('commutative: order of sync does not matter', commutative);
  check('idempotent: re-syncing changes nothing', idempotent);
  check('associative: three devices land in one place', associative);
}

// --- stamps survive, so a third device can still compare ---
{
  const m = mergeRecord(item({ doneAt: 1 }, { doneAt: 10 }), item({ firstStep: 'go' }, { firstStep: 20 }));
  check('winning stamps are carried forward', m._t.doneAt === 10 && m._t.firstStep === 20,
    JSON.stringify(m._t));
}

// --- days merge like items ---
{
  const m = mergeState(
    { days: { '2026-09-07': item({ startAt: '09:00', first: 'a' }, { startAt: 1, first: 1 }) } },
    { days: { '2026-09-07': item({ startAt: '14:00' }, { startAt: 5 }) } }
  );
  check('later day start wins', m.days['2026-09-07'].startAt === '14:00');
  check('untouched day field survives', m.days['2026-09-07'].first === 'a');
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
