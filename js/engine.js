/* ============================================================
   engine.js — موتور شبیه‌سازی مسابقه
   ------------------------------------------------------------
   اصول طراحی (این چهارتا را قاطی نکن!):

   ۱) خالص (Pure):
      هیچ دسترسی‌ای به state / DOM / شبکه / زمان ندارد.
      فقط ورودی می‌گیرد و خروجی می‌دهد.

   ۲) قطعی (Deterministic):
      با seed یکسان و ورودی یکسان، خروجی «بایت‌به‌بایت» یکسان است —
      هم در مرورگر، هم روی Node، هم روی سرور.
      (گزارش: tools/engine-parity.js این را ثابت می‌کند)

   ۳) مستقل از محیط:
      همین یک فایل بعداً بدون هیچ تغییری روی سرور اجرا می‌شود تا
      نتیجه‌ی مسابقه را بازتولید و تأیید کند ⇒ پایه‌ی ضدتقلب آنلاین.

   ۴) توضیح‌پذیر (Explanatory):
      علاوه بر نتیجه، عوامل مؤثر (حمله/دفاع/آمادگی/روحیه/شانس/xG) را
      هم برمی‌گرداند تا به بازیکن بگوییم «چرا این نتیجه شد».
      متن فارسی اینجا ساخته نمی‌شود (کار لایه‌ی UI است) تا موتور
      برای سرور و چندزبانه‌سازی آماده بماند.
   ============================================================ */

const ENGINE_VERSION = 1;
const ENGINE_HOME_ADV = 4;       /* مزیت میزبانی (واحد قدرت) */
const ENGINE_MATCH_MINUTES = 90;

