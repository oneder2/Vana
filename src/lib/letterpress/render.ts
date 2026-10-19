import { FONTS, FORMATS, MATERIALS, MAX_TEXT, seededRandom, type LetterDesign, type LetterMark } from './model';

type Context = CanvasRenderingContext2D;
export interface LetterLayout { overflow: boolean; lines: number; capacity: number }
const TAU = Math.PI * 2;

function line(c: Context, x: number, y: number, x2: number, y2: number, color: string, width = 1) {
  c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.stroke();
}
function ellipse(c: Context, x: number, y: number, rx: number, ry: number, color: string | CanvasGradient) {
  c.beginPath(); c.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), 0, 0, TAU); c.fillStyle = color; c.fill();
}
function irregular(c: Context, radius: number, random: () => number, points = 35) {
  c.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = i / points * TAU, r = radius * (.75 + random() * .28);
    if (i === 0) c.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else c.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  c.closePath();
}

/** A closed, seeded contour shared by visible edges and the final cutout mask. */
function organicPath(radius: number, seed: number, roughness = .1, points = 96): Path2D {
  const path = new Path2D(), random = seededRandom(seed), phase = random() * TAU;
  const vertices = Array.from({ length: points }, (_, i) => {
    const a = i / points * TAU;
    const r = radius * (1 + Math.sin(a * 3 + phase) * .12 + Math.sin(a * 7 - phase) * .045 + (random() - .5) * roughness);
    return [Math.cos(a) * r, Math.sin(a) * r * .91];
  });
  path.moveTo(vertices[0][0], vertices[0][1]);
  vertices.slice(1).forEach(([x,y]) => path.lineTo(x,y)); path.closePath(); return path;
}
function damagePath(kind: 'burn' | 'tear', radius: number, seed: number): Path2D {
  if (kind === 'burn') return organicPath(radius * .44, seed, .17);
  const path = new Path2D(), random = seededRandom(seed);
  const count = 50, upper: number[][] = [], lower: number[][] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count, x = (t * 2 - 1) * radius;
    const bend = Math.sin(t * Math.PI * 2) * radius * .055;
    const width = Math.sin(t * Math.PI) ** .5;
    upper.push([x, bend - (2 + random() * 15) * width]);
    lower.push([x, bend + (3 + random() * 12) * width]);
  }
  path.moveTo(upper[0][0], upper[0][1]);
  [...upper.slice(1), ...lower.reverse()].forEach(([x,y]) => path.lineTo(x,y));
  path.closePath(); return path;
}

// Keep fine grain at the same scale in previews and exported images. A small
// bounded cache avoids rebuilding pixel noise while dragging a mark or slider.
const grainTiles = new Map<string, HTMLCanvasElement>();
function surfaceGrain(c: Context, d: LetterDesign, w: number, h: number) {
  const key = `${d.material}:${d.seed}`;
  let tile = grainTiles.get(key);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = tile.height = 256;
    const context = tile.getContext('2d');
    if (!context) return;
    const image = context.createImageData(256, 256), random = seededRandom(d.seed ^ 0x5f3759df);
    const rough = d.material === 'stone';
    for (let i = 0; i < image.data.length; i += 4) {
      const light = random() > .5, tone = light ? 255 : 0;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = tone;
      image.data[i + 3] = Math.round(random() * (rough ? 14 : d.material === 'terminal' ? 3 : 6));
    }
    context.putImageData(image, 0, 0);
    if (grainTiles.size >= 12) grainTiles.delete(grainTiles.keys().next().value!);
    grainTiles.set(key, tile);
  }
  const pattern = c.createPattern(tile, 'repeat');
  if (pattern) { c.fillStyle = pattern; c.fillRect(48, 48, w - 96, h - 96); }
}

