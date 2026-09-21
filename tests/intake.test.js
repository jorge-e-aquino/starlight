import assert from 'node:assert/strict';
import { parseICal, proposeCalendarMatches } from '../src/intake.js';
import { extractSyllabusCandidates, extractTopicCandidates } from '../src/extract.js';
import { effectiveCourse } from '../src/course-facts.js';

const sample = `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:assignment-1\r\nSUMMARY:ECON 2105 Price Controls\r\n and Article\r\nDTSTART;TZID=America/New_York:20260917T115900\r\nDESCRIPTION:Read chapter 4\\nSubmit in Canvas\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:MGT 2250 Test 1\r\nDTSTART;VALUE=DATE:20260924\r\nEND:VEVENT\r\nEND:VCALENDAR`;
const events = parseICal(sample);
assert.equal(events.length, 2);
assert.equal(events[0].summary, 'ECON 2105 Price Controlsand Article');
assert.deepEqual(events[0].start, { date: '2026-09-17', time: '11:59', zone: 'America/New_York' });
assert.equal(events[0].description, 'Read chapter 4\nSubmit in Canvas');
assert.equal(events[1].start.time, null);
const proposals = proposeCalendarMatches(events, [
  { id: 'econ-cw11', title: 'Price Controls', courseCode: 'ECON 2105' },
  { id: 'mgt-test1', title: 'Test 1', courseCode: 'MGT 2250' }
]);
assert.equal(proposals[0].item.id, 'econ-cw11');
assert.equal(proposals[1].item.id, 'mgt-test1');
const shortTitles = proposeCalendarMatches([{ summary: 'Week 4', start: { date: '2026-09-21' } }, { summary: 'Section 5 HW#3', start: { date: '2026-09-21' } }], [
  { id: 'week4', title: 'Week 4 Summary', courseCode: 'MGT 2250' },
  { id: 'week5', title: 'Week 5 Summary', courseCode: 'MGT 2250' },
  { id: 'hw3', title: 'HW#3', courseCode: 'MGT 2250' },
  { id: 'hw4', title: 'HW#4', courseCode: 'MGT 2250' }
]);
assert.equal(shortTitles[0].item.id, 'week4');
assert.equal(shortTitles[1].item.id, 'hw3');

globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { routeDocument } = await import('../src/document-ui.js');
const courses = [{ id: 'mgt2250', code: 'MGT 2250', name: 'Management Statistics' }, { id: 'econ2105', code: 'ECON 2105', name: 'Macroeconomics' }];
assert.deepEqual(routeDocument({ name: 'MGT2250 C Syllabus.docx' }, courses), { courseId: 'mgt2250', kind: 'syllabus' });
assert.deepEqual(routeDocument({ name: 'ECON 2105 lecture 3.pptx' }, courses), { courseId: 'econ2105', kind: 'slides' });
assert.deepEqual(routeDocument({ name: 'exam cheat sheet.pdf' }, courses), { courseId: null, kind: 'cheat-sheet' });
assert.deepEqual(routeDocument({ name: 'Course policies.txt' }, courses, 'Management Statistics · MGT-2250-C'), { courseId: 'mgt2250', kind: 'notes' });
const state = await import('../src/state.js');
state.setLabels('econ-cw11', ['exam', ' Team ', 'exam']);
assert.deepEqual(state.itemState('econ-cw11').labels, ['exam', 'team']);
assert.ok(state.itemState('econ-cw11')._t.labels > 0);
assert.throws(() => state.setLabels('econ-cw11', ['x'.repeat(33)]), /short labels/);
state.confirmCourseFact('mgt2250:latePolicy', { courseId: 'mgt2250', kind: 'latePolicy', value: { status: 'never' }, source: 'Syllabus page 2' });
assert.equal(state.snapshot().courseFacts['mgt2250:latePolicy'].value.status, 'never');
assert.ok(state.snapshot().courseFacts['mgt2250:latePolicy']._t.value > 0);
state.confirmTopic('econ:price-controls', { courseId: 'econ2105', title: 'Price Controls', source: 'Lecture slide 4', page: 4, examIds: ['econ-midterm1'] });
assert.equal(state.snapshot().topics['econ:price-controls'].title, 'Price Controls');
state.removeTopic('econ:price-controls');
assert.ok(state.snapshot().topics['econ:price-controls'].deletedAt);
state.registerDocument('doc-1', { courseId: 'econ2105', name: 'Lecture 4.pdf', type: 'application/pdf', size: 1024, kind: 'slides', itemIds: ['econ-cw11'] });
assert.equal(state.snapshot().documents['doc-1'].name, 'Lecture 4.pdf');
assert.ok(state.snapshot().documents['doc-1']._t.name > 0);
assert.equal(Object.hasOwn(state.snapshot().documents['doc-1'], 'file'), false, 'file bytes stay outside the overlay');
const other = { items: {}, courseFacts: { 'econ2105:latePolicy': { kind: 'latePolicy', value: { status: 'penalty' }, _t: { value: 2 } } }, topics: { 'mgt:stats': { title: 'Regression', _t: { title: 3 } } } };
const { mergeState } = await import('../src/merge.js');
assert.equal(mergeState(state.snapshot(), other).courseFacts['econ2105:latePolicy'].value.status, 'penalty');
assert.equal(mergeState(other, state.snapshot()).topics['mgt:stats'].title, 'Regression');
const newerDoc = { items: {}, documents: { 'doc-1': { name: 'Renamed syllabus', _t: { name: Date.now() + 100000 } } } };
assert.equal(mergeState(state.snapshot(), newerDoc).documents['doc-1'].name, 'Renamed syllabus');
assert.equal(mergeState(newerDoc, state.snapshot()).documents['doc-1'].name, 'Renamed syllabus');
const course = { id: 'mgt2250', groups: [{ id: 'hw', label: 'Homework', countRequired: 12, countTotal: 12 }], latePolicy: { status: 'review' } };
const policy = effectiveCourse(course, { courseFacts: {
  late: { courseId: 'mgt2250', kind: 'latePolicy', value: { status: 'never' }, source: 'Syllabus', confirmedAt: 1 },
  drop: { courseId: 'mgt2250', kind: 'dropRule', groupId: 'hw', value: { countRequired: 11, countTotal: 12 }, source: 'Syllabus', confirmedAt: 2 }
} });
assert.equal(policy.latePolicy.status, 'never');
assert.equal(policy.groups[0].countRequired, 11);
assert.equal(course.groups[0].countRequired, 12, 'base schema remains untouched');

const facts = extractSyllabusCandidates([
  'Late submissions are never accepted. Weekly summaries are due by 11:30pm.',
  'The best 11 of 12 homework assignments count toward the final grade.'
]);
assert.ok(facts.some((fact) => fact.kind === 'latePolicy' && fact.value.status === 'never' && fact.page === 1));
assert.ok(facts.some((fact) => fact.kind === 'deadlineTime' && fact.value.time === '23:30'));
assert.ok(facts.some((fact) => fact.kind === 'dropRule' && fact.value.countRequired === 11 && fact.value.countTotal === 12 && fact.page === 2));
const topics = extractTopicCandidates('Chapter 1\n• Price Controls\n• Unemployment and Inflation\nQuestions?\f• Price Controls\n• Fiscal Policy');
assert.ok(topics.some((topic) => topic.title === 'Fiscal Policy' && topic.page === 2));
assert.equal(topics.filter((topic) => topic.title === 'Price Controls').length, 1);
console.log('Intake checks pass.');
