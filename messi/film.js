/* ─────────────────────────────────────────────────────────────
   牵丝戏 · Messi 2006–2026 — timeline compositor
   Everything on screen is a pure function of the audio clock, so the film
   is deterministic, seekable, and identical on every device. The timeline
   itself lives in data.js (window.FILM).
   ───────────────────────────────────────────────────────────── */
(() => {
'use strict';
const F = window.FILM;
const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, p) => a + (b - a) * p;
const E = {
  lin: p => p,
  i:  p => p * p * p,
  o:  p => 1 - Math.pow(1 - p, 3),
  io: p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2,
  oq: p => 1 - (1 - p) * (1 - p),
  oe: p => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p),
  ioq: p => p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2,
};
const q = new URLSearchParams(location.search);
const DEBUG = q.has('debug');
const FREEZE = q.has('pause');
const START_AT = parseFloat(q.get('t') || '0') || 0;

const stage = $('#stage'), texts = $('#texts'), extras = $('#extras');
const audio = $('#audio'), gate = $('#gate'), flashEl = $('#flash'), grain = $('#grain');
const lb = $('#letterbox'), hud = $('#hud'), clockEl = $('#clock');
if (DEBUG) document.body.classList.add('debug');

/* ── preloading ─────────────────────────────────────────────── */
const blobs = new Map();       // src -> objectURL (video / audio)
const images = new Map();      // src -> HTMLImageElement (decoded)
const ring = $('#gate .fg'), pct = $('#gate .pct');
function setProgress(p) { ring.style.strokeDashoffset = String(408 * (1 - clamp(p))); pct.textContent = Math.round(clamp(p) * 100) + '%'; }

async function fetchBlob(src, onProg) {
  const r = await fetch(src);
  if (!r.ok) throw new Error(src);
  const total = +r.headers.get('content-length') || 0;
  if (!r.body || !total) { const b = await r.blob(); onProg(1); return URL.createObjectURL(b); }
  const reader = r.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProg(got / total); }
  return URL.createObjectURL(new Blob(chunks, { type: r.headers.get('content-type') || '' }));
}
function loadImage(src) {
  return new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im)); im.onerror = () => res(null); im.src = src; });
}
async function preload() {
  // Progressive: audio + everything needed for the first HEAD seconds gates the start; the rest streams in timeline order.
  const HEAD = 40;
  const audioSrc = F.audio.find(a => audio.canPlayType(a.type)) || F.audio[0];
  const order = [...F.shots].sort((a, b) => a.t0 - b.t0);
  const seen = new Set(); const items = [];
  for (const s of order) { if (seen.has(s.src)) continue; seen.add(s.src); items.push({ src: s.src, kind: s.kind === 'video' ? 'v' : 'i', t0: s.t0 }); }
  const head = items.filter(i => i.t0 < HEAD), tail = items.filter(i => i.t0 >= HEAD);
  const weights = { audio: 4 }; const prog = { audio: 0 }; head.forEach(i => { weights[i.src] = i.kind === 'v' ? 3 : 1; prog[i.src] = 0; });
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  const tick = () => setProgress(Object.keys(prog).reduce((a, k) => a + prog[k] * weights[k], 0) / totalW);
  const loadOne = async (it, onp) => { try {
    if (it.kind === 'v') blobs.set(it.src, await fetchBlob(it.src, onp));
    else { images.set(it.src, await loadImage(it.src)); onp(1); }
  } catch (e) { console.warn('asset failed', it.src, e); onp(1); } };
  const jobs = [fetchBlob(audioSrc.src, p => { prog.audio = p; tick(); }).then(u => { audio.src = u; return new Promise(r => { audio.addEventListener('loadedmetadata', r, { once: true }); audio.load(); }); })];
  const q1 = [...head];
  for (let i = 0; i < 5; i++) jobs.push((async () => { while (q1.length) { const it = q1.shift(); await loadOne(it, p => { prog[it.src] = p; tick(); }); } })());
  await Promise.all(jobs); setProgress(1);
  // background: the rest, in order, 3 at a time
  const q2 = [...tail];
  for (let i = 0; i < 3; i++) (async () => { while (q2.length) { const it = q2.shift(); await loadOne(it, () => {}); } })();
}

