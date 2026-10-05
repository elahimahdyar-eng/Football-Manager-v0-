/* ============================================================
   ui.js — رندر همه‌ی تب‌ها، مودال‌ها و تعامل‌های رابط کاربری
   ============================================================ */

/* ================= RENDER ================= */
function render(){
  document.getElementById('hdrClub').textContent = state.clubName;
  document.getElementById('hdrManager').textContent = "مدیر: " + state.managerName;
  const budgetEl = document.getElementById('hdrBudget');
  budgetEl.textContent = fmtMoney(state.budget);
  document.getElementById('hdrBudgetChip').classList.toggle('neg', state.budget<0);
  document.getElementById('hdrWeek').textContent = `هفته ${Math.min(state.week,state.league.fixtures.length)}/${state.league.fixtures.length}`;
  document.getElementById('hdrCrest').innerHTML = crestSVG(state.clubName);
  const table0 = state.league.teams.slice().sort((a,b)=>b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga));
  document.getElementById('hdrRank').textContent = (table0.findIndex(t=>t.isUser)+1) + '/' + table0.length;
  document.getElementById('hdrAvgOv').textContent = Math.round(state.players.reduce((s,p)=>s+overallOf(p),0)/state.players.length);
  document.getElementById('hdrMorale').textContent = Math.round(state.players.reduce((s,p)=>s+p.morale,0)/state.players.length) + '%';
  document.getElementById('hdrProgress').style.width = Math.min(100, Math.round((state.week-1)/state.league.fixtures.length*100)) + '%';
  const formHost = document.getElementById('hdrForm');
  if(formHost) formHost.innerHTML = formStripHTML(userLast5());

  const c = document.getElementById('tabContent');
  if(uiMain==="home") c.innerHTML = renderDashboard();
  else if(uiMain==="team" && uiSub==="squad") c.innerHTML = renderSquad();
  else if(uiMain==="team" && uiSub==="lineup") c.innerHTML = renderLineup();
  else if(uiMain==="team" && uiSub==="tactics") c.innerHTML = renderTactics();
  else if(uiMain==="team" && uiSub==="training") c.innerHTML = renderTraining();
  else if(uiMain==="market" && uiSub==="buy") c.innerHTML = renderMarketBuy();
  else if(uiMain==="market" && uiSub==="sell") c.innerHTML = renderMarketSell();
  else if(uiMain==="league" && uiSub==="table") c.innerHTML = renderLeagueTable();
  else if(uiMain==="league" && uiSub==="async") c.innerHTML = renderAsyncLeague();
  else if(uiMain==="league" && uiSub==="cup") c.innerHTML = renderCup();
  else if(uiMain==="league" && uiSub==="stats") c.innerHTML = renderSeasonStats();
  else if(uiMain==="league" && uiSub==="reports") c.innerHTML = renderReports();
  else if(uiMain==="league" && uiSub==="news") c.innerHTML = renderNews();
  else if(uiMain==="online") c.innerHTML = renderOnline();
  else if(uiMain==="settings" && uiSub==="club") c.innerHTML = renderClubFacilities();
  else if(uiMain==="settings" && uiSub==="achievements") c.innerHTML = renderAchievements();
  else if(uiMain==="settings" && uiSub==="prefs") c.innerHTML = renderPrefs();
  else if(uiMain==="settings" && uiSub==="save") c.innerHTML = renderSave();
  else if(uiMain==="settings" && uiSub==="load") c.innerHTML = renderLoad();

  /* ذخیره‌ی خودکار: هر تغییری در بازی از این مسیر می‌گذرد */
  saveGame();
}
/* ---------- فرم ۵ بازی آخر (مثل بازی‌های مدیریتی حرفه‌ای) ---------- */
function teamLast5(name){
  const t = state.league.teams.find(x=>x.name===name);
  return t ? (t.last5 || []) : [];
}
function userLast5(){
  const t = state.league.teams.find(x=>x.isUser);
  return t ? (t.last5 || []) : [];
}
function formStripHTML(arr){
  if(!arr || !arr.length) return '';
  return `<span class="form-strip">${arr.map(pts=>{
    const cls = pts === 3 ? 'fg-w' : (pts === 1 ? 'fg-d' : 'fg-l');
    const ch  = pts === 3 ? 'ب' : (pts === 1 ? 'م' : 'ش');
    return `<i class="${cls}" title="${pts === 3 ? 'برد' : (pts === 1 ? 'مساوی' : 'باخت')}">${ch}</i>`;
  }).join('')}</span>`;
}

/* ---------- تنظیمات ---------- */
function renderPrefs(){
  const p = state.prefs || {};
  return `
  <div class="card glass">
    <h2><span class="dot"></span>نمایش مسابقه${infoBtn('prefs')}</h2>
    <p class="muted" style="font-size:0.78rem; line-height:1.8;">مسابقه‌ی تیمت را می‌توانی دقیقه‌به‌دقیقه و با سرعت دلخواه ببینی — یا مستقیم نتیجه را ببینی.</p>
    <div class="row"><span>پخش زنده‌ی مسابقه</span><b>${p.liveView !== false ? 'روشن ✅' : 'خاموش'}</b></div>
    <div class="grid2" style="margin-top:8px;">
      <div class="formation-opt ${p.liveView !== false ? 'active' : ''}" onclick="setPref('liveView', true)">پخش زنده</div>
      <div class="formation-opt ${p.liveView === false ? 'active' : ''}" onclick="setPref('liveView', false)">نمایش نتیجه</div>
    </div>
    <div class="muted" style="font-size:0.72rem; margin-top:12px;">سرعت پخش پیش‌فرض</div>
    <div class="grid4" style="margin-top:6px;">
      ${Object.keys(LIVE_SPEEDS).map(k=>`<div class="formation-opt ${((p.liveSpeed)||'normal')===k?'active':''}" onclick="setLiveSpeedPref('${k}')">${LIVE_SPEED_LABELS[k]}</div>`).join('')}
    </div>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>چیدمان‌های ذخیره‌شده</h2>
    <div class="row"><span>اعمال خودکار پیش از بازی</span><b>${p.autoPresets !== false ? 'روشن ✅' : 'خاموش'}</b></div>
    <div class="grid2" style="margin-top:8px;">
      <div class="formation-opt ${p.autoPresets !== false ? 'active' : ''}" onclick="setPref('autoPresets', true)">خودکار</div>
      <div class="formation-opt ${p.autoPresets === false ? 'active' : ''}" onclick="setPref('autoPresets', false)">دستی</div>
    </div>
    <p class="muted" style="font-size:0.72rem; margin-top:10px; line-height:1.8;">اگر روشن باشد، پیش از بازی لیگ چیدمان «لیگ» و پیش از بازی جام، چیدمان «جام» به‌طور خودکار اعمال می‌شود. چیدمان‌ها را در تب «تیم من ← چیدمان» ذخیره کن.</p>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>اطلاعات فنی</h2>
    <div class="row"><span>نسخه‌ی موتور مسابقه</span><b>${ENGINE_VERSION}</b></div>
    <div class="row"><span>تعداد گزارش ذخیره‌شده</span><b>${(state.matchReports||[]).length}</b></div>
    <div class="row"><span>فصل / هفته</span><b>${faNum(state.season)} / ${faNum(Math.min(state.week, state.league.fixtures.length))}</b></div>
  </div>`;
}
function setPref(key, val){
  if(!state.prefs) state.prefs = {};
  state.prefs[key] = val;
  render();
  showToast('تنظیم ذخیره شد ✅', 'success');
}
function setLiveSpeedPref(k){
  if(!state.prefs) state.prefs = {};
  state.prefs.liveSpeed = k;
  render();
}

