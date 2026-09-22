import * as store from './state.js';
import { isExam } from './exams.js';
import { topicOrder, coverage, practiceQuestions } from './study.js';
import { resolveDocument } from './documents.js';
import { extractFile } from './file-extract.js';
import { POMODORO } from './schedule.js';
import { primeAudio } from './chime.js';
import { setTimerContext } from './plan.js';

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

let session = null;
const materialCache = new Map();
function topicsFor(examId) {
  return Object.entries(store.snapshot().topics || {}).filter(([, topic]) => !topic.deletedAt && (topic.examIds || []).includes(examId))
    .map(([id, topic]) => ({ id, ...topic }));
}

function studySession(examId, topics) {
  if (!session || session.examId !== examId) session = { examId, mode: 'cards', index: 0, revealed: false, finished: false,
    orderIds: topicOrder(topics, store.itemState(examId).cardReviews || []).map((topic) => topic.id), practiceIndex: 0, practiceRevealed: false };
  return session;
}

async function loadMaterials(exam, ctx, signature) {
  const records = Object.entries(store.snapshot().documents || {}).filter(([, record]) => !record.deletedAt && record.courseId === exam.courseId);
  if (!records.length) { materialCache.set(exam.id, { state: 'empty', materials: [], signature }); ctx.repaint(); return; }
  const materials = [], errors = [];
  for (const [id, record] of records.slice(0, 15)) {
    try {
      const file = await resolveDocument(id, record);
      const extracted = await extractFile(file);
      if (extracted.text.trim()) materials.push({ name: record.name, text: extracted.text });
    } catch (error) { errors.push(error.message); }
  }
  materialCache.set(exam.id, { state: materials.length ? 'ready' : errors.length ? 'error' : 'empty', materials, error: errors[0], signature });
  ctx.repaint();
}

function beginMaterials(exam, ctx) {
  const signature = JSON.stringify(Object.entries(store.snapshot().documents || {}).filter(([, record]) => record.courseId === exam.courseId && !record.deletedAt).map(([id, record]) => [id, record.pathname]));
  if (materialCache.get(exam.id)?.signature === signature) return;
  materialCache.set(exam.id, { state: 'loading', materials: [], signature });
  queueMicrotask(() => loadMaterials(exam, ctx, signature));
}

function timerText(timer) {
  const ms = timer.running ? timer.endsAt - Date.now() : timer.remainingMs;
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function timerControls(exam, ctx) {
  const wrap = el('div', 'study-timer');
  const current = store.timerState();
  const timer = current?.key === `cram:${exam.id}` ? current : null;
  if (current && !timer) {
    const plan = el('button', 'act ghost small', 'A focus timer is running. Open Plan');
    plan.addEventListener('click', ctx.openPlan); wrap.append(plan); return wrap;
  }
  if (!timer) {
    const start = el('button', 'act ghost small', `Start ${POMODORO} minute focus`);
    start.addEventListener('click', () => {
      if (store.soundOn()) primeAudio();
      ctx.act(() => store.setTimer({ key: `cram:${exam.id}`, kind: 'cram', title: `${exam.courseCode} · Cram`,
        endsAt: Date.now() + POMODORO * 60000, running: true, remainingMs: POMODORO * 60000 }));
    });
    wrap.append(start);
  } else {
    const readout = el('span', 'timer-readout', timerText(timer)); readout.setAttribute('role', 'timer');
    const toggle = el('button', 'act ghost small', timer.running ? 'Pause' : 'Resume');
    toggle.addEventListener('click', () => ctx.act(() => store.setTimer(timer.running
      ? { ...timer, running: false, remainingMs: Math.max(0, timer.endsAt - Date.now()) }
      : { ...timer, running: true, endsAt: Date.now() + timer.remainingMs })));
    wrap.append(readout, toggle);
  }
  return wrap;
}

function coverageView(topics, heading = 'Coverage now') {
  const picture = coverage(topics);
  const wrap = el('div', 'study-coverage'); wrap.append(el('h3', null, heading));
  if (!topics.length) wrap.append(el('p', 'fine', 'No topics linked to this exam yet.'));
  else {
    const bar = el('div', 'study-coverage-bar'); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `${picture.shaky} shaky, ${picture.steady} steady, ${picture.unchecked} unchecked`);
    [['shaky', picture.shaky], ['steady', picture.steady], ['unchecked', picture.unchecked]].forEach(([kind, count]) => {
      if (!count) return;
      const segment = el('span'); segment.dataset.kind = kind; segment.style.flex = String(count); bar.append(segment);
    });
    wrap.append(bar, el('p', 'fine', `${picture.shaky} shaky · ${picture.steady} steady · ${picture.unchecked} unchecked`));
  }
  return wrap;
}

