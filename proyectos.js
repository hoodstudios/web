/* proyectos.js — Carrusel 3D de proyectos (estilo menú de videojuegos) y ventana de cada proyecto.
 * Para añadir o editar proyectos, solo toca la lista PROYECTOS de abajo (las portadas van en la carpeta "proyectos/"). */
const PROYECTOS = [
  { id: "hardhood", name: "HardHood", status: "Proyecto activo", img: "proyectos/hardhood.jpg",
    acc: "#ff5a52", wbg: "#1a0407",
    tabs: [
      { t: "Información", h: "HardHood", p: ["Nuestro proyecto activo.", "Aquí irá toda la información de HardHood."] },
      { t: "Crafteos", h: "Crafteos", p: ["Aquí aparecerán los crafteos del proyecto."] },
      { t: "Cambios", h: "Cambios", p: ["Aquí aparecerá el registro de cambios del proyecto."] }] },
  { id: "zombies", name: "Zombies Survival", status: "En desarrollo", img: "proyectos/zombies-survival.jpg",
    acc: "#58c768", wbg: "#06130a",
    tabs: [
      { t: "Información", h: "Zombies Survival", p: ["Proyecto en desarrollo.", "Aquí irá toda la información de Zombies Survival."] },
      { t: "Mapa", h: "Mapa", p: ["Aquí aparecerá el mapa del proyecto."] },
      { t: "Comerciantes", h: "Comerciantes", p: ["Aquí aparecerán los comerciantes del proyecto."] }] },
  { id: "borderland", name: "The Borderland", status: "En desarrollo", img: "proyectos/borderland.jpg",
    acc: "#d4d4dc", wbg: "#0c0c0f",
    tabs: [
      { t: "Información", h: "The Borderland", p: ["Proyecto en desarrollo.", "Aquí irá toda la información de The Borderland."] },
      { t: "Juegos", h: "Juegos", p: ["Aquí aparecerán los juegos del proyecto."] },
      { t: "Cartas", h: "Cartas", p: ["Aquí aparecerán las cartas del proyecto."] }] },
  { id: "pronto", name: "Próximamente…", status: "Próximamente", img: "proyectos/proximamente.jpg", soon: true, acc: "#8a8a92" }
];

const $ = s => document.querySelector(s);
const sec = $("#v-proyectos"), stage = $("#pj-stage"), bgs = $("#pj-bgs"), dots = $("#pj-dots"), modal = $("#pj-modal");
const prevB = $("#pj-prev"), nextB = $("#pj-next");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const N = PROYECTOS.length, mod = i => ((i % N) + N) % N;
let pos = 0, target = 0, openId = null, lastWheel = 0;           // pos = posición (decimal) del carrusel; target = proyecto de destino (entero, sin acotar: el carrusel es infinito)
const cur = () => mod(Math.round(target));

/* ---------- Construcción ---------- */
const cards = PROYECTOS.map((p, i) => {
  const el = document.createElement("article");
  el.className = "pj-card"; el.dataset.i = i; el.style.setProperty("--acc", p.acc);
  el.setAttribute("aria-label", p.name + " — " + p.status);
  el.innerHTML = `<img src="${esc(p.img)}" alt="Portada de ${esc(p.name)}" draggable="false">
    ${p.soon ? `<span class="q" aria-hidden="true">?</span>` : ""}
    <span class="tag">${esc(p.status)}</span>
    <div class="shade"><b class="nm">${esc(p.name)}</b><span class="st">${esc(p.status)}</span></div>`;
  stage.append(el);
  const bg = document.createElement("div"); bg.className = "pj-bg"; bg.style.backgroundImage = `url("${p.img}")`; bgs.append(bg);
  const d = document.createElement("i"); d.setAttribute("role", "button"); d.setAttribute("aria-label", p.name); d.onclick = () => go(i); dots.append(d);
  return { el, bg, d };
});

