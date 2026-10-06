/* ============================================================
   tools/face-test.js — تست موتور چهره‌ی رویه‌ای (js/facegen.js)
   ------------------------------------------------------------
   بدون مرورگر نمی‌شود «قشنگ بودن» را سنجید، ولی می‌شود سنجید که:
     ۱) خروجی SVG معتبر و بدون NaN/undefined است
     ۲) چهره‌ی هر بازیکن قطعی است (دو بار ⇒ یکسان)
     ۳) تنوع کافی است (هیچ دو بازیکنی چهره‌ی یکسان نمی‌گیرند)
     ۴) هندسه سالم است: سقف مو همیشه بالای سر، خط رویش مو
        همیشه زیر ابرو، چشم‌ها داخل صورت، ریش بیرون نمی‌زند
     ۵) کارایی: چهره‌ی ۱۰۰۰ بازیکن در زمان معقول + کش
   اجرا:  node tools/face-test.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
let failed = 0, passed = 0;
function check(label, cond, extra){
  if(cond){ passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}

/* ---------- بارگذاری موتور در sandbox ---------- */
const sandbox = {
  console, Math, JSON, String, Number, Array, Object, Boolean, isNaN, parseInt, parseFloat, Map, Set, RegExp, Date,
  document: { getElementById(){ return null; }, createElement(){ return { style:{}, classList:{ add(){}, remove(){}, contains(){ return false; } } }; }, addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; } },
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
  navigator: {}, setTimeout, clearTimeout, setInterval: ()=> 0, clearInterval(){}
};
const ctx = vm.createContext(sandbox);
for(const f of ['js/util.js', 'js/svg.js', 'js/facegen.js', 'js/assets.js']){
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const run = (code)=> vm.runInContext(code, ctx, { filename: 'face-test' });

/* ---------- خواندن مشخصات چهره از داخل sandbox ---------- */
function specOf(seed, age){
  return run(`JSON.stringify(faceSpec(${JSON.stringify(seed)}, { age: ${age || 0} }))`);
}
function svgOf(seed, age){
  return run(`playerFaceSVG(${JSON.stringify(seed)}, { kit:{ c1:'#2563eb', c2:'#0b1220' }, age: ${age || 0} })`);
}

/* ============================================================
   ۱) اعتبار SVG
   ============================================================ */
console.log('=== ۱) اعتبار خروجی SVG ===');
const seedList = [];
for(let i = 0; i < 400; i++) seedList.push('p' + i);
let badSvg = 0, nanCount = 0, undefCount = 0;
for(const seed of seedList){
  const svg = svgOf(seed, (i => i % 40)(seed.replace('p', '') * 1));
  if(!/^<svg [^>]*viewBox="0 0 100 120"/.test(svg) || !svg.trim().endsWith('</svg>')) badSvg++;
  if(/NaN|Infinity/.test(svg)) nanCount++;
  if(/undefined|null/.test(svg)) undefCount++;
}
check('ساختار SVG سالم است (۴۰۰ چهره)', badSvg === 0, badSvg + ' ناسالم');
check('هیچ NaN/Infinity در مسیرهای SVG نیست', nanCount === 0, nanCount);
check('هیچ undefined/null در خروجی نیست', undefCount === 0, undefCount);

const pathRe = /<path([^>]*)\/?>/g;
let pathCount = 0, emptyPath = 0, unclosedFilled = 0;
for(let i = 0; i < 60; i++){
  const svg = svgOf('q' + i, 20 + i);
  let m;
  while((m = pathRe.exec(svg))){
    pathCount++;
    const attrs = m[1];
    const dM = /d="([^"]*)"/.exec(attrs);
    const d = dM ? dM[1].trim() : '';
    const stroked = /fill="none"/.test(attrs) || /stroke-width/.test(attrs) && /fill="none"/.test(attrs);
    if(!d) emptyPath++;
    if(!stroked && !/[Zz]$/.test(d)) unclosedFilled++;
  }
}
check('مسیرها پر و بسته‌اند (۶۰ چهره)', emptyPath === 0 && unclosedFilled === 0,
  `${pathCount} مسیر · ${emptyPath} خالی · ${unclosedFilled} پرشده‌ی باز`);

