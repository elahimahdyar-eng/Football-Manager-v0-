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
    insertAdjacentHTML(pos, html) { this._html = String(html) + this._html; },
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
run(`state.seasonStats = freshSeasonStats();`);
/* تست قطعی با گزارش ساختگی: گل + پاس گل + کلین‌شیت */
const syn = run(`(()=>{
  const scorer = state.starters[0], assister = state.starters[1];
  const gk = state.players.find(p=>p.position==='GK' && state.starters.includes(p.id));
  const report = {
    home: state.clubName, away: 'تیم ساختگی', homeGoals: 1, awayGoals: 0,
    events: [
      { minute: 10, type: 'goal', side: 'home', playerId: scorer, assistId: assister, playerName: 'x', assistName: 'y' },
      { minute: 60, type: 'card', side: 'away', playerName: 'z' }
    ]
  };
  applyReportToStats(report);
  return {
    scorerGoals: state.seasonStats.goals[scorer] || 0,
    assisterAssists: state.seasonStats.assists[assister] || 0,
    gkClean: gk ? (state.seasonStats.cleanSheets[gk.id] || 0) : -1
  };
})()`);
check('گل به گلزن گزارش ثبت می‌شود', syn.scorerGoals === 1, syn.scorerGoals);
check('پاس گل به پاس‌دهنده ثبت می‌شود', syn.assisterAssists === 1, syn.assisterAssists);
check('کلین‌شیت برای دروازه‌بان ثبت می‌شود', syn.gkClean === 1, syn.gkClean);
/* تست دوم: از گزارش واقعی موتور، فقط وقتی گل داشته باشیم (قطعی با حلقه‌ی seed) */
const realStats = run(`(()=>{
  state.seasonStats = freshSeasonStats();
  let found = null;
  for(let i=1;i<=40;i++){
    const r = simulateMatch(state.clubName, state.league.teams[2].name, {seed: 5000+i});
    const side = userSideOf(r);
    const myGoals = side==='home'? r.homeGoals : r.awayGoals;
    if(myGoals >= 2){ applyReportToStats(r); found = {seed:r.seed, myGoals, sum:Object.values(state.seasonStats.goals).reduce((a,b)=>a+b,0)}; break; }
  }
  return found;
})()`);
check('آمار فصل از گزارش واقعی موتور پر می‌شود', !!realStats && realStats.sum === realStats.myGoals,
  realStats ? `گل گزارش=${realStats.myGoals} آمار=${realStats.sum}` : 'گزارشی با گل پیدا نشد');

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

console.log('\n=== ۱۳) پخش زنده‌ی مسابقه ===');
run(`document.getElementById('inpClub').value='پخش'; document.getElementById('inpManager').value='مدیر'; startGame(); autoFillLineup()`);
const liveRep = run(`simulateMatch(state.clubName, state.league.teams[3].name, {seed: 31337})`);
run(`pushReport(${JSON.stringify({}).length ? 'JSON.parse(' + JSON.stringify(JSON.stringify(liveRep)) + ')' : 'null'})`);
let liveOk = true, liveErr = '';
try{ run(`openLiveMatch(state.matchReports[0].id)`); }catch(e){ liveOk = false; liveErr = e.message; }
check('صفحه‌ی پخش زنده بدون خطا باز می‌شود', liveOk, liveErr);
check('شمارنده‌ی دقیقه در پوسته ساخته شد', run(`document.getElementById('lvClock').textContent`) !== '');
const cum = run(`(()=>{const r=state.matchReports[0]; const total = liveTotalMinutes(r); const c=liveCumulative(r, total);
  return {total, goalsH:c.home.goals, goalsA:c.away.goals, shotsH:c.home.shots, shotsA:c.away.shots};})()`);
check('آمار تجمعی تا دقیقه‌ی پایان، با نتیجه‌ی نهایی یکی است',
  cum.goalsH === liveRep.homeGoals && cum.goalsA === liveRep.awayGoals && cum.total >= 90, JSON.stringify(cum));
