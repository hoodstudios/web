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
const BASE_OFFSET = 6, BASE_LABEL = "hora de CDMX";              // México (CDMX) = UTC−6, sin horario de verano: es la hora en la que se escriben los eventos
const ADMIN_EMAILS = ["hoodstudio@hoodstudio.app"];             // cuentas que pueden añadir/quitar eventos (el correo interno es nombre@hoodstudio.app)
const PAISES = [                                                 // países del bloque "Horarios" (puedes añadir, quitar o reordenar)
  { c: "ES", n: "España", tz: "Europe/Madrid" },
  { c: "MX", n: "México", tz: "America/Mexico_City", def: true },
  { c: "CO", n: "Colombia", tz: "America/Bogota" },
  { c: "PE", n: "Perú", tz: "America/Lima" },
  { c: "CL", n: "Chile", tz: "America/Santiago" },
  { c: "AR", n: "Argentina", tz: "America/Argentina/Buenos_Aires" }
];
const COLORES = ["#5ec8ff", "#ff6fa5", "#8ef06b", "#c79bff", "#ff6b5a", "#ffe14a"];
const DEMO_SI_FALLA = true;   // si Firestore no responde (reglas sin configurar), muestra eventos de ejemplo. Ponlo en false al publicar.
const HR = 52;                // alto en px de cada hora en las vistas Día y Semana

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const dKey = d => ymd(d.getFullYear(), d.getMonth(), d.getDate());
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const parse = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const weekStart = d => addDays(d, -((d.getDay() + 6) % 7));       // la semana empieza en lunes
const okColor = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c : COLORES[0];
const mins = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const F = {
  mes: new Intl.DateTimeFormat("es", { month: "long" }),
  mesCorto: new Intl.DateTimeFormat("es", { month: "short" }),
  dia: new Intl.DateTimeFormat("es", { weekday: "long" }),
  diaCorto: new Intl.DateTimeFormat("es", { weekday: "short" }),
  diaMes: new Intl.DateTimeFormat("es", { day: "numeric", month: "long" }),
  corto: new Intl.DateTimeFormat("es", { weekday: "short", day: "numeric", month: "short" }),
  fecha: new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" })
};
const hora = tz => new Intl.DateTimeFormat("es", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const diaTz = tz => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
const instante = (date, time) => { const [y, m, d] = date.split("-").map(Number), [H, M] = time.split(":").map(Number); return new Date(Date.UTC(y, m - 1, d, H + BASE_OFFSET, M)); };
const diaNum = k => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const rango = e => e.start + (e.end ? " – " + e.end : "");

/* ---------- Estado ---------- */
const sec = $("#v-calendario"), body = $("#cal-body"), tip = $("#cal-tip"), edHost = $("#cal-ed"), bgEl = $("#cal-bg");
const leftIn = $("#cal-left-in"), rightIn = $("#cal-right-in");
let events = [], isAdmin = false;
let editing = null, chosen = COLORES[0], editDate = "", prefill = "";
let now = new Date(), mode = "month", anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const todayKey = () => { now = new Date(); return dKey(now); };
const byDate = k => events.filter(e => e.date === k).sort((a, b) => a.start.localeCompare(b.start));

/* ---------- Vistas: Mes / Semana / Día ---------- */
function titulo() {
  let a, b;
  if (mode === "month") { a = cap(F.mes.format(anchor)); b = anchor.getFullYear(); }
  else if (mode === "week") {
    const s = weekStart(anchor), e = addDays(s, 6);
    a = s.getMonth() === e.getMonth() ? `${s.getDate()} – ${e.getDate()} ${F.mesCorto.format(e).replace(".", "")}` : `${s.getDate()} ${F.mesCorto.format(s).replace(".", "")} – ${e.getDate()} ${F.mesCorto.format(e).replace(".", "")}`;
    b = e.getFullYear();
  } else { a = `${cap(F.dia.format(anchor))} ${anchor.getDate()}`; b = `${cap(F.mes.format(anchor))} ${anchor.getFullYear()}`; }
  $("#cal-t1").textContent = a; $("#cal-t2").textContent = b;
  document.querySelectorAll(".cseg [data-m]").forEach(x => x.setAttribute("aria-pressed", x.dataset.m === mode));
  $("#cal-prev").setAttribute("aria-label", { month: "Mes anterior", week: "Semana anterior", day: "Día anterior" }[mode]);
  $("#cal-next").setAttribute("aria-label", { month: "Mes siguiente", week: "Semana siguiente", day: "Día siguiente" }[mode]);
}
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
function renderMes(t) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7;
  let h = `<div class="mwk">${DIAS.map(d => `<span>${d}</span>`).join("")}</div><div class="mgrid">`;
  for (let i = 0; i < 42; i++) {
    const d = new Date(y, m, 1 - off + i), k = dKey(d), evs = byDate(k), other = d.getMonth() !== m, wk = i % 7 > 4;
    const pills = (evs.length > 2 ? evs.slice(0, 1) : evs).map(e => `<span class="pill" style="--c:${okColor(e.color)}" title="${esc(e.name + " · " + rango(e))}"><i></i><em>${esc(e.start)}</em><span class="pn">${esc(e.name)}</span></span>`).join("")
      + (evs.length > 2 ? `<span class="more">+${evs.length - 1} más</span>` : "");
    const label = F.diaMes.format(d) + (evs.length ? ". " + evs.map(e => e.name + " " + rango(e)).join(", ") : "");
    h += `<div class="d${other ? " o" : ""}${wk ? " wk" : ""}${k === t ? " today" : ""}" data-d="${k}" role="button" tabindex="0" aria-label="${esc(label)}"${k === t ? ' aria-current="date"' : ""}><button type="button" class="n" data-day="${k}" tabindex="-1" aria-hidden="true">${d.getDate()}</button><div class="dpl">${pills}</div></div>`;
  }
  body.className = "cal-body m"; body.innerHTML = h + "</div>";
}
function lanes(evs) {                                             // reparte los eventos que se solapan en columnas
  const list = evs.map(e => { const s = mins(e.start); return { e, s, f: Math.max(e.end ? mins(e.end) : s + 60, s + 30) }; }).sort((a, b) => a.s - b.s || b.f - a.f), out = [];
  let grp = [], fin = -1;
  const flush = () => { const n = Math.max(1, ...grp.map(x => x.l + 1)); grp.forEach(x => { x.n = n; out.push(x); }); grp = []; };
  for (const it of list) {
    if (grp.length && it.s >= fin) { flush(); fin = -1; }
    const used = grp.filter(x => x.f > it.s).map(x => x.l); let l = 0; while (used.includes(l)) l++;
    it.l = l; grp.push(it); fin = Math.max(fin, it.f);
  }
  if (grp.length) flush();
  return out;
}
function renderHoras(t) {
  const n = mode === "week" ? 7 : 1, start = mode === "week" ? weekStart(anchor) : anchor, days = Array.from({ length: n }, (_, i) => addDays(start, i));
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let head = `<div class="tg-h"><span class="tz">CDMX</span>`, cols = `<div class="tg-g">` + Array.from({ length: 24 }, (_, i) => i ? `<span style="top:${i * HR}px">${pad(i)}:00</span>` : "").join("") + `</div>`;
  for (const d of days) {
    const k = dKey(d), isT = k === t;
    head += `<button type="button" class="dh${isT ? " today" : ""}" data-day="${k}"${isT ? ' aria-current="date"' : ""}><small>${cap(F.diaCorto.format(d).replace(".", ""))}</small><b>${d.getDate()}</b></button>`;
    cols += `<div class="col${isT ? " today" : ""}" data-d="${k}">` + lanes(byDate(k)).map(x => {
      const e = x.e, h = Math.max(24, (x.f - x.s) * HR / 60 - 2);
      return `<div class="ev${h < 40 ? " s" : ""}" data-id="${esc(e.id)}" data-d="${k}" style="--c:${okColor(e.color)};top:${x.s * HR / 60}px;height:${h}px;left:calc(${x.l / x.n * 100}% + 2px);width:calc(${100 / x.n}% - 4px)" title="${esc(e.name + " · " + rango(e) + " · " + BASE_LABEL)}"><b>${esc(e.name)}</b><span>${esc(rango(e))}</span></div>`;
    }).join("") + (isT ? `<div class="nowl" style="top:${nowMin * HR / 60}px"></div>` : "") + `</div>`;
  }
  body.className = "cal-body w"; body.style.setProperty("--n", n); body.style.setProperty("--hr", HR + "px");
  body.innerHTML = `<div class="tg" id="tg">${head}</div><div class="tg-b">${cols}</div></div>`;
  const first = days.flatMap(d => byDate(dKey(d))).map(e => mins(e.start)).sort((a, b) => a - b)[0];
  const focus = first ?? (days.some(d => dKey(d) === t) ? nowMin : 9 * 60);   // se abre en el primer evento del rango; si no hay, en la hora actual o a las 9
  const tg = $("#tg"); tg.scrollTop = Math.max(0, (Math.floor(focus / 60) - 1) * HR);
}
function render(dir = 0) {
  const t = todayKey();
  titulo(); mode === "month" ? renderMes(t) : renderHoras(t);
  if (dir) { body.style.setProperty("--dx", dir * 14 + "px"); body.classList.remove("swap"); void body.offsetWidth; body.classList.add("swap"); }
  hint();
}
const go = n => { anchor = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : addDays(anchor, n * (mode === "week" ? 7 : 1)); render(n > 0 ? 1 : -1); };
$("#cal-prev").onclick = () => go(-1);
$("#cal-next").onclick = () => go(1);
$("#cal-today").onclick = () => {                                 // "Hoy" respeta la vista: mes → este mes, semana → esta semana, día → hoy
  const n = new Date(), a = new Date(n.getFullYear(), n.getMonth(), n.getDate()), dir = Math.sign(+a - +anchor);
  anchor = a; render(dir);
};
function setMode(m) {
  if (m === mode) return;
  if (mode === "month" && m !== "month") { const n = new Date(); if (n.getFullYear() === anchor.getFullYear() && n.getMonth() === anchor.getMonth()) anchor = new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  mode = m; render();
}
document.querySelectorAll(".cseg [data-m]").forEach(b => b.onclick = () => setMode(b.dataset.m));
const openDay = k => { anchor = parse(k); mode = "day"; render(); };
body.addEventListener("click", e => {
  const dn = e.target.closest("[data-day]"); if (dn) return openDay(dn.dataset.day);
  const ev = e.target.closest(".ev");
  if (ev) { if (isAdmin) openEditor(ev.dataset.d, { id: ev.dataset.id }); return; }
  const col = e.target.closest(".col");
  if (col) { if (!isAdmin) return; const y = e.clientY - col.getBoundingClientRect().top, m = Math.floor(y / HR * 2) * 30; return openEditor(col.dataset.d, { start: pad(Math.floor(m / 60)) + ":" + pad(m % 60) }); }
  const d = e.target.closest(".d"); if (!d) return;
  if (isAdmin) openEditor(d.dataset.d); else openDay(d.dataset.d);
});
body.addEventListener("keydown", e => { const d = e.target.closest?.(".d"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); d.click(); } });
function hint() {
  tip.textContent = isAdmin ? (mode === "month" ? "Modo Admin: haz clic en un día para añadir o editar eventos (el número abre la vista del día)." : "Modo Admin: haz clic en la cuadrícula para añadir un evento o en un evento para editarlo.") : "";
  tip.hidden = !isAdmin;
}

