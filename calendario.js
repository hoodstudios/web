/* calendario.js — Módulo Calendario.
 *
 * EVENTOS: viven en Firestore, colección "events". Cada documento: { name, date: "AAAA-MM-DD", start: "HH:MM", end: "HH:MM" | "", color: "#rrggbb" }.
 *   Las horas se escriben en HORA DE PERÚ (BASE_OFFSET) y de ahí se convierten a los demás países.
 *
 * ADMIN: la cuenta HOODSTUDIO (correo interno hoodstudio@hoodstudio.app, ver ADMIN_EMAILS). Para que Firestore le deje escribir,
 *   pega estas reglas en Firebase > Firestore Database > Reglas (junto a las que ya tienes):
 *
 *   match /events/{id} {
 *     allow read: if true;
 *     allow write: if request.auth != null && request.auth.token.email == "hoodstudio@hoodstudio.app";
 *   }
 *
 * PROYECTOS: las fechas de inicio/fin salen de la lista PROYECTOS de proyectos.js (campos start y end).
 */
import { getApps, getApp, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, addDoc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { PROYECTOS } from "./proyectos.js";

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
const BASE_OFFSET = 6, BASE_LABEL = "hora de CDMX";              // México (CDMX) = UTC−6, sin horario de verano: es la hora por defecto de los eventos
const ADMIN_EMAILS = ["hoodstudio@hoodstudio.app"];             // cuentas que pueden añadir/quitar eventos (el correo interno es nombre@hoodstudio.app)
const PAISES = [                                                 // países que se muestran en la carta de la izquierda
  { n: "México (CDMX)", tz: "America/Mexico_City", def: true },
  { n: "Perú", tz: "America/Lima" },
  { n: "Colombia", tz: "America/Bogota" },
  { n: "Chile", tz: "America/Santiago" },
  { n: "Argentina", tz: "America/Argentina/Buenos_Aires" },
  { n: "España", tz: "Europe/Madrid" }
];
const COLORES = ["#5ec8ff", "#ff6fa5", "#8ef06b", "#c79bff", "#ff6b5a", "#ffe14a"];
const DEMO_SI_FALLA = true;   // si Firestore no responde (reglas sin configurar), muestra eventos de ejemplo. Ponlo en false al publicar.

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const parse = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const okColor = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c : COLORES[0];
const F = {
  mes: new Intl.DateTimeFormat("es", { month: "long" }),
  largo: new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
  corto: new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short" }),
  diaMes: new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }),
  fecha: new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" })
};
const hora = tz => new Intl.DateTimeFormat("es", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const diaTz = tz => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const instante = (date, time) => { const [y, m, d] = date.split("-").map(Number), [H, M] = time.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, H + BASE_OFFSET, M)); };
const diaNum = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const rango = e => e.start + (e.end ? " – " + e.end : "");

/* ---------- Estado ---------- */
const sec = $("#v-calendario"), grid = $("#cal-grid"), tip = $("#cal-tip"), calEl = $(".cal"), edHost = $("#cal-ed");
const left = $("#cal-left"), right = $("#cal-right"), leftIn = $("#cal-left-in"), rightIn = $("#cal-right-in");
let events = [], isAdmin = false;
let editing = null, chosen = COLORES[0], editDate = "";
let now = new Date(), view = { y: now.getFullYear(), m: now.getMonth() };
const todayKey = () => { now = new Date(); return ymd(now.getFullYear(), now.getMonth(), now.getDate()); };
const byDate = k => events.filter(e => e.date === k).sort((a, b) => a.start.localeCompare(b.start));

