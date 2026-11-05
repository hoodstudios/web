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
const N = PROYECTOS.length;
let cur = 0, pos = 0, openId = null, lastWheel = 0;

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

/* ---------- Disposición 3D (continua: sirve igual para el arrastre) ---------- */
function layout() {
  const near = Math.round(pos);
  cards.forEach((c, i) => {
    const d = i - pos, a = Math.abs(d), s = Math.sign(d);
    const x = s * (74 * Math.min(a, 1) + 44 * Math.max(0, Math.min(a, 2) - 1));          // % del ancho de la tarjeta
    const z = -Math.min(a, 2) * 210, ry = clamp(-d * 34, -50, 50);
    const sc = 1 - .1 * Math.min(a, 1) - .06 * Math.max(0, Math.min(a, 2) - 1);
    const t = Math.min(a, 1), op = a < 1.6 ? 1 : Math.max(0, 1 - (a - 1.6) * 1.6);
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
  cards.forEach((c, i) => { c.bg.classList.toggle("on", i === cur); c.d.classList.toggle("on", i === cur); });
  prevB.disabled = cur <= 0; nextB.disabled = cur >= N - 1;
  sec.style.setProperty("--cur-acc", PROYECTOS[cur].acc);
}
function go(i) { cur = clamp(i, 0, N - 1); pos = cur; layout(); sync(); }
prevB.onclick = () => go(cur - 1);
nextB.onclick = () => go(cur + 1);

/* ---------- Arrastre con el ratón / el dedo ---------- */
let drag = null;
stage.addEventListener("pointerdown", e => {
  if (e.button || openId) return;
  drag = { id: e.pointerId, x0: e.clientX, p0: cur, moved: false, card: e.target.closest(".pj-card"), t: performance.now(), x: e.clientX, v: 0 };
});
stage.addEventListener("pointermove", e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, step = (cards[0].el.offsetWidth || 600) * .74;
  if (!drag.moved && Math.abs(dx) > 8) { drag.moved = true; stage.classList.add("drag"); try { stage.setPointerCapture(drag.id); } catch (_) {} }
  if (!drag.moved) return;
  const now = performance.now(); drag.v = (e.clientX - drag.x) / Math.max(1, now - drag.t); drag.x = e.clientX; drag.t = now;
  pos = clamp(drag.p0 - dx / step, -.35, N - 1 + .35); layout();
});
const endDrag = e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; stage.classList.remove("drag");
  if (!d.moved) {                                           // un toque: la tarjeta del centro se abre; las de los lados se acercan
    if (d.card) { const i = +d.card.dataset.i; if (i === cur) open(i); else go(i); }
    return;
  }
  const dx = e.clientX - d.x0, step = (cards[0].el.offsetWidth || 600) * .74;
  let t = Math.round(pos - d.v * 160 / step);
  if (t === d.p0 && Math.abs(dx) > 40) t = d.p0 + (dx < 0 ? 1 : -1);
  go(t);
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove("drag"); go(cur); } });

/* ---------- Ventana del proyecto ---------- */
function open(i) {
  const p = PROYECTOS[i]; if (p.soon || openId) return;
  openId = p.id; go(i);
  modal.hidden = false; modal.classList.remove("out");
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
function close() {
  if (!openId) return;
  openId = null; modal.classList.add("out"); sec.classList.remove("open");
  setTimeout(() => { if (!openId) { modal.hidden = true; modal.innerHTML = ""; } }, 300);
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
  if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  else if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
  else if ((e.key === "Enter" || e.key === " ") && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); open(cur); }
});
sec.addEventListener("wheel", e => {
  if (openId) return;
  e.preventDefault();
  const now = performance.now(), d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (now - lastWheel < 450 || Math.abs(d) < 8) return;
  lastWheel = now; go(cur + (d > 0 ? 1 : -1));
}, { passive: false });

/* ---------- Al entrar en la vista: cerrar ventana y repetir la animación de entrada ---------- */
new MutationObserver(() => {
  if (sec.hidden) { if (openId) { openId = null; sec.classList.remove("open"); modal.hidden = true; modal.innerHTML = ""; } return; }
  stage.classList.remove("enter"); void stage.offsetWidth; stage.classList.add("enter");
}).observe(sec, { attributes: true, attributeFilter: ["hidden"] });

go(0);