function paperFinish(c: Context, d: LetterDesign, w: number, h: number, random: () => number) {
  const letter = d.material === 'letter';
  // Broad pulp variation sits underneath the fibres, instead of looking like
  // evenly scattered dots. Card stock stays cooler and more tightly pressed.
  for (let i = 0; i < 24; i++) {
    const x = random() * w, y = random() * h, radius = 70 + random() * 210;
    const cloud = c.createRadialGradient(x, y, 0, x, y, radius);
    cloud.addColorStop(0, i % 3 ? (letter ? '#8f6a3220' : '#7293a015') : '#fffdf428');
    cloud.addColorStop(1, '#ffffff00');
    c.fillStyle = cloud; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 1500; i++) {
    const x = 49 + random() * (w - 98), y = 49 + random() * (h - 98);
    const length = 2 + random() ** 2 * (letter ? 25 : 11), bend = (random() - .5) * 4;
    c.beginPath(); c.moveTo(x, y);
    c.quadraticCurveTo(x + length * .5, y + bend, x + length, y + bend * .5);
    c.strokeStyle = i % 3 ? '#fffdf449' : letter ? '#735a322b' : '#56727d20';
    c.lineWidth = .35 + random() * .65; c.stroke();
  }
  // A soft edge patina follows distance to the sheet's edge, not its centre.
  for (const [x1, y1, x2, y2] of [[48, 0, 100, 0], [w - 48, 0, w - 100, 0], [0, 48, 0, 110], [0, h - 48, 0, h - 110]]) {
    const g = c.createLinearGradient(x1, y1, x2, y2);
    g.addColorStop(0, letter ? '#85602c32' : '#65818d22'); g.addColorStop(1, '#ffffff00');
    // Gradients clamp beyond their endpoints, so only paint the edge strip.
    c.fillStyle = g;
    if (x1) c.fillRect(Math.min(x1, x2), 48, Math.abs(x2 - x1), h - 96);
    else c.fillRect(48, Math.min(y1, y2), w - 96, Math.abs(y2 - y1));
  }
  if (letter) {
    for (const [position, horizontal] of [[w * .5, false], [h * .52, true]] as const) {
      const g = c.createLinearGradient(horizontal ? 0 : position - 10, horizontal ? position - 10 : 0, horizontal ? 0 : position + 12, horizontal ? position + 12 : 0);
      g.addColorStop(0, '#745b2a00'); g.addColorStop(.38, '#745b2a04');
      g.addColorStop(.48, '#745b2a27'); g.addColorStop(.55, '#fffbed65'); g.addColorStop(1, '#fffbed00');
      c.fillStyle = g;
      if (horizontal) c.fillRect(49, position - 10, w - 98, 22);
      else c.fillRect(position - 10, 49, 22, h - 98);
    }
  } else {
    // The cut edge of thick card catches the light on the upper-left side.
    line(c, 49, 49, w - 49, 49, '#ffffffbd', 2);
    line(c, 49, 49, 49, h - 49, '#ffffff7d', 2);
    line(c, 50, h - 49, w - 49, h - 49, '#455d6740', 2);
  }
}

