import assert from 'node:assert/strict';
import { isExam, missingDossier, examBrief, prepLadder, upcomingPrep, priorExamDebrief } from '../src/exams.js';

const test = { id: 'mgt2250-test1', courseId: 'mgt2250', courseCode: 'MGT 2250', type: 'exam', title: 'Test 1', dateObj: new Date(2026, 8, 24, 12) };
const project = { ...test, type: 'final', title: 'Final Consulting Project' };
assert.ok(isExam(test));
assert.equal(isExam(project), false);
assert.ok(missingDossier({}).includes('Start time'));
assert.ok(missingDossier({ cheatSheetRule: 'allowed' }).includes('Cheat sheet dimensions and pages'));
const conflicted = { ...test, date: '2026-09-24', dateEvidence: { status: 'contradicted', sources: [] } };
const unresolvedBrief = examBrief(conflicted, { startTime: '17:00', location: 'MyLab' });
assert.match(unresolvedBrief[0].value, /recorded start/);
assert.match(unresolvedBrief[0].value, /close time needs checking/);
assert.equal(unresolvedBrief[0].unknown, true);
assert.match(unresolvedBrief[1].value, /Rule needs checking/);
const verifiedBrief = examBrief(test, { startTime: '17:00', location: 'MyLab', cheatSheetRule: 'none', materials: 'ID', source: 'Canvas Test 1' }, {
  items: { [test.id]: { dateTrust: { status: 'verified', date: '2026-09-24', time: '18:10', source: 'Canvas Test 1' } } }
});
assert.match(verifiedBrief[0].value, /^17:00 recorded start · closes 18:10/);
assert.equal(verifiedBrief[0].unknown, false);

let steps = prepLadder(test, { items: {}, topics: {} });
assert.equal(steps.find((step) => step.key === 'rules').date, '2026-09-14');
assert.equal(steps.find((step) => step.key === 'topics').date, '2026-09-17');
assert.equal(steps.some((step) => step.key === 'sheet-draft'), false);
assert.equal(steps[0].dateUnverified, true);
const dossier = { confirmed: true, source: 'User checked Canvas', startTime: '17:00',
  durationMinutes: 70, location: 'MyLab', questionCount: 40, questionFormat: 'Multiple choice',
  materials: 'ID', cheatSheetRule: 'allowed', sheetWidth: 8.5, sheetHeight: 11,
  sheetPages: 1, calculatorPolicy: 'Allowed', topicsCovered: 'Chapters 1 to 5', submissionMethod: 'MyLab' };
const overlay = { items: { [test.id]: { examDossier: dossier } }, topics: { chapter1: { title: 'Chapter 1', examIds: [test.id] } } };
steps = prepLadder(test, overlay);
assert.equal(steps.some((step) => step.key === 'rules' || step.key === 'topics'), false);
assert.equal(steps.find((step) => step.key === 'sheet-draft').date, '2026-09-21');
assert.equal(steps.find((step) => step.key === 'sheet-final').date, '2026-09-23');
assert.equal(steps.find((step) => step.key === 'morning').date, '2026-09-24');
assert.deepEqual(steps.find((step) => step.key === 'first-pass').weakTopics, ['Chapter 1']);
assert.equal(prepLadder({ ...test, dateObj: new Date(2026, 9, 1, 12) }, overlay).find((step) => step.key === 'sheet-draft').date, '2026-09-28');
assert.ok(upcomingPrep([test], overlay, new Date(2026, 8, 21)).some((step) => step.key === 'sheet-draft'));
assert.equal(upcomingPrep([test], { ...overlay, items: { ...overlay.items, ['prep:mgt2250-test1:sheet-draft']: { doneAt: 1 } } }, new Date(2026, 8, 21)).some((step) => step.key === 'sheet-draft'), false);
assert.deepEqual(prepLadder({ ...test, dateObj: null }, overlay), []);
const later = { ...test, id: 'mgt2250-test2', title: 'Test 2', dateObj: new Date(2026, 9, 22, 12) };
const withDebrief = { ...overlay, items: { ...overlay.items,
  [test.id]: { examDebrief: { format: '40 multiple choice', topics: 'Charts', different: 'Practice charts' } } } };
assert.equal(priorExamDebrief(later, [test, later], withDebrief).different, 'Practice charts');
assert.equal(priorExamDebrief(test, [test, later], withDebrief), null);
console.log('Exam dossier and derived preparation checks pass.');
