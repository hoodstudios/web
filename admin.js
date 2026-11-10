/* admin.js — Panel de Administración de HOODSTUDIO (solo visible con la cuenta HOODSTUDIO).
 * Los permisos REALES los dan las reglas de Firestore (isAdmin: correo + sesión de menos de 4 h); este panel es solo la interfaz.
 * Seguridad extra en el navegador: cierre automático por inactividad (15 min) y por sesión caducada (4 h), y registro de cada acción (admin_log). */
const ADMIN = "hoodstudio@hoodstudio.app", IDLE_MS = 15 * 60e3, MAX_MS = 4 * 3600e3;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const H = () => window.HOOD || null;
const isAdmin = () => { const h = H(), u = h && h.auth.currentUser; return !!(u && (u.email || "").toLowerCase() === ADMIN); };
const cum = L => 100 * L + 5 * L * (L - 1) + 2 * (L - 1) * L * (2 * L - 1);   // misma fórmula que las reglas
const levelOf = xp => { let L = 0; while (cum(L + 1) <= xp && L < 999) L++; return L; };
const GAMES = [["scores", "Desert Rush"], ["scores_coral", "Coral Stack"], ["scores_elytra", "Elytra Fly"]];
const int = (v, mx) => Math.max(0, Math.min(mx, Math.floor(Number(v)) || 0));

let fab = null, ov = null, tab = "jug", players = [], shop = null, selId = null, idleT = 0, guardT = 0, sessionInfo = null;

/* ---------- Registro + escritura atómica (cambio + entrada de registro en el mismo lote) ---------- */
async function commit(ops, action, target, detail) {
  const h = H(), b = h.fb.writeBatch(h.db);
  ops.forEach(o => o.del ? b.delete(o.ref) : b.set(o.ref, o.data, { merge: true }));
  b.set(h.fb.doc(h.fb.collection(h.db, "admin_log")), { t: h.fb.serverTimestamp(), a: String(action).slice(0, 40), target: String(target).slice(0, 80), d: String(detail || "").slice(0, 400) });
  await b.commit();
}
const toast = (t, bad) => { const n = $("#adm-toast"); if (!n) return; n.textContent = t; n.className = "tst " + (bad ? "bad" : "ok"); n.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => n.hidden = true, 3500); };
const fail = e => { console.warn(e); toast("No se pudo: " + (e && e.code === "permission-denied" ? "permiso denegado (¿publicaste las reglas nuevas o caducó tu sesión de 4 h?)" : (e.code || e.message)), true); };

/* ---------- Seguridad de sesión ---------- */
async function checkSession() {
  const h = H(); if (!isAdmin()) return;
  try {
    const r = await h.auth.currentUser.getIdTokenResult(); const t0 = new Date(r.authTime).getTime();
    sessionInfo = { t0, exp: t0 + MAX_MS };
    if (Date.now() - t0 > MAX_MS) lock("Tu sesión de administrador superó las 4 horas. Vuelve a iniciar sesión.");
  } catch (e) { /* sin red: las reglas siguen protegiendo */ }
}
function lock(msg) {
  const h = H(); if (!h) return; closePanel(); try { h.signOut(); } catch (e) {}
  const b = document.createElement("div"); b.className = "adm-lock"; b.setAttribute("role", "alert"); b.textContent = "🔒 " + msg; document.body.append(b); setTimeout(() => b.remove(), 9000);
}
const bump = () => { clearTimeout(idleT); if (isAdmin()) idleT = setTimeout(() => lock("Sesión de administrador cerrada por inactividad (15 min)."), IDLE_MS); };
["pointerdown", "keydown", "wheel", "touchstart"].forEach(ev => addEventListener(ev, bump, { passive: true, capture: true }));