function substrate(c: Context, d: LetterDesign, w: number, h: number) {
  const random = seededRandom(d.seed), palette = MATERIALS[d.material];
  const fill = c.createLinearGradient(0, 0, w, h);
  const colors = d.material === 'card' ? ['#f4f7f8', '#dee8ec'] : d.material === 'letter' ? ['#f3e3c0', '#ddc495']
    : d.material === 'stone' ? ['#73797b', '#353d43'] : d.material === 'arcane' ? ['#312b4c', '#171824'] : ['#0d282d', '#071619'];
  fill.addColorStop(0, colors[0]); fill.addColorStop(1, colors[1]); c.fillStyle = fill; c.fillRect(48, 48, w - 96, h - 96);
  if (d.material === 'card' || d.material === 'letter') paperFinish(c, d, w, h, random);
  c.strokeStyle = d.material === 'terminal' ? '#397c7e' : `${palette.ink}35`; c.lineWidth = 2; c.strokeRect(60, 60, w - 120, h - 120);
  if (d.material === 'card') {
    c.fillStyle = '#8baebc'; c.fillRect(48, 48, 9, h - 96);
    line(c, 100, 116, 160, 116, '#749aa9', 3);
  }
  surfaceGrain(c, d, w, h);
  if (d.material === 'arcane') {
    for (let i = 0; i < 850; i++) {
      const x = 50 + random() * (w - 100), y = 50 + random() * (h - 100);
      line(c, x, y, x + (random() - .5) * 9, y + random() * 2, i % 3 ? '#ffffff0b' : '#49351d0d', .4);
    }
  }
  if (d.material === 'stone') {
    for (let i = 0; i < 900; i++) {
      const x = 54 + random() * (w - 108), y = 54 + random() * (h - 108);
      const radius = .6 + random() ** 3 * 4;
      ellipse(c, x, y, radius, radius * .7, '#111a2240');
      line(c, x - radius * .6, y + radius * .7, x + radius * .4, y + radius * .7, '#e4e1d32e', .6);
    }
    for (let i = 0; i < 18; i++) {
      const x = random() * w, y = random() * h;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 80, y + 70, x - 140, y + 130, x + 60, y + 260);
      c.strokeStyle = '#101c2226'; c.lineWidth = 1 + random() * 3; c.stroke();
      c.save(); c.translate(-1, -1); c.strokeStyle = '#d0cdbd24'; c.lineWidth = .65; c.stroke(); c.restore();
    }
    line(c, 78, 78, w - 78, 78, '#cbd3d460', 3);
    line(c, 78, 78, 78, h - 78, '#cbd3d440', 3);
    line(c, 78, h - 78, w - 78, h - 78, '#101a2060', 4);
    line(c, w - 78, 78, w - 78, h - 78, '#101a2060', 4);
  }
  if (d.material === 'arcane') {
    const halo = c.createRadialGradient(w * .5, h * .53, 40, w * .5, h * .53, w * .65);
    halo.addColorStop(0, '#a57edc16'); halo.addColorStop(.6, '#684d8010'); halo.addColorStop(1, '#00000035');
    c.fillStyle = halo; c.fillRect(48, 48, w - 96, h - 96);
    c.save(); c.translate(w / 2, h * .55); c.strokeStyle = '#c4a0e42b';
    for (const r of [290, 315, 350]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
    for (let i = 0; i < 12; i++) {
      c.rotate(TAU / 12); line(c, 0, -315, 12, -337, '#c4a0e43b'); line(c, 12, -337, -10, -333, '#c4a0e43b');
    }
    for (let i = 0; i < 72; i++) {
      c.rotate(TAU / 72); line(c, 0, -347, 0, i % 6 ? -351 : -359, '#e2c69655', i % 6 ? .7 : 1.4);
    }
    c.restore();
    for (const x of [88, w - 88]) for (const y of [88, h - 88]) {
      c.save(); c.translate(x, y); c.rotate(Math.PI / 4); c.strokeStyle = '#d0acd3a0'; c.strokeRect(-7, -7, 14, 14); c.restore();
    }
  }
  if (d.material === 'terminal') {
    for (let y = 50; y < h - 48; y += 6) line(c, 50, y, w - 50, y, '#8cddca0a');
    c.fillStyle = '#548c891a'; c.fillRect(60, 60, w - 120, 56);
    c.font = '17px monospace'; c.fillStyle = '#90c9bd'; c.fillText('VANA / LOCAL TRANSMISSION', 88, 96);
    for (let i = 0; i < 3; i++) ellipse(c, w - 100 - i * 22, 88, 4, 4, '#90c9bd');
    line(c, 80, h - 100, w - 80, h - 100, '#548c8940');
    const glass = c.createLinearGradient(48, 48, w - 48, h - 48);
    glass.addColorStop(0, '#c3f2ec13'); glass.addColorStop(.3, '#b7e4e102');
    glass.addColorStop(.52, '#ffffff08'); glass.addColorStop(.55, '#ffffff00'); glass.addColorStop(1, '#00000020');
    c.fillStyle = glass; c.fillRect(48, 48, w - 96, h - 96);
    const vignette = c.createRadialGradient(w * .5, h * .45, w * .2, w * .5, h * .5, h * .66);
    vignette.addColorStop(0, '#02090b00'); vignette.addColorStop(.7, '#02090b15'); vignette.addColorStop(1, '#02090ba0');
    c.fillStyle = vignette; c.fillRect(48, 48, w - 96, h - 96);
    line(c, 50, 50, w - 50, 50, '#93c9c05c', 2);
  }
}

/** Wrap graphemes rather than UTF-16 units; preserve paragraphs and wide CJK. */
export function wrapLetterText(text: string, width: number, measure: (value: string) => number): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    let current = '';
    // Keep words intact when they fit; split long URLs and CJK by grapheme.
    const tokens: string[] = [];
    for (const { segment } of segmenter.segment(paragraph)) {
      if (/^[\p{Script=Latin}\p{Number}_'-]+$/u.test(segment) && tokens.length && /^[\p{Script=Latin}\p{Number}_'-]+$/u.test(tokens.at(-1)!)) tokens[tokens.length - 1] += segment;
      else tokens.push(segment);
    }
    for (const token of tokens) {
      if (current && measure(current + token) > width) { lines.push(current.trimEnd()); current = ''; }
      if (measure(token) <= width) { current += token; continue; }
      for (const { segment } of segmenter.segment(token)) {
        if (current && measure(current + segment) > width) { lines.push(current); current = ''; }
        current += segment;
      }
    }
    lines.push(current);
  }
  return lines;
}

