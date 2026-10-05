/* ============================================================
   server/index.js — سرور بازی «مدیر تیم» (گام ۲ برنامه‌ی آنلاین)
   ------------------------------------------------------------
   بدون هیچ وابستگی npm: فقط http/fs/crypto خود Node.
   یک فایل اجرا می‌شود و هم فایل‌های استاتیک بازی را سرو می‌کند،
   هم API را. همین سرور می‌تواند روی لیارا / آروان / هر VPS با
   Node 18+ بالا بیاید.

   اصل معماری (از PLAN-ONLINE.md):
   • سرور همان js/engine.js را اجرا می‌کند (بدون تغییر) ⇒ نتایج
     «قابل بازتولید» و در نتیجه ضدتقلب است.
   • منطق لیگ در js/league-core.js مشترک است ⇒ جدول کلاینت و سرور
     همیشه یکی است.

   اجرا:   node server/index.js        (پورت پیش‌فرض 8081)
   دمو:    DEV_OTP=1 node server/index.js  ⇒ کد ورود در پاسخ برمی‌گردد
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const store = require('./store');
const { engine, engineFingerprint } = require('./engine-node');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';
const DEV_OTP = process.env.DEV_OTP === '1' || process.env.NODE_ENV !== 'production';
const OTP_TTL = 2 * 60 * 1000;          /* ۲ دقیقه */
const TOKEN_TTL = 30 * 24 * 3600 * 1000; /* ۳۰ روز */
const MAX_SQUAD_PLAYERS = 14;