/* ---------- Calendario ---------- */
function render(dir = 0) {
  const t = todayKey();
  $("#cal-month").textContent = cap(F.mes.format(new Date(view.y, view.m, 1))) + " " + view.y;
  $("#cal-today").textContent = cap(F.largo.format(now));
  const off = (new Date(view.y, view.m, 1).getDay() + 6) % 7;     // la semana empieza en lunes
  let html = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(view.y, view.m, 1 - off + i), k = ymd(d.getFullYear(), d.getMonth(), d.getDate());
    const evs = byDate(k), other = d.getMonth() !== view.m;
    const label = F.diaMes.format(d) + (evs.length ? ". " + evs.map(e => e.name + " " + rango(e)).join(", ") : "");
    html += `<button type="button" class="d${other ? " o" : ""}${k === t ? " today" : ""}${evs.length ? " has" : ""}" data-d="${k}" aria-label="${esc(label)}"${k === t ? ' aria-current="date"' : ""}><span>${d.getDate()}</span>`
      + (evs.length ? `<span class="bars" aria-hidden="true">${evs.slice(0, 3).map(e => `<i style="--c:${okColor(e.color)}"></i>`).join("")}</span>` : "") + `</button>`;
  }
  grid.innerHTML = html;
  if (dir) { grid.style.setProperty("--dx", dir * 12 + "px"); grid.classList.remove("swap"); void grid.offsetWidth; grid.classList.add("swap"); }
  hideTip();
}
const goMonth = n => { const d = new Date(view.y, view.m + n, 1); view = { y: d.getFullYear(), m: d.getMonth() }; render(n > 0 ? 1 : -1); };
$("#cal-prev").onclick = () => goMonth(-1);
$("#cal-next").onclick = () => goMonth(1);
const volverHoy = () => { const n = new Date(); const dir = (n.getFullYear() * 12 + n.getMonth()) - (view.y * 12 + view.m); view = { y: n.getFullYear(), m: n.getMonth() }; render(Math.sign(dir)); };
$("#cal-title").onclick = $("#cal-today").onclick = volverHoy;

/* ---------- Mensaje emergente: aparece debajo del calendario ---------- */
let tipTimer = 0;
function hideTip() {
  clearTimeout(tipTimer);
  if (isAdmin) { tip.className = "cal-tip hint on"; tip.textContent = "Modo Admin: haz clic en un día para añadir o editar eventos."; }
  else { tip.className = "cal-tip"; }
}
function showTip(k) {
  const evs = byDate(k);
  if (!evs.length) return hideTip();
  clearTimeout(tipTimer);
  tip.className = "cal-tip on";
  tip.innerHTML = evs.slice(0, 2).map(e => `<div class="ev" style="--c:${okColor(e.color)}"><span class="bar"></span><div class="row"><b>${esc(e.name)}</b><span class="t">${esc(rango(e))} · ${BASE_LABEL}</span></div></div>`).join("")
    + (evs.length > 2 ? `<div class="more">+${evs.length - 2} más ese día</div>` : "");
}
grid.addEventListener("pointerover", e => { const b = e.target.closest(".d"); if (b) showTip(b.dataset.d); });
grid.addEventListener("pointerleave", () => { tipTimer = setTimeout(hideTip, 120); });
grid.addEventListener("focusin", e => { const b = e.target.closest(".d"); if (b) showTip(b.dataset.d); });
grid.addEventListener("focusout", () => { tipTimer = setTimeout(hideTip, 120); });
grid.addEventListener("click", e => {
  const b = e.target.closest(".d"); if (!b) return;
  if (isAdmin) openEditor(b.dataset.d); else showTip(b.dataset.d);   // en pantallas táctiles, tocar el día muestra el evento
});

/* ---------- Carta izquierda: horario del evento próximo ---------- */
function proximoEvento() {
  const t = todayKey(), ahora = Date.now();
  return events.filter(e => e.date >= t && (e.date > t || +(e.end ? instante(e.date, e.end) : new Date(+instante(e.date, e.start) + 3 * 36e5)) >= ahora))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] || null;
}
function renderLeft() {
  const e = proximoEvento();
  let html = `<h3 class="cs-title">Horario para Evento próximo</h3>`;
  if (!e) html += `<p class="cs-empty">Todavía no hay eventos programados.</p>`;
  else {
    const ini = instante(e.date, e.start), fin = e.end ? instante(e.date, e.end) : null;
    html += `<div class="cs-ev"><b>${esc(e.name)}</b><span>${esc(cap(F.corto.format(parse(e.date))))} · ${esc(rango(e))} ${BASE_LABEL}</span></div><ul class="cs-tz">`
      + PAISES.map(p => {
        const dd = diaNum(diaTz(p.tz).format(ini)) - diaNum(e.date);
        const h = hora(p.tz).format(ini) + (fin ? " – " + hora(p.tz).format(fin) : "");
        return `<li${p.def ? ' class="def"' : ""}><span>${p.n}</span><b>${h}${dd ? `<small>${dd > 0 ? "+" : "−"}${Math.abs(dd)} día</small>` : ""}</b></li>`;
      }).join("") + `</ul>`;
  }
  leftIn.innerHTML = html;
}

