// One live clock. Everything time derived reads from here, so the app re-derives
// itself as time passes instead of freezing whatever `new Date()` said at load.
const subscribers = new Set();
let current = new Date();
let lastDayKey = dayKey(current);

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function now() {
  return new Date(current);
}

// Noon anchored copy of today, so day arithmetic never trips over DST.
export function today() {
  const d = new Date(current);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function tick() {
  current = new Date();
  const key = dayKey(current);
  const rolledOver = key !== lastDayKey;
  lastDayKey = key;
  subscribers.forEach((fn) => fn({ now: new Date(current), rolledOver }));
}

const ticker = setInterval(tick, 1000);
ticker.unref?.();

// Coming back from a sleeping laptop can skip hours, so resync on wake rather
// than waiting for the next tick to notice the date moved.
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

export function formatClock(d = current) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function formatDay(d = current) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
