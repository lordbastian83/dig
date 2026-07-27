/* Bloodstock Scanner service worker — DISABLED.
   The service worker caused stale-cache and reload issues, and the app is
   online-only (auth + live data) so offline caching bought little. This
   worker now unregisters itself and clears every cache, so any device that
   still has an old worker is cleaned up on next visit. The page is served
   fresh via cache-control:no-cache headers instead. No fetch handler, no
   forced reloads — nothing here can serve stale content or loop. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
  } catch (_) { /* best effort */ }
})()));