function typography(c: Context, d: LetterDesign, w: number, h: number): LetterLayout {
  const ink = MATERIALS[d.material].ink, left = 48 + d.inset, width = w - left * 2;
  const x = d.align === 'left' ? left : d.align === 'right' ? w - left : w / 2;
  c.textAlign = d.align; c.textBaseline = 'alphabetic'; c.fillStyle = ink;
  const family = FONTS[d.font].family;
  const write = (text: string, x: number, y: number) => {
    c.save();
    if (d.material === 'stone') {
      // Mineral-filled incisions: a lit lower lip and a dark recessed edge.
      c.fillStyle = '#e6e5d244'; c.fillText(text, x, y + 1.5);
      c.fillStyle = '#152028b0'; c.fillText(text, x, y - .9);
      c.fillStyle = ink;
      c.shadowColor = '#10171ba0'; c.shadowOffsetY = -1; c.shadowBlur = 1.2;
    }
    c.fillText(text, x, y);
    c.restore();
  };
  if (d.material === 'terminal' || d.material === 'arcane') { c.shadowColor = `${ink}55`; c.shadowBlur = 8; }
  let top = d.material === 'terminal' ? 180 : 170;
  const titleSize = d.fontSize * 1.55;
  c.font = `${titleSize}px ${family}`;
  if (d.title.trim()) {
    for (const text of wrapLetterText(d.title, width, value => c.measureText(value).width)) {
      write(text, x, top); top += titleSize * 1.35;
    }
    top += 34;
  }
  c.font = `${d.fontSize}px ${family}`;
  const lines = wrapLetterText(d.text.slice(0, MAX_TEXT), width, value => c.measureText(value).width);
  const step = d.fontSize * d.lineHeight;
  const bottom = h - 48 - d.inset - (d.signature.trim() ? 70 : 0);
  const capacity = Math.max(0, Math.floor((bottom - top) / step) + 1);
  lines.slice(0, capacity).forEach((text, i) => write(text, x, top + i * step));
  c.shadowBlur = 0; c.shadowOffsetY = 0;
  if (d.signature.trim()) {
    c.font = `${d.fontSize * .7}px ${family}`; c.textAlign = 'right'; c.globalAlpha = .75;
    const signatureLines = wrapLetterText(d.signature, width, value => c.measureText(value).width);
    signatureLines.forEach((text, i) => write(text, w - left, h - 48 - d.inset + i * d.fontSize));
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.globalAlpha = 1;
    if (signatureLines.length > 1) return { overflow: true, lines: lines.length, capacity };
  }
  return { overflow: d.text.length > MAX_TEXT || lines.length > capacity || top > bottom, lines: lines.length, capacity };
}

