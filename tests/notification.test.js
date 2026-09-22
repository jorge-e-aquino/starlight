import assert from 'node:assert/strict';
import { DAILY_REGULAR_LIMIT, selectNotifications, morningCandidate, examMorningCandidate, examReadinessCandidate } from '../src/notification.js';

const regular = (id, priority = 1) => ({ id, itemId: id, kind: 'regular', priority, title: `ECON 2105 · ${id}`, action: 'Open it' });
const exam = { ...regular('exam'), kind: 'exam-morning' };

assert.equal(DAILY_REGULAR_LIMIT, 2);
assert.deepEqual(selectNotifications([]), []);
assert.deepEqual(selectNotifications([regular('a'), regular('b'), regular('c', 3)]).map((n) => n.id), ['c', 'a']);
assert.deepEqual(selectNotifications([regular('a'), regular('b'), exam], [{ id: 'old', kind: 'regular' }]).map((n) => n.id), ['exam', 'a']);
assert.deepEqual(selectNotifications([regular('a'), regular('b'), exam], [regular('x'), regular('y')]).map((n) => n.id), ['exam']);
assert.deepEqual(selectNotifications([exam], [exam]), []);

const item = { id: 'econ-test1', courseCode: 'ECON 2105', title: 'Midterm 1' };
assert.deepEqual(morningCandidate(item, '2026-10-02'), {
  id: 'morning:econ-test1:2026-10-02', itemId: 'econ-test1', kind: 'regular', priority: 1,
  title: 'ECON 2105 · Midterm 1', action: 'Open this item in Starlight.'
});
const dossier = { confirmed: true, startTime: '12:00 PM', location: 'Remote', materials: 'calculator' };
const trust = { status: 'verified', source: 'Canvas', date: '2026-10-02' };
assert.equal(examMorningCandidate(item, dossier, trust, '2026-10-02').kind, 'exam-morning');
assert.equal(examMorningCandidate(item, { ...dossier, confirmed: false }, trust, '2026-10-02'), null);
assert.equal(examMorningCandidate(item, dossier, { ...trust, source: '' }, '2026-10-02'), null);
assert.equal(examMorningCandidate(item, dossier, trust, '2026-10-03'), null);
const disputed = examReadinessCandidate(item, { status: 'contradicted' }, '2026-09-30', 2);
assert.match(disputed.action, /sources disagree/);
assert.equal(disputed.action.includes('Starts'), false);
assert.equal(examReadinessCandidate(item, trust, '2026-09-30', 3), null);

console.log('Notification policy checks passed.');