/* ---------- Carta derecha: proyecto actual o más cercano ---------- */
function proyectoCercano() {
  const t = todayKey();
  const con = PROYECTOS.filter(p => p.start && p.end && !p.soon);
  const actual = con.filter(p => p.start <= t && t <= p.end).sort((a, b) => a.end.localeCompare(b.end))[0];
  if (actual) return { p: actual, actual: true };
  const prox = con.filter(p => p.start > t).sort((a, b) => a.start.localeCompare(b.start))[0];
  return prox ? { p: prox, actual: false } : null;
}
function renderRight() {
  const r = proyectoCercano();
  if (!r) { rightIn.innerHTML = `<h3 class="cs-title">Proyecto Próximo</h3><p class="cs-empty">Todavía no hay proyectos programados.</p>`; return; }
  const { p } = r;
  rightIn.innerHTML = `<h3 class="cs-title">${r.actual ? "Proyecto Actual" : "Proyecto Próximo"}</h3>
    <a class="cs-proj" href="#proyectos/${encodeURIComponent(p.id)}" style="--acc:${esc(p.acc)}" aria-label="Abrir ${esc(p.name)} en Proyectos">
      <img src="${esc(p.img)}" alt="" draggable="false"><span class="lbl"><b class="nm">${esc(p.name)}</b><span class="st">${esc(p.status)}</span></span></a>
    <dl class="cs-dates"><div><dt>Inicio</dt><dd>${esc(F.fecha.format(parse(p.start)))}</dd></div><div><dt>Fin</dt><dd>${esc(F.fecha.format(parse(p.end)))}</dd></div></dl>`;
}

/* En pantallas táctiles las cartas se abren con un toque y se cierran tocando fuera */
for (const c of [left, right]) c.addEventListener("click", e => { if (e.target.closest("a")) return; const was = c.classList.contains("open"); left.classList.remove("open"); right.classList.remove("open"); if (!was) c.classList.add("open"); });
addEventListener("pointerdown", e => { if (!e.target.closest(".cal-side")) { left.classList.remove("open"); right.classList.remove("open"); } });
for (const c of [left, right]) c.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { left.classList.remove("open"); right.classList.remove("open"); } });

/* ---------- Carga de eventos ---------- */
function demo() {
  const base = new Date(); const f = n => { const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + n); return ymd(d.getFullYear(), d.getMonth(), d.getDate()); };
  return [
    { id: "demo1", name: "Torneo de Parkour", date: f(3), start: "19:00", end: "21:00", color: COLORES[0] },
    { id: "demo2", name: "Noche de HardHood", date: f(3), start: "22:00", end: "23:30", color: COLORES[1] },
    { id: "demo3", name: "Directo del estudio", date: f(9), start: "18:30", end: "", color: COLORES[2] },
    { id: "demo4", name: "Apertura de The Borderland", date: f(16), start: "20:00", end: "22:00", color: COLORES[3] }
  ];
}
async function loadEvents() {
  try {
    const snap = await getDocs(collection(db, "events"));
    events = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e && e.name && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && /^\d{2}:\d{2}$/.test(e.start || ""));
  } catch (err) {
    console.warn("Calendario: no se pudieron leer los eventos de Firestore.", err);
    events = DEMO_SI_FALLA ? demo() : [];
  }
  refresh();
}
function refresh() { render(); renderLeft(); renderRight(); }

/* ---------- Admin ---------- */
onAuthStateChanged(auth, async user => {
  isAdmin = false;
  isAdmin = !!user && ADMIN_EMAILS.includes((user.email || "").toLowerCase());
  calEl.classList.toggle("admin", isAdmin);
  if (!isAdmin) closeEditor();
  hideTip();
});

