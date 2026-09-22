import { dateTrust } from './truth.js';

function parseDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

export function isExam(item) {
  return item.type === 'exam' || (item.type === 'final' && /\b(exam|test)\b/i.test(item.title));
}

export const DOSSIER_FIELDS = [
  ['startTime', 'Start time'], ['durationMinutes', 'Duration'], ['location', 'Location'],
  ['questionCount', 'Question count'], ['questionFormat', 'Question format'],
  ['materials', 'Materials to bring'], ['cheatSheetRule', 'Cheat sheet rule'],
  ['calculatorPolicy', 'Calculator policy'], ['topicsCovered', 'Topics covered'],
  ['submissionMethod', 'How to finish or submit']
];

export function missingDossier(dossier = {}) {
  const missing = DOSSIER_FIELDS.filter(([key]) => dossier[key] === undefined || dossier[key] === null || dossier[key] === '').map(([, label]) => label);
  if (dossier.cheatSheetRule === 'allowed' && (!Number(dossier.sheetWidth) || !Number(dossier.sheetHeight) || !Number(dossier.sheetPages))) missing.push('Cheat sheet dimensions and pages');
  if (!dossier.source?.trim()) missing.push('Source checked');
  return missing;
}

function dayMinus(date, amount) {
  const result = new Date(date);
  result.setDate(result.getDate() - amount);
  return result.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function prepLadder(exam, overlay = {}) {
  if (!isExam(exam) || !exam.dateObj || overlay.items?.[exam.id]?.doneAt) return [];
  const dossier = overlay.items?.[exam.id]?.examDossier || {};
  const topics = Object.values(overlay.topics || {}).filter((topic) => !topic.deletedAt && (topic.examIds || []).includes(exam.id));
  const weakTopics = topics.slice().sort((a, b) => (a.confidence ?? -1) - (b.confidence ?? -1)).slice(0, 3).map((topic) => topic.title);
  const needsDossier = missingDossier(dossier).length > 0 || !dossier.confirmed;
  const canSheet = dossier.cheatSheetRule === 'allowed' && dossier.sheetWidth && dossier.sheetHeight && dossier.sheetPages;
  const steps = [
    { key: 'rules', lead: 10, title: 'Confirm exam rules', enabled: needsDossier },
    { key: 'topics', lead: 7, title: 'List covered topics', enabled: topics.length === 0 },
    { key: 'first-pass', lead: 5, title: 'First pass on weak topics', enabled: topics.length > 0 },
    { key: 'sheet-draft', lead: 3, title: 'Draft the cheat sheet', enabled: canSheet },
    { key: 'sheet-final', lead: 1, title: 'Finalize and print the sheet', enabled: canSheet },
    { key: 'morning', lead: 0, title: 'Check time, place, and what to bring', enabled: dossier.confirmed }
  ];
  const trust = dateTrust(exam, overlay);
  return steps.filter((step) => step.enabled).map((step) => ({
    ...step, id: `prep:${exam.id}:${step.key}`, examId: exam.id, courseId: exam.courseId,
    courseCode: exam.courseCode, examTitle: exam.title,
    weakTopics: step.key === 'first-pass' ? weakTopics : [],
    date: dayMinus(exam.dateObj, step.lead),
    get dateObj() { return parseDate(this.date); },
    dateUnverified: trust.status !== 'verified',
    dateState: trust.status === 'contradicted' ? 'sources disagree' : 'date unchecked'
  }));
}

export function upcomingPrep(exams, overlay, now = new Date()) {
  const day = parseDate(now.toLocaleDateString('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }));
  return exams.flatMap((exam) => prepLadder(exam, overlay))
    .filter((step) => step.dateObj && step.dateObj <= new Date(day.getTime() + 10 * 86400000) &&
      !overlay.items?.[step.id]?.doneAt && (!exams.find((exam) => exam.id === step.examId)?.dateObj || day <= exams.find((exam) => exam.id === step.examId).dateObj))
    .sort((a, b) => a.dateObj - b.dateObj);
}

export function prepLabel(step) {
  return `${step.courseCode} · ${step.examTitle} · ${step.dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${step.dateUnverified ? ` · ${step.dateState}` : ''}`;
}

export function priorExamDebrief(exam, items, overlay = {}) {
  return items.filter((item) => isExam(item) && item.courseId === exam.courseId && item.id !== exam.id &&
    item.dateObj && (!exam.dateObj || item.dateObj < exam.dateObj) && overlay.items?.[item.id]?.examDebrief)
    .sort((a, b) => b.dateObj - a.dateObj)
    .map((item) => ({ title: item.title, ...overlay.items[item.id].examDebrief }))[0] || null;
}
