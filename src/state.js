// Local overlay on top of the schema. course_map_schema_v2.json stays the source
// of truth for what the semester contains; this owns what Jorge has done with it,
// which is the part the app could not see before.
import { mergeState } from './merge.js';

const KEY = 'starlight.v1';
const storageHealth = { readError: null, writeError: null };

function validateOverlay(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !value.items || typeof value.items !== 'object' || Array.isArray(value.items) ||
      Object.values(value.items).some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('Choose a Starlight progress backup with an items object.');
  }
  return value;
}

export function storageStatus() {
  return { ...storageHealth };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? validateOverlay(JSON.parse(raw)) : {};
    return { items: {}, ...parsed };
  } catch (error) {
    storageHealth.readError = error.message;
    return { items: {} };
  }
}

let store = read();
const listeners = new Set();
// Declared here rather than beside onWrite so commit() can never run before it
// exists.
const writeListeners = new Set();

function commit() {
  try {
    if (storageHealth.readError) throw new Error('Restore a readable backup before saving on this device.');
    localStorage.setItem(KEY, JSON.stringify(store));
    storageHealth.writeError = null;
  } catch (error) {
    storageHealth.writeError = error.message;
  }
  listeners.forEach((fn) => fn());
  writeListeners.forEach((fn) => fn());
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function itemState(id) {
  return store.items[id] || {};
}

/**
 * Every field write is stamped with the moment it was claimed. Nothing local
 * reads these; they exist so a second device can tell a fresh decision from a
 * stale one without a server to ask. See merge.js for how they are used.
 */
function stamp(prev, changes, at) {
  const t = { ...(prev._t || {}) };
  Object.keys(changes).forEach((field) => { t[field] = at; });
  return t;
}

function patch(id, changes, at = Date.now()) {
  const prev = itemState(id);
  store.items[id] = { ...prev, ...changes, _t: stamp(prev, changes, at) };
  commit();
}

// Every time an item's detail is opened. This is the raw material for noticing
// circling: looking at something repeatedly without ever starting it.
export function recordOpen(id, at = Date.now()) {
  const prev = itemState(id).opens || [];
  patch(id, { opens: [...prev, at].slice(-40) });
}

// The days this item was offered as the thing to start. Being repeatedly
// presented and repeatedly passed over is a stronger avoidance signal than
// anything the click stream shows.
export function recordFocusDay(id, at = new Date()) {
  const key = `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
  const prev = itemState(id).focusDays || [];
  if (prev.includes(key)) return;
  patch(id, { focusDays: [...prev, key].slice(-60) });
}

export function markStarted(id, at = Date.now()) {
  if (itemState(id).externalBlock || ['cant-submit', 'absorbed'].includes(itemState(id).resolution?.state)) return;
  patch(id, { startedAt: at, snoozeUntil: null });
}

export function markDone(id, at = Date.now()) {
  if (itemState(id).externalBlock || ['cant-submit', 'absorbed'].includes(itemState(id).resolution?.state)) return;
  patch(id, { doneAt: at, startedAt: itemState(id).startedAt || at, snoozeUntil: null });
}

export function clearProgress(id) {
  patch(id, { doneAt: null, startedAt: null });
}

// "Not today" is a deliberate, expiring deferral rather than a dismissal, so
// nothing can be permanently hidden by accident.
export function snoozeUntilTomorrow(id, from = new Date()) {
  const until = new Date(from);
  until.setDate(until.getDate() + 1);
  until.setHours(4, 0, 0, 0);
  patch(id, { snoozeUntil: until.getTime(), snoozes: (itemState(id).snoozes || 0) + 1 });
}

export function unsnooze(id) {
  patch(id, { snoozeUntil: null });
}

export function isSnoozed(id, at = new Date()) {
  const until = itemState(id).snoozeUntil;
  return Boolean(until && at.getTime() < until);
}

export function setFirstStep(id, text) {
  patch(id, { firstStep: text || null });
}

export function setEffort(id, band) {
  patch(id, { effort: band || null });
}

// A user-entered time can refine the schedule. An unset time remains unknown;
// the day plan must never infer a course deadline from another course.
export function setDueTime(id, hhmm) {
  patch(id, { dueTime: /^\d{1,2}:\d{2}$/.test(hhmm || '') ? hhmm : null });
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function setDateTrust(id, value) {
  if (value === null) return patch(id, { dateTrust: null });
  if (!['unverified', 'verified', 'contradicted'].includes(value?.status)) throw new Error('Choose a date state.');
  if (value.date && !validDate(value.date)) throw new Error('Enter a real calendar date.');
  if (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) throw new Error('Enter a valid time.');
  if (value.status === 'verified' && (!value.date || !value.source?.trim())) throw new Error('Name the source you checked and enter its date.');
  if (value.status === 'contradicted') {
    const sources = value.sources || [];
    if (sources.length < 2 || sources.some(s => !s.source?.trim() || (s.date && !validDate(s.date)) || (s.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)))) {
      throw new Error('Record both sources and their dates or times.');
    }
    if (new Set(sources.map(s => `${s.date || ''}/${s.time || ''}`)).size < 2) throw new Error('The sources agree. Keep this unchecked until you confirm it.');
  }
  patch(id, { dateTrust: structuredClone(value) });
}

export function setResolution(id, value) {
  // A recorded outcome may be corrected, but it must never quietly return a
  // written-off item to the actionable queue.
  if (value === null) throw new Error('Choose a corrected outcome instead of reopening this item.');
  if (!['late-eligible', 'makeup-possible', 'absorbed', 'cant-submit'].includes(value?.state)) throw new Error('Choose what happened to this item.');
  if (value.state === 'late-eligible' && (!Number.isFinite(value.penaltyPercent) || value.penaltyPercent < 0 || value.penaltyPercent > 100)) throw new Error('Enter the late penalty from 0 to 100 percent.');
  if (value.state === 'makeup-possible' && (!value.request?.trim() || !validDate(value.deadline))) throw new Error('Record the request and its deadline.');
  if (value.deadline && !validDate(value.deadline)) throw new Error('Enter a real deadline.');
  if (value.state === 'absorbed' && !value.cushionGroupId) throw new Error('Choose the group whose cushion covers this item.');
  patch(id, { resolution: structuredClone(value) });
}

export function setExternalBlock(id, value) {
  if (value === null) return patch(id, { externalBlock: null });
  if (!value?.reason?.trim() || !value?.waitingOn?.trim() || !validDate(value.followUp)) {
    throw new Error('Record what stopped you, what you are waiting on, and a follow-up date.');
  }
  patch(id, { externalBlock: structuredClone(value) });
}

/**
 * The shape of one particular day: when work can actually start, and the time
 * already claimed by something else. A plan that packs from "now" assumes the
 * day is empty, which it never is.
 *
 * Keyed by date, because "I cannot start until 2" is true of a Monday and not of
 * the week. Old days are pruned so last month's lunch cannot quietly shape this
 * morning.
 */
const DAY_SHAPE_KEEP_DAYS = 14;

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayShape(d = new Date()) {
  const shape = (store.days || {})[dayKey(d)] || {};
  return { startAt: shape.startAt || null, busy: shape.busy || [], first: shape.first || null };
}

function patchDay(d, changes) {
  const key = dayKey(d);
  const cutoff = new Date(d);
  cutoff.setDate(cutoff.getDate() - DAY_SHAPE_KEEP_DAYS);
  const keep = dayKey(cutoff);

  const days = {};
  Object.entries(store.days || {}).forEach(([k, v]) => {
    if (k >= keep) days[k] = v;
  });
  const prev = days[key] || {};
  days[key] = {
    startAt: null, busy: [], first: null, ...prev, ...changes,
    _t: stamp(prev, changes, Date.now())
  };

  store = { ...store, days };
  commit();
}

export function setDayStart(hhmm, d = new Date()) {
  patchDay(d, { startAt: /^\d{1,2}:\d{2}$/.test(hhmm || '') ? hhmm : null });
}

export function addBusy(block, d = new Date()) {
  const busy = dayShape(d).busy;
  patchDay(d, {
    busy: [...busy, { id: `b${Date.now().toString(36)}`, ...block }].sort((a, b) => a.start.localeCompare(b.start))
  });
}

/**
 * The one thing you have decided to start with today. Deadline order is the right
 * default and the wrong rule: the assignment you believe you can actually knock
 * out is often the one worth opening first, and an order you cannot override is
 * an order you will ignore.
 */
export function setDayFirst(itemId, d = new Date()) {
  patchDay(d, { first: itemId || null });
}

export function removeBusy(id, d = new Date()) {
  patchDay(d, { busy: dayShape(d).busy.filter((b) => b.id !== id) });
}

/**
 * Pomodoros actually completed, per item. This is what makes the plan honest
 * across days: do two of an assignment's four today and tomorrow's plan packs
 * the two that are left, not four again.
 *
 * Deliberately separate from doneAt. Finishing the work and declaring the
 * assignment submitted are different claims, and undoing one must not erase the
 * other.
 */
export function pomodorosDone(id) {
  return itemState(id).pomosDone || 0;
}

export function completePomodoro(id, at = Date.now()) {
  patch(id, {
    pomosDone: pomodorosDone(id) + 1,
    // Working on it is what starting means. There is no separate act.
    startedAt: itemState(id).startedAt || at,
    lastPomodoroAt: at
  });
}

export function undoPomodoro(id) {
  patch(id, { pomosDone: Math.max(0, pomodorosDone(id) - 1) });
}

/**
 * The running timer, kept in storage so a reload or a closed laptop does not
 * quietly lose the pomodoro you were in the middle of. While running only the
 * end time is stored, so a tick costs nothing; pausing writes what is left.
 */
export function timerState() {
  return store.timer || null;
}

export function setTimer(next) {
  store.timer = next;
  commit();
}

export function clearTimer() {
  store.timer = null;
  commit();
}

export function soundOn() {
  return store.sound !== false;
}

export function setSound(on) {
  store.sound = Boolean(on);
  commit();
}

export function lastVisit() {
  return store.lastVisit || null;
}

export function recordVisit(at = Date.now()) {
  store.lastVisit = at;
  commit();
}

// Progress lives in one browser's storage, which is a single point of loss for a
// whole semester. These make it portable.
export function exportState() {
  return JSON.stringify({ ...store, exportedAt: new Date().toISOString() }, null, 2);
}

export function importState(json) {
  const incoming = validateOverlay(JSON.parse(json));
  // Imports go through the same merge as a sync. A backup is just another copy
  // of the overlay, so restoring an old one should not silently undo work done
  // since it was taken.
  store = mergeState(store, incoming);
  storageHealth.readError = null;
  commit();
}

/** The overlay as it stands, for pushing to the gist. */
export function snapshot() {
  return store;
}

/**
 * Fold a copy fetched from the gist into this device's copy. Returns whether
 * anything actually changed, so a pull that brings nothing new does not trigger
 * a repaint or a push back.
 */
export function applyRemote(remote) {
  const next = mergeState(store, remote || {});
  if (JSON.stringify(next) === JSON.stringify(store)) return false;
  store = next;
  commit();
  return true;
}

/**
 * Called after every write. Separate from onChange, which the UI uses to
 * repaint: sync needs to know that storage changed, not that pixels did, and
 * wiring it through the UI's channel would push on every render.
 */
export function onWrite(fn) {
  writeListeners.add(fn);
  return () => writeListeners.delete(fn);
}
