// Service Worker: התראות פוש + שמירת האפליקציה במטמון לטעינה מהירה
const CACHE = 'king-jack-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// קודם רשת, ואם אין - מהמטמון
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // הדף הראשי תמיד טרי מהרשת - כדי שעדכונים יגיעו מיד
  const fresh = req.mode === 'navigate' ? fetch(req, { cache: 'no-store' }) : fetch(req);
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match(self.registration.scope) : undefined)),
      ),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const title = d.title || 'King Jack 👑';
  e.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { url: d.url || './' },
      tag: d.tag || undefined,
      renotify: !!d.tag,
      dir: 'rtl',
      lang: 'he',
      vibrate: [120, 60, 120],
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope)) {
          c.postMessage({ type: 'open-url', url });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
