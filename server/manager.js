/* ============================================================
   server/manager.js — لایه‌ی «مدیر باشگاه» سمت سرور
   ------------------------------------------------------------
   چرا این فایل؟ در گام ۲ سرور فقط «لیگ» را می‌شناخت و ترکیب را
   از کلاینت می‌گرفت. برای یک بازی موبایلِ آنلاینِ واقعی، سه چیز
   باید سمت سرور باشد تا قابل اعتماد و چند‌دستگاهی بماند:

     ۱) فهرست بازیکنان (تیم مالِ سرور است، نه مرورگر)
     ۲) اقتصاد: کیف پول، خرید/فروش، پاداش هفتگی و جایزه‌ی فصل
     ۳) پیشرفت: آمادگی/روحیه/رکورد و اخبار باشگاه

   همه‌ی محاسبات اینجا «قطعی» (deterministic) است: با ورودی یکسان
   خروجی یکسان ⇒ هم بازار برای همه یکی است، هم می‌شود آن را تست کرد.
   ============================================================ */
const core = require('../js/league-core.js');

/* ---------- ثابت‌های اقتصاد ---------- */
const START_WALLET   = 8500000;
const MAX_SQUAD      = 22;
const MIN_SQUAD      = 11;
const WIN_BONUS      = 450000;
const DRAW_BONUS     = 220000;
const LOSS_BONUS     = 90000;
const GATE_BONUS     = 130000;   /* درآمد بلیت (تیم میزبان) */
const WEEK_TRAINING  = 150000;   /* هزینه‌ی ثابت هفتگی باشگاه */
const SELL_RATE      = 0.85;     /* کسر کمیسیون فروش */
const RANK_PRIZE     = [6000000, 4000000, 2600000, 1600000, 1000000, 700000, 450000, 300000];

const FIRST_NAMES = ['آرمین','سهراب','بهراد','کیان','پارسا','دانیال','رادین','آریا','نیما','بردیا','سام','شایان','امیرعلی','ماهان','یاشار','سینا','اردلان','رستم','فرزین','کاوه','رامتین','بابک','هومن','آرش','دلاور','کوروش','سپهر','نویان','فرهاد','سالار'];
const LAST_NAMES  = ['رستمی','نوروزی','کیانی','صدر','تهرانی','فرهمند','اکبری','جاوید','نیک‌نام','صالحی','مرادی','قاسمی','احمدی‌نیا','دلفانی','شمس','پارسا','عزیزی','کاویانی','رهنما','سلطانی','بیات','کمالی','راد','نجفی','زارع','شریفی','توکلی','مهدوی'];
const CLUBS       = ['توفان جنوب','شاهین شهر','پویا اسپورت','آذرخش البرز','سپاهان نوین','خیبر پارس','دماوند یونایتد','نگین کویر','ستاره‌ی بندر','پرشین ولف','کاسپین','زاگرس','الوند','کارون'];
/* ترکیب شروع: ۱۱ نفر اصلی + ۳ ذخیره (تا کاربر همان اول نیمکت داشته باشد) */
const POSITIONS   = ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW','DF','MF','FW'];

/* ---------- پروفایل و اخبار ---------- */
function ensureProfile(player){
  if(player.wallet === undefined) player.wallet = START_WALLET;
  if(!player.kit) player.kit = {};                            /* رنگ و الگوی پیراهن (کلاینت پر می‌کند) */
  if(!player.crest) player.crest = {};                        /* شکل و رنگ آرم */
  if(!player.record) player.record = { played:0, won:0, drawn:0, lost:0, gf:0, ga:0, titles:0, seasons:0 };
  if(!Array.isArray(player.news)) player.news = [];
  if(!Array.isArray(player.marketBought)) player.marketBought = [];
  if(player.marketWeek === undefined) player.marketWeek = -1;
  return player;
}
function addNews(player, icon, title, text, type, extra){
  if(!player) return;
  player.news = player.news || [];
  player.news.unshift(Object.assign({
    id: 'n' + Date.now().toString(36) + Math.floor(Math.random()*1e4).toString(36),
    icon, title, text, type: type || 'info', at: Date.now()
  }, extra || {}));
  if(player.news.length > 40) player.news.length = 40;
}

