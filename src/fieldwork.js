// Pure projections for the Business Lab pipeline. Nothing here reads the store
// or the DOM, so tests can hold every rule against synthetic data.
//
// This module keeps its own noon date parser rather than importing data.js,
// which pulls the schema and cannot load under node. Same rules as there:
// local noon, so day arithmetic never trips over timezones or DST.

const DAY_MS = 86400000;

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = String(str).split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export const CONTACT_STATES = [
  ['identified', 'Identified'],
  ['contacted', 'Contacted'],
  ['scheduled', 'Scheduled'],
  ['interviewed', 'Interviewed'],
  ['no-reply', 'No reply']
];

const active = (record) => record && !record.deletedAt;

/** Contacts still in the pipeline, tombstones excluded, ids attached. */
export function activeContacts(contacts = {}) {
  return Object.entries(contacts)
    .filter(([, record]) => active(record))
    .map(([id, record]) => ({ id, ...record }));
}

/**
 * The health metric. How many sit in contacted right now: that number is the
 * difference between interviews happening and interviews being hoped for.
 */
export function pipelineHealth(contacts = {}) {
  const list = activeContacts(contacts);
  const byState = Object.fromEntries(CONTACT_STATES.map(([state]) => [state, 0]));
  for (const contact of list) byState[contact.state] = (byState[contact.state] || 0) + 1;
  return {
    total: list.length,
    inContacted: byState.contacted,
    scheduled: byState.scheduled,
    interviewed: byState.interviewed,
    identified: byState.identified,
    waiting: byState['no-reply'],
    // A no-reply contact whose follow-up date has come due is the week's work.
    followUpsDue: list.filter((contact) => {
      if (contact.state !== 'no-reply' || !contact.followUp) return false;
      const due = parseDate(contact.followUp);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      return due && due <= endOfToday;
    }).length
  };
}

/**
 * The Mom Test rules, stated where they apply. The questions ask about the
 * last time something happened and what it cost, never about the future,
 * because people are polite about the future and that politeness is data.
 */
export function interviewScript() {
  return {
    rules: [
      'Ask about the last time it happened. Real events carry real details.',
      'Ask what it cost: time, money, workarounds, who else got pulled in.',
      'Talk about their life and their work, not your idea.',
      'Never ask would you. People answer yes to be nice, and the yes means nothing.'
    ],
    questions: [
      'When did you last deal with this yourself? Walk me through that day.',
      'What did that cost you, in time, money, or hassle?',
      'What have you already tried, and what happened?',
      'Who did you last talk to about it, and what did they say?'
    ]
  };
}

const TAGS = [
  ['supports', 'supports the assumption'],
  ['breaks', 'breaks the assumption']
];

export function tagLabel(tag) {
  return (TAGS.find(([key]) => key === tag) || [null, 'sits beside the assumption'])[1];
}

function activeFindings(findings = {}) {
  return Object.entries(findings)
    .filter(([, record]) => active(record))
    .map(([id, record]) => ({ id, ...record }));
}

// A finding belongs to the seven days that end at the update deadline: the
// week of work this update reports on, from the day after the last one.
function inWeekOf(when, deadline, today) {
  const stamp = when ? /^\d{4}-\d{2}-\d{2}$/.test(when) ? parseDate(when) : new Date(when) : today;
  if (Number.isNaN(stamp.getTime())) return false;
  const due = parseDate(deadline);
  if (!due) return true;
  const start = new Date(due.getTime() - 6 * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const end = new Date(due.getTime() + 12 * 3600000);
  return stamp >= start && stamp <= end;
}

/**
 * The weekly update generator. It drafts; the person writes. Assembled from
 * the week's tagged findings and the pipeline state, with the course named,
 * and worded as the starting point it is.
 */
export function weeklyDraft(weekItem, courseCode, findings = {}, contacts = {}, today = new Date()) {
  const weekFindings = activeFindings(findings)
    .filter((finding) => inWeekOf(finding.date, weekItem.date, today))
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const lines = [`${weekItem.title} (${courseCode || 'MGT 4803'})`, '', 'Interview pulse'];
  const health = pipelineHealth(contacts);
  lines.push(
    `Pipeline: ${health.inContacted} in contacted, ${health.scheduled} scheduled, ${health.interviewed} interviewed. ${weekFindings.length} interviews logged for this update.`
  );
  if (weekFindings.length) {
    lines.push('', 'Hypotheses tested this week');
    for (const finding of weekFindings) {
      const who = finding.contactId && contacts[finding.contactId]?.name;
      lines.push(`- ${finding.assumption || 'Assumption to name'}: ${tagLabel(finding.tag)}. ${finding.text}${who ? ` (${who})` : ''}`);
    }
  } else {
    lines.push('', 'Hypotheses tested this week: no findings logged yet.');
  }
  lines.push('', 'What changed', '(write what the evidence changed in the thesis or the next interview)');
  lines.push('', 'Next steps', '(write the next concrete outreach or test, and who owns it)');
  return lines.join('\n');
}

/**
 * Cadence health. A weekly item whose work starts days earlier than its
 * deadline should be caught on Sunday, when the gap still has days to close,
 * and not on Wednesday, when it is already the deadline. Three days is the
 * calendar distance from Sunday to Wednesday. With two prior starts, the
 * latest lead becomes a personal signal instead.
 */
export function cadenceGap(updateItems = [], overlay = {}, now = new Date()) {
  const at = new Date(now);
  at.setHours(12, 0, 0, 0);
  const overlayItems = overlay.items || {};
  const done = (item) => overlayItems[item.id]?.doneAt || item.status === 'done';
  const started = (item) => overlayItems[item.id]?.startedAt || null;
  const dated = updateItems
    .filter((item) => item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const leads = [];
  for (const item of dated) {
    const startAt = started(item);
    if (!startAt) continue;
    const due = parseDate(item.date);
    if (!due) continue;
    const lead = Math.round((due - new Date(startAt)) / DAY_MS);
    if (Number.isFinite(lead) && lead > 0 && lead < 60) leads.push(lead);
  }
  const typicalLead = leads.length >= 2 ? leads[leads.length - 1] : 3;
  const basis = leads.length >= 2 ? 'history' : 'calendar';

  const next = dated.find((item) => !done(item) && parseDate(item.date) > at);
  if (!next) return null;
  const due = parseDate(next.date);
  // The Sunday that opens the week this deadline closes.
  const sunday = new Date(due);
  sunday.setDate(sunday.getDate() - due.getDay());
  sunday.setHours(12, 0, 0, 0);
  if (at < sunday) return null;
  const startBy = new Date(due.getTime() - typicalLead * DAY_MS);
  const gapDays = Math.max(0, Math.round((at - startBy) / DAY_MS));
  return {
    itemId: next.id,
    title: next.title,
    due: next.date,
    typicalLead,
    basis,
    gapDays,
    started: Boolean(started(next))
  };
}
