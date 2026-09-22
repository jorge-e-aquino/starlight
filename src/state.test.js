// Run: node src/state.test.js
// Set STARLIGHT_BACKUP to check a personal backup without keeping it in the repo.
import { readFile } from 'node:fs/promises';

const STATE = new URL('./state.js', import.meta.url).href;
const KEY = 'starlight.v1';
let sequence = 0;
let failures = 0;

function check(name, pass) {
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}`);
  if (!pass) failures += 1;
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = sorted(value[key]);
      return out;
    }, {});
  }
  return value;
}

const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const errorMessage = (value) => typeof value === 'string' && value.length > 0;

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[KEY, initial]]);
  const storage = {
    failRead: false,
    failWrite: false,
    writes: 0,
    getItem(key) {
      if (storage.failRead) throw new Error('Storage access failed');
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      if (storage.failWrite) throw new Error('Storage is full');
      storage.writes += 1;
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
    saved() { return values.get(KEY) ?? null; }
  };
  return storage;
}

async function boot(storage = memoryStorage()) {
  globalThis.localStorage = storage;
  const state = await import(`${STATE}?storage-test=${++sequence}`);
  return { storage, state };
}

// Stamped synthetic data exercises unknown fields and logs without recording
// anyone's coursework or behavior in a checked-in test fixture.
const backup = {
  items: {
    sample: {
      doneAt: 30,
      startedAt: 20,
      firstStep: 'Open the prompt',
      opens: [10, 20],
      focusDays: ['2026-8-20'],
      customDecision: { note: 'Keep future fields', active: false },
      _t: { doneAt: 30, startedAt: 20, firstStep: 15, opens: 20, focusDays: 20, customDecision: 30 }
    }
  },
  days: {
    '2026-09-21': { startAt: '14:00', first: 'sample', _t: { startAt: 30, first: 31 } }
  },
  lastVisit: 40,
  exportedAt: '2026-09-21T12:00:00.000Z'
};

function keepsBackup(actual, expected) {
  // Export time describes the new export; every other supplied field survives.
  return Object.keys(expected).every((key) => key === 'exportedAt' || same(actual[key], expected[key]));
}

{
  const { storage, state } = await boot();
  check('first run starts with an empty item collection', same(state.snapshot().items, {}));
  check('first run has no storage error', same(state.storageStatus(), { readError: null, writeError: null }));
  check('reading first-run state does not write storage', storage.writes === 0);
  const status = state.storageStatus();
  status.readError = 'Changed by a caller';
  check('callers cannot alter storage status', state.storageStatus().readError === null);
}

{
  const { state } = await boot(memoryStorage(JSON.stringify(backup)));
  check('the storage reader keeps all valid backup fields', same(state.snapshot(), backup));
  check('valid stored data has no read error', state.storageStatus().readError === null);
}

{
  const { storage, state } = await boot();
  state.importState(JSON.stringify(backup));
  check('import keeps every supplied progress field', keepsBackup(state.snapshot(), backup));
  const exported = JSON.parse(state.exportState());
  check('export keeps every supplied progress field', keepsBackup(exported, backup));
  check('export supplies a parseable export time', Number.isFinite(Date.parse(exported.exportedAt)));
  const reloaded = await boot(storage);
  check('saved progress survives a module reload', keepsBackup(reloaded.state.snapshot(), backup));
}

{
  const { storage, state } = await boot(memoryStorage(JSON.stringify(backup)));
  const before = JSON.stringify(state.snapshot());
  const saved = storage.saved();
  const malformed = [
    '{', 'null', '[]', '42', '"text"', '{}', '{"items":null}', '{"items":[]}', '{"items":"bad"}',
    '{"items":{"sample":null}}', '{"items":{"sample":[]}}', '{"items":{"sample":7}}'
  ];
  let rejectsAll = true;
  let preservesAll = true;
  for (const value of malformed) {
    let rejected = false;
    try { state.importState(value); } catch { rejected = true; }
    rejectsAll &&= rejected;
    preservesAll &&= JSON.stringify(state.snapshot()) === before && storage.saved() === saved;
  }
  check('import rejects malformed backup shapes', rejectsAll);
  check('rejected imports preserve memory and saved bytes', preservesAll);
}

{
  const corrupt = '{"items":';
  const { storage, state } = await boot(memoryStorage(corrupt));
  check('corrupt storage exposes a read error', errorMessage(state.storageStatus().readError));
  state.markStarted('session-only', 100);
  check('session actions still work after a read error', state.itemState('session-only').startedAt === 100);
  check('session actions preserve the corrupt original', storage.saved() === corrupt && storage.writes === 0);
  state.importState(JSON.stringify(backup));
  check('a valid explicit import clears the read error', state.storageStatus().readError === null);
  check('a valid explicit import restores backup fields and keeps session work',
    same(state.itemState('sample'), backup.items.sample) && state.itemState('session-only').startedAt === 100);
  const repaired = JSON.parse(storage.saved());
  check('recovery saves the imported backup and session work',
    same(repaired.items.sample, backup.items.sample) && repaired.items['session-only'].startedAt === 100);
}

{
  const invalid = JSON.stringify({ items: [] });
  const { storage, state } = await boot(memoryStorage(invalid));
  check('invalid stored item shape exposes a read error', errorMessage(state.storageStatus().readError));
  state.recordVisit(123);
  check('invalid stored item shape remains recoverable', storage.saved() === invalid && storage.writes === 0);
}

{
  const storage = memoryStorage(JSON.stringify(backup));
  storage.failRead = true;
  const { state } = await boot(storage);
  check('failed local reads expose a read error', errorMessage(state.storageStatus().readError));
  state.markStarted('temporary', 123);
  check('failed reads preserve unknown stored progress', storage.saved() === JSON.stringify(backup) && storage.writes === 0);
  storage.failRead = false;
  state.importState(JSON.stringify(backup));
  check('an explicit restore recovers from a failed read',
    state.storageStatus().readError === null && same(state.itemState('sample'), backup.items.sample));
}

{
  const { storage, state } = await boot();
  storage.failWrite = true;
  state.markStarted('sample', 123);
  check('failed writes keep session progress', state.itemState('sample').startedAt === 123);
  check('export can rescue progress after a failed write', JSON.parse(state.exportState()).items.sample.startedAt === 123);
  check('failed writes expose a write error', errorMessage(state.storageStatus().writeError));
  check('failed writes leave the prior storage intact', storage.saved() === null);
  storage.failWrite = false;
  state.markDone('sample', 124);
  check('a successful write clears the write error', state.storageStatus().writeError === null);
  const saved = JSON.parse(storage.saved());
  check('a later successful write saves the whole session', saved.items.sample.startedAt === 123 && saved.items.sample.doneAt === 124);
}

{
  const { state } = await boot();
  state.setExamDossier('sample-exam', { location: 'Room TBD', source: 'Syllabus checked' });
  check('partial exam details stay unconfirmed', state.itemState('sample-exam').examDossier.confirmed === false);
  check('saving exam details does not verify a date', !state.itemState('sample-exam').dateTrust);
  state.setExamDossier('sample-exam', { startTime: '09:00', durationMinutes: 60, questionCount: 25,
    questionFormat: 'Multiple choice', materials: 'ID', cheatSheetRule: 'allowed', sheetWidth: 8.5,
    sheetHeight: 11, sheetPages: 1, calculatorPolicy: 'No calculator', topicsCovered: 'Chapters 1 to 3',
    submissionMethod: 'In person' });
  check('source-backed complete dossier enables exam morning facts', state.itemState('sample-exam').examDossier.confirmed === true);
  state.setCheatSheet('sample-exam', ['first draft']);
  state.setCheatSheet('sample-exam', ['revised draft']);
  check('sheet edits preserve prior drafts', state.itemState('sample-exam').sheetDrafts[0].pages[0] === 'first draft');
  check('sheet content is a stamped decision', Number.isFinite(state.itemState('sample-exam')._t.cheatSheet));
  state.setExamDebrief('sample-exam', { format: 'Multiple choice', topics: 'Graphs', different: 'Practice graphs' });
  check('post-exam answers persist as a stamped decision', state.itemState('sample-exam').examDebrief.different === 'Practice graphs' && Number.isFinite(state.itemState('sample-exam')._t.examDebrief));
}

{
  const { state } = await boot();
  state.confirmTopic('sample-topic', { courseId: 'mgt2250', title: 'Standard deviation', source: 'Lecture notes', examIds: ['sample-exam'] });
  state.reviewStudyTopic('sample-exam', 'sample-topic', 0, 'cram');
  check('a wrong cram answer lowers confidence and proposes a sheet prompt', state.snapshot().topics['sample-topic'].confidence === 0 && state.snapshot().topics['sample-topic'].sheetCandidate === true);
  check('review is a dated log and confidence is a stamped decision', state.itemState('sample-exam').cardReviews.length === 1 && Number.isFinite(state.itemState('sample-exam').cardReviews[0].at) && Number.isFinite(state.snapshot().topics['sample-topic']._t.confidence));
  state.setSheetCandidate('sample-topic', false);
  check('a sheet prompt can be cleared by a later decision', state.snapshot().topics['sample-topic'].sheetCandidate === false);
  for (let i = 0; i < 85; i += 1) state.reviewStudyTopic('sample-exam', 'sample-topic', 2);
  check('card review history keeps a bounded recent log', state.itemState('sample-exam').cardReviews.length === 80);
}

if (process.env.STARLIGHT_BACKUP) {
  try {
    const text = await readFile(process.env.STARLIGHT_BACKUP, 'utf8');
    const personal = JSON.parse(text);
    const { storage, state } = await boot();
    state.importState(text);
    check('the supplied backup loads through the real importer without losing fields', keepsBackup(state.snapshot(), personal));
    check('the supplied backup exports without losing fields', keepsBackup(JSON.parse(state.exportState()), personal));
    const reloaded = await boot(storage);
    check('the supplied backup survives a storage reload', keepsBackup(reloaded.state.snapshot(), personal));
  } catch {
    check('the supplied backup loads successfully', false);
  }
}

console.log(failures ? `\n${failures} failing` : '\nall passing');
process.exit(failures ? 1 : 0);
