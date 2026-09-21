import { snapshot, onWrite } from './state.js';

const KEY = 'starlight.push.v1';
const USEFUL = 'starlight.useful.v1';
const LAST_PROJECTED = 'starlight.push.projected.v1';
const FIELDS = ['dateTrust', 'doneAt', 'resolution', 'externalBlock', 'examDossier'];
let timer;
let started = false;

function key() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
export function paired() { return Boolean(key()); }
export function usefulBefore() { try { return Boolean(localStorage.getItem(USEFUL)); } catch { return false; } }
export function recordUsefulMoment() { try { localStorage.setItem(USEFUL, String(Date.now())); } catch { /* local use only */ } }
export function supported() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext; }

export function reminderProjection(overlay) {
  const items = {};
  for (const [id, source] of Object.entries(overlay.items || {})) {
    const record = {};
    if (Object.hasOwn(source, 'dateTrust')) record.dateTrust = source.dateTrust && {
      status: source.dateTrust.status, date: source.dateTrust.date, source: source.dateTrust.source
    };
    if (Object.hasOwn(source, 'doneAt')) record.doneAt = source.doneAt;
    if (Object.hasOwn(source, 'resolution')) record.resolution = source.resolution && { state: source.resolution.state };
    if (Object.hasOwn(source, 'externalBlock')) record.externalBlock = Boolean(source.externalBlock);
    if (Object.hasOwn(source, 'examDossier')) record.examDossier = source.examDossier && {
      confirmed: source.examDossier.confirmed, startTime: source.examDossier.startTime,
      location: source.examDossier.location, materials: source.examDossier.materials
    };
    record._t = Object.fromEntries(Object.entries(source._t || {}).filter(([field]) => FIELDS.includes(field)));
    if (Object.keys(record).length > 1) items[id] = record;
  }
  return { items };
}

async function api(method, body) {
  const response = await fetch('/api/push', {
    method,
    headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Reminder service is unavailable.');
  return result;
}

export async function configuration() {
  const response = await fetch('/api/push', { cache: 'no-store' });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Reminders are available after this version reaches the hosted site.');
  return response.json();
}

export async function sendProjection() {
  if (!paired() || navigator.onLine === false) return false;
  const projection = reminderProjection(snapshot());
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(projection)));
  const digest = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (localStorage.getItem(LAST_PROJECTED) === digest) return false;
  await api('POST', { action: 'project', projection });
  localStorage.setItem(LAST_PROJECTED, digest);
  return true;
}

function vapidBytes(value) {
  const base64 = (value + '='.repeat((4 - value.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0));
}

export async function verifyReminderKey(rawKey) {
  const prior = key();
  const priorDigest = localStorage.getItem(LAST_PROJECTED);
  localStorage.setItem(KEY, String(rawKey || '').trim());
  localStorage.removeItem(LAST_PROJECTED);
  try { await sendProjection(); return true; }
  catch (error) {
    if (prior) localStorage.setItem(KEY, prior);
    else localStorage.removeItem(KEY);
    if (priorDigest) localStorage.setItem(LAST_PROJECTED, priorDigest);
    throw error;
  }
}

export async function connectReminderDevice(label = 'This device') {
  if (!supported()) throw new Error('This browser cannot receive web reminders. On iPhone, add Starlight to your Home Screen first.');
  if (navigator.onLine === false) throw new Error('Reconnect to set up reminders.');
  if (!paired()) throw new Error('Check your private reminder key first.');
  // This call stays in the click gesture. Browsers can reject a delayed ask.
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') throw new Error('Notifications are off for Starlight in this browser. You can change that in browser settings.');
  const config = await configuration();
  if (!config.available || !config.publicKey) throw new Error('Reminders are not ready on this site yet.');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes(config.publicKey) });
  await api('POST', { action: 'register', subscription: subscription.toJSON(), label });
  startReminderSync();
  return true;
}

export async function disconnectReminderDevice() {
  if (supported()) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && paired() && navigator.onLine !== false) await api('DELETE', { endpoint: subscription.endpoint });
    await subscription?.unsubscribe();
  }
  localStorage.removeItem(KEY);
  localStorage.removeItem(LAST_PROJECTED);
}

export function startReminderSync() {
  if (started) return;
  started = true;
  onWrite(() => {
    if (!paired()) return;
    clearTimeout(timer);
    timer = setTimeout(() => sendProjection().catch(() => {}), 5000);
  });
  window.addEventListener('online', () => sendProjection().catch(() => {}));
  if (paired()) sendProjection().catch(() => {});
}