function barHtml(val){ const cls = val<45?"low":(val<70?"mid":""); return `<span class="bar-wrap"><span class="bar ${cls}" style="width:${clamp(val,0,100)}%"></span></span>`; }

function renderDashboard(){
  const nextFixture = getUserFixture(state.week);
  const homeName = nextFixture ? nextFixture.home : null;
  const awayName = nextFixture ? nextFixture.away : null;
  const oppName = nextFixture ? (homeName===state.clubName ? awayName : homeName) : null;
  const seasonOver = state.week > state.league.fixtures.length;
  const starters = state.players.filter(p=>state.starters.includes(p.id));
  const holes = state.lineupSlots.filter(x=>!x).length;
  const avgFit = starters.length ? Math.round(avgOf(starters, p=>p.fitness)) : 0;
  const cupStage = state.cup.active ? state.cup.stage : null;
  const cupWeek = cupStage ? CUP_WEEKS[cupStage] : null;
  const warnings = [];
  if(holes>0) warnings.push(`<div class="row" style="color:var(--red);"><span>⚠ ترکیب ناقص است</span><b>${holes} جای خالی</b></div>`);
  if(starters.length && avgFit<70) warnings.push(`<div class="row" style="color:#f0a08a;"><span>⚠ آمادگی ترکیب پایین است</span><b>${avgFit}٪</b></div>`);
  return `
  <div class="card glass matchday-card">
    <h2><span class="dot"></span>بازی بعدی${infoBtn('dashboard')}</h2>
    ${nextFixture ? `
      <div class="matchday-teams">
        <div class="mteam">${crestImg(state.clubName,'lg')}<span>${state.clubName}</span></div>
        <div class="vs-badge">VS</div>
        <div class="mteam">${crestImg(oppName,'lg')}<span>${oppName}</span></div>
      </div>
      <div class="row"><span>میزبانی</span><b>${homeName===state.clubName ? "خانگی 🏟️" : "خارج از خانه ✈️"}</b></div>
      <div class="row"><span>آرایش تاکتیکی</span><b>${FORMATIONS[state.formation].label}</b></div>
      ${cupWeek===state.week ? `<div class="row"><span>🏆 جام حذفی</span><b>${CUP_STAGE_LABELS[cupStage]} — همین هفته</b></div>` : ''}
      <div class="row"><span>آمادگی ترکیب</span><b style="color:${avgFit<70?'#f0a08a':'var(--emerald)'};">${avgFit}٪</b></div>
      <div class="row"><span>فرم تو</span><b>${formStripHTML(userLast5()) || '<span class="muted">بدون بازی</span>'}</b></div>
      <div class="row"><span>فرم ${escapeHtml(oppName)}</span><b>${formStripHTML(teamLast5(oppName)) || '<span class="muted">بدون بازی</span>'}</b></div>
      ${warnings.join('')}
      <button class="btn primary" style="width:100%; margin-top:12px;" onclick="playWeek()">شبیه‌سازی هفته و بازی</button>
      ${holes>0 ? `<button class="btn ghost small" style="width:100%; margin-top:8px;" onclick="autoFillLineup(); render(); showToast('ترکیب خودکار چیده شد ✅','success');">چینش خودکار ترکیب</button>` : ''}
    ` : seasonOver ? `
      <div class="empty" style="padding-bottom:10px;">فصل ${state.season} تموم شد! 🏁</div>
      <button class="btn primary" style="width:100%;" onclick="endSeasonAndShowAwards()">دریافت جوایز و شروع فصل جدید</button>
    ` : `<div class="empty">بازی بعدی‌ای نیست.</div>`}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>چرخ شانس هفتگی 🎡</h2>
    <p class="muted" style="font-size:0.78rem;">هر هفته یه بار می‌تونی بچرخونی و جایزه نقدی رایگان ببری.</p>
    <button class="btn ghost" style="width:100%;" onclick="spinLucky()" ${state.lastLuckyWeek===state.week?'disabled':''}>${state.lastLuckyWeek===state.week?'این هفته چرخوندی ✓':'چرخوندن 🎡'}</button>
  </div>
  ${lastReportCardHtml()}
  ${onlineCardHtml()}
  ${asyncLeagueCardHtml()}
  ${challengeCardHtml()}
  <div class="card glass">
    <h2><span class="dot"></span>آخرین اخبار</h2>
    ${state.news.slice(0,3).map(n=>`<div class="news-item"><span>${n.tag==='match'?'⚽':n.tag==='transfer'?'💰':'📰'}</span><span>${n.msg}</span></div>`).join('') || '<div class="empty">خبری نیست</div>'}
  </div>`;
}
function spinLucky(){
  if(state.lastLuckyWeek===state.week){ showToast('این هفته قبلاً چرخوندی.', 'error'); return; }
  const prize = pick(LUCKY_PRIZES);
  state.budget += prize;
  state.lastLuckyWeek = state.week;
  addNews(`از چرخ شانس هفتگی ${fmtMoney(prize)} بردی!`, 'transfer');
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <div class="confetti-wrap">${confettiHtml(20)}</div>
        <div style="text-align:center;">
          <div style="font-size:2.4rem;">🎉</div>
          <h2 style="justify-content:center; margin-top:8px;">بردی!</h2>
          <div style="font-size:1.6rem; font-weight:800; color:var(--emerald); margin:8px 0;">${fmtMoney(prize)}</div>
          <p class="muted" style="font-size:0.8rem;">به بودجه‌ت اضافه شد.</p>
        </div>
        <button class="btn primary" style="width:100%; margin-top:14px;" onclick="closeOverlay('genericModal')">عالیه!</button>
      </div>
    </div>`;
  render();
}
function getUserFixture(week){ const round = state.league.fixtures[week-1]; if(!round) return null; return round.find(m => m.home===state.clubName || m.away===state.clubName) || null; }

function renderSquad(){
  const byPos = pos => state.players.filter(p=>p.position===pos).sort((a,b)=>overallOf(b)-overallOf(a));
  const posBlock = pos => `<h3 class="muted" style="margin:14px 0 8px; font-size:0.85rem;">${POS_FA[pos]}ها</h3>${byPos(pos).map(p=>playerRow(p)).join('')}`;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>لیست نفرات (${state.players.length} بازیکن)</h2>
    <p class="muted" style="font-size:0.75rem;">برای چیدن ترکیب اصلی به تب «چیدمان» برو.</p>
    ${POSITIONS.map(posBlock).join('')}
  </div>`;
}
function playerRow(p){
  const isStarter = state.starters.includes(p.id);
  const isCap = state.captainId===p.id;
  const badges = (isStarter?' <span class="pill" style="background:rgba(52,211,153,0.18);color:#a7f3d4;">ترکیب اصلی</span>':'') + (isCap?' 👑':'');
  const meta = `${p.age} ساله · امتیاز ${overallOf(p)} · آمادگی ${p.fitness}٪ · استقامت ${p.stamina}`;
  const right = `<div style="text-align:left;"><div class="meta">حمله ${barHtml(p.attack)}</div><div class="meta">دفاع ${barHtml(p.defense)}</div></div>`;
  return playerRowHTML(p, right, {meta, badges, onclick:`openPlayerCard('${p.id}')`});
}
/* کارت کامل بازیکن: همه‌ی آمارهایی که در بازی اثر دارند */
function openPlayerCard(pid){
  const inSquad = state.players.some(x=>x.id===pid);
  const p = state.players.find(x=>x.id===pid) || state.transferMarket.find(x=>x.id===pid);
  if(!p) return;
  const contractLine = inSquad
    ? `<div class="row"><span>قرارداد</span><b>${p.contractYears} فصل</b></div>`
    : `<div class="row"><span>وضعیت</span><b>در بازار نقل و انتقالات</b></div>`;
  const statRow = (label, val) => `<div class="row"><span>${label}</span><b>${val} <span style="display:inline-block;width:56px;vertical-align:middle;">${barHtml(val)}</span></b></div>`;
  const posFit = inSquad ? getSlotTemplate(state.formation)[state.lineupSlots.indexOf(p.id)] : null;
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
          ${avatarImg(p.id,'lg',p.morale)}
          <div style="flex:1; min-width:0;">
            <div style="font-weight:800; font-size:1.05rem;">${escapeHtml(p.name)}</div>
            <div class="muted" style="font-size:0.76rem;">${posLabel(p)} · ${p.age} ساله${p.id===state.captainId?' · کاپیتان 👑':''}</div>
          </div>
        </div>
        ${statRow('حمله', p.attack)}
        ${statRow('دفاع', p.defense)}
        ${statRow('سرعت', p.pace)}
        ${statRow('استقامت', p.stamina)}
        ${statRow('آمادگی', p.fitness)}
        ${statRow('روحیه', p.morale)}
        <div class="row"><span>امتیاز کلی</span><b style="font-size:1.05rem;">${overallOf(p)}</b></div>
        <div class="row"><span>پتانسیل</span><b>${p.potential}${p.potential-overallOf(p)>0?` <span class="muted">(+${p.potential-overallOf(p)})</span>`:''}</b></div>
        <div class="row"><span>ارزش / دستمزد هفتگی</span><b>${fmtMoney(p.value)} · ${fmtMoney(p.wage)}</b></div>
        ${contractLine}
        <div class="row"><span>پست‌ها</span><b>${posLabel(p)}${positionsOf(p).length>1?' <span class="muted">(چندپسته)</span>':''}</b></div>
        ${posFit ? `<div class="row"><span>وضعیت در ترکیب</span><b>${POS_FA[posFit.role]}${playsIn(p,posFit.role)?(p.position===posFit.role?'':' <span class="muted">(پست دوم)</span>'):' <span style="color:var(--amber);">(خارج از پست)</span>'}</b></div>` : ''}
        <button class="btn ghost" style="width:100%; margin-top:12px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}

/* ---------- Lineup / pitch tab ---------- */
function renderLineup(){
  const template = getSlotTemplate(state.formation);
  const filledIds = state.lineupSlots.filter(Boolean);
  const filledPlayers = filledIds.map(id=>state.players.find(p=>p.id===id)).filter(Boolean);
  const avgOv = filledPlayers.length ? Math.round(avgOf(filledPlayers, p=>overallOf(p))) : 0;
  const avgFit = filledPlayers.length ? Math.round(avgOf(filledPlayers, p=>p.fitness)) : 0;
  const outOfPos = template.filter((slot,i)=>{ const p = filledPlayers.find(x=>x.id===state.lineupSlots[i]); return p && !playsIn(p, slot.role); });
  const benchPlayers = state.players.filter(p=>!state.lineupSlots.includes(p.id));
  return `
  <div class="card glass">
    <h2><span class="dot"></span>فرمیشن${infoBtn('lineup')}</h2>
    <div class="grid2">
      ${Object.entries(FORMATIONS).map(([key,f])=>`<div class="formation-opt" style="font-size:0.72rem; padding:9px;${state.formation===key?' border-color:var(--cyan); background:rgba(34,211,238,0.1); color:#7fe8ff; font-weight:800;':''}" onclick="setFormation('${key}')">${f.label}</div>`).join('')}
    </div>
    <div class="row" style="margin-top:6px;"><span>پر شده</span><b style="color:${filledIds.length<11?'var(--red)':'inherit'};">${filledIds.length} / 11</b></div>
    <div class="row"><span>میانگین امتیاز ترکیب</span><b>${avgOv||'-'}</b></div>
    <div class="row"><span>میانگین آمادگی</span><b style="color:${avgFit<70?'#f0a08a':'var(--emerald)'};">${avgFit||'-'}٪</b></div>
    <div class="row"><span>بازیکن خارج از پست</span><b>${outOfPos.length?outOfPos.length+' نفر ⚠':'هیچ'}</b></div>
    <div class="row"><span>بازیکن چندپسته</span><b>${filledPlayers.filter(p=>positionsOf(p).length>1).length} نفر</b></div>
    ${filledIds.length<11?`<p style="color:#f0a08a; font-size:0.75rem; margin:8px 0 0;">برای شروع بازی باید هر ۱۱ جایگاه پر باشد.</p>`:''}
    <div style="display:flex; gap:8px; margin-top:10px;">
      <button class="btn ghost small" style="flex:1;" onclick="autoFillLineup(); render();">چینش خودکار</button>
      <button class="btn danger small" style="flex:1;" onclick="clearLineup();">خالی کردن همه</button>
    </div>
  </div>
  <div class="card glass">
    <div class="pitch-wrap">
      <svg class="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="2" y="2" width="96" height="96" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <circle cx="50" cy="50" r="13" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <circle cx="50" cy="50" r="0.8" fill="rgba(255,255,255,0.35)"/>
        <rect x="30" y="2" width="40" height="16" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <rect x="40" y="2" width="20" height="7" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <rect x="30" y="82" width="40" height="16" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
        <rect x="40" y="91" width="20" height="7" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="0.6"/>
      </svg>
      ${template.map((slot,i)=>{
        const pid = state.lineupSlots[i];
        const p = pid ? state.players.find(x=>x.id===pid) : null;
        const isCap = p && state.captainId===p.id;
        return `
        <div class="slot ${p?'filled':''} ${isCap?'captain':''}" style="left:${slot.x}%; top:${slot.y}%;" onclick="openPicker(${i})">
          <div class="circle">
            ${p ? avatarSVG(p.id,p.morale) : `<span class="empty-plus">+</span>`}
            ${p ? `<div class="ov">${overallOf(p)}</div>` : ''}
            ${p ? `<div class="cap-btn" onclick="event.stopPropagation(); toggleCaptain('${p.id}')">${isCap?'👑':'☆'}</div>` : ''}
          </div>
          <div class="lbl">${p ? p.name.split(' ').slice(-1)[0] : POS_FA[slot.role]}</div>
        </div>`;
      }).join('')}
    </div>
  </div>
  ${lineupPresetsCard()}
  <div class="card glass">
    <h2><span class="dot"></span>نیمکت (${benchPlayers.length} نفر)</h2>
    ${benchPlayers.sort((a,b)=>overallOf(b)-overallOf(a)).map(p=>playerRowHTML(p, `<button class="btn small ghost" onclick="event.stopPropagation(); addToFirstEmptySlot('${p.id}')">افزودن به زمین</button>`, {meta:`امتیاز ${overallOf(p)} · آمادگی ${p.fitness}٪`, onclick:`openPlayerCard('${p.id}')`})).join('') || '<div class="empty">همه بازیکنا توی زمین هستن</div>'}
  </div>`;
}
function openPicker(slotIndex){
  const template = getSlotTemplate(state.formation);
  const slot = template[slotIndex];
  const currentId = state.lineupSlots[slotIndex];
  const sorted = state.players.slice().sort((a,b)=>{
    const aMatch = a.position===slot.role?0:1, bMatch=b.position===slot.role?0:1;
    if(aMatch!==bMatch) return aMatch-bMatch;
    return overallOf(b)-overallOf(a);
  });
  document.getElementById('pickerModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('pickerModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>انتخاب برای جایگاه ${POS_FA[slot.role]}</h2>
        ${currentId ? `<button class="btn danger small" style="width:100%; margin-bottom:10px;" onclick="clearSlot(${slotIndex})">خالی کردن این جایگاه</button>` : ''}
        <div style="max-height:50vh; overflow-y:auto;">
        ${sorted.map(p=>{
          const usedElsewhere = state.lineupSlots.includes(p.id) && p.id!==currentId;
          const fitColor = p.fitness<60?'color:#f0a08a;':'';
          const wrongPos = !playsIn(p, slot.role) ? ' <span style="color:var(--amber);">(خارج از پست)</span>' : (p.position===slot.role ? '' : ' <span class="muted">(پست دوم)</span>');
          return playerRowHTML(p, `<button class="btn small ${p.id===currentId?'ghost':'primary'}" onclick="assignToSlot(${slotIndex},'${p.id}')">${p.id===currentId?'انتخاب شده':'انتخاب'}</button>`, {meta:`امتیاز ${overallOf(p)} · <span style="${fitColor}">آمادگی ${p.fitness}٪</span>${wrongPos}${usedElsewhere?' · توی جای دیگه‌ست':''}`});
        }).join('')}
        </div>
        <button class="btn ghost" style="width:100%; margin-top:12px;" onclick="closeOverlay('pickerModal')">بستن</button>
      </div>
    </div>`;
}
function assignToSlot(slotIndex, playerId){
  state.lineupSlots = state.lineupSlots.map(id=> id===playerId?null:id);
  state.lineupSlots[slotIndex]=playerId;
  syncStartersFromLineup();
  closeOverlay('pickerModal');
  render();
}
function clearSlot(slotIndex){
  state.lineupSlots[slotIndex]=null;
  syncStartersFromLineup();
  closeOverlay('pickerModal');
  render();
}
function addToFirstEmptySlot(playerId){
  if(state.lineupSlots.includes(playerId)){ showToast('این بازیکن از قبل توی ترکیبه.'); return; }
  const template = getSlotTemplate(state.formation);
  const player = state.players.find(p=>p.id===playerId);
  let idx = template.findIndex((slot,i)=> !state.lineupSlots[i] && slot.role===player.position);
  if(idx===-1) idx = state.lineupSlots.findIndex(id=>!id);
  if(idx===-1){ showToast('ترکیب پره! اول یک نفر رو از زمین خارج کن.', 'error'); return; }
  state.lineupSlots[idx]=playerId;
  syncStartersFromLineup();
  render();
}
function toggleCaptain(playerId){ state.captainId = state.captainId===playerId?null:playerId; render(); }
function setFormation(key){
  const oldTemplate = getSlotTemplate(state.formation);
  const oldAssigned = state.lineupSlots ? state.lineupSlots.map((id,i)=>({id, role: oldTemplate[i] ? oldTemplate[i].role : null})).filter(x=>x.id) : [];
  state.formation = key;
  const template = getSlotTemplate(key);
  const grouped = {};
  oldAssigned.forEach(a=>{ (grouped[a.role]=grouped[a.role]||[]).push(a.id); });
  state.lineupSlots = template.map(slot=>{ const arr = grouped[slot.role]; return (arr && arr.length) ? arr.shift() : null; });
  syncStartersFromLineup();
  render();
}

/* ---------- چیدمان‌های ذخیره‌شده (لیگ / جام / دوستانه) ---------- */
const PRESET_LABELS = { league:'لیگ', cup:'جام حذفی', friendly:'دوستانه' };
function captureLineup(){
  return {
    formation: state.formation,
    slots: state.lineupSlots.slice(),
    captainId: state.captainId,
    style: state.style,
    savedAt: Date.now()
  };
}
function applyLineupSnapshot(snap){
  if(!snap) return false;
  state.formation = FORMATIONS[snap.formation] ? snap.formation : state.formation;
  const slots = Array.isArray(snap.slots) && snap.slots.length === 11 ? snap.slots : null;
  if(slots) state.lineupSlots = slots.map(id=>(id && state.players.some(p=>p.id===id)) ? id : null);
  if(snap.captainId && state.players.some(p=>p.id===snap.captainId)) state.captainId = snap.captainId;
  if(STYLES[snap.style]) state.style = snap.style;
  syncStartersFromLineup();
  return true;
}
function saveLineupPreset(key){
  if(state.starters.length !== 11){
    showToast('برای ذخیره‌ی چیدمان، اول باید هر ۱۱ جایگاه پر باشد.', 'error');
    return;
  }
  state.lineupPresets = state.lineupPresets || {};
  state.lineupPresets[key] = captureLineup();
  addNews(`چیدمان «${PRESET_LABELS[key]}» ذخیره شد.`, 'info');
  showToast(`چیدمان ${PRESET_LABELS[key]} ذخیره شد ✅`, 'success');
  render();
}
function loadLineupPreset(key){
  const snap = state.lineupPresets ? state.lineupPresets[key] : null;
  if(!snap){ showToast(`چیدمانی برای «${PRESET_LABELS[key]}» ذخیره نکرده‌ای.`); return; }
  applyLineupSnapshot(snap);
  showToast(`چیدمان ${PRESET_LABELS[key]} بارگذاری شد ✅`, 'success');
  render();
}
function deleteLineupPreset(key){
  askConfirm({
    title:'حذف چیدمان ذخیره‌شده',
    body:`چیدمان «${PRESET_LABELS[key]}» حذف شود؟`,
    yes:'حذف کن', danger:true,
    onYes:()=>{ state.lineupPresets[key] = null; showToast('حذف شد'); render(); }
  });
}
function lineupPresetsCard(){
  const presets = state.lineupPresets || {};
  const fmtWhen = ts => { try{ return new Date(ts).toLocaleDateString('fa-IR'); }catch(e){ return ''; } };
  const current = captureLineup();
  return `
  <div class="card glass">
    <h2><span class="dot"></span>چیدمان‌های ذخیره‌شده${infoBtn('presets')}</h2>
    <p class="muted" style="font-size:0.76rem; line-height:1.8;">برای هر بستر بازی یک چیدمان ذخیره کن؛ لازم نیست هر بار از نو بچینی.</p>
    ${['league','cup','friendly'].map(k=>{
      const p = presets[k];
      return `<div class="preset-row">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:700; font-size:0.85rem;">${PRESET_LABELS[k]}</div>
          <div class="meta">${p ? `${FORMATIONS[p.formation].label} · ذخیره‌شده ${fmtWhen(p.savedAt)}` : '<span class="muted">ذخیره نشده</span>'}</div>
        </div>
        <button class="btn small primary" onclick="saveLineupPreset('${k}')">ذخیره</button>
        <button class="btn small ghost" onclick="loadLineupPreset('${k}')" ${p?'':'disabled'}>بارگذاری</button>
        ${p?`<button class="btn small danger" onclick="deleteLineupPreset('${k}')">حذف</button>`:''}
      </div>`;
    }).join('')}
    <div class="row" style="margin-top:8px;"><span>اعمال خودکار پیش از بازی</span><b>${(state.prefs&&state.prefs.autoPresets!==false)?'روشن ✅':'خاموش'}</b></div>
  </div>`;
}

/* ---------- Tactics tab ---------- */
function renderTactics(){
  const cap = state.captainId ? state.players.find(x=>x.id===state.captainId) : null;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>سبک بازی${infoBtn('tactics')}</h2>
    <div class="grid3">${Object.entries(STYLES).map(([key,s])=>`<div class="formation-opt ${state.style===key?'active':''}" onclick="setStyle('${key}')">${s.label}</div>`).join('')}</div>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>کاپیتان تیم</h2>
    ${cap ? playerRowHTML(cap, '', {meta:'کاپیتان فعلی · ۳٪ افزایش قدرت ترکیب'}) : '<div class="empty">از تب «چیدمان» با زدن ⭐ روی کارت بازیکن، کاپیتان رو انتخاب کن.</div>'}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>آرایش فعلی</h2>
    <div class="row"><span>فرمیشن</span><b>${FORMATIONS[state.formation].label}</b></div>
    <div class="row"><span>نفرات چیده‌شده</span><b>${state.lineupSlots.filter(Boolean).length} / 11</b></div>
  </div>`;
}
function setStyle(key){ state.style = key; render(); }

/* ---------- Training tab ---------- */
function renderTraining(){
  const plan = state.trainingPlan;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>برنامه تمرینی هفتگی${infoBtn('training')}</h2>
    <div class="grid3">
      ${plan.sessions.map((s,i)=>`
        <div>
          <label class="muted" style="font-size:0.68rem;">جلسه ${i+1}</label>
          <select onchange="setSession(${i}, this.value)" style="margin-top:4px;">
            ${Object.entries(SESSION_LABELS).map(([k,l])=>`<option value="${k}" ${s===k?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>شدت تمرین</h2>
    <div class="grid3">${Object.entries(INTENSITY_LABELS).map(([k,l])=>`<div class="formation-opt ${plan.intensity===k?'active':''}" onclick="setIntensity('${k}')">${l}</div>`).join('')}</div>
    ${plan.intensity==='heavy' ? '<p style="color:#f0a08a; font-size:0.75rem; margin-top:8px;">⚠ تمرین سنگین رشد رو بیشتر می‌کنه اما ریسک افت آمادگی بازیکنان اصلی رو بالا می‌بره.</p>' : ''}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>بازیکنان ویژه (حداکثر ۲ نفر)</h2>
    ${state.players.slice().sort((a,b)=>overallOf(b)-overallOf(a)).map(p=>{
      const active = plan.focusPlayerIds.includes(p.id);
      return playerRowHTML(p, `<div style="font-size:1.1rem;">${active?'⭐':'☆'}</div>`, {meta:`${POS_FA[p.position]} · امتیاز ${overallOf(p)}`, highlight:active, onclick:`toggleFocus('${p.id}')`});
    }).join('')}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>خلاصه اثر این هفته</h2>
    ${renderTrainingPreview()}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>اردوی ریکاوری</h2>
    <p class="muted" style="font-size:0.78rem;">آمادگی همه‌ی بازیکن‌ها رو فوری به ۱۰۰٪ می‌رسونه. تعداد استفاده‌ی باقی‌مانده این فصل: <b style="color:var(--emerald);">${state.recoveryCamps}</b></p>
    <button class="btn ghost" style="width:100%;" onclick="useRecoveryCamp()" ${state.recoveryCamps<=0?'disabled':''}>استفاده از اردوی ریکاوری</button>
  </div>`;
}
function useRecoveryCamp(){
  if(state.recoveryCamps<=0){ showToast('اردوی ریکاوری‌ای برات نمونده.', 'error'); return; }
  state.players.forEach(p=>{ p.fitness=100; p.morale=clamp(p.morale+5,0,100); });
  state.recoveryCamps--;
  addNews('از یه اردوی ریکاوری استفاده کردی؛ آمادگی همه‌ی بازیکن‌ها پر شد.', 'info');
  showToast('آمادگی تیم پر شد ✅', 'success');
  render();
}
function setSession(i,val){ state.trainingPlan.sessions[i]=val; render(); }
function setIntensity(val){ state.trainingPlan.intensity=val; render(); }
function toggleFocus(id){
  const arr = state.trainingPlan.focusPlayerIds;
  if(arr.includes(id)){ state.trainingPlan.focusPlayerIds = arr.filter(x=>x!==id); }
  else { if(arr.length>=2){ showToast('حداکثر ۲ بازیکن ویژه می‌تونی انتخاب کنی.'); return; } arr.push(id); }
  render();
}
function renderTrainingPreview(){
  const plan = state.trainingPlan;
  const atk = plan.sessions.filter(s=>s==='attack').length + plan.sessions.filter(s=>s==='tactical').length*0.5;
  const def = plan.sessions.filter(s=>s==='defense').length + plan.sessions.filter(s=>s==='tactical').length*0.5;
  const rec = plan.sessions.filter(s=>s==='recovery').length;
  const phys = plan.sessions.filter(s=>s==='physical').length;
  const lvl = v => v<=0?'هیچ':(v<1?'کم':(v<2?'متوسط':'زیاد'));
  return `
    <div class="row"><span>رشد حمله</span><b>${lvl(atk)}</b></div>
    <div class="row"><span>رشد دفاع</span><b>${lvl(def)}</b></div>
    <div class="row"><span>ریکاوری آمادگی</span><b>${lvl(rec)}</b></div>
    <div class="row"><span>رشد بدنی/استقامت</span><b>${lvl(phys)}</b></div>
    <div class="row"><span>ریسک افت آمادگی</span><b style="color:${plan.intensity==='heavy'?'#f0a08a':'inherit'}">${INTENSITY_LABELS[plan.intensity]}</b></div>`;
}

/* ---------- Market ---------- */
function renderMarketBuy(){
  return `
  <div class="card glass">
    <h2><span class="dot"></span>بازار نقل و انتقالات${infoBtn('market')}</h2>
    <p class="muted" style="font-size:0.8rem;">بودجه فعلی: <b style="color:var(--emerald);">${fmtMoney(state.budget)}</b></p>
    ${state.transferMarket.map(p=>playerRowHTML(p, `<div style="text-align:left;"><div style="font-weight:800; color:var(--emerald); font-size:0.8rem;">${fmtMoney(p.value)}</div><button class="btn small primary" onclick="event.stopPropagation(); buyPlayer('${p.id}')" ${state.budget<p.value?'disabled':''}>خرید</button></div>`, {meta:`${p.age} ساله · ${posLabel(p)} · امتیاز ${overallOf(p)} · پتانسیل ${p.potential} · دستمزد ${fmtMoney(p.wage)}/هفته`, onclick:`openPlayerCard('${p.id}')`})).join('') || '<div class="empty">بازار خالیه</div>'}
    <div class="row" style="margin-top:10px;"><span>تازه‌سازی‌های این فصل</span><b>${state.marketRefreshes||0}</b></div>
    <button class="btn ghost" style="width:100%;" onclick="refreshMarket()" ${state.budget<MARKET_REFRESH_COST?'disabled':''}>تازه‌سازی بازار (${fmtMoney(MARKET_REFRESH_COST)})</button>
    <p class="muted" style="font-size:0.7rem; margin-top:6px;">هر تازه‌سازی فهرست جدیدی از بازیکنان می‌آورد و هزینه‌ی آن از بودجه کم می‌شود.</p>
  </div>`;
}
function renderMarketSell(){
  return `
  <div class="card glass">
    <h2><span class="dot"></span>فروش بازیکن${infoBtn('market')}</h2>
    ${state.players.slice().sort((a,b)=>overallOf(b)-overallOf(a)).map(p=>playerRowHTML(p, `<div style="text-align:left;"><div class="meta" style="color:var(--emerald); font-weight:800;">${fmtMoney(Math.round(p.value*0.85))}</div><button class="btn small danger" onclick="sellPlayer('${p.id}')">فروش</button></div>`, {meta:`امتیاز ${overallOf(p)} · ارزش ${fmtMoney(p.value)}${state.starters.includes(p.id)?' · <span style="color:var(--amber);">ترکیب اصلی</span>':''}`, onclick:`openPlayerCard('${p.id}')`})).join('')}
  </div>`;
}
function buyPlayer(id){
  const p = state.transferMarket.find(x=>x.id===id);
  if(!p) return;
  if(state.budget < p.value){ showToast("بودجه کافی نداری!", 'error'); return; }
  state.budget -= p.value;
  state.players.push(p);
  state.transferMarket = state.transferMarket.filter(x=>x.id!==id);
  addNews(`${p.name} با مبلغ ${fmtMoney(p.value)} به تیم پیوست.`, "transfer");
  showToast(`${p.name} خریداری شد ✅`, 'success');
  render();
}
function sellPlayer(id){
  const p = state.players.find(x=>x.id===id);
  if(!p) return;
  if(state.players.length<=12){ showToast("نمی‌تونی بازیکن بفروشی؛ فهرست تیمت از حد لازم کمتر می‌شه!", 'error'); return; }
  const sellPrice = Math.round(p.value*0.85);
  askConfirm({
    title:'فروش بازیکن',
    body:`${escapeHtml(p.name)} (${posLabel(p)}، امتیاز ${overallOf(p)}) به قیمت <b>${fmtMoney(sellPrice)}</b> فروخته شود؟`,
    yes:'بله، بفروش', danger:true,
    onYes:()=>{
      state.budget += sellPrice;
      state.players = state.players.filter(x=>x.id!==id);
      state.lineupSlots = state.lineupSlots.map(x=>x===id?null:x);
      if(state.captainId===id) state.captainId=null;
      syncStartersFromLineup();
      addNews(`${p.name} با مبلغ ${fmtMoney(sellPrice)} فروخته شد.`, "transfer");
      const holes = state.lineupSlots.filter(x=>!x).length;
      if(holes>0) addNews(`بعد از فروش ${p.name}، ${holes} جایگاه در ترکیب خالی شد.`, "info");
      showToast(`${p.name} فروخته شد`, 'success');
      render();
      if(holes>0) showToast(`⚠ ${holes} جای خالی در ترکیب داری (تیم من ← چیدمان).`);
    }
  });
}
function refreshMarket(){
  if(state.budget < MARKET_REFRESH_COST){ showToast('بودجه کافی برای تازه‌سازی بازار نداری.', 'error'); return; }
  state.budget -= MARKET_REFRESH_COST;
  state.marketRefreshes = (state.marketRefreshes||0) + 1;
  state.transferMarket = genMarket();
  showToast('بازار تازه شد', 'success');
  render();
}

/* ---------- League / stats / news ---------- */
function renderLeagueTable(){
  const table = state.league.teams.slice().sort((a,b)=> b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf);
  const seasonDone = state.week > state.league.fixtures.length;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>جدول لیگ — فصل ${state.season}${infoBtn('league')}</h2>
    <table class="league">
      <tr><th>#</th><th style="text-align:right;">تیم</th><th>ب</th><th>ب.ب</th><th>م</th><th>ب.خ</th><th>گ.ز</th><th>گ.خ</th><th>امت</th></tr>
      ${table.map((t,i)=>`<tr class="${t.isUser?'me':''} ${i<3?'zone-top':''} ${i>=table.length-2?'zone-bottom':''}"><td>${i+1}</td><td class="team-name"><span class="mini-crest">${crestSVG(t.name)}</span>${t.name}</td><td>${t.played}</td><td>${t.won}</td><td>${t.draw}</td><td>${t.lost}</td><td>${t.gf}</td><td>${t.ga}</td><td><b>${t.pts}</b></td></tr>`).join('')}
    </table>
  </div>
  ${seasonDone ? `<div class="card glass"><h2><span class="dot"></span>فصل تموم شد!</h2><p class="muted">رتبه نهایی تیم تو: ${table.findIndex(t=>t.isUser)+1} از ${table.length}</p><button class="btn primary" style="width:100%;" onclick="endSeasonAndShowAwards()">دریافت جوایز و شروع فصل جدید</button></div>` : ''}`;
}
function renderSeasonStats(){
  const topN = (dict,n)=> Object.entries(dict).map(([id,val])=>({p:state.players.find(x=>x.id===id),val})).filter(x=>x.p).sort((a,b)=>b.val-a.val).slice(0,n);
  const scorers = topN(state.seasonStats.goals,5);
  const assisters = topN(state.seasonStats.assists,5);
  const keepers = topN(state.seasonStats.cleanSheets,5);
  const block = (title,icon,list,unit) => `
    <div class="card glass">
      <h2><span class="dot"></span>${icon} ${title}${infoBtn('stats')}</h2>
      ${list.length ? list.map(x=>playerRowHTML(x.p, `<b>${x.val} ${unit}</b>`, {meta:POS_FA[x.p.position]})).join('') : '<div class="empty">هنوز آماری ثبت نشده</div>'}
    </div>`;
  return block('آقای گل فصل','⚽',scorers,'گل') + block('آقای پاس‌گل فصل','🎯',assisters,'پاس‌گل') + block('برترین دروازه‌بان','🧤',keepers,'کلین‌شیت');
}
function renderNews(){
  return `<div class="card glass"><h2><span class="dot"></span>اخبار باشگاه</h2>${state.news.map(n=>`<div class="news-item"><span>${n.tag==='match'?'⚽':n.tag==='transfer'?'💰':'📰'}</span><span>هفته ${n.week}، فصل ${n.season}: ${n.msg}</span></div>`).join('') || '<div class="empty">هنوز خبری نیست</div>'}</div>`;
}

/* ---------- Cup ---------- */
function renderCup(){
  const cup = state.cup;
  const stageLabel = CUP_STAGE_LABELS[cup.stage] || cup.stage;
  let statusHtml;
  if(cup.stage==='champion') statusHtml = `<div class="empty" style="color:var(--amber);">🏆 امسال قهرمان جام شدی!</div>`;
  else if(cup.stage==='out') statusHtml = `<div class="empty">امسال توی جام حذف شدی.</div>`;
  else {
    const targetWeek = CUP_WEEKS[cup.stage];
    const weeksLeft = targetWeek - state.week;
    statusHtml = `<div class="row"><span>مرحله فعلی</span><b>${stageLabel}</b></div><div class="row"><span>هفته‌ی بازی</span><b>هفته ${targetWeek}</b></div><div class="row"><span>باقی‌مانده</span><b>${weeksLeft>0?`${weeksLeft} هفته دیگه`:'همین هفته'}</b></div>`;
  }
  return `
  <div class="card glass">
    <h2><span class="dot"></span>جام حذفی${infoBtn('cup')}</h2>
    ${statusHtml}
    <p class="muted" style="font-size:0.72rem; margin-top:6px;">مراحل یک‌ضرب هستند: اگر در ۹۰ دقیقه مساوی شوی، کار به ضربات پنالتی می‌کشد. فینال در زمین بی‌طرف برگزار می‌شود.</p>
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>نتایج جام این فصل</h2>
    ${cup.log.length ? cup.log.map(l=>`<div class="row"><span>${CUP_STAGE_LABELS[l.stage]} مقابل ${l.opponent}${l.neutral?' <span class="muted">(بی‌طرف)</span>':(l.atHome===false?' <span class="muted">(میهمان)</span>':'')}</span><b style="color:${l.won?'var(--emerald)':'var(--red)'};">${l.score} ${l.won?'✅':'❌'}</b></div>`).join('') : '<div class="empty">هنوز بازی جامی برگزار نشده</div>'}
  </div>`;
}

/* ---------- Club facilities (coach / stadium) ---------- */
function renderClubFacilities(){
  const currentCoach = COACHES.find(c=>c.id===state.coachId);
  const level = STADIUM_LEVELS[state.stadiumLevel];
  const nextLevel = STADIUM_LEVELS[state.stadiumLevel+1];
  return `
  <div class="card glass">
    <h2><span class="dot"></span>مربی تیم${infoBtn('club')}</h2>
    <p class="muted" style="font-size:0.78rem;">مربی روی رشد تمرینی و قدرت تیم توی مسابقه اثر مثبت می‌ذاره، ولی دستمزد هفتگی داره.</p>
    ${COACHES.map(c=>`
      <div class="player-row" style="cursor:pointer;${state.coachId===c.id?'background:rgba(34,211,238,0.08); border-radius:12px;':''}" onclick="hireCoach('${c.id}')">
        <div style="flex:1;"><div class="name">${c.name} ${state.coachId===c.id?'✅':''}</div><div class="meta">${c.desc}${c.wage?` · دستمزد ${c.wage} م.ت/هفته`:''}</div></div>
      </div>`).join('')}
  </div>
  <div class="card glass">
    <h2><span class="dot"></span>ورزشگاه</h2>
    <div class="row"><span>ظرفیت فعلی</span><b>${level.cap.toLocaleString('fa-IR')} نفره</b></div>
    ${nextLevel ? `
      <div class="row"><span>ظرفیت بعدی</span><b>${nextLevel.cap.toLocaleString('fa-IR')} نفره</b></div>
      <button class="btn primary" style="width:100%; margin-top:10px;" onclick="upgradeStadium()" ${state.budget<nextLevel.cost?'disabled':''}>ارتقا به ${nextLevel.cap.toLocaleString('fa-IR')} نفره (${fmtMoney(nextLevel.cost)})</button>
    ` : `<div class="empty">ورزشگاهت به بالاترین سطح رسیده 🏟️</div>`}
  </div>`;
}
function hireCoach(id){
  state.coachId = id;
  const c = COACHES.find(x=>x.id===id);
  addNews(`${c.name==='بدون مربی'?'مربی تیم رو کنار گذاشتی.':`${c.name} رو به‌عنوان مربی استخدام کردی.`}`, 'info');
  showToast('مربی تیم تغییر کرد', 'success');
  render();
}
function upgradeStadium(){
  const nextLevel = STADIUM_LEVELS[state.stadiumLevel+1];
  if(!nextLevel){ return; }
  if(state.budget < nextLevel.cost){ showToast('بودجه کافی نداری!', 'error'); return; }
  state.budget -= nextLevel.cost;
  state.stadiumLevel++;
  addNews(`ورزشگاه به ظرفیت ${nextLevel.cap.toLocaleString('fa-IR')} نفره ارتقا پیدا کرد.`, 'info');
  showToast('ورزشگاه ارتقا یافت 🏟️', 'success');
  render();
}

/* ---------- Achievements ---------- */
function renderAchievements(){
  const a = state.achievements;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>دستاوردهای باشگاه${infoBtn('achievements')}</h2>
    <div class="grid3">
      <div class="badge-week"><b>${a.leagueTitles}</b><span class="muted" style="font-size:0.68rem;">🏆 قهرمانی لیگ</span></div>
      <div class="badge-week"><b>${a.cupTitles}</b><span class="muted" style="font-size:0.68rem;">🥇 قهرمانی جام</span></div>
      <div class="badge-week"><b>${a.bestRank===99?'-':a.bestRank}</b><span class="muted" style="font-size:0.68rem;">بهترین رتبه</span></div>
    </div>
    <div class="row" style="margin-top:6px;"><span>فصل‌های سپری‌شده</span><b>${a.seasonsPlayed}</b></div>
  </div>`;
}
