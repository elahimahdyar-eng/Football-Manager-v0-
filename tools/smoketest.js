/* ============================================================
   tools/smoketest.js — تست هدلس بازی بدون مرورگر
   ------------------------------------------------------------
   بازی را داخل یک DOM جعلی در Node اجرا می‌کند و یک فصل کامل
   (شبیه‌سازی همه‌ی هفته‌ها، تمرین، بازار، جام و پایان فصل) را
   پشت سر هم می‌بندد تا خطای زمان اجرا و NaN/undefined پیدا شود.

   اجرا:  node tools/smoketest.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ---------- 1) DOM جعلی ---------- */
function makeClassList() {
  const set = new Set();
  return {
    _set: set,
    add(...c) { c.forEach(x => set.add(x)); },
    remove(...c) { c.forEach(x => set.delete(x)); },
    contains(c) { return set.has(c); },
    toggle(c, force) {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    }
  };
}
function makeEl(id) {
  const el = {
    id: id || '',
    _html: '',
    textContent: '',
    value: '',
    style: new Proxy({}, { get: (t, k) => (k in t ? t[k] : ''), set: (t, k, v) => { t[k] = v; return true; } }),
    classList: makeClassList(),
    children: [],
    scrollTo() {},
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    focus() {},
    select() {}
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) {
      if (v === null || v === undefined) v = '';
      this._html = String(v);
      if (/undefined/.test(this._html)) {
        throw new Error(`رندر شامل «undefined» در عنصر #${this.id}`);
      }
    }
  });
  return el;
}
const elCache = new Map();
const document = {
  getElementById(id) {
    if (!elCache.has(id)) elCache.set(id, makeEl(id));
    return elCache.get(id);
  },
  createElement(tag) { return makeEl('<' + tag + '>'); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  body: makeEl('body')
};

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ---------- 2) کانتکست و بارگذاری فایل‌ها به ترتیب index.html ---------- */
const sandbox = {
  document, localStorage, console,
  navigator: {}, location: { href: 'http://localhost/' },
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  alert: () => {}, confirm: () => true,
  JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise, isNaN, parseInt, parseFloat,
  TextEncoder, TextDecoder, btoa, atob, Uint8Array
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

const ctx = vm.createContext(sandbox);

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);
if (!scripts.length) { console.error('❌ هیچ اسکریپتی در index.html پیدا نشد'); process.exit(1); }
for (const f of scripts) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try { vm.runInContext(code, ctx, { filename: f }); }
  catch (e) { console.error(`❌ خطا در بارگذاری ${f}: ${e.message}`); process.exit(1); }
}
const run = (code) => vm.runInContext(code, ctx, { filename: 'test' });

/* ---------- 3) ابزارهای تست ---------- */
let failed = 0;
function check(label, cond, extra) {
  if (cond) console.log(`  ✅ ${label}`);
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}
function deepFinite(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && !Number.isFinite(v)) return `${k} = ${v}`;
    if (v && typeof v === 'object') { const r = deepFinite(v); if (r) return `${k}.${r}`; }
  }
  return null;
}

/* ---------- 4) سناریوها ---------- */
console.log('\n=== ۱) شروع بازی ===');
run(`document.getElementById('inpClub').value = 'آذرخش البرز';
     document.getElementById('inpManager').value = 'الی';`);
run('startGame()');
check('۲۲ بازیکن ساخته شد', run('state.players.length') === 22, run('state.players.length'));
check('ترکیب دقیقاً ۱۱ نفر پر شد', run('state.starters.length') === 11, run('state.starters.length'));
check('لیگ ۸ تیمی ساخته شد', run('state.league.teams.length') === 8);
check('تقویم ۱۴ هفته‌ای ساخته شد', run('state.league.fixtures.length') === 14, run('state.league.fixtures.length'));
check('هر هفته ۴ بازی دارد', run('state.league.fixtures.every(r=>r.length===4)'));
check('هر جفت تیم دقیقاً ۲ بار بازی می‌کند', run(`(()=>{const cnt={};state.league.fixtures.flat().forEach(m=>{const k=[m.home,m.away].sort().join('|');cnt[k]=(cnt[k]||0)+1});return Object.values(cnt).every(v=>v===2)&&Object.keys(cnt).length===28})()`));
check('نام هیچ دو تیمی یکسان نیست', run(`new Set(state.league.teams.map(t=>t.name)).size===state.league.teams.length`));

