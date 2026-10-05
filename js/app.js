/* ============================================================
   app.js — Manager League | Career Mode Engine
   Inspired by EA FC Career Mode, Football Manager, Top Eleven
   ============================================================ */

/* ── API ── */
const API={
  _getBase(){return location.protocol==='file:'?(localStorage.getItem('fm_server_url')||'http://localhost:8081'):location.origin},
  get base(){return this._getBase()},
  setServer(u){localStorage.setItem('fm_server_url',u.replace(/\/+$/,''))},
  async get(p){const r=await fetch(this.base+p,{headers:this._h()});if(!r.ok)throw await this._e(r);return r.json()},
  async post(p,b){const r=await fetch(this.base+p,{method:'POST',headers:{...this._h(),'Content-Type':'application/json'},body:JSON.stringify(b)});if(!r.ok)throw await this._e(r);return r.json()},
  _h(){const t=localStorage.getItem('fm_token');return t?{Authorization:'Bearer '+t}:{}},
  async _e(r){try{const j=await r.json();return new Error(j.error||'Server error')}catch{return new Error('Connection error')}}
};

/* ── AUTH ── */
const AUTH={
  phone:'',isExisting:false,
  init(){this._setupOtp();const t=localStorage.getItem('fm_token');if(t)this._checkToken(t)},
  async _checkToken(t){try{const d=await API.get('/api/me');this._goGame(d)}catch{localStorage.removeItem('fm_token');this._showAuth()}},
  _showAuth(){document.getElementById('splash').classList.add('hiding');setTimeout(()=>{document.getElementById('splash').style.display='none';document.getElementById('auth').style.display='flex'},600)},
  async sendOtp(){const ph=document.getElementById('authPhone').value.trim();if(!/^09\d{9}$/.test(ph)){this._err('authError1','شماره موبایل نامعتبر است');return}this._load('btnSendOtp',true);this._err('authError1','');try{const d=await API.post('/api/auth/otp',{phone:ph});this.phone=ph;document.getElementById('otpHint').textContent=d.dev&&d.code?'کد تست: '+d.code:'کد به '+ph+' ارسال شد';this._step(2);setTimeout(()=>document.querySelector('.otp-box[data-idx="0"]').focus(),300)}catch(e){if(e.message.includes('Failed to fetch')||e.message.includes('Network')){document.getElementById('noInternet').style.display='flex';document.getElementById('auth').style.display='none'}else this._err('authError1',e.message)}finally{this._load('btnSendOtp',false)}},
  async verifyOtp(){const code=Array.from(document.querySelectorAll('.otp-box')).map(b=>b.value).join('');if(code.length!==5){this._err('authError2','کد ۵ رقمی را کامل وارد کنید');return}this._load('btnVerifyOtp',true);this._err('authError2','');try{const d=await API.post('/api/auth/verify',{phone:this.phone,code});localStorage.setItem('fm_token',d.token);if(d.player&&!d.player.hasSquad){this._step(3);this._updCrest()}else this._goGame({player:d.player})}catch(e){this._err('authError2',e.message);document.getElementById('otpInputs').style.animation='shakeE .4s';setTimeout(()=>document.getElementById('otpInputs').style.animation='',400)}finally{this._load('btnVerifyOtp',false)}},
  async createClub(){const cn=document.getElementById('authClubName').value.trim();const mn=document.getElementById('authManagerName').value.trim();if(!cn){this._err('authError3','نام باشگاه را وارد کنید');return}this._err('authError3','');localStorage.setItem('fm_clubName',cn);localStorage.setItem('fm_managerName',mn||'مدیر');await this._genSquad(cn)},
  async _genSquad(clubName){try{const P=[];const pos=['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW','DF','MF','FW'];const fn=['علی','محمد','حسن','رضا','امیر','مهدی','حسین','سعید','احمد','جواد','فرهاد','بهنام','سامان','نیما'];const ln=['کریمی','رحمتی','جباری','نوری','محمدی','احمدی','حسینی','عباسی','صادقی','موسوی','کاظمی','حیدری','قاسمی','یوسفی'];for(let i=0;i<14;i++){const p=pos[i];const base=p==='GK'?58:p==='DF'?62:p==='MF'?65:68;P.push({id:'p'+(i+1),name:fn[i%fn.length]+' '+ln[i],pos,attack:Math.max(35,Math.min(95,Math.round(base+Math.random()*20-5))),age:Math.floor(Math.random()*12)+20})}const avg=Math.round(P.reduce((s,p)=>s+p.attack,0)/P.length);await API.post('/api/squad',{clubName,formation:'4-4-2',style:'balanced',atk:avg,def:avg-3,fitness:90,stamina:76,morale:74,players:P,slots:P.slice(0,11).map(p=>p.id)});const me=await API.get('/api/me');this._goGame(me)}catch(e){this._err('authError3','خطا: '+e.message)}},
  backToPhone(){this._step(1);document.querySelectorAll('.otp-box').forEach(b=>{b.value='';b.classList.remove('filled')})},
  goOffline(){document.getElementById('auth').style.display='none';document.getElementById('noInternet').style.display='none';document.getElementById('offlineFrame').style.display='flex';document.getElementById('offlineIframe').src='./index.html'},
  retryConnection(){document.getElementById('noInternet').style.display='none';document.getElementById('auth').style.display='flex'},
  showServerSettings(){document.getElementById('authServerUrl').value=localStorage.getItem('fm_server_url')||'';this._step('Server')},
  async saveServerSettings(){const u=document.getElementById('authServerUrl').value.trim();if(!u){this._err('authErrorServer','آدرس را وارد کنید');return}this._err('authErrorServer','');try{API.setServer(u);const h=await API.get('/api/health');if(h.ok){APP.toast('اتصال برقرار شد! ✅','success');this._step(1)}}catch(e){this._err('authErrorServer','اتصال ناموفق: '+e.message)}},
  logout(){localStorage.removeItem('fm_token');localStorage.removeItem('fm_clubName');localStorage.removeItem('fm_managerName');location.reload()},
  _step(n){document.querySelectorAll('.auth-step').forEach(s=>s.classList.remove('active'));const el=document.getElementById('authStep'+n);if(el)el.classList.add('active')},
  _goGame(d){document.getElementById('splash').style.display='none';document.getElementById('auth').style.display='none';document.getElementById('noInternet').style.display='none';document.getElementById('gameApp').style.display='flex';APP.init(d)},
  _load(id,on){const b=document.getElementById(id);if(!b)return;b.querySelector('.btn-text').style.display=on?'none':'';b.querySelector('.btn-loader').style.display=on?'inline-flex':'none';b.disabled=on},
  _err(id,m){const e=document.getElementById(id);if(e)e.textContent=m},
  _setupOtp(){const boxes=document.querySelectorAll('.otp-box');boxes.forEach((b,i)=>{b.addEventListener('input',e=>{const v=e.target.value.replace(/\D/g,'');e.target.value=v;v?e.target.classList.add('filled'):e.target.classList.remove('filled');if(v&&i<4)boxes[i+1].focus();if(Array.from(boxes).map(x=>x.value).join('').length===5)setTimeout(()=>AUTH.verifyOtp(),100)});b.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!e.target.value&&i>0){boxes[i-1].focus();boxes[i-1].value='';boxes[i-1].classList.remove('filled')}});b.addEventListener('paste',e=>{e.preventDefault();const t=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,5);t.split('').forEach((c,j)=>{if(boxes[j]){boxes[j].value=c;boxes[j].classList.add('filled')}});if(t.length===5)setTimeout(()=>AUTH.verifyOtp(),100);else if(t.length>0)boxes[Math.min(t.length,4)].focus()})});const ci=document.getElementById('authClubName');if(ci)ci.addEventListener('input',()=>this._updCrest())},
  _updCrest(){const n=document.getElementById('authClubName').value.trim()||'باشگاه';const el=document.getElementById('crestPreview');if(el&&typeof SVG!=='undefined'&&SVG.crest){el.innerHTML='';el.appendChild(SVG.crest(n,72))}}
};

