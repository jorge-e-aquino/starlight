import { neon } from '@neondatabase/serverless';
import webpush from 'web-push';
import schema from '../course_map_schema_v2.json' with { type: 'json' };
import { dateTrust } from '../src/truth.js';
import { morningCandidate, examMorningCandidate, selectNotifications } from '../src/notification.js';

const zone = 'America/New_York';
const dayKey = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const localHour = (now) => Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hour12: false }).format(now));
const daysUntil = (day, date) => Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000);

export function candidatesForDay(semester, overlay, day) {
  const candidates = [];
  for (const course of semester.courses || []) for (const item of course.items || []) {
    const state = overlay.items?.[item.id] || {};
    if (item.status === 'done' || state.doneAt || state.externalBlock || ['cant-submit', 'absorbed'].includes(state.resolution?.state)) continue;
    const trust = dateTrust(item, overlay);
    const d = trust.date ? daysUntil(day, trust.date) : Infinity;
    const named = { ...item, courseCode: course.code };
    if (['exam', 'final'].includes(item.type) && d === 0) {
      const exam = examMorningCandidate(named, state.examDossier, trust, day);
      if (exam) candidates.push(exam);
    }
    if (d < 0 || d > 3 || item.type === 'standing') continue;
    const gated = (semester.courses || []).some((c) => (c.items || []).some((gate) =>
      (gate.blocks || []).some((edge) => (typeof edge === 'string' ? edge : edge.itemId) === item.id) &&
      !overlay.items?.[gate.id]?.doneAt && gate.status !== 'done'
    ));
    if (gated) continue;
    const candidate = morningCandidate(named, day);
    if (!candidate) continue;
    candidate.priority = (d === 0 ? 10 : 4 - d) + (item.type === 'exam' || item.type === 'final' ? 3 : 0) + (item.points || 0) / 1000;
    candidates.push(candidate);
  }
  return candidates;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (!process.env.STARLIGHT_SEND_SECRET || req.headers.authorization !== `Bearer ${process.env.STARLIGHT_SEND_SECRET}`) return res.status(401).json({ error: 'Unauthorized.' });
  if (!process.env.DATABASE_URL || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(503).json({ error: 'Reminders are not configured.' });
  const now = new Date();
  const hour = localHour(now);
  if (hour < 7 || hour > 9) return res.status(200).json({ sent: 0, reason: 'outside morning window' });
  const day = dayKey(now);
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [projection, devices, delivered] = await Promise.all([
      sql`SELECT data FROM starlight_push_projection WHERE id = 1`,
      sql`SELECT endpoint_hash, subscription FROM starlight_push_devices ORDER BY registered_at DESC LIMIT 1`,
      sql`SELECT candidate_id AS id, CASE WHEN slot IS NULL THEN 'exam-morning' ELSE 'regular' END AS kind FROM starlight_push_deliveries WHERE day = ${day}::date`
    ]);
    if (!projection.length || !devices.length) return res.status(200).json({ sent: 0, reason: 'no projection or device' });
    const candidates = candidatesForDay(schema, projection[0].data, day);
    const selected = selectNotifications(candidates, delivered);
    // The second regular slot is headroom for a later, deliberate follow-up.
    // Morning sends one useful item so two alerts never arrive together.
    let sentRegular = delivered.some((entry) => entry.kind === 'regular');
    webpush.setVapidDetails('https://starlight-ten-lilac.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    let sent = 0;
    for (const candidate of selected) {
      if (candidate.kind === 'regular' && sentRegular) continue;
      let reserved = [];
      if (candidate.kind === 'exam-morning') {
        reserved = await sql`INSERT INTO starlight_push_deliveries (day, candidate_id, slot) VALUES (${day}::date, ${candidate.id}, NULL) ON CONFLICT DO NOTHING RETURNING candidate_id`;
      } else {
        for (const slot of [1, 2]) {
          reserved = await sql`INSERT INTO starlight_push_deliveries (day, candidate_id, slot) VALUES (${day}::date, ${candidate.id}, ${slot}) ON CONFLICT DO NOTHING RETURNING candidate_id`;
          if (reserved.length) break;
        }
      }
      if (!reserved.length) continue;
      const url = `/?view=now#item=${encodeURIComponent(candidate.itemId)}`;
      try {
        await webpush.sendNotification(devices[0].subscription, JSON.stringify({ title: candidate.title, body: candidate.action, url, tag: candidate.id }), { TTL: 3600, urgency: candidate.kind === 'exam-morning' ? 'high' : 'normal' });
        await sql`UPDATE starlight_push_deliveries SET status = 'sent' WHERE day = ${day}::date AND candidate_id = ${candidate.id}`;
        sent++;
        if (candidate.kind === 'regular') sentRegular = true;
      } catch (error) {
        await sql`UPDATE starlight_push_deliveries SET status = 'failed' WHERE day = ${day}::date AND candidate_id = ${candidate.id}`;
        if ([404, 410].includes(error.statusCode)) await sql`DELETE FROM starlight_push_devices WHERE endpoint_hash = ${devices[0].endpoint_hash}`;
        console.error('Push delivery failed:', error.statusCode || error.message);
      }
    }
    return res.status(200).json({ sent });
  } catch (error) {
    console.error('Push sender failed:', error);
    return res.status(503).json({ error: 'Sender unavailable.' });
  }
}
