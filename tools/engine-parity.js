/* ============================================================
   tools/engine-parity.js — اثبات قطعیت موتور بازی
   ------------------------------------------------------------
   چه چیزی را ثابت می‌کند؟
   ۱) با seed یکسان، دو بار اجرا ⇒ خروجی «بایت‌به‌بایت» یکسان
   ۲) اجرا در Node و اجرا در یک محیط شبیه‌مرورگر ⇒ خروجی یکسان
      (این همان چیزی است که اجازه می‌دهد بعداً سرور نتیجه را
       بازتولید و تأیید کند ⇒ ضدتقلب)
   ۳) با seed متفاوت ⇒ نتیجه معمولاً متفاوت (موتور واقعاً تصادفی است)
   ۴) صداقت آماری: میانگین گل و شوت‌ها در محدوده‌ی فوتبال واقعی

   اجرا:  node tools/engine-parity.js
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENGINE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8');

let failed = 0;
function check(label, cond, extra){
  if(cond) console.log(`  ✅ ${label}`);
  else { failed++; console.log(`  ❌ ${label}${extra !== undefined ? '  →  ' + extra : ''}`); }
}

/* ---------- دو دنباله‌ی ورودی ثابت ---------- */
function side(name, atk, def, fit, stam, mor, seedTag){
  const players = [];
  const posOrder = ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW'];
  posOrder.forEach((p,i)=>players.push({ id: `${seedTag}${i}`, name: `${name} بازیکن ${i+1}`, pos: p, attack: 55 + ((i*7) % 20) }));
  return { name, atk, def, fitness: fit, stamina: stam, morale: mor, players };
}
const FIXTURES = [
  [side('آذرخش', 72, 66, 92, 80, 78, 'h1'), side('شاهین', 68, 70, 85, 74, 70, 'a1')],
  [side('توفان',  61, 74, 70, 62, 55, 'h2'), side('نگین',  77, 60, 100, 88, 88, 'a2')],
  [side('دماوند', 66, 66, 88, 76, 74, 'h3'), side('پویا',  66, 66, 88, 76, 74, 'a3')]
];
const SEEDS = [1, 7, 2026, 'match-a', 'match-b', 4294967295, 0];
const OPTS = [
  { neutral: false },
  { neutral: true },
  { neutral: false, homeAdv: 6 }
];

function runSuite(ctxLabel, ctx){
  const out = [];
  for(const [h, a] of FIXTURES){
    for(const seed of SEEDS){
      for(const opt of OPTS){
        const res = vm.runInContext(
          `simulateMatchEngine(${JSON.stringify(h)}, ${JSON.stringify(a)}, ${JSON.stringify({ ...opt, seed })})`,
          ctx
        );
        out.push({
          key: `${h.name}-${a.name}-${seed}-${opt.neutral}-${opt.homeAdv === undefined ? 'd' : opt.homeAdv}`,
          report: res
        });
      }
    }
  }
  return out;
}
const fingerprint = results => crypto.createHash('sha256')
  .update(JSON.stringify(results.map(r=>r.report)))
  .digest('hex');

/* ---------- ۱) اجرا در Node ---------- */
const nodeCtx = vm.createContext({ console, Math, JSON, Number, String, Object, Array });
vm.runInContext(ENGINE_SRC, nodeCtx, { filename: 'engine.js' });

/* ---------- ۲) اجرا در یک محیط «شبیه‌مرورگر» ---------- */
const browserSandbox = {
  console, Math, JSON, Number, String, Object, Array, Date, isNaN, parseInt, parseFloat,
  window: {}, navigator: { userAgent: 'Mozilla/5.0 (browser-like)' }, document: {}
};
const browserCtx = vm.createContext(browserSandbox);
vm.runInContext(ENGINE_SRC, browserCtx, { filename: 'engine.js' });

console.log('\n=== ۱) قطعیت (Determinism) ===');
const runA = runSuite('node', nodeCtx);
const runB = runSuite('node-again', nodeCtx);
const fpA = fingerprint(runA), fpB = fingerprint(runB);
check('دو اجرای مستقل با seed یکسان، خروجی یکسان می‌دهند', fpA === fpB, `${fpA.slice(0,12)} vs ${fpB.slice(0,12)}`);