/* ── CAREER DATA ENGINE ── */
const CAREER = {
  week: 1,
  season: 1,
  budget: 8000000,
  wageBill: 0,
  sponsorshipIncome: 500000,
  matchdayIncome: 100000,
  transferSpent: 0,
  transferEarned: 0,
  facilities: { training: 1, medical: 1, youth: 1, stadium: 1 },
  achievements: [],
  newsLog: [],
  matchHistory: [],
  trophies: [],
  objectives: [],

  init() {
    this._load();
    this._calcWages();
    this._generateObjectives();
  },

  save() {
    localStorage.setItem('fm_career', JSON.stringify({
      week: this.week, season: this.season, budget: this.budget,
      facilities: this.facilities, achievements: this.achievements,
      newsLog: this.newsLog.slice(-50), matchHistory: this.matchHistory.slice(-30),
      trophies: this.trophies, objectives: this.objectives,
      transferSpent: this.transferSpent, transferEarned: this.transferEarned
    }));
  },

  _load() {
    try {
      const d = JSON.parse(localStorage.getItem('fm_career'));
      if (d) Object.assign(this, d);
    } catch {}
  },

  _calcWages() {
    if (!APP.players.length) return;
    this.wageBill = APP.players.reduce((s, p) => s + Math.round(p.attack * 800 + (p.age < 24 ? 5000 : 0)), 0);
  },

  addNews(icon, title, desc, type) {
    this.newsLog.unshift({ icon, title, desc, type: type || 'info', time: Date.now() });
    if (this.newsLog.length > 50) this.newsLog.pop();
    this.save();
  },

  _generateObjectives() {
    if (this.objectives.length > 0) return;
    this.objectives = [
      { id: 'obj1', title: 'قهرمان لیگ', desc: 'رتبه اول لیگ را کسب کنید', reward: 2000000, done: false },
      { id: 'obj2', title: 'تیم جوان', desc: 'میانگین سنی تیم زیر ۲۵ باشد', reward: 1000000, done: false },
      { id: 'obj3', title: 'دفاع مستحکم', desc: 'کمتر از ۱۵ گل در فصل بخورید', reward: 1500000, done: false },
      { id: 'obj4', title: 'آقای گل', desc: 'یک بازیکن بالای ۱۰ گل داشته باشید', reward: 800000, done: false },
      { id: 'obj5', title: 'مربی محبوب', desc: 'روحیه تیم بالای ۸۰ باشد', reward: 500000, done: false },
    ];
  },

  advanceWeek() {
    this.week++;
    const income = this.sponsorshipIncome / 7 + this.matchdayIncome / 7;
    const expense = this.wageBill / 7;
    this.budget += Math.round(income - expense);
    if (this.week > 7) { this.endSeason(); return; }
    this.addNews('📅', `هفته ${this.week}`, `آماده‌سازی برای بازی هفته ${this.week}`, 'info');
    this.save();
  },

  endSeason() {
    this.season++;
    this.week = 1;
    this.budget += this.sponsorshipIncome;
    this.addNews('🏆', `پایان فصل ${this.season - 1}`, `فصل جدید شروع شد! بودجه اضافه شد.`, 'success');
    // Age players
    APP.players.forEach(p => { p.age = (p.age || 24) + 1; });
    this.save();
  },

  getMorale() {
    if (!APP.players.length) return 70;
    return Math.round(APP.players.reduce((s, p) => s + (p.morale || 70), 0) / APP.players.length);
  },

  getAvgOvr() {
    if (!APP.players.length) return 0;
    return Math.round(APP.players.reduce((s, p) => s + p.attack, 0) / APP.players.length);
  }
};

/* ── NEWS ENGINE ── */
const NEWS = {
  generate() {
    const events = [
      { icon: '⚽', title: 'تمرین تیم', desc: 'بازیکنان تمرین خوبی انجام دادند. روحیه بالا رفت.' },
      { icon: '📰', title: 'علاقه باشگاه‌های بزرگ', desc: 'یک باشگاه بزرگ به مهاجم شما علاقه‌مند شده.' },
      { icon: '🏥', title: 'مصدومیت بازیکن', desc: 'یکی از بازیکنان مصدوم شد و ۲ هفته غایب است.' },
      { icon: '🌟', title: 'بازیکن جوان درخشان', desc: 'یک بازیکن جوان در تمرین عملکرد عالی داشت.' },
      { icon: '💰', title: 'پیشنهاد اسپانسر', desc: 'یک اسپانسر جدید پیشنهاد همکاری داده.' },
      { icon: '📊', title: 'گزارش استعدادیاب', desc: 'استعدادیاب شما یک بازیکن مستعد پیدا کرده.' },
      { icon: '🏟️', title: 'بازسازی ورزشگاه', desc: 'پروژه بازسازی ورزشگاه در حال انجام است.' },
      { icon: '📢', title: 'کنفرانس خبری', desc: 'مربی، شما را به کنفرانس خبری دعوت کرده.' },
    ];
    return events[Math.floor(Math.random() * events.length)];
  }
};