function blood(c: Context, d: LetterDesign, m: LetterMark, r: number, random: () => number) {
  const absorbent = d.material === 'letter' || d.material === 'card';
  const glass = d.material === 'terminal';
  if (m.pattern === 'smear') {
    c.save();
    c.lineCap = 'round';
    if (absorbent) { c.shadowColor = '#7c27354d'; c.shadowBlur = r * .025; }
    for (let i = 0; i < 40; i++) {
      const y = (random() - .5) * r * .55, start = -r * (.2 + random() * .35);
      const length = r * (.4 + random()), drift = (random() - .5) * r * .12;
      const end = d.material === 'stone' && i % 3 === 0 ? length * .45 : length;
      c.beginPath(); c.moveTo(start, y);
      c.bezierCurveTo(0, y - r * .06, end * .55, y + drift, end, y + drift);
      c.strokeStyle = i % 3 ? '#641a2370' : '#a13a3f50';
      c.lineWidth = 1 + random() * r * .045; c.stroke();
      if (glass && i % 4 === 0) line(c, start * .5, y - 2, end * .7, y + drift - 2, '#e1b6b040', 1);
    }
    c.restore();
    return;
  }
  const count = m.pattern === 'drops' ? 7 : 25 + Math.round(m.strength * 55);
  for (let i = 0; i < count; i++) {
    const travel = random() ** 1.6 * r * 1.65, spread = (random() - .5) * r * (m.pattern === 'drops' ? 1.1 : (.2 + travel / r) * .9);
    const radius = (3 + random() ** 2 * r * .16) * (1 - travel / (r * 2.5)) * (m.pattern === 'drops' ? 2 : 1);
    const x = travel - r * .35, y = spread;
    if (absorbent) {
      const stain = c.createRadialGradient(x, y, 0, x, y, radius * 1.7);
      stain.addColorStop(0, '#751b22b0'); stain.addColorStop(.6, '#8a29305c'); stain.addColorStop(1, '#8a293000');
      ellipse(c, x, y, radius * 1.7, radius * 1.5, stain);
    }
    const drop = organicPath(radius, (m.seed + i * 7919) >>> 0, glass ? .025 : .13, 28);
    c.save(); c.translate(x, y); c.scale(glass ? .8 : 1, glass ? .66 : .92);
    const pool = c.createRadialGradient(-radius * .25, -radius * .3, 0, 0, 0, radius * 1.15);
    pool.addColorStop(0, glass ? '#a3373a' : '#912e30'); pool.addColorStop(.6, '#711c25'); pool.addColorStop(.88, '#4d1721'); pool.addColorStop(1, '#38131c');
    c.fillStyle = pool; c.fill(drop);
    c.strokeStyle = absorbent ? '#501b2438' : '#28131b88'; c.lineWidth = absorbent ? 1.7 : .8; c.stroke(drop);
    c.clip(drop);
    // Coagulated specks and tiny pores interrupt an otherwise flat red shape.
    for (let j = 0; j < 9; j++) {
      ellipse(c, (random() - .5) * radius * 2, (random() - .5) * radius * 2, .3 + random() * radius * .08, .5 + random() * radius * .04, j % 3 ? '#2f152534' : '#b35d4b35');
    }
    c.restore();
    if (glass) {
      ellipse(c, x - radius * .2, y - radius * .2, radius * .27, Math.max(1, radius * .08), '#f6d8cf83');
      if (i % 6 === 0) line(c, x, y + radius * .4, x + r * .12, y + radius * .4 + r * .2, '#5a1521b0', radius * .5);
    }
    if (d.material === 'stone' && i % 3 === 0) {
      line(c, x, y, x - radius * .2, y + radius * 2.7, '#48151c99', 1.5);
    }
  }
}

function burn(c: Context, d: LetterDesign, r: number, random: () => number, seed: number) {
  const paper = d.material === 'letter' || d.material === 'card' || d.material === 'arcane';
  const arcane = d.material === 'arcane', path = damagePath('burn', r, seed);
  // A soft smoke bloom plus a narrow carbonised rim. Offset translucent
  // contours break up radial repetition around the damaged silhouette.
  const smoke = c.createRadialGradient(0, 0, r * .25, 0, 0, r * .83);
  smoke.addColorStop(0, arcane ? '#54386360' : '#49301d60');
  smoke.addColorStop(.55, arcane ? '#6d477d2c' : '#80613c32');
  smoke.addColorStop(1, '#49301d00');
  c.fillStyle = smoke; c.fillRect(-r, -r, r * 2, r * 2);
  for (let i = 14; i >= 0; i--) {
    const scale = 1 + i / 35;
    c.save(); c.scale(scale, scale);
    c.translate(Math.sin(i * 2.1) * i * .32, Math.cos(i * 1.7) * i * .25);
    c.fillStyle = arcane ? `rgba(95,60,120,${.025 + (14-i) * .003})` : `rgba(66,39,22,${.026 + (14-i) * .004})`;
    c.fill(path); c.restore();
  }
  if (paper) {
    c.strokeStyle = '#17171bee'; c.lineWidth = 13; c.stroke(path);
    c.strokeStyle = arcane ? '#9d75beaa' : '#b0783a90'; c.lineWidth = 3; c.stroke(path);
    c.save(); c.translate(-.7, -1.3); c.strokeStyle = arcane ? '#ddbcf76b' : '#d4b58b68'; c.lineWidth = 1; c.stroke(path); c.restore();
    // Charcoal, ash and short exposed fibres catch on the damaged edge.
    c.save(); c.clip(organicPath(r * .69, seed, .15));
    for (let i = 0; i < 190; i++) {
      const a = random() * TAU, dist = r * (.38 + random() * .36);
      const x = Math.cos(a) * dist, y = Math.sin(a) * dist * .91;
      line(c, x, y, x + (random() - .5) * 6, y + random() * 3, i % 4 ? '#1a172170' : '#e6c99968', .4 + random() * 1.5);
      if (i % 7 === 0) {
        line(c, x, y, x * 1.12, y * 1.12, '#38251d38', .6);
      }
    }
    c.restore();
    const alpha = c.globalAlpha; c.globalAlpha = 1; c.globalCompositeOperation = 'destination-out'; c.fill(path);
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha;
  } else {
    const soot = c.createRadialGradient(0,0,0,0,0,r);
    soot.addColorStop(0,'#0c1116ee'); soot.addColorStop(.4,'#17181dd0'); soot.addColorStop(1,'#30251a00');
    c.fillStyle = soot; c.fill(organicPath(r,seed,.06));
    for (let i = 0; i < 120; i++) {
      const x = (random()-.5)*r*1.7, y = (random()-.5)*r*1.7;
      ellipse(c,x,y,.5+random()*2,.5+random()*2, i%4 ? '#050c1130' : '#a19b7d28');
    }
    if (d.material === 'terminal') {
      for (let i = 0; i < 6; i++) line(c, -r * .7, i * 7 - 24, r * .7, i * 7 - 24, '#e7bb6f50', 2);
    }
  }
}

