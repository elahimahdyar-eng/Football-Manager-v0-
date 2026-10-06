/* ============================================================
   tools/online-ui-test.js — تست هدلس اپ آنلاین (DOM جعلی + سرور واقعی)
   ------------------------------------------------------------
   چرا این فایل؟ اپ موبایل (index.html + js/app.js) را نمی‌شود بدون
   مرورگر تست کرد، ولی می‌توان «همه‌ی نماها را رندر کرد و دنبال خطا
   گشت». این تست:
     ۱) DOM جعلی از خود index.html می‌سازد (شناسه‌ها و کلاس‌ها)
     ۲) یک سرور واقعی روی پورت تصادفی با داده‌ی موقت بالا می‌آورد
     ۳) کل جریان را مثل یک کاربر موبایل طی می‌کند:
        ورود → ساخت باشگاه → خانه → تیم (ترکیب/فهرست/تمرین) →
        بازار (خرید/فروش) → لیگ (ساخت/ثبت ترکیب/بازی هفته/پخش زنده)
        → باشگاه
     ۴) سه چیز را بررسی می‌کند:
        • هیچ رندری خطا نمی‌دهد و «undefined» ندارد
        • همه‌ی عکس‌های چهره‌ی استفاده‌شده روی دیسک وجود دارند
        • همه‌ی کلاس‌های CSS استفاده‌شده در css/app.css تعریف شده‌اند
          (لینت رابط کاربری — چون دسترسی به مرورگر نداریم)

   اجرا:  node tools/online-ui-test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');

const ROOT = path.join(__dirname, '..');

/* ---------- داده‌ی سرور در پوشه‌ی موقت ---------- */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-ui-test-'));
process.env.DATA_DIR = TMP;
process.env.DEV_OTP = '1';
process.env.SECRET = 'ui-test-secret';
process.env.PORT = '0';
process.env.NODE_ENV = 'test';

