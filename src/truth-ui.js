import { formatDate, parseDate } from './data.js';
import { dateTrust, resolutionCost } from './truth.js';
import * as store from './state.js';

const RESOLUTIONS = {
  'late-eligible': 'Can submit late',
  'makeup-possible': 'Makeup possible',
  absorbed: 'Absorbed by a cushion',
  'cant-submit': "Can't submit"
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function resolutionLabel(state) {
  return RESOLUTIONS[typeof state === 'string' ? state : state?.state] || 'Still unresolved';
}

function formattedTime(time) {
  if (!time) return 'time unknown';
  const [hours, minutes] = time.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

export function dateText(item) {
  const trust = dateTrust(item, store.snapshot());
  const date = trust.date ? formatDate(parseDate(trust.date), { month: 'short', day: 'numeric' }) : 'Date unknown';
  const timing = `${date} · ${formattedTime(trust.time)}`;
  if (trust.status === 'verified') return `${timing} · verified against ${trust.source}`;
  if (trust.status === 'contradicted') return `${timing} · sources disagree`;
  return `${timing} · unchecked`;
}

export function dateBadge(item) {
  const trust = dateTrust(item, store.snapshot());
  const badge = el('span', 'date-badge', trust.status === 'verified' ? '✓ Verified' : trust.status === 'contradicted' ? '◇ Sources disagree' : '○ Date unchecked');
  badge.dataset.trust = trust.status;
  badge.title = dateText(item);
  badge.setAttribute('aria-label', dateText(item));
  return badge;
}

function field(form, label, type, value = '', name) {
  const wrap = el('label', 'truth-field');
  const input = el(type === 'textarea' ? 'textarea' : 'input', 'truth-input');
  if (type !== 'textarea') input.type = type;
  input.name = name || label.toLowerCase().replaceAll(' ', '-');
  input.value = value || '';
  if (type === 'textarea') input.rows = 2;
  wrap.append(el('span', 'truth-label', label), input);
  form.append(wrap);
  return input;
}

function selectField(form, label, options, value, name) {
  const wrap = el('label', 'truth-field');
  const select = el('select', 'truth-input');
  select.name = name || label.toLowerCase().replaceAll(' ', '-');
  options.forEach(([id, text]) => {
    const option = el('option', null, text);
    option.value = id;
    select.append(option);
  });
  select.value = value;
  wrap.append(el('span', 'truth-label', label), select);
  form.append(wrap);
  return select;
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
  return false;
}

function save(ctx, error, mutation) {
  try {
    ctx.act(mutation);
  } catch (problem) {
    fail(error, problem.message || 'This change could not save. Check the fields and try again.');
  }
}

function action(form, label) {
  const button = el('button', 'act small', label);
  button.type = 'submit';
  form.append(button);
  return button;
}

function evidenceText(source) {
  const when = source.date ? formatDate(parseDate(source.date)) : 'date unknown';
  return `${source.source || 'Unnamed source'}: ${when}, ${formattedTime(source.time)}${source.note ? `. ${source.note}` : ''}`;
}

export function buildDateTrustForm(item, ctx) {
  const trust = dateTrust(item, store.snapshot());
  const wrap = el('div', 'truth-content');
  const evidence = item.dateEvidence?.sources || (Array.isArray(item.dateEvidence) ? item.dateEvidence : []);
  const sources = trust.sources?.length ? trust.sources : evidence;
  if (sources.length) {
    const list = el('ul', 'source-evidence');
    sources.forEach(source => list.append(el('li', null, evidenceText(source))));
    wrap.append(list);
  }
  wrap.append(el('p', 'fine', 'Check the assignment page or syllabus, then record the source you checked. You decide when a date earns trust.'));
  const form = el('form', 'truth-form');
  form.noValidate = true;
  const date = field(form, 'Scheduled date', 'date', trust.date, 'date');
  const time = field(form, 'Scheduled time', 'time', trust.time, 'time');
  const status = selectField(form, 'Date confidence', [
    ['unverified', 'Unchecked'], ['verified', 'I checked this against a source'], ['contradicted', 'Two sources disagree']
  ], trust.status, 'status');
  const verifiedFields = el('div', 'truth-fields');
  const source = field(verifiedFields, 'Source I checked', 'text', trust.source || '', 'source');
  source.placeholder = 'Canvas assignment page, syllabus page 4';
  form.append(verifiedFields);
  const conflictFields = el('div', 'truth-fields');
  const sourceInputs = [0, 1].map(index => {
    const group = el('fieldset', 'truth-source');
    group.append(el('legend', null, `Source ${index + 1}`));
    const prior = sources[index] || (index === 0 ? { date: trust.date, time: trust.time, source: trust.source } : {});
    const name = field(group, `Source ${index + 1} name`, 'text', prior.source, `source-${index + 1}`);
    const sourceDate = field(group, `Source ${index + 1} date`, 'date', prior.date, `source-date-${index + 1}`);
    const sourceTime = field(group, `Source ${index + 1} time`, 'time', prior.time, `source-time-${index + 1}`);
    const note = field(group, `Source ${index + 1} note`, 'textarea', prior.note, `source-note-${index + 1}`);
    conflictFields.append(group);
    return { name, date: sourceDate, time: sourceTime, note };
  });
  conflictFields.append(el('p', 'fine', 'The scheduled date stays tentative while these sources disagree.'));
  form.append(conflictFields);
  const error = formError(form);
  const submit = action(form, 'Save unchecked date');
  function update() {
    verifiedFields.hidden = status.value !== 'verified';
    conflictFields.hidden = status.value !== 'contradicted';
    submit.textContent = status.value === 'verified' ? 'Confirm date against this source' : status.value === 'contradicted' ? 'Save source conflict' : 'Save unchecked date';
    error.hidden = true;
  }
  status.addEventListener('change', update);
  update();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (status.value === 'verified' && !date.value) return fail(error, 'Enter the date you checked.', date);
    if (status.value === 'verified' && !source.value.trim()) return fail(error, 'Name the source you checked before confirming this date.', source);
    const claims = sourceInputs.map(fields => ({ source: fields.name.value.trim(), date: fields.date.value || null, time: fields.time.value || null, note: fields.note.value.trim() || null }));
    if (status.value === 'contradicted') {
      const missing = sourceInputs.find(fields => !fields.name.value.trim());
      if (missing) return fail(error, 'Name both sources so the disagreement stays traceable.', missing.name);
      if (claims[0].date === claims[1].date && claims[0].time === claims[1].time) return fail(error, 'Enter the differing dates or times reported by the two sources.', sourceInputs[1].date);
    }
    const next = {
      status: status.value,
      date: date.value || null,
      time: time.value || null,
      source: status.value === 'verified' ? source.value.trim() : null,
      sources: status.value === 'contradicted' ? claims : []
    };
    save(ctx, error, () => store.setDateTrust(item.id, next));
  });
  wrap.append(form);
  return wrap;
}