/* ---------- Botón flotante y panel ---------- */
function mountFab() {
  if (fab) return; fab = document.createElement("button"); fab.type = "button"; fab.id = "adm-fab"; fab.title = "Panel de administración"; fab.innerHTML = "🛡 Admin"; fab.hidden = true;
  fab.onclick = openPanel; document.body.append(fab);
}
function sync() {
  mountFab(); const a = isAdmin(); fab.hidden = !a;
  if (a) { bump(); checkSession(); clearInterval(guardT); guardT = setInterval(checkSession, 60e3); cleanOwnScores(); }
  else { clearTimeout(idleT); clearInterval(guardT); closePanel(); }
}
/* HOODSTUDIO no puntúa: se borran sus puntajes antiguos de los 3 rankings (una vez por sesión). */
let cleaned = false;
async function cleanOwnScores() {
  const h = H(), u = h.auth.currentUser; if (cleaned || !u) return; cleaned = true;
  for (const [c] of GAMES) { try { const r = h.fb.doc(h.db, c, u.uid), s = await h.fb.getDoc(r); if (s.exists()) await h.fb.deleteDoc(r); } catch (e) { console.warn("limpieza ranking", c, e.code); } }
}
function closePanel() { if (ov) { ov.remove(); ov = null; } document.documentElement.classList.remove("adm-open"); }
function openPanel() {
  if (!isAdmin() || ov) return; document.documentElement.classList.add("adm-open");
  ov = document.createElement("div"); ov.className = "adm"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Panel de administración");
  ov.innerHTML = `<div class="adm-box"><header><b>🛡 Administración · HOODSTUDIO</b>
    <nav>${[["jug", "Jugadores"], ["test", "Pruebas"], ["rank", "Rankings"], ["log", "Registro"], ["seg", "Seguridad"]].map(([k, l]) => `<button type="button" data-t="${k}">${l}</button>`).join("")}</nav>
    <button type="button" class="x" aria-label="Cerrar">×</button></header>
    <div id="adm-toast" class="tst" hidden role="status"></div><section id="adm-body"></section></div>`;
  document.body.append(ov);
  ov.querySelector(".x").onclick = closePanel; ov.addEventListener("pointerdown", e => { if (e.target === ov) closePanel(); });
  ov.addEventListener("keydown", e => { if (e.key === "Escape") closePanel(); e.stopPropagation(); });
  ov.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.t; draw(); });
  draw();
}
function draw() {
  if (!ov) return; ov.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
  ({ jug: tabJug, test: tabTest, rank: tabRank, log: tabLog, seg: tabSeg })[tab]();
}
const body = () => $("#adm-body");

