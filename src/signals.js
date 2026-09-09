import { today } from './clock.js';
import { itemState, isSnoozed } from './state.js';

export const DAY_MS = 86400000;

// The schema says what things are worth, never how long they take. These are
// heuristic defaults from type and weight, adjustable per item, and labelled as
// estimates everywhere they appear.
export const EFFORT = {
  quick: { id: 'quick', label: 'Quick', hint: '15 to 30 min', lead: 7, bonus: 18 },
  medium: { id: 'medium', label: 'Medium', hint: '1 to 2 hours', lead: 14, bonus: 8 },
  deep: { id: 'deep', label: 'Deep', hint: 'a few hours', lead: 25, bonus: 0 }
};

export function effortBand(item) {
  const override = itemState(item.id).effort;
  if (override && EFFORT[override]) return EFFORT[override];
  if (item.type === 'exam' || item.type === 'final') return EFFORT.deep;
  if (item.weightPercent != null) {
    if (item.weightPercent >= 10) return EFFORT.deep;
    return item.weightPercent >= 4 ? EFFORT.medium : EFFORT.quick;
  }
  const pts = item.points ?? 0;
  if (pts >= 40) return EFFORT.deep;
  return pts >= 6 ? EFFORT.medium : EFFORT.quick;
}

export function daysUntil(date, from = today()) {
  return Math.round((date - from) / DAY_MS);
}

// Local progress wins over the schema's status, so marking something submitted
// takes effect immediately without editing the JSON.
export function effectiveStatus(item) {
  const s = itemState(item.id);
  if (s.doneAt) return 'done';
  // Local progress leads the schema forward, never backward. The schema calling
  // something done is a firmer statement than a local "I opened this once", so a
  // stale startedAt must not keep a submitted item looking unfinished.
  if (item.status === 'done') return 'done';
  if (s.startedAt) return 'started';
  return item.status;
}

export function isDone(item) {
  return effectiveStatus(item) === 'done';
}

// What kind of completion this item actually has, so the button never says
// "done" where "submitted" or "taken" is the real word.
export function completionVerb(item) {
  if (item.type === 'exam' || item.type === 'final') return 'Taken';
  if (item.type === 'standing') return 'Logged';
  return 'Submitted';
}

/**
 * Where an item sits relative to now.
 * ahead    not yet worth thinking about, deliberately out of sight
 * live     inside its actionable window
 * overdue  past its date and not marked complete
 */
export function phase(item, now = today()) {
  if (item.type === 'standing') return 'standing';
  if (isDone(item)) return 'done';
  if (!item.dateObj) return 'undated';
  const left = daysUntil(item.dateObj, now);
  if (left < 0) return 'overdue';
  return left <= effortBand(item).lead ? 'live' : 'ahead';
}

function urgencyScore(daysLeft) {
  if (daysLeft <= 1) return 100;
  if (daysLeft === 2) return 82;
  if (daysLeft === 3) return 68;
  if (daysLeft <= 5) return 54;
  if (daysLeft <= 7) return 42;
  if (daysLeft <= 10) return 30;
  if (daysLeft <= 14) return 20;
  return 12;
}

function stakesScore(item) {
  if (item.type === 'final') return 14;
  if (item.type === 'exam') return 10;
  if ((item.weightPercent ?? 0) >= 8) return 8;
  return (item.points ?? 0) >= 25 ? 5 : 0;
}

// Deliberately favours things that are cheap to start. For someone who stalls on
// activation energy, the best next item is rarely the biggest one.
export function focusScore(item, now = today()) {
  return (
    urgencyScore(daysUntil(item.dateObj, now)) +
    effortBand(item).bonus +
    stakesScore(item) +
    (itemState(item.id).startedAt ? 12 : 0)
  );
}

export function liveItems(items, now = today()) {
  return items
    .filter((it) => phase(it, now) === 'live' && !isSnoozed(it.id))
    .sort((a, b) => focusScore(b, now) - focusScore(a, now) || a.schemaIndex - b.schemaIndex);
}

// In range but deliberately deferred. Tracked separately so the empty state can
// never claim there is nothing to do when there is something set aside.
export function setAside(items, now = today()) {
  return items.filter((it) => phase(it, now) === 'live' && isSnoozed(it.id));
}

export function overdueItems(items, now = today()) {
  return items
    .filter((it) => phase(it, now) === 'overdue')
    .sort((a, b) => a.dateObj - b.dateObj);
}

