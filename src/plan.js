import { now as rightNow, formatClock, subscribe as onTick } from './clock.js';
import { chimeWorkDone, chimeBreakDone, primeAudio } from './chime.js';
import {
  buildDayPlan,
  currentBlock,
  humanMinutes,
  formatTime,
  rangeLabel,
  formatDueTime,
  hasDueTime,
  sameDay,
  nextDueItem,
  POMODORO,
  POMOFOCUS_URL,
  pomodorosFor,
  EFFORT_MINUTES
} from './schedule.js';
import { dateBadge, dateText } from './truth-ui.js';
import { buildGradeSection, pointsAtRiskLine, dayExposureLine } from './grade-ui.js';
import { effortBand, EFFORT, completionVerb, daysUntil, effectiveStatus, phase } from './signals.js';
import { today } from './clock.js';
import * as store from './state.js';

/**
 * The timer is deliberately not part of the render tree's state. The plan
 * repaints on its own schedule, and a countdown that was rebuilt every second
 * would fight that; instead the running readout patches its own text in place,
 * the way the masthead clock already does, and only real transitions repaint.
 */
const timerUI = { ctx: null, titled: false };

function timerFor(block) {
  const t = store.timerState();
  return t && block && t.key === block.key ? t : null;
}

function remainingMs(t) {
  return t.running ? t.endsAt - Date.now() : t.remainingMs;
}

function clockText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function startTimer(block) {
  // The click that starts a pomodoro is also the gesture that lets the browser
  // make sound later, so the audio context is opened here and kept.
  if (store.soundOn()) primeAudio();
  store.setTimer({
    key: block.key,
    kind: block.kind,
    itemId: block.kind === 'work' ? block.item.id : null,
    title: block.kind === 'work' ? block.item.title : 'Break',
    endsAt: Date.now() + block.minutes * 60000,
    running: true
  });
}

function pauseTimer(t) {
  store.setTimer({ ...t, running: false, remainingMs: Math.max(0, remainingMs(t)) });
}

function resumeTimer(t) {
  store.setTimer({ ...t, running: true, endsAt: Date.now() + t.remainingMs });
}

/**
 * A finished block. The pomodoro is banked before anything is asked, because it
 * happened whether or not the question gets answered, and the app should never
 * lose work in order to ask about it.
 */
function finishTimer(t, { chime = true } = {}) {
  if (chime && store.soundOn()) {
    if (t.kind === 'work') chimeWorkDone();
    else chimeBreakDone();
  }
  if (t.kind === 'work' && t.itemId) {
    if (!t.wrapUp) store.completePomodoro(t.itemId);
    timerUI.ask = { itemId: t.itemId, at: Date.now() };
  }
  store.clearTimer();
  restoreTitle();
  if (timerUI.ctx) timerUI.ctx.repaint();
}

function restoreTitle() {
  if (!timerUI.titled) return;
  document.title = 'Starlight';
  timerUI.titled = false;
}

// One subscription for the life of the module. It does nothing at all unless a
// timer is actually running, so it costs nothing on the other surfaces.
onTick(() => {
  const t = store.timerState();
  if (!t) {
    restoreTitle();
    return;
  }
  const left = remainingMs(t);
  if (t.running && left <= 0) {
    finishTimer(t);
    return;
  }
  const readout = document.querySelector('.timer-readout');
  if (readout) readout.textContent = clockText(left);
  // Carrying the countdown in the tab title is what makes it usable from the
  // other tab you inevitably end up in.
  if (t.running) {
    document.title = `${clockText(left)} · ${t.title}`;
    timerUI.titled = true;
  } else {
    restoreTitle();
  }
});

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function hourLabel(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric' });
}

/**
 * The third surface: today, laid out on the clock. Now answers "what do I open".
 * This answers the different question of "in what order, and does it actually
 * fit before the deadline" for a day that has things due on it.
 */
