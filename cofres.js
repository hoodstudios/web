/* HOOD STUDIO — Cofre de End
 * +1 cofre por cada nivel que sube el jugador (players/{uid}.chests, con lvChest = último nivel premiado).
 * Premios: config/chest { pool: [{k:"c", n:10..500, w}, {k:"i", id, w}] } (lo edita HOODSTUDIO). Sin config se usa el predeterminado.
 * Los artículos marcados "chestOnly" en la tienda entran solos al premio (peso 8) y no se pueden comprar.
 * Las reglas de Firestore limitan cada apertura: 1 cofre gastado a cambio de 10–500 monedas o 1 artículo nuevo. */
import { Mercado } from "./mercado.js";

const ADMIN_EMAIL = "hoodstudio@hoodstudio.app";
const DEFAULT_POOL = [
  { k: "c", n: 10, w: 300 }, { k: "c", n: 25, w: 250 }, { k: "c", n: 50, w: 170 }, { k: "c", n: 100, w: 110 },
  { k: "c", n: 200, w: 50 }, { k: "c", n: 350, w: 18 }, { k: "c", n: 500, w: 6 }
];
const RAR = { gris: "#9fb2c4", azul: "#4b8bff", morado: "#a45cff", rosa: "#e83fd2", oro: "#ffc93a", rojo: "#ff4a4a" };
let D = null, cfg = null, cfgAt = 0, busy = false, syncing = false, ico = {};

/* ---------- utilidades ---------- */
const esc = s => D.esc(s);
const isAdmin = () => { const u = D && D.auth.currentUser; return !!(u && (u.email || "").toLowerCase() === ADMIN_EMAIL); };
const rnd = () => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } };
const T = ms => new Promise(r => setTimeout(r, ms));
const ease = t => 1 - Math.pow(1 - t, 4);

/* ---------- pixel art del cofre ---------- */
const C = { O: "#03100f", a: "#2f8178", b: "#18504b", c: "#0d312f", d: "#0a2321", r: "#47b6a6", L: "#1c1c26", E: "#8bffe4", G: "#c8fff0", I: "#06191a" };
function chestPx(g, ox, oy, s, lid = 0) {            // lid: 0 cerrado … 1 abierto del todo. (ox, oy) = esquina sup. izq. del cofre cerrado; s = tamaño de cada "pixel"
  const R = (x, y, w, h, c) => { g.fillStyle = C[c] || c; g.fillRect(Math.round(ox + x * s), Math.round(oy + y * s), Math.ceil(w * s), Math.ceil(h * s)); };
  const by = 5;                                      // el cuerpo empieza en la fila 5
  R(0, by, 16, 9, "O"); R(1, by + 1, 14, 7, "b");
  R(1, by + 1, 14, 1, "c"); R(1, by + 6, 14, 2, "d");
  for (const x of [1, 13]) for (const y of [by + 2, by + 5]) R(x, y, 2, 1, "r");
  R(2, by + 3, 12, 1, "c");
  const by0 = by;
  if (lid > 0.02) { g.globalAlpha = Math.min(1, lid * 1.6); R(1, by0 + 1, 14, 3, "I"); R(2, by0 + 1, 12, 2, "G"); R(2, by0 + 3, 12, 1, "E"); g.globalAlpha = 1; }   // interior iluminado
  const bot = by0 - 3.4 * lid, lh = 5 * (1 - .62 * lid), top = bot - lh;                          // la tapa se levanta y se inclina hacia atrás
  const Rl = (x, y, w, h, c) => { g.fillStyle = C[c] || c; g.fillRect(Math.round(ox + x * s), Math.round(oy + (top + y * lh / 5) * s), Math.ceil(w * s), Math.max(1, Math.ceil(h * lh / 5 * s))); };
  Rl(0, 0, 16, 5, "O"); Rl(1, 1, 14, 3, lid > .3 ? "c" : "b"); Rl(1, 1, 14, 1, "a"); Rl(1, 3, 14, 1, "c");
  Rl(2, 1, 1, 1, "r"); Rl(13, 1, 1, 1, "r");
  if (lid < 0.08) { R(6, by - 1, 4, 4, "O"); R(7, by, 2, 2, "L"); R(7, by + .5, 2, 1, "E"); }     // cierre (ojo de Ender)
}
function chestIcon(open = 0) {
  const k = "i" + open; if (ico[k]) return ico[k];
  const c = document.createElement("canvas"); c.width = 18; c.height = 16; const g = c.getContext("2d");
  chestPx(g, 1, 1, 1, open); return (ico[k] = c.toDataURL());
}