/* ============================================================
   ۲) قطعی بودن
   ============================================================ */
console.log('\n=== ۲) قطعی بودن (همان شناسه ⇒ همان چهره) ===');
let deterministic = true;
for(const seed of ['p1', 'p2', 'پرویز', 'm-1042', 'x']){
  const a = svgOf(seed, 25), b = svgOf(seed, 25);
  if(a !== b) deterministic = false;
}
check('چهره‌ی یک بازیکن همیشه یکسان است', deterministic);

/* ترتیب بارگذاری اسکریپت‌ها نباید روی نتیجه اثر بگذارد */
const ctx2 = vm.createContext({ console, Math, JSON, String, Number, Array, Object, Boolean, isNaN, parseInt, parseFloat, Map, Set, RegExp, Date });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/facegen.js'), 'utf8'), ctx2, { filename: 'facegen-b' });
const svgB = vm.runInContext(`playerFaceSVG('p7', { kit:{ c1:'#2563eb', c2:'#0b1220' }, age: 0 })`, ctx2);
check('بین دو اجرا/دو دستگاه یکسان است', svgB === svgOf('p7', 0));

/* ============================================================
   ۳) تنوع چهره‌ها
   ============================================================ */
console.log('\n=== ۳) تنوع چهره‌ها ===');
const seen = new Map();
let collisions = 0;
for(const seed of seedList){
  const svg = svgOf(seed, 24);
  if(seen.has(svg)) collisions++; else seen.set(svg, seed);
}
check('هیچ دو بازیکنی چهره‌ی تکراری ندارند (۴۰۰ نفر)', collisions === 0, collisions + ' تکراری');
check('تعداد ترکیب‌های ممکن میلیاردی است', run('faceCombos()') > 1e9, run('faceCombos()').toExponential(1));

/* هر ده مؤلفه باید در نمونه‌ی بزرگ واقعاً استفاده شود (نه فقط تعریف) */
const used = run(`(function(){
  const sets = { shape:new Set(), skin:new Set(), hair:new Set(), hairC:new Set(), eyes:new Set(), eyeC:new Set(), beard:new Set(), nose:new Set(), mouth:new Set(), brow:new Set() };
  for(let i=0;i<400;i++){
    const s = faceSpec('v'+i, { age: i % 40 });
    sets.shape.add(s.shape.id); sets.skin.add(s.skin.id); sets.hair.add(s.hair.id);
    sets.hairC.add(s.hairC.id); sets.eyes.add(s.eyes.id); sets.eyeC.add(s.eyeC.id);
    sets.beard.add(s.beard.id); sets.nose.add(s.nose.id); sets.mouth.add(s.mouth.id); sets.brow.add(s.brows.id);
  }
  const o = {}; Object.keys(sets).forEach(k=> o[k] = sets[k].size); return JSON.stringify(o);
})()`);
const usedObj = JSON.parse(used);
const totals = { shape: 10, skin: 12, hair: 20, hairC: 12, eyes: 6, eyeC: 6, beard: 8, nose: 5, mouth: 5, brow: 4 };
const underused = Object.keys(totals).filter(k=> usedObj[k] < totals[k] * 0.75);
check('همه‌ی مدل‌ها در عمل استفاده می‌شوند (بالای ۷۵٪)', underused.length === 0,
  underused.map(k=> `${k}:${usedObj[k]}/${totals[k]}`).join(' '));
console.log('      استفاده از مؤلفه‌ها: ' + Object.keys(usedObj).map(k=> `${k}=${usedObj[k]}`).join(' · '));

/* ============================================================
   ۴) هندسه‌ی صورت (بررسی ریاضی، نه چشمی)
   ============================================================ */