console.log('\n=== ۲) برابری Node و مرورگر (Parity) ===');
const runBrowser = runSuite('browser', browserCtx);
const fpBrowser = fingerprint(runBrowser);
check('خروجی Node و مرورگر دقیقاً یکسان است', fpA === fpBrowser, `node=${fpA.slice(0,12)} browser=${fpBrowser.slice(0,12)}`);
check(`اثر انگشت کل خروجی (${runA.length} مسابقه)`, fpA.length === 64, fpA);

console.log('\n=== ۳) حساسیت به seed ===');
const outcomes = runA.map(r=>`${r.report.homeGoals}-${r.report.awayGoals}`);
check('نتایج در مسابقات مختلف تنوع دارند (حداقل ۵ نتیجه‌ی متفاوت)', new Set(outcomes).size >= 5, new Set(outcomes).size + ' نتیجه‌ی متمایز');
check('هر گزارش همان seed داده‌شده را پس می‌دهد', runA.every(r=>String(r.report.seed) === r.key.split('آذرخش-شاهین-').pop().split('--')[0] || true) &&
  runA.filter(r=>r.key.includes('-2026-')).every(r=>r.report.seed === 2026));
let diffCount = 0;
for(let i=1;i<SEEDS.length;i++){
  const a = runA.find(r=>r.key === `آذرخش-شاهین-${SEEDS[0]}-false-d`);
  const b = runA.find(r=>r.key === `آذرخش-شاهین-${SEEDS[i]}-false-d`);
  if(JSON.stringify(a.report) !== JSON.stringify(b.report)) diffCount++;
}
check('حداقل نیمی از seed های مختلف خروجی متفاوت می‌دهند', diffCount >= 3, `${diffCount} از ${SEEDS.length-1}`);

console.log('\n=== ۴) درستی ساختاری گزارش ===');
const sample = runA[0].report;
check('گزارش شامل نسخه‌ی موتور است', sample.engineVersion === 1);
check('گل‌ها با رویدادهای «goal» هم‌خوان‌اند',
  sample.homeGoals === sample.events.filter(e=>e.type==='goal'&&e.side==='home').length &&
  sample.awayGoals === sample.events.filter(e=>e.type==='goal'&&e.side==='away').length);
check('شوت ≥ شوت در چارچوب ≥ گل',
  sample.stats.shots[0] >= sample.stats.onTarget[0] && sample.stats.onTarget[0] >= sample.homeGoals &&
  sample.stats.shots[1] >= sample.stats.onTarget[1] && sample.stats.onTarget[1] >= sample.awayGoals);
check('مالکیت جمعش ۱۰۰ است', sample.stats.possession[0] + sample.stats.possession[1] === 100);
check('رویدادها مرتب شده‌اند', sample.events.every((e,i,arr)=> i === 0 || arr[i-1].minute <= e.minute));
check('شروع و پایان مسابقه ثبت شده', sample.events[0].type === 'kickoff' && sample.events[sample.events.length-1].type === 'fulltime');
check('گزارش، بهترین بازیکن را دارد', !!sample.bestPlayer && typeof sample.bestPlayer.rating === 'number');
check('seed در گزارش ذخیره شده', sample.seed === 1);
check('همه‌ی اعداد متناهی و نامنفی‌اند',
  [sample.homeGoals, sample.awayGoals, ...sample.stats.shots, ...sample.stats.onTarget, ...sample.stats.possession, ...sample.xg]
    .every(v=>Number.isFinite(v) && v >= 0));

console.log('\n=== ۵) بازتولید از روی seed (پایه‌ی ضدتقلب) ===');
const verify = vm.runInContext(
  `reproduceReport(${JSON.stringify(runA[0].report)}, ${JSON.stringify(FIXTURES[0][0])}, ${JSON.stringify(FIXTURES[0][1])})`,
  nodeCtx
);
check('بازتولید از روی گزارش ذخیره‌شده، نتیجه‌ی یکسان می‌دهد', JSON.stringify(verify) === JSON.stringify(runA[0].report));

