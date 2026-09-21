import { gradePath, pointsAtRisk, dayExposure, courseStanding } from './grade.js';
import { itemValue } from './truth.js';
import { formatDate } from './data.js';
import * as store from './state.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function buildScoreForm(item, course, ctx) {
  if (item.gradingRole === 'milestone' || item.gradingRole === 'extra-credit') return null;
  const progress = store.itemState(item.id);
  if (progress.externalBlock || ['cant-submit', 'absorbed'].includes(progress.resolution?.state)) return null;
  const max = course.totalPoints != null ? itemValue(course, item).points : item.weightPercent;
  if (max == null) return null;
  const section = el('section', 'block score-entry');
  section.append(el('h3', null, 'Recorded score'));
  const form = el('form', 'score-form');
  const label = el('label', 'truth-field');
  const unit = course.totalPoints != null ? 'points' : 'course percentage points';
  label.append(el('span', 'truth-label', `${unit} earned, out of ${max}`));
  const input = el('input', 'truth-input');
  input.type = 'number'; input.min = '0'; input.max = String(max); input.step = 'any';
  input.value = progress.score ?? '';
  label.append(input);
  const save = el('button', 'act small', 'Save score');
  save.type = 'submit';
  const error = el('p', 'truth-error');
  error.setAttribute('role', 'alert'); error.hidden = true;
  form.append(label, save, error);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value) || value < 0 || value > max) {
      error.textContent = `Enter a score from 0 to ${max}.`; error.hidden = false; input.focus(); return;
    }
    ctx.act(() => store.setScore(item.id, value));
  });
  section.append(form);
  if (progress.score != null) {
    const clear = el('button', 'linky', 'Clear recorded score');
    clear.type = 'button';
    clear.addEventListener('click', () => ctx.act(() => store.setScore(item.id, null)));
    section.append(clear);
  }
  return section;
}

const W = 320;
const H = 110;
const PAD = 6;

function seriesFor(course, overlay) {
  const marks = gradePath(course, overlay);
  return { marks, heavy: marks.filter((mark) => mark.heavy).map((mark) => ({ ...mark, courseCode: course.code })) };
}

function xFor(index, count) {
  if (count <= 1) return W / 2;
  return PAD + (index / (count - 1)) * (W - PAD * 2);
}

function yFor(percent) {
  return H - PAD - (Math.max(0, Math.min(100, percent)) / 100) * (H - PAD * 2);
}

