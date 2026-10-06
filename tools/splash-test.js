/* ============================================================
   tools/splash-test.js — تست هدلس اسپلش/ورود بدون مرورگر
   ------------------------------------------------------------
   باگ: اگر localStorage خالی باشد AUTH.init هیچ شاخه‌ای اجرا
   نمی‌کرد و صفحه روی «در حال بارگذاری...» می‌ماند.
   این فایل چهار سناریو را در DOM جعلی + vm بررسی می‌کند:
     ۱) بدون توکن → فرم ورود
     ۲) توکن معتبر → ورود به بازی
     ۳) توکن خراب / خطای fetch → پاک شدن توکن و فرم ورود
     ۴) شبکه معلق → بعد از مهلت ۸ ثانیه فرم ورود
   تایمرها دستی جلو می‌روند؛ اگر برنامه مهلتی ثبت نکند تست
   سریع با کد خروج ۱ رد می‌شود (گیر نمی‌کند).

   اجرا:  node tools/splash-test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SCRIPT_ORDER = [...html.matchAll(/<script src="\.\/([^"]+)"><\/script>/g)].map(m => m[1]);
if (!SCRIPT_ORDER.length) {
  console.error('❌ هیچ اسکریپتی در index.html پیدا نشد');
  process.exit(1);
}

/* اگر تست بیش از چند ثانیهٔ واقعی طول بکشد یعنی جایی منتظر
   شبکه/تایمر واقعی مانده — کرانه‌دار قطع می‌شود. */
const watchdog = setTimeout(() => {
  console.error('❌ تست بیش از حد طول کشید و کرانه‌دار قطع شد (احتمالاً اسپلش دوباره گیر کرده).');
  process.exit(1);
}, 8000);

let failed = 0, passed = 0;
function check(label, cond, extra) {
  if (cond) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}

function makeClassList() {
  const set = new Set();
  return {
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
    className: '',
    dataset: {},
    disabled: false,
    scrollTop: 0,
    style: new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : ''),
      set: (t, k, v) => { t[k] = v; return true; }
    }),
    classList: makeClassList(),
    children: [],
    appendChild(c) { this.children.push(c); return c; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    select() {}
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = v == null ? '' : String(v); }
  });
  return el;
}

function flushMicro() {
  return new Promise(r => setImmediate(r));
}

/* ---------- ساخت یک «مرورگر» با تایمر دستی ---------- */
function boot({ token, fetchMode }) {
  const elCache = new Map();
  const documentListeners = {};
  const document = {
    getElementById(id) {
      if (!elCache.has(id)) elCache.set(id, makeEl(id));
      return elCache.get(id);
    },
    createElement(tag) { return makeEl('<' + tag + '>'); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener(ev, fn) {
      (documentListeners[ev] || (documentListeners[ev] = [])).push(fn);
    },
    body: makeEl('body')
  };

  /* وضعیت اولیه مطابق index.html */
  document.getElementById('splash').style.display = '';
  document.getElementById('auth').style.display = 'none';
  document.getElementById('noInternet').style.display = 'none';
  document.getElementById('gameApp').style.display = 'none';

  const store = new Map();
  if (token) store.set('fm_token', token);
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear()
  };

  const timers = [];
  let now = 0;
  let nextId = 1;
  function setTimeoutFn(fn, ms) {
    const id = nextId++;
    timers.push({ id, fn, due: now + (Number(ms) || 0), cleared: false });
    return id;
  }
  function clearTimeoutFn(id) {
    const t = timers.find(x => x.id === id);
    if (t) t.cleared = true;
  }

  function fetchFn(url) {
    if (fetchMode === 'ok') {
      return Promise.resolve({
        ok: true,
        json: async () => ({ player: { hasSquad: true, clubName: 'آذرخش البرز', managerName: 'علی' } })
      });
    }
    if (fetchMode === 'err') {
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'unauthorized' })
      });
    }
    if (fetchMode === 'hang') {
      return new Promise(() => {}); /* هرگز settle نمی‌شود */
    }
    return Promise.reject(new Error('unexpected fetch: ' + url));
  }

  const sandbox = {
    document, localStorage, console, fetch: fetchFn,
    navigator: { onLine: true },
    location: { protocol: 'http:', origin: 'http://testhost', href: 'http://testhost/', reload(){} },
    setTimeout: setTimeoutFn, clearTimeout: clearTimeoutFn,
    /* حلقه‌ی رویداد و APIهای مرورگری که اپ در زمان بارگذاری لمس می‌کند */
    addEventListener(){}, removeEventListener(){},
    matchMedia: ()=> ({ matches: false, addEventListener(){} }),
    requestAnimationFrame: fn => setTimeoutFn(fn, 16), cancelAnimationFrame: clearTimeoutFn,
    AbortController, history: { replaceState(){}, pushState(){} },
    setInterval: () => 0, clearInterval: () => {},
    alert: () => {}, confirm: () => true,
    JSON, Math, Date, Object, Array, String, Number, Boolean, RegExp, Error,
    Set, Map, Promise, isNaN, parseInt, parseFloat,
    TextEncoder, TextDecoder, btoa, atob, Uint8Array
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of SCRIPT_ORDER) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    try { vm.runInContext(code, ctx, { filename: f }); }
    catch (e) {
      console.error(`❌ خطا در بارگذاری ${f}: ${e.message}`);
      process.exit(1);
    }
  }

  const run = (code) => vm.runInContext(code, ctx, { filename: 'splash-test' });

  async function advance(ms) {
    now += ms;
    let guard = 0;
    while (guard++ < 200) {
      const due = timers
        .filter(t => !t.cleared && t.due <= now)
        .sort((a, b) => a.due - b.due || a.id - b.id);
      if (!due.length) {
        await flushMicro();
        const more = timers.filter(t => !t.cleared && t.due <= now);
        if (!more.length) break;
        continue;
      }
      for (const t of due) {
        if (t.cleared) continue;
        t.cleared = true;
        t.fn();
      }
      await flushMicro();
    }
  }

  function display(id) { return document.getElementById(id).style.display; }
  function pendingDelays() {
    return timers.filter(t => !t.cleared).map(t => t.due - now);
  }

  return { run, display, store, advance, pendingDelays, now: () => now };
}

