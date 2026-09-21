/**
 * Merging two devices' progress into one truth.
 *
 * The phone and the laptop each hold a complete copy of the overlay and both can
 * write while the other is offline. There is no server to arbitrate, so the merge
 * has to be decidable from the two copies alone, and it has to be the same answer
 * whichever side runs it. That means: no clock comparison between devices beyond
 * the stamps already written into the data, and no rule that depends on which
 * copy arrived first.
 *
 * Two kinds of field, because they fail differently:
 *
 * LOGS are things that happened. They union when a user imports a full local
 * backup, so restoring a file cannot erase an observation. Current gist sync
 * strips avoidance logs before transmission; each device keeps its own traces.
 *
 * DECISIONS are claims about the current state. Two devices disagreeing means one
 * of them is stale, so the most recent claim wins outright. Last-write-wins is
 * the right rule here specifically because it respects undo: marking something
 * done and then clearing it is two claims, and the clear has to be able to beat
 * the mark. A "take whichever is non-null" rule would quietly resurrect work you
 * deliberately un-marked, which is worse than losing it.
 */

// Observation logs. Value is the cap the writer already applies, reapplied here
// so a merge of two full logs cannot grow past what either side would keep.
const LOG_FIELDS = { opens: 40, focusDays: 60 };

// Never synced. A running pomodoro belongs to the device you are sitting at, and
// the sound setting is a property of the room you are in, not of the semester.
export const DEVICE_LOCAL = ['timer', 'sound'];

const stamps = (obj) => (obj && obj._t) || {};

function canonical(value) {
  return JSON.stringify(value, (_, current) => current && typeof current === 'object' && !Array.isArray(current)
    ? Object.keys(current).sort().reduce((result, key) => { result[key] = current[key]; return result; }, {})
    : current);
}

// A timestamp tie carries no ordering evidence. Use one stable total order on
// both devices; an explicit clear wins a tie and missing legacy fields lose it.
function tieKey(value) {
  if (value === undefined) return '0';
  if (value === null) return '2';
  return `1${canonical(value)}`;
}

/**
 * One field of one record. `at` is the moment that side last claimed this field;
 * absent means the write predates stamping, which loses to any stamped write.
 */
function pickField(field, a, aAt, b, bAt) {
  const cap = LOG_FIELDS[field];
  if (cap) {
    const seen = new Set();
    const out = [];
    // Later entries are the ones worth keeping when the union overflows, so walk
    // from the end and take the last `cap`.
    for (const v of [...toArray(a), ...toArray(b)].sort(compareLogEntries)) {
      const key = canonical(v);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
    return out.slice(-cap);
  }
  if ((aAt || 0) !== (bAt || 0)) return (bAt || 0) > (aAt || 0) ? b : a;
  return tieKey(b) > tieKey(a) ? b : a;
}

function toArray(v) {
  return Array.isArray(v) ? v : [];
}

// `opens` holds epoch numbers and `focusDays` holds "Y-M-D" strings. Numbers sort
// numerically, day keys sort lexically only if zero padded, which they are not
// ("2026-9-7" vs "2026-10-7"), so compare them by the date they denote.
function compareLogEntries(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return dayKeyValue(a) - dayKeyValue(b) || (tieKey(a) > tieKey(b) ? 1 : tieKey(a) < tieKey(b) ? -1 : 0);
}

function dayKeyValue(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const time = Number.isFinite(y) ? new Date(y, m, d).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

/** One record (an item, or one day's shape), merged field by field. */
export function mergeRecord(a = {}, b = {}) {
  const aAt = stamps(a);
  const bAt = stamps(b);
  const out = {};
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  fields.delete('_t');

  fields.forEach((f) => {
    out[f] = pickField(f, a[f], aAt[f], b[f], bAt[f]);
  });

  // Carry the winning stamps forward, or a third device merging against this
  // result would treat every field as unstamped and lose to anything.
  const t = {};
  new Set([...Object.keys(aAt), ...Object.keys(bAt)]).forEach((f) => {
    t[f] = Math.max(aAt[f] || 0, bAt[f] || 0);
  });
  if (Object.keys(t).length) out._t = t;
  return out;
}

function mergeCollection(a = {}, b = {}) {
  const out = {};
  new Set([...Object.keys(a), ...Object.keys(b)]).forEach((k) => {
    out[k] = mergeRecord(a[k], b[k]);
  });
  return out;
}

/**
 * Two whole overlays into one. Commutative and idempotent: merge(a,b) equals
 * merge(b,a), and merging a result back into either side changes nothing. That
 * is what lets both devices sync in any order and still land on the same state.
 */
export function mergeState(local = {}, remote = {}) {
  const merged = {
    ...mergeRecord(local, remote),
    items: mergeCollection(local.items, remote.items),
    days: mergeCollection(local.days, remote.days),
    // Fieldwork records merge like items: every field in a contact or a
    // finding is a stamped decision, so the same rules apply field by field.
    contacts: mergeCollection(local.contacts, remote.contacts),
    findings: mergeCollection(local.findings, remote.findings),
    lastVisit: Math.max(local.lastVisit || 0, remote.lastVisit || 0) || null
  };
  // The local device's own timer and sound survive the merge untouched.
  DEVICE_LOCAL.forEach((k) => {
    if (k in local) merged[k] = local[k];
    else delete merged[k];
  });
  return merged;
}