/* ---------- کمکی‌ها ---------- */
const SECRET = process.env.SECRET || 'dev-secret-change-me';
function sha(s){ return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function pepper(s){ return crypto.createHmac('sha256', SECRET).update(String(s)).digest('hex'); }
function now(){ return Date.now(); }
function rid(prefix, n){ return (prefix||'') + crypto.randomBytes(n||8).toString('hex'); }
function normPhone(p){ return String(p||'').replace(/[^\d]/g,'').replace(/^98/,'0').replace(/^0098/,'0'); }
function validPhone(p){ return /^09\d{9}$/.test(p); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function num(v, d){ const n = Number(v); return Number.isFinite(n) ? n : d; }
function sanitizeName(str, fallback, maxLen){
  let s = String(str||'').replace(/[<>"'`\\]/g,'').replace(/\s+/g,' ').trim().slice(0, maxLen||24);
  return s || fallback;
}

/* ---------- محدودیت نرخ (در حافظه) ---------- */
const rate = new Map();
function rateLimit(key, max, windowMs){
  const t = now(), arr = (rate.get(key) || []).filter(x => t - x < windowMs);
  if(arr.length >= max) return false;
  arr.push(t); rate.set(key, arr);
  return true;
}

/* ---------- پاسخ‌ها ---------- */
function sendJson(res, code, obj, extraHeaders){
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, extraHeaders || {}));
  res.end(body);
}
function readBody(req, maxBytes){
  return new Promise((resolve, reject)=>{
    let size = 0; const chunks = [];
    req.on('data', c=>{
      size += c.length;
      if(size > (maxBytes || 512*1024)){ reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', ()=>{
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

/* ---------- احراز هویت ---------- */
function currentPlayer(req){
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if(!token) return null;
  const db = store.get(), t = db.tokens[token];
  if(!t || t.exp < now()) return null;
  const p = db.players[t.phone];
  return p ? { phone: t.phone, player: p, token } : null;
}

/* ---------- OTP ---------- */
function sendOtp(phone){
  const db = store.get();
  const code = String(crypto.randomInt(10000, 99999));
  db.otps[pepper(phone)] = { code: pepper(code), exp: now() + OTP_TTL, tries: 0, sentAt: now() };
  store.save();
  const demo = { dev: DEV_OTP };
  if(DEV_OTP){ demo.code = code; console.log(`[otp] کد ورود ${phone}: ${code}`); }
  return demo;
}
/* ارسال واقعی پیامک (اختیاری): کاوه‌نگار/فراز با متغیرهای محیطی */
async function trySendSms(phone, code){
  const key = process.env.SMS_API_KEY;
  if(!key) return false;
  try{
    const url = `https://api.kavenegar.com/v1/${key}/verify/lookup.json?receptor=${encodeURIComponent(phone)}&token=${code}&template=${encodeURIComponent(process.env.SMS_TEMPLATE||'football-login')}`;
    const r = await fetch(url);
    return r.ok;
  }catch(e){ console.error('[sms] ارسال ناموفق:', e.message); return false; }
}

/* ---------- اسکواد ⇒ ورودی موتور (با کنترل صحت) ---------- */
/* اعداد اعلامی کلاینت پذیرفته می‌شوند ولی داخل محدوده‌ی «معقولِ» بازیکنانش
   نگه داشته می‌شوند ⇒ تقلب با بالا بردن atk بی‌فایده است */
function squadToSide(sq){
  const players = (sq.players || []).slice(0, MAX_SQUAD_PLAYERS).map((p, i)=>({
    id: 'srv_' + String(p.id || i).slice(0, 24),
    name: String(p.name || ('بازیکن ' + (i+1))).slice(0, 30),
    pos: ['GK','DF','MF','FW'].includes(p.pos) ? p.pos : 'MF',
    attack: clamp(num(p.attack, 60), 20, 99)
  }));
  if(players.length < 8) throw new Error('اسکواد ناقص است');
  const atks = players.map(p=>p.attack);
  const avgA = atks.reduce((a,b)=>a+b,0)/atks.length, maxA = Math.max.apply(null, atks);
  const atk = clamp(num(sq.atk, avgA), avgA*0.85, maxA*1.15 + 6);
  const def = clamp(num(sq.def, avgA), avgA*0.75, maxA*1.05 + 6);
  return {
    name: sanitizeName(sq.clubName, 'باشگاه', 22),
    atk: Math.round(atk), def: Math.round(def),
    fitness: clamp(num(sq.fitness, 90), 30, 100),
    stamina: clamp(num(sq.stamina, 76), 30, 100),
    morale: clamp(num(sq.morale, 74), 20, 100),
    players
  };
}

/* ---------- لیگ سروری ---------- */
function leagueFixturesOf(league){ return require('../js/league-core.js').leagueFixturesFromCount(league.members.length); }
function leagueNamesOf(league){ return league.members.map(m=>m.clubName); }
function leagueIdOf(league){ return require('../js/league-core.js').leagueIdFromNames(league.name, leagueNamesOf(league)); }

function simulateLeagueRound(league, round){
  const core = require('../js/league-core.js');
  const fixtures = core.leagueFixturesFromCount(league.members.length);
  const pairs = fixtures[round] || [];
  const db = store.get();
  const out = [];
  pairs.forEach(([hi, ai])=>{
    const A = league.members[hi], B = league.members[ai];
    const key = core.leagueKeyOf(round, hi, ai);
    if(league.results[key]){ out.push({ key, round, hi, ai, cached:true, result: league.results[key] }); return; }
    const seed = core.leagueSeedFrom(league.id, round, A.clubName, B.clubName);
    const report = engine.simulateMatchEngine(squadToSide(A.squad), squadToSide(B.squad), { seed });
    report.id = 'lg_' + league.id.slice(0,8) + '_' + round + '_' + hi + '_' + ai;
    report.competition = 'server-league';
    report.round = round;
    db.matches[report.id] = report;
    const result = { h: report.homeGoals, a: report.awayGoals, s: seed, hi, ai, r: round, verified: true };
    league.results[key] = result;
    out.push({ key, round, hi, ai, result, reportId: report.id });
  });
  store.save();
  return out;
}
function leagueTableView(league){
  const core = require('../js/league-core.js');
  return core.leagueTableFromNames(leagueNamesOf(league), league.results);
}

/* ============================================================
   روتینگ API
   ============================================================ */
async function handleApi(req, res, u){
  const p = u.pathname;
  const db = store.get();

  /* --- سلامت و انگشت موتور --- */
  if(p === '/api/health'){
    return sendJson(res, 200, {
      ok: true, name: 'مدیر تیم — سرور گام ۲', time: new Date().toISOString(),
      engine: engine.ENGINE_VERSION, fingerprint: engineFingerprint(),
      dev: DEV_OTP, rate: { otpMax: 5, verifyMax: 10 }
    });
  }
  if(p === '/api/engine-fingerprint'){
    return sendJson(res, 200, { version: engine.ENGINE_VERSION, fingerprint: engineFingerprint() });
  }

  /* --- ورود با کد یک‌بارمصرف --- */
  if(p === '/api/auth/otp' && req.method === 'POST'){
    const body = await readBody(req);
    const phone = normPhone(body.phone);
    if(!validPhone(phone)) return sendJson(res, 400, { error: 'شماره‌ی موبایل نامعتبر است (مثل ۰۹۱۲۳۴۵۶۷۸۹).' });
    if(!rateLimit('otp:' + phone, 5, 10*60*1000)) return sendJson(res, 429, { error: 'درخواست زیاد؛ چند دقیقه بعد امتحان کن.' });
    const info = sendOtp(phone);
    const smsSent = await trySendSms(phone, info.code || '');
    return sendJson(res, 200, { ok: true, ttl: OTP_TTL/1000, dev: !!info.dev, code: info.code, sms: smsSent });
  }
  if(p === '/api/auth/verify' && req.method === 'POST'){
    const body = await readBody(req);
    const phone = normPhone(body.phone), code = String(body.code || '').replace(/\D/g,'');
    if(!validPhone(phone) || code.length !== 5) return sendJson(res, 400, { error: 'شماره یا کد نامعتبر است.' });
    if(!rateLimit('verify:' + phone, 10, 10*60*1000)) return sendJson(res, 429, { error: 'تلاش زیاد؛ کمی بعد امتحان کن.' });
    const rec = db.otps[pepper(phone)];
    if(!rec) return sendJson(res, 400, { error: 'اول کد ورود بگیر.' });
    if(rec.exp < now()){ delete db.otps[pepper(phone)]; return sendJson(res, 400, { error: 'کد منقضی شده؛ کد تازه بگیر.' }); }
    rec.tries = (rec.tries||0) + 1;
    if(rec.tries > 6){ delete db.otps[pepper(phone)]; store.save(); return sendJson(res, 429, { error: 'تلاش زیاد؛ کد تازه بگیر.' }); }
    if(rec.code !== pepper(code)){ store.save(); return sendJson(res, 400, { error: 'کد اشتباه است.' }); }
    delete db.otps[pepper(phone)];
    let player = db.players[pepper(phone)];
    if(!player){
      player = { phone, clubName: sanitizeName(body.clubName, 'باشگاه من', 22), createdAt: now(), squad: null, leagueIds: [] };
      db.players[pepper(phone)] = player;
    }
    player.lastSeen = now();
    const token = rid('t', 24);
    db.tokens[token] = { phone: pepper(phone), exp: now() + TOKEN_TTL };
    store.save();
    return sendJson(res, 200, { ok: true, token, player: publicPlayer(player), expiresIn: TOKEN_TTL/1000 });
  }

  /* --- من --- */
  if(p === '/api/me'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    s.player.lastSeen = now(); store.save();
    const leagues = (s.player.leagueIds||[]).map(id=>{
      const L = db.leagues[id];
      if(!L) return null;
      const core = require('../js/league-core.js');
      return { id, name: L.name, members: L.members.length,
        nextRound: core.leagueNextRoundFrom(L.members.length, L.results),
        isOwner: L.ownerPhone === s.phone, joined: true };
    }).filter(Boolean);
    return sendJson(res, 200, { player: publicPlayer(s.player), leagues, engine: engine.ENGINE_VERSION });
  }

  /* --- آپلود ترکیب/اسکواد --- */
  if(p === '/api/squad' && req.method === 'POST'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    const body = await readBody(req);
    const slots = Array.isArray(body.slots) ? body.slots.filter(Boolean).slice(0, 11) : [];
    if(slots.length !== 11) return sendJson(res, 400, { error: 'ترکیب باید ۱۱ بازیکن داشته باشد.' });
    if(!Array.isArray(body.players) || body.players.length < 11) return sendJson(res, 400, { error: 'فهرست بازیکنان ناقص است.' });
    const ids = new Set(body.players.map(x=>String(x.id)));
    if(!slots.every(id=>ids.has(String(id)))) return sendJson(res, 400, { error: 'یکی از بازیکنان ترکیب در فهرست نیست.' });
    if(new Set(slots.map(String)).size !== 11) return sendJson(res, 400, { error: 'یک بازیکن نمی‌تواند دو جای ترکیب باشد.' });
    const formation = sanitizeName(body.formation, '4-4-2', 8);
    const squad = {
      clubName: sanitizeName(body.clubName, s.player.clubName, 22),
      formation, style: sanitizeName(body.style, 'balanced', 14),
      captainId: body.captainId ? String(body.captainId) : null,
      atk: num(body.atk, 60), def: num(body.def, 60),
      fitness: num(body.fitness, 90), stamina: num(body.stamina, 76), morale: num(body.morale, 74),
      players: body.players.slice(0, MAX_SQUAD_PLAYERS).map(x=>({
        id: String(x.id).slice(0, 24), name: String(x.name||'').slice(0, 30),
        pos: ['GK','DF','MF','FW'].includes(x.pos) ? x.pos : 'MF',
        attack: clamp(num(x.attack, 60), 20, 99)
      })),
      slots: slots.map(String), uploadedAt: now()
    };
    s.player.squad = squad;
    s.player.clubName = squad.clubName;
    /* اسکواد در لیگ‌هایی که عضو است هم به‌روز می‌شود (ترکیب قفل‌شده‌ی لیگ) */
    (s.player.leagueIds||[]).forEach(id=>{
      const L = db.leagues[id]; if(!L) return;
      const m = L.members.find(x=>x.phone === s.phone);
      if(m) m.squad = squad;
    });
    store.save();
    return sendJson(res, 200, { ok: true, squad: { clubName: squad.clubName, formation, players: squad.players.length } });
  }

  /* --- ساخت لیگ سروری --- */
  if(p === '/api/leagues' && req.method === 'POST'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    if(!s.player.squad) return sendJson(res, 400, { error: 'اول ترکیبت را آپلود کن (POST /api/squad).' });
    const body = await readBody(req);
    const name = sanitizeName(body.name, 'لیگ دوستان', 26);
    const id = rid('L', 6);
    const league = {
      id, name, ownerPhone: s.phone, createdAt: now(),
      members: [{ phone: s.phone, clubName: s.player.squad.clubName, squad: s.player.squad }],
      results: {}, week: 0
    };
    db.leagues[id] = league;
    if(!s.player.leagueIds) s.player.leagueIds = [];
    s.player.leagueIds.push(id);
    store.save();
    return sendJson(res, 201, { ok: true, league: leagueView(league, s.phone) });
  }
  /* --- ورود به لیگ با شناسه --- */
  const joinMatch = p.match(/^\/api\/leagues\/([A-Za-z0-9]+)\/join$/);
  if(joinMatch && req.method === 'POST'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    if(!s.player.squad) return sendJson(res, 400, { error: 'اول ترکیبت را آپلود کن.' });
    const L = db.leagues[joinMatch[1]];
    if(!L) return sendJson(res, 404, { error: 'لیگ پیدا نشد.' });
    if(L.members.length >= 12) return sendJson(res, 400, { error: 'لیگ پر است (حداکثر ۱۲ تیم).' });
    if(L.members.some(m=>m.phone === s.phone)) return sendJson(res, 400, { error: 'قبلاً عضو این لیگی.' });
    if(Object.keys(L.results).length) return sendJson(res, 400, { error: 'لیگ شروع شده؛ ورود تیم جدید ممکن نیست.' });
    L.members.push({ phone: s.phone, clubName: s.player.squad.clubName, squad: s.player.squad });
    if(!s.player.leagueIds) s.player.leagueIds = [];
    s.player.leagueIds.push(L.id);
    store.save();
    return sendJson(res, 200, { ok: true, league: leagueView(L, s.phone) });
  }
  /* --- مشاهده‌ی لیگ --- */
  const getMatch = p.match(/^\/api\/leagues\/([A-Za-z0-9]+)$/);
  if(getMatch && req.method === 'GET'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    const L = db.leagues[getMatch[1]];
    if(!L) return sendJson(res, 404, { error: 'لیگ پیدا نشد.' });
    return sendJson(res, 200, { league: leagueView(L, s.phone), fingerprint: engineFingerprint() });
  }
  /* --- شبیه‌سازی دور جاری (سرور، معتبر) --- */
  const simMatch = p.match(/^\/api\/leagues\/([A-Za-z0-9]+)\/simulate$/);
  if(simMatch && req.method === 'POST'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    const L = db.leagues[simMatch[1]];
    if(!L) return sendJson(res, 404, { error: 'لیگ پیدا نشد.' });
    if(L.members.length < 2) return sendJson(res, 400, { error: 'برای شبیه‌سازی حداقل ۲ تیم لازم است.' });
    const core = require('../js/league-core.js');
    const round = core.leagueNextRoundFrom(L.members.length, L.results);
    if(round === null) return sendJson(res, 200, { ok: true, done: true, league: leagueView(L, s.phone) });
    const matches = simulateLeagueRound(L, round);
    L.week = round + 1;
    store.save();
    return sendJson(res, 200, { ok: true, round, matches: matches.map(m=>({ key:m.key, home:leagueNamesOf(L)[m.hi], away:leagueNamesOf(L)[m.ai], result:m.result, reportId:m.reportId })),
      league: leagueView(L, s.phone) });
  }
  /* --- تأیید نتیجه‌ی اعلامی کلاینت (ضدتقلب) --- */
  const vMatch = p.match(/^\/api\/leagues\/([A-Za-z0-9]+)\/verify$/);
  if(vMatch && req.method === 'POST'){
    const s = currentPlayer(req);
    if(!s) return sendJson(res, 401, { error: 'ابتدا وارد شو.' });
    const L = db.leagues[vMatch[1]];
    if(!L) return sendJson(res, 404, { error: 'لیگ پیدا نشد.' });
    const body = await readBody(req);
    const round = num(body.round, -1), homeGoals = num(body.homeGoals, -1), awayGoals = num(body.awayGoals, -1);
    const hi = num(body.hi, -1), ai = num(body.ai, -1);
    const core = require('../js/league-core.js');
    if(hi < 0 || ai < 0 || hi >= L.members.length || ai >= L.members.length || hi === ai)
      return sendJson(res, 400, { error: 'اندیس تیم‌ها نامعتبر است.' });
    const A = L.members[hi], B = L.members[ai];
    const seed = core.leagueSeedFrom(L.id, round, A.clubName, B.clubName);
    const report = engine.simulateMatchEngine(squadToSide(A.squad), squadToSide(B.squad), { seed });
    const ok = report.homeGoals === homeGoals && report.awayGoals === awayGoals;
    if(!ok) return sendJson(res, 200, { verified: false, server: { h: report.homeGoals, a: report.awayGoals }, seed, error: 'اختلاف نتیجه؛ سرور نتیجه را رد کرد.' });
    gradeResult(L, round, hi, ai, report, seed);
    store.save();
    return sendJson(res, 200, { verified: true, server: { h: report.homeGoals, a: report.awayGoals }, seed, league: leagueView(L, s.phone) });
  }

  /* --- گزارش یک مسابقه --- */
  const rMatch = p.match(/^\/api\/matches\/([A-Za-z0-9_]+)$/);
  if(rMatch && req.method === 'GET'){
    const r = db.matches[rMatch[1]];
    if(!r) return sendJson(res, 404, { error: 'گزارش پیدا نشد.' });
    return sendJson(res, 200, { report: r });
  }

  return sendJson(res, 404, { error: 'این مسیر API وجود ندارد.', path: p });
}
function gradeResult(L, round, hi, ai, report, seed){
  const core = require('../js/league-core.js');
  const key = core.leagueKeyOf(round, hi, ai);
  L.results[key] = { h: report.homeGoals, a: report.awayGoals, s: seed, hi, ai, r: round, verified: true };
  return L.results[key];
}
function publicPlayer(p){
  return { clubName: p.clubName, phone: p.phone, createdAt: p.createdAt, lastSeen: p.lastSeen,
    hasSquad: !!p.squad, leagues: (p.leagueIds||[]).length };
}
function leagueView(L, phone){
  const core = require('../js/league-core.js');
  const names = leagueNamesOf(L);
  const next = core.leagueNextRoundFrom(L.members.length, L.results);
  const table = core.leagueTableFromNames(names, L.results);
  return {
    id: L.id, name: L.name, teams: names.length, names,
    week: L.week, nextRound: next,
    totalRounds: core.leagueRoundCountFromCount(L.members.length),
    fixtures: core.leagueFixturesFromCount(L.members.length),
    results: L.results, table,
    members: L.members.map(m=>({ clubName: m.clubName, hasSquad: !!m.squad, isMe: m.phone === phone })),
    isOwner: L.ownerPhone === phone,
    point: 'سرور خودش موتور را اجرا می‌کند؛ نتیجه‌ی اعلامی کلاینت فقط با بازتولید تأیید می‌شود.'
  };
}

/* ============================================================
   فایل‌های استاتیک + صفحه‌ی وضعیت
   ============================================================ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};
function serveStatic(req, res, u){
  let rel = decodeURIComponent(u.pathname);
  if(rel === '/') rel = '/index.html';
  if(rel === '/server') return statusPage(res);
  const abs = path.normalize(path.join(ROOT, rel));
  if(!abs.startsWith(ROOT) || abs.includes(path.join(ROOT, 'server-data')) || abs.includes(path.join(ROOT, '.git')))
    return sendJson(res, 403, { error: 'دسترسی مجاز نیست.' });
  fs.stat(abs, (err, st)=>{
    if(err || !st.isFile()) return sendJson(res, 404, { error: 'پیدا نشد.' });
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
      'Content-Length': st.size
    });
    fs.createReadStream(abs).pipe(res);
  });
}
function statusPage(res){
  const s = store.stats(), fp = engineFingerprint();
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>سرور مدیر تیم — وضعیت</title>
<style>
 body{background:#07150d;color:#e8f5ec;font-family:Tahoma,system-ui,sans-serif;margin:0;padding:24px;line-height:1.9}
 .card{max-width:620px;margin:0 auto;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.10);border-radius:16px;padding:20px}
 h1{font-size:1.1rem;margin:0 0 12px} code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;direction:ltr;display:inline-block}
 .row{display:flex;justify-content:space-between;border-bottom:1px dashed rgba(255,255,255,.08);padding:6px 0;font-size:.85rem}
 .ok{color:#34d399}.muted{color:#9fb3a8;font-size:.78rem}
 button{background:#22d3ee;color:#04222a;border:0;border-radius:12px;padding:8px 14px;font-weight:700;cursor:pointer;font-family:inherit}
</style></head><body><div class="card">
<h1>🟢 سرور «مدیر تیم» بالاست — گام ۲</h1>
<div class="row"><span>نسخه‌ی موتور</span><b>${fp.version}</b></div>
<div class="row"><span>اثر انگشت موتور</span><code>${fp.homeGoals}-${fp.awayGoals} · شوت ${JSON.stringify(fp.shots)} · مالکیت ${JSON.stringify(fp.possession)}</code></div>
<div class="row"><span>ورود با کد (حالت دمو)</span><b class="${DEV_OTP?'ok':''}">${DEV_OTP?'فعال — کد در پاسخ API':'غیرفعال (پیامک واقعی)'}</b></div>
<div class="row"><span>بازیکن‌ها / لیگ‌ها / مسابقات</span><b>${s.players} / ${s.leagues} / ${s.matches}</b></div>
<div class="row"><span>محل داده</span><code>${s.storage.replace(ROOT,'')}</code></div>
<p class="muted">این سرور همان <code>js/engine.js</code> کلاینت را اجرا می‌کند؛ پس هر نتیجه‌ای که اعلام شود،
سرور می‌تواند آن را بازتولید و تأیید (یا رد) کند. منطق لیگ هم از <code>js/league-core.js</code> مشترک است.</p>
<p><a href="/"><button>رفتن به بازی</button></a></p>
</div></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

/* ============================================================
   سرور
   ============================================================ */
const server = http.createServer(async (req, res)=>{
  const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  try{
    if(u.pathname.startsWith('/api/')) return await handleApi(req, res, u);
    return serveStatic(req, res, u);
  }catch(e){
    console.error('[error]', req.method, u.pathname, e.message);
    return sendJson(res, 400, { error: e.message === 'body too large' ? 'درخواست بزرگ است.' : 'درخواست نامعتبر است.' });
  }
});

if(require.main === module){
  server.listen(PORT, HOST, ()=>{
    const fp = engineFingerprint();
    console.log(`⚽ سرور «مدیر تیم» روی http://${HOST}:${PORT} بالاست`);
    console.log(`   موتور v${fp.version} · اثر انگشت ${fp.homeGoals}-${fp.awayGoals}`);
    console.log(`   حالت کد ورود: ${DEV_OTP ? 'دمو (کد در پاسخ API برمی‌گردد)' : 'پیامک واقعی'}`);
    console.log(`   داده: ${store.DB_PATH}`);
  });
}

module.exports = { server, squadToSide, leagueView, handleApi };
