import { configuration, connectReminderDevice, disconnectReminderDevice, paired, supported, usefulBefore, verifyReminderKey } from './push-client.js';

function node(tag, className, content) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (content != null) el.textContent = content;
  return el;
}

export function reminderPanel({ firstRun = false } = {}) {
  const panel = node('section', 'reminder-panel');
  panel.append(node('h3', 'reminder-title', 'Reminders on this device'));
  const status = node('p', 'checkin-copy', 'Checking reminder availability…');
  status.setAttribute('role', 'status');
  panel.append(status);
  if (firstRun || !usefulBefore()) {
    status.textContent = 'After you use your first check-in, come back to set up reminders.';
    return panel;
  }
  if (!supported()) {
    status.textContent = /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? 'To receive reminders on iPhone, add Starlight to your Home Screen and open it there.'
      : 'This browser cannot receive reminders. Your check-in still works here.';
    return panel;
  }
  if (navigator.onLine === false) {
    status.textContent = 'Offline. Set up reminders when you reconnect.';
    return panel;
  }
  configuration().then((config) => {
    if (!panel.isConnected) return;
    if (!config.available) { status.textContent = 'Reminders are being connected to this site.'; return; }
    if (paired()) {
      status.textContent = Notification.permission === 'granted'
        ? 'This device receives the morning reminder. The most recently connected device gets each message.'
        : 'This device has a reminder key, but notifications need browser permission.';
      const stop = node('button', 'act ghost', 'Turn off on this device');
      stop.addEventListener('click', async () => {
        stop.disabled = true;
        try { await disconnectReminderDevice(); status.textContent = 'Reminders are off on this device.'; stop.remove(); }
        catch (error) { status.textContent = error.message; stop.disabled = false; }
      });
      panel.append(stop);
      return;
    }
    status.textContent = 'One useful item each morning, when there is one. Two regular reminders a day at most. Exam details appear only after you confirm them.';
    const form = node('form', 'reminder-form');
    const label = node('label', null, 'Private reminder key');
    const input = node('input', 'sync-input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.required = true;
    label.append(input);
    const enable = node('button', 'act primary', 'Check key');
    enable.type = 'submit';
    form.append(label, enable);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      enable.disabled = true;
      status.textContent = 'Checking your private key…';
      try {
        await verifyReminderKey(input.value);
        form.remove();
        status.textContent = 'Your key works. Allow this device to show Starlight reminders when a useful item is due.';
        const allow = node('button', 'act primary', 'Allow reminders');
        allow.addEventListener('click', async () => {
          allow.disabled = true;
          try { await connectReminderDevice(navigator.platform || 'This device'); status.textContent = 'Reminders are on for this device.'; allow.remove(); }
          catch (error) { status.textContent = error.message; allow.disabled = false; }
        });
        panel.append(allow);
      }
      catch (error) { status.textContent = error.message; enable.disabled = false; }
    });
    panel.append(form);
  }).catch((error) => { if (panel.isConnected) status.textContent = error.message; });
  return panel;
}
