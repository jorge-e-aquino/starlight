import { formatDate, parseDate } from './data.js';
import { today } from './clock.js';
import {
  effortBand,
  EFFORT,
  daysUntil,
  avoidance,
  completionVerb,
  phase,
  gatedBy
} from './signals.js';
import { dueTimeFor, hasDueTime, schemaTime, pomodorosFor } from './schedule.js';
import { buildScoreForm } from './grade-ui.js';
import {
  dateBadge,
  dateText,
  resolutionLabel,
  buildDateTrustForm,
  buildResolutionForm,
  buildExternalBlockForm
} from './truth-ui.js';
import * as store from './state.js';
import { documentRows } from './document-ui.js';
import { effectiveCourse } from './course-facts.js';
import { buildExamSection } from './exam-ui.js';

const TYPE_LABEL = {
  regular: 'Coursework',
  recurring: 'Recurring',
  exam: 'Exam',
  final: 'Final exam',
  standing: 'Ongoing status'
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function row(label, value) {
  const wrap = el('div', 'row');
  wrap.append(el('dt', null, label), el('dd', null, value));
  return wrap;
}

function block(heading, bodyNode) {
  const wrap = el('div', 'block');
  wrap.append(el('h3', null, heading), bodyNode);
  return wrap;
}

export function createDetailPanel(ctx) {
  const panel = el('aside', 'detail');
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', 'Item detail');

  const close = el('button', 'close', '×');
  close.setAttribute('aria-label', 'Close detail panel');
  const body = el('div', 'detail-body');
  panel.append(close, body);

  // Clicking off the panel closes it, but nothing is covered by an overlay: the
  // rest of the app stays fully clickable, so clicking a different assignment
  // swaps the panel's contents instead of dismissing it. The timestamp guard is
  // what tells those two cases apart, and it works for any trigger without
  // having to enumerate selectors.
  let lastOpenAt = 0;
  document.addEventListener('click', (event) => {
    if (!panel.classList.contains('open')) return;
    if (panel.contains(event.target)) return;
    // Opening a map item can repaint the whole map before this document
    // listener runs. The original trigger still identifies that same click.
    if (lastFocused && (event.target === lastFocused || lastFocused.contains(event.target))) return;
    // A control inside the panel that changes state repaints the panel, which
    // detaches the very button that was clicked before this listener sees it.
    // Without this the panel would contain() a node that is no longer anywhere
    // and read its own controls as clicks on the outside world.
    if (!event.target.isConnected) return;
    if (Date.now() - lastOpenAt < 120) return;
    hide();
  });

  let lastFocused = null;
  let openItem = null;

  function hide() {
    panel.classList.remove('open');
    openItem = null;
    document.querySelectorAll('.node.is-selected').forEach((n) => n.classList.remove('is-selected'));
    if (location.hash.startsWith('#item=')) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch { /* isolated preview */ }
    }
    if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
  }

  close.addEventListener('click', hide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) hide();
  });

  function show(item, course, isFocus, trigger, { silent = false } = {}) {
    if (trigger) lastFocused = trigger;
    openItem = item;
    // Opening the detail is the signal that feeds circling detection.
    if (!silent) store.recordOpen(item.id);
    paint(item, course, isFocus);
    lastOpenAt = Date.now();
    panel.classList.add('open');
    try { history.replaceState(null, '', `#item=${item.id}`); } catch { /* isolated preview */ }
    close.focus();
  }

  function repaint(item, course, isFocus) {
    if (openItem && openItem.id === item.id) paint(item, course, isFocus);
  }

  function paint(item, course, isFocus) {
    body.replaceChildren();
    course = effectiveCourse(course, store.snapshot());
    const state = store.itemState(item.id);
    const band = effortBand(item);
    const where = phase(item, today());

    const courseLine = el('div', 'd-course');
    const swatch = el('span', 'swatch');
    swatch.style.background = course.color;
    courseLine.append(swatch, el('span', null, `${course.code} · ${course.name}`));

    body.append(courseLine, el('h2', null, item.title));
    body.append(dateBadge(item));
    if (!item.dateObj) body.append(el('div', 'd-date', 'No date on the schedule yet'));

    const tags = el('div', 'd-tags');
    if (isFocus) tags.append(el('span', 'tag star-tag', 'Start here'));
    tags.append(el('span', 'tag', TYPE_LABEL[item.type] || item.type));
    if (state.doneAt) tags.append(el('span', 'tag', completionVerb(item)));
    else if (state.startedAt) tags.append(el('span', 'tag', 'In progress'));
    else if (where === 'overdue') tags.append(el('span', 'tag', 'Past its date'));
    else if (where === 'ahead') tags.append(el('span', 'tag', 'Not yet in range'));
    if (!item.confirmed) tags.append(el('span', 'tag dashed', 'Not confirmed'));
    body.append(tags);

    // Actions come before reference material: this panel exists to help start
    // the thing, not to describe it.
    body.append(buildActions(item));

    if (item.type !== 'standing' && !['absorbed', 'cant-submit'].includes(state.resolution?.state)) {
      body.append(buildStepBox(item));
    }

    if (item.type !== 'standing') {
      body.append(collapsible('Date and sources', buildDateTrustForm(item, ctx)));
      const exam = buildExamSection(item, ctx);
      if (exam) body.append(exam);
      body.append(collapsible('Outcome', buildResolutionForm(item, course, ctx)));
      body.append(collapsible('External block', buildExternalBlockForm(item, ctx)));
      const links = buildLinks(item, course);
      if (links) body.append(links);
    }

    body.append(collapsible('Labels', buildLabels(item)));
    const attached = Object.entries(store.snapshot().documents || {}).filter(([, record]) => !record.deletedAt && (record.itemIds || []).includes(item.id));
    if (attached.length) body.append(collapsible('Documents', documentRows(attached, ctx)));

    const scoreForm = buildScoreForm(item, course, ctx);
    if (scoreForm) body.append(scoreForm);

    const ring = avoidance(item);
    if (ring) {
      const note = document.createDocumentFragment();
      note.append(
        el('p', null, ring.sentence),
        el('p', 'fine', 'Often that means the first move is unclear rather than the task being hard.')
      );
      body.append(block('Worth noticing', note));
    }

    if (item.type !== 'standing') {
      const done = store.pomodorosDone(item.id);
      if (done) {
        const total = pomodorosFor(item);
        const left = Math.max(0, total - done);
        body.append(
          block(
            'Pomodoros',
            el(
              'p',
              null,
              left
                ? `${done} of ${total} done. The plan schedules the ${left} that are left, not all ${total} again.`
                : `All ${total} done. The plan will offer to close this out rather than schedule more.`
            )
          )
        );
      }
    }

    body.append(buildEffortPicker(item, band));
    if (item.dateObj) body.append(buildDueTime(item));

    const dl = document.createElement('dl');
    if (item.dateObj) {
      dl.append(
        row('Due', formatDate(item.dateObj, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))
      );
      dl.append(row('Timing', relativeLabel(daysUntil(item.dateObj, today()))));
    }
    if (item.points != null) dl.append(row('Points', `${item.points}`));
    if (item.weightPercent != null) dl.append(row('Weight', `${item.weightPercent}% of grade`));
    if (item.points != null && course.totalPoints) {
      dl.append(row('Share of course', `${((item.points / course.totalPoints) * 100).toFixed(1)}%`));
    }
    const group = item.group ? course.groupsById.get(item.group) : null;
    if (group) dl.append(row('Group', group.label));
    const latePolicy = group?.latePolicy || course.latePolicy;
    if (latePolicy) dl.append(row('Late submission', latePolicy.status === 'never' ? 'Not accepted under this course rule' : 'Policy not confirmed'));

    body.append(collapsible('Grade detail', dl));
    if (group && group.note) body.append(block('Group rule', el('p', null, group.note)));
    if (item.notes) body.append(block('Notes', el('p', null, item.notes)));

    if (item.steps && item.steps.length) {
      const list = el('ul', 'steps');
      item.steps.forEach((step) => {
        const li = document.createElement('li');
        li.append(el('span', 'box', step.done ? '✓' : ''), el('span', null, step.label));
        list.append(li);
      });
      body.append(block('Steps from the syllabus', list));
    }
  }

  function buildLabels(item) {
    const wrap = el('div', 'truth-content');
    const labels = store.itemState(item.id).labels || [];
    const form = el('form', 'truth-form');
    const field = el('label', 'truth-field');
    field.append(el('span', 'truth-label', 'Labels, separated by commas'));
    const input = el('input', 'truth-input');
    input.value = labels.join(', ');
    input.placeholder = 'exam, team, writing';
    field.append(input);
    const error = el('p', 'truth-error'); error.hidden = true; error.setAttribute('role', 'alert');
    const save = el('button', 'act small', 'Save labels'); save.type = 'submit';
    form.append(field, save, error);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      try { ctx.act(() => store.setLabels(item.id, input.value.split(','))); }
      catch (problem) { error.textContent = problem.message; error.hidden = false; }
    });
    wrap.append(form);
    return wrap;
  }

  function buildActions(item) {
    const state = store.itemState(item.id);
    const wrap = el('div', 'd-actions');

    if (state.doneAt) {
      wrap.append(el('div', 'd-done', `${completionVerb(item)} on ${formatDate(new Date(state.doneAt))}`));
      const undo = el('button', 'act ghost', 'Undo');
      undo.addEventListener('click', () => ctx.act(() => store.clearProgress(item.id)));
      wrap.append(undo);
      return wrap;
    }

    // The verb set has to tell the truth. For work stopped by something broken,
    // and for work with a recorded outcome, Start and Submitted are both false,
    // so the panel states the situation and links to the forms instead.
    if (state.externalBlock) {
      const on = formatDate(parseDate(state.externalBlock.followUp), { month: 'short', day: 'numeric' });
      wrap.append(
        el('p', 'd-state-line', `Blocked: waiting on ${state.externalBlock.waitingOn}. Follow up ${on}.`)
      );
      return wrap;
    }

    const resolved = state.resolution?.state;
    if (resolved === 'cant-submit' || resolved === 'absorbed') {
      wrap.append(el('p', 'd-state-line', resolutionLabel(resolved) + '.'));
      return wrap;
    }

    const waiting = gatedBy(item);
    if (waiting.length) {
      const byId = new Map(ctx.map.allItems.map((it) => [it.id, it]));
      const names = waiting.map((id) => `${byId.get(id)?.title || id} (${byId.get(id)?.courseCode || ''})`.replace(/ \(\)$/, '')).join(', ');
      wrap.append(el('p', 'fine', `Needs first: ${names}. Completing that is what makes this one startable.`));
    }

    if (!state.startedAt) {
      const start = el('button', 'act primary', 'Start');
      start.addEventListener('click', () => ctx.act(() => store.markStarted(item.id)));
      wrap.append(start);
    }

    const finish = el('button', state.startedAt ? 'act primary' : 'act', `Mark ${completionVerb(item).toLowerCase()}`);
    finish.addEventListener('click', () =>
      ctx.act(() => store.markDone(item.id), {
        message: `${item.title} · ${completionVerb(item).toLowerCase()}`,
        undo: () => store.clearProgress(item.id)
      })
    );
    wrap.append(finish);

    if (store.isSnoozed(item.id)) {
      const un = el('button', 'act ghost', 'Bring back');
      un.addEventListener('click', () => ctx.act(() => store.unsnooze(item.id)));
      wrap.append(un);
    } else {
      const later = el('button', 'act ghost', 'Not today');
      later.addEventListener('click', () =>
        ctx.act(() => store.snoozeUntilTomorrow(item.id), {
          message: `${item.title} · set aside until tomorrow`,
          undo: () => store.unsnooze(item.id)
        })
      );
      wrap.append(later);
    }

    return wrap;
  }

  function buildStepBox(item) {
    const wrap = el('div', 'block');
    wrap.append(el('h3', null, 'First step'));
    const form = el('form', 'step-form');
    const input = el('input', 'circling-input');
    input.type = 'text';
    input.placeholder = 'The smallest move that counts as starting';
    input.value = store.itemState(item.id).firstStep || '';
    const save = el('button', 'act small', 'Save');
    save.type = 'submit';
    form.append(input, save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      ctx.act(() => store.setFirstStep(item.id, input.value.trim()));
    });
    wrap.append(form);
    return wrap;
  }

  /**
   * The schema sometimes carries no time. This is where the item's real moment
   * gets set, and it is worded as a correction rather than as a required field.
   */
  function buildDueTime(item) {
    const wrap = el('div', 'block');
    wrap.append(el('h3', null, 'Due time'));
    const form = el('form', 'time-form');
    const input = el('input', 'time-input');
    input.type = 'time';
    input.value = dueTimeFor(item);
    input.setAttribute('aria-label', `Due time for ${item.title}`);
    const save = el('button', 'act small', 'Set');
    save.type = 'submit';
    form.append(input, save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      ctx.act(() => store.setDueTime(item.id, input.value));
    });
    wrap.append(form);

    const overridden = Boolean(store.itemState(item.id).dueTime);
    const fromSchema = schemaTime(item);

    if (overridden) {
      const clear = el('button', 'linky', fromSchema ? 'Back to the scheduled time' : 'Back to no time set');
      clear.addEventListener('click', () => ctx.act(() => store.setDueTime(item.id, null)));
      wrap.append(clear);
    } else if (fromSchema && item.timeConfirmed === false) {
      wrap.append(
        el('p', 'fine', 'Not confirmed. This time is a placeholder from the schedule. Setting the real one re-orders the plan.')
      );
    } else if (fromSchema) {
      wrap.append(el('p', 'fine', 'From the syllabus. Changing it here overrides that for the day plan.'));
    } else {
      wrap.append(
        el('p', 'fine', 'No time on the schedule for this one. It orders after timed work until you set the real time.')
      );
    }
    return wrap;
  }

  function buildEffortPicker(item, band) {
    const wrap = el('div', 'block');
    wrap.append(el('h3', null, 'How long this takes (estimate)'));
    const group = el('div', 'effort-picker');
    Object.values(EFFORT).forEach((option) => {
      const b = el('button', 'effort-opt', `${option.label} · ${option.hint}`);
      if (option.id === band.id) b.classList.add('on');
      b.addEventListener('click', () => ctx.act(() => store.setEffort(item.id, option.id)));
      group.append(b);
    });
    wrap.append(group);
    wrap.append(el('p', 'fine', 'Starlight guesses from type and weight. Correcting it changes how early this appears.'));
    return wrap;
  }

  // What this item opens up, with the course named. A prerequisite is a
  // connection, and reading it as one is the point of the edge existing.
  function buildLinks(item) {
    const byId = new Map(ctx.map.allItems.map((it) => [it.id, it]));
    const unlocked = (item.blocks || []).map((edge) => byId.get(edge.itemId)).filter(Boolean);
    if (!unlocked.length) return null;
    const done = (it) => Boolean(store.itemState(it.id).doneAt || it.status === 'done');
    const outstanding = unlocked.filter((it) => !done(it));
    const wrap = el('div', 'block');
    wrap.append(el('h3', null, 'What this unlocks'));
    wrap.append(el('p', null, outstanding.length
      ? outstanding.map((it) => `${it.title} (${it.courseCode})`).join(', ')
      : 'Everything behind this one is already done.'));
    return wrap;
  }

  return { element: panel, show, hide, repaint, get openItem() { return openItem; } };
}

function collapsible(heading, contents) {
  const wrap = el('details', 'collapsible');
  const summary = document.createElement('summary');
  summary.textContent = heading;
  wrap.append(summary, contents);
  return wrap;
}

function relativeLabel(days) {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}