/* ---------- Disposición 3D (continua y circular: sirve igual para la animación y para el arrastre) ---------- */
function layout() {
  const near = mod(Math.round(pos));
  cards.forEach((c, i) => {
    let d = i - pos; d -= N * Math.round(d / N);                 // distancia más corta sobre el círculo
    const a = Math.abs(d), s = Math.sign(d);
    const x = s * (74 * Math.min(a, 1) + 44 * Math.max(0, Math.min(a, 2) - 1));          // % del ancho de la tarjeta
    const z = -Math.min(a, 2) * 210, ry = clamp(-d * 34, -50, 50);
    const sc = 1 - .1 * Math.min(a, 1) - .06 * Math.max(0, Math.min(a, 2) - 1);
    const t = Math.min(a, 1), op = a < 1.2 ? 1 : Math.max(0, 1 - (a - 1.2) / .6);
    c.el.style.transform = `translateX(${x}%) translateZ(${z}px) rotateY(${ry}deg) scale(${sc})`;
    c.el.style.filter = a < .02 ? "none" : `blur(${(t * 5).toFixed(2)}px) brightness(${(1 - t * .5).toFixed(2)})`;
    c.el.style.opacity = op;
    c.el.style.zIndex = 20 - Math.round(a * 4);
    c.el.style.pointerEvents = op < .05 ? "none" : "";
    c.el.classList.toggle("cur", i === near);
    c.el.tabIndex = i === near ? 0 : -1;
  });
}
function sync() {
  const k = cur();
  cards.forEach((c, i) => { c.bg.classList.toggle("on", i === k); c.d.classList.toggle("on", i === k); });
}

/* ---------- Animación propia (no depende de las transiciones CSS, así es suave en cualquier navegador) ---------- */
const DUR = 700, ease = x => 1 - Math.pow(1 - x, 3.4);
let raf = 0, from = 0, t0 = 0;
function tween(to) {
  target = to; from = pos; t0 = performance.now(); sync();
  if (!raf) raf = requestAnimationFrame(step);
}
function step(now) {
  const x = Math.min(1, (now - t0) / DUR);
  pos = from + (target - from) * ease(x); layout();
  if (x < 1) raf = requestAnimationFrame(step); else { raf = 0; pos = target; layout(); }
}
function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
function go(i) {                                                  // ir a un proyecto por el camino más corto
  const base = Math.round(target); let dlt = mod(i - mod(base) + N / 2) - N / 2;
  tween(base + dlt);
}
const move = dir => tween(Math.round(target) + dir);
prevB.onclick = () => move(-1);
nextB.onclick = () => move(1);

/* ---------- Arrastre con el ratón / el dedo ---------- */
let drag = null;
stage.addEventListener("pointerdown", e => {
  if (e.button || openId) return;
  stop();
  drag = { id: e.pointerId, x0: e.clientX, p0: pos, moved: false, card: e.target.closest(".pj-card"), t: performance.now(), x: e.clientX, v: 0 };
});
stage.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, step = (cards[0].el.offsetWidth || 600) * .74;
  if (!drag.moved && Math.abs(dx) > 8) { drag.moved = true; stage.classList.add("drag"); try { stage.setPointerCapture(drag.id); } catch (_) {} }
  if (!drag.moved) return;
  const now = performance.now(); drag.v = (e.clientX - drag.x) / Math.max(1, now - drag.t); drag.x = e.clientX; drag.t = now;
  pos = drag.p0 - dx / step; layout();
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; stage.classList.remove("drag");
  if (!d.moved) {                                           // un toque: la tarjeta del centro se abre; las de los lados se acercan
    if (d.card) { const i = +d.card.dataset.i; if (i === cur()) open(i); else go(i); }
    return;
  }
  const dx = e.clientX - d.x0, step = (cards[0].el.offsetWidth || 600) * .74, base = Math.round(d.p0);
  let t = Math.round(pos - d.v * 160 / step);
  if (t === base && Math.abs(dx) > 40) t = base + (dx < 0 ? 1 : -1);
  tween(t);
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove("drag"); tween(Math.round(pos)); } });

