import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import handler, { documentAuthorized } from '../api/documents.js';

const previous = process.env.STARLIGHT_PAIRING_KEY_HASH;
process.env.STARLIGHT_PAIRING_KEY_HASH = createHash('sha256').update('test-pairing-key').digest('hex');
const request = (authorization, method = 'GET', url = '/api/documents?pathname=starlight/documents/123e4567-e89b-12d3-a456-426614174000/notes.pdf') => ({
  method, url, headers: authorization ? { authorization } : {}
});
function response() {
  return { code: 200, headers: {}, status(code) { this.code = code; return this; },
    setHeader(key, value) { this.headers[key] = value; }, json(data) { this.data = data; return this; } };
}
try {
  assert.equal(documentAuthorized(request('Bearer test-pairing-key')), true);
  assert.equal(documentAuthorized(request('Bearer wrong')), false);
  assert.equal(documentAuthorized(request()), false);
  const denied = response();
  await handler(request(), denied);
  assert.equal(denied.code, 401);
  assert.equal(denied.headers['Cache-Control'], 'private, no-store');
  const unavailable = response();
  await handler(request('Bearer test-pairing-key'), unavailable);
  assert.equal(unavailable.code, 503);
  console.log('Private document authorization checks pass.');
} finally {
  if (previous === undefined) delete process.env.STARLIGHT_PAIRING_KEY_HASH;
  else process.env.STARLIGHT_PAIRING_KEY_HASH = previous;
}
