/* ============================================================
   save.js — ذخیره‌ی خودکار در مرورگر، فایل پشتیبان و بارگذاری
   ============================================================ */

const SAVE_KEY = 'footballManager.autosave.v1';
let saveBroken = false;        // اگر localStorage در دسترس نباشد
let lastSaveAt = 0;

/* ---------- ذخیره‌ی خودکار ---------- */
function saveGame(){
  if(!state) return false;
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), state }));
    lastSaveAt = Date.now();
    saveBroken = false;
    return true;
  }catch(e){
    if(!saveBroken){ saveBroken = true; showToast('ذخیره‌ی خودکار در این مرورگر ممکن نیست.', 'error'); }
    return false;
  }
}
function autosaveJson(){
  try{ const raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}
function hasAutoSave(){ const s = autosaveJson(); return !!(s && s.state); }
function deleteAutoSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }
function fmtSaveTime(ts){
  if(!ts) return '—';
  try{ return new Date(ts).toLocaleString('fa-IR', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); }
  catch(e){ return new Date(ts).toLocaleString(); }
}

/* ---------- اعتبارسنجی و تعمیر سیو (نسخه‌های قدیمی هم پشتیبانی می‌شوند) ---------- */
function normalizeState(s){
  if(!s || typeof s !== 'object') return false;
  if(!Array.isArray(s.players) || s.players.length < 11) return false;
  if(!s.league || !Array.isArray(s.league.teams) || s.league.teams.length < 2) return false;

  s.clubName = sanitizeName(s.clubName, "باشگاه من", 22);
  s.managerName = sanitizeName(s.managerName, "مدیر جدید", 18);
  s.version = 1;
  if(typeof s.budget !== 'number' || !Number.isFinite(s.budget)) s.budget = 80;
  if(!Number.isInteger(s.week) || s.week < 1) s.week = 1;
  if(!Number.isInteger(s.season) || s.season < 1) s.season = 1;

  if(!s.trainingPlan || !Array.isArray(s.trainingPlan.sessions)) s.trainingPlan = {sessions:['attack','physical','tactical'], intensity:'normal', focusPlayerIds:[]};
  if(!Array.isArray(s.trainingPlan.sessions) || s.trainingPlan.sessions.length!==3) s.trainingPlan.sessions = ['attack','physical','tactical'];
  if(!Array.isArray(s.trainingPlan.focusPlayerIds)) s.trainingPlan.focusPlayerIds = [];
  if(!INTENSITY_MULT[s.trainingPlan.intensity]) s.trainingPlan.intensity = 'normal';

  if(s.captainId === undefined) s.captainId = null;
  if(!s.seasonStats) s.seasonStats = freshSeasonStats();
  ['goals','assists','cleanSheets'].forEach(k=>{ if(!s.seasonStats[k] || typeof s.seasonStats[k]!=='object') s.seasonStats[k] = {}; });
  if(!COACHES.some(c=>c.id===s.coachId)) s.coachId = 'none';
  if(!Number.isInteger(s.stadiumLevel) || s.stadiumLevel<0 || s.stadiumLevel>=STADIUM_LEVELS.length) s.stadiumLevel = 0;
  if(!Number.isInteger(s.recoveryCamps)) s.recoveryCamps = 3;
  if(!Number.isInteger(s.lastLuckyWeek)) s.lastLuckyWeek = 0;
  if(!Number.isInteger(s.marketRefreshes)) s.marketRefreshes = 0;
  if(!s.achievements) s.achievements = {leagueTitles:0, cupTitles:0, bestRank:99, seasonsPlayed:0};
  if(!s.cup || !Array.isArray(s.cup.log)) s.cup = {stage:'ro8', active:true, log:[]};
  if(!FORMATIONS[s.formation]) s.formation = "4-4-2";
  if(!STYLES[s.style]) s.style = "balanced";
  if(!Array.isArray(s.news)) s.news = [];
  if(!s.prefs || typeof s.prefs !== 'object') s.prefs = { liveView: true, liveSpeed: 'normal', autoPresets: true };
  if(typeof s.prefs.liveView !== 'boolean') s.prefs.liveView = true;
  if(!LIVE_SPEEDS[s.prefs.liveSpeed]) s.prefs.liveSpeed = 'normal';
  if(typeof s.prefs.autoPresets !== 'boolean') s.prefs.autoPresets = true;
  if(!s.lineupPresets || typeof s.lineupPresets !== 'object') s.lineupPresets = { league:null, cup:null, friendly:null };
  ['league','cup','friendly'].forEach(k=>{ if(s.lineupPresets[k] && !validPreset(s.lineupPresets[k], s)) s.lineupPresets[k] = null; });
  if(!Array.isArray(s.matchReports)) s.matchReports = [];
  /* گزارش‌های خیلی سنگین قدیمی را دور بریز (نگه‌داشتن اطلاعات حیاتی) */
  s.matchReports = s.matchReports
    .filter(r=>r && r.events && r.stats)
    .slice(0, MAX_REPORTS)
    .map(r=>{
      if(!r.inputs){ r.inputs = null; }      /* گزارش‌های قبل از نسخه‌ی موتور: بدون تأییدپذیری */
      if(r.engineVersion === undefined) r.engineVersion = 0;
      return r;
    });
  if(s.lastReportId === undefined) s.lastReportId = s.matchReports[0] ? s.matchReports[0].id : null;
  if(!Array.isArray(s.transferMarket) || !s.transferMarket.length) s.transferMarket = genMarket();

  /* آمار نامعتبر بازیکن‌ها را ترمیم کن */
  s.players.forEach(p=>{
    ['attack','defense','pace','stamina','morale','fitness','potential','value','wage','age','contractYears']
      .forEach(k=>{ if(typeof p[k] !== 'number' || !Number.isFinite(p[k])) p[k] = 50; });
    p.potential = Math.min(97, Math.max(p.potential, p.attack, p.defense, p.pace));
    p.fitness = clamp(Math.round(p.fitness), 0, 100);
    p.morale = clamp(Math.round(p.morale), 0, 100);
    if(!POSITIONS.includes(p.position)) p.position = 'MF';
    /* پست‌های چندگانه (ذخیره‌های قدیمی فقط position داشتند) */
    if(!Array.isArray(p.positions) || !p.positions.length || !p.positions.every(x=>POSITIONS.includes(x))){
      p.positions = [p.position];
    }
    if(!p.positions.includes(p.position)) p.positions.unshift(p.position);
  });

  /* تیم‌های هم‌نام: سیوهای ساخته‌شده با نسخه‌ی باگ‌دار را تعمیر می‌کند */
  const names = s.league.teams.map(t=>t.name);
  if(new Set(names).size !== names.length){
    const seen = new Set();
    s.league.teams.forEach(t=>{
      let n = t.name, i = 2;
      while(seen.has(n)) n = t.name + ' ' + (i++);
      t.name = n; seen.add(n);
    });
    s.league.fixtures = genFixtures(s.league.teams.map(t=>t.name));
    s.league.teams.forEach(t=>Object.assign(t,{played:0,won:0,draw:0,lost:0,gf:0,ga:0,pts:0}));
    s.week = 1; s.seasonStats = freshSeasonStats(); s.cup = {stage:'ro8', active:true, log:[]};
    addNews('نام تیم‌های هم‌نام اصلاح شد و فصل از نو تنظیم گردید.', 'info');
  }
  if(!Array.isArray(s.league.fixtures) || s.league.fixtures.length !== (s.league.teams.length-1)*2){
    s.league.fixtures = genFixtures(s.league.teams.map(t=>t.name));
  }

  /* ترکیب: اگر ۱۱ نفر نبود، از فهرست بازیکنان پر می‌شود */
  const validIds = new Set(s.players.map(p=>p.id));
  let slots = Array.isArray(s.lineupSlots) ? s.lineupSlots : null;
  if(!slots || slots.length !== 11){
    slots = getSlotTemplate(s.formation).map(()=>null);
  }
  const used = new Set();
  slots = slots.map(id=>{ if(id && validIds.has(id) && !used.has(id)){ used.add(id); return id; } return null; });
  if(slots.filter(Boolean).length < 11){
    s.lineupSlots = slots;
    const template = getSlotTemplate(s.formation);
    s.lineupSlots = template.map((slot,i)=>{
      if(s.lineupSlots[i]) return s.lineupSlots[i];
      const cand = s.players.filter(p=>!used.has(p.id)).sort((a,b)=>
        (b.position===slot.role?1:0)-(a.position===slot.role?1:0) || overallOf(b)-overallOf(a))[0];
      if(cand) used.add(cand.id);
      return cand ? cand.id : null;
    });
  } else s.lineupSlots = slots;
  syncStartersFromLineup();
  return true;
}