/* ---------- Bloque "Horarios": hora del evento próximo en cada país ---------- */
function proximoEvento() {
  const t = todayKey(), ahora = Date.now();
  return events.filter(e => e.date >= t && (e.date > t || +(e.end ? instante(e.date, e.end) : new Date(+instante(e.date, e.start) + 3 * 36e5)) >= ahora))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))[0] || null;
}
function renderLeft() {
  const e = proximoEvento(), ini = e ? instante(e.date, e.start) : new Date();
  const cab = e ? `<div class="hor-ev"><b>${esc(e.name)}</b><span>${esc(cap(F.corto.format(parse(e.date))).replace(".", ""))} · ${esc(rango(e))} ${BASE_LABEL}</span></div>` : `<div class="hor-ev"><span>Hora actual · sin eventos próximos</span></div>`;
  leftIn.innerHTML = cab + `<ul class="hor">` + PAISES.map(p => {
    const dd = e ? diaNum(diaTz(p.tz).format(ini)) - diaNum(e.date) : 0;
    const h = hora(p.tz).format(ini);
    return `<li${p.def ? ' class="def"' : ""}><span class="cc">${p.c}</span><span class="nm">${p.n}</span><b>${h}${dd ? `<small>${dd > 0 ? "+" : "−"}${Math.abs(dd)}d</small>` : ""}</b></li>`;
  }).join("") + `</ul>`;
}