export function renderPlan(map, ctx) {
  const at = rightNow();
  timerUI.ctx = ctx;
  const plan = buildDayPlan(map.allItems, at);
  const root = el('div', 'plan');
  if (ctx.mountAnim) root.classList.add('mounting');

  root.append(buildHead(plan, map, ctx));
  const risk = pointsAtRiskLine(map, (item) => phase(item, today()));
  if (risk) root.append(risk);
  const exposure = dayExposureLine(map, (item) => phase(item, today()));
  if (exposure) root.append(exposure);

  const ask = buildAsk(map, ctx);
  if (ask) root.append(ask);

  root.append(buildDayShape(plan, ctx, at));

  if (plan.mode === 'clear') {
    root.append(buildClear(map, plan));
  } else {
    root.append(buildSchedule(plan, map, ctx, at));
    root.append(buildAssumption(plan));
  }

  const tail = buildTail(plan, map, ctx);
  if (tail) root.append(tail);

  root.append(buildGradeSection(map));

  // A reorder moves the chosen block to the top of a page you had scrolled down
  // to find it on, so the plan follows the choice rather than making you hunt.
  if (timerUI.scrollTo) {
    const wanted = timerUI.scrollTo;
    timerUI.scrollTo = null;
    requestAnimationFrame(() => {
      const node = document.querySelector(`[data-item-id="${wanted}"]`);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  return root;
}

function buildHead(plan, map, ctx) {
  const head = el('header', 'plan-head');

  if (plan.mode === 'clear') {
    head.append(el('h2', 'plan-title', 'Nothing is due today.'));
    return head;
  }

  if (plan.advisory) {
    head.append(el('h2', 'plan-title', 'Nothing is due today.'));
    head.append(
      el(
        'p',
        'plan-line',
        `This is a shape for the afternoon built from what is in range, not from deadlines. About ${humanMinutes(
          plan.workMinutes
        )} of work in ${plan.pomodoros} ${plan.pomodoros === 1 ? 'pomodoro' : 'pomodoros'}, finishing around ${formatTime(
          plan.finishAt
        )}.`
      )
    );
    return head;
  }

  const count = plan.rows.length;
  head.append(
    el('h2', 'plan-title', `${count} ${count === 1 ? 'thing is' : 'things are'} due today.`)
  );
  head.append(
    el(
      'p',
      'plan-line',
      `About ${humanMinutes(plan.workMinutes)} of work in ${plan.pomodoros} ${
        plan.pomodoros === 1 ? 'pomodoro' : 'pomodoros'
      }, starting ${formatTime(plan.start)} and finishing around ${formatTime(plan.finishAt)}.`
    )
  );

  // The whole point of the feature is whether the day works. Say it outright,
  // either way, before any of the blocks.
  const verdict = el('p', plan.fits ? 'plan-verdict ok' : 'plan-verdict over');
  if (plan.fits) {
    const last = plan.lastDeadline;
    verdict.textContent = plan.assumedTimes
      ? last ? `Work with known times fits before ${formatTime(last)}. Other due times need checking.` : 'Due times are unknown. Check them before relying on this plan.'
      : `That lands before ${formatTime(last)}, so everything makes its deadline.`;
  } else {
    const worst = plan.overflow[0];
    const names = plan.overflow.map((r) => r.item.title).join(', ');
    verdict.textContent = worst.alreadyPast
      ? `${names} ${plan.overflow.length === 1 ? 'is' : 'are'} already past ${formatTime(worst.dueAt)}. The rest of the plan still fits.`
      : `This runs about ${humanMinutes(plan.overshootMinutes)} past the deadline on ${names}.`;
  }
  head.append(verdict);

  // Only said when packing the day without the choice actually does fit, so it
  // is a measured consequence rather than a suggestion that choosing was wrong.
  if (plan.costOfChoosing) {
    head.append(
      el(
        'p',
        'plan-fine',
        `Deadline order would have fit. Starting with ${plan.chosen.title} is what pushes it over, which may still be the right trade.`
      )
    );
  }

  if (!plan.fits && !plan.overflow[0].alreadyPast) {
    head.append(
      el(
        'p',
        'plan-fine',
        'The durations are estimates, not measurements. If one of these is smaller than Starlight thinks, correct it on the item and the plan re-flows.'
      )
    );
  }

  head.append(buildTimerPrefs(ctx));
  return head;
}

// The timer runs here, so the chime and the outside alternative both belong in
// one quiet row rather than repeated on every block.
function buildTimerPrefs(ctx) {
  const row = el('div', 'timer-prefs');

  const on = store.soundOn();
  const sound = el('button', 'linky');
  sound.textContent = on ? 'Chime on' : 'Chime off';
  sound.setAttribute('aria-pressed', String(on));
  sound.addEventListener('click', () => ctx.act(() => store.setSound(!store.soundOn())));
  row.append(sound);

  const alt = el('a', 'linky');
  alt.href = POMOFOCUS_URL;
  alt.target = '_blank';
  alt.rel = 'noopener noreferrer';
  alt.textContent = 'Pomofocus \u2197';
  alt.title = 'The same 25 and 5 intervals in a separate tab, if you would rather time it there.';
  row.append(alt);

  return row;
}

/**
 * The day is never empty. Packing from "now" assumes it is, which is why the
 * plan is wrong the moment there is a class at two or lunch to eat. This says
 * when work can really begin and what is already spoken for, and the schedule
 * flows around both.
 *
 * It is per day on purpose. "I cannot start until 2" is true of a Monday, not of
 * the week, and a constraint that outlived its day would quietly distort every
 * plan after it.
 */
function buildDayShape(plan, ctx, at) {
  const shape = plan.shape;
  const wrap = el('section', 'day-shape');

  const startRow = el('div', 'shape-row');
  startRow.append(el('span', 'shape-label', 'Start at'));

  const startForm = el('form', 'shape-form');
  const start = el('input', 'time-input small');
  start.type = 'time';
  start.value = shape.startAt || toValue(plan.start);
  start.setAttribute('aria-label', 'Earliest time you can start working today');
  const set = el('button', 'act small', 'Set');
  set.type = 'submit';
  startForm.append(start, set);
  startForm.addEventListener('submit', (e) => {
    e.preventDefault();
    ctx.act(() => store.setDayStart(start.value, at));
  });
  startRow.append(startForm);

  if (shape.startDeferred) {
    const now = el('button', 'linky', 'or right now');
    now.addEventListener('click', () => ctx.act(() => store.setDayStart(null, at)));
    startRow.append(now);
  } else {
    startRow.append(el('span', 'shape-note', 'as soon as possible'));
  }
  wrap.append(startRow);

  if (plan.chosen) {
    const firstRow = el('div', 'shape-row');
    firstRow.append(el('span', 'shape-label', 'First'));
    const chip = el('span', 'busy-chip');
    chip.append(el('span', null, plan.chosen.title));
    const drop = el('button', 'chip-x', '\u00d7');
    drop.setAttribute('aria-label', 'Back to deadline order');
    drop.addEventListener('click', () => ctx.act(() => store.setDayFirst(null, at)));
    chip.append(drop);
    firstRow.append(chip);
    firstRow.append(el('span', 'shape-note', 'the rest keep deadline order behind it'));
    wrap.append(firstRow);
  }

  const busyRow = el('div', 'shape-row');
  busyRow.append(el('span', 'shape-label', 'Busy'));

  const chips = el('div', 'busy-chips');
  shape.busy.forEach((b) => {
    const chip = el('span', 'busy-chip');
    chip.append(el('span', null, `${b.label} ${rangeLabel(b.start, b.end)}`));
    const drop = el('button', 'chip-x', '\u00d7');
    drop.setAttribute('aria-label', `Remove ${b.label}`);
    drop.addEventListener('click', () => ctx.act(() => store.removeBusy(b.id, at)));
    chip.append(drop);
    chips.append(chip);
  });
  if (!shape.busy.length) chips.append(el('span', 'shape-note', 'nothing claimed yet'));
  busyRow.append(chips);
  wrap.append(busyRow);

  wrap.append(buildBusyForm(ctx, at));
  return wrap;
}

function buildBusyForm(ctx, at) {
  const form = el('form', 'busy-form');
  const label = el('input', 'busy-name');
  label.type = 'text';
  label.placeholder = 'Lunch, class, work shift';
  label.setAttribute('aria-label', 'What is taking this time');

  const from = el('input', 'time-input small');
  from.type = 'time';
  from.setAttribute('aria-label', 'Busy from');
  const to = el('input', 'time-input small');
  to.type = 'time';
  to.setAttribute('aria-label', 'Busy until');

  const add = el('button', 'act small', 'Add');
  add.type = 'submit';

  const err = el('p', 'shape-err');
  err.hidden = true;

  form.append(label, el('span', 'shape-note', 'from'), from, el('span', 'shape-note', 'to'), to, add);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!from.value || !to.value) {
      err.textContent = 'Needs a start and an end.';
      err.hidden = false;
      return;
    }
    if (to.value <= from.value) {
      err.textContent = 'The end has to come after the start.';
      err.hidden = false;
      return;
    }
    ctx.act(() =>
      store.addBusy({ label: label.value.trim() || 'Busy', start: from.value, end: to.value }, at)
    );
  });

  const box = el('div');
  box.append(form, err);
  return box;
}

