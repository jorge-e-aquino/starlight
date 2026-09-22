import { parseICal, proposeCalendarMatches, compareCalendarDate } from './intake.js';
import { extractSyllabusCandidates, extractTopicCandidates } from './extract.js';
import { buildDocumentLibrary } from './document-ui.js';
import * as store from './state.js';

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

// The feed address contains a token. It stays outside the progress overlay,
// exports, and remote sync. The server only sees it during an explicit refresh.
const FEED_KEY = 'starlight.canvasFeed.v1';
const LAST_CHECK_KEY = 'starlight.canvasFeed.checked.v1';
let proposals = [];
let status = '';
let extracted = null;
const FACT_NAMES = { latePolicy: 'Late submission rule', dropRule: 'Drop rule', deadlineTime: 'Deadline time' };

export function renderIntake(map, ctx) {
  const root = el('main', 'intake-surface');
  root.append(el('p', 'focus-eyebrow', 'Materials'));
  root.append(el('h2', 'intake-title', 'Give Starlight the material'));
  root.append(el('p', 'intake-intro', 'Keep your course files in one place. Starlight suggests useful facts; you decide what becomes true.'));
  root.append(buildDocumentLibrary(map, ctx, ({ file, courseId, kind, text, calendar, warning }) => {
    if (calendar) { receive(calendar, map, ctx); return; }
    if (!text && !warning) return;
    const type = kind === 'syllabus' ? 'syllabus' : 'slides';
    const candidates = type === 'syllabus' ? extractSyllabusCandidates(text) : extractTopicCandidates(text);
    extracted = { courseId, source: file.name, type, candidates, warning, confirmed: new Set() };
  }));
  const advanced = el('details', 'intake-advanced');
  advanced.open = Boolean(proposals.length);
  advanced.append(el('summary', null, 'Canvas & course details'));

  const calendar = el('details', 'intake-card');
  calendar.open = Boolean(proposals.length);
  calendar.append(el('summary', 'intake-section-summary', 'Canvas calendar'));
  const form = el('form', 'intake-feed-form');
  const label = el('label', 'truth-field');
  label.append(el('span', 'truth-label', 'Personal Canvas calendar feed URL'));
  const url = el('input', 'truth-input'); url.type = 'url'; url.placeholder = 'https://gatech.instructure.com/feeds/calendars/…';
  try { url.value = localStorage.getItem(FEED_KEY) || ''; } catch { /* unavailable device storage */ }
  label.append(url); form.append(label);
  const refresh = el('button', 'act small', 'Check feed'); refresh.type = 'submit'; form.append(refresh);
  const fileLabel = el('label', 'act ghost small', 'Open .ics file');
  const file = document.createElement('input'); file.type = 'file'; file.accept = '.ics,text/calendar'; file.hidden = true;
  fileLabel.append(file); form.append(fileLabel);
  const message = el('p', 'intake-status', status || 'Your feed URL is kept on this device. An .ics file also works offline.');
  message.setAttribute('role', 'status');
  async function checkFeed() {
    refresh.disabled = true; message.textContent = 'Checking Canvas…';
    try {
      const address = url.value.trim();
      const result = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedUrl: address }) });
      if (!result.ok) throw new Error((await result.json().catch(() => ({}))).error || 'Canvas did not return a calendar.');
      const body = await result.text();
      try { localStorage.setItem(FEED_KEY, address); localStorage.setItem(LAST_CHECK_KEY, String(Date.now())); } catch { /* session still works */ }
      receive(body, map, ctx);
    } catch (error) { status = error.message; message.textContent = status; refresh.disabled = false; }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); checkFeed(); });
  try {
    if (url.value && navigator.onLine !== false && Date.now() - Number(localStorage.getItem(LAST_CHECK_KEY) || 0) > 24 * 60 * 60 * 1000) {
      // A saved feed checks once per day on arrival. Every match still waits for review.
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      queueMicrotask(checkFeed);
    }
  } catch { /* local storage unavailable; manual check remains available */ }
  file.addEventListener('change', async () => {
    try { if (file.files?.[0]) receive(await file.files[0].text(), map, ctx); }
    catch (error) { status = error.message; message.textContent = status; }
  });
  calendar.append(form, message);
  const list = el('div', 'intake-proposals');
  if (proposals.length) {
    list.append(el('h4', null, `${proposals.length} calendar entries to review`));
    proposals.filter(({ item }) => item).slice(0, 100).forEach(({ event, item }) => {
      const comparison = compareCalendarDate(event, item);
      const row = el('div', 'intake-proposal'); row.dataset.comparison = comparison;
      row.append(el('strong', null, `${item.courseCode} · ${item.title}`));
      row.append(el('p', null, `Canvas: ${event.start.date}${event.start.time ? ` at ${event.start.time}` : ' (time not given)'} · Current: ${item.date || 'unknown'}${item.time ? ` at ${item.time}` : ' (time unknown)'}`));
      row.append(el('p', 'fine', comparison === 'conflict' ? 'Sources disagree. Keep both until you resolve them.' : comparison === 'partial' ? 'Date agrees; at least one time is unknown.' : 'Calendar agrees with the current date and time.'));
      const button = el('button', 'act ghost small', 'Review date and sources');
      button.addEventListener('click', () => ctx.openDetail(item, button, { silent: true }));
      row.append(button); list.append(row);
    });
    const unmatched = proposals.filter(({ item }) => !item);
    if (unmatched.length) list.append(el('p', 'fine', `${unmatched.length} calendar entries did not match an item. They were not added automatically.`));
  } else list.append(el('p', 'fine', 'No calendar evidence loaded yet. Paste a feed address or open an .ics file.'));
  calendar.append(list); advanced.append(calendar);

  const docs = el('details', 'intake-card');
  docs.append(el('summary', 'intake-section-summary', 'Paste text to analyze'));
  docs.append(el('p', 'fine', 'Review facts and topics from course material. Nothing is added to the semester until you confirm it.'));
  const formDocs = el('form', 'intake-document-form');
  const courseField = el('label', 'truth-field'); courseField.append(el('span', 'truth-label', 'Course'));
  const courseSelect = el('select', 'truth-input');
  map.courses.forEach((course) => { const option = el('option', null, `${course.code} · ${course.name}`); option.value = course.id; courseSelect.append(option); });
  courseField.append(courseSelect);
  const typeField = el('label', 'truth-field'); typeField.append(el('span', 'truth-label', 'Material'));
  const typeSelect = el('select', 'truth-input');
  [['syllabus', 'Syllabus'], ['slides', 'Slides or lecture notes']].forEach(([value, label]) => { const option = el('option', null, label); option.value = value; typeSelect.append(option); });
  typeField.append(typeSelect);
  const nameField = el('label', 'truth-field'); nameField.append(el('span', 'truth-label', 'Source name'));
  const name = el('input', 'truth-input'); name.required = true; name.placeholder = 'Course syllabus, page 1'; nameField.append(name);
  const textField = el('label', 'truth-field'); textField.append(el('span', 'truth-label', 'Extracted text'));
  const text = el('textarea', 'truth-input'); text.rows = 5; text.required = true;
  text.placeholder = 'Paste text from a syllabus or slides.';
  textField.append(text);
  const extract = el('button', 'act small', 'Review candidates'); extract.type = 'submit';
  formDocs.append(courseField, typeField, nameField, textField, extract);
  formDocs.addEventListener('submit', (event) => {
    event.preventDefault();
    const candidates = typeSelect.value === 'syllabus' ? extractSyllabusCandidates(text.value) : extractTopicCandidates(text.value);
    extracted = { courseId: courseSelect.value, source: name.value.trim(), type: typeSelect.value, candidates, confirmed: new Set() };
    ctx.repaint();
  });
  docs.append(formDocs);
  if (extracted) {
    const review = el('section', 'intake-card intake-candidates');
    review.append(el('h3', null, `Review suggestions · ${extracted.source}`));
    if (!extracted.candidates.length) review.append(el('p', 'fine', extracted.warning || 'No structured facts were found. Open the source to review it directly.'));
    extracted.candidates.forEach((candidate, index) => {
      if (extracted.confirmed.has(index)) return;
      const card = el('div', 'intake-proposal');
      card.append(el('strong', null, extracted.type === 'syllabus' ? FACT_NAMES[candidate.kind] : candidate.title));
      card.append(el('p', 'fine', extracted.type === 'syllabus' ? `Page ${candidate.page}: ${candidate.text}` : `Page ${candidate.page}`));
      if (extracted.type === 'slides') {
        const exam = el('select', 'truth-input'); exam.setAttribute('aria-label', `Exam for ${candidate.title}`);
        const none = el('option', null, 'No exam selected'); none.value = ''; exam.append(none);
        map.allItems.filter((item) => item.courseId === extracted.courseId && ['exam', 'final'].includes(item.type)).forEach((item) => { const option = el('option', null, item.title); option.value = item.id; exam.append(option); });
        const item = el('select', 'truth-input'); item.setAttribute('aria-label', `Item for ${candidate.title}`);
        const noItem = el('option', null, 'No item selected'); noItem.value = ''; item.append(noItem);
        map.allItems.filter((entry) => entry.courseId === extracted.courseId).forEach((entry) => { const option = el('option', null, entry.title); option.value = entry.id; item.append(option); });
        card.append(exam, item);
        const add = el('button', 'act small', 'Add topic');
        add.addEventListener('click', () => ctx.act(() => {
          store.confirmTopic(`${extracted.courseId}:${candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, {
            courseId: extracted.courseId, title: candidate.title, source: `${extracted.source}, page ${candidate.page}`, page: candidate.page,
            examIds: exam.value ? [exam.value] : [], itemIds: item.value ? [item.value] : []
          });
          extracted.confirmed.add(index);
          if (extracted.confirmed.size === extracted.candidates.length) extracted = null;
        }));
        card.append(add);
      } else {
        let groupSelect = null;
        if (candidate.kind === 'dropRule' || candidate.kind === 'deadlineTime') {
          groupSelect = el('select', 'truth-input'); groupSelect.setAttribute('aria-label', `Assignment group for ${FACT_NAMES[candidate.kind].toLowerCase()}`);
          const none = el('option', null, 'Choose the affected group'); none.value = ''; groupSelect.append(none);
          const course = map.courseById.get(extracted.courseId);
          (course?.groups || []).forEach((group) => { const option = el('option', null, group.label); option.value = group.id; groupSelect.append(option); });
          groupSelect.addEventListener('change', () => groupSelect.setCustomValidity(''));
          card.append(groupSelect);
        }
        const add = el('button', 'act small', 'Confirm fact');
        add.addEventListener('click', () => {
          if (groupSelect && !groupSelect.value) { groupSelect.setCustomValidity('Choose the affected group.'); groupSelect.reportValidity(); return; }
          const group = map.courseById.get(extracted.courseId)?.groups.find((entry) => entry.id === groupSelect?.value);
          const value = candidate.kind === 'dropRule' && candidate.value.dropCount != null && group?.countTotal
            ? { countTotal: group.countTotal, countRequired: group.countTotal - candidate.value.dropCount }
            : candidate.value;
          ctx.act(() => {
            store.confirmCourseFact(`${extracted.courseId}:${candidate.kind}:${groupSelect?.value || index}`, {
              courseId: extracted.courseId, kind: candidate.kind, groupId: groupSelect?.value || null,
              value, source: `${extracted.source}, page ${candidate.page}`
            });
            extracted.confirmed.add(index);
            if (extracted.confirmed.size === extracted.candidates.length) extracted = null;
          });
        });
        card.append(add);
      }
      review.append(card);
    });
    const dismiss = el('button', 'linky', 'Done reviewing');
    dismiss.addEventListener('click', () => { extracted = null; ctx.repaint(); });
    review.append(dismiss);
    root.append(review);
  }
  advanced.append(docs);
  const knowledge = el('details', 'intake-card'); knowledge.append(el('summary', 'intake-section-summary', 'Confirmed course knowledge'));
  const facts = Object.values(store.snapshot().courseFacts || {}).filter((fact) => fact.confirmedAt && !fact.deletedAt);
  const topics = Object.entries(store.snapshot().topics || {}).filter(([, topic]) => topic.confirmedAt && !topic.deletedAt);
  if (!facts.length && !topics.length) knowledge.append(el('p', 'fine', 'No syllabus facts or topics confirmed yet. Extracted suggestions appear here only after you accept each one.'));
  facts.forEach((fact) => knowledge.append(el('p', 'knowledge-row', `${map.courseById.get(fact.courseId)?.code || fact.courseId} · ${FACT_NAMES[fact.kind] || fact.kind} · ${fact.source}`)));
  topics.forEach(([id, topic]) => {
    const row = el('p', 'knowledge-row', `${map.courseById.get(topic.courseId)?.code || topic.courseId} · ${topic.title} · ${topic.source} `);
    const remove = el('button', 'linky', 'Remove topic');
    remove.setAttribute('aria-label', `Remove ${topic.title}`);
    remove.addEventListener('click', () => ctx.act(() => store.removeTopic(id)));
    row.append(remove); knowledge.append(row);
  });
  advanced.append(knowledge);
  root.append(advanced);
  return root;
}

function receive(raw, map, ctx) {
  const events = parseICal(raw);
  if (!events.length) throw new Error('No calendar entries found in that file.');
  proposals = proposeCalendarMatches(events, map.allItems);
  status = `${events.length} calendar entries loaded. Review matched dates below.`;
  ctx.repaint();
}