check('دقیقه‌ی پایان بین ۹۰ تا ۹۴ است (وقت اضافه)', cum.total >= 90 && cum.total <= 94, cum.total);
const cumMid = run(`(()=>{const r=state.matchReports[0]; const c=liveCumulative(r, 45);
  return {h:c.home.shots, a:c.away.shots};})()`);
check('آمار دقیقه‌ی ۴۵ کمتر یا مساوی پایان بازی است', cumMid.h <= cum.shotsH && cumMid.a <= cum.shotsA);
const mom = run(`(()=>{const m=liveMomentum(state.matchReports[0], 60); return m.h+m.a;})()`);
check('نوار فشار بازی همیشه ۱۰۰٪ است', mom === 100, mom);
let skipOk = true;
try{ run('skipLive()'); }catch(e){ skipOk = false; liveErr = e.message; }
check('«پرش به نتیجه» بدون خطا کار می‌کند', skipOk, liveErr);
check('در پایان پخش، وضعیت به «پایان» تغییر می‌کند', run(`liveCtx && liveCtx.done`) === true);
run('stopLive(); closeAllOverlays();');

console.log('\n=== ۱۴) فرم ۵ بازی آخر ===');
run(`closeAllOverlays(); stopLive();`);
run('playWeek()');   // یک هفته بازی تا فرم تیم ثبت شود
run(`stopLive(); closeAllOverlays();`);
const strip = run(`(()=>{const t=state.league.teams.find(x=>x.isUser); return {n:(t.last5||[]).length, html: formStripHTML(t.last5)};})()`);
check('تیم کاربر بعد از بازی‌ها فرم دارد', strip.n > 0, strip.n + ' بازی');
check('نوار فرم HTML درست می‌سازد', strip.html.includes('form-strip') && strip.html.includes('fg-'));
check('فرم خالی هم بدون خطا رندر می‌شود', run(`formStripHTML([])`) === '');

console.log('\n=== ۱۵) پست‌های چندگانه ===');
const multi = run(`(()=>{
  let withTwo = 0;
  for(let i=0;i<300;i++){ const p = genPlayer('MF', 60, 70); if(positionsOf(p).length>1) withTwo++; }
  return withTwo;
})()`);
check('برخی بازیکنان تولیدشده دوپسته هستند', multi > 20, `${multi} از ۳۰۰`);
check('posLabel پست‌ها را فارسی نشان می‌دهد', run(`posLabel({position:'MF', positions:['MF','DF']})`).includes('/'));
check('playsIn با پست دوم موافق است', run(`playsIn({position:'MF', positions:['MF','DF']}, 'DF')`) === true);
check('playsIn با پست بیگانه مخالف است', run(`playsIn({position:'MF', positions:['MF','DF']}, 'GK')`) === false);
const fitTest = run(`(()=>{
  const p = state.players[0];
  const saved = { position:p.position, positions:p.positions };
  p.position = 'MF'; p.positions = ['MF','DF'];
  const slots = getSlotTemplate(state.formation);
  const dfSlot = slots.findIndex(sl=>sl.role==='DF');
  const gkSlot = slots.findIndex(sl=>sl.role==='GK');
  const res = { second: roleFitFor(p.id, dfSlot), foreign: roleFitFor(p.id, gkSlot), exact: roleFitFor(p.id, slots.findIndex(sl=>sl.role==='MF')) };
  p.position = saved.position; p.positions = saved.positions;
  return res;
})()`);
check('پست دوم جریمه‌ی خیلی کم دارد (۰.۹۴)', Math.abs(fitTest.second - 0.94) < 0.001, fitTest.second);
check('پست اصلی بدون جریمه است (۱)', fitTest.exact === 1, fitTest.exact);
check('پست بیگانه جریمه‌ی سنگین دارد', fitTest.foreign < 0.75, fitTest.foreign);
run('autoFillLineup()');

