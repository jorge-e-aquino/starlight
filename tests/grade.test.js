// Run: node tests/grade.test.js
// The simulator is checked against the real numbers in STARLIGHT_FINDINGS.md
// part 2, over a synthetic schema with the same shape and totals. No personal
// data in this file.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { courseStanding, gradePath, pointsAtRisk, dayExposure, cushionCovered } from '../src/grade.js';

const course = (over = {}) => ({
  id: 't',
  code: 'TST 1000',
  totalPoints: 45,
  groups: [
    { id: 'g', label: 'Group', countRequired: 5, countTotal: 5, pointsPerItem: 9 }
  ],
  items: [
    { id: 'a', type: 'regular', group: 'g', date: '2026-09-17', points: 9, status: 'upcoming' },
    { id: 'b', type: 'regular', group: 'g', date: '2026-09-17', points: 9, status: 'upcoming' },
    { id: 'c', type: 'regular', group: 'g', date: '2026-10-01', points: 9, status: 'upcoming' },
    { id: 'd', type: 'regular', group: 'g', date: '2026-10-08', points: 9, status: 'upcoming' },
    { id: 'e', type: 'regular', group: 'g', date: '2026-10-15', points: 9, status: 'upcoming' }
  ],
  ...over
});

// --- the September failure: two 9 point items on one day, both can't submit ---
{
  const overlay = { items: {
    a: { resolution: { state: 'cant-submit' }, _t: { resolution: 1 } },
    b: { resolution: { state: 'cant-submit' }, _t: { resolution: 2 } }
  } };
  const standing = courseStanding(course(), overlay);
  // 18 of 45 points gone: the ceiling never returns to 100.
  assert.equal(standing.ceilingPercent, 27 / 45 * 100);
  assert.equal(100 - standing.ceilingPercent, 18 / 45 * 100);
  // Nothing else is graded, so the floor sits at zero, honestly.
  assert.equal(standing.floorPercent, 0);
  assert.equal(standing.unscoredCount, 2);
}

// --- a cushion absorbs one miss and leaves one drop ---
{
  const cushionCourse = course({ totalPoints: 36, groups: [{ id: 'g', label: 'Group', countRequired: 4, countTotal: 5, pointsPerItem: 9 }] });
  const overlay = { items: {
    a: { resolution: { state: 'absorbed', cushionGroupId: 'g' }, _t: { resolution: 1 } },
    b: { resolution: { state: 'absorbed', cushionGroupId: 'g' }, _t: { resolution: 2 } }
  } };
  const standing = courseStanding(cushionCourse, overlay);
  assert.equal(standing.cushions[0].capacity, 1);
  assert.equal(standing.cushions[0].used, 1);
  assert.equal(standing.cushions[0].left, 0);
  // First claim covered and banked; the second claim past the balance is gone.
  assert.equal(standing.floorPoints, 0);
  assert.equal(standing.ceilingPoints, 27);
  assert.ok(cushionCovered(cushionCourse, { id: 'a', group: 'g' }, overlay));
  assert.ok(!cushionCovered(cushionCourse, { id: 'b', group: 'g' }, overlay));
}

// --- submitting is not scoring: the ledger says so, no number is invented ---
{
  const overlay = { items: { a: { doneAt: 100 }, c: { doneAt: 110 } } };
  const standing = courseStanding(course(), overlay);
  assert.equal(standing.gradedCount, 2);
  assert.equal(standing.unscoredCount, 2);
  assert.equal(standing.earnedPercent, null);
  const hypothetical = { a: 8.5, c: 9 };
  const scored = courseStanding(course(), overlay, hypothetical);
  assert.equal(scored.earnedPercent, 17.5 / 18 * 100);
  assert.equal(scored.unscoredCount, 0);
}

// --- the path: floor rises as dates pass, ceiling caps where loss is locked ---
{
  const overlay = { items: { a: { resolution: { state: 'cant-submit' }, _t: { resolution: 1 } } } };
  const marks = gradePath(course(), overlay);
  assert.equal(marks.length, 5);
  // The locked loss caps the ceiling at 36 of 45 and it never recovers.
  assert.ok(marks.every((mark) => Math.abs(mark.ceiling - 36 / 45 * 100) < 1e-9));
  // A missed item is a known loss, not a posted score.
  assert.ok(marks.every((mark) => mark.current === null));
  assert.ok(marks.every((mark) => mark.floor === 0));
}

// --- points at risk: live unstarted counts, blocked and resolved do not ---
{
  const overlay = { items: {
    a: { externalBlock: { waitingOn: 'X', followUp: '2026-10-01' } },
    b: { resolution: { state: 'cant-submit' } },
    c: { doneAt: 5 }
  } };
  const c = course();
  const phase = (item, now) => (item.id === 'a' || item.id === 'c' ? 'live' : 'overdue');
  // Only d and e remain at risk: 18 points.
  const risk = pointsAtRisk([c], overlay, phase);
  assert.equal(risk.points, 18);
  assert.equal(risk.count, 2);
}

// --- day exposure: one day, two deadlines, 18 points, flagged once ---
{
  const c = course();
  const at = new Date('2026-09-10T12:00:00');
  const days = dayExposure([c], { items: {} }, () => 'live', { threshold: 8, at });
  const hit = days.find((day) => day.items.length === 2);
  assert.ok(hit, 'the shared day should be flagged');
  assert.equal(hit.points, 18);
  // The other days carry 9 each and stay under the threshold.
  assert.ok(days.every((day) => day.items.length !== 1 || day.points < 8));
}

// The real course ledgers must reconcile before a ceiling appears. ECON's
// posted midterm weights conflict with the 500-point total, so it stays open.
{
  const schema = JSON.parse(readFileSync(new URL('../course_map_schema_v2.json', import.meta.url), 'utf8'));
  const byCode = new Map(schema.courses.map((entry) => [entry.code, entry]));
  for (const code of ['MGT 2250', 'MGT 3101', 'MGT 4803']) {
    const standing = courseStanding(byCode.get(code));
    assert.equal(standing.reconciled, true, code);
    assert.equal(standing.ceilingPercent, 100, code);
  }
  const econ = courseStanding(byCode.get('ECON 2105'));
  assert.equal(econ.reconciled, false);
  assert.equal(econ.ceilingPercent, null);
  const ob = byCode.get('MGT 3101');
  const absorbed = { items: { 'ob-journal4': { resolution: { state: 'absorbed', cushionGroupId: 'ob-journals' } } } };
  assert.equal(courseStanding(ob, absorbed).ceilingPercent, 100);
  assert.equal(courseStanding(ob, absorbed).cushions.find((group) => group.groupId === 'ob-journals').left, 1);
  const stats = byCode.get('MGT 2250');
  const testScores = { 'mgt2250-test1': 0, 'mgt2250-test2': 100, 'mgt2250-test3': 100 };
  const scenario = courseStanding(stats, { items: {} }, testScores);
  assert.ok(Math.abs(scenario.ceilingPoints - (585 - 300 + 200 + 200 / 3)) < 1e-8);
}

console.log('Grade simulator checks pass.');