/* ---------- Jugadores ---------- */
async function loadPlayers() {
  const h = H(); const s = await h.fb.getDocs(h.fb.query(h.fb.collection(h.db, "players"), h.fb.limit(500)));
  players = []; s.forEach(d => players.push({ id: d.id, ...d.data() })); players.sort((a, b) => String(a.name).localeCompare(String(b.name), "es", { sensitivity: "base" }));
}
async function loadShop() {
  if (shop) return shop; const h = H(); shop = [];
  try { const s = await h.fb.getDocs(h.fb.collection(h.db, "shop")); s.forEach(d => shop.push({ id: d.id, name: d.data().name || d.id, cat: d.data().cat || "" })); shop.sort((a, b) => a.name.localeCompare(b.name, "es")); } catch (e) { console.warn(e); }
  return shop;
}
async function tabJug() {
  body().innerHTML = `<div class="cols"><aside><input id="adm-q" type="search" placeholder="Buscar jugador…" autocomplete="off"><div id="adm-list" class="lst"><p class="mut">Cargando…</p></div></aside><div id="adm-det" class="det"><p class="mut">Elige un jugador de la lista.</p></div></div>`;
  try { if (!players.length) await loadPlayers(); await loadShop(); } catch (e) { fail(e); return; }
  const list = () => {
    const q = $("#adm-q").value.trim().toLowerCase();
    $("#adm-list").innerHTML = players.filter(p => !q || String(p.name).toLowerCase().includes(q)).map(p => `<button type="button" data-id="${esc(p.id)}" class="${p.id === selId ? "on" : ""}">${esc(p.name)}<small>${Math.floor(Number(p.coins ?? p.monedas) || 0)} 🪙</small></button>`).join("") || `<p class="mut">Sin resultados.</p>`;
    $("#adm-list").querySelectorAll("button").forEach(b => b.onclick = () => { selId = b.dataset.id; list(); detail(); });
  };
  $("#adm-q").oninput = list; list(); if (selId) detail();
}
function detail() {
  const p = players.find(x => x.id === selId), el = $("#adm-det"); if (!p || !el) return;
  const h = H(), MED = h.MEDALS || {}, medIds = Array.isArray(p.medalIds) ? p.medalIds : [], inv = Array.isArray(p.inv) ? p.inv : [];
  const allMed = [...new Set([...Object.keys(MED), ...medIds])];
  const nm = id => (shop.find(s => s.id === id) || {}).name || id;
  const isMe = h.auth.currentUser && h.auth.currentUser.uid === p.id;
  el.innerHTML = `<h3>${esc(p.name)} ${isMe ? "<small>(tú)</small>" : ""}</h3>
    <div class="g3"><label>Monedas<input id="f-coins" type="number" min="0" value="${Math.floor(Number(p.coins ?? p.monedas) || 0)}"></label>
      <label>XP<input id="f-xp" type="number" min="0" value="${Math.floor(Number(p.xp) || 0)}"></label>
      <label>Cofres<input id="f-chests" type="number" min="0" value="${Math.floor(Number(p.chests) || 0)}"></label></div>
    <p class="mut" id="f-lv"></p>
    <h4>Medallas</h4><div class="chk">${allMed.map(id => `<label><input type="checkbox" data-m="${esc(id)}" ${medIds.includes(id) ? "checked" : ""}> ${esc((MED[id] || {}).name || id)}</label>`).join("") || '<span class="mut">No hay medallas definidas.</span>'}</div>
    <h4>Inventario (${inv.length})</h4><div class="chips" id="f-inv">${inv.map(id => `<span class="chip" data-i="${esc(id)}">${esc(nm(id))} <button type="button" aria-label="Quitar">×</button></span>`).join("") || '<span class="mut">Vacío</span>'}</div>
    <div class="row"><select id="f-add"><option value="">Añadir item de la tienda…</option>${shop.filter(s => !inv.includes(s.id)).map(s => `<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.cat)}</option>`).join("")}</select><button type="button" id="f-addb">＋ Dar</button><button type="button" id="f-all">Dar TODOS</button></div>
    <h4>Equipado</h4><div class="row"><span class="mut">hat: ${esc(String((p.equip || {}).hat ?? "—"))} · frame: ${esc(String((p.equip || {}).frame ?? "—"))} · bg: ${esc(String((p.equip || {}).bg ?? "—"))}</span><button type="button" id="f-noeq">Quitar todo lo equipado</button></div>
    <h4>Otras acciones</h4><div class="row wrap"><button type="button" id="f-lim">Reiniciar límites diarios de monedas</button><button type="button" id="f-av">Restablecer avatar</button>
      ${GAMES.map(([c, n]) => `<button type="button" data-sc="${c}">Borrar puntaje ${esc(n)}</button>`).join("")}</div>
    <div class="row end"><button type="button" class="dg" id="f-del" ${isMe ? "disabled" : ""}>🗑 Borrar perfil</button><span class="sp"></span><button type="button" class="go" id="f-save">💾 Guardar cambios</button></div>`;
  const lv = () => { $("#f-lv").textContent = "Nivel resultante: " + levelOf(int($("#f-xp").value, 1e9)); }; $("#f-xp").oninput = lv; lv();
  const ref = () => h.fb.doc(h.db, "players", p.id);
  const run = async (ops, act, detail, patch) => { try { await commit(ops, act, p.name, detail); Object.assign(p, patch || {}); toast("Hecho ✓"); detail_(); } catch (e) { fail(e); } };
  const detail_ = () => { const keep = $("#adm-q") && $("#adm-q").value; tabJugRefresh(keep); };
  $("#f-save").onclick = () => {
    const coins = int($("#f-coins").value, 1e8), xp = int($("#f-xp").value, 1e9), chests = int($("#f-chests").value, 1e5);
    const medalIds = [...el.querySelectorAll("[data-m]")].filter(c => c.checked).map(c => c.dataset.m);
    const patch = { coins, xp, chests, medalIds, lvChest: levelOf(xp) };           // lvChest = nivel real: así no regala cofres por subir XP
    run([{ ref: ref(), data: patch }], "editar_jugador", `monedas ${coins}, xp ${xp}, cofres ${chests}, medallas ${medalIds.join("|")}`, patch);
  };
  el.querySelectorAll("#f-inv .chip button").forEach(b => b.onclick = () => { const id = b.parentElement.dataset.i, n = inv.filter(x => x !== id); const eq = { ...(p.equip || {}) }; for (const k of ["hat", "frame", "bg"]) if (eq[k] === id) eq[k] = null; run([{ ref: ref(), data: { inv: n, equip: eq } }], "quitar_item", id, { inv: n, equip: eq }); });
  $("#f-addb").onclick = () => { const id = $("#f-add").value; if (!id) return; const n = [...inv, id]; run([{ ref: ref(), data: { inv: n } }], "dar_item", id, { inv: n }); };
  $("#f-all").onclick = () => { if (!confirm("¿Dar TODOS los items de la tienda a " + p.name + "?")) return; const n = [...new Set([...inv, ...shop.map(s => s.id)])].slice(0, 300); run([{ ref: ref(), data: { inv: n } }], "dar_todos", String(n.length), { inv: n }); };
  $("#f-noeq").onclick = () => run([{ ref: ref(), data: { equip: {} } }], "quitar_equip", "", { equip: {} });
  $("#f-lim").onclick = () => run([{ ref: ref(), data: { coinN_runner: 0, coinN_coral: 0, coinN_elytra: 0, coinWin_runner: 0, coinWin_coral: 0, coinWin_elytra: 0 } }], "reiniciar_limites", "", {});
  $("#f-av").onclick = () => { const a = "https://minotar.net/helm/" + encodeURIComponent(p.name) + "/64.png"; run([{ ref: ref(), data: { avatar: a } }], "reset_avatar", "", { avatar: a }); };
  el.querySelectorAll("[data-sc]").forEach(b => b.onclick = () => { if (confirm("¿Borrar el puntaje de " + p.name + " en este juego?")) run([{ ref: h.fb.doc(h.db, b.dataset.sc, p.id), del: true }], "borrar_puntaje", b.dataset.sc, {}); });
  $("#f-del").onclick = () => { if (prompt('Para borrar el perfil de "' + p.name + '" escribe BORRAR (su cuenta de acceso seguirá existiendo; borra su perfil y puntajes):') === "BORRAR") run([{ ref: ref(), del: true }, ...GAMES.map(([c]) => ({ ref: h.fb.doc(h.db, c, p.id), del: true }))], "borrar_perfil", p.name, {}).then(() => { players = players.filter(x => x.id !== p.id); selId = null; tabJug(); }); };
}
function tabJugRefresh(q) { const el = $("#adm-det"); if (!el) return; const sc = el.scrollTop; detail(); const l = $("#adm-list"); if (l) tabJugListOnly(); const e2 = $("#adm-det"); if (e2) e2.scrollTop = sc; }
function tabJugListOnly() { const q = $("#adm-q"); if (q) q.dispatchEvent(new Event("input")); }

