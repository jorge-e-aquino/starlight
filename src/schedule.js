import { now as rightNow, today, formatClock } from './clock.js';
import { itemState, isSnoozed, dayShape, pomodorosDone } from './state.js';
import { effortBand, phase, isDone, liveItems, daysUntil } from './signals.js';
import { isExam } from './exams.js';

/**
 * The schema records dates, and only some items carry a time. A day plan needs
 * moments, so a known time is used as given, and an unknown time stays unknown:
 * those items order after timed work instead of borrowing a deadline the
 * schedule never had.
 */
export const EFFORT_MINUTES = { quick: 30, medium: 90, deep: 180 };

/**
 * The plan is measured in pomodoros rather than in arbitrary chunks. Pomofocus
 * cannot be deep linked (its only URL parameter opens a modal), so the way to
 * make an external timer usable is to build the plan out of the intervals that
 * timer already defaults to. Nothing to configure: open it and press start.
 */
export const POMODORO = 25;
export const SHORT_BREAK = 5;
export const LONG_BREAK = 15;
export const POMOS_BEFORE_LONG_BREAK = 4;
export const WRAP_UP = 10; // closing out an item whose pomodoros are all spent
export const POMOFOCUS_URL = 'https://pomofocus.io';

export const ADVISORY_CAP = 180; // ceiling on a plan built from what is in range
const SLOT = 5; // plans start on a clean 5 minute boundary

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function roundUp(date, step = SLOT) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const over = d.getMinutes() % step;
  if (over) d.setMinutes(d.getMinutes() + (step - over));
  return d;
}

const HHMM = /^\d{1,2}:\d{2}$/;

/**
 * Three sources, in order of authority: a time you set on the item, the time the
 * schema carries, and then nothing. The old end of day fallback invented a
 * deadline the schedule never had, and a plan that measures against an invented
 * deadline reports lateness that did not happen. Unknown means unknown.
 */
export function dueTimeFor(item) {
  const set = itemState(item.id).dueTime;
  if (HHMM.test(set || '')) return set;
  if (HHMM.test(item.time || '')) return item.time;
  return null;
}

// Whether the time is actually known. A schema time carrying timeConfirmed:
// false is a placeholder and still reads as unknown.
export function hasDueTime(item) {
  return Boolean(dueTimeFor(item));
}

// True when the item's own time is set, rather than inherited from a correction.
export function schemaTime(item) {
  return HHMM.test(item.time || '') ? item.time : null;
}

// The moment an item is actually due, as opposed to the day it lands on.
// Unknown when the time is unknown; callers treat that as "no verdict".
export function dueAt(item) {
  const time = dueTimeFor(item);
  if (!item.dateObj || !time) return null;
  const [h, m] = time.split(':').map(Number);
  const at = new Date(item.dateObj);
  at.setHours(h, m, 0, 0);
  return at;
}

export function budgetFor(item) {
  return EFFORT_MINUTES[estimateBand(item)] ?? EFFORT_MINUTES.medium;
}

// The ECON coursework baseline comes from actual use. It changes schedule
// estimates only; the urgency window still follows the regular effort model.
export function estimateBand(item) {
  const chosen = itemState(item.id).effort;
  if (chosen && EFFORT_MINUTES[chosen]) return chosen;
  if (item.courseId === 'econ2105' && item.group === 'econ-coursework') return 'quick';
  return effortBand(item).id;
}

// How many pomodoros an item is worth. Splitting is not decoration: a single
// "3 hours on the exam" block is the shape of thing that never gets started.
export function pomodorosFor(item) {
  return Math.max(1, Math.round(budgetFor(item) / POMODORO));
}

// What is left to schedule. Completed pomodoros are durable, so a day that ended
// halfway through an assignment is packed from where it actually stopped.
export function pomodorosLeft(item) {
  return Math.max(0, pomodorosFor(item) - pomodorosDone(item.id));
}

