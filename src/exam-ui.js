import * as store from './state.js';
import { isExam, missingDossier, prepLadder, upcomingPrep, prepLabel, priorExamDebrief } from './exams.js';

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

const openExams = new Set();
function field(label, key, value, type = 'text') {
  const wrap = el('label', 'exam-field');
  wrap.append(el('span', null, label));
  const input = type === 'textarea' ? el('textarea', 'truth-input') : el('input', 'truth-input');
  if (type !== 'textarea') input.type = type;
  if (type === 'number') { input.min = '1'; input.step = key.includes('sheet') ? '0.1' : '1'; }
  input.name = key; input.value = value ?? '';
  wrap.append(input);
  return wrap;
}

function selectField(label, key, value, options) {
  const wrap = el('label', 'exam-field'); wrap.append(el('span', null, label));
  const input = el('select', 'truth-input'); input.name = key;
  options.forEach(([id, name]) => { const option = el('option', null, name); option.value = id; input.append(option); });
  input.value = value || '';
  wrap.append(input); return wrap;
}

export function buildExamSection(item, ctx) {
  if (!isExam(item)) return null;
  const dossier = store.itemState(item.id).examDossier || {};
  const section = el('details', 'exam-prep'); section.open = openExams.has(item.id);
  section.addEventListener('toggle', () => { if (section.open) openExams.add(item.id); else openExams.delete(item.id); });
  const missing = missingDossier(dossier);
  const inherited = priorExamDebrief(item, ctx.map.allItems, store.snapshot());
  section.append(el('summary', null, `Exam preparation · ${missing.length ? 'details to check' : 'details recorded'}`));
  section.append(el('p', 'fine', missing.length ? `${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' and more' : ''} need a source.` : 'Rules recorded. The exam date has its own source state.'));
  if (inherited) {
    const prior = el('details', 'exam-prior');
    prior.append(el('summary', null, `From ${inherited.title} · what happened`));
    prior.append(el('p', 'fine', `Format: ${inherited.format}`), el('p', 'fine', `Covered: ${inherited.topics}`), el('p', 'fine', `Next time: ${inherited.different}`));
    section.append(prior);
  }
  const form = el('form', 'exam-dossier-form');
  form.append(el('h3', null, 'Exam details'));
  form.append(field('Start time', 'startTime', dossier.startTime, 'time'));
  form.append(field('Duration in minutes', 'durationMinutes', dossier.durationMinutes, 'number'));
  form.append(field('Location or testing site', 'location', dossier.location));
  form.append(field('Question count', 'questionCount', dossier.questionCount, 'number'));
  form.append(field('Question format', 'questionFormat', dossier.questionFormat));
  form.append(field('What to bring', 'materials', dossier.materials));
  form.append(selectField('Cheat sheet', 'cheatSheetRule', dossier.cheatSheetRule, [['', 'Unknown'], ['allowed', 'Allowed'], ['none', 'Not allowed']]));
  form.append(field('Sheet width in inches', 'sheetWidth', dossier.sheetWidth, 'number'));
  form.append(field('Sheet height in inches', 'sheetHeight', dossier.sheetHeight, 'number'));
  form.append(field('Pages or sides allowed', 'sheetPages', dossier.sheetPages, 'number'));
  form.append(field('Calculator policy', 'calculatorPolicy', dossier.calculatorPolicy));
  form.append(field('Topics covered', 'topicsCovered', dossier.topicsCovered, 'textarea'));
  form.append(field('How to finish or submit', 'submissionMethod', dossier.submissionMethod));
  form.append(field('Source you checked', 'source', dossier.source));
  const save = el('button', 'act small', 'Save exam details'); save.type = 'submit';
  form.append(save);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const key of ['durationMinutes', 'questionCount', 'sheetWidth', 'sheetHeight', 'sheetPages']) values[key] = values[key] ? Number(values[key]) : null;
    ctx.act(() => store.setExamDossier(item.id, values));
  });
  section.append(form);

  const steps = prepLadder(item, store.snapshot());
  const ladder = el('div', 'exam-ladder'); ladder.append(el('h3', null, 'Preparation steps'));
  if (!item.dateObj) ladder.append(el('p', 'fine', 'Add a date and source to place preparation steps on the calendar.'));
  else if (!steps.length) ladder.append(el('p', 'fine', 'The applicable steps are complete or the exam is taken.'));
  else steps.forEach((step) => {
    const done = Boolean(store.itemState(step.id).doneAt);
    const row = el('div', 'exam-step'); row.dataset.done = String(done);
    const copy = el('div'); copy.append(el('strong', null, step.title), el('span', 'fine', prepLabel(step)));
    if (step.weakTopics.length) copy.append(el('span', 'fine', step.weakTopics.join(' · ')));
    const button = el('button', 'act ghost small', done ? 'Reopen' : 'Done');
    button.addEventListener('click', () => ctx.act(() => done ? store.clearProgress(step.id) : store.markDone(step.id)));
    row.append(copy, button); ladder.append(row);
  });
  section.append(ladder);

  const topics = Object.entries(store.snapshot().topics || {}).filter(([, topic]) => !topic.deletedAt && (topic.examIds || []).includes(item.id));
  const coverage = el('div', 'exam-topics'); coverage.append(el('h3', null, 'Topic coverage'));
  if (!topics.length) coverage.append(el('p', 'fine', 'Add topics from a lecture in Materials, then link them to this exam.'));
  topics.forEach(([id, topic]) => {
    const row = el('label', 'exam-topic'); row.append(el('span', null, topic.title));
    const select = el('select', 'truth-input'); select.setAttribute('aria-label', `Confidence in ${topic.title}`);
    [['', 'Not checked'], ['0', 'Shaky'], ['1', 'Some'], ['2', 'Good'], ['3', 'Solid']].forEach(([value, label]) => { const opt = el('option', null, label); opt.value = value; select.append(opt); });
    select.value = topic.confidence == null ? '' : String(topic.confidence);
    select.addEventListener('change', () => { if (select.value !== '') ctx.act(() => store.setTopicConfidence(id, Number(select.value))); });
    row.append(select); coverage.append(row);
  });
  section.append(coverage);
  if (dossier.cheatSheetRule === 'allowed' && dossier.sheetWidth && dossier.sheetHeight && dossier.sheetPages) section.append(buildSheet(item, dossier, ctx));
  if (store.itemState(item.id).doneAt) {
    const after = field('What you learned afterward', 'learnedAfter', dossier.learnedAfter, 'textarea');
    const saveAfter = el('button', 'act ghost small', 'Keep note');
    saveAfter.addEventListener('click', () => ctx.act(() => store.setExamDossier(item.id, { learnedAfter: after.querySelector('textarea').value })));
    section.append(after, saveAfter);
    const debrief = store.itemState(item.id).examDebrief || {};
    const formAfter = el('form', 'exam-debrief'); formAfter.append(el('h3', null, 'After the exam'));
    formAfter.append(field('What was the format?', 'format', debrief.format, 'textarea'));
    formAfter.append(field('What was on it?', 'topics', debrief.topics, 'textarea'));
    formAfter.append(field('What would you do differently?', 'different', debrief.different, 'textarea'));
    const keep = el('button', 'act small', 'Keep exam note'); keep.type = 'submit'; formAfter.append(keep);
    formAfter.addEventListener('submit', (event) => { event.preventDefault(); ctx.act(() => store.setExamDebrief(item.id, Object.fromEntries(new FormData(formAfter)))); });
    section.append(formAfter);
  }
  return section;
}