function closeEditor() { edHost.hidden = true; edHost.innerHTML = ""; editing = null; }
function openEditor(k) { editDate = k; editing = null; chosen = COLORES[byDate(k).length % COLORES.length]; edHost.hidden = false; drawEditor(); edHost.querySelector("#ed-n").focus(); }
function drawEditor(msg = "") {
  const evs = byDate(editDate);
  edHost.innerHTML = `<div class="cal-ed box card" role="dialog" aria-modal="true" aria-label="Eventos del día">
    <button class="x" type="button" aria-label="Cerrar">×</button>
    <h3>${esc(cap(F.diaMes.format(parse(editDate))))}</h3>
    ${evs.length ? `<ul class="ed-list">${evs.map(e => `<li style="--c:${okColor(e.color)}"><span class="bar"></span><div class="txt"><b>${esc(e.name)}</b><small>${esc(rango(e))}</small></div><button class="btn" type="button" data-ed="${esc(e.id)}">Editar</button><button class="btn del" type="button" data-del="${esc(e.id)}">Borrar</button></li>`).join("")}</ul>` : `<p class="ed-empty">Este día no tiene eventos.</p>`}
    <form novalidate>
      <label for="ed-n">Nombre del evento</label>
      <input id="ed-n" maxlength="60" autocomplete="off" required value="${editing ? esc(editing.name) : ""}">
      <div class="ed-row">
        <div><label for="ed-s">Inicio</label><input id="ed-s" type="time" required value="${editing ? esc(editing.start) : ""}"></div>
        <div><label for="ed-e">Fin (opcional)</label><input id="ed-e" type="time" value="${editing ? esc(editing.end || "") : ""}"></div>
      </div>
      <div class="ed-sw" role="group" aria-label="Color de la raya">${COLORES.map(c => `<button type="button" style="--c:${c}" data-c="${c}" aria-label="Color ${c}" aria-pressed="${c === chosen}"></button>`).join("")}</div>
      <p class="muted small">Las horas se escriben en ${BASE_LABEL}.</p>
      <p class="err" id="ed-err" role="alert">${esc(msg)}</p>
      <button class="btn solid" type="submit">${editing ? "Guardar cambios" : "Añadir evento"}</button>
      ${editing ? `<button class="btn" type="button" id="ed-cancel">Cancelar edición</button>` : ""}
    </form></div>`;
}
edHost.addEventListener("click", async e => {
  if (e.target === edHost || e.target.closest(".x")) return closeEditor();
  const sw = e.target.closest("[data-c]");
  if (sw) { chosen = sw.dataset.c; edHost.querySelectorAll("[data-c]").forEach(b => b.setAttribute("aria-pressed", b === sw)); return; }
  const ed = e.target.closest("[data-ed]");
  if (ed) { editing = events.find(x => x.id === ed.dataset.ed) || null; if (editing) chosen = okColor(editing.color); drawEditor(); return edHost.querySelector("#ed-n").focus(); }
  if (e.target.closest("#ed-cancel")) { editing = null; chosen = COLORES[0]; return drawEditor(); }
  const del = e.target.closest("[data-del]");
  if (del) {
    const ev = events.find(x => x.id === del.dataset.del); if (!ev || !confirm(`¿Borrar «${ev.name}»?`)) return;
    try { await deleteDoc(doc(db, "events", ev.id)); } catch (err) { return drawEditor(errMsg(err)); }
    events = events.filter(x => x !== ev); if (editing === ev) editing = null;
    drawEditor(); refresh();
  }
});
edHost.addEventListener("submit", async e => {
  e.preventDefault();
  const name = edHost.querySelector("#ed-n").value.trim(), start = edHost.querySelector("#ed-s").value, end = edHost.querySelector("#ed-e").value;
  if (!name) return drawEditor("Escribe el nombre del evento.");
  if (!start) return drawEditor("Indica la hora de inicio.");
  if (end && end <= start) return drawEditor("La hora de fin debe ser posterior a la de inicio.");
  const data = { name, date: editDate, start, end: end || "", color: chosen };
  try {
    if (editing) { await setDoc(doc(db, "events", editing.id), data); Object.assign(editing, data); }
    else { const r = await addDoc(collection(db, "events"), data); events.push({ id: r.id, ...data }); }
  } catch (err) { return drawEditor(errMsg(err)); }
  editing = null; chosen = COLORES[0]; drawEditor(); refresh();
});
const errMsg = err => err && err.code === "permission-denied" ? "Firestore rechazó el cambio: revisa las reglas de Firestore para la cuenta Admin." : "No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.";
addEventListener("keydown", e => {
  if (sec.hidden) return;
  if (e.key === "Escape" && !edHost.hidden) { closeEditor(); return; }
  if (!edHost.hidden || (document.getElementById("modal") || {}).hidden === false || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.key === "ArrowLeft") { e.preventDefault(); goMonth(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); goMonth(1); }
});

/* ---------- Al entrar en la vista ---------- */
new MutationObserver(() => {
  if (sec.hidden) { closeEditor(); left.classList.remove("open"); right.classList.remove("open"); return; }
  refresh(); loadEvents();
}).observe(sec, { attributes: true, attributeFilter: ["hidden"] });

refresh();
if (!sec.hidden) loadEvents();