export function toTimeOnDay(at, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(at);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * The first moment at or after `from` where `minutes` of work fits without
 * running into anything already claimed. Each step lands on the end of the block
 * it collided with, so this walks forward and terminates.
 */
function firstFree(from, minutes, busy) {
  let start = new Date(from);
  for (let guard = 0; guard <= busy.length; guard++) {
    const hit = busy.find((b) => start < b.end && addMinutes(start, minutes) > b.start);
    if (!hit) return start;
    start = new Date(hit.end);
  }
  return start;
}

export function dueTodayItems(items, at = rightNow()) {
  return items.filter(
    (it) => it.type !== 'standing' && it.dateObj && sameDay(it.dateObj, at) && !isDone(it)
  );
}

export function finishedToday(items, at = rightNow()) {
  return items.filter((it) => {
    const done = itemState(it.id).doneAt;
    return done && sameDay(new Date(done), at);
  });
}

/**
 * The day, packed. Earliest deadline first, because that is the ordering that
 * actually meets deadlines; ties broken toward the cheaper thing, because an
 * early finish is what makes the rest of the plan credible.
 */
/**
 * When work can actually begin and what is already spoken for, resolved to real
 * moments on this day. Anything already finished is dropped: the past cannot
 * block the plan.
 */
export function resolveDayShape(at = rightNow()) {
  const shape = dayShape(at);
  const earliest = roundUp(at);
  const wanted = shape.startAt ? toTimeOnDay(at, shape.startAt) : null;
  return {
    first: shape.first,
    startAt: shape.startAt,
    // A start time that has already gone by is not a constraint any more.
    start: wanted && wanted > earliest ? wanted : earliest,
    startDeferred: Boolean(wanted && wanted > earliest),
    busy: shape.busy
      .map((b) => ({ ...b, start: toTimeOnDay(at, b.start), end: toTimeOnDay(at, b.end) }))
      .filter((b) => b.end > b.start && b.end > earliest)
      .sort((a, b) => a.start - b.start)
  };
}

// Deadline first is what meets deadlines, and ties break toward the cheaper
// thing. A chosen item overrides all of it and everything else keeps its order
// behind it, which is what makes the result still make sense from there.
function orderQueue(items, firstId) {
  // Known times order by their moment. Unknown times carry no deadline to
  // measure, so they follow the timed work rather than pretending to be 23:59.
  const byDeadline = [...items].sort((a, b) => {
    const ta = dueAt(a);
    const tb = dueAt(b);
    if (ta === null && tb === null) return budgetFor(a) - budgetFor(b) || a.schemaIndex - b.schemaIndex;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb || budgetFor(a) - budgetFor(b) || a.schemaIndex - b.schemaIndex;
  });
  if (!firstId) return byDeadline;
  const chosen = byDeadline.filter((it) => it.id === firstId);
  return chosen.length ? [...chosen, ...byDeadline.filter((it) => it.id !== firstId)] : byDeadline;
}

function packQueue(queue, shape) {
  const { start, busy } = shape;
  const blocks = [];
  let cursor = new Date(start);
  let sinceLongBreak = 0;

  queue.forEach((item) => {
    const done = pomodorosDone(item.id);
    const left = pomodorosLeft(item);
    const total = pomodorosFor(item);

    // Every pomodoro is spent but the item was never submitted. It cannot just
    // disappear from the plan, so it gets one short block whose whole job is to
    // close it out.
    if (left === 0) {
      const wrapAt = firstFree(cursor, WRAP_UP, busy);
      blocks.push({
        kind: 'work',
        wrapUp: true,
        item,
        key: `${item.id}#wrap`,
        minutes: WRAP_UP,
        part: total,
        parts: total,
        done,
        start: wrapAt,
        end: addMinutes(wrapAt, WRAP_UP)
      });
      cursor = addMinutes(wrapAt, WRAP_UP);
      return;
    }

    for (let n = 1; n <= left; n++) {
      if (blocks.length) {
        const long = sinceLongBreak >= POMOS_BEFORE_LONG_BREAK;
        const minutes = long ? LONG_BREAK : SHORT_BREAK;
        const restAt = firstFree(cursor, minutes, busy);
        // If something already claimed is sitting in the way, that period is the
        // break. Adding another one on top of it would be scheduling rest twice.
        if (restAt.getTime() === cursor.getTime()) {
          blocks.push({
            kind: 'break',
            long,
            key: `break#${blocks.length}`,
            minutes,
            start: restAt,
            end: addMinutes(restAt, minutes)
          });
          cursor = addMinutes(restAt, minutes);
        }
        if (long) sinceLongBreak = 0;
      }

      const workAt = firstFree(cursor, POMODORO, busy);
      if (workAt > cursor) sinceLongBreak = 0; // being interrupted counts as rest
      blocks.push({
        kind: 'work',
        item,
        // Keyed by absolute position in the item, not by position in today's
        // plan, so a running timer still points at the same pomodoro after the
        // schedule re-flows around it.
        key: `${item.id}#${done + n}`,
        minutes: POMODORO,
        part: done + n,
        parts: total,
        done,
        start: workAt,
        end: addMinutes(workAt, POMODORO)
      });
      cursor = addMinutes(workAt, POMODORO);
      sinceLongBreak += 1;
    }
  });

  return { blocks, finishAt: cursor };
}

function summarize(queue, blocks, at) {
  return queue.map((item) => {
    const mine = blocks.filter((b) => b.kind === 'work' && b.item.id === item.id);
    const deadline = dueAt(item);
    const end = mine[mine.length - 1].end;
    return {
      item,
      start: mine[0].start,
      end,
      parts: mine.length,
      minutes: mine.reduce((sum, b) => sum + b.minutes, 0),
      dueAt: deadline,
      // Already past its time is a different fact from "the plan runs long", and
      // conflating them would let the app tell him he is behind when he is not.
      alreadyPast: Boolean(deadline && deadline < at),
      overBy: deadline ? Math.max(0, Math.round((end - deadline) / 60000)) : 0
    };
  });
}

export function buildDayPlan(allItems, at = rightNow()) {
  const due = dueTodayItems(allItems, at);
  const examEvents = due.filter(isExam);
  const coursework = due.filter((it) => !isExam(it) && phase(it, today()) !== 'resolved');
  const expired = coursework.filter((it) => { const deadline = dueAt(it); return deadline && deadline < at; });
  const available = coursework.filter((it) => !expired.includes(it));
  const setAside = available.filter((it) => isSnoozed(it.id));
  const active = available.filter((it) => !isSnoozed(it.id));
  const stillOpen = allItems.filter((it) => phase(it, today()) === 'overdue');
  const shape = resolveDayShape(at);
  const examBusy = examEvents.flatMap((item) => {
    const dossier = itemState(item.id).examDossier;
    if (!dossier?.confirmed || !dossier.startTime || !dossier.durationMinutes) return [];
    const start = toTimeOnDay(at, dossier.startTime);
    const end = addMinutes(start, dossier.durationMinutes);
    return end > at ? [{ id: `exam:${item.id}`, label: `${item.courseCode} · ${item.title}`, start, end, fixed: true }] : [];
  });
  const packingShape = { ...shape, busy: [...shape.busy, ...examBusy].sort((a, b) => a.start - b.start) };

  let mode = 'due-today';
  let queue = orderQueue(active, shape.first);

  // Nothing due today is common and is not an empty screen. Fall back to a plan
  // built from what is in range, capped, and labelled as a suggestion rather
  // than as deadlines, so the two can never be confused.
  if (!queue.length) {
    const live = liveItems(allItems, today()).filter((it) => !isExam(it) && !expired.includes(it));
    // A chosen item leads even here, and is never the one the cap drops.
    const ordered = shape.first
      ? [...live.filter((it) => it.id === shape.first), ...live.filter((it) => it.id !== shape.first)]
      : live;
    const picked = [];
    let budget = 0;
    ordered.forEach((it) => {
      if (picked.length && budget + budgetFor(it) > ADVISORY_CAP) return;
      picked.push(it);
      budget += budgetFor(it);
    });
    queue = picked;
    mode = picked.length ? 'in-range' : 'clear';
  }

  const { start } = shape;
  const { blocks, finishAt } = packQueue(queue, packingShape);

  // Claimed time is shown in the timeline too, so the day reads as one continuous
  // thing rather than as work with unexplained gaps in it.
  const busyRows = packingShape.busy
    .filter((b) => b.start < finishAt && b.end > start)
    .map((b) => {
      const from = b.start < start ? start : b.start;
      return {
        kind: 'busy',
        label: b.label,
        id: b.id,
        fixed: Boolean(b.fixed),
        start: from,
        end: b.end,
        minutes: Math.round((b.end - from) / 60000)
      };
    });

  const rows = summarize(queue, blocks, at);
  const overflow = rows.filter((r) => r.overBy > 0);
  const deadlines = rows.map((r) => r.dueAt).filter(Boolean);
  const chosen = queue.find((it) => it.id === shape.first) || null;

  // Whether the choice is what costs the deadline is a question of fact, so it
  // gets answered by actually packing the day without it rather than by
  // insinuating that it might be.
  let costOfChoosing = false;
  if (chosen && overflow.length && mode === 'due-today') {
    const plain = packQueue(orderQueue(active, null), packingShape);
    costOfChoosing = summarize(orderQueue(active, null), plain.blocks, at).every((r) => r.overBy === 0);
  }

  return {
    mode,
    at,
    start,
    shape,
    chosen,
    costOfChoosing,
    blocks,
    timeline: [...blocks, ...busyRows].sort((a, b) => a.start - b.start),
    pomodoros: blocks.filter((b) => b.kind === 'work').length,
    rows,
    queue,
    setAside,
    expired,
    examEvents,
    stillOpen,
    finished: finishedToday(allItems, at),
    finishAt,
    workMinutes: blocks.filter((b) => b.kind === 'work').reduce((s, b) => s + b.minutes, 0),
    breakMinutes: blocks.filter((b) => b.kind === 'break').reduce((s, b) => s + b.minutes, 0),
    advisory: mode === 'in-range',
    fits: overflow.length === 0,
    overflow,
    overshootMinutes: overflow.reduce((max, r) => Math.max(max, r.overBy), 0),
    lastDeadline: deadlines.length ? new Date(Math.max(...deadlines)) : null,
    assumedTimes: rows.some((r) => !hasDueTime(r.item))
  };
}

// Where you are in the plan. The first block starts on the next clean 5 minute
// boundary, so for part of every minute nothing strictly contains now; the block
// you are about to be in is the honest answer there, not nothing.
export function currentBlock(plan, at = rightNow()) {
  return plan.timeline.find((b) => at < b.end) || null;
}

// "12:40 – 1:25 PM" rather than "12:40 PM – 1:25 PM": the meridiem is only worth
// saying twice when it actually changes inside the block.
export function rangeLabel(start, end) {
  const a = formatClock(start);
  const b = formatClock(end);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${sameHalf ? a.slice(0, -3) : a} – ${b}`;
}

export function humanMinutes(total) {
  const mins = Math.max(0, Math.round(total));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(date) {
  return formatClock(date);
}

// The known due moment, or an empty string when the time is unknown. Callers
// render "time unknown" rather than a filled-in placeholder.
export function formatDueTime(item) {
  const time = dueTimeFor(item);
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return formatClock(d);
}

export function nextDueItem(items, at = today()) {
  return items
    .filter((it) => it.type !== 'standing' && it.dateObj && !isDone(it) && daysUntil(it.dateObj, at) > 0)
    .sort((a, b) => a.dateObj - b.dateObj)[0] || null;
}
