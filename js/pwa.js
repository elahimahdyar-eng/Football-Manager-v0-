/* ============================================================
   pwa.js — ثبت service worker برای اجرای آفلاین
   ============================================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
