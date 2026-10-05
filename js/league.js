/* ============================================================
   league.js — گام ۱ آنلاین: «لیگ رفقا» با کد، بدون هیچ سروری
   ------------------------------------------------------------
   همان الگوی «کد چالش»، اما برای یک لیگ کامل:

   ۱) هر رفیق فقط «کد تیم» خودش را می‌فرستد (همان کد چالش)
   ۲) میزبان همه‌ی کدها را در یک «کد لیگ» جمع می‌کند
   ۳) کد لیگ را برای همه می‌فرستد
   ۴) هر کس کد لیگ را باز می‌کند ⇒ برنامه‌ی مسابقات (round-robin)
      و نتیجه‌ی همه‌ی بازی‌ها **قطعی** است ⇒ همه یک جدول می‌بینند

   چرا همه یک چیز می‌بینند؟
   • موتور قطعی است (engine.js)
   • برنامه‌ی مسابقات از ترتیب «بایتی» نام باشگاه‌ها ساخته می‌شود
     (مستقل از مرورگر و زبان ⇒ روی همه‌ی دستگاه‌ها یکسان)
   • seed هر مسابقه = هش (شناسه‌ی لیگ + شماره‌ی دور + نام دو تیم)
     ⇒ هیچ‌کس نمی‌تواند seed را «انتخاب» کند

   ⚠️ محدودیت آگاهانه (همان‌طور که در PLAN-ONLINE.md نوشته شد):
   بدون سرور، زمان‌بندی و قفل‌شدن ترکیب‌ها قابل اجبار نیست؛ این گام
   برای «دورهمی و تفریح» است، نه رقابت رسمی. برای رقابت رسمی، سرور
   همان موتور را اجرا می‌کند (گام ۲).
   ============================================================ */

const LEAGUE_VERSION = 1;
const LEAGUE_MAX_MEMBERS = 12;

/* ---------- کد لیگ ---------- */

/* ساخت payload لیگ: تیم خودت + کد تیم رفقا (یکتا بر اساس نام باشگاه) */
function buildLeaguePayload(name, memberCodes){
  const members = [buildChallengePayload()];
  (memberCodes || []).forEach(c=>{
    const p = decodeChallengeCode(c);
    if(p) members.push(p);
  });
  const seen = Object.create(null), uniq = [];
  members.forEach(p=>{
    const key = String(p.c).trim();
    if(seen[key]) return;
    seen[key] = 1;
    uniq.push(p);
  });
  /* ترتیب بایتی (نه localeCompare) ⇒ روی هر مرورگر/دستگاهی یکسان ⇒ قطعی */
  uniq.sort((a,b)=> String(a.c) < String(b.c) ? -1 : (String(a.c) > String(b.c) ? 1 : 0));
  return { v: LEAGUE_VERSION, n: sanitizeName(name, 'لیگ رفقا', 26), m: uniq.slice(0, LEAGUE_MAX_MEMBERS) };
}
function makeLeagueCode(name, memberCodes){
  return b64urlEncode(JSON.stringify(buildLeaguePayload(name, memberCodes)));
}
function decodeLeagueCode(code){
  const raw = String(code||'').trim().replace(/\s+/g,'');
  if(raw.length < 8) return null;
  try{
    const obj = JSON.parse(b64urlDecode(raw));
    if(!obj || obj.v !== LEAGUE_VERSION) return null;
    if(!obj.n || !Array.isArray(obj.m) || obj.m.length < 2) return null;
    if(obj.m.length > LEAGUE_MAX_MEMBERS) obj.m = obj.m.slice(0, LEAGUE_MAX_MEMBERS);
    const ok = obj.m.every(p=> p && p.c && Array.isArray(p.p) && p.p.length);
    if(!ok) return null;
    /* ترکیب‌ها را مرتب کن تا ترتیب اعضا همیشه یکی باشد */
    obj.m.sort((a,b)=> String(a.c) < String(b.c) ? -1 : (String(a.c) > String(b.c) ? 1 : 0));
    return obj;
  }catch(e){ return null; }
}
/* شناسه‌ی لیگ: فقط از نام لیگ و نام باشگاه‌ها (نه قدرت تیم‌ها)
   ⇒ اگر کسی ترکیبش را عوض کند، نتایج گذشته باطل نمی‌شوند */
