/* proyectos.js — Carrusel 3D de proyectos + ventana de cada proyecto + MODO EDITOR (solo la cuenta HOODSTUDIO).
 * Los proyectos viven en Firestore (colección "projects"; imágenes en "project_media"). Mientras no exista ninguno se muestran los de abajo.
 * Al activar el modo editor por primera vez se ofrece importarlos para poder editarlos. */
const LEGACY = [
  { id: "hardhood", name: "HardHood", status: "Proyecto activo", img: "proyectos/hardhood.jpg", start: "2026-08-15", end: "2026-12-31", acc: "#ff8a1f", wbg: "#1a0d03",
    tabs: [
      { t: "Información", h: "HardHood", p: ["Nuestro proyecto activo.", "Aquí irá toda la información de HardHood."] },
      { t: "Crafteos", h: "Crafteos", p: ["Aquí aparecerán los crafteos del proyecto."] },
      { t: "Cambios", h: "Cambios", p: ["Aquí aparecerá el registro de cambios del proyecto."] }] },
  { id: "zombies", name: "Zombies Survival", status: "En desarrollo", img: "proyectos/zombies-survival.jpg", start: "2027-01-15", end: "2027-03-31", acc: "#58c768", wbg: "#06130a",
    tabs: [
      { t: "Información", h: "Zombies Survival", p: ["Proyecto en desarrollo.", "Aquí irá toda la información de Zombies Survival."] },
      { t: "Mapa", h: "Mapa", p: ["Aquí aparecerá el mapa del proyecto."] },
      { t: "Comerciantes", h: "Comerciantes", p: ["Aquí aparecerán los comerciantes del proyecto."] }] },
  { id: "borderland", name: "The Borderland", status: "En desarrollo", img: "proyectos/borderland.jpg", start: "2027-04-12", end: "2027-06-30", acc: "#d4d4dc", wbg: "#0c0c0f",
    tabs: [
      { t: "Información", h: "The Borderland", p: ["Proyecto en desarrollo.", "Aquí irá toda la información de The Borderland."] },
      { t: "Juegos", h: "Juegos", p: ["Aquí aparecerán los juegos del proyecto."] },
      { t: "Cartas", h: "Cartas", p: ["Aquí aparecerán las cartas del proyecto."] }] },
  { id: "pronto", name: "Próximamente…", status: "Próximamente", img: "proyectos/proximamente.jpg", soon: true, acc: "#8a8a92", wbg: "#0c0c0f", tabs: [] }
];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ADMIN = "hoodstudio@hoodstudio.app";
const HEX = /^#[0-9a-fA-F]{6}$/;
const uid = () => Math.random().toString(36).slice(2, 8);

/* ---------- Modelo: bloques (texto/imagen) con posición libre. x, w en % del ancho; y en px ---------- */
const legacyBlocks = t => {
  const b = [{ k: "t", x: 4, y: 12, w: 92, md: "# " + (t.h || t.t) }];
  (t.p || []).forEach((x, i) => b.push({ k: "t", x: 4, y: 64 + i * 46, w: 70, md: x }));
  return b;
};
const norm = (p, i = 0) => ({
  id: p.id, name: p.name || "Proyecto", status: p.status || "", imgRef: p.imgRef || p.img || "", img: p.img || "", acc: HEX.test(p.acc) ? p.acc : "#ff8a1f", wbg: HEX.test(p.wbg) ? p.wbg : "#120a04",
  soon: !!p.soon, start: p.start || "", end: p.end || "", order: Number.isFinite(p.order) ? p.order : i,
  tabs: (p.tabs || []).map(t => ({ t: String(t.t || "Sección"), b: Array.isArray(t.b) ? t.b.map(cleanBlock).filter(Boolean) : legacyBlocks(t) }))
});
function cleanBlock(b) {
  if (!b || (b.k !== "t" && b.k !== "i")) return null;
  const o = { k: b.k, x: clamp(+b.x || 0, 0, 100), y: Math.max(0, Math.round(+b.y || 0)), w: clamp(+b.w || 40, 6, 100) };
  if (b.k === "t") o.md = String(b.md ?? "");
  else { o.src = String(b.src || ""); o.link = String(b.link || ""); }
  return o;
}
/* La lista es "viva": calendario.js la lee en cada dibujo y se avisa con el evento "pj-update". */
export const PROYECTOS = LEGACY.map(norm);
const publish = () => { window.dispatchEvent(new Event("pj-update")); };

/* ---------- Conexión con Firebase (la crea main.js: window.HOOD) ---------- */
const H = () => window.HOOD || null;
let remote = false, editing = false, dirty = false;
const isAdmin = () => { const h = H(), u = h && h.auth.currentUser; return !!(u && (u.email || "").toLowerCase() === ADMIN); };
const media = new Map();                                            // m:ID -> data URL
async function srcOf(ref) {
  if (!ref) return "";
  if (ref.startsWith("m:")) {
    const id = ref.slice(2); if (media.has(id)) return media.get(id);
    const h = H(); if (!h) return "";
    try { const s = await h.fb.getDoc(h.fb.doc(h.db, "project_media", id)); const d = s.exists() ? s.data().d : ""; media.set(id, d); return d; } catch (e) { return ""; }
  }
  return /^(https?:\/\/|proyectos\/|galeria\/|img\/|[\w\-]+\.(png|jpe?g|webp|gif)$)/i.test(ref) ? ref : "";
}

