/* ============================================================
   challenge.js — بازی دوستانه‌ی آسنکرون با «کد چالش»
   ------------------------------------------------------------
   این اولین قدم واقعی به سمت آنلاین است، اما بدون هیچ سروری:

   ۱) باشگاهت را در یک کد فشرده (base64url) بسته‌بندی می‌کنی
   ۲) کد را برای دوستت می‌فرستی (هر پیام‌رسانی)
   ۳) دوستت کد تو را می‌چسباند و کد خودش را برمی‌گرداند
   ۴) هر دو طرف، دو کد را کنار هم می‌گذارند ⇒ نتیجه‌ی یکسان می‌بینند

   چرا یکسان؟ چون:
   • موتور «قطعی» است (engine.js)
   • شعله‌ی تصادفی (seed) از هشِ «هر دو کد به ترتیب مرتب‌شده» ساخته می‌شود
   • زمین بی‌طرف است (بدون مزیت میزبانی) و ترتیب دو طرف همیشه الفبایی
     می‌شود ⇒ نتیجه به اینکه کد را چه کسی اول گذاشته وابسته نیست

   این دقیقاً همان الگویی است که بعداً روی سرور اجرا می‌شود؛ فقط
   سرور جای «کد» را می‌گیرد.
   ============================================================ */

const CHALLENGE_VERSION = 1;

/* ---------- ساخت کد از باشگاه فعلی ---------- */
function buildChallengePayload(){
  const s = teamStrengthFor(state.players, state.starters);
  return {
    v: CHALLENGE_VERSION,
    c: state.clubName,
    mg: state.managerName,
    a: Math.round(s.atk),
    d: Math.round(s.def),
    f: Math.round(s.fitness),
    s: Math.round(s.stamina),
    m: Math.round(s.morale),
    fm: state.formation,
    st: state.style,
    p: s.lineup.map(p=>[p.name, p.position, Math.round(p.attack)])
  };
}
function makeChallengeCode(){
  return b64urlEncode(JSON.stringify(buildChallengePayload()));
}
function decodeChallengeCode(code){
  const raw = String(code||'').trim().replace(/\s+/g,'');
  if(raw.length < 8) return null;
  try{
    const obj = JSON.parse(b64urlDecode(raw));
    if(!obj || obj.v !== CHALLENGE_VERSION || !obj.c) return null;
    if(!Array.isArray(obj.p)) return null;
    return obj;
  }catch(e){ return null; }
}
/* تبدیل کد به ورودی موتور */
function challengePayloadToSide(payload){
  const posMap = { 'GK':'GK', 'DF':'DF', 'MF':'MF', 'FW':'FW' };
  return {
    name: sanitizeName(payload.c, 'باشگاه دوست', 22),
    atk: clamp(Number(payload.a)||60, 20, 120),
    def: clamp(Number(payload.d)||60, 20, 120),
    fitness: clamp(Number(payload.f)||90, 0, 100),
    stamina: clamp(Number(payload.s)||75, 0, 100),
    morale: clamp(Number(payload.m)||75, 0, 100),
    players: payload.p.slice(0,14).map((row, i)=>({
      id: 'ch_' + engineHash(payload.c + '#' + i),
      name: String(row[0]||('بازیکن ' + (i+1))).slice(0,30),
      pos: posMap[row[1]] || 'MF',
      attack: clamp(Number(row[2])||60, 20, 99)
    }))
  };
}

/* ---------- اجرای مسابقه‌ی دوستانه بین دو کد (کاملاً قطعی) ---------- */
function playChallenge(myCode, theirCode){
  const mine = decodeChallengeCode(myCode);
  const theirs = decodeChallengeCode(theirCode);
  if(!mine || !theirs){ showToast('کد چالش نامعتبره.', 'error'); return null; }
  /* ترتیب الفبایی برای یکسانی نتیجه در دو دستگاه */
  const pair = [mine, theirs].sort((a,b)=> a.c < b.c ? -1 : (a.c > b.c ? 1 : 0));
  const seed = engineHash('challenge:' + pair[0].c + '|' + pair[1].c + '|' + CHALLENGE_VERSION);
  const report = simulateMatchEngine(
    challengePayloadToSide(pair[0]),
    challengePayloadToSide(pair[1]),
    { seed, neutral: true }
  );
  report.id = 'fr' + seed.toString(36);
  report.competition = 'friendly';
  report.season = state.season;
  report.week = state.week;
  report.inputs = {
    home: compactSide(challengePayloadToSide(pair[0])),
    away: compactSide(challengePayloadToSide(pair[1]))
  };
  return report;
}
/* ثبت نتیجه‌ی دوستانه: بدون اثر در جدول و آمار فصل، فقط خستگی */
function commitFriendly(report){
  pushReport(report);
  applyReportToStats(report, { countStats: false });
  state.players.filter(p=>state.starters.includes(p.id)).forEach(p=>{
    p.fitness = clamp(p.fitness - rnd(3,7), 20, 100);
  });
  addNews(`بازی دوستانه مقابل ${report.home===state.clubName?report.away:report.home} انجام شد.`, 'info');
  render();
}

