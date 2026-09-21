// Pure grade math over the schema, the overlay, and hypothetical scores.
// Nothing here reads the store or the DOM, so tests can hold it against the
// real numbers in STARLIGHT_FINDINGS.md without a browser.
//
// The one rule this module refuses to break: marking something submitted does
// not score it. A done item with no recorded score stays in the incomplete
// ledger, and standing built only from known scores says so rather than
// quietly treating ungraded work as zero or as full credit.
import { itemValue, cushions as groupCushions } from './truth.js';

const record = (overlay, id) => (overlay?.items?.[id] || {});
const known = (value) => typeof value === 'number' && Number.isFinite(value);
const gradedItem = (item) => item.gradingRole !== 'milestone' && item.gradingRole !== 'extra-credit' && (item.type !== 'standing' || known(item.weightPercent));
const valueOf = (course, item) => known(course.totalPoints) ? itemValue(course, item).points : known(item.weightPercent) ? item.weightPercent : null;

/**
 * What one item contributes to the three tracks. Ceiling keeps what is still
 * recoverable; floor assumes nothing more works out. A written-off item
 * contributes zero. An item absorbed by a cushion keeps its value while the
 * group's cushion balance lasts; truth.js decides which claims get the balance.
 */
function contribution(course, item, overlay, hypothetical, covered) {
  const points = valueOf(course, item);
  const state = record(overlay, item.id);
  const res = state.resolution?.state;
  const done = Boolean(state.doneAt || item.status === 'done');
  const score = Object.hasOwn(hypothetical, item.id) ? hypothetical[item.id] : state.score;
  const scored = known(score);

  const out = { points, earned: null, ceiling: null, floor: null, graded: false, scored };
  if (points === null) return out;

  if (res === 'cant-submit' || (res === 'absorbed' && !covered)) {
    // Locked loss, known by policy rather than inferred from a score.
    out.graded = true;
    out.earned = 0;
    out.ceiling = 0;
    out.floor = 0;
    return out;
  }
  if (res === 'absorbed') {
    out.graded = true;
    // A drop removes this item from the counted set. It earns no points.
    out.earned = 0;
    out.ceiling = 0;
    out.floor = 0;
    return out;
  }
  if (res === 'late-eligible') {
    const penalty = Math.min(100, Math.max(0, state.resolution.penaltyPercent ?? 0));
    out.graded = true;
    out.ceiling = points * (1 - penalty / 100);
    out.floor = 0;
    return out;
  }
  if (res === 'makeup-possible') {
    out.graded = true;
    out.ceiling = points;
    out.floor = 0;
    return out;
  }
  if (done || scored) {
    out.graded = true;
    // A submission without a recorded score earns nothing yet. The ceiling
    // still counts its full value as recoverable; the floor counts none of
    // it. Neither number is a claim about the grade.
    if (scored) {
      out.earned = Math.min(points, Math.max(0, score));
      out.ceiling = out.earned;
      out.floor = out.earned;
    } else {
      out.ceiling = points;
    }
    return out;
  }
  // Not done, no outcome: the full value is still available, nothing earned.
  out.ceiling = points;
  out.floor = 0;
  return out;
}

/** True when this item's absorbed claim is inside its group's cushion balance. */
export function cushionCovered(course, item, overlay) {
  const state = record(overlay, item.id);
  if (state.resolution?.state !== 'absorbed') return false;
  const group = groupCushions(course, overlay).find((entry) => entry.groupId === item.group);
  return Boolean(group?.allocated.has(item.id));
}

function partsFor(course, overlay, hypothetical) {
  return (course.items || []).filter(gradedItem).map((item) => ({
    item,
    part: contribution(course, item, overlay, hypothetical, cushionCovered(course, item, overlay))
  }));
}

function replacement(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) - Math.min(...values) + values.reduce((a, b) => a + b, 0) / values.length;
}

function scenarioTotal(course, entries, field) {
  if (entries.some(({ part }) => part.points === null || part[field] === null)) return null;
  const groups = new Map((course.groups || []).map((group) => [group.id, group]));
  const buckets = new Map();
  for (const { item, part } of entries) {
    const key = item.group && groups.has(item.group) ? item.group : item.id;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(field === 'points' ? part.points : part[field]);
  }
  let sum = 0;
  for (const [key, values] of buckets) {
    const group = groups.get(key);
    if (group?.scoreRule === 'replace-lowest-with-mean') sum += replacement(values);
    else sum += [...values].sort((a, b) => b - a).slice(0, group?.countRequired ?? values.length).reduce((a, b) => a + b, 0);
  }
  return sum;
}

/**
 * Where one course stands. The ledger fields report what the numbers are built
 * on, so a caller can say how thin the basis is instead of presenting it as
 * settled fact.
 */
export function courseStanding(course, overlay = { items: {} }, hypothetical = {}) {
  const total = known(course.totalPoints) ? course.totalPoints : (course.items || []).some((item) => known(item.weightPercent)) ? 100 : null;
  const entries = partsFor(course, overlay, hypothetical);
  const parts = entries.map(({ part }) => part);
  const modeledTotal = scenarioTotal(course, entries, 'points');
  const reconciled = total !== null && modeledTotal !== null && Math.abs(modeledTotal - total) < 0.01;
  const ceilingPoints = scenarioTotal(course, entries, 'ceiling');
  const floorPoints = scenarioTotal(course, entries, 'floor');
  const scoredParts = parts.filter((part) => part.scored);
  const earned = scoredParts.reduce((sum, part) => sum + part.earned, 0);
  const scoredBasis = scoredParts.reduce((sum, part) => sum + part.points, 0);

  return {
    courseId: course.id,
    courseCode: course.code,
    totalPoints: total,
    modeledTotal,
    reconciled,
    itemCount: parts.length,
    gradedCount: parts.filter((part) => part.graded).length,
    scoredCount: scoredParts.length,
    // Graded but unscored: submitted, and the grade still says nothing about it.
    unscoredCount: parts.filter((part) => part.graded && !part.scored).length,
    earnedPoints: scoredParts.length ? earned : null,
    earnedPercent: scoredBasis > 0 ? earned / scoredBasis * 100 : null,
    ceilingPoints,
    floorPoints,
    ceilingPercent: reconciled ? ceilingPoints / total * 100 : null,
    floorPercent: reconciled ? floorPoints / total * 100 : null,
    cushions: groupCushions(course, overlay)
      .filter((group) => group.capacity > 0)
      .map(({ allocated, ...group }) => group)
  };
}

