/* ============================================================
   assets.js — کیت تصویری بازی (چهره‌ی واقع‌گرای بازیکن + پیراهن + آرم)
   ------------------------------------------------------------
   چرا این فایل؟
   • چهره‌ی بازیکن مهم‌ترین چیز بصری در بازی‌های مدیریتی است؛
     بازی‌های مرجع (Top Eleven / OSM / FM) همه پرتره‌ی واقعی دارند.
   • اینجا ۱۰ پرتره‌ی استودیوییِ حرفه‌ای (assets/faces) داریم و
     «انتخاب چهره» کاملاً قطعی است: هر شناسه/نام همیشه یک چهره‌ی
     ثابت می‌گیرد ⇒ هم بین دستگاه‌ها یکسان است، هم روی سرور
     قابل بازتولید (فقط هش لازم است، نه تصویر).
   • برای موبایل: نسخه‌ی بندانگشتی (thumbs) برای فهرست‌ها، نسخه‌ی
     بزرگ فقط برای پروفایل بازیکن و پخش زنده.
   ============================================================ */

/* ---------- هش پایه (هم‌الگوریتم با svg.js و موتور) ---------- */
function assetHash(str){
  if(typeof hashSeed === 'function') return hashSeed(str);   /* همان FNV-ish موجود */
  let h = 2166136261 >>> 0;
  const s = String(str);
  for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/* ---------- چهره‌ها ---------- */
const FACE_FILES = ['f01','f02','f03','f04','f05','f06','f07','f08','f09','f10'];
const FACE_DIR = './assets/faces/';
const FACE_META = {           /* برای متن‌های کوچک کنار چهره (مثلاً پروفایل) */
  f01:{tone:'خوش‌تراش · ۲۸ ساله',skin:'گندمی'}, f02:{tone:'خندان · ۲۲ ساله',skin:'تیره'},
  f03:{tone:'آرام · ۲۶ ساله',skin:'روشن'},      f04:{tone:'پرهیجان · ۲۵ ساله',skin:'برنزه'},
  f05:{tone:'متمرکز · ۲۵ ساله',skin:'زیتونی'},  f06:{tone:'باتجربه · ۳۴ ساله',skin:'گندمی'},
  f07:{tone:'جوان · ۱۸ ساله',skin:'زیتونی'},    f08:{tone:'تنومند · ۳۰ ساله',skin:'تیره'},
  f09:{tone:'خونسرد · ۲۷ ساله',skin:'روشن'},    f10:{tone:'پرقدرت · ۲۹ ساله',skin:'برنزه'}
};
const FACE_POS_BIAS = {       /* دروازه‌بان‌ها بیشتر F06/F11-ساکن، مهاجم‌ها جوان‌تر */
  GK:['f06','f01','f10','f08','f03'],
  DF:['f08','f01','f10','f09','f06','f02'],
  MF:['f03','f09','f05','f04','f12','f07','f01'],
  FW:['f04','f05','f07','f02','f12','f11']
};
/* شماره‌ی چهره برای یک بازیکن: همیشه ثابت برای همان شناسه */
function faceIndex(seed){
  const h = assetHash('face:' + String(seed));
  return h % FACE_FILES.length;
}
function faceKey(seed){ return FACE_FILES[faceIndex(seed)]; }
function faceUrl(seed, big){
  return FACE_DIR + (big ? '' : 'thumbs/') + faceKey(seed) + '.jpg';
}
function faceMeta(seed){ return FACE_META[faceKey(seed)] || {tone:'',skin:''}; }

/* رنگ تیم (پیراهن/آرم) از نام باشگاه — قطعی و همیشه یکسان */
const KIT_PALETTE = [
  {c1:'#e11d48', c2:'#0f172a'}, {c1:'#2563eb', c2:'#0b1220'}, {c1:'#059669', c2:'#04241a'},
  {c1:'#f59e0b', c2:'#1c1302'}, {c1:'#7c3aed', c2:'#150a2b'}, {c1:'#0891b2', c2:'#04222a'},
  {c1:'#dc2626', c2:'#111827'}, {c1:'#111827', c2:'#f8fafc'}, {c1:'#db2777', c2:'#1b0717'},
  {c1:'#65a30d', c2:'#101c04'}, {c1:'#f8fafc', c2:'#1e293b'}, {c1:'#0ea5e9', c2:'#062133'}
];
const KIT_PATTERNS = ['stripes','solid','halves','sash','hoops','pinstripe'];
function kitOf(seed){
  const h = assetHash('kit:' + String(seed));
  const p = KIT_PALETTE[h % KIT_PALETTE.length];
  return {
    c1: p.c1, c2: p.c2,
    pattern: KIT_PATTERNS[(h >> 5) % KIT_PATTERNS.length],
    number: 1 + ((h >> 9) % 30)
  };
}
function kitPatternDefs(id, k){
  /* الگوهای پارچه روی تنِ پیراهن (به‌صورت الگوی SVG داخل clip می‌آید) */
  const out = { stripes:'', solid:'', halves:'', sash:'', hoops:'', pinstripe:'' };
  return out[k.pattern] === undefined ? '' : out[k.pattern];
}

/* ---------- چهره‌ی بازیکن (HTML) ----------
   faceImg(seed, {size:'sm|md|lg|xl', big, ring, ovr, pos, lazy, cls, style})
   • این تابع همه‌جای بازی استفاده می‌شود: فهرست تیم، چیدمان، بازار،
     پخش زنده، جدول گلزنان.
   • تصویر با loading="lazy" می‌آید تا در موبایل مصرف داده کم بماند. */
function faceImg(seed, opts){
  const o = opts || {};
  const size = o.size || 'md';
  const url = faceUrl(seed, o.big === true || size === 'xl');
  const ring = o.ring ? ` ring-${o.ring}` : '';
  const posCls = o.pos ? ` fpos-${String(o.pos).toLowerCase()}` : '';
  const badge = o.ovr !== undefined && o.ovr !== null
    ? `<span class="face-ovr ${ovrClass(o.ovr)}">${faNum(o.ovr)}</span>` : '';
  const posTag = o.pos ? `<span class="face-pos pos-${String(o.pos).toLowerCase()}">${String(o.pos)}</span>` : '';
  const lazy = o.lazy === false ? '' : 'loading="lazy"';
  return `<div class="face face-${size}${ring}${posCls} ${o.cls || ''}" style="${o.style || ''}">
    <img src="${url}" alt="" ${lazy} decoding="async" draggable="false">
    ${posTag}${badge}
  </div>`;
}
function ovrClass(n){
  const v = Number(n) || 0;
  if(v >= 82) return 'ov-legend';
  if(v >= 75) return 'ov-gold';
  if(v >= 68) return 'ov-silver';
  if(v >= 60) return 'ov-bronze';
  return 'ov-weak';
}
function ovrLabel(n){
  const v = Number(n) || 0;
  if(v >= 82) return 'اسطوره';
  if(v >= 75) return 'طلایی';
  if(v >= 68) return 'نقره‌ای';
  if(v >= 60) return 'برنزی';
  return 'نوپا';
}

/* ---------- آدمک چیدمان روی زمین (نقطه‌ای که چهره رویش می‌نشیند) ---------- */
function pitchDotHTML(p, opts){
  const o = opts || {};
  return `<button class="pdot ${o.cls || ''}" onclick="${o.onclick || ''}" ${o.disabled ? 'disabled' : ''}>
    ${faceImg(p.id || p.name, { size:'sm', ring:'pitch', pos: p.position || p.pos })}
    <span class="pdot-name">${escapeHtml(String(p.name).split(' ')[0])}</span>
    <span class="pdot-ovr ${ovrClass(ovrOf(p))}">${faNum(ovrOf(p))}</span>
  </button>`;
}
function ovrOf(p){
  if(!p) return 0;
  if(p.attack !== undefined && p.defense === undefined) return Math.round(Number(p.attack) || 0);
  return Math.round((Number(p.attack || 0) + Number(p.defense || 0) + Number(p.pace || 0)) / 3);
}

/* ---------- پیراهن SVG (پیش‌نمایش باشگاه/کیت) ---------- */
function jerseySVG(seed, opts){
  const o = opts || {};
  /* امکان بازنویسی رنگ/الگو (هویت باشگاه که کاربر انتخاب می‌کند) */
  const base = kitOf(seed);
  const k = {
    c1: o.c1 || base.c1,
    c2: o.c2 || base.c2,
    pattern: o.pattern || base.pattern,
    number: o.number === undefined ? base.number : o.number
  };
  const id = 'jk' + (assetHash(seed + (o.salt || '')) % 100000);
  const num = o.number !== undefined ? o.number : k.number;
  let pattern = '';
  if(k.pattern === 'stripes')       pattern = `<g clip-path="url(#${id}c)">${[0,1,2,3,4,5].map(i=>`<rect x="${18 + i * 13}" y="0" width="7" height="100" fill="${k.c2}" opacity=".85"/>`).join('')}</g>`;
  else if(k.pattern === 'halves')   pattern = `<g clip-path="url(#${id}c)"><rect x="50" y="0" width="50" height="100" fill="${k.c2}" opacity=".85"/></g>`;
  else if(k.pattern === 'sash')     pattern = `<g clip-path="url(#${id}c)"><path d="M-10 90 L60 -10 L90 -10 L10 90 Z" fill="${k.c2}" opacity=".8"/></g>`;
  else if(k.pattern === 'hoops')    pattern = `<g clip-path="url(#${id}c)">${[0,1,2,3,4].map(i=>`<rect x="0" y="${14 + i * 18}" width="100" height="8" fill="${k.c2}" opacity=".8"/>`).join('')}</g>`;
  else if(k.pattern === 'pinstripe')pattern = `<g clip-path="url(#${id}c)" opacity=".6">${[0,1,2,3,4,5,6,7].map(i=>`<rect x="${10 + i * 11}" y="0" width="2.5" height="100" fill="${k.c2}"/>`).join('')}</g>`;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" class="jersey-svg">
    <defs>
      <clipPath id="${id}c"><path d="M34 12 L20 18 L10 34 L20 44 L26 38 L26 92 L74 92 L74 38 L80 44 L90 34 L80 18 L66 12 Q50 24 34 12 Z"/></clipPath>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff" stop-opacity=".22"/><stop offset="100%" stop-color="#000" stop-opacity=".28"/></linearGradient>
    </defs>
    <path d="M34 12 L20 18 L10 34 L20 44 L26 38 L26 92 L74 92 L74 38 L80 44 L90 34 L80 18 L66 12 Q50 24 34 12 Z" fill="${k.c1}"/>
    ${pattern}
    <path d="M34 12 L20 18 L10 34 L20 44 L26 38 L26 92 L74 92 L74 38 L80 44 L90 34 L80 18 L66 12 Q50 24 34 12 Z" fill="url(#${id}g)"/>
    <path d="M34 12 Q50 24 66 12 L64 18 Q50 28 36 18 Z" fill="#000" opacity=".28"/>
    <text x="50" y="72" text-anchor="middle" font-size="26" font-weight="900" fill="#fff" opacity=".92" font-family="Vazirmatn,sans-serif">${faNum(num)}</text>
  </svg>`;
}

/* ---------- پس‌زمینه‌های تزئینی (SVG درون‌خطی، بدون شبکه) ---------- */
function stadiumArtSVG(){
  /* چراغ‌های ورزشگاه + خطوط چمن: پس‌زمینه‌ی هدر خانه */
  return `<svg class="art-stadium" viewBox="0 0 400 160" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="stg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0b1220" stop-opacity="0"/><stop offset="100%" stop-color="#04170f" stop-opacity=".9"/></linearGradient>
      <radialGradient id="stg2" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="#fbbf24" stop-opacity=".35"/><stop offset="70%" stop-color="#fbbf24" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="400" height="160" fill="url(#stg2)"/>
    <rect y="96" width="400" height="64" fill="url(#stg1)"/>
    <g stroke="#34d399" stroke-opacity=".18" stroke-width="1">
      <line x1="0" y1="118" x2="400" y2="118"/><line x1="0" y1="140" x2="400" y2="140"/>
      <rect x="140" y="106" width="120" height="46" fill="none"/>
      <circle cx="200" cy="152" r="26" fill="none"/>
    </g>
    <g fill="#e2e8f0" opacity=".5">
      <rect x="30" y="24" width="6" height="52" rx="2"/><rect x="364" y="24" width="6" height="52" rx="2"/>
      <rect x="12" y="18" width="42" height="10" rx="3"/><rect x="346" y="18" width="42" height="10" rx="3"/>
    </g>
    <g fill="#fbbf24" opacity=".22">
      <circle cx="33" cy="23" r="16"/><circle cx="367" cy="23" r="16"/>
    </g>
  </svg>`;
}
function trophyArtSVG(){
  return `<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">
    <defs><linearGradient id="trg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#fde68a"/><stop offset="60%" stop-color="#fbbf24"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs>
    <path d="M16 8h32v10c0 11-7 19-16 19S16 29 16 18Z" fill="url(#trg)"/>
    <path d="M16 12H8c0 9 4 14 10 15M48 12h8c0 9-4 14-10 15" stroke="url(#trg)" stroke-width="3" fill="none"/>
    <rect x="28" y="36" width="8" height="10" fill="#b45309"/>
    <rect x="20" y="46" width="24" height="5" rx="2" fill="url(#trg)"/>
    <rect x="16" y="51" width="32" height="6" rx="2" fill="#92400e"/>
    <path d="M32 14l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8Z" fill="#fff8e1" opacity=".85"/>
  </svg>`;
}
function ballArtSVG(){
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
    <defs><radialGradient id="blg" cx="35%" cy="30%" r="75%"><stop offset="0%" stop-color="#ffffff"/><stop offset="70%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#94a3b8"/></radialGradient></defs>
    <circle cx="50" cy="50" r="46" fill="url(#blg)"/>
    <path d="M50 26 63 36 58 52 42 52 37 36Z" fill="#0f172a"/>
    <path d="M50 26 52 10 42 12 37 24M63 36 78 32 80 44 58 52M42 52 38 68 50 90 58 68" fill="none" stroke="#0f172a" stroke-width="4"/>
    <path d="M37 36 22 34 20 48 38 68M63 36 66 20 78 32" fill="none" stroke="#0f172a" stroke-width="4"/>
  </svg>`;
}

/* ---------- برچسب‌های رنگی پست/وضعیت ---------- */
const POS_FA_FULL = { GK:'دروازه‌بان', DF:'مدافع', MF:'هافبک', FW:'مهاجم' };
function posFa(pos){ return POS_FA_FULL[pos] || pos || ''; }
function posIcon(pos){ return { GK:'🧤', DF:'🛡️', MF:'⚡', FW:'🎯' }[pos] || '👤'; }
function formBadgeHTML(pts){
  if(pts === 3) return '<i class="fb fb-w">برد</i>';
  if(pts === 1) return '<i class="fb fb-d">مساوی</i>';
  return '<i class="fb fb-l">باخت</i>';
}

/* ---------- چهره‌ی مربی/تیم AI: از نام باشگاه ---------- */
function clubBadgeHTML(name, size){
  const s = size || 'md';
  return `<span class="club-badge cb-${s}">${crestSVG(name)}</span>`;
}

/* ---------- نوار آمادگی (fitness) با رنگ متناسب ---------- */
function fitnessBarHTML(v, label){
  const val = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  const cls = val >= 85 ? 'ok' : (val >= 65 ? 'mid' : 'low');
  return `<div class="fbar"><span class="fbar-l">${label || 'آمادگی'}</span>
    <span class="fbar-t"><i class="fbar-f ${cls}" style="width:${val}%"></i></span>
    <span class="fbar-v">${faNum(val)}٪</span></div>`;
}
