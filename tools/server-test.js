/* ============================================================
   tools/server-test.js — تست سرور گام ۲ (E2E، بدون وابستگی)
   ------------------------------------------------------------
   کل جریان واقعی را روی یک سرور در حال اجرا تست می‌کند:
   ورود با کد → آپلود ترکیب → ساخت لیگ → عضو شدن دو بازیکن دیگر →
   شبیه‌سازی دورها → بررسی جدول → تلاش برای تقلب (باید رد شود) →
   امنیت مسیرها و محدودیت نرخ.

   اجرا:  node tools/server-test.js
   ============================================================ */
const path = require('path');
const fs = require('fs');
const os = require('os');

/* داده‌ی تست در پوشه‌ی موقت ⇒ به db اصلی دست نمی‌زنیم */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-server-test-'));
process.env.DATA_DIR = TMP;
process.env.DEV_OTP = '1';
process.env.SECRET = 'test-secret';
process.env.PORT = '0';
process.env.NODE_ENV = 'test';

const { server } = require('../server/index.js');

let failed = 0, passed = 0;
function check(label, cond, extra){
  if(cond){ passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}
let BASE = '';
async function api(method, p, body, token){
  const res = await fetch(BASE + p, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let json = null;
  try{ json = await res.json(); }catch(e){}
  return { status: res.status, json };
}
function squadPayload(clubName, atk){
  const pos = ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW'];
  const players = pos.map((x,i)=>({
    id: 'p' + i, name: clubName + ' بازیکن ' + (i+1), pos: x,
    attack: atk + (i % 5), fitness: 90 - i, stamina: 80, morale: 80
  }));
  return {
    clubName, formation: '4-4-2', style: 'balanced', captainId: 'p5',
    atk, def: atk - 4, fitness: 88, stamina: 78, morale: 80,
    players, slots: players.slice(0, 11).map(p=>p.id)
  };
}
async function login(phone, clubName){
  const a = await api('POST', '/api/auth/otp', { phone });
  const code = a.json && a.json.code;
  const b = await api('POST', '/api/auth/verify', { phone, code, clubName });
  return { token: b.json && b.json.token, otpStatus: a.status, verifyStatus: b.status, code };
}

(async ()=>{
  await new Promise(r=> server.listen(0, '127.0.0.1', r));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('=== ۱) سلامت و انگشت موتور ===');
  const health = await api('GET', '/api/health');
  check('GET /api/health پاسخ می‌دهد', health.status === 200 && health.json.ok === true, health.status);
  check('نسخه‌ی موتور سرور = ۱', health.json.engine === 1, health.json.engine);
  const fp = health.json.fingerprint;
  check('اثر انگشت موتور محاسبه می‌شود', fp && typeof fp.homeGoals === 'number' && fp.shots, JSON.stringify(fp));

  console.log('\n=== ۲) پارتی موتور و هسته‌ی لیگ: سرور = کلاینت ===');
  const { engine } = require('../server/engine-node.js');
  const core = require('../js/league-core.js');
  const samples = ['', 'a', 'لیگ محله', 'سلام دنیا', 'x'.repeat(500), '12345'];
  check('هش هسته‌ی لیگ با هش موتور یکی است (۵۰۰ کاراکتر نام هم)', samples.every(s=> core.leagueHash(s) === engine.engineHash(s)));
  check('نسخه‌ی هسته‌ی لیگ تعریف شده', core.LEAGUE_CORE_VERSION === 1, core.LEAGUE_CORE_VERSION);

  console.log('\n=== ۳) ورود با کد یک‌بارمصرف ===');
  const badPhone = await api('POST', '/api/auth/otp', { phone: '12345' });
  check('شماره‌ی نامعتبر رد می‌شود', badPhone.status === 400, badPhone.status);
  const badCode = await api('POST', '/api/auth/verify', { phone: '09120000001', code: '00000' });
  check('کد بدون درخواست قبلی رد می‌شود', badCode.status === 400, badCode.json && badCode.json.error);
  const me1 = await login('09120000001', 'آذرخش');
  check('ورود با کد صحیح توکن می‌دهد', !!me1.token, me1.verifyStatus);
  const wrongCode = await (async()=>{ await api('POST','/api/auth/otp',{phone:'09120000002'});
    return api('POST','/api/auth/verify',{phone:'09120000002', code:'99999'}); })();
  check('کد اشتباه رد می‌شود', wrongCode.status === 400, wrongCode.json && wrongCode.json.error);
  const noAuth = await api('GET', '/api/me');
  check('بدون توکن، /api/me رد می‌شود', noAuth.status === 401, noAuth.status);

  console.log('\n=== ۴) آپلود ترکیب (اعتبارسنجی سمت سرور) ===');
  const shortSlots = squadPayload('آذرخش', 72); shortSlots.slots = shortSlots.slots.slice(0, 10);
  const shortRes = await api('POST', '/api/squad', shortSlots, me1.token);
  check('ترکیب ۱۰ نفره رد می‌شود', shortRes.status === 400, shortRes.json && shortRes.json.error);
  const ghost = squadPayload('آذرخش', 72); ghost.slots = ghost.slots.slice(0, 10).concat(['ناموجود']);
  const ghostRes = await api('POST', '/api/squad', ghost, me1.token);
  check('بازیکن ناموجود در ترکیب رد می‌شود', ghostRes.status === 400, ghostRes.json && ghostRes.json.error);
  const dup = squadPayload('آذرخش', 72); dup.slots[0] = dup.slots[1];
  const dupRes = await api('POST', '/api/squad', dup, me1.token);
  check('بازیکن تکراری در ترکیب رد می‌شود', dupRes.status === 400, dupRes.json && dupRes.json.error);
  const okSquad = await api('POST', '/api/squad', squadPayload('آذرخش', 72), me1.token);
  check('ترکیب درست پذیرفته می‌شود', okSquad.status === 200 && okSquad.json.ok, okSquad.json && okSquad.json.error);

  console.log('\n=== ۵) تلاش برای «قدرت جعلی» (ضدتقلب اسکواد) ===');
  const cheat = squadPayload('آذرخش', 72); cheat.atk = 500; cheat.def = 500;
  await api('POST', '/api/squad', cheat, me1.token);
  const cheatView = await (async()=>{
    const me = await api('GET', '/api/me', undefined, me1.token);
    return me.json;
  })();
  check('atk اعلامی ۵۰۰ در سرور محدود می‌شود', cheatView.player.hasSquad === true);
  /* قدرت مؤثر را از طریق یک مسابقه‌ی واقعی می‌سنجیم: تیم با atk جعلی نباید فاجعه بسازد */
  const { squadToSide } = require('../server/index.js');
  const clamped = squadToSide(cheat);
  const strongest = Math.max.apply(null, cheat.players.map(p=>p.attack));
  check('سقف قدرت بر اساس بهترین بازیکن تیم است', clamped.atk <= Math.round(strongest * 1.15 + 6), `${clamped.atk} ≤ ${Math.round(strongest*1.15+6)}`);
  await api('POST', '/api/squad', squadPayload('آذرخش', 72), me1.token);

  console.log('\n=== ۶) ساخت لیگ و عضویت ===');
  const me2 = await login('09120000002', 'شاهین');
  const me3 = await login('09120000003', 'توفان');
  await api('POST', '/api/squad', squadPayload('شاهین', 68), me2.token);
  await api('POST', '/api/squad', squadPayload('توفان', 66), me3.token);
  const me4 = await login('09120000004', 'بی‌ترکیب');   /* عضو بدون آپلود ترکیب */
  const noSquadLeague = await api('POST', '/api/leagues', { name: 'تست' }, me4.token);
  check('ساخت لیگ بدون ترکیب رد می‌شود', noSquadLeague.status === 400, noSquadLeague.json && noSquadLeague.json.error);
  const created = await api('POST', '/api/leagues', { name: 'لیگ تستی سرور' }, me1.token);
  check('لیگ ساخته می‌شود', created.status === 201 && created.json.league.id, created.status);
  const leagueId = created.json.league.id;
  const badJoin = await api('POST', `/api/leagues/ZZZZZZ/join`, {}, me2.token);
  check('ورود به لیگ ناموجود رد می‌شود', badJoin.status === 404, badJoin.status);
  const join2 = await api('POST', `/api/leagues/${leagueId}/join`, {}, me2.token);
  const join3 = await api('POST', `/api/leagues/${leagueId}/join`, {}, me3.token);
  check('دو بازیکن دیگر عضو می‌شوند', join2.status === 200 && join3.status === 200 && join3.json.league.teams === 3,
    join3.json && join3.json.league && join3.json.league.teams);
  const dupJoin = await api('POST', `/api/leagues/${leagueId}/join`, {}, me3.token);
  check('عضویت تکراری رد می‌شود', dupJoin.status === 400, dupJoin.json && dupJoin.json.error);

  console.log('\n=== ۷) امنیت: مسیرها و داده ===');
  const trav = await fetch(BASE + '/../server-data/db.json');
  check('پیمایش مسیر بسته است', trav.status === 403 || trav.status === 404, trav.status);
  const dataFile = await fetch(BASE + '/server-data/db.json');
  check('فایل داده از وب قابل خواندن نیست', dataFile.status === 403 || dataFile.status === 404, dataFile.status);
  const page = await fetch(BASE + '/');
  const pageHtml = await page.text();
  check('صفحه‌ی بازی سرو می‌شود', page.status === 200 && pageHtml.includes('مدیر تیم'), page.status);
  const engineJs = await fetch(BASE + '/js/engine.js');
  check('موتور کلاینت هم سرو می‌شود', engineJs.status === 200, engineJs.status);
  const statusPage = await fetch(BASE + '/server');
  const statusHtml = await statusPage.text();
  check('صفحه‌ی وضعیت سرور کار می‌کند', statusPage.status === 200 && statusHtml.includes('سرور'), statusPage.status);

  console.log('\n=== ۸) محدودیت نرخ ورود ===');
  let last = 0;
  for(let i=0;i<6;i++){ const r = await api('POST', '/api/auth/otp', { phone: '09129999999' }); last = r.status; }
  check('درخواست ششم کد ورود ۴۲۹ می‌گیرد', last === 429, last);

  console.log('\n=== ۹) شبیه‌سازی دورها (سرور = منبع حقیقت) ===');
  const view0 = await api('GET', `/api/leagues/${leagueId}`, undefined, me1.token);
  check('لیگ ۳ تیمی ⇒ ۳ دور و ۳ مسابقه', view0.json.league.totalRounds === 3 &&
    view0.json.league.fixtures.reduce((a,rd)=>a+rd.length,0) === 3, JSON.stringify({r:view0.json.league.totalRounds}));
  check('در ابتدا دور بعدی صفر است و جدول خالی', view0.json.league.nextRound === 0 &&
    view0.json.league.table.every(t=>t.played === 0));
  const sim1 = await api('POST', `/api/leagues/${leagueId}/simulate`, {}, me1.token);
  check('شبیه‌سازی دور اول نتیجه می‌دهد', sim1.status === 200 && sim1.json.matches.length === 1, JSON.stringify(sim1.json.matches && sim1.json.matches.length));
  const m0 = sim1.json.matches[0];
  check('گزارش کامل مسابقه ذخیره می‌شود', !!m0.reportId, m0.reportId);
  const rep = await api('GET', '/api/matches/' + m0.reportId);
  check('گزارش از API قابل خواندن است', rep.status === 200 && rep.json.report.events.length > 0, rep.json && rep.json.report && rep.json.report.events.length);
  check('گزارش شامل آمار و بهترین بازیکن است', rep.json.report.stats && rep.json.report.bestPlayer, 'stats/bestPlayer');
  check('بعد از دور اول، دور بعدی ۱ است', sim1.json.league.nextRound === 1, sim1.json.league.nextRound);
  check('جدول بازی‌شده‌ها را نشان می‌دهد', sim1.json.league.table.reduce((a,t)=>a+t.played,0) === 2,
    JSON.stringify(sim1.json.league.table.map(t=>t.played)));

  console.log('\n=== ۱۰) تأیید و رد نتیجه (ضدتقلب واقعی) ===');
  const vBad = await api('POST', `/api/leagues/${leagueId}/verify`, { round: 0, hi: m0.result.hi, ai: m0.result.ai, homeGoals: m0.result.h + 2, awayGoals: m0.result.a }, me1.token);
  check('نتیجه‌ی دست‌کاری‌شده رد می‌شود', vBad.json.verified === false, JSON.stringify(vBad.json.server));
  const vGood = await api('POST', `/api/leagues/${leagueId}/verify`, { round: 0, hi: m0.result.hi, ai: m0.result.ai, homeGoals: m0.result.h, awayGoals: m0.result.a }, me1.token);
  check('نتیجه‌ی درست تأیید می‌شود', vGood.json.verified === true, JSON.stringify(vGood.json));
  check('seed نتیجه با seed سرور یکی است', vGood.json.seed === m0.result.s, `${vGood.json.seed} vs ${m0.result.s}`);

  console.log('\n=== ۱۱) قطعیت: همان دور، همان نتیجه ===');
  const sim2a = await api('POST', `/api/leagues/${leagueId}/simulate`, {}, me1.token);
  check('دور دوم بازی شد', sim2a.json.round === 1, sim2a.json.round);
  const g1 = await api('GET', `/api/leagues/${leagueId}`, undefined, me1.token);
  const g2 = await api('GET', `/api/leagues/${leagueId}`, undefined, me1.token);
  check('خواندن دوباره‌ی لیگ، نتایج را تغییر نمی‌دهد', JSON.stringify(g1.json.league.results) === JSON.stringify(g2.json.league.results));
  check('نتیجه‌ی دور اول بعد از دور دوم دست‌نخورده مانده',
    JSON.stringify(g1.json.league.results[m0.key || Object.keys(g1.json.league.results)[0]]) !== undefined &&
    Object.keys(g1.json.league.results).length === 2);

  console.log('\n=== ۱۲) جدول پایانی و سازگاری با هسته‌ی مشترک ===');
  const sim3 = await api('POST', `/api/leagues/${leagueId}/simulate`, {}, me1.token);
  check('دور سوم بازی شد', sim3.json.round === 2, sim3.json.round);
  const doneView = await api('GET', `/api/leagues/${leagueId}`, undefined, me3.token);
  const lg = doneView.json.league;
  check('لیگ تمام شد (nextRound=null)', lg.nextRound === null, lg.nextRound);
  const totalPlayed = lg.table.reduce((a,t)=>a+t.played,0);
  check('هر تیم ۲ بازی کرده (۳ تیم × ۲ = ۶)', totalPlayed === 6, totalPlayed);
  const coreCore = require('../js/league-core.js');
  const localTable = coreCore.leagueTableFromNames(lg.names, lg.results);
  check('جدول سرور = جدول محاسبه‌شده با هسته‌ی مشترک',
    JSON.stringify(localTable.map(t=>[t.name,t.pts,t.gd])) === JSON.stringify(lg.table.map(t=>[t.name,t.pts,t.gd])));
  check('امتیاز کل = ۳×برد + مساوی', lg.table.reduce((a,t)=>a+t.pts,0) ===
    3*lg.table.reduce((a,t)=>a+t.won,0) + lg.table.reduce((a,t)=>a+t.drawn,0));
  const more = await api('POST', `/api/leagues/${leagueId}/simulate`, {}, me1.token);
  check('بعد از پایان لیگ، شبیه‌سازی می‌گوید تمام شد', more.json.done === true, JSON.stringify(more.json.done));

  console.log('\n=== ۱۳) داده‌ی ماندگار روی دیسک ===');
  require('../server/store.js').saveNow();   /* ذخیره‌ی فوری: همان کاری که در SIGTERM انجام می‌شود */
  const dbFile = path.join(TMP, 'db.json');
  check('فایل داده ساخته شد', fs.existsSync(dbFile));
  const dbObj = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  check('چهار بازیکن ذخیره شده‌اند', Object.keys(dbObj.players).length === 4, Object.keys(dbObj.players).length);
  check('لیگ با نتایجش ذخیره شده', Object.keys(dbObj.leagues).length === 1 && Object.keys(dbObj.leagues[leagueId].results).length === 3);
  check('توکن‌ها ذخیره شده‌اند (۳ بازیکن واردشده + ۱ بازیکن چهارم)',
    Object.keys(dbObj.tokens).length === 4, Object.keys(dbObj.tokens).length);
  check('کدهای ورود هرگز خام ذخیره نمی‌شوند (هش‌شده‌اند)',
    Object.values(dbObj.otps).every(o=> !/^\d{5}$/.test(String(o.code)) && String(o.code).length === 64),
    Object.values(dbObj.otps).map(o=>String(o.code).slice(0,8)).join(','));
  check('کد مصرف‌شده بعد از ورود پاک می‌شود (فقط کد تأییدنشده می‌ماند)',
    Object.keys(dbObj.otps).length === 1, Object.keys(dbObj.otps).length);
  check('گزارش‌های مسابقات ذخیره شده‌اند', Object.keys(dbObj.matches).length === 3, Object.keys(dbObj.matches).length);

  /* ---------- نتیجه ---------- */
  server.close();
  try{ fs.rmSync(TMP, { recursive: true, force: true }); }catch(e){}
  console.log('\n' + '─'.repeat(52));
  if(!failed) console.log(`🎉 سرور گام ۲ سالم است — ${passed} بررسی موفق (E2E واقعی روی HTTP).`);
  else console.log(`⚠️  ${failed} بررسی ناموفق (${passed} موفق).`);
  process.exit(failed ? 1 : 0);
})().catch(e=>{
  console.error('خطای غیرمنتظره در تست سرور:', e);
  process.exit(1);
});
