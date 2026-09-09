import {
  PX_PER_DAY,
  GUTTER,
  EDGE_PAD_DAYS,
  NODE_SIZE,
  LANE_HEIGHT,
  SUBROW_HEIGHT
} from './config.js';
import { daysBetween, DAY_MS } from './data.js';

export const MAX_CAPTION_WIDTH = 124;

export function isHeavy(item) {
  return item.type === 'exam' || item.type === 'final';
}

// Heavy nodes carry a caption that is usually wider than the dot, so collision
// packing has to reserve the caption's width, not just the radius.
function halfFootprint(item) {
  const r = nodeRadius(item);
  if (!isHeavy(item)) return r + 4;
  const caption = Math.min(MAX_CAPTION_WIDTH, item.title.length * 5.6);
  return Math.max(r + 4, caption / 2 + 6);
}

export function nodeRadius(item) {
  const base = NODE_SIZE[item.type] ?? NODE_SIZE.regular;
  // Nudge size by points within a tier so a 10pt homework reads slightly
  // heavier than a 2.5pt summary, without breaking the type hierarchy.
  if (item.type === 'regular' || item.type === 'recurring') {
    const pts = item.points ?? item.weightPercent ?? 0;
    return base + Math.min(3, Math.sqrt(Math.max(pts, 0)) * 0.55);
  }
  return base;
}

// Time domain covering every dated item plus any crunch zone.
export function buildScale(courses, crunchZones) {
  const dates = courses.flatMap((c) => c.dated.map((it) => it.dateObj));
  crunchZones.forEach((z) => {
    if (z.startObj) dates.push(z.startObj);
    if (z.endObj) dates.push(z.endObj);
  });

  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const start = new Date(min.getTime() - EDGE_PAD_DAYS * DAY_MS);
  const end = new Date(max.getTime() + EDGE_PAD_DAYS * DAY_MS);
  const totalDays = daysBetween(start, end);

  const x = (date) => GUTTER + daysBetween(start, date) * PX_PER_DAY;

  return {
    start,
    end,
    totalDays,
    x,
    trackWidth: GUTTER + totalDays * PX_PER_DAY + 220 // room for the shelf
  };
}

// Month bands and week ticks for the axis header.
export function buildAxis(scale) {
  const months = [];
  const cursor = new Date(scale.start.getFullYear(), scale.start.getMonth(), 1, 12);
  while (cursor <= scale.end) {
    const monthStart = new Date(cursor);
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12);
    const from = monthStart < scale.start ? scale.start : monthStart;
    const to = next > scale.end ? scale.end : next;
    months.push({
      label: monthStart.toLocaleDateString('en-US', { month: 'long' }),
      left: scale.x(from),
      width: Math.max(0, scale.x(to) - scale.x(from))
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const weeks = [];
  const w = new Date(scale.start);
  w.setDate(w.getDate() + ((8 - w.getDay()) % 7)); // first Monday at or after start
  while (w <= scale.end) {
    weeks.push({ left: scale.x(w), date: new Date(w) });
    w.setDate(w.getDate() + 7);
  }

  return { months, weeks };
}

// Group a course's dated items into lanes: one lane per schema group, plus a
// catch-all spine lane for ungrouped items such as the final exam.
export function buildLanes(course, scale) {
  const byGroup = new Map();
  const spine = [];

  course.dated.forEach((item) => {
    if (item.group && course.groupsById.has(item.group)) {
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group).push(item);
    } else {
      spine.push(item);
    }
  });

  const lanes = [];
  course.groups.forEach((group) => {
    const items = byGroup.get(group.id);
    if (items && items.length) {
      lanes.push({ id: group.id, label: group.label, group, items });
    }
  });
  if (spine.length) {
    lanes.push({ id: `${course.id}-spine`, label: 'Milestones', group: null, items: spine });
  }

  lanes.forEach((lane) => {
    lane.items.sort((a, b) => a.dateObj - b.dateObj);
    lane.subRows = packSubRows(lane.items, scale);

    // A lane holding exams needs taller sub-rows and some room underneath so a
    // two-line caption never lands on the node below it.
    const heavy = lane.items.some(isHeavy);
    const rowHeight = heavy ? 66 : SUBROW_HEIGHT;
    lane.items.forEach((item) => {
      item.subRowOffset = item.subRow * rowHeight;
    });
    lane.height =
      LANE_HEIGHT + (lane.subRows - 1) * rowHeight + (heavy ? 26 : 0);
  });

  return lanes;
}

// Two items too close together on the same lane get stacked into sub-rows so
// nothing overlaps. Returns how many sub-rows the lane ended up needing.
function packSubRows(items, scale) {
  const rowEnds = [];
  items.forEach((item) => {
    const half = halfFootprint(item);
    const left = scale.x(item.dateObj) - half;
    const right = scale.x(item.dateObj) + half;
    let row = rowEnds.findIndex((end) => end <= left);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(right);
    } else {
      rowEnds[row] = right;
    }
    item.subRow = row;
  });
  return Math.max(1, rowEnds.length);
}