function compactNumber(value) {
  return Number(value.toFixed(2)).toLocaleString('en-US');
}

export function resolutionCostText(course, item) {
  const resolution = store.itemState(item.id).resolution;
  if (!resolution) return '';
  const cost = resolutionCost(course, item, store.snapshot());
  const points = cost.pointsGone == null ? 'Point cost needs a scoring rule' : `${compactNumber(cost.pointsGone)} points`;
  const share = cost.percentGone == null ? '' : ` · ${cost.percentGone.toFixed(1)}% of course grade`;
  let detail = `${points}${share}.`;
  if (resolution.state === 'absorbed') detail += ` ${cost.cushionsLeft ?? 0} ${cost.cushionsLeft === 1 ? 'drop remains' : 'drops remain'} in this group.`;
  if (resolution.state === 'late-eligible') detail += ` ${compactNumber(resolution.penaltyPercent || 0)}% late penalty.`;
  if (resolution.state === 'makeup-possible') detail += ` ${resolution.request || 'Makeup request'}${resolution.deadline ? ` by ${formatDate(parseDate(resolution.deadline))}` : ''}.`;
  return detail;
}

export function buildResolutionForm(item, course, ctx) {
  const current = store.itemState(item.id).resolution;
  const wrap = el('div', 'truth-content');
  if (current) wrap.append(el('p', 'resolution-cost', resolutionCostText(course, item)));
  else wrap.append(el('p', 'fine', 'Record what can happen now. The outcome stays attached to this item.'));
  const form = el('form', 'truth-form');
  form.noValidate = true;
  const state = selectField(form, 'Outcome', [['', 'Choose the outcome'], ...Object.entries(RESOLUTIONS)], current?.state || '', 'resolution-state');
  const lateFields = el('div', 'truth-fields');
  const penalty = field(lateFields, 'Late penalty (%)', 'number', String(current?.penaltyPercent ?? 0), 'penaltyPercent');
  penalty.min = '0'; penalty.max = '100'; penalty.step = '0.1';
  lateFields.append(el('p', 'fine', 'Record the actual course policy or the penalty your instructor agreed to.'));
  const makeupFields = el('div', 'truth-fields');
  const request = field(makeupFields, 'Request or next action', 'textarea', current?.request || '', 'request');
  const deadline = field(makeupFields, 'Request deadline', 'date', current?.deadline || '', 'deadline');
  const cushionFields = el('div', 'truth-fields');
  const groups = (course.groups || []).filter(group => group.countTotal > group.countRequired && (!item.group || group.id === item.group));
  const cushion = selectField(cushionFields, 'Cushion to use', groups.map(group => [group.id, `${group.label} · ${group.countTotal - group.countRequired} allowed drops`]), current?.cushionGroupId || item.group, 'cushionGroupId');
  if (!groups.length) cushionFields.append(el('p', 'fine', 'This item has no drop cushion in its course rules.'));
  form.append(lateFields, makeupFields, cushionFields);
  const costPreview = el('p', 'resolution-cost');
  form.append(costPreview);
  const error = formError(form);
  const submit = action(form, 'Save outcome');
  function update() {
    lateFields.hidden = state.value !== 'late-eligible';
    makeupFields.hidden = state.value !== 'makeup-possible';
    cushionFields.hidden = state.value !== 'absorbed';
    error.hidden = true;
    costPreview.hidden = !['cant-submit', 'absorbed'].includes(state.value);
    if (!costPreview.hidden) {
      const snapshot = store.snapshot();
      const hypothetical = { ...snapshot, items: { ...snapshot.items, [item.id]: { ...snapshot.items[item.id], resolution: { state: state.value, cushionGroupId: cushion.value } } } };
      const cost = resolutionCost(course, item, hypothetical);
      const drops = cost.cushionsLeft ?? 0;
      costPreview.textContent = cost.pointsGone == null ? 'The grade cost needs a scoring rule.' : `Grade cost: ${compactNumber(cost.pointsGone)} points${cost.percentGone == null ? '' : ` · ${cost.percentGone.toFixed(1)}% of course grade`}${state.value === 'absorbed' ? `. ${drops} ${drops === 1 ? 'drop remains' : 'drops remain'} after this` : ''}.`;
    }
  }
  state.addEventListener('change', update);
  cushion.addEventListener('change', update);
  update();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!state.value) return fail(error, 'Choose one outcome for this item.', state);
    const next = { state: state.value };
    if (state.value === 'late-eligible') {
      if (penalty.value === '' || !Number.isFinite(Number(penalty.value)) || Number(penalty.value) < 0 || Number(penalty.value) > 100) return fail(error, 'Enter a penalty from 0 to 100 percent.', penalty);
      next.penaltyPercent = Number(penalty.value);
    }
    if (state.value === 'makeup-possible') {
      if (!request.value.trim()) return fail(error, 'Record the request or the next action.', request);
      if (!deadline.value) return fail(error, 'Choose a deadline for that request.', deadline);
      next.request = request.value.trim();
      next.deadline = deadline.value;
    }
    if (state.value === 'absorbed') {
      if (!cushion.value) return fail(error, 'This item needs an eligible course cushion.', cushion);
      next.cushionGroupId = cushion.value;
    }
    save(ctx, error, () => store.setResolution(item.id, next));
  });
  wrap.append(form);
  return wrap;
}

