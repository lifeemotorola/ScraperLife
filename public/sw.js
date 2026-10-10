// v2: navigation requests are now network-first with a cache fallback.
// The previous version was cache-first with a name that never changed, so browsers that
// had installed the old worker kept serving the first-ever cached index.html (and its
// stale hashed assets) forever — even after redeploys — which left users with a broken
// or outdated page that "would not open" until they cleared site data.
const CACHE_NAME = 'scraper-life-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/scraper-life-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads must always reach the network first so new deploys take effect;
  // the cached shell is the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Everything else (hashed build assets, the 2 MB character model, icons) is immutable
  // per content hash, so a plain cache-first strategy is correct and keeps reloads instant.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        return response;
      });
    }),
  );
});
