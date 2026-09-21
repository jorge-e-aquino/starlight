// Run: node tests/fieldwork.test.js
// Pipeline rules, the cadence gap, the draft assembly, and the merge behavior
// of the new collections. Synthetic data only; no real contacts in this file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeState } from '../src/merge.js';
import {
  activeContacts,
  cadenceGap,
  interviewScript,
  pipelineHealth,
  tagLabel,
  weeklyDraft
} from '../src/fieldwork.js';

// --- validation and setters, through the real overlay ---
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
const state = await import('../src/state.js');

{
  const id = 'contact-test-1';
  state.upsertContact(id, { name: 'Ada Example', org: 'Example Co', state: 'identified' });
  assert.equal(state.contactRecord(id).name, 'Ada Example');
  assert.equal(state.contactRecord(id).state, 'identified');
  assert.throws(() => state.upsertContact(id, { state: 'hired' }), /where this contact stands/);
  assert.throws(() => state.upsertContact('contact-test-2', { name: '' }), /Name the contact/);
  // Moving to no-reply without a follow-up date is refused.
  assert.throws(() => state.upsertContact(id, { state: 'no-reply' }), /follow-up/);
  state.upsertContact(id, { state: 'no-reply', followUp: '2026-09-24' });
  assert.equal(state.contactRecord(id).followUp, '2026-09-24');
  // The stamped decision lives in _t per field, like every other decision.
  assert.ok(state.contactRecord(id)._t.state > 0);
  // Tombstone removal, also stamped.
  state.removeContact(id);
  assert.ok(state.contactRecord(id).deletedAt);
  assert.equal(activeContacts(state.snapshot().contacts).length, 0);
  state.restoreContact(id);
  assert.equal(activeContacts(state.snapshot().contacts).length, 1);
  state.upsertContact(id, { state: 'contacted', followUp: null });
  assert.equal(state.contactRecord(id).followUp, null);
}

{
  const id = 'finding-test-1';
  assert.throws(() => state.upsertFinding(id, { text: '' }), /Write the finding/);
  assert.throws(() => state.upsertFinding(id, { text: 'x', assumption: 'A named claim' }), /Tag whether/);
  assert.throws(() => state.upsertFinding(id, { text: 'x', tag: 'breaks' }), /Name the assumption/);
  state.upsertFinding(id, { text: 'They rebuilt the flow twice last quarter.', assumption: 'Teams use the current workflow', tag: 'breaks' });
  assert.equal(state.findingRecord(id).tag, 'breaks');
  assert.ok(state.findingRecord(id)._t.text > 0);
  state.removeFinding(id);
  assert.ok(state.findingRecord(id).deletedAt);
  state.restoreFinding(id);
  assert.equal(state.findingRecord(id).deletedAt, null);
}

{
  // An empty draft clears instead of saving whitespace.
  state.setUpdateDraft('biz-update2', '  ');
  assert.equal(state.itemState('biz-update2').updateDraft, null);
  state.setUpdateDraft('biz-update2', 'Draft text');
  assert.equal(state.itemState('biz-update2').updateDraft, 'Draft text');
  assert.ok(state.itemState('biz-update2')._t.updateDraft > 0);
}

// --- pipeline health: the metric is how many sit in contacted right now ---
{
  const contacts = {
    a: { name: 'A', state: 'contacted' },
    b: { name: 'B', state: 'contacted' },
    c: { name: 'C', state: 'scheduled' },
    d: { name: 'D', state: 'interviewed' },
    e: { name: 'E', state: 'no-reply', followUp: '2026-09-20' },
    f: { name: 'F', state: 'identified', deletedAt: 1 }
  };
  const health = pipelineHealth(contacts);
  assert.equal(health.inContacted, 2);
  assert.equal(health.scheduled, 1);
  assert.equal(health.interviewed, 1);
  assert.equal(health.waiting, 1);
  assert.equal(health.total, 5, 'tombstones are not pipeline');
  assert.equal(health.followUpsDue, 1);
}

// --- the script: about the last time it happened, never would you ---
{
  const script = interviewScript();
  assert.ok(script.rules.some((rule) => /last time/i.test(rule)));
  assert.ok(script.questions.every((question) => !/would you/i.test(question)));
  assert.ok(script.questions.some((question) => /cost/i.test(question)));
  assert.equal(tagLabel('breaks'), 'breaks the assumption');
}

// --- the weekly draft assembles from the week's tagged findings ---
{
  const contacts = {
    'contact-1': { name: 'Ada Example', state: 'interviewed' }
  };
  const findings = {
    'finding-1': { text: 'They re-shipped pricing twice.', assumption: 'Pricing stays stable', tag: 'breaks', date: '2026-09-25', contactId: 'contact-1' },
    'finding-boundary': { text: 'The first day of this update week.', assumption: 'Outreach begins Thursday', tag: 'supports', date: '2026-09-24', contactId: 'contact-1' },
    'finding-2': { text: 'Last month, wrong week.', tag: 'supports', date: '2026-09-14', contactId: 'contact-1' },
    'finding-3': { text: 'Tombstoned.', tag: 'supports', date: '2026-09-22', deletedAt: 9 }
  };
  const weekItem = { id: 'biz-update3', title: 'Weekly Team Update 3', date: '2026-09-30' };
  const draft = weeklyDraft(weekItem, 'MGT 4803', findings, contacts);
  assert.ok(draft.includes('Weekly Team Update 3 (MGT 4803)'));
  assert.ok(draft.includes('Pricing stays stable: breaks the assumption. They re-shipped pricing twice. (Ada Example)'));
  assert.ok(draft.includes('Outreach begins Thursday: supports the assumption. The first day of this update week.'));
  assert.ok(draft.includes('2 interviews logged for this update'));
  assert.ok(draft.includes('What changed') && draft.includes('Next steps'));
  assert.ok(!draft.includes('wrong week'), 'findings from other weeks stay out');
  assert.ok(!draft.includes('Tombstoned'));
  assert.ok(draft.includes('Pipeline:'));
}