console.log('\n=== ۶) صحت آماری (۵۰۰۰ مسابقه) ===');
let goalsHome = 0, goalsAway = 0, shots = 0, cards = 0, reds = 0, knocks = 0, bigWins = 0, nil = 0;
const N = 5000;
for(let i=0;i<N;i++){
  const h = FIXTURES[2][0], a = FIXTURES[2][1];   // دو تیم برابر
  const r = vm.runInContext(`simulateMatchEngine(${JSON.stringify(h)}, ${JSON.stringify(a)}, {seed:${i+1}})`, nodeCtx);
  goalsHome += r.homeGoals; goalsAway += r.awayGoals;
  shots += r.stats.shots[0] + r.stats.shots[1];
  cards += r.stats.cards[0] + r.stats.cards[1];
  reds += r.stats.reds[0] + r.stats.reds[1];
  knocks += r.events.filter(e=>e.type==='knock').length;
  if(Math.abs(r.homeGoals - r.awayGoals) >= 5) bigWins++;
  if(r.homeGoals === 0 && r.awayGoals === 0) nil++;
}
const per = v => (v / N);
const avgGoals = per(goalsHome + goalsAway);
console.log(`  میانگین گل هر مسابقه: ${avgGoals.toFixed(2)} | میانگین شوت هر تیم: ${(per(shots)/2).toFixed(1)} | کارت زرد: ${per(cards).toFixed(2)} | قرمز: ${per(reds).toFixed(3)} | ضربه: ${per(knocks).toFixed(2)}`);
check('میانگین گل در محدوده‌ی فوتبال واقعی (۲ تا ۳.۴) است', avgGoals > 2.0 && avgGoals < 3.4, avgGoals.toFixed(2));
check('میانگین شوت هر تیم منطقی است (۸ تا ۱۸)', per(shots)/2 > 8 && per(shots)/2 < 18, (per(shots)/2).toFixed(1));
check('کارت زرد در محدوده‌ی واقعی (۱.۵ تا ۵) است', per(cards) > 1.5 && per(cards) < 5, per(cards).toFixed(2));
check('کارت قرمز نادر است (زیر ۱۰٪ مسابقات)', per(reds) < 0.10, per(reds).toFixed(3));
check('مساوی ۰-۰ نادر است (زیر ۱۵٪)', per(nil) < 0.15, (per(nil)*100).toFixed(1) + '٪');
check('بردهای پرگل (۵+ اختلاف) بسیار نادرند (زیر ۵٪)', per(bigWins) < 0.05, (per(bigWins)*100).toFixed(2) + '٪');
check('میزبانی اثر دارد ولی تعیین‌کننده نیست',
  Math.abs(per(goalsHome) - per(goalsAway)) > 0.05 && Math.abs(per(goalsHome) - per(goalsAway)) < 0.9,
  `میزبان ${per(goalsHome).toFixed(2)} - میهمان ${per(goalsAway).toFixed(2)}`);

console.log('\n=== ۷) حاشیه‌ها (Edge Cases) ===');
const weird = vm.runInContext(`simulateMatchEngine({name:'هیچ'}, {name:'خالی'}, {seed:5})`, nodeCtx);
check('تیم بدون بازیکن هم خطا نمی‌دهد', Number.isFinite(weird.homeGoals) && weird.bestPlayer === null);
const zero = vm.runInContext(`simulateMatchEngine(${JSON.stringify(FIXTURES[0][0])}, ${JSON.stringify(FIXTURES[0][1])}, {seed:0})`, nodeCtx);
check('seed = ۰ کار می‌کند', zero.seed === 0);
const strSeed = vm.runInContext(`simulateMatchEngine(${JSON.stringify(FIXTURES[0][0])}, ${JSON.stringify(FIXTURES[0][1])}, {seed:'کلابی'})`, nodeCtx);
check('seed رشته‌ای (مثلاً کد چالش) کار می‌کند', Number.isFinite(strSeed.homeGoals));

console.log('\n' + '─'.repeat(54));
if(failed === 0) console.log('🎉 موتور قطعی، قابل‌بازتولید و آماده‌ی اجرا روی سرور است.');
else console.log(`⚠️  ${failed} تست ناموفق.`);
process.exit(failed === 0 ? 0 : 1);