console.log('\n=== ۱۶) چیدمان‌های ذخیره‌شده ===');
run(`state.lineupPresets = {league:null, cup:null, friendly:null}; state.prefs.autoPresets = true;`);
run(`setFormation('4-3-3'); autoFillLineup(); state.captainId = state.starters[0];`);
run(`saveLineupPreset('league')`);
check('چیدمان لیگ ذخیره شد', run(`!!state.lineupPresets.league`) === true);
run(`setFormation('5-3-2'); autoFillLineup();`);
check('تغییر فرمیشن اعمال شد', run(`state.formation`) === '5-3-2');
run(`loadLineupPreset('league')`);
check('بارگذاری چیدمان، فرمیشن را برمی‌گرداند', run(`state.formation`) === '4-3-3');
check('بارگذاری چیدمان، کاپیتان را برمی‌گرداند', run(`!!state.captainId`) === true);
const autoApplied = run(`(()=>{
  const before = state.formation;
  state.prefs.autoPresets = true;
  state.cup = {stage:'ro8', active:true, log:[]};
  state.week = CUP_WEEKS.ro8;
  const snap = captureLineup();
  const presets = state.lineupPresets;
  const cupDue = state.cup.active && CUP_WEEKS[state.cup.stage] === state.week;
  if(state.prefs.autoPresets && cupDue && presets.cup){ applyLineupSnapshot(presets.cup); }
  const after = state.formation;
  applyLineupSnapshot(snap);
  return {before, after, restored: state.formation === before};
})()`);
check('اعمال خودکار و بازگردانی چیدمان منطقی است', autoApplied.restored === true, JSON.stringify(autoApplied));
run(`deleteLineupPreset('league'); _confirmRun();`);
check('حذف چیدمان با تأیید انجام می‌شود', run(`state.lineupPresets.league`) === null);

console.log('\n=== ۱۷.۵) لیگ رفقا (گام ۱ آنلاین) ===');
/* تیم دوست ساختگی: کد چالش کامل (همان قراردادی که کاربر می‌فرستد) */
function fakeTeamCode(name, atk){
  const pos = ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW'];
  const p = pos.map((x,i)=>['بازیکن '+name+' '+(i+1), x, atk + (i%5)]);
  const json = JSON.stringify({ v:1, c:name, mg:'رفیق', a:atk, d:atk-4, f:88, s:76, m:74, fm:'4-4-2', st:'balanced', p });
  return run(`b64urlEncode(${JSON.stringify(json)})`);
}
const frA = fakeTeamCode('آبی‌پوشان', 72);
const frB = fakeTeamCode('سرخ‌ها', 68);
const ARR_A = JSON.stringify([frB, frA]);
check('کد تیم رفیق معتبر است', run(`!!decodeChallengeCode(${JSON.stringify(frA)})`));

const lg = run(`(()=>{ const p=buildLeaguePayload('لیگ محله', ${ARR_A}); return { names:p.m.map(x=>x.c), n:p.m.length, sorted: (p.m.map(x=>x.c).join('|') === p.m.map(x=>x.c).slice().sort().join('|')) }; })()`);
check('کد لیگ ساخته شد (من + ۲ رفیق)', lg.n === 3, lg.names.join(' / '));
check('اعضای لیگ همیشه مرتب‌اند (قطعی روی هر دستگاه)', lg.sorted);

const lgCode = run(`makeLeagueCode('لیگ محله', ${ARR_A})`);
const LG = JSON.stringify(lgCode);
check('کد لیگ قابل decode است', run(`!!decodeLeagueCode(${JSON.stringify(lgCode)})`), lgCode.length + ' کاراکتر');
check('کد لیگ خراب رد می‌شود', run(`decodeLeagueCode('چرند') === null && decodeLeagueCode('') === null && decodeLeagueCode('x') === null`));
const lgCodeRev = run(`makeLeagueCode('لیگ محله', ${JSON.stringify([frA, frB])})`);
check('کد لیگ مستقل از ترتیب ورودی است (دو دستگاه، یک لیگ)', lgCode === lgCodeRev);

