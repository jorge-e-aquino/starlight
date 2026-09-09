/**
 * Sync over a secret GitHub gist.
 *
 * There is no Starlight server and this is deliberate: the thing being synced is
 * a record of what one person has and has not gotten around to, including how
 * many times they opened an assignment without starting it. That is not data to
 * put on someone else's box for the sake of a feature. A secret gist is storage
 * the user already owns, already trusts, and can read or delete without asking
 * anyone.
 *
 * The token is entered per device and kept in localStorage, deliberately apart
 * from the synced overlay so it is never pushed, never exported, and never
 * present in the deployed bundle. A gist-scoped token is the whole blast radius
 * if a device is lost, and it is revocable from GitHub settings.
 */
import { snapshot, applyRemote, onWrite } from './state.js';

const CREDS_KEY = 'starlight.sync.v1'; // { token, gistId } — never synced
const FILENAME = 'starlight-progress.json';
const API = 'https://api.github.com/gists';

const PUSH_DEBOUNCE = 4000; // a burst of clicks is one push
const POLL_MS = 120000; // background drift check when the tab is left open

let creds = readCreds();
let status = { state: creds.token ? 'idle' : 'off', at: null, error: null };
let lastPushed = null; // serialized copy, so an unchanged state does not push
let pushTimer = null;
let pollTimer = null;
let inFlight = false;
const listeners = new Set();

/**
 * Serialize with keys in a fixed order. Two devices that did the same work in a
 * different order hold identical state under different key insertion orders, and
 * comparing the raw text would read that as a change and write the gist again
 * for nothing. Sorting also means the gist's own revision history shows real
 * edits rather than reshuffles.
 */
function canonical(value) {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((o, k) => ((o[k] = v[k]), o), {})
      : v
  );
}

function readCreds() {
  try {
    return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function isConfigured() {
  return Boolean(creds.token && creds.gistId);
}

export function credentials() {
  return { ...creds };
}

export function syncStatus() {
  return { ...status };
}

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setStatus(state, extra = {}) {
  status = { ...status, state, error: null, ...extra };
  listeners.forEach((fn) => fn(status));
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${creds.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    }
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(describe(res.status, body));
  }
  return res.json();
}

// Failures here get read on a phone, at a moment when the app is supposed to be
// reducing friction, so they say what to do rather than what went wrong.
function describe(code, body) {
  if (code === 401) return 'That token was rejected. It may have been revoked, or pasted with a character missing.';
  if (code === 403 && /rate limit/i.test(body)) return 'GitHub is rate limiting this token. It will sync again shortly.';
  if (code === 403) return 'That token does not have gist access.';
  if (code === 404) return 'That gist could not be found with this token.';
  if (code >= 500) return 'GitHub is having trouble. Your progress is saved on this device.';
  return `GitHub returned ${code}.`;
}

/** Create the gist this device will sync through. Returns its id. */
export async function createGist(token) {
  creds = { ...creds, token };
  const gist = await api('', {
    method: 'POST',
    body: JSON.stringify({
      description: 'Starlight progress. Private to you; safe to delete to reset sync.',
      public: false,
      files: { [FILENAME]: { content: canonical(snapshot()) } }
    })
  });
  return gist.id;
}

export function saveCredentials({ token, gistId }) {
  creds = { token: token || null, gistId: gistId || null };
  try {
    localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
  } catch {
    // Storage blocked. Sync will work for this session and ask again next time.
  }
  setStatus(isConfigured() ? 'idle' : 'off');
  if (isConfigured()) start();
  else stop();
}

export function disconnect() {
  try {
    localStorage.removeItem(CREDS_KEY);
  } catch {
    /* nothing to clear */
  }
  creds = {};
  lastPushed = null;
  stop();
  setStatus('off');
}

async function readRemote() {
  const gist = await api(`/${creds.gistId}`);
  const file = gist.files?.[FILENAME];
  if (!file) return {};
  // GitHub truncates large files inline and hands back a raw URL instead.
  const content = file.truncated ? await fetch(file.raw_url).then((r) => r.text()) : file.content;
  try {
    return JSON.parse(content || '{}');
  } catch {
    throw new Error('The synced file is not readable. Reconnecting will rewrite it from this device.');
  }
}

/**
 * One exchange: read what the other device left, merge it in, and write the
 * result back if this device knows anything the gist does not. Pull before push
 * always, so a device that has been offline cannot flatten the other one.
 */
export async function syncNow({ quiet = false } = {}) {
  if (!isConfigured() || inFlight) return false;
  inFlight = true;
  if (!quiet) setStatus('syncing');
  try {
    const changedLocally = applyRemote(await readRemote());
    const outgoing = canonical(snapshot());
    if (outgoing !== lastPushed) {
      await api(`/${creds.gistId}`, {
        method: 'PATCH',
        body: JSON.stringify({ files: { [FILENAME]: { content: outgoing } } })
      });
      lastPushed = outgoing;
    }
    setStatus('synced', { at: Date.now() });
    return changedLocally;
  } catch (err) {
    // An offline phone is the normal case, not a failure worth shouting about.
    setStatus(navigator.onLine === false ? 'offline' : 'error', { error: err.message });
    return false;
  } finally {
    inFlight = false;
  }
}

function schedulePush() {
  if (!isConfigured()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => syncNow({ quiet: true }), PUSH_DEBOUNCE);
}

function stop() {
  clearTimeout(pushTimer);
  clearInterval(pollTimer);
  pollTimer = null;
}

let started = false;

/**
 * Sync on the events that mean "the other device may have moved": coming back to
 * the tab, regaining the network, and a slow poll for a tab left open all day.
 * Returning to the app after time away is exactly when a stale answer would be
 * most misleading, so that is the moment worth spending a request on.
 */
export function start(onPulled) {
  if (onPulled) start.onPulled = onPulled;
  if (!isConfigured()) return;
  stop();
  pollTimer = setInterval(() => syncNow({ quiet: true }).then(notify), POLL_MS);

  if (!started) {
    started = true;
    onWrite(schedulePush);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncNow({ quiet: true }).then(notify);
    });
    window.addEventListener('online', () => syncNow({ quiet: true }).then(notify));
    // A pending push must not die with the tab. keepalive lets the browser
    // finish it after the page is gone.
    window.addEventListener('pagehide', flush);
  }
  syncNow().then(notify);
}

function notify(changed) {
  if (changed && start.onPulled) start.onPulled();
}

function flush() {
  if (!isConfigured() || !pushTimer) return;
  clearTimeout(pushTimer);
  const outgoing = canonical(snapshot());
  if (outgoing === lastPushed) return;
  try {
    fetch(`${API}/${creds.gistId}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ files: { [FILENAME]: { content: outgoing } } })
    });
  } catch {
    // Nothing to do on the way out; the next open will push it.
  }
}
