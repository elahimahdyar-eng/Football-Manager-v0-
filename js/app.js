/* ============================================================
   app.js — «مدیر تیم» | اپلیکیشن آنلاین موبایل
   ------------------------------------------------------------
   این فایل مغز اپ است: ورود با موبایل، ساخت باشگاه، چیدمان تیم،
   بازار نقل و انتقالات، لیگ آنلاین (آسنکرون) و پخش زنده‌ی مسابقه.

   اصول معماری (همان اصول پروژه، سخت‌گیرانه‌تر):
   • بدون build، بدون فریم‌ورک: فقط توابع کلاسیک + رشته‌ی HTML
   • همه‌ی اعداد «حقیقت» روی سرور است؛ کلاینت فقط نمایش می‌دهد
     و درخواست می‌فرستد (ضدتقلب ساختاری)
   • هر نوع رندر با تابعی جدا ⇒ قابل تست هدلس (tools/online-ui-test.js)
   • موبایل‌اول: چیدمان یک‌ستونه، لمس‌پذیر، بدون اسکرول افقی
   ============================================================ */

/* ============================================================
   وضعیت اپ
   ============================================================ */
const ST = {
  tab: 'home',
  sub: null,                    /* زیرتب داخل هر تب */
  profile: null,                /* {clubName, wallet, record, level, kit} */
  squad: null,                  /* {players, slots, formation, style, atk, def, fitness…} */
  me: null,                     /* پاسخ /api/me */
  league: null,                 /* نمای کامل لیگ جاری */
  leagueId: null,
  market: null,                 /* {list, wallet, refreshAt} */
  leaders: null,
  news: [],
  lineup: [],                   /* شناسه‌ی ۱۱ بازیکن به ترتیب جایگاه‌های زمین */
  formation: '4-4-2',
  style: 'balanced',
  dirty: false,                 /* ترکیب/تاکتیک تغییریافته که باید ذخیره شود */
  busy: false,
  error: '',
  loaded: false,
  liveSpeed: '2',
  showServer: false
};

/* ترتیب جایگاه‌ها روی زمین برای هر آرایش (GK پایین ⇒ حمله بالا) */
const FORMATION_SLOTS = {
  '4-4-2': [['GK'], ['DF', 'DF', 'DF', 'DF'], ['MF', 'MF', 'MF', 'MF'], ['FW', 'FW']],
  '4-3-3': [['GK'], ['DF', 'DF', 'DF', 'DF'], ['MF', 'MF', 'MF'], ['FW', 'FW', 'FW']],
  '3-5-2': [['GK'], ['DF', 'DF', 'DF'], ['MF', 'MF', 'MF', 'MF', 'MF'], ['FW', 'FW']],
  '5-3-2': [['GK'], ['DF', 'DF', 'DF', 'DF', 'DF'], ['MF', 'MF', 'MF'], ['FW', 'FW']]
};
const STYLE_LABELS = { attacking: 'تهاجمی', balanced: 'متعادل', defensive: 'دفاعی' };
const FORMATION_LABELS = { '4-4-2': '۴-۴-۲', '4-3-3': '۴-۳-۳', '3-5-2': '۳-۵-۲', '5-3-2': '۵-۳-۲' };

/* ============================================================
   ورود / ساخت باشگاه
   ============================================================ */
