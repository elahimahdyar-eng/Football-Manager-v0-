/* ============================================================
   online.js — اتصال کلاینت به سرور (گام ۲ برنامه‌ی آنلاین)
   ------------------------------------------------------------
   مدل امنیتی (همان که در PLAN-ONLINE.md آمد):

     سرور «صاحب» نتیجه است. کلاینت فقط:
       ۱) ترکیبش را آپلود می‌کند
       ۲) از سرور می‌خواهد دور را بازی کند (سرور همان engine.js را اجرا می‌کند)
       ۳) گزارش رسمی را از سرور می‌گیرد و برای کاربر پخش می‌کند

   پس تقلب بی‌معناست: کلاینت هیچ‌وقت نتیجه را اعلام نمی‌کند؛ فقط
   می‌تواند نتیجه‌اش را «تأیید» کند (بازتولید از seed).

   آدرس سرور:
   • اگر بازی از خود سرور باز شده باشد (پیشنهادشده) ⇒ مسیرهای نسبی
     `/api/...` خودکار کار می‌کنند
   • در غیر این صورت، آدرس سرور از «تنظیمات» خوانده می‌شود
     (state.prefs.onlineBase)
   ============================================================ */

const ONLINE_TOKEN_KEY = 'fm_online_token_v1';
const ONLINE_DEFAULT_BASE = '';

/* ---------- پایه‌ی آدرس ---------- */
function onlineBase(){
  const pref = (state && state.prefs && state.prefs.onlineBase) ? String(state.prefs.onlineBase).trim() : '';
  const base = pref || ONLINE_DEFAULT_BASE;
  return base.replace(/\/+$/, '');
}
function onlineUrl(path){ return onlineBase() + path; }

/* ---------- توکن (در localStorage، جدا از فایل ذخیره‌ی بازی) ---------- */
function onlineToken(){
  try{ return localStorage.getItem(ONLINE_TOKEN_KEY) || ''; }catch(e){ return ''; }
}
function setOnlineToken(t){
  try{ if(t) localStorage.setItem(ONLINE_TOKEN_KEY, t); else localStorage.removeItem(ONLINE_TOKEN_KEY); }catch(e){}
}
function onlineState(){
  if(!state.online) state.online = { player: null, leagues: [], currentLeague: null, engine: null, busy: false, error: '' };
  if(!Array.isArray(state.online.leagues)) state.online.leagues = [];
  return state.online;
}
function onlineLoggedIn(){ return !!onlineToken(); }

