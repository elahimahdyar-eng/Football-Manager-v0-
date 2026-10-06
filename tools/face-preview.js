/* ============================================================
   tools/face-preview.js — پیش‌نمایش متنی چهره‌های تولیدشده
   ------------------------------------------------------------
   در این محیط مرورگر/رندرگر SVG نداریم. این ابزار خودِ SVG
   خروجی موتور چهره را «رستر» می‌کند (پارس path/ellipse/circle/
   stroke + پر کردن even-odd) و به شکل کاراکتری چاپ می‌کند تا
   بتوان ترکیب‌بندی چهره (خط سر، مو، چشم، ریش) را چشمی بررسی کرد.
   اجرا:  node tools/face-preview.js [seedOffset] [count]
   ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Math, JSON, String, Number, Array, Object, isNaN, parseInt, parseFloat });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/facegen.js'), 'utf8'), ctx, { filename: 'js/facegen.js' });
const api = ctx;

/* ---------- پارس path به چندضلعی‌های تخت‌شده ---------- */
function parsePath(d){
  const toks = String(d).match(/[MmLlCcQqAaZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  const subs = [];
  let cur = [], x = 0, y = 0, sx = 0, sy = 0, i = 0;
  const num = ()=> Number(toks[i++]);
  const flattenCubic = (x0, y0, x1, y1, x2, y2, x3, y3, out)=>{
    for(let t = 1; t <= 14; t++){
      const u = t / 14, mu = 1 - u;
      out.push([
        mu*mu*mu*x0 + 3*mu*mu*u*x1 + 3*mu*u*u*x2 + u*u*u*x3,
        mu*mu*mu*y0 + 3*mu*mu*u*y1 + 3*mu*u*u*y2 + u*u*u*y3
      ]);
    }
  };
  const flattenQuad = (x0, y0, x1, y1, x2, y2, out)=>{
    for(let t = 1; t <= 12; t++){
      const u = t / 12, mu = 1 - u;
      out.push([mu*mu*x0 + 2*mu*u*x1 + u*u*x2, mu*mu*y0 + 2*mu*u*y1 + u*u*y2]);
    }
  };
  while(i < toks.length){
    const c = toks[i++];
    if(c === 'M' || c === 'm'){
      if(cur.length) subs.push(cur);
      x = (c === 'm' ? x : 0) + num(); y = (c === 'm' ? y : 0) + num();
      sx = x; sy = y; cur = [[x, y]];
    } else if(c === 'L' || c === 'l'){
      x = (c === 'l' ? x : 0) + num(); y = (c === 'l' ? y : 0) + num(); cur.push([x, y]);
    } else if(c === 'C' || c === 'c'){
      const bx = c === 'c' ? x : 0, by = c === 'c' ? y : 0;
      const x1 = bx + num(), y1 = by + num(), x2 = bx + num(), y2 = by + num(), x3 = bx + num(), y3 = by + num();
      flattenCubic(x, y, x1, y1, x2, y2, x3, y3, cur); x = x3; y = y3;
    } else if(c === 'Q' || c === 'q'){
      const bx = c === 'q' ? x : 0, by = c === 'q' ? y : 0;
      const x1 = bx + num(), y1 = by + num(), x2 = bx + num(), y2 = by + num();
      flattenQuad(x, y, x1, y1, x2, y2, cur); x = x2; y = y2;
    } else if(c === 'A' || c === 'a'){
      const rx = num(), ry = num(); num();
      const large = num(), sweep = num();
      const ex = (c === 'a' ? x : 0) + num(), ey = (c === 'a' ? y : 0) + num();
      const cx = (x + ex) / 2, cy = (y + ey) / 2;
      const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ey - cy, ex - cx);
      /* در SVG محور y رو به پایین است: sweep=1 ⇒ زاویه افزایشی (روی صفحه ساعتگرد) */
      let span = a1 - a0;
      if(sweep === 1){ while(span < 0) span += Math.PI * 2; while(span > Math.PI * 2) span -= Math.PI * 2; if(large && span < Math.PI) span -= Math.PI * 2; }
      else { while(span > 0) span -= Math.PI * 2; while(span < -Math.PI * 2) span += Math.PI * 2; if(large && span > -Math.PI) span += Math.PI * 2; }
      for(let t = 1; t <= 18; t++){
        const a = a0 + span * t / 18;
        cur.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
      }
      x = ex; y = ey;
    } else if(c === 'Z' || c === 'z'){
      if(cur.length){ cur.push([sx, sy]); subs.push(cur); cur = []; }
    } else { /* عدد بدون دستور ⇒ ادامه‌ی آخرین دستور را ساده رد می‌کنیم */ }
  }
  if(cur.length) subs.push(cur);
  return subs;
}
function insidePolys(polys, px, py){
  let cross = 0;
  for(const poly of polys){
    for(let k = 0; k < poly.length - 1; k++){
      const [x1, y1] = poly[k], [x2, y2] = poly[k + 1];
      if((y1 > py) !== (y2 > py)){
        const xi = x1 + (py - y1) * (x2 - x1) / (y2 - y1);
        if(xi > px) cross++;
      }
    }
  }
  return cross % 2 === 1;
}
function nearPoly(polys, px, py, half){
  for(const poly of polys){
    for(let k = 0; k < poly.length - 1; k++){
      const [x1, y1] = poly[k], [x2, y2] = poly[k + 1];
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx*dx + dy*dy || 1;
      let t = ((px - x1) * dx + (py - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t*dx - px, ey = y1 + t*dy - py;
      if(ex*ex + ey*ey <= half*half) return true;
    }
  }
  return false;
}

/* ---------- رستر کردن SVG ---------- */
const LAYER_CHAR = [
  [/^url\(#.*c\)$/, '='],        /* پیراهن */
  [/^url\(#.*s\)$/, '.'],        /* پوست سر */
  [/^#f7f4f0$/, 'o'],             /* سفیدی چشم */
  [/^#160f0a$/, 'O'],             /* مردمک */
  [/^#fff$/, '*'],                /* برق چشم */
  [/^#000$/, ' '],
  [/^#fbbf24$/, '$'],             /* گوشواره */
  [/^#e11d48$/, 'B'],             /* بند مو */
];
function charFor(attrs){
  const fill = attrs.fill || '', stroke = attrs.stroke || '';
  const probe = fill || stroke;
  for(const [re, ch] of LAYER_CHAR) if(re.test(probe)) return ch;
  if(fill === 'none' && stroke) return '-';
  if(fill && Number(attrs['stroke-width'] || 0) > 0 && fill === 'none') return '-';
  return '#';
}
function render(svg, cols, rows, crop){
  const grid = Array.from({ length: rows }, ()=> Array(cols).fill(' '));
  const crop0 = crop || { x0: 0, y0: 0, x1: 100, y1: 120 };
  const vw = crop0.x1 - crop0.x0, vh = crop0.y1 - crop0.y0;
  const sx = cols / vw, sy = rows / vh;
  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let m;
  while((m = tagRe.exec(svg))){
    const closing = m[1] === '/', tag = m[2].toLowerCase(), attrStr = m[3], selfClose = m[4] === '/';
    if(closing){ if(tag === 'g') stack.pop(); continue; }
    const attrs = {};
    attrStr.replace(/([\w:-]+)\s*=\s*"([^"]*)"/g, (_, k, v)=>{ attrs[k] = v; return ''; });
    if(tag === 'g' || tag === 'defs'){ stack.push(attrs.transform || ''); if(selfClose) stack.pop(); continue; }
    if(tag === 'defs') continue;
    if(!/^(path|ellipse|circle)$/.test(tag)) continue;
    const tf = stack[stack.length - 1] || '';
    const rot = /rotate\(([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\)/.exec(tf);
    const paint = (px, py)=>{
      if(rot){
        const a = Number(rot[1]) * Math.PI / 180, cx = Number(rot[2]), cy = Number(rot[3]);
        const dx = px - cx, dy = py - cy;
        px = cx + dx * Math.cos(a) - dy * Math.sin(a);
        py = cy + dx * Math.sin(a) + dy * Math.cos(a);
      }
      if(tag === 'ellipse') return insideEllipse(px, py, attrs);
      if(tag === 'circle') return insideCircle(px, py, attrs);
      const polys = parsePath(attrs.d || '');
      const strokeOnly = (attrs.fill === 'none' || !attrs.fill) && attrs.stroke && attrs.stroke !== 'none';
      if(strokeOnly) return nearPoly(polys, px, py, (Number(attrs['stroke-width']) || 1) / 2);
      if(attrs.opacity !== undefined && Number(attrs.opacity) < 0.35) return false;   /* سایه‌های محو */
      return insidePolys(polys, px, py);
    };
    const ch = charFor(attrs);
    for(let r = 0; r < rows; r++){
      for(let col = 0; col < cols; col++){
        const px = crop0.x0 + (col + 0.5) / sx, py = crop0.y0 + (r + 0.5) / sy;
        if(paint(px, py)) grid[r][col] = ch;
      }
    }
    if(tag === 'g' && !selfClose) stack.push(tf);
  }
  return grid.map(r=> r.join('')).join('\n');
}
function insideEllipse(px, py, a){
  const cx = Number(a.cx), cy = Number(a.cy), rx = Number(a.rx), ry = Number(a.ry);
  const dx = (px - cx) / rx, dy = (py - cy) / ry;
  return dx*dx + dy*dy <= 1;
}
function insideCircle(px, py, a){
  const cx = Number(a.cx), cy = Number(a.cy), r = Number(a.r);
  const dx = px - cx, dy = py - cy;
  return dx*dx + dy*dy <= r*r;
}

/* ---------- اجرا ---------- */
const offset = Number(process.argv[2] || 0);
const count = Math.min(12, Number(process.argv[3] || 3));
const zoom = (process.argv[4] || '') === 'zoom';
for(let i = 0; i < count; i++){
  const seed = process.argv[5] || ('p' + (offset + i));
  const svg = api.playerFaceSVG(seed, { kit:{ c1:'#2563eb', c2:'#0b1220' } });
  const spec = api.faceSpec(seed);
  console.log(`\n=== ${seed} — ${spec.desc} | ${spec.traits} ===`);
  if(zoom){
    console.log('--- نمای نزدیک: چشم/بینی/دهان (y 30..80) ---');
    console.log(render(svg, 92, 40, { x0: 18, y0: 30, x1: 82, y1: 80 }));
  } else {
    console.log(render(svg, 60, 34));
  }
}
