/* ============================================================
   game.js — وضعیت بازی، شروع فصل، ناوبری
   ============================================================ */

let state = null;
let uiMain = "home";
let uiSub = null;

const NAV = [
  {key:"home", label:"خانه", icon:"🏠"},
  {key:"team", label:"تیم من", icon:"👥", subs:[
    {key:"squad", label:"نفرات"}, {key:"lineup", label:"چیدمان"}, {key:"tactics", label:"تاکتیک"}, {key:"training", label:"تمرین"}
  ]},
  {key:"market", label:"بازار", icon:"💱", subs:[
    {key:"buy", label:"خرید بازیکن"}, {key:"sell", label:"فروش بازیکن"}
  ]},
  {key:"league", label:"لیگ", icon:"🏆", subs:[
    {key:"table", label:"جدول"}, {key:"async", label:"لیگ رفقا"}, {key:"cup", label:"جام حذفی"}, {key:"stats", label:"آمار بازیکنان"}, {key:"reports", label:"گزارش‌ها"}, {key:"news", label:"اخبار"}
  ]},
  {key:"settings", label:"باشگاه", icon:"⚙️", subs:[
    {key:"club", label:"امکانات"}, {key:"achievements", label:"دستاوردها"}, {key:"prefs", label:"تنظیمات"}, {key:"save", label:"ذخیره"}, {key:"load", label:"بارگذاری"}
  ]}
];

/* ================= FORMATION SLOT TEMPLATES ================= */
function getSlotTemplate(key){
  const gk = {x:50,y:92,role:'GK'};
  const T = {
    "4-4-2":[gk,{x:15,y:74,role:'DF'},{x:38,y:78,role:'DF'},{x:62,y:78,role:'DF'},{x:85,y:74,role:'DF'},
      {x:15,y:50,role:'MF'},{x:38,y:54,role:'MF'},{x:62,y:54,role:'MF'},{x:85,y:50,role:'MF'},
      {x:35,y:20,role:'FW'},{x:65,y:20,role:'FW'}],
    "4-3-3":[gk,{x:15,y:74,role:'DF'},{x:38,y:78,role:'DF'},{x:62,y:78,role:'DF'},{x:85,y:74,role:'DF'},
      {x:25,y:52,role:'MF'},{x:50,y:56,role:'MF'},{x:75,y:52,role:'MF'},
      {x:20,y:20,role:'FW'},{x:50,y:16,role:'FW'},{x:80,y:20,role:'FW'}],
    "3-5-2":[gk,{x:25,y:76,role:'DF'},{x:50,y:80,role:'DF'},{x:75,y:76,role:'DF'},
      {x:12,y:52,role:'MF'},{x:32,y:56,role:'MF'},{x:50,y:60,role:'MF'},{x:68,y:56,role:'MF'},{x:88,y:52,role:'MF'},
      {x:35,y:18,role:'FW'},{x:65,y:18,role:'FW'}],
    "5-3-2":[gk,{x:10,y:76,role:'DF'},{x:30,y:80,role:'DF'},{x:50,y:82,role:'DF'},{x:70,y:80,role:'DF'},{x:90,y:76,role:'DF'},
      {x:25,y:52,role:'MF'},{x:50,y:56,role:'MF'},{x:75,y:52,role:'MF'},
      {x:35,y:18,role:'FW'},{x:65,y:18,role:'FW'}]
  };
  return T[key];
}
function syncStartersFromLineup(){ state.starters = state.lineupSlots.filter(Boolean); }
function autoFillLineup(){
  const template = getSlotTemplate(state.formation);
  const used = new Set();
  const byRole = role => state.players.filter(p=>p.position===role && !used.has(p.id)).sort((a,b)=>overallOf(b)-overallOf(a));
  state.lineupSlots = template.map(slot=>{
    let candidates = byRole(slot.role);
    if(candidates.length===0) candidates = state.players.filter(p=>!used.has(p.id)).sort((a,b)=>overallOf(b)-overallOf(a));
    const chosen = candidates[0];
    if(chosen){ used.add(chosen.id); return chosen.id; }
    return null;
  });
  syncStartersFromLineup();
}
function clearLineup(){ state.lineupSlots = state.lineupSlots.map(()=>null); state.captainId=null; syncStartersFromLineup(); render(); }

/* ================= GAME INIT ================= */
function startGame(){
  const clubName = sanitizeName(document.getElementById('inpClub').value, "باشگاه من", 22);
  const managerName = sanitizeName(document.getElementById('inpManager').value, "مدیر جدید", 18);
  /* نام رقبا هرگز با باشگاه کاربر یکسان نمی‌شود (وگرنه جدول و نتایج خراب می‌شود) */
  const rivalNames = genRivalNames(clubName, 7);
  const allTeams = [clubName, ...rivalNames];
  state = {
    version: 1,
    clubName, managerName, budget: 80, week: 1, season: 1,
    players: genSquad(), starters: [], lineupSlots: null, captainId: null,
    formation: "4-4-2", style: "balanced",
    trainingPlan: {sessions:['attack','physical','tactical'], intensity:'normal', focusPlayerIds:[]},
    transferMarket: genMarket(), news: [], seasonStats: freshSeasonStats(),
    matchReports: [], lastReportId: null,
    prefs: { liveView: true, liveSpeed: 'normal', autoPresets: true },
    lineupPresets: { league: null, cup: null, friendly: null },
    coachId: 'none', stadiumLevel: 0, recoveryCamps: 3, lastLuckyWeek: 0,
    marketRefreshes: 0,
    achievements: {leagueTitles:0, cupTitles:0, bestRank:99, seasonsPlayed:0},
    cup: {stage:'ro8', active:true, log:[]},
    league: {
      teams: allTeams.map(t => ({ name: t, isUser: t===clubName, strength: t===clubName ? null : rnd(58,80), played:0, won:0, draw:0, lost:0, gf:0, ga:0, pts:0 })),
      fixtures: genFixtures(allTeams)
    }
  };
  autoFillLineup();
  addNews("فصل اول شروع شد! موفق باشی، مدیر.", "info");
  uiMain = "home"; uiSub = null;
  enterGameScreen();
  showToast("فصل اول شروع شد ✅", 'success');
}
function enterGameScreen(){
  document.getElementById('setupScreen').style.display='none';
  document.getElementById('gameScreen').style.display='block';
  renderNav(); render();
}

/* ================= NAV ================= */
function renderNav(){
  const main = document.getElementById('tabsMain');
  main.innerHTML = NAV.map(n=>`<button class="${uiMain===n.key?'active':''}" onclick="goMain('${n.key}')"><span class="ic">${n.icon}</span><span>${n.label}</span></button>`).join('');
  const currentNav = NAV.find(n=>n.key===uiMain);
  const subFloat = document.getElementById('subtabFloat');
  const sub = document.getElementById('tabsSub');
  if(currentNav && currentNav.subs){
    subFloat.style.display='flex';
    sub.innerHTML = currentNav.subs.map(s=>`<button class="${uiSub===s.key?'active':''}" onclick="goSub('${s.key}')">${s.label}</button>`).join('');
  } else { subFloat.style.display='none'; sub.innerHTML=''; }
}
function goMain(key){ uiMain = key; const nav = NAV.find(n=>n.key===key); uiSub = nav.subs ? nav.subs[0].key : null; renderNav(); render(); document.getElementById('scrollArea').scrollTo({top:0, behavior:'smooth'}); }
function goSub(key){ uiSub = key; renderNav(); render(); document.getElementById('scrollArea').scrollTo({top:0, behavior:'smooth'}); }
