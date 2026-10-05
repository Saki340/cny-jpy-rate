// Service worker for "add to home screen" and offline use.
//
// Network first for everything: online visitors always get the latest page
// and rates, so a deploy never leaves anyone on stale files. Each successful
// response is cached, and when the network is unavailable the last copy is
// served instead (the page shows the data date, so old rates are visible).

const CACHE = "rate-board-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        const home = await caches.match("/");
        if (home) return home;
      }
      throw err;
    }
  })());
});
