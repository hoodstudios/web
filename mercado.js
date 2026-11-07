/* HOOD STUDIO — Mercado
 * Catálogos en carrusel infinito -> libro con los artículos -> vista previa y compra.
 * Datos: colección "shop" (artículos), "shop_models" (OBJ de los items) y, en el perfil del jugador, "inv" (comprados) y "equip" (puesto).
 * Las dependencias llegan desde main.js con Mercado.init(...) para no duplicar Firebase. */
import { createFigureSet, ANIMS } from "./avatar.js";
import { viewer3d } from "./viewer3d.js";

const ADMIN_EMAIL = "hoodstudio@hoodstudio.app";
const CATS = [
  { id: "hat", name: "Sombreros", book: "gold", on: true, tip: "Estilo para tu avatar" },
  { id: "profile", name: "Perfil", book: "orange", on: true, tip: "Fondos y marcos de tu perfil" },
  { id: "pets", name: "Mascotas", book: "purple", on: false, tip: "Compañeros para tu habitación" },
  { id: "furn", name: "Muebles", book: "green", on: false, tip: "Decora tu habitación" },
  { id: "items", name: "Items", book: "blue", on: true, tip: "Para exhibir en tu inventario" }
];
const KINDS = {
  "bg-solid": "Fondo de color sólido", "bg-grad": "Fondo con degradado", "bg-game": "Fondo de minijuego", "bg-img": "Fondo con imagen",
  "fr-solid": "Marco de color sólido", "fr-neon": "Marco neón", "fr-rgb": "Marco RGB animado"
};
const GAMEBG = { end: "End", desierto: "Desierto", coral: "Coral" };
const PER = 6;

let D = null, root = null, shop = new Map(), shopP = null, cur = 0, openCat = null, tab = "bg", page = 0, sel = null, hov = null, adminOn = false;
let keyFn = null, ap = null, v3 = null, panelTok = 0, coinUrl = "";
const modelCache = new Map(), imgCache = new Map();

/* ---------- utilidades ---------- */
const esc = s => D.esc(s);
const q = s => root.querySelector(s);
const isAdmin = () => { const u = D && D.auth.currentUser; return !!(u && (u.email || "").toLowerCase() === ADMIN_EMAIL); };
const byOrder = (a, b) => (a.order - b.order) || a.name.localeCompare(b.name);
function norm(id, d) {
  return { id, name: String(d.name || "Sin nombre"), cat: String(d.cat || "items"), kind: d.kind || "", price: Math.max(0, Math.floor(Number(d.price) || 0)), order: Number(d.order) || 0, hidden: d.hidden === true,
    img: typeof d.img === "string" ? d.img : "", w: Number(d.w) || 16, x: Number(d.x) || 0, y: Number.isFinite(Number(d.y)) ? Number(d.y) : 1, c1: d.c1 || "#888888", c2: d.c2 || "#444444", game: d.game || "end", desc: d.desc || "", model: d.model === true };
}
export function loadShop(force) {
  if (!force && shopP) return shopP;
  shopP = (async () => {
    const s = await D.fb.getDocs(D.fb.collection(D.db, "shop")), m = new Map();
    s.forEach(x => m.set(x.id, norm(x.id, x.data())));
    shop = m; return m;
  })().catch(e => { shopP = null; console.warn("Mercado:", e); return shop; });
  return shopP;
}
export const itemOf = id => shop.get(id) || null;
function imgOf(it) {
  if (!it || !it.img) return Promise.resolve(null);
  const k = it.id + "|" + it.img.length;
  if (!imgCache.has(k)) imgCache.set(k, new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = it.img; }));
  return imgCache.get(k);
}
/* Sombrero listo para dibujar: { img, w, x, y } o null (si no existe, se eliminó o falla, el avatar sale sin sombrero) */
export async function hatCos(id) {
  if (!id) return null;
  try {
    await loadShop();
    const it = shop.get(id);
    if (!it || it.cat !== "hat") return null;
    const img = await imgOf(it);
    return img ? { img, w: it.w, x: it.x, y: it.y } : null;
  } catch (e) { return null; }
}
async function modelOf(id) {
  if (modelCache.has(id)) return modelCache.get(id);
  let t = null;
  try { const s = await D.fb.getDoc(D.fb.doc(D.db, "shop_models", id)); t = s.exists() ? s.data().obj || null : null; } catch (e) { /* sin modelo */ }
  modelCache.set(id, t); return t;
}
function coinIcon() {
  if (coinUrl) return coinUrl;
  const m = [".OOOO.", "OYYYYO", "OYwYYO", "OYYYYO", "OYYYYO", ".OOOO."], pal = { O: "#a8730f", Y: "#f5c93a", w: "#fff3b0" };
  const c = document.createElement("canvas"); c.width = c.height = 6; const g = c.getContext("2d");
  m.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return (coinUrl = c.toDataURL());
}
const price = n => `<span class="mk-pr">${n}<img class="mk-coin" src="${coinIcon()}" alt="monedas"></span>`;

