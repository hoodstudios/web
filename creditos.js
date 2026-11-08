/* creditos.js — Créditos: selector de personajes estilo juego de peleas.
 *
 *  - Sin personaje elegido: fondo del End. Colaborador: Nether. Donador: Overworld.
 *  - Al elegir uno, aparece teletransportado (partículas moradas + sonido) como un modelo 3D de Minecraft que hace
 *    animaciones aleatorias (idle, agacharse varias veces, golpes). A la otra mitad de la pantalla sale su ficha.
 *  - PERSONAJES: viven en Firestore, colección "credits". Cada documento:
 *      { name, group: "collab"|"donor", tag, roles, bio, skin (PNG 64×64 en base64 o null), slim, links:{x,tiktok,youtube,instagram,twitch}, order }
 *  - ADMIN: la cuenta HOODSTUDIO (hoodstudio@hoodstudio.app). Al entrar verá "+" en los espacios vacíos y "Editar" en cada ficha.
 *    Pega las reglas nuevas de firestore.rules (bloque match /credits/{id}) en Firebase > Firestore Database > Reglas. */
import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, addDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { loadSkin } from "./avatar.js";
import { createPlayer, Brain, toSkin64, isSlim, bust } from "./mcplayer.js";

const firebaseConfig = {
  apiKey: "AIzaSyCStG20rFbespxXq39zbGCbIERhWmWWRtQ",
  authDomain: "hoodstudioweb.firebaseapp.com",
  projectId: "hoodstudioweb",
  storageBucket: "hoodstudioweb.firebasestorage.app",
  messagingSenderId: "173223418478",
  appId: "1:173223418478:web:be7f06f9c500612f42647f"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);

/* ---------- Configuración ---------- */
const ADMIN_EMAILS = ["hoodstudio@hoodstudio.app"];
const LOCAL_SKIN = "img/skin-default.png";
const DEMO_SI_FALLA = true;          // si Firestore no responde (reglas sin pegar), muestra un personaje de ejemplo. Ponlo en false al terminar.
const MIN_SLOTS = 12;                // espacios mínimos por grupo (2 filas de 6)
const PER_ROW = 6;
const BGS = { end: "img/creditos/end.jpg", collab: "img/creditos/nether.jpg", donor: "img/creditos/overworld.jpg" };
const NET = {
  x: { n: "X (Twitter)", svg: `<path d="M3 3l7.5 10L3 21h2l6.4-7 5 7H21l-7.9-10.6L20 3h-2l-5.9 6.4L7.6 3H3z"/>` },
  tiktok: { n: "TikTok", svg: `<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2 4.2 5 4.5" fill="none" stroke="currentColor" stroke-width="2.2"/>` },
  youtube: { n: "YouTube", svg: `<rect x="2" y="5" width="20" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9l5 3-5 3z"/>` },
  instagram: { n: "Instagram", svg: `<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.3" cy="6.7" r="1.2"/>` },
  twitch: { n: "Twitch", svg: `<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>` }
};
const DEMO = [{
  id: "demo", name: "HOOD21", group: "collab", tag: "OWNER", roles: "Modder, Comandos, Texturas, Modelos, Builder", order: 0, skin: null, slim: false,
  bio: "Me gusta Minecraft, hago servidores desde hace 6 años y mi canal de twitch esta bien muerto",
  links: { x: "https://x.com/hoodstudiomc", tiktok: "https://www.tiktok.com/@hood__21", youtube: "https://www.youtube.com/@Ihood21", instagram: "https://www.instagram.com/hood__21/", twitch: "https://www.twitch.tv/ihood21" }
}];

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
const rolesText = r => String(r || "").split(/[,·]/).map(s => s.trim()).filter(Boolean).join(" · ");

