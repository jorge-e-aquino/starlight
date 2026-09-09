// One shared tooltip for every node on the map. Positioned from the node's own
// screen rect rather than from layout offsets, so it stays correct inside the
// horizontally scrolling canvas.
let tip = null;
let current = null;

function ensure() {
  if (tip && document.body.contains(tip)) return tip;
  tip = document.createElement('div');
  tip.className = 'tip';
  tip.setAttribute('role', 'presentation');
  document.body.append(tip);
  return tip;
}

function place() {
  if (!current || !tip) return;
  const node = current.getBoundingClientRect();
  const box = tip.getBoundingClientRect();

  let left = node.left + node.width / 2 - box.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));

  // Above the node by default, flipped below when there is no room up there.
  let top = node.top - box.height - 10;
  if (top < 8) top = node.bottom + 10;

  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function show(node) {
  const el = ensure();
  const title = document.createElement('span');
  title.className = 'tip-title';
  title.textContent = node.dataset.tipTitle;
  const meta = document.createElement('span');
  meta.className = 'tip-meta';
  meta.textContent = node.dataset.tipMeta || '';
  el.replaceChildren(title, meta);

  current = node;
  place();
  el.classList.add('on');
}

function hide() {
  current = null;
  if (tip) tip.classList.remove('on');
}

function nodeFrom(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest('.node[data-tip-title]');
}

export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const node = nodeFrom(e);
    if (node && node !== current) show(node);
  });
  document.addEventListener('mouseout', (e) => {
    if (nodeFrom(e) === current && current) hide();
  });
  // Keyboard users tabbing the timeline get the same label.
  document.addEventListener('focusin', (e) => {
    const node = nodeFrom(e);
    if (node) show(node);
    else hide();
  });
  document.addEventListener('focusout', hide);
  // Capture phase, so scrolling the canvas keeps the tooltip on its node.
  window.addEventListener('scroll', place, true);
  window.addEventListener('resize', hide);
}