function buildSheet(item, dossier, ctx) {
  const section = el('details', 'exam-sheet');
  section.append(el('summary', null, 'Cheat sheet'));
  section.append(el('p', 'fine', `${dossier.sheetPages} page${dossier.sheetPages === 1 ? '' : 's'} · ${dossier.sheetWidth} × ${dossier.sheetHeight} in. Text that runs past a page needs trimming before print.`));
  const pages = (store.itemState(item.id).cheatSheet || []).slice(0, Math.min(12, dossier.sheetPages));
  const editors = [];
  const measures = [];
  const message = el('p', 'fine'); message.setAttribute('role', 'status');
  for (let i = 0; i < Math.min(12, dossier.sheetPages); i++) {
    const label = el('label', 'sheet-label', `Page ${i + 1}`);
    const input = el('textarea', 'sheet-editor');
    input.value = pages[i] || '';
    input.setAttribute('aria-label', `${item.courseCode} ${item.title} cheat sheet page ${i + 1}`);
    const measure = el('div', 'sheet-measure');
    measure.style.setProperty('--sheet-width', `${dossier.sheetWidth}in`);
    measure.style.setProperty('--sheet-height', `${dossier.sheetHeight}in`);
    measure.textContent = input.value + '\n';
    input.addEventListener('input', () => {
      measure.textContent = input.value + '\n';
      message.textContent = measure.scrollHeight > measure.clientHeight + 3 ? `Page ${i + 1} overflows.` : 'Unsaved changes. Page fits.';
    });
    label.append(input, measure); section.append(label); editors.push(input); measures.push(measure);
  }
  const actions = el('div', 'sheet-actions');
  const save = el('button', 'act small', 'Save sheet');
  save.addEventListener('click', () => { ctx.act(() => store.setCheatSheet(item.id, editors.map((input) => input.value))); message.textContent = 'Saved.'; });
  const print = el('button', 'act ghost small', 'Print sheet');
  print.addEventListener('click', () => {
    if (measures.some((measure) => measure.scrollHeight > measure.clientHeight + 3)) { message.textContent = 'Trim the overflowing page before printing.'; return; }
    store.setCheatSheet(item.id, editors.map((input) => input.value));
    const container = document.querySelector('#sheet-print') || document.body.appendChild(el('div', 'sheet-print'));
    container.id = 'sheet-print'; container.replaceChildren();
    container.style.setProperty('--sheet-width', `${dossier.sheetWidth}in`);
    container.style.setProperty('--sheet-height', `${dossier.sheetHeight}in`);
    editors.forEach((input) => container.append(el('div', 'sheet-print-page', input.value)));
    const style = document.querySelector('#sheet-page-style') || document.head.appendChild(el('style'));
    style.id = 'sheet-page-style';
    style.textContent = `@page { size: ${Number(dossier.sheetWidth)}in ${Number(dossier.sheetHeight)}in; margin: 0.25in; }`;
    window.print();
  });
  actions.append(save, print); section.append(actions, message);
  const history = store.itemState(item.id).sheetDrafts || [];
  if (history.length) {
    const previous = el('details', 'sheet-history'); previous.append(el('summary', null, `Earlier drafts (${history.length})`));
    history.slice().reverse().forEach((version) => {
      const button = el('button', 'act ghost small', new Date(version.at).toLocaleString());
      button.addEventListener('click', () => { editors.forEach((input, i) => { input.value = version.pages[i] || ''; }); message.textContent = 'Earlier draft loaded. Save to keep it current.'; });
      previous.append(button);
    });
    section.append(previous);
  }
  return section;
}

