/* ============================================================
   replay.js — گزارش و ری‌پلی مسابقه + توضیح «چرا این نتیجه شد»
   ------------------------------------------------------------
   هر مسابقه یک گزارش کامل ذخیره می‌کند:
     نتیجه + رویدادهای دقیقه‌به‌دقیقه + آمار + عوامل مؤثر + seed + ورودی‌ها
   چون موتور «قطعی» است، می‌توانیم از روی همان seed نتیجه را
   دوباره بسازیم و تأیید کنیم. همین مکانیزم، پایه‌ی ضدتقلب آنلاین است.
   ============================================================ */

function reportById(id){
  if(!state.matchReports) return null;
  if(!id) return state.matchReports[0] || null;
  return state.matchReports.find(r=>r.id===id) || null;
}

/* ---------- فهرست گزارش‌ها (تب لیگ ← گزارش‌ها) ---------- */
function renderReports(){
  const list = state.matchReports || [];
  if(!list.length){
    return `<div class="card glass"><h2><span class="dot"></span>گزارش‌های مسابقه${infoBtn('reports')}</h2>
      <div class="empty">هنوز مسابقه‌ای بازی نکرده‌ای. از تب «خانه» یک هفته را شبیه‌سازی کن.</div></div>`;
  }
  return `
  <div class="card glass">
    <h2><span class="dot"></span>گزارش‌های مسابقه${infoBtn('reports')}</h2>
    <p class="muted" style="font-size:0.75rem;">آخرین ${list.length} مسابقه‌ات اینجاست. روی هر بازی بزن تا گزارش دقیقه‌به‌دقیقه و دلیل نتیجه را ببینی.</p>
    ${list.map(r=>reportRow(r)).join('')}
  </div>`;
}
function reportRow(r){
  const isHome = r.home === state.clubName;
  const my = isHome ? r.homeGoals : r.awayGoals;
  const opp = isHome ? r.awayGoals : r.homeGoals;
  const oppName = isHome ? r.away : r.home;
  const res = my > opp ? {t:'برد', c:'var(--emerald)'} : (my < opp ? {t:'باخت', c:'var(--red)'} : {t:'مساوی', c:'var(--amber)'});
  const comp = r.competition === 'cup' ? 'جام حذفی' : (r.competition === 'friendly' ? 'دوستانه' : 'لیگ');
  return `<div class="report-row" onclick="openReport('${r.id}')">
    <div class="rr-score" style="color:${res.c};">${my} - ${opp}</div>
    <div style="flex:1; min-width:0;">
      <div style="font-weight:700; font-size:0.84rem;">${isHome?'میزبان':'میهمان'} مقابل ${escapeHtml(oppName)}</div>
      <div class="meta">${comp} · فصل ${r.season} هفته ${r.week} · ${res.t}${r.neutral?' · بی‌طرف':''}</div>
    </div>
    <div class="muted" style="font-size:1.1rem;">›</div>
  </div>`;
}

/* ---------- «چرا این نتیجه شد؟» ---------- */
function reportWhyHtml(r){
  const f = r.factors;
  const u = r.home === state.clubName ? 0 : 1;
  const o = 1 - u;
  const fmt = v => (Math.round(v*10)/10).toLocaleString('fa-IR');
  const lines = [];
  const diff = (a,b) => Math.round((a-b)*10)/10;

  const atkD = diff(f.attack[u], f.attack[o]);
  lines.push({ label:'قدرت حمله', me:f.attack[u], them:f.attack[o],
    note: Math.abs(atkD) < 1.5 ? 'تقریباً برابر' : (atkD > 0 ? `به نفع تو (${fmt(Math.abs(atkD))}+)` : `به نفع حریف (${fmt(Math.abs(atkD))}+)`) });
  const defD = diff(f.defense[u], f.defense[o]);
  lines.push({ label:'قدرت دفاع', me:f.defense[u], them:f.defense[o],
    note: Math.abs(defD) < 1.5 ? 'تقریباً برابر' : (defD > 0 ? `به نفع تو (${fmt(Math.abs(defD))}+)` : `به نفع حریف (${fmt(Math.abs(defD))}+)`) });
  const fitD = diff(f.fitness[u], f.fitness[o]);
  lines.push({ label:'آمادگی', me:f.fitness[u]+'٪', them:f.fitness[o]+'٪',
    note: Math.abs(fitD) < 6 ? 'تقریباً برابر' : (fitD > 0 ? 'تیم تو سرحال‌تر بود' : 'حریف سرحال‌تر بود') });
  const morD = diff(f.morale[u], f.morale[o]);
  lines.push({ label:'روحیه', me:Math.round(f.morale[u])+'٪', them:Math.round(f.morale[o])+'٪',
    note: Math.abs(morD) < 6 ? 'تقریباً برابر' : (morD > 0 ? 'روحیه‌ی تو بهتر بود' : 'روحیه‌ی حریف بهتر بود') });
  const lucky = f.luck[u] > f.luck[o] ? 'تو خوش‌شانس‌تر بودی' : (f.luck[u] < f.luck[o] ? 'حریف خوش‌شانس‌تر بود' : 'برابر');
  lines.push({ label:'شانس روز', me:'×'+fmt(f.luck[u]), them:'×'+fmt(f.luck[o]), note: lucky });
  if(f.homeAdvantage > 0){
    lines.push({ label:'مزیت میزبانی', me: (u===0 ? '+' + fmt(f.homeAdvantage) : '—'), them: (o===0 ? '+' + fmt(f.homeAdvantage) : '—'),
      note: u===0 ? 'تو میزبان بودی' : 'حریف میزبان بود' });
  } else {
    lines.push({ label:'زمین', me:'—', them:'—', note:'بی‌طرف (بدون مزیت میزبانی)' });
  }

  const myXg = r.xg[u], oppXg = r.xg[o];
  const myGoals = u===0 ? r.homeGoals : r.awayGoals;
  const oppGoals = u===0 ? r.awayGoals : r.homeGoals;
  const xgVerdict = (myGoals - myXg) > 1 ? 'بیشتر از انتظار گل زدی 🍀' : ((myGoals - myXg) < -1 ? 'کمتر از انتظار گل زدی 😞' : 'به اندازه‌ی انتظار گل زدی');

  return `
    <div class="why-box">
      <div class="why-head">چرا این نتیجه شد؟</div>
      ${lines.map(l=>`<div class="why-row">
        <span class="why-label">${l.label}</span>
        <span class="why-val">تو <b>${l.me}</b></span>
        <span class="why-val">حریف <b>${l.them}</b></span>
        <span class="why-note">${l.note}</span>
      </div>`).join('')}
      <div class="why-xg">
        <div><span class="muted">گل انتظاری (xG):</span> تو <b>${fmt(myXg)}</b> · حریف <b>${fmt(oppXg)}</b></div>
        <div class="muted" style="margin-top:4px;">با xG تو ${fmt(myXg)} گل انتظار می‌رفت و ${myGoals} گل زدی — ${xgVerdict}</div>
      </div>
    </div>`;
}