/* ---------- ارزش بازیکن و قدرت اسکواد ---------- */
function playerValue(p){
  const atk = clampNum(p.attack, 40, 99);
  const age = clampNum(p.age || 24, 16, 40);
  const youth = age <= 21 ? 1.32 : age <= 24 ? 1.18 : age <= 28 ? 1.0 : age <= 31 ? 0.78 : 0.55;
  const base = Math.pow(Math.max(1, atk - 40), 2.05) * 9000 + 120000;
  return Math.max(150000, Math.round((base * youth) / 10000) * 10000);
}
function clampNum(v, a, b){ const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : a; }

const POS_WEIGHT = { GK: 0, DF: 0.85, MF: 1.0, FW: 1.05 };
/* قدرت حمله/دفاع اسکواد را سرور از خود بازیکنان حساب می‌کند
   ⇒ دیگر «عدد اعلامی کلاینت» معنا ندارد (ضدتقلب ساختاری). */
function squadStrength(squad){
  const players = (squad.players || []);
  const slots = (squad.slots || []).filter(Boolean);
  const byId = {};
  players.forEach(p=>{ byId[String(p.id)] = p; });
  const starters = slots.length === 11 ? slots.map(id=> byId[String(id)]).filter(Boolean) : players.slice(0, 11);
  const list = starters.length ? starters : players;
  if(!list.length) return { atk: 60, def: 58 };
  const gks = list.filter(p=> p.pos === 'GK');
  const outfield = list.filter(p=> p.pos !== 'GK');
  const gkOv = gks.length ? Math.max(...gks.map(p=> clampNum(p.attack, 30, 99))) : 55;
  const att = outfield.filter(p=> p.pos === 'FW' || p.pos === 'MF');
  const dfs = outfield.filter(p=> p.pos === 'DF' || p.pos === 'MF');
  const avg = arr => arr.length ? arr.reduce((s,p)=> s + clampNum(p.attack, 30, 99), 0) / arr.length : 55;
  const atkBoost = { attacking: 1.12, balanced: 1.0, defensive: 0.9 }[squad.style || 'balanced'] || 1;
  const defBoost = { attacking: 0.92, balanced: 1.0, defensive: 1.12 }[squad.style || 'balanced'] || 1;
  const formBoost = 1 + ((squad.formation === '4-3-3' ? 0.05 : squad.formation === '5-3-2' ? -0.04 : 0));
  const atk = Math.round(clampNum(avg(att) * 0.72 + avg(dfs) * 0.28 + 2, 30, 99) * atkBoost * (1 + formBoost / 2));
  const def = Math.round(clampNum(avg(dfs) * 0.62 + gkOv * 0.38, 30, 99) * defBoost * (1 - formBoost / 2));
  return { atk: clampNum(atk, 30, 99), def: clampNum(def, 30, 99) };
}
/* هر بار ترکیب/بازیکنان عوض شد، این را صدا بزن.
   نکته‌ی مهم: فقط برای اسکوادهای «مالکیت سرور» قدرت را از خود بازیکنان
   بازمحاسبه می‌کنیم. اسکواد قدیمیِ آپلودیِ بازی آفلاین، قدرت اعلامی خودش
   را نگه می‌دارد (آن مسیر در tools/server-test.js تست شده است). */
function recomputeSquad(squad){
  if(!squad) return squad;
  if(!Array.isArray(squad.slots) || squad.slots.length !== 11) squad.slots = (squad.players || []).slice(0, 11).map(p=> p.id);
  if(squad.serverOwned === true){
    const s = squadStrength(squad);
    squad.atk = s.atk;
    squad.def = s.def;
  }
  if(squad.fitness === undefined) squad.fitness = 92;
  if(squad.stamina === undefined) squad.stamina = 78;
  if(squad.morale === undefined) squad.morale = 78;
  if(!squad.style) squad.style = 'balanced';
  if(!squad.formation) squad.formation = '4-4-2';
  return squad;
}
/* خستگی/بازیابی بعد از یک هفته (بازیکنانِ ترکیب خسته می‌شوند) */
function weekFitness(squad, opts){
  const o = opts || {};
  const rest = o.rest === true;                 /* هفته‌ی استراحت: بازی نکرده */
  squad.fitness = clampNum(squad.fitness, 30, 100);
  squad.morale = clampNum(squad.morale, 20, 100);
  if(rest){
    squad.fitness = Math.min(100, squad.fitness + 16);
    squad.morale = Math.min(100, squad.morale + 2);
  } else {
    squad.fitness = Math.max(35, squad.fitness - 13);
    if(o.result === 'w') squad.morale = Math.min(100, squad.morale + 7);
    else if(o.result === 'd') squad.morale = Math.min(100, squad.morale + 1);
    else squad.morale = Math.max(20, squad.morale - 6);
  }
  if(!squad.stamina) squad.stamina = 76;
  squad.stamina = clampNum(squad.stamina, 40, 99);
  return squad;
}