/* ── MATCH ENGINE (Live) ── */
const MATCH = {
  running: false,
  events: [],
  homeGoals: 0,
  awayGoals: 0,
  minute: 0,
  interval: null,

  start(homeName, awayName, homeOvr, awayOvr) {
    this.running = true;
    this.events = [];
    this.homeGoals = 0;
    this.awayGoals = 0;
    this.minute = 0;
    this.homeName = homeName;
    this.awayName = awayName;

    document.getElementById('matchOverlay').style.display = 'block';
    this._render();

    const tick = () => {
      if (this.minute >= 90) { this._end(); return; }
      this.minute += Math.floor(Math.random() * 5) + 1;
      if (this.minute > 90) this.minute = 90;

      const eventRoll = Math.random();
      const homeStrength = homeOvr / (homeOvr + awayOvr);

      if (eventRoll < 0.12) {
        // Goal!
        const isHome = Math.random() < homeStrength + 0.1;
        if (isHome) this.homeGoals++;
        else this.awayGoals++;
        const scorer = this._randomName();
        this.events.unshift({
          minute: this.minute,
          icon: '⚽',
          text: `گلللل! ${scorer} (${isHome ? homeName : awayName})`,
          type: 'goal'
        });
        this._render();
      } else if (eventRoll < 0.20) {
        this.events.unshift({
          minute: this.minute,
          icon: '🟨',
          text: `کارت زرد برای ${this._randomName()}`,
          type: 'card'
        });
        this._render();
      } else if (eventRoll < 0.24) {
        this.events.unshift({
          minute: this.minute,
          icon: '🧤',
          text: `مهار عالی توسط دروازه‌بان!`,
          type: 'save'
        });
        this._render();
      } else if (eventRoll < 0.30) {
        this.events.unshift({
          minute: this.minute,
          icon: '🔄',
          text: `تعویض: ${this._randomName()} وارد زمین شد`,
          type: 'sub'
        });
        this._render();
      } else if (eventRoll < 0.35) {
        this.events.unshift({
          minute: this.minute,
          icon: '💥',
          text: `شوت! توپ به تیر دروازه خورد!`,
          type: 'shot'
        });
        this._render();
      }
    };

    this.interval = setInterval(tick, 800);
  },

  _end() {
    clearInterval(this.interval);
    this.running = false;
    this.events.unshift({
      minute: 90,
      icon: '🏁',
      text: `پایان بازی! ${this.homeName} ${this.homeGoals} - ${this.awayGoals} ${this.awayName}`,
      type: 'end'
    });
    CAREER.matchHistory.unshift({
      home: this.homeName, away: this.awayName,
      homeGoals: this.homeGoals, awayGoals: this.awayGoals,
      week: CAREER.week, time: Date.now()
    });
    CAREER.advanceWeek();
    this._render();
  },

  _render() {
    const el = document.getElementById('matchContent');
    el.innerHTML = `
      <div class="live-score">
        <div class="live-team"><div class="live-team-icon">🏟️</div><div class="live-team-name">${this.homeName}</div></div>
        <div><div class="live-result">${this.homeGoals} - ${this.awayGoals}</div><div class="live-minute">${this.minute < 90 ? this.minute + "'" : 'پایان'}</div></div>
        <div class="live-team"><div class="live-team-icon">⚽</div><div class="live-team-name">${this.awayName}</div></div>
      </div>
      <div class="live-events">
        ${this.events.map(e => `
          <div class="live-event">
            <div class="live-event-icon">${e.icon}</div>
            <div class="live-event-text">${e.text}</div>
            <div class="live-event-minute">${e.minute}'</div>
          </div>
        `).join('')}
      </div>
      ${!this.running && this.events.length > 0 ? `
        <button class="btn-primary live-btn" onclick="MATCH.close()">بازگشت به بازی</button>
      ` : ''}
    `;
  },

  close() {
    document.getElementById('matchOverlay').style.display = 'none';
    clearInterval(this.interval);
    this.running = false;
    APP.switchTab(APP.currentTab);
  },

  _randomName() {
    const names = ['کریمی','رحمتی','نوری','محمدی','احمدی','حسینی','عباسی','صادقی','موسوی','حیدری','قاسمی','فرهادی','زارع','رضایی','باقری','دایی','طارمی','آزمون'];
    return names[Math.floor(Math.random() * names.length)];
  }
};

/* ── TRAINING SYSTEM ── */
const TRAINING = {
  sessions: [
    { id: 'attack', icon: '🎯', name: 'تمرین حمله', desc: 'افزایش قدرت حمله مهاجمان', boost: 2, cost: 100000 },
    { id: 'defense', icon: '🛡️', name: 'تمرین دفاع', desc: 'افزایش قدرت دفاعی مدافعان', boost: 2, cost: 100000 },
    { id: 'fitness', icon: '🏃', name: 'تمرین بدنی', desc: 'افزایش آمادگی جسمانی همه', boost: 3, cost: 80000 },
    { id: 'tactical', icon: '🧠', name: 'تمرین تاکتیکی', desc: 'بهبود هماهنگی تیمی', boost: 1, cost: 150000 },
    { id: 'shooting', icon: '💥', name: 'تمرین شوت‌زنی', desc: 'افزایش دقت شوت مهاجمان', boost: 2, cost: 120000 },
    { id: 'youth', icon: '🌟', name: 'تمرین جوانان', desc: 'رشد سریع‌تر بازیکنان زیر ۲۳', boost: 3, cost: 200000 },
  ],

  run(sessionId) {
    const s = this.sessions.find(x => x.id === sessionId);
    if (!s) return;
    if (CAREER.budget < s.cost) {
      APP.toast('بودجه کافی نیست!', 'error');
      return;
    }
    CAREER.budget -= s.cost;
    let affected = 0;
    APP.players.forEach(p => {
      let boost = 0;
      if (s.id === 'attack' && (p.pos === 'FW' || p.pos === 'MF')) boost = s.boost;
      else if (s.id === 'defense' && (p.pos === 'DF' || p.pos === 'GK')) boost = s.boost;
      else if (s.id === 'fitness') boost = s.boost;
      else if (s.id === 'tactical') boost = s.boost;
      else if (s.id === 'shooting' && p.pos === 'FW') boost = s.boost;
      else if (s.id === 'youth' && p.age < 23) boost = s.boost;
      if (boost > 0) {
        p.attack = Math.min(99, p.attack + boost);
        p.morale = Math.min(100, (p.morale || 70) + 2);
        affected++;
      }
    });
    CAREER.addNews(s.icon, s.name, `${affected} بازیکن پیشرفت کردند`, 'success');
    APP.toast(`${s.name} انجام شد! ${affected} بازیکن بهتر شدند ⬆️`, 'success');
    CAREER.save();
    APP.updateHeader();
  }
};

/* ── TRANSFER MARKET ── */
const MARKET = {
  list: [],

  generate() {
    if (this.list.length > 0) return;
    const pool = [
      ['امیررضا','زارع','MF',72],['محمدطاها','رضایی','FW',75],['علیرضا','بیرانوند','GK',78],
      ['مهدی','طارمی','FW',82],['سردار','آزمون','FW',80],['کریم','باقری','MF',76],
      ['اشکان','دژاگه','MF',74],['سعید','عزتاللهی','MF',73],['وحید','امیری','MF',71],
      ['رامین','رضاییان','DF',72],['میلاد','محمدی','DF',70],['صادق','محرمی','DF',69],
      ['مهدی','قائدی','FW',77],['اللهیار','صیادمنش','FW',74],['سامان','قدوس','MF',76],
      ['جواو','فلیکس','FW',84],['مارکو','رویس','MF',81],['تoni','کروس','MF',83],
      ['维','سی','DF',79],['روملو','لوکاکو','FW',80],['کیلیان','姆巴佩','FW',92]
    ];
    this.list = pool.map((p, i) => ({
      id: 'mk' + i, name: p[0] + ' ' + p[1], pos: p[2], attack: p[3],
      age: Math.floor(Math.random() * 14) + 19,
      price: Math.round(p[3] * 50000 + Math.random() * 500000),
      potential: Math.min(99, p[3] + Math.floor(Math.random() * 10)),
      club: ['الاهلی','الهلال','النصر','السد','استقلال','پرسپولیس','سپاهان','تراکتور'][Math.floor(Math.random()*8)]
    })).sort((a, b) => b.attack - a.attack);
  },

  buy(id) {
    const p = this.list.find(x => x.id === id);
    if (!p) return;
    if (CAREER.budget < p.price) {
      APP.toast('بودجه کافی نیست! 💰', 'error');
      return;
    }
    if (APP.players.length >= 25) {
      APP.toast('لیست تیم پر است! (حداکثر ۲۵)', 'error');
      return;
    }
    CAREER.budget -= p.price;
    CAREER.transferSpent += p.price;
    const newP = { id: 'p' + Date.now(), name: p.name, pos: p.pos, attack: p.attack, age: p.age, morale: 75 };
    APP.players.push(newP);
    this.list = this.list.filter(x => x.id !== id);
    CAREER.addNews('💰', 'خرید بازیکن', `${p.name} (${p.pos}) به تیم پیوست!`, 'success');
    APP.toast(`${p.name} خریداری شد! ✅`, 'success');
    CAREER.save();
    APP.updateHeader();
  },

  sell(id) {
    const p = APP.players.find(x => x.id === id);
    if (!p) return;
    if (APP.players.length <= 11) {
      APP.toast('حداقل ۱۱ بازیکن لازم است!', 'error');
      return;
    }
    const price = Math.round(p.attack * 30000 + Math.random() * 200000);
    CAREER.budget += price;
    CAREER.transferEarned += price;
    APP.players = APP.players.filter(x => x.id !== id);
    CAREER.addNews('💸', 'فروش بازیکن', `${p.name} به مبلغ ${APP._fmt(price)} فروخته شد`, 'info');
    APP.toast(`${p.name} فروخته شد! +${APP._fmt(price)}`, 'success');
    CAREER.save();
    APP.updateHeader();
  }
};

