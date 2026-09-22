import { dateTrust, resolutionCost, itemValue } from './truth.js';

const STOP = new Set(['what', 'when', 'where', 'which', 'does', 'about', 'with', 'from', 'this', 'that', 'have', 'need', 'should', 'could', 'would', 'tell', 'please', 'course', 'assignment', 'exam', 'test', 'date', 'due', 'time']);
const terms = (text) => (String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((word) => !STOP.has(word));
const words = (text) => new Set(terms(text));
const overlap = (query, text) => terms(query).reduce((count, term) => count + (words(text).has(term) ? 1 : 0), 0);

export function evidenceFor(question, items, courses, overlay, materials = [], { itemId = null, includeBehavior = false } = {}) {
  const evidence = [];
  const query = question.trim();
  const courseById = new Map(courses.map((course) => [course.id, course]));
  for (const item of items) {
    const state = overlay.items?.[item.id] || {};
    const course = courseById.get(item.courseId);
    const title = item.title.toLowerCase();
    const direct = query.toLowerCase().includes(`${course?.code || ''} ${title}`) ? 30
      : title.length > 4 && query.toLowerCase().includes(title) ? 12 : 0;
    const score = overlap(query, `${course?.code} ${course?.name} ${item.title} ${item.notes}`) + direct +
      (/\b(block|blocking|gate|unlock)/i.test(query) && item.blocks?.length ? 7 : 0) + (item.id === itemId ? 20 : 0);
    if (!score) continue;
    const trust = dateTrust(item, overlay);
    const value = course ? itemValue(course, item) : { points: item.points, percent: item.weightPercent };
    const cost = state.resolution && course ? resolutionCost(course, item, overlay) : null;
    const when = trust.status === 'verified' ? `Verified ${trust.date}${trust.time ? ` ${trust.time}` : ' (time unknown)'}; source: ${trust.source}`
      : trust.status === 'contradicted' ? 'Sources disagree about the date or time; ask the user to check.'
        : 'Date and time are unverified; ask the user to confirm before relying on them.';
    const detail = [`${course?.code || item.courseId} · ${item.title}`, when,
      value.points != null ? `${value.points} points` : value.percent != null ? `${value.percent}% of course` : '',
      state.score != null ? `Posted score: ${state.score}${value.points != null ? ` of ${value.points} points` : ''}` : '',
      cost?.pointsGone ? `Recorded loss: ${cost.pointsGone} points${cost.percentGone != null ? `, ${cost.percentGone.toFixed(1)}% of course` : ''}` : '',
      state.resolution?.state ? `Outcome: ${state.resolution.state}` : '',
      state.externalBlock ? 'Externally blocked' : '',
      state.doneAt ? 'Marked done' : '',
      item.blocks?.length ? `Unlocks: ${item.blocks.map((edge) => {
        const id = typeof edge === 'string' ? edge : edge.itemId;
        return items.find((target) => target.id === id)?.title || id;
      }).join(', ')}` : '', item.notes || ''].filter(Boolean).join('. ');
    evidence.push({ id: `item:${item.id}`, kind: 'item', itemId: item.id, title: `${course?.code || item.courseId} · ${item.title}`, text: detail, score, trust: trust.status });
    if (includeBehavior && state.opens?.length) evidence.push({ id: `behavior:${item.id}`, kind: 'behavior', itemId: item.id,
      title: `${course?.code || item.courseId} · interaction history`, text: `${state.opens.length} recorded opens.`, score: score - 1 });
  }
  for (const [id, note] of Object.entries(overlay.notes || {})) {
    if (note.deletedAt) continue;
    const score = overlap(query, `${note.title} ${note.text}`);
    if (score) evidence.push({ id: `note:${id}`, kind: 'note', title: note.title, text: note.text.slice(0, 2000), score });
  }
  for (const fact of Object.values(overlay.courseFacts || {})) {
    if (fact.deletedAt || !fact.confirmedAt) continue;
    const course = courseById.get(fact.courseId);
    const score = overlap(query, `${course?.code} ${course?.name} ${fact.kind} ${fact.source}`);
    if (score) evidence.push({ id: `fact:${fact.courseId}:${fact.kind}`, kind: 'fact', title: `${course?.code || fact.courseId} · ${fact.kind}`,
      text: `${JSON.stringify(fact.value)}. Source: ${fact.source}`, score });
  }
  for (const material of materials) {
    const score = overlap(query, `${material.courseCode || ''} ${material.name} ${material.text}`);
    if (!score) continue;
    const pages = String(material.text).split('\f');
    pages.forEach((page, index) => {
      const relevant = page.split(/(?<=[.!?])\s+|\n+/).find((sentence) => overlap(query, sentence));
      if (relevant) evidence.push({ id: `file:${material.id || material.name}:${index + 1}`, kind: 'file', title: `${material.name}, page ${index + 1}`,
        text: relevant.trim().slice(0, 900), score: score + overlap(query, relevant) });
    });
  }
  return evidence.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 8);
}

export function localAnswer(question, evidence) {
  const first = evidence[0];
  if (!first) return 'I cannot connect that question to a saved item or material yet. Add a course file in Materials or name an item.';
  if (/\b(when|date|time|due)\b/i.test(question) && first.kind === 'item') {
    if (first.trust !== 'verified') return first.trust === 'contradicted'
      ? `Sources disagree for ${first.title}. Open its date and sources to resolve them.`
      : `${first.title} has no verified date or time. Open its date and sources to confirm it.`;
    return `${first.title}: ${first.text.split('. ').find((part) => part.startsWith('Verified'))}.`;
  }
  if (/\b(block|blocking|gate|unlock)/i.test(question) && first.kind === 'item') {
    const unlocked = /Unlocks: ([^.]+)/.exec(first.text)?.[1];
    return unlocked ? `${first.title} unlocks ${unlocked}. ${first.text.includes('Externally blocked') ? 'It is currently blocked by an external issue.' : 'Open it to check the next step.'}`
      : `${first.title} is externally blocked. Open it to see what it is waiting on.`;
  }
  if (first.kind === 'file' || first.kind === 'note') return `${first.title}: ${first.text}`;
  if (/\b(grade|score|lost|lose|cost)\b/i.test(question) && first.kind === 'item') {
    const grade = first.text.split('. ').filter((part) => /Posted score:|Recorded loss:/.test(part)).join('. ');
    return grade ? `${first.title}: ${grade}.` : `${first.title} has no posted score or confirmed loss here yet. Open its grade detail to check.`;
  }
  return `Start with ${first.title}. ${first.text.split('. ').filter((part) => /points|% of course|Outcome:|Externally blocked|Marked done|Unlocks:/.test(part)).slice(0, 3).join('. ') || 'Open the item for its next step.'}`;
}

export function modelContext(evidence) {
  return evidence.map((entry, index) => `[E${index + 1}] ${entry.title}: ${entry.text}`).join('\n');
}

export function citedAnswer(text, evidence) {
  const cited = [...String(text).matchAll(/\[E(\d+)\]/g)].map((match) => Number(match[1]));
  if (!cited.length || cited.some((number) => number < 1 || number > evidence.length)) return null;
  return { text: String(text).trim(), citations: [...new Set(cited)].map((number) => evidence[number - 1]) };
}