function tear(c: Context, d: LetterDesign, r: number, random: () => number, seed: number) {
  if (d.material === 'terminal' || d.material === 'stone') {
    const glass = d.material === 'terminal';
    for (let i = 0; i < (glass ? 9 : 5); i++) {
      const a = i * TAU / (glass ? 9 : 5) + random() * .5;
      const end = r * (.7 + random());
      c.beginPath(); c.moveTo(0, 0);
      for (let j = 1; j <= 5; j++) c.lineTo(Math.cos(a) * end * j / 5 + (random() - .5) * 20, Math.sin(a) * end * j / 5);
      c.strokeStyle = glass ? '#d3f8f0a0' : '#172027'; c.lineWidth = glass ? 1.5 : 4; c.stroke();
      c.translate(2, 1); c.strokeStyle = glass ? '#101f2480' : '#afaca76b'; c.lineWidth = 1; c.stroke(); c.translate(-2, -1);
    }
    if (!glass) { irregular(c, r * .11, random, 7); c.fillStyle = '#1d272c'; c.fill(); }
  } else {
    const path = damagePath('tear', r, seed);
    c.strokeStyle = d.material === 'arcane' ? '#d9aff7' : '#fff2d2'; c.lineWidth = 6; c.stroke(path);
    c.strokeStyle = d.material === 'arcane' ? '#976fb48a' : '#7155368a'; c.lineWidth = 1; c.stroke(path);
    // Fine fibres, with length and direction separate from the wider torn gap.
    for (let i = 0; i < 90; i++) {
      const t = random(), x = (t * 2 - 1) * r, side = i % 2 ? 1 : -1;
      const y = Math.sin(t*TAU)*r*.055 + side*(4+random()*11)*Math.sin(t*Math.PI)**.5;
      line(c,x,y,x+(random()-.5)*6,y+side*(2+random()*9), d.material === 'arcane' ? '#ceace65c' : '#e7d4ad9e', .5);
    }
    const alpha = c.globalAlpha; c.globalAlpha = 1; c.globalCompositeOperation = 'destination-out'; c.fill(path); c.globalCompositeOperation = 'source-over'; c.globalAlpha = alpha;
  }
}