/* ---------- آمار مسابقه ---------- */
function reportStatsHtml(r){
  const u = r.home === state.clubName ? 0 : 1;
  const o = 1 - u;
  const rows = [
    ['مالکیت توپ', r.stats.possession[u] + '٪', r.stats.possession[o] + '٪', r.stats.possession[u], 100],
    ['شوت', r.stats.shots[u], r.stats.shots[o], r.stats.shots[u], Math.max(1, r.stats.shots[u] + r.stats.shots[o])],
    ['شوت در چارچوب', r.stats.onTarget[u], r.stats.onTarget[o], r.stats.onTarget[u], Math.max(1, r.stats.onTarget[u] + r.stats.onTarget[o])],
    ['کرنر', r.stats.corners[u], r.stats.corners[o], r.stats.corners[u], Math.max(1, r.stats.corners[u] + r.stats.corners[o])],
    ['کارت زرد', r.stats.cards[u], r.stats.cards[o], r.stats.cards[u], Math.max(1, r.stats.cards[u] + r.stats.cards[o])]
  ];
  return `<div class="stat-compare">
    ${rows.map(([label, mine, theirs, a, total])=>{
      const pct = Math.round(a / total * 100);
      return `<div class="sc-row">
        <b class="sc-mine">${mine}</b>
        <div class="sc-bar"><span style="width:${pct}%"></span></div>
        <b class="sc-theirs">${theirs}</b>
        <div class="sc-label">${label}</div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------- تایم‌لاین دقیقه‌به‌دقیقه ---------- */
function reportTimelineHtml(r){
  const rows = r.events.map(e=>{
    const d = eventText(e, r);
    if(!d.text) {
      if(e.type === 'halftime' || e.type === 'fulltime'){
        const sc = e.score ? `${e.score[0]} - ${e.score[1]}` : '';
        return `<div class="tl-row tl-mid"><span class="tl-min">${e.minute}'</span><span class="tl-text">${d.icon} ${d.text} <b>${sc}</b></span></div>`;
      }
      return '';
    }
    const cls = e.type === 'goal' ? (d.own ? 'tl-goal' : 'tl-goal-against') : (e.type === 'card' ? 'tl-card' : '');
    return `<div class="tl-row ${cls}">
      <span class="tl-min">${e.minute}'</span>
      <span class="tl-icon">${d.icon}</span>
      <span class="tl-text">${escapeHtml(d.text)}</span>
    </div>`;
  }).join('');
  return `<div class="timeline">${rows}</div>`;
}

/* ---------- تأیید بازتولید (ضدتقلب) ---------- */
function verifyReport(id){
  const r = reportById(id);
  if(!r) { showToast('گزارشی برای بررسی پیدا نشد.', 'error'); return; }
  if(!r.inputs){ showToast('این گزارش ورودی ذخیره‌شده ندارد (گزارش قدیمی است).'); return; }
  const again = simulateMatchEngine(r.inputs.home, r.inputs.away, { seed: r.seed, neutral: r.neutral });
  const same = again.homeGoals === r.homeGoals && again.awayGoals === r.awayGoals &&
    JSON.stringify(again.events) === JSON.stringify(r.events);
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>بررسی سلامت نتیجه</h2>
        <div style="text-align:center; font-size:2.2rem; margin:6px 0;">${same ? '✅' : '❌'}</div>
        <p style="font-size:0.85rem; line-height:1.9; text-align:center;">
          ${same ? 'این نتیجه دوباره از روی <b>seed</b> بازتولید شد و مو‌به‌مو یکسان درآمد.' : 'بازتولید نتیجه با گزارش ذخیره‌شده یکسان نبود!'}
        </p>
        <div class="row"><span>seed مسابقه</span><b style="font-family:monospace; font-size:0.72rem;">${r.seed}</b></div>
        <div class="row"><span>نسخه‌ی موتور</span><b>${r.engineVersion}</b></div>
        <div class="row"><span>نتیجه‌ی بازتولید</span><b style="color:${same?'var(--emerald)':'var(--red)'};">${again.homeGoals} - ${again.awayGoals}</b></div>
        <p class="muted" style="font-size:0.72rem; margin-top:8px;">در حالت آنلاین، سرور همین بررسی را انجام می‌دهد تا نتیجه‌ی دست‌کاری‌شده رد شود.</p>
        <button class="btn primary" style="width:100%; margin-top:12px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}

/* ---------- مودال گزارش کامل ---------- */
function openReport(id){
  const r = reportById(id);
  if(!r){ showToast('گزارشی پیدا نشد.', 'error'); return; }
  const u = r.home === state.clubName ? 0 : 1;
  const myGoals = u===0 ? r.homeGoals : r.awayGoals;
  const oppGoals = u===0 ? r.awayGoals : r.homeGoals;
  const oppName = u===0 ? r.away : r.home;
  const myName = state.clubName;
  const won = myGoals > oppGoals, lost = myGoals < oppGoals;
  const comp = r.competition === 'cup' ? 'جام حذفی' : (r.competition === 'friendly' ? 'بازی دوستانه' : 'لیگ');
  const best = r.bestPlayer;
  const bestIsMine = best ? ((best.side === 'home') === (u === 0)) : false;
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" style="max-width:520px;" onclick="event.stopPropagation()">
        <div class="muted" style="font-size:0.72rem; text-align:center;">${comp} · فصل ${r.season} هفته ${r.week}${r.neutral?' · زمین بی‌طرف':''}</div>
        <div class="report-head">
          <div class="rh-team">${crestImg(myName)}<span>${escapeHtml(myName)}</span></div>
          <div class="rh-score" style="color:${won?'var(--emerald)':(lost?'var(--red)':'var(--amber)')};">${myGoals} - ${oppGoals}</div>
          <div class="rh-team">${crestImg(oppName)}<span>${escapeHtml(oppName)}</span></div>
        </div>
        ${won ? `<div class="confetti-wrap">${confettiHtml(14)}</div>` : ''}
        ${best ? `<div class="muted" style="font-size:0.74rem; text-align:center; margin-bottom:8px;">⭐ بهترین بازیکن زمین: <b>${escapeHtml(best.name)}</b> (${POS_FA[best.pos]||''} · امتیاز ${best.rating})${bestIsMine?' — از تیم تو 🎉':''}</div>` : ''}
        ${reportStatsHtml(r)}
        ${reportWhyHtml(r)}
        <h2 style="margin-top:16px;"><span class="dot"></span>دقیقه‌به‌دقیقه</h2>
        ${reportTimelineHtml(r)}
        <div style="display:flex; gap:8px; margin-top:14px;">
          <button class="btn ghost small" style="flex:1;" onclick="verifyReport('${r.id}')">تأیید نتیجه 🔍</button>
          <button class="btn primary small" style="flex:1;" onclick="closeOverlay('genericModal')">بستن</button>
        </div>
      </div>
    </div>`;
}

/* ---------- کارت «آخرین بازی» برای داشبورد ---------- */
function lastReportCardHtml(){
  const r = (state.matchReports||[])[0];
  if(!r) return '';
  const u = r.home === state.clubName ? 0 : 1;
  const my = u===0?r.homeGoals:r.awayGoals, opp = u===0?r.awayGoals:r.homeGoals;
  const oppName = u===0?r.away:r.home;
  const cmp = r.competition === 'cup' ? 'جام حذفی' : (r.competition === 'friendly' ? 'دوستانه' : 'لیگ');
  const res = my>opp?'برد':(my<opp?'باخت':'مساوی');
  const col = my>opp?'var(--emerald)':(my<opp?'var(--red)':'var(--amber)');
  return `
  <div class="card glass">
    <h2><span class="dot"></span>آخرین بازی</h2>
    <div class="row" style="border-bottom:none;">
      <span>${cmp} مقابل ${escapeHtml(oppName)}</span>
      <b style="color:${col}; font-size:1.05rem;">${my} - ${opp} (${res})</b>
    </div>
    <button class="btn ghost small" style="width:100%;" onclick="openReport('${r.id}')">گزارش کامل و دلیل نتیجه 📋</button>
  </div>`;
}