/* ---------- رابط کاربری ---------- */
function openChallenge(){
  if(state.starters.length !== 11){
    showToast('برای بازی دوستانه هم باید ترکیبت کامل باشه (تیم من ← چیدمان).', 'error');
    return;
  }
  const myCode = makeChallengeCode();
  const recent = (state.matchReports||[]).filter(r=>r.competition==='friendly').slice(0,3);
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" style="max-width:520px;" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>بازی دوستانه با کد چالش${infoBtn('challenge')}</h2>
        <p class="muted" style="font-size:0.78rem; line-height:1.8;">
          کدت را برای دوستت بفرست. اون کدش را برمی‌گرداند؛ هر دو کد را کنار هم بگذارید و
          هر دو دقیقاً <b>یک نتیجه‌ی یکسان</b> می‌بینید — بدون هیچ سروری.
        </p>

        <label class="muted" style="font-size:0.72rem; display:block; margin-top:12px;">۱) کد تو (بفرست برای دوستت)</label>
        <textarea readonly onclick="this.select()" style="min-height:58px; font-size:0.62rem; direction:ltr; margin-top:4px;">${myCode}</textarea>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn ghost small" style="flex:1;" onclick="copyTextToClipboard('${myCode}','کد چالشت کپی شد ✅')">کپی کد من</button>
          <button class="btn ghost small" style="flex:1;" onclick="shareChallengeText('${myCode}')">ارسال به دوست</button>
        </div>

        <label class="muted" style="font-size:0.72rem; display:block; margin-top:14px;">۲) کد دوستت را اینجا بگذار</label>
        <textarea id="theirCode" placeholder="کد دوستت را اینجا بچسبان..." style="min-height:58px; font-size:0.62rem; direction:ltr; margin-top:4px;"></textarea>
        <button class="btn primary" style="width:100%; margin-top:10px;" onclick="runChallengeFromModal('${myCode}')">شروع بازی دوستانه ⚽</button>

        ${recent.length ? `<div style="margin-top:14px;"><div class="muted" style="font-size:0.72rem; margin-bottom:6px;">بازی‌های دوستانه‌ی اخیر</div>
          ${recent.map(r=>reportRow(r)).join('')}</div>` : ''}

        <button class="btn ghost" style="width:100%; margin-top:12px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}
function shareChallengeText(code){
  const club = state.clubName;
  const text = `⚽ چالش دوستانه در «مدیر تیم»\nباشگاه من: ${club}\nکد چالش من:\n${code}\n\nکد خودت رو برام بفرست تا بازی کنیم!`;
  if(navigator.share){
    navigator.share({ title:'چالش دوستانه', text }).catch(()=>copyTextToClipboard(code, 'کد چالشت کپی شد ✅'));
  } else copyTextToClipboard(text, 'متن چالش کپی شد ✅');
}
function runChallengeFromModal(myCode){
  const their = (document.getElementById('theirCode') || {}).value || '';
  const report = playChallenge(myCode, their);
  if(!report) return;
  commitFriendly(report);
  closeOverlay('genericModal');
  setTimeout(()=>openReport(report.id), 220);
}

/* ---------- کارت داشبورد ---------- */
function challengeCardHtml(){
  const friendlies = (state.matchReports||[]).filter(r=>r.competition==='friendly').length;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>بازی دوستانه با دوستت${infoBtn('challenge')}</h2>
    <p class="muted" style="font-size:0.76rem; line-height:1.8;">بدون سرور، بدون ثبت‌نام: کد باشگاهت را بفرست و با ترکیب دوستت بازی کن. نتیجه برای هر دو یکسان است.</p>
    <button class="btn ghost" style="width:100%; margin-top:6px;" onclick="openChallenge()">ساخت / دریافت کد چالش 🔗</button>
    ${friendlies ? `<div class="muted" style="font-size:0.7rem; margin-top:8px; text-align:center;">تا حالا ${friendlies} بازی دوستانه انجام دادی</div>` : ''}
  </div>`;
}
