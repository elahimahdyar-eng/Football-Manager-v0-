/* ============================================================
   util.js — ابزارهای عمومی: پیام، مودال، تأییدیه، اعداد، poisson
   ============================================================ */

/* ================= OVERLAY / TOAST HELPERS ================= */
function closeOverlay(containerId, e){
  if(e && e.target && !e.target.classList.contains('modal-bg')) return;
  const el = document.getElementById(containerId);
  if(!el) return;
  const bg = el.querySelector('.modal-bg');
  if(bg){ bg.classList.add('closing'); setTimeout(()=>{ el.innerHTML=''; }, 190); }
  else el.innerHTML='';
}
function closeAllOverlays(){ ['matchModal','pickerModal','genericModal'].forEach(id=>closeOverlay(id)); }

/* بستن مودال‌ها با کلید Esc */
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeAllOverlays(); });

function showToast(msg, type){
  const root = document.getElementById('toastRoot');
  const div = document.createElement('div');
  div.className = 'toast' + (type ? ' '+type : '');
  div.textContent = msg;
  root.appendChild(div);
  setTimeout(()=>{ div.remove(); }, 3000);
}
function confettiHtml(count){
  let s='';
  const colors=['#22d3ee','#34d399','#fbbf24','#f4614f','#7c5cff'];
  for(let i=0;i<count;i++){
    s += `<span class="confetti-piece" style="left:${rnd(0,96)}%; animation-delay:${(Math.random()*0.5).toFixed(2)}s; background:${pick(colors)};"></span>`;
  }
  return s;
}

/* ================= تأییدیه سفارشی (بدون confirm مرورگر) ================= */
let _confirmCb = null;
function askConfirm(opts){
  const o = Object.assign({title:'مطمئنی؟', body:'', yes:'بله', no:'انصراف', danger:false}, opts||{});
  _confirmCb = o.onYes || null;
  document.getElementById('genericModal').innerHTML = `
    <div class="modal-bg" onclick="closeOverlay('genericModal', event)">
      <div class="modal glass" onclick="event.stopPropagation()">
        <h2><span class="dot"></span>${o.title}</h2>
        ${o.body ? `<p style="font-size:0.85rem; line-height:1.9;">${o.body}</p>` : ''}
        <div style="display:flex; gap:8px; margin-top:16px;">
          <button class="btn ${o.danger?'danger':'primary'}" style="flex:1;" onclick="_confirmRun()">${o.yes}</button>
          <button class="btn ghost" style="flex:1;" onclick="closeOverlay('genericModal')">${o.no}</button>
        </div>
      </div>
    </div>`;
}
function _confirmRun(){
  const cb = _confirmCb; _confirmCb = null;
  closeOverlay('genericModal');
  if(typeof cb === 'function') cb();
}

/* ================= UTIL ================= */
function rnd(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick(arr){ return arr[rnd(0,arr.length-1)]; }
function uid(){ return 'p'+Math.random().toString(36).slice(2,10); }
function fmtMoney(n){
  const v = Math.round(Number(n)||0);
  return (v<0?'−':'') + Math.abs(v).toLocaleString('fa-IR') + " م.ت";
}
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
/* عدد فارسی (برای شمارنده‌ها و دقیقه‌ی مسابقه) */
function faNum(n){ return (Number(n)||0).toLocaleString('fa-IR'); }
function poisson(lambda){ const L=Math.exp(-lambda); let k=0,p=1; do{ k++; p*=Math.random(); }while(p>L); return k-1; }
/* جلوگیری از تزریق HTML از طریق نام باشگاه/مدیر */
function escapeHtml(str){
  return String(str===undefined||str===null?'':str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
/* پاک‌سازی نام ورودی کاربر: حذف تگ‌ها، فاصله‌های اضافه و محدودیت طول */
function sanitizeName(str, fallback, maxLen){
  let s = String(str||'').replace(/[<>"'`\\]/g,'').replace(/\s+/g,' ').trim();
  s = s.slice(0, maxLen||24);
  return s || fallback;
}
function avgOf(arr, fn){ return arr.length ? arr.reduce((s,x)=>s+fn(x),0)/arr.length : 0; }

/* ================= base64-url (برای «کد چالش» و اشتراک‌گذاری) ================= */
function b64urlEncode(str){
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  bytes.forEach(b=>{ bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(code){
  const b64 = String(code).trim().replace(/-/g,'+').replace(/_/g,'/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function copyTextToClipboard(txt, okMsg){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(
      ()=>showToast(okMsg || 'کپی شد ✅', 'success'),
      ()=>showToast('کپی خودکار نشد؛ دستی انتخاب کن.')
    );
  } else showToast('مرورگر از کپی خودکار پشتیبانی نمی‌کند.');
}
