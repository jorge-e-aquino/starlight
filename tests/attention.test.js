import assert from 'node:assert/strict';
import { readPreferences, savePreferences, recoveryChoice } from '../src/attention.js';

const memory = new Map();
const storage = { getItem: (key) => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
assert.deepEqual(readPreferences(storage), { mode: 'full', ground: 'lavender', scheme: 'system' });
savePreferences({ mode: 'light', ground: 'paper', scheme: 'dark' }, storage);
assert.deepEqual(readPreferences(storage), { mode: 'light', ground: 'paper', scheme: 'dark' });
assert.deepEqual(savePreferences({ mode: 'unknown', ground: 'paper', scheme: 'bright' }, storage), { mode: 'full', ground: 'paper', scheme: 'system' });
memory.set('starlight.attention.v1', 'broken');
assert.equal(readPreferences(storage).mode, 'full');

const now = new Date('2026-09-21T12:00:00');
const old = '2026-09-17T12:00:00';
const overdue = [
  { id: 'dead' },
  { id: 'late', resolution: { state: 'late-eligible' } },
  { id: 'makeup', resolution: { state: 'makeup-possible' } }
];
assert.equal(recoveryChoice(overdue, old, now).chosen.id, 'late');
assert.equal(recoveryChoice(overdue, old, now).rest.length, 2);
assert.equal(recoveryChoice(overdue.slice(0, 1), old, now), null);
assert.equal(recoveryChoice(overdue, null, now), null);
assert.equal(recoveryChoice(overdue, '2026-09-20T12:00:00', now), null);
assert.equal(recoveryChoice([{ id: 'a' }, { id: 'b' }], old, now).knownRecoverable, false);
console.log('Attention mode checks pass.');