/**
 * The three tracks over the term, one mark per dated item in date order. The
 * floor is what the final grade is if nothing more is done; the ceiling is it
 * if everything left goes perfectly. Current standing is drawn only where
 * known scores exist, so the line starts when the first real score lands.
 */
export function gradePath(course, overlay = { items: {} }, hypothetical = {}) {
  const items = (course.items || [])
    .filter((it) => gradedItem(it) && it.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items.map((item) => {
    const itemsAt = Object.fromEntries(Object.entries(overlay.items || {}).filter(([id]) => {
      const target = (course.items || []).find((candidate) => candidate.id === id);
      return target?.date && target.date <= item.date;
    }));
    const scoresAt = Object.fromEntries(Object.entries(hypothetical || {}).filter(([id]) => {
      const target = (course.items || []).find((candidate) => candidate.id === id);
      return target?.date && target.date <= item.date;
    }));
    const standing = courseStanding(course, { ...overlay, items: itemsAt }, scoresAt);
    return {
      date: item.date,
      itemId: item.id,
      title: item.title,
      heavy: item.type === 'exam' || item.type === 'final',
      ceiling: standing.ceilingPercent,
      floor: standing.floorPercent,
      current: standing.earnedPercent
    };
  });
}

/**
 * Total weight of everything live and unstarted, computed per course so item
 * values resolve through their group rules. Written off, blocked, and done
 * items carry no risk; their question is already answered. This lives in the
 * Plan header where verdicts already are, and never on the Now surface.
 */
export function pointsAtRisk(courses, overlay = { items: {} }, phase) {
  const entries = [];
  for (const course of courses) {
    for (const item of course.items) {
      const when = item.dateObj || (item.date ? new Date(`${item.date}T12:00:00`) : null);
      if (item.type === 'standing' || !gradedItem(item) || !when || Number.isNaN(when.getTime())) continue;
      const where = phase(item);
      if (where !== 'live' && where !== 'overdue') continue;
      const state = record(overlay, item.id);
      if (state.doneAt || item.status === 'done') continue;
      if (state.externalBlock) continue;
      const res = state.resolution?.state;
      if (res === 'cant-submit' || res === 'absorbed') continue;
      if (res === 'late-eligible' && (state.resolution.penaltyPercent ?? 0) >= 100) continue;
      entries.push({ course, item, value: itemValue(course, item).points, percent: itemValue(course, item).percent });
    }
  }
  const knownEntries = entries.filter((entry) => entry.value !== null);
  return {
    items: entries.map((entry) => ({ ...entry.item, courseCode: entry.course.code })),
    points: knownEntries.reduce((sum, entry) => sum + entry.value, 0),
    // A ledger that does not know what something is worth cannot total it.
    hasUnknownWeight: entries.length > knownEntries.length,
    count: entries.length,
    byCourse: courses.map((course) => {
      const own = entries.filter((entry) => entry.course.id === course.id);
      return {
        code: course.code,
        count: own.length,
        points: own.reduce((sum, entry) => sum + (entry.value ?? 0), 0),
        percent: own.every((entry) => entry.percent !== null) ? own.reduce((sum, entry) => sum + entry.percent, 0) : null
      };
    }).filter((entry) => entry.count)
  };
}

/**
 * Exposure by day. The September 17 failure was one event: two 9 point items
 * due the same day, nothing flagging that a single day carried 18 points. A
 * day is exposed when its unstarted weight reaches the threshold. Days already
 * gone are history; only the ones ahead can still be split.
 */
export function dayExposure(courses, overlay = { items: {} }, phase, { threshold = 8, horizonDays = 45, at = new Date() } = {}) {
  const byDay = new Map();
  const today = new Date(at);
  today.setHours(12, 0, 0, 0);
  for (const course of courses) {
    for (const item of course.items) {
      const when = item.dateObj || (item.date ? new Date(`${item.date}T12:00:00`) : null);
      if (item.type === 'standing' || !gradedItem(item) || !when || Number.isNaN(when.getTime())) continue;
      if (when < today) continue;
      if ((when - today) / 86400000 > horizonDays) continue;
      const state = record(overlay, item.id);
      if (state.doneAt || item.status === 'done') continue;
      if (state.externalBlock) continue;
      const res = state.resolution?.state;
      if (res === 'cant-submit' || res === 'absorbed') continue;
      const { points: value, percent } = itemValue(course, item);
      const key = when.toDateString();
      const day = byDay.get(key) || { date: when, items: [], points: 0, unknownWeight: false };
      day.items.push({ ...item, courseCode: course.code, gradePoints: value, gradePercent: percent });
      if (value === null && percent === null) day.unknownWeight = true;
      else day.points += value;
      byDay.set(key, day);
    }
  }
  // One event, several deadlines: a single item due on a day is the normal
  // texture of a term, and flagging it would cry wolf.
  return [...byDay.values()]
    .filter((day) => day.items.length > 1 && (day.points >= threshold || day.unknownWeight))
    .sort((a, b) => a.date - b.date);
}