function toValue(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Hour markers sit in the flow between blocks rather than on a separate rail, so
 * the grid can never drift out of step with the blocks it is labelling.
 */
function buildSchedule(plan, map, ctx, at) {
  const list = el('div', 'plan-grid');
  const live = currentBlock(plan, at);
  let lastHour = null;

  plan.timeline.forEach((block, i) => {
    const hour = block.start.getHours();
    if (hour !== lastHour) {
      const mark = el('div', 'hour-mark');
      mark.append(el('span', 'hour-label', hourLabel(block.start)));
      list.append(mark);
      lastHour = hour;
    }
    if (block.kind === 'break') list.append(buildBreak(block, ctx, live === block && at >= block.start));
    else if (block.kind === 'busy') list.append(buildBusy(block, ctx, at));
    // Being inside a block and being about to start one are different facts, and
    // a plan that does not begin for two hours must not claim you are in it.
    else list.append(buildBlock(block, map, ctx, live === block ? (at >= block.start ? 'now' : 'next') : null, i, at, plan));
  });

  return list;
}

function buildBreak(block, ctx, standing) {
  const row = el('div', 'plan-block is-break');
  if (block.long) row.dataset.long = 'true';
  if (standing) row.dataset.standing = 'now';
  if (timerFor(block)) row.dataset.timing = 'true';
  row.style.setProperty('--minutes', block.minutes);
  row.append(el('span', 'block-time', formatTime(block.start)));
  row.append(
    el('span', 'block-break-label', block.long ? `${block.minutes} minute long break` : `${block.minutes} minute break`)
  );
  if (standing || timerFor(block)) row.append(buildControls(block, ctx));
  return row;
}

// Time already claimed, drawn in the timeline so the day reads as one continuous
// thing rather than as work with unexplained holes in it.
function buildBusy(block, ctx, at) {
  const row = el('div', 'plan-block is-busy');
  row.style.setProperty('--minutes', block.minutes);
  row.append(el('span', 'block-time', rangeLabel(block.start, block.end)));

  const body = el('div', 'block-body');
  body.append(el('div', 'busy-label', block.label));
  body.append(el('div', 'block-meta', `${humanMinutes(block.minutes)} · not available`));
  row.append(body);

  const drop = el('button', 'busy-clear', '×');
  drop.setAttribute('aria-label', `Remove ${block.label}`);
  drop.addEventListener('click', () => ctx.act(() => store.removeBusy(block.id, at)));
  row.append(drop);
  return row;
}

function buildBlock(block, map, ctx, standing, index, at, plan) {
  const item = block.item;
  const course = map.courseById.get(item.courseId);
  const row = el('div', 'plan-block');
  row.style.setProperty('--course-color', course.color);
  row.style.setProperty('--minutes', block.minutes);
  row.style.setProperty('--i', index);
  if (standing) row.dataset.standing = standing;
  if (block.wrapUp) row.dataset.wrap = 'true';
  row.dataset.itemId = item.id;
  if (timerFor(block)) row.dataset.timing = 'true';
  if (effectiveStatus(item) === 'started') row.dataset.started = 'true';

  const when = el('div', 'block-when');
  when.append(el('span', 'block-time', rangeLabel(block.start, block.end)));
  when.append(el('span', 'block-len', `${block.minutes} min`));
  if (standing) when.append(el('span', 'block-nowtag', standing));
  row.append(when);

  const body = el('div', 'block-body');
  const title = el('button', 'block-title', item.title);
  title.addEventListener('click', () => ctx.openDetail(item, title));
  body.append(title);

  // The block already states its own length, so the estimate band only needs to
  // say how much of the item this is. "of 4" carries the size on its own.
  const band = effortBand(item);
  const bits = [course.code];
  if (block.wrapUp) bits.push(block.parts === 1 ? 'its pomodoro is done' : `all ${block.parts} pomodoros done`, 'close it out');
  else bits.push(block.parts > 1 ? `pomodoro ${block.part} of ${block.parts}` : band.label.toLowerCase());
  body.append(el('div', 'block-meta', bits.join(' · ')));

  const step = store.itemState(item.id).firstStep;
  // Only on the first block of an item: the smallest move is how you begin, not
  // something to reread at the top of every chunk.
  if (step && block.part === 1) body.append(el('div', 'block-step', `First step: ${step}`));

  row.append(body);
  row.append(buildDue(item, at));
  // Only the block you are in, or about to be in, is a control surface. The
  // others are the plan, and a plan you can press twelve buttons on is a
  // control panel pretending to be a schedule. A running timer keeps its
  // controls wherever a reorder has moved its block to.
  if (standing || block.wrapUp || timerFor(block)) row.append(buildControls(block, ctx));
  // The first block of an item is where its whole shape is decided, so the two
  // decisions about the item as a whole live there and nowhere else. The active
  // block gets them too: realising four blocks is too many for a twenty minute
  // task happens exactly when you are looking at the first one.
  if (!block.wrapUp && leadsItem(block, plan)) row.append(buildItemChoices(block, ctx, plan, at));
  return row;
}

// True on an item's earliest block in today's plan, which is the only row where
// "start with this" and "this is smaller than you think" mean anything.
function leadsItem(block, plan) {
  if (block.kind !== 'work') return false;
  const first = plan.blocks.find((b) => b.kind === 'work' && b.item.id === block.item.id);
  return first === block;
}

/**
 * Decisions about the item rather than about these 25 minutes: what to open
 * first, and how big the thing actually is. Both are quiet links until used,
 * because there are four of them on a screen with one active block.
 */
function buildItemChoices(block, ctx, plan, at) {
  const item = block.item;
  const wrap = el('div', 'block-choices');

  const lead = plan.queue[0];
  if (!lead || lead.id !== item.id) {
    const pick = el('button', 'linky', 'Start with this');
    pick.title = 'Move this to the front of today. Everything else keeps its deadline order behind it.';
    pick.addEventListener('click', () => {
      timerUI.scrollTo = item.id;
      ctx.act(() => store.setDayFirst(item.id, at));
    });
    wrap.append(pick);
  }

  wrap.append(buildResize(item, ctx));
  return wrap;
}

/**
 * The estimate is a guess from type and weight, and the plan is where you find
 * out it was wrong: four blocks for something you know is twenty minutes. This
 * is the correction, at the moment of noticing, in the unit the plan is drawn in.
 */
function buildResize(item, ctx) {
  const wrap = el('span', 'resize');
  const current = effortBand(item);
  const open = timerUI.resizing === item.id;

  const toggle = el('button', 'linky');
  const count = pomodorosFor(item);
  toggle.textContent = open ? 'Never mind' : `${count} ${count === 1 ? 'pomodoro' : 'pomodoros'}, resize`;
  toggle.addEventListener('click', () => {
    timerUI.resizing = open ? null : item.id;
    ctx.repaint();
  });
  wrap.append(toggle);

  if (!open) return wrap;

  const options = el('span', 'resize-options');
  Object.values(EFFORT).forEach((band) => {
    const n = Math.max(1, Math.round(EFFORT_MINUTES[band.id] / POMODORO));
    const b = el('button', 'resize-opt', `${n} · ${band.hint}`);
    if (band.id === current.id) b.classList.add('on');
    b.addEventListener('click', () => {
      timerUI.resizing = null;
      ctx.act(() => store.setEffort(item.id, band.id));
    });
    options.append(b);
  });
  wrap.append(options);
  return wrap;
}

/**
 * A time alone is only meaningful for something due today. On a plan built from
 * what is in range, the same chip has to say which day, or "11:59 PM" reads as
 * tonight for work that is due next week.
 */
function buildDue(item, at) {
  const chip = el('div', 'block-due');
  const isToday = sameDay(item.dateObj, at);
  chip.append(el('span', 'due-word', 'due'));
  chip.append(dateBadge(item));

  if (isToday) {
    chip.append(el('span', 'due-time', formatDueTime(item) || 'time unknown'));
    if (!hasDueTime(item)) chip.dataset.unknown = 'true';
    chip.title = dateText(item);
    return chip;
  }

  const out = daysUntil(item.dateObj);
  const label =
    out <= 6
      ? item.dateObj.toLocaleDateString('en-US', { weekday: 'short' })
      : item.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  chip.append(el('span', 'due-time', label));
  chip.title = dateText(item);
  return chip;
}

/**
 * Block controls, and only on the block you are in or about to be in. Everything
 * here acts on this twenty five minutes; the one control that acts on the whole
 * assignment says so in words rather than relying on you to infer its scope.
 *
 * The old row had Start and Submitted on every block, which were both item verbs
 * wearing block clothing: Submitted on "pomodoro 2 of 4" ended the entire
 * assignment, and Start silently disappeared once the item was started at all.
 */
function buildControls(block, ctx) {
  const wrap = el('div', 'block-controls');
  const t = timerFor(block);

  if (block.wrapUp) return buildWrapControls(block, ctx);

  if (!t) {
    const start = el('button', 'act primary timer-start');
    start.append(el('span', null, block.kind === 'break' ? 'Start break' : 'Start'), el('span', 'timer-hint', clockText(block.minutes * 60000)));
    start.addEventListener('click', () => ctx.act(() => startTimer(block)));
    wrap.append(start);
    if (block.kind === 'work') wrap.append(buildFinishedLink(block.item, ctx));
    return wrap;
  }

  const readout = el('span', 'timer-readout', clockText(remainingMs(t)));
  readout.setAttribute('role', 'timer');
  readout.setAttribute('aria-live', 'off');
  wrap.append(readout);

  const toggle = el('button', 'act', t.running ? 'Pause' : 'Resume');
  toggle.addEventListener('click', () => ctx.act(() => (t.running ? pauseTimer(t) : resumeTimer(t))));
  wrap.append(toggle);

  const done = el('button', 'act primary', block.kind === 'break' ? 'Skip break' : 'Done');
  done.title =
    block.kind === 'break'
      ? 'End the break and move on'
      : 'Count this pomodoro as finished. Does not submit the assignment.';
  done.addEventListener('click', () => ctx.act(() => finishTimer(t, { chime: false })));
  wrap.append(done);

  if (block.kind === 'work') wrap.append(buildFinishedLink(block.item, ctx));
  return wrap;
}

// The escape hatch for finishing early, worded so its scope cannot be mistaken
// for the block it sits on.
function buildFinishedLink(item, ctx) {
  const link = el('button', 'linky finish-whole', 'Finished the whole thing');
  link.addEventListener('click', () =>
    ctx.act(() => store.markDone(item.id), {
      message: `${item.title} · ${completionVerb(item).toLowerCase()}`,
      undo: () => store.clearProgress(item.id)
    })
  );
  return link;
}

function buildWrapControls(block, ctx) {
  const wrap = el('div', 'block-controls');
  const submit = el('button', 'act primary', `Mark ${completionVerb(block.item).toLowerCase()}`);
  submit.addEventListener('click', () =>
    ctx.act(() => store.markDone(block.item.id), {
      message: `${block.item.title} · ${completionVerb(block.item).toLowerCase()}`,
      undo: () => store.clearProgress(block.item.id)
    })
  );
  const more = el('button', 'act', 'Needs another pomodoro');
  more.addEventListener('click', () => ctx.act(() => store.undoPomodoro(block.item.id)));
  wrap.append(submit, more);
  return wrap;
}

/**
 * The question, asked at the only moment it is answerable: a pomodoro just
 * ended, so "is this finished" is a real question about a real thing rather than
 * a button sitting on a row hoping to be understood.
 */
function buildAsk(map, ctx) {
  const ask = timerUI.ask;
  if (!ask) return null;
  const item = map.allItems.find((it) => it.id === ask.itemId);
  if (!item || effectiveStatus(item) === 'done') {
    timerUI.ask = null;
    return null;
  }

  const left = Math.max(0, pomodorosFor(item) - store.pomodorosDone(item.id));
  const card = el('section', 'ask');
  card.append(el('div', 'ask-eyebrow', 'Pomodoro done'));
  card.append(el('h3', 'ask-title', `Is ${item.title} finished?`));
  card.append(
    el(
      'p',
      'ask-line',
      left
        ? `${store.pomodorosDone(item.id)} done, ${left} more planned. Nothing has been submitted yet.`
        : `That was the last one planned for it. Nothing has been submitted yet.`
    )
  );

  const actions = el('div', 'actions');
  const yes = el('button', 'act primary', `Yes, mark ${completionVerb(item).toLowerCase()}`);
  yes.addEventListener('click', () => {
    timerUI.ask = null;
    ctx.act(() => store.markDone(item.id), {
      message: `${item.title} · ${completionVerb(item).toLowerCase()}`,
      undo: () => store.clearProgress(item.id)
    });
  });
  const no = el('button', 'act', left ? `Not yet, ${left} more to go` : 'Not yet, keep going');
  no.addEventListener('click', () => {
    timerUI.ask = null;
    ctx.act(() => {});
  });
  actions.append(yes, no);
  card.append(actions);
  return card;
}

// Stated once, at the bottom of the schedule, where it explains the times above
// without being the first thing read.
function buildAssumption(plan) {
  // Only worth saying where a time is actually driving the order. On a plan
  // built from what is in range the chips show dates, and this would explain
  // an assumption the surface is not making.
  if (plan.advisory || !plan.assumedTimes) return el('div', 'plan-fine', '');
  return el(
    'p',
    'plan-fine',
    'Some due times are unknown. Open an item to check its time before relying on this plan.'
  );
}

function buildClear(map, plan) {
  const card = el('section', 'plan-clear');
  const next = nextDueItem(map.allItems);
  if (next) {
    const left = daysUntil(next.dateObj);
    const course = map.courseById.get(next.courseId);
    card.append(
      el(
        'p',
        'plan-line',
        `Nothing is in range to plan either. The next thing due is ${next.title} (${course.code}), ${left} ${
          left === 1 ? 'day' : 'days'
        } out.`
      )
    );
  } else {
    card.append(el('p', 'plan-line', 'Nothing is in range to plan either.'));
  }
  return card;
}

// The honest footnotes: what this plan is deliberately not covering.
function buildTail(plan, map, ctx) {
  const notes = [];

  if (plan.setAside.length) {
    const line = el('p', 'plan-note');
    line.append(
      document.createTextNode(
        `${plan.setAside.length} due today ${plan.setAside.length === 1 ? 'is' : 'are'} set aside and not in this plan. `
      )
    );
    const back = el('button', 'linky', 'Bring them back');
    back.addEventListener('click', () =>
      ctx.act(() => plan.setAside.forEach((it) => store.unsnooze(it.id)))
    );
    line.append(back);
    notes.push(line);
  }

  if (plan.stillOpen.length) {
    notes.push(
      el(
        'p',
        'plan-note',
        `${plan.stillOpen.length} ${plan.stillOpen.length === 1 ? 'thing is' : 'things are'} past their date and are not in this plan. They are on the Now screen under Still open.`
      )
    );
  }

  if (plan.finished.length) {
    notes.push(
      el(
        'p',
        'plan-note',
        `Finished today: ${plan.finished.map((it) => it.title).join(', ')}.`
      )
    );
  }

  if (!notes.length) return null;
  const tail = el('section', 'plan-tail');
  notes.forEach((n) => tail.append(n));
  return tail;
}
