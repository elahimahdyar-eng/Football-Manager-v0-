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
function crestSVG(seed){
  const h = hashSeed(seed);
  const c1 = BG_PAIRS[h % BG_PAIRS.length][0];
  const c2 = ['#0d1730','#0a0f1f','#132038','#101827'][Math.floor(h/5)%4];
  const shapeIdx = Math.floor(h/9)%3;
  const gid = nextId();
  const letter = (String(seed).trim()[0]||'?').toUpperCase();
  let shapePath;
  if(shapeIdx===0) shapePath = `<path d="M10 6 H90 V50 Q90 82 50 96 Q10 82 10 50 Z" fill="url(#${gid})" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>`;
  else if(shapeIdx===1) shapePath = `<polygon points="50,4 92,27 92,73 50,96 8,73 8,27" fill="url(#${gid})" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>`;
  else shapePath = `<circle cx="50" cy="50" r="46" fill="url(#${gid})" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>`;
  return `<svg viewBox="0 0 100 100" width="100%" height="100%">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    ${shapePath}
    <text x="50" y="63" font-size="40" font-weight="800" text-anchor="middle" fill="#ffffff" font-family="Vazirmatn, sans-serif" opacity="0.92">${letter}</text>
  </svg>`;
}
function avatarImg(seed, cls, morale){ return `<div class="avatar ${cls||''}">${avatarSVG(seed, morale)}</div>`; }
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
