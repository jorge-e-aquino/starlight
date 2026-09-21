import assert from 'node:assert/strict';
import handler from '../api/calendar.js';

function response() {
  return { statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; }
  };
}
for (const address of ['http://gatech.instructure.com/feeds/calendars/x', 'https://evil.example/feeds/calendars/x', 'https://gatech.instructure.com/api/v1/users']) {
  const res = response();
  await handler({ method: 'POST', body: { feedUrl: address } }, res);
  assert.equal(res.statusCode, 400);
}
const original = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(url.hostname, 'gatech.instructure.com');
  assert.equal(options.redirect, 'error');
  return { ok: true, headers: new Map(), text: async () => 'BEGIN:VCALENDAR\nEND:VCALENDAR' };
};
try {
  const res = response();
  await handler({ method: 'POST', body: { feedUrl: 'https://gatech.instructure.com/feeds/calendars/example.ics' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.ok(res.body.includes('BEGIN:VCALENDAR'));
} finally { globalThis.fetch = original; }
console.log('Calendar relay checks pass.');
