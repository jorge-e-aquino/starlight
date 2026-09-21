// Read-only relay for a personal Canvas calendar feed. The token in its URL is
// not stored, logged, embedded in the bundle, or placed in the progress overlay.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST to check a calendar.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: 'Enter a calendar feed URL.' }); }
  const address = body.feedUrl;
  let url;
  try { url = new URL(address); } catch { return res.status(400).json({ error: 'Enter the personal Canvas calendar URL.' }); }
  if (url.protocol !== 'https:' || url.hostname !== 'gatech.instructure.com' || !/^\/feeds\/calendars\//.test(url.pathname)) {
    return res.status(400).json({ error: 'Use the Georgia Tech Canvas personal calendar feed URL.' });
  }
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/calendar' } });
    if (!response.ok) return res.status(502).json({ error: 'Canvas did not return that calendar. Check the feed URL.' });
    const length = Number(response.headers.get('content-length'));
    if (length > 2_000_000) return res.status(413).json({ error: 'That calendar is too large to review here.' });
    const body = await response.text();
    if (body.length > 2_000_000 || !body.includes('BEGIN:VCALENDAR')) return res.status(422).json({ error: 'Canvas did not return a calendar file.' });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    return res.status(200).send(body);
  } catch {
    return res.status(502).json({ error: 'Canvas could not be reached. Try again or open an .ics file.' });
  }
}
