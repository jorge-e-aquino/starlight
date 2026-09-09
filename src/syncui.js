/**
 * The sync surface: one status line, and a panel for connecting a device.
 *
 * Deliberately quiet. Sync failing is not an emergency, because the local copy
 * is always complete and the work is never blocked on it, so nothing here is
 * allowed to use alarm styling or to sit in front of the thing you opened the
 * app to see. Anything that looks like a problem to solve is a reason to close
 * the app, and closing the app is the actual failure mode.
 */
import * as sync from './sync.js';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Starlight%20sync';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function relative(at) {
  if (!at) return '';
  const secs = Math.round((Date.now() - at) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Plain statements of fact, matching how the rest of the app reports state after
// time away: what is true, not how bad it is.
function describe(status) {
  if (!sync.isConfigured()) return 'This device only';
  switch (status.state) {
    case 'syncing': return 'Checking other devices';
    case 'synced': return `In sync ${relative(status.at)}`.trim();
    case 'offline': return 'Offline. Saved here, will sync later';
    case 'error': return status.error || 'Not syncing right now';
    default: return 'Ready to sync';
  }
}

export function buildSyncStatus(ctx) {
  const wrap = el('div', 'sync-status');
  const dot = el('span', 'sync-dot');
  const label = el('button', 'sync-label');
  label.type = 'button';

  const paint = () => {
    const status = sync.syncStatus();
    wrap.dataset.state = sync.isConfigured() ? status.state : 'off';
    label.textContent = describe(status);
    label.title = sync.isConfigured()
      ? 'Sync settings'
      : 'Set up sync so this and your other devices agree';
  };

  label.addEventListener('click', () => openSyncPanel(ctx));
  sync.onSyncChange(paint);
  paint();

  wrap.append(dot, label);
  return wrap;
}

/* ------------------------------------------------------------------ panel -- */

export function openSyncPanel(ctx) {
  document.querySelector('.sync-sheet')?.remove();

  const sheet = el('div', 'sync-sheet');
  const card = el('div', 'sync-card');
  sheet.append(card);

  const close = el('button', 'close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close sync settings');
  close.addEventListener('click', () => sheet.remove());
  card.append(close);

  sync.isConfigured() ? renderConnected(card, sheet, ctx) : renderSetup(card, sheet, ctx);

  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.remove();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key !== 'Escape') return;
    sheet.remove();
    document.removeEventListener('keydown', esc);
  });

  document.body.append(sheet);
  card.querySelector('input')?.focus();
  return sheet;
}

function renderConnected(card, sheet, ctx) {
  card.append(el('h2', null, 'Sync'));
  const status = sync.syncStatus();
  card.append(el('p', 'sync-note', describe(status)));

  const code = sync.credentials().gistId || '';
  card.append(el('p', 'sync-note', 'Sync code for your other devices:'));
  const codeRow = el('div', 'sync-code-row');
  const codeBox = el('code', 'sync-code', code);
  const copy = el('button', 'act ghost small', 'Copy');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = 'Copied';
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    } catch {
      // Clipboard blocked; the code is on screen to type instead.
      copy.textContent = 'Select it';
    }
  });
  codeRow.append(codeBox, copy);
  card.append(codeRow);

  const actions = el('div', 'sync-actions');
  const now = el('button', 'act primary small', 'Sync now');
  now.type = 'button';
  now.addEventListener('click', async () => {
    now.disabled = true;
    now.textContent = 'Syncing';
    const changed = await sync.syncNow();
    now.textContent = 'Sync now';
    now.disabled = false;
    if (changed) ctx.repaint();
  });

  const off = el('button', 'act ghost small', 'Disconnect this device');
  off.type = 'button';
  off.addEventListener('click', () => {
    sync.disconnect();
    sheet.remove();
    ctx.repaint();
  });

  actions.append(now, off);
  card.append(actions);
  card.append(el('p', 'sync-fine', 'Disconnecting clears the token from this device. Your progress stays here and in the gist.'));
}

function renderSetup(card, sheet, ctx) {
  card.append(el('h2', null, 'Sync across devices'));
  card.append(el('p', 'sync-note',
    'Your progress syncs through a secret GitHub gist that only you can read. No server, nothing shared.'));

  const steps = el('ol', 'sync-steps');
  const first = el('li');
  first.append(document.createTextNode('Make a GitHub token with '));
  const strong = el('strong', null, 'gist');
  first.append(strong, document.createTextNode(' access. '));
  const link = el('a', 'sync-link', 'Open GitHub');
  link.href = TOKEN_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  first.append(link);
  steps.append(first);
  steps.append(el('li', null, 'Paste it below. It stays on this device.'));
  card.append(steps);

  const token = el('input', 'sync-input');
  token.type = 'password';
  token.placeholder = 'GitHub token';
  token.autocomplete = 'off';
  token.spellcheck = false;
  card.append(token);

  card.append(el('p', 'sync-note', 'Then, on your first device, start a new sync. On the others, paste the code that device shows you.'));

  const codeInput = el('input', 'sync-input');
  codeInput.type = 'text';
  codeInput.placeholder = 'Sync code from your other device (optional)';
  codeInput.autocomplete = 'off';
  codeInput.spellcheck = false;
  card.append(codeInput);

  const err = el('p', 'sync-error');
  err.hidden = true;
  card.append(err);

  const actions = el('div', 'sync-actions');
  const go = el('button', 'act primary small', 'Connect');
  go.type = 'button';
  actions.append(go);
  card.append(actions);

  const fail = (message) => {
    err.textContent = message;
    err.hidden = false;
    go.disabled = false;
    go.textContent = 'Connect';
  };

  go.addEventListener('click', async () => {
    const t = token.value.trim();
    if (!t) return fail('Paste your GitHub token first.');
    err.hidden = true;
    go.disabled = true;
    go.textContent = 'Connecting';

    try {
      const existing = codeInput.value.trim();
      const gistId = existing || (await sync.createGist(t));
      sync.saveCredentials({ token: t, gistId });
      const changed = await sync.syncNow();
      if (sync.syncStatus().state === 'error') {
        sync.disconnect();
        return fail(sync.syncStatus().error);
      }
      sheet.remove();
      if (changed) ctx.repaint();
      else ctx.repaint();
    } catch (e) {
      fail(e.message);
    }
  });

  token.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); });
}
