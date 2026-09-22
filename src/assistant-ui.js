import * as store from './state.js';
import { evidenceFor, localAnswer, modelContext, citedAnswer } from './intelligence.js';
import { resolveDocument } from './documents.js';
import { extractFile } from './file-extract.js';
import { pickFocus } from './signals.js';

const KEY = 'starlight.aiKey.v1';
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
const apiKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
let session = { turns: [], loading: false, error: '', pending: null };

async function relevantMaterials(map, question, itemId) {
  if (/\b(when|date|time|due|deadline|what should i do|start next|focus now)\b/i.test(question)) return { materials: [], failures: 0 };
  const match = map.allItems.find((item) => item.id === itemId || `${item.courseCode} ${item.title}`.toLowerCase().includes(question.toLowerCase()));
  const named = map.courses.filter((entry) => new RegExp(`\\b${entry.code.split(' ')[0]}\\b`, 'i').test(question));
  const course = map.courses.find((entry) => new RegExp(entry.code.replace(/\s+/g, '\\s*'), 'i').test(question)) || (named.length === 1 ? named[0] : null);
  const courseId = match?.courseId || course?.id;
  const records = Object.entries(store.snapshot().documents || {}).filter(([, record]) => !record.deletedAt && (!courseId || record.courseId === courseId));
  const materials = [];
  let failures = 0;
  for (const [id, record] of records.slice(0, 12)) {
    try {
      const file = await resolveDocument(id, record);
      const result = await extractFile(file);
      if (result.text.trim()) materials.push({ id, name: record.name, courseCode: map.courseById.get(record.courseId)?.code, text: result.text.slice(0, 50000) });
    } catch { failures += 1; }
  }
  return { materials, failures };
}