export function renderStudy(map, ctx, examId) {
  const root = el('main', 'study-view');
  const exam = map.allItems.find((item) => item.id === examId && isExam(item));
  if (!exam) { root.append(el('h2', null, 'Choose an exam to study.')); return root; }
  setTimerContext(ctx);
  beginMaterials(exam, ctx);
  const topics = topicsFor(exam.id);
  const state = studySession(exam.id, topics);
  const back = el('button', 'act ghost small', `Back to ${exam.courseCode} ${exam.title}`);
  back.addEventListener('click', () => ctx.closeStudy(exam));
  root.append(back, el('p', 'focus-eyebrow', 'Study'), el('h2', 'study-title', `${exam.courseCode} · ${exam.title}`));
  if (!topics.length) {
    root.append(el('p', 'fine', 'No reviewed topics yet. Add lecture material in Materials, then link its topics to this exam.'));
    const materials = el('button', 'act small', 'Open Materials'); materials.addEventListener('click', ctx.openMaterials); root.append(materials);
    return root;
  }
  const modes = el('div', 'study-modes');
  [['cards', 'Learning cards'], ['cram', 'Cram'], ['practice', 'Practice from materials']].forEach(([id, title]) => {
    const button = el('button', 'act ghost small', title);
    button.setAttribute('aria-pressed', String(state.mode === id));
    button.addEventListener('click', () => { state.mode = id; state.index = 0; state.finished = false; state.revealed = false;
      state.practiceIndex = 0; state.practiceRevealed = false; ctx.repaint(); });
    modes.append(button);
  });
  root.append(modes);
  if (state.mode === 'practice') root.append(practiceView(exam, topics, materialCache.get(exam.id), state, ctx));
  else root.append(cardView(exam, topics, state, ctx));
  return root;
}

function cardView(exam, topics, sessionState, ctx) {
  const wrap = el('section', 'study-card');
  if (sessionState.mode === 'cram') wrap.append(timerControls(exam, ctx));
  const order = sessionState.orderIds.map((id) => topics.find((topic) => topic.id === id)).filter(Boolean);
  if (sessionState.finished || sessionState.index >= order.length) {
    wrap.append(coverageView(topics, 'Coverage after this pass'));
    const again = el('button', 'act ghost small', 'Review another pass');
    again.addEventListener('click', () => {
      sessionState.orderIds = topicOrder(topicsFor(exam.id), store.itemState(exam.id).cardReviews || []).map((topic) => topic.id);
      sessionState.index = 0; sessionState.finished = false; sessionState.revealed = false; ctx.repaint();
    });
    wrap.append(again); return wrap;
  }
  const topic = order[sessionState.index];
  wrap.append(el('p', 'fine', `${sessionState.index + 1} of ${order.length} · ${sessionState.mode === 'cram' ? 'Cram' : 'Card'}`));
  wrap.append(el('h3', null, topic.title));
  wrap.append(el('p', 'study-prompt', 'Recall the idea before opening the source.'));
  if (sessionState.mode === 'cram') {
    const end = el('button', 'linky', 'End and see coverage');
    end.addEventListener('click', () => { sessionState.finished = true; if (store.timerState()?.key === `cram:${exam.id}`) store.clearTimer(); ctx.repaint(); });
    wrap.append(end);
  }
  if (!sessionState.revealed) {
    const reveal = el('button', 'act small', 'Show source');
    reveal.addEventListener('click', () => { sessionState.revealed = true; ctx.repaint(); });
    wrap.append(reveal); return wrap;
  }
  const questions = practiceQuestions(topic, materialCache.get(exam.id)?.materials || [], 1);
  wrap.append(el('p', 'study-source', questions[0]?.answer || `Look up ${topic.source}${topic.page ? `, page ${topic.page}` : ''}.`));
  wrap.append(el('p', 'fine', questions[0] ? `${questions[0].source}, page ${questions[0].page}` : topic.source));
  const actions = el('div', 'study-rating');
  [['0', 'Shaky'], ['1', 'Some'], ['2', 'Good'], ['3', 'Solid']].forEach(([value, title]) => {
    const button = el('button', 'act ghost small', title);
    button.addEventListener('click', () => {
      sessionState.index += 1; sessionState.revealed = false;
      if (sessionState.index >= order.length) sessionState.finished = true;
      ctx.act(() => {
        store.reviewStudyTopic(exam.id, topic.id, Number(value), sessionState.mode);
        if (sessionState.finished && sessionState.mode === 'cram' && store.timerState()?.key === `cram:${exam.id}`) store.clearTimer();
      });
    });
    actions.append(button);
  });
  wrap.append(actions);
  return wrap;
}

function practiceView(exam, topics, materials, sessionState, ctx) {
  const wrap = el('section', 'study-card');
  if (materials?.state === 'loading') { wrap.append(el('p', 'fine', 'Reading saved materials…')); return wrap; }
  if (materials?.state === 'error') {
    wrap.append(el('p', 'fine', materials.error || 'A source could not open. Reconnect and try again.'));
    const retry = el('button', 'act ghost small', 'Try again');
    retry.addEventListener('click', () => { materialCache.delete(exam.id); ctx.repaint(); });
    wrap.append(retry); return wrap;
  }
  const questions = topics.flatMap((topic) => practiceQuestions(topic, materials?.materials || []));
  if (!questions.length) {
    wrap.append(el('p', 'fine', 'No source passage matched these topics. Add slides or notes in Materials, or review the topic names.'));
    return wrap;
  }
  const question = questions[sessionState.practiceIndex % questions.length];
  wrap.append(el('p', 'fine', `${sessionState.practiceIndex % questions.length + 1} of ${questions.length}`));
  wrap.append(el('h3', null, question.question));
  if (sessionState.practiceRevealed) wrap.append(el('p', 'study-source', question.answer), el('p', 'fine', `${question.source}, page ${question.page}`));
  const reveal = el('button', 'act small', sessionState.practiceRevealed ? 'Next question' : 'Show source answer');
  reveal.addEventListener('click', () => {
    if (sessionState.practiceRevealed) { sessionState.practiceIndex += 1; sessionState.practiceRevealed = false; }
    else sessionState.practiceRevealed = true;
    ctx.repaint();
  });
  wrap.append(reveal);
  return wrap;
}