const sec = $("#v-creditos"), stage = $("#cr-stage"), glCv = $("#cr-gl"), fxCv = $("#cr-fx"), panel = $("#cr-panel"), tip = $("#cr-tip"), shadow = $("#cr-shadow"), bgsEl = $("#cr-bgs"), edHost = $("#cr-ed");
if (!sec || !stage) throw new Error("creditos: falta el HTML de la sección");

/* ---------- Estado ---------- */
let chars = [], sel = null, isAdmin = false, loaded = false, loadFailed = false, active = false, raf = 0, last = 0, token = 0;
const skins = new Map();                                        // id -> { key, cv (64×64), slim }
const A = { cur: 0, target: 0, speed: 2.4, flash: 0, pop: 1, side: 1 };
const ptr = { x: 0.5, y: 0.4 };
const brain = new Brain();
let player = null, glError = false, age = 0, headX = 0, headY = 0;

/* ---------- Fondos (End por defecto; Nether = colaborador; Overworld = donador) ---------- */
const bgEls = {};
for (const k of Object.keys(BGS)) { const d = document.createElement("div"); d.className = "cr-bg"; d.style.backgroundImage = `url("${BGS[k]}")`; bgsEl.append(d); bgEls[k] = d; }
const setBg = k => { for (const n in bgEls) bgEls[n].classList.toggle("on", n === k); };
setBg("end");

/* ---------- Sonido del teletransporte ---------- */
const snd = new Audio(); snd.preload = "auto";
snd.src = snd.canPlayType('audio/ogg; codecs="vorbis"') ? "sonidos/teleport.ogg" : "sonidos/teleport.mp3";
const playTp = () => { try { const a = snd.cloneNode(); a.volume = 0.6; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} };

