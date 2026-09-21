import { putLocalDocument, resolveDocument, uploadDocument } from './documents.js';
import { extractFile } from './file-extract.js';
import * as store from './state.js';

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

let lastMessage = '';

// Guess only from explicit course names/codes. An uncertain file waits for a
// course choice rather than silently entering the wrong course.
export function routeDocument(file, courses, content = '') {
  const name = file.name.toLowerCase();
  const matchesIn = (value) => courses.filter((course) => {
    const code = course.code.toLowerCase();
    const compact = value.replace(/[^a-z0-9]/g, '');
    return value.includes(code) || compact.includes(code.replace(/[^a-z0-9]/g, '')) || value.includes(course.name.toLowerCase());
  });
  const byName = matchesIn(name);
  const matches = byName.length ? byName : matchesIn(content.slice(0, 5000).toLowerCase());
  const kind = /syllabus|course outline/.test(name) ? 'syllabus'
    : /cheat.?sheet|formula.?sheet|study.?guide/.test(name) ? 'cheat-sheet'
      : /slide|lecture|\.pptx?$/.test(name) ? 'slides' : 'notes';
  return { courseId: matches.length === 1 ? matches[0].id : null, kind };
}

export function documentRows(records, ctx, onReview) {
  const wrap = el('div', 'document-rows');
  records.forEach(([id, record]) => {
    const row = el('div', 'document-row');
    row.append(el('strong', null, record.name), el('span', 'fine', `${record.kind} · ${Math.ceil(record.size / 1024)} KB`));
    const open = el('button', 'act ghost small', 'Open');
    const status = el('span', 'fine'); status.setAttribute('role', 'status');
    open.addEventListener('click', async () => {
      open.disabled = true; status.textContent = 'Opening…';
      try {
        const file = await resolveDocument(id, record);
        const url = URL.createObjectURL(file);
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener';
        link.download = record.name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = '';
      } catch (error) { status.textContent = error.message; }
      open.disabled = false;
    });
    row.append(open, status); wrap.append(row);
    if (onReview) {
      const review = el('button', 'act ghost small', 'Review details');
      review.addEventListener('click', async () => {
        try {
          const file = await resolveDocument(id, record);
          const extracted = await extractFile(file);
          onReview({ file, courseId: record.courseId, kind: record.kind, text: extracted.text, warning: extracted.warning });
          status.textContent = extracted.warning || '';
          ctx.repaint();
        } catch (error) { status.textContent = error.message; }
      });
      row.append(review);
    }
    if (!record.remote) {
      const sync = el('button', 'act ghost small', 'Sync file');
      sync.addEventListener('click', async () => {
        sync.disabled = true; status.textContent = 'Syncing…';
        try {
          const file = await resolveDocument(id, record);
          const pathname = await uploadDocument(id, file);
          ctx.act(() => store.registerDocument(id, { ...record, pathname, remote: true }));
          status.textContent = 'Available on paired devices.';
        } catch (error) { status.textContent = error.message; }
        sync.disabled = false;
      });
      row.append(sync);
    }
    if (onReview && ctx?.map) {
      const attach = el('details', 'document-attach');
      attach.append(el('summary', null, (record.itemIds || []).length ? 'Attached · edit' : 'Attach to item'));
      const select = el('select', 'truth-input'); select.setAttribute('aria-label', `Item for ${record.name}`);
      const none = el('option', null, 'Choose an item'); none.value = ''; select.append(none);
      ctx.map.allItems.filter((item) => item.courseId === record.courseId).forEach((item) => {
        const option = el('option', null, item.title); option.value = item.id; select.append(option);
      });
      const save = el('button', 'act ghost small', 'Attach');
      save.addEventListener('click', () => {
        if (!select.value) { select.focus(); return; }
        ctx.act(() => store.registerDocument(id, { ...record, itemIds: [...new Set([...(record.itemIds || []), select.value])] }));
      });
      attach.append(select, save); row.append(attach);
    }
  });
  return wrap;
}