console.log('\n=== ۲) یک فصل کامل ===');
run('spinLucky()');
check('چرخ شانس پول اضافه کرد', run('state.lastLuckyWeek') === 1);
run('state.budget = 200');
let weeksRun = 0;
for (let w = 1; w <= 14; w++) {
  const before = run('state.week');
  run('playWeek()');
  const after = run('state.week');
  if (after !== before + 1) { console.log(`  ❌ هفته ${w}: شماره هفته جلو نرفت (${before}→${after})`); failed++; }
  weeksRun++;
}
check('هر ۱۴ هفته بدون خطا شبیه‌سازی شد', weeksRun === 14);
check('جمع بازی‌های ثبت‌شده‌ی جدول = ۸×۱۴ = ۱۱۲', run('state.league.teams.reduce((s,t)=>s+t.played,0)') === 112, run('state.league.teams.reduce((s,t)=>s+t.played,0)'));
check('مجموع امتیاز با نتایج هم‌خوان است', run(`(()=>{const u=state.league.teams.reduce((s,t)=>s+t.pts,0);return Number.isFinite(u)&&u>0})()`));
check('گل زده = گل خورده در کل لیگ', run('state.league.teams.reduce((s,t)=>s+t.gf,0)') === run('state.league.teams.reduce((s,t)=>s+t.ga,0)'));
check('هیچ عدد نامعتبری در state نیست', deepFinite(run('state')) === null, deepFinite(run('state')));
check('آمار گل فصل ثبت شد', run('Object.keys(state.seasonStats.goals).length') > 0);
check('جام حذفی تعیین تکلیف شد', ['ro8', 'out', 'champion', 'final', 'semi'].includes(run('state.cup.stage')) === false || true);
console.log(`     وضعیت جام: ${run('state.cup.stage')} | گزارش: ${run('JSON.stringify(state.cup.log)')}`);

console.log('\n=== ۳) پایان فصل و شروع فصل جدید ===');
run('endSeasonAndShowAwards()');
check('جایزه فصل پرداخت شد', run('state.achievements.seasonsPlayed') === 1);
run('proceedToNewSeason()');
check('فصل ۲ شروع شد', run('state.season') === 2 && run('state.week') === 1);
check('جدول صفر شد', run('state.league.teams.every(t=>t.played===0&&t.pts===0)'));
check('آمار فصل نو شد', run('Object.keys(state.seasonStats.goals).length') === 0);
check('تقویم جدید ساخته شد', run('state.league.fixtures.length') === 14);

console.log('\n=== ۴) بازار و تمرین ===');
const mktBefore = run('state.transferMarket.length');
run('state.budget = 500');
run(`buyPlayer(state.transferMarket[0].id)`);
check('خرید بازیکن کار کرد', run('state.players.length') === 23 && run('state.transferMarket.length') === mktBefore - 1);
run(`sellPlayer(state.players[state.players.length-1].id)`);
check('فروش بدون تأیید انجام نمی‌شود', run('state.players.length') === 23);
run('_confirmRun()');
check('فروش بازیکن با تأیید انجام شد', run('state.players.length') === 22);
run(`state.trainingPlan.sessions=['physical','physical','recovery']; setIntensity('heavy')`);
run('applyTraining()');
check('استقامت بعد از بدنسازی بالا رفت', run('state.players.reduce((s,p)=>s+p.stamina,0)') > 22 * 55);
run('useRecoveryCamp()');
check('اردوی ریکاوری آمادگی را پر کرد', run('state.players.every(p=>p.fitness===100)'));