/* ============================================================ Partículas (efecto de enderpearl) */
const fx = { ps: [], ctx: fxCv.getContext("2d"), w: 1, h: 1, dpr: 1, ring: [] };
const PAL = ["#c78bff", "#a35cf0", "#8a3fd8", "#6a24b0", "#e6c4ff", "#4b1a80", "#ffffff"];
function fxSize() {
  const dpr = Math.min(2, devicePixelRatio || 1), w = fxCv.clientWidth, h = fxCv.clientHeight;
  if (fxCv.width !== Math.round(w * dpr) || fxCv.height !== Math.round(h * dpr)) { fxCv.width = Math.round(w * dpr); fxCv.height = Math.round(h * dpr); }
  fx.w = w; fx.h = h; fx.dpr = dpr;
}
function bodyBox() {                                              // zona visible del personaje (para colocar las partículas)
  if (!player) return { cx: fx.w / 2, top: fx.h * 0.2, bot: fx.h * 0.8, hw: fx.w * 0.1 };
  const head = player.project([0, 32, 0]), feet = player.project([0, 0, 0]), l = player.project([-8, 16, 0]), r = player.project([8, 16, 0]);
  return { cx: head.x, top: Math.max(8, head.y), bot: Math.min(fx.h - 4, feet.y), hw: Math.max(24, Math.abs(r.x - l.x) / 2) };
}
const unit = () => Math.max(1.2, Math.min(3, fx.h / 420));
function spark(o) { fx.ps.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 1, max: 1, s: 6, c: PAL[0], mode: "out", add: false }, o)); }
function converge() {                                              // antes de aparecer: las partículas se juntan en el sitio
  const b = bodyBox(), u = unit();
  for (let i = 0; i < 34; i++) {
    const a = rnd(0, Math.PI * 2), R = rnd(0.9, 1.7) * (b.hw + 40 * u), ty = rnd(b.top + (b.bot - b.top) * 0.05, b.bot - (b.bot - b.top) * 0.05);
    const L = rnd(0.24, 0.36);
    spark({ x: b.cx + Math.cos(a) * R, y: ty + Math.sin(a) * R * 0.55, tx: b.cx + rnd(-b.hw * 0.5, b.hw * 0.5), ty, sx: 0, sy: 0, life: L, max: L, s: Math.round(rnd(3, 6) * u / 2) * 2 || 2, c: PAL[(Math.random() * 5) | 0], mode: "in", add: Math.random() < 0.4 });
    const p = fx.ps[fx.ps.length - 1]; p.sx = p.x; p.sy = p.y;
  }
}
function burst(n = 70) {                                           // al aparecer / al irse: explota hacia afuera
  const b = bodyBox(), u = unit();
  for (let i = 0; i < n; i++) {
    const L = rnd(0.55, 1.25);
    spark({ x: b.cx + rnd(-b.hw, b.hw), y: rnd(b.top, b.bot), vx: rnd(-70, 70) * u, vy: rnd(-110, 10) * u, life: L, max: L, s: Math.round(rnd(3, 8) * u / 2) * 2 || 2, c: PAL[(Math.random() * PAL.length) | 0], add: Math.random() < 0.35 });
  }
  fx.ring.push({ x: b.cx, y: Math.min(b.bot, fx.h * 0.9), t: 0, r: b.hw * 2.2 });
  fx.flashT = 1; fx.flashAt = { x: b.cx, y: (b.top + b.bot) / 2, r: Math.max(120, (b.bot - b.top) * 0.8) };
}
function fxStep(dt) {
  const c = fx.ctx; fxSize(); c.setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0); c.clearRect(0, 0, fx.w, fx.h); c.imageSmoothingEnabled = false;
  if (fx.flashT > 0) {                                             // destello morado
    const g = c.createRadialGradient(fx.flashAt.x, fx.flashAt.y, 0, fx.flashAt.x, fx.flashAt.y, fx.flashAt.r);
    g.addColorStop(0, `rgba(210,150,255,${0.55 * fx.flashT})`); g.addColorStop(1, "rgba(120,40,200,0)");
    c.globalCompositeOperation = "lighter"; c.fillStyle = g; c.fillRect(0, 0, fx.w, fx.h); fx.flashT = Math.max(0, fx.flashT - dt * 2.6);
  }
  for (let i = fx.ring.length - 1; i >= 0; i--) {                  // anillo de píxeles en el suelo
    const r = fx.ring[i]; r.t += dt; const k = r.t / 0.55; if (k >= 1) { fx.ring.splice(i, 1); continue; }
    const rad = r.r * (0.25 + 0.75 * (1 - (1 - k) * (1 - k))), n = 28, sz = Math.max(2, Math.round(unit() * 3 / 2) * 2);
    c.globalCompositeOperation = "lighter"; c.globalAlpha = 1 - k; c.fillStyle = "#b46bff";
    for (let j = 0; j < n; j++) { const a = j / n * Math.PI * 2; c.fillRect(Math.round(r.x + Math.cos(a) * rad), Math.round(r.y + Math.sin(a) * rad * 0.28), sz, sz); }
  }
  for (let i = fx.ps.length - 1; i >= 0; i--) {
    const p = fx.ps[i]; p.life -= dt; if (p.life <= 0) { fx.ps.splice(i, 1); continue; }
    let a;
    if (p.mode === "in") { const k = 1 - p.life / p.max, e = k * k * (3 - 2 * k); p.x = p.sx + (p.tx - p.sx) * e; p.y = p.sy + (p.ty - p.sy) * e; a = Math.min(1, k * 3); }
    else { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.4; p.vy = p.vy * (1 - dt * 1.4) - 18 * dt; a = Math.min(1, p.life / p.max * 1.8); }
    const s = Math.max(2, Math.round(p.s * (p.mode === "in" ? 1 : 0.55 + 0.45 * p.life / p.max) / 2) * 2);
    c.globalCompositeOperation = p.add ? "lighter" : "source-over"; c.globalAlpha = a; c.fillStyle = p.c;
    c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
}
const fxAlive = () => fx.ps.length || fx.ring.length || fx.flashT > 0;

