/* ============================================================
   sw-app.js — Service Worker for PWA (مدیر تیم)
   ============================================================ */
const CACHE_NAME = 'manager-v6';
const STATIC_ASSETS = [
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/util.js',
  './js/svg.js',
  './js/facegen.js',
  './js/assets.js',
  './js/net.js',
  './js/live.js',
  './js/data.js',
  './js/gen.js',
  './js/engine.js',
  './icon-192.png',
  './icon-512.png',
  './manifest-app.json',
  // Offline game assets
  './offline.html',
  './css/style.css',
  './js/boot.js',
  './js/challenge.js',
  './js/game.js',
  './js/league.js',
  './js/league-core.js',
  './js/livematch.js',
  './js/online.js',
  './js/replay.js',
  './js/save.js',
  './js/sim.js',
  './js/pwa.js',
  './service-worker.js'
];

/* Install — cache static assets
   نکته: اگر یک فایل در دسترس نباشد، addAll کل نصب را رد می‌کند؛
   پس هر فایل جدا و با catch اضافه می‌شود تا PWA هرگز قفل نشود. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(STATIC_ASSETS.map(u => cache.add(u).catch(()=>{})))
    )
  );
  self.skipWaiting();
});

/* Activate — clean old caches */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      );
    })
  );
  self.clients.claim();
});

/* Fetch — network first for API, cache first for static */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API calls — network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  /* پوسته‌ی اپ: اول شبکه (تا نسخه‌ی تازه بیاید)، بعد کش */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache new static requests
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});