/* ---------- تولید تیم شروع (۱۴ بازیکن) ---------- */
function startingSquad(clubName, seedStr){
  let st = core.leagueHash('squad:' + String(clubName) + ':' + String(seedStr || ''));
  const rand = ()=>{ st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const players = POSITIONS.map((pos, i)=>{
    const base = pos === 'GK' ? 62 : pos === 'DF' ? 64 : pos === 'MF' ? 65 : 66;
    const attack = Math.round(Math.max(42, Math.min(84, base + rand() * 16 - 6)));
    const age = 19 + Math.floor(rand() * 13);
    return {
      id: 'p' + (i + 1) + Math.floor(rand() * 1000).toString(36),
      name: FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)] + ' ' + LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)],
      pos, attack, age,
      potential: Math.min(96, attack + 4 + Math.floor(rand() * 14)),
      value: 0
    };
  });
  players.forEach(p=>{ p.value = playerValue(p); });
  const squad = { clubName, formation:'4-4-2', style:'balanced', players, slots: players.slice(0, 11).map(p=> p.id), fitness: 92, stamina: 78, morale: 80, uploadedAt: Date.now(), serverOwned: true };
  return recomputeSquad(squad);
}

/* ---------- بازار نقل و انتقالات (قطعی و مشترک بین همه) ---------- */
/* چرا قطعی؟ چون «بازار یکسان برای همه» عادلانه‌تر است و امکان
   تقلب/ریفresh برای گرفتن بازیکن بهتر را از بین می‌برد. */
function marketItems(weekIndex, season){
  const seed = core.leagueHash('market:v1:s' + (season || 1) + ':w' + weekIndex);
  let st = seed >>> 0;
  const rand = ()=>{ st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const count = 18;
  const items = [];
  for(let i=0; i<count; i++){
    const pos = ['GK','DF','DF','MF','MF','MF','FW','FW'][Math.floor(rand() * 8)];
    /* توزیع «کیفیت» بازار: عمدتاً متوسط، گاهی ستاره */
    const roll = rand();
    const tier = roll > 0.94 ? 3 : roll > 0.78 ? 2 : roll > 0.45 ? 1 : 0;
    const base = [54, 63, 71, 79][tier] + Math.floor(rand() * 6);
    const age = 17 + Math.floor(rand() * 17);
    const p = {
      id: 'm' + (season || 1) + '_' + weekIndex + '_' + i,
      name: FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)] + ' ' + LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)],
      pos, attack: Math.min(94, base), age,
      potential: Math.min(97, base + 3 + Math.floor(rand() * 16)),
      club: CLUBS[Math.floor(rand() * CLUBS.length)],
      tier
    };
    p.value = playerValue(p);
    p.price = Math.round((p.value * (1.05 + rand() * 0.35)) / 10000) * 10000;
    items.push(p);
  }
  items.sort((a, b)=> b.attack - a.attack || (a.id < b.id ? -1 : 1));
  return items;
}

/* ---------- رکورد و پاداش ---------- */
function applyRecord(player, myGoals, oppGoals){
  const r = player.record = player.record || { played:0, won:0, drawn:0, lost:0, gf:0, ga:0, titles:0, seasons:0 };
  r.played++; r.gf += myGoals; r.ga += oppGoals;
  let outcome = 'l';
  if(myGoals > oppGoals){ r.won++; outcome = 'w'; }
  else if(myGoals === oppGoals){ r.drawn++; outcome = 'd'; }
  else r.lost++;
  return outcome;
}
function rankPrize(rank){ return RANK_PRIZE[Math.min(RANK_PRIZE.length - 1, Math.max(0, rank - 1))] || 0; }

module.exports = {
  START_WALLET, MAX_SQUAD, MIN_SQUAD, WIN_BONUS, DRAW_BONUS, LOSS_BONUS, GATE_BONUS, WEEK_TRAINING, SELL_RATE,
  ensureProfile, addNews, playerValue, squadStrength, recomputeSquad, weekFitness,
  startingSquad, marketItems, applyRecord, rankPrize
};