/* ============================================================ Skins */
async function skinOf(c) {
  const key = c.skin || "default", hit = skins.get(c.id);
  if (hit && hit.key === key) return hit;
  let img = null;
  if (c.skin) img = await loadSkin([c.skin, LOCAL_SKIN]);
  else img = await loadSkin([LOCAL_SKIN]);
  if (!img) return null;
  const cv = toSkin64(img), slim = c.skin ? !!c.slim : false;
  const r = { key, cv, slim, bust: bust(cv, slim) };
  skins.set(c.id, r); return r;
}

/* ============================================================ Bucle de dibujo */
function layoutCam() {
  const mobile = matchMedia("(max-width:860px)").matches;
  return mobile ? { frac: 0.9, top: 0.9, sx: 0 } : { frac: 0.97, top: 0.77, sx: -A.side * 0.56 };
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  age += dt * 20; brain.update(dt);
  A.cur += Math.sign(A.target - A.cur) * Math.min(Math.abs(A.target - A.cur), dt * A.speed);
  A.flash = Math.max(0, A.flash - dt * 2.2); A.pop = Math.min(1, A.pop + dt * 3.2);
  if (player) {
    const cam = layoutCam(), pos = player.project([0, 28, 0]);
    const dx = (ptr.x * innerWidth - (stage.getBoundingClientRect().left + pos.x)) / innerWidth, dy = (ptr.y * innerHeight - (stage.getBoundingClientRect().top + pos.y)) / innerHeight;
    const yaw = A.side * 0.5, wantY = Math.max(-0.9, Math.min(0.9, dx * 1.2 - yaw * 0.7 + brain.look)), wantX = Math.max(-0.3, Math.min(0.35, dy * 0.5));
    headY += (wantY - headY) * Math.min(1, dt * 7); headX += (wantX - headX) * Math.min(1, dt * 7);
    const e = A.cur * A.cur * (3 - 2 * A.cur);
    player.draw({ appear: A.target === 0 ? A.cur : Math.min(1, e * 1.15), flash: A.flash, pop: A.pop, age, brain, head: { x: headX, y: headY }, yaw, ...cam });
    const feet = player.project([0, 0, 0]), l = player.project([-9, 0, 0]), r = player.project([9, 0, 0]);
    const vis = A.cur > 0.25 && feet.y < stage.clientHeight - 6;
    shadow.style.opacity = vis ? String(Math.min(1, A.cur) * 0.6) : "0";
    if (vis) { const w = Math.abs(r.x - l.x) * 1.5; shadow.style.width = w + "px"; shadow.style.height = w * 0.28 + "px"; shadow.style.transform = `translate(${feet.x - w / 2}px,${feet.y - w * 0.14}px)`; }
  }
  fxStep(dt);
  if (!sel && A.cur <= 0 && !fxAlive()) { cancelAnimationFrame(raf); raf = 0; if (player) player.draw({ appear: 0, brain, head: { x: 0, y: 0 }, ...layoutCam() }); }
}
const kick = () => { if (!raf && active) { last = performance.now(); raf = requestAnimationFrame(frame); } };

/* ============================================================ Selección (teletransporte) */
async function select(id) {
  const my = ++token, c = id ? chars.find(x => x.id === id) : null, had = sel;
  if (!c || (had && had === id)) {                                 // quitar selección: se va con partículas y vuelve el End
    if (had && player) { burst(46); A.target = 0; A.speed = 5; }
    sel = null; setBg("end"); hidePanel(); renderSlots(); stage.classList.remove("has-sel"); kick(); return;
  }
  sel = id; setBg(c.group); renderSlots(); hidePanel(); stage.classList.add("has-sel");
  A.side = c.group === "collab" ? 1 : -1;
  if (!player && !glError) {
    try { player = createPlayer(glCv); if (!player) glError = true; } catch (e) { console.warn("creditos: WebGL", e); glError = true; }
  }
  if (glError) { showPanel(c); return; }                           // sin WebGL: solo la ficha
  kick();
  if (had) { burst(46); A.target = 0; A.speed = 5.5; }
  const sk = skinOf(c);
  if (had) await sleep(190);
  const s = await sk; if (my !== token) return;
  if (!s) { showPanel(c); return; }
  A.cur = 0; A.target = 0; player.setSkin(s.cv, s.slim); player.aim({ yaw: A.side * 0.5, ...layoutCam() });
  playTp(); converge(); kick();
  await sleep(300); if (my !== token) return;
  A.target = 1; A.speed = 2.6; A.flash = 1; A.pop = 0; brain.q.length = 0; brain.wait = rnd(1.2, 2.2);
  burst(); showPanel(c); kick();
}

