/* ============================================================
   net.js — لایه‌ی شبکه‌ی اپ آنلاین (کوتاه، قابل تست، مخصوص موبایل)
   ------------------------------------------------------------
   چرا یک لایه‌ی جدا؟
   • کاربر ایرانی روی نت ضعیف بازی می‌کند: هر درخواست «مهلت» دارد
     (AbortController) تا UI هیچ‌وقت بی‌نهایت منتظر نماند.
   • خطای شبکه و خطای سرور باید تفکیک شوند تا پیام درست بدهیم.
   • آدرس سرور: اگر بازی از خود سرور سرو شود، مسیرهای نسبی؛ وگرنه
     آدرس ذخیره‌شده در «باشگاه ← تنظیمات» (کلید fm_server_url).
   ============================================================ */

const NET_TOKEN_KEY = 'fm_token';
const NET_BASE_KEY  = 'fm_server_url';
const NET_TIMEOUT   = 12000;      /* میلی‌ثانیه — سقف انتظار هر درخواست */

const NET = {
  /* ---------- آدرس ---------- */
  base(){
    let saved = '';
    try{ saved = localStorage.getItem(NET_BASE_KEY) || ''; }catch(e){}
    if(saved) return String(saved).replace(/\/+$/, '');
    if(typeof location !== 'undefined' && location.protocol === 'file:') return 'http://localhost:8081';
    return '';                      /* همان مبدأ (پیشنهادشده) */
  },
  setBase(u){
    try{ u ? localStorage.setItem(NET_BASE_KEY, String(u).replace(/\/+$/, '')) : localStorage.removeItem(NET_BASE_KEY); }catch(e){}
  },
  url(path){ return this.base() + path; },

  /* ---------- توکن ---------- */
  token(){ try{ return localStorage.getItem(NET_TOKEN_KEY) || ''; }catch(e){ return ''; } },
  setToken(t){ try{ t ? localStorage.setItem(NET_TOKEN_KEY, t) : localStorage.removeItem(NET_TOKEN_KEY); }catch(e){} },
  loggedIn(){ return !!this.token(); },

  /* ---------- درخواست ---------- */
  async req(path, opts){
    const o = opts || {};
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(()=> ctrl.abort(), o.timeout || NET_TIMEOUT) : null;
    const headers = { 'Content-Type': 'application/json' };
    const t = this.token();
    if(t) headers.Authorization = 'Bearer ' + t;
    let res;
    try{
      res = await fetch(this.url(path), {
        method: o.method || 'GET',
        headers,
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
        signal: ctrl ? ctrl.signal : undefined
      });
    }catch(e){
      if(timer) clearTimeout(timer);
      const timeout = e && e.name === 'AbortError';
      return { ok:false, status:0, netError:true, offline:!navigator.onLine,
        error: timeout ? 'سرور دیر پاسخ داد. نت را چک کن و دوباره بزن.' : 'به سرور وصل نشدم. اینترنت/آدرس سرور را چک کن.' };
    }
    if(timer) clearTimeout(timer);
    let data = null, text = '';
    try{ text = await res.text(); }catch(e){}
    try{ data = text ? JSON.parse(text) : null; }catch(e){ data = null; }
    if(res.status === 401) this.setToken('');
    const out = Object.assign({ ok: res.ok, status: res.status }, data || {});
    if(!res.ok && !out.error) out.error = 'خطای سرور (' + res.status + ')';
    return out;
  },
  get(p, opts){ return this.req(p, opts); },
  post(p, body, opts){ return this.req(p, Object.assign({ method:'POST', body: body || {} }, opts || {})); },

  /* ---------- نقاط پایانی ---------- */
  health(){ return this.req('/api/health', { timeout: 6000 }); },
  otp(phone){ return this.post('/api/auth/otp', { phone }); },
  verify(phone, code, clubName){ return this.post('/api/auth/verify', { phone, code, clubName }); },
  me(){ return this.get('/api/me'); },
  profile(){ return this.get('/api/profile'); },
  saveProfile(patch){ return this.post('/api/profile', patch); },
  squad(){ return this.get('/api/squad'); },
  bootstrapSquad(clubName){ return this.post('/api/squad/bootstrap', { clubName }); },
  saveLineup(payload){ return this.post('/api/squad/lineup', payload); },
  train(kind){ return this.post('/api/squad/train', { kind }); },
  market(){ return this.get('/api/market'); },
  buy(id){ return this.post('/api/market/buy', { id }); },
  sell(playerId){ return this.post('/api/market/sell', { playerId }); },
  leaderboard(){ return this.get('/api/leaderboard'); },
  news(){ return this.get('/api/news'); },
  createLeague(name, opts){ return this.post('/api/leagues', Object.assign({ name, fillAI:true, fillTo:8 }, opts || {})); },
  joinLeague(id){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/join', {}); },
  league(id){ return this.get('/api/leagues/' + encodeURIComponent(id)); },
  simulate(id){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/simulate', {}); },
  advance(id, force){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/advance', { force: !!force }); },
  submitWeek(id){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/submit-squad', {}); },
  fillAI(id, target){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/fillai', { target: target || 8 }); },
  newSeason(id){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/newseason', {}); },
  verifyResult(id, res){ return this.post('/api/leagues/' + encodeURIComponent(id) + '/verify',
    { round: res.r, hi: res.hi, ai: res.ai, homeGoals: res.h, awayGoals: res.a }); },
  report(reportId){ return this.get('/api/matches/' + encodeURIComponent(reportId)); },
  serverPage(){ return this.base() + '/server'; }
};

/* ---------- ابزارهای کوچک مشترک ---------- */
function moneyFmt(n){
  const v = Math.round(Number(n) || 0);
  const abs = Math.abs(v);
  if(abs >= 1000000) return (v / 1000000).toFixed(abs >= 10000000 ? 0 : 1) + 'M';
  if(abs >= 1000) return Math.round(v / 1000) + 'K';
  return String(v);
}
function moneyFull(n){ return (Math.round(Number(n) || 0)).toLocaleString('en-US'); }
function countdownParts(ms){
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
function faCountdown(ms){
  const p = countdownParts(ms);
  if(p.d > 0) return `${faNum(p.d)} روز و ${faNum(p.h)} ساعت`;
  if(p.h > 0) return `${faNum(p.h)} ساعت و ${faNum(p.m)} دقیقه`;
  if(p.m > 0) return `${faNum(p.m)} دقیقه و ${faNum(p.s)} ثانیه`;
  return `${faNum(p.s)} ثانیه`;
}
function netLabel(ok){
  return ok ? 'آنلاین' : 'آفلاین';
}