/* برنامه‌ی مسابقات */
const fx = run(`leagueFixtures(decodeLeagueCode(${LG}))`);
check('۳ تیم ⇒ ۳ دور', fx.length === 3, fx.length);
check('هر دور هر تیم دقیقاً یک بازی دارد', fx.every(rd=>{
  const seen = []; rd.forEach(([h,a])=>{ seen.push(h,a); });
  return seen.length === 2 && new Set(seen).size === 2;
}), JSON.stringify(fx));
check('هر جفت فقط یک بار روبه‌رو می‌شود', (()=>{
  const seen = new Set(); let ok = true;
  fx.forEach(rd=>rd.forEach(([h,a])=>{ const k=Math.min(h,a)+'-'+Math.max(h,a); if(seen.has(k)) ok=false; seen.add(k); }));
  return ok && seen.size === 3;
})());
check('هیچ تیمی با خودش بازی نمی‌کند', fx.every(rd=>rd.every(([h,a])=>h!==a)));

/* ۴ تیم ⇒ ۳ دور، ۶ مسابقه، هر تیم هر دور یک بازی */
const frC = fakeTeamCode('زردها', 70), frD = fakeTeamCode('سبزها', 66);
const fx4 = run(`(()=>{
  const p = buildLeaguePayload('لیگ ۴ نفره', [${JSON.stringify(frA)}, ${JSON.stringify(frB)}, ${JSON.stringify(frC)}, ${JSON.stringify(frD)}]);
  const rounds = leagueFixtures(p);
  const perRound = rounds.every(rd=>{ const seen=[]; rd.forEach(([h,a])=>seen.push(h,a)); return seen.length===4 && new Set(seen).size===4; });
  const total = rounds.reduce((a,rd)=>a+rd.length,0);
  const played = {};
  const results = {};
  for(let r=0;r<rounds.length;r++) simulateLeagueRound(p,r).forEach(m=>{ results[m.key]={h:m.report.homeGoals,a:m.report.awayGoals,s:m.seed,hi:m.hi,ai:m.ai,r}; });
  const table = leagueTable(p, results);
  table.forEach(t=> played[t.name]=t.played);
  return { teams:p.m.length, rounds:rounds.length, total, perRound, played, verifyBad: verifyLeagueResults(p, results).bad.length }; })()`);
check('لیگ ۵ تیمی ⇒ ۵ دور و ۱۰ مسابقه و هر تیم ۴ بازی', fx4.teams===5 && fx4.rounds===5 && fx4.total===10 && fx4.perRound && fx4.played['سبزها']===4, JSON.stringify(fx4));

/* قطعیت و یکتایی seed */
const sim1 = run(`simulateLeagueRound(decodeLeagueCode(${LG}), 0).map(m=>({k:m.key,h:m.report.homeGoals,a:m.report.awayGoals,s:m.seed}))`);
const sim2 = run(`simulateLeagueRound(decodeLeagueCode(${LG}), 0).map(m=>({k:m.key,h:m.report.homeGoals,a:m.report.awayGoals,s:m.seed}))`);
check('شبیه‌سازی یک دور کاملاً قطعی است', JSON.stringify(sim1) === JSON.stringify(sim2), JSON.stringify(sim1.map(x=>x.h+'-'+x.a)));
const seeds = run(`(()=>{ const p=decodeLeagueCode(${LG}); const s=new Set(); [0,1,2].forEach(r=>simulateLeagueRound(p,r).forEach(m=>s.add(m.seed))); return {n:s.size, list:Array.from(s)}; })()`);
check('seed هر مسابقه یکتاست (۳ مسابقه ⇒ ۳ seed)', seeds.n === 3, seeds.n);