function leagueIdOf(payload){
  return leagueIdFromNames(payload.n, payload.m.map(p=>p.c));
}

/* ---------- برنامه‌ی مسابقات (round-robin قطعی) ---------- */

/* هر کس یک بار با هر کس ⇒ n-1 دور (برای n زوج)، n دور (برای n فرد) */
function leagueFixtures(payload){
  return leagueFixturesFromCount(payload.m.length);
}
function leagueRoundCount(payload){ return leagueRoundCountFromCount(payload.m.length); }

/* seed هر مسابقه: از نام‌ها (مرتب‌شده) + شماره‌ی دور ⇒ قابل پیش‌بینی ولی قابل انتخاب نیست */
function leagueMatchSeed(payload, round, hi, ai){
  return leagueSeedFrom(leagueIdOf(payload), round, payload.m[hi].c, payload.m[ai].c);
}
function leagueKey(round, hi, ai){ return leagueKeyOf(round, hi, ai); }
/* ترتیب canonical یک جفت: همیشه «میزی» اول ذخیره می‌شود */
function leaguePairKey(round, a, b){ return (a < b) ? leagueKey(round, a, b) : leagueKey(round, b, a); }

/* تیم یک عضو لیگ، به شکل ورودی موتور */
function leagueSide(payload, idx){
  return challengePayloadToSide(payload.m[idx]);
}

/* ---------- شبیه‌سازی یک دور (قطعی) ---------- */
function simulateLeagueRound(payload, round){
  const rounds = leagueFixtures(payload);
  const pairs = rounds[round] || [];
  const out = [];
  pairs.forEach(([hi, ai])=>{
    const seed = leagueMatchSeed(payload, round, hi, ai);
    const report = simulateMatchEngine(leagueSide(payload, hi), leagueSide(payload, ai), { seed });
    report.competition = 'async-league';
    report.round = round;
    report.id = 'al' + seed.toString(36) + 'r' + round + 'h' + hi + 'a' + ai;
    report.inputs = {
      home: compactSide(leagueSide(payload, hi)),
      away: compactSide(leagueSide(payload, ai))
    };
    out.push({ key: leagueKey(round, hi, ai), round, hi, ai, seed, report });
  });
  return out;
}

/* ---------- جدول ---------- */
function leagueTable(payload, results){
  /* جدول محاسبه‌ی مشترک (league-core) + اطلاعات نمایشی مخصوص کلاینت */
  const rows = leagueTableFromNames(payload.m.map(p=>p.c), results);
  rows.forEach(r=>{
    const p = payload.m[r.i];
    r.manager = p ? (p.mg || '') : '';
    r.isUser = r.name === state.clubName;
  });
  return rows;
}

/* دور بعدی که کامل بازی نشده (یا null اگر لیگ تمام شده) */
function leagueNextRound(payload, results){
  return leagueNextRoundFrom(payload.m.length, results);
}
/* آیا دور r کامل بازی شده؟ */
function leagueRoundDone(payload, results, r){
  return leagueRoundComplete(payload.m.length, results, r);
}

/* ---------- تأیید صحت: بازتولید همه‌ی نتایج از seed ---------- */
function verifyLeagueResults(payload, results){
  const bad = [];
  Object.keys(results || {}).forEach(k=>{
    const r = results[k];
    const seed = leagueMatchSeed(payload, r.r, r.hi, r.ai);
    if(seed !== r.s){ bad.push({ key:k, round:r.r, why:'seed' }); return; }
    const rep = simulateMatchEngine(leagueSide(payload, r.hi), leagueSide(payload, r.ai), { seed });
    if(rep.homeGoals !== r.h || rep.awayGoals !== r.a) bad.push({ key:k, round:r.r, why:'result' });
    else if(!r.verified) r.verified = true;
  });
  return { total: Object.keys(results || {}).length, bad };
}