/* ---------- Markdown estilo Discord (todo se escapa antes: no hay HTML inyectable) ---------- */
const safeUrl = u => { const d = u.replace(/&amp;/g, "&"); return /^(https?:\/\/|mailto:|#)/i.test(d) ? u : ""; };
function inline(s) {
  const hold = []; const keep = h => "\u0001" + (hold.push(h) - 1) + "\u0001";
  s = s.replace(/`([^`\n]+)`/g, (m, c) => keep(`<code>${c}</code>`));
  s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (m, t, u) => safeUrl(u) ? keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`) : m);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0001]*[^\s<.,;:!?)\u0001])/g, (m, a, u) => a + keep(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
  s = s.replace(/\|\|(.+?)\|\|/g, '<span class="sp" tabindex="0">$1</span>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*(?!\s)(.+?)\*/g, "<i>$1</i>").replace(/(^|[^\w])_(?!\s)(.+?)_(?=[^\w]|$)/g, "$1<i>$2</i>").replace(/~~(.+?)~~/g, "<s>$1</s>");
  return s.replace(/\u0001(\d+)\u0001/g, (m, i) => hold[+i]);
}
function md(src) {
  const lines = esc(src).replace(/\r/g, "").split("\n"), out = []; let i = 0;
  while (i < lines.length) {
    const L = lines[i];
    if (/^```/.test(L)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${buf.join("\n")}</code></pre>`); continue; }
    let m;
    if ((m = L.match(/^(#{1,3}) (.*)$/))) { out.push(`<h${m[1].length + 1} class="mh${m[1].length}">${inline(m[2])}</h${m[1].length + 1}>`); i++; continue; }
    if ((m = L.match(/^-# (.*)$/))) { out.push(`<small class="mm">${inline(m[1])}</small>`); i++; continue; }
    if (/^&gt; ?/.test(L)) { const buf = []; while (i < lines.length && /^&gt; ?/.test(lines[i])) buf.push(inline(lines[i++].replace(/^&gt; ?/, ""))); out.push(`<blockquote>${buf.join("<br>")}</blockquote>`); continue; }
    if (/^\s*[-*•] /.test(L)) { const buf = []; while (i < lines.length && /^\s*[-*•] /.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*[-*•] /, ""))}</li>`); out.push(`<ul>${buf.join("")}</ul>`); continue; }
    if (/^\s*\d+[.)] /.test(L)) { const buf = []; while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*\d+[.)] /, ""))}</li>`); out.push(`<ol>${buf.join("")}</ol>`); continue; }
    if (!L.trim()) { out.push('<div class="gap"></div>'); i++; continue; }
    const buf = []; while (i < lines.length && lines[i].trim() && !/^(```|#{1,3} |-# |&gt; ?|\s*[-*•] |\s*\d+[.)] )/.test(lines[i])) buf.push(inline(lines[i++]));
    out.push(`<p>${buf.join("<br>")}</p>`);
  }
  return out.join("");
}

/* ---------- Carrusel ---------- */
const sec = $("#v-proyectos"), stage = $("#pj-stage"), bgs = $("#pj-bgs"), dots = $("#pj-dots"), modal = $("#pj-modal");
const prevB = $("#pj-prev"), nextB = $("#pj-next");
let N = 0, cards = [], pos = 0, target = 0, openId = null, lastWheel = 0;
const mod = i => N ? ((i % N) + N) % N : 0;
const cur = () => mod(Math.round(target));

function build() {
  stage.innerHTML = ""; bgs.innerHTML = ""; dots.innerHTML = ""; N = PROYECTOS.length;
  cards = PROYECTOS.map((p, i) => {
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
  prevB.hidden = nextB.hidden = N < 2;
  pos = target = N ? clamp(Math.round(target), 0, N - 1) : 0;
  layout(); sync();
}
function layout() {
  const near = mod(Math.round(pos));
  cards.forEach((c, i) => {
    let d = i - pos; d -= N * Math.round(d / N);
    const a = Math.abs(d), s = Math.sign(d);
    const x = s * (74 * Math.min(a, 1) + 44 * Math.max(0, Math.min(a, 2) - 1));
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
  if (editing) updBar();
}

const DUR = 700, ease = x => 1 - Math.pow(1 - x, 3.4);
let raf = 0, from = 0, t0 = 0;
function tween(to) { target = to; from = pos; t0 = performance.now(); sync(); if (!raf) raf = requestAnimationFrame(step); }
function step(now) {
  const x = Math.min(1, (now - t0) / DUR);
  pos = from + (target - from) * ease(x); layout();
  if (x < 1) raf = requestAnimationFrame(step); else { raf = 0; pos = target; layout(); }
}
function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
function go(i) { if (!N) return; const base = Math.round(target); const dlt = mod(i - mod(base) + N / 2) - N / 2; tween(base + dlt); }
const move = dir => { if (N > 1) tween(Math.round(target) + dir); };
prevB.onclick = () => move(-1);
nextB.onclick = () => move(1);

let drag = null;
stage.addEventListener("pointerdown", e => {
  if (e.button || openId || !N) return;
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
  if (!d.moved) { if (d.card) { const i = +d.card.dataset.i; if (i === cur()) open(i); else go(i); } return; }
  const dx = e.clientX - d.x0, step = (cards[0].el.offsetWidth || 600) * .74, base = Math.round(d.p0);
  let t = Math.round(pos - d.v * 160 / step);
  if (t === base && Math.abs(dx) > 40) t = base + (dx < 0 ? 1 : -1);
  tween(t);
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove("drag"); tween(Math.round(pos)); } });

/* ---------- Ventana del proyecto ---------- */
const setHash = id => { if (/^#proyectos/.test(location.hash)) history.replaceState(null, "", "#proyectos" + (id ? "/" + id : "")); };
const projOpen = () => PROYECTOS.find(p => p.id === openId);
let tabK = 0, sel = null, docEl = null, ro = null;

function open(i) {
  const p = PROYECTOS[i]; if (!p || openId) return;
  if (p.soon && editing) { editProject(p); return; }
  if (p.soon) return;
  openId = p.id; go(i); setHash(p.id);
  modal.getAnimations().forEach(a => a.cancel());
  modal.hidden = false; tabK = 0; sel = null;
  drawWindow(p);
  sec.classList.add("open");
}
function drawWindow(p) {
  modal.style.setProperty("--acc", p.acc); modal.style.setProperty("--wbg", p.wbg);
  modal.classList.toggle("ed", editing);
  if (tabK >= p.tabs.length) tabK = Math.max(0, p.tabs.length - 1);
  modal.innerHTML = `<h3 class="pj-title">${esc(p.name)}</h3>
    <div class="pj-tabs" role="tablist" aria-label="Secciones de ${esc(p.name)}">${p.tabs.map((t, k) => `<button type="button" role="tab" id="pjt${k}" aria-selected="${k === tabK}" aria-controls="pjp" data-k="${k}">${esc(t.t)}</button>`).join("")}${editing ? `<button type="button" class="addtab" data-add="1" title="Añadir sección">＋</button>` : ""}</div>
    <div class="pj-win" role="dialog" aria-label="${esc(p.name)}"><button class="x" type="button" aria-label="Cerrar">×</button>${editing ? `<div class="pj-etool" id="pj-etool"></div>` : ""}<div id="pjp" role="tabpanel"></div></div>`;
  modal.querySelectorAll("[role=tab]").forEach(b => b.onclick = () => { endEdit(); tabK = +b.dataset.k; sel = null; drawWindow(p); });
  const ad = modal.querySelector("[data-add]");
  if (ad) ad.onclick = async () => { const n = await ask("Nueva sección", [{ k: "n", l: "Nombre", v: "Nueva sección" }]); if (!n) return; const nm = n.n.trim() || "Sección"; p.tabs.push({ t: nm, b: [{ k: "t", x: 4, y: 12, w: 92, md: "# " + nm }] }); tabK = p.tabs.length - 1; touch(); drawWindow(p); };
  modal.querySelector(".x").onclick = close;
  showPane(p);
}
function showPane(p) {
  const host = $("#pjp"), t = p.tabs[tabK];
  if (ro) { ro.disconnect(); ro = null; }
  if (!t) { host.innerHTML = `<div class="pj-pane"><p class="muted">${editing ? "Este proyecto no tiene secciones. Pulsa ＋ para crear la primera." : "Todavía no hay contenido."}</p></div>`; docEl = null; if (editing) toolbar(p); return; }
  host.innerHTML = `<div class="pj-pane"><div class="pj-doc${editing ? " ed" : ""}" id="pj-doc"></div></div>`;
  docEl = $("#pj-doc"); docEl.setAttribute("aria-labelledby", "pjt" + tabK);
  t.b.forEach(b => docEl.append(mkBlock(b)));
  ro = new ResizeObserver(fit); ro.observe(docEl); [...docEl.children].forEach(c => ro.observe(c));
  fit();
  if (editing) { docEl.addEventListener("pointerdown", e => { if (e.target === docEl) select(null); }); toolbar(p); }
}
function fit() {
  if (!docEl) return; let h = 0; [...docEl.children].forEach(c => { h = Math.max(h, c.offsetTop + c.offsetHeight); });
  docEl.style.height = Math.max(editing ? 300 : 90, h + (editing ? 60 : 24)) + "px";
}
function close() {
  if (!openId) return;
  if (editing && dirty) { if (!confirm("Tienes cambios sin guardar. ¿Cerrar y descartarlos?")) return; dirty = false; reload(); }
  endEdit();
  openId = null; sel = null; sec.classList.remove("open"); setHash("");
  modal.getAnimations().forEach(a => a.cancel());
  if (ro) { ro.disconnect(); ro = null; }
  modal.hidden = true; modal.innerHTML = ""; docEl = null;
  stage.focus({ preventScroll: true });
}
modal.addEventListener("pointerdown", e => { if (e.target === modal) close(); });

/* ---------- Bloques ---------- */
function mkBlock(b) {
  const el = document.createElement("div"); el.className = "pb " + (b.k === "t" ? "pb-t" : "pb-i"); el._b = b;
  place(el, b); paint(el);
  if (editing) {
    el.addEventListener("pointerdown", e => {
      if (e.target.closest(".rz")) return;
      select(b);
      if (b.k === "i" || e.target.closest(".grip")) startDrag(e, el, "move");
    });
  }
  return el;
}
const place = (el, b) => { el.style.left = b.x + "%"; el.style.top = b.y + "px"; el.style.width = b.w + "%"; };
function paint(el) {
  const b = el._b;
  if (b.k === "t") el.innerHTML = `<div class="md">${md(b.md) || '<p class="muted">(texto vacío)</p>'}</div>`;
  else {
    const a = b.link && safeUrl(esc(b.link)) && !editing ? `href="${esc(b.link)}" target="_blank" rel="noopener noreferrer"` : "";
    el.innerHTML = `<${a ? "a " + a : "div"} class="im"><img alt="" draggable="false"></${a ? "a" : "div"}>`;
    const img = el.querySelector("img"); img.onload = fit; srcOf(b.src).then(s => { if (s) img.src = s; else el.classList.add("broken"); });
  }
  el.classList.toggle("linked", !!(b.link && editing));
  if (editing) { el.insertAdjacentHTML("beforeend", `<span class="grip" title="Arrastrar">⠿</span><span class="rz" title="Cambiar tamaño"></span>`); el.querySelector(".rz").addEventListener("pointerdown", e => { e.stopPropagation(); select(b); startDrag(e, el, "size"); }); }
  el.classList.toggle("sel", sel === b);
}
function repaint(el) { const was = el.classList.contains("editing"); paint(el); if (was) { el.classList.remove("editing"); } }
function startDrag(e, el, mode) {
  if (e.button) return; if (mode === "size" || e.target.tagName !== "TEXTAREA") e.preventDefault();
  const b = el._b, r = docEl.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, o = { x: b.x, y: b.y, w: b.w }; let moved = false;
  const mv = ev => {
    const dx = (ev.clientX - x0) / r.width * 100, dy = ev.clientY - y0; moved = true;
    if (mode === "move") { b.x = clamp(Math.round((o.x + dx) * 4) / 4, 0, 100 - b.w); b.y = Math.max(0, Math.round(o.y + dy)); }
    else b.w = clamp(Math.round((o.w + dx) * 4) / 4, 6, 100 - b.x);
    place(el, b); fit();
  };
  const up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); if (moved) touch(); };
  addEventListener("pointermove", mv); addEventListener("pointerup", up);
}

/* ---------- Selección y edición ---------- */
function select(b) {
  if (sel === b) return;
  endEdit(); sel = b;
  const t = projOpen() && projOpen().tabs[tabK];
  [...(docEl ? docEl.children : [])].forEach(c => c.classList.toggle("sel", c._b === b));
  if (b && b.k === "t" && t) beginEdit(docEl.children[t.b.indexOf(b)]);
  const p = projOpen(); if (p) toolbar(p);
}
let ta = null;
function beginEdit(el) {
  if (!el) return; const b = el._b;
  el.classList.add("editing"); el.querySelector(".md").hidden = true;
  ta = document.createElement("textarea"); ta.className = "pt"; ta.value = b.md; ta.spellcheck = true; ta.placeholder = "Escribe aquí… (estilo Discord: **negrita**, *cursiva*, [texto](enlace))";
  el.prepend(ta); const auto = () => { ta.style.height = "auto"; ta.style.height = Math.max(70, ta.scrollHeight + 2) + "px"; };
  ta.oninput = () => { b.md = ta.value; auto(); touch(); fit(); }; auto();
  ta.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && !e.shiftKey) { const k = e.key.toLowerCase(); if (k === "b") { e.preventDefault(); fmt("**"); } else if (k === "i") { e.preventDefault(); fmt("*"); } else if (k === "u") { e.preventDefault(); fmt("__"); } else if (k === "k") { e.preventDefault(); fmt("link"); } } });
  setTimeout(() => ta && ta.focus({ preventScroll: true }), 0);
}
function endEdit() {
  if (!ta) return; const el = ta.closest(".pb"); ta.remove(); ta = null;
  if (el) { el.classList.remove("editing"); el.innerHTML = ""; paint(el); }
}
function fmt(kind) {
  if (!ta) return; const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sl = v.slice(s, e);
  const set = (txt, a, b2) => { ta.value = v.slice(0, s) + txt + v.slice(e); ta.focus(); ta.setSelectionRange(a, b2); ta.dispatchEvent(new Event("input")); };
  const wrap = (m, ph) => { const t = sl || ph; set(m + t + m, s + m.length, s + m.length + t.length); };
  const lines = pre => { const a = v.lastIndexOf("\n", s - 1) + 1, en = (v.indexOf("\n", e) + 1 || v.length + 1) - 1, blk = v.slice(a, en).split("\n").map(l => pre + l.replace(/^(#{1,3} |-# |> |- |\d+\. )/, "")).join("\n"); ta.value = v.slice(0, a) + blk + v.slice(en); ta.focus(); ta.setSelectionRange(a, a + blk.length); ta.dispatchEvent(new Event("input")); };
  if (kind === "link") {
    const mine = ta;
    ask("Enlace", [{ k: "t", l: "Texto", v: sl || "texto" }, { k: "u", l: "Dirección (https://…)", v: "https://" }]).then(r => { if (!r || !r.u || ta !== mine) return; const u = /^(https?:\/\/|mailto:|#)/i.test(r.u) ? r.u : "https://" + r.u; const t = `[${r.t || u}](${u})`; ta.value = v.slice(0, s) + t + v.slice(e); ta.focus(); ta.setSelectionRange(s, s + t.length); ta.dispatchEvent(new Event("input")); });
  }
  else if (kind === "code") { if (sl.includes("\n")) set("```\n" + sl + "\n```", s, s + sl.length + 8); else wrap("`", "código"); }
  else if (kind === "h1") lines("# "); else if (kind === "h2") lines("## "); else if (kind === "h3") lines("### ");
  else if (kind === "quote") lines("> "); else if (kind === "ul") lines("- "); else if (kind === "small") lines("-# ");
  else wrap(kind, kind === "||" ? "spoiler" : "texto");
}
const touch = () => { dirty = true; const b = $("#pj-save"); if (b) { b.disabled = false; b.classList.add("hot"); } const f = $("#pj-ds"); if (f) f.textContent = "Cambios sin guardar"; };

/* ---------- Barra de herramientas del editor ---------- */
function toolbar(p) {
  const bar = $("#pj-etool"); if (!bar) return;
  const t = p.tabs[tabK], b = sel;
  bar.innerHTML = `
    <div class="r"><b class="lb">Sección</b>
      <button type="button" data-a="ren" ${t ? "" : "disabled"}>✎ Renombrar</button><button type="button" data-a="tl" ${tabK > 0 ? "" : "disabled"}>◀</button><button type="button" data-a="tr" ${t && tabK < p.tabs.length - 1 ? "" : "disabled"}>▶</button><button type="button" data-a="tdel" ${t ? "" : "disabled"}>🗑 Quitar</button>
      <span class="sp"></span><span id="pj-ds" class="ds">${dirty ? "Cambios sin guardar" : ""}</span>
      <button type="button" data-a="proj">⚙ Proyecto</button><button type="button" id="pj-save" class="go${dirty ? " hot" : ""}" data-a="save" ${dirty ? "" : "disabled"}>💾 Guardar</button></div>
    <div class="r"><b class="lb">Añadir</b>
      <button type="button" data-a="addt" ${t ? "" : "disabled"}>＋ Texto</button><button type="button" data-a="addi" ${t ? "" : "disabled"}>＋ Imagen</button><button type="button" data-a="addu" ${t ? "" : "disabled"}>＋ Imagen (URL)</button>
      ${b ? `<span class="sep"></span><button type="button" data-a="front">↥ Al frente</button><button type="button" data-a="dup">⧉ Duplicar</button><button type="button" data-a="del" class="dg">🗑 Borrar bloque</button>` : ""}</div>
    ${b && b.k === "t" ? `<div class="r fm"><b class="lb">Texto</b>
      <button type="button" data-f="**" title="Negrita (Ctrl+B)"><b>B</b></button><button type="button" data-f="*" title="Cursiva (Ctrl+I)"><i>I</i></button><button type="button" data-f="__" title="Subrayado (Ctrl+U)"><u>U</u></button><button type="button" data-f="~~" title="Tachado"><s>S</s></button>
      <button type="button" data-f="code" title="Código">&lt;/&gt;</button><button type="button" data-f="||" title="Spoiler">▮</button><span class="sep"></span>
      <button type="button" data-f="h1">H1</button><button type="button" data-f="h2">H2</button><button type="button" data-f="h3">H3</button><button type="button" data-f="small">pequeño</button><button type="button" data-f="quote">❝</button><button type="button" data-f="ul">• Lista</button><span class="sep"></span>
      <button type="button" data-f="link" title="Enlace (Ctrl+K)">🔗 Enlace</button></div>` : ""}
    ${b && b.k === "i" ? `<div class="r fm"><b class="lb">Imagen</b><label class="lk">🔗 Enlace al pulsarla <input type="text" id="pj-lk" value="${esc(b.link)}" placeholder="https://… (vacío = sin enlace)"></label><button type="button" data-a="swap">Reemplazar imagen</button></div>` : ""}`;
  bar.querySelectorAll("[data-f]").forEach(x => { x.onmousedown = e => e.preventDefault(); x.onclick = () => fmt(x.dataset.f); });
  bar.querySelectorAll("[data-a]").forEach(x => x.onclick = () => act(x.dataset.a, p));
  const lk = $("#pj-lk"); if (lk) lk.oninput = () => { b.link = lk.value.trim(); touch(); const el = docEl.children[t.b.indexOf(b)]; if (el) el.classList.toggle("linked", !!b.link); };
}
const bottom = t => { let h = 0; t.b.forEach((b, i) => { const el = docEl && docEl.children[i]; h = Math.max(h, b.y + (el ? el.offsetHeight : 60)); }); return h; };
function addBlock(p, b) {
  const t = p.tabs[tabK]; endEdit(); if (b.y == null) b.y = t.b.length ? bottom(t) + 16 : 12;
  t.b.push(b); touch(); sel = null; showPane(p); select(b);
  const el = docEl && docEl.children[t.b.indexOf(b)]; if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function act(a, p) {
  const t = p.tabs[tabK];
  if (a === "save") { endEdit(); return save(p); }
  if (a === "proj") return editProject(p);
  if (a === "ren") { const r = await ask("Renombrar sección", [{ k: "n", l: "Nombre", v: t.t }]); if (r && r.n.trim()) { t.t = r.n.trim(); touch(); drawWindow(p); } }
  else if (a === "tl" || a === "tr") { const j = tabK + (a === "tl" ? -1 : 1); [p.tabs[tabK], p.tabs[j]] = [p.tabs[j], p.tabs[tabK]]; tabK = j; touch(); drawWindow(p); }
  else if (a === "tdel") { if (confirm(`¿Quitar la sección "${t.t}" y todo su contenido?`)) { p.tabs.splice(tabK, 1); touch(); sel = null; drawWindow(p); } }
  else if (a === "addt") addBlock(p, { k: "t", x: 4, w: 60, md: "Escribe aquí…" });
  else if (a === "addi") pickImage().then(ref => ref && addBlock(p, { k: "i", x: 4, w: 40, src: ref, link: "" }));
  else if (a === "addu") { const r = await ask("Imagen por URL", [{ k: "u", l: "Dirección de la imagen (https://…)", v: "https://" }]); if (r && /^https?:\/\//i.test(r.u.trim())) addBlock(p, { k: "i", x: 4, w: 40, src: r.u.trim(), link: "" }); }
  else if (a === "swap" && sel && sel.k === "i") { const ref = await pickImage(); if (ref) { sel.src = ref; touch(); const el = docEl.children[t.b.indexOf(sel)]; if (el) { el.innerHTML = ""; paint(el); } } }
  else if (a === "front" && sel) { const s = sel, i = t.b.indexOf(s); endEdit(); t.b.push(...t.b.splice(i, 1)); touch(); sel = null; showPane(p); select(s); }
  else if (a === "dup" && sel) { const c = { ...sel, x: Math.min(sel.x + 3, 100 - sel.w), y: sel.y + 24 }; addBlock(p, c); }
  else if (a === "del" && sel) { endEdit(); const i = t.b.indexOf(sel); t.b.splice(i, 1); sel = null; touch(); showPane(p); }
}

/* ---------- Diálogo pequeño de texto ---------- */
function ask(title, fields) {
  return new Promise(res => {
    const w = document.createElement("div"); w.className = "pj-ask";
    w.innerHTML = `<form class="box"><h4>${esc(title)}</h4>${fields.map(f => `<label>${esc(f.l)}<input name="${f.k}" type="text" value="${esc(f.v || "")}" autocomplete="off"></label>`).join("")}<div class="bt"><button type="button" data-x>Cancelar</button><button class="go" type="submit">Aceptar</button></div></form>`;
    document.body.append(w); const f = w.querySelector("form"), first = f.querySelector("input"); first.focus(); first.select();
    const done = v => { w.remove(); res(v); };
    f.onsubmit = e => { e.preventDefault(); const o = {}; fields.forEach(x => o[x.k] = f.elements[x.k].value); done(o); };
    w.querySelector("[data-x]").onclick = () => done(null);
    w.addEventListener("pointerdown", e => { if (e.target === w) done(null); });
    w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") done(null); });
  });
}

/* ---------- Imágenes: se reducen en el navegador y se guardan en "project_media" ---------- */
function pickImage(opts = {}) {
  return new Promise(res => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return res(null);
      try { res(await uploadImage(f, opts)); } catch (e) { console.warn(e); alert("No se pudo subir la imagen" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"); res(null); }
    };
    inp.click();
  });
}
async function uploadImage(file, { max = 1600 } = {}) {
  const h = H(); if (!h) throw new Error("sin conexión");
  const bmp = await createImageBitmap(file); let sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), data = "";
  for (let n = 0; n < 6; n++) {
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
    const g = c.getContext("2d"); g.drawImage(bmp, 0, 0, c.width, c.height);
    const png = /png|gif|webp/.test(file.type); data = png ? c.toDataURL("image/webp", .86) : c.toDataURL("image/jpeg", .86);
    if (!data.startsWith("data:image/webp") && !data.startsWith("data:image/jpeg")) data = c.toDataURL("image/jpeg", .86);
    if (data.length < 780000) break; sc *= .8;
  }
  const id = "m" + Date.now().toString(36) + uid();
  await h.fb.setDoc(h.fb.doc(h.db, "project_media", id), { d: data }); media.set(id, data);
  return "m:" + id;
}

/* ---------- Guardar / cargar ---------- */
const slug = s => (s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto").slice(0, 30);
const toDoc = (p, order) => ({ name: p.name.slice(0, 60), status: (p.status || "").slice(0, 80), img: p.imgRef || "", acc: p.acc, wbg: p.wbg, soon: !!p.soon, start: p.start || "", end: p.end || "", order, tabs: p.tabs.map(t => ({ t: t.t.slice(0, 40), b: t.b.map(b => b.k === "t" ? { k: "t", x: b.x, y: b.y, w: b.w, md: b.md.slice(0, 20000) } : { k: "i", x: b.x, y: b.y, w: b.w, src: b.src, link: b.link || "" }) })) });
async function writeProject(p, order = PROYECTOS.indexOf(p)) {
  const h = H(); await h.fb.setDoc(h.fb.doc(h.db, "projects", p.id), toDoc(p, order)); p.order = order;
}
async function save(p) {
  const btn = $("#pj-save"); if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }
  try { await writeProject(p); dirty = false; publish(); const f = $("#pj-ds"); if (f) f.textContent = "✓ Guardado"; if (btn) { btn.textContent = "💾 Guardar"; btn.classList.remove("hot"); } }
  catch (e) { console.warn(e); alert("No se pudo guardar" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore? Si el contenido es muy grande (más de 1 MB en total), usa imágenes por URL en vez de subirlas."); if (btn) { btn.disabled = false; btn.textContent = "💾 Guardar"; } }
}
async function loadRemote() {
  const h = H(); if (!h) return;
  try {
    const snap = await h.fb.getDocs(h.fb.collection(h.db, "projects"));
    if (snap.empty) { remote = false; return; }
    const list = []; snap.forEach(d => { const x = d.data(); list.push(norm({ id: d.id, ...x, img: "", imgRef: x.img }, x.order || 0)); });
    list.sort((a, b) => a.order - b.order); remote = true;
    await Promise.all(list.map(async p => { p.img = await srcOf(p.imgRef) || "proyectos/proximamente.jpg"; }));
    PROYECTOS.splice(0, PROYECTOS.length, ...list);
  } catch (e) { console.warn("proyectos:", e); }
}
async function reload() {
  const id = openId; await loadRemote(); const keep = Math.round(target); build(); target = pos = clamp(keep, 0, Math.max(0, N - 1)); layout(); sync(); publish(); homeBtn();
  dirty = false;
  if (id && !modal.hidden) { const p = PROYECTOS.find(x => x.id === id); if (p) drawWindow(p); else { openId = null; sec.classList.remove("open"); modal.hidden = true; modal.innerHTML = ""; } }
}
/* ---------- Botón "Proyecto activo" de la portada (se edita aparte: config/home) y color del scroll (config/theme) ---------- */
let HOME = null;
const SB_DEF = "#f7b41e";
const setSb = c => document.documentElement.style.setProperty("--sb", HEX.test(c) ? c : SB_DEF);
async function loadHome() {
  const h = H(); if (!h) return;
  try { const s = await h.fb.getDoc(h.fb.doc(h.db, "config", "home")); HOME = s.exists() ? s.data() : null; } catch (e) { HOME = null; }
  try { const s = await h.fb.getDoc(h.fb.doc(h.db, "config", "theme")); if (s.exists()) setSb(s.data().sb); } catch (e) {}
}
async function homeBtn() {
  const a = document.querySelector("a.btn.proj"); if (!a) return;
  const p = PROYECTOS.find(x => !x.soon), c = HOME || {};
  const href = c.href || (p ? "#proyectos/" + p.id : "#proyectos");
  a.setAttribute("href", href); const ext = /^https?:\/\//i.test(href);
  if (ext) { a.target = "_blank"; a.rel = "noopener noreferrer"; } else { a.removeAttribute("target"); a.removeAttribute("rel"); }
  a.dataset.shape = c.shape === "oval" || c.shape === "rect" ? c.shape : "orig";
  const im = a.querySelector("img"); const src = c.img ? await srcOf(c.img) : null;
  if (im && src) im.src = src;
  const sp = a.querySelector("span:not(.hb-edit)"); if (sp) sp.innerHTML = `${esc(c.status || "Proyecto activo")}<b>${esc(c.name || (p ? p.name : "Proyectos"))}</b>`;
  let ed = a.querySelector(".hb-edit");
  if (isAdmin()) {
    if (!ed) { ed = document.createElement("span"); ed.className = "hb-edit"; ed.title = "Editar este botón"; ed.setAttribute("role", "button"); ed.textContent = "✎"; ed.onclick = e => { e.preventDefault(); e.stopPropagation(); editHome(); }; a.append(ed); }
  } else if (ed) ed.remove();
}
function editHome() {
  const c = HOME || {}, p = PROYECTOS.find(x => !x.soon);
  const d = { name: c.name ?? (p ? p.name : ""), status: c.status ?? "Proyecto activo", href: c.href ?? (p ? "#proyectos/" + p.id : "#proyectos"), img: c.img ?? "hardhood-cataclysm.png", shape: c.shape || "orig" };
  const w = document.createElement("div"); w.className = "pj-ask big";
  w.innerHTML = `<form class="box"><h4>Botón “Proyecto activo” (portada)</h4>
    <div class="fg">
      <label>Texto pequeño (estado)<input name="status" maxlength="60" value="${esc(d.status)}"></label>
      <label>Título<input name="name" maxlength="60" value="${esc(d.name)}"></label>
      <label class="full">A dónde lleva (proyecto, página o enlace https://…)<input name="href" list="pj-dl" maxlength="300" value="${esc(d.href)}"></label>
      <datalist id="pj-dl">${PROYECTOS.filter(x => !x.soon).map(x => `<option value="#proyectos/${esc(x.id)}">${esc(x.name)}</option>`).join("")}<option value="#proyectos">Lista de proyectos</option><option value="#calendario"></option><option value="#comunidad"></option></datalist>
      <label>Forma de la imagen<select name="shape"><option value="orig">Original (sin recortar)</option><option value="rect">Rectangular</option><option value="oval">Ovalada</option></select></label>
      <label>Color de la barra de scroll (toda la web)<span class="cl"><input name="sb" type="color" value="${HEX.test(getComputedStyle(document.documentElement).getPropertyValue("--sb").trim()) ? getComputedStyle(document.documentElement).getPropertyValue("--sb").trim() : SB_DEF}"></span></label>
    </div>
    <div class="cv"><div class="pv hp" id="pj-pv"><img alt=""></div>
      <div class="cb"><button type="button" data-up>Subir imagen…</button><label>o ruta / URL<input name="img" value="${esc(String(d.img).startsWith("m:") ? "" : d.img)}" placeholder="https://… o hardhood-cataclysm.png"></label></div></div>
    <p class="er" id="pj-er" role="alert"></p>
    <div class="bt"><button type="button" data-reset class="dg">Restablecer</button><span style="flex:1"></span><button type="button" data-x>Cancelar</button><button class="go" type="submit">Guardar</button></div></form>`;
  document.body.append(w); const f = w.querySelector("form"), pv = w.querySelector("#pj-pv"), er = w.querySelector("#pj-er");
  f.elements.shape.value = d.shape; let ref = d.img;
  const showPv = async () => { pv.querySelector("img").src = await srcOf(ref) || ""; pv.dataset.shape = f.elements.shape.value; };
  showPv(); f.elements.shape.onchange = showPv;
  f.elements.sb.oninput = () => setSb(f.elements.sb.value);
  f.elements.img.oninput = () => { ref = f.elements.img.value.trim(); showPv(); };
  w.querySelector("[data-up]").onclick = async () => { const r = await pickImage({ max: 600 }); if (r) { ref = r; f.elements.img.value = ""; showPv(); } };
  const done = () => w.remove();
  w.querySelector("[data-x]").onclick = done; w.addEventListener("pointerdown", e => { if (e.target === w) done(); }); w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") done(); });
  w.querySelector("[data-reset]").onclick = async () => { if (!confirm("¿Volver al botón automático (primer proyecto activo)?")) return; try { const h = H(); await h.fb.deleteDoc(h.fb.doc(h.db, "config", "home")); HOME = null; } catch (e) { er.textContent = "No se pudo restablecer."; return; } done(); homeBtn(); };
  f.onsubmit = async e => {
    e.preventDefault();
    const href = f.elements.href.value.trim();
    if (href && !/^(#[\w\-\/]*|https?:\/\/\S+)$/i.test(href)) { er.textContent = "El destino debe empezar por # (sección de la web) o https://"; return; }
    if (ref && !/^(m:|https?:\/\/|proyectos\/|galeria\/|img\/|[\w\-]+\.(png|jpe?g|webp|gif)$)/i.test(ref)) { er.textContent = "La imagen debe ser una subida, una URL https o una ruta del sitio."; return; }
    const doc = { name: f.elements.name.value.trim().slice(0, 60), status: f.elements.status.value.trim().slice(0, 60), href: href.slice(0, 300), img: ref.slice(0, 300), shape: f.elements.shape.value };
    try { const h = H(); await h.fb.setDoc(h.fb.doc(h.db, "config", "home"), doc); await h.fb.setDoc(h.fb.doc(h.db, "config", "theme"), { sb: f.elements.sb.value }); } catch (e2) { console.warn(e2); er.textContent = "No se pudo guardar (" + (e2.code || e2.message) + "). ¿Publicaste las reglas?"; return; }
    HOME = doc; setSb(f.elements.sb.value); done(); homeBtn();
  };
}

/* ---------- Modo editor: barra del carrusel y ficha del proyecto ---------- */
const tg = document.createElement("button"); tg.type = "button"; tg.className = "pj-etoggle"; tg.hidden = true; tg.textContent = "✎ Modo editor"; sec.append(tg);
const eb = document.createElement("div"); eb.className = "pj-ebar"; eb.hidden = true; sec.append(eb);
function updBar() {
  const p = PROYECTOS[cur()];
  eb.innerHTML = `<b class="lb">${p ? esc(p.name) : "Sin proyectos"}</b>
    <button type="button" data-a="edit" ${p ? "" : "disabled"}>✎ Editar ficha</button><button type="button" data-a="open" ${p && !p.soon ? "" : "disabled"}>📄 Editar contenido</button>
    <span class="sep"></span><button type="button" data-a="new">＋ Nuevo proyecto</button><button type="button" data-a="ml" ${p && cur() > 0 ? "" : "disabled"}>◀ Mover</button><button type="button" data-a="mr" ${p && cur() < N - 1 ? "" : "disabled"}>Mover ▶</button><button type="button" data-a="del" class="dg" ${p ? "" : "disabled"}>🗑 Eliminar</button><span class="sep"></span><label class="sbc" title="Color de la barra de scroll de toda la web">🎨 Scroll <input type="color" id="pj-sb" value="${HEX.test(getComputedStyle(document.documentElement).getPropertyValue("--sb").trim()) ? getComputedStyle(document.documentElement).getPropertyValue("--sb").trim() : SB_DEF}"></label>`;
  const sbi = $("#pj-sb"); if (sbi) { sbi.oninput = () => setSb(sbi.value); sbi.onchange = async () => { try { const h = H(); await h.fb.setDoc(h.fb.doc(h.db, "config", "theme"), { sb: sbi.value }); } catch (e) { alert("No se pudo guardar el color."); } }; }
  eb.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
    const a = b.dataset.a, p2 = PROYECTOS[cur()];
    if (a === "edit") editProject(p2); else if (a === "open") open(cur()); else if (a === "new") editProject(null);
    else if (a === "ml" || a === "mr") { const i = cur(), j = i + (a === "ml" ? -1 : 1); [PROYECTOS[i], PROYECTOS[j]] = [PROYECTOS[j], PROYECTOS[i]]; try { await Promise.all([writeProject(PROYECTOS[i], i), writeProject(PROYECTOS[j], j)]); } catch (e) { alert("No se pudo guardar el orden."); } build(); target = pos = j; layout(); sync(); publish(); homeBtn(); }
    else if (a === "del" && p2 && confirm(`¿Eliminar el proyecto "${p2.name}" para siempre?`)) { try { const h = H(); await h.fb.deleteDoc(h.fb.doc(h.db, "projects", p2.id)); } catch (e) { alert("No se pudo eliminar."); return; } const k = Math.max(0, cur() - 1); PROYECTOS.splice(cur(), 1); build(); target = pos = Math.min(k, Math.max(0, N - 1)); layout(); sync(); publish(); homeBtn(); }
  });
}
async function setEditing(on) {
  if (on) {
    const h = H(); if (!h) return;
    if (!remote) {                                                    // primera vez: importar los proyectos de ejemplo para poder editarlos
      if (!confirm("Para editar, voy a guardar tus proyectos actuales (HardHood, Zombies Survival…) en la base de datos. ¿Continuar?")) return;
      try { for (let i = 0; i < PROYECTOS.length; i++) await writeProject(PROYECTOS[i], i); remote = true; } catch (e) { console.warn(e); alert("No se pudo importar (" + (e.code || e.message) + "). Publica las reglas nuevas de Firestore."); return; }
    }
  } else if (dirty && !confirm("Tienes cambios sin guardar. ¿Salir del editor y descartarlos?")) return;
  if (!on) { dirty = false; if (openId) close(); }
  editing = on; sec.classList.toggle("editing", on); eb.hidden = !on; tg.textContent = on ? "✓ Salir del editor" : "✎ Modo editor";
  if (on) updBar();
}
tg.onclick = () => setEditing(!editing);
const authSync = () => { homeBtn(); const a = isAdmin(); tg.hidden = !a; if (!a && editing) { dirty = false; setEditing(false); } };

function editProject(p) {
  const isNew = !p, d = p ? { ...p } : { id: "", name: "Nuevo proyecto", status: "En desarrollo", imgRef: "proyectos/proximamente.jpg", img: "proyectos/proximamente.jpg", acc: "#ff8a1f", wbg: "#120a04", soon: false, start: "", end: "", tabs: [{ t: "Información", b: [{ k: "t", x: 4, y: 12, w: 92, md: "# Nuevo proyecto" }] }] };
  const w = document.createElement("div"); w.className = "pj-ask big";
  w.innerHTML = `<form class="box"><h4>${isNew ? "Nuevo proyecto" : "Ficha de " + esc(p.name)}</h4>
    <div class="fg">
      <label>Nombre<input name="name" maxlength="60" value="${esc(d.name)}" required></label>
      <label>Estado (escribe lo que quieras)<input name="status" maxlength="80" value="${esc(d.status)}" placeholder="En desarrollo, Proyecto activo, Temporada 2…"></label>
      <label>Color del borde<span class="cl"><input name="acc" type="color" value="${d.acc}"><input name="acch" maxlength="7" value="${d.acc}"></span></label>
      <label>Color de fondo de la ventana<span class="cl"><input name="wbg" type="color" value="${d.wbg}"><input name="wbgh" maxlength="7" value="${d.wbg}"></span></label>
      <label>Inicio (calendario)<input name="start" type="date" value="${esc(d.start)}"></label>
      <label>Fin (calendario)<input name="end" type="date" value="${esc(d.end)}"></label>
      <label class="chk full"><input name="soon" type="checkbox" ${d.soon ? "checked" : ""}> Sin ventana: tarjeta “Próximamente” (no se puede abrir)</label>
    </div>
    <div class="cv"><div class="pv" id="pj-pv"><img alt=""></div>
      <div class="cb"><button type="button" data-up>Subir imagen…</button><label>o ruta / URL<input name="img" value="${esc(d.imgRef.startsWith("m:") ? "" : d.imgRef)}" placeholder="https://… o proyectos/mi-imagen.jpg"></label><small>Recomendado 16:9 (ej. 1280×720).</small></div></div>
    <p class="er" id="pj-er" role="alert"></p>
    <div class="bt"><button type="button" data-x>Cancelar</button><button class="go" type="submit">Guardar</button></div></form>`;
  document.body.append(w); const f = w.querySelector("form"), pv = w.querySelector("#pj-pv img"), er = w.querySelector("#pj-er");
  let ref = d.imgRef; const showPv = async () => { pv.src = await srcOf(ref) || ""; }; showPv();
  const link = (c, h2) => { f.elements[c].oninput = () => { f.elements[h2].value = f.elements[c].value; }; f.elements[h2].oninput = () => { if (HEX.test(f.elements[h2].value)) f.elements[c].value = f.elements[h2].value; }; };
  link("acc", "acch"); link("wbg", "wbgh");
  f.elements.img.oninput = () => { ref = f.elements.img.value.trim(); showPv(); };
  w.querySelector("[data-up]").onclick = async () => { const r = await pickImage({ max: 1600 }); if (r) { ref = r; f.elements.img.value = ""; showPv(); } };
  const done = () => w.remove();
  w.querySelector("[data-x]").onclick = done; w.addEventListener("pointerdown", e => { if (e.target === w) done(); }); w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") done(); });
  f.onsubmit = async e => {
    e.preventDefault(); const g = n => f.elements[n];
    if (!HEX.test(g("acch").value) || !HEX.test(g("wbgh").value)) { er.textContent = "Los colores deben ser tipo #ff8a1f."; return; }
    if (ref && !/^(m:|https?:\/\/|proyectos\/|galeria\/|img\/)/i.test(ref)) { er.textContent = "La imagen debe ser una subida, una URL https o una ruta del sitio."; return; }
    const upd = { name: g("name").value.trim() || "Proyecto", status: g("status").value.trim(), acc: g("acch").value, wbg: g("wbgh").value, start: g("start").value, end: g("end").value, soon: g("soon").checked, imgRef: ref };
    const q = isNew ? norm({ ...d, ...upd, id: slug(upd.name) + "-" + uid(), tabs: d.tabs }, PROYECTOS.length) : Object.assign(p, upd);
    q.img = await srcOf(q.imgRef) || "proyectos/proximamente.jpg";
    try { await writeProject(q, isNew ? PROYECTOS.length : PROYECTOS.indexOf(q)); } catch (e2) { console.warn(e2); er.textContent = "No se pudo guardar (" + (e2.code || e2.message) + "). ¿Publicaste las reglas?"; return; }
    if (isNew) PROYECTOS.push(q);
    const k = PROYECTOS.indexOf(q); done(); build(); target = pos = k; layout(); sync(); publish(); homeBtn();
    if (openId === q.id) drawWindow(q);
  };
  w.querySelector("input[name=name]").focus();
}

/* ---------- Teclado y rueda ---------- */
addEventListener("keydown", e => {
  if (sec.hidden || (document.getElementById("modal") || {}).hidden === false) return;
  if (editing && e.key.toLowerCase() === "s" && (e.ctrlKey || e.metaKey) && openId) { e.preventDefault(); endEdit(); save(projOpen()); return; }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || document.querySelector(".pj-ask")) return;
  if (openId) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (!editing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const p = projOpen(), n = clamp(tabK + (e.key === "ArrowRight" ? 1 : -1), 0, p.tabs.length - 1); if (n !== tabK) { tabK = n; drawWindow(p); } e.preventDefault();
    } else if (editing && sel && e.key === "Delete") { act("del", projOpen()); }
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
[sec, modal].forEach(el => el.addEventListener("scroll", () => { if (el.scrollLeft) el.scrollLeft = 0; }));
modal.addEventListener("click", e => { const s = e.target.closest(".sp"); if (s) s.classList.toggle("on"); });

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

new MutationObserver(() => {
  if (sec.hidden) { if (openId) { openId = null; sec.classList.remove("open"); modal.hidden = true; modal.innerHTML = ""; } return; }
  stage.classList.remove("enter"); void stage.offsetWidth; stage.classList.add("enter");
  applyHash();
}).observe(sec, { attributes: true, attributeFilter: ["hidden"] });

build(); applyHash();
let wired = false;
async function wire() {
  if (wired || !H()) return; wired = true;
  H().auth.onAuthStateChanged(authSync); authSync();
  await Promise.all([loadRemote(), loadHome()]); const keep = Math.round(target); build(); target = pos = clamp(keep, 0, Math.max(0, N - 1)); layout(); sync(); publish(); homeBtn(); applyHash();
}
wire(); addEventListener("hood-ready", wire);
