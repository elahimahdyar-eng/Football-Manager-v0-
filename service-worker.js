const CACHE_NAME = "football-manager-v4";

const APP_FILES = [
  "/Football-manager-v0-/",
  "/Football-manager-v0-/index.html",
  "/Football-manager-v0-/manifest.json",
  "/Football-manager-v0-/icon-192.png",
  "/Football-manager-v0-/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.clients.claim().then(() => {
      return caches.keys().then(keys => {
        return Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      });
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request);
    })
  );
});
