/* ============================================================
   sim.js — شبیه‌سازی هفته، مسابقه، تمرین، جام و پایان فصل
   ============================================================ */

/* ================= WEEK / MATCH SIMULATION ================= */

/* قدرت تیم کاربر: حمله/دفاع با در نظر گرفتن روحیه، آمادگی، استقامت،
   فرمیشن، سبک بازی، کاپیتان و مربی. */
/* ضریب آمادگی بازیکن در پستی که بازی می‌کند (خارج از پست = ضعیف‌تر) */
function roleFitFor(playerId, slotIndex){
  const slot = getSlotTemplate(state.formation)[slotIndex];
  if(!slot) return 1;
  const p = state.players.find(x=>x.id===playerId);
  if(!p || slot.role === p.position) return 1;
  if(slot.role === 'GK') return 0.60;   /* دروازه‌بانی که دروازه‌بان نیست */
  if(p.position === 'GK') return 0.70;  /* دروازه‌بان در پست میدانی */
  return 0.85;
}
function teamStrengthFor(playersArr, starterIds){
  const slots = getSlotTemplate(state.formation);
  const picks = [];
  if(state.lineupSlots && state.lineupSlots.length === slots.length){
    state.lineupSlots.forEach((id,i)=>{
      if(!id || !starterIds.includes(id)) return;
      const p = playersArr.find(x=>x.id===id);
      if(p) picks.push({p, fit: roleFitFor(id,i)});
    });
  } else {
    starterIds.forEach(id=>{ const p = playersArr.find(x=>x.id===id); if(p) picks.push({p, fit:1}); });
  }
  if(picks.length===0) return {atk:40, def:40, fitness:0, stamina:0};
  const atk = avgOf(picks, x=>x.p.attack * x.fit);
  const def = avgOf(picks, x=>x.p.defense * x.fit);
  const morale = avgOf(picks, x=>x.p.morale);
  const fitness = avgOf(picks, x=>x.p.fitness);
  const stamina = avgOf(picks, x=>x.p.stamina);
  /* روحیه: ۰٪ → −۱۵٪ ، ۱۰۰٪ → +۱۵٪ */
  const moraleMod = 0.85 + (morale/100)*0.30;
  /* آمادگی: ۴۰٪ → −۷٪ ، ۱۰۰٪ → +۶٪  (بازیکن خسته کندتر و بی‌دقت‌تر است) */
  const fitnessMod = 0.85 + (fitness/100)*0.21;
  /* استقامت: تیم کم‌استقامت در دقایق پایانی افت می‌کند */
  const staminaMod = 0.94 + (stamina/100)*0.12;
  const fMod = FORMATIONS[state.formation];
  const sMod = STYLES[state.style];
  const capMod = (state.captainId && starterIds.includes(state.captainId)) ? 1.03 : 1;
  const coach = COACHES.find(c=>c.id===state.coachId);
  const coachMod = 1 + (coach ? coach.bonus*0.15 : 0);
  const mod = moraleMod * fitnessMod * staminaMod * capMod * coachMod;
  return {
    atk: atk * fMod.atk * sMod.atk * mod,
    def: def * fMod.def * sMod.def * mod,
    fitness, stamina
  };
}
/* رقیب‌ها فقط یک عدد قدرت دارند؛ برای یکنواختی، نوسان هفتگی کوچکی می‌گیرند */
function rivalStrength(name){
  const t = state.league.teams.find(x=>x.name===name);
  if(!t) return {atk:60, def:60};
  const f = 1 + (t.form||0);
  return {atk: t.strength*f, def: t.strength*f};
}
function simulateMatch(homeName, awayName, opts){
  const o = opts || {};
  const homeAdv = o.neutral ? 0 : 6;
  let h, a;
  if(homeName===state.clubName) h = teamStrengthFor(state.players, state.starters); else h = rivalStrength(homeName);
  if(awayName===state.clubName) a = teamStrengthFor(state.players, state.starters); else a = rivalStrength(awayName);
  const homeExpected = clamp(0.6 + (h.atk + homeAdv - a.def)/28, 0.15, 4.2);
  const awayExpected = clamp(0.6 + (a.atk - h.def)/28, 0.15, 4.2);
  return {
    home:homeName, away:awayName,
    homeGoals: poisson(homeExpected), awayGoals: poisson(awayExpected),
    neutral: !!o.neutral,
    homeStrength: (h.atk+h.def)/2, awayStrength: (a.atk+a.def)/2
  };
}
/* ضربات پنالتی: تیمی که قدرت بیشتری دارد شانس تبدیل بالاتری می‌گیرد */
function shootout(userStrength, oppStrength){
  const pUser = clamp(0.66 + (userStrength-oppStrength)/300, 0.50, 0.86);
  const pOpp  = clamp(0.66 + (oppStrength-userStrength)/300, 0.50, 0.86);
  let u = 0, o = 0;
  for(let i=0;i<5;i++){ if(Math.random()<pUser) u++; if(Math.random()<pOpp) o++; }
  while(u===o){ if(Math.random()<pUser) u++; if(Math.random()<pOpp) o++; }
  return {userScore:u, oppScore:o, userWon:u>o};
}
function userRating(){ const s = teamStrengthFor(state.players, state.starters); return (s.atk+s.def)/2; }