/* ---------- sonido ---------- */
let AC = null;
const au = () => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; } catch (e) { return null; } };
function tone(f0, f1, dur, type = "sine", vol = .08, at = 0) {
  const a = au(); if (!a) return; const t = a.currentTime + at, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.03, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .05);
}
function noise(dur, vol = .12, f = 1800, at = 0) {
  const a = au(); if (!a) return; const n = Math.floor(a.sampleRate * dur), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + at;
  s.buffer = b; fl.type = "lowpass"; fl.frequency.value = f; g.gain.value = vol; s.connect(fl).connect(g).connect(a.destination); s.start(t);
}
const sfx = {
  charge() { tone(70, 520, 1.5, "sawtooth", .045); tone(140, 1040, 1.5, "triangle", .03); },
  burst() { noise(.7, .22, 3200); tone(520, 90, .5, "square", .07); tone(880, 1760, .35, "triangle", .06, .05); },
  tick() { tone(1250 + rnd() * 120, 700, .035, "square", .05); },
  win(i) { const n = [523, 659, 784, 1047, 1319]; for (let k = 0; k < Math.min(5, 3 + i); k++) tone(n[k], n[k], .38, "triangle", .07, k * .09); if (i >= 3) noise(.5, .1, 6000, .2); },
  coin() { tone(988, 988, .08, "square", .04); tone(1319, 1319, .22, "square", .04, .07); }
};

/* ---------- premios ---------- */
async function loadCfg(force) {
  if (!force && cfgAt && Date.now() - cfgAt < 60000) return cfg;
  try {
    const s = await D.fb.getDoc(D.fb.doc(D.db, "config", "chest"));
    const p = s.exists() && Array.isArray(s.data().pool) ? s.data().pool : null;
    cfg = p ? p.map(e => ({ k: e.k === "i" ? "i" : "c", n: Math.floor(Number(e.n)) || 0, id: String(e.id || ""), w: Math.max(0, Number(e.w) || 0) })) : null;
  } catch (e) { cfg = null; }
  cfgAt = Date.now(); return cfg;
}
function rarity(e) {
  if (e.k === "c") return e.n <= 25 ? RAR.gris : e.n <= 60 ? RAR.azul : e.n <= 150 ? RAR.morado : e.n <= 300 ? RAR.rosa : RAR.oro;
  const it = e.it; if (it.chestOnly) return RAR.rojo;
  return it.price <= 100 ? RAR.azul : it.price <= 300 ? RAR.morado : RAR.rosa;
}
async function effPool() {                                   // premios válidos (con los artículos exclusivos incluidos)
  await Promise.all([loadCfg(), Mercado.loadShop()]);
  const shop = new Map(Mercado.shopItems().map(i => [i.id, i])), raw = cfg || DEFAULT_POOL, out = [], seen = new Set();
  for (const e of raw) {
    if (!(e.w > 0)) { if (e.k === "i") seen.add(e.id); continue; }
    if (e.k === "c") { const n = Math.floor(e.n); if (n >= 10 && n <= 500) out.push({ k: "c", n, w: e.w }); }
    else { const it = shop.get(e.id); seen.add(e.id); if (it && !it.hidden && (it.chestOnly || it.price <= 500)) out.push({ k: "i", id: e.id, w: e.w, it }); }
  }
  for (const it of shop.values()) if (it.chestOnly && !it.hidden && !seen.has(it.id)) out.push({ k: "i", id: it.id, w: 8, it });
  out.forEach(e => (e.col = rarity(e)));
  return out;
}
function pick(pool) { const tot = pool.reduce((a, e) => a + e.w, 0); let r = rnd() * tot; for (const e of pool) { r -= e.w; if (r < 0) return e; } return pool[pool.length - 1]; }
const cardHtml = e => e.k === "c"
  ? `<div class="cf-card" style="--rc:${e.col}"><div class="cf-ic"><img class="px" src="${Mercado.coinIcon()}" alt=""></div><b>${e.n}</b><small>monedas</small></div>`
  : `<div class="cf-card" style="--rc:${e.col}"><div class="cf-ic">${Mercado.thumb(e.it)}</div><b>${esc(e.it.name)}</b><small>${e.it.chestOnly ? "Exclusivo" : "Artículo"}</small></div>`;