export function buildDocumentLibrary(map, ctx, onImported) {
  const section = el('section', 'intake-card intake-drop-card');
  section.append(el('h3', null, 'Add course material'));
  section.append(el('p', 'fine', 'Drop a syllabus, slides, notes, or cheat sheet. Useful details appear for review.'));
  const drop = el('div', 'intake-drop');
  drop.tabIndex = 0;
  drop.setAttribute('role', 'button');
  drop.setAttribute('aria-label', 'Choose or drop course material');
  drop.append(el('span', 'intake-drop-icon', '↓'), el('strong', null, 'Drop a file here'), el('span', 'fine', 'or choose one'));
  const picker = document.createElement('input'); picker.type = 'file'; picker.hidden = true;
  picker.accept = '.pdf,.pptx,.docx,.txt,.md,.ics';
  section.append(drop, picker);
  const review = el('div', 'intake-route-review'); review.hidden = true;
  const fileName = el('strong');
  const course = el('select', 'truth-input'); course.setAttribute('aria-label', 'Course for this file');
  const unknown = el('option', null, 'Choose a course'); unknown.value = ''; course.append(unknown);
  map.courses.forEach((entry) => { const option = el('option', null, `${entry.code} · ${entry.name}`); option.value = entry.id; course.append(option); });
  const kind = el('select', 'truth-input'); kind.setAttribute('aria-label', 'Type of material');
  [['syllabus', 'Syllabus'], ['slides', 'Slides'], ['cheat-sheet', 'Cheat sheet'], ['notes', 'Notes'], ['other', 'Other']].forEach(([value, title]) => {
    const option = el('option', null, title); option.value = value; kind.append(option);
  });
  const save = el('button', 'act small', 'Keep file'); save.type = 'button';
  const attach = el('details', 'intake-attach');
  attach.append(el('summary', null, 'Attach to an assignment (optional)'));
  const item = el('select', 'truth-input'); item.setAttribute('aria-label', 'Assignment for this file');
  function fillItems() {
    item.replaceChildren();
    const none = el('option', null, 'Course only'); none.value = ''; item.append(none);
    map.allItems.filter((entry) => entry.courseId === course.value).forEach((entry) => {
      const option = el('option', null, entry.title); option.value = entry.id; item.append(option);
    });
  }
  course.addEventListener('change', fillItems);
  fillItems();
  attach.append(item);
  review.append(fileName, course, kind, attach, save); section.append(review);
  const message = el('p', 'fine', lastMessage); message.setAttribute('role', 'status'); section.append(message);
  let selected = null;
  let selectedText = null;
  let selectedWarning = null;
  async function persist() {
    if (!selected) return;
    if (!course.value) { review.hidden = false; course.focus(); return; }
    save.disabled = true; message.textContent = 'Saving…';
    try {
      const id = crypto.randomUUID();
      await putLocalDocument(id, selected);
      lastMessage = `${selected.name} saved to ${map.courseById.get(course.value)?.code || 'course materials'} on this device.`;
      ctx.act(() => store.registerDocument(id, {
        courseId: course.value, name: selected.name, type: selected.type || 'application/octet-stream',
        size: selected.size, kind: kind.value, itemIds: item.value ? [item.value] : [], remote: false
      }));
      onImported?.({ file: selected, courseId: course.value, kind: kind.value, text: selectedText, warning: selectedWarning });
      if (selectedText || selectedWarning) ctx.repaint();
      message.textContent = lastMessage;
      review.hidden = true;
      if (navigator.onLine !== false) {
        try {
          const pathname = await uploadDocument(id, selected);
          lastMessage = `${selected.name} saved and available on paired devices.`;
          ctx.act(() => store.registerDocument(id, {
            ...store.snapshot().documents[id], pathname, remote: true
          }));
          message.textContent = lastMessage;
        } catch (error) {
          lastMessage += ` ${error.message}`;
          message.textContent = lastMessage;
        }
      }
    } catch (error) { message.textContent = `Could not save: ${error.message}`; }
    save.disabled = false;
  }
  async function receive(file) {
    if (!file) return;
    if (/\.ics$/i.test(file.name)) {
      try { onImported?.({ file, calendar: await file.text() }); }
      catch (error) { message.textContent = `Could not read calendar: ${error.message}`; }
      return;
    }
    selected = file;
    selectedText = null;
    selectedWarning = null;
    message.textContent = 'Reading file…';
    try {
      const result = await extractFile(file);
      selectedText = result.text;
      selectedWarning = result.warning;
      if (result.warning) message.textContent = result.warning;
    } catch (error) {
      selectedText = null;
      message.textContent = `Could not read details: ${error.message}. You can still keep the file.`;
    }
    const route = routeDocument(file, map.courses, selectedText || '');
    fileName.textContent = file.name;
    course.value = route.courseId || '';
    fillItems();
    kind.value = route.kind;
    if (route.courseId) await persist();
    else { review.hidden = false; message.textContent = 'Which course is this for?'; }
  }
  drop.addEventListener('click', () => picker.click());
  drop.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); picker.click(); } });
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => { event.preventDefault(); drop.classList.remove('is-over'); receive(event.dataTransfer.files?.[0]); });
  picker.addEventListener('change', () => receive(picker.files?.[0]));
  save.addEventListener('click', persist);
  const records = Object.entries(store.snapshot().documents || {}).filter(([, record]) => !record.deletedAt);
  if (records.length) {
    const library = el('details', 'intake-library');
    library.append(el('summary', null, `Your files (${records.length})`), documentRows(records, ctx, onImported));
    section.append(library);
  }
  return section;
}
