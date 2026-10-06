/* ============================================================
   svg.js — تولید کاملاً آفلاین چهره بازیکن، آرم باشگاه و کارت بازیکن
   ============================================================ */

/* ================= LOCAL SVG AVATAR / CREST (no network, always renders) ================= */
let _svgIdCounter = 0;
function nextId(){ return 'g'+(_svgIdCounter++); }
function hashSeed(str){ let h=0; str=String(str); for(let i=0;i<str.length;i++){ h=(h*31+str.charCodeAt(i))>>>0; } return h; }

const SKIN_TONES=['#f2c9a1','#e0ac69','#c68642','#8d5524','#ffdbac','#d8a774'];
const HAIR_COLORS=['#2c1b0e','#4a3222','#7a4b2a','#1a1a1a','#a56b3e','#e8c268','#5b3a29'];
const BG_PAIRS=[['#22d3ee','#0d1730'],['#34d399','#0a0f1f'],['#7c5cff','#0d1730'],['#fbbf24','#0a0f1f'],['#f4614f','#0d1730'],['#38bdf8','#0d1730']];

function avatarSVG(seed, morale){
  const h = hashSeed(seed);
  const skin = SKIN_TONES[h % SKIN_TONES.length];
  const hair = HAIR_COLORS[Math.floor(h/7) % HAIR_COLORS.length];
  const bg = BG_PAIRS[Math.floor(h/13) % BG_PAIRS.length];
  const jersey = BG_PAIRS[Math.floor(h/17) % BG_PAIRS.length][0];
  const hairStyle = Math.floor(h/19) % 5;
  const hasStubble = Math.floor(h/23) % 3 === 0;
  const gid = nextId();
  const mood = (morale===undefined||morale===null) ? 'neutral' : (morale>=68?'happy':(morale>=42?'neutral':'sad'));
  let mouthPath;
  if(mood==='happy') mouthPath = 'M 39 63 Q 50 71 61 63';
  else if(mood==='sad') mouthPath = 'M 39 66 Q 50 60 61 66';
  else mouthPath = 'M 40 64 H 60';
  let preHair='', postHair='';
  if(hairStyle===1) postHair = `<path d="M 21 38 Q 50 8 79 38 L 79 24 Q 50 0 21 24 Z" fill="${hair}"/>`;
  else if(hairStyle===2) preHair = `<circle cx="50" cy="32" r="27" fill="${hair}"/>`;
  else if(hairStyle===3) postHair = `<path d="M 19 36 Q 23 6 50 8 Q 77 6 81 36 L 75 36 Q 71 16 50 16 Q 29 16 25 36 Z" fill="${hair}"/>`;
  else if(hairStyle===4) postHair = `<path d="M 24 30 Q 40 4 50 14 Q 60 4 76 30 L 70 30 Q 60 14 50 22 Q 40 14 30 30 Z" fill="${hair}"/>`;
  const stubble = hasStubble ? `<path d="M 30 52 Q 50 62 70 52 L 68 58 Q 50 66 32 58 Z" fill="#000" opacity="0.14"/>` : '';
  return `<svg viewBox="0 0 100 100" width="100%" height="100%">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg[0]}"/><stop offset="100%" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="100" height="100" rx="22" fill="url(#${gid})"/>
    <path d="M 14 100 Q 50 74 86 100 Z" fill="${jersey}"/>
    <rect x="43" y="60" width="14" height="16" fill="${skin}"/>
    ${preHair}
    <circle cx="50" cy="42" r="24" fill="${skin}"/>
    <ellipse cx="26" cy="44" rx="3" ry="4" fill="${skin}"/><ellipse cx="74" cy="44" rx="3" ry="4" fill="${skin}"/>
    ${postHair}
    ${stubble}
    <rect x="35" y="35" width="9" height="2.4" rx="1.2" fill="${hair}" opacity="0.85"/>
    <rect x="56" y="35" width="9" height="2.4" rx="1.2" fill="${hair}" opacity="0.85"/>
    <circle cx="39.5" cy="43" r="2.6" fill="#20222a"/><circle cx="60.5" cy="43" r="2.6" fill="#20222a"/>
    <path d="${mouthPath}" stroke="#7a3b2e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  </svg>`;
}
/* آرم باشگاه: شکل + الگوی پارچه + ستاره — همه از هش نام (قطعی و آفلاین) */
const CREST_PALETTE = [
  ['#e11d48','#4c0519'], ['#2563eb','#0b1220'], ['#059669','#032a1c'], ['#f59e0b','#3b2200'],
  ['#7c3aed','#1b0a33'], ['#0891b2','#052a33'], ['#dc2626','#450a0a'], ['#0f172a','#334155'],
  ['#db2777','#3f0722'], ['#65a30d','#1a2e05'], ['#0ea5e9','#082f49'], ['#f8fafc','#1e293b']
];
const CREST_PATTERNS = ['solid','stripes','halves','sash','hoops','pinstripe'];
function crestSVG(seed){
  const h = hashSeed(seed);
  const pal = CREST_PALETTE[h % CREST_PALETTE.length];
  const c1 = pal[0], c2 = pal[1];
  const shapeIdx = Math.floor(h / 9) % 4;
  const pattern = CREST_PATTERNS[Math.floor(h / 13) % CREST_PATTERNS.length];
  const stars = (Math.floor(h / 17) % 7 === 0) ? 2 : (Math.floor(h / 17) % 3 === 0 ? 1 : 0);
  const gid = nextId(), cid = nextId();
  const letter = (String(seed).trim().split('')[0] || '?').toUpperCase();
  let shape;
  if(shapeIdx === 0)      shape = 'M10 8 H90 V52 Q90 82 50 96 Q10 82 10 52 Z';      /* سپر کلاسیک */
  else if(shapeIdx === 1) shape = 'M50 4 L92 24 V58 Q92 82 50 96 Q8 82 8 58 V24 Z'; /* سپر نوک‌تیز */
  else if(shapeIdx === 2) shape = 'M50 4 A46 46 0 1 1 49.9 4 Z';                    /* دایره */
  else                    shape = 'M50 3 L94 50 L50 97 L6 50 Z';                    /* لوزی */
  let pat = '';
  if(pattern === 'stripes')        pat = [0,1,2,3,4,5].map(i=>`<rect x="${8 + i * 15}" y="0" width="8" height="100" fill="${c2}" opacity=".8"/>`).join('');
  else if(pattern === 'halves')    pat = `<rect x="50" y="0" width="50" height="100" fill="${c2}" opacity=".8"/>`;
  else if(pattern === 'sash')      pat = `<path d="M-6 88 L58 -6 L86 -6 L22 88 Z" fill="${c2}" opacity=".75"/>`;
  else if(pattern === 'hoops')     pat = [0,1,2,3].map(i=>`<rect x="0" y="${18 + i * 20}" width="100" height="9" fill="${c2}" opacity=".75"/>`).join('');
  else if(pattern === 'pinstripe') pat = [0,1,2,3,4,5,6].map(i=>`<rect x="${9 + i * 13}" y="0" width="3" height="100" fill="${c2}" opacity=".6"/>`).join('');
  return `<svg viewBox="0 0 100 100" width="100%" height="100%" class="crest-svg">
    <defs>
      <clipPath id="${cid}"><path d="${shape}"/></clipPath>
      <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
      </linearGradient>
    </defs>
    <g clip-path="url(#${cid})">
      <rect width="100" height="100" fill="url(#${gid})"/>
      ${pat}
      <rect width="100" height="100" fill="url(#${gid})" opacity=".16"/>
      <path d="M0 74 Q50 58 100 74 V100 H0 Z" fill="#000" opacity=".2"/>
    </g>
    <path d="${shape}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="3" stroke-linejoin="round"/>
    <text x="50" y="${shapeIdx === 3 ? 63 : 61}" font-size="36" font-weight="900" text-anchor="middle"
      fill="#fff" font-family="Vazirmatn,sans-serif" opacity=".95">${letter}</text>
    ${stars ? `<g fill="#fde68a" opacity=".95">${Array.from({length:stars},(_,i)=>`<path transform="translate(${33 + i * 20},${shapeIdx === 2 ? 84 : 82}) scale(.42)" d="M12 2l3 7 8 .6-6 5 1.8 7.8L12 18l-7 4.4L7 14.6 1 9.6 9 9z"/></g>`).join('')}</g>` : ''}
  </svg>`;
}
/* چهره‌ی بازیکن: اگر کیت تصویری (assets.js) بارگذاری شده باشد پرتره‌ی واقعی،
   وگرنه همان آدمک SVG — پس همیشه چیزی برای دیدن هست، حتی کاملاً آفلاین */
