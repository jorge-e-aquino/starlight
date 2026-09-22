import assert from 'node:assert/strict';
import schema from '../course_map_schema_v2.json' with { type: 'json' };
import { cleanProjection, mergeProjection } from '../api/push.js';
import { candidatesForDay } from '../api/send.js';
import { reminderProjection } from '../src/push-client.js';

globalThis.localStorage = { getItem: () => null };
const { sanitizeForSync } = await import('../src/sync.js');

const state = { lastVisit: 42, timer: { started: 42 }, sound: true, items: {
  'econ-honorlock': { opens: [1, 2], focusDays: ['2026-9-21'], doneAt: null, externalBlock: { reason: 'private machine details', followUpDate: '2026-09-22' }, dateTrust: { status: 'unverified', date: '2026-09-21', sources: [{ note: 'private source note' }] }, _t: { opens: 2, focusDays: 2, doneAt: 3, dateTrust: 4 } }
} };
const wire = sanitizeForSync(state);
assert.equal(wire.lastVisit, undefined);
assert.equal(wire.timer, undefined);
assert.equal(wire.items['econ-honorlock'].opens, undefined);
assert.equal(wire.items['econ-honorlock'].focusDays, undefined);
assert.equal(wire.items['econ-honorlock']._t.opens, undefined);
assert.equal(wire.items['econ-honorlock'].doneAt, null);
assert.deepEqual(state.items['econ-honorlock'].opens, [1, 2]);

const projection = reminderProjection(state);
assert.equal(projection.items['econ-honorlock'].opens, undefined);
assert.equal(projection.items['econ-honorlock'].focusDays, undefined);
assert.equal(projection.items['econ-honorlock'].dateTrust.status, 'unverified');
assert.equal(projection.items['econ-honorlock'].externalBlock, true);
assert.equal(JSON.stringify(projection).includes('private'), false);
assert.deepEqual(cleanProjection({ items: { 'econ-honorlock': { ...state.items['econ-honorlock'], firstStep: 'private', _t: state.items['econ-honorlock']._t } } }).items['econ-honorlock'], projection.items['econ-honorlock']);

const old = { items: { a: { doneAt: 1, _t: { doneAt: 1 } } } };
const newer = { items: { a: { doneAt: null, _t: { doneAt: 2 } }, b: { resolution: { state: 'cant-submit' }, _t: { resolution: 2 } } } };
assert.equal(mergeProjection(old, newer).items.a.doneAt, null);
assert.equal(mergeProjection(newer, old).items.a.doneAt, null);
assert.equal(mergeProjection(old, newer).items.b.resolution.state, 'cant-submit');

const empty = candidatesForDay({ courses: [] }, { items: {} }, '2026-09-21');
assert.deepEqual(empty, []);
const onExamDay = candidatesForDay(schema, { items: {} }, '2026-10-02');
assert.equal(onExamDay.some((c) => c.kind === 'exam-morning'), false);
const exam = schema.courses.flatMap((c) => c.items).find((i) => i.id === 'econ-midterm1');
const confirmed = { items: { [exam.id]: { dateTrust: { status: 'verified', date: '2026-10-02', source: 'Canvas checked by user' }, examDossier: { confirmed: true, startTime: '9:00 AM', location: 'Remote', materials: 'calculator' } } } };
assert.equal(candidatesForDay(schema, confirmed, '2026-10-02').some((c) => c.kind === 'exam-morning' && c.itemId === exam.id), true);
confirmed.items[exam.id].dateTrust.status = 'unverified';
assert.equal(candidatesForDay(schema, confirmed, '2026-10-02').some((c) => c.kind === 'exam-morning' && c.itemId === exam.id), false);
confirmed.items['econ-honorlock'] = { doneAt: 1 };
assert.equal(candidatesForDay(schema, confirmed, '2026-10-01').some((c) => c.itemId === exam.id && c.action.includes('unchecked')), true);
assert.equal(candidatesForDay(schema, confirmed, '2026-09-30').some((c) => c.itemId === exam.id && c.id.startsWith('notice:')), false);

console.log('Push privacy and scheduling checks passed.');