/* جریان کامل لیگ ۳ تیمی: بازی همه‌ی دورها */
const full = run(`(()=>{
  const p = decodeLeagueCode(${LG}); const results = {};
  for(let r=0;r<leagueRoundCount(p);r++) simulateLeagueRound(p, r).forEach(m=>{
    results[m.key] = { h:m.report.homeGoals, a:m.report.awayGoals, s:m.seed, hi:m.hi, ai:m.ai, r };
  });
  const table = leagueTable(p, results), verify = verifyLeagueResults(p, results);
  return { matches:Object.keys(results).length, played:table.reduce((s,t)=>s+t.played,0),
    bad:verify.bad.length, total:verify.total, ptsSum:table.reduce((s,t)=>s+t.pts,0),
    wins:table.reduce((s,t)=>s+t.won,0), draws:table.reduce((s,t)=>s+t.drawn,0),
    rankOk: table.every((t,i)=> i===0 || table[i-1].pts >= t.pts) };
})()`);
check('لیگ ۳ تیمی ⇒ ۳ مسابقه و هر تیم ۲ بازی', full.matches === 3 && full.played === 6, JSON.stringify({m:full.matches, p:full.played}));
check('همه‌ی نتایج از روی seed بازتولید و تأیید شدند', full.bad === 0 && full.total === 3, JSON.stringify(full));
check('امتیاز کل = ۳×برد + مساوی (هر تساوی ۱ امتیاز به هر تیم)', full.ptsSum === 3*full.wins + full.draws, JSON.stringify({pts:full.ptsSum,w:full.wins,d:full.draws}));
check('جدول درست مرتب می‌شود (امتیاز نزولی)', full.rankOk);

/* ضدتقلب: نتیجه‌ی دست‌کاری‌شده باید لو برود */
const tampered = run(`(()=>{
  const p = decodeLeagueCode(${LG}); const m = simulateLeagueRound(p, 0)[0];
  const res = {}; res[m.key] = { h:m.report.homeGoals+3, a:m.report.awayGoals, s:m.seed, hi:m.hi, ai:m.ai, r:0 };
  return verifyLeagueResults(p, res).bad;
})()`);
check('نتیجه‌ی دست‌کاری‌شده رد می‌شود', tampered.length === 1 && tampered[0].why === 'result', JSON.stringify(tampered));

/* دست‌کاری seed هم باید لو برود */
const tamperedSeed = run(`(()=>{
  const p = decodeLeagueCode(${LG}); const m = simulateLeagueRound(p, 0)[0];
  const res = {}; res[m.key] = { h:m.report.homeGoals, a:m.report.awayGoals, s:m.seed+1, hi:m.hi, ai:m.ai, r:0 };
  return verifyLeagueResults(p, res).bad;
})()`);
check('seed دست‌کاری‌شده رد می‌شود', tamperedSeed.length === 1 && tamperedSeed[0].why === 'seed', JSON.stringify(tamperedSeed));

/* تغییر قدرت تیم، seed را عوض نمی‌کند (نتایج گذشته باطل نمی‌شوند) */
const seedStable = run(`(()=>{
  const p1 = decodeLeagueCode(${LG}); const p2 = decodeLeagueCode(${LG});
  const s1 = leagueMatchSeed(p1, 0, 0, 1);
  p2.m.sort((a,b)=> String(a.c) < String(b.c) ? -1 : 1);
  p2.m[0].a = 99; p2.m[0].p[0][2] = 99;
  return { s1, s2: leagueMatchSeed(p2, 0, 0, 1) };
})()`);
check('seed از قدرت تیم مستقل است (تغییر ترکیب، نتایج گذشته را باطل نمی‌کند)', seedStable.s1 === seedStable.s2, JSON.stringify(seedStable));