/* ---------- لایه‌ی درخواست ---------- */
async function onlineFetch(path, opts){
  const o = Object.assign({ method: 'GET' }, opts || {});
  o.headers = Object.assign({ 'Content-Type': 'application/json' }, o.headers || {});
  const t = onlineToken();
  if(t) o.headers.Authorization = 'Bearer ' + t;
  if(o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  let res, json = null;
  try{
    res = await fetch(onlineUrl(path), o);
    const txt = await res.text();
    try{ json = txt ? JSON.parse(txt) : null; }catch(e){ json = { error: 'پاسخ سرور قابل خواندن نبود.' }; }
  }catch(e){
    const msg = 'به سرور وصل نشدم — آدرس سرور و اینترنت را چک کن.';
    onlineState().error = msg;
    return { ok:false, status:0, netError:true, error: msg };
  }
  if(res.status === 401) setOnlineToken('');
  return Object.assign({ ok: res.ok, status: res.status }, json || {});
}
/* آدرس سرور سالم است؟ */
async function onlinePing(){
  const r = await onlineFetch('/api/health');
  const O = onlineState();
  if(r && r.ok){
    O.engine = r.engine;
    O.fingerprint = r.fingerprint;
    O.dev = !!r.dev;
    O.serverTime = r.time;
    return true;
  }
  return false;
}

/* ---------- ورود با کد یک‌بارمصرف ---------- */
let _pendingPhone = '';
async function onlineRequestOtp(phone){
  const p = String(phone || '').replace(/[^\d]/g, '');
  if(!/^09\d{9}$/.test(p)){ showToast('شماره‌ی موبایل درست نیست (مثل ۰۹۱۲۳۴۵۶۷۸۹).', 'error'); return null; }
  const O = onlineState(); O.busy = true;
  const r = await onlineFetch('/api/auth/otp', { method:'POST', body:{ phone: p } });
  O.busy = false;
  if(!r.ok){ showToast(r.error || 'درخواست کد ناموفق بود.', 'error'); render(); return null; }
  _pendingPhone = p;
  showToast('کد ورود فرستاده شد ✅');
  if(r.code){  /* حالت دمو: کد در پاسخ می‌آید */
    const el = document.getElementById('onCode');
    if(el) el.value = r.code;
    showToast('حالت دمو: کد ' + r.code + ' خودکار پر شد.', 'info');
  }
  render();
  return r;
}
async function onlineVerifyOtp(code){
  const c = String(code || '').replace(/[^\d]/g, '');
  if(c.length !== 5){ showToast('کد ۵ رقمی را وارد کن.', 'error'); return null; }
  const O = onlineState(); O.busy = true;
  const r = await onlineFetch('/api/auth/verify', { method:'POST', body:{ phone: _pendingPhone, code: c, clubName: state.clubName } });
  O.busy = false;
  if(!r.ok){ showToast(r.error || 'ورود ناموفق بود.', 'error'); return null; }
  setOnlineToken(r.token);
  O.player = r.player;
  showToast('وارد شدی، ' + (r.player.clubName || '') + ' 🎉');
  await onlineRefresh();
  return r;
}
function onlineLogout(){
  askConfirm({ title:'خروج از حساب آنلاین؟', body:'توکن ورود از این مرورگر پاک می‌شود. باشگاه و پیشرفت بازی آفلاینت دست‌نخورده می‌ماند.', yes:'خروج', danger:true,
    onYes(){ setOnlineToken(''); const O = onlineState(); O.player = null; O.leagues = []; O.currentLeague = null; showToast('از حساب آنلاین خارج شدی.'); render(); } });
}

/* ---------- تاریخ و مدت (فارسی، بدون وابستگی) ---------- */
function faDuration(ms){
  if(!(ms > 0)) return 'به پایان رسیده';
  const mins = Math.floor(ms / 60000), hours = Math.floor(mins / 60), days = Math.floor(hours / 24);
  if(days > 0) return `${faNum(days)} روز و ${faNum(hours % 24)} ساعت`;
  if(hours > 0) return `${faNum(hours)} ساعت و ${faNum(mins % 60)} دقیقه`;
  return `${faNum(Math.max(1, mins))} دقیقه`;
}
function faDateTime(ts){
  if(!ts) return '—';
  try{ return new Date(ts).toLocaleString('fa-IR', { weekday:'long', hour:'2-digit', minute:'2-digit' }); }
  catch(e){ return new Date(ts).toISOString().slice(5, 16).replace('T', ' '); }
}

/* ---------- همگام‌سازی ---------- */
async function onlineRefresh(){
  if(!onlineLoggedIn()){ onlineState().player = null; return null; }
  const r = await onlineFetch('/api/me');
  const O = onlineState();
  if(!r.ok){ O.player = null; return null; }
  O.player = r.player; O.leagues = r.leagues || []; O.engine = r.engine;
  if(O.currentLeague && !O.leagues.some(l=>l.id === O.currentLeague)) O.currentLeague = null;
  return r;
}
/* آپلود ترکیب فعلی (نیاز به ترکیب کامل ۱۱ نفره) */
async function onlineUploadSquad(quiet){
  if(state.starters.length !== 11){ showToast('برای لیگ آنلاین باید ترکیبت کامل باشه (تیم من ← چیدمان).', 'error'); return null; }
  const s = teamStrengthFor(state.players, state.starters);
  const payload = {
    clubName: state.clubName, formation: state.formation, style: state.style,
    captainId: state.captainId || null,
    atk: s.atk, def: s.def, fitness: s.fitness, stamina: s.stamina, morale: s.morale,
    players: state.players.map(p=>({ id:p.id, name:p.name, pos:p.position, attack: Math.round(p.attack) })),
    slots: state.starters.slice(0, 11)
  };
  const r = await onlineFetch('/api/squad', { method:'POST', body: payload });
  if(!quiet) showToast(r.ok ? 'ترکیبت روی سرور ثبت شد ✅' : (r.error || 'ثبت ترکیب ناموفق بود.'), r.ok ? '' : 'error');
  if(r.ok) await onlineRefresh();
  return r;
}
/* ساخت و عضویت */
async function onlineCreateLeague(name, opts){
  const n = sanitizeName((name||'').trim(), '', 26);
  if(!n){ showToast('اسم لیگ را وارد کن.', 'error'); return null; }
  if(!state.online || !state.online.player || !state.online.player.hasSquad){
    showToast('اول ترکیبت را آپلود کن.', 'error'); return null;
  }
  const o = opts || {};
  const r = await onlineFetch('/api/leagues', { method:'POST', body:{
    name: n,
    fillAI: o.fillAI !== false,                 /* پیش‌فرض: با تیم‌های AI پر شود تا لیگ بازی‌شدنی باشد */
    fillTo: o.fillTo || 8,
    windowHours: o.windowHours || undefined
  } });
  if(!r.ok){ showToast(r.error || 'ساخت لیگ ناموفق بود.', 'error'); return null; }
  const O = onlineState();
  O.currentLeague = r.league.id;
  O.leagueView = r.league;
  showToast('لیگ «' + n + '» ساخته شد ✅ — شناسه: ' + r.league.id + ' (برای رفقا بفرست)' + (r.league.aiCount ? ` · ${faNum(r.league.aiCount)} تیم AI` : ''));
  await onlineRefresh();
  return r.league;
}
async function onlineJoinLeague(id){
  const code = String(id||'').trim();
  if(!code){ showToast('شناسه‌ی لیگ را وارد کن.', 'error'); return null; }
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(code) + '/join', { method:'POST', body:{} });
  if(!r.ok){ showToast(r.error || 'عضویت ناموفق بود.', 'error'); return null; }
  onlineState().currentLeague = r.league.id;
  showToast('به لیگ «' + r.league.name + '» اضافه شدی ✅');
  await onlineRefresh();
  return r.league;
}
async function onlineOpenLeague(id){
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(id));
  if(!r.ok){ showToast(r.error || 'لیگ باز نشد.', 'error'); return null; }
  const O = onlineState();
  O.currentLeague = r.league.id;
  O.leagueView = r.league;
  render();
  return r.league;
}
/* بازی دور بعد توسط سرور (سرور = منبع حقیقت) */
async function onlineSimulateRound(){
  const O = onlineState();
  if(!O.currentLeague) return null;
  O.busy = true; render();
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/simulate', { method:'POST', body:{} });
  O.busy = false;
  if(!r.ok){ showToast(r.error || 'شبیه‌سازی ناموفق بود.', 'error'); render(); return null; }
  if(r.done){ showToast('لیگ تمام شده 🏁'); await onlineOpenLeague(O.currentLeague); return r; }
  /* خلاصه‌ی دور */
  const matches = r.matches || [];
  const myName = (O.player && O.player.clubName) || state.clubName;
  const mine = matches.find(m=> m.home === myName || m.away === myName);
  if(mine && mine.reportId){
    await onlineFetchReportIntoReports(mine.reportId);   /* گزارش رسمی سرور در بازی ذخیره می‌شود */
    await onlineOpenLeague(O.currentLeague);
    if((!state.prefs || state.prefs.liveView !== false)) openLiveMatch('srv_' + mine.reportId, ()=> onlineRoundModal(r));
    else onlineRoundModal(r);
  } else {
    await onlineOpenLeague(O.currentLeague);
    onlineRoundModal(r);
  }
  return r;
}
/* ---------- عملیات هفته‌ای لیگ ---------- */
/* ثبت ترکیب برای هفته‌ی جاری (تا وقتی پنجره باز است) */
async function onlineSubmitWeek(){
  const O = onlineState();
  if(!O.currentLeague) return null;
  O.busy = true; render();
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/submit-squad', { method:'POST', body:{} });
  O.busy = false;
  if(!r.ok){ showToast(r.error || 'ثبت ترکیب هفته ناموفق بود.', 'error'); render(); return null; }
  if(r.league) O.leagueView = r.league;
  showToast('ترکیب این هفته ثبت شد ✅ (تا پایان پنجره می‌توانی عوضش کنی)');
  render();
  return r;
}
/* پر کردن لیگ با تیم‌های AI (میزبان، پیش از شروع) */
async function onlineFillAi(target){
  const O = onlineState();
  if(!O.currentLeague) return null;
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/fillai', { method:'POST', body:{ target: target || 8 } });
  if(!r.ok){ showToast(r.error || 'افزودن تیم AI ناموفق بود.', 'error'); return null; }
  if(r.league) O.leagueView = r.league;
  showToast(r.added ? `${faNum(r.added)} تیم AI اضافه شد ✅` : 'لیگ همین حالا پر است.');
  render();
  return r;
}
/* بستن پنجره و بازی فوری (میزبان) */
async function onlineForceAdvance(){
  const O = onlineState();
  if(!O.currentLeague) return null;
  const go = async()=>{
    O.busy = true; render();
    const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/advance', { method:'POST', body:{ force:true } });
    O.busy = false;
    if(!r.ok){ showToast(r.error || 'بازی فوری ناموفق بود.', 'error'); render(); return null; }
    if(r.league) O.leagueView = r.league;
    if(r.matches && r.matches.length) onlineRoundModal(r);
    else { showToast('فصل تمام شده — «فصل جدید» را بزن.'); }
    render();
    return r;
  };
  askConfirm({ title:'بستن پنجره و بازی فوری؟', body:'همه‌ی مسابقات همین هفته بازی می‌شود (به‌جای انتظار تا پایان پنجره).', yes:'بازی کن', onYes:go });
  return true;
}
/* فصل جدید (میزبان، بعد از پایان فصل) */
async function onlineNewSeason(){
  const O = onlineState();
  if(!O.currentLeague) return null;
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/newseason', { method:'POST', body:{} });
  if(!r.ok){ showToast(r.error || 'ساخت فصل جدید ناموفق بود.', 'error'); return null; }
  if(r.league) O.leagueView = r.league;
  showToast(`فصل ${faNum(r.season)} شروع شد ✅`);
  render();
  return r;
}