const AUTH = {
  phone: '',
  kit: { c1: '#22d3ee', c2: '#0b1220', pattern: 'stripes' },
  init(){
    this._setupOtp();
    const t = NET.token();
    if(t) this._checkToken();
    else this._showAuth();
  },
  async _checkToken(){
    try{
      const d = await Promise.race([
        NET.me(),
        new Promise((_, rej)=> setTimeout(()=> rej(new Error('timeout')), 8000))
      ]);
      if(!d || !d.ok) throw new Error((d && d.error) || 'unauthorized');
      this._goGame(d);
    }catch(e){
      NET.setToken('');
      this._showAuth();
    }
  },
  _showAuth(){
    const sp = document.getElementById('splash');
    if(sp){ sp.classList.add('hide'); setTimeout(()=>{ sp.style.display = 'none'; }, 520); }
    const auth = document.getElementById('auth');
    setTimeout(()=> { if(auth) auth.style.display = 'flex'; }, 560);
    this._step(1);
  },
  _step(n){
    const steps = document.querySelectorAll ? document.querySelectorAll('.auth-step') : [];
    for(let i = 0; i < steps.length; i++){
      steps[i].classList.toggle('on', steps[i].getAttribute('data-step') === String(n));
    }
    if(n === 3) this.paintKit();
  },
  _load(id, on){
    const b = document.getElementById(id);
    if(!b) return;
    const t = b.querySelector && b.querySelector('.btn-text');
    const l = b.querySelector && b.querySelector('.btn-loader');
    if(t) t.style.display = on ? 'none' : '';
    if(l) l.style.display = on ? 'inline-flex' : 'none';
    b.disabled = !!on;
  },
  _err(id, msg){
    const e = document.getElementById(id);
    if(e) e.textContent = msg || '';
    if(msg && navigator.vibrate) try{ navigator.vibrate(30); }catch(err){}
  },
  _setupOtp(){
    const boxes = document.querySelectorAll ? document.querySelectorAll('.otp-box') : [];
    for(let i = 0; i < boxes.length; i++){
      const b = boxes[i];
      b.addEventListener('input', ()=>{
        const v = String(b.value || '').replace(/\D/g, '').slice(-1);
        b.value = v;
        b.classList.toggle('filled', !!v);
        if(v && i < boxes.length - 1) boxes[i + 1].focus();
        if(i === boxes.length - 1 || boxes[boxes.length - 1].value){
          const code = Array.from(boxes).map(x=> x.value || '').join('');
          if(code.length === boxes.length) setTimeout(()=> AUTH.verifyOtp(), 90);
        }
      });
      b.addEventListener('keydown', (e)=>{
        if(e.key === 'Backspace' && !b.value && i > 0){
          boxes[i - 1].focus(); boxes[i - 1].value = ''; boxes[i - 1].classList.remove('filled');
        }
      });
      b.addEventListener('paste', (e)=>{
        e.preventDefault();
        const txt = String((e.clipboardData && e.clipboardData.getData('text')) || '').replace(/\D/g, '').slice(0, 5);
        txt.split('').forEach((c, j)=>{ if(boxes[j]){ boxes[j].value = c; boxes[j].classList.add('filled'); } });
        if(txt.length === 5) setTimeout(()=> AUTH.verifyOtp(), 90);
      });
    }
    const club = document.getElementById('authClub');
    if(club) club.addEventListener('input', ()=> this.paintKit());
  },
  pickKit(key, val){
    this.kit[key] = val;
    this.paintKit();
  },
  paintKit(){
    const clubEl = document.getElementById('authClub');
    const name = (clubEl && clubEl.value ? clubEl.value.trim() : '') || 'باشگاه من';
    const host = document.getElementById('authKit');
    if(!host) return;
    host.innerHTML = `
      <div class="field" style="margin-bottom:6px"><label>رنگ اصلی</label>
        <div class="chip-row">${KIT_PALETTE.slice(0, 8).map(c=>`<button class="chip ${this.kit.c1 === c.c1 ? 'on' : ''}" onclick="AUTH.pickKit('c1','${c.c1}')">${c.c1}</button>`).join('')}</div>
      </div>
      <div class="field" style="margin-bottom:6px"><label>الگوی پیراهن</label>
        <div class="chip-row">${KIT_PATTERNS.map(k=>`<button class="chip ${this.kit.pattern === k ? 'on' : ''}" onclick="AUTH.pickKit('pattern','${k}')">${k}</button>`).join('')}</div>
      </div>` + `
      <div class="kit-preview">
        <div class="jp">${jerseySVG(name, { c1: this.kit.c1, c2: this.kit.c2, pattern: this.kit.pattern })}</div>
        <div class="kp-info">
          <div class="kp-name">${escapeHtml(name)}</div>
          <div class="tiny muted">این رنگ‌ها و الگو، هویت باشگاهت در جدول و پخش زنده است.</div>
        </div>
        <div class="club-badge cb-lg">${crestSVG(name)}</div>
      </div>`;
  },
  async sendOtp(){
    const el = document.getElementById('authPhone');
    const phone = String((el && el.value) || '').replace(/\D/g, '');
    if(!/^09\d{9}$/.test(phone)){ this._err('authError1', 'شماره‌ی موبایل باید مثل ۰۹۱۲۳۴۵۶۷۸۹ باشد.'); return; }
    this._err('authError1', '');
    this._load('btnSendOtp', true);
    const r = await NET.otp(phone);
    this._load('btnSendOtp', false);
    if(!r.ok){ this._err('authError1', r.error || 'ارسال کد ناموفق بود.'); return; }
    this.phone = phone;
    const hint = document.getElementById('otpHint');
    if(hint) hint.textContent = r.dev && r.code ? `حالت دمو: کد ${r.code} خودکار پر شد` : `کد به ${phone} پیامک شد`;
    if(r.dev && r.code){
      const boxes = document.querySelectorAll ? document.querySelectorAll('.otp-box') : [];
      String(r.code).split('').forEach((c, i)=>{ if(boxes[i]){ boxes[i].value = c; boxes[i].classList.add('filled'); } });
    }
    this._step(2);
    const first = document.querySelector ? document.querySelector('.otp-box') : null;
    if(first) setTimeout(()=> first.focus(), 250);
  },
  async verifyOtp(){
    const boxes = document.querySelectorAll ? document.querySelectorAll('.otp-box') : [];
    const code = Array.from(boxes).map(b=> b.value || '').join('');
    if(code.length !== 5){ this._err('authError2', 'کد ۵ رقمی را کامل وارد کن.'); return; }
    this._err('authError2', '');
    this._load('btnVerifyOtp', true);
    const r = await NET.verify(this.phone, code, (document.getElementById('authClub') || {}).value);
    this._load('btnVerifyOtp', false);
    if(!r.ok){ this._err('authError2', r.error || 'کد اشتباه است.'); return; }
    NET.setToken(r.token);
    const me = await NET.me();
    await this._goGame(me.ok ? me : r);
  },
  async createClub(){
    const club = String(((document.getElementById('authClub') || {}).value) || '').trim();
    if(club.length < 2){ this._err('authError3', 'نام باشگاه را کامل بنویس.'); return; }
    this._err('authError3', '');
    this._load('btnCreateClub', true);
    const r = await NET.bootstrapSquad(club);
    const keep = { c1: this.kit.c1, c2: this.kit.c2, pattern: this.kit.pattern };
    if(r.ok) await NET.saveProfile({ clubName: club, kit: keep });
    this._load('btnCreateClub', false);
    if(!r.ok){ this._err('authError3', r.error || 'ساخت باشگاه ناموفق بود.'); return; }
    ST.profile = r.profile || ST.profile;
    const me = await NET.me();
    await this._goGame(me.ok ? me : { player: r.profile });
  },
  _goGame(){
    ['splash', 'auth', 'noInternet'].forEach(id=>{ const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    const app = document.getElementById('gameApp');
    if(app) app.style.display = 'flex';
    return APP.boot();          /* قابل انتظار: تست‌ها و پخش بعدی به آن تکیه می‌کنند */
  },
  logout(){
    NET.setToken('');
    ST.profile = ST.squad = ST.league = ST.market = null;
    APP.showAuth();
  },
  goOffline(){
    const frames = ['auth', 'noInternet'];
    frames.forEach(id=>{ const el = document.getElementById(id); if(el) el.style.display = 'none'; });
    const host = document.getElementById('offlineFrame');
    const iframe = document.getElementById('offlineIframe');
    if(host) host.style.display = 'flex';
    if(iframe) iframe.src = './offline.html';
  },
  exitOffline(){
    const host = document.getElementById('offlineFrame');
    if(host) host.style.display = 'none';
    const iframe = document.getElementById('offlineIframe');
    if(iframe) iframe.src = 'about:blank';
    const app = document.getElementById('gameApp');
    const auth = document.getElementById('auth');
    if(ST.profile && app) app.style.display = 'flex';
    else if(auth) auth.style.display = 'flex';
  },
  retryConnection(){
    const ni = document.getElementById('noInternet');
    if(ni) ni.style.display = 'none';
    this._showAuth();
  },
  showServerSettings(){
    ST.showServer = true;
    const box = document.getElementById('authServerBox');
    if(box) box.style.display = 'block';
    const el = document.getElementById('authServerUrl');
    if(el) el.value = NET.base();
  },
  async saveServerSettings(){
    const el = document.getElementById('authServerUrl');
    const url = String((el && el.value) || '').trim();
    NET.setBase(url);
    const r = await NET.health();
    if(r.ok) showToast('اتصال به سرور برقرار شد ✅', 'ok');
    else showToast(r.error || 'اتصال ناموفق بود ❌', 'err');
    const box = document.getElementById('authServerBox');
    if(box) box.style.display = 'none';
    if(NET.token()) APP.boot();
  }
};

/* ============================================================
   اپ اصلی
   ============================================================ */
const APP = {
  tickTimer: null,

  /* ---------- بوت ---------- */
  async boot(){
    this.showLoading();
    const me = await NET.me();
    if(!me.ok){
      if(me.netError){
        const app = document.getElementById('gameApp');
        if(app) app.style.display = 'none';
        const ni = document.getElementById('noInternet');
        if(ni) ni.style.display = 'flex';
      } else {
        AUTH.logout();
      }
      return;
    }
    ST.me = me;
    ST.profile = null;
    const jobs = [NET.profile(), NET.squad(), NET.market(), NET.news()];
    const [pr, sq, mk, nw] = await Promise.all(jobs);
    if(pr.ok) ST.profile = pr.profile;
    if(sq.ok && sq.squad){ ST.squad = sq.squad; this.syncFromSquad(); }
    if(mk.ok) ST.market = mk;
    if(nw.ok) ST.news = nw.news || [];
    if(!ST.profile && me.player){
      ST.profile = { clubName: me.player.clubName, wallet: 0, record: {}, level: { level: 1, xp: 0, xpMax: 3 }, hasSquad: me.player.hasSquad };
    }
    ST.loaded = true;
    /* لیگ جاری: اولین لیگ عضو */
    const leagues = (me.leagues || []);
    if(leagues.length && !ST.leagueId){
      const want = (ST.league && ST.league.id) || leagues[0].id;
      await this.openLeague(want, true);
    }
    this.render();
    if(!ST.squad) this.sheet(this._firstSquadSheet());
    this.startTicker();
  },
  showLoading(){
    const main = document.getElementById('gameMain');
    if(main) main.innerHTML = `
      <div class="card"><div class="skel" style="width:60%"></div><div class="skel" style="width:80%"></div><div class="skel" style="width:45%"></div></div>
      <div class="card"><div class="skel" style="height:96px"></div></div>
      <div class="card"><div class="skel" style="width:70%"></div><div class="skel" style="width:50%"></div></div>`;
  },
  showAuth(){
    const app = document.getElementById('gameApp');
    if(app) app.style.display = 'none';
    const auth = document.getElementById('auth');
    if(auth) auth.style.display = 'flex';
    AUTH._step(1);
    const sp = document.getElementById('splash');
    if(sp) sp.style.display = 'none';
  },
  syncFromSquad(){
    const sq = ST.squad;
    if(!sq) return;
    ST.formation = sq.formation || '4-4-2';
    ST.style = sq.style || 'balanced';
    const ids = new Set((sq.players || []).map(p=> String(p.id)));
    const slots = (sq.slots || []).filter(id=> ids.has(String(id))).map(String);
    ST.lineup = this.reflowLineup(slots);
    ST.dirty = false;
  },
  /* ترتیب ترکیب را با قالب آرایش هم‌تراز می‌کند */
  reflowLineup(slots){
    const sq = ST.squad || { players: [] };
    const byId = {};
    (sq.players || []).forEach(p=>{ byId[String(p.id)] = p; });
    const template = FORMATION_SLOTS[ST.formation] || FORMATION_SLOTS['4-4-2'];
    const flat = [].concat.apply([], template);          /* ['GK','DF','DF',…] */
    const chosen = [];
    const used = {};
    /* ۱) بازیکنانی که در ترکیب قبلی بودند و پستشان می‌خورد */
    slots.forEach(id=>{
      const p = byId[id];
      if(p && !used[id]) { chosen.push(p); used[id] = true; }
    });
    const spare = (sq.players || []).filter(p=> !used[String(p.id)]);
    const out = [];
    for(let i = 0; i < flat.length; i++){
      const want = flat[i];
      let pickIdx = chosen.findIndex((p, idx)=> !used['_s' + idx] && p.pos === want);
      if(pickIdx < 0) pickIdx = chosen.findIndex((p, idx)=> !used['_s' + idx]);
      if(pickIdx >= 0){
        const p = chosen[pickIdx];
        used['_s' + pickIdx] = true;
        out.push(String(p.id));
      } else {
        /* از ذخیره‌ها بردار */
        let sIdx = spare.findIndex((p, idx)=> !used['_b' + idx] && p.pos === want);
        if(sIdx < 0) sIdx = spare.findIndex((p, idx)=> !used['_b' + idx]);
        if(sIdx >= 0){ const p = spare[sIdx]; used['_b' + sIdx] = true; out.push(String(p.id)); }
        else out.push('');
      }
    }
    return out;
  },
  playerById(id){
    const sq = ST.squad;
    if(!sq) return null;
    return (sq.players || []).find(p=> String(p.id) === String(id)) || null;
  },
  starters(){
    return (ST.lineup || []).map(id=> this.playerById(id)).filter(Boolean);
  },
  bench(){
    const inLine = {}; (ST.lineup || []).forEach(id=>{ inLine[String(id)] = true; });
    return ((ST.squad && ST.squad.players) || []).filter(p=> !inLine[String(p.id)]);
  },
  teamOvr(){
    const st = this.starters();
    if(!st.length) return (ST.squad && ST.squad.overall) || 60;
    return Math.round(st.reduce((s, p)=> s + (Number(p.attack) || 0), 0) / st.length);
  },

  /* ---------- تیک زمان‌دار (شمارش معکوس پنجره‌ی هفته) ---------- */
  startTicker(){
    if(this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(()=>{
      const host = document.getElementById('cdWrap');
      if(!host || !ST.league || !ST.league.window) return;
      host.innerHTML = this.countdownHTML(ST.league.window);
    }, 1000);
  },
  countdownHTML(win){
    if(!win) return '';
    if(!win.open) return `<div class="tiny muted" style="margin-top:10px">🔒 پنجره‌ی این هفته بسته است — هفته بعد را بازی کن.</div>`;
    const p = countdownParts((win.closesAt || 0) - Date.now());
    const cell = (v, l)=> `<div class="cd-cell"><b>${faNum(v)}</b><span>${l}</span></div>`;
    return `<div class="countdown">
      ${cell(p.d, 'روز')}${cell(p.h, 'ساعت')}${cell(p.m, 'دقیقه')}${cell(p.s, 'ثانیه')}
    </div>
    <div class="tiny muted center" style="margin-top:6px">تا بسته‌شدن پنجره‌ی ثبت ترکیب</div>`;
  },

  /* ---------- رندر کلی ---------- */
  render(){
    if(typeof resetFaceSprite === 'function') resetFaceSprite();   /* فقط چهره‌های این نما در DOM */
    this.paintHeader();
    const main = document.getElementById('gameMain');
    if(!main) return;
    let html = '';
    if(ST.tab === 'home') html = this.viewHome();
    else if(ST.tab === 'team') html = this.viewTeam();
    else if(ST.tab === 'league') html = this.viewLeague();
    else if(ST.tab === 'market') html = this.viewMarket();
    else if(ST.tab === 'club') html = this.viewClub();
    main.innerHTML = `<div id="tabContent">${html}</div>`;
    if(ST.tab === 'club') this.paintClubExtras();
    if(ST.tab === 'market') this.paintMarketExtras();
    const nav = document.querySelectorAll ? document.querySelectorAll('.nav-btn') : [];
    for(let i = 0; i < nav.length; i++) nav[i].classList.toggle('on', nav[i].getAttribute('data-tab') === ST.tab);
    this.saveScroll();
  },
  saveScroll(){ /* نگه‌داشتن حس اپ: اسکرول در تغییر تب صفر می‌شود */ },
  switchTab(tab){
    ST.tab = tab;
    ST.sub = null;
    const main = document.getElementById('gameMain');
    if(main) main.scrollTop = 0;
    this.render();
    if(tab === 'league' && !ST.league){
      if((ST.me && ST.me.leagues || []).length) this.openLeague(ST.me.leagues[0].id);
    }
    if(tab === 'market' && !ST.market) this.reloadMarket();
    if(tab === 'club' && !ST.leaders) this.reloadLeaders();
  },
  setSub(s){ ST.sub = s; const main = document.getElementById('gameMain'); if(main) main.scrollTop = 0; this.render(); },

  /* ---------- هدر ---------- */
  paintHeader(){
    const p = ST.profile || {};
    const set = (id, v)=>{ const el = document.getElementById(id); if(el) el.textContent = v; };
    const club = p.clubName || (ST.me && ST.me.player && ST.me.player.clubName) || 'باشگاه من';
    set('hdrClub', club);
    set('hdrManager', (ST.me && ST.me.player && ST.me.player.phone) ? 'مدیر · ' + ST.me.player.phone : 'مدیر تیم');
    const crest = document.getElementById('hdrCrest');
    if(crest) crest.innerHTML = crestSVG(club);
    this.paintHeaderStats();
  },
  paintHeaderStats(){
    const main = document.getElementById('appHeaderStats');
    if(!main) return;
    const p = ST.profile || {};
    const lg = ST.league;
    const rank = lg && lg.myRank ? faNum(lg.myRank) : '—';
    const ovr = this.teamOvr();
    const rec = p.record || {};
    const week = lg && lg.nextRound !== null && lg.nextRound !== undefined ? faNum(lg.nextRound + 1) : '—';
    const total = lg ? faNum(lg.totalRounds) : '—';
    main.innerHTML = `
      <div class="hstat hl"><b>${moneyFmt(p.wallet)}</b><span>💰 بودجه</span></div>
      <div class="hstat"><b>${faNum(ovr)}</b><span>⭐ قدرت تیم</span></div>
      <div class="hstat"><b>${rank}${lg ? '<span style="font-size:.6rem"> / ' + faNum(lg.teams) + '</span>' : ''}</b><span>🏆 رتبه</span></div>
      <div class="hstat"><b>${faNum(rec.won || 0)}/${faNum(rec.drawn || 0)}/${faNum(rec.lost || 0)}</b><span>برد/مساوی/باخت</span></div>
      <div class="hstat"><b>${week}<span style="font-size:.6rem">/${total}</span></b><span>📅 هفته</span></div>`;
    const bar = document.getElementById('hdrProgress');
    if(bar && lg && lg.totalRounds){
      const done = lg.nextRound === null ? lg.totalRounds : lg.nextRound;
      bar.style.width = Math.round((done / lg.totalRounds) * 100) + '%';
    }
  },

  /* ============================================================
     تب خانه
     ============================================================ */
  viewHome(){
    const p = ST.profile || {};
    const lg = ST.league;
    const next = lg && lg.myNextMatch;
    const win = lg && lg.window;
    const myName = p.clubName || '';
    const opp = next ? (next.home === myName ? next.away : next.home) : null;
    const isHome = next ? next.home === myName : false;
    const form = this.myForm(lg);
    return `
      <div class="card hero flush" style="padding:0;overflow:hidden">
        ${stadiumArtSVG()}
        <div style="position:relative;z-index:2;margin-top:-46px;padding:14px">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="club-badge cb-xl">${crestSVG(p.clubName || 'باشگاه من')}</span>
            <div style="min-width:0">
              <div style="font-weight:900;font-size:1.06rem" class="nowrap">${escapeHtml(p.clubName || 'باشگاه من')}</div>
              <div class="tiny muted">سطح ${faNum((p.level || {}).level || 1)} · ${faNum((p.level || {}).xp || 0)}/${faNum((p.level || {}).xpMax || 3)} تجربه</div>
              <div style="display:flex;gap:6px;margin-top:8px;align-items:center">
                ${(form.length ? `<span class="form-strip">${form.map(f=> formBadgeHTML(f)).join('')}</span>` : '<span class="tiny muted">هنوز بازی‌ای انجام نشده</span>')}
              </div>
            </div>
            <div style="margin-inline-start:auto;text-align:center">
              <div style="font-size:1.5rem;font-weight:900;background:var(--grad-brand);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">${faNum(this.teamOvr())}</div>
              <div class="tiny muted">OVR</div>
            </div>
          </div>
          <div class="stat-grid" style="margin-top:12px">
            <div class="stat-tile y"><b>${moneyFmt(p.wallet)}</b><span>💰 بودجه</span></div>
            <div class="stat-tile g"><b>${faNum((ST.squad || {}).fitness || 0)}٪</b><span>❤️ آمادگی</span></div>
            <div class="stat-tile"><b>${faNum((ST.squad || {}).players ? ST.squad.players.length : 0)}</b><span>👥 بازیکن</span></div>
          </div>
        </div>
      </div>

      ${!ST.squad ? `<div class="card danger">
        <div class="card-head"><h3><span class="ch-ico">⚠️</span> اول تیمت را بساز</h3></div>
        <div class="small muted">هنوز ترکیبی روی سرور نداری. با یک لمس، ۱۴ بازیکن شروع را می‌گیری و لیگ را شروع می‌کنی.</div>
        <button class="btn primary wide" style="margin-top:10px" onclick="APP.createStarterSquad()">ساخت تیم شروع 👥</button>
      </div>` : ''}

      ${!lg ? `<div class="card gold">
        <div class="card-head"><h3><span class="ch-ico">🏆</span> لیگ آنلاین بساز</h3></div>
        <div class="small muted">با رفقا لیگ بزن یا با تیم‌های AI رقابت کن. نتایج را سرور محاسبه و تأیید می‌کند.</div>
        <div class="btn-row">
          <button class="btn gold" onclick="APP.createLeagueSheet()">➕ ساخت لیگ</button>
          <button class="btn ghost" onclick="APP.joinLeagueSheet()">🔗 ورود با شناسه</button>
        </div>
      </div>` : ''}

      ${next ? `
      <div class="sec-title">⚽ بازی بعدی تو</div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div style="text-align:center;flex:1;min-width:0">
            <span class="club-badge cb-lg">${crestSVG(myName)}</span>
            <div class="small nowrap" style="margin-top:6px;font-weight:700">${escapeHtml(myName)}</div>
            <div class="tiny muted">${isHome ? 'میزبان 🏟️' : 'میهمان ✈️'}</div>
          </div>
          <div style="text-align:center;flex:0 0 auto">
            <div style="font-weight:900;font-size:1.1rem">VS</div>
            <div class="tiny muted">هفته ${faNum((lg.nextRound || 0) + 1)}</div>
            <div class="tag" style="margin-top:6px">${escapeHtml(lg.name)}</div>
          </div>
          <div style="text-align:center;flex:1;min-width:0">
            <span class="club-badge cb-lg">${crestSVG(opp || 'حریف')}</span>
            <div class="small nowrap" style="margin-top:6px;font-weight:700">${escapeHtml(opp || 'حریف')}</div>
            <div class="tiny muted">${isHome ? 'میهمان' : 'میزبان'}</div>
          </div>
        </div>
        <div id="cdWrap">${this.countdownHTML(win)}</div>
        <div class="btn-row">
          ${lg.mySubmitted ? '<button class="btn ghost" disabled>✅ ترکیب ثبت شد</button>' : `<button class="btn ghost" onclick="APP.submitWeek()">📝 ثبت ترکیب هفته</button>`}
          <button class="btn primary" onclick="APP.playWeek()" ${ST.busy ? 'disabled' : ''}>▶️ بازی هفته</button>
        </div>
        ${next ? `<button class="btn flat wide" style="margin-top:6px" onclick="APP.setTabLeague('table')">جدول و برنامه‌ی کامل ←</button>` : ''}
      </div>` : (lg ? `
      <div class="sec-title">🏁 لیگ</div>
      <div class="card">
        <div class="card-head"><h3><span class="ch-ico">🏁</span> فصل تمام شد</h3>${lg.isOwner ? '<span class="badge gold">میزبان تو</span>' : ''}</div>
        <div class="small muted">${escapeHtml(lg.name)} — برای ادامه، فصل جدید را شروع کن.</div>
        <div class="btn-row">
          <button class="btn ghost" onclick="APP.setTabLeague('table')">جدول نهایی</button>
          ${lg.isOwner ? '<button class="btn primary" onclick="APP.newSeason()">🔄 فصل جدید</button>' : ''}
        </div>
      </div>` : '')}

      <div class="sec-title">⚡ دسترسی سریع</div>
      <div class="stat-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="card tight" style="margin:0" onclick="APP.switchTab('team')">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.4rem">👥</span>
          <div><div class="small" style="font-weight:700">ترکیب و تمرین</div><div class="tiny muted">چیدن تیم، تاکتیک</div></div></div>
        </div>
        <div class="card tight" style="margin:0" onclick="APP.switchTab('market')">
          <div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.4rem">💱</span>
          <div><div class="small" style="font-weight:700">بازار نقل و انتقالات</div><div class="tiny muted">${(ST.market && ST.market.list) ? faNum(ST.market.list.length) + ' بازیکن آماده' : 'در حال بارگذاری…'}</div></div></div>
        </div>
      </div>

      ${lg ? `<div class="sec-title">📊 جدول لیگ — بالای جدول</div>
      <div class="table-scroll">${this.tableHTML(lg, 6)}</div>` : ''}

      ${(ST.market && ST.market.list && ST.market.list.length) ? `
      <div class="sec-title">🔥 پیشنهاد بازار این هفته</div>
      ${ST.market.list.slice(0, 3).map(x=> this.marketRowHTML(x)).join('')}` : ''}

      <div class="sec-title">📰 اخبار باشگاه</div>
      <div class="card tight">${this.newsHTML(6)}</div>
    `;
  },
  myForm(lg){
    if(!lg || !lg.fixtures || !ST.profile) return [];
    const my = ST.profile.clubName;
    const out = [];
    (lg.fixtures || []).forEach((pairs, r)=>{
      (pairs || []).forEach(([hi, ai])=>{
        const key = r + ':' + hi + ':' + ai;
        const res = (lg.results || {})[key];
        if(!res) return;
        const hName = lg.names[hi], aName = lg.names[ai];
        if(hName !== my && aName !== my) return;
        const isHome = hName === my;
        const mine = isHome ? res.h : res.a, opp = isHome ? res.a : res.h;
        out.push(mine > opp ? 3 : mine === opp ? 1 : 0);
      });
    });
    return out.slice(-5);
  },
  newsHTML(limit){
    const list = (ST.news || []).slice(0, limit || 8);
    if(!list.length) return `<div class="empty"><div class="e-ico">📰</div>خبری نیست؛ بازی هفته را جلو ببر.</div>`;
    return list.map(n=>`
      <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px dashed rgba(255,255,255,.07)">
        <span style="font-size:1.2rem;flex:0 0 auto">${n.icon || '📰'}</span>
        <div style="flex:1;min-width:0">
          <div class="small" style="font-weight:700">${escapeHtml(n.title || '')}</div>
          <div class="tiny muted">${escapeHtml(n.text || '')}</div>
        </div>
        ${n.coins ? `<span class="tiny ${n.coins > 0 ? 'tag ok' : 'tag warn'}" dir="ltr">${n.coins > 0 ? '+' : ''}${moneyFmt(n.coins)}</span>` : ''}
      </div>`).join('');
  },
  tableHTML(lg, limit){
    const rows = (lg.table || []);
    const me = (ST.profile || {}).clubName;
    const ai = {};
    (lg.members || []).forEach(m=>{ if(m.ai) ai[m.clubName] = true; });
    let list = rows;
    if(limit && rows.length > limit){
      const idx = rows.findIndex(r=> r.name === me);
      list = rows.slice(0, limit);
      if(idx >= limit) list = list.concat([rows[idx]]);
    }
    return `<table class="ltable">
      <thead><tr><th>#</th><th class="tl">تیم</th><th>بازی</th><th>ب.ب</th><th>م</th><th>ب.خ</th><th>گ.ز</th><th>گ.خ</th><th>امتیاز</th></tr></thead>
      <tbody>${list.map(r=>`
        <tr class="${r.name === me ? 'me' : ''}">
          <td class="rank r${r.rank}">${faNum(r.rank)}</td>
          <td class="tl"><span class="club-badge cb-sm">${crestSVG(r.name)}</span><span>${escapeHtml(r.name)}${ai[r.name] ? ' 🤖' : ''}</span></td>
          <td>${faNum(r.played)}</td><td>${faNum(r.won)}</td><td>${faNum(r.drawn)}</td><td>${faNum(r.lost)}</td>
          <td>${faNum(r.gf)}</td><td>${faNum(r.ga)}</td><td class="pts">${faNum(r.pts)}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  },

  /* ============================================================
     تب تیم (ترکیب / فهرست / تمرین)
     ============================================================ */
  viewTeam(){
    if(!ST.squad) return `<div class="card danger"><div class="card-head"><h3><span class="ch-ico">⚠️</span> تیمی نداری</h3></div>
      <div class="small muted">اول اسکواد شروع را بساز تا ترکیب بچینی.</div>
      <button class="btn primary wide" style="margin-top:10px" onclick="APP.createStarterSquad()">ساخت تیم شروع 👥</button></div>`;
    const sub = ST.sub || 'lineup';
    const tabs = `<div class="tabs">
      ${[['lineup', '🧩 ترکیب'], ['squad', '👥 فهرست'], ['train', '🏋️ تمرین']].map(([k, l])=>
        `<button class="${sub === k ? 'on' : ''}" onclick="APP.setSub('${k}')">${l}</button>`).join('')}
    </div>`;
    if(sub === 'squad') return tabs + this.squadListHTML();
    if(sub === 'train') return tabs + this.trainHTML();
    return tabs + this.lineupHTML();
  },
  lineupHTML(){
    const sq = ST.squad;
    const template = FORMATION_SLOTS[ST.formation] || FORMATION_SLOTS['4-4-2'];
    /* جایگاه‌ها روی زمین: GK پایین، حمله بالا — اما ترتیب ذخیره‌سازی
       همیشه [GK, DF…, MF…, FW…] است تا سرور و کلاینت یکی ببینند. */
    const offsets = [];
    let acc = 0;
    template.forEach(line=>{ offsets.push(acc); acc += line.length; });
    const renderLine = (line, lineIdx)=>{
      const base = offsets[lineIdx];
      const cells = line.map((want, i)=>{
        const slot = base + i;
        const id = ST.lineup[slot];
        const p = id ? this.playerById(id) : null;
        if(!p) return `<button class="pdot empty" onclick="APP.pickForSlot(${slot})"><span class="pdot-name">${posFa(want)}</span></button>`;
        return pitchDotHTML({ id: p.id, name: p.name, position: p.pos, attack: p.attack }, {
          onclick: `APP.pickForSlot(${slot})`,
          cls: ST.captainId === String(p.id) ? 'cap' : ''
        });
      }).join('');
      return `<div class="pitch-line ${line.length === 1 ? 'one' : ''}">${cells}</div>`;
    };
    const lines = [];
    for(let i = template.length - 1; i >= 0; i--) lines.push(renderLine(template[i], i));
    const st = this.starters();
    const bench = this.bench();
    const strong = st.length ? Math.round(st.reduce((s, p)=> s + p.attack, 0) / st.length) : 0;
    return `
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">🧩</span> ترکیب ${FORMATION_LABELS[ST.formation] || ST.formation}</h3>
          <span class="ch-act">${ST.dirty ? 'تغییر ذخیره‌نشده' : 'ذخیره‌شده ✅'}</span></div>
        <div class="chip-row">
          ${Object.keys(FORMATION_SLOTS).map(k=>`<button class="chip ${ST.formation === k ? 'on' : ''}" onclick="APP.setFormation('${k}')">${FORMATION_LABELS[k]}</button>`).join('')}
        </div>
        <div class="chip-row">
          ${Object.keys(STYLE_LABELS).map(k=>`<button class="chip ${ST.style === k ? 'on' : ''}" onclick="APP.setStyle('${k}')">${STYLE_LABELS[k]}</button>`).join('')}
        </div>
      </div>
      <div class="pitch" style="margin-top:0">
        <div class="pitch-box top"></div>
        <div class="pitch-box bottom"></div>
        ${lines.join('')}
      </div>
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">📊</span> وضعیت تیم</h3><span class="ch-act">قدرت ${faNum(strong)}</span></div>
        ${fitnessBarHTML(sq.fitness, 'آمادگی')}
        ${fitnessBarHTML(sq.stamina, 'استقامت')}
        ${fitnessBarHTML(sq.morale, 'روحیه')}
        <div class="row"><span class="r-l">حمله / دفاع</span><span class="r-r">${faNum(sq.atk)} / ${faNum(sq.def)}</span></div>
        <div class="row"><span class="r-l">ارزش کل فهرست</span><span class="r-r">${moneyFull(sq.totalValue)}</span></div>
        <div class="tiny muted" style="margin-top:6px">آمادگی و روحیه بعد از هر هفته‌ی بازی عوض می‌شوند؛ با «اردوی بازیابی» و چرخش بازیکنان تیم را سرحال نگه دار.</div>
      </div>
      <div class="sec-title">🪑 نیمکت (${faNum(bench.length)})</div>
      <div class="bench-row">
        ${bench.map(p=>`<button class="bench-item" onclick="APP.playerSheet('${p.id}')">
          ${APP.face(p, { size:'sm', pos: p.pos })}
          <b>${escapeHtml(String(p.name).split(' ')[0])}</b>
          <span class="bi-ovr ${ovrClass(p.attack)}">${faNum(p.attack)}</span>
        </button>`).join('') || '<div class="empty" style="padding:8px">نیمکت خالی است</div>'}
      </div>
      <div class="sticky-cta">
        <button class="btn ghost" onclick="APP.autoFill()">🎲 چینش خودکار</button>
        <button class="btn primary" onclick="APP.saveLineup()" ${ST.dirty ? '' : 'disabled'}>💾 ذخیره‌ی ترکیب</button>
      </div>`;
  },
  squadListHTML(){
    const players = (ST.squad.players || []).slice().sort((a, b)=> b.attack - a.attack);
    return `
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">👥</span> فهرست بازیکنان</h3><span class="ch-act">${faNum(players.length)} نفر</span></div>
        <div class="filter-row" style="padding-bottom:0">
          ${['all', 'GK', 'DF', 'MF', 'FW'].map(k=>`<button class="chip ${(ST.posFilter || 'all') === k ? 'on' : ''}" onclick="APP.filterPos('${k}')">${k === 'all' ? 'همه' : k + ' ' + posFa(k)}</button>`).join('')}
        </div>
      </div>
      <div class="plist">
        ${players.filter(p=> (ST.posFilter || 'all') === 'all' || p.pos === ST.posFilter).map(p=>`
          <div class="prow p-${p.pos}" onclick="APP.playerSheet('${p.id}')">
            ${APP.face(p, { size:'sm', pos: p.pos })}
            <div class="p-info">
              <div class="p-name">${escapeHtml(p.name)}
                ${ST.captainId === String(p.id) ? '<span class="tag cap">کاپیتان</span>' : ''}
                ${(ST.lineup || []).includes(String(p.id)) ? '<span class="tag ok">ترکیب</span>' : ''}
              </div>
              <div class="p-meta">${faNum(p.age)} سال · پتانسیل ${faNum(p.potential)} · ${posFa(p.pos)}</div>
            </div>
            <div class="p-right">
              <span class="p-price">${moneyFmt(p.value)}</span>
              <span class="p-ovr ${ovrClass(p.attack)}">${faNum(p.attack)}</span>
            </div>
          </div>`).join('')}
      </div>`;
  },
  filterPos(k){ ST.posFilter = k; this.render(); },
  trainHTML(){
    const sq = ST.squad;
    const cost = { attack: 320000, defense: 320000, fitness: 260000, recovery: 180000 };
    const card = (kind, icon, title, desc, effect)=> `
      <div class="market-item">
        <span class="icon-btn" style="width:48px;height:56px;font-size:1.5rem;flex:0 0 auto">${icon}</span>
        <div class="mi-info">
          <div class="mi-name">${title}</div>
          <div class="mi-meta">${desc}</div>
          <div class="tiny muted" style="margin-top:3px">${effect}</div>
        </div>
        <div class="mi-buy">
          <span class="price-tag">💰 ${moneyFmt(cost[kind])}</span>
          <button class="btn xs primary" onclick="APP.train('${kind}')">اجرا</button>
        </div>
      </div>`;
    return `
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">🏋️</span> وضعیت باشگاه</h3><span class="ch-act">💰 ${moneyFmt((ST.profile || {}).wallet)}</span></div>
        ${fitnessBarHTML(sq.fitness, 'آمادگی')}
        ${fitnessBarHTML(sq.stamina, 'استقامت')}
        ${fitnessBarHTML(sq.morale, 'روحیه')}
        <div class="tiny muted" style="margin-top:6px">هر جلسه یک‌بار در هفته اثر دارد و از بودجه کم می‌کند. بازی‌ها آمادگی را پایین می‌آورند؛ 「اردوی بازیابی」 برمی‌گرداند.</div>
      </div>
      <div class="sec-title">جلسه‌های تمرین</div>
      ${card('attack', '🎯', 'تمرین تهاجمی', '۵ بازیکن هجومی +۱ قدرت حمله', 'بیشترین اثر روی مهاجم و هافبک')}
      ${card('defense', '🛡️', 'تمرین دفاعی', '۵ بازیکن دفاعی +۱ قدرت', 'بیشترین اثر روی مدافع و دروازه‌بان')}
      ${card('fitness', '🏃', 'بدنسازی', 'استقامت تیم +۵', 'بازیکنان پراستقامت دیرتر خسته می‌شوند')}
      ${card('recovery', '🛌', 'اردوی بازیابی', 'آمادگی +۲۲', 'قبل از بازی‌های بزرگ استفاده کن')}
    `;
  },

  /* ============================================================
     تب لیگ
     ============================================================ */
  viewLeague(){
    if(!ST.league) return this.leagueListHTML();
    const lg = ST.league;
    const sub = ST.sub || 'table';
    const win = lg.window || {};
    const my = (ST.profile || {}).clubName;
    const tabs = `<div class="tabs">
      ${[['table', '📊 جدول'], ['fixtures', '🗓️ برنامه'], ['stats', '👟 آمار'], ['history', '📜 تاریخچه']].map(([k, l])=>
        `<button class="${sub === k ? 'on' : ''}" onclick="APP.setSub('${k}')">${l}</button>`).join('')}
    </div>`;
    return `
      <div class="league-hero">
        <div class="lh-top">
          <span class="lh-trophy">${trophyArtSVG()}</span>
          <div style="flex:1;min-width:0">
            <h2 class="nowrap">${escapeHtml(lg.name)}</h2>
            <div class="lh-sub">فصل ${faNum(lg.season || 1)} · ${faNum(lg.teams)} تیم${lg.aiCount ? ' · ' + faNum(lg.aiCount) + ' AI' : ''} · ${lg.isOwner ? 'میزبان: تو' : ''}</div>
            <div style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="lh-code">${lg.id}</span>
              <button class="badge" onclick="APP.shareLeague()">📤 ارسال شناسه</button>
              <span class="badge ${win.open ? 'open' : 'closed'}">${win.open ? '🟢 پنجره باز' : '🔒 پنجره بسته'}</span>
              ${lg.mySubmitted ? '<span class="badge gold">ترکیب ثبت شد ✅</span>' : ''}
            </div>
          </div>
        </div>
        <div id="cdWrap">${this.countdownHTML(win)}</div>
        <div class="btn-row">
          <button class="btn ghost" onclick="APP.submitWeek()">📝 ثبت ترکیب</button>
          ${lg.nextRound !== null
            ? `<button class="btn primary" onclick="APP.playWeek()" ${ST.busy ? 'disabled' : ''}>${ST.busy ? '⏳ در حال بازی' : '▶️ بازی هفته ' + faNum((lg.nextRound || 0) + 1)}</button>`
            : (lg.isOwner ? '<button class="btn gold" onclick="APP.newSeason()">🔄 فصل جدید</button>' : '')}
        </div>
        <div class="btn-row">
          <button class="btn ghost sm" onclick="APP.reloadLeague()">🔄 تازه‌سازی</button>
          ${lg.isOwner && !lg.started && lg.teams < 12 ? `<button class="btn ghost sm" onclick="APP.fillAI()">🤖 پر کردن با AI</button>` : ''}
          ${lg.isOwner && lg.nextRound !== null ? `<button class="btn ghost sm" onclick="APP.forceAdvance()">⏭ بازی فوری</button>` : ''}
          <button class="btn ghost sm" onclick="APP.closeLeague()">📚 لیگ‌های من</button>
        </div>
      </div>
      ${tabs}
      ${sub === 'table' ? `<div class="table-scroll">${this.tableHTML(lg)}</div>
        <div class="tiny muted center" style="margin-top:8px">بهترین تیم‌های هر فصل با 🏆 نشان داده می‌شوند · ردیف تو سبز است</div>` : ''}
      ${sub === 'fixtures' ? this.fixturesHTML(lg, my) : ''}
      ${sub === 'stats' ? this.statsHTML(lg) : ''}
      ${sub === 'history' ? this.historyHTML(lg) : ''}
    `;
  },
  leagueListHTML(){
    const leagues = (ST.me && ST.me.leagues) || [];
    return `
      <div class="card gold">
        <div class="card-head"><h3><span class="ch-ico">🏆</span> لیگ‌های من</h3></div>
        ${leagues.length ? `<div class="leagues-grid">${leagues.map(l=>`
          <div class="league-card" onclick="APP.openLeague('${l.id}')">
            <span class="lc-ico">${faNum(l.members)}</span>
            <div class="lc-info">
              <div class="lc-name">${escapeHtml(l.name)}</div>
              <div class="lc-meta">${l.isOwner ? 'میزبان: تو' : 'عضو'} · ${l.nextRound === null ? 'پایان فصل' : 'هفته ' + faNum(l.nextRound + 1)}</div>
            </div>
            <span class="ch-act">باز کردن ←</span>
          </div>`).join('')}</div>`
        : `<div class="empty"><div class="e-ico">🏆</div>هنوز در لیگی نیستی.<br>یک لیگ بساز یا با شناسه به لیگ رفیقت بیا.</div>`}
      </div>
      <div class="card">
        <div class="card-head"><h3><span class="ch-ico">➕</span> ساخت لیگ جدید</h3></div>
        <div class="tiny muted">لیگ آسنکرون است: هر هفته ترکیب می‌دهی و سرور نتایج را محاسبه می‌کند. با تیک «تیم‌های AI» حتی تنها هم می‌توانی بازی کنی.</div>
        <div class="btn-row">
          <button class="btn primary" onclick="APP.createLeagueSheet()">ساخت لیگ</button>
          <button class="btn ghost" onclick="APP.joinLeagueSheet()">ورود با شناسه</button>
        </div>
      </div>
      ${ST.league || !(ST.me && ST.me.leagues && ST.me.leagues.length) ? '' : ''}
      <div class="sec-title">🏅 جدول رهبران جهانی</div>
      <div class="card tight">${this.leadersHTML()}</div>
    `;
  },
  fixturesHTML(lg, my){
    const results = lg.results || {};
    return (lg.fixtures || []).map((pairs, r)=>{
      const done = (pairs || []).every(([hi, ai])=> results[r + ':' + hi + ':' + ai]);
      const isNext = r === lg.nextRound;
      return `<div class="round ${isNext ? 'next' : ''}">
        <div class="round-h"><span>هفته ${faNum(r + 1)}</span>
          <span class="tiny muted">${done ? '✅ بازی‌شده' : (isNext ? '⏳ دور بعدی' : 'در انتظار')}</span></div>
        ${(pairs || []).map(([hi, ai])=>{
          const key = r + ':' + hi + ':' + ai;
          const res = results[key];
          const hName = lg.names[hi], aName = lg.names[ai];
          const mine = hName === my || aName === my;
          return `<div class="match-row ${mine ? 'mine' : ''}" ${res && res.reportId ? `onclick="APP.watchReport('${res.reportId}')"` : (res ? `onclick="APP.verifyResult(${JSON.stringify(res).replace(/"/g, '&quot;')})"` : '')}>
            <span class="mr-team">${crestSVG(hName)}<span class="mr-name">${escapeHtml(hName)}</span></span>
            <span class="mr-score ${res ? '' : 'empty'}">${res ? faNum(res.h) + ' - ' + faNum(res.a) : 'vs'}</span>
            <span class="mr-team away"><span class="mr-name">${escapeHtml(aName)}</span>${crestSVG(aName)}</span>
          </div>`;
        }).join('')}
      </div>`;
    }).join('') + `<div class="tiny muted center" style="margin:10px 0">روی هر نتیجه بزن تا پخش زنده‌ی همان مسابقه را ببینی · سرور نتایج را از روی seed تأیید می‌کند</div>`;
  },
  statsHTML(lg){
    const S = lg.sideStats || {};
    const block = (title, icon, arr, unit, color)=>{
      const list = (arr || []).slice(0, 8);
      return `<div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">${icon}</span> ${title}</h3></div>
        ${list.length ? list.map((x, i)=>`
          <div class="scorer-row">
            <span class="sr-rank">${faNum(i + 1)}</span>
            ${APP.faceList(x, { size:'xs', pos: null })}
            <div class="sr-info">
              <div class="sr-name">${escapeHtml(x.name || '')}</div>
              <div class="sr-club">${escapeHtml(x.club || '')}</div>
            </div>
            <span class="sr-val" style="${color ? 'color:' + color : ''}">${faNum(x.value)}</span>
          </div>`).join('') : '<div class="empty" style="padding:14px">هنوز آماری ثبت نشده</div>'}
      </div>`;
    };
    const totals = `
      <div class="card tight crowd-strip">
        <div class="cs-item"><b>${faNum(S.totalGoals || 0)}</b><span>⚽ گل این فصل</span></div>
        <div class="cs-item"><b>${faNum(S.totalAssists || 0)}</b><span>🎯 پاس گل</span></div>
        <div class="cs-item"><b>${faNum(S.totalCleanSheets || 0)}</b><span>🧤 کلین‌شیت</span></div>
        <div class="cs-item"><b>${faNum(S.scorerCount || 0)}</b><span>👟 گل‌زن</span></div>
      </div>`;
    return totals + block('آقای گل', '⚽', S.scorers) + block('پاس گل', '🎯', S.assists) + block('کلین‌شیت', '🧤', S.cleanSheets, '', 'var(--blue)');
  },
  historyHTML(lg){
    const h = (lg.history || []).slice().reverse();
    if(!h.length) return `<div class="card"><div class="empty"><div class="e-ico">📜</div>هنوز فصلی تمام نشده.</div></div>`;
    return h.map(x=>`
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">🏆</span> فصل ${faNum(x.season)}</h3></div>
        <div class="row"><span class="r-l">قهرمان</span><span class="r-r">${escapeHtml(x.champion || '—')}</span></div>
        <div class="row"><span class="r-l">نایب‌قهرمان</span><span class="r-r">${escapeHtml(x.runnerUp || '—')}</span></div>
        ${x.topScorer ? `<div class="row"><span class="r-l">آقای گل</span><span class="r-r">${escapeHtml(x.topScorer)}</span></div>` : ''}
      </div>`).join('');
  },
  leadersHTML(){
    const L = ST.leaders;
    if(!L) return '<div class="skel"></div><div class="skel" style="width:70%"></div>';
    const top = (L.top || []).slice(0, 10);
    if(!top.length) return '<div class="empty" style="padding:14px">هنوز کسی بازی نکرده — تو اول باش!</div>';
    return top.map((x, i)=>`
      <div class="scorer-row">
        <span class="sr-rank">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : faNum(i + 1)}</span>
        <span class="club-badge cb-sm">${crestSVG(x.clubName)}</span>
        <div class="sr-info">
          <div class="sr-name">${escapeHtml(x.clubName)}${x.isMe ? ' <span class="tag ok">تو</span>' : ''}</div>
          <div class="sr-club">${faNum(x.played)} بازی · تفاضل ${faNum(x.gd)}${x.titles ? ' · ' + faNum(x.titles) + ' قهرمانی 🏆' : ''}</div>
        </div>
        <span class="sr-val">${faNum(x.points)}</span>
      </div>`).join('');
  },

  /* ============================================================
     تب بازار
     ============================================================ */
  viewMarket(){
    const sub = ST.sub || 'buy';
    const wallet = (ST.profile || {}).wallet || 0;
    const tabs = `<div class="tabs">
      ${[['buy', '🛒 خرید'], ['sell', '💸 فروش']].map(([k, l])=>`<button class="${sub === k ? 'on' : ''}" onclick="APP.setSub('${k}')">${l}</button>`).join('')}
    </div>`;
    const head = `
      <div class="card hero tight">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:1.6rem">💰</span>
          <div style="flex:1">
            <div class="small muted">بودجه‌ی نقل و انتقالات</div>
            <div style="font-size:1.2rem;font-weight:900">${moneyFull(wallet)} <span class="tiny muted">تومان</span></div>
          </div>
          ${ST.market ? `<span class="badge">تازه‌سازی بازار: ${faCountdown((ST.market.refreshAt || 0) - Date.now())}</span>` : ''}
        </div>
      </div>`;
    if(sub === 'sell') return tabs + head + this.sellListHTML();
    const list = (ST.market && ST.market.list) || [];
    return tabs + head + `
      <div class="card tight">
        <div class="card-head"><h3><span class="ch-ico">🛒</span> بازیکنان این هفته</h3>
          <button class="ch-act" onclick="APP.reloadMarket()">🔄 تازه‌سازی</button></div>
        <div class="chip-row">
          ${['all', 'GK', 'DF', 'MF', 'FW'].map(k=>`<button class="chip ${(ST.mktFilter || 'all') === k ? 'on' : ''}" onclick="APP.filterMarket('${k}')">${k === 'all' ? 'همه' : posFa(k)}</button>`).join('')}
          <button class="chip ${ST.mktFilter === 'afford' ? 'on' : ''}" onclick="APP.filterMarket('afford')">در توان من</button>
        </div>
      </div>
      ${list.length ? list.filter(x=>{
          const f = ST.mktFilter || 'all';
          if(f === 'afford') return x.price <= wallet && !x.bought;
          return (f === 'all' || x.pos === f);
        }).map(x=> this.marketRowHTML(x)).join('')
        : '<div class="card"><div class="skel"></div><div class="skel" style="width:60%"></div></div>'}`;
  },
  marketRowHTML(x){
    const wallet = (ST.profile || {}).wallet || 0;
    const can = x.price <= wallet && !x.bought;
    return `<div class="market-item">
      ${APP.faceList(x, { size:'md', pos: null })}
      <div class="mi-info">
        <div class="mi-name">${escapeHtml(x.name)}</div>
        <div class="mi-meta">
          <span class="tag">${x.pos} · ${posFa(x.pos)}</span>
          <span>${faNum(x.age)} سال</span>
          <span>پتانسیل ${faNum(x.potential)}</span>
        </div>
        <div class="mi-meta"><span class="muted">${escapeHtml(x.club || '')}</span></div>
      </div>
      <div class="mi-buy">
        <span class="p-ovr ${ovrClass(x.attack)}">${faNum(x.attack)}</span>
        <span class="price-tag">💰 ${moneyFmt(x.price)}</span>
        ${x.bought
          ? '<span class="tag ok">خریداری شد</span>'
          : `<button class="btn xs ${can ? 'primary' : 'ghost'}" ${can ? '' : 'disabled'} onclick="APP.buyPlayer('${x.id}')">خرید</button>`}
      </div>
    </div>`;
  },
  sellListHTML(){
    const players = ((ST.squad || {}).players || []).slice().sort((a, b)=> a.attack - b.attack);
    if(!players.length) return '<div class="card"><div class="empty">بازیکنی برای فروش نداری.</div></div>';
    return players.map(p=>`
      <div class="market-item">
        ${APP.faceList(p, { size:'md', pos: null })}
        <div class="mi-info">
          <div class="mi-name">${escapeHtml(p.name)}</div>
          <div class="mi-meta"><span class="tag">${p.pos}</span><span>${faNum(p.age)} سال</span>
            ${(ST.lineup || []).includes(String(p.id)) ? '<span class="tag ok">در ترکیب</span>' : ''}</div>
          <div class="mi-meta"><span class="muted">ارزش: ${moneyFull(p.value)}</span></div>
        </div>
        <div class="mi-buy">
          <span class="p-ovr ${ovrClass(p.attack)}">${faNum(p.attack)}</span>
          <span class="price-tag">+${moneyFmt(Math.round(p.value * 0.85))}</span>
          <button class="btn xs ghost" onclick="APP.sellPlayer('${p.id}')">فروش</button>
        </div>
      </div>`).join('');
  },

  /* ============================================================
     تب باشگاه
     ============================================================ */
  viewClub(){
    const p = ST.profile || {};
    const rec = p.record || {};
    const lv = p.level || {};
    const kit = p.kit && p.kit.c1 ? p.kit : kitOf(p.clubName || 'myclub');
    const ach = this.achievements();
    return `
      <div class="card">
        <div style="display:flex;align-items:center;gap:14px">
          <span class="club-badge cb-xl">${crestSVG(p.clubName || 'باشگاه من')}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:1.06rem;font-weight:900" class="nowrap">${escapeHtml(p.clubName || 'باشگاه من')}</div>
            <div class="tiny muted">مدیر: ${escapeHtml((ST.me && ST.me.player && ST.me.player.phone) || '')}</div>
            <div class="row" style="padding:6px 0;border-bottom:0"><span class="r-l">سطح ${faNum(lv.level || 1)}</span><span class="r-r tiny">${faNum(lv.xp || 0)}/${faNum(lv.xpMax || 3)}</span></div>
            <div class="fbar"><span class="fbar-l">تجربه</span><span class="fbar-t"><i class="fbar-f ok" style="width:${Math.round(((lv.xp || 0) / (lv.xpMax || 3)) * 100)}%"></i></span><span class="fbar-v">${faNum(lv.played || 0)}</span></div>
          </div>
          <div class="jp" style="width:76px;height:76px">${jerseySVG(p.clubName || 'myclub', { c1: kit.c1, c2: kit.c2, pattern: kit.pattern })}</div>
        </div>
      </div>

      <div class="sec-title">🏅 کارنامه‌ی مربی</div>
      <div class="stat-grid">
        <div class="stat-tile g"><b>${faNum(rec.won || 0)}</b><span>برد</span></div>
        <div class="stat-tile y"><b>${faNum(rec.drawn || 0)}</b><span>مساوی</span></div>
        <div class="stat-tile r"><b>${faNum(rec.lost || 0)}</b><span>باخت</span></div>
        <div class="stat-tile"><b>${faNum(rec.gf || 0)}</b><span>گل زده</span></div>
        <div class="stat-tile"><b>${faNum(rec.ga || 0)}</b><span>گل خورده</span></div>
        <div class="stat-tile y"><b>${faNum(rec.titles || 0)}</b><span>قهرمانی 🏆</span></div>
      </div>

      <div class="sec-title">🎨 هویت باشگاه</div>
      <div class="card tight">
        <div class="tiny muted">نام باشگاه، رنگ پیراهن و الگوی آن در جدول، پخش زنده و آرم باشگاه دیده می‌شود.</div>
        <div class="field" style="margin-top:8px"><label>نام باشگاه</label>
          <input type="text" id="clubNameInput" maxlength="22" value="${escapeHtml(p.clubName || '')}"></div>
        <div class="field"><label>رنگ اصلی</label>
          <div class="chip-row" id="kitC1">${KIT_PALETTE.map(c=>`<button class="chip ${kit.c1 === c.c1 ? 'on' : ''}" onclick="APP.pickColor('c1','${c.c1}')">${c.c1}</button>`).join('')}</div>
        </div>
        <div class="field"><label>رنگ دوم</label>
          <div class="chip-row">${KIT_PALETTE.map(c=>`<button class="chip ${kit.c2 === c.c2 ? 'on' : ''}" onclick="APP.pickColor('c2','${c.c2}')">${c.c2}</button>`).join('')}</div>
        </div>
        <div class="field"><label>الگوی پیراهن</label>
          <div class="chip-row">${KIT_PATTERNS.map(k=>`<button class="chip ${kit.pattern === k ? 'on' : ''}" onclick="APP.pickPattern('${k}')">${k}</button>`).join('')}</div>
        </div>
        <button class="btn primary wide" onclick="APP.saveProfile()">💾 ذخیره‌ی هویت باشگاه</button>
      </div>

      <div class="sec-title">🏆 دستاوردها</div>
      <div class="card tight">
        ${ach.map(a=>`<div class="row"><span class="r-l">${a.icon} ${a.title}</span><span class="r-r ${a.done ? 'tag ok' : 'tag'}">${a.done ? 'انجام شد' : a.hint}</span></div>`).join('')}
      </div>

      <div class="sec-title">📰 اخبار</div>
      <div class="card tight">${this.newsHTML(10)}</div>

      <div class="sec-title">⚙️ تنظیمات</div>
      <div class="card tight">
        <div class="row" onclick="AUTH.showServerSettings()" style="cursor:pointer">
          <span class="r-l">🌐 آدرس سرور</span><span class="r-r tiny">${escapeHtml(NET.base() || 'همین آدرس')}</span></div>
        <div class="row" onclick="APP.openFaceGallery()" style="cursor:pointer">
          <span class="r-l">🧑‍🦱 گالری چهره‌های بازیکنان</span><span class="r-r">←</span></div>
        <div class="row" onclick="AUTH.goOffline()" style="cursor:pointer">
          <span class="r-l">🎮 بازی آفلاین (تک‌نفره)</span><span class="r-r">←</span></div>
        <div class="row" onclick="APP.reloadAll()" style="cursor:pointer">
          <span class="r-l">🔄 تازه‌سازی همه‌ی داده‌ها</span><span class="r-r">←</span></div>
        <div class="row" onclick="APP.hardReload()" style="cursor:pointer">
          <span class="r-l">🧹 پاک‌کردن کش و بارگذاری مجدد</span><span class="r-r">←</span></div>
        <div class="row" onclick="AUTH.logout()" style="cursor:pointer">
          <span class="r-l">🚪 خروج از حساب</span><span class="r-r">←</span></div>
        <div id="serverBox" style="display:none;padding-top:10px">
          <div class="field"><label>آدرس سرور بازی</label>
            <input type="url" id="serverUrl" dir="ltr" placeholder="https://your-server.com">
          </div>
          <button class="btn primary wide" onclick="AUTH.saveServerSettings()">ذخیره و اتصال</button>
        </div>
      </div>
      <div class="tiny muted center" style="margin:6px 0 20px">
        موتور سرور: نسخه ${faNum((ST.me && ST.me.engine) || 1)} · اپ موبایل «مدیر تیم» — نسخه ۲
      </div>
    `;
  },
  achievements(){
    const p = ST.profile || {}, rec = p.record || {};
    const sq = ST.squad || {};
    return [
      { icon:'🥇', title:'اولین برد', hint:'۱ برد', done:(rec.won || 0) >= 1 },
      { icon:'🔥', title:'پنج برد', hint:'۵ برد', done:(rec.won || 0) >= 5 },
      { icon:'⚽', title:'تهاجم آتشین', hint:'۱۰ گل زده', done:(rec.gf || 0) >= 10 },
      { icon:'🛡️', title:'دفاع مستحکم', hint:'۵ بازی بدون گل خورده', done:(sq.cleanSheets || 0) >= 5 },
      { icon:'🏆', title:'قهرمان لیگ', hint:'۱ قهرمانی', done:(rec.titles || 0) >= 1 },
      { icon:'💰', title:'سرمایه‌دار', hint:'۲۰ میلیون بودجه', done:(p.wallet || 0) >= 20000000 },
      { icon:'🌟', title:'تیم ستاره‌دار', hint:'میانگین ۷۵', done: this.teamOvr() >= 75 },
      { icon:'👥', title:'فهرست پر', hint:'۲۰ بازیکن', done: (sq.players || []).length >= 20 }
    ];
  },
  paintClubExtras(){},
  paintMarketExtras(){},

  /* ============================================================
     شیت‌ها و مودال‌ها
     ============================================================ */
  sheet(html){
    const host = document.getElementById('sheetRoot');
    if(!host) return;
    host.style.display = 'block';
    host.innerHTML = `<div class="sheet-bg" onclick="APP.closeSheet(event)">
      <div class="sheet" onclick="event.stopPropagation()">
        <div class="sheet-handle"></div>
        ${html}
      </div>
    </div>`;
  },
  closeSheet(e){
    if(e && e.target && !e.target.classList.contains('sheet-bg')) return;
    const host = document.getElementById('sheetRoot');
    if(host){ host.style.display = 'none'; host.innerHTML = ''; }
  },
  modal(html){
    const host = document.getElementById('modalRoot');
    if(!host) return;
    host.style.display = 'block';
    host.innerHTML = `<div class="modal-bg" onclick="APP.closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">${html}</div>
    </div>`;
  },
  closeModal(e){
    if(e && e.target && !e.target.classList.contains('modal-bg')) return;
    const host = document.getElementById('modalRoot');
    if(host){ host.style.display = 'none'; host.innerHTML = ''; }
  },
  _firstSquadSheet(){
    return `<div class="sheet-title"><h3>👥 تیم شروع</h3><button class="icon-btn" onclick="APP.closeSheet()">✕</button></div>
      <div class="small muted">برای بازی آنلاین باید فهرست بازیکنانت روی سرور باشد. با یک لمس، ۱۴ بازیکن با پروفایل، پتانسیل و ارزش ساخته می‌شود.</div>
      <button class="btn primary wide" style="margin-top:12px" onclick="APP.createStarterSquad()">ساخت تیم شروع</button>`;
  },
  playerSheet(id){
    const p = this.playerById(id);
    if(!p) return;
    const inLine = (ST.lineup || []).includes(String(p.id));
    const isCap = ST.captainId === String(p.id);
    this.sheet(`
      <div class="sheet-title">
        <h3>کارنامه‌ی بازیکن</h3>
        <button class="icon-btn" onclick="APP.closeSheet()">✕</button>
      </div>
      <div class="p-hero">
        ${APP.face(p, { size:'lg', pos: p.pos, ring: inLine ? 'pitch' : '' })}
        <div class="p-hinfo">
          <div class="p-hname">${escapeHtml(p.name)}</div>
          <div class="p-htags">
            <span class="tag">${posFa(p.pos)}</span>
            <span class="tag">${faNum(p.age)} سال</span>
            <span class="tag">${ovrLabel(p.attack)}</span>
            ${isCap ? '<span class="tag cap">کاپیتان ⭐</span>' : ''}
            ${inLine ? '<span class="tag ok">در ترکیب</span>' : '<span class="tag">ذخیره</span>'}
          </div>
        </div>
        <div class="p-big-ovr ${ovrClass(p.attack)}"><b>${faNum(p.attack)}</b><span>قدرت</span></div>
      </div>
      <div class="look-line">
        <span class="look-ico">🧑‍🦱</span>
        <span class="look-t">${escapeHtml(faceMeta(p.id, p.age).tone)}</span>
      </div>
      <div class="attr-grid">
        <div class="attr"><span class="a-l">پتانسیل رشد</span><span class="a-v">${faNum(p.potential)}</span></div>
        <div class="attr"><span class="a-l">ارزش بازار</span><span class="a-v">${moneyFmt(p.value)}</span></div>
        <div class="attr"><span class="a-l">پست اصلی</span><span class="a-v">${posIcon(p.pos)} ${posFa(p.pos)}</span></div>
        <div class="attr"><span class="a-l">سن</span><span class="a-v">${faNum(p.age)}</span></div>
        <div class="attr"><span class="a-l">اندام</span><span class="a-v">${escapeHtml(playerBody(p.id, p.pos).line)}</span></div>
        <div class="attr"><span class="a-l">مزیت بدنی</span><span class="a-v">${escapeHtml(playerBody(p.id, p.pos).detail)}</span></div>
      </div>
      <div class="btn-row">
        <button class="btn ghost" onclick="APP.setCaptain('${p.id}')">${isCap ? 'برداشتن کاپیتانی' : '⭐ کاپیتان کن'}</button>
        <button class="btn primary" onclick="APP.addToLineup('${p.id}')">${inLine ? '➖ از ترکیب بردار' : '➕ به ترکیب بگذار'}</button>
      </div>
      <button class="btn ghost wide" style="margin-top:8px;border-color:rgba(244,97,79,.4);color:#ffd9d4" onclick="APP.sellPlayer('${p.id}')">💰 فروش بازیکن (+${moneyFmt(Math.round((p.value || 0) * 0.85))})</button>
    `);
  },

  /* ============================================================
     عمل‌ها
     ============================================================ */
  async withBusy(fn, label){
    if(ST.busy) return null;
    ST.busy = true;
    this.render();
    if(label) showToast(label, 'info');
    let out = null;
    try{ out = await fn(); }
    catch(e){ showToast('خطای غیرمنتظره: ' + (e && e.message), 'err'); }
    ST.busy = false;
    this.render();
    return out;
  },
  async reloadAll(){
    await this.withBusy(async()=>{
      const [pr, sq, mk, nw, lb] = await Promise.all([NET.profile(), NET.squad(), NET.market(), NET.news(), NET.leaderboard()]);
      if(pr.ok) ST.profile = pr.profile;
      if(sq.ok && sq.squad){ ST.squad = sq.squad; this.syncFromSquad(); }
      if(mk.ok) ST.market = mk;
      if(nw.ok) ST.news = nw.news || [];
      if(lb.ok) ST.leaders = lb;
      if(ST.leagueId) await this.openLeague(ST.leagueId, true);
      showToast('همه‌چیز تازه شد ✅', 'ok');
    });
  },
  async reloadMarket(){
    const r = await NET.market();
    if(r.ok){ ST.market = r; this.render(); }
  },
  async reloadLeaders(){
    const r = await NET.leaderboard();
    if(r.ok){ ST.leaders = r; this.render(); }
  },
  filterMarket(k){ ST.mktFilter = k; this.render(); },
  async createStarterSquad(){
    this.closeSheet();
    await this.withBusy(async()=>{
      const club = (ST.profile && ST.profile.clubName) || (ST.me && ST.me.player && ST.me.player.clubName) || 'باشگاه من';
      const r = await NET.bootstrapSquad(club);
      if(!r.ok){ showToast(r.error || 'ساخت تیم ناموفق بود', 'err'); return; }
      ST.squad = r.squad;
      if(r.profile) ST.profile = r.profile;
      this.syncFromSquad();
      if(ST.profile && ST.profile.kit && ST.profile.kit.c1) { /* هویت ذخیره‌شده حفظ می‌شود */ }
      confetti(30);
      showToast('۱۴ بازیکن به تیمت پیوست ✅', 'ok');
    }, 'در حال ساخت تیم…');
  },
  setFormation(f){
    ST.formation = f;
    ST.lineup = this.reflowLineup(ST.lineup);
    ST.dirty = true;
    this.render();
  },
  setStyle(s){ ST.style = s; ST.dirty = true; this.render(); },
  autoFill(){
    ST.lineup = this.reflowLineup([]);
    ST.dirty = true;
    showToast('بهترین ترکیب بر اساس پست چیده شد ✅', 'ok');
    this.render();
  },
  pickForSlot(idx){
    const current = ST.lineup[idx];
    const template = [].concat.apply([], FORMATION_SLOTS[ST.formation] || FORMATION_SLOTS['4-4-2']);
    const want = template[idx] || null;
    const all = (ST.squad.players || []).slice().sort((a, b)=>{
      const ap = (a.pos === want ? 100 : 0) + a.attack;
      const bp = (b.pos === want ? 100 : 0) + b.attack;
      return bp - ap;
    });
    this.sheet(`
      <div class="sheet-title"><h3>انتخاب ${want ? posFa(want) : 'بازیکن'}</h3>
        <button class="icon-btn" onclick="APP.closeSheet()">✕</button></div>
      <div class="plist">
        ${all.map(p=>`
          <div class="prow p-${p.pos} ${String(p.id) === String(current) ? 'hl' : ''}" onclick="APP.placeInSlot(${idx}, '${p.id}')">
            ${APP.face(p, { size:'sm', pos: p.pos })}
            <div class="p-info">
              <div class="p-name">${escapeHtml(p.name)} ${p.pos === want ? '<span class="tag ok">پست درست</span>' : ''}</div>
              <div class="p-meta">${posFa(p.pos)} · ${faNum(p.age)} سال · ${(ST.lineup || []).includes(String(p.id)) ? 'در ترکیب' : 'ذخیره'}</div>
            </div>
            <span class="p-ovr ${ovrClass(p.attack)}">${faNum(p.attack)}</span>
          </div>`).join('')}
      </div>`);
  },
  placeInSlot(idx, pid){
    const others = (ST.lineup || []).indexOf(String(pid));
    if(others >= 0 && others !== idx){
      const tmp = ST.lineup[idx];
      ST.lineup[idx] = String(pid);
      ST.lineup[others] = tmp;
    } else {
      ST.lineup[idx] = String(pid);
    }
    ST.dirty = true;
    this.closeSheet();
    this.render();
  },
  addToLineup(id){
    const p = this.playerById(id);
    if(!p) return;
    const template = [].concat.apply([], FORMATION_SLOTS[ST.formation] || FORMATION_SLOTS['4-4-2']);
    const idx = (ST.lineup || []).indexOf(String(id));
    if(idx >= 0){
      /* برداشتن از ترکیب: بهترین ذخیره‌ی هم‌پست جای او می‌آید */
      const bench = this.bench();
      if(!bench.length){ showToast('نیمکت خالی است', 'err'); return; }
      const rep = bench.find(b=> b.pos === p.pos) || bench[0];
      ST.lineup[idx] = String(rep.id);
      ST.dirty = true;
      showToast(rep.name + ' جای ' + p.name + ' را گرفت', 'info');
    } else {
      /* گذاشتن در ترکیب: جایگاه هم‌پست، یا ضعیف‌ترین جایگاه همان پست */
      const spots = [];
      template.forEach((want, i)=>{ if(want === p.pos) spots.push(i); });
      if(!spots.length) spots.push(template.length - 1);
      let target = spots.find(i=> !ST.lineup[i]);
      if(target === undefined){
        target = spots.slice().sort((a, b)=>{
          const pa = this.playerById(ST.lineup[a]); const pb = this.playerById(ST.lineup[b]);
          return (pa ? pa.attack : 99) - (pb ? pb.attack : 99);
        })[0];
        const out = this.playerById(ST.lineup[target]);
        if(out) showToast(out.name + ' به نیمکت رفت', 'info');
      }
      ST.lineup[target] = String(id);
      ST.dirty = true;
    }
    this.closeSheet();
    this.render();
  },
  setCaptain(id){
    ST.captainId = ST.captainId === String(id) ? null : String(id);
    ST.dirty = true;
    showToast(ST.captainId ? 'کاپیتان انتخاب شد ⭐' : 'کاپیتانی برداشته شد', 'ok');
    this.closeSheet();
    this.render();
  },
  async saveLineup(){
    const filled = (ST.lineup || []).filter(Boolean);
    if(filled.length !== 11){ showToast('ترکیب باید ۱۱ بازیکن داشته باشد', 'err'); return; }
    await this.withBusy(async()=>{
      const r = await NET.saveLineup({ slots: filled, formation: ST.formation, style: ST.style, captainId: ST.captainId || null });
      if(!r.ok){ showToast(r.error || 'ذخیره‌ی ترکیب ناموفق بود', 'err'); return; }
      ST.squad = r.squad;
      this.syncFromSquad();
      showToast('ترکیب ذخیره شد ✅', 'ok');
    }, 'در حال ذخیره…');
  },
  async train(kind){
    await this.withBusy(async()=>{
      const r = await NET.train(kind);
      if(!r.ok){ showToast(r.error || 'تمرین انجام نشد', 'err'); return; }
      ST.squad = r.squad;
      if(r.profile) ST.profile = r.profile;
      this.syncFromSquad();
      showToast('تمرین انجام شد 💪', 'ok');
    });
  },
  async buyPlayer(id){
    const item = ((ST.market || {}).list || []).find(x=> x.id === id);
    if(!item) return;
    askConfirm({
      title: 'خرید ' + item.name + '؟',
      body: `قیمت: ${moneyFull(item.price)} — قدرت ${item.attack}، سن ${item.age}، پتانسیل ${item.potential}`,
      yes: 'بخر',
      onYes: ()=> this._buy(id)
    });
  },
  async _buy(id){
    await this.withBusy(async()=>{
      const r = await NET.buy(id);
      if(!r.ok){ showToast(r.error || 'خرید ناموفق بود', 'err'); return; }
      ST.squad = r.squad;
      if(r.profile) ST.profile = r.profile;
      this.syncFromSquad();
      const mk = await NET.market();
      if(mk.ok) ST.market = mk;
      confetti(18);
      showToast('بازیکن به تیمت پیوست ✅', 'ok');
    }, 'در حال انتقال…');
  },
  async sellPlayer(id){
    const p = this.playerById(id);
    if(!p) return;
    const others = Object.assign({}, p);
    askConfirm({
      title: 'فروش ' + p.name + '؟',
      body: `مبلغ دریافتی: ${moneyFull(Math.round((p.value || 0) * 0.85))}`,
      yes: 'بفروش',
      danger: true,
      onYes: ()=> this._sell(id)
    });
  },
  async _sell(id){
    await this.withBusy(async()=>{
      const r = await NET.sell(id);
      if(!r.ok){ showToast(r.error || 'فروش ناموفق بود', 'err'); return; }
      ST.squad = r.squad;
      if(r.profile) ST.profile = r.profile;
      this.syncFromSquad();
      showToast('بازیکن فروخته شد 💸', 'ok');
    }, 'در حال فروش…');
  },
  pickColor(key, val){
    const p = ST.profile = ST.profile || {};
    p.kit = p.kit && p.kit.c1 ? p.kit : Object.assign({}, kitOf(p.clubName || 'x'));
    p.kit[key] = val;
    this.render();
  },
  pickPattern(k){
    const p = ST.profile = ST.profile || {};
    p.kit = p.kit && p.kit.c1 ? p.kit : Object.assign({}, kitOf(p.clubName || 'x'));
    p.kit.pattern = k;
    this.render();
  },
  async saveProfile(){
    const name = String(((document.getElementById('clubNameInput') || {}).value) || '').trim();
    const kit = (ST.profile || {}).kit || {};
    await this.withBusy(async()=>{
      const r = await NET.saveProfile({ clubName: name, kit: { c1: kit.c1, c2: kit.c2, pattern: kit.pattern } });
      if(!r.ok){ showToast(r.error || 'ذخیره ناموفق بود', 'err'); return; }
      ST.profile = r.profile;
      showToast('هویت باشگاه ذخیره شد ✅', 'ok');
    });
  },
  hardReload(){
    askConfirm({ title:'پاک کردن کش و بارگذاری مجدد؟', body:'نسخه‌ی تازه‌ی بازی از سرور خوانده می‌شود. داده‌های حساب روی سرور محفوظ است.', yes:'پاک کن',
      onYes: async()=>{
        try{
          if(window.caches){ const keys = await caches.keys(); await Promise.all(keys.map(k=> caches.delete(k))); }
          if(navigator.serviceWorker && navigator.serviceWorker.getRegistrations){
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r=> r.unregister()));
          }
        }catch(e){}
        location.reload();
      } });
  },

  /* ---------- لیگ: ساخت/ورود/کارها ---------- */
  createLeagueSheet(){
    this.closeSheet();
    this.sheet(`
      <div class="sheet-title"><h3>🏆 ساخت لیگ جدید</h3><button class="icon-btn" onclick="APP.closeSheet()">✕</button></div>
      <div class="field"><label>نام لیگ</label><input type="text" id="newLeagueName" maxlength="26" placeholder="لیگ رفقا"></div>
      <div class="switch-row"><span class="switch on" id="swFill" onclick="this.classList.toggle('on')"></span>
        <span class="small">با تیم‌های AI پر شود (تنها هم بازی می‌کنی)</span></div>
      <div class="tiny muted">پیش‌فرض: ۸ تیم. با «بازی فوری» می‌توانی بدون انتظار، هفته را بازی کنی.</div>
      <button class="btn primary wide" style="margin-top:12px" onclick="APP.doCreateLeague()">ساخت لیگ ✅</button>
    `);
  },
  async doCreateLeague(nameArg){
    const name = String(nameArg !== undefined ? nameArg : (((document.getElementById('newLeagueName') || {}).value) || '')).trim();
    if(name.length < 2){ showToast('نام لیگ را بنویس', 'err'); return; }
    const sw = document.getElementById('swFill');
    const fill = nameArg !== undefined ? true : (!sw || sw.classList.contains('on'));
    this.closeSheet();
    await this.withBusy(async()=>{
      const r = await NET.createLeague(name, { fillAI: fill, fillTo: 8 });
      if(!r.ok){ showToast(r.error || 'ساخت لیگ ناموفق بود', 'err'); return; }
      ST.leagueId = r.league.id;
      ST.league = r.league;
      const me = await NET.me();
      if(me.ok) ST.me = me;
      confetti(26);
      showToast('لیگ ساخته شد ✅ شناسه: ' + r.league.id, 'ok');
      ST.tab = 'league';
      ST.sub = 'table';
    }, 'در حال ساخت لیگ…');
  },
  joinLeagueSheet(){
    this.closeSheet();
    this.sheet(`
      <div class="sheet-title"><h3>🔗 ورود به لیگ</h3><button class="icon-btn" onclick="APP.closeSheet()">✕</button></div>
      <div class="field"><label>شناسه‌ی لیگ</label><input type="text" id="joinLeagueId" dir="ltr" maxlength="12" placeholder="L3f8a1c"></div>
      <button class="btn primary wide" onclick="APP.doJoinLeague()">ورود ✅</button>`);
  },
  async doJoinLeague(idArg){
    const id = String(idArg !== undefined ? idArg : (((document.getElementById('joinLeagueId') || {}).value) || '')).trim();
    if(!id){ showToast('شناسه را وارد کن', 'err'); return; }
    this.closeSheet();
    await this.withBusy(async()=>{
      const r = await NET.joinLeague(id);
      if(!r.ok){ showToast(r.error || 'ورود ناموفق بود', 'err'); return; }
      ST.leagueId = r.league.id;
      ST.league = r.league;
      const me = await NET.me();
      if(me.ok) ST.me = me;
      showToast('به لیگ پیوستی ✅', 'ok');
      ST.tab = 'league';
    }, 'در حال ورود…');
  },
  async openLeague(id, silent){
    const r = await NET.league(id);
    if(!r.ok){ if(!silent) showToast(r.error || 'لیگ باز نشد', 'err'); return null; }
    ST.league = r.league;
    ST.leagueId = r.league.id;
    ST.sub = ST.sub || 'table';
    if(!silent) this.render();
    return r.league;
  },
  setTabLeague(sub){ ST.tab = 'league'; ST.sub = sub; this.render(); },
  closeLeague(){ ST.league = null; ST.leagueId = null; ST.sub = null; this.render(); },
  async reloadLeague(){
    if(!ST.leagueId) return;
    await this.withBusy(async()=>{
      await this.openLeague(ST.leagueId, true);
      const me = await NET.me(); if(me.ok) ST.me = me;
      showToast('لیگ تازه شد ✅', 'ok');
    });
  },
  async submitWeek(){
    if(!ST.leagueId){ showToast('اول یک لیگ بساز', 'err'); return; }
    await this.withBusy(async()=>{
      const r = await NET.submitWeek(ST.leagueId);
      if(!r.ok){ showToast(r.error || 'ثبت ترکیب ناموفق بود', 'err'); return; }
      if(r.league) ST.league = r.league;
      showToast('ترکیب این هفته ثبت شد ✅', 'ok');
    });
  },
  /* کیت باشگاه من (برای پیراهن چهره‌ها) */
  /* گالری چهره‌های تولیدی (صفحه‌ی faces.html) */
  openFaceGallery(){
    try{ window.open('./faces.html', '_blank'); }
    catch(e){ showToast('گالری در مرورگر باز می‌شود', 'info'); }
  },
  myKit(){ const k = (ST.profile || {}).kit; return k && k.c1 ? { c1: k.c1, c2: k.c2 || '#0b1220' } : null; },
  face(p, opts){
    const o = opts || {};
    return faceImg((p && p.id) || p, Object.assign({ age:(p && p.age) || 0, kit:this.myKit() }, o));
  },
  /* فهرست‌های بلند (بازار/فهرست تیم/فروش): چهره‌ی سبک برای موبایل */
  faceList(p, opts){
    return this.face(p, Object.assign({ detail:'lean' }, opts || {}));
  },
  async playWeek(){
    if(!ST.leagueId){ showToast('اول یک لیگ بساز', 'err'); return; }
    await this.withBusy(async()=>{
      const r = await NET.simulate(ST.leagueId);
      if(!r.ok){ showToast(r.error || 'بازی هفته انجام نشد', 'err'); return; }
      if(r.league) ST.league = r.league;
      if(r.wallet !== undefined && ST.profile) ST.profile.wallet = r.wallet;   /* تسویه‌ی هفته روی سرور انجام شده */
      if(r.done){ showToast('فصل این لیگ تمام شد 🏁', 'info'); await this.afterLive(); return; }
      const matches = r.matches || [];
      const myName = (ST.profile || {}).clubName;
      const mine = matches.find(m=> m.home === myName || m.away === myName) || matches[0];
      const others = matches.filter(m=> m !== mine);
      if(mine && mine.reportId){
        const rep = await NET.report(mine.reportId);
        if(rep.ok && rep.report){
          this.showRoundResults(others, ()=> {
            LIVE.open(rep.report, { myClub: myName, label: 'لیگ · ' + ST.league.name, onClose: ()=> this.afterLive() });
          });
          return;
        }
      }
      this.showRoundResults(matches, null);
    }, 'سرور در حال محاسبه‌ی نتایج…');
  },
  async forceAdvance(){
    if(!ST.leagueId) return;
    askConfirm({ title:'بستن پنجره و بازی فوری؟', body:'همه‌ی مسابقات این هفته همین حالا بازی می‌شود.', yes:'بازی کن',
      onYes: async()=>{
        await this.withBusy(async()=>{
          const r = await NET.advance(ST.leagueId, true);
          if(!r.ok){ showToast(r.error || 'بازی فوری ناموفق بود', 'err'); return; }
          if(r.league) ST.league = r.league;
          if(r.wallet !== undefined && ST.profile) ST.profile.wallet = r.wallet;
          if(r.done){ showToast('فصل تمام شد 🏁', 'info'); return; }
          const myName = (ST.profile || {}).clubName;
          const mine = (r.matches || []).find(m=> m.home === myName || m.away === myName);
          if(mine && mine.reportId){
            const rep = await NET.report(mine.reportId);
            if(rep.ok && rep.report) LIVE.open(rep.report, { myClub: myName, label: 'لیگ · ' + ST.league.name, onClose: ()=> this.afterLive() });
          } else showToast('هفته بازی شد ✅', 'ok');
        }, 'در حال بازی…');
      } });
  },
  async fillAI(){
    if(!ST.leagueId) return;
    await this.withBusy(async()=>{
      const r = await NET.fillAI(ST.leagueId, 8);
      if(!r.ok){ showToast(r.error || 'افزودن AI ناموفق بود', 'err'); return; }
      if(r.league) ST.league = r.league;
      showToast(r.added ? faNum(r.added) + ' تیم AI اضافه شد ✅' : 'لیگ پر است', 'ok');
    });
  },
  async newSeason(){
    if(!ST.leagueId) return;
    await this.withBusy(async()=>{
      const r = await NET.newSeason(ST.leagueId);
      if(!r.ok){ showToast(r.error || 'فصل جدید ساخته نشد', 'err'); return; }
      if(r.league) ST.league = r.league;
      confetti(34);
      showToast('فصل ' + faNum(r.season) + ' شروع شد 🎉', 'ok');
    }, 'در حال ساخت فصل جدید…');
  },
  async watchReport(reportId){
    await this.withBusy(async()=>{
      const r = await NET.report(reportId);
      if(!r.ok || !r.report){ showToast('گزارش پیدا نشد', 'err'); return; }
      LIVE.open(r.report, { myClub: (ST.profile || {}).clubName, label: 'لیگ · ' + ((ST.league || {}).name || ''), onClose: ()=> this.afterLive() });
    });
  },
  async verifyResult(res){
    if(!ST.leagueId) return;
    const r = await NET.verifyResult(ST.leagueId, res);
    if(!r.ok){ showToast(r.error || 'تأیید ناموفق بود', 'err'); return; }
    showToast(r.verified ? 'سرور همان نتیجه را بازتولید کرد ✅ (ضدتقلب)' : 'سرور نتیجه را رد کرد ❌', r.verified ? 'ok' : 'err');
  },
  showRoundResults(matches, onClose){
    const myName = (ST.profile || {}).clubName;
    this.modal(`
      <h3>🏁 نتایج این هفته</h3>
      <div class="m-sub">محاسبه‌ی رسمی سرور — قابل دست‌کاری نیست</div>
      ${(matches || []).map(m=>`
        <div class="match-row ${(m.home === myName || m.away === myName) ? 'mine' : ''}" ${m.reportId ? `onclick="APP.closeModal(); APP.watchReport('${m.reportId}')"` : ''}>
          <span class="mr-team">${crestSVG(m.home)}<span class="mr-name">${escapeHtml(m.home)}</span></span>
          <span class="mr-score">${faNum(m.result.h)} - ${faNum(m.result.a)}</span>
          <span class="mr-team away"><span class="mr-name">${escapeHtml(m.away)}</span>${crestSVG(m.away)}</span>
        </div>`).join('') || '<div class="empty">مسابقه‌ای ثبت نشد</div>'}
      <div class="tiny muted" style="margin-top:8px">روی هر مسابقه بزن تا <b>پخش زنده</b>ی همان بازی را ببینی.</div>
      <button class="btn primary wide" style="margin-top:12px" onclick="APP.closeModal(); ${onClose ? 'APP._afterModalCb()' : 'APP.render()'}">بستن</button>
    `);
    this._afterModal = onClose || null;
  },
  _afterModalCb(){
    const cb = this._afterModal; this._afterModal = null;
    if(typeof cb === 'function') cb(); else this.render();
  },
  async afterLive(){
    /* بعد از پخش: داده‌های تازه (کیف پول/رکورد/اخبار/اسکواد) + جدول */
    const [pr, nw, lb, sq] = await Promise.all([NET.profile(), NET.news(), NET.leaderboard(), NET.squad()]);
    if(pr.ok) ST.profile = pr.profile;
    if(sq.ok && sq.squad){ ST.squad = sq.squad; this.syncFromSquad(); }
    if(nw.ok) ST.news = nw.news || [];
    if(lb.ok) ST.leaders = lb;
    if(ST.leagueId) await this.openLeague(ST.leagueId, true);
    this.render();
  },
  shareLeague(){
    const lg = ST.league;
    if(!lg) return;
    const text = `⚽ لیگ «${lg.name}» در بازی مدیر تیم\nشناسه‌ی لیگ: ${lg.id}\nبا این شناسه به لیگم بیا و رقابت کنیم!`;
    if(navigator.share){ navigator.share({ title: 'لیگ مدیر تیم', text }).catch(()=>{}); }
    else copyTextToClipboard(lg.id, 'شناسه‌ی لیگ کپی شد ✅');
  },
  toast(msg, type){ showToast(msg, type); },
  showNewsSheet(){
    this.sheet(`
      <div class="sheet-title"><h3>🔔 اخبار باشگاه</h3>
        <button class="icon-btn" onclick="APP.closeSheet()">✕</button></div>
      ${this.newsHTML(20)}
      <button class="btn ghost wide" style="margin-top:12px" onclick="APP.closeSheet(); APP.refreshNews()">🔄 تازه‌سازی</button>`);
  },
  async refreshNews(){
    const r = await NET.news();
    if(r.ok){ ST.news = r.news || []; this.render(); }
  }
};

/* ============================================================
   راه‌اندازی
   ============================================================ */
document.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(()=> AUTH.init(), 1200);
});
document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ APP.closeSheet(); APP.closeModal(); } });
window.addEventListener('online', ()=> showToast('اینترنت وصل شد ✅', 'ok'));
window.addEventListener('offline', ()=> showToast('اینترنت قطع شد — بازی آنلاین در دسترس نیست', 'err'));