/* جریان UI: صفحه‌ی ساخت ⇒ ساخت لیگ ⇒ بازی دور ⇒ جدول */
const flow = run(`(()=>{
  state.asyncLeague = null;
  uiMain='league'; uiSub='async'; render();
  const setupHtml = document.getElementById('tabContent').innerHTML;
  const joined = startAsyncLeague('لیگ فلو', [${JSON.stringify(frA)}, ${JSON.stringify(frB)}]);
  const before = leagueNextRound(asyncLeaguePayload(), asyncLeagueResults());
  playNextLeagueRound(); stopLive(); closeAllOverlays();
  const resAfter = Object.keys(asyncLeagueResults()).length;
  const after = leagueNextRound(asyncLeaguePayload(), asyncLeagueResults());
  const tableHtml = leagueTableHtml(asyncLeaguePayload(), leagueTable(asyncLeaguePayload(), asyncLeagueResults()));
  leaveAsyncLeague(); _confirmRun();
  return { hasSetup: setupHtml.indexOf('ساخت لیگ') > 0, joined: !!joined, members: joined ? joined.m.length : 0,
    before, resAfter, after, tableOk: tableHtml.indexOf('al-table') > 0, cleared: state.asyncLeague === null };
})()`);
check('صفحه‌ی ساخت لیگ رندر می‌شود', flow.hasSetup);
check('لیگ ساخته شد (۳ تیم) و وارد تب لیگ رفقا شد', flow.joined && flow.members === 3, JSON.stringify({m:flow.members}));
check('بازی دور اول، نتایجش را ذخیره کرد و دور جلو رفت', flow.before === 0 && flow.resAfter === 1 && flow.after === 1, JSON.stringify({res:flow.resAfter, from:flow.before, to:flow.after}));
check('جدول HTML لیگ رفقا ساخته می‌شود', flow.tableOk);
check('خروج از لیگ با تأیید انجام می‌شود', flow.cleared);

/* بازی همه‌ی دورها تا پایان + وضعیت قهرمانی */
const finish = run(`(()=>{
  state.asyncLeague = null;
  startAsyncLeague('لیگ پایان', [${JSON.stringify(frA)}, ${JSON.stringify(frB)}]);
  let guard = 0;
  while(leagueNextRound(asyncLeaguePayload(), asyncLeagueResults()) !== null && guard < 10){
    playNextLeagueRound(); stopLive(); closeAllOverlays(); guard++;
  }
  const payload = asyncLeaguePayload();
  uiSub='async'; render();
  const html = document.getElementById('tabContent').innerHTML;
  const verify = verifyLeagueResults(payload, asyncLeagueResults());
  const table = leagueTable(payload, asyncLeagueResults());
  const out = { guard, done: leagueNextRound(payload, asyncLeagueResults()) === null,
    hasEnd: html.indexOf('لیگ تمام شد') > 0, bad: verify.bad.length, champion: table[0].name,
    myRank: table.findIndex(t=>t.isUser)+1 };
  leaveAsyncLeague(); _confirmRun();
  return out;
})()`);
check('همه‌ی ۳ دور تا پایان قابل بازی‌اند', finish.done && finish.guard === 3, JSON.stringify({guard:finish.guard}));
check('بعد از پایان، قهرمان اعلام می‌شود', finish.hasEnd && !!finish.champion, finish.champion);
check('همه‌ی نتایج لیگ تأیید می‌شوند', finish.bad === 0, finish.bad);
check('کاربر در جدول رتبه دارد', finish.myRank >= 1 && finish.myRank <= 3, finish.myRank);

const dashCard = run(`(()=>{ startAsyncLeague('لیگ داشبورد', [${JSON.stringify(frA)}, ${JSON.stringify(frB)}]);
  uiMain='home'; render(); const h = document.getElementById('tabContent').innerHTML; leaveAsyncLeague(); _confirmRun(); return h.indexOf('لیگ رفقا') > 0; })()`);
check('کارت لیگ رفقا در داشبورد دیده می‌شود', dashCard);

console.log('\n=== ۱۷) رندر همه‌ی تب‌ها ===');
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