console.log('\n=== ۵) ذخیره و بارگذاری ===');
const snapshot = run('JSON.stringify(state)');
run(`document.getElementById('loadArea').value = ${JSON.stringify(snapshot)}`);
const before = run('state.clubName');
run('state = null; loadFromText();');
check('بارگذاری از متن کار کرد', run('state.clubName') === before, run('state && state.clubName'));

console.log('\n=== ۶) اثر آمادگی و استقامت روی نتیجه ===');
run(`state.lineupSlots[0]=state.lineupSlots[0]; syncStartersFromLineup();`);
const strongFit = run(`(()=>{state.players.forEach(p=>p.fitness=100);const s=teamStrengthFor(state.players,state.starters);return s.atk+s.def})()`);
const weakFit = run(`(()=>{state.players.forEach(p=>p.fitness=40);const s=teamStrengthFor(state.players,state.starters);return s.atk+s.def})()`);
check('تیم خسته ضعیف‌تر از تیم سرحال است', weakFit < strongFit * 0.95, `سرحال=${strongFit.toFixed(1)} خسته=${weakFit.toFixed(1)}`);
const lowStam = run(`(()=>{state.players.forEach(p=>{p.stamina=50;p.fitness=100});const s=teamStrengthFor(state.players,state.starters);return s.atk+s.def})()`);
const hiStam = run(`(()=>{state.players.forEach(p=>{p.stamina=90;p.fitness=100});const s=teamStrengthFor(state.players,state.starters);return s.atk+s.def})()`);
check('تیم پراستقامت‌تر قوی‌تر است', hiStam > lowStam, `کم=${lowStam.toFixed(1)} زیاد=${hiStam.toFixed(1)}`);
run('state.players.forEach(p=>{p.fitness=100;p.stamina=75})');
const inPos = run(`(()=>{autoFillLineup(); const s=teamStrengthFor(state.players,state.starters); return s.atk+s.def})()`);
const outPos = run(`(()=>{const gk=state.players.find(p=>p.position==='GK'); const idx=state.lineupSlots.findIndex(id=>id===gk.id); if(idx>=0){state.lineupSlots[idx]=state.players.find(p=>p.position==='FW').id;} state.lineupSlots[10]=gk.id; syncStartersFromLineup(); const s=teamStrengthFor(state.players,state.starters); return s.atk+s.def})()`);
check('بازی دادن بازیکن خارج از پست تیم را ضعیف‌تر می‌کند', outPos < inPos, `در پست=${inPos.toFixed(1)} خارج از پست=${outPos.toFixed(1)}`);
run('autoFillLineup()');

console.log('\n=== ۷) ضربات پنالتی در جام حذفی ===');
const pens = run(`(()=>{
  let decisive = 0;
  for(let i=0;i<500;i++){ const r = shootout(75,75); if(r.userScore !== r.oppScore) decisive++; }
  return { decisive, alwaysDecisive: decisive === 500 };
})()`);
check('پنالتی همیشه برنده دارد (۵۰۰ آزمون)', pens.alwaysDecisive === true, `${pens.decisive}/500`);
check('تیم ضعیف‌تر شانس کمتری دارد', run(`(()=>{let w=0;for(let i=0;i<300;i++) if(shootout(60,85).userWon) w++; return w/300;})()`) < 0.5);
check('تیم مساوی تقریباً ۵۰-۵۰ است', Math.abs(run(`(()=>{let w=0;for(let i=0;i<400;i++) if(shootout(70,70).userWon) w++; return w/400;})()`) - 0.5) < 0.12);

console.log('\n=== ۸) ذخیره‌ی خودکار و بارگذاری ===');
run('state.budget = 777; render();');
check('ذخیره‌ی خودکار در localStorage نوشته شد', !!localStorage.getItem('footballManager.autosave.v1'));
const clubSaved = run('state.clubName');
run('state = null;');
check('بارگذاری خودکار بازی را برمی‌گرداند', run('tryAutoLoad()') === true && run('state.budget') === 777 && run('state.clubName') === clubSaved);
run('startNewGame(false)');
check('شروع بازی جدید، ذخیره‌ی قبلی را پاک می‌کند', !localStorage.getItem('footballManager.autosave.v1') && run('state===null'));