/* ---------- Pruebas (sobre tu propia cuenta) ---------- */
function tabTest() {
  const me = H().auth.currentUser;
  body().innerHTML = `<div class="det"><h3>Pruebas con tu cuenta</h3><p class="mut">Estos cambios son solo para tu perfil HOODSTUDIO (no aparece en rankings). La página se recarga al terminar.</p>
    <div class="row wrap"><button data-q="coins:1000">+1 000 🪙</button><button data-q="coins:100000">+100 000 🪙</button><button data-q="xp:5000">+5 000 XP</button><button data-q="xp:100000">+100 000 XP</button><button data-q="chests:5">+5 cofres</button><button data-q="all">Todos los items de la tienda</button><button data-q="lim">Reiniciar límites diarios</button><button data-q="clear" class="dg">Vaciar inventario y equipo</button><button data-q="zero" class="dg">Poner monedas/XP/cofres a 0</button></div>
    <h4>Navegar como jugador</h4><p class="mut">Abre el perfil público de cualquier jugador para ver lo que ven los demás.</p>
    <div class="row"><input id="adm-pn" placeholder="Nombre del jugador"><button id="adm-go">Abrir perfil</button></div></div>`;
  body().querySelectorAll("[data-q]").forEach(b => b.onclick = async () => {
    const h = H(), ref = h.fb.doc(h.db, "players", me.uid), s = await h.fb.getDoc(ref), d = s.data() || {}; const [k, v] = b.dataset.q.split(":"); let patch = {};
    if (k === "coins") patch.coins = int((d.coins ?? d.monedas ?? 0) + Number(v), 1e8);
    else if (k === "xp") { const xp = int((d.xp || 0) + Number(v), 1e9); patch = { xp, lvChest: levelOf(xp) }; }
    else if (k === "chests") patch.chests = int((d.chests || 0) + Number(v), 1e5);
    else if (k === "all") { await loadShop(); patch.inv = [...new Set([...(d.inv || []), ...shop.map(x => x.id)])].slice(0, 300); }
    else if (k === "lim") patch = { coinN_runner: 0, coinN_coral: 0, coinN_elytra: 0, coinWin_runner: 0, coinWin_coral: 0, coinWin_elytra: 0 };
    else if (k === "clear") patch = { inv: [], equip: {} };
    else if (k === "zero") patch = { coins: 0, xp: 0, chests: 0, lvChest: 0 };
    try { await commit([{ ref, data: patch }], "prueba_propia", "HOODSTUDIO", b.dataset.q); toast("Hecho ✓ Recargando…"); setTimeout(() => location.reload(), 700); } catch (e) { fail(e); }
  });
  $("#adm-go").onclick = () => { const n = $("#adm-pn").value.trim(); if (n) { closePanel(); location.hash = "#perfil/" + encodeURIComponent(n); } };
}