/* ============================================================ Espacios (selector) */
const grid = g => $(`.cr-grp[data-g="${g}"] .cr-grid`);
function renderSlots() {
  for (const g of ["collab", "donor"]) {
    const list = chars.filter(c => c.group === g).sort((a, b) => (a.order || 0) - (b.order || 0));
    let total = Math.max(MIN_SLOTS, Math.ceil(list.length / PER_ROW) * PER_ROW);
    if (isAdmin && list.length >= total) total += PER_ROW;
    let html = "";
    for (let r = 0; r < total / PER_ROW; r++) {
      html += `<div class="cr-row">`;
      for (let i = r * PER_ROW; i < (r + 1) * PER_ROW; i++) {
        const c = list[i];
        if (c) html += `<button type="button" class="cr-slot${c.id === sel ? " on" : ""}" data-id="${esc(c.id)}" aria-pressed="${c.id === sel}" aria-label="${esc(c.name)}"><span class="in"><canvas width="16" height="16" data-b="${esc(c.id)}"></canvas></span></button>`;
        else if (isAdmin) html += `<button type="button" class="cr-slot add" data-add="${g}" aria-label="Añadir personaje"><span class="in"><b>+</b></span></button>`;
        else html += `<span class="cr-slot empty" aria-hidden="true"><span class="in">${SIL}<b>?</b></span></span>`;
      }
      html += `</div>`;
    }
    grid(g).innerHTML = html;
    stage.style.setProperty("--rows", Math.max(2, Math.ceil(total / PER_ROW)));
  }
  paintBusts();
}
const SIL = `<svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="#050505" d="M5 1h6v6H5zM2 9h12v7H2z"/></svg>`;
async function paintBusts() {
  for (const cv of document.querySelectorAll("canvas[data-b]")) {
    const c = chars.find(x => x.id === cv.dataset.b); if (!c) continue;
    const s = await skinOf(c).catch(() => null); if (!s || !cv.isConnected) continue;
    const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 16, 16); g.drawImage(s.bust, 0, 0);
  }
}
$("#cr-slots").addEventListener("click", e => {
  const b = e.target.closest(".cr-slot"); if (!b) return;
  if (b.dataset.add) openEditor(null, b.dataset.add);
  else if (b.dataset.id) select(b.dataset.id);
});
stage.addEventListener("click", e => { if (e.target === stage && sel) select(null); });          // clic en el fondo = nadie seleccionado
addEventListener("keydown", e => { if (active && e.key === "Escape" && sel && edHost.hidden) select(null); });
addEventListener("pointermove", e => { ptr.x = e.clientX / innerWidth; ptr.y = e.clientY / innerHeight; }, { passive: true });