function stain(c: Context, d: LetterDesign, r: number, random: () => number) {
  const glass = d.material === 'terminal', arcane = d.material === 'arcane';
  const color = glass ? '137,168,162' : arcane ? '160,116,199' : d.material === 'stone' ? '36,40,27' : '122,80,36';
  for (let i = 0; i < 3; i++) {
    const x = (random()-.5)*r*.55, y = (random()-.5)*r*.45;
    const radius = r*(.55+random()*.35), seed = Math.floor(random()*4294967295);
    const path = organicPath(radius,seed,.045,100);
    c.save(); c.translate(x,y);
    for (let j = 13; j >= 0; j--) {
      c.save(); c.scale(1+j*.005, 1+j*.005);
      c.strokeStyle = `rgba(${color},${glass ? .005 : .009})`; c.lineWidth = 4+j*.3; c.stroke(path); c.restore();
    }
    c.clip(path);
    const g = c.createRadialGradient(-radius*.3,-radius*.25,0,0,0,radius*1.2);
    g.addColorStop(0,`rgba(${color},.025)`); g.addColorStop(.65,`rgba(${color},.08)`); g.addColorStop(1,`rgba(${color},.2)`);
    c.fillStyle = g; c.fillRect(-radius*1.3,-radius*1.3,radius*2.6,radius*2.6);
    for (let j = 0; j < 160; j++) {
      const px = (random()-.5)*radius*2.5, py = (random()-.5)*radius*2.5;
      ellipse(c,px,py,.4+random()*2.1,.3+random()*1.3,`rgba(${color},${glass ? .025 : .05})`);
    }
    if (glass) for (let j=0;j<14;j++) line(c,-radius,(j-7)*radius*.1,radius,(j-7)*radius*.1+radius*.14,'#c4e5d916',2+random()*3);
    c.restore();
  }
}

// Cut the missing substrate after all overlays. A later stain cannot repaint a hole.
function cutMissingSurface(c: Context, d: LetterDesign, w: number, h: number) {
  if (d.material === 'stone' || d.material === 'terminal') return;
  for (const mark of d.marks) {
    if (mark.kind !== 'burn' && mark.kind !== 'tear') continue;
    c.save(); c.translate(mark.x * w, mark.y * h); c.rotate(mark.angle * Math.PI / 180);
    const path = damagePath(mark.kind, mark.size * w, mark.seed);
    c.globalCompositeOperation = 'destination-out'; c.fill(path); c.restore();
  }
}

export function renderLetter(canvas: HTMLCanvasElement, d: LetterDesign, width = 1080, options: { transparentBackground?: boolean } = {}): LetterLayout {
  const [w, h] = FORMATS[d.format];
  canvas.width = width; canvas.height = Math.round(width * h / w);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('无法绘制信稿，请重新打开后重试');
  c.scale(width / w, width / w);
  if (!options.transparentBackground) {
    const dark = ['stone', 'arcane', 'terminal'].includes(d.material);
    c.fillStyle = dark ? '#10151d' : '#b8c5cb'; c.fillRect(0, 0, w, h);
    c.save(); c.beginPath(); c.rect(0, 0, w, h); c.rect(48, 48, w - 96, h - 96); c.clip('evenodd');
    c.shadowColor = '#00000060'; c.shadowBlur = 28; c.shadowOffsetY = 14;
    c.fillStyle = dark ? '#1b212a' : '#e8e7de'; c.fillRect(48, 48, w - 96, h - 96); c.restore();
  }
  const sheet = document.createElement('canvas'); sheet.width = canvas.width; sheet.height = canvas.height;
  const s = sheet.getContext('2d');
  if (!s) throw new Error('无法创建信稿画布');
  s.scale(width / w, width / w);
  s.beginPath(); s.rect(48, 48, w - 96, h - 96); s.clip();
  substrate(s, d, w, h);
  const layout = typography(s, d, w, h);
  for (const mark of d.marks) {
    s.save(); s.translate(mark.x * w, mark.y * h); s.rotate(mark.angle * Math.PI / 180); s.globalAlpha = mark.strength;
    const radius = mark.size * w, random = seededRandom(mark.seed);
    if (mark.kind === 'blood') blood(s, d, mark, radius, random);
    if (mark.kind === 'burn') burn(s, d, radius, random, mark.seed);
    if (mark.kind === 'tear') tear(s, d, radius, random, mark.seed);
    if (mark.kind === 'stain') stain(s, d, radius, random);
    s.restore();
  }
  cutMissingSurface(s, d, w, h);
  c.drawImage(sheet, 0, 0, w, h);
  return layout;
}

export async function loadLetterFonts(font: LetterDesign['font']): Promise<void> {
  if (font === 'song') await document.fonts.load('34px "Vana Book"');
  if (font === 'brush') await document.fonts.load('34px "Vana Brush"');
}

export async function letterPNG(design: LetterDesign): Promise<Blob> {
  await loadLetterFonts(design.font);
  const canvas = document.createElement('canvas');
  if (renderLetter(canvas, design).overflow) throw new Error('文字超出画面，请缩小字号、减少文字或改用长幅');
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('生成图片失败')), 'image/png'));
}
