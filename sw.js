/* BudSignal service worker — network-first with cache fallback, so the app
   shell still opens offline (data comes from live APIs and simply falls back
   to the labeled demo mode when unreachable). Old cache generations are
   deleted on activate so stale shells cannot linger across deploys. */

const CACHE = 'budsignal-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // version.json is the update probe — never intercept or cache it
  if (url.pathname.endsWith('version.json')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