function avatarImg(seed, cls, morale){
  if(typeof faceImg === 'function') return faceImg(seed, { size: 'sm', cls: cls || '' });
  return `<div class="avatar ${cls||''}">${avatarSVG(seed, morale)}</div>`;
}
function crestImg(seed, cls){ return `<div class="crest ${cls||''}">${crestSVG(seed)}</div>`; }
function posColor(pos){ return {GK:'#8b93ff', DF:'#34d399', MF:'#fbbf24', FW:'#f4614f'}[pos] || '#93a1b8'; }
function jerseyNumber(seed){ return 1 + (hashSeed(String(seed)+'#num') % 99); }
function playerRowHTML(p, rightHtml, opts){
  opts = opts || {};
  const bg = opts.highlight ? 'background:rgba(34,211,238,0.08); border-radius:14px;' : '';
  return `<div class="player-row" style="border-inline-start:3px solid ${posColor(p.position)}; ${bg}" ${opts.onclick?`onclick="${opts.onclick}"`:''}>
    <div class="jersey-num">${jerseyNumber(p.id)}</div>
    ${avatarImg(p.id,'',p.morale)}
    <div style="flex:1; min-width:0;">
      <div class="name">${p.name} <span class="pill ${p.position.toLowerCase()}">${p.position}</span>${opts.badges||''}</div>
      <div class="meta">${opts.meta||''}</div>
    </div>
    ${rightHtml||''}
  </div>`;
}