/* ============================================================ Ficha (nombre, descripción, roles y redes) */
function showPanel(c) {
  const side = c.group === "collab" ? "r" : "l";
  const links = Object.keys(NET).filter(k => c.links && safeUrl(c.links[k]));
  panel.className = "cr-panel " + side;
  panel.innerHTML = `<div class="hd"><h3 class="cr-name">${esc(c.name)}</h3>${c.tag ? `<span class="cr-tag">${esc(c.tag)}</span>` : ""}</div>
    ${rolesText(c.roles) ? `<p class="cr-roles">${esc(rolesText(c.roles))}</p>` : ""}
    ${c.bio ? `<blockquote class="cr-bio">“${esc(c.bio)}”</blockquote>` : ""}
    ${links.length ? `<div class="cr-soc">${links.map(k => `<a href="${esc(safeUrl(c.links[k]))}" target="_blank" rel="noopener noreferrer" aria-label="${NET[k].n} de ${esc(c.name)}" title="${NET[k].n}"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">${NET[k].svg}</svg></a>`).join("")}</div>` : ""}
    ${isAdmin ? `<button type="button" class="btn cr-edit">✎ Editar</button>` : ""}`;
  panel.hidden = false; void panel.offsetWidth; panel.classList.add("in");
  const eb = panel.querySelector(".cr-edit"); if (eb) eb.onclick = () => openEditor(c);
}
function hidePanel() { panel.classList.remove("in"); panel.hidden = true; panel.innerHTML = ""; }

/* ============================================================ Datos (Firestore) */
async function load() {
  try {
    const snap = await getDocs(collection(db, "credits"));
    chars = snap.docs.map(d => ({ id: d.id, ...d.data() })); loadFailed = false;
  } catch (e) {
    console.warn("creditos: no se pudo leer Firestore", e); loadFailed = true;
    chars = DEMO_SI_FALLA ? DEMO.map(x => ({ ...x })) : [];
  }
  loaded = true;
  chars.forEach(c => { c.links = c.links && typeof c.links === "object" ? c.links : {}; });
  renderSlots(); hint();
  if (sel && !chars.some(c => c.id === sel)) select(null);
}
function hint() {
  if (isAdmin) { tip.className = "cr-tip on"; tip.textContent = loadFailed ? "Modo Admin: no se pudo leer la colección «credits». Pega las reglas nuevas en Firestore (ver firestore.rules)." : "Modo Admin: toca un espacio vacío (+) para añadir un personaje, o elige uno y pulsa «Editar»."; }
  else tip.className = "cr-tip";
}
onAuthStateChanged(auth, u => {
  const was = isAdmin; isAdmin = !!(u && ADMIN_EMAILS.includes((u.email || "").toLowerCase()));
  if (was !== isAdmin) { renderSlots(); hint(); const c = chars.find(x => x.id === sel); if (c && A.target === 1) showPanel(c); }
});

