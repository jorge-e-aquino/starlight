/**
 * Offline shell.
 *
 * The point is not offline as a feature, it is that the app must open. Campus
 * wifi that resolves slowly is the common case, and an app that shows a blank
 * page while it waits is an app you stop reaching for. Everything Starlight
 * needs to render is already on the device: the schema is bundled and the
 * progress overlay is in localStorage, so a cached shell is a complete app, and
 * sync catches up whenever the network returns.
 *
 * Hand written rather than generated because the whole policy is two rules, and
 * a build-time precache manifest would be more machinery than that is worth.
 */
const VERSION = 'starlight-v2';

// Scope is the directory this file was served from, which is what makes the
// same worker correct at a domain root and under a project path.
const ROOT = new URL('./', self.location).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll([ROOT])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // the GitHub API is never cached

  // Navigations come from the network first so a deploy is picked up on the next
  // open, and fall back to the cached shell when there is no network to ask.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(ROOT, copy));
          return res;
        })
        .catch(() => caches.match(ROOT).then((hit) => hit || caches.match(request)))
    );
    return;
  }

  // Everything else is a content-hashed build asset, so a hit is never stale:
  // a changed file arrives under a new name and misses the cache on its own.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy));
          }
          return res;
        })
    )
  );
});

self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data?.json() || {}; } catch { /* invalid payload */ }
  if (!message.title || !message.body) return;
  event.waitUntil(self.registration.showNotification(message.title, {
    body: message.body,
    tag: message.tag || 'starlight-reminder',
    icon: `${ROOT}icon-192.png`,
    data: { url: message.url || ROOT }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || ROOT, self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === target.origin);
    if (existing) { await existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
