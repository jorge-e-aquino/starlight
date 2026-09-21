import { createHash, timingSafeEqual } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { mergeRecord } from '../src/merge.js';

const FIELDS = new Set(['dateTrust', 'doneAt', 'resolution', 'externalBlock', 'examDossier']);
let ready;

export function cleanProjection(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !input.items || typeof input.items !== 'object') throw new Error('Invalid progress projection.');
  const items = {};
  for (const [id, record] of Object.entries(input.items)) {
    if (!/^[a-z0-9-]{1,100}$/.test(id) || !record || typeof record !== 'object') continue;
    const clean = {};
    if (Object.hasOwn(record, 'dateTrust')) clean.dateTrust = record.dateTrust && {
      status: record.dateTrust.status, date: record.dateTrust.date, source: record.dateTrust.source
    };
    if (Object.hasOwn(record, 'doneAt')) clean.doneAt = record.doneAt;
    if (Object.hasOwn(record, 'resolution')) clean.resolution = record.resolution && { state: record.resolution.state };
    if (Object.hasOwn(record, 'externalBlock')) clean.externalBlock = Boolean(record.externalBlock);
    if (Object.hasOwn(record, 'examDossier')) clean.examDossier = record.examDossier && {
      confirmed: record.examDossier.confirmed, startTime: record.examDossier.startTime,
      location: record.examDossier.location, materials: record.examDossier.materials
    };
    clean._t = Object.fromEntries(Object.entries(record._t || {}).filter(([key, value]) => FIELDS.has(key) && Number.isFinite(value)));
    if (Object.keys(clean).length > 1) items[id] = clean;
  }
  return { items };
}

export function mergeProjection(a, b) {
  const items = {};
  for (const id of new Set([...Object.keys(a?.items || {}), ...Object.keys(b.items)])) {
    items[id] = mergeRecord(a?.items?.[id], b.items[id]);
  }
  return { items };
}

function authorized(req) {
  const expected = process.env.STARLIGHT_PAIRING_KEY_HASH;
  const raw = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !raw || raw.length > 256) return false;
  const digest = createHash('sha256').update(raw).digest();
  return timingSafeEqual(digest, Buffer.from(expected, 'hex'));
}

function database() {
  if (!process.env.DATABASE_URL) throw new Error('Push storage is not configured.');
  const sql = neon(process.env.DATABASE_URL);
  ready ||= Promise.all([
    sql`CREATE TABLE IF NOT EXISTS starlight_push_devices (
      endpoint_hash text PRIMARY KEY, subscription jsonb NOT NULL,
      label text NOT NULL DEFAULT 'Device', registered_at timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS starlight_push_projection (
      id integer PRIMARY KEY CHECK (id = 1), data jsonb NOT NULL,
      revision bigint NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    sql`CREATE TABLE IF NOT EXISTS starlight_push_deliveries (
      day date NOT NULL, candidate_id text NOT NULL, slot integer,
      status text NOT NULL DEFAULT 'reserved', created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (day, candidate_id)
    )`
  ]).then(() => sql`CREATE UNIQUE INDEX IF NOT EXISTS starlight_push_regular_slots ON starlight_push_deliveries(day, slot) WHERE slot IS NOT NULL`).catch((error) => { ready = null; throw error; });
  return { sql, ready };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return res.status(200).json({ available: Boolean(process.env.DATABASE_URL && process.env.STARLIGHT_PAIRING_KEY_HASH && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY), publicKey: process.env.VAPID_PUBLIC_KEY || null });
  if (!authorized(req)) return res.status(401).json({ error: 'This device needs its private reminder key.' });
  if (!['POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Unsupported request.' });
  try {
    const { sql, ready: initialized } = database();
    await initialized;
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (req.method === 'POST' && body.action === 'register') {
      const sub = body.subscription;
      if (!/^https:\/\//.test(sub?.endpoint || '') || !sub?.keys?.p256dh || !sub?.keys?.auth || JSON.stringify(sub).length > 4096) return res.status(400).json({ error: 'The browser did not provide a valid push subscription.' });
      const hash = createHash('sha256').update(sub.endpoint).digest('hex');
      await sql`INSERT INTO starlight_push_devices (endpoint_hash, subscription, label, registered_at)
        VALUES (${hash}, ${JSON.stringify(sub)}::jsonb, ${String(body.label || 'Device').slice(0, 60)}, now())
        ON CONFLICT (endpoint_hash) DO UPDATE SET subscription = excluded.subscription, label = excluded.label, registered_at = now()`;
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      const hash = createHash('sha256').update(String(body.endpoint || '')).digest('hex');
      await sql`DELETE FROM starlight_push_devices WHERE endpoint_hash = ${hash}`;
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'project') {
      if (JSON.stringify(body.projection || {}).length > 160000) return res.status(413).json({ error: 'Progress projection is too large.' });
      const clean = cleanProjection(body.projection);
      await sql`INSERT INTO starlight_push_projection (id, data) VALUES (1, '{"items":{}}'::jsonb) ON CONFLICT DO NOTHING`;
      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await sql`SELECT data, revision FROM starlight_push_projection WHERE id = 1`;
        const merged = mergeProjection(existing[0].data, clean);
        const written = await sql`UPDATE starlight_push_projection SET data = ${JSON.stringify(merged)}::jsonb,
          revision = revision + 1, updated_at = now() WHERE id = 1 AND revision = ${existing[0].revision} RETURNING id`;
        if (written.length) return res.status(200).json({ ok: true });
      }
      return res.status(409).json({ error: 'Another device just updated reminders. Try again.' });
    }
    return res.status(400).json({ error: 'Unknown reminder action.' });
  } catch (error) {
    console.error('Push API failed:', error);
    return res.status(503).json({ error: 'Reminders are unavailable right now. Progress stays on this device.' });
  }
}
