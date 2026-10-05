/* ============================================================
   server/engine-node.js — پل موتور: همان js/engine.js کلاینت
   ------------------------------------------------------------
   هیچ تغییری در موتور کلاینت داده نمی‌شود؛ فقط همان فایل خوانده
   و در یک scope ایزوله اجرا می‌شود. نتیجه: سرور و کلاینت همیشه
   یک موتور دارند ⇒ نتیجه‌ی سرور قابل بازتولید روی دستگاه‌ها و
   برعکس. (این پایه‌ی ضدتقلب است.)
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ENGINE_PATH = path.join(ROOT, 'js', 'engine.js');

function loadEngine(){
  const src = fs.readFileSync(ENGINE_PATH, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    src + '\n;globalThis.__engineExports = { simulateMatchEngine, reproduceReport, engineHash, ENGINE_VERSION, ENGINE_HOME_ADV };',
    sandbox,
    { filename: 'js/engine.js' }
  );
  const api = sandbox.__engineExports;
  if(!api || typeof api.simulateMatchEngine !== 'function'){
    throw new Error('موتور بازی بارگذاری نشد: js/engine.js');
  }
  return api;
}

const engine = loadEngine();

/* امضای انگشت موتور: برای اطمینان از اینکه سرور و کلاینت یک نسخه‌اند */
function engineFingerprint(){
  const side = (name, atk)=>{
    const pos = ['GK','DF','DF','DF','DF','MF','MF','MF','MF','FW','FW'];
    return {
      name, atk, def: atk - 4, fitness: 88, stamina: 76, morale: 74,
      players: pos.map((p,i)=>({ id:'fp'+i, name:name+' '+(i+1), pos:p, attack: 55 + ((i*7)%20) }))
    };
  };
  const r = engine.simulateMatchEngine(side('سرور', 70), side('کلاینت', 66), { seed: 'fingerprint-v1' });
  return { version: engine.ENGINE_VERSION, homeGoals: r.homeGoals, awayGoals: r.awayGoals,
    shots: r.stats.shots, /**/ possession: r.stats.possession, best: r.bestPlayer ? r.bestPlayer.name : null };
}

module.exports = { engine, engineFingerprint, ENGINE_PATH };
