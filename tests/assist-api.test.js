import assert from 'node:assert/strict';
import handler from '../api/assist.js';

function response() {
  return { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
}
const original = globalThis.fetch;
try {
  const req = { method: 'POST', headers: { host: 'starlight.example', origin: 'https://starlight.example' },
    body: { kind: 'answer', question: 'What is next?', context: '[E1] An item' } };
  const unauthenticated = response(); await handler(req, unauthenticated);
  assert.equal(unauthenticated.code, 401);
  const blocked = response(); await handler({ ...req, headers: { ...req.headers, origin: 'https://other.example' } }, blocked);
  assert.equal(blocked.code, 403);
  const key = 'sk-' + 'a'.repeat(30); let sent;
  globalThis.fetch = async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({ output: [{ content: [{ type: 'output_text', text: 'Start here [E1].' }] }] }) }; };
  const success = response(); await handler({ ...req, headers: { ...req.headers, 'x-ai-key': key } }, success);
  assert.equal(success.body.text, 'Start here [E1].');
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(JSON.parse(sent.options.body).store, false);
  assert.equal(sent.options.headers.Authorization, `Bearer ${key}`);
  assert.ok(!JSON.stringify(success.body).includes(key));
} finally { globalThis.fetch = original; }
console.log('One-request assistant relay checks pass.');
