// Service worker for دفترکلاس PWA.
// Strategy:
//   - API (/api/*): never cached — always network.
//   - Navigations (HTML): network-first, fall back to cached shell when offline.
//   - Static assets (hashed /assets/*, /fonts/*, /icons/*): cache-first.
const CACHE = "daftarclass-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data only

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put("/index.html", copy));
          return res;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then(cached => cached || caches.match("/") || caches.match(req))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      hit =>
        hit ||
        fetch(req).then(res => {
          const path = url.pathname;
          const cacheable =
            res.ok &&
            (path.startsWith("/assets/") ||
              path.startsWith("/fonts/") ||
              path.startsWith("/icons/"));
          if (cacheable) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put(req, copy));
          }
          return res;
        })
    )
  );
});