// --- cadence health: the gap shows on Sunday, not on deadline day ---
{
  const updateItems = [
    { id: 'u1', title: 'Update 1', date: '2026-09-16', status: 'upcoming' },
    { id: 'u2', title: 'Update 2', date: '2026-09-23', status: 'upcoming' },
    { id: 'u3', title: 'Update 3', date: '2026-09-30', status: 'upcoming' }
  ];
  // History: work on update 1 started two days before its deadline, update 2
  // started three days before. The recent habit: three days ahead.
  const overlay = { items: {
    u1: { startedAt: new Date('2026-09-14T12:00:00').getTime() },
    u2: { startedAt: new Date('2026-09-20T12:00:00').getTime() }
  } };
  // Before the week opens there is nothing to say yet. Update 3 is due
  // Wednesday 2026-09-30, so its week opens Sunday 2026-09-27.
  assert.equal(cadenceGap(updateItems, overlay, new Date('2026-09-26T12:00:00')), null);
  // Sunday of the update week: the gap shows while the window is open.
  const sunday = cadenceGap(updateItems, overlay, new Date('2026-09-27T12:00:00'));
  assert.ok(sunday);
  assert.equal(sunday.itemId, 'u3');
  assert.equal(sunday.typicalLead, 3);
  assert.equal(sunday.gapDays, 0, 'on Sunday the start window is still open');
  // By the eve of the deadline the gap has grown; that is what the Sunday line
  // exists to prevent.
  const tuesday = cadenceGap(updateItems, overlay, new Date('2026-09-29T12:00:00'));
  assert.equal(tuesday.gapDays, 2);
  // The Sunday warning is useful even before the first recorded start.
  const firstSunday = cadenceGap(updateItems, { items: {} }, new Date('2026-09-27T12:00:00'));
  assert.equal(firstSunday.itemId, 'u3');
  assert.equal(firstSunday.basis, 'calendar');
  assert.equal(firstSunday.typicalLead, 3);
}

// --- the new collections merge like decisions, with stamps and ties ---
{
  const base = { items: {}, contacts: {}, findings: {} };
  const laptop = { ...base, contacts: { c1: { name: 'Ada', state: 'contacted', _t: { name: 10, state: 10 } } } };
  const phone = { ...base, contacts: { c2: { name: 'Grace', state: 'identified', _t: { name: 11, state: 11 } } } };
  const merged = mergeState(laptop, phone);
  assert.equal(merged.contacts.c1.name, 'Ada');
  assert.equal(merged.contacts.c2.name, 'Grace');
  // A later state beats an earlier one, whichever side merges.
  const moved = { ...base, contacts: { c1: { name: 'Ada', state: 'scheduled', _t: { name: 10, state: 20 } } } };
  assert.equal(mergeState(laptop, moved).contacts.c1.state, 'scheduled');
  assert.equal(mergeState(moved, laptop).contacts.c1.state, 'scheduled');
  // Equal stamps land in one deterministic place.
  const a = { ...base, contacts: { c1: { state: 'contacted', _t: { state: 7 } } } };
  const b = { ...base, contacts: { c1: { state: 'scheduled', _t: { state: 7 } } } };
  assert.equal(mergeState(a, b).contacts.c1.state, mergeState(b, a).contacts.c1.state);
  // Tombstone removal survives the merge.
  const gone = { ...base, contacts: { c1: { name: 'Ada', deletedAt: 99, _t: { name: 5, deletedAt: 99 } } } };
  assert.equal(mergeState(a, gone).contacts.c1.deletedAt, 99);
  // Idempotence across collections.
  const ab = mergeState(a, b);
  assert.deepEqual(mergeState(ab, a), ab);
  const findingsLaptop = { ...base, findings: { f1: { text: 'x', tag: 'breaks', _t: { text: 4 } } } };
  const findingsPhone = { ...base, findings: { f2: { text: 'y', tag: 'supports', _t: { text: 5 } } } };
  const both = mergeState(findingsLaptop, findingsPhone);
  assert.equal(both.findings.f1.text, 'x');
  assert.equal(both.findings.f2.text, 'y');
}

// --- the schema's ten updates are the series, even without start history ---
{
  const schema = JSON.parse(readFileSync(new URL('../course_map_schema_v2.json', import.meta.url), 'utf8'));
  const updates = schema.courses.find((course) => course.id === 'mgt4803').items.filter((item) => item.type === 'recurring');
  assert.equal(updates.length, 10);
  const gap = cadenceGap(updates, {}, new Date('2026-09-20T12:00:00'));
  assert.equal(gap?.itemId, 'biz-update2');
  assert.equal(gap?.basis, 'calendar');
}

console.log('Fieldwork checks pass.');
