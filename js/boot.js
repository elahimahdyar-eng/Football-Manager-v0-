/* ============================================================
   boot.js — راه‌اندازی هنگام بارگذاری صفحه
   اگر ذخیره‌ی خودکاری وجود داشته باشد، بازی همان‌جا ادامه پیدا می‌کند.
   ============================================================ */
function boot(){
  refreshSetupSummary();
  tryAutoLoad();
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