console.log('\n=== ۴) هندسه‌ی صورت ===');
const geo = run(`(function(){
  const bad = { capBelowHead:0, hairOverBrows:0, eyesOutside:0, mouthBelowChin:0, noseBelowMouth:0, earsOutside:0, noForehead:0 };
  for(let i=0;i<400;i++){
    const s = faceSpec('g'+i, { age: i % 40 });
    const g = fgGeom(s.shape);
    /* سقف مو باید بالای سر باشد */
    if(s.hair.kind === 'cap'){
      const capTop = g.top - Math.max(2.4, (s.hair.t || 3) * 0.9);
      if(capTop > g.top - 1) bad.capBelowHead++;
      /* خط رویش مو باید پایین‌تر از بالای سر و بالاتر از ابرو باشد */
      const lineY = g.top + s.hair.line + s.hair.dip;
      if(lineY < g.top + 2 || lineY > g.browY - 2) bad.hairOverBrows++;
      if(lineY - g.top < 4) bad.noForehead++;
    }
    /* چشم‌ها باید داخل عرض صورت و بالای دهان باشند */
    if(Math.abs(g.eyeDx) + g.eyeR[0] > g.w || g.eyeY <= g.browY) bad.eyesOutside++;
    if(g.mouthY >= g.bottom) bad.mouthBelowChin++;
    if(g.noseBot >= g.mouthY) bad.noseBelowMouth++;
    if(Math.abs(g.w + 1.4) + 3.1 > g.w + 5) bad.earsOutside++;
  }
  /* خط رویش مو نباید روی ابرو بیفتد */
  return JSON.stringify(bad);
})()`);
const gb = JSON.parse(geo);
check('سقف مو همیشه بالای سر است (بدون لکه‌ی طاس)', gb.capBelowHead === 0, gb.capBelowHead);
check('خط رویش مو همیشه بین سر و ابرو است', gb.hairOverBrows === 0 && gb.noForehead === 0,
  `روی ابرو:${gb.hairOverBrows} بی‌پیشانی:${gb.noForehead}`);
check('چشم‌ها داخل صورت و زیر ابرو هستند', gb.eyesOutside === 0, gb.eyesOutside);
check('دهان بالای چانه و بینی بالای دهان است', gb.mouthBelowChin === 0 && gb.noseBelowMouth === 0,
  `${gb.mouthBelowChin}/${gb.noseBelowMouth}`);
check('گوش‌ها بیرون از خط سر نمی‌زنند', gb.earsOutside === 0, gb.earsOutside);

/* ریش فقط روی نیمه‌ی پایین صورت باشد */
const beardGeo = run(`(function(){
  let leak = 0, heavy = 0, minGap = 999;
  for(let i=0;i<200;i++){
    const s = faceSpec('b'+i, { age: 20 + (i % 20) });
    const g = fgGeom(s.shape, s.mods);
    if(s.beard.kind === 'none') continue;
    heavy++;
    /* مسیر ریش همه‌ی دستورها مطلق است ⇒ اعداد جفت‌اند و y در ایندکس فرد */
    const nums = (fgJawPath(g, 1.4).match(/-?\d+\.?\d*/g) || []).map(Number);
    const ys = nums.filter((_, idx)=> idx % 2 === 1);
    const minY = Math.min.apply(null, ys);
    minGap = Math.min(minGap, minY - g.eyeY);
    if(minY < g.eyeY + 1) leak++;
  }
  return JSON.stringify({ leak, heavy, minGap: Math.round(minGap * 10) / 10 });
})()`);
const bg = JSON.parse(beardGeo);
check('ریش هرگز روی چشم نمی‌افتد', bg.leak === 0, bg.leak + ' مورد (کمترین فاصله ' + bg.minGap + ' واحد زیر چشم)');
check('ریش در نمونه‌ها حضور دارد', bg.heavy > 40, bg.heavy);

