import './styles.css';
import { loadMap, listCourseIds } from './data.js';
import { createDetailPanel } from './detail.js';
import { renderMap, starSvg } from './render.js';
import { renderNow } from './now.js';
import { renderField } from './field-ui.js';
import { renderPlan } from './plan.js';
import { renderCheckin, renderEvening } from './ritual.js';
import { buildDayPlan } from './schedule.js';
import * as clock from './clock.js';
import * as store from './state.js';
import { pickFocus, liveItems, avoidanceItems } from './signals.js';
import { toast } from './toast.js';
import { initTooltips } from './tooltip.js';
import * as sync from './sync.js';
import { recordUsefulMoment, startReminderSync } from './push-client.js';

const app = document.querySelector('#app');

// Only in a build. Registering in dev would serve yesterday's modules over the
// dev server's and make edits look like they did nothing.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // No offline shell this time. The app still works; it just needs the
      // network to open.
    });
  });
}

// Read before recording, or the away report compares now against now.
const previousVisit = store.lastVisit();
const firstRun = !previousVisit && Object.keys(store.snapshot().items).length === 0;
store.recordVisit();
startReminderSync();

const anim = { mount: true, focusChanged: false };

// The chosen view is part of the URL, so a particular way of looking at the
// semester can be bookmarked or reopened.
const VIEWS = ['now', 'plan', 'field', 'map', 'checkin', 'evening'];
const requestedView = new URLSearchParams(location.search).get('view');
const startView = VIEWS.includes(requestedView) ? requestedView : 'now';

const ui = {
  view: startView,
  queueExpanded: false,
  pastExpanded: false,
  finishedExpanded: false,
  checkinStep: 0,
  awayDismissed: false,
  firstRunDismissed: false
};

function itemFromHash(map) {
  const match = /^#item=(.+)$/.exec(location.hash);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return map.allItems.find((it) => it.id === id) || null;
}