/* ---------- Bloque "Proyecto Actual" + fondo difuminado ---------- */
function proyectoCercano() {
  const t = todayKey(), con = PROYECTOS.filter(p => p.start && p.end && !p.soon);
  const actual = con.filter(p => p.start <= t && t <= p.end).sort((a, b) => a.end.localeCompare(b.end))[0];
  if (actual) return { p: actual, actual: true };
  const prox = con.filter(p => p.start > t).sort((a, b) => a.start.localeCompare(b.start))[0];
  if (prox) return { p: prox, actual: false };
  const any = PROYECTOS.find(p => !p.soon); return any ? { p: any, actual: true } : null;
}
function renderRight() {
  const r = proyectoCercano(), tt = $("#mod-proj-t");
  if (!r) { tt.textContent = "Proyecto Actual"; rightIn.innerHTML = `<p class="cs-empty">Todavía no hay proyectos.</p>`; bgEl.style.backgroundImage = ""; return; }
  const { p } = r; tt.textContent = r.actual ? "Proyecto Actual" : "Proyecto Próximo";
  rightIn.innerHTML = `<a class="cs-proj" href="#proyectos/${encodeURIComponent(p.id)}" style="--acc:${esc(p.acc)}" aria-label="Abrir ${esc(p.name)} en Proyectos"><img src="${esc(p.img)}" alt="" draggable="false"><span class="lbl"><b class="nm">${esc(p.name)}</b><span class="st">${esc(p.status)}</span></span></a>
    <dl class="cs-dates"><div><dt>Inicio</dt><dd>${esc(F.fecha.format(parse(p.start)))}</dd></div><div><dt>Fin</dt><dd>${esc(F.fecha.format(parse(p.end)))}</dd></div></dl>`;
  bgEl.style.backgroundImage = `url("${p.img}")`;
}
document.querySelectorAll(".mod-h").forEach(b => b.onclick = () => { const m = b.parentElement, c = m.classList.toggle("closed"); b.setAttribute("aria-expanded", !c); });   // bloques retraíbles

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
  sec.classList.toggle("admin", isAdmin);
  if (!isAdmin) closeEditor();
  hint();
});

function closeEditor() { edHost.hidden = true; edHost.innerHTML = ""; editing = null; }
function openEditor(k, o = {}) { editDate = k; editing = o.id ? events.find(x => x.id === o.id) || null : null; prefill = o.start || ""; chosen = editing ? okColor(editing.color) : COLORES[byDate(k).length % COLORES.length]; edHost.hidden = false; drawEditor(); edHost.querySelector("#ed-n").focus(); }
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
        <div><label for="ed-s">Inicio</label><input id="ed-s" type="time" required value="${editing ? esc(editing.start) : esc(prefill)}"></div>
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
  if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
});

/* ---------- Al entrar en la vista ---------- */
new MutationObserver(() => {
  bgEl.classList.toggle("on", !sec.hidden);
  if (sec.hidden) { closeEditor(); return; }
  anchor = new Date(); anchor = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  refresh(); loadEvents();
}).observe(sec, { attributes: true, attributeFilter: ["hidden"] });
setInterval(() => { if (!sec.hidden) { renderLeft(); if (mode !== "month") render(); } }, 60000);   // la hora actual y la línea roja se mantienen al día

refresh();
bgEl.classList.toggle("on", !sec.hidden);
if (!sec.hidden) loadEvents();