/* گرفتن گزارش رسمی از سرور و افزودن آن به گزارش‌های بازی (برای پخش/ری‌پلی) */
async function onlineFetchReportIntoReports(reportId){
  const r = await onlineFetch('/api/matches/' + encodeURIComponent(reportId));
  if(!r.ok || !r.report) return null;
  const rep = r.report;
  rep.id = 'srv_' + reportId;                     /* تا با گزارش‌های محلی قاطی نشود */
  rep.competition = rep.competition || 'server-league';
  rep.season = state.season; rep.week = state.week;
  if(!reportById(rep.id)) pushReport(rep);
  return rep;
}
/* «تأیید نتیجه»: از سرور بخواه نتیجه‌ی اعلامی را بازتولید کند (نمایش عینی ضدتقلب) */
async function onlineVerifyResult(res){
  const O = onlineState();
  if(!O.currentLeague || !res) return null;
  const r = await onlineFetch('/api/leagues/' + encodeURIComponent(O.currentLeague) + '/verify',
    { method:'POST', body:{ round: res.r, hi: res.hi, ai: res.ai, homeGoals: res.h, awayGoals: res.a } });
  if(!r.ok){ showToast(r.error || 'تأیید ناموفق بود.', 'error'); return null; }
  showToast(r.verified ? 'سرور همان نتیجه را بازتولید کرد ✅' : 'سرور نتیجه را رد کرد ❌', r.verified ? '' : 'error');
  return r;
}
/* اشتراک‌گذاری دعوت‌نامه */
function onlineShareLeague(id, name){
  const text = `⚽ لیگ آنلاین «${name}» در بازی «مدیر تیم»\nشناسه‌ی لیگ: ${id}\n\nبازی را باز کن → تب «آنلاین» → «ورود به لیگ» → این شناسه را بچسبان.`;
  if(navigator.share) navigator.share({ title:'لیگ آنلاین', text }).catch(()=> copyTextToClipboard(id, 'شناسه‌ی لیگ کپی شد ✅'));
  else copyTextToClipboard(id, 'شناسه‌ی لیگ کپی شد ✅');
}