/* ---------- وضعیت لیگ در بازی ---------- */
function asyncLeaguePayload(){
  const L = state.asyncLeague;
  if(!L || !L.code) return null;
  return decodeLeagueCode(L.code);
}
function asyncLeagueResults(){ return (state.asyncLeague && state.asyncLeague.results) || {}; }

/* آیا این کاربر در این لیگ هست؟ */
function asyncLeagueUserIndex(payload){
  return payload.m.findIndex(p=> p.c === state.clubName);
}

/* ساخت لیگ جدید از کدهای رفقا */
function startAsyncLeague(name, memberCodes){
  const payload = buildLeaguePayload(name, memberCodes);
  const club = sanitizeName(name, 'لیگ رفقا', 26);
  if(payload.m.length < 2){
    showToast('برای لیگ حداقل یک رفیق لازمه — کد تیمش رو بچسبون.', 'error');
    return null;
  }
  state.asyncLeague = {
    name: payload.n,
    code: b64urlEncode(JSON.stringify(payload)),
    results: {},
    createdAt: Date.now(),
    memberCount: payload.m.length
  };
  addNews(`لیگ دوستانه‌ی «${payload.n}» با ${payload.m.length} تیم ساخته شد.`, 'info');
  closeOverlay('genericModal');
  showToast(`لیگ «${payload.n}» ساخته شد ✅`);
  uiMain = 'league'; uiSub = 'async';
  render();
  return payload;
}

/* پیوستن به لیگی که میزبان ساخته (کد لیگ آماده) */
function joinAsyncLeague(code){
  const payload = decodeLeagueCode(code);
  if(!payload){ showToast('کد لیگ نامعتبره.', 'error'); return null; }
  state.asyncLeague = {
    name: payload.n,
    code: b64urlEncode(JSON.stringify(payload)),
    results: {},
    createdAt: Date.now(),
    memberCount: payload.m.length
  };
  showToast(`به لیگ «${payload.n}» اضافه شدی ✅ (${payload.m.length} تیم)`);
  closeOverlay('genericModal');
  uiMain = 'league'; uiSub = 'async';
  render();
  return payload;
}

/* ترکیب تیم خودت را در کد لیگ به‌روز کن (بقیه چیزها دست نمی‌خورد) */
function refreshMyTeamInLeague(){
  const payload = asyncLeaguePayload();
  if(!payload) return;
  const me = buildChallengePayload();
  let found = false;
  payload.m = payload.m.map(p=>{
    if(p.c === state.clubName){ found = true; const merged = Object.assign({}, p); Object.keys(me).forEach(k=> merged[k] = me[k]); return merged; }
    return p;
  });
  if(!found) return showToast('تیم تو در این لیگ نیست.', 'error');
  state.asyncLeague.code = b64urlEncode(JSON.stringify(payload));
  state.asyncLeague.name = payload.n;
  state.asyncLeague.memberCount = payload.m.length;
  showToast('ترکیب تیمت در کد لیگ به‌روز شد — کد جدید رو برای رفقا بفرست ✅');
  render();
}

/* خروج از لیگ */
function leaveAsyncLeague(){
  askConfirm({
    title:'خروج از لیگ رفقا؟',
    body:'جدول و نتایج این لیگ از بازی پاک می‌شود (کد لیگ پیش رفقا می‌ماند).',
    yes:'خروج', danger:true,
    onYes(){ state.asyncLeague = null; showToast('از لیگ رفقا خارج شدی.'); render(); }
  });
}

