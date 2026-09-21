// Device preferences never enter the progress overlay or its sync/export path.
const KEY = 'starlight.attention.v1';
export const GROUNDS = ['lavender', 'paper', 'slate'];
export const SCHEMES = ['system', 'light', 'dark'];

export function cleanPreferences(value = {}) {
  return {
    ground: GROUNDS.includes(value.ground) ? value.ground : 'lavender',
    scheme: SCHEMES.includes(value.scheme) ? value.scheme : 'system'
  };
}

export function readPreferences(storage = globalThis.localStorage) {
  try { return cleanPreferences(JSON.parse(storage.getItem(KEY) || '{}')); }
  catch { return cleanPreferences(); }
}

export function savePreferences(value, storage = globalThis.localStorage) {
  const next = cleanPreferences(value);
  try { storage.setItem(KEY, JSON.stringify(next)); } catch { /* usable for this visit */ }
  return next;
}

export function recoveryChoice(overdue, lastVisit, now = new Date()) {
  if (!lastVisit || (now - new Date(lastVisit)) < 2 * 86400000 || overdue.length < 2) return null;
  const eligible = overdue.filter((item) => {
    const state = item.resolution?.state;
    return state === 'late-eligible' || state === 'makeup-possible';
  });
  const chosen = eligible[0] || overdue[0];
  return { chosen, rest: overdue.filter((item) => item.id !== chosen.id), knownRecoverable: eligible.length > 0 };
}
