// Run: node src/sync.test.js
// merge.test.js checks the merge in the abstract. This checks the thing that
// actually has to hold: two real state.js instances, each with its own storage,
// exchanging copies the way sync.js does, ending up agreeing.
const STATE = new URL('./state.js', import.meta.url).href;

function freshStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

// A cache-busting query gives each device its own module instance, and so its
// own module-level `store`, which is what makes them independent.
async function bootDevice(tag) {
  const storage = freshStorage();
  globalThis.localStorage = storage;
  const api = await import(`${STATE}?device=${tag}`);
  return { api, storage };
}

const laptop = await bootDevice('laptop');
const phone = await bootDevice('phone');

// Only one localStorage global exists, so each device is "sat down at" in turn.
function at(device, fn) {
  globalThis.localStorage = device.storage;
  return fn(device.api);
}

// What crosses the wire is text, so the test sends text too.
const wire = (device) => JSON.parse(at(device, (s) => JSON.stringify(s.snapshot())));

let failures = 0;
function check(name, pass, got) {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${pass ? '' : `  got ${JSON.stringify(got)}`}`);
  if (!pass) failures += 1;
}

const sortDeep = (v) =>
  Array.isArray(v)
    ? v.map(sortDeep)
    : v && typeof v === 'object'
      ? Object.keys(v).sort().reduce((o, k) => ((o[k] = sortDeep(v[k])), o), {})
      : v;
const sameContent = (a, b) => JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));

// --- a day where both devices are used and neither has synced ---
at(laptop, (s) => {
  s.markDone('econ-cw6');
  s.recordOpen('ob-journal4', 1000);
});
at(phone, (s) => {
  s.recordOpen('ob-journal4', 2000);
  s.recordOpen('ob-journal4', 3000);
  s.markStarted('mgt2250-hw2');
});

// --- they meet: pull, merge, push back ---
at(phone, (s) => s.applyRemote(wire(laptop)));
at(laptop, (s) => s.applyRemote(wire(phone)));

const L = () => at(laptop, (s) => s.snapshot());
const P = () => at(phone, (s) => s.snapshot());

check('a submission made on the laptop reaches the phone', P().items['econ-cw6'].doneAt != null);
check('a start made on the phone reaches the laptop', L().items['mgt2250-hw2'].startedAt != null);
check('both devices\' halves of the open log survive',
  sameContent(L().items['ob-journal4'].opens, [1000, 2000, 3000]), L().items['ob-journal4'].opens);
// Key order differs because each device created items in its own order. That is
// an artifact of insertion, not a disagreement, and sync.js serializes with
// sorted keys so it never reaches the gist.
check('the two devices hold the same state', sameContent(L().items, P().items));

// --- undoing on one device must beat the other's stale claim ---
await new Promise((r) => setTimeout(r, 5)); // ensure a later timestamp
at(phone, (s) => s.clearProgress('econ-cw6'));
at(laptop, (s) => s.applyRemote(wire(phone)));
check('un-submitting on the phone wins on the laptop',
  L().items['econ-cw6'].doneAt === null, L().items['econ-cw6'].doneAt);

at(phone, (s) => s.applyRemote(wire(laptop)));
check('and the undo does not bounce back as done', P().items['econ-cw6'].doneAt === null);

// --- an exchange that carries nothing new must report nothing new, or the two
//     devices would repaint and push each other in a loop ---
check('a redundant sync is a no-op', at(laptop, (s) => s.applyRemote(wire(phone))) === false);
check('...in both directions', at(phone, (s) => s.applyRemote(wire(laptop))) === false);

// --- a device that was never synced must not wipe the one that was ---
const newPhone = await bootDevice('new');
at(newPhone, (s) => s.applyRemote(wire(laptop)));
check('a fresh device adopts the existing history',
  newPhone && P().items['mgt2250-hw2'].startedAt != null);
at(laptop, (s) => s.applyRemote(wire(newPhone)));
check('and adds nothing back', L().items['econ-cw6'].doneAt === null);

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