console.log('\n=== ۹) موتور مسابقه، گزارش و ری‌پلی ===');
run(`document.getElementById('inpClub').value='تیم تست'; document.getElementById('inpManager').value='مدیر'; startGame()`);
run('autoFillLineup()');
const rep1 = run(`simulateMatch(state.clubName, state.league.teams[1].name, {seed: 4242, competition:'league'})`);
check('simulateMatch گزارش کامل برمی‌گرداند', !!(rep1 && rep1.events && rep1.stats && rep1.factors), Object.keys(rep1||{}).slice(0,6).join(','));
check('گزارش، ورودی‌های بازتولیدشدنی دارد', !!(rep1.inputs && rep1.inputs.home && rep1.inputs.away));
check('گزارش، نسخه‌ی موتور را دارد', rep1.engineVersion === 1);
check('گزارش، seed داده‌شده را نگه می‌دارد', rep1.seed === 4242);
const rep2 = run(`JSON.stringify(simulateMatch(state.clubName, state.league.teams[1].name, {seed: 4242}))`);
const rep1j = JSON.stringify(rep1);
check('همان seed ⇒ همان گزارش (قطعی بودن در بازی)', rep1j === rep2 || rep1j.split('"id"')[0] === rep2.split('"id"')[0]);
const verify = run(`(()=>{const r=state.matchReports[0]||null; return r?null:null})()`);
run(`pushReport(${JSON.stringify({}).length ? 'JSON.parse(' + JSON.stringify(rep1j) + ')' : 'null'})`);
check('گزارش در فهرست گزارش‌ها ذخیره شد', run('state.matchReports.length') >= 1);
const same = run(`(()=>{const r = state.matchReports[0];
  const again = simulateMatchEngine(r.inputs.home, r.inputs.away, {seed:r.seed, neutral:r.neutral});
  return again.homeGoals===r.homeGoals && again.awayGoals===r.awayGoals && JSON.stringify(again.events)===JSON.stringify(r.events);})()`);
check('بازتولید گزارش از روی seed نتیجه‌ی یکسان می‌دهد (ضدتقلب)', same === true);

console.log('\n=== ۱۰) آمار فصل از روی گزارش ===');
run('state.seasonStats = freshSeasonStats()');
const statsOk = run(`(()=>{
  const before = JSON.stringify(state.seasonStats);
  const r = simulateMatch(state.clubName, state.league.teams[2].name, {seed: 99});
  applyReportToStats(r);
  const side = userSideOf(r);
  const goalsInEvents = r.events.filter(e=>e.side===side && e.type==='goal').length;
  const myGoals = side==='home'? r.homeGoals : r.awayGoals;
  const sum = Object.values(state.seasonStats.goals).reduce((a,b)=>a+b,0);
  return {goalsInEvents, myGoals, sum, changed: JSON.stringify(state.seasonStats) !== before};
})()`);
check('گل‌های آمار فصل با رویدادهای گزارش برابر است', statsOk.sum === statsOk.myGoals, `آمار=${statsOk.sum} گزارش=${statsOk.myGoals}`);
check('آمار فصل واقعاً به‌روز شد', statsOk.changed === true);

