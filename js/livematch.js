/* ============================================================
   livematch.js — پخش زنده‌ی مسابقه از روی گزارش قطعی
   ------------------------------------------------------------
   ما نتیجه را از قبل داریم (گزارش موتور)، پس «پخش زنده» یعنی
   رویدادها را با سرعت دلخواه روی صفحه ظاهر کنیم. هیچ تایمر سرور
   و هیچ اتصالی لازم نیست ⇒ آفلاین هم کار می‌کند، و بعداً در حالت
   آنلاین همین لایه روی گزارش سرور سوار می‌شود.
   ============================================================ */

const LIVE_SPEEDS = { slow: 300, normal: 150, fast: 70, turbo: 25 };
const LIVE_SPEED_LABELS = { slow:'۰.۵×', normal:'۱×', fast:'۲×', turbo:'۴×' };

let liveTimer = null;
let liveCtx = null;

function liveMsPerMinute(){
  const p = (state && state.prefs) ? state.prefs.liveSpeed : 'normal';
  return LIVE_SPEEDS[p] || LIVE_SPEEDS.normal;
}
function stopLive(){
  if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }
  liveCtx = null;
}

/* ---------- پوسته‌ی صفحه‌ی پخش ---------- */
function liveShell(r){
  const comp = r.competition === 'cup' ? 'جام حذفی' : (r.competition === 'friendly' ? 'بازی دوستانه' : 'لیگ');
  return `
  <div class="modal-bg" onclick="closeLiveEvent(event)">
    <div class="modal glass live-modal" onclick="event.stopPropagation()">
      <div class="live-top">
        <span class="live-comp">${comp} · فصل ${faNum(r.season)} هفته ${faNum(r.week)}${r.neutral?' · بی‌طرف':''}</span>
        <span class="live-badge" id="lvBadge">🔴 در جریان</span>
      </div>
      <div class="live-score">
        <div class="ls-team">${crestImg(r.home)}<span>${escapeHtml(r.home)}</span></div>
        <div class="ls-mid">
          <div class="ls-num" id="lvScore">۰ - ۰</div>
          <div class="ls-clock"><span id="lvClock">۰'</span></div>
        </div>
        <div class="ls-team">${crestImg(r.away)}<span>${escapeHtml(r.away)}</span></div>
      </div>
      <div class="live-momentum" title="فشار بازی در ۱۰ دقیقه‌ی اخیر">
        <span class="lm-home" id="lvMomH" style="width:50%"></span>
        <span class="lm-away" id="lvMomA" style="width:50%"></span>
      </div>
      <div class="live-stats" id="lvStats"></div>
      <div class="live-feed" id="lvFeed"></div>
      <div class="live-controls" id="lvControls">
        <button class="lc-btn" id="lvPlay" onclick="toggleLive()">⏸ توقف</button>
        <div class="lc-speeds">
          ${Object.keys(LIVE_SPEEDS).map(k=>`<button class="lc-sp ${((state.prefs&&state.prefs.liveSpeed)||'normal')===k?'on':''}" onclick="setLiveSpeed('${k}')">${LIVE_SPEED_LABELS[k]}</button>`).join('')}
        </div>
        <button class="lc-btn" onclick="skipLive()">⏭ نتیجه</button>
      </div>
    </div>
  </div>`;
}

