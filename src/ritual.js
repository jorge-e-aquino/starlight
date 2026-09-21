import { today } from './clock.js';
import { parseDate } from './data.js';
import { dueTodayItems, finishedToday } from './schedule.js';
import { gatedBy, liveItems, phase } from './signals.js';
import { itemState, dayShape, setDayStart } from './state.js';
import { dateBadge } from './truth-ui.js';
import { reminderPanel } from './push-ui.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function itemLine(item, action, showDate = true) {
  const row = el('div', 'checkin-item');
  const name = el('button', 'checkin-item-name', item.title);
  name.addEventListener('click', () => action(item, name, { silent: true }));
  row.append(name, el('span', 'checkin-course', item.courseCode));
  if (showDate) row.append(dateBadge(item));
  if (itemState(item.id).externalBlock) row.append(el('span', 'checkin-status', 'Externally blocked'));
  return row;
}

function needsConfirmation(items, at = today()) {
  const horizon = new Date(at);
  horizon.setDate(horizon.getDate() + 7);
  const candidateDate = (item) => item.dateObj || parseDate(item.schemaDate) ||
    (itemState(item.id).dateTrust?.sources || []).map((source) => parseDate(source.date)).filter(Boolean).sort((a, b) => a - b)[0] || null;
  return items
    .filter((item) => item.type !== 'standing')
    .filter((item) => !['done', 'resolved'].includes(phase(item, at)))
    .filter((item) => itemState(item.id).dateTrust?.status !== 'verified')
    .filter((item) => {
      const date = candidateDate(item);
      return itemState(item.id).dateTrust?.status === 'contradicted' || (date && date >= at && date <= horizon);
    })
    .sort((a, b) => {
      const aConflict = itemState(a.id).dateTrust?.status === 'contradicted' ? 0 : 1;
      const bConflict = itemState(b.id).dateTrust?.status === 'contradicted' ? 0 : 1;
      return aConflict - bConflict || candidateDate(a) - candidateDate(b);
    });
}

const STEPS = [
  'What is due today',
  'One thing to start',
  'What needs confirming',
  "Today's shape"
];

export function renderCheckin(map, ctx) {
  const step = ctx.checkinStep;
  const root = el('main', 'checkin');
  const card = el('section', 'checkin-card');
  const head = el('div', 'checkin-head');
  head.append(el('p', 'checkin-kicker', step < 4 ? `${step + 1} of 4 · daily check-in` : 'check-in complete'));
  const close = el('button', 'act ghost small', 'Close');
  close.addEventListener('click', ctx.closeCheckin);
  head.append(close);
  if (step === 0) {
    const evening = el('button', 'act ghost small', 'Evening close');
    evening.addEventListener('click', ctx.openEvening);
    head.append(evening);
  }
  card.append(head);

  if (step === 4) {
    card.append(el('h2', 'checkin-title', 'Check-in complete.'), el('p', 'checkin-copy', 'Start with the one thing shown. The rest is in Plan when you need it.'));
    const done = el('button', 'act primary', 'Go to Now');
    done.addEventListener('click', ctx.closeCheckin);
    card.append(done);
    card.append(reminderPanel({ firstRun: ctx.firstRun }));
    root.append(card);
    return root;
  }

  card.append(el('h2', 'checkin-title', STEPS[step]));
  const body = el('div', 'checkin-body');
  if (step === 0) {
    const due = dueTodayItems(map.allItems).filter((item) => phase(item) !== 'resolved');
    body.append(el('p', 'checkin-copy', due.length ? 'These have a date today. Open one to inspect its date and time.' : 'Nothing with a date lands today.'));
    due.slice(0, 5).forEach((item) => body.append(itemLine(item, ctx.openDetail)));
    if (due.length > 5) body.append(el('p', 'checkin-copy', 'The full set is in Plan.'));
  } else if (step === 1) {
    const live = liveItems(map.allItems);
    const focus = live.find((item) => !itemState(item.id).externalBlock && gatedBy(item).length === 0);
    body.append(el('p', 'checkin-copy', focus
      ? 'This is the next useful start based on its date, effort and anything it unlocks.'
      : live.length ? 'Nothing startable is in range right now. Check the blocks in Now.' : 'Nothing is in range right now.'));
    if (focus) body.append(itemLine(focus, ctx.openDetail));
  } else if (step === 2) {
    const unchecked = needsConfirmation(map.allItems);
    body.append(el('p', 'checkin-copy', unchecked.length ? 'Check the nearest source before relying on its date. Only you can mark it verified.' : 'No upcoming date needs your confirmation in the next seven days.'));
    unchecked.slice(0, 2).forEach((item) => body.append(itemLine(item, ctx.openDetail)));
  } else {
    const shape = dayShape();
    body.append(el('p', 'checkin-copy', 'Choose when you can begin. You can refine the rest in Plan.'));
    const form = el('form', 'checkin-shape');
    const label = el('label', null, 'Start work at');
    const input = el('input');
    input.type = 'time';
    input.required = true;
    input.value = shape.startAt || '';
    input.setAttribute('aria-label', 'Start work at');
    label.append(input);
    const save = el('button', 'act', 'Use this time');
    save.type = 'submit';
    form.append(label, save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!input.value) return;
      setDayStart(input.value);
      ctx.advanceCheckin();
    });
    const now = el('button', 'act ghost', 'Start when I can');
    now.addEventListener('click', () => { setDayStart(null); ctx.advanceCheckin(); });
    body.append(form, now);
  }
  card.append(body);

  if (step < 3) {
    const next = el('button', 'act primary checkin-next', step === 2 ? 'Choose today’s shape' : 'Continue');
    next.addEventListener('click', ctx.advanceCheckin);
    card.append(next);
  }
  root.append(card);
  return root;
}

export function renderEvening(map, ctx) {
  const root = el('main', 'checkin');
  const card = el('section', 'checkin-card');
  card.append(el('p', 'checkin-kicker', 'optional evening close'));
  card.append(el('h2', 'checkin-title', 'Close the day'));
  const finished = finishedToday(map.allItems);
  card.append(el('p', 'checkin-copy', finished.length ? 'Starlight records these as finished today:' : "Today's record has no finished items."));
  finished.slice(0, 3).forEach((item) => card.append(itemLine(item, ctx.openDetail, false)));
  const tomorrow = new Date(today());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = dueTodayItems(map.allItems, tomorrow).filter((item) => phase(item, tomorrow) !== 'resolved');
  card.append(el('p', 'checkin-evening-next', next.length
    ? `Tomorrow has ${next[0].title} (${next[0].courseCode}) on its calendar.`
    : 'Tomorrow has no dated work in Starlight.'));
  const done = el('button', 'act primary', 'Close for today');
  done.addEventListener('click', ctx.closeCheckin);
  card.append(done);
  root.append(card);
  return root;
}