try {
  const map = loadMap();

  const ctx = {
    map,
    lastVisit: previousVisit,
    get queueExpanded() { return ui.queueExpanded; },
    get pastExpanded() { return ui.pastExpanded; },
    get finishedExpanded() { return ui.finishedExpanded; },
    toggleFinished: () => { ui.finishedExpanded = !ui.finishedExpanded; paint(); },
    get awayDismissed() { return ui.awayDismissed; },
    get checkinStep() { return ui.checkinStep; },
    get firstRun() { return firstRun; },
    get focusItem() { return pickFocus(map.allItems); },
    get mountAnim() { return anim.mount; },
    get focusChanged() { return anim.focusChanged; },
    expandQueue: () => { ui.queueExpanded = true; paint(); },
    togglePast: () => { ui.pastExpanded = !ui.pastExpanded; paint(); },
    dismissAway: () => { ui.awayDismissed = true; paint(); },
    openPlan: () => setView('plan'),
    openCheckin: () => { ui.checkinStep = 0; setView('checkin'); },
    openEvening: () => setView('evening'),
    closeCheckin: () => setView('now'),
    advanceCheckin: () => { ui.checkinStep = Math.min(4, ui.checkinStep + 1); if (ui.checkinStep === 4) recordUsefulMoment(); paint(); },
    repaint: () => paint(),
    // Every mutation goes through here so one repaint keeps the whole app,
    // including the open detail panel, consistent with the new state.
    act: (mutate, notice) => {
      mutate();
      paint();
      if (notice) {
        toast(notice.message, {
          actionLabel: 'Undo',
          onAction: () => { notice.undo(); paint(); }
        });
      }
    },
    openDetail: (item, trigger, options) => {
      const course = map.courseById.get(item.courseId);
      const focus = pickFocus(map.allItems);
      detail.show(item, course, Boolean(focus && focus.id === item.id), trigger, options);
      paint({ keepDetail: true });
    }
  };

  const detail = createDetailPanel(ctx);
  const shell = document.createElement('div');
  shell.className = 'page';
  app.replaceChildren(shell, detail.element);

  let lastView = null;
  let lastFocusId = null;

  function paint() {
    const focus = pickFocus(map.allItems);
    // Only Now actually offers this item as the thing to start. Visiting Plan,
    // Map, or the check-in must not manufacture an avoidance observation.
    if (focus && ui.view === 'now') store.recordFocusDay(focus.id);
    anim.mount = ui.view !== lastView;
    anim.focusChanged = (focus ? focus.id : null) !== lastFocusId;
    lastView = ui.view;
    lastFocusId = focus ? focus.id : null;
    shell.replaceChildren(
      buildMasthead(map, focus),
      ...buildAppStates(),
      ...(ui.view === 'map' || ui.view === 'checkin' || ui.view === 'evening' || ui.view === 'field' ? [] : buildEdgeTargets(ui.view)),
      surfaceFor(ui.view)
    );
    if (detail.openItem) {
      const item = detail.openItem;
      detail.repaint(item, map.courseById.get(item.courseId), Boolean(focus && focus.id === item.id));
    }
    if (ui.view === 'map') centerOn(focus);
  }

  function buildAppStates() {
    const nodes = [];
    const health = store.storageStatus();
    if (health.readError || health.writeError || !navigator.onLine) {
      const status = document.createElement('p');
      status.className = 'app-status';
      status.setAttribute('role', 'status');
      status.dataset.state = health.readError || health.writeError ? 'error' : 'offline';
      status.textContent = health.readError
        ? 'This device could not read saved progress. The original stays in storage. Restore a progress backup below.'
        : health.writeError
          ? 'This device cannot save changes right now. Export your progress before closing.'
          : 'Offline. Your saved semester stays available. Sync will resume when you reconnect.';
      nodes.push(status);
    }
    if (firstRun && !ui.firstRunDismissed && !health.readError) {
      const intro = document.createElement('section');
      intro.className = 'first-run';
      const title = document.createElement('h2');
      title.className = 'state-title';
      title.textContent = 'A place to start';
      const copy = document.createElement('p');
      copy.className = 'state-copy';
      copy.textContent = 'Now offers one thing to start. Plan shapes today. Map holds the semester. Use Import progress below to bring your saved work here.';
      const button = document.createElement('button');
      button.className = 'act';
      button.textContent = 'Open my semester';
      button.addEventListener('click', () => { ui.firstRunDismissed = true; paint(); });
      intro.append(title, copy, button);
      nodes.push(intro);
    }
    return nodes;
  }

  function surfaceFor(view) {
    if (view === 'plan') return renderPlan(map, ctx);
    if (view === 'field') return renderField(map, ctx);
    if (view === 'map') return renderMap(map, ctx);
    if (view === 'checkin') return renderCheckin(map, ctx);
    if (view === 'evening') return renderEvening(map, ctx);
    return renderNow(map, ctx);
  }

  // View changes go through one place so the URL, the toggle and the repaint
  // can never disagree about which surface is showing.
  function setView(id) {
    ui.view = id;
    const url = new URL(location.href);
    if (id === 'now') url.searchParams.delete('view');
    else url.searchParams.set('view', id);
    try {
      history.replaceState(null, '', url);
    } catch {
      // An isolated srcdoc preview cannot rewrite its URL. Its in-memory view
      // still changes, so the state fixture can exercise controls safely.
    }
    paint();
  }

  function buildMasthead(map, focus) {
    const head = document.createElement('header');
    head.className = 'masthead';

    const left = document.createElement('div');
    const h1 = document.createElement('h1');
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.append(starSvg(20));
    h1.append(mark, document.createTextNode('Starlight'));

    const clockLine = document.createElement('p');
    clockLine.className = 'sub clock-line';
    clockLine.append(
      Object.assign(document.createElement('span'), { className: 'clock-day', textContent: clock.formatDay() }),
      Object.assign(document.createElement('span'), { className: 'clock-time', textContent: clock.formatClock() })
    );
    left.append(h1, clockLine);

    const right = document.createElement('div');
    right.className = 'shell-right';

    // Deliberately not a workload count on the Now surface. A running total of
    // everything outstanding is the thing that triggers avoidance, so Now
    // reports only the signal worth acting on; the map, where the pile is the
    // point, still says how much is in range.
    const status = document.createElement('div');
    status.className = 'shell-status';
    if (ui.view === 'map') {
      const live = liveItems(map.allItems).length;
      status.textContent = live ? `${live} in range` : 'nothing in range';
    } else if (ui.view === 'plan') {
      const plan = buildDayPlan(map.allItems);
      status.textContent = plan.mode === 'due-today' ? `finishing ${clock.formatClock(plan.finishAt)}` : '';
    } else {
      const rings = avoidanceItems(map.allItems).length;
      status.textContent = rings ? `${rings} circling` : '';
    }

    const toggle = document.createElement('div');
    toggle.className = 'view-toggle';
    [['now', 'Now'], ['plan', 'Plan'], ['field', 'Field'], ['map', 'Map']].forEach(([id, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.className = ui.view === id ? 'on' : '';
      b.addEventListener('click', () => setView(id));
      toggle.append(b);
    });

    const checkin = document.createElement('button');
    checkin.className = 'checkin-link';
    checkin.textContent = 'Check in';
    checkin.addEventListener('click', () => { ui.checkinStep = 0; setView('checkin'); });

    right.append(status, checkin, toggle);
    head.append(left, right);
    return head;
  }

  /**
   * The two surfaces either side of Now, reachable from the margins of it. These
   * used to be one target covering the whole right half, which is more page than
   * a navigation shortcut has any business claiming; they are now a pair of
   * modest zones on the edges, mirrored so the shape of the app is legible from
   * the Now screen: the plan to the left, the map to the right.
   */
  function buildEdgeTargets(view) {
    const left =
      view === 'plan'
        ? edgeTarget('now', 'to-plan', 'Now', '\u2190', 'Back to the Now screen')
        : edgeTarget('plan', 'to-plan', 'Today\u2019s plan', '\u2190', 'Open today\u2019s hourly plan');
    return [left, edgeTarget('map', 'to-map', 'Open the map', '\u2192', 'Open the full semester map')];
  }

  function edgeTarget(view, side, label, arrow, description) {
    const target = document.createElement('button');
    target.className = `edge-target ${side}`;
    target.setAttribute('aria-label', description);

    const hint = document.createElement('span');
    hint.className = 'edge-hint';
    const arrowEl = document.createElement('span');
    arrowEl.className = 'edge-arrow';
    arrowEl.textContent = arrow;
    // The arrow leads on the left and trails on the right, so both point outward
    // toward the surface they open.
    if (side === 'to-plan') hint.append(arrowEl, document.createTextNode(label));
    else hint.append(document.createTextNode(label), arrowEl);

    target.append(hint);
    target.addEventListener('click', () => setView(view));
    return target;
  }

  function centerOn(item) {
    if (!item) return;
    const canvas = shell.querySelector('.canvas');
    const node = shell.querySelector(`[data-item-id="${item.id}"]`);
    if (canvas && node) canvas.scrollLeft = Math.max(0, node.offsetLeft - canvas.clientWidth / 2);
  }

  initTooltips();
  paint();
  window.addEventListener('online', () => paint());
  window.addEventListener('offline', () => paint());

  // A deep link opens the item without counting as a look, so sharing a URL
  // cannot fabricate a circling signal.
  const linked = itemFromHash(map);
  if (linked) {
    const focus = pickFocus(map.allItems);
    detail.show(linked, map.courseById.get(linked.courseId), Boolean(focus && focus.id === linked.id), null, {
      silent: true
    });
  }

  // The clock drives the UI: seconds refresh the readout, a date rollover
  // re-derives every window, so leaving the tab open overnight stays honest.
  let lastMinute = new Date().getMinutes();
  clock.subscribe(({ now, rolledOver }) => {
    if (rolledOver) {
      paint();
      return;
    }
    // The plan is packed from the current moment, so it goes stale by the
    // minute. Repaint on the minute rather than the second, and never while
    // something is being typed into, which a repaint would wipe.
    const minute = now.getMinutes();
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    // A plan that re-flowed under you mid pomodoro would move the block you are
    // working in, so a running timer holds the schedule still until it ends.
    const timing = Boolean(store.timerState() && store.timerState().running);
    if (minute !== lastMinute) {
      lastMinute = minute;
      if (ui.view === 'plan' && !typing && !timing) {
        paint();
        return;
      }
    }
    const t = shell.querySelector('.clock-time');
    const d = shell.querySelector('.clock-day');
    if (t) t.textContent = clock.formatClock();
    if (d) d.textContent = clock.formatDay();
  });

  // A pull that brought something new has to reach the screen, or the phone
  // would keep offering work the laptop already finished. Held back while
  // something is being typed into, for the same reason the clock holds back:
  // a repaint mid sentence throws the sentence away.
  sync.start(() => {
    const typing = document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (!typing) paint();
  });

} catch (err) {
  const box = document.createElement('div');
  box.className = 'error app-error';
  box.setAttribute('role', 'alert');
  box.textContent = `Starlight could not build the map: ${err.message}`;
  const retry = document.createElement('button');
  retry.className = 'act';
  retry.textContent = 'Try opening again';
  retry.addEventListener('click', () => location.reload());
  box.append(retry);
  app.replaceChildren(box);
  console.error(err, 'Course ids in the schema:', listCourseIds());
}
