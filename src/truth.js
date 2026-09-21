// Pure projections over the semester and its progress overlay. These functions
// never write either input, so screens and later grade tools share one answer.
const TERMINAL = new Set(['absorbed', 'cant-submit']);
const RESOLUTIONS = new Set(['late-eligible', 'makeup-possible', ...TERMINAL]);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const record = (item, overlay) => overlay?.items?.[item.id] || {};
const nonnegative = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const named = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const validTime = (value) => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/** A source-backed user decision is the only way to earn verified status. */
export function dateTrust(item, overlay = { items: {} }) {
  const state = record(item, overlay);
  const decision = state.dateTrust;
  const evidence = own(state, 'dateTrust') ? decision : item.dateEvidence;
  const date = validDate(evidence?.date) ? evidence.date : validDate(item.date) ? item.date : null;
  const time = own(evidence, 'time')
    ? validTime(evidence.time) ? evidence.time : null
    : validTime(item.time) ? item.time : null;
  const source = named(evidence?.source);
  const sources = Array.isArray(evidence?.sources)
    ? evidence.sources.filter((entry) => entry && typeof entry === 'object').map((entry) => ({ ...entry }))
    : [];
  let status = 'unverified';
  if (evidence?.status === 'contradicted') status = 'contradicted';
  else if (decision?.status === 'verified' && source && validDate(decision.date)) status = 'verified';
  return { status, date, time, source, sources };
}

function groupFor(course, item) {
  return (course.groups || []).find((group) => group.id === item.group) || null;
}

function capacity(group) {
  if (!group || !Number.isInteger(group.countTotal) || !Number.isInteger(group.countRequired)) return 0;
  return Math.max(0, group.countTotal - group.countRequired);
}

export function itemValue(course, item) {
  return itemValueOf(course, item);
}

function itemValueOf(course, item) {
  const group = groupFor(course, item);
  const points = nonnegative(item.points) ? item.points
    : nonnegative(group?.pointsPerItem) ? group.pointsPerItem
      : nonnegative(item.weightPercent) && nonnegative(course.totalPoints) && course.totalPoints > 0
        ? item.weightPercent * course.totalPoints / 100 : null;
  const percent = nonnegative(item.weightPercent) ? item.weightPercent
    : points !== null && nonnegative(course.totalPoints) && course.totalPoints > 0
      ? points / course.totalPoints * 100 : null;
  return { points, percent };
}

function resolution(item, overlay) {
  const value = record(item, overlay).resolution;
  return RESOLUTIONS.has(value?.state) ? value : null;
}

/** Cushion balances per group; `allocated` holds the covered item ids. */
export function cushions(course, overlay) {
  return (course.groups || []).map((group) => {
    const available = capacity(group);
    const claims = (course.items || []).filter((item) => {
      const claim = resolution(item, overlay);
      return claim?.state === 'absorbed' && item.group === group.id &&
        (!claim.cushionGroupId || claim.cushionGroupId === group.id);
    }).sort((a, b) => {
      const aAt = record(a, overlay)._t?.resolution || 0;
      const bAt = record(b, overlay)._t?.resolution || 0;
      return aAt - bAt || a.id.localeCompare(b.id);
    });
    const allocated = new Set(claims.slice(0, available).map((item) => item.id));
    return { groupId: group.id, capacity: available, used: allocated.size, left: available - allocated.size, allocated };
  });
}

/**
 * Cost of the recorded outcome. An unresolved external block carries a
 * conditional cost, since the prerequisite still needs completion.
 * Null cost means the schema lacks enough information to compute it.
 */
export function resolutionCost(course, item, overlay = { items: {} }) {
  const claim = resolution(item, overlay);
  const state = record(item, overlay);
  const value = itemValue(course, item);
  const group = groupFor(course, item);
  const cushion = cushions(course, overlay).find((entry) => entry.groupId === group?.id);
  const penalty = nonnegative(claim?.penaltyPercent) ? Math.min(100, claim.penaltyPercent) : 0;
  const result = {
    pointsGone: 0,
    percentGone: 0,
    cushionGroupId: claim?.state === 'absorbed' ? group?.id || null : null,
    cushionsLeft: cushion && cushion.capacity > 0 ? cushion.left : null,
    penaltyPercent: claim?.state === 'late-eligible' ? penalty : null,
    request: claim?.state === 'makeup-possible' ? named(claim.request) : null,
    deadline: validDate(claim?.deadline) ? claim.deadline : null,
    conditionalPoints: 0
  };
  if (!claim) {
    if (state.externalBlock && !state.doneAt && item.status !== 'done') result.conditionalPoints = value.points;
    return result;
  }
  let fraction = 0;
  if (claim.state === 'cant-submit') fraction = 1;
  if (claim.state === 'absorbed' && !cushion?.allocated.has(item.id)) fraction = 1;
  if (claim.state === 'late-eligible') fraction = penalty / 100;
  if (fraction > 0) {
    result.pointsGone = value.points === null ? null : value.points * fraction;
    result.percentGone = value.percent === null ? null : value.percent * fraction;
  }
  if (claim.state === 'late-eligible' || claim.state === 'makeup-possible') {
    result.conditionalPoints = value.points === null ? null : value.points * (1 - fraction);
  }
  return result;
}

function totalKnown(values) {
  return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0);
}

/** Array of course summaries; each keeps item-level evidence beside its total. */
export function resolutionSummary(schema, overlay = { items: {} }) {
  return (schema.courses || []).map((course) => {
    const items = (course.items || []).filter((item) => resolution(item, overlay) || record(item, overlay).externalBlock)
      .map((item) => ({ itemId: item.id, state: resolution(item, overlay)?.state || null, ...resolutionCost(course, item, overlay) }));
    return {
      courseId: course.id,
      courseCode: course.code,
      pointsGone: totalKnown(items.map((item) => item.pointsGone)),
      percentGone: totalKnown(items.map((item) => item.percentGone)),
      conditionalPoints: totalKnown(items.map((item) => item.conditionalPoints)),
      items,
      cushions: cushions(course, overlay).filter((group) => group.capacity > 0)
        .map(({ allocated, ...group }) => group)
    };
  });
}

