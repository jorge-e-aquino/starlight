// Canvas calendar data is evidence. It never writes a date or marks one
// verified: the person using Starlight decides whether a proposal is trusted.
export function unfoldICal(source) {
  return String(source).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeICal(value) {
  return value.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function datePart(value, params = {}) {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value || '');
  if (!match) return null;
  const [, y, m, d, hh, mm, ss, utc] = match;
  const date = `${y}-${m}-${d}`;
  if (!hh || params.VALUE === 'DATE') return { date, time: null, zone: null };
  if (utc) {
    const instant = new Date(`${date}T${hh}:${mm}:${ss || '00'}Z`);
    const fields = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(instant).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return {
      date: `${fields.year}-${fields.month}-${fields.day}`,
      time: `${fields.hour}:${fields.minute}`,
      zone: 'America/New_York'
    };
  }
  return { date, time: `${hh}:${mm}`, zone: params.TZID || 'floating local time' };
}

export function parseICal(source) {
  const events = [];
  let current = null;
  for (const line of unfoldICal(source)) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') {
      if (current?.summary && current.start) events.push(current);
      current = null; continue;
    }
    if (!current) continue;
    const colon = line.indexOf(':'); if (colon < 0) continue;
    const [key, ...parameterParts] = line.slice(0, colon).split(';');
    const params = Object.fromEntries(parameterParts.map((part) => part.split('=')));
    const value = unescapeICal(line.slice(colon + 1));
    if (key === 'DTSTART') current.start = datePart(value, params);
    if (key === 'DTEND') current.end = datePart(value, params);
    if (key === 'SUMMARY') current.summary = value;
    if (key === 'DESCRIPTION') current.description = value;
    if (key === 'UID') current.uid = value;
    if (key === 'URL') current.url = value;
  }
  return events;
}

function titleWords(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((word) => /^\d+$/.test(word) || (word.length >= 2 && !['of', 'to', 'in', 'the', 'and', 'for'].includes(word)));
}

export function proposeCalendarMatches(events, items) {
  return events.map((event) => {
    const words = new Set(titleWords(event.summary));
    const ranked = items.map((item) => {
      const title = titleWords(item.title);
      const overlap = title.filter((word) => words.has(word)).length;
      const course = String(item.courseCode || '').toLowerCase().replace(/\s/g, '');
      const inCourse = course && event.summary.toLowerCase().replace(/\s/g, '').includes(course);
      return { item, score: 0.7 * overlap / Math.max(title.length, 1) + 0.3 * overlap / Math.max(words.size, 1) + (inCourse ? 0.5 : 0) };
    }).sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const unique = !ranked[1] || best.score - ranked[1].score >= 0.2;
    return { event, item: best?.score >= 0.6 && unique ? best.item : null, confidence: best?.score || 0 };
  });
}

export function compareCalendarDate(event, item) {
  if (!event?.start || !item) return 'unmatched';
  if (event.start.date !== item.date) return 'conflict';
  if (event.start.time && item.time && event.start.time !== item.time) return 'conflict';
  if (!event.start.time || !item.time) return 'partial';
  return 'agrees';
}
