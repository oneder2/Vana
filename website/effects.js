/* Aurora shader adapted from DavidHDev/react-bits at
 * 496968c4117e21278f13917201b7d615bc5e7450. Copyright (c) 2026 David Haz.
 * MIT + Commons Clause; see /licenses/react-bits.md.
 * Website-specific native lifecycle; no React or runtime dependencies.
 */
(() => {
const MAX_STOPS = 5;
const MAX_LAYERS = 3;

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uStops[${MAX_STOPS}];
uniform int uStopCount;
uniform float uAmplitude;
uniform float uBlend;
uniform float uHeight;
uniform float uScale;
uniform float uGlow;
uniform float uBrightness;
uniform int uLayers;
uniform float uFlip;
uniform vec3 uPointer;
uniform float uReveal;
uniform float uOpacity;
uniform float uLightMode;
out vec4 outColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float smootherstep(float edge0, float edge1, float x) {
  float t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l;
  m = m * m * m;
  s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

vec3 ramp(float t) {
  float x = clamp(t, 0.0, 1.0) * float(uStopCount - 1);
  int i = int(min(floor(x), float(uStopCount - 2)));
  float f = x - float(i);
  f = f * f * (3.0 - 2.0 * f);
  vec3 lch = mix(uStops[i], uStops[i + 1], f);
  lch.x = mix(lch.x, min(lch.x, 0.7), uLightMode);
  return toSrgb(oklabToLinear(vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z))));
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float y = 1.0 - frag.y / uResolution.y;
  y = mix(y, 1.0 - y, uFlip);
  float u = frag.x / uResolution.x;
  float X = (frag.x - uResolution.x * 0.5) / uResolution.y;
  float t = uTime;
  float reach = uPointer.z * exp(-pow((X - uPointer.x) / 0.38, 2.0));

  vec3 glow = vec3(0.0);
  float cover = 0.0;
  for (int k = 0; k < ${MAX_LAYERS}; k++) {
    if (k >= uLayers) break;
    float layer = float(k);
    float seed = layer * 13.7;
    float pace = t * (1.0 - layer * 0.18);
    float warp = snoise(vec2(X * 0.45 * uScale + pace * 0.02 + seed, pace * 0.05 + seed));
    float wave = snoise(vec2(X * 0.75 * uScale + warp * 0.35 - pace * 0.03 + seed, pace * 0.07 - seed)) * 0.72
      + snoise(vec2(X * 1.6 * uScale + warp * 0.5 + pace * 0.04 - seed, pace * 0.1 + seed * 0.5)) * 0.28;
    float hem = uHeight + layer * 0.07 + wave * 0.15 * uAmplitude;
    hem += reach * 0.08 * (layer < 0.5 ? 1.0 : 0.4);
    hem = mix(-0.25, hem, uReveal);

    float soft = (0.04 + uBlend * 0.16) * (1.0 + layer * 0.9);
    float rise = hem - y;
    float low = -soft - uGlow * 0.14;
    float high = 0.26 + soft * 0.6;
    float body = pow(smootherstep(low, high, rise), 1.5 + uGlow * 0.6);
    float lobes = 0.86 + 0.14 * snoise(vec2(X * 0.9 * uScale - pace * 0.025 + seed, y * 0.3 + pace * 0.04));
    float alpha = body * lobes * (layer < 0.5 ? 1.0 : 0.32 / layer);
    alpha = clamp(alpha * (1.0 + reach * 0.25 * smootherstep(0.9, 0.0, abs(y - hem))), 0.0, 1.0);

    vec3 tint = ramp(u + 0.05 * sin(pace * 0.08 + layer * 2.3) + layer * 0.1 + max(rise, 0.0) * 0.05);
    glow = 1.0 - (1.0 - glow) * (1.0 - tint * alpha);
    cover = 1.0 - (1.0 - cover) * (1.0 - alpha);
  }

  float fade = smootherstep(0.0, 0.7, uReveal) * uOpacity;
  float strength = clamp(uBrightness, 0.0, 2.0);
  glow *= fade * min(strength, 1.0);
  cover *= fade * min(strength, 1.0);
  glow = 1.0 - pow(1.0 - glow, vec3(max(strength, 1.0)));
  float dither = (hash(frag) - 0.5) / 255.0;

  if (uLightMode > 0.5) {
    vec3 tint = cover > 0.0001 ? glow / cover : vec3(0.0);
    cover *= smootherstep(0.0, 0.25, cover);
    float alpha = cover * 0.7;
    outColor = vec4(tint * alpha + dither, clamp(alpha + dither, 0.0, 1.0));
    return;
  }
  outColor = vec4(glow + dither, clamp(cover + dither, 0.0, 1.0));
}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toOklch = rgb => {
  const [r, g, b] = rgb.map(c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lab = [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
  return [lab[0], Math.hypot(lab[1], lab[2]), Math.atan2(lab[2], lab[1])];
};

const unwrapHues = stops => {
  const known = stops.findIndex(stop => stop[1] > 0.02);
  const anchor = known === -1 ? 0 : stops[known][2];
  let previous = anchor;
  return stops.map(stop => {
    let hue = stop[1] > 0.02 ? stop[2] : previous;
    while (hue - previous > Math.PI) hue -= Math.PI * 2;
    while (hue - previous < -Math.PI) hue += Math.PI * 2;
    previous = hue;
    return [stop[0], stop[1], hue];
  });
};

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const button = document.querySelector('.motion-toggle');
let userPaused = false;
try { userPaused = localStorage.getItem('vana-site-motion') === 'off'; } catch { /* Private browsing. */ }
const motion = () => !reduce.matches && !userPaused;
function updateMotion() {
  root.dataset.motion = motion() ? 'on' : 'off';
  if (button) {
    button.hidden = reduce.matches;
    button.setAttribute('aria-pressed', String(userPaused));
    const label = userPaused ? '开启页面动效' : '暂停页面动效';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('span').textContent = label;
  }
  document.dispatchEvent(new Event('vana:motionchange'));
}
button?.addEventListener('click', () => {
  userPaused = !userPaused;
  try { localStorage.setItem('vana-site-motion', userPaused ? 'off' : 'on'); } catch { /* Optional preference. */ }
  updateMotion();
});
reduce.addEventListener('change', updateMotion);
updateMotion();
root.classList.add('motion-ready');
function visibility() { root.classList.toggle('motion-paused', document.hidden); }
document.addEventListener('visibilitychange', visibility);
visibility();

// Native adaptation of SpotlightCard's pointer-centered radial light.
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
for (const card of document.querySelectorAll('.spotlight')) {
  card.addEventListener('pointermove', event => {
    if (!motion() || !finePointer.matches || event.pointerType !== 'mouse') return;
    const rect = card.getBoundingClientRect();
    // CSSOM property writes work with the site's strict self-only style CSP.
    card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
    card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    card.classList.add('is-lit');
  }, { passive: true });
  card.addEventListener('pointerleave', () => card.classList.remove('is-lit'));
}
if ('IntersectionObserver' in window) {
  const reveals = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      reveals.unobserve(entry.target);
    }
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(node => reveals.observe(node));
} else document.querySelectorAll('.reveal').forEach(node => node.classList.add('is-revealed'));

const stage = document.querySelector('.hero-stage');
const container = document.querySelector('.aurora');
const canvas = document.querySelector('.aurora-canvas');
if (!stage || !container || !canvas) return;
let gl;
try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch { return; }
if (!gl) return; // CSS glow remains visible on devices without WebGL.
const shaders = [];
let program;
let buffer;
let vao;
function dispose() {
  shaders.forEach(shader => gl.deleteShader(shader));
  if (program) gl.deleteProgram(program);
  if (buffer) gl.deleteBuffer(buffer);
  if (vao) gl.deleteVertexArray(vao);
}
try {
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Shader unavailable');
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader unsupported');
  }
  program = gl.createProgram();
  if (!program) throw new Error('Program unavailable');
  shaders.forEach(shader => gl.attachShader(program, shader));
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Link unsupported');
  buffer = gl.createBuffer();
  vao = gl.createVertexArray();
  if (!buffer || !vao) throw new Error('Buffer unavailable');
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
} catch {
  dispose();
  return;
}
const uniforms = {};
for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
  const info = gl.getActiveUniform(program, i);
  uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
}
const colors = ['#a397ff', '#568ee4', '#82eee3'].map(hex =>
  [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255));