/* ---------- Rankings ---------- */
function tabRank() {
  body().innerHTML = `<div class="det"><h3>Rankings</h3><p class="mut">HOODSTUDIO no entra en ningún ranking (se oculta y no puede puntuar). Aquí puedes vaciar un ranking completo (p. ej. para una nueva temporada o tras detectar trampas).</p>
    <div class="row wrap">${GAMES.map(([c, n]) => `<button class="dg" data-r="${c}" data-n="${esc(n)}">Vaciar ranking de ${esc(n)}</button>`).join("")}</div></div>`;
  body().querySelectorAll("[data-r]").forEach(b => b.onclick = async () => {
    if (prompt(`Vas a borrar TODOS los puntajes de ${b.dataset.n}. Escribe BORRAR para confirmar:`) !== "BORRAR") return;
    const h = H();
    try { const s = await h.fb.getDocs(h.fb.collection(h.db, b.dataset.r)); const ids = []; s.forEach(d => ids.push(d.id));
      for (let i = 0; i < ids.length; i += 400) { const bt = h.fb.writeBatch(h.db); ids.slice(i, i + 400).forEach(id => bt.delete(h.fb.doc(h.db, b.dataset.r, id))); if (i + 400 >= ids.length) bt.set(h.fb.doc(h.fb.collection(h.db, "admin_log")), { t: h.fb.serverTimestamp(), a: "vaciar_ranking", target: b.dataset.r, d: ids.length + " puntajes" }); await bt.commit(); }
      toast("Ranking vaciado (" + ids.length + ") ✓"); } catch (e) { fail(e); }
  });
}