function updateForm(t, pts){
  t.last5 = (t.last5 || []).concat([pts]).slice(-5);
  const r = t.last5.reduce((a,b)=>a+b,0) / (t.last5.length*3);   // 0..1
  t.form = clamp((r-0.5)*0.08, -0.03, 0.03);
}
function applyResultToTable(res){
  const home = state.league.teams.find(t=>t.name===res.home);
  const away = state.league.teams.find(t=>t.name===res.away);
  if(!home || !away) return;
  home.played++; away.played++;
  home.gf += res.homeGoals; home.ga += res.awayGoals;
  away.gf += res.awayGoals; away.ga += res.homeGoals;
  if(res.homeGoals>res.awayGoals){ home.won++; home.pts+=3; away.lost++; updateForm(home,3); updateForm(away,0); }
  else if(res.homeGoals<res.awayGoals){ away.won++; away.pts+=3; home.lost++; updateForm(away,3); updateForm(home,0); }
  else { home.draw++; away.draw++; home.pts++; away.pts++; updateForm(home,1); updateForm(away,1); }
}
function attributeGoals(count){
  const starters = state.players.filter(p=>state.starters.includes(p.id));
  const pool = [];
  starters.forEach(p=>{
    let w = p.position==='FW'?4:(p.position==='MF'?2:(p.position==='DF'?0.4:0));
    w *= (p.attack/70);
    for(let i=0;i<Math.round(w*10);i++) pool.push(p.id);
  });
  const scorers=[];
  for(let i=0;i<count;i++){ if(pool.length===0) break; scorers.push(pick(pool)); }
  return scorers;
}
function attributeAssist(scorerId){
  if(Math.random()<0.2) return null;
  const starters = state.players.filter(p=>state.starters.includes(p.id) && p.id!==scorerId);
  const pool=[];
  starters.forEach(p=>{ let w = p.position==='MF'?4:(p.position==='FW'?2:(p.position==='DF'?1:0)); w*=(p.attack/70); for(let i=0;i<Math.round(w*10);i++) pool.push(p.id); });
  if(pool.length===0) return null;
  return pick(pool);
}
function applyTraining(){
  const plan = state.trainingPlan;
  const atkPoints = plan.sessions.filter(s=>s==='attack').length + plan.sessions.filter(s=>s==='tactical').length*0.5;
  const defPoints = plan.sessions.filter(s=>s==='defense').length + plan.sessions.filter(s=>s==='tactical').length*0.5;
  const physPoints = plan.sessions.filter(s=>s==='physical').length;
  const recPoints = plan.sessions.filter(s=>s==='recovery').length;
  const coach = COACHES.find(c=>c.id===state.coachId);
  const intensityMult = INTENSITY_MULT[plan.intensity] * (1 + (coach?coach.bonus:0));
  const fitnessDelta = Math.round(-(atkPoints+defPoints)*2.2*intensityMult + recPoints*10 + physPoints*2);
  const moraleDelta = Math.round(recPoints*3 - (plan.intensity==='heavy'?2:0));
  state.players.forEach(p=>{
    const ageFactor = p.age<24?1.3:(p.age>30?0.5:1);
    const isFocus = plan.focusPlayerIds.includes(p.id);
    const focusMult = isFocus?1.6:1;
    if(atkPoints>0 && p.position!=='GK') p.attack = clamp(p.attack + Math.round(rnd(0,2)*ageFactor*intensityMult*focusMult), 20, p.potential);
    if(defPoints>0) p.defense = clamp(p.defense + Math.round(rnd(0,2)*ageFactor*intensityMult*focusMult), 20, p.potential);
    if(physPoints>0) p.stamina = clamp(p.stamina + Math.round(physPoints*1.5*ageFactor), 40, 99);
    p.fitness = clamp(p.fitness + fitnessDelta, 40, 100);
    p.morale = clamp(p.morale + moraleDelta + rnd(-2,2), 20, 100);
  });
  if(plan.intensity==='heavy'){
    state.starters.forEach(id=>{
      if(Math.random()<0.06){
        const p = state.players.find(x=>x.id===id);
        if(p){ p.fitness = clamp(p.fitness-25,10,100); addNews(`${p.name} به‌خاطر شدت زیاد تمرین خسته و کم‌آمادگی شد.`, 'info'); }
      }
    });
  }
}
/* ================= جام حذفی ================= */
/* مرحله‌ی جاری جام را (اگر هفته‌اش رسیده باشد) بازی می‌کند.
   - میزبانی/میهمانی تصادفی است (فینال: زمین بی‌طرف)
   - تساوی در ۹۰ دقیقه → ضربات پنالتی
   خروجی: نتیجه برای نمایش به کاربر */