// Three polylines. A null ceiling draws as a gap rather than dropping to a
// number, because a number there would be invented certainty.
function chartSVG(combined) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'grade-chart');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Grade path over the term: floor if nothing more is done, ceiling if everything left goes perfectly, and current standing');
  for (const { key, cls } of [
    { key: 'ceiling', cls: 'track-ceiling' },
    { key: 'floor', cls: 'track-floor' },
    { key: 'current', cls: 'track-current' }
  ]) {
    let d = '';
    let pen = false;
    combined.marks.forEach((mark, index) => {
      const value = mark[key];
      if (value === null || value === undefined) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${xFor(index, combined.marks.length).toFixed(1)} ${yFor(value).toFixed(1)} `;
      pen = true;
    });
    if (d) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d.trim());
      path.setAttribute('class', cls);
      svg.append(path);
    }
  }
  // Markers where the remaining large items sit.
  combined.heavy.forEach((exam) => {
    const index = combined.marks.findIndex((mark) => mark.date === exam.date);
    if (index < 0) return;
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', xFor(index, combined.marks.length).toFixed(1));
    dot.setAttribute('cy', yFor(combined.marks[index].ceiling ?? 100).toFixed(1));
    dot.setAttribute('r', 2.5);
    dot.setAttribute('class', 'exam-mark');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = `${exam.courseCode} ${exam.title}`;
    dot.append(title);
    svg.append(dot);
  });
  return svg;
}

function ledgerLine(standing) {
  if (!standing.gradedCount) return `${standing.courseCode}: no outcomes or scores recorded yet.`;
  const parts = [`${standing.courseCode}: ${standing.gradedCount} of ${standing.itemCount} items have outcomes or submissions`];
  if (standing.unscoredCount) {
    parts.push(`${standing.unscoredCount} without a recorded score`);
  }
  parts.push(standing.scoredCount ? `standing on recorded scores ${standing.earnedPercent.toFixed(0)}%` : 'no scores recorded yet');
  return `${parts.join(', ')}.`;
}

// Courses carry unresolved weight questions, like the ECON midterm totals.
function unresolvedNotes(map) {
  const notes = [];
  for (const course of map.courses) {
    const standing = courseStanding(course, store.snapshot());
    if (!standing.reconciled) notes.push(`${course.code}: the listed graded weights add to ${standing.modeledTotal ?? 'an unknown amount'} against ${standing.totalPoints ?? 'an unknown course total'}. Starlight leaves this course out of the grade path until the rule is confirmed.`);
    for (const group of course.groups || []) {
      if (/UNRESOLVED/i.test(group.note || '')) notes.push(`${course.code}: ${group.note}`);
    }
  }
  return notes;
}

/**
 * The grade path: three tracks over the term, plus the honest state of the
 * ledger underneath them. Lives on Plan, never on Now.
 */
export function buildGradeSection(map) {
  const section = el('section', 'grade-path');
  section.append(el('h3', 'section-head', 'Where the grades stand'));

  const overlay = store.snapshot();
  const charts = el('div', 'grade-charts');
  for (const course of map.courses) {
    const standing = courseStanding(course, overlay);
    if (!standing.reconciled) continue;
    const series = seriesFor(course, overlay);
    if (series.marks.length < 2) continue;
    const chart = el('details', 'grade-course-path');
    const base = course.attendancePolicy || course.peerFactorRange ? 'base ceiling' : 'ceiling';
    const label = el('summary', null, `${course.code} · ${base} ${standing.ceilingPercent.toFixed(1)}% · floor ${standing.floorPercent.toFixed(1)}%`);
    chart.append(label, chartSVG(series));
    charts.append(chart);
  }
  if (charts.childElementCount) {
    charts.firstElementChild.open = true;
    section.append(charts, el('p', 'grade-legend', 'Each course has its own scale. Dashed: ceiling if remaining work goes perfectly. Solid: floor if nothing more is done. Accent: standing on recorded scores. Dots mark large work.'));
  }

  const list = el('ul', 'grade-courses');
  for (const course of map.courses) {
    const standing = courseStanding(course, overlay);
    if (standing.totalPoints === null) continue;
    list.append(el('li', 'grade-course', ledgerLine(standing)));
  }
  section.append(list);

  const anyScored = map.courses.some((course) => courseStanding(course, overlay).scoredCount > 0);
  if (!anyScored) {
    section.append(
      el(
        'p',
        'grade-fine',
        'No scores are recorded yet. Marking work submitted is not the same as a score; the standing starts when real scores land here.'
      )
    );
  }

  unresolvedNotes(map).forEach((note) => section.append(el('p', 'grade-conflict', note)));
  map.courses.filter((course) => course.peerFactorRange).forEach((course) => {
    section.append(el('p', 'grade-conflict', `${course.code}: the base chart uses assignment weights. Attendance has ${course.attendancePolicy.freeAbsences} free absences, then ${course.attendancePolicy.courseGradePointsPerAdditionalAbsence} course-grade points off per additional absence. The peer factor ranges from ${course.peerFactorRange.min} to ${course.peerFactorRange.max}; its exact application is not confirmed, so it is not included in the chart.`));
  });
  return section;
}

/** Points at risk, for the Plan header where verdicts already are. */
export function pointsAtRiskLine(map, phase) {
  const risk = pointsAtRisk(map.courses, store.snapshot(), phase);
  if (!risk.count) return null;
  const line = el('p', 'plan-risk');
  const parts = risk.byCourse.map((entry) => `${entry.code} ${entry.percent === null ? 'weight unknown' : `${entry.percent.toFixed(1)}% of course grade`}`);
  line.textContent = `In range and unstarted: ${parts.join(' · ')}.`;
  return line;
}

/**
 * The next heavily loaded day, flagged before it arrives. One day carrying
 * many high-value deadlines is one event, and it is visible in advance.
 */
export function dayExposureLine(map, phase) {
  const days = dayExposure(map.courses, store.snapshot(), phase);
  if (!days.length) return null;
  const day = days[0];
  const names = day.items.map((item) => `${item.title} (${item.courseCode})`).join(', ');
  const weights = [...new Set(day.items.map((item) => item.courseCode))].map((code) => {
    const own = day.items.filter((item) => item.courseCode === code);
    const points = own.map((item) => item.gradePoints);
    const percents = own.map((item) => item.gradePercent);
    if (points.every((value) => value !== null)) return `${code} ${points.reduce((sum, value) => sum + value, 0)} points`;
    if (percents.every((value) => value !== null)) return `${code} ${percents.reduce((sum, value) => sum + value, 0).toFixed(1)}%`;
    return `${code} weight unknown`;
  }).join(' · ');
  const line = el('p', 'plan-exposure');
  line.textContent = `${formatDate(day.date, { weekday: 'long', month: 'short', day: 'numeric' })} carries ${weights} across ${day.items.length} deadlines: ${names}. Worth splitting the work before that day.`;
  return line;
}
