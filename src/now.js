import { today, formatDay } from './clock.js';
import {
  liveItems,
  setAside,
  overdueItems,
  horizonItem,
  pickFocus,
  focusReason,
  effortBand,
  daysUntil,
  avoidance,
  recentlyFinished,
  doneAt,
  awayReport,
  completionVerb,
  effectiveStatus
} from './signals.js';
import { dueTodayItems } from './schedule.js';
import { dateBadge, resolutionLabel } from './truth-ui.js';
import * as store from './state.js';
import { buildSyncStatus } from './syncui.js';
import { recoveryChoice } from './attention.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function dueLabel(item, now = today()) {
  const left = daysUntil(item.dateObj, now);
  if (left === 0) return 'due today';
  if (left === 1) return 'due tomorrow';
  if (left === -1) return 'was due yesterday';
  if (left < 0) return `was due ${Math.abs(left)} days ago`;
  if (left <= 6) {
    return `due ${item.dateObj.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  return `due ${item.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/**
 * The default surface. Shows one thing to do, a short list of what else is in
 * range, and nothing else. The full semester stays one deliberate click away
 * rather than arriving unrequested.
 */
export function renderNow(map, ctx) {
  const now = today();
  const items = map.allItems;
  const root = el('div', 'now');
  root.dataset.mode = ctx.attentionMode || 'full';
  if (ctx.mountAnim) root.classList.add('mounting');

  const away = awayReport(items, ctx.lastVisit, now);
  if (away && !ctx.awayDismissed) root.append(buildAway(away, ctx));

  const focus = pickFocus(items, now);
  const live = liveItems(items, now);
  const past = overdueItems(items, now);

  const recovery = recoveryChoice(past.map((item) => ({ ...item, resolution: store.itemState(item.id).resolution })), ctx.lastVisit, now);
  if (recovery && !ctx.awayDismissed) {
    root.append(buildRecovery(recovery, map, ctx, now), buildBackup(ctx));
    return root;
  }

  if (ctx.attentionMode === 'light') {
    root.append(focus ? buildLightFocus(focus, map, ctx, now) : buildClear(items, map, ctx, now));
    return root;
  }

  root.append(focus ? buildFocus(focus, items, map, ctx, now) : buildClear(items, map, ctx, now));

  const dueToday = dueTodayItems(items).filter((it) => !store.isSnoozed(it.id));
  if (dueToday.length) root.append(buildPlanLink(dueToday, items, ctx));

  const rest = live.slice(1);
  if (rest.length) root.append(buildQueue(rest, map, ctx, now));

  const horizon = horizonItem(items, now);
  if (horizon) {
    const left = daysUntil(horizon.dateObj, now);
    const course = map.courseById.get(horizon.courseId);
    root.append(
      el(
        'p',
        'horizon',
        `Further out: ${horizon.title} (${course.code}) in ${left} days. Nothing to do about it yet.`
      )
    );
  }

  if (past.length) root.append(buildStillOpen(past, map, ctx, now));

  const standing = items.filter((it) => it.type === 'standing');
  if (standing.length) {
    const line = el('p', 'standing-note');
    line.append(
      document.createTextNode('Running all semester: '),
      ...standing.map((it) => el('span', 'sn-item', it.title))
    );
    root.append(line);
  }

  const finished = recentlyFinished(items);
  if (finished.length) root.append(buildFinished(finished, map, ctx));

  root.append(buildBackup(ctx));
  return root;
}

function buildLightFocus(item, map, ctx, now) {
  const course = map.courseById.get(item.courseId);
  const state = store.itemState(item.id);
  const card = el('section', 'light-focus');
  card.style.setProperty('--course-color', course.color);
  card.append(el('p', 'focus-eyebrow', 'One thing for now'));
  card.append(el('h2', 'light-title', item.title));
  card.append(el('p', 'focus-meta', `${course.code} · ${dueLabel(item, now)}`));
  card.append(dateBadge(item));
  const action = el('button', 'act primary', state.externalBlock ? 'See what is blocking it' : state.startedAt ? 'Continue' : 'Open item');
  action.addEventListener('click', () => ctx.openDetail(item));
  card.append(action);
  return card;
}

function buildRecovery(recovery, map, ctx, now) {
  const card = el('section', 'recovery');
  const { chosen, rest, knownRecoverable } = recovery;
  card.append(el('p', 'focus-eyebrow', 'Pick up here'));
  card.append(el('h2', 'light-title', chosen.title));
  card.append(el('p', 'focus-meta', `${map.courseById.get(chosen.courseId).code} · ${dueLabel(chosen, now)}`));
  card.append(el('p', 'recovery-fact', 'Resolving the missed work is the work today.'));
  const action = el('button', 'act primary', knownRecoverable ? 'Open recoverable item' : 'Check whether this can be recovered');
  action.addEventListener('click', () => ctx.openDetail(chosen));
  card.append(action);
  const list = el('details', 'recovery-list');
  list.append(el('summary', null, `Other items to resolve (${rest.length})`));
  rest.forEach((item) => {
    const button = el('button', 'recovery-row', `${map.courseById.get(item.courseId).code} · ${item.title}`);
    button.addEventListener('click', () => ctx.openDetail(item));
    list.append(button);
  });
  card.append(list);
  const dismiss = el('button', 'linky', 'Return to Now');
  dismiss.addEventListener('click', ctx.dismissAway);
  card.append(dismiss);
  return card;
}

/**
 * One line, not a schedule. Now stays a single-thing surface; when the day
 * actually has deadlines on it, this is the door to the hour by hour version
 * rather than the version itself.
 */
function buildPlanLink(dueToday, items, ctx) {
  const wrap = el('p', 'plan-link');
  const btn = el('button', 'linky', 'Plan the day by the hour');
  btn.addEventListener('click', ctx.openPlan);
  wrap.append(
    document.createTextNode('Deadlines land today. '),
    btn
  );
  return wrap;
}

// Orientation after a gap, stated as movement rather than as a backlog.
function buildAway(away, ctx) {
  const card = el('section', 'away');
  const head = el('div', 'away-head');
  head.append(
    el('h2', null, `${away.gapDays} days since you were last here`),
    (() => {
      const close = el('button', 'away-close', '×');
      close.setAttribute('aria-label', 'Dismiss');
      close.addEventListener('click', ctx.dismissAway);
      return close;
    })()
  );
  card.append(head);

  const bits = [];
  if (away.cameIntoRange.length) bits.push(`${away.cameIntoRange.length} came into range`);
  if (away.passed.length) bits.push(`${away.passed.length} passed its date`);
  card.append(el('p', 'away-line', `While you were away: ${bits.join(', ')}.`));
  card.append(el('p', 'away-sub', 'Nothing is lost and nothing is counting against you. Pick up wherever you like.'));
  return card;
}

function buildFocus(item, items, map, ctx, now) {
  const course = map.courseById.get(item.courseId);
  const reason = focusReason(item, items, now);
  const band = effortBand(item);
  const state = store.itemState(item.id);
  const started = Boolean(state.startedAt);

  const card = el('section', 'focus');
  card.style.setProperty('--course-color', course.color);
  // The light moving to the next thing is the reward for finishing one.
  if (ctx.focusChanged) card.classList.add('arriving');

  const orb = el('div', 'focus-orb');
  orb.dataset.mode = avoidance(item) ? 'circling' : 'focus';
  orb.append(el('span', 'orb-core'), el('span', 'orb-bloom'));

  const body = el('div', 'focus-body');
  body.append(el('div', 'focus-eyebrow', started ? 'In progress' : 'Start here'));

  const title = el('button', 'focus-title', item.title);
  title.addEventListener('click', () => ctx.openDetail(item));
  body.append(title);

  body.append(
    el('div', 'focus-meta', `${course.code} · ${reason.when} · ${band.label.toLowerCase()}, about ${band.hint}`)
  );
  body.append(dateBadge(item));
  body.append(el('div', 'focus-why', reason.why));

  const step = state.firstStep;
  if (step) body.append(el('div', 'focus-step', `First step: ${step}`));

  body.append(buildActions(item, ctx, { primary: true }));

  const ring = avoidance(item);
  if (ring) body.append(buildAvoidanceNote(item, ring, ctx));

  card.append(orb, body);
  return card;
}

/**
 * Nothing in range is a real and good state, not an empty error. Saying so
 * plainly is the point: it is permission to close the app.
 */
function buildClear(items, map, ctx, now) {
  const card = el('section', 'clear');
  card.append(el('div', 'focus-orb resting'));

  const deferred = setAside(items, now);
  const body = el('div');

  if (deferred.length) {
    // Honest about why the surface is empty: this is a choice, not a clear deck.
    body.append(el('h2', 'clear-title', 'Set aside until tomorrow.'));
    body.append(el('p', 'clear-sub', 'Nothing else is in range. These come back on their own.'));
    const actions = el('div', 'actions');
    const back = el('button', 'act', 'Bring them back');
    back.addEventListener('click', () =>
      ctx.act(() => deferred.forEach((it) => store.unsnooze(it.id)))
    );
    actions.append(back);
    body.append(actions);
    card.append(body);
    return card;
  }

  const upcoming = items
    .filter((it) => it.dateObj && it.type !== 'standing' && !isDoneItem(it) && daysUntil(it.dateObj, now) > 0)
    .sort((a, b) => a.dateObj - b.dateObj)[0];

  body.append(el('h2', 'clear-title', 'Nothing is in range right now.'));
  if (upcoming) {
    const left = daysUntil(upcoming.dateObj, now);
    body.append(
      el(
        'p',
        'clear-sub',
        `The next thing worth starting is ${upcoming.title}, ${left} days out. It will show up here when it is closer.`
      )
    );
  }
  card.append(body);
  return card;
}

function isDoneItem(item) {
  return effectiveStatus(item) === 'done';
}

/**
 * What actually got done lately. No count on the header, no streak, nothing that
 * resets: just the evidence, folded away, for the days when it does not feel
 * like anything is moving.
 */
function buildFinished(finished, map, ctx) {
  const section = el('section', 'finished');
  const toggle = el('button', 'section-head toggle');
  toggle.append(el('span', null, 'Finished lately'), el('span', 'caret', ctx.finishedExpanded ? '\u25be' : '\u25b8'));
  toggle.addEventListener('click', ctx.toggleFinished);
  section.append(toggle);

  if (ctx.finishedExpanded) {
    finished.forEach((item) => {
      const course = map.courseById.get(item.courseId);
      const row = el('div', 'done-row');
      row.style.setProperty('--course-color', course.color);
      const when = new Date(doneAt(item));
      row.append(
        el('span', 'done-tick', '\u2713'),
        el('span', 'done-title', item.title),
        el('span', 'done-when', `${course.code} · ${when.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
      );
      section.append(row);
    });
  }
  return section;
}

// Quiet, at the bottom, because durability should be available without being a
// chore the app nags about.
function buildBackup(ctx) {
  const wrap = el('div', 'backup');
  wrap.append(buildSyncStatus(ctx));

  const save = el('button', 'act ghost small', 'Export');
  save.addEventListener('click', () => {
    const blob = new Blob([store.exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `starlight-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const load = el('label', 'act ghost small', 'Import');
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.hidden = true;
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      ctx.act(() => store.importState(text));
    } catch (err) {
      wrap.append(el('span', 'backup-err', ` Could not read that file: ${err.message}`));
    }
  });
  load.append(file);

  wrap.append(save, load);
  return wrap;
}

function buildQueue(rest, map, ctx, now) {
  const section = el('section', 'queue');
  const visible = ctx.queueExpanded ? rest : rest.slice(0, 3);

  section.append(el('h3', 'section-head', 'Also in range'));

  visible.forEach((item, i) => {
    const row = buildRow(item, map, ctx, now);
    row.style.setProperty('--i', i);
    section.append(row);
  });

  if (rest.length > visible.length) {
    const more = el('button', 'more', `Show ${rest.length - visible.length} more`);
    more.addEventListener('click', ctx.expandQueue);
    section.append(more);
  }
  return section;
}

function buildRow(item, map, ctx, now) {
  const course = map.courseById.get(item.courseId);
  const band = effortBand(item);
  const row = el('div', 'row-item');
  row.style.setProperty('--course-color', course.color);
  if (effectiveStatus(item) === 'started') row.dataset.started = 'true';
  // Stakes, as weight, and the real state, as data the stylesheet reads. A
  // 100 point exam and a 2.5 point summary should never look alike, and a
  // blocked row must not read as one merely not started.
  row.dataset.stakes =
    item.type === 'exam' || item.type === 'final' || (item.weightPercent ?? 0) >= 8
      ? 'heavy'
      : (item.points ?? 0) >= 6
        ? 'mid'
        : 'light';
  const state = store.itemState(item.id);
  row.dataset.blocked = String(Boolean(state.externalBlock));
  const resolved = state.resolution?.state;
  row.dataset.resolved = resolved === 'cant-submit' || resolved === 'absorbed' ? resolved : '';

  const dot = el('span', 'row-dot');
  const main = el('button', 'row-main');
  main.append(
    el('span', 'row-title', item.title),
    el('span', 'row-meta', `${course.code} · ${dueLabel(item, now)} · ${band.label.toLowerCase()}`)
  );
  main.append(dateBadge(item));
  main.addEventListener('click', () => ctx.openDetail(item));

  row.append(dot, main, buildActions(item, ctx, { compact: true }));
  return row;
}

// Past its date, gathered in one place, folded away by default and worded
// flatly. Overdue work should be findable without being the first thing seen.
function buildStillOpen(past, map, ctx, now) {
  const section = el('section', 'still-open');
  const toggle = el('button', 'section-head toggle');
  toggle.append(
    el('span', null, 'Still open'),
    el('span', 'caret', ctx.pastExpanded ? '▾' : '▸')
  );
  toggle.addEventListener('click', ctx.togglePast);
  section.append(toggle);

  if (ctx.pastExpanded) {
    past.forEach((item) => section.append(buildRow(item, map, ctx, now)));
    section.append(
      el('p', 'still-note', 'Dates that have gone by. Some may still be worth doing, some may not.')
    );
  }
  return section;
}

function buildActions(item, ctx, { primary = false, compact = false } = {}) {
  const state = store.itemState(item.id);
  const wrap = el('div', compact ? 'actions compact' : 'actions');

  if (state.doneAt) {
    const undo = el('button', 'act ghost', 'Undo');
    undo.addEventListener('click', () => ctx.act(() => store.clearProgress(item.id)));
    wrap.append(el('span', 'act-done', `${completionVerb(item)} ✓`), undo);
    return wrap;
  }

  // The verb set tells the truth on every surface. Stopped work and resolved
  // misses carry their situation instead of a Start and Submitted pair.
  if (state.externalBlock) {
    const blocked = el('button', compact ? 'linky' : 'act ghost', 'Blocked externally');
    blocked.addEventListener('click', () => ctx.openDetail(item));
    wrap.append(blocked);
    return wrap;
  }

  const resolved = state.resolution?.state;
  if (resolved === 'cant-submit' || resolved === 'absorbed') {
    wrap.append(el('span', 'act-done', resolutionLabel(resolved)));
    return wrap;
  }

  if (!state.startedAt) {
    const start = el('button', primary ? 'act primary' : 'act', 'Start');
    start.addEventListener('click', () => ctx.act(() => store.markStarted(item.id)));
    wrap.append(start);
  }

  const finish = el('button', state.startedAt && primary ? 'act primary' : 'act', completionVerb(item));
  finish.addEventListener('click', () =>
    ctx.act(() => store.markDone(item.id), {
      message: `${item.title} · ${completionVerb(item).toLowerCase()}`,
      undo: () => store.clearProgress(item.id)
    })
  );
  wrap.append(finish);

  if (!compact) {
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

/**
 * The avoidance mirror. Stated as a count of what happened, with an offer
 * attached, because the useful move is shrinking the task rather than
 * pushing harder on it.
 */
function buildAvoidanceNote(item, ring, ctx) {
  const note = el('div', 'circling');
  note.append(el('p', 'circling-line', ring.sentence));

  const form = el('form', 'circling-form');
  const input = el('input', 'circling-input');
  input.type = 'text';
  input.placeholder = 'What is the smallest first move?';
  input.value = store.itemState(item.id).firstStep || '';
  const save = el('button', 'act small', 'Save step');
  save.type = 'submit';
  form.append(input, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.act(() => store.setFirstStep(item.id, input.value.trim()));
  });

  note.append(form);
  return note;
}