function resolveCupIfDue(){
  const cup = state.cup;
  if(!cup.active) return null;
  if(state.week !== CUP_WEEKS[cup.stage]) return null;
  const playedStage = cup.stage;                 /* مرحله‌ای که همین حالا بازی می‌شود */
  const opponent = pick(state.league.teams.filter(t=>!t.isUser));
  const isFinal = playedStage === 'final';
  const neutral = isFinal;
  const isHome = isFinal ? false : Math.random() < 0.5;
  const home = isHome ? state.clubName : opponent.name;
  const away = isHome ? opponent.name : state.clubName;
  const res = simulateMatch(home, away, {neutral});
  const myGoals = isHome ? res.homeGoals : res.awayGoals;
  const oppGoals = isHome ? res.awayGoals : res.homeGoals;
  const venue = neutral ? 'زمین بی‌طرف' : (isHome ? 'میزبان' : 'میهمان');
  let won, penTxt = '', detail = venue;
  if(myGoals === oppGoals){
    const pen = shootout(userRating(), opponent.strength);
    won = pen.userWon;
    penTxt = ` (پنالتی ${pen.userScore}–${pen.oppScore})`;
    detail += ' · کار به پنالتی کشید';
  } else won = myGoals > oppGoals;
  const score = `${myGoals}-${oppGoals}${penTxt}`;
  cup.log.push({stage:cup.stage, opponent:opponent.name, score, won, pens:!!penTxt, atHome:isHome, neutral});
  if(won){
    addNews(`${CUP_STAGE_LABELS[cup.stage]}: مقابل ${opponent.name} با نتیجه ${score} بردی.`, 'match');
    if(cup.stage==='ro8') cup.stage='semi';
    else if(cup.stage==='semi') cup.stage='final';
    else if(cup.stage==='final'){
      cup.stage='champion'; cup.active=false;
      state.budget += CUP_CHAMPION_PRIZE;
      state.achievements.cupTitles++;
      addNews(`قهرمان جام حذفی شدی! 🏆 جایزه: ${fmtMoney(CUP_CHAMPION_PRIZE)}`, 'match');
    }
  } else {
    if(cup.stage==='final'){
      state.budget += CUP_RUNNERUP_PRIZE;
      addNews(`نایب‌قهرمان جام شدی (${score} مقابل ${opponent.name}). جایزه: ${fmtMoney(CUP_RUNNERUP_PRIZE)}`, 'match');
    } else addNews(`از جام حذفی مقابل ${opponent.name} با نتیجه ${score} حذف شدی.`, 'match');
    cup.stage='out'; cup.active=false;
  }
  return {opponent:opponent.name, score, won, stageKey:playedStage, champion: cup.stage==='champion'};
}

