import assert from 'node:assert/strict';
import { createServer } from 'vite';

const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value))
};

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const schedule = await server.ssrLoadModule('/src/schedule.js');
  const state = await server.ssrLoadModule('/src/state.js');
  const dateObj = new Date(2026, 8, 21, 12);
  const item = (id, time, extra = {}) => ({ id, title: id, courseId: 'mgt2250', courseCode: 'MGT 2250',
    group: 'mgt2250-hw', type: 'regular', points: 10, status: 'upcoming', dateObj, time,
    schemaIndex: 0, ...extra });
  const test = item('test', '11:10', { title: 'Test 1', type: 'exam', points: 100 });
  const expired = item('expired', '11:15');
  const summary = item('summary', '23:30', { points: 2.5 });
  const econ = item('econ', '23:59', { title: 'ECON coursework', courseId: 'econ2105',
    courseCode: 'ECON 2105', group: 'econ-coursework', points: 9, schemaIndex: 1 });

  const late = schedule.buildDayPlan([test, expired, summary, econ], new Date(2026, 8, 21, 23, 5));
  assert.deepEqual(late.examEvents.map((entry) => entry.id), ['test']);
  assert.deepEqual(late.expired.map((entry) => entry.id), ['expired']);
  assert.deepEqual(late.queue.map((entry) => entry.id), ['summary', 'econ']);
  assert.equal(schedule.pomodorosFor(econ), 1);
  assert.equal(late.overflow.length, 1);
  assert.equal(late.overflow[0].item.id, 'econ');
  assert.equal(late.overflow[0].alreadyPast, false);

  state.setEffort('econ', 'medium');
  assert.equal(schedule.pomodorosFor(econ), 4);
  state.setEffort('econ', 'quick');

  state.setExamDossier('test', { source: 'User checked course page', startTime: '09:30',
    durationMinutes: 60, location: 'Testing center', questionCount: 40,
    questionFormat: 'Multiple choice', materials: 'ID', cheatSheetRule: 'not allowed',
    calculatorPolicy: 'Allowed', topicsCovered: 'Chapter 1', submissionMethod: 'In person' });
  assert.equal(state.itemState('test').examDossier.confirmed, true);
  const morning = schedule.buildDayPlan([test, summary], new Date(2026, 8, 21, 9, 20));
  const examWindow = morning.timeline.find((block) => block.fixed && block.id === 'exam:test');
  assert.ok(examWindow);
  assert.equal(examWindow.start.getHours(), 9);
  assert.equal(examWindow.end.getHours(), 10);
  assert.ok(morning.blocks.filter((block) => block.kind === 'work').every((block) =>
    block.end <= examWindow.start || block.start >= examWindow.end));

  console.log('Deadline, exam-window, and ECON estimate checks pass.');
} finally {
  await server.close();
}