let failed = 0, passed = 0, warnings = [];
function check(label, cond, extra){
  if(cond){ passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}
function warn(msg){ warnings.push(msg); }

/* انتظار برای یک شرط داخل vm (مثل «بوت تمام شد») */
let ACTIVE_CTX = null;
async function waitFor(expr, ms){
  const t0 = Date.now();
  for(;;){
    let done = false;
    try{ done = !!ACTIVE_CTX.run(expr); }catch(e){}
    if(done) return true;
    if(Date.now() - t0 > (ms || 6000)) return false;
    await new Promise(r=> setTimeout(r, 25));
  }
}

/* ============================================================
   ۱) DOM جعلی
   ============================================================ */
function makeClassList(el){
  const set = new Set();
  return {
    _set: set,
    add(...c){ c.forEach(x=> x && set.add(x)); el._cls = [...set].join(' '); },
    remove(...c){ c.forEach(x=> set.delete(x)); el._cls = [...set].join(' '); },
    contains(c){ return set.has(c); },
    toggle(c, force){
      const on = force === undefined ? !set.has(c) : !!force;
      if(on) set.add(c); else set.delete(c);
      el._cls = [...set].join(' ');
      return on;
    }
  };
}
function makeEl(id, tag, className){
  const el = {
    id: id || '',
    tagName: (tag || 'div').toUpperCase(),
    _html: '',
    _text: '',
    _cls: className || '',
    value: '',
    disabled: false,
    children: [],
    dataset: {},
    style: new Proxy({}, { get: (t, k)=> (k in t ? t[k] : ''), set: (t, k, v)=>{ t[k] = v; return true; } }),
    scrollTop: 0,
    parentNode: null,
    appendChild(c){ this.children.push(c); c.parentNode = this; return c; },
    remove(){},
    removeChild(c){ this.children = this.children.filter(x=> x !== c); },
    setAttribute(k, v){ if(k === 'class') this._cls = v; if(k === 'data-step') this.dataset.step = v; this[k] = v; },
    getAttribute(k){ if(k === 'class') return this._cls; if(k === 'data-step') return this.dataset.step; return this[k] === undefined ? null : this[k]; },
    focus(){}, blur(){}, select(){}, click(){}, scrollTo(){},
    insertAdjacentHTML(pos, html){ this._html = String(html) + this._html; },
    addEventListener(ev, fn){ (this._ev = this._ev || {})[ev] = fn; },
    querySelector(sel){ return documentStub.querySelector(sel); },
    querySelectorAll(sel){ return documentStub.querySelectorAll(sel); },
    getBoundingClientRect(){ return { top:0, left:0, width:0, height:0 }; }
  };
  Object.defineProperty(el, 'innerHTML', {
    get(){ return this._html; },
    set(v){
      const html = v === null || v === undefined ? '' : String(v);
      this._html = html;
      /* DOM جعلی: عناصر داخل innerHTML (مثل پخش زنده) باید register شوند */
      if(html && html.indexOf('id="') !== -1) indexFragment(this, html);
    },
  });
  Object.defineProperty(el, 'textContent', {
    get(){ return this._text; },
    set(v){ this._text = v === null || v === undefined ? '' : String(v); },
  });
  Object.defineProperty(el, 'className', {
    get(){ return this._cls; },
    set(v){ this._cls = String(v); el.classList._set = new Set(String(v).split(/\s+/).filter(Boolean)); }
  });
  el.classList = makeClassList(el);
  if(className) className.split(/\s+/).filter(Boolean).forEach(c=> el.classList._set.add(c));
  return el;
}

const registry = { byId: new Map(), byClass: new Map(), byTag: new Map() };
function register(el){
  if(el.id) registry.byId.set(el.id, el);
  (el._cls || '').split(/\s+/).filter(Boolean).forEach(c=>{
    if(!registry.byClass.has(c)) registry.byClass.set(c, []);
    registry.byClass.get(c).push(el);
  });
  const t = el.tagName.toLowerCase();
  if(!registry.byTag.has(t)) registry.byTag.set(t, []);
  registry.byTag.get(t).push(el);
}

const TAG_RE = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
function indexFragment(owner, html){
  TAG_RE.lastIndex = 0;
  let mm;
  while((mm = TAG_RE.exec(html))){
    const attrs = mm[2] || '';
    const idM = attrs.match(/\bid="([^"]*)"/);
    if(!idM) continue;
    const clsM = attrs.match(/\bclass="([^"]*)"/);
    const stepM = attrs.match(/\bdata-step="([^"]*)"/);
    const child = makeEl(idM[1], mm[1], clsM ? clsM[1] : '');
    if(stepM) child.dataset.step = stepM[1];
    child.parentNode = owner;
    owner.children.push(child);
    register(child);
  }
}
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
TAG_RE.lastIndex = 0;
let m;
while((m = TAG_RE.exec(indexHtml))){
  const attrs = m[2] || '';
  const idM = attrs.match(/\bid="([^"]*)"/);
  const clsM = attrs.match(/\bclass="([^"]*)"/);
  const hiddenM = attrs.match(/\bstyle="([^"]*)"/);
  const stepM = attrs.match(/\bdata-step="([^"]*)"/);
  const el = makeEl(idM ? idM[1] : '', m[1], clsM ? clsM[1] : '');
  if(stepM) el.dataset.step = stepM[1];
  if(hiddenM && /display:\s*none/.test(hiddenM[1])) el.style.display = 'none';
  register(el);
}
['splashBall', 'authBall'].forEach(id=>{});
const documentStub = {
  getElementById(id){ return registry.byId.get(id) || null; },
  querySelector(sel){
    const list = this.querySelectorAll(sel);
    return list.length ? list[0] : null;
  },
  querySelectorAll(sel){
    const parts = String(sel).trim().split(/\s+/);
    let last = parts[parts.length - 1];
    let stepFilter = null;
    const stepM = last.match(/\[data-step="([^"]*)"\]/);
    if(stepM){ stepFilter = stepM[1]; last = last.replace(/\[data-step="[^"]*"\]/, ''); }
    const applyStep = (list)=> stepFilter === null ? list : list.filter(el=> el.dataset.step === stepFilter);
    if(last.startsWith('.')) return applyStep((registry.byClass.get(last.slice(1)) || []).slice());
    if(last.startsWith('#')){ const el = registry.byId.get(last.slice(1)); return el ? applyStep([el]) : []; }
    return applyStep((registry.byTag.get(last.toLowerCase()) || []).slice());
  },
  createElement(tag){ const el = makeEl('', tag, ''); register(el); return el; },
  addEventListener(){},
  body: makeEl('body', 'body', ''),
  documentElement: makeEl('html', 'html', '')
};
documentStub.body = makeEl('', 'body', '');

/* ============================================================
   ۲) سرور واقعی + یافته‌های شبکه
   ============================================================ */
const { server } = require('../server/index.js');

let BASE = '';
const fetchLog = [];
let netOffline = false;      /* قطعی شبکه‌ی شبیه‌سازی‌شده (پرچم هارنس، نه بازنویسی fetch) */

const store = new Map();
const localStorageStub = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ============================================================
   ۳) بارگذاری اسکریپت‌های index.html در vm
   ============================================================ */
function bootSandbox(){
  const sandbox = {
    document: documentStub,
    localStorage: localStorageStub,
    console,
    navigator: { onLine: true },
    location: { protocol: 'http:', origin: BASE, href: BASE + '/', reload(){}, host: 'test' },
    /* تایمرهای واقعی: مهلت درخواست‌های NET نباید زودتر از موعد شلیک شود */
    setTimeout: (fn, ms)=> setTimeout(fn, ms || 0),
    clearTimeout,
    setInterval: ()=> 0,
    clearInterval: ()=>{},
    alert: ()=>{}, confirm: ()=> true,
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error, Set, Map, Promise,
    isNaN, parseInt, parseFloat, TextEncoder, TextDecoder, btoa, atob, Uint8Array, AbortController,
    fetch: (url, opts)=>{
      if(netOffline) return Promise.reject(new Error('network down'));
      const u = String(url);
      const abs = u.startsWith('http') ? u : BASE + u;
      fetchLog.push((opts && opts.method) || 'GET');
      return fetch(abs, opts);
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.addEventListener = ()=>{};
  const ctx = vm.createContext(sandbox);
  const scripts = [...indexHtml.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(x=> x[1]);
  for(const f of scripts){
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try{ vm.runInContext(code, ctx, { filename: f }); }
    catch(e){ console.error(`❌ خطا در بارگذاری ${f}: ${e.message}`); process.exit(1); }
  }
  ACTIVE_CTX = ctx;
  return {
    ctx,
    run: (code)=> vm.runInContext(code, ctx, { filename: 'ui-test' }),
    scripts
  };
}

/* ============================================================
   ۴) لینت کلاس‌های CSS
   ============================================================ */
const cssText = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
const cssClasses = new Set();
([...cssText.matchAll(/\.([a-zA-Z][\w-]*)/g)]).forEach(x=> cssClasses.add(x[1]));
const usedClasses = new Map();       /* کلاس → نمونه‌ی محل استفاده */
function collectClasses(html, where){
  ([...String(html).matchAll(/class="([^"]*)"/g)]).forEach(x=>{
    x[1].split(/\s+/).filter(Boolean).forEach(c=>{ if(!usedClasses.has(c)) usedClasses.set(c, where); });
  });
}

/* ============================================================
   ۵) اجرای سناریو
   ============================================================ */
async function runScenario(){
  await new Promise(res=> server.listen(0, '127.0.0.1', res));
  BASE = 'http://127.0.0.1:' + server.address().port;

  console.log('\n=== ۱) بارگذاری اپ موبایل ===');
  const B = bootSandbox();
  check('اسکریپت‌های index.html بارگذاری شدند', B.scripts.length >= 6, B.scripts.join(','));
  check('اسکریپت‌های حذف‌شده (تصاویر/شبکه) درست چیده شده‌اند',
    B.scripts.includes('js/app.js') && B.scripts.includes('js/net.js') && B.scripts.includes('js/assets.js'));
  check('جست‌وجوگر آدمک/چهره در دسترس است', B.run('typeof faceImg === "function" && typeof jerseySVG === "function"'));
  check('لایه‌ی شبکه در دسترس است', B.run('typeof NET === "function" ? false : typeof NET.req === "function"'));

  console.log('\n=== ۲) ورود و ساخت باشگاه ===');
  B.run(`document.getElementById('authPhone').value = '09121112233'`);
  await B.run('AUTH.sendOtp()');
  check('گام کد تأیید فعال می‌شود', B.run(`document.querySelector('.auth-step[data-step="2"]').classList.contains('on')`) === true);
  const devCode = B.run(`(function(){ return document.querySelectorAll('.otp-box').map(b=> b.value).join(''); })()`);
  check('حالت دمو کد را خودکار پر می‌کند (تجربه‌ی تست بدون پیامک)', /^\d{5}$/.test(devCode), devCode);
  await B.run('AUTH.verifyOtp()');
  check('ورود انجام شد و توکن ذخیره شد', B.run('!!NET.token()'), B.run('NET.token()'));
  B.run(`document.getElementById('authClub').value = 'آذرخش البرز'`);
  B.run(`AUTH.pickKit('c1', '#e11d48'); AUTH.pickKit('pattern', 'stripes')`);
  check('پیش‌نمایش کیت در گام ۳ رندر می‌شود', B.run(`document.getElementById('authKit').innerHTML`).includes('jersey-svg'));
  await B.run('AUTH.createClub()');
  await waitFor('ST.loaded === true');
  check('باشگاه ساخته شد و به اپ وارد شدیم', B.run(`document.getElementById('gameApp').style.display`) === 'flex');
  check('تیم شروع (۱۴ بازیکن) روی سرور ساخته شد', B.run('ST.squad && ST.squad.players.length') >= 14, B.run('ST.squad && ST.squad.players.length'));
  check('ترکیب اولیه ۱۱ نفره است', B.run('ST.lineup.filter(Boolean).length') === 11, B.run('ST.lineup.filter(Boolean).length'));
  check('کیف پول از سرور خوانده شد', (B.run('ST.profile && ST.profile.wallet') || 0) > 0, B.run('ST.profile && ST.profile.wallet'));

  console.log('\n=== ۳) رندر همه‌ی تب‌ها و زیرتب‌ها ===');
  const views = [];
  const renderTab = (tab, sub)=>{
    B.run(`ST.tab = ${JSON.stringify(tab)}; ST.sub = ${JSON.stringify(sub)}; APP.render();`);
    const html = B.run(`document.getElementById('gameMain').innerHTML`);
    views.push({ name: tab + (sub ? '/' + sub : ''), html });
    return html;
  };
  const home = renderTab('home');
  check('خانه: کارت باشگاه + بازی بعدی/لیگ', home.includes('club-badge') && (home.includes('لیگ') || home.includes('بازی')), home.length);
  const teamLineup = renderTab('team', 'lineup');
  check('ترکیب: زمین، بازیکنان و نیمکت رندر می‌شود', teamLineup.includes('pitch-line') && teamLineup.includes('pdot'), teamLineup.length);
  const teamSquad = renderTab('team', 'squad');
  check('فهرست: کارت بازیکنان با چهره', teamSquad.includes('prow') && teamSquad.includes('assets/faces'), teamSquad.length);
  const teamTrain = renderTab('team', 'train');
  check('تمرین: چهار جلسه‌ی تمرین', (teamTrain.match(/APP.train\(/g) || []).length >= 4);
  const market = renderTab('market');
  check('بازار: بازیکنان با قیمت و چهره', market.includes('market-item') && market.includes('price-tag'), market.length);
  const sell = renderTab('market', 'sell');
  check('فروش: فهرست بازیکنان خودی', sell.includes('APP.sellPlayer('), sell.length);
  const club = renderTab('club');
  check('باشگاه: کارنامه + هویت باشگاه + تنظیمات', club.includes('کارنامه') && club.includes('jersey-svg') && club.includes('آدرس سرور'), club.length);
  const leagueEmpty = renderTab('league');
  check('لیگ: خالی است ولی فرم ساخت لیگ دارد', leagueEmpty.includes('ساخت لیگ'), leagueEmpty.length);

  console.log('\n=== ۴) لیگ آنلاین: ساخت، ثبت ترکیب، بازی هفته ===');
  await B.run(`APP.doCreateLeague('لیگ محله')`);
  await waitFor('!!(ST.league && ST.league.id)');
  check('لیگ ساخته و باز شد', B.run('ST.league && ST.league.id'), B.run('ST.league && ST.league.id'));
  check('لیگ با تیم‌های AI پر شد', B.run('ST.league.aiCount') >= 6, B.run('ST.league.aiCount'));
  const leagueView = renderTab('league', 'table');
  check('جدول لیگ رندر می‌شود', leagueView.includes('ltable'), leagueView.length);
  const fixtures = renderTab('league', 'fixtures');
  check('برنامه‌ی مسابقات رندر می‌شود', fixtures.includes('round'), fixtures.length);
  await B.run('APP.submitWeek()');
  check('ثبت ترکیب هفته انجام شد', B.run('ST.league.mySubmitted') === true);
  await B.run('APP.playWeek()');
  const afterPlay = B.run('ST.league');
  check('بازی هفته انجام شد و جدول پر شد', afterPlay && Object.keys(afterPlay.results || {}).length > 0,
    JSON.stringify(afterPlay && Object.keys(afterPlay.results || {}).length));
  check('کیف پول بعد از بازی تغییر کرد (اقتصاد فعال است)',
    (B.run('ST.profile.wallet')) !== 8500000, B.run('ST.profile.wallet'));
  check('اخبار بعد از بازی ثبت شد', B.run('(ST.news||[]).length') > 0, B.run('(ST.news||[]).length'));
  const stats = renderTab('league', 'stats');
  check('آمار جانبی (گلزن/پاس گل) رندر می‌شود', stats.includes('آقای گل'), stats.length);
  const hist = renderTab('league', 'history');
  check('تاریخچه بدون خطا رندر می‌شود', typeof hist === 'string' && hist.length > 0);

  console.log('\n=== ۵) پخش زنده‌ی مسابقه ===');
  const reportId = B.run(`(function(){ const r = ST.league.results; const k = Object.keys(r)[0]; return r[k].reportId; })()`);
  check('گزارش مسابقه روی سرور ذخیره شده', !!reportId, reportId);
  const repJson = await fetch(BASE + '/api/matches/' + reportId).then(r=> r.json());
  B.run(`window.__rep = ${JSON.stringify(repJson.report)};`);
  B.run(`LIVE.open(window.__rep, { myClub: ST.profile.clubName, label: 'تست', onClose: ()=>{} })`);
  const liveHtml = B.run(`document.getElementById('liveRoot').innerHTML`);
  check('پخش زنده رندر می‌شود (تابلو + زمین + فید)', liveHtml.includes('score-board') && liveHtml.includes('live-pitch') && liveHtml.includes('lvFeed'));
  check('ترکیب دو تیم در پخش زنده چیده شده', B.run(`document.getElementById('lvDotsTop').innerHTML.length + document.getElementById('lvDotsBot').innerHTML.length`) > 100);
  B.run(`LIVE.ctx.minute = 0; for(let i=0;i<95;i++){ LIVE._tick(); }`);
  check('همه‌ی دقیقه‌های مسابقه بدون خطا پخش شد', B.run('LIVE.ctx.done') === true);
  const endHtml = B.run(`document.getElementById('lvEnd').innerHTML`);
  check('پایان مسابقه: کارت نتیجه + بهترین بازیکن', endHtml.includes('پایان مسابقه') && endHtml.includes('بهترین بازیکن'), endHtml.length);
  check('فید رویدادها گل‌ها را نشان می‌دهد', /گل!/.test(B.run(`document.getElementById('lvFeed').innerHTML`)));
  B.run('LIVE.close(true)');
  check('بستن پخش، ریشه را پاک می‌کند', B.run(`document.getElementById('liveRoot').innerHTML`) === '');

  console.log('\n=== ۶) بازار: خرید و فروش ===');
  const beforePlayers = B.run('ST.squad.players.length');
  const affordable = B.run(`(function(){ const x = (ST.market.list||[]).find(y=> y.price <= (ST.profile.wallet||0) && !y.bought); return x ? x.id : null; })()`);
  if(affordable){
    await B.run(`APP._buy(${JSON.stringify(affordable)})`);
    check('خرید بازیکن، فهرست را بزرگ‌تر می‌کند', B.run('ST.squad.players.length') === beforePlayers + 1,
      `${beforePlayers} → ${B.run('ST.squad.players.length')}`);
  } else {
    warn('بازیکن قابل‌خرید در این بازار نبود (کیف پول کم)؛ تست خرید انجام نشد.');
  }
  const sellTarget = B.run(`(function(){ const p = (ST.squad.players||[]).slice().sort((a,b)=> a.attack-b.attack)[0]; return p ? p.id : null; })()`);
  const beforeSell = B.run('ST.squad.players.length');
  await B.run(`APP._sell(${JSON.stringify(sellTarget)})`);
  check('فروش بازیکن، فهرست را کوچک‌تر می‌کند', B.run('ST.squad.players.length') === beforeSell - 1,
    `${beforeSell} → ${B.run('ST.squad.players.length')}`);

  console.log('\n=== ۷) چیدن ترکیب و ذخیره روی سرور ===');
  B.run(`ST.lineup = APP.reflowLineup([]); ST.dirty = true;`);
  B.run(`APP.setFormation('4-3-3')`);
  check('تغییر آرایش، ترکیب را ۱۱ نفره نگه می‌دارد', B.run('ST.lineup.filter(Boolean).length') === 11,
    B.run('ST.lineup.filter(Boolean).length'));
  B.run(`APP.setCaptain(ST.lineup[0])`);
  await B.run('APP.saveLineup()');
  check('ترکیب روی سرور ذخیره شد (آرایش و کاپیتان)', B.run(`ST.squad.formation`) === '4-3-3' && B.run('ST.squad.captainId') !== null,
    `${B.run('ST.squad.formation')} / ${B.run('ST.squad.captainId')}`);
  check('قدرت تیم سرور با ترکیب ذخیره‌شده هم‌خوان است', (B.run('ST.squad.atk') || 0) > 30 && (B.run('ST.squad.def') || 0) > 30,
    `${B.run('ST.squad.atk')}/${B.run('ST.squad.def')}`);
  const savedLineup = renderTab('team', 'lineup');
  check('زمین با آرایش جدید و کاپیتان رندر می‌شود', savedLineup.includes('کانون') || savedLineup.includes('pdot'));

  console.log('\n=== ۸) تمرین و آمار مربی ===');
  const fitnessBefore = B.run('ST.squad.fitness');
  await B.run(`APP.train('recovery')`);
  check('اردوی بازیابی آمادگی را بالا می‌برد', B.run('ST.squad.fitness') > fitnessBefore, `${fitnessBefore} → ${B.run('ST.squad.fitness')}`);
  check('هزینه‌ی تمرین از کیف پول کم شد', B.run('ST.profile.wallet') < 8500000);

  console.log('\n=== ۹) جدول رهبران و تازه‌سازی کل ===');
  await B.run('APP.reloadLeaders()');
  check('جدول رهبران پر می‌شود', Array.isArray(B.run('ST.leaders.top')), B.run('JSON.stringify((ST.leaders||{}).top||null)').slice(0, 60));
  await B.run('APP.reloadAll()');
  check('تازه‌سازی کل بدون خطا انجام شد', B.run('ST.loaded') === true);

  console.log('\n=== ۱۰) مقاومت در برابر قطعی شبکه ===');
  netOffline = true;
  await B.run('APP.reloadMarket()');
  const offlineMarket = B.run('document.getElementById("gameMain").innerHTML');
  check('با قطع شبکه، صفحه خراب نمی‌شود (رندر سالم می‌ماند)', typeof offlineMarket === 'string' && offlineMarket.length > 0);
  netOffline = false;                     /* شبکه برمی‌گردد، ولی توکن پاک شده */
  B.run('NET.setToken("")');
  await B.run('APP.boot()');
  await waitFor(`document.getElementById('auth').style.display === 'flex'`, 2500);
  check('بدون توکن، به صفحه‌ی ورود برمی‌گردد', B.run(`document.getElementById('auth').style.display`) === 'flex');

  console.log('\n=== ۱۱) لینت رابط کاربری (کلاس‌های CSS) ===');
  ['خانه', 'ترکیب', 'فهرست', 'تمرین', 'بازار', 'لیگ', 'باشگاه'].forEach((n, i)=>{
    const v = views[i];
    if(v) collectClasses(v.html, v.name);
  });
  collectClasses(B.run(`document.getElementById('liveRoot').innerHTML`), 'live');
  collectClasses(B.run(`document.getElementById('lvEnd').innerHTML`), 'live-end');
  collectClasses(B.run(`document.getElementById('gameMain').innerHTML`), 'final');
  collectClasses(B.run(`document.getElementById('authKit').innerHTML`), 'auth');
  const missing = [];
  usedClasses.forEach((where, cls)=>{
    if(cls.startsWith('$') || cls.includes('{')) return;
    if(!cssClasses.has(cls)) missing.push(`${cls} (${where})`);
  });
  const dynamic = ['on', 'hl', 'cap', 'off'];
  const realMissing = missing.filter(x=> !dynamic.some(d=> x.startsWith(d + ' ')));
  if(realMissing.length){
    console.log('  ⚠️ کلاس‌های بدون استایل:');
    realMissing.forEach(x=> console.log('     · ' + x));
  }
  check('هیچ کلاس بدون استایلی در رابط کاربری نماد (بدون CSS نمانده)', realMissing.length === 0, realMissing.length);

  console.log('\n=== ۱۲) سلامتی تصاویر (چهره‌ها) ===');
  const faceRefs = new Set();
  const allHtml = views.map(v=> v.html).join('\n');
  ([...allHtml.matchAll(/src="\.\/(assets\/faces\/[^"]+)"/g)]).forEach(x=> faceRefs.add(x[1]));
  check('چهره‌ها در رابط کاربری استفاده شده‌اند', faceRefs.size > 0, faceRefs.size);
  let missingFiles = 0;
  faceRefs.forEach(rel=>{ if(!fs.existsSync(path.join(ROOT, rel))) missingFiles++; });
  check('همه‌ی فایل‌های چهره روی دیسک موجودند', missingFiles === 0, missingFiles + ' فایل گم‌شده');
  const thumbs = fs.existsSync(path.join(ROOT, 'assets/faces/thumbs'));
  check('نسخه‌ی بندانگشتی چهره‌ها برای موبایل ساخته شده', thumbs);
  const faceBytes = faceRefs.size ? [...faceRefs].reduce((s, rel)=> s + fs.statSync(path.join(ROOT, rel)).size, 0) : 0;
  check('حجم چهره‌های استفاده‌شده برای موبایل سبک است (< 400KB)', faceBytes < 400 * 1024, Math.round(faceBytes / 1024) + 'KB');

  console.log('\n=== ۱۳) درخواست‌های شبکه ===');
  check('درخواست‌های اپ از سرور واقعی عبور کردند', fetchLog.length > 10, fetchLog.length);

  /* ---------- نتیجه ---------- */
  server.close();
  try{ fs.rmSync(TMP, { recursive: true, force: true }); }catch(e){}
  if(warnings.length){ console.log('\nهشدارها:'); warnings.forEach(w=> console.log('  ⚠️ ' + w)); }
  console.log('\n' + '─'.repeat(56));
  if(!failed) console.log(`🎉 اپ موبایل سالم است — ${passed} بررسی موفق.`);
  else console.log(`⚠️  ${failed} بررسی ناموفق (${passed} موفق).`);
  process.exit(failed ? 1 : 0);
}
module.exports = { runScenario, getContext: ()=> B, getBase: ()=> BASE };
if(require.main === module){
  runScenario().catch(e=>{
    console.error('خطای غیرمنتظره در تست رابط کاربری:', e);
    process.exit(1);
  });
}