function weeklySponsorship(){
  const table = state.league.teams.slice().sort((a,b)=> b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga));
  const rank = table.findIndex(t=>t.isUser)+1;
  const total = state.league.teams.length;
  return 35 + Math.max(0, (total-rank))*2;
}
function payWages(){
  const coach = COACHES.find(c=>c.id===state.coachId);
  const total = state.players.reduce((s,p)=>s+p.wage,0) + (coach?coach.wage:0);
  state.budget -= total;
  return total;
}
function playWeek(){
  /* اگر جای خالی/نامعتبر در ترکیب باشد، پیش از بازی اطلاع بده و ترمیم کن */
  const missingSlot = state.lineupSlots.some(id=>id && !state.players.some(p=>p.id===id));
  if(missingSlot){ state.lineupSlots = state.lineupSlots.map(id=>state.players.some(p=>p.id===id)?id:null); syncStartersFromLineup(); }
  if(state.starters.length!==11){
    const holes = state.lineupSlots.filter(x=>!x).length;
    showToast(`ترکیبت ${holes} جای خالی داره؛ تیم من ← چیدمان (یا دکمه «چینش خودکار»).`, 'error');
    return;
  }
  const round = state.league.fixtures[state.week-1];
  if(!round){
    askConfirm({title:'فصل تموم شده', body:'جوایز این فصل را دریافت کن و فصل جدید را شروع کن.', yes:'دریافت جوایز', onYes:endSeasonAndShowAwards});
    return;
  }
  const avgFitness = avgOf(state.players.filter(p=>state.starters.includes(p.id)), p=>p.fitness);
  if(avgFitness < 60) showToast(`⚠ آمادگی ترکیب ${Math.round(avgFitness)}٪ است؛ تیم خسته بازی می‌کند.`);
  let userResult = null;
  round.forEach(m=>{
    const res = simulateMatch(m.home, m.away);
    applyResultToTable(res);
    if(m.home===state.clubName || m.away===state.clubName) userResult = res;
  });
  applyTraining();
  const cupRes = resolveCupIfDue();
  const wages = payWages();
  const sponsorship = weeklySponsorship();
  state.budget += sponsorship;
  let ticket = 0;
  if(userResult){
    const wasHome = userResult.home===state.clubName;
    if(wasHome){ const cap = STADIUM_LEVELS[state.stadiumLevel].cap; ticket = Math.round(rnd(10,22) * (cap/3000)); state.budget += ticket; }
    const myGoals = wasHome?userResult.homeGoals:userResult.awayGoals;
    const oppGoals = wasHome?userResult.awayGoals:userResult.homeGoals;
    const opp = wasHome?userResult.away:userResult.home;
    const outcome = myGoals>oppGoals?"برد":(myGoals<oppGoals?"باخت":"مساوی");
    const scorers = attributeGoals(myGoals);
    scorers.forEach(sid=>{
      state.seasonStats.goals[sid] = (state.seasonStats.goals[sid]||0)+1;
      const aid = attributeAssist(sid);
      if(aid) state.seasonStats.assists[aid] = (state.seasonStats.assists[aid]||0)+1;
    });
    if(oppGoals===0){
      const gk = state.players.find(p=>p.position==='GK' && state.starters.includes(p.id));
      if(gk) state.seasonStats.cleanSheets[gk.id] = (state.seasonStats.cleanSheets[gk.id]||0)+1;
    }
    addNews(`نتیجه بازی مقابل ${opp}: ${userResult.homeGoals} - ${userResult.awayGoals} (${outcome}).`, "match");
    state.players.filter(p=>state.starters.includes(p.id)).forEach(p=>{
      p.morale = clamp(p.morale + (outcome==="برد"?4:(outcome==="باخت"?-4:0)), 20, 100);
      /* بازیکن کم‌استقامت‌تر در مسابقه بیشتر خسته می‌شود */
      const drain = rnd(5,12) * (1.25 - p.stamina/160);
      p.fitness = clamp(p.fitness - Math.round(drain), 20, 100);
    });
  }
  addNews(`گزارش مالی هفته: حقوق -${fmtMoney(wages)} · اسپانسر +${fmtMoney(sponsorship)}${ticket?` · بلیت +${fmtMoney(ticket)}`:''}`, "info");
  state.week++;
  if(state.week > state.league.fixtures.length) addNews("فصل به پایان رسید!", "info");
  render();
  if(userResult || cupRes) showMatchModal(userResult, cupRes);
}
function showMatchModal(res, cupRes){
  const parts = [];
  let anyWin = false;
  if(res){
    const wasHome = res.home===state.clubName;
    const oppName = wasHome?res.away:res.home;
    const myGoals = wasHome?res.homeGoals:res.awayGoals;
    const oppGoals = wasHome?res.awayGoals:res.homeGoals;
    const won = myGoals>oppGoals;
    if(won) anyWin = true;
    parts.push(`
      <div class="muted" style="font-size:0.72rem; text-align:center;">لیگ · هفته ${Math.min(state.week-1, state.league.fixtures.length)}</div>
      <div class="match-score" style="padding-bottom:6px;">
        <div class="teams">
          <div class="side">${crestImg(state.clubName,'lg')}<span>${state.clubName}</span></div>
          <div class="score">${myGoals} - ${oppGoals}</div>
          <div class="side">${crestImg(oppName,'lg')}<span>${oppName}</span></div>
        </div>
        <div class="muted" style="font-size:0.8rem; margin-top:6px;">${wasHome?'میزبان':'میهمان'} بودی · ${won?'🎉 بردی!':(myGoals<oppGoals?'😞 باختی':'⚖️ مساوی شد')}</div>
      </div>`);
  }
  if(cupRes){
    if(cupRes.won) anyWin = true;
    const label = cupRes.won ? (cupRes.champion ? '🏆 قهرمان جام شدی!' : 'صعود در جام حذفی') : (cupRes.stageKey==='final' ? 'نایب‌قهرمانی' : 'حذف از جام حذفی');
    parts.push(`
      <div style="border-top:1px solid var(--glass-border); margin-top:8px; padding-top:10px;">
        <div class="muted" style="font-size:0.72rem; text-align:center;">جام حذفی · ${CUP_STAGE_LABELS[cupRes.stageKey] || ''}</div>
        <div class="row"><span>نتیجه مقابل ${cupRes.opponent}</span><b style="color:${cupRes.won?'var(--emerald)':'var(--red)'};">${cupRes.score}</b></div>
        <div class="row"><span>${label}</span><b>${cupRes.won?'✅':'❌'}</b></div>
      </div>`);
  }
  document.getElementById('matchModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('matchModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        ${anyWin ? `<div class="confetti-wrap">${confettiHtml(24)}</div>` : ''}
        ${parts.join('')}
        <button class="btn primary" style="width:100%; margin-top:14px;" onclick="closeOverlay('matchModal')">ادامه</button>
      </div>
    </div>`;
}
function prizeForRank(rank, totalTeams){
  if(PRIZE_BY_RANK[rank-1]!==undefined && totalTeams===PRIZE_BY_RANK.length) return PRIZE_BY_RANK[rank-1];
  return Math.max(15, Math.round(95 - (rank-1)*(70/(totalTeams-1))));
}
function generateRivalAwardStats(){
  const rivals = state.league.teams.filter(t=>!t.isUser);
  let bestGoals=0,bestAssists=0,bestCS=0,bestGoalsTeam='',bestAssistsTeam='',bestCSTeam='';
  rivals.forEach(t=>{
    const g = Math.round(rnd(8,20)*(t.strength/70));
    const a = Math.round(rnd(6,16)*(t.strength/70));
    const cs = Math.round(rnd(3,9)*(t.strength/70));
    if(g>bestGoals){bestGoals=g;bestGoalsTeam=t.name;}
    if(a>bestAssists){bestAssists=a;bestAssistsTeam=t.name;}
    if(cs>bestCS){bestCS=cs;bestCSTeam=t.name;}
  });
  return {bestGoals,bestAssists,bestCS,bestGoalsTeam,bestAssistsTeam,bestCSTeam};
}
function topEntry(dict){
  let bestId=null,bestVal=0;
  Object.entries(dict).forEach(([id,val])=>{ if(val>bestVal){bestVal=val;bestId=id;} });
  return bestId ? {id:bestId, val:bestVal, player: state.players.find(p=>p.id===bestId)} : null;
}
function endSeasonAndShowAwards(){
  const table = state.league.teams.slice().sort((a,b)=> b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf);
  const userRank = table.findIndex(t=>t.isUser)+1;
  const prize = prizeForRank(userRank, table.length);
  const rival = generateRivalAwardStats();
  const myScorer = topEntry(state.seasonStats.goals);
  const myAssister = topEntry(state.seasonStats.assists);
  const myGK = topEntry(state.seasonStats.cleanSheets);
  const wonGolden = !!(myScorer && myScorer.val>0 && myScorer.val >= rival.bestGoals);
  const wonAssist = !!(myAssister && myAssister.val>0 && myAssister.val >= rival.bestAssists);
  const wonCS = !!(myGK && myGK.val>0 && myGK.val >= rival.bestCS);
  let bonus = prize;
  if(wonGolden) bonus += GOLDEN_BOOT_BONUS;
  if(wonAssist) bonus += ASSIST_KING_BONUS;
  if(wonCS) bonus += CLEAN_SHEET_BONUS;
  state.budget += bonus;
  state.achievements.bestRank = Math.min(state.achievements.bestRank, userRank);
  state.achievements.seasonsPlayed++;
  if(userRank===1) state.achievements.leagueTitles++;
  showSeasonAwardsModal({userRank,total:table.length,prize,rival,myScorer,myAssister,myGK,wonGolden,wonAssist,wonCS,bonus});
}
function awardLine(icon,title,wonHtml,lostText,bonusIfWon){
  return `<div class="award-row"><span class="ic">${icon}</span><div style="flex:1;"><div style="font-weight:700; font-size:0.85rem;">${title}</div><div class="muted" style="font-size:0.75rem;">${wonHtml || lostText}</div></div>${wonHtml?`<span class="amt">+${fmtMoney(bonusIfWon)}</span>`:''}</div>`;
}
function showSeasonAwardsModal(d){
  const goldenHtml = d.wonGolden ? `تو با ${d.myScorer.val} گل، آقای گل لیگ شدی! 🥇` : (d.rival.bestGoalsTeam ? `برنده: ${d.rival.bestGoalsTeam} (${d.rival.bestGoals} گل)` : '—');
  const assistHtml = d.wonAssist ? `تو با ${d.myAssister.val} پاس‌گل، آقای پاس‌گل لیگ شدی! 🥇` : (d.rival.bestAssistsTeam ? `برنده: ${d.rival.bestAssistsTeam} (${d.rival.bestAssists} پاس‌گل)` : '—');
  const csHtml = d.wonCS ? `دروازه‌بانت با ${d.myGK.val} کلین‌شیت، برترین دروازه‌بان لیگ شد! 🥇` : (d.rival.bestCSTeam ? `برنده: ${d.rival.bestCSTeam} (${d.rival.bestCS} کلین‌شیت)` : '—');
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <div class="confetti-wrap">${confettiHtml(18)}</div>
        <h2><span class="dot"></span>جوایز پایان فصل ${state.season}</h2>
        <div class="award-row"><span class="ic">🏁</span><div style="flex:1;"><div style="font-weight:700; font-size:0.85rem;">رتبه نهایی: ${d.userRank} از ${d.total}</div><div class="muted" style="font-size:0.75rem;">جایزه‌ی نقدی رتبه</div></div><span class="amt">+${fmtMoney(d.prize)}</span></div>
        ${awardLine('⚽','آقای گل لیگ', d.wonGolden?goldenHtml:null, goldenHtml, GOLDEN_BOOT_BONUS)}
        ${awardLine('🎯','آقای پاس‌گل لیگ', d.wonAssist?assistHtml:null, assistHtml, ASSIST_KING_BONUS)}
        ${awardLine('🧤','برترین دروازه‌بان (کلین‌شیت)', d.wonCS?csHtml:null, csHtml, CLEAN_SHEET_BONUS)}
        <div class="row" style="margin-top:8px;"><span style="font-weight:700;">مجموع جایزه دریافتی</span><b class="amt" style="font-size:1.05rem;">${fmtMoney(d.bonus)}</b></div>
        <p class="muted" style="font-size:0.72rem; margin-top:6px;">این مبلغ به بودجه‌ی فصل جدیدت اضافه شد.</p>
        <button class="btn primary" style="width:100%; margin-top:14px;" onclick="proceedToNewSeason()">شروع فصل جدید</button>
      </div>
    </div>`;
}
function proceedToNewSeason(){
  state.season++; state.week = 1;
  /* پیری تیم: افت آماری از ۳۱ سالگی، افت شدیدتر بعد از ۳۴ */
  state.players.forEach(p=>{
    p.age++;
    if(p.age>=31 && p.age<=34){
      p.pace = clamp(p.pace - rnd(1,3), 20, 99);
      if(p.age>=33) p.stamina = clamp(p.stamina - rnd(1,3), 40, 99);
    } else if(p.age>34){
      p.attack = clamp(p.attack - rnd(3,5), 20, 99);
      p.defense = clamp(p.defense - rnd(3,5), 20, 99);
      p.pace = clamp(p.pace - rnd(3,6), 20, 99);
    }
    p.contractYears = Math.max(1, p.contractYears-1);
    p.fitness = 100; p.morale = clamp(p.morale + 5, 20, 100);
  });
  state.league.teams.forEach(t=>{
    Object.assign(t,{played:0,won:0,draw:0,lost:0,gf:0,ga:0,pts:0,form:0,last5:[]});
    if(!t.isUser) t.strength = clamp(t.strength + rnd(-4,4), 50, 88);
  });
  state.league.fixtures = genFixtures(state.league.teams.map(t=>t.name));
  state.transferMarket = genMarket();
  state.marketRefreshes = 0;
  state.seasonStats = freshSeasonStats();
  state.recoveryCamps = 3;
  state.cup = {stage:'ro8', active:true, log:[]};
  addNews(`فصل ${state.season} شروع شد. موفق باشی!`, "info");
  closeOverlay('genericModal');
  goMain('home');
}