/* ── SCOUTING ── */
const SCOUT = {
  reports: [],

  discover() {
    if (CAREER.budget < 50000) { APP.toast('بودجه کافی نیست!', 'error'); return; }
    CAREER.budget -= 50000;
    const names = [
      ['محمد','جوان‌زاده'],['علی','ستاره‌نژاد'],['حسن','طلایی'],['رضا','الماسی'],
      ['امیر','شاهینی'],['مهدی','عقابی'],['حسین','صاعقه‌ای'],['سعید','تیزپا']
    ];
    const n = names[Math.floor(Math.random() * names.length)];
    const pos = ['GK','DF','MF','FW'][Math.floor(Math.random()*4)];
    const age = Math.floor(Math.random() * 6) + 17;
    const ovr = Math.floor(Math.random() * 20) + 50;
    const pot = Math.min(99, ovr + Math.floor(Math.random() * 25) + 5);
    const report = {
      id: 'sc' + Date.now(), name: n[0] + ' ' + n[1], pos, age,
      attack: ovr, potential: pot, price: Math.round(ovr * 10000 + Math.random() * 100000),
      country: ['ایران','برزیل','آرژانتین','فرانسه','آلمان'][Math.floor(Math.random()*5)]
    };
    this.reports.unshift(report);
    CAREER.addNews('🔍', 'گزارش استعدادیابی', `${report.name} (${report.pos}) با پتانسیل ${pot} پیدا شد!`, 'info');
    APP.toast(`بازیکن جوان پیدا شد: ${report.name} ⭐`, 'info');
    CAREER.save();
  },

  sign(id) {
    const p = this.reports.find(x => x.id === id);
    if (!p) return;
    if (CAREER.budget < p.price) { APP.toast('بودجه کافی نیست!', 'error'); return; }
    CAREER.budget -= p.price;
    APP.players.push({ id: 'p' + Date.now(), name: p.name, pos: p.pos, attack: p.attack, age: p.age, morale: 80 });
    this.reports = this.reports.filter(x => x.id !== id);
    CAREER.addNews('🌟', 'بازیکن جوان امضا شد', `${p.name} از آکادمی جوانان پیوست`, 'success');
    APP.toast(`${p.name} به تیم پیوست!`, 'success');
    CAREER.save();
    APP.updateHeader();
  }
};