/* ============================================================ Editor (solo Admin) */
function openEditor(c, group) {
  if (!isAdmin) return;
  const d = c ? { ...c, links: { ...(c.links || {}) } } : { name: "", group: group || "collab", tag: "", roles: "", bio: "", skin: null, slim: false, links: {} };
  let skinCv = null, slim = !!d.slim, busy = false;
  const field = (id, label, val, attrs = "") => `<label for="ce-${id}">${label}</label><input id="ce-${id}" value="${esc(val)}" ${attrs}>`;
  edHost.hidden = false; edHost.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${c ? "Editar" : "Añadir"} personaje">
    <button class="x" type="button" id="ce-x" aria-label="Cerrar">×</button>
    <h3>${c ? "Editar personaje" : "Nuevo personaje"}</h3>
    <div class="cols">
      <div class="col">
        ${field("name", "Nombre", d.name, 'maxlength="24" autocomplete="off"')}
        <label for="ce-group">Grupo</label>
        <select id="ce-group"><option value="collab"${d.group === "collab" ? " selected" : ""}>Colaborador (fondo Nether)</option><option value="donor"${d.group === "donor" ? " selected" : ""}>Donador (fondo Overworld)</option></select>
        ${field("tag", "Etiqueta (arriba a la derecha, ej. OWNER)", d.tag || "", 'maxlength="16" autocomplete="off"')}
        ${field("roles", "Roles (separados por coma)", rolesText(d.roles).replace(/ · /g, ", "), 'maxlength="120" autocomplete="off"')}
        <label for="ce-bio">Descripción</label><textarea id="ce-bio" rows="3" maxlength="240">${esc(d.bio || "")}</textarea>
      </div>
      <div class="col">
        <label>Skin</label>
        <div class="skinrow"><canvas id="ce-prev" width="16" height="16" aria-hidden="true"></canvas>
          <div><input id="ce-file" type="file" accept="image/png"><div class="mini"><input id="ce-prem" placeholder="o nombre premium" maxlength="16" autocomplete="off"><button type="button" class="btn" id="ce-load">Cargar</button></div></div></div>
        <label for="ce-slim">Brazos</label>
        <select id="ce-slim"><option value="0">Normales (Steve)</option><option value="1">Finos (Alex)</option></select>
        ${Object.keys(NET).map(k => field(k, NET[k].n, d.links[k] || "", 'type="url" placeholder="https://" maxlength="200" autocomplete="off"')).join("")}
      </div>
    </div>
    <p class="err" id="ce-err" role="alert"></p>
    <div class="acts">
      ${c ? `<button type="button" class="btn" id="ce-left" title="Mover a la izquierda">◀</button><button type="button" class="btn" id="ce-right" title="Mover a la derecha">▶</button><button type="button" class="btn danger" id="ce-del">Eliminar</button>` : ""}
      <span class="sp"></span><button type="button" class="btn" id="ce-cancel">Cancelar</button><button type="button" class="btn solid" id="ce-save">Guardar</button>
    </div></div>`;
  const q = s => edHost.querySelector(s), err = m => { q("#ce-err").textContent = m || ""; };
  const prev = () => { const g = q("#ce-prev").getContext("2d"); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 16, 16); if (skinCv) g.drawImage(bust(skinCv, slim), 0, 0); };
  q("#ce-slim").value = slim ? "1" : "0";
  const close = () => { edHost.hidden = true; edHost.innerHTML = ""; };
  const useSkin = cv => { skinCv = cv; slim = isSlim(cv); q("#ce-slim").value = slim ? "1" : "0"; prev(); err(""); };
  loadSkin([d.skin || LOCAL_SKIN]).then(i => { if (!i || !edHost.isConnected) return; const cv = toSkin64(i); if (d.skin) skinCv = cv; const g = q("#ce-prev").getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(bust(cv, slim), 0, 0); });
  q("#ce-slim").onchange = e => { slim = e.target.value === "1"; prev(); };
  q("#ce-file").onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f), i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); if (i.width % 64 || !(i.height === i.width || i.height * 2 === i.width)) return err("La skin debe ser un PNG de 64×64 (o 64×32)."); useSkin(toSkin64(i)); };
    i.onerror = () => err("No se pudo leer ese archivo.");
    i.src = url;
  };
  q("#ce-load").onclick = async () => {
    const n = q("#ce-prem").value.trim(); if (!/^[A-Za-z0-9_]{1,16}$/.test(n)) return err("Escribe un nombre de Minecraft válido.");
    err("Buscando skin…"); const i = await loadSkin(["https://minotar.net/skin/" + encodeURIComponent(n), "https://mc-heads.net/skin/" + encodeURIComponent(n)]);
    if (!i) return err("No se encontró esa skin. Sube el PNG a mano.");
    try { const cv = toSkin64(i); cv.toDataURL(); useSkin(cv); } catch (e) { err("Ese servidor no permite copiar la skin. Descárgala y súbela como PNG."); }
  };
  const move = async dir => {                                      // intercambia de sitio con el vecino y renumera el grupo
    const list = chars.filter(x => x.group === d.group).sort((a, b) => (a.order || 0) - (b.order || 0)), i = list.findIndex(x => x.id === c.id), j = i + dir;
    if (j < 0 || j >= list.length) return err("Ya está en el extremo.");
    [list[i], list[j]] = [list[j], list[i]]; busy = true;
    try { await Promise.all(list.map((x, n) => (x.order === n ? null : setDoc(doc(db, "credits", x.id), { ...clean(x), order: n })))); await load(); close(); }
    catch (e) { err("No se pudo mover: " + (e.code || e.message)); busy = false; }
  };
  if (c) {
    q("#ce-left").onclick = () => move(-1); q("#ce-right").onclick = () => move(1);
    q("#ce-del").onclick = async () => {
      if (!confirm(`¿Eliminar a ${c.name}? No se puede deshacer.`)) return;
      try { await deleteDoc(doc(db, "credits", c.id)); skins.delete(c.id); if (sel === c.id) await select(null); await load(); close(); } catch (e) { err("No se pudo eliminar: " + (e.code || e.message)); }
    };
  }
  q("#ce-save").onclick = async () => {
    if (busy) return;
    const name = q("#ce-name").value.trim(); if (!name) return err("Pon un nombre.");
    const links = {}; for (const k of Object.keys(NET)) { let v = q("#ce-" + k).value.trim(); if (v && !/^https?:\/\//i.test(v)) v = "https://" + v; if (v) { v = safeUrl(v); if (!v) return err("El enlace de " + NET[k].n + " no es válido."); } links[k] = v; }
    let skin = null;
    try { skin = skinCv ? skinCv.toDataURL("image/png") : (d.skin || null); } catch (e) { return err("No se pudo procesar la skin."); }
    if (skin && skin.length >= 30000) return err("La skin pesa demasiado.");
    const group = q("#ce-group").value, order = c ? (c.order || 0) : Math.max(0, ...chars.filter(x => x.group === group).map(x => x.order || 0)) + 1;
    const data = { name, group, tag: q("#ce-tag").value.trim(), roles: rolesText(q("#ce-roles").value), bio: q("#ce-bio").value.trim(), skin, slim: q("#ce-slim").value === "1", links, order: c && c.group === group ? order : (c ? Math.max(0, ...chars.filter(x => x.group === group).map(x => x.order || 0)) + 1 : order) };
    busy = true; q("#ce-save").disabled = true; err("Guardando…");
    try {
      let id = c && c.id; if (id) await setDoc(doc(db, "credits", id), data); else id = (await addDoc(collection(db, "credits"), data)).id;
      skins.delete(id); await load(); close();
      if (c && sel === c.id) { const n = chars.find(x => x.id === id); sel = null; if (n) select(id); }
    } catch (e) { busy = false; q("#ce-save").disabled = false; err("No se pudo guardar: " + (e.code === "permission-denied" ? "faltan las reglas de Firestore (colección credits)." : (e.code || e.message))); }
  };
  q("#ce-cancel").onclick = q("#ce-x").onclick = close;
  edHost.onclick = e => { if (e.target === edHost) close(); };
  edHost.onkeydown = e => { if (e.key === "Escape") close(); };
  q("#ce-name").focus();
}
const clean = c => ({ name: c.name, group: c.group, tag: c.tag || "", roles: c.roles || "", bio: c.bio || "", skin: c.skin || null, slim: !!c.slim, links: c.links || {}, order: c.order || 0 });

/* ============================================================ Entrar / salir de la vista */
const onView = () => location.hash.slice(1).split("/")[0] === "creditos";
function enter() {
  if (active) return; active = true; document.body.classList.add("crfix"); bgsEl.classList.add("on");
  if (!loaded) load(); else renderSlots();
  last = performance.now(); kick();
}
function leave() {
  if (!active) return; active = false; document.body.classList.remove("crfix"); bgsEl.classList.remove("on");
  cancelAnimationFrame(raf); raf = 0; token++; sel = null; A.cur = 0; A.target = 0; fx.ps.length = 0; fx.ring.length = 0; fx.flashT = 0;
  hidePanel(); stage.classList.remove("has-sel"); setBg("end"); shadow.style.opacity = "0"; renderSlots();
}
const sync = () => onView() ? enter() : leave();
addEventListener("hashchange", sync); sync();
new ResizeObserver(() => { if (active && !raf) kick(); }).observe(stage);
