import { LANE_HEIGHT, PX_PER_DAY, GUTTER } from './config.js';
import { formatDate } from './data.js';
import { today } from './clock.js';
import { phase, effectiveStatus, presence } from './signals.js';
import { buildScale, buildAxis, buildLanes, nodeRadius } from './layout.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const STAR_PATH = 'M8 0 L9.7 6.3 L16 8 L9.7 9.7 L8 16 L6.3 9.7 L0 8 L6.3 6.3 Z';

export function starSvg(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', STAR_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/**
 * The whole semester. No longer the default surface: this is the pull-back view
 * you go to on purpose, and everything outside its actionable window is drawn
 * recessively so distance reads as distance.
 */
export function renderMap(map, ctx) {
  const now = today();
  const wrap = el('div', 'map-view');
  const scale = buildScale(map.courses, map.crunchZones);
  const axis = buildAxis(scale);

  const canvas = el('div', 'canvas');
  const track = el('div', 'track');
  track.style.width = `${scale.trackWidth}px`;
  track.append(buildAxisHeader(axis, scale));

  const body = el('div', 'track-body');
  body.style.position = 'relative';
  body.append(buildGridlines(axis, scale));
  map.crunchZones.forEach((zone) => body.append(buildCrunchZone(zone, scale)));

  const line = buildTodayLine(scale);
  if (line) body.append(line);

  map.courses.forEach((course) => body.append(buildCourse(course, scale, ctx, now)));

  track.append(body);
  canvas.append(track);
  wrap.append(canvas, buildLegend());
  return wrap;
}

function todayInRange(scale) {
  const t = today();
  return t >= scale.start && t <= scale.end ? t : null;
}

function buildAxisHeader(axis, scale) {
  const header = el('div', 'axis');
  axis.months.forEach((m) => {
    const band = el('div', 'month', m.label);
    band.style.left = `${m.left}px`;
    band.style.width = `${m.width}px`;
    header.append(band);
  });
  axis.weeks.forEach((w) => {
    const tick = el('div', 'week-tick', formatDate(w.date, { month: 'numeric', day: 'numeric' }));
    tick.style.left = `${w.left}px`;
    header.append(tick);
  });
  const t = todayInRange(scale);
  if (t) {
    const flag = el('div', 'today-flag', 'Today');
    flag.style.left = `${scale.x(t)}px`;
    header.append(flag);
  }
  return header;
}

function buildGridlines(axis, scale) {
  const grid = el('div', 'gridlines');
  const dots = el('div', 'dots');
  dots.style.backgroundSize = `${PX_PER_DAY}px ${PX_PER_DAY}px`;
  dots.style.backgroundPosition = `${GUTTER % PX_PER_DAY}px 12px`;
  grid.append(dots);
  axis.weeks.forEach((w) => {
    const l = el('div', 'week-line');
    l.style.left = `${w.left}px`;
    grid.append(l);
  });
  return grid;
}

function buildCrunchZone(zone, scale) {
  if (!zone.startObj || !zone.endObj) return el('div');
  const band = el('div', 'crunch-zone');
  band.style.left = `${scale.x(zone.startObj)}px`;
  band.style.width = `${scale.x(zone.endObj) - scale.x(zone.startObj)}px`;
  band.title = zone.note || zone.label;
  band.append(el('div', 'crunch-label', zone.label));
  return band;
}

function buildTodayLine(scale) {
  const t = todayInRange(scale);
  if (!t) return null;
  const line = el('div', 'today-line');
  line.style.left = `${scale.x(t)}px`;
  return line;
}

function buildCourse(course, scale, ctx, now) {
  const region = el('section', 'course');
  region.dataset.courseId = course.id;
  region.append(buildCourseHeader(course, now));

  course.standing.forEach((item) => region.append(buildStandingBand(item, course, ctx)));

  const laneWrap = el('div', 'lanes');
  buildLanes(course, scale).forEach((lane) =>
    laneWrap.append(buildLane(lane, course, scale, ctx, now))
  );
  if (course.undated.length) laneWrap.append(buildShelf(course, scale, ctx));

  region.append(laneWrap);
  return region;
}

function buildCourseHeader(course, now) {
  const header = el('div', 'course-header');
  const swatch = el('span', 'swatch');
  swatch.style.background = course.color;

  const scored = course.items.filter((it) => it.type !== 'standing');
  const done = scored.filter((it) => effectiveStatus(it) === 'done');
  const liveCount = scored.filter((it) => phase(it, now) === 'live').length;

  const bits = [`${done.length} of ${scored.length} done`];
  if (liveCount) bits.push(`${liveCount} in range`);

  header.append(
    swatch,
    el('span', 'code', course.code),
    el('span', 'name', course.name),
    el('span', 'progress', bits.join(' · '))
  );
  return header;
}

function buildStandingBand(item, course, ctx) {
  const band = el('button', 'standing-band');
  const pulse = el('span', 'pulse');
  pulse.style.background = course.color;
  const meta =
    item.weightPercent != null
      ? `${item.weightPercent}% of grade`
      : item.points != null
        ? `${item.points} pts`
        : 'ongoing';
  band.append(pulse, el('span', 'st-title', item.title), el('span', 'st-meta', `${meta} · runs all semester`));
  band.addEventListener('click', () => ctx.openDetail(item));
  return band;
}

function laneSummary(lane) {
  const g = lane.group;
  const count = `${lane.items.length} item${lane.items.length === 1 ? '' : 's'}`;
  if (!g) return count;
  if (g.countRequired != null && g.countTotal != null && g.countRequired < g.countTotal) {
    return `${count} · best ${g.countRequired} of ${g.countTotal}`;
  }
  if (g.consistencySignal) return `${count} · consistency counts`;
  return count;
}

function buildLane(lane, course, scale, ctx, now) {
  const row = el('div', 'lane');
  row.style.height = `${lane.height}px`;

  const rule = el('div', 'lane-rule');
  rule.style.background = course.color;
  rule.style.top = `${LANE_HEIGHT / 2}px`;
  row.append(rule);

  const label = el('div', 'lane-label');
  const chipMark = el('span', 'chip-mark');
  chipMark.style.background = `linear-gradient(140deg, ${course.color}, ${course.color}99)`;

  const text = el('div', 'lane-text');
  text.append(el('div', 'lname', lane.label));
  const summary = laneSummary(lane);
  if (summary) {
    const sub = el('div', 'lrule', summary);
    if (lane.group && lane.group.note) sub.title = lane.group.note;
    text.append(sub);
  }
  label.append(chipMark, text);
  row.append(label);

  lane.items.forEach((item) => row.append(buildNode(item, course, scale, ctx, now)));
  return row;
}

function buildNode(item, course, scale, ctx, now) {
  const r = nodeRadius(item);
  const isFocus = ctx.focusItem && ctx.focusItem.id === item.id;
  const heavy = item.type === 'exam' || item.type === 'final';
  const where = phase(item, now);

  const btn = el('button', 'node');
  btn.dataset.itemId = item.id;
  btn.dataset.status = effectiveStatus(item);
  // Distance from actionable is the primary visual variable now, not points.
  btn.dataset.phase = where;
  btn.style.setProperty('--presence', presence(item, now));
  btn.dataset.unconfirmed = String(!item.confirmed);
  btn.dataset.tier = heavy ? 'heavy' : 'light';
  btn.style.color = course.color;
  btn.style.left = `${scale.x(item.dateObj)}px`;
  btn.style.top = `${LANE_HEIGHT / 2 + (item.subRowOffset || 0)}px`;
  if (isFocus) btn.classList.add('is-next');

  const label = [
    item.title,
    formatDate(item.dateObj),
    item.points != null ? `${item.points} pts` : null,
    effectiveStatus(item),
    where === 'live' ? 'in range' : where === 'overdue' ? 'past its date' : null,
    item.confirmed ? null : 'not confirmed'
  ]
    .filter(Boolean)
    .join(', ');
  btn.setAttribute('aria-label', label);

  // Hover label. No `title` attribute: the native tooltip is slow and would
  // stack a second box on top of this one.
  btn.dataset.tipTitle = item.title;
  btn.dataset.tipMeta = `${course.code} · ${formatDate(item.dateObj)}`;

  if (isFocus) btn.append(el('span', 'bloom'));

  const dot = el('span', 'dot');
  dot.style.width = `${r * 2}px`;
  dot.style.height = `${r * 2}px`;
  btn.append(dot);

  if (isFocus) {
    const sparkle = el('span', 'sparkle');
    sparkle.append(starSvg(13));
    btn.append(sparkle);
  }

  if (heavy) {
    const caption = el('span', 'node-caption', item.title);
    caption.style.top = `calc(50% + ${r + 8}px)`;
    btn.append(caption);
  }

  btn.addEventListener('click', () => {
    document.querySelectorAll('.node.is-selected').forEach((n) => n.classList.remove('is-selected'));
    btn.classList.add('is-selected');
    ctx.openDetail(item, btn);
  });

  return btn;
}

function buildShelf(course, scale, ctx) {
  const shelf = el('div', 'shelf');
  shelf.style.left = `${scale.x(scale.end) + 24}px`;
  shelf.append(el('div', 'shelf-label', 'Not yet scheduled'));
  course.undated.forEach((item) => {
    const chip = el('button', 'chip');
    chip.dataset.itemId = item.id;
    chip.style.color = course.color;
    chip.append(el('span', 'cdot'), el('span', null, item.title));
    chip.addEventListener('click', () => ctx.openDetail(item, chip));
    shelf.append(chip);
  });
  return shelf;
}

function buildLegend() {
  const legend = el('div', 'legend');
  const rows = [
    ['k', 8, 'In range'],
    ['k out', 8, 'Not yet in range'],
    ['k filled', 8, 'Done'],
    ['k dashed', 8, 'Not confirmed'],
    ['orb', 13, 'Start here']
  ];
  rows.forEach(([cls, size, text]) => {
    const lg = el('div', 'lg');
    const k = el('span', cls === 'orb' ? 'k orb' : cls);
    k.style.width = `${size}px`;
    k.style.height = `${size}px`;
    lg.append(k, el('span', null, text));
    legend.append(lg);
  });
  legend.append(el('div', 'lg', 'Shaded band: crunch zone from the schema'));
  return legend;
}