/* ── MAIN APP ── */
const APP = {
  data: null, currentTab: 'home', players: [],

  init(data) {
    this.data = data;
    this._genLocalSquad();
    CAREER.init();
    MARKET.generate();
    this.updateHeader();
    this.switchTab('home');
    // Generate initial news
    if (CAREER.newsLog.length === 0) {
      CAREER.addNews('🎉', 'خوش آمدید!', 'به بازی مدیر تیم خوش آمدید. فصل جدید آماده شروع است.', 'success');
      CAREER.addNews('📋', 'اهداف فصل', 'هیئت مدیره ۵ هدف برای فصل تعیین کرده. تلاش کنید!', 'info');
      CAREER.addNews('🏟️', 'ورزشگاه آماده', 'ورزشگاه خانگی آماده میزبانی از هواداران است.', 'info');
    }
  },

  _genLocalSquad() {
    if (this.players.length > 0) return;
    const pos=['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW','DF','MF','FW'];
    const fn=['علی','محمد','حسن','رضا','امیر','مهدی','حسین','سعید','احمد','جواد','فرهاد','بهنام','کامبیز','سامان'];
    const ln=['کریمی','رحمتی','جباری','نوری','محمدی','احمدی','حسینی','عباسی','صادقی','موسوی','کاظمی','حیدری','قاسمی','یوسفی'];
    this.players = pos.map((p, i) => {
      const base = p==='GK'?58:p==='DF'?62:p==='MF'?65:68;
      return { id:'p'+(i+1), name:fn[i]+' '+ln[i], pos, attack:Math.max(35,Math.min(95,Math.round(base+Math.random()*20-5))), age:Math.floor(Math.random()*12)+20, morale:Math.round(60+Math.random()*35), fitness:Math.round(70+Math.random()*30) };
    });
  },

  updateHeader() {
    const cn = localStorage.getItem('fm_clubName')||'باشگاه من';
    const mn = localStorage.getItem('fm_managerName')||'مدیر';
    document.getElementById('hdrClub').textContent = cn;
    document.getElementById('hdrManager').textContent = mn;
    const crestEl = document.getElementById('hdrCrest');
    if (typeof SVG!=='undefined'&&SVG.crest){crestEl.innerHTML='';crestEl.appendChild(SVG.crest(cn,44))}
    document.getElementById('hdrBudget').textContent = this._fmt(CAREER.budget);
    document.getElementById('hdrOvr').textContent = CAREER.getAvgOvr();
    document.getElementById('hdrMorale').textContent = CAREER.getMorale();
    document.getElementById('hdrWeek').textContent = CAREER.week + '/7';
  },

  _fmt(n){return n>=1000000?(n/1000000).toFixed(1)+'M':n>=1000?(n/1000).toFixed(0)+'K':String(n)},

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const m = document.getElementById('gameMain'); m.scrollTop = 0;
    ({home:()=>this._home(m),squad:()=>this._squad(m),market:()=>this._market(m),league:()=>this._league(m),club:()=>this._club(m)})[tab]();
  },

  /* ══════════ HOME ══════════ */
  _home(el) {
    const cn = localStorage.getItem('fm_clubName')||'باشگاه من';
    const avg = CAREER.getAvgOvr();
    const morale = CAREER.getMorale();
    const oponent = ['عقاب طلایی','پلنگ سیاه','گرگ خاکستری','شیر سرخ','ببر نارنجی','کرکس کبود','آذرخش شرقی'][Math.floor(Math.random()*7)];

    el.innerHTML = `
      <!-- Welcome Banner -->
      <div class="card" style="background:linear-gradient(135deg,rgba(34,211,238,.12),rgba(52,211,153,.06));padding:18px;">
        <div style="display:flex;align-items:center;gap:14px;">
          <div style="font-size:2.4rem;">⚽</div>
          <div>
            <div style="font-size:1rem;font-weight:800;">فصل ${CAREER.season} — هفته ${CAREER.week}</div>
            <div style="font-size:.78rem;color:var(--muted);">بودجه: ${this._fmt(CAREER.budget)} 💰</div>
          </div>
          <div style="margin-right:auto;text-align:center;">
            <div style="font-size:1.8rem;font-weight:900;color:var(--cyan);">${avg}</div>
            <div style="font-size:.6rem;color:var(--muted);">OVR</div>
          </div>
        </div>
      </div>

      <!-- Next Match -->
      <div class="section-title">🗓️ بازی بعدی</div>
      <div class="match-card" onclick="APP.startMatch('${cn}','${oponent}',${avg},${avg+Math.floor(Math.random()*10)-5})">
        <div class="match-team"><div class="match-team-icon">🏟️</div><div class="match-team-name">${cn}</div></div>
        <div class="match-vs">VS</div>
        <div class="match-team"><div class="match-team-icon">⚽</div><div class="match-team-name">${oponent}</div></div>
      </div>

      <!-- Quick Stats -->
      <div class="quick-actions">
        <div class="qa-card" onclick="APP.switchTab('squad')">
          <div class="qa-icon">👥</div><div class="qa-title">${this.players.length} بازیکن</div>
          <div class="qa-desc">میانگین: ${avg}</div>
        </div>
        <div class="qa-card" onclick="APP.switchTab('league')">
          <div class="qa-icon">🏆</div><div class="qa-title">لیگ</div>
          <div class="qa-desc">هفته ${CAREER.week}/7</div>
        </div>
        <div class="qa-card" onclick="APP.switchTab('market')">
          <div class="qa-icon">💱</div><div class="qa-title">بازار</div>
          <div class="qa-desc">${MARKET.list.length} بازیکن</div>
        </div>
        <div class="qa-card" onclick="APP.switchTab('club')">
          <div class="qa-icon">⚙️</div><div class="qa-title">باشگاه</div>
          <div class="qa-desc">امکانات و تنظیمات</div>
        </div>
      </div>

      <!-- Recent Form -->
      <div class="section-title">📊 عملکرد اخیر</div>
      <div class="card">
        ${CAREER.matchHistory.length > 0 ? CAREER.matchHistory.slice(0,5).map(m => {
          const won = m.homeGoals > m.awayGoals;
          const draw = m.homeGoals === m.awayGoals;
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <span style="font-size:.78rem;">${m.home} ${m.homeGoals}-${m.awayGoals} ${m.away}</span>
            <span style="font-size:.72rem;padding:2px 8px;border-radius:999px;font-weight:700;background:${won?'rgba(52,211,153,.15)':draw?'rgba(251,191,36,.15)':'rgba(244,97,79,.15)'};color:${won?'var(--emerald)':draw?'var(--amber)':'var(--red)'};">${won?'برد':draw?'مساوی':'باخت'}</span>
          </div>`;
        }).join('') : '<div style="text-align:center;padding:16px;color:var(--muted);font-size:.82rem;">هنوز بازی انجام نشده</div>'}
      </div>

      <!-- News Feed -->
      <div class="section-title">📰 اخبار باشگاه</div>
      <div class="card" style="padding:0;">
        ${CAREER.newsLog.slice(0,8).map(n => `
          <div class="news-item">
            <div class="news-icon" style="background:${n.type==='success'?'rgba(52,211,153,.1)':n.type==='error'?'rgba(244,97,79,.1)':'rgba(255,255,255,.05)'};">${n.icon}</div>
            <div class="news-body">
              <div class="news-title">${n.title}</div>
              <div class="news-desc">${n.desc}</div>
              <div class="news-time">${this._timeAgo(n.time)}</div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Objectives -->
      <div class="section-title">🎯 اهداف هیئت مدیره</div>
      <div class="card" style="padding:8px 16px;">
        ${CAREER.objectives.map(o => `
          <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.04);">
            <span style="font-size:1.1rem;">${o.done?'✅':'⬜'}</span>
            <div style="flex:1;">
              <div style="font-size:.82rem;font-weight:700;">${o.title}</div>
              <div style="font-size:.68rem;color:var(--muted);">${o.desc}</div>
            </div>
            <span style="font-size:.72rem;color:var(--amber);font-weight:700;">+${this._fmt(o.reward)}</span>
          </div>
        `).join('')}
      </div>
    `;
  },

  startMatch(home, away, hOvr, aOvr) {
    MATCH.start(home, away, hOvr, aOvr);
  },

  _timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'همین الان';
    if (diff < 3600000) return Math.floor(diff/60000) + ' دقیقه پیش';
    if (diff < 86400000) return Math.floor(diff/3600000) + ' ساعت پیش';
    return Math.floor(diff/86400000) + ' روز پیش';
  },

  /* ══════════ SQUAD ══════════ */
  _squad(el) {
    const gk=this.players.filter(p=>p.pos==='GK'),df=this.players.filter(p=>p.pos==='DF'),
          mf=this.players.filter(p=>p.pos==='MF'),fw=this.players.filter(p=>p.pos==='FW');

    el.innerHTML = `
      <div class="section-title">🏟️ ترکیب تیم — 4-4-2</div>
      <div class="formation-pitch">
        <div class="formation-row">${fw.slice(0,2).map(p=>this._fDot(p)).join('')}</div>
        <div class="formation-row">${mf.slice(0,4).map(p=>this._fDot(p)).join('')}</div>
        <div class="formation-row">${df.slice(0,4).map(p=>this._fDot(p)).join('')}</div>
        <div class="formation-row" style="margin-bottom:0;">${gk.slice(0,1).map(p=>this._fDot(p)).join('')}</div>
      </div>

      <div class="section-title">🏋️ تمرین</div>
      <div class="card" style="padding:8px;">
        ${TRAINING.sessions.map(s => `
          <div class="training-card" onclick="TRAINING.run('${s.id}')">
            <div class="training-icon" style="background:rgba(255,255,255,.05);">${s.icon}</div>
            <div class="training-info">
              <div class="training-name">${s.name}</div>
              <div class="training-desc">${s.desc}</div>
            </div>
            <div class="training-boost">+${s.boost} ⬆️<br><span style="font-size:.6rem;color:var(--muted);">${this._fmt(s.cost)}</span></div>
          </div>
        `).join('')}
      </div>

      <div class="section-title">📋 فهرست بازیکنان (${this.players.length})</div>
      <div class="filter-row">
        <button class="filter-btn active" onclick="APP._filterPos('all',this)">همه</button>
        <button class="filter-btn" onclick="APP._filterPos('GK',this)">🧤 GK</button>
        <button class="filter-btn" onclick="APP._filterPos('DF',this)">🛡️ DF</button>
        <button class="filter-btn" onclick="APP._filterPos('MF',this)">⚡ MF</button>
        <button class="filter-btn" onclick="APP._filterPos('FW',this)">🎯 FW</button>
      </div>
      <div id="squadList">
        ${this.players.map(p => this._pCard(p, true)).join('')}
      </div>
    `;
  },

  _fDot(p) {
    return `<div class="formation-dot" onclick="APP.showPlayer('${p.id}')">
      <div class="fd-circle">${p.attack}</div>
      <div class="fd-name">${p.name.split(' ')[0]}</div>
    </div>`;
  },

  _pCard(p, canSell) {
    const oc = p.attack>=75?'ovr-high':p.attack>=60?'ovr-mid':'ovr-low';
    const pe = {GK:'🧤',DF:'🛡️',MF:'⚡',FW:'🎯'}[p.pos]||'👤';
    return `<div class="player-card" data-pos="${p.pos}" onclick="APP.showPlayer('${p.id}')">
      <div class="player-avatar">${pe}</div>
      <div class="player-info">
        <div class="player-name">${p.name}</div>
        <div class="player-pos">${p.pos} · ${p.age||24} سال · روحیه: ${p.morale||70}</div>
      </div>
      <div class="player-ovr ${oc}">${p.attack}</div>
    </div>`;
  },

  _filterPos(pos, btn) {
    document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#squadList .player-card').forEach(el=>{
      el.style.display = (pos==='all'||el.dataset.pos===pos) ? '' : 'none';
    });
  },

  showPlayer(id) {
    const p = this.players.find(x=>x.id===id);
    if (!p) return;
    const pl = {GK:'دروازه‌بان',DF:'مدافع',MF:'هافبک',FW:'مهاجم'}[p.pos]||p.pos;
    const pe = {GK:'🧤',DF:'🛡️',MF:'⚡',FW:'🎯'}[p.pos]||'👤';
    const sellPrice = Math.round(p.attack * 30000 + Math.random() * 200000);
    this.showModal(`
      <div class="modal-handle"></div>
      <div style="text-align:center;">
        <div style="width:72px;height:72px;border-radius:50%;background:var(--glass-strong);border:3px solid var(--glass-border);display:flex;align-items:center;justify-content:center;font-size:2rem;margin:0 auto 12px;">${pe}</div>
        <div style="font-size:1.1rem;font-weight:800;">${p.name}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:2px;">${pl} · ${p.age||24} سال</div>
        <div style="display:inline-block;margin-top:8px;padding:8px 20px;border-radius:12px;font-size:1.5rem;font-weight:900;" class="${p.attack>=75?'ovr-high':p.attack>=60?'ovr-mid':'ovr-low'}">${p.attack}</div>
      </div>
      <div style="margin-top:16px;">
        <div class="stat-bar"><span class="stat-bar-label">حمله</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${p.attack}%;background:var(--grad-brand);"></div></div><span class="stat-bar-value">${p.attack}</span></div>
        <div class="stat-bar"><span class="stat-bar-label">آمادگی</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${p.fitness||85}%;background:var(--grad-gold);"></div></div><span class="stat-bar-value">${p.fitness||85}</span></div>
        <div class="stat-bar"><span class="stat-bar-label">روحیه</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${p.morale||70}%;background:${(p.morale||70)>=70?'var(--emerald)':'var(--red)'};"></div></div><span class="stat-bar-value">${p.morale||70}</span></div>
        <div class="stat-bar"><span class="stat-bar-label">پتانسیل</span><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${Math.min(99,p.attack+8)}%;background:var(--grad-purple);"></div></div><span class="stat-bar-value">${Math.min(99,p.attack+8)}</span></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;">
        <button class="btn-secondary" style="flex:1;font-size:.82rem;padding:11px;" onclick="APP.sellPlayer('${p.id}')">💰 فروش (${this._fmt(sellPrice)})</button>
      </div>
    `);
  },

  sellPlayer(id) {
    const p = this.players.find(x=>x.id===id);
    if (!p) return;
    if (this.players.length <= 11) { this.toast('حداقل ۱۱ بازیکن لازم است!','error'); return; }
    const price = Math.round(p.attack * 30000 + Math.random() * 200000);
    CAREER.budget += price;
    CAREER.transferEarned += price;
    this.players = this.players.filter(x=>x.id!==id);
    CAREER.addNews('💸','فروش بازیکن',`${p.name} به ${this._fmt(price)} فروخته شد`,'info');
    this.toast(`${p.name} فروخته شد! +${this._fmt(price)}`,'success');
    CAREER.save();
    this.closeModal();
    this.updateHeader();
    this.switchTab('squad');
  },

  /* ══════════ MARKET ══════════ */
  _market(el) {
    MARKET.generate();
    el.innerHTML = `
      <div class="section-title">💱 بازار نقل و انتقالات</div>
      <div class="card" style="padding:12px;">
        <div class="input-group" style="margin-bottom:0;">
          <div class="input-icon">🔍</div>
          <input type="text" id="mkSearch" placeholder="جستجوی بازیکن..." oninput="APP._filterMk(this.value)">
        </div>
      </div>
      <div class="filter-row">
        <button class="filter-btn active" onclick="APP._filterMkPos('all',this)">همه</button>
        <button class="filter-btn" onclick="APP._filterMkPos('GK',this)">🧤 GK</button>
        <button class="filter-btn" onclick="APP._filterMkPos('DF',this)">🛡️ DF</button>
        <button class="filter-btn" onclick="APP._filterMkPos('MF',this)">⚡ MF</button>
        <button class="filter-btn" onclick="APP._filterMkPos('FW',this)">🎯 FW</button>
      </div>

      <!-- Scouting -->
      <div class="section-title">🔍 استعدادیابی</div>
      <div class="scout-card" onclick="SCOUT.discover()">
        <div class="scout-header"><div class="scout-icon">🕵️</div><div><div class="scout-name">ارسال استعدادیاب</div><div class="scout-rating">هزینه: 50K 💰</div></div></div>
        <div style="font-size:.72rem;color:var(--muted);">استعدادیاب شما یک بازیکن جوان پیدا می‌کند</div>
      </div>
      ${SCOUT.reports.length > 0 ? `
        <div style="font-size:.75rem;font-weight:700;color:var(--purple);margin-bottom:8px;">📋 گزارش‌های استعدادیابی</div>
        ${SCOUT.reports.map(r => `
          <div class="player-card" style="border-color:rgba(167,139,250,.2);">
            <div class="player-avatar">🌟</div>
            <div class="player-info">
              <div class="player-name">${r.name}</div>
              <div class="player-pos">${r.pos} · ${r.age} سال · 🏳️ ${r.country} · پتانسیل: ${r.potential}</div>
            </div>
            <button style="background:var(--grad-purple);color:#fff;border:none;border-radius:8px;padding:6px 12px;font-family:var(--font);font-size:.7rem;font-weight:700;cursor:pointer;" onclick="SCOUT.sign('${r.id}')">امضا</button>
          </div>
        `).join('')}
      ` : ''}

      <!-- Market List -->
      <div class="section-title">🏪 بازار بازیکنان</div>
      <div id="mkList">
        ${MARKET.list.map(p => {
          const oc=p.attack>=75?'ovr-high':p.attack>=60?'ovr-mid':'ovr-low';
          const pe={GK:'🧤',DF:'🛡️',MF:'⚡',FW:'🎯'}[p.pos]||'👤';
          const pr=this._fmt(p.price);
          return `<div class="player-card mk-item" data-pos="${p.pos}" data-name="${p.name}">
            <div class="player-avatar">${pe}</div>
            <div class="player-info">
              <div class="player-name">${p.name}</div>
              <div class="player-pos">${p.pos} · ${p.age} سال · ${p.club} · 💰 ${pr}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div class="player-ovr ${oc}" style="width:36px;height:36px;font-size:.9rem;">${p.attack}</div>
              <button style="background:var(--grad-brand);color:#04141a;border:none;border-radius:8px;padding:4px 10px;font-family:var(--font);font-size:.65rem;font-weight:700;cursor:pointer;" onclick="MARKET.buy('${p.id}');APP.switchTab('market');">خرید</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;
  },

  _filterMk(q){document.querySelectorAll('.mk-item').forEach(el=>{el.style.display=(el.dataset.name||'').includes(q)?'':'none'})},
  _filterMkPos(pos,btn){document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('.mk-item').forEach(el=>{el.style.display=(pos==='all'||el.dataset.pos===pos)?'':'none'})},

  /* ══════════ LEAGUE ══════════ */
  _league(el) {
    el.innerHTML = `
      <div class="section-title">🏆 لیگ آنلاین</div>
      <div class="card" style="background:linear-gradient(135deg,rgba(251,191,36,.08),rgba(245,158,11,.04));">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
          <div style="font-size:2rem;">🏆</div>
          <div><div style="font-size:.9rem;font-weight:800;">لیگ خودت رو بساز</div><div style="font-size:.72rem;color:var(--muted);">لیگ ۸ تیمی با AI یا دوستان</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary" style="flex:1;font-size:.82rem;padding:11px;" onclick="APP.createLeague()">➕ ساخت لیگ</button>
          <button class="btn-secondary" style="flex:1;font-size:.82rem;padding:11px;" onclick="APP.joinLeague()">🔗 ورود با کد</button>
        </div>
      </div>
      <div class="section-title">📋 لیگ‌های من</div>
      <div id="leagueContent"><div class="loading-state"><span class="spinner"></span></div></div>
    `;
    this._loadLeagues();
  },

  async _loadLeagues(){try{const me=await API.get('/api/me');const el=document.getElementById('leagueContent');if(!el)return;if(me.leagues&&me.leagues.length>0)el.innerHTML=me.leagues.map(l=>`<div class="card" style="cursor:pointer;" onclick="APP.viewLeague('${l.id}')"><div style="display:flex;justify-content:space-between;align-items:center;"><div><div style="font-size:.9rem;font-weight:800;">${l.name}</div><div style="font-size:.72rem;color:var(--muted);">${l.members} تیم</div></div><div class="card-badge badge-live">هفته ${l.nextRound!==null?l.nextRound+1:'پایان'}</div></div></div>`).join('');else el.innerHTML='<div class="empty-state"><div class="empty-state-icon">🏆</div><div class="empty-state-title">هنوز لیگی ندارید</div></div>'}catch{}},

  createLeague(){this.showModal(`<div class="modal-handle"></div><div class="modal-title">ساخت لیگ جدید</div><div class="input-group"><div class="input-icon">🏆</div><input type="text" id="newLN" placeholder="نام لیگ"></div><button class="btn-primary" onclick="APP.doCreateLeague()">✅ ساخت</button>`)},
  async doCreateLeague(){const n=document.getElementById('newLN')?.value?.trim();if(!n){this.toast('نام لیگ را وارد کنید','error');return}try{await API.post('/api/leagues',{name:n,fillAI:true,fillTo:8});this.closeModal();this.toast('لیگ ساخته شد! 🎉','success');this.switchTab('league')}catch(e){this.toast(e.message,'error')}},
  joinLeague(){this.showModal(`<div class="modal-handle"></div><div class="modal-title">ورود به لیگ</div><div class="input-group"><div class="input-icon">🔗</div><input type="text" id="joinId" placeholder="شناسه لیگ"></div><button class="btn-primary" onclick="APP.doJoinLeague()">✅ ورود</button>`)},
  async doJoinLeague(){const id=document.getElementById('joinId')?.value?.trim();if(!id){this.toast('شناسه را وارد کنید','error');return}try{await API.post(`/api/leagues/${id}/join`);this.closeModal();this.toast('پیوستید! 🎉','success');this.switchTab('league')}catch(e){this.toast(e.message,'error')}},

  async viewLeague(id){
    try{
      const d=await API.get(`/api/leagues/${id}`);
      const L=d.league;
      const T=L.table||[];
      let h='<div class="modal-handle"></div>';
      h+=`<div class="modal-title">🏆 ${L.name} — فصل ${L.season}</div>`;
      if(L.window){
        const wc=L.window.open?'badge-live':'badge-gold';
        const wt=L.window.open?'🟢 پنجره باز':'🔴 بسته';
        h+=`<div style="text-align:center;margin-bottom:16px;"><span class="card-badge ${wc}">${wt} · هفته ${(L.nextRound||0)+1}/${L.totalRounds}</span></div>`;
      }
      h+='<table class="league-table"><thead><tr><th>#</th><th style="text-align:right;">تیم</th><th>ب</th><th>پ</th><th>م</th><th>خ</th><th>گ‌ز</th><th>گ‌خ</th><th>امتیاز</th></tr></thead><tbody>';
      T.forEach((r,i)=>{
        const me=L.members?L.members.find(m=>m.isMe&&m.clubName===r.name):null;
        const rc=i<3?'rank-'+(i+1):'';
        h+=`<tr class="${me?'me':''}"><td class="${rc}">${i+1}</td><td class="team-name-cell">${r.name}</td>`;
        h+=`<td>${r.p||0}</td><td>${r.w||0}</td><td>${r.d||0}</td><td>${r.l||0}</td>`;
        h+=`<td>${r.gf||0}</td><td>${r.ga||0}</td><td style="font-weight:800;">${r.pts||0}</td></tr>`;
      });
      h+='</tbody></table>';
      h+='<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">';
      if(L.isOwner&&L.nextRound!==null) h+=`<button class="btn-primary" style="flex:1;font-size:.82rem;padding:11px;" onclick="APP.simWeek('${id}')">▶️ بازی هفته</button>`;
      if(L.canNewSeason) h+=`<button class="btn-secondary" style="flex:1;font-size:.82rem;padding:11px;" onclick="APP.newSeason('${id}')">🔄 فصل جدید</button>`;
      h+='</div>';
      this.showModal(h);
    }catch(e){this.toast(e.message,'error')}
  },
  async simWeek(id){try{await API.post(`/api/leagues/${id}/simulate`);this.closeModal();this.toast('هفته بازی شد! ⚽','success');setTimeout(()=>this.viewLeague(id),500)}catch(e){this.toast(e.message,'error')}},
  async newSeason(id){try{await API.post(`/api/leagues/${id}/newseason`);this.closeModal();this.toast('فصل جدید! 🎉','success');setTimeout(()=>this.viewLeague(id),500)}catch(e){this.toast(e.message,'error')}},

  /* ══════════ CLUB ══════════ */
  _club(el) {
    const cn = localStorage.getItem('fm_clubName')||'باشگاه من';
    const mn = localStorage.getItem('fm_managerName')||'مدیر';
    const f = CAREER.facilities;

    el.innerHTML = `
      <div class="section-title">⚙️ باشگاه</div>
      <div class="card" style="text-align:center;">
        <div id="clubCrest" style="margin-bottom:12px;"></div>
        <div style="font-size:1.1rem;font-weight:800;">${cn}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:2px;">مدیر: ${mn} · فصل ${CAREER.season}</div>
      </div>

      <!-- Finances -->
      <div class="section-title">💰 امور مالی</div>
      <div class="card" style="padding:8px 16px;">
        <div class="finance-row"><span class="finance-label">بودجه فعلی</span><span class="finance-value">${this._fmt(CAREER.budget)}</span></div>
        <div class="finance-row"><span class="finance-label">حقوق هفتگی</span><span class="finance-value finance-negative">-${this._fmt(CAREER.wageBill)}</span></div>
        <div class="finance-row"><span class="finance-label">درآمد اسپانسر</span><span class="finance-value finance-positive">+${this._fmt(CAREER.sponsorshipIncome)}</span></div>
        <div class="finance-row"><span class="finance-label">هزینه نقل و انتقالات</span><span class="finance-value finance-negative">${this._fmt(CAREER.transferSpent)}</span></div>
        <div class="finance-row"><span class="finance-label">درآمد فروش</span><span class="finance-value finance-positive">+${this._fmt(CAREER.transferEarned)}</span></div>
      </div>

      <!-- Facilities -->
      <div class="section-title">🏟️ امکانات باشگاه</div>
      <div class="card" style="padding:8px 16px;">
        ${this._facilityRow('🏋️','مرکز تمرین','training',f.training)}
        ${this._facilityRow('🏥','مرکز پزشکی','medical',f.medical)}
        ${this._facilityRow('🌟','آکادمی جوانان','youth',f.youth)}
        ${this._facilityRow('🏟️','ورزشگاه','stadium',f.stadium)}
      </div>

      <!-- Achievements -->
      <div class="section-title">🏅 دستاوردها</div>
      <div class="card" style="padding:8px;">
        ${[
          {icon:'🏆',name:'قهرمان',desc:'قهرمان لیگ شوید',done:CAREER.trophies.includes('league')},
          {icon:'⚽',name:'آقای گل',desc:'بازیکن با ۱۰+ گل',done:false},
          {icon:'🛡️',name:'دیوار آهنین',desc:'کمتر از ۱۰ گل خورده',done:false},
          {icon:'💰',name:'سرمایه‌گذار',desc:'بودجه بالای ۲۰M',done:CAREER.budget>=20000000},
          {icon:'🌟',name:'پرورش استعداد',desc:'بازیکن جوان با OVR 80+',done:this.players.some(p=>p.age<23&&p.attack>=80)},
          {icon:'👥',name:'تیم کامل',desc:'۲۰+ بازیکن در تیم',done:this.players.length>=20},
        ].map(a=>`<div class="achievement ${a.done?'':'locked'}"><div class="achievement-icon">${a.icon}</div><div class="achievement-info"><div class="achievement-name">${a.name}</div><div class="achievement-desc">${a.desc}</div></div>${a.done?'<div class="achievement-check">✅</div>':''}</div>`).join('')}
      </div>

      <!-- Settings -->
      <div class="section-title">🔧 تنظیمات</div>
      <div class="card" style="padding:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.04);cursor:pointer;" onclick="AUTH.logout()">
          <div><div style="font-size:.85rem;font-weight:600;">🚪 خروج از حساب</div></div><span style="color:var(--muted);">←</span>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;cursor:pointer;" onclick="AUTH.goOffline()">
          <div><div style="font-size:.85rem;font-weight:600;">🎮 بازی آفلاین</div><div style="font-size:.72rem;color:var(--muted);">بازی تک‌نفره بدون اینترنت</div></div><span style="color:var(--muted);">←</span>
        </div>
      </div>
    `;

    const crestEl = document.getElementById('clubCrest');
    if (crestEl && typeof SVG!=='undefined'&&SVG.crest) crestEl.appendChild(SVG.crest(cn,80));
  },

  _facilityRow(icon, name, key, level) {
    const upgradeCost = level * 500000;
    const canUpgrade = CAREER.budget >= upgradeCost && level < 5;
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.04);">
      <span style="font-size:1.3rem;">${icon}</span>
      <div style="flex:1;">
        <div style="font-size:.82rem;font-weight:700;">${name}</div>
        <div style="display:flex;gap:3px;margin-top:4px;">
          ${Array.from({length:5},(_,i)=>`<div style="width:20px;height:4px;border-radius:4px;background:${i<level?'var(--emerald)':'rgba(255,255,255,.08)'};"></div>`).join('')}
        </div>
      </div>
      ${level<5?`<button style="background:${canUpgrade?'var(--grad-brand)':'rgba(255,255,255,.05)'};color:${canUpgrade?'#04141a':'var(--muted)'};border:none;border-radius:8px;padding:6px 12px;font-family:var(--font);font-size:.7rem;font-weight:700;cursor:${canUpgrade?'pointer':'not-allowed'};" ${canUpgrade?`onclick="APP.upgradeFacility('${key}')"`:'disabled'}>⬆️ ${this._fmt(upgradeCost)}</button>`:'<span style="font-size:.72rem;color:var(--emerald);font-weight:700;">حداکثر</span>'}
    </div>`;
  },

  upgradeFacility(key) {
    const f = CAREER.facilities;
    if (f[key] >= 5) return;
    const cost = f[key] * 500000;
    if (CAREER.budget < cost) { this.toast('بودجه کافی نیست!','error'); return; }
    CAREER.budget -= cost;
    f[key]++;
    const names = {training:'مرکز تمرین',medical:'مرکز پزشکی',youth:'آکادمی جوانان',stadium:'ورزشگاه'};
    CAREER.addNews('⬆️','ارتقای امکانات',`${names[key]} به سطح ${f[key]} ارتقا یافت!`,'success');
    this.toast(`${names[key]} ارتقا یافت! ⬆️`,'success');
    CAREER.save();
    this.updateHeader();
    this.switchTab('club');
  },

  /* ══════════ MODALS & TOASTS ══════════ */
  showModal(html){document.getElementById('modalOverlay').style.display='block';document.getElementById('modalBox').style.display='block';document.getElementById('modalBox').innerHTML=html},
  closeModal(){document.getElementById('modalOverlay').style.display='none';document.getElementById('modalBox').style.display='none'},
  toast(msg,type){type=type||'info';const r=document.getElementById('toastRoot');const ic={success:'✅',error:'❌',info:'ℹ️'};const t=document.createElement('div');t.className='toast '+type;t.innerHTML=`<span>${ic[type]||'ℹ️'}</span><span>${msg}</span>`;r.appendChild(t);setTimeout(()=>{t.classList.add('hiding');setTimeout(()=>t.remove(),300)},3000)},
  exitOffline(){document.getElementById('offlineFrame').style.display='none';document.getElementById('offlineIframe').src='about:blank';const t=localStorage.getItem('fm_token');if(t)document.getElementById('gameApp').style.display='flex';else document.getElementById('auth').style.display='flex'}
};

/* ── Boot ── */
document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>AUTH.init(),2200)});