async function modelCall(kind, question, evidence) {
  const response = await fetch('/api/assist', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AI-Key': apiKey() },
    body: JSON.stringify({ kind, question, context: modelContext(evidence) }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The model is unavailable.');
  return result.text;
}

export async function askSemester(question, map, { itemId = null, useModel = Boolean(apiKey()) } = {}) {
  const { materials, failures } = await relevantMaterials(map, question, itemId);
  const explicitBehavior = /\b(avoid|avoiding|circle|circling|open(?:ed|ing)? repeatedly)\b/i.test(question);
  const evidence = evidenceFor(question, map.allItems, map.courses, store.snapshot(), materials,
    { itemId: itemId || (/\b(what should i do|start next|focus now)\b/i.test(question) ? pickFocus(map.allItems)?.id : null), includeBehavior: explicitBehavior });
  const dateQuestion = /\b(when|date|time|due|deadline)\b/i.test(question);
  if (dateQuestion) evidence.sort((a, b) => Number(b.kind === 'item') - Number(a.kind === 'item') || b.score - a.score);
  const fallback = localAnswer(question, evidence);
  if (!useModel || !evidence.length || dateQuestion || navigator.onLine === false) return { text: fallback, citations: evidence.slice(0, 1), failures, local: true };
  try {
    const text = await modelCall('answer', question, evidence);
    const result = citedAnswer(text, evidence);
    if (!result || (evidence.some((entry) => entry.kind === 'item' && entry.trust !== 'verified') && /\b(?:\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})\b/i.test(text))) {
      return { text: fallback, citations: evidence.slice(0, 1), failures, local: true };
    }
    return { ...result, failures, local: false };
  } catch (error) { return { text: fallback, citations: evidence.slice(0, 1), failures, local: true, error: error.message }; }
}

function sourceChips(citations, ctx) {
  const row = el('div', 'assistant-sources');
  citations.forEach((source) => {
    const item = ctx.map.allItems.find((entry) => entry.id === source.itemId);
    const chip = el(item ? 'button' : 'span', 'assistant-source', source.title);
    if (item) chip.addEventListener('click', () => ctx.openDetail(item, chip, { silent: true }));
    row.append(chip);
  });
  return row;
}

export function renderAssistant(map, ctx) {
  const root = el('main', 'assistant-view');
  root.append(el('p', 'focus-eyebrow', 'Ask Starlight'), el('h2', 'assistant-title', 'What would help?'),
    el('p', 'fine', 'Answers draw from your semester and saved materials. Check a cited item before acting on an unverified date.'));
  const transcript = el('div', 'assistant-thread'); transcript.setAttribute('role', 'log');
  if (!session.turns.length) transcript.append(el('p', 'assistant-empty', 'Try “What is blocking ECON testing?” or “What should I start?”'));
  session.turns.forEach((turn) => {
    const row = el('article', 'assistant-turn'); row.append(el('p', 'assistant-question', turn.question), el('p', 'assistant-answer', turn.answer.text));
    if (turn.answer.citations.length) row.append(sourceChips(turn.answer.citations, ctx));
    if (turn.answer.error) row.append(el('p', 'fine', `${turn.answer.error} Showing the local answer.`));
    if (turn.answer.failures) row.append(el('p', 'fine', 'Some saved files could not open here. Reconnect or pair this device to include them.'));
    transcript.append(row);
  });
  root.append(transcript);
  if (session.loading) root.append(el('p', 'fine', 'Finding the relevant source…'));
  const form = el('form', 'assistant-form');
  const input = el('input', 'truth-input'); input.type = 'search'; input.required = true; input.maxLength = 500;
  input.placeholder = 'Ask about a class, item, or source'; input.setAttribute('aria-label', 'Ask Starlight');
  const send = el('button', 'act small', 'Ask'); send.type = 'submit'; send.disabled = session.loading;
  form.append(input, send);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); if (session.loading) return;
    const question = input.value.trim(); if (!question) return;
    session.loading = true; ctx.repaint();
    try { session.turns.push({ question, answer: await askSemester(question, map) }); session.turns = session.turns.slice(-12); }
    catch (error) { session.error = error.message; }
    session.loading = false; ctx.repaint();
  });
  root.append(form);
  if (session.error) root.append(el('p', 'app-status', session.error));
  const settings = el('details', 'assistant-settings'); settings.append(el('summary', null, 'Optional AI connection'));
  settings.append(el('p', 'fine', 'Without a key, Starlight answers locally from matching records. With your OpenAI API key, a small model receives only selected excerpts for each question. The key stays on this device and is never exported. API use may cost money.'));
  const keyForm = el('form', 'assistant-key-form');
  const keyInput = el('input', 'truth-input'); keyInput.type = 'password'; keyInput.placeholder = apiKey() ? 'Key saved on this device' : 'OpenAI API key';
  keyInput.setAttribute('aria-label', 'OpenAI API key'); keyInput.autocomplete = 'off';
  const save = el('button', 'act ghost small', 'Save key'); save.type = 'submit';
  keyForm.append(keyInput, save);
  keyForm.addEventListener('submit', (event) => { event.preventDefault(); if (!keyInput.value.trim()) return;
    try { localStorage.setItem(KEY, keyInput.value.trim()); session.error = ''; ctx.repaint(); } catch { session.error = 'This device cannot save a key. Local answers still work.'; ctx.repaint(); } });
  if (apiKey()) { const remove = el('button', 'linky', 'Remove key'); remove.addEventListener('click', () => { localStorage.removeItem(KEY); ctx.repaint(); }); keyForm.append(remove); }
  settings.append(keyForm); root.append(settings);
  return root;
}

export async function draftForItem(item, map, limit) {
  const question = `Draft a useful first pass for ${item.courseCode} ${item.title}. ${limit ? `Hard limit: ${limit.value} ${limit.unit}.` : 'No limit has been recorded; do not invent one.'} ${/pass|fail/i.test(item.notes || '') ? 'This is pass/fail. Meet the requirements and stop.' : ''}`;
  const result = await askSemester(question, map, { itemId: item.id, useModel: false });
  const evidence = result.citations.filter((source) => source.itemId === item.id || source.kind === 'file');
  if (!apiKey() || navigator.onLine === false) return { text: `${item.title}\n\n[State the main answer or finding.]\n\n[Support it with the assignment instructions and your own evidence.]\n\n[Check the source and submit in Canvas.]`, citations: evidence, local: true };
  const text = await modelCall('draft', question, evidence);
  if (!citedAnswer(text, evidence)) throw new Error('The draft did not cite its source. Try again or write from the local outline.');
  const clipped = limit?.unit === 'characters' ? text.slice(0, limit.value) : limit?.unit === 'words' ? text.split(/\s+/).slice(0, limit.value).join(' ') : text;
  if (!citedAnswer(clipped, evidence)) throw new Error('The limit cut off the source marker. Try a shorter draft or use the local outline.');
  return { text: clipped, citations: evidence, local: false };
}
