// Service worker for "add to home screen" and offline use.
//
// Network first for everything: online visitors always get the latest page
// and rates, so a deploy never leaves anyone on stale files. Each successful
// response is cached, and when the network is unavailable the last copy is
// served instead (the page shows the data date, so old rates are visible).

// Bumping the name drops older caches on activate (v1 still held the
// removed mdui files).
const CACHE = "rate-board-v2";

// Pages are cached under their path plus ?lang= only, so share links
// (?amount=…&from=…) do not each keep a copy of the page.
function cacheKey(request) {
  if (request.mode !== "navigate") return request;
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  return url.origin + url.pathname + (lang ? `?lang=${encodeURIComponent(lang)}` : "");
}

function markFromCache(response) {
  const headers = new Headers(response.headers);
  headers.set("X-From-Cache", "1");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

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
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(cacheKey(request), copy)));
      }
      return response;
    } catch (err) {
      const cached = await caches.match(cacheKey(request));
      // Mark cached answers so the page can tell the visitor they are offline
      // and which day's data they are looking at.
      if (cached) return markFromCache(cached);
      if (request.mode === "navigate") {
        const home = await caches.match("/");
        if (home) return markFromCache(home);
      }
      throw err;
    }
  })());
});