// The next heavy thing sitting beyond the live window. Surfaced as a single
// quiet line so it is known about without being on the working list.
export function horizonItem(items, now = today()) {
  return items
    .filter((it) => phase(it, now) === 'ahead' && stakesScore(it) >= 10)
    .sort((a, b) => a.dateObj - b.dateObj)[0] || null;
}

/**
 * How present an item should look on the map, 0 to 1. Graded rather than binary:
 * being outside the actionable window is not the same as being irrelevant, so
 * something a couple of weeks out stays clearly readable and only genuinely
 * distant work sits back.
 */
export function presence(item, now = today()) {
  const where = phase(item, now);
  if (where === 'live' || where === 'overdue' || where === 'done') return 1;
  if (!item.dateObj) return 0.8;
  const out = daysUntil(item.dateObj, now);
  if (out <= 21) return 0.82;
  if (out <= 45) return 0.64;
  return 0.5;
}

export function pickFocus(items, now = today()) {
  return liveItems(items, now)[0] || null;
}

// Why this item is first, in plain factual terms. The app should never ask for
// trust it has not earned.
export function focusReason(item, all, now = today()) {
  const left = daysUntil(item.dateObj, now);
  const band = effortBand(item);
  const when = left <= 0 ? 'due today' : left === 1 ? 'due tomorrow' : `due in ${left} days`;
  const live = liveItems(all, now);
  let why;
  if (live.length === 1) why = 'the only thing in range';
  else if (band.id === 'quick') why = 'cheapest thing in range to start';
  else if (live[1] && daysUntil(live[1].dateObj, now) > left) why = 'closest deadline in range';
  else why = 'biggest thing in range';
  return { when, effort: band.hint, why };
}

/**
 * Avoidance, from three independent traces: how many separate days this was
 * offered as the thing to start, how often it was set aside, and how often it
 * was opened and read without beginning. Reported as an observation with a
 * count, never as a verdict, because noticing is the useful part.
 */
export function avoidance(item) {
  const s = itemState(item.id);
  if (s.startedAt || s.doneAt) return null;

  const focusDays = (s.focusDays || []).length;
  const snoozes = s.snoozes || 0;
  const opens = (s.opens || []).length;
  const openDays = new Set((s.opens || []).map((t) => new Date(t).toDateString())).size;

  const passedOver = focusDays >= 3;
  const setAsideOften = snoozes >= 2;
  const readNotStarted = opens >= 3 && openDays >= 2;
  if (!passedOver && !setAsideOften && !readNotStarted) return null;

  // One sentence, strongest trace first. Piling all three on would read as a
  // case being built against him.
  let sentence;
  if (passedOver) {
    sentence = `This has been your start here item on ${focusDays} separate days and has not been started.`;
  } else if (setAsideOften) {
    sentence = `You have set this aside ${snoozes} times.`;
  } else {
    sentence = `You have opened this ${opens} times across ${openDays} days without starting it.`;
  }

  return { focusDays, snoozes, opens, openDays, sentence };
}

export function avoidanceItems(items, now = today()) {
  return items
    .map((item) => ({ item, signal: avoidance(item) }))
    .filter((row) => row.signal && phase(row.item, now) !== 'done')
    .sort((a, b) => b.signal.focusDays - a.signal.focusDays || b.signal.opens - a.signal.opens);
}

// Evidence of movement, not a streak: a plain list of what actually got
// finished, with nothing that breaks or resets if he stays away.
export function recentlyFinished(items, withinDays = 14) {
  const cutoff = Date.now() - withinDays * DAY_MS;
  return items
    .filter((it) => {
      const at = itemState(it.id).doneAt;
      return at && at >= cutoff;
    })
    .sort((a, b) => itemState(b.id).doneAt - itemState(a.id).doneAt);
}

export function doneAt(item) {
  return itemState(item.id).doneAt || null;
}

/**
 * What moved while the app was closed. Built for irregular use: the answer to
 * "I have not opened this in nine days" should be orientation, not a scolding.
 */
export function awayReport(items, since, now = today()) {
  if (!since) return null;
  const gapDays = Math.floor((now - new Date(since)) / DAY_MS);
  if (gapDays < 2) return null;

  const then = new Date(since);
  then.setHours(12, 0, 0, 0);

  const cameIntoRange = [];
  const passed = [];

  items.forEach((item) => {
    if (item.type === 'standing' || !item.dateObj || isDone(item)) return;
    const before = phase(item, then);
    const after = phase(item, now);
    if (before === 'ahead' && after === 'live') cameIntoRange.push(item);
    if (before !== 'overdue' && after === 'overdue') passed.push(item);
  });

  if (!cameIntoRange.length && !passed.length) return null;
  return { gapDays, cameIntoRange, passed };
}