/* ── the clock ──────────────────────────────────────────────── */
let playing = false, ended = false, lastRead = -1, lastPerf = 0, paused = false;
function now() {
  const ct = audio.currentTime;
  if (ct !== lastRead) { lastRead = ct; lastPerf = performance.now(); return ct; }
  if (audio.paused) return ct;
  return ct + (performance.now() - lastPerf) / 1000;   // smooth over coarse currentTime updates
}

/* ── shots ──────────────────────────────────────────────────── */
const live = new Map();   // element spec -> node
function mountShot(s) {
  const el = document.createElement('div');
  el.className = `shot grade-${s.grade || 'blue'}${s.mask ? ' mask-' + s.mask : ''}`;
  el.style.zIndex = String(s.z ?? 1);
  if (s.blend) el.style.mixBlendMode = s.blend;
  let m;
  if (s.kind === 'video') {
    m = document.createElement('video'); m.muted = true; m.playsInline = true; m.loop = !!s.loop; m.preload = 'auto';
    m.src = blobs.get(s.src) || s.src; m.playbackRate = s.rate || 1; m.currentTime = s.start || 0;
    m.addEventListener('loadedmetadata', () => { m.currentTime = s.start || 0; }, { once: true });
  } else {
    const src = images.get(s.src);
    m = src ? src.cloneNode() : document.createElement('img'); if (!src) m.src = s.src;
  }
  m.className = 'media'; m.style.objectPosition = s.pos || '50% 50%';
  if (s.filter) m.style.filter = s.filter;
  const tint = document.createElement('div'); tint.className = 'tint';
  if (s.dim) tint.style.background = `rgba(0,0,0,${s.dim})`;
  el.append(m, tint); stage.append(el);
  return { el, m };
}

/* transition effects. q = visibility 0..1 (0 = hidden). Returns style fragments. */
function fx(name, q, into) {
  const r = { clip: '', op: 1, filter: '', tf: '' };
  const k = 1 - q;
  switch (name) {
    case 'cut': r.op = q > 0 ? 1 : 0; break;
    case 'fade': r.op = q; break;
    case 'blur': r.op = q; r.filter = `blur(${(k * 26).toFixed(1)}px)`; break;
    case 'dark': r.op = 1; r.filter = `brightness(${q.toFixed(3)})`; break;
    case 'wipe-r': r.clip = `inset(0 ${(k * 100).toFixed(2)}% 0 0)`; break;
    case 'wipe-l': r.clip = `inset(0 0 0 ${(k * 100).toFixed(2)}%)`; break;
    case 'wipe-u': r.clip = `inset(${(k * 100).toFixed(2)}% 0 0 0)`; break;
    case 'wipe-d': r.clip = `inset(0 0 ${(k * 100).toFixed(2)}% 0)`; break;
    case 'split':  r.clip = `inset(${(k * 50).toFixed(2)}% 0)`; break;
    case 'splitx': r.clip = `inset(0 ${(k * 50).toFixed(2)}%)`; break;
    case 'diag': { const a = q * 220; r.clip = `polygon(0 0, ${a}% 0, 0 ${a}%)`; break; }
    case 'diag2': { const a = k * 220; r.clip = `polygon(100% 100%, ${100 - a}% 100%, 100% ${100 - a}%)`; r.clip = `polygon(${100 - a}% 100%, 100% 100%, 100% ${100 - a}%, 100% 0, 0 0, 0 100%)`; break; }
    case 'iris': r.clip = `circle(${(q * 92).toFixed(2)}% at 50% 45%)`; break;
    case 'iris-r': r.clip = `circle(${(q * 92).toFixed(2)}% at 66% 40%)`; break;
    case 'iris-l': r.clip = `circle(${(q * 92).toFixed(2)}% at 34% 40%)`; break;
    case 'slit': r.clip = `inset(0 ${(k * 50).toFixed(2)}%)`; r.filter = `brightness(${(1 + k * 1.2).toFixed(2)})`; break;
    case 'zoom': r.op = q; r.tf = `scale(${(1 + k * 0.45).toFixed(4)})`; break;
    case 'zoom-out': r.op = q; r.tf = `scale(${(1 - k * 0.25).toFixed(4)})`; r.filter = `blur(${(k * 10).toFixed(1)}px)`; break;
    case 'push-l': r.tf = `translateX(${(k * 100).toFixed(2)}%)`; break;
    case 'push-r': r.tf = `translateX(${(-k * 100).toFixed(2)}%)`; break;
    case 'push-u': r.tf = `translateY(${(k * 100).toFixed(2)}%)`; break;
    case 'push-d': r.tf = `translateY(${(-k * 100).toFixed(2)}%)`; break;
    case 'bars': { // five vertical louvres opening (union of strips traced along the top edge)
      const n = 5, w = 100 / n, parts = ['0 0'];
      for (let i = 0; i < n; i++) { const x0 = (i * w).toFixed(2), x1 = (i * w + w * q).toFixed(2); parts.push(`${x0}% 0, ${x0}% 100%, ${x1}% 100%, ${x1}% 0`); }
      parts.push('100% 0'); r.clip = `polygon(${parts.join(', ')})`; break; }
    case 'hbars': { const n = 4, h = 100 / n, parts = ['0 0'];
      for (let i = 0; i < n; i++) { const y0 = (i * h).toFixed(2), y1 = (i * h + h * q).toFixed(2); parts.push(`0 ${y0}%, 100% ${y0}%, 100% ${y1}%, 0 ${y1}%`); }
      parts.push('0 100%'); r.clip = `polygon(${parts.join(', ')})`; break; }
    default: r.op = q;
  }
  return r;
}