const palette = new Float32Array(MAX_STOPS * 3);
unwrapHues(colors.map(toOklch)).forEach((stop, index) => palette.set(stop, index * 3));
let raf = 0;
let last = 0;
let clock = 5;
let visible = true;
let lost = false;
let inPage = true;
const pointer = { x: 0, y: .5, reach: 0 };
function render() {
  if (lost) return;
  const u = uniforms;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.uniform2f(u.uResolution, canvas.width, canvas.height);
  gl.uniform1f(u.uTime, clock);
  gl.uniform3fv(u.uStops, palette);
  gl.uniform1i(u.uStopCount, colors.length);
  gl.uniform1f(u.uAmplitude, 1.8);
  gl.uniform1f(u.uBlend, .2);
  gl.uniform1f(u.uHeight, .4);
  gl.uniform1f(u.uScale, 1.3);
  gl.uniform1f(u.uGlow, .7);
  gl.uniform1f(u.uBrightness, .85);
  gl.uniform1i(u.uLayers, 2);
  gl.uniform1f(u.uFlip, 1);
  gl.uniform3f(u.uPointer, pointer.x, pointer.y, motion() ? pointer.reach : 0);
  gl.uniform1f(u.uReveal, 1);
  gl.uniform1f(u.uOpacity, .8);
  gl.uniform1f(u.uLightMode, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function active() { return !lost && visible && !document.hidden && inPage && motion(); }
function frame(now) {
  raf = 0;
  if (!active()) { last = 0; return; }
  if (!last || now - last >= 1000 / 30) {
    clock += last ? Math.min((now - last) / 1000, .1) * 1.2 : 0;
    last = now;
    render();
  }
  raf = requestAnimationFrame(frame);
}
function sync() {
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
  stage.classList.toggle('stage-paused', !visible);
  if (active()) raf = requestAnimationFrame(frame);
  else if (visible && !document.hidden && inPage) render();
}
function resize() {
  const rect = container.getBoundingClientRect();
  // Bound pixel count on both phones and high-DPI desktop screens.
  const ratio = Math.min(devicePixelRatio || 1, 1.25, 1200 / Math.max(1, rect.width),
    Math.sqrt(650000 / Math.max(1, rect.width * rect.height)));
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  render();
  sync();
}
new ResizeObserver(resize).observe(container);
if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  sync();
}).observe(stage);
stage.addEventListener('pointermove', event => {
  if (!motion() || !finePointer.matches || event.pointerType !== 'mouse') return;
  const rect = container.getBoundingClientRect();
  pointer.x = (event.clientX - rect.left - rect.width / 2) / rect.height;
  pointer.y = 1 - (event.clientY - rect.top) / rect.height;
  pointer.reach = 1;
}, { passive: true });
stage.addEventListener('pointerleave', () => { pointer.reach = 0; });
document.addEventListener('visibilitychange', sync);
document.addEventListener('vana:motionchange', sync);
window.addEventListener('pagehide', () => { inPage = false; sync(); });
window.addEventListener('pageshow', () => { inPage = true; sync(); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  lost = true;
  sync();
  root.classList.remove('has-aurora');
});
// Keep the static fallback after context loss rather than repeatedly reallocating.
root.classList.add('has-aurora');
resize();
})();
