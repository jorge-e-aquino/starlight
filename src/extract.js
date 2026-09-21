// Extraction produces review cards, never trusted course facts. Each card
// retains the excerpt that caused it so the user can check the source.
function pagesOf(input) {
  return Array.isArray(input) ? input : String(input || '').split('\f');
}

function sentences(pages) {
  return pages.flatMap((page, index) => String(page).split(/\r?\n|(?<=[.!?])\s+/).map((part) => part.replace(/\s+/g, ' '))
    .map((text) => ({ text: text.trim(), page: index + 1 })).filter(({ text }) => text.length >= 18));
}

function excerpt(sentence, match) {
  const at = Math.max(0, sentence.text.toLowerCase().indexOf(match));
  const start = Math.max(0, at - 45);
  const end = Math.min(sentence.text.length, at + 155);
  return { ...sentence, text: `${start ? '…' : ''}${sentence.text.slice(start, end)}${end < sentence.text.length ? '…' : ''}` };
}

function timeOf(text) {
  const match = /\b(1[0-2]|0?[1-9]):([0-5]\d)\s*(a\.?m\.?|p\.?m\.?)\b/i.exec(text);
  if (!match) return null;
  const hours = Number(match[1]) % 12 + (/p/i.test(match[3]) ? 12 : 0);
  return `${String(hours).padStart(2, '0')}:${match[2]}`;
}

export function extractSyllabusCandidates(input) {
  const pages = pagesOf(input);
  const found = [];
  for (const sentence of sentences(pages)) {
    const lower = sentence.text.toLowerCase();
    if (/\blate\b/.test(lower) && /(submit|accept|penalt|deduct)/.test(lower)) {
      const never = /(?:not|never)\s+(?:be\s+)?accepted|no late (?:work|submission)/.test(lower);
      const percent = /(?:penalty|deduct(?:ion|ed)?).{0,30}?(\d{1,2})\s*%|(\d{1,2})\s*%.{0,30}?(?:penalty|deduct)/.exec(lower);
      found.push({ kind: 'latePolicy', value: { status: never ? 'never' : percent ? 'penalty' : 'review', penaltyPercent: percent ? Number(percent[1] || percent[2]) : null }, ...excerpt(sentence, 'late') });
    }
    if (/\b(drop|lowest|best)\b/.test(lower) && /\b(homework|journal|memo|test|quiz|assignment)/.test(lower)) {
      const best = /best\s+(\d+)\s+(?:of|out of)\s+(\d+)/.exec(lower);
      const drop = /drop\s+(?:the\s+)?(?:lowest\s+)?(\d+|one|two)\b/.exec(lower);
      if (sentence.text.length < 450) found.push({ kind: 'dropRule', value: best ? { countRequired: Number(best[1]), countTotal: Number(best[2]) } : { dropCount: drop ? ({ one: 1, two: 2 }[drop[1]] || Number(drop[1])) : null }, ...excerpt(sentence, best ? 'best' : 'drop') });
    }
    if (/\b(due|deadline|submit)\b/.test(lower)) {
      const time = timeOf(sentence.text);
      if (time && sentence.text.length < 260 && new Set([...sentence.text.matchAll(/\b\d{1,2}:[0-5]\d\s*[ap]m\b/gi)].map((entry) => entry[0].toLowerCase())).size <= 1) {
        found.push({ kind: 'deadlineTime', value: { time }, ...excerpt(sentence, 'due') });
      }
    }
  }
  return found.filter((candidate, index) => found.findIndex((other) => other.kind === candidate.kind && JSON.stringify(other.value) === JSON.stringify(candidate.value)) === index).slice(0, 16);
}

export function extractTopicCandidates(input) {
  const pages = pagesOf(input);
  const candidates = [];
  pages.forEach((page, index) => {
    String(page).split(/\r?\n/).forEach((line) => {
      const clean = line.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim();
      if (!clean || clean.length < 5 || clean.length > 90 || /^(agenda|objectives?|references?|copyright|slide\s*\d+|questions?)$/i.test(clean)) return;
      const heading = /^\s*(?:[-•*]|\d+[.)])/.test(line) || /^[A-Z][A-Za-z0-9 ,/&():-]{4,80}$/.test(clean);
      if (heading && clean.split(/\s+/).length <= 12) candidates.push({ title: clean, page: index + 1 });
    });
  });
  const seen = new Set();
  return candidates.filter(({ title }) => { const key = title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 100);
}
