import schema from '../course_map_schema_v2.json';
import { ENABLED_COURSES } from './config.js';

// Parse a YYYY-MM-DD string at local noon so day arithmetic never trips over
// timezone offsets or DST.
export function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export const DAY_MS = 86400000;

export function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

export function formatDate(date, opts = { month: 'short', day: 'numeric' }) {
  if (!date) return 'No date set';
  return date.toLocaleDateString('en-US', opts);
}

// How heavy an item is when breaking a tie for "next up": exams outrank
// coursework, then raw points, then the order it appears in the schema.
function tieWeight(item) {
  if (item.type === 'final') return 3;
  if (item.type === 'exam') return 2;
  return 1;
}

function normalizeItem(item, course, index) {
  return {
    ...item,
    courseId: course.id,
    courseCode: course.code,
    courseColor: course.color,
    dateObj: parseDate(item.date),
    confirmed: item.confirmed !== false,
    points: item.points ?? null,
    weightPercent: item.weightPercent ?? null,
    steps: item.steps ?? null,
    notes: item.notes || '',
    schemaIndex: index,
    tieWeight: tieWeight(item)
  };
}

function normalizeCourse(course) {
  const items = course.items.map((item, i) => normalizeItem(item, course, i));
  const groupsById = new Map(course.groups.map((g) => [g.id, g]));
  const scored = items.filter((it) => it.type !== 'standing');
  const done = scored.filter((it) => it.status === 'done');
  return {
    ...course,
    items,
    groupsById,
    standing: items.filter((it) => it.type === 'standing'),
    // Everything with a date lands on the timeline; the rest goes to the
    // unscheduled shelf at the right edge.
    dated: items.filter((it) => it.type !== 'standing' && it.dateObj),
    undated: items.filter((it) => it.type !== 'standing' && !it.dateObj),
    progress: {
      doneCount: done.length,
      totalCount: scored.length,
      donePoints: done.reduce((sum, it) => sum + (it.points || 0), 0),
      totalPoints: course.totalPoints ?? null
    }
  };
}

export function listCourseIds() {
  return schema.courses.map((c) => c.id);
}

export function loadMap() {
  const enabled = new Set(ENABLED_COURSES);
  const known = new Set(listCourseIds());

  // A typo in ENABLED_COURSES would otherwise just drop a course silently.
  const unknown = ENABLED_COURSES.filter((id) => !known.has(id));
  if (unknown.length) {
    throw new Error(
      `Unknown course id(s) in ENABLED_COURSES: ${unknown.join(', ')}. ` +
        `The schema defines: ${[...known].join(', ')}`
    );
  }

  const courses = schema.courses
    .filter((c) => enabled.has(c.id))
    .map(normalizeCourse);

  if (!courses.length) {
    throw new Error(
      `No courses enabled. ENABLED_COURSES contains ${JSON.stringify(
        ENABLED_COURSES
      )} but the schema has: ${listCourseIds().join(', ')}`
    );
  }

  const crunchZones = (schema.crunchZones || []).map((z) => ({
    ...z,
    startObj: parseDate(z.start),
    endObj: parseDate(z.end)
  }));

  return {
    lastUpdated: parseDate((schema.lastUpdated || '').slice(0, 10)),
    courses,
    crunchZones,
    allItems: courses.flatMap((c) => c.items),
    courseById: new Map(courses.map((c) => [c.id, c])),
    allCourseCount: schema.courses.length
  };
}