/* ---------- ابزارهای داخلی (عمداً داخل همین فایل، بدون وابستگی) ---------- */
function eClamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function eRound(v, d){
  const f = Math.pow(10, d === undefined ? 2 : d);
  return Math.round(v * f) / f;
}
/* FNV-1a 32bit — هش رشته به عدد (برای seed از رشته) */
function engineHash(str){
  let h = 2166136261 >>> 0;
  const s = String(str);
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
/* mulberry32 — تولیدکننده‌ی عدد تصادفی با seed (سریع، قطعی، یکنواخت) */
function engineRng(seed){
  let a = (typeof seed === 'number' ? Math.floor(seed) : engineHash(seed)) >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* انتخاب وزنی قطعی: items = [{w, ...}] */
function pickWeighted(rng, items){
  const total = items.reduce((s,x)=>s + Math.max(0, x.w), 0);
  if(total <= 0) return null;
  let r = rng() * total;
  for(const it of items){
    r -= Math.max(0, it.w);
    if(r <= 0) return it;
  }
  return items[items.length-1];
}

/* ---------- آماده‌سازی یک طرف مسابقه ---------- */
/* side = { name, atk, def, fitness?, stamina?, morale?, players?:[{id,name,pos,attack}], meta? } */
function enginePrepSide(side, fallbackName){
  const s = side || {};
  const players = Array.isArray(s.players) ? s.players.filter(p=>p && p.name) : [];
  return {
    name: String(s.name || fallbackName || 'تیم'),
    atk: Number(s.atk) || 55,
    def: Number(s.def) || 55,
    fitness: (s.fitness === undefined || s.fitness === null) ? 100 : Number(s.fitness),
    stamina: (s.stamina === undefined || s.stamina === null) ? 75 : Number(s.stamina),
    morale: (s.morale === undefined || s.morale === null) ? 75 : Number(s.morale),
    players: players.map(p=>({
      id: p.id === undefined ? null : p.id,
      name: String(p.name),
      pos: ['GK','DF','MF','FW'].includes(p.pos) ? p.pos : 'MF',
      attack: Number(p.attack) || 60
    })),
    meta: s.meta || null
  };
}

/* ---------- وزن‌های گلزنی و پاس گل بر اساس پست و قدرت ---------- */
const E_SCORER_W = { FW: 5.0, MF: 2.6, DF: 0.7, GK: 0.04 };
const E_ASSIST_W = { FW: 2.4, MF: 4.0, DF: 1.2, GK: 0.04 };

function enginePickPlayer(rng, players, weightsByPos, excludeId){
  const items = players
    .filter(p=>excludeId === undefined || p.id !== excludeId)
    .map(p=>({ p, w: (weightsByPos[p.pos] || 1) * Math.max(0.2, p.attack / 70) }));
  const chosen = pickWeighted(rng, items);
  return chosen ? chosen.p : null;
}

/* ============================================================
   تابع اصلی: شبیه‌سازی یک مسابقه
   ------------------------------------------------------------
   opts = { seed, neutral, homeAdv }
   خروجی: گزارش کامل مسابقه (قابل ذخیره، بازتولید و نمایش)
   ============================================================ */
function simulateMatchEngine(homeSide, awaySide, opts){
  const o = opts || {};
  const seed = (o.seed === undefined || o.seed === null) ? 1 : o.seed;
  const rng = engineRng(seed);
  const neutral = !!o.neutral;
  const homeAdv = neutral ? 0 : (o.homeAdv === undefined ? ENGINE_HOME_ADV : o.homeAdv);

  const H = enginePrepSide(homeSide, 'تیم میزبان');
  const A = enginePrepSide(awaySide, 'تیم میهمان');

  /* --- ۱) شانس (luck) هر طرف: قبل از هر چیز، ترتیب مصرف rng ثابت --- */
  const luckH = 0.88 + rng() * 0.26;   /* ۰.۸۸ .. ۱.۱۴ */
  const luckA = 0.88 + rng() * 0.26;
  const totalMinutes = ENGINE_MATCH_MINUTES + Math.floor(rng() * 5);   /* وقت اضافه‌ی ۰..۴ */
  const redCardRoll = rng();           /* آیا اصلاً کارت قرمز داریم؟ */

  /* --- ۲) قدرت مؤثر --- */
  const hAtk = Math.max(20, H.atk + homeAdv);
  const aAtk = Math.max(20, A.atk);
  const hDef = Math.max(20, H.def);
  const aDef = Math.max(20, A.def);

  /* --- ۳) گل انتظاری (xG) --- */
  const xgH = eClamp(1.30 + (hAtk - aDef) / 24, 0.15, 3.8) * luckH;
  const xgA = eClamp(1.30 + (aAtk - hDef) / 24, 0.15, 3.8) * luckA;

  /* --- ۴) مالکیت توپ --- */
  const posRoll = rng();
  const posH = eClamp(Math.round(50 + (hAtk - aAtk) * 0.55 + (posRoll - 0.5) * 10), 28, 72);

  /* --- ۵) شوت‌ها از xG --- */
  const shotsH = eClamp(Math.round(xgH * 7.5) + 1, 2, 28);
  const shotsA = eClamp(Math.round(xgA * 7.5) + 1, 2, 28);
  const onTargetRateH = eClamp(0.36 + rng() * 0.14, 0.30, 0.55);
  const onTargetRateA = eClamp(0.36 + rng() * 0.14, 0.30, 0.55);
  const convH = xgH / Math.max(1, shotsH * onTargetRateH);   /* نرخ گل‌زنی روی شوت در چارچوب */
  const convA = xgA / Math.max(1, shotsA * onTargetRateA);

  const st = {
    goals: [0, 0], shots: [0, 0], onTarget: [0, 0], saves: [0, 0],
    corners: [0, 0], cards: [0, 0], reds: [0, 0]
  };
  const events = [];
  const playerStats = {};
  function statOf(p){
    if(!p) return null;
    const key = p.id || p.name;
    if(!playerStats[key]) playerStats[key] = { id: p.id, name: p.name, pos: p.pos, side: null, goals: 0, assists: 0, cards: 0, rating: 0 };
    return playerStats[key];
  }
  H.players.forEach(p=>{ const s = statOf(p); if(s) s.side = 'home'; });
  A.players.forEach(p=>{ const s = statOf(p); if(s) s.side = 'away'; });

  events.push({ minute: 0, type: 'kickoff' });

  /* --- ۶) حلقه‌ی دقیقه‌به‌دقیقه --- */
  const sides = [
    { key: 'home', team: H, opp: A, idx: 0, shots: shotsH, onTargetRate: onTargetRateH, conv: convH, xg: xgH },
    { key: 'away', team: A, opp: H, idx: 1, shots: shotsA, onTargetRate: onTargetRateA, conv: convA, xg: xgA }
  ];
  const perMinute = side => side.shots / totalMinutes;

  for(let minute = 1; minute <= totalMinutes; minute++){
    for(const sd of sides){
      if(minute === 46) continue;              /* شروع نیمه‌ی دوم: بعداً یک رویداد می‌گذاریم */
      if(rng() >= perMinute(sd)) continue;      /* در این دقیقه موقعیتی ایجاد نشد */
      st.shots[sd.idx]++;
      const shooter = enginePickPlayer(rng, sd.team.players, E_SCORER_W);
      const isOnTarget = rng() < sd.onTargetRate;
      if(!isOnTarget){
        events.push({ minute, type: 'miss', side: sd.key, playerId: shooter ? shooter.id : null, playerName: shooter ? shooter.name : sd.team.name });
        continue;
      }
      st.onTarget[sd.idx]++;
      if(rng() < sd.conv){
        /* ---- گل ---- */
        st.goals[sd.idx]++;
        const sc = statOf(shooter);
        if(sc) sc.goals++;
        let assistPlayer = null;
        if(rng() < 0.78){
          assistPlayer = enginePickPlayer(rng, sd.team.players, E_ASSIST_W, shooter ? shooter.id : undefined);
          const as = statOf(assistPlayer);
          if(as) as.assists++;
        }
        events.push({
          minute, type: 'goal', side: sd.key,
          playerId: shooter ? shooter.id : null, playerName: shooter ? shooter.name : sd.team.name,
          assistId: assistPlayer ? assistPlayer.id : null, assistName: assistPlayer ? assistPlayer.name : null
        });
      } else {
        /* ---- سیو دروازه‌بان ---- */
        const gk = sd.opp.players.find(p=>p.pos === 'GK');
        st.saves[1 - sd.idx]++;
        events.push({
          minute, type: 'save', side: sd.key,
          playerId: shooter ? shooter.id : null, playerName: shooter ? shooter.name : sd.team.name,
          keeperName: gk ? gk.name : null
        });
      }
    }
    /* مصدومیت سطحی (ضربه): ۰.۵٪ در هر دقیقه ⇒ حدود ۰.۴ در مسابقه */
    if(rng() < 0.005){
      const sd = rng() < 0.5 ? sides[0] : sides[1];
      const hurt = enginePickPlayer(rng, sd.team.players, { GK: 0.4, DF: 1.2, MF: 1.2, FW: 1.0 });
      if(hurt) events.push({ minute, type: 'knock', side: sd.key, playerId: hurt.id, playerName: hurt.name });
    }
    /* کارت زرد: حدود ۳ کارت در هر مسابقه (نزدیک به فوتبال واقعی) */
    if(rng() < 0.034){
      const sd = rng() < 0.5 ? sides[0] : sides[1];
      const bad = enginePickPlayer(rng, sd.team.players, { GK: 0.3, DF: 1.6, MF: 1.3, FW: 0.7 });
      if(bad){
        st.cards[sd.idx]++;
        const bs = statOf(bad);
        if(bs) bs.cards++;
        events.push({ minute, type: 'card', card: 'y', side: sd.key, playerId: bad.id, playerName: bad.name });
      }
    }
    if(minute === 45){
      events.push({ minute: 45, type: 'halftime', score: [st.goals[0], st.goals[1]] });
    }
  }

  /* --- ۷) کارت قرمز (نادر و قطعی) --- */
  if(redCardRoll < 0.06 && events.length){
    const sd = rng() < 0.5 ? sides[0] : sides[1];
    const bad = enginePickPlayer(rng, sd.team.players, { GK: 0.2, DF: 1.4, MF: 1.2, FW: 0.6 });
    if(bad){
      st.reds[sd.idx]++;
      const bs = statOf(bad);
      if(bs) bs.cards++;
      const m = 55 + Math.floor(rng() * 33);
      events.push({ minute: m, type: 'card', card: 'r', side: sd.key, playerId: bad.id, playerName: bad.name });
    }
  }

  /* --- ۸) کرنر --- */
  st.corners = [Math.round(shotsH * 0.55 + rng() * 2), Math.round(shotsA * 0.55 + rng() * 2)];

  /* --- ۹) امتیاز بازیکنان و بهترین بازیکن زمین --- */
  let best = null;
  for(const sd of sides){
    for(const p of sd.team.players){
      const key = p.id || p.name;
      const ps = playerStats[key];
      if(!ps) continue;
      const r = 6.0 + ps.goals * 1.25 + ps.assists * 0.75 - (ps.cards >= 2 ? 0.8 : ps.cards * 0.3) + rng() * 0.7;
      ps.rating = eRound(eClamp(r, 4.0, 10.0), 1);
      if(!best || ps.rating > best.rating) best = ps;
    }
  }

  events.push({ minute: totalMinutes, type: 'fulltime', score: [st.goals[0], st.goals[1]] });
  events.sort((a, b)=> a.minute - b.minute || (a.type === 'halftime' ? -1 : 1));

  const report = {
    engineVersion: ENGINE_VERSION,
    seed: seed,
    neutral: neutral,
    homeAdvantage: homeAdv,
    home: H.name,
    away: A.name,
    homeGoals: st.goals[0],
    awayGoals: st.goals[1],
    /* برای سازگاری با کدهای فعلی بازی: */
    homeStrength: eRound((hAtk + hDef) / 2, 2),
    awayStrength: eRound((aAtk + aDef) / 2, 2),
    stats: {
      possession: [posH, 100 - posH],
      shots: st.shots,
      onTarget: st.onTarget,
      saves: st.saves,
      corners: st.corners,
      cards: st.cards,
      reds: st.reds
    },
    xg: [eRound(xgH, 2), eRound(xgA, 2)],
    events: events,
    playerStats: playerStats,
    bestPlayer: best ? { id: best.id, name: best.name, pos: best.pos, side: best.side, rating: best.rating } : null,
    factors: {
      attack: [eRound(hAtk, 2), eRound(aAtk, 2)],
      defense: [eRound(hDef, 2), eRound(aDef, 2)],
      fitness: [eRound(H.fitness, 1), eRound(A.fitness, 1)],
      stamina: [eRound(H.stamina, 1), eRound(A.stamina, 1)],
      morale: [eRound(H.morale, 1), eRound(A.morale, 1)],
      luck: [eRound(luckH, 3), eRound(luckA, 3)],
      homeAdvantage: homeAdv
    },
    meta: { home: H.meta, away: A.meta }
  };
  return report;
}

/* ---------- بازتولید یک گزارش از روی seed (برای ریپلی/تأیید سرور) ---------- */
function reproduceReport(report, homeSide, awaySide){
  if(!report) return null;
  return simulateMatchEngine(homeSide, awaySide, { seed: report.seed, neutral: report.neutral });
}

/* ---------- خلاصه‌ی متنی کوتاه نتیجه (برای اشتراک‌گذاری) ---------- */
function reportSummaryLine(report, viewerClub){
  const isHome = report.home === viewerClub;
  const my = isHome ? report.homeGoals : report.awayGoals;
  const opp = isHome ? report.awayGoals : report.homeGoals;
  const oppName = isHome ? report.away : report.home;
  const tag = my > opp ? 'برد' : (my < opp ? 'باخت' : 'مساوی');
  return `${viewerClub} ${my} - ${opp} ${oppName} (${tag})`;
}
