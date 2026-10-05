/* ============================================================
   league-core.js — هسته‌ی خالص لیگ: یک کد، دو محیط (کلاینت + سرور)
   ------------------------------------------------------------
   این فایل عمداً به هیچ چیز وابسته نیست: نه state، نه DOM، نه
   توابع کمکی. فقط ریاضیات لیگ است:

     • هش (FNV-1a) — عیناً همان الگوریتم engine.js ⇒ تست parity
     • ترتیب و برنامه‌ی مسابقات (round-robin قطعی)
     • seed هر مسابقه
     • جدول و مرتب‌سازی

   چون سرور همین فایل را لود می‌کند، «برنامه و جدول کلاینت» همیشه
   با «برنامه و جدول سرور» یکی است ⇒ نتیجه‌ی سرور قابل بازتولید
   روی دستگاه کاربر و برعکس.

   قواعد قطعیت (مهم برای سازگاری بین دستگاه‌ها):
   • مقایسه‌ی نام‌ها همیشه بایتی است (`<`), نه localeCompare
   • هیچ‌جا به Math.random و Date وابسته نیست
   ============================================================ */
const LEAGUE_CORE_VERSION = 1;

/* همان تابع هش engine.js (FNV-1a 32-bit) — عیناً، تا نتیجه یکی باشد */
function leagueHash(str){
  let h = 2166136261 >>> 0;
  const s = String(str);
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function leagueByteCompare(a, b){
  const x = String(a), y = String(b);
  return x < y ? -1 : (x > y ? 1 : 0);
}
/* شناسه‌ی لیگ: از نام لیگ + نام باشگاه‌ها (مرتب‌شده) ⇒ مستقل از ترتیب ورودی */
function leagueIdFromNames(name, names){
  const sorted = (names || []).map(String).slice().sort(leagueByteCompare);
  return leagueHash('league:' + String(name) + '|' + sorted.join('|') + '|' + LEAGUE_CORE_VERSION);
}
function leagueSortNames(names){ return (names || []).map(String).slice().sort(leagueByteCompare); }

/* برنامه‌ی مسابقات round-robin برای n تیم: (n-1) دور برای زوج، n دور برای فرد */
function leagueFixturesFromCount(n){
  const idx = [];
  for(let i=0;i<n;i++) idx.push(i);
  if(n % 2) idx.push(-1);                 /* BYE */
  const N = idx.length, rounds = [];
  for(let r=0; r<N-1; r++){
    const pairs = [];
    for(let i=0;i<N/2;i++){
      const a = idx[i], b = idx[N-1-i];
      if(a === -1 || b === -1) continue;
      pairs.push((r % 2) ? [b, a] : [a, b]);
    }
    rounds.push(pairs);
    idx.splice(1, 0, idx.pop());           /* چرخش دایره‌ای */
  }
  return rounds;
}
function leagueRoundCountFromCount(n){ return leagueFixturesFromCount(n).length; }

/* seed هر مسابقه: از شناسه‌ی لیگ + دور + نام دو تیم (مرتب‌شده)
   ⇒ قابل محاسبه برای همه، ولی قابل «انتخاب» توسط هیچ‌کس */
function leagueSeedFrom(leagueId, round, nameA, nameB){
  const x = String(nameA), y = String(nameB);
  const [p, q] = x < y ? [x, y] : [y, x];
  return leagueHash('league:' + leagueId + ':' + Number(round) + ':' + p + '|' + q);
}
function leagueKeyOf(round, hi, ai){ return Number(round) + ':' + Number(hi) + ':' + Number(ai); }

/* جدول از نتایج: results = { 'round:hi:ai': {h, a} } و names بر اساس ایندکس عضو */
function leagueTableFromNames(names, results){
  const rows = (names || []).map((c, i)=>({
    i, name: c, played:0, won:0, drawn:0, lost:0, gf:0, ga:0, gd:0, pts:0
  }));
  Object.keys(results || {}).forEach(k=>{
    const r = results[k];
    if(!r) return;
    const H = rows[r.hi], A = rows[r.ai];
    if(!H || !A) return;
    H.played++; A.played++;
    H.gf += r.h; H.ga += r.a;
    A.gf += r.a; A.ga += r.h;
    if(r.h > r.a){ H.won++; A.lost++; H.pts += 3; }
    else if(r.h < r.a){ A.won++; H.lost++; A.pts += 3; }
    else { H.drawn++; A.drawn++; H.pts++; A.pts++; }
  });
  rows.forEach(r=> r.gd = r.gf - r.ga);
  rows.sort((a,b)=> b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || leagueByteCompare(a.name, b.name));
  rows.forEach((r,i)=> r.rank = i + 1);
  return rows;
}

/* آیا همه‌ی مسابقات این دور بازی شده‌اند؟ */
function leagueRoundComplete(count, results, round){
  const rounds = leagueFixturesFromCount(count);
  if(!rounds[round]) return false;
  return rounds[round].every(([hi, ai])=> results && results[leagueKeyOf(round, hi, ai)]);
}
/* اولین دورِ ناتمام (یا null) */
function leagueNextRoundFrom(count, results){
  const rounds = leagueFixturesFromCount(count);
  for(let r=0;r<rounds.length;r++){
    if(!rounds[r].every(([hi, ai])=> results && results[leagueKeyOf(r, hi, ai)])) return r;
  }
  return null;
}

/* خروجی برای مرورگر (اسکریپت کلاسیک) و برای Node (سرور) */
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    LEAGUE_CORE_VERSION, leagueHash, leagueByteCompare, leagueSortNames,
    leagueIdFromNames, leagueFixturesFromCount, leagueRoundCountFromCount,
    leagueSeedFrom, leagueKeyOf, leagueTableFromNames,
    leagueRoundComplete, leagueNextRoundFrom
  };
}