/* ---------- aspecto de fondos y marcos (también lo usa el perfil) ---------- */
export function bgCss(it) {
  if (!it) return "";
  if (it.kind === "bg-solid") return it.c1;
  if (it.kind === "bg-grad") return `linear-gradient(135deg, ${it.c1}, ${it.c2})`;
  if (it.kind === "bg-img" && it.img) return `url(${it.img}) center/cover`;
  if (it.kind === "bg-game") {
    if (it.game === "desierto") return "linear-gradient(180deg,#7cc3ea 0%,#cbe6f2 48%,#efd28f 49%,#d9a95a 100%)";
    if (it.game === "coral") return "radial-gradient(rgba(255,255,255,.35) 1.5px,transparent 2px) 0 0/46px 46px,linear-gradient(180deg,#0e5a8a,#0a8aa8 55%,#07485c)";
    return "radial-gradient(rgba(255,255,255,.7) 1px,transparent 1.6px) 0 0/34px 34px,radial-gradient(rgba(190,150,255,.6) 1px,transparent 1.6px) 17px 17px/52px 52px,linear-gradient(180deg,#07030f 0%,#1b0b3a 55%,#3b1f6b 100%)";
  }
  return "";
}
export function applyBg(el, it) {
  if (!el) return;
  const css = it && it.cat === "profile" && it.kind.startsWith("bg") ? bgCss(it) : "";
  el.classList.toggle("pbg", !!css); el.style.background = css;
}
export function applyFrame(el, it) {
  if (!el) return;
  el.classList.remove("fr", "fr-solid", "fr-neon", "fr-rgb"); el.style.removeProperty("--fc");
  if (it && it.cat === "profile" && it.kind.startsWith("fr-")) { el.classList.add("fr", it.kind); el.style.setProperty("--fc", it.c1); }
}
export async function decorate({ equip, frameEls = [], bgEl = null }) {
  try { await loadShop(); } catch (e) { return; }
  const eq = equip || {};
  frameEls.forEach(e => applyFrame(e, shop.get(eq.frame)));
  if (bgEl) applyBg(bgEl, shop.get(eq.bg));
}
function thumb(it) {
  if (it.cat === "hat" || it.cat === "items" || (it.cat === "profile" && !it.kind.startsWith("bg") && !it.kind.startsWith("fr-") && it.img)) return it.img ? `<img class="mk-th px" src="${esc(it.img)}" alt="">` : "";
  if (it.kind.startsWith("bg")) return `<i class="mk-sw" style="background:${esc(bgCss(it))}"></i>`;
  if (it.kind.startsWith("fr-")) { const u = D.me(); return `<span class="mk-fh"><img class="px fr ${it.kind}" style="--fc:${esc(it.c1)}" src="${esc(u ? u.avatar : "https://minotar.net/helm/MHF_Steve/64.png")}" alt=""></span>`; }
  return "";
}

/* ---------- ventana ---------- */
function modal(html, cls = "") {
  const m = document.createElement("div"); m.className = "mk-modal"; m.innerHTML = `<div class="mk-mbox ${cls}" role="dialog" aria-modal="true"><button class="mk-x" type="button" aria-label="Cerrar">✕</button>${html}</div>`;
  const close = () => { m.remove(); document.removeEventListener("keydown", esck); if (m._done) m._done(); };
  const esck = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  m.addEventListener("pointerdown", e => { if (e.target === m) close(); });
  m.querySelector(".mk-x").onclick = close; document.addEventListener("keydown", esck, true);
  document.body.append(m); m.close = close; return m;
}

/* ---------- avatar de prueba (con sombrero), siguiendo las animaciones ---------- */
function avatarPreview(cv, onFail) {
  let set = null, raf = 0, face = null, t0 = performance.now(), ai = 0, stopped = false;
  const names = ["idle", "walk", "jump", "dance"];
  async function setCos(cos) {
    try {
      face = face || await D.face(); if (!face) return;
      set = createFigureSet(face.img, { slim: face.slim, k: 5, cos });
    } catch (e) { console.warn(e); if (onFail) onFail(); }
  }
  cv.onclick = () => { ai = (ai + 1) % names.length; t0 = performance.now(); };
  const loop = now => {
    if (stopped || !cv.isConnected) return; raf = requestAnimationFrame(loop);
    const W = cv.width, H = cv.height, g = cv.getContext("2d"); g.clearRect(0, 0, W, H);
    if (!set) return;
    const an = ANIMS[names[ai]], t = (now - t0) / 1000;
    if (t > 2.6) { ai = (ai + 1) % names.length; t0 = now; }
    const i = Math.floor(t * an.fps) % an.frames.length, { fig, gx, gy } = set.get(names[ai], i);
    const sc = Math.min(1, (W - 8) / fig.width, (H - 16) / fig.height);
    g.imageSmoothingEnabled = false; g.save(); g.translate(W / 2, H - 10); g.scale(sc, sc);
    g.fillStyle = "rgba(0,0,0,.18)"; g.beginPath(); g.ellipse(0, 0, 50, 8, 0, 0, 7); g.fill();
    g.drawImage(fig, -set.w / 2 + gx, -set.feet + gy); g.restore();
  };
  raf = requestAnimationFrame(loop);
  return { setCos, stop() { stopped = true; cancelAnimationFrame(raf); } };
}

