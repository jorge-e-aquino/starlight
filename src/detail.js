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
import { draftForItem } from './assistant-ui.js';
import { dateTrust } from './truth.js';

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
  const writingOpen = new Set();

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

    // Exam rules are the first action context. Coursework keeps its direct verbs.
    const dateDetails = item.type === 'standing' ? null : collapsible('Date and sources',
      ['exam', 'final'].includes(item.type) ? buildExamDateSources(item) : buildDateTrustForm(item, ctx));
    const exam = buildExamSection(item, {
      ...ctx,
      openDate: () => { dateDetails.open = true; dateDetails.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    });
    if (exam) body.append(exam);
    if (exam) body.append(collapsible('Update exam status', buildActions(item)));
    else body.append(buildActions(item));

    if (!exam && item.type !== 'standing' && !['absorbed', 'cant-submit'].includes(state.resolution?.state)) {
      body.append(buildStepBox(item));
      if (!['exam', 'final'].includes(item.type)) {
        const writing = collapsible('Writing help', buildWritingHelp(item));
        writing.open = writingOpen.has(item.id);
        writing.addEventListener('toggle', () => { if (!writing.isConnected) return;
          if (writing.open) writingOpen.add(item.id); else writingOpen.delete(item.id);
        });
        body.append(writing);
      }
    }

    if (item.type !== 'standing') {
      body.append(dateDetails);
      body.append(collapsible('Outcome', buildResolutionForm(item, course, ctx)));
      body.append(collapsible('External block', buildExternalBlockForm(item, ctx)));
      const links = buildLinks(item, course);
      if (links) body.append(links);
    }

    body.append(collapsible('Labels', buildLabels(item)));
    const attached = Object.entries(store.snapshot().documents || {}).filter(([, record]) => !record.deletedAt && (record.itemIds || []).includes(item.id));
    if (attached.length) body.append(collapsible('Documents', documentRows(attached, ctx)));

    const scoreForm = !exam || state.doneAt || state.score != null ? buildScoreForm(item, course, ctx) : null;
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

    if (!exam) body.append(buildEffortPicker(item, band));
    if (item.dateObj && !exam) body.append(buildDueTime(item));

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

  function buildExamDateSources(item) {
    const trust = dateTrust(item, store.snapshot());
    const wrap = el('div', 'exam-date-sources');
    if (trust.sources.length) {
      trust.sources.forEach((source) => {
        const line = el('p', 'exam-date-source');
        line.append(el('strong', null, source.source || 'Source'), document.createTextNode(` · ${source.date || 'date unknown'}${source.time ? ` · ${source.time}` : ' · time unknown'}`));
        if (source.note) line.append(el('span', 'fine', source.note));
        wrap.append(line);
      });
    } else wrap.append(el('p', 'fine', trust.source ? `Recorded source: ${trust.source}` : 'No date source recorded yet.'));
    wrap.append(collapsible('Correct date and time', buildDateTrustForm(item, ctx)));
    return wrap;
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

  function buildWritingHelp(item) {
    const state = store.itemState(item.id);
    const wrap = el('div', 'writing-help');
    wrap.append(el('p', 'fine', 'A starting draft stays here. Review the assignment and write the final version yourself.'));
    const limitForm = el('form', 'writing-limit');
    const size = el('input', 'truth-input'); size.type = 'number'; size.min = '1'; size.max = '30000'; size.placeholder = 'Hard limit';
    size.value = state.writingLimit?.value || ''; size.setAttribute('aria-label', 'Hard writing limit');
    const unit = el('select', 'truth-input'); unit.setAttribute('aria-label', 'Limit unit');
    [['words', 'Words'], ['characters', 'Characters']].forEach(([value, label]) => unit.append(new Option(label, value)));
    unit.value = state.writingLimit?.unit || 'words';
    const set = el('button', 'act ghost small', 'Set limit'); set.type = 'submit';
    limitForm.append(size, unit, set);
    if (state.writingLimit) {
      const clear = el('button', 'linky', 'Clear limit'); clear.type = 'button';
      clear.addEventListener('click', () => ctx.act(() => store.setWritingLimit(item.id, null)));
      limitForm.append(clear);
    }
    limitForm.addEventListener('submit', (event) => { event.preventDefault();
      try { ctx.act(() => store.setWritingLimit(item.id, { value: size.value, unit: unit.value })); }
      catch (error) { message.textContent = error.message; }
    });
    const draft = el('textarea', 'truth-input'); draft.rows = 7; draft.value = state.draftText || '';
    draft.setAttribute('aria-label', `Draft for ${item.title}`);
    const count = el('p', 'fine');
    const updateCount = () => {
      const limit = store.itemState(item.id).writingLimit;
      const amount = limit?.unit === 'characters' ? draft.value.length : draft.value.trim().split(/\s+/).filter(Boolean).length;
      count.textContent = limit ? `${amount} / ${limit.value} ${limit.unit}${amount > limit.value ? ' · over limit' : ''}` : 'No hard limit recorded.';
    };
    draft.addEventListener('input', updateCount); updateCount();
    const actions = el('div', 'writing-actions');
    const save = el('button', 'act small', 'Save draft');
    save.addEventListener('click', () => { try { ctx.act(() => store.saveItemDraft(item.id, draft.value)); } catch (error) { message.textContent = error.message; } });
    const generate = el('button', 'act ghost small', 'Help me start');
    generate.addEventListener('click', async () => {
      generate.disabled = true; message.textContent = 'Finding a starting point…';
      try { const result = await draftForItem(item, ctx.map, store.itemState(item.id).writingLimit);
        draft.value = result.text; updateCount();
        ctx.act(() => store.saveItemDraft(item.id, draft.value, result.citations));
      } catch (error) { message.textContent = error.message; generate.disabled = false; }
    });
    actions.append(save, generate);
    const message = el('p', 'fine'); message.setAttribute('role', 'status');
    wrap.append(limitForm, draft, count, actions, message);
    if (state.draftSources?.length) wrap.append(el('p', 'fine', `Sources: ${state.draftSources.map((source) => source.title).join(' · ')}`));
    const history = state.draftHistory || [];
    if (history.length) {
      const previous = el('details', 'draft-history'); previous.append(el('summary', null, 'Earlier drafts'));
      history.slice().reverse().forEach((entry) => {
        const restore = el('button', 'act ghost small', `Restore ${new Date(entry.at).toLocaleString()}`);
        restore.addEventListener('click', () => ctx.act(() => store.saveItemDraft(item.id, entry.text, entry.sources || [])));
        previous.append(restore);
      });
      wrap.append(previous);
    }
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