function drawShot(s, t) {
  const inD = s.in?.d ?? .8, outD = s.out?.d ?? .8;
  const age = t - s.t0, rem = s.t1 - t;
  let node = live.get(s);
  if (!node) { node = mountShot(s); live.set(s, node); }
  const { el, m } = node;
  if (age < 0) { el.style.opacity = '0'; el.style.clipPath = ''; el.style.transform = ''; el.style.filter = ''; if (s.kind === 'video' && Math.abs(m.currentTime - (s.start || 0)) > .05) m.currentTime = s.start || 0; return; }
  // Ken Burns on the media element
  const p = clamp(age / (s.t1 - s.t0));
  const kb = s.kb || [1.04, 1.14, 0, 0, 0, 0];
  const pe = (E[s.kbe || 'lin'])(p);
  const sc = lerp(kb[0], kb[1], pe), tx = lerp(kb[2] || 0, kb[4] || 0, pe), ty = lerp(kb[3] || 0, kb[5] || 0, pe);
  m.style.transform = `translate(${tx.toFixed(3)}%, ${ty.toFixed(3)}%) scale(${sc.toFixed(4)})`;
  // transitions
  const qi = clamp(age / inD), qo = clamp(rem / outD);
  const ei = (E[s.in?.e || 'io'])(qi), eo = (E[s.out?.e || 'io'])(qo);
  const a = fx(s.in?.fx || 'fade', ei, true), b = fx(s.out?.fx || 'fade', eo, false);
  const use = qi < 1 && (qo >= 1 || qi <= qo) ? a : (qo < 1 ? b : null);
  el.style.opacity = String((s.op ?? 1) * (a.op) * (b.op));
  el.style.clipPath = use ? use.clip : '';
  el.style.filter = (a.filter || b.filter) ? [a.filter, b.filter].filter(Boolean).join(' ') : '';
  el.style.transform = (a.tf || b.tf) ? [a.tf, b.tf].filter(Boolean).join(' ') : '';
  // video sync
  if (s.kind === 'video') {
    const target = (s.start || 0) + Math.max(0, age) * (s.rate || 1);
    const dur = m.duration || Infinity;
    if (target >= dur - .05 || m.ended) {            // clip exhausted: hold the last frame, never restart it
      if (!m.paused) m.pause();
      if (isFinite(dur) && Math.abs(m.currentTime - (dur - .04)) > .1) m.currentTime = dur - .04;
    } else if (age >= 0 && !audio.paused && !paused) {
      if (m.paused) m.play().catch(() => {});
      if (Math.abs(m.currentTime - target) > .6 && !s.loop) m.currentTime = target;
    } else {
      if (!m.paused) m.pause();
      if (Math.abs(m.currentTime - target) > .05 && !s.loop) m.currentTime = target;
    }
  }
}