/* ---------- Registro ---------- */
async function tabLog() {
  body().innerHTML = `<div class="det"><h3>Registro de acciones</h3><div id="adm-lg" class="lg"><p class="mut">Cargando…</p></div></div>`;
  const h = H();
  try {
    const s = await h.fb.getDocs(h.fb.query(h.fb.collection(h.db, "admin_log"), h.fb.orderBy("t", "desc"), h.fb.limit(100))); const rows = [];
    s.forEach(d => { const x = d.data(); let t = ""; try { t = x.t.toDate().toLocaleString("es-MX"); } catch (e) {} rows.push(`<tr><td>${esc(t)}</td><td>${esc(x.a)}</td><td>${esc(x.target)}</td><td>${esc(x.d)}</td></tr>`); });
    $("#adm-lg").innerHTML = rows.length ? `<table><thead><tr><th>Fecha</th><th>Acción</th><th>Objetivo</th><th>Detalle</th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="mut">Aún no hay acciones registradas.</p>`;
  } catch (e) { $("#adm-lg").innerHTML = `<p class="mut">No se pudo leer el registro (${esc(e.code || e.message)}).</p>`; }
}

/* ---------- Seguridad ---------- */
function tabSeg() {
  const f = t => t ? new Date(t).toLocaleString("es-MX") : "—";
  body().innerHTML = `<div class="det"><h3>Seguridad de la cuenta</h3>
    <ul class="sec"><li>✅ Los poderes de Admin los validan las <b>reglas de Firestore</b> (correo exacto), no la página: nadie puede dárselos desde el navegador.</li>
    <li>✅ Requieren una <b>sesión de menos de 4 horas</b>. Una sesión vieja o robada pierde los permisos.</li>
    <li>✅ <b>Cierre automático</b> tras 15 min sin actividad.</li>
    <li>✅ Cada acción de este panel queda en el <b>Registro</b> (nadie puede editarlo ni borrarlo).</li>
    <li>✅ Nadie más puede registrar nombres con “hoodstudio”, “admin” o “staff”.</li>
    <li>✅ HOODSTUDIO no puede escribir en los rankings.</li></ul>
    <p class="mut">Sesión iniciada: <b>${f(sessionInfo && sessionInfo.t0)}</b> · caduca: <b>${f(sessionInfo && sessionInfo.exp)}</b></p>
    <h4>Cambiar contraseña</h4><div class="row"><input id="adm-pw" type="password" placeholder="Nueva contraseña (mín. 10 caracteres)" autocomplete="new-password"><button id="adm-pwb">Cambiar</button></div>
    <p class="mut">Usa una contraseña larga y única. Para más seguridad, activa la verificación en dos pasos en tu cuenta de Google/Gmail asociada y no inicies sesión en equipos compartidos.</p>
    <div class="row"><button class="dg" id="adm-out">Cerrar sesión ahora</button></div></div>`;
  $("#adm-out").onclick = () => lock("Sesión cerrada.");
  $("#adm-pwb").onclick = async () => {
    const pw = $("#adm-pw").value; if (pw.length < 10) { toast("Mínimo 10 caracteres.", true); return; }
    try { await H().updatePassword(pw); await commit([], "cambiar_password", "HOODSTUDIO", ""); $("#adm-pw").value = ""; toast("Contraseña cambiada ✓"); }
    catch (e) { toast(e && e.code === "auth/requires-recent-login" ? "Por seguridad, cierra sesión, vuelve a entrar y repite." : "No se pudo cambiar (" + (e.code || e.message) + ").", true); }
  };
}

function wire() { const h = H(); if (!h || wire.done) return; wire.done = true; h.auth.onAuthStateChanged(sync); sync(); }
wire(); addEventListener("hood-ready", wire);