export function buildExternalBlockForm(item, ctx) {
  const current = store.itemState(item.id).externalBlock;
  const wrap = el('div', 'truth-content');
  wrap.append(el('p', 'fine', 'Record what stopped you and when to follow up. Starlight pauses avoidance observations while this block is active.'));
  const form = el('form', 'truth-form');
  form.noValidate = true;
  const reason = field(form, 'What stopped you', 'textarea', current?.reason || '', 'reason');
  const waitingOn = field(form, 'Waiting on', 'text', current?.waitingOn || '', 'waitingOn');
  const followUp = field(form, 'Follow-up date', 'date', current?.followUp || '', 'followUp');
  const error = formError(form);
  action(form, current ? 'Update block' : 'Record external block');
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!reason.value.trim()) return fail(error, 'Record what stopped you.', reason);
    if (!waitingOn.value.trim()) return fail(error, 'Name what or who you are waiting on.', waitingOn);
    if (!followUp.value) return fail(error, 'Choose when to follow up.', followUp);
    save(ctx, error, () => store.setExternalBlock(item.id, { reason: reason.value.trim(), waitingOn: waitingOn.value.trim(), followUp: followUp.value }));
  });
  wrap.append(form);
  if (current) {
    const clear = el('button', 'linky', 'Clear block');
    clear.type = 'button';
    clear.addEventListener('click', () => ctx.act(() => store.setExternalBlock(item.id, null)));
    wrap.append(clear);
  }
  return wrap;
}
