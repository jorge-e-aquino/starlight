import assert from 'node:assert/strict';
import { evidenceFor, localAnswer, modelContext, citedAnswer } from '../src/intelligence.js';
import { noticingCandidate, selectNotifications } from '../src/notification.js';

const courses = [{ id: 'econ', code: 'ECON 2105', name: 'Macroeconomics' }];
const items = [{ id: 'econ-test', courseId: 'econ', courseCode: 'ECON 2105', title: 'Midterm', date: '2026-10-02', time: null, points: 50, notes: '' }];
const overlay = { items: { 'econ-test': { opens: [1, 2, 3], dateTrust: { status: 'contradicted', date: '2026-10-02', source: 'Sources disagree' } } }, notes: {} };
const found = evidenceFor('When is ECON midterm?', items, courses, overlay);
assert.equal(found[0].itemId, 'econ-test');
assert.ok(!found[0].text.includes('2026-10-02'));
assert.ok(localAnswer('When is ECON midterm?', found).includes('Sources disagree'));
assert.ok(!modelContext(found).includes('recorded opens'));
assert.ok(evidenceFor('Am I avoiding the ECON midterm?', items, courses, overlay, [], { includeBehavior: true }).some((entry) => entry.kind === 'behavior'));
assert.equal(citedAnswer('A claim with no citation.', found), null);
assert.equal(citedAnswer('A claim [E2].', found), null);
assert.equal(citedAnswer('Sources disagree [E1].', found).citations[0].itemId, 'econ-test');
assert.equal(evidenceFor('When is ECON 2105 Midterm?', items, courses, overlay, [{ name: 'ECON file', text: 'Midterm is a topic.' }])[0].itemId, 'econ-test');

const verified = { items: { 'econ-test': { dateTrust: { status: 'verified', date: '2026-10-02', time: null, source: 'Canvas' } } } };
assert.ok(localAnswer('When is ECON midterm?', evidenceFor('When is ECON midterm?', items, courses, verified)).includes('Verified 2026-10-02'));
const grades = { items: { 'econ-test': { score: 40, resolution: { state: 'cant-submit' } } } };
const gradeEvidence = evidenceFor('What grade cost for ECON midterm?', items, [{ ...courses[0], totalPoints: 500, items, groups: [] }], grades);
assert.ok(gradeEvidence[0].text.includes('Posted score: 40 of 50 points'));
assert.ok(gradeEvidence[0].text.includes('Recorded loss: 50 points, 10.0% of course'));
const material = [{ id: 'file1', name: 'Lecture.pdf', courseCode: 'ECON 2105', text: 'Unrelated.\fInflation is a sustained rise in the overall price level.' }];
assert.equal(evidenceFor('What is inflation?', [], courses, { items: {} }, material)[0].title, 'Lecture.pdf, page 2');

const note = { items: {}, notes: { n1: { title: 'Past chat', text: 'Interview notes about Haiti', source: 'import' } } };
assert.ok(evidenceFor('Haiti interview', [], courses, note)[0].title === 'Past chat');
const candidate = noticingCandidate(items[0], { status: 'contradicted' }, '2026-10-01');
assert.ok(candidate.action.includes('Sources disagree'));
assert.equal(selectNotifications([candidate, candidate, candidate]).length, 1);
assert.equal(noticingCandidate(items[0], { status: 'verified' }, '2026-10-01'), null);
console.log('Grounded assistant, privacy, date trust, and noticing checks pass.');