/* ---------- carrusel ---------- */
function buildCarousel() {
  root.innerHTML = `
    <div class="mk-top"><h2>Mercado</h2><span class="mk-coins" id="mk-coins"></span></div>
    <div class="mk-view" id="mk-cv">
      <p class="mk-hint">Elige un catálogo</p>
      <div class="mk-car">
        <button class="mk-ar l" type="button" aria-label="Anterior">◀</button>
        <div class="mk-track" id="mk-track">${CATS.map((c, i) => `<button class="mk-bk" type="button" data-i="${i}" aria-label="${esc(c.name)}"><img class="px" src="img/mercado/book-${c.book}.png" alt="" draggable="false"></button>`).join("")}</div>
        <button class="mk-ar r" type="button" aria-label="Siguiente">▶</button>
      </div>
      <div class="mk-cap"><b id="mk-cn"></b><small id="mk-ct"></small><button class="btn solid" id="mk-open" type="button">Abrir</button></div>
    </div>
    <div class="mk-view" id="mk-bv" hidden></div>`;
  const track = q("#mk-track"), books = [...track.querySelectorAll(".mk-bk")];
  books.forEach(b => (b._o = 99));
  const layout = () => {
    const W = track.clientWidth || 600, N = CATS.length;
    books.forEach((b, i) => {
      let o = ((i - cur) % N + N) % N; if (o > N / 2) o -= N;
      const sm = W < 520, a = Math.abs(o), s = (sm ? [1, .5, .3] : [1, .6, .38])[a] || .3, dx = (sm ? [0, .36, .56] : [0, .31, .5])[a] * W * Math.sign(o), op = [1, .92, .55][a] ?? .5;
      const jump = b._o !== 99 && Math.abs(o - b._o) > 2;
      if (jump) { b.style.transition = "none"; b.style.opacity = "0"; }
      b.style.transform = `translate(calc(-50% + ${dx}px), -50%) scale(${s})`; b.style.zIndex = 10 - a;
      b.classList.toggle("c", o === 0); b.classList.toggle("off", !CATS[i].on);
      b.style.filter = a ? `brightness(${a === 1 ? .78 : .55})` + (CATS[i].on ? "" : " saturate(.5)") : CATS[i].on ? "" : "saturate(.55) brightness(.9)";
      if (jump) { void b.offsetWidth; b.style.transition = ""; }
      b.style.opacity = op; b._o = o;
    });
    q("#mk-cn").textContent = CATS[cur].name.toUpperCase();
    q("#mk-ct").textContent = CATS[cur].on ? CATS[cur].tip : "Próximamente";
    const ob = q("#mk-open"); ob.disabled = !CATS[cur].on; ob.textContent = CATS[cur].on ? "Abrir" : "Próximamente";
  };
  const go = d => { cur = ((cur + d) % CATS.length + CATS.length) % CATS.length; layout(); };
  const open = () => { if (CATS[cur].on) openBook(CATS[cur].id); };
  q(".mk-ar.l").onclick = () => go(-1); q(".mk-ar.r").onclick = () => go(1); q("#mk-open").onclick = open;
  let drag = null, moved = false, lockW = 0;
  track.addEventListener("pointerdown", e => { drag = { x: e.clientX }; moved = false; });
  addEventListener("pointerup", e => { if (!drag) return; const dx = e.clientX - drag.x; drag = null; if (Math.abs(dx) > 40) { moved = true; go(dx < 0 ? 1 : -1); } });
  track.addEventListener("click", e => {
    const b = e.target.closest(".mk-bk"); if (!b || moved) { moved = false; return; }
    const i = +b.dataset.i; if (i === cur) open(); else { const N = CATS.length; let o = ((i - cur) % N + N) % N; if (o > N / 2) o -= N; go(o); }
  });
  q(".mk-car").addEventListener("wheel", e => { if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || Date.now() < lockW) return; e.preventDefault(); lockW = Date.now() + 380; go(e.deltaX > 0 ? 1 : -1); }, { passive: false });
  root._layout = layout; layout(); setTimeout(layout, 60);
  root._go = go; root._open = open;
}

/* ---------- libro (catálogo abierto) ---------- */
function items() {
  const cat = openCat;
  let l = [...shop.values()].filter(i => i.cat === cat).sort(byOrder);
  if (!adminOn) l = l.filter(i => !i.hidden);
  if (cat === "profile") l = l.filter(i => (tab === "bg") === (i.kind.startsWith("bg")));
  return l;
}
function openBook(cat) {
  openCat = cat; page = 0; sel = null; hov = null; tab = "bg";
  const c = CATS.find(x => x.id === cat), bv = q("#mk-bv");
  q("#mk-cv").hidden = true; bv.hidden = false; bv.classList.remove("in"); void bv.offsetWidth; bv.classList.add("in");
  bv.innerHTML = `
    <div class="mk-book" data-cat="${cat}">
      <div class="mk-page l">
        <div class="mk-bar"><button class="mk-back" type="button">◀ Catálogos</button><h3>${esc(c.name)}</h3><span class="mk-coins mini" id="mk-coins2"></span></div>
        <div class="mk-tabs" id="mk-tabs" ${cat === "profile" ? "" : "hidden"}><button type="button" data-t="bg">Fondos</button><button type="button" data-t="fr">Marcos</button></div>
        <div class="mk-adm" id="mk-adm" hidden></div>
        <div class="mk-grid" id="mk-grid"></div>
        <div class="mk-pg"><button type="button" id="mk-pp" aria-label="Página anterior">◀</button><span id="mk-pn"></span><button type="button" id="mk-pnx" aria-label="Página siguiente">▶</button></div>
      </div>
      <div class="mk-page r">
        <h3 class="mk-name" id="mk-name">Selecciona un artículo</h3>
        <div class="mk-stage" id="mk-stage"></div>
        <p class="mk-desc" id="mk-desc"></p>
        <div class="mk-buyrow"><span id="mk-price"></span><button class="mk-buy" id="mk-buy" type="button" disabled>COMPRAR</button></div>
        <p class="mk-msg" id="mk-msg" role="status"></p>
      </div>
    </div>`;
  q(".mk-back").onclick = closeBook;
  q("#mk-pp").onclick = () => { page--; renderBook(); }; q("#mk-pnx").onclick = () => { page++; renderBook(); };
  q("#mk-tabs").onclick = e => { const b = e.target.closest("button"); if (b) { tab = b.dataset.t; page = 0; sel = null; hov = null; renderBook(); } };
  q("#mk-buy").onclick = onBuy;
  renderBook();
}
function closeBook() {
  stopStage(); openCat = null; q("#mk-bv").hidden = true; q("#mk-bv").innerHTML = ""; q("#mk-cv").hidden = false; q("#mk-cv").classList.remove("in"); void q("#mk-cv").offsetWidth; q("#mk-cv").classList.add("in");
  if (root._layout) root._layout();
}
function coinsLabel() {
  const u = D.me(), h = u ? `${(u.coins || 0).toLocaleString("es-MX")} <img class="mk-coin" src="${coinIcon()}" alt="monedas">` : `<small>Inicia sesión para comprar</small>`;
  ["#mk-coins", "#mk-coins2"].forEach(s => { const e = q(s); if (e) e.innerHTML = h; });
}
const owned = id => { const u = D.me(); return !!u && Array.isArray(u.inv) && u.inv.includes(id); };
const worn = it => { const u = D.me(), e = (u && u.equip) || {}; return it.cat === "hat" ? e.hat === it.id : it.kind.startsWith("bg") ? e.bg === it.id : it.kind.startsWith("fr") ? e.frame === it.id : false; };
const wearable = it => it.cat === "hat" || (it.cat === "profile" && (it.kind.startsWith("bg") || it.kind.startsWith("fr-")));

