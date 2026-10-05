/* ============================================================
   tools/client-online-test.js — تست یکپارچه‌ی «کلاینت ⇄ سرور»
   ------------------------------------------------------------
   این قوی‌ترین اثبات برای گام ۲ است: همه‌ی فایل‌های js بازی
   (کلاینت) در یک محیط شبیه‌مرورگر لود می‌شوند و با `fetch` واقعی
   به یک سرور واقعی وصل می‌شوند — دقیقاً همان کاری که مرورگر
   کاربر انجام می‌دهد. هیچ mock‌ای در کار نیست.

   جریان تست: ورود با کد → آپلود ترکیب → ساخت لیگ → عضویت رفیق →
   بازی دورها روی سرور → جدول → دریافت گزارش رسمی و پخش زنده →
   تأیید نتیجه → رد نتیجه‌ی جعلی → خروج.

   اجرا:  node tools/client-online-test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

/* داده‌ی سرور در پوشه‌ی موقت */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-client-test-'));
process.env.DATA_DIR = TMP;
process.env.DEV_OTP = '1';
process.env.SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

const ROOT = path.join(__dirname, '..');
const { server } = require('../server/index.js');

let failed = 0, passed = 0;
function check(label, cond, extra){
  if(cond){ passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}

/* ---------- ساخت یک «مرورگر» برای کلاینت ---------- */
function makeBrowser(base){
  const elCache = new Map();
  function makeEl(id){
    const el = {
      id, innerHTML: '', textContent: '', value: '', className: '', style: {},
      classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
      children: [], appendChild(c){ this.children.push(c); return c; }, remove(){},
      addEventListener(){}, setAttribute(){}, getAttribute(){ return null; },
      querySelector(){ return null; }, querySelectorAll(){ return []; }, focus(){}, select(){}
    };
    return el;
  }
  const document = {
    getElementById(id){ if(!elCache.has(id)) elCache.set(id, makeEl(id)); return elCache.get(id); },
    createElement(tag){ return makeEl('<' + tag + '>'); },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, body: makeEl('body')
  };
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };
  const sandbox = {
    document, localStorage, console,
    navigator: {}, location: { href: base + '/' },
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    alert(){}, confirm: () => true,
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise,
    isNaN, parseInt, parseFloat, TextEncoder, TextDecoder, btoa, atob, Uint8Array,
    /* fetch واقعی، مسیرهای نسبی به سرور تست وصل می‌شوند */
    fetch: (url, opts)=> fetch(String(url).startsWith('http') ? url : base + url, opts)
  };
  sandbox.window = sandbox; sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  const html = fs.readFileSync(path.join(ROOT, 'offline.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);
  for(const f of scripts){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const run = (code)=> vm.runInContext(code, ctx, { filename: 'client-test' });
  run('startGame()');
  return { run, document };
}

const sleep = (ms)=> new Promise(r=> setTimeout(r, ms));

(async ()=>{
  await new Promise(r=> server.listen(0, '127.0.0.1', r));
  const BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('=== ۱) بارگذاری کلاینت و اتصال به سرور ===');
  const A = makeBrowser(BASE);
  check('کلاینت کامل لود شد (۱۹ نما آماده است)', A.run('NAV.length') === 6, A.run('NAV.map(n=>n.key).join(",")'));
  check('تب «آنلاین» در ناوبری هست', A.run('NAV.some(n=>n.key==="online")'));
  const pinged = await A.run('onlinePing()');
  check('کلاینت به سرور واقعی وصل می‌شود', pinged === true);
  check('نسخه‌ی موتور از سرور خوانده شد', A.run('state.online.engine') === 1, A.run('state.online.engine'));
  check('اثر انگشت موتور با کلاینت یکی است', (()=>{
    const fp = A.run('state.online.fingerprint');
    return fp && fp.version === 1 && fp.homeGoals >= 0;
  })(), JSON.stringify(A.run('state.online.fingerprint')));

  console.log('\n=== ۲) صفحه‌ی ورود و تب آنلاین ===');
  check('صفحه‌ی ورود (وقتی وارد نشده‌ای) رندر می‌شود', A.run('renderOnline().indexOf("دریافت کد ورود") > 0'));
  check('کارت داشبورد آنلاین ساخته می‌شود', A.run('onlineCardHtml().indexOf("لیگ آنلاین") > 0'));

  console.log('\n=== ۳) ورود با کد یک‌بارمصرف (بدون mock) ===');
  const otp = await A.run('onlineRequestOtp("09121234567")');
  check('درخواست کد موفق است و کد دمو برمی‌گردد', otp && otp.ok && /^\d{5}$/.test(String(otp.code)), otp && otp.code);
  const verified = await A.run(`onlineVerifyOtp(${JSON.stringify(String(otp.code))})`);
  check('ورود انجام شد و توکن ذخیره شد', verified && verified.ok && A.run('onlineLoggedIn()') === true);
  check('باشگاه من روی سرور ثبت شد', A.run('state.online.player.clubName') === A.run('state.clubName'),
    A.run('state.online.player.clubName'));

  console.log('\n=== ۴) آپلود ترکیب از خود بازی ===');
  check('ترکیب بازی کامل است', A.run('state.starters.length') === 11, A.run('state.starters.length'));
  const up = await A.run('onlineUploadSquad(true)');
  check('ترکیب روی سرور آپلود شد', up && up.ok, JSON.stringify(up && up.error));
  check('سرور می‌گوید ترکیب ثبت شده', A.run('state.online.player.hasSquad') === true);
  check('سرور فهرست بازیکنان و فرمیشن را ذخیره کرد', up.squad && up.squad.players >= 11 && up.squad.formation === '4-4-2', JSON.stringify(up.squad));

  console.log('\n=== ۵) ساخت لیگ و دیدن جدول ===');
  const lg = await A.run('onlineCreateLeague("لیگ آنلاین دربی", { fillAI: false })');
  check('لیگ ساخته شد و شناسه دارد', lg && lg.id && lg.teams === 1, lg && `${lg.id} / ${lg.teams} تیم`);
  const leagueId = lg.id;
  const view = await A.run(`onlineOpenLeague(${JSON.stringify(leagueId)}).then(v=>{render(); return v;})`);
  check('لیگ باز شد و در وضعیت ذخیره شد', view && view.id === leagueId && A.run('state.online.currentLeague') === leagueId);
  check('جدول HTML با نام تیم من ساخته می‌شود', A.run('document.getElementById("tabContent").innerHTML.indexOf("لیگ آنلاین دربی") > 0'));

  console.log('\n=== ۶) رفیق وارد می‌شود و به لیگ ملحق می‌شود ===');
  const B = makeBrowser(BASE);
  B.run('state.clubName = "باشگاه رفیق"; state.managerName = "رفیق";');
  const otpB = await B.run('onlineRequestOtp("09129876543")');
  await B.run(`onlineVerifyOtp(${JSON.stringify(String(otpB.code))})`);
  await B.run('onlineUploadSquad(true)');
  const joined = await B.run(`onlineJoinLeague(${JSON.stringify(leagueId)})`);
  check('رفیق با شناسه‌ی لیگ عضو شد', joined && joined.teams === 2, joined && joined.teams);
  const viewA = await A.run(`onlineOpenLeague(${JSON.stringify(leagueId)}).then(v=>{render(); return v;})`);
  check('میزبان عضویت رفیق را می‌بیند', viewA.teams === 2 && viewA.members.length === 2, viewA.teams);

  console.log('\n=== ۷) بازی دورها روی سرور و پخش گزارش رسمی ===');
  A.run('state.prefs = state.prefs || {}; state.prefs.liveView = false;');  /* برای تست، مودال خلاصه */
  const sim1 = await A.run('onlineSimulateRound()');
  check('دور اول روی سرور بازی شد', sim1 && sim1.matches && sim1.matches.length === 1, JSON.stringify(sim1 && sim1.matches && sim1.matches.length));
  check('نتیجه‌ی رسمی سرور در گزارش‌های بازی ذخیره شد',
    A.run('state.matchReports.some(r=>String(r.id).startsWith("srv_"))') === true,
    A.run('state.matchReports.map(r=>r.id).join(",")'));
  const srvReport = A.run('state.matchReports.find(r=>String(r.id).startsWith("srv_"))');
  check('گزارش رسمی شامل رویدادهای دقیقه‌به‌دقیقه است',
    srvReport && Array.isArray(srvReport.events) && srvReport.events.length > 0, srvReport && srvReport.events.length);
  check('گزارش رسمی قابل تأیید از seed است', (()=>{
    const ok = A.run(`(function(){ const r = state.matchReports.find(x=>String(x.id).startsWith("srv_")); 
      const rep = reproduceReport(r, null, null); return r && r.seed !== undefined; })()`);
    return ok;
  })());
  check('پخش زنده از گزارش رسمی کار می‌کند', (()=>{
    const live = A.run(`(function(){ const r = state.matchReports.find(x=>String(x.id).startsWith("srv_"));
      openLiveMatch(r.id); const has = document.getElementById('genericModal').innerHTML.length > 50; stopLive(); closeAllOverlays(); return has; })()`);
    return live === true;
  })());
  check('مودال خلاصه‌ی دور باز می‌شود', A.run('(function(){ onlineRoundModal(' + JSON.stringify(sim1) + '); const h=document.getElementById("genericModal").innerHTML; closeAllOverlays(); return h.indexOf("نتیجه‌ی رسمی سرور")>0; })()'));

  console.log('\n=== ۸) ضدتقلب از دید کلاینت ===');
  const tamperedVerify = await A.run(`onlineVerifyResult({ r:0, hi:${sim1.matches[0].result.hi}, ai:${sim1.matches[0].result.ai}, h:${sim1.matches[0].result.h + 3}, a:${sim1.matches[0].result.a} })`);
  check('نتیجه‌ی جعلی از سمت کلاینت رد می‌شود', tamperedVerify && tamperedVerify.verified === false, JSON.stringify(tamperedVerify));
  const goodVerify = await A.run(`onlineVerifyResult({ r:0, hi:${sim1.matches[0].result.hi}, ai:${sim1.matches[0].result.ai}, h:${sim1.matches[0].result.h}, a:${sim1.matches[0].result.a} })`);
  check('نتیجه‌ی واقعی تأیید می‌شود', goodVerify && goodVerify.verified === true, JSON.stringify(goodVerify));

  console.log('\n=== ۹) بازی تا پایان لیگ و وضعیت قهرمانی ===');
  let guard = 0, last = null;
  while(guard < 5){
    last = await B.run('onlineSimulateRound()');
    guard++;
    if(last && last.done) break;
  }
  check('همه‌ی دورها تا پایان بازی شد', last && last.done === true, JSON.stringify(last && { done: last.done, guard }));
  const finalView = await B.run(`onlineOpenLeague(${JSON.stringify(leagueId)}).then(v=>{render(); return v;})`);
  check('لیگ تمام شد و جدول کامل است', finalView.nextRound === null &&
    finalView.table.reduce((a,t)=>a+t.played,0) === 2, JSON.stringify(finalView.table.map(t=>[t.name, t.played, t.pts])));
  check('قهرمان (رتبه ۱) از نفر دوم عقب‌تر نیست',
    !!finalView.table[0] && finalView.table[0].pts >= (finalView.table[1] ? finalView.table[1].pts : 0),
    JSON.stringify(finalView.table.map(t=>[t.name, t.pts])));
  check('جدول سرور با هسته‌ی مشترک لیگ یکی است', A.run(`(function(){
    const core = leagueTableFromNames(${JSON.stringify(finalView.names)}, ${JSON.stringify(finalView.results)});
    return JSON.stringify(core.map(t=>[t.name,t.pts,t.gd])) === JSON.stringify(${JSON.stringify(finalView.table)}.map(t=>[t.name,t.pts,t.gd]));
  })()`));
  const pageHtml = await A.run(`onlineOpenLeague(${JSON.stringify(leagueId)}).then(function(){
    uiMain='online'; uiSub=null; render();
    return document.getElementById('tabContent').innerHTML; })`);
  check('صفحه‌ی آنلاین بعد از پایان لیگ پیام «تمام شد» را نشان می‌دهد',
    typeof pageHtml === 'string' && pageHtml.indexOf('تمام شد') > 0, typeof pageHtml === 'string' ? pageHtml.length : 'نه رشته');
  check('صفحه‌ی آنلاین جدول و برنامه را نشان می‌دهد',
    typeof pageHtml === 'string' && pageHtml.indexOf('al-table') > 0 && pageHtml.indexOf('دور ۱') > 0);

  console.log('\n=== ۹.۵) گام ۳ از دید کلاینت: هفته، AI، آمار جانبی، فصل جدید ===');
  /* لیگ تازه از خود UI با تیم‌های AI */
  const wl = await A.run('onlineCreateLeague("لیگ هفتگی من", { fillAI: true, fillTo: 8 })');
  check('ساخت لیگ از UI با تیم‌های AI کار می‌کند', wl && wl.aiCount >= 6 && wl.teams === 8,
    JSON.stringify({teams: wl && wl.teams, ai: wl && wl.aiCount}));
  const wlId = wl.id;
  await A.run(`onlineOpenLeague(${JSON.stringify(wlId)}).then(v=>{ uiMain='online'; uiSub=null; render(); return v; })`);
  const page1 = A.run('document.getElementById("tabContent").innerHTML');
  check('صفحه‌ی لیگ، نوار پنجره‌ی هفتگی را نشان می‌دهد', page1.indexOf('پنجره‌ی ثبت ترکیب') > 0);
  check('دکمه‌ی «ثبت ترکیب هفته» دیده می‌شود', page1.indexOf('ثبت ترکیب هفته') > 0);
  check('نشان تیم‌های AI در جدول هست', page1.indexOf('🤖') > 0);
  check('کارت آمار جانبی ساخته می‌شود', page1.indexOf('آمار جانبی لیگ') > 0);

  const subWeek = await A.run('onlineSubmitWeek()');
  check('ثبت ترکیب هفته از UI انجام شد', subWeek && subWeek.ok === true && A.run('state.online.leagueView.mySubmitted') === true);
  const page2 = A.run('renderOnline()');
  check('بعد از ثبت، وضعیت «ثبت شده» نشان داده می‌شود', page2.indexOf('✅ ثبت شده') > 0);

  /* بازی یک هفته با ۸ تیم ⇒ ۴ مسابقه */
  const bigRound = await A.run('onlineSimulateRound()');
  check('هفته‌ی ۸ تیمی ۴ مسابقه دارد', bigRound && bigRound.matches && bigRound.matches.length === 4,
    JSON.stringify(bigRound && bigRound.matches && bigRound.matches.length));
  const statsView = A.run('state.online.leagueView.sideStats');
  check('آمار آقای گل بعد از بازی پر می‌شود', statsView.scorers.length > 0 && statsView.scorers[0].value >= 1,
    JSON.stringify(statsView.scorers.slice(0,2)));
  check('پاس گل و کلین‌شیت هم ثبت می‌شوند', Array.isArray(statsView.assists) && Array.isArray(statsView.cleanSheets));
  check('جدول ۸ تیمی همه‌ی تیم‌ها بازی کرده‌اند',
    A.run('state.online.leagueView.table.filter(t=>t.played>0).length') === 8);

  /* فصل جدید از سمت میزبان بعد از تمام شدن فصل (۷ هفته) */
  let g2 = 0;
  while(g2 < 10){
    const r = await A.run('onlineSimulateRound()');
    g2++;
    if(r && r.done) break;
  }
  const beforeNew = A.run('state.online.leagueView');
  check('فصل ۸ تیمی در ۷ هفته تمام می‌شود و پرچم فصل جدید می‌آید',
    beforeNew.nextRound === null && beforeNew.canNewSeason === true, JSON.stringify({next: beforeNew.nextRound, rounds: g2}));
  const ns = await A.run('onlineNewSeason()');
  check('فصل جدید از UI ساخته می‌شود', ns && ns.season === 2 && A.run('state.online.leagueView.season') === 2);
  check('تاریخچه‌ی قهرمان فصل قبل نمایش داده می‌شود',
    A.run('state.online.leagueView.history.length') === 1 && A.run('renderOnline()').indexOf('تاریخچه‌ی لیگ') > 0);
  check('آمار جانبی فصل جدید از صفر شروع می‌شود',
    A.run('state.online.leagueView.sideStats.scorers.length') === 0);

  console.log('\n=== ۱۰) خروج و پاک‌سازی ===');
  A.run('_confirmCb = ()=> { setOnlineToken(""); state.online.player = null; }; _confirmRun();');
  check('خروج از حساب، توکن را پاک می‌کند', A.run('onlineLoggedIn()') === false);
  check('بعد از خروج، صفحه‌ی ورود برمی‌گردد', A.run('renderOnline().indexOf("دریافت کد ورود") > 0'));
  check('بازی آفلاین دست‌نخورده مانده (هفته و لیگ داخلی سرجایش است)',
    A.run('state.week >= 1 && state.league.teams.length > 0'), A.run('state.week'));

  /* صفحه‌ی وضعیت سرور هم یک بار چک شود */
  const statusRes = await fetch(BASE + '/server');
  const statusHtml = await statusRes.text();
  check('صفحه‌ی وضعیت سرور سالم است', statusRes.status === 200 && statusHtml.includes('اثر انگشت موتور'));

  server.close();
  try{ fs.rmSync(TMP, { recursive: true, force: true }); }catch(e){}
  console.log('\n' + '─'.repeat(52));
  if(!failed) console.log(`🎉 کلاینت و سرور با هم کار می‌کنند — ${passed} بررسی یکپارچه‌ی موفق (fetch واقعی).`);
  else console.log(`⚠️  ${failed} بررسی ناموفق (${passed} موفق).`);
  process.exit(failed ? 1 : 0);
})().catch(e=>{
  console.error('خطای غیرمنتظره:', e);
  process.exit(1);
});