(async () => {
  console.log('=== ۱) بدون توکن (اولین بازدید) ===');
  {
    const b = boot({ token: null, fetchMode: 'none' });
    b.run('AUTH.init()');
    await b.advance(600);
    check('بدون توکن: اسپلش مخفی می‌شود', b.display('splash') === 'none', b.display('splash'));
    check('بدون توکن: فرم ورود نمایش داده می‌شود', b.display('auth') === 'flex', b.display('auth'));
  }

  console.log('\n=== ۲) توکن معتبر ===');
  {
    const b = boot({ token: 'valid-token', fetchMode: 'ok' });
    b.run('AUTH.init()');
    await flushMicro();
    await b.advance(0);
    check('توکن معتبر: صفحه بازی نمایش داده می‌شود', b.display('gameApp') === 'flex', b.display('gameApp'));
    check('توکن معتبر: اسپلش مخفی می‌شود', b.display('splash') === 'none', b.display('splash'));
  }

  console.log('\n=== ۳) توکن خراب / خطای fetch ===');
  {
    const b = boot({ token: 'bad-token', fetchMode: 'err' });
    b.run('AUTH.init()');
    await flushMicro();
    await b.advance(600);
    check('توکن خراب: از localStorage پاک می‌شود', b.store.get('fm_token') == null, b.store.get('fm_token'));
    check('توکن خراب: فرم ورود می‌آید', b.display('auth') === 'flex', b.display('auth'));
  }

  console.log('\n=== ۴) شبکه معلق (fetch هرگز پاسخ نمی‌دهد) ===');
  {
    const b = boot({ token: 'stuck-token', fetchMode: 'hang' });
    b.run('AUTH.init()');
    await flushMicro();
    const hasDeadline = b.pendingDelays().some(d => d >= 7500);
    check('شبکه معلق: مهلت ۸ ثانیه‌ای ثبت شد', hasDeadline, b.pendingDelays().join(','));
    check('شبکه معلق: قبل از مهلت روی اسپلش می‌ماند',
      b.display('splash') !== 'none' && b.display('auth') === 'none',
      `splash=${b.display('splash')} auth=${b.display('auth')}`);
    /* اگر مهلتی ثبت نشده باشد (باگ برگشته) advance هیچ‌چیز را جلو
       نمی‌برد و assertions بعدی فوراً رد می‌شوند — تست گیر نمی‌کند. */
    await b.advance(8000);
    await b.advance(600);
    check('شبکه معلق: بعد از مهلت فرم ورود می‌آید',
      b.display('auth') === 'flex' && b.display('splash') === 'none',
      `splash=${b.display('splash')} auth=${b.display('auth')}`);
    check('شبکه معلق: توکن پاک می‌شود', b.store.get('fm_token') == null, b.store.get('fm_token'));
  }

  clearTimeout(watchdog);
  console.log('\n' + '─'.repeat(52));
  if (!failed) console.log(`🎉 اسپلش دیگر گیر نمی‌کند — ${passed} بررسی موفق.`);
  else console.log(`⚠️  ${failed} بررسی ناموفق (${passed} موفق).`);
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('خطای غیرمنتظره در تست اسپلش:', e);
  process.exit(1);
});
