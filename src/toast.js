// A brief, undoable acknowledgement. Marking something complete removes it from
// every list, so a misclick would otherwise send it somewhere he has to go
// hunting for. This is also the only place the app congratulates anything, and
// it does so by stating the fact and getting out of the way.
let host = null;
let timer = null;

function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  document.body.append(host);
  return host;
}

export function toast(message, { actionLabel, onAction, duration = 7000 } = {}) {
  const root = ensureHost();
  clearTimeout(timer);
  root.replaceChildren();

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.append(Object.assign(document.createElement('span'), { textContent: message }));

  if (actionLabel && onAction) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', () => {
      dismiss();
      onAction();
    });
    el.append(btn);
  }

  root.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  timer = setTimeout(dismiss, duration);

  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('in');
    setTimeout(() => el.remove(), 260);
  }
}