/* اعتبارسنجی چیدمان ذخیره‌شده (بعد از بارگذاری) */
function validPreset(preset, st){
  if(!preset || !FORMATIONS[preset.formation] || !Array.isArray(preset.slots)) return false;
  if(preset.slots.length !== 11) return false;
  const ids = new Set((st.players||[]).map(p=>p.id));
  return preset.slots.every(id=>!id || ids.has(id));
}

/* ---------- بارگذاری خودکار در شروع برنامه ---------- */
function tryAutoLoad(){
  const data = autosaveJson();
  if(!data || !data.state) return false;
  const backup = state;
  state = data.state;
  if(!normalizeState(state)){ state = backup; return false; }
  lastSaveAt = data.savedAt || 0;
  enterGameScreen();
  showToast('بازی ذخیره‌شده‌ات برگردانده شد ✅', 'success');
  return true;
}

/* ---------- شروع بازی جدید ---------- */
function startNewGame(fromGame){
  const go = ()=>{
    deleteAutoSave();
    state = null;
    document.getElementById('inpClub').value = '';
    document.getElementById('inpManager').value = '';
    document.getElementById('gameScreen').style.display='none';
    document.getElementById('setupScreen').style.display='flex';
    refreshSetupSummary();
  };
  if(fromGame){
    askConfirm({
      title:'شروع بازی جدید؟',
      body:'ذخیره‌ی خودکار فعلی پاک می‌شود و باشگاه جدیدی می‌سازی. این کار قابل بازگشت نیست.',
      yes:'بله، بازی جدید', danger:true, onYes:go
    });
  } else go();
}

