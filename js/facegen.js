/* ============================================================
   facegen.js — موتور ساخت چهره‌ی بازیکن (SVG درون‌خطی، بدون تصویر)
   ------------------------------------------------------------
   چرا این فایل؟
   • بازی‌های مدیریتی با «۱۰ عکس ثابت» تکراری می‌شوند: ۱۰ چهره برای
     ۱۰۰۰ بازیکن یعنی هر چهره ۱۰۰ بار. اینجا هر بازیکن چهره‌ی
     اختصاصی خودش را می‌گیرد.
   • چهره از «لایه‌ها» ساخته می‌شود و همه‌چیز قطعی است (هش شناسه):
       ۱۰ مدل صورت × ۱۲ رنگ پوست × ۲۰ مدل مو × ۱۲ رنگ مو
       × ۶ مدل چشم × ۶ رنگ چشم × ۸ مدل ریش × ۵ بینی × ۵ دهان
       × ۴ ابرو  ⇒  میلیاردها ترکیب ممکن
   • خروجی SVG برداری است: روی هر صفحه‌ای تیز، سبک (۱–۳ کیلوبایت)،
     بدون هیچ درخواست شبکه‌ای ⇒ هم برای موبایل ارزان‌تر است، هم
     بازی آفلاین هم همان چهره‌ها را دارد.
   • همان الگوریتم هش در کل پروژه (assetHash) ⇒ چهره‌ی یک بازیکن
     روی همه‌ی دستگاه‌ها یکی است و سرور هم می‌تواند بازتولیدش کند.
   ============================================================ */