/* ── lyrics ─────────────────────────────────────────────────── */
function mountLyric(L) {
  const el = document.createElement('div');
  const cls = ['lyric', `s-${L.size || 'l'}`, L.color || '', L.font || '', L.vert ? 'vert' : '', `at-${L.at || 'bl'}`].filter(Boolean).join(' ');
  el.className = cls;
  if (L.x != null) { el.style.left = L.x; el.style.right = 'auto'; }
  if (L.y != null) { el.style.top = L.y; el.style.bottom = 'auto'; }
  if (L.maxw) el.style.maxWidth = L.maxw;
  const zh = document.createElement('div'); zh.className = 'zh';
  const chars = [];
  for (const ch of L.zh) {
    if (ch === ' ' || ch === '　') { const sp = document.createElement('span'); sp.className = 'sp'; zh.append(sp); continue; }
    const c = document.createElement('span'); c.className = 'ch'; c.textContent = ch; zh.append(c); chars.push(c);
  }
  const units = [...L.zh].reduce((n, ch) => n + (ch === ' ' || ch === '　' ? .5 : 1), 0);   // width budget per line
  el.style.setProperty('--fit', L.vert ? `calc(84vh / ${(units * 1.2).toFixed(2)})` : `calc(88vw / ${(units * 1.08).toFixed(2)})`);
  const es = document.createElement('div'); es.className = 'es'; es.textContent = L.es || '';
  if (!L.es) es.style.display = 'none';
  el.append(zh, es); texts.append(el);
  return { el, chars, es, zh };
}
function drawLyric(L, t) {
  let node = live.get(L); if (!node) { node = mountLyric(L); live.set(L, node); }
  const { el, chars, es } = node;
  const inD = L.in ?? .9, outD = L.out ?? .7, stag = L.stag ?? (L.anim === 'type' ? .11 : .07);
  const age = t - L.t0, rem = t < L.t1 ? 1e9 : (L.t1 + outD) - t;
  const qo = clamp(rem / outD); const eo = E.o(qo);
  const anim = L.anim || 'ink';
  chars.forEach((c, i) => {
    const qi = clamp((age - i * stag) / inD); const e = E.o(qi); const k = 1 - e;
    let tf = '', fl = '', op = e;
    if (anim === 'ink') { tf = `translateY(${(k * .28).toFixed(3)}em) scale(${(1 + k * .3).toFixed(3)})`; fl = `blur(${(k * 9).toFixed(1)}px)`; }
    else if (anim === 'rise') { tf = `translateY(${(k * .6).toFixed(3)}em)`; }
    else if (anim === 'drop') { tf = `translateY(${(-k * .6).toFixed(3)}em)`; fl = `blur(${(k * 4).toFixed(1)}px)`; }
    else if (anim === 'type') { op = qi > 0 ? 1 : 0; }
    else if (anim === 'zoom') { const g = E.o(clamp(age / inD)); const kk = 1 - g; tf = `scale(${(1 + kk * .35).toFixed(3)})`; fl = `blur(${(kk * 12).toFixed(1)}px)`; op = g; }
    else if (anim === 'sweep') { tf = `translateX(${(k * .5).toFixed(3)}em)`; fl = `blur(${(k * 6).toFixed(1)}px)`; }
    c.style.opacity = String(op); c.style.transform = tf; c.style.filter = fl;
  });
  const esd = L.esDelay ?? Math.min(.55, stag * chars.length * .6 + .25);
  const qe = clamp((age - esd) / .7); const ee = E.o(qe);
  es.style.opacity = String(ee); es.style.transform = `translateY(${((1 - ee) * 10).toFixed(2)}px)`;
  el.style.opacity = String(eo);
  el.style.filter = qo < 1 ? `blur(${((1 - eo) * 8).toFixed(1)}px)` : '';
  if (L.drift) { const p = clamp(age / (L.t1 - L.t0)); el.style.marginLeft = `${(L.drift[0] * p).toFixed(2)}vw`; el.style.marginTop = `${(L.drift[1] * p).toFixed(2)}vh`; }
}

