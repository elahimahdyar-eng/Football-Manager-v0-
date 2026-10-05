/* ============================================================
   server/store.js — ذخیره‌سازی ساده و مطمئن روی دیسک (JSON)
   ------------------------------------------------------------
   برای گام ۲ عمداً از هیچ دیتابیسی استفاده نمی‌کنیم:
   یک فایل JSON با نوشتن اتمیک (tmp + rename) کافی است و
   روی هر هاست ارزانی (لیارا/آروان/حتی رایگان) کار می‌کند.
   مهاجرت به Postgres در گام ۳ فقط جایگزینی همین فایل است.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'server-data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const EPOCH = { version: 1, players: {}, tokens: {}, otps: {}, leagues: {}, matches: {} };

let db = null;
let writeQueued = false;

function ensureDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function load(){
  if(db) return db;
  ensureDir();
  try{
    if(fs.existsSync(DB_PATH)) db = Object.assign({}, EPOCH, JSON.parse(fs.readFileSync(DB_PATH, 'utf8')));
    else db = JSON.parse(JSON.stringify(EPOCH));
  }catch(e){
    console.error('[store] فایل داده خراب است، نسخه‌ی پشتیبان گرفته می‌شود:', e.message);
    try{ fs.renameSync(DB_PATH, DB_PATH + '.broken-' + Date.now()); }catch(_){}
    db = JSON.parse(JSON.stringify(EPOCH));
  }
  Object.keys(EPOCH).forEach(k=>{ if(db[k] === undefined) db[k] = JSON.parse(JSON.stringify(EPOCH[k])); });
  return db;
}
/* نوشتن اتمیک + عقب‌انداختن (debounce) تا درخواست‌های پشت‌سرهم دیسک را اذیت نکنند */
function flush(){
  if(!db) return;
  ensureDir();
  const tmp = DB_PATH + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_PATH);
}
function save(){
  if(writeQueued) return;
  writeQueued = true;
  setTimeout(()=>{ writeQueued = false; try{ flush(); }catch(e){ console.error('[store] ذخیره ناموفق:', e.message); } }, 40);
}
function saveNow(){ try{ flush(); }catch(e){ console.error('[store] ذخیره ناموفق:', e.message); } }
function get(){ return load(); }
function reset(){ db = JSON.parse(JSON.stringify(EPOCH)); saveNow(); }

/* آمار کلی برای /api/health */
function stats(){
  const d = load();
  return {
    players: Object.keys(d.players).length,
    leagues: Object.keys(d.leagues).length,
    matches: Object.keys(d.matches).length,
    storage: DB_PATH
  };
}

process.on('SIGTERM', ()=>{ saveNow(); process.exit(0); });
process.on('SIGINT',  ()=>{ saveNow(); process.exit(0); });

module.exports = { get, save, saveNow, reset, stats, DB_PATH };