/* ---------- Ventana del proyecto ---------- */
const setHash = id => { if (/^#proyectos/.test(location.hash)) history.replaceState(null, "", "#proyectos" + (id ? "/" + id : "")); };
function open(i) {
  const p = PROYECTOS[i]; if (p.soon || openId) return;
  openId = p.id; go(i); setHash(p.id);
  modal.getAnimations().forEach(a => a.cancel());
  modal.hidden = false;
  modal.style.setProperty("--acc", p.acc); modal.style.setProperty("--wbg", p.wbg);
  modal.innerHTML = `<h3 class="pj-title">${esc(p.name)}</h3>
    <div class="pj-tabs" role="tablist" aria-label="Secciones de ${esc(p.name)}">${p.tabs.map((t, k) => `<button type="button" role="tab" id="pjt${k}" aria-selected="${k === 0}" aria-controls="pjp" data-k="${k}">${esc(t.t)}</button>`).join("")}</div>
    <div class="pj-win" role="dialog" aria-label="${esc(p.name)}"><button class="x" type="button" aria-label="Cerrar">×</button><div id="pjp" role="tabpanel"></div></div>`;
  const tabs = [...modal.querySelectorAll("[role=tab]")];
  const show = k => {
    tabs.forEach((b, j) => { b.setAttribute("aria-selected", j === k); b.tabIndex = j === k ? 0 : -1; });
    const t = p.tabs[k];
    $("#pjp").innerHTML = `<div class="pj-pane"><h3>${esc(t.h)}</h3>${t.p.map((x, j) => `<p${j ? ' class="muted"' : ""}>${esc(x)}</p>`).join("")}</div>`;
    $("#pjp").setAttribute("aria-labelledby", "pjt" + k);
  };
  tabs.forEach((b, k) => b.onclick = () => show(k));
  modal.querySelector(".x").onclick = close;
  modal._tabs = tabs; modal._show = show; show(0);
  sec.classList.add("open"); tabs[0].focus({ preventScroll: true });
}
function close() {                                          // cierre inmediato: sin esperas ni fundidos
  if (!openId) return;
  openId = null; sec.classList.remove("open"); setHash("");
  modal.getAnimations().forEach(a => a.cancel());
  modal.hidden = true; modal.innerHTML = "";
  stage.focus({ preventScroll: true });
}
modal.addEventListener("pointerdown", e => { if (e.target === modal) close(); });

/* ---------- Teclado y rueda ---------- */
addEventListener("keydown", e => {
  if (sec.hidden || (document.getElementById("modal") || {}).hidden === false) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (openId) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const ts = modal._tabs, k = ts.findIndex(b => b.getAttribute("aria-selected") === "true");
      const n = clamp(k + (e.key === "ArrowRight" ? 1 : -1), 0, ts.length - 1); if (n !== k) { modal._show(n); ts[n].focus(); } e.preventDefault();
    }
    return;
  }
  if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
  else if ((e.key === "Enter" || e.key === " ") && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); open(cur()); }
});
sec.addEventListener("wheel", e => {
  if (openId) return;
  e.preventDefault();
  const now = performance.now(), d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (now - lastWheel < 450 || Math.abs(d) < 8) return;
  lastWheel = now; move(d > 0 ? 1 : -1);
}, { passive: false });

/* ---------- Enlaces directos: #proyectos/hardhood abre la ventana de ese proyecto ---------- */
function applyHash() {
  if (sec.hidden) return;
  const [h, a = ""] = location.hash.slice(1).split("/");
  if (h !== "proyectos") return;
  let id = ""; try { id = decodeURIComponent(a); } catch (_) {}
  const i = PROYECTOS.findIndex(p => p.id === id && !p.soon);
  if (i >= 0) { if (openId !== PROYECTOS[i].id) { openId = null; open(i); } }
  else if (openId) close();
}
addEventListener("hashchange", () => setTimeout(applyHash, 0));

/* ---------- Al entrar en la vista: animación de entrada; al salir: cerrar la ventana ---------- */
new MutationObserver(() => {
  if (sec.hidden) { if (openId) { openId = null; sec.classList.remove("open"); modal.hidden = true; modal.innerHTML = ""; } return; }
  stage.classList.remove("enter"); void stage.offsetWidth; stage.classList.add("enter");
  applyHash();
}).observe(sec, { attributes: true, attributeFilter: ["hidden"] });

layout(); sync(); applyHash();
