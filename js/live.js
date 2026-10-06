/* ============================================================
   live.js — پخش زنده‌ی مسابقه (قلب هیجانی بازی آنلاین)
   ------------------------------------------------------------
   ما نتیجه را از قبل داریم (گزارش رسمی سرور)، پس «پخش زنده» یعنی
   رویدادهای قطعی را با سرعت دلخواه روی صفحه زنده کنیم:
     • تابلوی امتیاز + ساعت مسابقه + نوار فشار (momentum)
     • زمین کوچک با آدمک‌های چهره‌دار و توپِ متحرک
     • فید رویدادها (گل با چهره‌ی گلزن، پاس گل، کارت، مهار…)
     • آمار زنده و «بهترین بازیکن» در پایان
   هیچ تایمر سمت سرور و هیچ اتصال بلادرنگی لازم نیست ⇒ روی نت ضعیف
   هم کار می‌کند و مصرف داده‌اش صفر است (گزارش یک‌بار گرفته می‌شود).
   ============================================================ */

const LIVE = {
  ctx: null,
  timer: null,
  SPEEDS: { '1': 210, '2': 120, '4': 62, '8': 26 },

  /* ---------- باز کردن پخش ---------- */
  open(report, opts){
    if(!report) return;
    const o = opts || {};
    this.close(true);
    const evs = (report.events || []).slice().sort((a, b)=> (a.minute || 0) - (b.minute || 0));
    const total = Math.max(90, evs.length ? evs[evs.length - 1].minute : 90);
    this.ctx = {
      report, events: evs, total, minute: 0, playing: true, speed: '2', done: false,
      myClub: o.myClub || null, onClose: o.onClose || null, label: o.label || 'لیگ',
      feed: [], lastSide: null, momentum: 0
    };
    const root = document.getElementById('liveRoot');
    root.innerHTML = this._shell();
    root.style.display = 'block';
    this.timer = setInterval(()=> this._tick(), this.SPEEDS[this.ctx.speed]);
    this._paint(true);
  },
  isOpen(){ return !!this.ctx; },

  /* ---------- پوسته ---------- */
  _shell(){
    const c = this.ctx, r = c.report;
    const myHome = c.myClub && r.home === c.myClub;
    const myAway = c.myClub && r.away === c.myClub;
    const tag = (name)=> (name === c.myClub ? '<span class="badge gold">تیم من</span>' : '');
    return `
    <div class="live-bg">
      <div class="live-wrap">
        <div class="live-top">
          <button class="icon-btn" onclick="LIVE.close()">✕</button>
          <span class="live-comp">${escapeHtml(c.label)}${r.round !== undefined ? ' · هفته ' + faNum(Number(r.round) + 1) : ''}</span>
          <span class="live-pill"><i class="blink"></i> زنده</span>
        </div>

        <div class="score-board">
          <div class="sb-row">
            <div class="sb-team">
              <span class="club-badge cb-lg">${crestSVG(r.home)}</span>
              <span class="name">${escapeHtml(r.home)}</span>${tag(r.home)}
            </div>
            <div class="sb-mid">
              <div class="sb-score"><span id="lvH">۰</span><span class="sep"> - </span><span id="lvA">۰</span></div>
              <div class="sb-clock">دقیقه <b id="lvMin">۰</b>'</div>
            </div>
            <div class="sb-team">
              <span class="club-badge cb-lg">${crestSVG(r.away)}</span>
              <span class="name">${escapeHtml(r.away)}</span>${tag(r.away)}
            </div>
          </div>
          <div class="momentum"><span class="mh" id="lvMomH" style="width:50%"></span><span class="ma" id="lvMomA" style="width:50%"></span></div>
        </div>

        <div class="live-pitch">
          <div class="lp-line"></div>
          <div id="lvDotsTop"></div>
          <div id="lvDotsBot"></div>
          <span class="lp-ball" id="lvBall" style="left:50%;top:50%"></span>
        </div>

        <div class="live-ctrl">
          <button class="btn sm ghost" id="lvPlay" onclick="LIVE.toggle()">⏸ توقف</button>
          <div class="spd">
            ${Object.keys(this.SPEEDS).map(k=>`<button class="${k === c.speed ? 'on' : ''}" onclick="LIVE.setSpeed('${k}')">${faNum(k)}×</button>`).join('')}
          </div>
          <button class="btn sm ghost" onclick="LIVE.skip()">⏭ نتیجه</button>
        </div>

        <div class="card tight">
          <div class="card-head"><h3><span class="ch-ico">📊</span> آمار زنده</h3>
            <span class="ch-act" id="lvXg"></span></div>
          <div class="live-stats" id="lvStats"></div>
        </div>

        <div class="card tight">
          <div class="card-head"><h3><span class="ch-ico">📣</span> گزارش لحظه‌به‌لحظه</h3></div>
          <div class="live-feed" id="lvFeed"></div>
        </div>

        <div id="lvEnd"></div>
      </div>
    </div>`;
  },

  /* ---------- حلقه‌ی پخش ---------- */
  _tick(){
    const c = this.ctx;
    if(!c || c.done) return;
    if(!c.playing) return;
    c.minute = Math.min(c.total, c.minute + 1);
    const at = c.events.filter(e=> (e.minute || 0) === c.minute);
    at.forEach(e=> this._push(e));
    this._paint();
    if(c.minute >= c.total) this._finish();
  },
  _push(e){
    const c = this.ctx;
    c.feed.unshift(e);
    if(c.feed.length > 22) c.feed.pop();
    c.lastSide = e.side || c.lastSide;
    if(e.type === 'goal') this._flashGoal(e);
  },
  _flashGoal(e){
    const c = this.ctx;
    const myGoal = c.myClub && (
      (e.side === 'home' && c.report.home === c.myClub) ||
      (e.side === 'away' && c.report.away === c.myClub));
    const el = document.createElement('div');
    el.className = 'goal-flash';
    el.innerHTML = `<span>${myGoal ? 'گِــل!' : 'گل حریف'}</span>`;
    document.body.appendChild(el);
    setTimeout(()=> el.remove(), 900);
    if(navigator.vibrate) try{ navigator.vibrate(myGoal ? [40, 60, 90] : 30); }catch(err){}
  },

  /* ---------- رسم ---------- */
  _paint(initial){
    const c = this.ctx, r = c.report;
    const played = c.events.filter(e=> (e.minute || 0) <= c.minute);
    const goals = played.filter(e=> e.type === 'goal');
    const h = goals.filter(e=> e.side === 'home').length;
    const a = goals.length - h;
    const setTxt = (id, v)=>{ const el = document.getElementById(id); if(el) el.textContent = v; };
    setTxt('lvH', faNum(h));
    setTxt('lvA', faNum(a));
    setTxt('lvMin', faNum(Math.min(90, c.minute)));

    /* نوار فشار: از رویدادهای ۱۵ دقیقه‌ی اخیر */
    const recent = played.filter(e=> c.minute - (e.minute || 0) <= 15);
    let hw = 0, aw = 0;
    recent.forEach(e=>{
      const w = e.type === 'goal' ? 3 : (e.type === 'save' || e.type === 'miss') ? 1.6 : 0.5;
      if(e.side === 'home') hw += w; else aw += w;
    });
    const tot = hw + aw;
    const pct = tot ? Math.round((hw / tot) * 100) : 50;
    const mh = document.getElementById('lvMomH'), ma = document.getElementById('lvMomA');
    if(mh) mh.style.width = pct + '%';
    if(ma) ma.style.width = (100 - pct) + '%';

    /* آمار */
    const st = r.stats || {};
    const soFar = (arr, idx)=>{
      if(!arr) return 0;
      if(c.done) return arr[idx] || 0;
      const done = Math.round((c.minute / c.total) * (arr[idx] || 0));
      return Math.max(idx === 0 ? h : a, done);
    };
    const poss = st.possession || [50, 50];
    const rows = [
      { t:'مالکیت', h: poss[0] + '٪', a: poss[1] + '٪', v: poss[0] },
      { t:'شوت', h: soFar(st.shots, 0), a: soFar(st.shots, 1), v: 50 },
      { t:'در چارچوب', h: soFar(st.onTarget, 0), a: soFar(st.onTarget, 1), v: 50 },
      { t:'کرنر', h: soFar(st.corners, 0), a: soFar(st.corners, 1), v: 50 },
      { t:'کارت', h: soFar(st.cards, 0), a: soFar(st.cards, 1), v: 50 }
    ];
    const statsEl = document.getElementById('lvStats');
    if(statsEl) statsEl.innerHTML = rows.map(row=>{
      const wid = row.t === 'مالکیت' ? row.v : (row.h + row.a ? Math.round((row.h / (row.h + row.a)) * 100) : 50);
      return `<div class="ls-row">
        <span class="ls-v">${typeof row.h === 'number' ? faNum(row.h) : row.h}</span>
        <span class="ls-bar"><i style="width:${wid}%"></i></span>
        <span class="t ls-t">${row.t}</span>
        <span class="ls-bar" style="background:rgba(244,97,79,.28)"><i style="width:${100 - wid}%;background:linear-gradient(90deg,#f4614f,#be123c)"></i></span>
        <span class="ls-v">${typeof row.a === 'number' ? faNum(row.a) : row.a}</span>
      </div>`;
    }).join('');
    if(r.xg){
      const xg = document.getElementById('lvXg');
      if(xg) xg.textContent = `xG ${faNum(r.xg[0])} - ${faNum(r.xg[1])}`;
    }

    /* فید رویدادها */
    const feedEl = document.getElementById('lvFeed');
    if(feedEl) feedEl.innerHTML = c.feed.length
      ? c.feed.map(e=> this._eventHTML(e)).join('')
      : '<div class="empty" style="padding:14px"><div class="e-ico">⏱️</div>توپ در جریان است…</div>';

    /* آدمک‌ها و توپ */
    this._paintPitch(played);
    if(initial) this._paintDots();
  },
  _eventHTML(e){
    const c = this.ctx, r = c.report;
    const sideName = e.side === 'home' ? r.home : r.away;
    const mine = c.myClub && sideName === c.myClub;
    const icons = { goal:'⚽', save:'🧤', miss:'😮', card:'🟨', knock:'🩹', kickoff:'🏁', halftime:'⏸', fulltime:'🏁' };
    const ico = e.card === 'r' ? '🟥' : (icons[e.type] || '•');
    let txt = '';
    if(e.type === 'goal'){
      txt = `<b>گل!</b> ${escapeHtml(e.playerName || sideName)} <span class="muted">(${escapeHtml(sideName)})</span>` +
        (e.assistName ? `<span class="ev-asst">پاس گل: ${escapeHtml(e.assistName)}</span>` : '');
    }
    else if(e.type === 'save') txt = `مهار توسط ${escapeHtml(e.keeperName || 'دروازه‌بان')} — شوت ${escapeHtml(e.playerName || '')}`;
    else if(e.type === 'miss') txt = `شوت ${escapeHtml(e.playerName || '')} به بیرون`;
    else if(e.type === 'card') txt = `${e.card === 'r' ? 'کارت قرمز' : 'کارت زرد'} برای ${escapeHtml(e.playerName || '')}`;
    else if(e.type === 'knock') txt = `${escapeHtml(e.playerName || '')} ضربه خورد ولی ادامه می‌دهد`;
    else if(e.type === 'halftime') txt = `پایان نیمه‌ی اول — ${faNum(e.score ? e.score[0] : 0)} - ${faNum(e.score ? e.score[1] : 0)}`;
    else if(e.type === 'kickoff') txt = 'شروع مسابقه!';
    else if(e.type === 'fulltime') txt = 'پایان مسابقه';
    else txt = e.type;
    return `<div class="ev ${e.type === 'goal' ? 'goal ' + (e.side || '') : ''}">
      <span class="ev-min">${faNum(e.minute || 0)}'</span>
      <span class="ev-ico">${ico}</span>
      <span class="ev-txt">${txt} ${mine && e.type === 'goal' ? '🎉' : ''}</span>
    </div>`;
  },
  _lineup(side){
    const r = this.ctx.report;
    const s = r.sides && r.sides[side];
    if(s && Array.isArray(s.players) && s.players.length){
      const ps = s.players;
      const pickOf = (pos, n)=> ps.filter(p=> p.pos === pos).slice(0, n);
      return pickOf('GK', 1).concat(pickOf('DF', 2), pickOf('MF', 2), pickOf('FW', 2));
    }
    /* گزارش‌های قدیمی بدون ترکیب: از آمار بازیکنان حدس می‌زنیم */
    const stats = Object.keys(r.playerStats || {}).map(k=> r.playerStats[k]).filter(p=> p.side === side);
    const q = [['GK', 1], ['DF', 2], ['MF', 2], ['FW', 2]];
    let out = [];
    q.forEach(([pos, n])=>{ out = out.concat(stats.filter(p=> p.pos === pos).slice(0, n)); });
    return out.slice(0, 7);
  },
  _paintDots(){
    const top = document.getElementById('lvDotsTop');
    const bot = document.getElementById('lvDotsBot');
    if(!top || !bot) return;
    const mk = (p, side)=> `<div class="lp-dot" style="${side === 'away' ? 'top:6px' : ''}">
        ${faceImg(p.id || p.name, { size:'xs', pos: p.pos })}
      </div>`;
    const away = this._lineup('away'), home = this._lineup('home');
    top.innerHTML = away.map((p, i)=> mk(p, 'away').replace('style="top:6px"', `style="left:${8 + i * 13}%;top:8px"`)).join('');
    bot.innerHTML = home.map((p, i)=> mk(p, 'home').replace('style=""', `style="left:${8 + i * 13}%;bottom:8px"`)).join('');
  },
  _paintPitch(played){
    const c = this.ctx, ball = document.getElementById('lvBall');
    if(!ball) return;
    /* حرکت توپ: قطعی (از seed گزارش) ⇒ همه یک انیمیشن را می‌بینند */
    const seed = Number(c.report.seed || 1) % 100000;
    const step = c.minute;
    const wob = (n)=> ((Math.sin((seed % 97) + n * 1.7) + Math.cos((seed % 53) + n * 2.3)) / 2);
    const last = played.length ? played[played.length - 1] : null;
    const bias = last && last.side ? (last.side === 'home' ? 1 : -1) : 0;
    const x = 50 + wob(step) * 26 + bias * 12;
    const y = 50 + wob(step * 1.31 + 7) * 30 + (bias ? 10 : 0);
    ball.style.left = Math.max(6, Math.min(92, x)) + '%';
    ball.style.top = Math.max(8, Math.min(90, y)) + '%';
  },

  /* ---------- کنترل‌ها ---------- */
  toggle(){
    const c = this.ctx;
    if(!c || c.done) return;
    c.playing = !c.playing;
    const b = document.getElementById('lvPlay');
    if(b) b.textContent = c.playing ? '⏸ توقف' : '▶️ ادامه';
  },
  setSpeed(k){
    const c = this.ctx;
    if(!c || !this.SPEEDS[k]) return;
    c.speed = k;
    if(this.timer) clearInterval(this.timer);
    this.timer = setInterval(()=> this._tick(), this.SPEEDS[k]);
    document.querySelectorAll('.spd button').forEach(b=> b.classList.toggle('on', b.textContent.replace('×', '') === k || b.textContent === faNum(k) + '×' || b.textContent === k + '×'));
    document.querySelectorAll('.spd button').forEach((b, i)=> b.classList.toggle('on', Object.keys(this.SPEEDS)[i] === k));
  },
  skip(){
    const c = this.ctx;
    if(!c) return;
    c.minute = c.total;
    c.events.forEach(e=>{ if(!c.feed.includes(e)) c.feed.unshift(e); });
    c.feed.sort((a, b)=> (b.minute || 0) - (a.minute || 0));
    this._finish();
  },
  _finish(){
    const c = this.ctx;
    if(!c || c.done) return;
    c.done = true;
    c.playing = false;
    if(this.timer){ clearInterval(this.timer); this.timer = null; }
    this._paint();
    const r = c.report;
    const res = r.homeGoals > r.awayGoals ? 'home' : (r.homeGoals < r.awayGoals ? 'away' : 'draw');
    const myWin = c.myClub && ((res === 'home' && r.home === c.myClub) || (res === 'away' && r.away === c.myClub));
    const stats = r.playerStats || {};
    const scorers = Object.keys(stats).map(k=> stats[k]).sort((a, b)=> b.goals - a.goals || b.rating - a.rating).slice(0, 3);
    const end = document.getElementById('lvEnd');
    if(!end) return;
    end.innerHTML = `
      <div class="card ${myWin ? 'hero' : ''}">
        <div class="card-head"><h3><span class="ch-ico">🏁</span> پایان مسابقه</h3>
          ${myWin ? '<span class="badge gold">برد 🎉</span>' : (c.myClub && res === 'draw' ? '<span class="badge">تساوی</span>' : (c.myClub ? '<span class="badge closed">باخت</span>' : ''))}
        </div>
        <div class="sb-row" style="gap:8px">
          <div class="sb-team"><span class="club-badge cb-md">${crestSVG(r.home)}</span><span class="name">${escapeHtml(r.home)}</span></div>
          <div class="sb-score" style="font-size:1.7rem">${faNum(r.homeGoals)} - ${faNum(r.awayGoals)}</div>
          <div class="sb-team"><span class="club-badge cb-md">${crestSVG(r.away)}</span><span class="name">${escapeHtml(r.away)}</span></div>
        </div>
        ${r.bestPlayer ? `<div class="row"><span class="r-l">⭐ بهترین بازیکن</span><span class="r-r">${escapeHtml(r.bestPlayer.name)} <span class="muted">(${faNum(r.bestPlayer.rating)})</span></span></div>` : ''}
        ${scorers.filter(s=> s.goals > 0).map(s=>`<div class="row"><span class="r-l">⚽ ${escapeHtml(s.name)}</span><span class="r-r">${faNum(s.goals)} گل</span></div>`).join('')}
        <div class="row"><span class="r-l">🎯 xG</span><span class="r-r">${faNum((r.xg || [0,0])[0])} - ${faNum((r.xg || [0,0])[1])}</span></div>
        <div class="btn-row">
          <button class="btn primary" onclick="LIVE.close()">ادامه</button>
          <button class="btn ghost" onclick="LIVE.replay()">🔁 پخش دوباره</button>
        </div>
      </div>`;
    if(myWin) confetti(28);
    const b = document.getElementById('lvPlay');
    if(b) b.textContent = '▶️ ادامه';
  },
  replay(){
    const c = this.ctx;
    if(!c) return;
    const report = c.report, opts = { myClub: c.myClub, onClose: c.onClose, label: c.label };
    this.close(true);
    this.open(report, opts);
  },
  close(silent){
    const c = this.ctx;
    if(this.timer){ clearInterval(this.timer); this.timer = null; }
    this.ctx = null;
    const root = document.getElementById('liveRoot');
    if(root){ root.style.display = 'none'; root.innerHTML = ''; }
    if(!silent && c && typeof c.onClose === 'function'){ try{ c.onClose(c.report); }catch(e){} }
  }
};

/* ---------- کاغذرنگی (جشن قهرمانی) ---------- */
function confetti(count){
  const host = document.createElement('div');
  host.className = 'confetti';
  const colors = ['#22d3ee', '#34d399', '#fbbf24', '#f4614f', '#a78bfa'];
  let html = '';
  for(let i = 0; i < (count || 24); i++){
    html += `<i style="left:${Math.random() * 96}%;background:${colors[i % colors.length]};animation-duration:${(1.6 + Math.random() * 1.4).toFixed(2)}s;animation-delay:${(Math.random() * 0.5).toFixed(2)}s"></i>`;
  }
  host.innerHTML = html;
  document.body.appendChild(host);
  setTimeout(()=> host.remove(), 3200);
}