function renderBook() {
  if (!openCat) return;
  coinsLabel();
  const adm = isAdmin(); if (!adm) adminOn = false;
  const ab = q("#mk-adm"); ab.hidden = !adm;
  if (adm) ab.innerHTML = `<button type="button" data-a="new">＋ Nuevo</button><button type="button" data-a="seed">Cargar catálogo inicial</button>`;
  ab.onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.a === "new") editItem(null); if (b.dataset.a === "seed") seed(); };
  if (adm) adminOn = true;
  q("#mk-tabs").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
  const list = items(), pages = Math.max(1, Math.ceil((list.length + 1) / PER));
  page = Math.max(0, Math.min(pages - 1, page));
  const slice = list.slice(page * PER, page * PER + PER), grid = q("#mk-grid"); grid.textContent = "";
  slice.forEach(it => {
    const c = document.createElement("div"); c.className = "mk-card" + (it.id === sel ? " sel" : "") + (owned(it.id) ? " own" : "") + (it.hidden ? " hid" : "");
    c.tabIndex = 0; c.dataset.id = it.id;
    c.innerHTML = `<div class="mk-tw">${thumb(it)}</div><span class="mk-cn">${esc(it.name)}</span>${owned(it.id) ? `<span class="mk-have">${worn(it) ? "PUESTO" : "COMPRADO"}</span>` : price(it.price)}${it.hidden ? `<span class="mk-badge">OCULTO</span>` : ""}`
      + (adminOn ? `<div class="mk-ad"><button type="button" data-a="l" title="Mover antes">◀</button><button type="button" data-a="r" title="Mover después">▶</button><button type="button" data-a="e" title="Editar">✎</button><button type="button" data-a="h" title="${it.hidden ? "Mostrar al público" : "Ocultar al público"}">${it.hidden ? "◌" : "●"}</button><button type="button" data-a="d" title="Eliminar">🗑</button></div>` : "");
    c.onclick = e => {
      const b = e.target.closest(".mk-ad button"); if (b) { e.stopPropagation(); return adminAct(b.dataset.a, it); }
      sel = sel === it.id ? null : it.id; renderBook();
    };
    c.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.click(); } };
    c.onpointerenter = e => { if (e.pointerType === "touch" || sel) return; hov = it.id; showPanel(); };
    c.onpointerleave = () => { if (hov === it.id) { hov = null; if (!sel) showPanel(); } };
    grid.append(c);
  });
  if (slice.length < PER) { const s = document.createElement("div"); s.className = "mk-card soon"; s.innerHTML = `<div class="mk-tw"><b>?</b></div><span class="mk-cn">PRÓXIMAMENTE</span>`; grid.append(s); }
  q("#mk-pn").textContent = `${page + 1} / ${pages}`; q("#mk-pp").disabled = page === 0; q("#mk-pnx").disabled = page >= pages - 1;
  showPanel();
}

/* ----- panel derecho: vista previa ----- */
function stopStage() { if (ap) { ap.stop(); ap = null; } if (v3) { v3.stop(); v3 = null; } const s = root && q("#mk-stage"); if (s) { s.dataset.t = ""; s.textContent = ""; } }
function stage(type) {
  const s = q("#mk-stage"); if (s.dataset.t === type) return s;
  if (ap) { ap.stop(); ap = null; } if (v3) { v3.stop(); v3 = null; }
  s.dataset.t = type; s.textContent = "";
  if (type === "hat") { s.innerHTML = `<canvas class="mk-av" width="300" height="340"></canvas><small class="mk-tip">Toca al avatar para cambiar de animación</small>`; ap = avatarPreview(s.querySelector("canvas")); }
  else if (type === "3d") { s.innerHTML = `<canvas class="mk-3d"></canvas><small class="mk-tip">Arrastra para girarlo</small>`; v3 = viewer3d(s.querySelector("canvas")); }
  else if (type === "none") s.innerHTML = `<p class="mk-empty">Pasa el cursor por un artículo para verlo,<br>o selecciónalo para fijarlo.</p>`;
  return s;
}
async function showPanel() {
  if (!openCat) return;
  const it = shop.get(sel || hov), tok = ++panelTok, nm = q("#mk-name"), ds = q("#mk-desc"), pr = q("#mk-price"), bb = q("#mk-buy"), ms = q("#mk-msg");
  ms.textContent = ""; ms.className = "mk-msg";
  if (!it || it.cat !== openCat) { nm.textContent = "Selecciona un artículo"; ds.textContent = ""; pr.innerHTML = ""; bb.disabled = true; bb.textContent = "COMPRAR"; bb.className = "mk-buy"; stage("none"); return; }
  nm.textContent = it.name; ds.textContent = it.desc || ""; pr.innerHTML = price(it.price);
  const u = D.me(), has = owned(it.id);
  bb.className = "mk-buy"; bb.disabled = false;
  if (has) {
    pr.innerHTML = `<span class="mk-pr own">En tu colección</span>`;
    if (wearable(it)) { bb.textContent = worn(it) ? "QUITAR" : "EQUIPAR"; bb.dataset.m = worn(it) ? "off" : "on"; bb.classList.add("alt"); }
    else { bb.textContent = "EN TU INVENTARIO"; bb.disabled = true; bb.dataset.m = ""; }
  } else if (!u) { bb.textContent = "INICIA SESIÓN"; bb.disabled = true; bb.dataset.m = ""; }
  else if ((u.coins || 0) < it.price) { bb.textContent = `FALTAN ${it.price - (u.coins || 0)}`; bb.disabled = true; bb.dataset.m = ""; }
  else { bb.textContent = "COMPRAR"; bb.dataset.m = "buy"; }
  if (it.cat === "hat") {
    const s = stage("hat"); void s;
    const cos = await hatCos(it.id); if (tok !== panelTok || !ap) return;
    ap.setCos(cos);
  } else if (it.cat === "items") {
    stage("3d"); const [img, obj] = await Promise.all([imgOf(it), it.model ? modelOf(it.id) : null]); if (tok !== panelTok || !v3) return;
    v3.set({ img, obj });
  } else if (it.cat === "profile") {
    stopStage(); const s = q("#mk-stage"); s.dataset.t = "p";
    const av = esc(u ? u.avatar : "https://minotar.net/helm/MHF_Steve/64.png");
    if (it.kind.startsWith("bg")) s.innerHTML = `<div class="mk-pv" style="background:${esc(bgCss(it))}"><div class="mk-pvc"><img class="px" src="${av}" alt=""><span><b>${esc(u ? u.name : "Jugador")}</b><i></i></span></div><div class="mk-pvc s"><i></i><i></i></div></div>`;
    else s.innerHTML = `<div class="mk-pf"><img class="px fr ${esc(it.kind)}" style="--fc:${esc(it.c1)}" src="${av}" alt=""></div>`;
  } else stage("none");
}
async function onBuy() {
  const it = shop.get(sel || hov), bb = q("#mk-buy"), ms = q("#mk-msg"), m = bb.dataset.m;
  if (!it || !m) return;
  const say = (t, ok) => { ms.textContent = t; ms.className = "mk-msg " + (ok ? "ok" : "bad"); };
  bb.disabled = true;
  try {
    if (m === "buy") {
      const u = D.me(), s = await D.fb.getDoc(D.fb.doc(D.db, "shop", it.id));
      if (!s.exists() || s.data().hidden === true) { await loadShop(true); renderBook(); return say("Este artículo ya no está disponible.", false); }
      const p = Math.floor(Number(s.data().price) || 0);
      if ((u.coins || 0) < p) { await loadShop(true); renderBook(); return say("No te alcanzan las monedas.", false); }
      try { await D.fb.updateDoc(D.fb.doc(D.db, "players", u.uid), { coins: D.fb.increment(-p), inv: D.fb.arrayUnion(it.id) }); }
      catch (e) { console.warn(e); await loadShop(true); renderBook(); return say("No se pudo completar la compra" + (e && e.code ? " (" + e.code + ")" : "") + ". Revisa que las reglas de Firestore estén publicadas.", false); }
      D.patchMe({ coins: (u.coins || 0) - p, inv: [...(u.inv || []), it.id] });
      renderBook(); q("#mk-msg").textContent = "¡Comprado! " + it.name + " ya es tuyo."; q("#mk-msg").className = "mk-msg ok";
    } else {
      const ok = await equip(it, m === "on");
      renderBook(); if (!ok) { q("#mk-msg").textContent = "No se pudo guardar."; q("#mk-msg").className = "mk-msg bad"; }
    }
  } catch (e) { console.warn(e); say("Algo salió mal. Inténtalo otra vez.", false); showPanel(); }
}
export async function equip(it, on) {
  const u = D.me(); if (!u || !it) return false;
  const slot = it.cat === "hat" ? "hat" : it.kind.startsWith("bg") ? "bg" : it.kind.startsWith("fr-") ? "frame" : null; if (!slot) return false;
  const eq = { ...(u.equip || {}), [slot]: on ? it.id : null };
  try { await D.fb.updateDoc(D.fb.doc(D.db, "players", u.uid), { equip: eq }); } catch (e) { console.warn(e); return false; }
  D.patchMe({ equip: eq }); D.onChange(); return true;
}