/* ---------- خلاصه‌ی دور (مودال) ---------- */
function onlineRoundModal(res){
  const lgView = onlineState().leagueView;
  const rows = (res.matches||[]).map(m=>`<div class="row ${(m.reportId && onlineState().player && (m.home===onlineState().player.clubName || m.away===onlineState().player.clubName))?'al-me':''}">
      <span>${escapeHtml(m.home)} <span class="muted">-</span> ${escapeHtml(m.away)}</span>
      <b>${faNum(m.result.h)} - ${faNum(m.result.a)}</b>
      ${m.reportId ? `<button class="btn ghost small" onclick="openServerReport('${m.reportId}')">گزارش</button>` : ''}
    </div>`).join('');
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" style="max-width:520px;" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>دور ${faNum((res.round||0)+1)} — نتیجه‌ی رسمی سرور</h2>
        <p class="muted" style="font-size:0.72rem;">این نتایج را سرور با همان موتور بازی محاسبه کرده؛ قابل دست‌کاری نیستند.</p>
        ${rows}
        ${lgView ? `<div style="margin-top:12px;"><div class="muted" style="font-size:0.72rem; margin-bottom:6px;">جدول</div>${onlineTableHtml(lgView)}</div>` : ''}
        <button class="btn primary" style="width:100%; margin-top:12px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}
async function openServerReport(reportId){
  const rep = await onlineFetchReportIntoReports(reportId);
  if(!rep) { showToast('گزارش پیدا نشد.', 'error'); return; }
  if((!state.prefs || state.prefs.liveView !== false)) openLiveMatch(rep.id);
  else openReport(rep.id);
}

/* ---------- جدول ---------- */
function onlineTableHtml(lg){
  const aiNames = {};
  (lg.members || []).forEach(m=>{ if(m.ai) aiNames[m.clubName] = true; });
  const rows = (lg.table || []).map(t=>`<tr class="${t.name === ((onlineState().player||{}).clubName || state.clubName) ? 'me' : ''}">
    <td>${faNum(t.rank)}</td><td class="team-name"><span class="mini-crest">${crestSVG(t.name)}</span>${escapeHtml(t.name)}${aiNames[t.name] ? ' <span class="muted" style="font-size:0.62rem;">🤖</span>' : ''}</td>
    <td>${faNum(t.played)}</td><td>${faNum(t.won)}</td><td>${faNum(t.drawn)}</td><td>${faNum(t.lost)}</td>
    <td>${faNum(t.gf)}</td><td>${faNum(t.ga)}</td><td><b>${faNum(t.pts)}</b></td></tr>`).join('');
  return `<table class="league al-table">
    <tr><th>#</th><th style="text-align:right;">تیم</th><th>بازی</th><th>ب.ب</th><th>م</th><th>ب.خ</th><th>گ.ز</th><th>گ.خ</th><th>امت</th></tr>
    ${rows || '<tr><td colspan="9" class="empty">هنوز تیمی نیست</td></tr>'}</table>`;
}

/* ---------- آمار جانبی لیگ (آقای گل، پاس‌گل، کلین‌شیت) ---------- */
function onlineSideStatsHtml(lg){
  const S = lg.sideStats || {};
  const list = (arr)=> (arr && arr.length)
    ? arr.slice(0,5).map((x,i)=>`<div class="row"><span>${faNum(i+1)}. ${escapeHtml(x.name)} <span class="muted">(${escapeHtml(x.club)})</span></span><b>${faNum(x.value)}</b></div>`).join('')
    : '<div class="empty">هنوز آماری ثبت نشده</div>';
  return `
  <div class="card glass">
    <h2><span class="dot"></span>آمار جانبی لیگ (فصل ${faNum(lg.season || 1)})</h2>
    <div class="muted" style="font-size:0.72rem; margin-top:4px;">⚽ آقای گل</div>
    ${list(S.scorers)}
    <div class="muted" style="font-size:0.72rem; margin-top:10px;">🎯 پاس گل</div>
    ${list(S.assists)}
    <div class="muted" style="font-size:0.72rem; margin-top:10px;">🧤 کلین‌شیت</div>
    ${list(S.cleanSheets)}
  </div>`;
}
/* ---------- تاریخچه‌ی فصل‌ها ---------- */
function onlineHistoryHtml(lg){
  if(!lg.history || !lg.history.length) return '';
  return `
  <div class="card glass">
    <h2><span class="dot"></span>تاریخچه‌ی لیگ</h2>
    ${lg.history.slice().reverse().map(h=>`<div class="row">
      <span>فصل ${faNum(h.season)} <span class="muted">🏆 ${escapeHtml(h.champion || '—')}</span></span>
      <b style="font-size:0.7rem;">${h.topScorer ? '⚽ ' + escapeHtml(h.topScorer) : ''}</b></div>`).join('')}
  </div>`;
}

/* ---------- صفحه‌ی «آنلاین» ---------- */
function renderOnline(){
  const O = onlineState();
  if(!onlineLoggedIn() || !O.player) return onlineLoginHtml();
  const p = O.player;
  const lg = O.leagueView && O.leagueView.id === O.currentLeague ? O.leagueView : null;
  const engineLine = O.engine
    ? `موتور سرور: نسخه ${faNum(O.engine)}${O.fingerprint ? ` · اثر انگشت ${faNum(O.fingerprint.homeGoals)}-${faNum(O.fingerprint.awayGoals)}` : ''}`
    : 'موتور سرور: —';

  const leaguesHtml = O.leagues.length ? O.leagues.map(l=>`
    <div class="row" style="cursor:pointer;" onclick="onlineOpenLeague('${l.id}')">
      <span>${escapeHtml(l.name)} <span class="muted">(${faNum(l.members)} تیم${l.isOwner?' · میزبان تو':''})</span></span>
      <b>${l.nextRound === null ? '🏁 تمام' : 'دور ' + faNum(l.nextRound+1)}</b>
    </div>`).join('') : '<div class="empty">هنوز در لیگی نیستی</div>';

  const isOwner = lg ? lg.isOwner : false;
  const win = lg ? (lg.window || {}) : {};
  const myMember = lg ? (lg.members || []).find(m=> m.isMe) : null;
  const windowLine = !lg ? '' : (win.open
    ? `⏳ پنجره‌ی ثبت ترکیب باز است — تا ${faDateTime(win.closesAt)} (${faDuration((win.closesAt||0) - Date.now())} دیگر)`
    : '🔒 پنجره‌ی ثبت ترکیب این هفته بسته شده؛ در اولین بازدید/بازی، هفته انجام می‌شود.');
  const leaguePanel = !lg ? '' : `
  <div class="card glass">
    <h2><span class="dot"></span>${escapeHtml(lg.name)} <span class="muted" style="font-size:0.7rem;">شناسه: ${lg.id}${isOwner ? ' · میزبان تو' : ''}</span></h2>
    <div class="row"><span>فصل</span><b>${faNum(lg.season || 1)}</b></div>
    <div class="row"><span>تیم‌ها</span><b>${faNum(lg.teams)}${lg.aiCount ? ` <span class="muted">(${faNum(lg.aiCount)} تیم AI)</span>` : ''}</b></div>
    <div class="row"><span>پیشرفت</span><b>${lg.nextRound === null ? 'تمام شد 🏁' : `هفته ${faNum(lg.nextRound+1)} از ${faNum(lg.totalRounds)}`}</b></div>
    <div class="muted" style="font-size:0.74rem; margin-top:6px; line-height:1.8;">${windowLine}</div>
    ${myMember ? `<div class="row"><span>ترکیب این هفته‌ی من</span><b>${myMember.submitted ? '✅ ثبت شده' : '❌ ثبت نشده'}</b></div>` : ''}
    ${lg.nextRound === null ? '' : `
      <div style="display:flex; gap:8px; margin-top:8px;">
        ${myMember && win.open ? `<button class="btn ghost small" style="flex:1;" ${O.busy?'disabled':''} onclick="onlineSubmitWeek()">ثبت ترکیب هفته 📝</button>` : ''}
        <button class="btn primary small" style="flex:1;" ${O.busy?'disabled':''} onclick="onlineSimulateRound()">${O.busy ? 'در حال بازی…' : `بازی هفته ${faNum(lg.nextRound+1)} ⚽`}</button>
      </div>`}
    ${lg.nextRound === null && isOwner ? `<button class="btn primary" style="width:100%; margin-top:8px;" onclick="onlineNewSeason()">شروع فصل ${faNum((lg.season||1)+1)} 🏁</button>` : ''}
    ${!lg.started && isOwner && lg.teams < 12 ? `<button class="btn ghost small" style="width:100%; margin-top:8px;" onclick="onlineFillAi(8)">پر کردن لیگ با تیم‌های AI 🤖</button>` : ''}
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn ghost small" style="flex:1;" onclick="onlineShareLeague('${lg.id}', ${JSON.stringify(lg.name)})">ارسال شناسه به رفقا</button>
      ${isOwner && lg.nextRound !== null ? `<button class="btn ghost small" style="flex:1;" onclick="onlineForceAdvance()">بستن پنجره و بازی فوری</button>` : ''}
      <button class="btn ghost small" style="flex:1;" onclick="onlineOpenLeague('${lg.id}')">تازه‌سازی</button>
    </div>
    <p class="muted" style="font-size:0.66rem; margin-top:8px;">${win.friday ? 'بازی‌ها جمعه‌ها خودکار انجام می‌شود (پنجره تا پنجشنبه).' : 'بدون دکمه هم: به‌محض پایان پنجره، اولین بازدید هفته را بازی می‌کند.'}</p>
  </div>
  <div class="card glass"><h2><span class="dot"></span>جدول لیگ</h2>${onlineTableHtml(lg)}</div>
  ${onlineSideStatsHtml(lg)}
  ${onlineHistoryHtml(lg)}
  <div class="card glass"><h2><span class="dot"></span>برنامه و نتایج</h2>
    ${(lg.fixtures||[]).map((pairs, r)=>{
      const results = lg.results || {};
      const done = pairs.every((pair)=> results[r + ':' + pair[0] + ':' + pair[1]]);
      return `<div class="al-round ${done?'done':''} ${r === lg.nextRound ? 'next':''}">
        <div class="al-round-h"><span>دور ${faNum(r+1)}</span><span class="muted" style="font-size:0.7rem;">${done?'✅ بازی‌شده':(r===lg.nextRound?'نوبت بعدی':'در انتظار')}</span></div>
        ${pairs.map((pair)=>{
          const key = r + ':' + pair[0] + ':' + pair[1];
          const res = results[key];
          const hName = lg.names[pair[0]], aName = lg.names[pair[1]];
          const mine = hName === p.clubName || aName === p.clubName;
          return `<div class="al-match ${mine?'mine':''}" ${res?`onclick="onlineVerifyResult(${JSON.stringify(res).replace(/"/g,'&quot;')})"`:''}>
            <span>${escapeHtml(hName)} <span class="muted">-</span> ${escapeHtml(aName)}</span>
            <b>${res ? `${faNum(res.h)} - ${faNum(res.a)}` : '<span class="muted">—</span>'}</b></div>`;
        }).join('')}
      </div>`;
    }).join('')}
    <p class="muted" style="font-size:0.68rem; margin-top:8px;">روی هر نتیجه بزن تا سرور همان نتیجه را بازتولید کند (تأیید ضدتقلب).</p>
  </div>`;

  return `
  <div class="card glass">
    <h2><span class="dot"></span>حساب آنلاین — ${escapeHtml(p.clubName)}</h2>
    <div class="row"><span>شماره</span><b dir="ltr">${escapeHtml(p.phone)}</b></div>
    <div class="row"><span>ترکیب روی سرور</span><b>${p.hasSquad ? '✅ ثبت‌شده' : '❌ ثبت نشده'}</b></div>
    <div class="row"><span>${engineLine}</span><b>${O.busy?'⏳':''}</b></div>
    <button class="btn ${p.hasSquad?'ghost':'primary'}" style="width:100%; margin-top:8px;" onclick="onlineUploadSquad()">آپلود ترکیب فعلی روی سرور ⬆️</button>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn ghost small" style="flex:1;" onclick="onlineRefresh().then(render)">تازه‌سازی</button>
      <button class="btn ghost small" style="flex:1;" onclick="onlineLogout()">خروج از حساب</button>
    </div>
  </div>

  <div class="card glass">
    <h2><span class="dot"></span>لیگ‌های من</h2>
    ${leaguesHtml}
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:12px;">ساخت لیگ جدید</label>
    <div style="display:flex; gap:8px; margin-top:4px;">
      <input id="onNewLeague" placeholder="اسم لیگ (مثلاً: لیگ رفقا)" maxlength="26" style="flex:2;">
      <button class="btn primary small" style="flex:1;" onclick="onlineCreateLeague((document.getElementById('onNewLeague')||{}).value, { fillAI: (document.getElementById('onFillAI')||{}).checked !== false })">بساز</button>
    </div>
    <label class="muted" style="font-size:0.72rem; display:flex; align-items:center; gap:6px; margin-top:6px;">
      <input type="checkbox" id="onFillAI" checked style="width:auto;"> با تیم‌های AI پر شود (تا تنها هم بازی کنی)
    </label>
    <p class="muted" style="font-size:0.66rem; margin-top:6px;">پیش‌فرض: ۸ تیمی. برای دموی سریع می‌توانی پنجره را کوتاه کنی — ولی از خود API.</p>
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:12px;">ورود به لیگ رفیق (با شناسه)</label>
    <div style="display:flex; gap:8px; margin-top:4px;">
      <input id="onJoinLeague" placeholder="شناسه‌ی لیگ (مثل L3f8a1c)" style="flex:2; direction:ltr;">
      <button class="btn ghost small" style="flex:1;" onclick="onlineJoinLeague((document.getElementById('onJoinLeague')||{}).value)">وارد شو</button>
    </div>
  </div>
  ${leaguePanel}`;
}

/* ---------- صفحه‌ی ورود ---------- */
function onlineLoginHtml(){
  const O = onlineState();
  const addr = onlineBase();
  return `
  <div class="card glass">
    <h2><span class="dot"></span>ورود به بازی آنلاین${infoBtn('online')}</h2>
    <p class="muted" style="font-size:0.76rem; line-height:1.9;">
      با شماره‌ی موبایل وارد شو (بدون رمز). نتایج لیگ آنلاین را <b>سرور</b> با همان موتور بازی محاسبه می‌کند؛
      پس کسی نمی‌تواند نتیجه را دست‌کاری کند. بازی آفلاین‌ات هم دست‌نخورده می‌ماند.
    </p>
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:10px;">شماره‌ی موبایل</label>
    <input id="onPhone" inputmode="tel" dir="ltr" placeholder="09123456789" style="margin-top:4px;">
    <button class="btn ghost" style="width:100%; margin-top:8px;" ${O.busy?'disabled':''} onclick="onlineRequestOtp((document.getElementById('onPhone')||{}).value)">${O.busy?'⏳':'دریافت کد ورود'}</button>
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:12px;">کد ۵ رقمی</label>
    <input id="onCode" inputmode="numeric" dir="ltr" placeholder="12345" maxlength="5" style="margin-top:4px;">
    <button class="btn primary" style="width:100%; margin-top:8px;" onclick="onlineVerifyOtp((document.getElementById('onCode')||{}).value)">ورود ✅</button>
    <p class="muted" style="font-size:0.68rem; margin-top:10px;">
      اگر سرور در حالت دمو باشد، کد خودکار پر می‌شود. وضعیت سرور: <a href="${addr}/server" target="_blank" rel="noopener">${addr||''}/server</a>
    </p>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>آدرس سرور</h2>
    <p class="muted" style="font-size:0.72rem; line-height:1.8;">اگر بازی را از خود سرور باز کرده‌ای، این کادر را خالی بگذار. وگرنه آدرس سرور را وارد کن (مثل <code dir="ltr">https://my-server.liara.run</code>).</p>
    <input id="onBase" dir="ltr" placeholder="(خالی = همین آدرس)" value="${escapeHtml(addr)}" style="margin-top:6px;">
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn ghost small" style="flex:1;" onclick="saveOnlineBase()">ذخیره‌ی آدرس</button>
      <button class="btn ghost small" style="flex:1;" onclick="onlineCheckServer()">تست اتصال</button>
    </div>
    <div class="muted" style="font-size:0.7rem; margin-top:8px;">${O.error ? escapeHtml(O.error) : ''}</div>
  </div>`;
}
function saveOnlineBase(){
  const v = ((document.getElementById('onBase')||{}).value || '').trim().replace(/\/+$/,'');
  state.prefs = state.prefs || {};
  state.prefs.onlineBase = v;
  showToast(v ? 'آدرس سرور ذخیره شد.' : 'آدرس سرور پاک شد (همین آدرس استفاده می‌شود).');
  render();
}
async function onlineCheckServer(){
  const O = onlineState();
  showToast('در حال بررسی سرور…');
  const ok = await onlinePing();
  if(ok) showToast(`سرور پاسخ داد ✅ موتور نسخه ${O.engine}` + (O.dev ? ' (حالت دمو)' : ''));
  else showToast('سرور پاسخ نداد ❌', 'error');
  render();
}

/* ---------- کارت داشبورد ---------- */
function onlineCardHtml(){
  const O = onlineState();
  const logged = onlineLoggedIn() && O.player;
  const lg = logged && O.leagues.length ? O.leagues[0] : null;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>لیگ آنلاین${infoBtn('online')}</h2>
    ${logged ? `
      <p class="muted" style="font-size:0.76rem; line-height:1.8;">وارد شده‌ای: <b>${escapeHtml(O.player.clubName)}</b>${lg ? ` · لیگ «${escapeHtml(lg.name)}»` : ''}</p>
      <div style="display:flex; gap:8px;">
        <button class="btn ghost small" style="flex:1;" onclick="uiMain='online'; uiSub=null; render();">صفحه‌ی آنلاین 🌐</button>
        ${lg ? `<button class="btn primary small" style="flex:1;" onclick="uiMain='online'; uiSub=null; onlineOpenLeague('${lg.id}')">لیگ من</button>` : ''}
      </div>`
    : `
      <p class="muted" style="font-size:0.76rem; line-height:1.8;">با شماره‌ات وارد شو و با رفقا لیگ بزن؛ نتیجه را سرور تأیید می‌کند ⇒ بدون تقلب.</p>
      <button class="btn primary" style="width:100%; margin-top:6px;" onclick="uiMain='online'; uiSub=null; render();">ورود / ثبت‌نام با موبایل 📱</button>`}
  </div>`;
}
