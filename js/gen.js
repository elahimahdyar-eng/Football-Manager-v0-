/* ============================================================
   gen.js — تولید بازیکن، تیم، بازار و تقویم لیگ
   ============================================================ */

function genPlayer(position, minOv, maxOv){
  const overall = rnd(minOv,maxOv);
  const variance = ()=> clamp(overall + rnd(-8,8), 30, 95);
  const age = rnd(18,33);
  const attack  = position==="GK" ? rnd(20,40) : variance();
  const defense = position==="FW" ? rnd(25,45) : variance();
  const pace    = variance();
  /* پتانسیل هرگز نباید کمتر از بهترین آمار فعلی بازیکن باشد،
     وگرنه بازیکن هیچ‌وقت نمی‌تواند رشد کند. */
  const peak = Math.max(attack, defense, pace, overall);
  const potential = Math.min(97, Math.max(peak, overall + rnd(1,12)));
  /* ارزش: کیفیت + پتانسیل رشد + سن */
  const youthBonus = age<=22 ? 1.25 : (age<=25 ? 1.1 : (age>=31 ? 0.78 : 1));
  const potentialBonus = 1 + Math.max(0, potential-overall)/45;
  const value = Math.max(4, Math.round((overall*rnd(8,16)/10) * youthBonus * potentialBonus / 2) * 2);
  return {
    id: uid(), name: pick(FIRST_NAMES)+" "+pick(LAST_NAMES), position, age,
    attack, defense, pace,
    stamina: rnd(55,90), morale: rnd(60,90), fitness: rnd(80,100),
    value, wage: Math.max(1, Math.round(overall/28)),
    contractYears: rnd(1,4), potential
  };
}
function overallOf(p){ return Math.round((p.attack + p.defense + p.pace)/3); }

/* نام تیم‌های رقیب: هرگز با نام باشگاه کاربر (یا همدیگر) تکراری نمی‌شود */
const RIVAL_FALLBACK_NAMES = [
  "ستارگان دشت","موج آبی","عقاب کوهستان","باران شمال","آتش نشین","کمربند سبز",
  "ستاره سرخ","پارس نوین","بادگیر کویر","الماس جنوب","صخره پامیر","نسیم دریا"
];
function genRivalNames(clubName, count){
  const taken = new Set([String(clubName||'').trim()]);
  const out = [];
  for(const n of CLUB_NAMES.concat(RIVAL_FALLBACK_NAMES)){
    if(out.length>=count) break;
    if(!taken.has(n)){ taken.add(n); out.push(n); }
  }
  let i = 2;
  while(out.length<count){ const n = "باشگاه رقیب "+i; if(!taken.has(n)){ taken.add(n); out.push(n); } i++; }
  return out;
}
function genSquad(){
  const squad = [];
  for(let i=0;i<3;i++) squad.push(genPlayer("GK",50,70));
  for(let i=0;i<7;i++) squad.push(genPlayer("DF",50,72));
  for(let i=0;i<7;i++) squad.push(genPlayer("MF",50,72));
  for(let i=0;i<5;i++) squad.push(genPlayer("FW",50,72));
  return squad;
}
function genMarket(){ const market=[]; for(let i=0;i<12;i++) market.push(genPlayer(pick(POSITIONS), 45, 80)); return market; }

/* تقویم لیگ: دوره‌ی کامل رفت‌وبرگشت (روش چرخشی) */
function genFixtures(teamNames){
  let teams = teamNames.slice();
  if(teams.length % 2 !== 0) teams.push("BYE");
  const n = teams.length; const rounds1 = []; const half = n/2; let arr = teams.slice();
  for(let r=0;r<n-1;r++){
    const roundMatches = [];
    for(let i=0;i<half;i++){ const home = arr[i], away = arr[n-1-i]; if(home!=="BYE" && away!=="BYE") roundMatches.push({home,away}); }
    rounds1.push(roundMatches); arr.splice(1,0,arr.pop());
  }
  const rounds2 = rounds1.map(r => r.map(m=>({home:m.away, away:m.home})));
  return rounds1.concat(rounds2);
}
function addNews(msg, tag){ state.news.unshift({week: state.week, season: state.season, msg, tag: tag||"info"}); if(state.news.length>60) state.news.pop(); }
function freshSeasonStats(){ return {goals:{}, assists:{}, cleanSheets:{}}; }