/* ---------- ذخیره / بارگذاری دستی ---------- */
function renderSave(){
  const when = lastSaveAt ? fmtSaveTime(lastSaveAt) : '—';
  return `
  <div class="card glass">
    <h2><span class="dot"></span>ذخیره‌ی بازی</h2>
    <div class="row"><span>ذخیره‌ی خودکار</span><b style="color:${saveBroken?'var(--red)':'var(--emerald)'};">${saveBroken?'غیرفعال':'فعال ✅'}</b></div>
    <div class="row"><span>آخرین ذخیره</span><b>${when}</b></div>
    <p class="muted" style="font-size:0.76rem; margin-top:10px;">بازی هر بار که صفحه‌ای عوض می‌شود خودکار در همین مرورگر ذخیره می‌شود؛ با رفرش یا بستن مرورگر پیشرفتت از بین نمی‌رود.</p>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>فایل پشتیبان</h2>
    <p class="muted" style="font-size:0.78rem;">برای انتقال بازی به دستگاه دیگر، فایل پشتیبان را دانلود کن.</p>
    <div style="display:flex; gap:8px;">
      <button class="btn primary small" style="flex:1;" onclick="downloadSave()">دانلود فایل ذخیره</button>
      <button class="btn ghost small" style="flex:1;" onclick="copySave()">کپی متن ذخیره</button>
    </div>
    <textarea readonly onclick="this.select()" style="margin-top:12px; min-height:60px;">${JSON.stringify(state)}</textarea>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>بازی جدید</h2>
    <p class="muted" style="font-size:0.78rem;">باشگاه فعلی رها می‌شود و از فصل اول با یک باشگاه تازه شروع می‌کنی.</p>
    <button class="btn danger" style="width:100%;" onclick="startNewGame(true)">شروع بازی جدید</button>
  </div>`;
}
function renderLoad(){
  return `<div class="card glass">
    <h2><span class="dot"></span>بارگذاری بازی</h2>
    <p class="muted" style="font-size:0.78rem;">متن یا فایل ذخیره‌ای که قبلاً گرفته‌ای را اینجا برگردان.</p>
    <input type="file" accept=".json,application/json" onchange="loadFromFile(this)" style="margin-bottom:10px;">
    <textarea id="loadArea" placeholder="متن ذخیره رو اینجا پیست کن..."></textarea>
    <button class="btn primary" style="width:100%; margin-top:10px;" onclick="loadFromText()">بارگذاری از متن</button>
  </div>`;
}
function downloadSave(){
  const blob = new Blob([JSON.stringify(state)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${state.clubName}-save.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  showToast('فایل ذخیره دانلود شد', 'success');
}
function copySave(){
  const txt = JSON.stringify(state);
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>showToast('متن ذخیره کپی شد ✅','success'), ()=>showToast('کپی نشد؛ دستی انتخاب کن.','error'));
  } else showToast('مرورگر از کپی خودکار پشتیبانی نمی‌کند.');
}
function loadFromFile(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const ok = applySaveText(String(reader.result));
    if(ok) input.value = '';
  };
  reader.onerror = () => showToast('خواندن فایل ممکن نشد.', 'error');
  reader.readAsText(file);
}
function applySaveText(text){
  try{
    const parsed = JSON.parse(String(text||'').trim());
    const backup = state;
    state = parsed.state || parsed;   // هم فایل خام و هم فایل بسته‌بندی‌شده
    if(!normalizeState(state)){
      state = backup;
      showToast("فایل ذخیره نامعتبره یا ناقصه.", 'error');
      return false;
    }
    enterGameScreen();
    showToast('بازی بارگذاری شد ✅', 'success');
    return true;
  }catch(e){
    showToast("متن ذخیره نامعتبره.", 'error');
    return false;
  }
}
function loadFromText(){
  applySaveText(document.getElementById('loadArea').value);
}

/* ---------- خلاصه‌ی سیو روی صفحه‌ی شروع ---------- */
function refreshSetupSummary(){
  const box = document.getElementById('setupSummary');
  if(!box) return;
  const data = autosaveJson();
  if(data && data.state){
    const s = data.state;
    box.style.display = 'block';
    box.innerHTML = `
      <div class="row"><span>باشگاه</span><b>${escapeHtml(s.clubName)}</b></div>
      <div class="row"><span>فصل / هفته</span><b>${s.season} / ${Math.min(s.week, (s.league&&s.league.fixtures?s.league.fixtures.length:14))}</b></div>
      <div class="row"><span>آخرین ذخیره</span><b>${fmtSaveTime(data.savedAt)}</b></div>
      <button class="btn primary" style="width:100%; margin-top:10px;" onclick="tryAutoLoad()">ادامه‌ی بازی</button>
      <button class="btn ghost small" style="width:100%; margin-top:8px;" onclick="startNewGame(true)">شروع بازی جدید</button>`;
  } else {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}