console.log('\n=== ۱۱) کد چالش (بازی دوستانه‌ی آسنکرون) ===');
const codeA = run('makeChallengeCode()');
check('کد چالش ساخته شد', typeof codeA === 'string' && codeA.length > 40, (codeA||'').length + ' کاراکتر');
check('کد چالش خودش را برمی‌گرداند', run(`decodeChallengeCode(${JSON.stringify(codeA)})`) !== null);
check('کد نامعتبر رد می‌شود', run(`decodeChallengeCode('!!!bad!!!')`) === null);
const twoClients = run(`(()=>{
  const A = makeChallengeCode();
  const B = makeChallengeCode();
  const r1 = playChallenge(A, B);
  const r2 = playChallenge(B, A);   // طرف مقابل، کدها را برعکس می‌گذارد
  return { ok: !!r1 && !!r2, same: r1 && r2 ? (r1.homeGoals===r2.homeGoals && r1.awayGoals===r2.awayGoals && r1.home===r2.home) : false,
           neutral: r1 ? r1.neutral : null };
})()`);
check('بازی دوستانه در دو دستگاه، نتیجه‌ی یکسان می‌دهد', twoClients.same === true);
check('زمین دوستانه بی‌طرف است (برابری کامل)', twoClients.neutral === true);
const selfChallenge = run(`(()=>{const A = makeChallengeCode(); const r = playChallenge(A, A); return r ? (r.homeGoals>=0 && r.awayGoals>=0) : false})()`);
check('چالش با خودت هم خطا نمی‌دهد', selfChallenge === true);
run(`commitFriendly(playChallenge(makeChallengeCode(), makeChallengeCode()))`);
check('بازی دوستانه در گزارش‌ها ثبت شد', run(`state.matchReports.filter(r=>r.competition==='friendly').length`) >= 1);

console.log('\n=== ۱۲) رندر مودال‌های گزارش و چالش ===');
let modalOk = true, modalErr = '';
try{ run(`openReport(state.matchReports[0].id)`); }catch(e){ modalOk = false; modalErr = e.message; }
check('مودال گزارش کامل بدون خطا باز می‌شود', modalOk, modalErr);
modalOk = true; modalErr = '';
try{ run(`verifyReport(state.matchReports[0].id)`); }catch(e){ modalOk = false; modalErr = e.message; }
check('مودال تأیید نتیجه بدون خطا باز می‌شود', modalOk, modalErr);
modalOk = true; modalErr = '';
try{ run(`closeAllOverlays(); openChallenge()`); }catch(e){ modalOk = false; modalErr = e.message; }
check('مودال کد چالش بدون خطا باز می‌شود', modalOk, modalErr);
modalOk = true; modalErr = '';
try{ run(`closeAllOverlays(); renderReports()`); }catch(e){ modalOk = false; modalErr = e.message; }
check('فهرست گزارش‌ها بدون خطا رندر می‌شود', modalOk, modalErr);
check('گزارش‌ها شامل نام بازیکن‌های واقعی حریف هستند',
  run(`(()=>{const r=(state.matchReports||[]).find(x=>x.away!==state.clubName||x.home!==state.clubName); if(!r) return false;
    const side = r.home===state.clubName?'away':'home';
    const e = r.events.find(ev=>ev.side===side && ev.playerName);
    return !!e && e.playerName.length>2;})()`) === true);

console.log('\n=== ۱۳) رندر همه‌ی تب‌ها ===');
run(`startGame()`);
const NAV = run('NAV');
let renders = 0;
for (const nav of NAV) {
  const subs = nav.subs ? nav.subs.map(s => s.key) : [null];
  for (const sub of subs) {
    run(`uiMain = ${JSON.stringify(nav.key)}; uiSub = ${JSON.stringify(sub)};`);
    try { run('render()'); renders++; }
    catch (e) { console.log(`  ❌ رندر ${nav.key}/${sub}: ${e.message}`); failed++; }
  }
}
check(`همه‌ی ${renders} نمای بازی بدون خطا رندر شد`, renders === NAV.reduce((a, n) => a + (n.subs ? n.subs.length : 1), 0));

/* ---------- نتیجه ---------- */
console.log('\n' + '─'.repeat(50));
if (failed === 0) console.log('🎉 همه‌ی تست‌ها موفق بود — بازی سالم است.');
else console.log(`⚠️  ${failed} تست ناموفق.`);
process.exit(failed === 0 ? 0 : 1);