/* ---------- بازی دور بعد ---------- */
function playNextLeagueRound(){
  const payload = asyncLeaguePayload();
  if(!payload) return showToast('اول یک لیگ بساز یا وارد شو.', 'error');
  if(state.starters.length !== 11){
    showToast('برای بازی لیگ رفقا باید ترکیبت کامل باشه (تیم من ← چیدمان).', 'error');
    return;
  }
  const results = asyncLeagueResults();
  const round = leagueNextRound(payload, results);
  if(round === null){ showToast('همه‌ی دورهای این لیگ بازی شده 🏁'); render(); return; }

  const matches = simulateLeagueRound(payload, round);
  let userMatch = null;
  matches.forEach(m=>{
    results[m.key] = { h: m.report.homeGoals, a: m.report.awayGoals, s: m.seed, hi: m.hi, ai: m.ai, r: round, verified: true };
    if(m.report.home === state.clubName || m.report.away === state.clubName) userMatch = m;
  });
  state.asyncLeague.results = results;
  state.asyncLeague.updatedAt = Date.now();
  state.asyncLeague.playedRounds = Object.keys(results).length;

  if(userMatch){
    const rep = userMatch.report;
    applyReportToStats(rep, { countStats: false });   /* لیگ رفقا جدول و آمار خودش را دارد */
    pushReport(rep);
    const wasHome = rep.home === state.clubName;
    const myGoals = wasHome ? rep.homeGoals : rep.awayGoals;
    const oppGoals = wasHome ? rep.awayGoals : rep.homeGoals;
    const opp = wasHome ? rep.away : rep.home;
    const outcome = myGoals > oppGoals ? 'برد' : (myGoals < oppGoals ? 'باخت' : 'مساوی');
    addNews(`لیگ رفقا (دور ${faNum(round+1)}) مقابل ${opp}: ${rep.homeGoals} - ${rep.awayGoals} (${outcome}).`, 'match');
    state.players.filter(p=>state.starters.includes(p.id)).forEach(p=>{
      p.morale = clamp(p.morale + (outcome === 'برد' ? 4 : (outcome === 'باخت' ? -4 : 0)), 20, 100);
      const drain = rnd(5,12) * (1.25 - p.stamina/160);
      p.fitness = clamp(p.fitness - Math.round(drain), 20, 100);
    });
    render();
    const livePref = !state.prefs || state.prefs.liveView !== false;
    if(livePref) openLiveMatch(rep.id, ()=> showLeagueRoundModal(payload, round, matches));
    else showLeagueRoundModal(payload, round, matches);
  } else {
    addNews(`دور ${faNum(round+1)} لیگ رفقا بازی شد.`, 'info');
    render();
    showLeagueRoundModal(payload, round, matches);
  }
}

