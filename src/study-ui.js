import * as store from './state.js';
import { isExam } from './exams.js';
import { topicOrder, coverage, practiceQuestions } from './study.js';
import { resolveDocument } from './documents.js';
import { extractFile } from './file-extract.js';
import { POMODORO } from './schedule.js';
import { primeAudio } from './chime.js';
import { setTimerContext } from './plan.js';
import { samplePracticeFor } from './sample-practice.js';

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
  if (!session || session.examId !== examId) session = { examId, mode: samplePracticeFor(examId) ? 'sample' : 'cards', index: 0, revealed: false, finished: false,
    orderIds: topicOrder(topics, store.itemState(examId).cardReviews || []).map((topic) => topic.id), practiceIndex: 0, practiceRevealed: false,
    sampleQueue: samplePracticeFor(examId)?.questions.map((_, index) => index) || [], sampleIndex: 0, sampleRetry: [], sampleRevealed: false };
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
  const sample = samplePracticeFor(exam.id);
  const back = el('button', 'act ghost small', `Back to ${exam.courseCode} ${exam.title}`);
  back.addEventListener('click', () => ctx.closeStudy(exam));
  root.append(back, el('p', 'focus-eyebrow', 'Study'), el('h2', 'study-title', `${exam.courseCode} · ${exam.title}`));
  if (!topics.length && !sample) {
    root.append(el('p', 'fine', 'No reviewed topics yet. Add lecture material in Materials, then link its topics to this exam.'));
    const materials = el('button', 'act small', 'Open Materials'); materials.addEventListener('click', ctx.openMaterials); root.append(materials);
    return root;
  }
  const modes = el('div', 'study-modes');
  [...(sample ? [['sample', 'Sample questions']] : []), ...(topics.length ? [['cards', 'Learning cards'], ['cram', 'Cram'], ['practice', 'From materials']] : [])].forEach(([id, title]) => {
    const button = el('button', 'act ghost small', title);
    button.setAttribute('aria-pressed', String(state.mode === id));
    button.addEventListener('click', () => { state.mode = id; state.index = 0; state.finished = false; state.revealed = false;
      state.practiceIndex = 0; state.practiceRevealed = false; ctx.repaint(); });
    modes.append(button);
  });
  root.append(modes);
  if (state.mode === 'sample' && sample) root.append(sampleView(sample, state, ctx));
  else if (state.mode === 'practice') root.append(practiceView(exam, topics, materialCache.get(exam.id), state, ctx));
  else root.append(cardView(exam, topics, state, ctx));
  return root;
}

function sampleView(pack, state, ctx) {
  const wrap = el('section', 'study-card sample-card');
  const source = el('a', 'study-sample-source', 'Open instructor’s sample set');
  source.href = pack.document; source.target = '_blank'; source.rel = 'noopener';
  if (navigator.onLine === false) {
    source.setAttribute('aria-disabled', 'true');
    source.removeAttribute('href');
  }
  if (state.sampleIndex >= state.sampleQueue.length) {
    if (state.sampleRetry.length) {
      wrap.append(el('h3', null, 'A second look'));
      wrap.append(el('p', 'fine', `${state.sampleRetry.length} idea${state.sampleRetry.length === 1 ? '' : 's'} to revisit.`));
      const retry = el('button', 'act primary', 'Review those ideas');
      retry.addEventListener('click', () => { state.sampleQueue = state.sampleRetry; state.sampleRetry = []; state.sampleIndex = 0; state.sampleRevealed = false; ctx.repaint(); });
      wrap.append(retry, source); return wrap;
    }
    wrap.append(el('h3', null, 'Practice pass complete'));
    wrap.append(el('p', 'fine', 'These came from the instructor’s sample set. The exact exam coverage still needs checking.'));
    const again = el('button', 'act ghost small', 'Start another pass');
    again.addEventListener('click', () => { state.sampleQueue = pack.questions.map((_, index) => index); state.sampleIndex = 0; state.sampleRevealed = false; ctx.repaint(); });
    wrap.append(again, source); return wrap;
  }
  const question = pack.questions[state.sampleQueue[state.sampleIndex]];
  wrap.append(el('p', 'focus-eyebrow', `${state.sampleIndex + 1} / ${state.sampleQueue.length} · ${question.title}`));
  wrap.append(el('h3', null, question.prompt));
  if (!state.sampleRevealed) {
    const reveal = el('button', 'act primary', 'Show explanation');
    reveal.addEventListener('click', () => { state.sampleRevealed = true; ctx.repaint(); });
    wrap.append(reveal);
  } else {
    wrap.append(el('p', 'study-source', question.answer));
    const actions = el('div', 'study-rating');
    [['Review again', true], ['Got it', false]].forEach(([label, repeat]) => {
      const button = el('button', repeat ? 'act ghost small' : 'act primary', label);
      button.addEventListener('click', () => {
        if (repeat && !state.sampleRetry.includes(state.sampleQueue[state.sampleIndex])) state.sampleRetry.push(state.sampleQueue[state.sampleIndex]);
        state.sampleIndex += 1; state.sampleRevealed = false; ctx.repaint();
      });
      actions.append(button);
    });
    wrap.append(actions);
  }
  wrap.append(el('p', 'fine', `Source: ${pack.title}, page ${question.page}. Practice material; exam coverage unconfirmed.`), source);
  if (navigator.onLine === false) wrap.append(el('p', 'fine', 'The practice prompts work offline. Reconnect to open the original file in Canvas.'));
  return wrap;
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
