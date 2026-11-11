/* monedas.js — Transferencias de monedas entre jugadores.
 * Seguridad: lo valida Firestore (ver reglas sendOk / claimOk / transfers). Es en 2 pasos: el que envía descuenta y crea una transferencia pendiente;
 * el destinatario la cobra solo (al entrar o cada 20 s) sumando exactamente ese monto. Si no se cobra, el que envía puede cancelarla. */
let D = null, busy = false, timer = 0, pending = [], cache = null;
const $ = s => document.querySelector(s);
const nf = n => Number(n || 0).toLocaleString("es-MX");
const ico = "🪙";

function toast(t, bad) {
  let n = $("#mn-toast"); if (!n) { n = document.createElement("div"); n.id = "mn-toast"; n.setAttribute("role", "status"); document.body.append(n); }
  n.textContent = t; n.className = "mn-toast " + (bad ? "bad" : "ok"); n.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => n.hidden = true, 4500);
}
const setCoins = c => { D.patchMe({ coins: c }); const e = $("#mn-bal"); if (e) e.textContent = nf(c); if (D.refresh) D.refresh(); };

/* ---------- Cobrar lo que me envían (o cancelar lo que envié) ---------- */
async function pull() {
  const u = D && D.me(); if (!u || busy) return; busy = true;
  try {
    const f = D.fb, col = f.collection(D.db, "transfers");
    const [a, b] = await Promise.all([f.getDocs(f.query(col, f.where("to", "==", u.uid), f.limit(20))), f.getDocs(f.query(col, f.where("from", "==", u.uid), f.limit(20)))]);
    const incoming = a.docs.map(d => ({ id: d.id, ...d.data() })), sent = b.docs.map(d => ({ id: d.id, ...d.data() }));
    let got = 0; const who = [];
    for (const x of incoming) {
      try { await claim(x); got += x.amount; who.push(x.fromName); } catch (e) { console.warn("cobro", x.id, e.code || e.message); }
    }
    pending = sent.filter(x => x.to !== u.uid);
    if (got) { setCoins((D.me().coins || 0) + got); toast(`Recibiste ${nf(got)} ${ico} de ${[...new Set(who)].join(", ")}`); }
    paintPending();
  } catch (e) { console.warn("transferencias:", e.code || e.message); }
  finally { busy = false; }
}
async function claim(x) {
  const f = D.fb, u = D.me(), b = f.writeBatch(D.db);
  b.update(f.doc(D.db, "players", u.uid), { coins: f.increment(x.amount), claim: x.id });
  b.delete(f.doc(D.db, "transfers", x.id)); await b.commit();
}
function paintPending() {
  const el = $("#mn-pend"); if (!el) return;
  el.innerHTML = pending.length ? `<h4>Enviadas sin cobrar</h4>` + pending.map(x => `<div class="mn-p"><span>${nf(x.amount)} ${ico} → <b>${D.esc(x.toName)}</b></span><button type="button" class="btn mini" data-c="${D.esc(x.id)}">Cancelar</button></div>`).join("") : "";
  el.querySelectorAll("[data-c]").forEach(bt => bt.onclick = async () => {
    const x = pending.find(p => p.id === bt.dataset.c); if (!x) return; bt.disabled = true;
    try { await claim(x); setCoins((D.me().coins || 0) + x.amount); pending = pending.filter(p => p !== x); paintPending(); toast("Transferencia cancelada: monedas devueltas."); }
    catch (e) { bt.disabled = false; toast("No se pudo cancelar (el destinatario quizá ya la cobró).", true); pull(); }
  });
}