/* خلاصه‌ی دور: همه‌ی نتایج آن دور */
function showLeagueRoundModal(payload, round, matches){
  const rows = matches.map(m=>{
    const hi = m.hi, ai = m.ai;
    const isMine = payload.m[hi].c === state.clubName || payload.m[ai].c === state.clubName;
    return `<div class="row ${isMine?'al-me':''}" style="cursor:pointer;" onclick="watchLeagueMatch('${m.key}')">
      <span>${escapeHtml(payload.m[hi].c)} <span class="muted">-</span> ${escapeHtml(payload.m[ai].c)}</span>
      <b>${faNum(m.report.homeGoals)} - ${faNum(m.report.awayGoals)}</b></div>`;
  }).join('');
  const table = leagueTable(payload, asyncLeagueResults());
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" style="max-width:520px;" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>دور ${faNum(round+1)} ${escapeHtml(payload.n)}</h2>
        <p class="muted" style="font-size:0.72rem;">روی هر مسابقه بزن تا گزارش و پخش زنده‌اش را ببینی.</p>
        ${rows}
        <div style="margin-top:12px;">
          <div class="muted" style="font-size:0.72rem; margin-bottom:6px;">جدول تا این دور</div>
          ${leagueTableHtml(payload, table, 8)}
        </div>
        <button class="btn primary" style="width:100%; margin-top:12px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}

/* دیدن (یا تماشای زنده‌ی) هر مسابقه‌ی لیگ از روی seed */
function watchLeagueMatch(key){
  const payload = asyncLeaguePayload();
  const res = asyncLeagueResults()[key];
  if(!payload || !res) { showToast('این مسابقه پیدا نشد.', 'error'); return; }
  const seed = leagueMatchSeed(payload, res.r, res.hi, res.ai);
  let rep = reportById('al' + seed.toString(36) + 'r' + res.r + 'h' + res.hi + 'a' + res.ai);
  if(!rep){
    rep = simulateMatchEngine(leagueSide(payload, res.hi), leagueSide(payload, res.ai), { seed });
    rep.competition = 'async-league';
    rep.round = res.r;
    rep.id = 'al' + seed.toString(36) + 'r' + res.r + 'h' + res.hi + 'a' + res.ai;
    rep.inputs = { home: compactSide(leagueSide(payload, res.hi)), away: compactSide(leagueSide(payload, res.ai)) };
    pushReport(rep);
  }
  stopLive();
  const livePref = !state.prefs || state.prefs.liveView !== false;
  if(livePref) openLiveMatch(rep.id);
  else openReport(rep.id);
}

/* ---------- جدول HTML ---------- */
function leagueTableHtml(payload, table, maxRows){
  const rows = (table || []).slice(0, maxRows || table.length);
  return `<table class="league al-table">
    <tr><th>#</th><th style="text-align:right;">تیم</th><th>بازی</th><th>ب.ب</th><th>م</th><th>ب.خ</th><th>گ.ز</th><th>گ.خ</th><th>امت</th></tr>
    ${rows.map(r=>`<tr class="${r.isUser?'me':''}">
      <td>${faNum(r.rank)}</td>
      <td class="team-name"><span class="mini-crest">${crestSVG(r.name)}</span>${escapeHtml(r.name)}</td>
      <td>${faNum(r.played)}</td><td>${faNum(r.won)}</td><td>${faNum(r.drawn)}</td><td>${faNum(r.lost)}</td>
      <td>${faNum(r.gf)}</td><td>${faNum(r.ga)}</td><td><b>${faNum(r.pts)}</b></td></tr>`).join('')}
  </table>`;
}

/* ---------- تب «لیگ رفقا» ---------- */
function renderAsyncLeague(){
  const L = state.asyncLeague;
  const payload = L ? decodeLeagueCode(L.code) : null;
  if(L && !payload){
    return `<div class="card glass"><h2><span class="dot"></span>لیگ رفقا${infoBtn('asyncLeague')}</h2>
      <div class="empty">کد لیگ ذخیره‌شده خراب شده است.</div>
      <button class="btn ghost" style="width:100%; margin-top:8px;" onclick="leaveAsyncLeague()">حذف لیگ و شروع دوباره</button></div>`;
  }
  if(!payload) return leagueSetupHtml();

  const results = asyncLeagueResults();
  const table = leagueTable(payload, results);
  const round = leagueNextRound(payload, results);
  const totalRounds = leagueRoundCount(payload);
  const playedRounds = round === null ? totalRounds : round;
  const me = asyncLeagueUserIndex(payload);
  const verify = verifyLeagueResults(payload, results);
  const roundsHtml = leagueFixtures(payload).map((pairs, r)=>{
    const done = leagueRoundDone(payload, results, r);
    const isNext = r === round;
    return `<div class="al-round ${done?'done':''} ${isNext?'next':''}">
      <div class="al-round-h"><span>دور ${faNum(r+1)}</span>
        <span class="muted" style="font-size:0.7rem;">${done ? '✅ بازی‌شده' : (isNext ? 'نوبت بعدی' : 'در انتظار')}</span></div>
      ${pairs.map(([hi,ai])=>{
        const k = leagueKey(r, hi, ai);
        const res = results[k];
        const mine = hi === me || ai === me;
        return `<div class="al-match ${mine?'mine':''}" ${res?`onclick="watchLeagueMatch('${k}')"`:''}>
          <span>${escapeHtml(payload.m[hi].c)} <span class="muted">-</span> ${escapeHtml(payload.m[ai].c)}</span>
          <b>${res ? `${faNum(res.h)} - ${faNum(res.a)}` : '<span class="muted">—</span>'}</b></div>`;
      }).join('')}
    </div>`;
  }).join('');

  return `
  <div class="card glass">
    <h2><span class="dot"></span>لیگ رفقا — ${escapeHtml(payload.n)}${infoBtn('asyncLeague')}</h2>
    <div class="row"><span>تیم‌ها</span><b>${faNum(payload.m.length)}</b></div>
    <div class="row"><span>پیشرفت</span><b>${faNum(playedRounds)} از ${faNum(totalRounds)} دور</b></div>
    <div class="row"><span>جای تو</span><b>${me >= 0 ? faNum(table[me] ? table[me].rank : me+1) + ' از ' + faNum(payload.m.length) : '—'}</b></div>
    ${round === null
      ? `<div class="empty" style="color:var(--amber);">🏁 لیگ تمام شد! ${table[0] ? `قهرمان: ${escapeHtml(table[0].name)}` : ''}</div>`
      : `<button class="btn primary" style="width:100%; margin-top:8px;" onclick="playNextLeagueRound()">بازی دور ${faNum(round+1)} ⚽</button>`}
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn ghost small" style="flex:1;" onclick="shareLeagueCode()">ارسال کد لیگ</button>
      <button class="btn ghost small" style="flex:1;" onclick="refreshMyTeamInLeague()">به‌روزرسانی تیم من</button>
    </div>
    ${verify.bad.length
      ? `<div class="muted" style="font-size:0.7rem; margin-top:8px; color:var(--red);">⚠ ${faNum(verify.bad.length)} نتیجه با وضعیت فعلی تیم‌ها بازتولید نشد (طبیعی است اگر بعد از آن مسابقه ترکیب عوض شده باشد).</div>`
      : `<div class="muted" style="font-size:0.7rem; margin-top:8px; color:var(--emerald);">✅ همه‌ی ${faNum(verify.total)} نتیجه از روی seed بازتولید و تأیید شد.</div>`}
  </div>

  <div class="card glass">
    <h2><span class="dot"></span>جدول لیگ رفقا</h2>
    ${leagueTableHtml(payload, table)}
  </div>

  <div class="card glass">
    <h2><span class="dot"></span>برنامه و نتایج</h2>
    ${roundsHtml}
    <button class="btn ghost" style="width:100%; margin-top:10px;" onclick="leaveAsyncLeague()">خروج از لیگ</button>
  </div>`;
}

/* ---------- صفحه‌ی ساخت / پیوستن ---------- */
function leagueSetupHtml(){
  return `
  <div class="card glass">
    <h2><span class="dot"></span>لیگ رفقا (بدون سرور)${infoBtn('asyncLeague')}</h2>
    <p class="muted" style="font-size:0.76rem; line-height:1.9;">
      با ۱ تا ۱۱ رفیق یک لیگ کامل بساز: هر کس با تیم خودش، همه یک جدول.
      کافی است کد تیم رفقا را بگیری و اینجا بچسبانی؛ بقیه‌اش خودکار است — <b>بدون ثبت‌نام، بدون سرور</b>.
    </p>
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:10px;">۱) اسم لیگ</label>
    <input id="alName" placeholder="مثلاً: لیگ محله" maxlength="26" style="margin-top:4px;">
    <label class="muted" style="font-size:0.72rem; display:block; margin-top:12px;">۲) کد تیم رفقا (هر خط یک کد — از «بازی دوستانه با کد چالش» می‌گیری)</label>
    <textarea id="alCodes" placeholder="کد رفیق اول...&#10;کد رفیق دوم..." style="min-height:90px; font-size:0.62rem; direction:ltr; margin-top:4px;"></textarea>
    <button class="btn primary" style="width:100%; margin-top:10px;" onclick="createLeagueFromForm()">ساخت لیگ ⚽</button>
    <div style="display:flex; gap:8px; margin-top:8px;">
      <button class="btn ghost small" style="flex:1;" onclick="copyTextToClipboard(makeChallengeCode(), 'کد تیمت کپی شد — برای رفقا بفرست ✅')">کپی کد تیم من</button>
      <button class="btn ghost small" style="flex:1;" onclick="openJoinLeague()">وارد کردن کد لیگ 🔗</button>
    </div>
    <p class="muted" style="font-size:0.68rem; margin-top:12px; line-height:1.8;">
      میزبان لیگ می‌شود هر کسی که همه‌ی کدها را دارد. بعد از ساخت، «کد لیگ» را برای رفقا بفرست تا همان لیگ و همان جدول را ببینند.
    </p>
  </div>`;
}
function createLeagueFromForm(){
  const name = (document.getElementById('alName') || {}).value || '';
  const raw = (document.getElementById('alCodes') || {}).value || '';
  const codes = raw.split(/\s+/).map(s=>s.trim()).filter(s=>s.length > 8);
  startAsyncLeague(name, codes);
}
function openJoinLeague(){
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" style="max-width:520px;" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>وارد کردن کد لیگ</h2>
        <p class="muted" style="font-size:0.74rem; line-height:1.9;">کد لیگی که میزبان برایت فرستاده را بچسبان تا همان لیگ و همان جدول را ببینی.</p>
        <textarea id="alJoinCode" placeholder="کد لیگ..." style="min-height:90px; font-size:0.62rem; direction:ltr; margin-top:8px;"></textarea>
        <button class="btn primary" style="width:100%; margin-top:10px;" onclick="joinFromModal()">ورود به لیگ</button>
        <button class="btn ghost" style="width:100%; margin-top:8px;" onclick="closeOverlay('genericModal')">بستن</button>
      </div>
    </div>`;
}
function joinFromModal(){
  const code = (document.getElementById('alJoinCode') || {}).value || '';
  joinAsyncLeague(code);
}
function shareLeagueCode(){
  const L = state.asyncLeague;
  if(!L) return;
  const payload = decodeLeagueCode(L.code);
  const text = `🏆 لیگ رفقا در «مدیر تیم»\n${payload ? payload.n : L.name} — ${payload ? faNum(payload.m.length) : ''} تیم\nکد لیگ:\n${L.code}\n\nکد را در «لیگ ← لیگ رفقا ← وارد کردن کد لیگ» بچسبان.`;
  if(navigator.share) navigator.share({ title:'لیگ رفقا', text }).catch(()=> copyTextToClipboard(L.code, 'کد لیگ کپی شد ✅'));
  else copyTextToClipboard(L.code, 'کد لیگ کپی شد ✅');
}

/* ---------- کارت داشبورد ---------- */
function asyncLeagueCardHtml(){
  const L = state.asyncLeague, payload = L ? decodeLeagueCode(L.code) : null;
  if(!payload){
    return `
    <div class="card glass">
      <h2><span class="dot"></span>لیگ با رفقا${infoBtn('asyncLeague')}</h2>
      <p class="muted" style="font-size:0.76rem; line-height:1.8;">با ۱ تا ۱۱ رفیق یک لیگ کامل بساز — هر کس با تیم خودش، همه یک جدول. بدون ثبت‌نام و سرور.</p>
      <button class="btn ghost" style="width:100%; margin-top:6px;" onclick="uiMain='league'; uiSub='async'; render();">ساخت لیگ رفقا 🏆</button>
    </div>`;
  }
  const results = asyncLeagueResults();
  const me = asyncLeagueUserIndex(payload);
  const table = leagueTable(payload, results);
  const round = leagueNextRound(payload, results);
  const myRank = me >= 0 && table[me] ? table[me].rank : null;
  return `
  <div class="card glass">
    <h2><span class="dot"></span>لیگ رفقا — ${escapeHtml(payload.n)}${infoBtn('asyncLeague')}</h2>
    <div class="row"><span>تیم‌ها</span><b>${faNum(payload.m.length)}</b></div>
    <div class="row"><span>جای تو</span><b>${myRank ? faNum(myRank) : '—'}</b></div>
    <div class="row"><span>دور بعد</span><b>${round === null ? 'تمام شد 🏁' : faNum(round+1)}</b></div>
    ${round === null ? '' : `<button class="btn primary" style="width:100%; margin-top:6px;" onclick="playNextLeagueRound()">بازی دور ${faNum(round+1)} ⚽</button>`}
    <button class="btn ghost small" style="width:100%; margin-top:8px;" onclick="uiMain='league'; uiSub='async'; render();">جدول و برنامه</button>
  </div>`;
}