/* ---------- شروع ---------- */
function openLiveMatch(reportId, onDone){
  const r = reportById(reportId);
  if(!r){ showToast('گزارشی برای پخش پیدا نشد.', 'error'); return; }
  stopLive();
  const userSide = r.home === state.clubName ? 'home' : (r.away === state.clubName ? 'away' : null);
  liveCtx = { report:r, minute:0, playing:true, done:false, onDone:onDone || null, userSide };
  document.getElementById('genericModal').innerHTML = liveShell(r);
  startLiveTimer();
  paintLive();
}
function startLiveTimer(){
  if(liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(liveTick, liveMsPerMinute());
}
function liveTick(){
  if(!liveCtx || liveCtx.done) return;
  if(!liveCtx.playing) return;
  liveCtx.minute++;
  const total = liveTotalMinutes(liveCtx.report);
  if(liveCtx.minute > total){ finishLive(); return; }
  paintLive();
}
function liveTotalMinutes(r){
  const ft = (r.events||[]).filter(e=>e.type==='fulltime').pop();
  return ft ? ft.minute : 90;
}
function toggleLive(){
  if(!liveCtx) return;
  liveCtx.playing = !liveCtx.playing;
  const b = document.getElementById('lvPlay');
  if(b) b.textContent = liveCtx.playing ? '⏸ توقف' : '▶ ادامه';
}
function setLiveSpeed(k){
  if(!state.prefs) state.prefs = {};
  state.prefs.liveSpeed = k;
  if(liveCtx){
    startLiveTimer();
    const box = document.getElementById('lvControls');
    if(box) box.querySelectorAll('.lc-sp').forEach(el=>{
      const key = Object.keys(LIVE_SPEED_LABELS).find(x=>LIVE_SPEED_LABELS[x]===el.textContent.trim());
      el.classList.toggle('on', key === k);
    });
  }
  saveGame();
}
function skipLive(){
  if(!liveCtx) return;
  liveCtx.minute = liveTotalMinutes(liveCtx.report);
  finishLive();
}
function closeLiveEvent(e){
  if(e && e.target && !e.target.classList.contains('modal-bg')) return;
  stopLive();
  closeOverlay('genericModal');
}

/* ---------- آمار تجمعی تا دقیقه‌ی جاری (از روی رویدادها، دقیق) ---------- */
function liveCumulative(r, minute){
  const c = {
    home:{ goals:0, shots:0, onTarget:0, cards:0 },
    away:{ goals:0, shots:0, onTarget:0, cards:0 }
  };
  (r.events||[]).forEach(e=>{
    if(e.minute > minute) return;
    const s = c[e.side]; if(!s) return;
    if(e.type === 'goal'){ s.goals++; s.shots++; s.onTarget++; }
    else if(e.type === 'save'){ s.shots++; s.onTarget++; }
    else if(e.type === 'miss'){ s.shots++; }
    else if(e.type === 'card'){ s.cards++; }
  });
  return c;
}
function liveMomentum(r, minute){
  const from = Math.max(1, minute - 9);
  let h = 0, a = 0;
  (r.events||[]).forEach(e=>{
    if(e.minute < from || e.minute > minute) return;
    if(e.side === 'home') h += (e.type==='goal' ? 3 : (e.type==='save'||e.type==='miss') ? 2 : 1);
    if(e.side === 'away') a += (e.type==='goal' ? 3 : (e.type==='save'||e.type==='miss') ? 2 : 1);
  });
  const total = h + a;
  return total === 0 ? { h:50, a:50 } : { h: Math.round(h/total*100), a: Math.round(a/total*100) };
}

/* ---------- نقاشی فریم جاری ---------- */
function paintLive(){
  if(!liveCtx) return;
  const r = liveCtx.report, m = liveCtx.minute;
  const cum = liveCumulative(r, m);
  const mom = liveMomentum(r, m);

  const scoreEl = document.getElementById('lvScore');
  if(scoreEl) scoreEl.textContent = `${faNum(cum.home.goals)} - ${faNum(cum.away.goals)}`;
  const clockEl = document.getElementById('lvClock');
  if(clockEl) clockEl.textContent = faNum(Math.min(m, liveTotalMinutes(r))) + "'";

  const momH = document.getElementById('lvMomH'), momA = document.getElementById('lvMomA');
  if(momH){ momH.style.width = mom.h + '%'; momA.style.width = mom.a + '%'; }

  /* آمار زنده */
  const statsEl = document.getElementById('lvStats');
  if(statsEl){
    statsEl.innerHTML = liveStatRow('شوت', cum.home.shots, cum.away.shots) +
                        liveStatRow('در چارچوب', cum.home.onTarget, cum.away.onTarget) +
                        liveStatRow('کارت زرد', cum.home.cards, cum.away.cards);
  }

  /* فهرست رویدادها (جدیدترین بالا) */
  const feedEl = document.getElementById('lvFeed');
  if(feedEl){
    const shown = (r.events||[]).filter(e=>e.minute <= m && e.type !== 'kickoff');
    const last = shown.slice(-9).reverse();
    feedEl.innerHTML = last.map(e=>{
      const d = eventText(e, r);
      if(!d.text){
        if(e.type === 'halftime') return `<div class="lf-item lf-mid"><b>${d.icon} پایان نیمه‌ی اول — ${faNum(e.score?e.score[0]:0)} - ${faNum(e.score?e.score[1]:0)}</b></div>`;
        if(e.type === 'fulltime') return `<div class="lf-item lf-mid"><b>${d.icon} پایان مسابقه — ${faNum(e.score?e.score[0]:0)} - ${faNum(e.score?e.score[1]:0)}</b></div>`;
        return '';
      }
      const cls = e.type === 'goal' ? (d.own ? 'lf-goal' : 'lf-goal-against')
                : (e.type === 'card' ? 'lf-card' : (e.type === 'save' ? 'lf-save' : ''));
      const fresh = (m - e.minute) <= 1 ? ' lf-new' : '';
      return `<div class="lf-item ${cls}${fresh}"><span class="lf-min">${faNum(e.minute)}'</span><span class="lf-ic">${d.icon}</span><span class="lf-tx">${escapeHtml(d.text)}</span></div>`;
    }).join('') || '<div class="empty" style="padding:18px; font-size:0.78rem;">سوت شروع نزدیک است…</div>';
  }
}
function liveStatRow(label, mine, theirs){
  const total = Math.max(1, mine + theirs);
  const p = Math.round(mine / total * 100);
  return `<div class="ls-row">
    <b>${faNum(mine)}</b>
    <div class="ls-bar"><span style="width:${p}%"></span></div>
    <b>${faNum(theirs)}</b>
    <div class="ls-lbl">${label}</div>
  </div>`;
}

/* ---------- پایان مسابقه ---------- */
function finishLive(){
  if(!liveCtx) return;
  const r = liveCtx.report;
  liveCtx.done = true;
  liveCtx.playing = false;
  if(liveTimer){ clearInterval(liveTimer); liveTimer = null; }
  liveCtx.minute = liveTotalMinutes(r);
  paintLive();

  const badge = document.getElementById('lvBadge');
  if(badge){ badge.textContent = '🏁 پایان'; badge.classList.add('ended'); }
  const playBtn = document.getElementById('lvPlay');
  if(playBtn) playBtn.disabled = true;

  const u = liveCtx.userSide;
  const my = u === 'home' ? r.homeGoals : r.awayGoals;
  const opp = u === 'home' ? r.awayGoals : r.homeGoals;
  const won = u ? my > opp : false, drew = u ? my === opp : false;

  const box = document.getElementById('lvControls');
  if(box){
    box.innerHTML = `
      <button class="btn ghost small" style="flex:1;" onclick="closeLiveEvent(); openReport('${r.id}')">گزارش کامل 📋</button>
      <button class="btn primary small" style="flex:1;" onclick="liveContinue()">ادامه</button>`;
  }
  const finalEl = document.getElementById('lvStats');
  if(finalEl){
    finalEl.innerHTML = liveStatRow('شوت', r.stats.shots[0], r.stats.shots[1]) +
      liveStatRow('در چارچوب', r.stats.onTarget[0], r.stats.onTarget[1]) +
      liveStatRow('مالکیت ٪', r.stats.possession[0], r.stats.possession[1]) +
      liveStatRow('کرنر', r.stats.corners[0], r.stats.corners[1]) +
      (r.bestPlayer ? `<div class="ls-best">⭐ بهترین بازیکن: <b>${escapeHtml(r.bestPlayer.name)}</b> — امتیاز ${faNum(r.bestPlayer.rating)}</div>` : '');
  }
  const banner = document.getElementById('lvFeed');
  if(banner){
    const txt = !u ? 'پایان مسابقه' : (won ? '🎉 بردی!' : (drew ? '⚖️ مساوی' : '😞 باختی'));
    banner.insertAdjacentHTML('afterbegin', `<div class="lf-item lf-result ${won?'win':(drew?'draw':'loss')}"><b>${txt}</b></div>`);
  }
  if(won && u) confettiBurst();
}
function liveContinue(){
  const cb = liveCtx ? liveCtx.onDone : null;
  stopLive();
  closeOverlay('genericModal');
  if(typeof cb === 'function') setTimeout(cb, 200);
}
/* کاغذرنگی‌ریزان ساده روی صفحه‌ی پخش */
function confettiBurst(){
  const host = document.querySelector('.live-modal');
  if(!host || document.getElementById('lvConfetti')) return;
  const wrap = document.createElement('div');
  wrap.id = 'lvConfetti';
  wrap.className = 'confetti-wrap';
  wrap.innerHTML = confettiHtml(18);
  host.appendChild(wrap);
}

/* ---------- پخش گزارش‌های قدیمی (از تب گزارش‌ها) ---------- */
function watchReport(id){
  openLiveMatch(id, null);
}
