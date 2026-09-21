import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeRecord } from '../src/merge.js';
import { avoidance, dateTrust, prerequisiteProjection, resolutionSummary, validatePrerequisites } from '../src/truth.js';

const schema = JSON.parse(readFileSync(new URL('../course_map_schema_v2.json', import.meta.url), 'utf8'));
const overlay = { items: {} };
for (const id of ['econ-cw11', 'econ-cw12', 'mgt2250-week2', 'mgt2250-week3']) {
  overlay.items[id] = { resolution: { state: 'cant-submit' }, _t: { resolution: 1 } };
}
overlay.items['ob-journal4'] = {
  resolution: { state: 'absorbed', cushionGroupId: 'ob-journals' },
  _t: { resolution: 1 }
};
overlay.items['econ-honorlock'] = {
  externalBlock: { waitingOn: 'System check', followUp: '2026-09-22' },
  _t: { externalBlock: 1 }
};

const costs = new Map(resolutionSummary(schema, overlay).map((course) => [course.courseId, course]));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} differs from ${expected}`);
near(costs.get('econ2105').pointsGone, 18);
near(costs.get('econ2105').percentGone, 3.6);
near(costs.get('econ2105').conditionalPoints, 1.5);
near(costs.get('mgt2250').pointsGone, 5);
near(costs.get('mgt2250').percentGone, 5 / 585 * 100);
near(costs.get('mgt3101').pointsGone, 0);
near(costs.get('mgt3101').percentGone, 0);
assert.equal(costs.get('mgt3101').cushions.find((group) => group.groupId === 'ob-journals').left, 1);

const items = schema.courses.flatMap((course) => course.items);
assert.equal(validatePrerequisites(items), true);
const projection = prerequisiteProjection(items, overlay, (item) => item.id === 'econ-midterm1' ? 100 : 1);
assert.equal(projection.get('econ-honorlock').score, 100);
assert.ok(projection.get('econ-honorlock').unlocks.includes('econ-midterm1'));
assert.deepEqual(projection.get('econ-midterm1').unmet, ['econ-honorlock']);
for (const state of ['cant-submit', 'absorbed']) {
  const writtenOff = structuredClone(overlay);
  writtenOff.items['econ-honorlock'].resolution = { state };
  const result = prerequisiteProjection(items, writtenOff, () => 1);
  assert.deepEqual(result.get('econ-midterm1').unmet, ['econ-honorlock']);
}
const completed = structuredClone(overlay);
completed.items['econ-honorlock'].doneAt = 2;
assert.deepEqual(prerequisiteProjection(items, completed, () => 1).get('econ-midterm1').unmet, []);

const test1 = schema.courses.flatMap((course) => course.items).find((item) => item.id === 'mgt2250-test1');
assert.equal(dateTrust(test1).status, 'contradicted');
assert.equal(dateTrust(test1).time, null);
assert.equal(dateTrust(test1, { items: { [test1.id]: { dateTrust: { status: 'unverified', date: test1.date, time: null } } } }).status, 'unverified');
const verified = dateTrust(test1, { items: { [test1.id]: { dateTrust: { status: 'verified', date: test1.date, source: 'User checked Canvas' } } } });
assert.equal(verified.status, 'verified');
assert.equal(dateTrust(test1, { items: { [test1.id]: { dateTrust: { status: 'verified', date: test1.date } } } }).status, 'unverified');

const equalStampA = { resolution: { state: 'cant-submit' }, _t: { resolution: 7 } };
const equalStampB = { resolution: { state: 'makeup-possible', request: 'Ask instructor' }, _t: { resolution: 7 } };
assert.deepEqual(mergeRecord(equalStampA, equalStampB), mergeRecord(equalStampB, equalStampA));
const clear = { resolution: null, _t: { resolution: 8 } };
assert.equal(mergeRecord(equalStampB, clear).resolution, null);
assert.equal(mergeRecord(clear, equalStampB).resolution, null);

// A lead date pulls the prerequisite ahead of what it unlocks: a prerequisite
// dated after its target's lead date is due by the lead date instead.
const leadItems = [
  { id: 'gate', date: '2026-10-20', blocks: [{ itemId: 'target', leadDays: 3 }] },
  { id: 'target', date: '2026-10-10' }
];
const leadView = prerequisiteProjection(leadItems, { items: {} }, () => 0, new Date('2026-10-01T12:00:00'));
assert.equal(leadView.get('gate').deadline, '2026-10-07');
// When the prerequisite's own date is already earlier, it stands.
const earlyItems = [
  { id: 'gate', date: '2026-10-05', blocks: [{ itemId: 'target', leadDays: 3 }] },
  { id: 'target', date: '2026-10-10' }
];
assert.equal(
  prerequisiteProjection(earlyItems, { items: {} }, () => 0, new Date('2026-10-01T12:00:00')).get('gate').deadline,
  '2026-10-05'
);

// Blocked is not avoidance, and a resolved miss is not circling.
const circling = { opens: [1760000000000, 1760100000000, 1760101000000], focusDays: ['2026-9-1'], _t: {} };
const circlingItem = { id: 'x', date: '2026-09-10' };
assert.ok(avoidance(circlingItem, { items: { x: circling } }));
assert.equal(
  avoidance(circlingItem, { items: { x: { ...circling, externalBlock: { waitingOn: 'Honorlock', followUp: '2026-09-22' } } } }),
  null
);
assert.equal(
  avoidance(circlingItem, { items: { x: { ...circling, resolution: { state: 'cant-submit' } } } }),
  null
);
assert.equal(
  avoidance(circlingItem, { items: { x: { ...circling, resolution: { state: 'absorbed', cushionGroupId: 'g' } } } }),
  null
);
assert.equal(avoidance(circlingItem, { items: { x: { ...circling, doneAt: 9 } } }), null);

console.log('Phase 1 ground truth checks pass.');
