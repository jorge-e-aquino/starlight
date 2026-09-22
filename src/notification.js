// The sender and the permission preview share this policy. The delivery ledger
// is persisted by the server, so a second device cannot grant another budget.
export const DAILY_REGULAR_LIMIT = 2;

/**
 * A candidate names exactly one item and one action. A quiet day returns [].
 * Exam-morning messages use a separate lane because the original miss was an
 * exam time. The sender must still deduplicate them by candidate id.
 */
export function selectNotifications(candidates, delivered = []) {
  const seen = new Set(delivered.map((entry) => entry.id));
  const used = new Set(delivered.filter((entry) => entry.kind !== 'exam-morning').map((entry) => entry.id)).size;
  let available = Math.max(0, DAILY_REGULAR_LIMIT - used);
  const selected = [];
  const ordered = [...candidates].sort((a, b) =>
    Number(b.kind === 'exam-morning') - Number(a.kind === 'exam-morning') ||
    (b.priority || 0) - (a.priority || 0)
  );

  for (const candidate of ordered) {
    if (!candidate?.id || !candidate.itemId || !candidate.title?.trim() || !candidate.action?.trim()) continue;
    if (seen.has(candidate.id)) continue;
    if (candidate.kind !== 'exam-morning' && available === 0) continue;
    seen.add(candidate.id);
    selected.push(candidate);
    if (candidate.kind !== 'exam-morning') available -= 1;
  }
  return selected;
}

export function morningCandidate(item, dayKey) {
  if (!item || !dayKey || !item.id || !item.courseCode || !item.title) return null;
  return {
    id: `morning:${item.id}:${dayKey}`,
    itemId: item.id,
    kind: 'regular',
    priority: 1,
    title: `${item.courseCode} · ${item.title}`,
    action: 'Open this item in Starlight.'
  };
}

// A periodic observation spends an ordinary notification slot. It never
// asserts that the unverified listed date is the actual deadline.
export function noticingCandidate(item, trust, dayKey) {
  if (!item?.id || !item.courseCode || !item.title || !dayKey || trust?.status === 'verified') return null;
  return {
    id: `notice:date:${item.id}:${dayKey}`, itemId: item.id, kind: 'regular', priority: 5,
    title: `${item.courseCode} · ${item.title}`,
    action: trust?.status === 'contradicted' ? 'Sources disagree on its date. Check the course source.' : 'Its listed date is unchecked. Confirm it from the course source.'
  };
}

export function examReadinessCandidate(item, trust, dayKey, daysAway) {
  if (!item?.id || !item.courseCode || !item.title || !dayKey || ![0, 1, 2].includes(daysAway)) return null;
  const action = trust?.status === 'contradicted'
    ? 'Exam sources disagree. Check the current course instructions.'
    : trust?.status !== 'verified'
      ? 'The listed exam time is unchecked. Check the course source.'
      : daysAway === 0
        ? 'Open the exam brief and check launch details.'
        : 'Open the exam brief and choose a preparation step.';
  return {
    id: `exam:readiness:${item.id}:${dayKey}`,
    itemId: item.id,
    kind: 'regular',
    priority: daysAway === 0 ? 20 : daysAway === 1 ? 13 : 8,
    title: `${item.courseCode} · ${item.title}`,
    action
  };
}

export function prerequisiteReadinessCandidate(gate, exam, trust, dayKey, externallyBlocked) {
  if (!gate?.id || !gate.courseCode || !gate.title || !exam?.title || !dayKey) return null;
  const next = externallyBlocked ? 'Check the blocker and its follow-up.' : 'Complete this setup step.';
  const dateNote = trust?.status === 'verified' ? '' : trust?.status === 'contradicted'
    ? ' Exam sources disagree. Check the current course instructions.'
    : ' Check the listed exam date in the course source.';
  return {
    id: `exam:prerequisite:${gate.id}:${exam.id}:${dayKey}`,
    itemId: gate.id,
    kind: 'regular',
    priority: 24,
    title: `${gate.courseCode} · ${gate.title}`,
    action: `${exam.title} depends on this. ${next}${dateNote}`
  };
}

/** A dossier must support every concrete claim in an exam-morning alert. */
export function examMorningCandidate(item, dossier, trust, dayKey) {
  if (!item || !dossier || trust?.status !== 'verified' || !trust.source || trust.date !== dayKey) return null;
  if (dossier.confirmed !== true || !dossier.startTime || !dossier.location || !dossier.materials) return null;
  return {
    id: `exam:${item.id}:${dayKey}`,
    itemId: item.id,
    kind: 'exam-morning',
    priority: 100,
    title: `${item.courseCode} · ${item.title}`,
    action: `Starts ${dossier.startTime} at ${dossier.location}. Bring ${dossier.materials}.`
  };
}