export function buildPrepNotice(map, ctx, limit = 1) {
  const exams = map.allItems.filter(isExam);
  const steps = upcomingPrep(exams, store.snapshot()).slice(0, limit);
  if (!steps.length) return null;
  const section = el('details', 'prep-notice');
  const firstExam = exams.find((exam) => exam.id === steps[0].examId);
  section.open = limit === 1 && firstExam?.dateObj && firstExam.dateObj.getTime() - Date.now() < 4 * 86400000;
  section.append(el('summary', null, limit === 1 ? `Exam prep · ${steps[0].courseCode} ${steps[0].examTitle}` : 'Exam preparation'));
  steps.forEach((step) => {
    const row = el('div', 'prep-notice-row');
    row.append(el('strong', null, step.title), el('span', 'fine', prepLabel(step)));
    if (step.weakTopics.length) row.append(el('span', 'fine', step.weakTopics.join(' · ')));
    const action = el('button', 'act ghost small', 'Open exam');
    action.addEventListener('click', () => { openExams.add(step.examId); ctx.openDetail(exams.find((exam) => exam.id === step.examId), action, { silent: true }); });
    const done = el('button', 'act ghost small', 'Done');
    done.addEventListener('click', () => ctx.act(() => store.markDone(step.id)));
    row.append(action, done); section.append(row);
  });
  return section;
}