/* ── extras ─────────────────────────────────────────────────── */
function mountExtra(X) {
  let el;
  if (X.kind === 'year') { el = document.createElement('div'); el.className = `year at-${X.at || 'br'} ${X.color || ''} ${X.huge ? 'huge' : ''} ${X.condensed ? 'condensed' : ''}`; el.textContent = X.text; if (X.x != null) { el.style.left = X.x; el.style.right = 'auto'; } if (X.y != null) { el.style.top = X.y; el.style.bottom = 'auto'; } }
  else if (X.kind === 'tag') { el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<span>${X.text}</span>${X.cn ? `<span class="cn">${X.cn}</span>` : ''}`; if (X.at === 'tr') { el.style.left = 'auto'; el.style.right = '7vw'; } }
  else if (X.kind === 'stat') { el = document.createElement('div'); el.className = 'stat'; el.style.left = X.x; el.style.top = X.y; el.style.textAlign = X.align || 'left'; if (X.align === 'center') el.style.transform = 'translateX(-50%)'; el.innerHTML = `<div class="n">${X.n}</div><div class="c">${X.c}${X.cn ? ` <span class="cn">${X.cn}</span>` : ''}</div>`; }
  else if (X.kind === 'title') { el = document.createElement('div'); el.className = 'title'; el.innerHTML = `${X.h ? `<div class="h ${X.serif ? 'serif' : ''}">${X.h}</div>` : ''}${X.p ? `<div class="p">${X.p}</div>` : ''}${X.m ? `<div class="m">${X.m}</div>` : ''}`; }
  else if (X.kind === 'quote') { el = document.createElement('div'); el.className = 'quote'; el.innerHTML = `<div class="q"><span class="txt"></span><span class="cur"></span></div><div class="cn"></div><div class="who">${X.who || ''}</div>`;
    if (X.x) { el.style.left = X.x; el.style.top = X.y || '50%'; el.style.transform = 'translateY(-50%)'; el.style.width = X.w || '46vw'; } }
  else { el = document.createElement('div'); }
  extras.append(el); return { el };
}
function drawExtra(X, t) {
  let node = live.get(X); if (!node) { node = mountExtra(X); live.set(X, node); }
  const { el } = node; const inD = X.in ?? 1, outD = X.out ?? 1;
  const age = t - X.t0, rem = X.t1 - t; const qi = E.o(clamp(age / inD)), qo = E.o(clamp(rem / outD));
  const p = clamp(age / (X.t1 - X.t0));
  if (X.kind === 'year') {
    const d = X.drift || [0, 0, 0, 0];
    el.style.opacity = String((X.op ?? .16) * qi * qo);
    const base = X.at === 'c' ? 'translate(-50%,-50%) ' : '';
    el.style.transform = `${base}translate(${lerp(d[0], d[2], p).toFixed(2)}vw, ${lerp(d[1], d[3], p).toFixed(2)}vh) scale(${(1 + (X.grow || 0) * p).toFixed(3)})`;
  } else if (X.kind === 'tag') {
    el.style.opacity = String(qi * qo); el.style.transform = `translateX(${((1 - qi) * -14).toFixed(1)}px)`;
  } else if (X.kind === 'stat') {
    el.style.opacity = String(qi * qo); el.style.filter = `blur(${((1 - qi) * 10).toFixed(1)}px)`;
    el.style.transform = `${X.align === 'center' ? 'translateX(-50%) ' : ''}translateY(${((1 - qi) * 20).toFixed(1)}px)`;
  } else if (X.kind === 'title') {
    el.style.opacity = String(qi * qo); el.style.filter = `blur(${((1 - qi) * 14).toFixed(1)}px)`;
    el.style.transform = `translate(-50%,-50%) scale(${(1 + (1 - qi) * .06).toFixed(3)})`;
  } else if (X.kind === 'quote') {
    const txt = el.querySelector('.txt'), cn = el.querySelector('.cn');
    const n = Math.floor(clamp(age / (X.typeD || 6)) * X.q.length);
    if (txt.textContent.length !== n) txt.textContent = X.q.slice(0, n);
    el.querySelector('.cur').style.display = n >= X.q.length ? 'none' : '';
    const cq = E.o(clamp((age - (X.typeD || 6) - .3) / 1.2)); cn.textContent = X.cn || ''; cn.style.opacity = String(cq);
    el.querySelector('.who').style.opacity = String(cq);
    el.style.opacity = String(qi * qo);
  }
}

/* one-shot events: flashes and letterbox changes */
function drawEvents(t) {
  let flash = 0;
  for (const ev of F.events || []) {
    if (ev.kind === 'flash') { const a = t - ev.t; if (a >= 0 && a < ev.d) { flash = Math.max(flash, (ev.op ?? 1) * (1 - E.o(a / ev.d))); if (ev.color) flashEl.style.background = ev.color; } }
  }
  flashEl.style.opacity = String(flash);
  let bars = 0;
  for (const ev of F.events || []) if (ev.kind === 'letterbox' && t >= ev.t) bars = ev.px;
  lb.style.setProperty('--lb', bars + 'vh');
}

/* ── the golden string ──────────────────────────────────────── */
const thread = { svg: $('#thread svg'), base: $('#thread .base'), line: $('#thread .line'), head: $('#thread .head'), nodes: [], labels: [], len: 0, pts: [] };
function buildThread() {
  const W = innerWidth, H = innerHeight, x0 = W * .055, x1 = W * .945, y = H - Math.max(52, H * .085);
  const pts = []; const N = 120;
  for (let i = 0; i <= N; i++) { const u = i / N; pts.push([lerp(x0, x1, u), y + Math.sin(u * Math.PI * 6) * 2.2]); }
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  thread.base.setAttribute('d', d); thread.line.setAttribute('d', d);
  thread.len = thread.line.getTotalLength(); thread.line.style.strokeDasharray = String(thread.len);
  thread.pts = { x0, x1, y };
  const g = $('#thread .nodes'); g.innerHTML = ''; thread.nodes = []; thread.labels = [];
  for (const c of F.chapters) {
    const x = lerp(x0, x1, c.t0 / F.end);
    const n = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); n.setAttribute('cx', x); n.setAttribute('cy', y); n.setAttribute('r', 2.6); n.setAttribute('class', 'node'); g.append(n);
    const xm = lerp(x0, x1, ((c.t0 + (c.t1 ?? F.end)) / 2) / F.end);   // label under the middle of its chapter
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'text'); l.setAttribute('x', xm); l.setAttribute('y', y + 18); l.setAttribute('text-anchor', 'middle'); l.setAttribute('class', 'yr'); l.textContent = c.year; g.append(l);
    thread.nodes.push([n, c]); thread.labels.push([l, c]);
  }
}
function drawThread(t) {
  const p = clamp(t / F.end); thread.line.style.strokeDashoffset = String(thread.len * (1 - p));
  const pt = thread.line.getPointAtLength(thread.len * p);
  thread.head.setAttribute('cx', pt.x); thread.head.setAttribute('cy', pt.y);
  for (const [n, c] of thread.nodes) n.classList.toggle('lit', t >= c.t0);
  for (const [l, c] of thread.labels) l.classList.toggle('lit', t >= c.t0 && (c.t1 == null || t < c.t1));
}

/* ── the main loop ──────────────────────────────────────────── */
const all = [...F.shots.map(s => ['shot', s]), ...F.lyrics.map(l => ['lyric', l]), ...(F.extras || []).map(x => ['extra', x])];
function window_(kind, s) {
  const pre = kind === 'shot' ? 1.2 : 0, post = kind === 'shot' ? 0.05 : (kind === 'lyric' ? (s.out ?? .7) + .05 : .05);
  return [s.t0 - pre, s.t1 + post];
}
let frame = 0;
function render(t) {
  frame++;
  for (const [kind, s] of all) {
    const [a, b] = window_(kind, s);
    const on = t >= a && t < b;
    if (on) { if (kind === 'shot') drawShot(s, t); else if (kind === 'lyric') drawLyric(s, t); else drawExtra(s, t); }
    else if (live.has(s)) { const n = live.get(s); if (n.m && n.m.tagName === 'VIDEO') { n.m.pause(); n.m.removeAttribute('src'); n.m.load(); } n.el.remove(); live.delete(s); }
  }
  drawEvents(t); drawThread(t);
  const mm = Math.floor(t / 60), ss = Math.floor(t % 60); clockEl.textContent = `${mm}:${ss < 10 ? '0' : ''}${ss} / ${Math.floor(F.end / 60)}:${(F.end % 60) < 10 ? '0' : ''}${Math.floor(F.end % 60)}`;
  if (DEBUG) hud.textContent = `t=${t.toFixed(2)}  live=${live.size}  ${[...live.keys()].filter(k => k.src).map(k => k.id || k.src.split('/').pop()).join(',')}`;
}
function loop() {
  const t = now();
  render(t);
  if (t >= F.end - .05 && !ended && !FREEZE) { ended = true; onEnd(); }
  requestAnimationFrame(loop);
}
function onEnd() { audio.pause(); document.body.classList.remove('playing'); $('#replay').classList.add('show'); }

/* ── controls ───────────────────────────────────────────────── */
function seek(t) { t = clamp(t, 0, F.end - .1); for (const [k, n] of live) { if (n.m && n.m.tagName === 'VIDEO') { n.m.pause(); n.m.removeAttribute('src'); n.m.load(); } n.el.remove(); } live.clear(); audio.currentTime = t; lastRead = -1; ended = false; $('#replay').classList.remove('show'); render(t); }
function togglePause() { if (audio.paused) { paused = false; audio.play().catch(() => {}); document.body.classList.add('playing'); } else { paused = true; audio.pause(); document.body.classList.remove('playing'); } }
addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); if (playing) togglePause(); }
  else if (e.code === 'ArrowRight') seek(now() + (e.shiftKey ? 30 : 5));
  else if (e.code === 'ArrowLeft') seek(now() - (e.shiftKey ? 30 : 5));
  else if (e.key === 'r' || e.key === 'R') seek(0);
  else if (e.key === 'd' || e.key === 'D') document.body.classList.toggle('debug');
});
$('#replay').addEventListener('click', () => { seek(0); audio.play().catch(() => {}); document.body.classList.add('playing'); });
addEventListener('resize', () => { buildThread(); });

async function start() {
  gate.classList.add('hidden'); playing = true; document.body.classList.add('playing');
  if (START_AT > 0) audio.currentTime = START_AT;
  if (FREEZE) { audio.pause(); paused = true; document.body.classList.remove('playing'); render(START_AT); return; }
  await audio.play();
}
(async function main() {
  buildThread(); render(START_AT);
  try { await preload(); } catch (e) { console.error(e); }
  requestAnimationFrame(loop);
  if (FREEZE) { await start(); return; }
  try { await start(); }
  catch (e) {   // autoplay with sound blocked: wait for the first gesture (no poster, just a pulse)
    gate.classList.remove('hidden'); gate.classList.add('ready'); playing = false;
    const go = () => { gate.removeEventListener('click', go); removeEventListener('keydown', go); removeEventListener('touchend', go); start().catch(() => {}); };
    gate.addEventListener('click', go); addEventListener('keydown', go); addEventListener('touchend', go);
  }
})();
})();
