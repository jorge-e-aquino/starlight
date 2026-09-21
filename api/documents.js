import { createHash, timingSafeEqual } from 'node:crypto';
import { get, issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';

export function documentAuthorized(req) {
  const expected = process.env.STARLIGHT_PAIRING_KEY_HASH;
  const raw = /^Bearer (.+)$/.exec(req.headers.authorization || '')?.[1];
  if (!expected || !/^[a-f0-9]{64}$/i.test(expected) || !raw || raw.length > 256) return false;
  return timingSafeEqual(createHash('sha256').update(raw).digest(), Buffer.from(expected, 'hex'));
}

const pathnameValid = (path) => /^starlight\/documents\/[a-f0-9-]{36}\/[a-zA-Z0-9._-]{1,120}$/.test(path) && !path.includes('..');
const types = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'text/plain', 'text/markdown'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (!documentAuthorized(req)) return res.status(401).json({ error: 'Pair this device to open files.' });
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return res.status(503).json({ error: 'Private file storage is not connected yet.' });
  try {
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const result = await handleUploadPresigned({ request: req, body,
        getSignedToken: async (pathname) => {
          if (!pathnameValid(pathname)) throw new Error('Invalid document name.');
          const validUntil = Date.now() + 10 * 60 * 1000;
          return { token: await issueSignedToken({ pathname, operations: ['put'],
            allowedContentTypes: types, maximumSizeInBytes: 30 * 1024 * 1024, validUntil }),
          urlOptions: { allowedContentTypes: types, maximumSizeInBytes: 30 * 1024 * 1024,
            validUntil, addRandomSuffix: false, allowOverwrite: false } };
        }
      });
      return res.status(200).json(result);
    }
    if (req.method === 'GET') {
      const pathname = new URL(req.url, 'https://starlight.local').searchParams.get('pathname');
      if (!pathnameValid(pathname)) return res.status(400).json({ error: 'Invalid document name.' });
      const result = await get(pathname, { access: 'private' });
      if (!result) return res.status(404).json({ error: 'File not found.' });
      if (result.blob.size > 30 * 1024 * 1024) return res.status(413).json({ error: 'File is too large.' });
      res.setHeader('Content-Type', result.blob.contentType || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'attachment');
      for await (const chunk of result.stream) res.write(chunk);
      return res.end();
    }
    return res.status(405).json({ error: 'Unsupported request.' });
  } catch (error) {
    console.error('Document service failed:', error.name, error.message);
    return res.status(503).json({ error: 'File storage is unavailable. The copy on this device is safe.' });
  }
}