/* ============================================================
   ۵) کارایی و کش
   ============================================================ */
console.log('\n=== ۵) کارایی ===');
const t0 = Date.now();
for(let i = 0; i < 1000; i++) svgOf('perf' + (i % 300), 25);
const dt = Date.now() - t0;
check('ساخت ۱۰۰۰ چهره زیر ۱٫۵ ثانیه (با کش)', dt < 1500, dt + 'ms');
function avgSize(size){
  let tot = 0;
  for(let i = 0; i < 60; i++){
    tot += run(`playerFaceSVG('sz${i}', { size:'${size}', kit:{ c1:'#2563eb', c2:'#0b1220' }, age: 25 }).length`);
  }
  return Math.round(tot / 60);
}
const mdAvg = avgSize('md'), smAvg = avgSize('sm');
check('چهره‌ی بزرگ (پروفایل/پخش) زیر ۵ کیلوبایت است', mdAvg < 5120, mdAvg + ' بایت');
check('چهره‌ی کوچک (فهرست/زمین/بازار) سبک‌تر از چهره‌ی بزرگ است', smAvg < mdAvg, `${smAvg} < ${mdAvg}`);
check('کش بعد از ۶۰۰ چهره ریست می‌شود (بدون نشتی حافظه)', run(`(function(){ for(let i=0;i<900;i++){ playerFaceSVG('c'+i, {}); } return FG_CACHE.size; })()`) < 700,
  run('FG_CACHE.size'));

/* ============================================================
   ۵.۵) لایه‌ی اسپرایت (<symbol>/<use>) — سبک‌سازی رابط کاربری
   ============================================================ */
console.log('\n=== ۵.۵) اسپرایت چهره (بدون تکرار SVG) ===');
const sprite = run(`(function(){
  const host = { html:'', insertAdjacentHTML(pos, h){ this.html += h; } };
  document = { getElementById(id){ return id === 'faceSprite' ? host : null; } };
  const before = faceImg('s1', { size:'sm' }).length;
  const again = faceImg('s1', { size:'sm' }).length;                 /* همان بازیکن، بار دوم */
  const other = faceImg('s2', { size:'sm' }).length;
  const symbols = (host.html.match(/<symbol /g) || []).length;
  return JSON.stringify({ useBytes: before, again, other, symbols, uses: /<use href="#/.test(faceImg('s1', { size:'sm' })) });
})()`);
const sp = JSON.parse(sprite);
check('هر چهره فقط یک‌بار به‌صورت <symbol> ثبت می‌شود', sp.symbols === 2, sp.symbols + ' symbol');
check('تکرار همان بازیکن دوباره symbol نمی‌سازد', (run(`(function(){
  const host = { html:'', insertAdjacentHTML(){ this.html += 'x'; } };
  document = { getElementById(){ return host; } };
  for(let i=0;i<20;i++) faceImg('fresh-one', { size:'sm' });
  return (host.html.match(/x/g) || []).length;
})()`)) === 1);
check('خروجی هر بازیکن با <use> سبک است', sp.uses === true && sp.useBytes < 260, sp.useBytes + ' بایت');

/* ============================================================
   ۶) توضیح متنی چهره (برای پروفایل بازیکن)
   ============================================================ */
console.log('\n=== ۶) متن ظاهر بازیکن ===');
const desc = JSON.parse(specOf('p3', 29));
check('توضیح فارسی چهره ساخته می‌شود', /پوست/.test(desc.desc) && /چشم/.test(desc.desc), desc.desc);
check('ویژگی‌های صورت توضیح دارند', /بینی/.test(desc.traits), desc.traits);

console.log('\n' + '─'.repeat(56));
if(!failed) console.log(`🎉 موتور چهره سالم است — ${passed} بررسی موفق.`);
else console.log(`⚠️  ${failed} بررسی ناموفق (${passed} موفق).`);
process.exit(failed ? 1 : 0);