/* ---------- ابزار رنگ ---------- */
function fgHex2rgb(hex){
  let h = String(hex).replace('#', '');
  if(h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function fgRgb2hex(r, g, b){
  return '#' + [r, g, b].map(v=> Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
/* مخلوط کردن دو رنگ — برای سایه/هایلایت پوست و مو */
function fgMix(hex, target, amount){
  const a = fgHex2rgb(hex), b = fgHex2rgb(target), k = Math.max(0, Math.min(1, amount));
  return fgRgb2hex(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
}
function fgAlpha(hex, amount){ return `rgba(${fgHex2rgb(hex).join(',')},${amount})`; }

/* ---------- هش ---------- */
function fgHash(seed, salt){
  /* همیشه از پياده‌سازی خودِ این فایل استفاده می‌کنیم تا چهره‌ی یک
     بازیکن به «ترتیب بارگذاری اسکریپت‌ها» وابسته نباشد. */
  let h = 2166136261 >>> 0;
  const s = salt + ':' + String(seed);
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function fgPick(list, seed, salt){ return list[fgHash(seed, salt) % list.length]; }

/* ============================================================
   ۱) کتابخانه‌ی لایه‌ها
   ============================================================ */

/* ---------- ۱۰ مدل صورت ---------- */
const FG_SHAPES = [
  { id:'oval',     fa:'بیضی',    w:25.0, top:13, bottom:88, jaw:0.80, cheek:1.00 },
  { id:'square',   fa:'چهارگوش', w:26.0, top:13, bottom:87, jaw:0.95, cheek:1.02 },
  { id:'round',    fa:'گرد',     w:25.5, top:12, bottom:85, jaw:0.86, cheek:1.04 },
  { id:'long',     fa:'کشیده',   w:23.5, top:11, bottom:91, jaw:0.78, cheek:0.98 },
  { id:'heart',    fa:'قلبی',    w:26.0, top:13, bottom:86, jaw:0.72, cheek:1.03 },
  { id:'diamond',  fa:'لوزی',    w:24.5, top:14, bottom:88, jaw:0.74, cheek:1.06 },
  { id:'triangle', fa:'مثلثی',   w:26.5, top:14, bottom:86, jaw:0.92, cheek:0.98 },
  { id:'narrow',   fa:'باریک',   w:22.5, top:12, bottom:89, jaw:0.76, cheek:0.97 },
  { id:'wide',     fa:'پهن',     w:27.5, top:13, bottom:86, jaw:0.88, cheek:1.05 },
  { id:'soft',     fa:'نرم',     w:25.0, top:12, bottom:87, jaw:0.84, cheek:1.01 }
];

/* ---------- ۱۲ رنگ پوست (از روشن تا تیره، با ته‌رنگ گرم) ---------- */
const FG_SKINS = [
  { id:'porcelain', fa:'روشن',      base:'#f6dcc4', shadow:'#d9a982' },
  { id:'fair',      fa:'مهتابی',    base:'#f0cfae', shadow:'#cf9f75' },
  { id:'light',     fa:'گندمی روشن', base:'#e9c39b', shadow:'#c48f66' },
  { id:'wheat',     fa:'گندمی',     base:'#dfb488', shadow:'#b9825a' },
  { id:'olive',     fa:'زیتونی',    base:'#d2a276', shadow:'#a9744a' },
  { id:'honey',     fa:'عسلی',      base:'#c99365', shadow:'#9d6a40' },
  { id:'bronze',    fa:'برنزه',     base:'#b8814f', shadow:'#8b5b33' },
  { id:'tan',       fa:'قهوه‌ای روشن', base:'#a76f42', shadow:'#7c4d29' },
  { id:'brown',     fa:'قهوه‌ای',   base:'#8e5c36', shadow:'#653c1f' },
  { id:'chestnut',  fa:'شاه‌بلوطی', base:'#764a2b', shadow:'#4f2f18' },
  { id:'deep',      fa:'تیره',      base:'#5d3820', shadow:'#3a2211' },
  { id:'ebony',     fa:'آبنوسی',    base:'#45280f', shadow:'#291705' }
];

/* ---------- ۱۲ رنگ مو ---------- */
const FG_HAIRC = [
  { id:'black',    fa:'مشکی',      base:'#141414' },
  { id:'softblack',fa:'مشکی مات',  base:'#231f1c' },
  { id:'darkbrown',fa:'قهوه‌ای تیره', base:'#2f2015' },
  { id:'brown',    fa:'قهوه‌ای',   base:'#442c18' },
  { id:'chestnut', fa:'شاه‌بلوطی', base:'#5b3a1e' },
  { id:'auburn',   fa:'بلوطی سرخ', base:'#6d3319' },
  { id:'ginger',   fa:'زنجبیلی',   base:'#8c4613' },
  { id:'lightbrown',fa:'قهوه‌ای روشن', base:'#7c5524' },
  { id:'blonde',   fa:'بلوند',     base:'#c49a4e' },
  { id:'platinum', fa:'بلوند روشن', base:'#dcc38a' },
  { id:'gray',     fa:'جوگندمی',   base:'#8e8e8e' },
  { id:'silver',   fa:'نقره‌ای',   base:'#cfcfcf' }
];

/* ---------- ۶ رنگ چشم ---------- */
const FG_EYEC = [
  { id:'darkbrown', fa:'قهوه‌ای تیره', base:'#3a2415' },
  { id:'brown',     fa:'قهوه‌ای',     base:'#5a3618' },
  { id:'hazel',     fa:'فندقی',       base:'#7a5a24' },
  { id:'amber',     fa:'عسلی',        base:'#8c6420' },
  { id:'green',     fa:'سبز',         base:'#3f5f3a' },
  { id:'steel',     fa:'آبی‌فولادی',   base:'#33526b' }
];

/* ---------- ۶ مدل چشم ---------- */
const FG_EYES = [
  { id:'almond', fa:'بادامی',  rw:1.00, rh:1.00, tilt:0,   lid:0.55, iris:1.00 },
  { id:'round',  fa:'گرد',     rw:0.94, rh:1.16, tilt:0,   lid:0.42, iris:1.06 },
  { id:'hooded', fa:'پلک‌دار', rw:1.02, rh:0.94, tilt:0,   lid:0.86, iris:0.94 },
  { id:'narrow', fa:'باریک',   rw:1.08, rh:0.78, tilt:0,   lid:0.62, iris:0.92 },
  { id:'upturned', fa:'بالارفته', rw:1.00, rh:1.00, tilt:-7, lid:0.50, iris:1.00 },
  { id:'downturned', fa:'آرام', rw:1.00, rh:1.02, tilt:6,  lid:0.66, iris:0.98 }
];

/* ---------- ۴ مدل ابرو ---------- */
const FG_BROWS = [
  { id:'natural', fa:'طبیعی', t:3.2, arch:2.0, len:1.00 },
  { id:'thick',   fa:'ضخیم',  t:4.6, arch:1.4, len:1.02 },
  { id:'thin',    fa:'نازک',  t:2.0, arch:2.6, len:0.96 },
  { id:'arched',  fa:'کمانی', t:3.4, arch:3.6, len:0.98 }
];

/* ---------- ۵ مدل بینی ---------- */
const FG_NOSES = [
  { id:'straight', fa:'صاف',      wide:1.00, tip:0.88, bulb:0 },
  { id:'small',    fa:'کوچک',     wide:0.82, tip:0.80, bulb:0 },
  { id:'wide',     fa:'پهن',      wide:1.28, tip:0.94, bulb:0 },
  { id:'aquiline', fa:'عقابی',    wide:0.96, tip:0.90, bulb:0, curve:1 },
  { id:'round',    fa:'گرد',      wide:1.06, tip:1.00, bulb:1 }
];

/* ---------- ۵ مدل دهان ---------- */
const FG_MOUTHS = [
  { id:'neutral', fa:'خنثی',   w:1.00, smile:0.6, full:0,   lift:0 },
  { id:'smile',   fa:'لبخند',  w:1.06, smile:2.6, full:0.4, lift:0.8 },
  { id:'serious', fa:'جدی',    w:0.98, smile:-0.6, full:0,  lift:0 },
  { id:'full',    fa:'لب‌پر',  w:1.10, smile:0.8, full:1,   lift:0.3 },
  { id:'smirk',   fa:'نیم‌لبخند', w:1.02, smile:1.8, full:0.2, lift:0.6, skew:1 }
];

/* ---------- ۸ مدل ریش ---------- */
const FG_BEARDS = [
  { id:'clean',   fa:'اصلاح‌شده', kind:'none' },
  { id:'shadow',  fa:'سایه‌ریش',  kind:'shadow' },
  { id:'stubble', fa:'ته‌ریش',    kind:'stubble' },
  { id:'mustache',fa:'سبیل',      kind:'mustache' },
  { id:'goatee',  fa:'بزی',       kind:'goatee' },
  { id:'vandyke', fa:'وان‌دایک',   kind:'vandyke' },
  { id:'stripe',  fa:'بند چانه',  kind:'stripe' },
  { id:'full',    fa:'ریش کامل',  kind:'full' }
];

/* ---------- ۲۰ مدل مو ----------
   هر مدل یک «دستور لایه» است:
     back : قطعاتی که پشت سر می‌آیند (اول کشیده می‌شوند)
     cap  : کلاهک روی جمجمه (نسبی به ابعاد سر)
     front: چیزهایی که روی مو می‌آید (هایلایت/بند)
   همه‌ی مختصات نسبی‌اند و از هندسه‌ی سر حساب می‌شوند. */
const FG_HAIRS = [
  /* line = فاصله‌ی خط رویش مو از بالای سر (پیشانی) — dip = فرورفتگی/بالارفتگی وسط */
  { id:'bald',      fa:'طاس',            kind:'none' },
  { id:'buzz',      fa:'ته‌ریش‌زده',      kind:'cap', t:2.2, line:13, dip:0   },
  { id:'fade',      fa:'کوتاه فِید',     kind:'cap', t:3.6, line:12, dip:0,  shaved:1 },
  { id:'crop',      fa:'کوتاه برجسته',   kind:'cap', t:4.4, line:11, dip:-1, texture:1 },
  { id:'sidepart',  fa:'فرق‌کنار',        kind:'cap', t:5.0, line:12, dip:-1, part:-1 },
  { id:'slick',     fa:'عقب‌شده',        kind:'cap', t:5.6, line:11, dip:-1, shine:1 },
  { id:'undercut',  fa:'زیربرش',         kind:'cap', t:5.2, line:10, dip:0,  shaved:1, shine:1 },
  { id:'lineup',    fa:'خط‌دار',         kind:'cap', t:2.8, line:12, dip:0,  lineup:1 },
  { id:'wavy',      fa:'تابدار',         kind:'cap', t:6.0, line:13, dip:-2, wave:1 },
  { id:'curly',     fa:'فر',             kind:'cap', t:6.4, line:14, dip:-2, curls:1 },
  { id:'kinky',     fa:'فر ریز',         kind:'cap', t:7.0, line:15, dip:-1, curls:2 },
  { id:'afro',      fa:'آفرو',           kind:'cap', t:8.6, line:16, dip:-1, afro:1 },
  { id:'mohawk',    fa:'موهاک',          kind:'cap', t:3.0, line:13, dip:0,  crest:1, shaved:1 },
  { id:'faux',      fa:'فُوهاوک',        kind:'cap', t:3.4, line:12, dip:1,  crest:2, shaved:1 },
  { id:'receding',  fa:'عقب‌رفته',       kind:'cap', t:3.0, line:20, dip:3,  temples:1 },
  { id:'combover',  fa:'روی‌سر',         kind:'cap', t:5.4, line:16, dip:1,  sweep:1 },
  { id:'bun',       fa:'گوجه‌ای (موبند)', kind:'cap', t:5.0, line:14, dip:-1, bun:1 },
  { id:'ponytail',  fa:'دم‌اسبی',        kind:'cap', t:4.6, line:13, dip:-1, tail:1 },
  { id:'long',      fa:'بلند',           kind:'cap', t:6.0, line:15, dip:-2, sides:1 },
  { id:'dreads',    fa:'دریدز',          kind:'cap', t:6.6, line:15, dip:-1, locks:1 }
];

/* ============================================================
   ۲) هندسه — همه‌ی اعداد از اینجا می‌آید (تنها منبع حقیقت)
   ============================================================ */
function fgGeom(shape, mods){
  const m = mods || {};
  const top = shape.top;
  const bottom = top + (shape.bottom - top) * (m.len || 1);
  const h = bottom - top;
  const w = shape.w * (m.width || 1);
  return {
    shape, top, bottom, h, w,
    cheekY: top + h * 0.42,
    jawW: w * shape.jaw,
    eyeY: top + h * (m.eyeHigh || 0.515),
    eyeDx: w * 0.42 * (m.eyeSpace || 1),
    eyeR: [w * 0.205, h * 0.058],
    browY: top + h * (m.eyeHigh ? m.eyeHigh - 0.10 : 0.415),
    noseTop: top + h * 0.485,
    noseBot: top + h * 0.715,
    mouthY: top + h * 0.805,
    earY: top + h * 0.545,
    chinY: bottom
  };
}
/* خط بیرونی سر — از پیشانی تا چانه با منحنی نرم */
function fgHeadPath(g, grow){
  const t = grow || 0;
  const w = g.w + t, jawW = g.jawW + t;
  const top = g.top - t, bottom = g.bottom + t;
  const cheekY = g.cheekY, cx = 50;
  return `M${cx - w} ${cheekY}
    C${cx - w} ${g.top + g.h * 0.10} ${cx - g.w * 0.86} ${top} ${cx} ${top}
    C${cx + g.w * 0.86} ${top} ${cx + w} ${g.top + g.h * 0.10} ${cx + w} ${cheekY}
    C${cx + w} ${g.top + g.h * 0.66} ${cx + jawW + 1.5} ${bottom - 5} ${cx} ${bottom}
    C${cx - jawW - 1.5} ${bottom - 5} ${cx - w} ${g.top + g.h * 0.66} ${cx - w} ${cheekY} Z`;
}
/* جمجمه: بیضی بالای سر که مو رویش می‌نشیند */
function fgSkull(g, grow){
  const t = grow || 0;
  return { cx: 50, cy: g.top + g.h * 0.40, rx: g.w * 1.02 + t, ry: g.h * 0.44 + t };
}
/* کلاهک مو — روی «خط بیرونی خود سر» سوار می‌شود (کاملاً منحنی مکعبی،
   بدون کمان SVG تا هیچ‌وقت لکه‌ی طاس روی جمجمه نماند):
   بالا/پهلوها = خط سر با فاصله‌ی t ، پایین = منحنی خط رویش مو          */
function fgCapPath(g, style){
  const t = style.t || 3;
  const cx = 50;
  const w = g.w + t;                              /* نیم‌عرض کلاهک */
  const top = g.top - Math.max(2.4, t * 0.9);     /* سقف مو: همیشه بالای سر */
  const cheekY = g.cheekY;
  const lineY = g.top + (style.line || 0) + (style.dip || 0);   /* خط رویش وسط پیشانی */
  const sideY = Math.min(cheekY - 1, g.top + (style.line === undefined ? 3 : style.line) * 0.5 + g.h * 0.10);
  return `M${cx - w} ${cheekY}
    C${cx - w} ${g.top + g.h * 0.10} ${cx - g.w * 0.86} ${top} ${cx} ${top}
    C${cx + g.w * 0.86} ${top} ${cx + w} ${g.top + g.h * 0.10} ${cx + w} ${cheekY}
    C${cx + w * 0.70} ${sideY} ${cx + w * 0.36} ${lineY} ${cx} ${lineY}
    C${cx - w * 0.36} ${lineY} ${cx - w * 0.70} ${sideY} ${cx - w} ${cheekY} Z`;
}
/* مسیر ریش/ته‌ریش: نیمه‌ی پایینی سر — از «زیر خط چشم» شروع می‌شود
   تا ریش هرگز روی گوشه‌ی چشم نیفتد (طبیعی‌تر از شروع در خط گونه) */
function fgJawPath(g, grow){
  const w = g.w + grow, jawW = g.jawW + grow, cx = 50;
  const cheekY = g.eyeY + g.h * 0.055 + 1;
  const bottom = g.bottom + grow;
  return `M${cx - w} ${cheekY}
    C${cx - w} ${g.top + g.h * 0.68} ${cx - jawW - 1.5} ${bottom - 5} ${cx} ${bottom}
    C${cx + jawW + 1.5} ${bottom - 5} ${cx + w} ${g.top + g.h * 0.68} ${cx + w} ${cheekY}
    C${cx + w * 0.55} ${cheekY + g.h * 0.16} ${cx - w * 0.55} ${cheekY + g.h * 0.16} ${cx - w} ${cheekY} Z`;
}

/* ============================================================
   ۳) صورت هر بازیکن: مشخصات قطعی از شناسه
   ============================================================ */
/* ---------- انتخاب ریش بر اساس سن (طبیعی‌تر از قرعه‌ی ساده) ---------- */
function fgBeardFor(key, age){
  const roll = fgHash(key, 'beard') % 100;
  const chance = age >= 31 ? 58 : age >= 27 ? 40 : age >= 24 ? 24 : 11;
  if(roll > chance) return FG_BEARDS[0];                       /* اصلاح‌شده */
  const heavy = [4, 5, 6, 7];                                  /* بزی، وان‌دایک، بند چانه، ریش کامل */
  const light = [1, 2, 3];                                     /* سایه، ته‌ریش، سبیل */
  const pool = (age >= 28 || (fgHash(key, 'bfull') % 100) < 34) ? heavy : light;
  return FG_BEARDS[pool[fgHash(key, 'bkind') % pool.length]];
}

function faceSpec(seed, opts){
  const o = opts || {};
  const key = String(seed === undefined || seed === null ? 'anon' : seed);
  const s = {};
  s.shape  = fgPick(FG_SHAPES,  key, 'shape');
  s.skin   = fgPick(FG_SKINS,   key, 'skin');
  s.hair   = fgPick(FG_HAIRS,   key, 'hair');
  s.hairC  = fgPick(FG_HAIRC,   key, 'hairc');
  s.eyes   = fgPick(FG_EYES,    key, 'eyes');
  s.eyeC   = fgPick(FG_EYEC,    key, 'eyec');
  s.brows  = fgPick(FG_BROWS,   key, 'brows');
  s.nose   = fgPick(FG_NOSES,   key, 'nose');
  s.mouth  = fgPick(FG_MOUTHS,  key, 'mouth');
  /* ریش: سنِ بازیکن (اگر باشد) احتمال ریش را بیشتر می‌کند؛ پیش‌فرض جوان */
  s.beard = fgBeardFor(key, Number(o.age) || 0);
  /* ابعاد صورت: پهن/معمولی/باریک · کوتاه/معمولی/کشیده · فاصله‌ی چشم */
  s.mods = {
    width:    [0.94, 1.0, 1.06][fgHash(key, 'wide') % 3],
    len:      [0.96, 1.0, 1.05][fgHash(key, 'long') % 3],
    eyeSpace: [0.94, 1.0, 1.06][fgHash(key, 'espace') % 3],
    eyeHigh:  [0.505, 0.515, 0.525][fgHash(key, 'ehigh') % 3]
  };
  /* جزئیات ریز */
  s.freckles = (fgHash(key, 'freckle') % 100) < 16;
  s.dimple   = (fgHash(key, 'dimple') % 100) < 22;
  s.earring  = (fgHash(key, 'earring') % 100) < 9;
  s.headband = (fgHash(key, 'band') % 100) < 7;
  s.beardC   = s.hairC;
  s.browC    = fgMix(s.hairC.base, '#000000', s.hairC.id === 'silver' || s.hairC.id === 'gray' ? 0.15 : 0.35);
  s.skinHi   = fgMix(s.skin.base, '#ffffff', 0.20);
  s.skinSh   = s.skin.shadow;
  s.lip      = fgMix(s.skin.base, '#8c3b3b', 0.42);
  s.lipDark  = fgMix(s.skin.base, '#6d2a2a', 0.55);
  s.hairHi   = fgMix(s.hairC.base, '#ffffff', 0.30);
  s.hairSh   = fgMix(s.hairC.base, '#000000', 0.45);
  /* هویت ظاهری برای متن‌های بازی */
  s.desc = `${s.hair.fa} · ${s.beard.fa} · پوست ${s.skin.fa} · چشم ${s.eyeC.fa}`;
  s.traits = `${s.shape.fa} · ${s.brows.fa} · بینی ${s.nose.fa}`;
  return s;
}

/* ============================================================
   ۴) ساخت SVG — لایه به لایه
   ============================================================ */
const FG_CACHE = new Map();
function fgCacheKey(seed, opts){
  const o = opts || {};
  return [seed, o.size || 'md', o.detail || '-', o.age || 0, (o.kit && o.kit.c1) || '-', (o.kit && o.kit.c2) || '-', o.mood || '-'].join('|');
}

/* چشم: کره + عنبیه + مژه + پلک */
function fgEye(g, s, side, lean){
  const ex = 50 + side * g.eyeDx;
  const ey = g.eyeY;
  const rw = g.eyeR[0] * s.eyes.rw, rh = g.eyeR[1] * s.eyes.rh;
  const ir = rh * s.eyes.iris;
  const rot = side * s.eyes.tilt;
  const lash = fgMix(s.browC, '#000000', 0.25);
  return `<g transform="rotate(${rot} ${ex} ${ey})">
    ${lean ? '' : `<ellipse cx="${ex}" cy="${ey + rh * 0.35}" rx="${rw * 1.22}" ry="${rh * 1.5}" fill="#000" opacity=".10"/>`}
    <path d="M${ex - rw} ${ey} Q${ex} ${ey - rh * 2.2} ${ex + rw} ${ey} Q${ex} ${ey + rh * 1.7} ${ex - rw} ${ey} Z" fill="#f7f4f0"/>
    <circle cx="${ex}" cy="${ey - rh * 0.05}" r="${ir}" fill="${s.eyeC.base}"/>
    ${lean ? '' : `<circle cx="${ex}" cy="${ey - rh * 0.05}" r="${ir}" fill="none" stroke="${fgMix(s.eyeC.base, '#000', 0.5)}" stroke-width=".7"/>`}
    <circle cx="${ex}" cy="${ey - rh * 0.05}" r="${ir * 0.46}" fill="#160f0a"/>
    ${lean ? '' : `<circle cx="${ex - ir * 0.34}" cy="${ey - rh * 0.42}" r="${Math.max(.7, ir * 0.26)}" fill="#fff" opacity=".9"/>`}
    <path d="M${ex - rw * 1.04} ${ey - rh * 0.12} Q${ex} ${ey - rh * (1.5 + s.eyes.lid * 1.2)} ${ex + rw * 1.04} ${ey - rh * 0.16}"
      fill="none" stroke="${lash}" stroke-width="${1.5 + s.eyes.lid}" stroke-linecap="round" opacity=".9"/>
  </g>`;
}
/* ابرو: لایه‌ی ضخیم با کمان */
function fgBrow(g, s, side){
  const ex = 50 + side * g.eyeDx;
  const y = g.browY;
  const w = g.w * 0.30 * s.brows.len;
  const dy = s.brows.arch * 0.6;
  const x1 = ex - side * w * 0.95, x2 = ex + side * w * 0.95;
  const mid = ex + side * w * 0.15;
  return `<path d="M${x1} ${y + dy - side * 0.4} Q${mid} ${y - dy * 1.5} ${x2} ${y + dy * 0.7}"
    fill="none" stroke="${s.browC}" stroke-width="${s.brows.t}" stroke-linecap="round" opacity=".95"/>`;
}
/* بینی: پل + پره‌ها (+ برجستگی سر بینی) */
function fgNose(g, s, lean){
  const y1 = g.noseTop, y2 = g.noseBot;
  const wBase = g.w * 0.155 * s.nose.wide;
  const tipY = y2 - g.h * 0.012;
  const curve = s.nose.curve ? `C${50 + g.w * 0.055} ${y1 + g.h * 0.10} ${50 + g.w * 0.05} ${y2 - g.h * 0.06} ${50} ${tipY}` : `L50 ${tipY}`;
  return `<g opacity=".92">
    <path d="M50 ${y1} ${curve}" fill="none" stroke="${s.skinSh}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M${50 - wBase} ${tipY - 1.2} Q50 ${tipY + g.h * 0.035} ${50 + wBase} ${tipY - 1.2}"
      fill="none" stroke="${s.skinSh}" stroke-width="1.5" stroke-linecap="round"/>
    ${(s.nose.bulb && !lean) ? `<ellipse cx="50" cy="${tipY - 1}" rx="${wBase * 0.6}" ry="${g.h * 0.028}" fill="${s.skinHi}" opacity=".55"/>` : ''}
    ${lean ? '' : `<ellipse cx="${50 - wBase * 0.78}" cy="${tipY + 1}" rx="1.1" ry=".8" fill="${fgMix(s.skinSh, '#000', 0.3)}" opacity=".5"/>
    <ellipse cx="${50 + wBase * 0.78}" cy="${tipY + 1}" rx="1.1" ry=".8" fill="${fgMix(s.skinSh, '#000', 0.3)}" opacity=".5"/>`}
  </g>`;
}
/* دهان: لب بالا/پایین + گوشه‌های متغیر */
function fgMouth(g, s, lean){
  const y = g.mouthY, w = g.w * 0.19 * s.mouth.w;
  const lift = s.mouth.lift * g.h * 0.012;
  const skew = s.mouth.skew ? 1 : 0;
  const yl = y + (skew ? 0.6 : 0), yr = y + (skew ? 0.9 : 0);
  const ctrlY = y + s.mouth.smile + (s.mouth.full ? 1.2 : 0.4);
  const upper = `M${50 - w} ${yl - lift} Q50 ${ctrlY - (s.mouth.smile > 1 ? 1.2 : 0.6)} ${50 + w} ${yr - lift}`;
  const lower = `M${50 - w * 0.92} ${yl - lift + 1.1} Q50 ${ctrlY + 4.4 + s.mouth.full * 1.6} ${50 + w * 0.92} ${yr - lift + 1.1}`;
  return `<g>
    <path d="${lower} Q50 ${y + 3.6 + s.mouth.full} ${50 - w * 0.9} ${yl - lift + 1.1} Z" fill="${s.lip}" opacity=".85"/>
    <path d="${upper}" fill="none" stroke="${s.lipDark}" stroke-width="1.5" stroke-linecap="round"/>
    ${lean ? '' : `<path d="${upper} Q50 ${y + 2.4 + s.mouth.full * 2} ${50 + w} ${yr - lift}" fill="none" stroke="${s.skinSh}" stroke-width=".8" opacity=".4"/>`}
  </g>`;
}
/* ریش: ۸ حالت */
function fgBeard(g, s){
  const b = s.beard, c = s.beardC.base;
  const darker = fgMix(c, '#000', 0.15);
  if(b.kind === 'none') return '';
  if(b.kind === 'shadow' || b.kind === 'stubble')
    return `<path d="${fgJawPath(g, b.kind === 'shadow' ? 0.6 : 1.1)}" fill="${c}" opacity="${b.kind === 'shadow' ? '.16' : '.30'}"/>`;
  if(b.kind === 'stripe')
    return `<path d="${fgJawPath(g, 1.0)}" fill="none" stroke="${c}" stroke-width="2.2" opacity=".85"/>
            <path d="M${50 - g.w * 0.13} ${g.mouthY - g.h * 0.075} Q50 ${g.mouthY - g.h * 0.095} ${50 + g.w * 0.13} ${g.mouthY - g.h * 0.075}"
              fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`;
  if(b.kind === 'mustache')
    return `<path d="M${50 - g.w * 0.20} ${g.mouthY - g.h * 0.085} Q50 ${g.mouthY - g.h * 0.125} ${50 + g.w * 0.20} ${g.mouthY - g.h * 0.085}
              Q50 ${g.mouthY - g.h * 0.055} ${50 - g.w * 0.20} ${g.mouthY - g.h * 0.085} Z" fill="${c}" opacity=".95"/>`;
  if(b.kind === 'goatee')
    return `<path d="M${50 - g.w * 0.30} ${g.mouthY - g.h * 0.02} Q50 ${g.bottom + 3.5} ${50 + g.w * 0.30} ${g.mouthY - g.h * 0.02}
              Q50 ${g.mouthY + g.h * 0.02} ${50 - g.w * 0.30} ${g.mouthY - g.h * 0.02} Z" fill="${c}" opacity=".92"/>
            <path d="M${50 - g.w * 0.19} ${g.mouthY - g.h * 0.085} Q50 ${g.mouthY - g.h * 0.12} ${50 + g.w * 0.19} ${g.mouthY - g.h * 0.085}
              Q50 ${g.mouthY - g.h * 0.058} ${50 - g.w * 0.19} ${g.mouthY - g.h * 0.085} Z" fill="${c}" opacity=".9"/>`;
  if(b.kind === 'vandyke')
    return `<path d="M${50 - g.w * 0.24} ${g.mouthY + g.h * 0.012} Q50 ${g.bottom + 2} ${50 + g.w * 0.24} ${g.mouthY + g.h * 0.012}
              Q50 ${g.mouthY + g.h * 0.045} ${50 - g.w * 0.24} ${g.mouthY + g.h * 0.012} Z" fill="${c}" opacity=".95"/>
            <path d="M${50 - g.w * 0.17} ${g.mouthY - g.h * 0.09} Q50 ${g.mouthY - g.h * 0.122} ${50 + g.w * 0.17} ${g.mouthY - g.h * 0.09}
              Q50 ${g.mouthY - g.h * 0.062} ${50 - g.w * 0.17} ${g.mouthY - g.h * 0.09} Z" fill="${c}" opacity=".9"/>`;
  /* ریش کامل */
  return `<path d="${fgJawPath(g, 1.4)}" fill="${c}" opacity=".96"/>
    <path d="M${50 - g.w * 0.22} ${g.mouthY - g.h * 0.095} Q50 ${g.mouthY - g.h * 0.135} ${50 + g.w * 0.22} ${g.mouthY - g.h * 0.095}
      Q50 ${g.mouthY - g.h * 0.05} ${50 - g.w * 0.22} ${g.mouthY - g.h * 0.095} Z" fill="${darker}" opacity=".95"/>`;
}
/* مو: کلاهک + لایه‌های پشت/جلو */
function fgHair(g, s, simple, lean){
  const st = s.hair, c = s.hairC.base, hi = s.hairHi, sh = s.hairSh;
  if(st.kind === 'none') return { back:'', main:'', front:'' };
  let back = '', main = '', front = '';
  const e = fgSkull(g, st.t);
  /* لایه‌ی پشت (موهای بلند، دم‌اسبی، آفرو، دریدز) */
  if(st.afro) back += `<circle cx="50" cy="${e.cy - e.ry * 0.16}" r="${e.rx * 1.12}" fill="${sh}"/>`;
  if(st.sides || st.locks)
    back += `<path d="M${50 - e.rx} ${e.cy - e.ry * 0.1} C${50 - e.rx * 1.22} ${g.top + g.h * 0.55} ${50 - e.rx * 1.05} ${g.bottom - 2} ${50 - e.rx * 0.55} ${g.bottom + 3}
      L${50 + e.rx * 0.55} ${g.bottom + 3} C${50 + e.rx * 1.05} ${g.bottom - 2} ${50 + e.rx * 1.22} ${g.top + g.h * 0.55} ${50 + e.rx} ${e.cy - e.ry * 0.1} Z" fill="${sh}"/>`;
  if(st.tail)
    back += `<path d="M${50 + e.rx * 0.72} ${e.cy - e.ry * 0.4} q${e.rx * 0.55} ${e.ry * 0.5} ${e.rx * 0.30} ${g.h * 0.62} q-.1 ${g.h * 0.12} -${e.rx * 0.30} ${g.h * 0.06} q${e.rx * 0.05} -${g.h * 0.35} -${e.rx * 0.28} -${g.h * 0.5} Z" fill="${c}"/>`;
  if(st.locks){
    const n = lean ? 5 : 8;
    for(let i = 0; i < n; i++){
      const side = i % 2 ? 1 : -1;
      const px = 50 + side * (e.rx * (0.62 + 0.34 * ((i * 7) % 5) / 5));
      const py = g.top + g.h * (0.30 + 0.085 * ((i * 3) % 6));
      const len = g.h * (0.26 + 0.06 * (i % 4));
      back += `<path d="M${px} ${py} q${side * 2.4} ${len * 0.5} ${side * 0.6} ${len} q-${side * 1.6} -${len * 0.45} -${side * 2.4} -${len} Z" fill="${sh}"/>`;
    }
  }
  if(st.bun) back += `<circle cx="${50 + e.rx * 0.30}" cy="${g.top - 3.4}" r="${e.rx * 0.34}" fill="${sh}"/>`;
  /* کلاهک اصلی */
  main += `<path d="${fgCapPath(g, st)}" fill="${c}"/>`;
  if(st.afro){
    main = '';
    main += `<ellipse cx="50" cy="${e.cy - e.ry * 0.28}" rx="${e.rx * 1.12}" ry="${e.ry * 1.02}" fill="${c}"/>`;
    main += `<path d="${fgCapPath(g, { t: st.t * 0.55, line: st.line + 6, dip: st.dip })}" fill="${c}"/>`;
  }
  if(st.temples)   /* عقب‌رفتگی شقیقه‌ها */
    main += `<path d="M${50 - e.rx} ${g.browY - 2} q${e.rx * 0.30} -${g.h * 0.10} ${e.rx * 0.42} 1 Z" fill="${c}"/>
             <path d="M${50 + e.rx} ${g.browY - 2} q-${e.rx * 0.30} -${g.h * 0.10} -${e.rx * 0.42} 1 Z" fill="${c}"/>`;
  if(st.shaved)    /* پهلوهای تراشیده: تیرگی ملایم روی شقیقه، هم‌راستا با خط سر */
    front += `<path d="M${50 - g.w + 0.6} ${g.cheekY - g.h * 0.06}
        C${50 - g.w + 0.4} ${g.cheekY + g.h * 0.05} ${50 - g.w + 1.6} ${g.cheekY + g.h * 0.12} ${50 - g.w + 3.4} ${g.cheekY + g.h * 0.16}
        C${50 - g.w + 5.6} ${g.cheekY + g.h * 0.10} ${50 - g.w + 6.2} ${g.cheekY - g.h * 0.01} ${50 - g.w + 5.4} ${g.cheekY - g.h * 0.08} Z"
        fill="${fgMix(s.skin.base, '#000', 0.18)}" opacity=".8"/>
      <path d="M${50 + g.w - 0.6} ${g.cheekY - g.h * 0.06}
        C${50 + g.w - 0.4} ${g.cheekY + g.h * 0.05} ${50 + g.w - 1.6} ${g.cheekY + g.h * 0.12} ${50 + g.w - 3.4} ${g.cheekY + g.h * 0.16}
        C${50 + g.w - 5.6} ${g.cheekY + g.h * 0.10} ${50 + g.w - 6.2} ${g.cheekY - g.h * 0.01} ${50 + g.w - 5.4} ${g.cheekY - g.h * 0.08} Z"
        fill="${fgMix(s.skin.base, '#000', 0.18)}" opacity=".8"/>`;
  if(st.crest)     /* موهاک/فُوهاوک: تاج وسط */
    front += `<path d="M${50 - g.w * 0.16} ${g.top + g.h * 0.16} Q50 ${g.top - (st.crest === 1 ? 9 : 5.5)} ${50 + g.w * 0.16} ${g.top + g.h * 0.16} Z" fill="${c}"/>`;
  if(st.curls){
    const n = lean ? (st.curls === 2 ? 6 : 5) : (st.curls === 2 ? 14 : 9), r = st.curls === 2 ? 4.2 : 4.8;
    for(let i = 0; i < n; i++){
      const a = Math.PI * (0.08 + 0.84 * i / (n - 1));
      const px = 50 - Math.cos(a) * (e.rx * 0.96);
      const py = e.cy - Math.sin(a) * (e.ry * 0.98);
      front += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${c}"/>`;
    }
  }
  if(st.wave && !simple)
    front += `<path d="M${50 - e.rx * 0.86} ${e.cy - e.ry * 0.62} q${e.rx * 0.4} -4 ${e.rx * 0.8} 0 q${e.rx * 0.4} 4 ${e.rx * 0.8} 0"
      fill="none" stroke="${hi}" stroke-width="1.6" opacity=".55"/>`;
  if(st.texture && !simple){
    for(let i = 0; i < 6; i++){
      const px = 50 - e.rx * 0.66 + i * (e.rx * 1.32 / 5);
      front += `<path d="M${px} ${e.cy - e.ry * 0.72} q1.6 -3 .6 -6" stroke="${hi}" stroke-width="1.5" fill="none" opacity=".6" stroke-linecap="round"/>`;
    }
  }
  if(st.shine && !simple)
    front += `<path d="M${50 - e.rx * 0.5} ${e.cy - e.ry * 0.42} q${e.rx * 0.45} -3.4 ${e.rx * 0.95} -1.2" stroke="${hi}" stroke-width="2.4" fill="none" opacity=".45" stroke-linecap="round"/>`;
  if((st.part || st.sweep) && !simple)
    front += `<path d="M${50 + (st.part ? -e.rx * 0.42 : e.rx * 0.30)} ${e.cy - e.ry * 0.78} q${e.rx * 0.18} ${e.ry * 0.42} ${e.rx * 0.03} ${e.ry * 0.86}"
      stroke="${sh}" stroke-width="1.3" fill="none" opacity=".7"/>`;
  if(st.lineup && !simple)
    front += `<path d="M${50 - e.rx * 0.94} ${g.top + st.line + 1.2} q${e.rx * 0.94} -2.6 ${e.rx * 1.88} 0" stroke="${sh}" stroke-width="1.1" fill="none" opacity=".8"/>`;
  return { back, main, front };
}

/* ---------- چهره‌ی کامل ---------- */
function playerFaceSVG(seed, opts){
  const o = opts || {};
  const ck = fgCacheKey(seed, o);
  if(FG_CACHE.has(ck)) return FG_CACHE.get(ck);
  const s = faceSpec(seed, o);
  /* سه سطح جزئیات (مستقل از اندازه‌ی چیدمان):
       full   : پروفایل بازیکن و تابلوی پخش زنده — همه‌ی جزئیات
       simple : پیش‌فرض چهره‌های کوچک — بدون فرreckle/چین‌وچروک
       lean   : فهرست‌های بلند (بازار/فهرست تیم) — بدون گرادیان و جزئیات ریز
     نتیجه: صفحه‌های سنگین موبایل چند برابر سبک‌تر می‌شوند.            */
  const detail = o.detail || ((o.size === 'xs' || o.size === 'sm') ? 'simple' : 'full');
  const simple = detail !== 'full';
  const lean = detail === 'lean';
  const g = fgGeom(s.shape, s.mods);
  const uid = 'fg' + (fgHash(seed + '|' + (o.size || 'md') + '|' + detail + '|' + ((o.kit && o.kit.c1) || '-'), 'uid') % 999983).toString(36);
  const kit = o.kit || { c1:'#1f2937', c2:'#0b1220' };
  const collar1 = kit.c1 || '#1f2937', collar2 = kit.c2 || '#0b1220';
  const hair = fgHair(g, s, simple, lean);
  const skinShadow = fgMix(s.skinSh, '#000', 0.18);

  const svg = `<svg viewBox="0 0 100 120" width="100%" height="100%" class="face-svg" role="img" aria-label="چهره" preserveAspectRatio="xMidYMid slice">
  ${lean ? '' : `<defs>
    <radialGradient id="${uid}s" cx="36%" cy="28%" r="78%">
      <stop offset="0%" stop-color="${s.skinHi}"/><stop offset="62%" stop-color="${s.skin.base}"/><stop offset="100%" stop-color="${s.skinSh}"/>
    </radialGradient>
    <linearGradient id="${uid}c" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${collar2}"/><stop offset="100%" stop-color="${fgMix(collar1, '#000', 0.25)}"/>
    </linearGradient>
  </defs>`}
  ${hair.back}
  <!-- تن و یقه -->
  <path d="M14 120 C17 103 33 95 50 95 C67 95 83 103 86 120 Z" fill="${lean ? fgMix(collar1, '#000', 0.18) : `url(#${uid}c)`}"/>
  ${lean ? '' : `<path d="M40 96 C44 104 56 104 60 96 L64 97 C60 108 40 108 36 97 Z" fill="${fgMix(collar2, '#000', 0.35)}"/>`}
  <!-- گردن -->
  ${lean ? '' : `<path d="M41 ${g.bottom - 8} h18 v14 q-9 6 -18 0 Z" fill="${skinShadow}"/>
  <path d="M41 ${g.bottom - 8} h18 v7 q-9 5 -18 0 Z" fill="#000" opacity=".16"/>`}
  <!-- سر -->
  <path d="${fgHeadPath(g, 0)}" fill="${lean ? s.skin.base : `url(#${uid}s)`}"/>
  ${lean ? '' : `<path d="${fgHeadPath(g, 0)}" fill="none" stroke="${s.skinSh}" stroke-width=".8" opacity=".55"/>`}
  <!-- گوش‌ها -->
  ${lean ? '' : `<ellipse cx="${50 - g.w - 1.4}" cy="${g.earY}" rx="3.1" ry="${g.h * 0.082}" fill="${s.skin.base}" stroke="${s.skinSh}" stroke-width=".6"/>
  <ellipse cx="${50 + g.w + 1.4}" cy="${g.earY}" rx="3.1" ry="${g.h * 0.082}" fill="${s.skin.base}" stroke="${s.skinSh}" stroke-width=".6"/>`}
  ${(!simple && s.earring) ? `<circle cx="${50 - g.w - 1.4}" cy="${g.earY + g.h * 0.075}" r="1.2" fill="#fbbf24"/>` : ''}
  <!-- سایه‌های طبیعی صورت -->
  ${lean ? '' : `<ellipse cx="${50 - g.w * 0.62}" cy="${g.cheekY + g.h * 0.06}" rx="${g.w * 0.30}" ry="${g.h * 0.10}" fill="${s.skinSh}" opacity=".22"/>
  <ellipse cx="${50 + g.w * 0.62}" cy="${g.cheekY + g.h * 0.06}" rx="${g.w * 0.30}" ry="${g.h * 0.10}" fill="${s.skinSh}" opacity=".22"/>`}
  <path d="M${50 - g.w * 0.9} ${g.top + g.h * 0.14} C${50 - g.w * 0.5} ${g.top + g.h * 0.20} ${50 + g.w * 0.5} ${g.top + g.h * 0.20} ${50 + g.w * 0.9} ${g.top + g.h * 0.14}
    L${50 + g.w * 0.96} ${g.top + g.h * 0.24} C${50 + g.w * 0.5} ${g.top + g.h * 0.30} ${50 - g.w * 0.5} ${g.top + g.h * 0.30} ${50 - g.w * 0.96} ${g.top + g.h * 0.24} Z"
    fill="${s.skinSh}" opacity=".10"/>
  ${(!simple && s.freckles) ? [0, 1, 2, 3, 4, 5].map(i=>{
      const side = i % 2 ? 1 : -1;
      const px = 50 + side * (g.w * (0.34 + 0.14 * (i % 3)));
      const py = g.cheekY + g.h * (0.02 + 0.03 * (i % 4));
      return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(0.7 + (i % 2) * 0.3).toFixed(1)}" fill="${s.skinSh}" opacity=".55"/>`;
    }).join('') : ''}
  ${(!simple && s.dimple) ? `<path d="M${50 - g.w * 0.42} ${g.mouthY - g.h * 0.02} q1.4 1.6 0 3" stroke="${s.skinSh}" stroke-width=".8" fill="none" opacity=".5"/>
    <path d="M${50 + g.w * 0.42} ${g.mouthY - g.h * 0.02} q-1.4 1.6 0 3" stroke="${s.skinSh}" stroke-width=".8" fill="none" opacity=".5"/>` : ''}
  ${fgBeard(g, s)}
  ${fgEye(g, s, -1, lean)}${fgEye(g, s, 1, lean)}
  ${fgBrow(g, s, -1)}${fgBrow(g, s, 1)}
  ${fgNose(g, s, lean)}
  ${fgMouth(g, s, lean)}
  ${hair.main}
  ${hair.front}
  ${s.headband ? `<path d="M${50 - fgSkull(g, s.hair.t || 4).rx * 0.99} ${g.top + g.h * 0.17} q${fgSkull(g, s.hair.t || 4).rx * 0.99} -3 ${fgSkull(g, s.hair.t || 4).rx * 1.98} 0 l0 3.2 q-${fgSkull(g, s.hair.t || 4).rx * 0.99} -3 -${fgSkull(g, s.hair.t || 4).rx * 1.98} 0 Z" fill="#e11d48" opacity=".9"/>` : ''}
</svg>`;
  const out = fgTidy(svg, simple || lean);   /* گِرد کردن اعداد + فشرده‌سازی ⇒ چهره‌ی سبک برای موبایل */
  if(FG_CACHE.size > 600) FG_CACHE.clear();
  FG_CACHE.set(ck, out);
  return out;
}
/* گِرد کردن اعداد اعشاری و حذف فاصله‌های اضافی (~۵٫۵KB → ~۳KB) */
function fgTidy(svg, integers){
  return String(svg)
    .replace(/(\d+\.\d+)/g, m=> integers ? String(Math.round(Number(m))) : String(Math.round(Number(m) * 10) / 10))
    .replace(/\n\s*/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

/* بدنه‌ی چهره بدون پوشش <svg> — برای قرار دادن داخل <symbol> */
function faceBodySVG(seed, opts){
  return playerFaceSVG(seed, opts)
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>$/, '');
}

/* ---------- توضیح متنی چهره (برای پروفایل بازیکن) ---------- */
function faceText(seed){
  const s = faceSpec(seed);
  return s.desc;
}
function faceTraits(seed){
  const s = faceSpec(seed);
  return s.traits;
}
/* ============================================================
   ۵) مشخصات بدنی بازیکن (قد/وزن/پای تخصصی) — قطعی از همان شناسه
   ------------------------------------------------------------
   این‌ها «ظاهر فیزیکی» بازیکن را کامل می‌کنند و مثل چهره، بدون
   هیچ داده‌ی سروری روی کلاینت ساخته می‌شوند.
   ============================================================ */
function faceBody(seed, pos){
  const h = fgHash(seed, 'body');
  const position = String(pos || 'MF').toUpperCase();
  /* قد: دروازه‌بان و مدافع بلندتر، هافبک/مهاجم سبک‌تر */
  const base = position === 'GK' ? 187 : position === 'DF' ? 184 : position === 'MF' ? 178 : 180;
  const height = base + (h % 11) - 5;                       /* ±۵ سانتی‌متر */
  const bmiBase = position === 'GK' ? 23.4 : position === 'DF' ? 22.8 : position === 'MF' ? 22.0 : 21.8;
  const weight = Math.round((bmiBase + ((h >> 5) % 30) / 10 - 1.5) * Math.pow(height / 100, 2));
  const foot = ((h >> 9) % 100) < 22 ? 'چپ' : (((h >> 12) % 100) < 12 ? 'دوطرفه' : 'راست');
  const build = ['لاغر', 'معمولی', 'ورزیده', 'تنومند'][(h >> 15) % 4];
  const jump = 44 + ((h >> 6) % 22);                        /* پرش عمودی سانتی‌متر */
  const speed = 27 + ((h >> 3) % 12);                       /* ۳۰ متر: ثانیه‌ی صدم */
  return {
    height, weight, foot, build, jump,
    sprint: (speed / 10).toFixed(1),
    line: `${height} سانتی‌متر · ${weight} کیلوگرم · ${build}`,
    detail: `پای تخصصی: ${foot} · پرش ${jump} سانت · دوی ۳۰ متر ${(speed / 10).toFixed(1)} ثانیه`
  };
}

/* ---------- آمار تنوع (برای تست و نمایش) ---------- */
function faceCombos(){
  return FG_SHAPES.length * FG_SKINS.length * FG_HAIRS.length * FG_HAIRC.length *
         FG_EYES.length * FG_EYEC.length * FG_BEARDS.length * FG_NOSES.length * FG_MOUTHS.length * FG_BROWS.length *
         81;   /* ۳ پهنای صورت × ۳ بلندی سر × ۳ فاصله‌ی چشم × ۳ جای چشم */
}