/* ---------- administración ---------- */
async function adminAct(a, it) {
  const fb = D.fb, ref = id => fb.doc(D.db, "shop", id);
  try {
    if (a === "e") return editItem(it);
    if (a === "h") { await fb.updateDoc(ref(it.id), { hidden: !it.hidden }); }
    if (a === "d") {
      if (!confirm(`¿Eliminar «${it.name}» por completo?\nDesaparece de la tienda y de los inventarios, y nadie podrá usarlo.`)) return;
      await fb.deleteDoc(ref(it.id)); if (it.model) { try { await fb.deleteDoc(fb.doc(D.db, "shop_models", it.id)); } catch (e) { /* ya no estaba */ } }
      if (sel === it.id) sel = null;
    }
    if (a === "l" || a === "r") {
      const l = [...shop.values()].filter(i => i.cat === it.cat).sort(byOrder), i = l.findIndex(x => x.id === it.id), j = i + (a === "l" ? -1 : 1);
      if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]];
      await Promise.all(l.map((x, n) => (x.order !== n * 10 ? fb.updateDoc(ref(x.id), { order: n * 10 }) : null)).filter(Boolean));
    }
    await loadShop(true); renderBook();
  } catch (e) { console.warn(e); alert("No se pudo guardar el cambio" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"); }
}
function readImg(file, max) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("No se pudo leer la imagen."));
    fr.onload = () => {
      const i = new Image();
      i.onerror = () => rej(new Error("Esa imagen no es válida."));
      i.onload = () => {
        const s = Math.min(1, max / Math.max(i.width, i.height)), c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(i.width * s)); c.height = Math.max(1, Math.round(i.height * s));
        const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(i, 0, 0, c.width, c.height);
        const u = c.toDataURL("image/png"); u.length > 110000 ? rej(new Error("La imagen pesa demasiado. Usa una más pequeña.")) : res(u);
      };
      i.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function editItem(it) {
  const isNew = !it, cat = it ? it.cat : openCat;
  const base = it || { id: "", name: "", cat, kind: cat === "profile" ? (tab === "bg" ? "bg-solid" : "fr-solid") : "", price: 100, hidden: false, img: "", w: 16, x: 0, y: 1, c1: "#e0402a", c2: "#2a6fe0", game: "end", desc: "", model: false };
  let img = base.img, obj = null, dropModel = false;
  const m = modal(`
    <h3>${isNew ? "Nuevo artículo" : "Editar artículo"}</h3>
    <form class="mk-form" novalidate>
      <label>Nombre<input name="name" maxlength="40" value="${esc(base.name)}" required></label>
      <label>Precio (monedas)<input name="price" type="number" min="0" max="1000000" step="1" value="${base.price}"></label>
      <label>Descripción (opcional)<input name="desc" maxlength="120" value="${esc(base.desc)}"></label>
      ${cat === "profile" ? `<label>Tipo<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${base.kind === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>` : ""}
      <div class="mk-row" data-f="colors"><label>Color 1<input name="c1" type="color" value="${esc(base.c1)}"></label><label data-f="c2">Color 2<input name="c2" type="color" value="${esc(base.c2)}"></label></div>
      <label data-f="game">Fondo del minijuego<select name="game">${Object.entries(GAMEBG).map(([k, v]) => `<option value="${k}" ${base.game === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label data-f="img">Imagen (PNG)<input name="img" type="file" accept="image/png,image/webp,image/jpeg"></label>
      <div class="mk-row" data-f="hat"><label>Ancho<input name="w" type="number" min="6" max="26" step="0.5" value="${base.w}"></label><label>Alto<input name="y" type="number" min="-10" max="12" step="0.5" value="${base.y}"></label><label>Desplazar<input name="x" type="number" min="-8" max="8" step="0.5" value="${base.x}"></label></div>
      <div data-f="hatprev" class="mk-formprev"><canvas width="300" height="340"></canvas></div>
      <label data-f="model">Modelo 3D (.obj, opcional)<input name="obj" type="file" accept=".obj,text/plain"></label>
      <label class="chk" data-f="rmmodel" hidden><input name="rmobj" type="checkbox"> Quitar el modelo 3D actual</label>
      <label class="chk"><input name="hidden" type="checkbox" ${base.hidden ? "checked" : ""}> Oculto al público (quien ya lo compró lo sigue usando)</label>
      <p class="err" id="mk-ferr" role="alert"></p>
      <div class="mk-fbtn"><button class="btn" type="button" data-c>Cancelar</button><button class="btn solid" type="submit">Guardar</button></div>
    </form>`, "wide");
  const f = m.querySelector("form"), $f = s => f.querySelector(s), ferr = $f("#mk-ferr");
  let fap = null;
  m._done = () => { if (fap) fap.stop(); };
  const vis = () => {
    const k = cat === "profile" ? f.kind.value : "";
    const show = (s, on) => { const e = $f(`[data-f="${s}"]`); if (e) e.hidden = !on; };
    show("colors", cat === "profile" && ["bg-solid", "bg-grad", "fr-solid", "fr-neon"].includes(k));
    show("c2", k === "bg-grad"); show("game", k === "bg-game"); show("img", cat !== "profile" || k === "bg-img");
    show("hat", cat === "hat"); show("hatprev", cat === "hat"); show("model", cat === "items");
    show("rmmodel", cat === "items" && base.model);
  };
  vis(); if (cat === "profile") f.kind.onchange = vis;
  const updPrev = async () => {
    if (cat !== "hat") return;
    if (!fap) fap = avatarPreview($f("[data-f=hatprev] canvas"));
    const i = img ? await new Promise(r => { const e = new Image(); e.onload = () => r(e); e.onerror = () => r(null); e.src = img; }) : null;
    fap.setCos(i ? { img: i, w: +f.w.value || 16, x: +f.x.value || 0, y: +f.y.value } : null);
  };
  if (cat === "hat") { ["w", "x", "y"].forEach(n => f[n].oninput = updPrev); updPrev(); }
  f.img.onchange = async () => { ferr.textContent = ""; const fl = f.img.files[0]; if (!fl) return; try { img = await readImg(fl, cat === "hat" ? 64 : cat === "profile" ? 480 : 128); updPrev(); } catch (e) { ferr.textContent = e.message; f.img.value = ""; } };
  f.obj.onchange = async () => { ferr.textContent = ""; const fl = f.obj.files[0]; if (!fl) return; if (fl.size > 650000) { ferr.textContent = "El modelo pesa demasiado (máx. ~650 KB)."; f.obj.value = ""; return; } obj = await fl.text(); if (!/^\s*v\s/m.test(obj) || !/^\s*f\s/m.test(obj)) { ferr.textContent = "El archivo no parece un .obj válido."; obj = null; f.obj.value = ""; } };
  $f("[data-c]").onclick = () => m.close();
  f.onsubmit = async e => {
    e.preventDefault(); ferr.textContent = "";
    const name = f.name.value.trim(), pr = Math.floor(Number(f.price.value));
    if (!name) return ferr.textContent = "Ponle un nombre.";
    if (!(pr >= 0)) return ferr.textContent = "El precio no es válido.";
    const kind = cat === "profile" ? f.kind.value : "";
    if (cat !== "profile" && !img) return ferr.textContent = "Sube una imagen.";
    if (kind === "bg-img" && !img) return ferr.textContent = "Sube la imagen del fondo.";
    const all = [...shop.values()].filter(i => i.cat === cat), data = { name, cat, price: pr, hidden: f.hidden.checked, order: it ? it.order : (all.length ? Math.max(...all.map(i => i.order)) + 10 : 0) };
    if (f.desc.value.trim()) data.desc = f.desc.value.trim();
    if (kind) data.kind = kind;
    if (img && (cat !== "profile" || kind === "bg-img")) data.img = img;
    if (cat === "profile" && ["bg-solid", "bg-grad", "fr-solid", "fr-neon"].includes(kind)) { data.c1 = f.c1.value; if (kind === "bg-grad") data.c2 = f.c2.value; }
    if (kind === "bg-game") data.game = f.game.value;
    if (cat === "hat") { data.w = Math.max(6, Math.min(26, Number(f.w.value) || 16)); data.y = Number(f.y.value) || 0; data.x = Number(f.x.value) || 0; }
    if (cat === "items") data.model = !!(obj || (base.model && !f.rmobj.checked));
    const id = it ? it.id : "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), fb = D.fb;
    const sb = f.querySelector("[type=submit]"); sb.disabled = true;
    try {
      await fb.setDoc(fb.doc(D.db, "shop", id), data);
      if (cat === "items") {
        if (obj) { await fb.setDoc(fb.doc(D.db, "shop_models", id), { obj }); modelCache.delete(id); }
        else if (base.model && f.rmobj.checked) { await fb.deleteDoc(fb.doc(D.db, "shop_models", id)); modelCache.delete(id); }
      }
      imgCache.clear(); await loadShop(true); m.close(); sel = id; renderBook();
    } catch (er) { console.warn(er); ferr.textContent = "No se pudo guardar" + (er && er.code ? " (" + er.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"; sb.disabled = false; }
  };
}

/* ---------- catálogo inicial (dibujado por código) ---------- */
function sprite(rows, pal) {
  const w = Math.max(...rows.map(r => r.length)), c = document.createElement("canvas"); c.width = w; c.height = rows.length; const g = c.getContext("2d");
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return c.toDataURL("image/png");
}
function drawn(w, h, fn) { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); fn(g, (x, y, cw = 1, ch = 1, col) => { g.fillStyle = col; g.fillRect(x, y, cw, ch); }); return c.toDataURL("image/png"); }
function seedHats() {
  const party = drawn(10, 12, (g, R) => {
    R(4, 0, 2, 2, "#ffe14d");
    for (let r = 2; r < 12; r++) { const w = 2 * Math.floor((r - 2) / 2) + 2, x0 = 5 - w / 2; for (let x = 0; x < w; x++) R(x0 + x, r, 1, 1, ((x0 + x + r) % 4 < 2) ? "#e83e8c" : "#3ec6e8"); R(x0, r, 1, 1, "#7a1f4d"); R(x0 + w - 1, r, 1, 1, "#1d6f8a"); }
  });
  const top = drawn(18, 12, (g, R) => { R(4, 0, 10, 1, "#3a3a44"); R(4, 1, 10, 8, "#1b1b1f"); R(4, 7, 10, 2, "#b3262a"); R(5, 1, 1, 6, "#34343c"); R(0, 9, 18, 3, "#1b1b1f"); R(1, 9, 16, 1, "#34343c"); });
  const crown = sprite(["Y..Y..YY..Y..Y", "YYYYYYYYYYYYYY", "YYRYYYBYYYGYYY", "OOOOOOOOOOOOOO"], { Y: "#f5c93a", O: "#a8730f", R: "#e5233b", B: "#2a8bff", G: "#2fd16a" });
  const wiz = drawn(20, 17, (g, R) => {
    for (let r = 0; r < 14; r++) { const w = 2 + Math.floor(r * 9 / 13) * 1 + (r > 10 ? 2 : 0), x0 = 10 - Math.floor(w / 2) - (r < 2 ? 0 : 0); R(x0, r, w, 1, "#6a3cc2"); R(x0, r, 1, 1, "#4b2a8a"); R(x0 + w - 1, r, 1, 1, "#4b2a8a"); }
    R(5, 11, 10, 2, "#f5c93a"); R(8, 4, 1, 1, "#ffe14d"); R(11, 7, 1, 1, "#ffe14d"); R(9, 9, 1, 1, "#ffe14d");
    R(0, 14, 20, 2, "#4b2a8a"); R(1, 14, 18, 1, "#7d4fd6"); R(3, 16, 14, 1, "#3a1f6e");
  });
  return [
    { id: "hat_party", name: "Gorrito de Fiesta", price: 50, img: party, w: 10, y: 1, x: 0, desc: "Para celebrar cualquier récord." },
    { id: "hat_top", name: "Sombrero de Copa", price: 150, img: top, w: 18, y: 2, x: 0, desc: "Elegancia de otra época." },
    { id: "hat_crown", name: "Corona Real", price: 300, img: crown, w: 14, y: 1, x: 0, desc: "Solo para los mejores." },
    { id: "hat_wizard", name: "Sombrero de Mago", price: 200, img: wiz, w: 20, y: 2, x: 0, desc: "Con un toque de magia." }
  ].map(h => ({ ...h, cat: "hat" }));
}
function seedAll() {
  const out = seedHats();
  const P = (id, name, kind, price, extra = {}) => out.push({ id, name, cat: "profile", kind, price, ...extra });
  [["Rojo", "#d63a2f"], ["Azul", "#2f6fd6"], ["Verde", "#2f9e4f"], ["Morado", "#7a3fd0"], ["Naranja", "#e8872a"], ["Negro", "#17171c"]].forEach(([n, c], i) => P("bg_s" + i, "Fondo " + n, "bg-solid", 100, { c1: c }));
  [["Atardecer", "#ff7a3d", "#7b2ff7"], ["Océano", "#00c6ff", "#0050b8"], ["Aurora", "#43e97b", "#38a3f5"], ["Fuego", "#f7d02c", "#d3202a"]].forEach(([n, a, b], i) => P("bg_g" + i, n, "bg-grad", 200, { c1: a, c2: b }));
  [["end", "El End"], ["desierto", "Desierto"], ["coral", "Coral"]].forEach(([g, n]) => P("bg_m_" + g, "Fondo " + n, "bg-game", 400, { game: g }));
  [["Rojo", "#d63a2f"], ["Azul", "#2f6fd6"], ["Verde", "#2f9e4f"], ["Dorado", "#f5c93a"], ["Blanco", "#f2f2f2"]].forEach(([n, c], i) => P("fr_s" + i, "Marco " + n, "fr-solid", 40, { c1: c }));
  [["Cian", "#27f2ff"], ["Rosa", "#ff3df2"], ["Lima", "#7dff2a"], ["Amarillo", "#ffe92a"]].forEach(([n, c], i) => P("fr_n" + i, "Neón " + n, "fr-neon", 100, { c1: c }));
  P("fr_rgb", "Marco RGB", "fr-rgb", 400, { c1: "#ff0000" });
  const gem = ["...aaaaaa...", "..abbbbbba..", ".abbccccbba.", "abbccddccbba", ".abcddddcba.", "..abcddcba..", "...abccba...", "....abba....", ".....aa....."];
  out.push({ id: "it_diamond", name: "Diamante", cat: "items", price: 300, img: sprite(gem, { a: "#1f8a9e", b: "#4ee3e3", c: "#9ff7f7", d: "#e8ffff" }), desc: "Brilla como nada." });
  out.push({ id: "it_emerald", name: "Esmeralda", cat: "items", price: 250, img: sprite(gem, { a: "#0b6b2e", b: "#17c45a", c: "#6dea97", d: "#d5ffe3" }), desc: "La moneda de los aldeanos." });
  out.push({ id: "it_gold", name: "Lingote de Oro", cat: "items", price: 150, img: sprite(["...oooooooooo.", "..oYYYYYYYYYYo", ".oYYwwYYYYYYYo", "oooooooooooooo", "oYYYYYYYYYYYYo", "oYwYYYYYYYYYYo", "oOOOOOOOOOOOOo", "oooooooooooooo"], { o: "#8a5a0a", Y: "#f5c93a", w: "#fff3b0", O: "#d9a21c" }), desc: "Pesado y dorado." });
  out.push({ id: "it_heart", name: "Corazón", cat: "items", price: 80, img: sprite(["..rrr.rrr..", ".rrwrrrrrr.", "rrwrrrrrrrr", "rrrrrrrrrrr", "rrrrrrrrrrd", ".rrrrrrrrd.", "..rrrrrdd..", "...rrrdd...", "....rdd....", ".....d....."], { r: "#e5233b", w: "#ff9aa6", d: "#a3162a" }), desc: "Una vida extra." });
  return out;
}
async function seed() {
  if (!confirm("Esto agrega los artículos iniciales (sombreros, fondos, marcos e items) que todavía no existan. ¿Continuar?")) return;
  const fb = D.fb, btn = q('[data-a="seed"]'); if (btn) btn.disabled = true;
  try {
    await loadShop(true);
    let n = 0;
    for (const [i, it] of seedAll().entries()) {
      if (shop.has(it.id)) continue;
      const { id, ...d } = it, o = { ...d, hidden: false, order: i * 10 }; if (o.cat !== "hat") { delete o.w; delete o.x; delete o.y; }
      await fb.setDoc(fb.doc(D.db, "shop", id), o); n++;
    }
    await loadShop(true); renderBook(); alert(n ? `Listo: ${n} artículos agregados.` : "El catálogo inicial ya estaba cargado.");
  } catch (e) { console.warn(e); alert("No se pudo cargar" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"); if (btn) btn.disabled = false; }
}

/* ---------- inventario (en el perfil) ---------- */
export async function inventory(host, { inv = [], equip: eq = {}, mine = false, name = "" }) {
  host.innerHTML = `<p class="muted">Cargando…</p>`;
  await loadShop();
  const list = (Array.isArray(inv) ? inv : []).map(id => shop.get(id)).filter(Boolean);
  if (!list.length) { host.innerHTML = `<p class="muted">${mine ? "Aún no has comprado nada. Visita el Mercado." : "Aún no tiene artículos."}</p>`; return; }
  const order = { items: 0, hat: 1, profile: 2 }, wornOf = it => (it.cat === "hat" && eq.hat === it.id) || (it.cat === "profile" && (eq.bg === it.id || eq.frame === it.id));
  list.sort((a, b) => (order[a.cat] ?? 9) - (order[b.cat] ?? 9) || byOrder(a, b));
  host.innerHTML = `<div class="mk-inv">${list.map(it => `<button class="mk-slot${wornOf(it) ? " worn" : ""}" type="button" data-id="${esc(it.id)}" title="${esc(it.name)}"><span class="mk-tw">${thumb(it)}</span><b>${esc(it.name)}</b></button>`).join("")}</div>`;
  host.onclick = e => { const b = e.target.closest(".mk-slot"); if (b) viewItem(shop.get(b.dataset.id), mine, host, { inv, equip: eq, mine, name }); };
}
async function viewItem(it, mine, host, st) {
  if (!it) return;
  const u = D.me(), eq = (mine && u && u.equip) || st.equip || {}, on = wearable(it) && ((it.cat === "hat" && eq.hat === it.id) || (it.cat === "profile" && (eq.bg === it.id || eq.frame === it.id)));
  const m = modal(`<h3>${esc(it.name)}</h3><div class="mk-vstage"><canvas class="mk-3d"></canvas></div><p class="mk-desc">${esc(it.desc || "")}</p><small class="mk-tip">Arrastra para girarlo</small>
    ${mine && wearable(it) ? `<button class="mk-buy alt" type="button" id="mk-eq">${on ? "QUITAR" : "EQUIPAR"}</button><p class="mk-msg" id="mk-vm"></p>` : ""}`, "view");
  let v = null; m._done = () => v && v.stop();
  const cv = m.querySelector("canvas");
  if (it.kind && it.kind !== "bg-img" && !it.img) { cv.replaceWith(Object.assign(document.createElement("div"), { className: "mk-vsw" })); m.querySelector(".mk-vsw").style.background = it.kind.startsWith("bg") ? bgCss(it) : ""; if (it.kind.startsWith("fr-")) m.querySelector(".mk-vsw").innerHTML = thumb(it); }
  else { v = viewer3d(cv); const [img, obj] = await Promise.all([imgOf(it), it.model ? modelOf(it.id) : null]); v.set({ img, obj }); }
  const eb = m.querySelector("#mk-eq");
  if (eb) eb.onclick = async () => {
    eb.disabled = true; const turnOn = eb.textContent === "EQUIPAR", ok = await equip(it, turnOn);
    if (ok) { m.close(); if (host.isConnected) inventory(host, { ...st, equip: D.me().equip || {} }); } else { m.querySelector("#mk-vm").textContent = "No se pudo guardar."; eb.disabled = false; }
  };
}

/* ---------- API ---------- */
export const Mercado = {
  init(deps) { D = deps; root = document.querySelector("#mk"); },
  async enter() {
    if (!root || !D) return;
    if (!root.querySelector(".mk-track")) buildCarousel();
    await loadShop(true);
    coinsLabel(); if (openCat) renderBook(); if (root._layout) root._layout();
    if (!keyFn) {
      keyFn = e => {
        if (!root.offsetParent || openCat || e.target.closest("input,textarea,select") || document.querySelector(".mk-modal")) return;
        if (e.key === "ArrowLeft") { root._go(-1); e.preventDefault(); } else if (e.key === "ArrowRight") { root._go(1); e.preventDefault(); } else if (e.key === "Enter" && !e.target.closest("button,a")) root._open();
      };
      document.addEventListener("keydown", keyFn);
    }
    addEventListener("resize", root._layout);
  },
  leave() { if (root && root._layout) removeEventListener("resize", root._layout); stopStage(); if (root && openCat) closeBook(); },
  refresh() { if (root && openCat) renderBook(); else if (root) coinsLabel(); },
  loadShop, hatCos, decorate, applyFrame, applyBg, inventory, itemOf, isAdmin
};