/* ---------- animación de apertura (pantalla completa) ---------- */
async function openChest(u) {
  if (busy || !u || !(u.chests > 0)) return;
  busy = true; au();
  let pool;
  try { pool = await effPool(); } catch (e) { pool = []; }
  if (!pool.length) pool = DEFAULT_POOL.map(e => ({ ...e, col: rarity(e) }));
  const owned = new Set(Array.isArray(u.inv) ? u.inv : []);
  const win = pick(pool.filter(e => e.k === "c" || !owned.has(e.id)));
  const ov = document.createElement("div"); ov.className = "cf-ov";
  ov.innerHTML = `<div class="cf-bg"></div><canvas class="cf-cv"></canvas>
    <div class="cf-ttl"><small>Cofre de End</small><b></b></div>
    <div class="cf-roul" hidden><i class="cf-mk"></i><div class="cf-win"><div class="cf-strip"></div></div></div>
    <div class="cf-rev" hidden></div>
    <button class="cf-skip" type="button" hidden>Saltar ▶▶</button>
    <p class="cf-err" hidden></p>`;
  document.body.append(ov); document.body.classList.add("mk-noscroll"); requestAnimationFrame(() => ov.classList.add("on"));
  const cv = ov.querySelector("canvas"), g = cv.getContext("2d"), $o = s => ov.querySelector(s);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches, K = reduce ? .35 : 1;
  let W = 0, H = 0, dpr = 1, raf = 0, dead = false, skipped = false, revealed = false;
  const st = { alpha: 1, lid: 0, shake: 0, glow: 0, pose: 0, drop: 0, parts: [], beam: 0, flash: 0, col: "#b27cff", conf: 0 };
  const size = () => { dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; };
  size(); addEventListener("resize", size);
  const burst = (n, col, sp = 420, ox = 0, oy = 0) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.283, v = sp * (.25 + rnd() * .75); st.parts.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * .25, l: 0, max: .7 + rnd() * 1, c: col, s: 3 + rnd() * 5, g: 380 }); } };
  const t0 = performance.now();
  const loop = now => {
    if (dead) return; raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, (now - (loop.p || now)) / 1000); loop.p = now;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const s0 = Math.max(5, Math.min(W / 46, H / 32)), s = s0 * (1 - st.pose * .55);                 // tamaño del pixel del cofre
    const cx = W / 2, cy = H * (.5 - st.pose * .32) + (1 - ease(Math.min(1, st.drop))) * -H * .7;
    const sh = st.shake * (rnd() - .5) * s * .9, shy = st.shake * (rnd() - .5) * s * .6;
    // resplandor
    const gl = st.glow, rg = g.createRadialGradient(cx, cy, 0, cx, cy, s * (14 + gl * 12));
    rg.addColorStop(0, `rgba(160,90,255,${.18 + gl * .5})`); rg.addColorStop(.5, `rgba(60,255,200,${gl * .18})`); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    // rayo de luz al abrir
    if (st.beam > 0) {
      const bw = s * (3 + st.beam * 9), bg = g.createLinearGradient(0, cy, 0, 0); bg.addColorStop(0, st.col); bg.addColorStop(1, "rgba(255,255,255,0)");
      g.save(); g.globalAlpha = Math.min(1, st.beam) * .65; g.globalCompositeOperation = "lighter"; g.fillStyle = bg;
      g.beginPath(); g.moveTo(cx - bw * .35, cy); g.lineTo(cx - bw, 0); g.lineTo(cx + bw, 0); g.lineTo(cx + bw * .35, cy); g.fill(); g.restore();
    }
    // cofre
    g.save(); g.globalAlpha = st.alpha; g.imageSmoothingEnabled = false; g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = s * 1.2; g.shadowOffsetY = s * .8;
    g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(cx, cy + s * 5.6 + s * 1.4, s * 9, s * 1.4, 0, 0, 7); g.fill();
    g.shadowColor = "transparent";
    chestPx(g, cx - s * 8 + sh, cy - s * 5 + shy, s, st.lid); g.restore();
    // partículas (coords relativas al cofre)
    g.save(); g.translate(cx, cy); g.globalCompositeOperation = "lighter";
    for (let i = st.parts.length - 1; i >= 0; i--) {
      const p = st.parts[i]; p.l += dt; if (p.l > p.max) { st.parts.splice(i, 1); continue; }
      if (p.to) { const k = Math.min(1, p.l / p.max); p.x = p.x0 * (1 - k * k); p.y = p.y0 * (1 - k * k); }
      else { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      g.globalAlpha = Math.max(0, 1 - p.l / p.max); g.fillStyle = p.c; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.restore();
    if (st.conf > 0 && st.parts.length < 260) for (let i = 0; i < 3; i++) st.parts.push({ x: (rnd() - .5) * W, y: -H * .5 - 10, vx: (rnd() - .5) * 90, vy: 140 + rnd() * 220, l: 0, max: 3 + rnd() * 1.5, c: i % 2 ? st.col : "#fff", s: 4 + rnd() * 5, g: 80 });
    if (st.flash > 0) { g.fillStyle = `rgba(255,255,255,${st.flash})`; g.fillRect(0, 0, W, H); st.flash = Math.max(0, st.flash - dt * 2.4); }
  };
  raf = requestAnimationFrame(loop);
  const close = () => { if (dead) return; dead = true; cancelAnimationFrame(raf); removeEventListener("resize", size); document.removeEventListener("keydown", key, true); document.body.classList.remove("mk-noscroll"); ov.classList.remove("on"); setTimeout(() => ov.remove(), 260); busy = false; D.refresh(); };
  const key = e => {
    if (e.key !== "Escape" && e.key !== " " && e.key !== "Enter") return;
    e.preventDefault(); e.stopPropagation();
    if (revealed) { if (e.key === "Escape") close(); } else if (skipFn) skipFn(); else if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", key, true);
  let skipFn = null;
  const fail = (er) => {
    const p = $o(".cf-err"); p.hidden = false;
    p.innerHTML = `No se pudo abrir el cofre${er && er.code ? " (" + esc(er.code) + ")" : ""}. ¿Publicaste las reglas nuevas de Firestore?<br><button class="btn solid" type="button">Cerrar</button>`;
    p.querySelector("button").onclick = close;
  };
  // 1) escritura en paralelo con el suspenso (la reglas validan: 1 cofre → 10–500 monedas o 1 artículo)
  const ref = D.fb.doc(D.db, "players", u.uid);
  const data = win.k === "c" ? { chests: D.fb.increment(-1), coins: D.fb.increment(win.n) } : { chests: D.fb.increment(-1), inv: D.fb.arrayUnion(win.id) };
  const wr = D.fb.updateDoc(ref, data).then(() => { u.chests = Math.max(0, (u.chests || 0) - 1); if (win.k === "c") u.coins = (u.coins || 0) + win.n; else { u.inv = [...(u.inv || []), win.id]; } D.refresh(); return true; }).catch(e => { console.warn(e); return e || { code: "error" }; });
  // 2) intro y carga
  $o(".cf-ttl b").textContent = u.chests > 1 ? `Te quedan ${u.chests}` : "Tu último cofre";
  await T(120);
  const tween = (ms, fn) => new Promise(r => { const a = performance.now(); const f = n => { const k = Math.min(1, (n - a) / ms); fn(k); if (k < 1 && !dead) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  await tween(650 * K, k => { st.drop = k; });
  if (dead) return;
  sfx.charge(); const chargeMs = 1500 * K;
  const spawn = setInterval(() => { for (let i = 0; i < 4; i++) { const a = rnd() * 6.283, r = 260 + rnd() * 240, x0 = Math.cos(a) * r, y0 = Math.sin(a) * r * .7; st.parts.push({ x0, y0, x: x0, y: y0, to: 1, l: 0, max: .55 + rnd() * .5, c: rnd() < .5 ? "#b27cff" : "#5dffd2", s: 3 + rnd() * 4 }); } }, 40);
  await tween(chargeMs, k => { st.shake = k * k * 1; st.glow = k; });
  clearInterval(spawn);
  const res = await wr;
  if (dead) return;
  if (res !== true) { fail(res); return; }
  // 3) apertura
  st.shake = 0; st.col = win.col; sfx.burst(); st.flash = .85; burst(140, "#b27cff", 520); burst(70, "#5dffd2", 380); burst(50, win.col, 620);
  tween(520 * K, k => { st.lid = ease(k); st.beam = Math.sin(k * Math.PI * .5); });
  await T(650 * K); if (dead) return;
  // 4) ruleta (tipo caja de Counter-Strike)
  const roul = $o(".cf-roul"), strip = $o(".cf-strip"); roul.hidden = false; requestAnimationFrame(() => roul.classList.add("on"));
  tween(600 * K, k => { st.pose = ease(k); $o(".cf-ttl").style.opacity = 1 - k; st.beam = Math.max(0, 1 - k) * .9; st.glow = 1 - k * .6; });
  const N = 64, WI = 52, items = [];
  for (let i = 0; i < N; i++) items.push(i === WI ? win : pick(pool));
  strip.innerHTML = items.map(cardHtml).join("");
  const cards = [...strip.children], vp = $o(".cf-win");
  const cw = () => cards[0].offsetWidth + (parseFloat(getComputedStyle(strip).columnGap) || 10);
  const mid = () => vp.clientWidth / 2;
  const jit = (rnd() - .5) * .62;
  const fin = () => WI * cw() + cw() / 2 + jit * cw() - mid(), start = -mid() * .2;
  let lastIdx = -1;
  const setX = x => { strip.style.transform = `translate3d(${-x}px,0,0)`; const idx = Math.floor((x + mid()) / cw()); if (idx !== lastIdx) { lastIdx = idx; sfx.tick(); } };
  setX(start);
  const skipBtn = $o(".cf-skip"); skipBtn.hidden = false;
  await new Promise(done => {
    const dur = (reduce ? 1800 : 6400), a0 = performance.now(); let ended = false;
    const finish = () => { if (ended) return; ended = true; skipFn = null; done(); };
    skipFn = () => { skipped = true; setX(fin()); finish(); };
    skipBtn.onclick = () => skipFn && skipFn();
    const f = n => { if (ended || dead) return finish(); const k = Math.min(1, (n - a0) / dur); setX(start + (fin() - start) * ease(k)); if (k < 1) requestAnimationFrame(f); else finish(); };
    requestAnimationFrame(f);
  });
  if (dead) return;
  skipBtn.hidden = true; revealed = true;
  // 5) resultado
  const ri = [RAR.gris, RAR.azul, RAR.morado, RAR.rosa, RAR.oro, RAR.rojo].indexOf(win.col);
  cards.forEach((c, i) => { if (i !== WI) c.classList.add("dim"); else c.classList.add("won"); });
  sfx.win(ri < 0 ? 0 : ri); if (win.k === "c") sfx.coin();
  st.col = win.col; st.beam = 1; st.flash = .35; burst(110, win.col, 560); st.conf = 1; st.glow = 1;
  await T(750 * K); if (dead) return;
  tween(500 * K, k => { st.alpha = 1 - k; }); roul.classList.remove("on"); setTimeout(() => (roul.hidden = true), 400);
  const rv = $o(".cf-rev"); rv.hidden = false;
  const left = u.chests || 0;
  rv.style.setProperty("--rc", win.col);
  rv.innerHTML = `<small>¡Conseguiste!</small><div class="cf-big">${cardHtml(win)}</div>
    <h3>${win.k === "c" ? `+<span id="cf-cnt">0</span> monedas` : esc(win.it.name)}</h3>
    ${win.k === "i" ? `<p>${win.it.chestOnly ? "Artículo exclusivo del Cofre de End · " : ""}ya está en tu inventario.</p>` : ""}
    <div class="cf-btns">${left > 0 ? `<button class="btn solid" id="cf-more" type="button">Abrir otro <b>X ${left}</b></button>` : ""}<button class="btn" id="cf-ok" type="button">Cerrar</button></div>`;
  requestAnimationFrame(() => rv.classList.add("on"));
  if (win.k === "c") tween(900 * K, k => { const e = $o("#cf-cnt"); if (e) e.textContent = Math.round(win.n * ease(k)); });
  $o("#cf-ok").onclick = close;
  const more = $o("#cf-more"); if (more) more.onclick = () => { close(); setTimeout(() => openChest(D.me()), 300); };
}

/* ---------- editor de premios (HOODSTUDIO) ---------- */
async function editor() {
  if (!isAdmin()) return;
  await Mercado.loadShop(); await loadCfg(true);
  const items = Mercado.shopItems().filter(i => !i.hidden && (i.chestOnly || i.price <= 500)).sort((a, b) => (b.chestOnly - a.chestOnly) || a.name.localeCompare(b.name));
  let rows = (cfg || DEFAULT_POOL).map(e => ({ ...e }));
  const m = Mercado.asModal(`<h3>Premios del Cofre de End</h3>
    <p class="mk-tip">Las monedas van de 10 a 500. Los artículos exclusivos (marcados en la tienda) entran solos con peso 8. El peso 0 quita un premio.</p>
    <div class="cf-ed" id="cf-ed"></div>
    <div class="mk-fbtn cf-edbt"><button class="btn" type="button" data-a="c">＋ Monedas</button><button class="btn" type="button" data-a="i">＋ Artículo</button><button class="btn" type="button" data-a="d">Restaurar</button></div>
    <p class="err" id="cf-ee" role="alert"></p>
    <div class="mk-fbtn"><button class="btn" type="button" data-a="x">Cancelar</button><button class="btn solid" type="button" data-a="s">Guardar</button></div>`, "wide");
  const box = m.querySelector("#cf-ed"), err = m.querySelector("#cf-ee");
  const draw = () => {
    const tot = rows.reduce((a, e) => a + (e.w > 0 ? e.w : 0), 0) || 1;
    box.innerHTML = rows.map((e, i) => `<div class="cf-er" data-i="${i}">
      ${e.k === "c" ? `<label>Monedas<input type="number" min="10" max="500" step="1" value="${e.n}" data-f="n"></label>`
        : `<label>Artículo<select data-f="id">${items.map(it => `<option value="${esc(it.id)}" ${it.id === e.id ? "selected" : ""}>${esc(it.name)}${it.chestOnly ? " (exclusivo)" : ""}</option>`).join("")}</select></label>`}
      <label>Peso<input type="number" min="0" max="1000" step="1" value="${e.w}" data-f="w"></label>
      <span class="cf-pc">${e.w > 0 ? (e.w / tot * 100).toFixed(1) : "0"}%</span>
      <button class="btn mini" type="button" data-del="${i}" title="Quitar">✕</button></div>`).join("") || `<p class="muted">Sin premios: se usará el predeterminado.</p>`;
  };
  draw();
  box.oninput = e => { const r = e.target.closest(".cf-er"); if (!r) return; const o = rows[+r.dataset.i], f = e.target.dataset.f; o[f] = f === "id" ? e.target.value : Number(e.target.value); if (f === "w") draw2(); };
  const draw2 = () => { const tot = rows.reduce((a, e) => a + (e.w > 0 ? e.w : 0), 0) || 1; box.querySelectorAll(".cf-er").forEach((r, i) => { r.querySelector(".cf-pc").textContent = (rows[i].w > 0 ? rows[i].w / tot * 100 : 0).toFixed(1) + "%"; }); };
  box.onclick = e => { const b = e.target.closest("[data-del]"); if (b) { rows.splice(+b.dataset.del, 1); draw(); } };
  m.addEventListener("click", async e => {
    const b = e.target.closest("[data-a]"); if (!b) return; const a = b.dataset.a;
    if (a === "c") { rows.push({ k: "c", n: 50, w: 50 }); draw(); }
    else if (a === "i") { if (!items.length) { err.textContent = "No hay artículos válidos (hasta 500 monedas o exclusivos)."; return; } rows.push({ k: "i", id: items[0].id, w: 20 }); draw(); }
    else if (a === "d") { rows = DEFAULT_POOL.map(x => ({ ...x })); draw(); }
    else if (a === "x") m.close();
    else if (a === "s") {
      err.textContent = "";
      for (const r of rows) {
        if (!(r.w >= 0 && r.w <= 1000)) return void (err.textContent = "Los pesos van de 0 a 1000.");
        if (r.k === "c" && !(Number.isInteger(r.n) && r.n >= 10 && r.n <= 500)) return void (err.textContent = "Las monedas deben ser un entero de 10 a 500.");
        if (r.k === "i" && !r.id) return void (err.textContent = "Elige un artículo.");
      }
      b.disabled = true;
      try {
        await D.fb.setDoc(D.fb.doc(D.db, "config", "chest"), { pool: rows.map(r => r.k === "c" ? { k: "c", n: r.n, w: r.w } : { k: "i", id: r.id, w: r.w }) });
        cfg = rows.map(r => ({ ...r })); cfgAt = Date.now(); m.close();
      } catch (er) { console.warn(er); err.textContent = "No se pudo guardar" + (er && er.code ? " (" + er.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"; b.disabled = false; }
    }
  });
}

/* ---------- piezas de interfaz ---------- */
const seenKey = u => "hood_cf_seen_" + u.uid;
const getSeen = u => { try { return Number(localStorage.getItem(seenKey(u))) || 0; } catch (e) { return 0; } };
const setSeen = (u, n) => { try { localStorage.setItem(seenKey(u), String(n)); } catch (e) { /* sin almacenamiento */ } };
function toast(html, onclick) {
  const t = document.createElement("div"); t.className = "cf-toast"; t.innerHTML = html;
  if (onclick) { t.style.cursor = "pointer"; t.onclick = () => { t.remove(); onclick(); }; }
  document.body.append(t); requestAnimationFrame(() => t.classList.add("on"));
  setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 400); }, 5200);
}

export const Cofres = {
  init(deps) { D = deps; },
  icon: chestIcon,
  /* Sube de nivel → +1 cofre por nivel. La primera vez solo fija el nivel actual (sin cofres retroactivos). */
  async sync(u) {
    if (!D || !u || syncing) return; syncing = true;
    try {
      const L = D.lvl(u.xp || 0), ref = D.fb.doc(D.db, "players", u.uid);
      if (u.lvChest == null) { await D.fb.updateDoc(ref, { lvChest: L }); u.lvChest = L; }
      else if (L > u.lvChest) {
        const n = L - u.lvChest;
        await D.fb.updateDoc(ref, { chests: D.fb.increment(n), lvChest: L });
        u.chests = (u.chests || 0) + n; u.lvChest = L;
        toast(`<img class="px" src="${chestIcon()}" alt=""><div><b>¡Nivel ${L}!</b><span>Ganaste ${n > 1 ? n + " Cofres" : "un Cofre"} de End</span></div>`, () => { location.hash = D.link(u.name); });
        D.refresh();
      }
    } catch (e) { console.warn("Cofres:", e); }
    finally { syncing = false; }
  },
  /* Notificación junto a tu cabeza (barra de arriba): visible mientras tengas cofres que aún no viste */
  badge(box, u) {
    if (!u || !(u.chests > 0) || u.chests <= getSeen(u)) return;
    const a = document.createElement("a"); a.className = "cf-bdg"; a.href = D.link(u.name); a.title = `Tienes ${u.chests} Cofre${u.chests > 1 ? "s" : ""} de End`;
    a.innerHTML = `<img class="px" src="${chestIcon()}" alt="Cofre de End">${u.chests > 1 ? `<b>X ${u.chests}</b>` : ""}<i></i>`;
    box.prepend(a);
  },
  seen(u) { if (!u) return; if (getSeen(u) !== (u.chests || 0)) { setSeen(u, u.chests || 0); D.refresh(); } },
  /* Columna izquierda del perfil */
  rail(host, { mine, count, name }) {
    if (!host) return; const n = Math.max(0, Math.floor(count) || 0), u = D.me();
    const x = n > 1 ? `<b class="cf-n">X ${n}</b>` : "";
    host.innerHTML = `<div class="cf-box${n ? " has" : ""}"><div class="cf-ico"><img class="px" src="${chestIcon()}" alt="Cofre de End">${x}</div>
      <small>Cofre de End</small>
      ${mine ? (n ? `<button class="btn solid mini" type="button" id="cf-open">Abrir</button>` : `<p class="muted">Sube de nivel para ganar uno.</p>`) : `<p class="muted">${n ? n + " sin abrir" : "Sin cofres"}</p>`}
      ${mine && isAdmin() ? `<button class="btn mini" type="button" id="cf-edit">✎ Premios</button>` : ""}</div>`;
    const o = host.querySelector("#cf-open"); if (o) o.onclick = () => openChest(D.me());
    const ico_ = host.querySelector(".cf-ico"); if (mine && n) ico_.onclick = () => openChest(D.me());
    const e = host.querySelector("#cf-edit"); if (e) e.onclick = editor;
  },
  open: () => openChest(D && D.me()),
  editor
};