/**
 * Avoidance, from three independent traces: how many separate days this was
 * offered as the thing to start, how often it was set aside, and how often it
 * was opened and read without beginning. Reported as an observation with a
 * count, never as a verdict, because noticing is the useful part.
 *
 * Pure over the overlay so it runs in tests. signals.js delegates with the
 * live store.
 */
export function avoidance(item, overlay = { items: {} }) {
  const s = record(item, overlay);
  if (s.startedAt || s.doneAt) return null;
  // An item stopped by something broken is evidence of trying, not of circling.
  // Opening an item repeatedly while Honorlock is down must never read as
  // circling, because the avoidance signal has to be trustworthy to be worth
  // anything.
  if (s.externalBlock) return null;
  // A recorded outcome closes the question. Nothing left to start.
  const resolved = resolution(item, overlay)?.state;
  if (resolved === 'absorbed' || resolved === 'cant-submit') return null;

  const focusDays = (s.focusDays || []).length;
  const snoozes = s.snoozes || 0;
  const opens = (s.opens || []).length;
  const openDays = new Set((s.opens || []).map((t) => new Date(t).toDateString())).size;

  const passedOver = focusDays >= 3;
  const setAsideOften = snoozes >= 2;
  const readNotStarted = opens >= 3 && openDays >= 2;
  if (!passedOver && !setAsideOften && !readNotStarted) return null;

  // One sentence, strongest trace first. Piling all three on would read as a
  // case being built against him.
  let sentence;
  if (passedOver) {
    sentence = `This has been your start here item on ${focusDays} separate days and has not been started.`;
  } else if (setAsideOften) {
    sentence = `You have set this aside ${snoozes} times.`;
  } else {
    sentence = `You have opened this ${opens} times across ${openDays} days without starting it.`;
  }

  return { focusDays, snoozes, opens, openDays, sentence };
}

/** Validate the whole graph before any projection can influence urgency. */
export function validatePrerequisites(items) {
  const byId = new Map();
  for (const item of items) {
    if (!item.id || byId.has(item.id)) throw new Error('Prerequisites need unique item IDs.');
    byId.set(item.id, item);
  }
  for (const item of items) {
    if (item.blocks != null && !Array.isArray(item.blocks)) throw new Error(`Invalid prerequisites for ${item.id}.`);
    const targets = new Set();
    for (const edge of item.blocks || []) {
      if (!edge || !byId.has(edge.itemId)) throw new Error(`Unknown prerequisite target for ${item.id}.`);
      if (edge.itemId === item.id) throw new Error(`An item cannot block itself: ${item.id}.`);
      if (!Number.isInteger(edge.leadDays) || edge.leadDays < 0) throw new Error(`Invalid prerequisite lead time for ${item.id}.`);
      if (targets.has(edge.itemId)) throw new Error(`Duplicate prerequisite target for ${item.id}.`);
      targets.add(edge.itemId);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Prerequisite cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const edge of byId.get(id).blocks || []) visit(edge.itemId);
    visiting.delete(id);
    visited.add(id);
  }
  for (const item of items) visit(item.id);
  return true;
}

function completed(item, overlay) {
  // A recorded outcome is an exit from Still open, but it is not completion.
  // An item absorbed by a cushion or one that can't be submitted was not
  // actually done, so it still stands between its targets and getting started.
  return Boolean(record(item, overlay).doneAt || item.status === 'done');
}

function unfulfilled(item, overlay) {
  return !completed(item, overlay);
}

function before(date, leadDays) {
  if (!validDate(date)) return null;
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() - leadDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Score accepts (item, now). A prerequisite inherits each active descendant's
 * score and must fit before its deadline by the lead time on every edge.
 * The map includes every item, so callers can use one projection consistently.
 */
export function prerequisiteProjection(items, overlay, score, now = new Date()) {
  validatePrerequisites(items);
  const byId = new Map(items.map((item) => [item.id, item]));
  const predecessors = new Map(items.map((item) => [item.id, []]));
  items.forEach((item) => (item.blocks || []).forEach((edge) => predecessors.get(edge.itemId).push(item)));
  const projected = new Map();
  function project(item) {
    if (projected.has(item.id)) return projected.get(item.id);
    const done = completed(item, overlay);
    const base = done ? 0 : score(item, now);
    const result = { score: Number.isFinite(base) ? base : 0, deadline: dateTrust(item, overlay).date, unlocks: [], unmet: [] };
    if (!done) {
      const unlocks = new Set();
      for (const edge of item.blocks || []) {
        const target = byId.get(edge.itemId);
        if (completed(target, overlay)) continue;
        const next = project(target);
        result.score = Math.max(result.score, next.score);
        const deadline = before(next.deadline, edge.leadDays);
        if (deadline && (!result.deadline || deadline < result.deadline)) result.deadline = deadline;
        unlocks.add(target.id);
        next.unlocks.forEach((id) => unlocks.add(id));
      }
      result.unlocks = [...unlocks].sort();
      // An edge still stands when the prerequisite was written off rather than
      // completed, so targets behind a written-off prerequisite stay blocked.
      result.unmet = predecessors.get(item.id).filter((source) => unfulfilled(source, overlay)).map((source) => source.id).sort();
    }
    projected.set(item.id, result);
    return result;
  }
  items.forEach(project);
  return projected;
}