/* ---------- Enviar ---------- */
async function send(to, amount) {
  const u = D.me(), f = D.fb, uref = f.doc(D.db, "players", u.uid);
  const s = await f.getDoc(uref), d = s.data() || {}, coins = Math.floor(Number(d.coins ?? 0)) || 0, txn = Math.floor(Number(d.txn)) || 0;
  if (coins < amount) throw Object.assign(new Error("Saldo insuficiente"), { friendly: "No te alcanzan las monedas." });
  const b = f.writeBatch(D.db);
  b.update(uref, { coins: f.increment(-amount), txn: f.increment(1) });
  b.set(f.doc(D.db, "transfers", u.uid + "_" + (txn + 1)), { from: u.uid, to: to.id, fromName: u.name, toName: to.name, amount, t: f.serverTimestamp() });
  await b.commit(); setCoins(coins - amount);
}
async function players() {
  if (cache && Date.now() - cache.t < 60e3) return cache.list;
  const f = D.fb, s = await f.getDocs(f.query(f.collection(D.db, "players"), f.limit(500)));
  const list = s.docs.map(d => ({ id: d.id, name: String(d.data().name || "?"), avatar: d.data().avatar })).sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
  cache = { t: Date.now(), list }; return list;
}
function openDialog(pre) {
  const u = D.me(); if (!u || document.querySelector(".mn-ov")) return;
  const w = document.createElement("div"); w.className = "mn-ov";
  w.innerHTML = `<form class="mn-box" novalidate><h3>Transferir monedas</h3>
    <p class="mn-sal">Tu saldo: <b>${nf(u.coins)}</b> ${ico}</p>
    <label>Buscar jugador<input id="mn-q" type="search" placeholder="Escribe un nombre…" autocomplete="off"></label>
    <div class="mn-list" id="mn-list" role="listbox" aria-label="Jugadores"><p class="mn-mut">Cargando…</p></div>
    <p class="mn-to" id="mn-to"></p>
    <label>Cantidad<input id="mn-amt" type="number" min="1" step="1" inputmode="numeric" placeholder="0"></label>
    <div class="mn-quick">${[10, 100, 500, 1000].map(n => `<button type="button" data-n="${n}">${nf(n)}</button>`).join("")}<button type="button" data-n="all">Todo</button></div>
    <p class="mn-err" id="mn-err" role="alert"></p>
    <div class="mn-bt"><button type="button" data-x>Cancelar</button><button type="submit" class="go" id="mn-go">Enviar</button></div></form>`;
  document.body.append(w);
  const q = w.querySelector("#mn-q"), list = w.querySelector("#mn-list"), err = w.querySelector("#mn-err"), amt = w.querySelector("#mn-amt"), toEl = w.querySelector("#mn-to");
  let sel = pre || null, all = [];
  const draw = () => {
    const t = q.value.trim().toLowerCase(), rows = all.filter(p => p.id !== u.uid && (!t || p.name.toLowerCase().includes(t))).slice(0, 80);
    list.innerHTML = rows.map(p => `<button type="button" role="option" data-id="${D.esc(p.id)}" aria-selected="${sel && sel.id === p.id}" class="${sel && sel.id === p.id ? "on" : ""}">${D.esc(p.name)}</button>`).join("") || `<p class="mn-mut">Ningún jugador coincide.</p>`;
    list.querySelectorAll("button").forEach(b => b.onclick = () => { sel = all.find(p => p.id === b.dataset.id); draw(); });
    toEl.innerHTML = sel ? `Para: <b>${D.esc(sel.name)}</b>` : "Elige a quién enviar.";
  };
  players().then(l => { all = l; if (sel && !all.find(p => p.id === sel.id)) all.unshift(sel); draw(); }).catch(() => { list.innerHTML = `<p class="mn-mut">No se pudo cargar la lista.</p>`; });
  q.oninput = draw; draw(); (pre ? amt : q).focus();
  w.querySelectorAll("[data-n]").forEach(b => b.onclick = () => { amt.value = b.dataset.n === "all" ? Math.max(0, Math.floor(D.me().coins || 0)) : b.dataset.n; });
  const done = () => w.remove();
  w.querySelector("[data-x]").onclick = done; w.addEventListener("pointerdown", e => { if (e.target === w) done(); }); w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") done(); });
  w.querySelector("form").onsubmit = async e => {
    e.preventDefault(); err.textContent = ""; const n = Math.floor(Number(amt.value));
    if (!sel) { err.textContent = "Elige a quién enviar."; return; }
    if (!(n >= 1) || n > 1000000) { err.textContent = "Escribe una cantidad entre 1 y 1 000 000."; return; }
    if (n > (D.me().coins || 0)) { err.textContent = "No te alcanzan las monedas."; return; }
    if (!confirm(`¿Enviar ${nf(n)} monedas a ${sel.name}? No se puede deshacer una vez que las cobre.`)) return;
    const go = w.querySelector("#mn-go"); go.disabled = true;
    try { await send(sel, n); done(); toast(`Enviaste ${nf(n)} ${ico} a ${sel.name}.`); pull(); }
    catch (e2) { go.disabled = false; err.textContent = e2.friendly || (e2.code === "permission-denied" ? "No se pudo enviar (permiso denegado). Intenta de nuevo." : "No se pudo enviar: " + (e2.code || e2.message)); }
  };
}

/* ---------- Tarjeta del perfil ---------- */
function card(host, { mine, uid, name }) {
  if (!host) return; const u = D.me();
  if (mine) {
    host.innerHTML = `<h3 class="sec">Monedas</h3><div class="card mn-card"><div class="mn-top"><div class="mn-big"><small>Tu saldo</small><b><span id="mn-bal">${nf(u.coins)}</span> ${ico}</b></div>
      <button class="btn solid" id="mn-open" type="button">Transferir monedas</button></div><div id="mn-pend"></div></div>`;
    $("#mn-open").onclick = () => openDialog(); paintPending(); pull();
  } else if (u) {
    host.innerHTML = `<div class="card mn-card"><div class="mn-top"><span class="mn-mut">¿Quieres darle monedas a <b>${D.esc(name)}</b>?</span><button class="btn" id="mn-open" type="button">Enviar monedas</button></div></div>`;
    $("#mn-open").onclick = () => openDialog({ id: uid, name });
  } else host.innerHTML = "";
}
export const Monedas = {
  init(d) { D = d; },
  start() { clearInterval(timer); setTimeout(pull, 600); timer = setInterval(() => { if (!document.hidden) pull(); }, 20000); },
  stop() { clearInterval(timer); pending = []; },
  card, open: openDialog, pull
};
