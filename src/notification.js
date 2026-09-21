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
