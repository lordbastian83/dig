/* Bloodstock Scanner service worker — network-first with cache fallback so
   the app shell (and your watchlist UI) opens offline at the sales ground.
   Same pattern as budsignal's worker. */

const CACHE = 'bloodstock-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  // drop any stale caches from earlier versions
  const keys = await caches.keys();
  const hadOld = keys.some((k) => k !== CACHE);
  await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
  await self.clients.claim();
  // If this is an UPDATE (old caches existed), the open app is showing a stale
  // shell — reload every window once so it picks up the fresh HTML/CSS/JS.
  // Guarded by hadOld so a first install never triggers a reload loop.
  if (hadOld) {
    const wins = await self.clients.matchAll({ type: 'window' });
    for (const w of wins) { try { w.navigate(w.url); } catch (_) {} }
  }
})()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request)),
  );
});
