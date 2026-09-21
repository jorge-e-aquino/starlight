import { formatDate, parseDate } from './data.js';
import {
  CONTACT_STATES,
  activeContacts,
  cadenceGap,
  interviewScript,
  pipelineHealth,
  tagLabel,
  weeklyDraft
} from './fieldwork.js';
import * as store from './state.js';
import { dateTrust } from './truth.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(form, label, value = '', name, type = 'text') {
  const wrap = el('label', 'truth-field');
  const input = el(type === 'textarea' ? 'textarea' : 'input', 'truth-input');
  if (type !== 'textarea') input.type = type;
  input.name = name || label.toLowerCase().replace(/[^a-z]+/g, '-');
  input.value = value || '';
  if (type === 'textarea') input.rows = 2;
  wrap.append(el('span', 'truth-label', label), input);
  form.append(wrap);
  return input;
}

function formError(form) {
  const error = el('p', 'truth-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  form.append(error);
  return error;
}

function fail(error, message, input) {
  error.textContent = message;
  error.hidden = false;
  input?.focus();
}

const COURSE = 'MGT 4803';

function newId(prefix, at = Date.now()) {
  return `${prefix}-${at.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function contactRows(ctx) {
  const wrap = el('div', 'field-contacts');
  const contacts = activeContacts(store.snapshot().contacts);
  if (!contacts.length) {
    wrap.append(
      el('p', 'field-empty', `No contacts in the ${COURSE} pipeline yet. Add the first person you plan to reach out to; the week's interviews come from the week's messages.`)
    );
    return wrap;
  }
  for (const contact of contacts) {
    const row = el('div', 'field-contact');
    row.dataset.state = contact.state;
    const head = el('div', 'field-contact-head');
    const name = el('span', 'field-contact-name', contact.name);
    const detail = [contact.org, contact.role].filter(Boolean).join(', ');
    if (detail) name.append(el('span', 'field-contact-org', ` · ${detail}`));
    head.append(name);
    if (contact.state === 'no-reply' && contact.followUp) {
      head.append(el('span', 'field-followup', `Follow up ${formatDate(parseDate(contact.followUp), { month: 'short', day: 'numeric' })}`));
    }
    row.append(head);

    const form = el('form', 'truth-form field-state-form');
    form.noValidate = true;
    const stateSelect = el('select', 'truth-input');
    for (const [value, label] of CONTACT_STATES) {
      const option = el('option', null, label);
      option.value = value;
      stateSelect.append(option);
    }
    stateSelect.value = contact.state;
    stateSelect.setAttribute('aria-label', `Pipeline state for ${contact.name}`);
    form.append(stateSelect);
    const followUp = field(form, 'Follow-up date', contact.followUp || '', 'follow-up', 'date');
    const showFollowUp = () => {
      followUp.parentElement.hidden = stateSelect.value !== 'no-reply';
      followUp.required = stateSelect.value === 'no-reply';
    };
    stateSelect.addEventListener('change', showFollowUp);
    showFollowUp();
    const save = el('button', 'act small', 'Move');
    save.type = 'submit';
    const remove = el('button', 'linky', 'Remove');
    remove.type = 'button';
    form.append(save, remove);
    const error = formError(form);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const next = { state: stateSelect.value, followUp: stateSelect.value === 'no-reply' ? followUp.value : null };
      try {
        ctx.act(() => store.upsertContact(contact.id, next));
      } catch (problem) {
        fail(error, problem.message, /follow-up/i.test(problem.message) ? followUp : stateSelect);
      }
    });
    remove.addEventListener('click', () => {
      ctx.act(() => store.removeContact(contact.id), {
        message: `${contact.name} removed from the ${COURSE} pipeline`,
        undo: () => store.restoreContact(contact.id)
      });
    });
    row.append(form);
    wrap.append(row);
  }
  return wrap;
}

function addContactForm(ctx) {
  const form = el('form', 'truth-form field-add-contact');
  form.noValidate = true;
  const name = field(form, 'Name', '', 'name');
  const org = field(form, 'Company or org', '', 'org');
  const role = field(form, 'Role', '', 'role');
  const save = el('button', 'act small', 'Add to pipeline');
  save.type = 'submit';
  form.append(save);
  const error = formError(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      store.upsertContact(newId('contact'), {
        name: name.value,
        org: org.value,
        role: role.value,
        state: 'identified'
      });
    } catch (problem) {
      return fail(error, problem.message, name);
    }
    ctx.act(() => {});
  });
  return form;
}

// The rules sit at the top of the screen where the questions get asked, not in
// a manual somewhere. When a contact is scheduled, the questions lead.
function scriptSection(contacts) {
  const script = interviewScript();
  const wrap = el('section', 'field-script');
  wrap.append(el('h3', 'section-head', 'How to interview'));
  const list = el('ul', 'field-rules');
  script.rules.forEach((rule) => list.append(el('li', null, rule)));
  wrap.append(list);
  const scheduled = contacts.filter((contact) => contact.state === 'scheduled').length;
  if (scheduled) {
    const open = el('details', 'collapsible field-questions');
    const summary = document.createElement('summary');
    summary.textContent = `Questions for the ${scheduled} scheduled ${scheduled === 1 ? 'interview' : 'interviews'}`;
    const questions = el('ul', 'field-rules');
    script.questions.forEach((question) => questions.append(el('li', null, question)));
    open.append(summary, questions);
    wrap.append(open);
  }
  return wrap;
}

function findingsList(ctx) {
  const wrap = el('div', 'field-finding-list-wrap');
  const findings = Object.entries(store.snapshot().findings || {})
    .filter(([, record]) => !record.deletedAt)
    .map(([id, record]) => ({ id, ...record }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (!findings.length) {
    wrap.append(
      el('p', 'field-empty', 'No findings logged yet. One note per interview, tagged by the assumption it supports or breaks.')
    );
    return wrap;
  }
  const list = el('ul', 'field-finding-list');
  for (const finding of findings) {
    const item = el('li', 'field-finding');
    item.dataset.tag = finding.tag;
    const contact = store.contactRecord(finding.contactId);
    const meta = [
      finding.date ? formatDate(parseDate(finding.date), { month: 'short', day: 'numeric' }) : null,
      contact?.name || null
    ].filter(Boolean);
    if (meta.length) item.append(el('p', 'field-finding-meta', meta.join(' · ')));
    item.append(el('p', 'field-finding-meta', `Assumption: ${finding.assumption || 'Unlabelled'}`));
    item.append(el('p', 'field-finding-text', finding.text));
    item.append(el('p', 'field-finding-tag', `This ${tagLabel(finding.tag)}.`));
    const remove = el('button', 'linky', 'Remove');
    remove.type = 'button';
    remove.addEventListener('click', () => ctx.act(() => store.removeFinding(finding.id), {
      message: `Finding removed from ${COURSE}`,
      undo: () => store.restoreFinding(finding.id)
    }));
    item.append(remove);
    list.append(item);
  }
  wrap.append(list);
  return wrap;
}

function addFindingForm(ctx) {
  const section = el('section', 'field-findings');
  section.append(el('h3', 'section-head', 'Findings log'));
  section.append(findingsList(ctx));
  const form = el('form', 'truth-form field-add-finding');
  form.noValidate = true;
  const contactSelect = el('select', 'truth-input');
  const blank = el('option', null, 'No contact on record');
  blank.value = '';
  contactSelect.append(blank);
  for (const contact of activeContacts(store.snapshot().contacts)) {
    const option = el('option', null, contact.name);
    option.value = contact.id;
    contactSelect.append(option);
  }
  contactSelect.setAttribute('aria-label', 'Contact interviewed');
  form.append(contactSelect);
  const date = field(form, 'Interview date', '', 'date', 'date');
  const assumption = field(form, 'Assumption tested', '', 'assumption');
  const text = field(form, 'The finding, one sentence', '', 'text', 'textarea');
  const tagSelect = el('select', 'truth-input');
  for (const [value, label] of [['supports', 'Supports an assumption'], ['breaks', 'Breaks an assumption']]) {
    const option = el('option', null, label);
    option.value = value;
    tagSelect.append(option);
  }
  tagSelect.setAttribute('aria-label', 'What this finding does to the assumption');
  form.append(tagSelect);
  const save = el('button', 'act small', 'Log finding');
  save.type = 'submit';
  form.append(save);
  const error = formError(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      ctx.act(() =>
        store.upsertFinding(newId('finding'), {
          contactId: contactSelect.value || null,
          date: date.value,
          assumption: assumption.value,
          text: text.value,
          tag: tagSelect.value
        })
      );
      text.value = '';
    } catch (problem) {
      fail(error, problem.message, text);
    }
  });
  section.append(form);
  return section;
}

function nextUpdateItem(map) {
  const course = map.courses.find((course) => course.code === COURSE);
  if (!course) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const pending = course.items
    .filter((item) => item.type === 'recurring' && item.date)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .filter((item) => item.status !== 'done' && !store.itemState(item.id).doneAt &&
      !['cant-submit', 'absorbed'].includes(store.itemState(item.id).resolution?.state));
  return pending.find((item) => parseDate(item.date) >= today) || pending.at(-1) || null;
}

// It drafts; the person writes. The draft assembles from the week's findings
// and the pipeline, and saving it is the writer's claim, stamped like the rest.
function draftSection(map, ctx) {
  const section = el('section', 'field-draft');
  section.append(el('h3', 'section-head', 'Weekly update'));
  const weekItem = nextUpdateItem(map);
  if (!weekItem) {
    section.append(el('p', 'field-empty', `No weekly updates left on the ${COURSE} schedule.`));
    return section;
  }
  const snapshot = store.snapshot();
  const trust = dateTrust(weekItem, snapshot);
  const trustNote = trust.status === 'verified' ? '' : trust.status === 'contradicted'
    ? ' Sources disagree; confirm this date in the item.' : ' Date not yet verified.';
  section.append(
    el('p', 'field-due', `${weekItem.title} (${COURSE}) is listed for ${formatDate(parseDate(weekItem.date), { weekday: 'long', month: 'short', day: 'numeric' })}.${trustNote}`)
  );
  const existing = store.itemState(weekItem.id).updateDraft;
  const form = el('form', 'field-draft-form');
  form.noValidate = true;
  const text = el('textarea', 'field-draft-text');
  text.rows = 10;
  text.value = existing || weeklyDraft(weekItem, COURSE, snapshot.findings || {}, snapshot.contacts || {});
  text.setAttribute('aria-label', `Draft of ${weekItem.title}`);
  if (!existing) text.dataset.assembled = 'true';
  const save = el('button', 'act small', 'Save draft');
  save.type = 'submit';
  const clear = el('button', 'linky', 'Reassemble from the log');
  clear.type = 'button';
  const error = formError(form);
  clear.addEventListener('click', () => {
    text.value = weeklyDraft(weekItem, COURSE, snapshot.findings || {}, snapshot.contacts || {});
    text.dataset.assembled = 'true';
  });
  form.append(text, save, clear);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      ctx.act(() => store.setUpdateDraft(weekItem.id, text.value), {
        message: `${weekItem.title} · draft saved`,
        undo: () => store.setUpdateDraft(weekItem.id, existing || null)
      });
    } catch (problem) {
      fail(error, problem.message, text);
    }
  });
  section.append(form);
  section.append(
    el('p', 'field-fine', 'This assembles from the log; the writing is yours. Saving replaces the previous draft, and the last save is undoable from the toast.')
  );
  return section;
}

/**
 * The Business Lab surface. A pipeline, a script, a log, and a weekly draft,
 * because that course's work is not an assignment list.
 */
export function renderField(map, ctx) {
  const root = el('div', 'field-view');
  const snapshot = store.snapshot();
  const contacts = activeContacts(snapshot.contacts || {});
  const health = pipelineHealth(snapshot.contacts || {});

  root.append(el('h2', 'field-title', `${COURSE} pipeline`));

  const lab = map.courses.find((course) => course.code === COURSE);
  const gap = cadenceGap(
    (lab?.items || []).filter((item) => item.type === 'recurring'),
    snapshot
  );
  if (gap && !gap.started) {
    const when = formatDate(parseDate(gap.due), { weekday: 'long', month: 'short', day: 'numeric' });
    root.append(
      el(
        'p',
        'field-cadence',
        gap.basis === 'calendar'
          ? `Work on ${gap.title} (${COURSE}) has not started. Wednesday's update needs outreach now; the listed date is ${when} and is not yet verified.`
          : gap.gapDays > 0
            ? `Work on ${gap.title} (${COURSE}) has not started. Your recent updates started ${gap.typicalLead} days ahead of the deadline, and that day ${gap.gapDays === 1 ? 'was yesterday' : `was ${gap.gapDays} days ago`}. Check the listed date, ${when}.`
            : `Work on ${gap.title} (${COURSE}) has not started. Your recent updates started ${gap.typicalLead} days ahead, which points to today or tomorrow. Check the listed date, ${when}.`
      )
    );
  }

  const pipeline = el('section', 'field-pipeline');
  pipeline.append(el('h3', 'section-head', 'Contacts'));
  pipeline.append(
    el(
      'p',
      'field-health',
      `Contacted now: ${health.inContacted}. Interviews next week come from messages sent this week.${health.followUpsDue ? ` ${health.followUpsDue} ${health.followUpsDue === 1 ? 'follow-up is' : 'follow-ups are'} due.` : ''}`
    )
  );
  pipeline.append(contactRows(ctx));
  pipeline.append(addContactForm(ctx));
  root.append(pipeline);

  root.append(scriptSection(contacts));
  root.append(addFindingForm(ctx));
  root.append(draftSection(map, ctx));
  return root;
}
