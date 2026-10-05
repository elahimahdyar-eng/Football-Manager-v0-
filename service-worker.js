/* ============================================================
   service-worker.js — اجرای آفلاین
   ------------------------------------------------------------
   استراتژی:
   • صفحه‌ی HTML: network-first  → کاربر همیشه آخرین نسخه‌ی بازی را
     می‌بیند و آپدیت‌ها بلافاصله اعمال می‌شوند؛ اگر آفلاین بود،
     نسخه‌ی کش‌شده سرو می‌شود.
   • فایل‌های ثابت (css/js/آیکون/فونت): cache-first + به‌روزرسانی
     پس‌زمینه، برای بارگذاری سریع و کارکرد کامل آفلاین.
   ============================================================ */

const CACHE_NAME = "football-manager-v7";

const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/util.js",
  "./js/svg.js",
  "./js/data.js",
  "./js/gen.js",
  "./js/engine.js",
  "./js/game.js",
  "./js/ui.js",
  "./js/replay.js",
  "./js/challenge.js",
  "./js/save.js",
  "./js/sim.js",
  "./js/boot.js",
  "./js/pwa.js",
  "./icon-192.png",
  "./icon-512.png"
];

/* نصب: پیش‌کش فایل‌های اصلی (اگر یکی از آن‌ها نبود، نصب شکست نمی‌خورد) */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        CORE_FILES.map(url =>
          cache.add(url).catch(() => { /* فایل اختیاری/در دسترس نیست */ })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* فعال‌سازی: پاک کردن کش‌های قدیمی */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (url.origin !== self.location.origin) return false;
  return request.destination === "document" || /\.html?$/.test(url.pathname);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  /* فونت گوگل و منابع بیرونی: از شبکه، با کش پویا */
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && isHtmlRequest(request, url)) {
    /* --- network-first برای صفحه‌ی بازی --- */
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  /* --- cache-first + revalidate برای بقیه --- */
  event.respondWith(
    caches.match(request).then(hit => {
      const network = fetch(request)
        .then(response => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
