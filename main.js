/* HOOD STUDIO — cuentas, jugadores, minijuego (Firebase)
 * Cuentas: Firebase Authentication (correo falso nombre@hoodstudio.app + contraseña).
 * Jugadores y ranking: Firestore (colecciones "players" y "scores"), compartidos por todos. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, deleteUser,
  GoogleAuthProvider, signInWithPopup, linkWithPopup, unlink, updatePassword, getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCStG20rFbespxXq39zbGCbIERhWmWWRtQ",
  authDomain: "hoodstudioweb.firebaseapp.com",
  projectId: "hoodstudioweb",
  storageBucket: "hoodstudioweb.firebasestorage.app",
  messagingSenderId: "173223418478",
  appId: "1:173223418478:web:be7f06f9c500612f42647f"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);

(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const headUrl = n => "https://minotar.net/helm/" + encodeURIComponent(n) + "/64.png";
const DEF = headUrl("MHF_Steve");
const okAv = a => typeof a === "string" && (a.startsWith("https://minotar.net/helm/") || a.startsWith("data:image/png;base64,")) ? a : DEF;
const mail = n => n.toLowerCase() + "@hoodstudio.app";

/* Catálogo de medallas: la clave (id) es lo que guardas en Firestore, en players/<jugador>/medalIds.
 * Las imágenes van en la carpeta "medallas/" de tu repositorio (PNG o WebP cuadrados). */
const MEDALS = {
  pionero:  { name: "Pionero",  desc: "Se registró durante la beta", img: "medallas/pionero.png" },
  campeon:  { name: "Campeón",  desc: "Ganó un evento oficial",      img: "medallas/campeon.png" },
  creador:  { name: "Creador",  desc: "Aportó al estudio",           img: "medallas/creador.png" }
};
/* Minijuegos con récord personal: col = colección de Firestore, field = campo con el récord */
const GAMES = [
  { id: "runner", name: "Salta el cactus", col: "scores", field: "score", unit: "puntos" }
];
const medalCount = d => Array.isArray(d.medalIds) ? d.medalIds.length : (Number(d.medals) || 0);
const pLink = n => "#perfil/" + encodeURIComponent(n);

let profile = null, ready = false, signing = false;
const me = () => profile;

/* ---------- Vistas ---------- */
const V = ["inicio", "proyectos", "calendario", "jugadores", "perfil", "juego", "creditos"];
function hashParts() { const [h, ...r] = location.hash.slice(1).split("/"); let a = ""; try { a = decodeURIComponent(r.join("/")); } catch (e) {} return [h, a]; }
function refreshView() { const [h, a] = hashParts(); if (h === "jugadores") renderPlayers(); else if (h === "perfil") renderProfile(a); }
function route() {
  const [h, arg] = hashParts(), cur = V.includes(h) ? h : "inicio";
  V.forEach(v => $("#v-" + v).hidden = v !== cur);
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.v === (cur === "perfil" ? "jugadores" : cur)));
  if (cur === "jugadores") renderPlayers();
  if (cur === "perfil") renderProfile(arg);
  if (cur === "juego") { renderRank(); Game.show(); } else Game.stop();
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ---------- Slider de proyectos ---------- */
const slides = $$(".slide"); let si = 0;
if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
  setInterval(() => { slides[si].classList.remove("on"); si = (si + 1) % slides.length; slides[si].classList.add("on"); }, 5000);

/* ---------- Cuentas ---------- */
function fe(e) { // errores de Firebase -> mensajes en español
  const c = (e && e.code) || "";
  if (c === "auth/email-already-in-use") return "Ese nombre ya está registrado.";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email") return "Usuario o contraseña incorrectos.";
  if (c === "auth/weak-password") return "La contraseña debe tener al menos 6 caracteres.";
  if (c === "auth/too-many-requests") return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (c === "auth/requires-recent-login") return "Por seguridad, cierra sesión, vuelve a entrar y cambia la contraseña de inmediato.";
  if (c === "auth/popup-blocked") return "Tu navegador bloqueó la ventana emergente. Permítela e inténtalo de nuevo.";
  if (c === "auth/unauthorized-domain") return "Este dominio no está autorizado en Firebase (Authentication → Configuración).";
  if (c === "auth/network-request-failed") return "Sin conexión. Revisa tu internet (o el bloqueador del navegador).";
  if (c === "auth/operation-not-allowed") return "El registro con correo/contraseña no está activado en Firebase.";
  if (c === "permission-denied" || c === "firestore/permission-denied") return "Permiso denegado por las reglas de Firestore.";
  console.warn(e); return "Ocurrió un error. Inténtalo de nuevo.";
}
function skinToHead(file) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return no(new Error("size"));
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
      x.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
      if (img.height === 64) x.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/png"));
    };
    img.onerror = () => no(new Error("img")); img.src = url;
  });
}
async function loadProfile(user) {
  profile = null;
  if (!user) return;
  try {
    const s = await getDoc(doc(db, "players", user.uid));
    if (s.exists()) { const d = s.data(); profile = { uid: user.uid, name: d.name, avatar: okAv(d.avatar), medalIds: Array.isArray(d.medalIds) ? d.medalIds : [] }; }
  } catch (e) { console.warn(e); }
}
async function signUp(name, pw, prem, file) {
  let avatar = DEF;
  if (prem) avatar = headUrl(name);
  else if (file) { try { avatar = await skinToHead(file); } catch (e) { return "La skin debe ser un PNG de 64×64 (o 64×32)."; } }
  signing = true;
  try {
    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, mail(name), pw); } catch (e) { return fe(e); }
    try { await setDoc(doc(db, "players", cred.user.uid), { name, avatar, medalIds: [], createdAt: serverTimestamp() }); }
    catch (e) { try { await deleteUser(cred.user); } catch (_) {} return fe(e); }
    profile = { uid: cred.user.uid, name, avatar, medalIds: [] };
    return null;
  } finally { signing = false; }
}
async function logIn(name, pw) {
  signing = true;
  try {
    let cred;
    try { cred = await signInWithEmailAndPassword(auth, mail(name), pw); } catch (e) { return fe(e); }
    await loadProfile(cred.user);
    if (!profile) { await signOut(auth); return "No se encontró el perfil de esta cuenta."; }
    return null;
  } finally { signing = false; }
}
/* ---------- Google (opcional): recuperación de cuenta ---------- */
const gErr = e => {
  const c = (e && e.code) || "";
  if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request") return false; // el usuario cerró la ventana
  if (c === "auth/operation-not-allowed") return "El acceso con Google no está activado en Firebase.";
  if (c === "auth/credential-already-in-use" || c === "auth/email-already-in-use") return "Esa cuenta de Google ya está vinculada a otro perfil.";
  if (c === "auth/provider-already-linked") return "Ya tienes una cuenta de Google vinculada.";
  return fe(e);
};
let justGoogle = false;
async function logInGoogle() {
  signing = true;
  try {
    let cred;
    try { cred = await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { return gErr(e); }
    const isNew = (getAdditionalUserInfo(cred) || {}).isNewUser;
    await loadProfile(cred.user);
    if (!profile) {
      if (isNew) { try { await deleteUser(cred.user); } catch (_) { await signOut(auth); } return "Esa cuenta de Google no está vinculada a ningún perfil. Entra con tu contraseña y vincúlala desde tu perfil."; }
      await signOut(auth); return "No se encontró el perfil de esta cuenta.";
    }
    justGoogle = true; return null;
  } finally { signing = false; }
}
async function linkGoogle() {
  const u = auth.currentUser; if (!u) return "Inicia sesión primero.";
  try { await linkWithPopup(u, new GoogleAuthProvider()); return null; } catch (e) { return gErr(e); }
}
async function unlinkGoogle() {
  const u = auth.currentUser; if (!u) return "Inicia sesión primero.";
  try { await unlink(u, "google.com"); return null; } catch (e) { return fe(e); }
}
async function changePassword(pw) {
  const u = auth.currentUser; if (!u) return "Inicia sesión primero.";
  if (pw.length < 6) return "La contraseña debe tener al menos 6 caracteres.";
  try { await updatePassword(u, pw); return null; } catch (e) { return fe(e); }
}
const googleInfo = () => { const u = auth.currentUser; return u && u.providerData.find(p => p.providerId === "google.com"); };

function renderAuth() {
  const box = $("#auth"), u = me(); box.textContent = "";
  if (!ready) return;
  const mk = (t, c, f) => { const b = document.createElement("button"); b.className = c; b.textContent = t; b.onclick = f; return b; };
  if (u) {
    const d = document.createElement("a"); d.className = "me"; d.href = pLink(u.name); d.title = "Mi perfil";
    d.innerHTML = `<img src="${esc(u.avatar)}" alt=""><span>${esc(u.name)}</span>`;
    box.append(d, mk("Salir", "btn", () => signOut(auth)));
  } else box.append(mk("Iniciar sesión", "btn", () => openM("login")), mk("Registrarse", "btn solid", () => openM("signup")));
}

/* ---------- Modal ---------- */
const modal = $("#modal"), form = $("#form"); let mode = "login", last = null;
function setMode(m) {
  mode = m; $$(".tabs button").forEach(t => t.setAttribute("aria-selected", t.dataset.m === m));
  $("#su").hidden = m !== "signup"; $("#glogin").hidden = m !== "login"; $("#go").textContent = m === "login" ? "Iniciar sesión" : "Crear cuenta";
  $("#pw").autocomplete = m === "login" ? "current-password" : "new-password"; $("#err").textContent = "";
}
const openM = m => { last = document.activeElement; form.reset(); setMode(m); $("#skinbox").hidden = true; modal.hidden = false; $("#un").focus(); };
const closeM = () => { modal.hidden = true; last && last.focus && last.focus(); };
$$(".tabs button").forEach(t => t.onclick = () => setMode(t.dataset.m));
$("#prem").onchange = e => $("#skinbox").hidden = e.target.checked;
$("#mx").onclick = closeM; modal.onclick = e => { if (e.target === modal) closeM(); };
addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeM(); });
$("#gbtn").onclick = async () => {
  const err = $("#err"); err.textContent = ""; $("#gbtn").disabled = true;
  const r = await logInGoogle();
  $("#gbtn").disabled = false;
  if (r === false) return;
  if (r) return void (err.textContent = r);
  closeM(); renderAuth(); Game.refresh();
  if (profile) { const t = pLink(profile.name); if (location.hash === t) refreshView(); else location.hash = t; }
};
form.onsubmit = async e => {
  e.preventDefault(); const err = $("#err"); err.textContent = "";
  const name = $("#un").value.trim(), pw = $("#pw").value;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return void (err.textContent = "Tu nombre de Minecraft tiene de 3 a 16 caracteres: letras, números o guion bajo.");
  if (pw.length < 6) return void (err.textContent = "La contraseña debe tener al menos 6 caracteres.");
  $("#go").disabled = true;
  const r = mode === "login" ? await logIn(name, pw) : await signUp(name, pw, $("#prem").checked, $("#skin").files[0]);
  $("#go").disabled = false;
  if (r) return void (err.textContent = r);
  closeM(); renderAuth(); Game.refresh(); refreshView();
};

/* ---------- Jugadores ---------- */
async function renderPlayers() {
  const tb = $("#players");
  try {
    const snap = await getDocs(query(collection(db, "players"), orderBy("medals", "desc"), limit(100)));
    const list = snap.docs.map(d => d.data()).sort((a, b) => medalCount(b) - medalCount(a) || String(a.name).localeCompare(String(b.name)));
    tb.innerHTML = list.length
      ? list.map((u, i) => `<tr><td>${i + 1}</td><td><span class="pl"><img src="${esc(okAv(u.avatar))}" alt=""><a href="${esc(pLink(u.name))}">${esc(u.name)}</a></span></td><td>${medalCount(u)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="empty">Aún no hay jugadores registrados.</td></tr>`;
  } catch (e) { console.warn(e); tb.innerHTML = `<tr><td colspan="3" class="empty">No se pudo cargar la lista de jugadores.</td></tr>`; }
}

/* ---------- Perfil ---------- */
const fmtDate = ts => { try { return ts.toDate().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return "—"; } };
async function updateSkin(prem, file) {
  const u = me(); if (!u) return "Inicia sesión primero.";
  let avatar;
  if (prem) avatar = headUrl(u.name);
  else if (file) { try { avatar = await skinToHead(file); } catch (e) { return "La skin debe ser un PNG de 64×64 (o 64×32)."; } }
  else return "Sube tu skin o marca la opción de cuenta premium.";
  try {
    await updateDoc(doc(db, "players", u.uid), { avatar });
    const sref = doc(db, "scores", u.uid), s = await getDoc(sref);
    if (s.exists()) await updateDoc(sref, { avatar });
    profile.avatar = avatar; return null;
  } catch (e) { return fe(e); }
}
let profTok = 0;
async function renderProfile(name) {
  const box = $("#perfil-box"), tok = ++profTok;
  if (!name) { box.innerHTML = `<p class="muted">Jugador no encontrado.</p>`; return; }
  box.innerHTML = `<p class="muted">Cargando…</p>`;
  try {
    const q = await getDocs(query(collection(db, "players"), where("name", "==", name), limit(1)));
    if (tok !== profTok) return;
    if (q.empty) { box.innerHTML = `<p class="muted">No existe ningún jugador llamado «${esc(name)}».</p>`; return; }
    const uid = q.docs[0].id, p = q.docs[0].data(), mine = !!me() && me().uid === uid;
    const recs = await Promise.all(GAMES.map(async g => {
      try { const s = await getDoc(doc(db, g.col, uid)); return [g, s.exists() ? Number(s.data()[g.field]) || 0 : null]; }
      catch (e) { return [g, null]; }
    }));
    if (tok !== profTok) return;
    const ids = Array.isArray(p.medalIds) ? p.medalIds : [];
    box.innerHTML = `
      <div class="card prof">
        <img class="pface" src="${esc(okAv(p.avatar))}" alt="Cabeza de ${esc(p.name)}">
        <div class="pinfo">
          <h2>${esc(p.name)}</h2>
          <p class="muted">Miembro desde ${esc(fmtDate(p.createdAt))}</p>
          ${mine ? `<button class="btn" id="skinbtn" type="button">Cambiar skin</button>
          <form class="card skinform" id="skinform" hidden novalidate>
            <label class="chk"><input type="checkbox" id="sprem"> Usar mi skin oficial (cuenta premium)</label>
            <div id="sbox"><label for="sfile">Sube tu skin (PNG 64×64)</label><input id="sfile" type="file" accept="image/png"></div>
            <p class="err" id="serr" role="alert"></p>
            <button class="btn solid" id="sgo" type="submit">Guardar</button>
          </form>` : ""}
        </div>
      </div>
      <h3 class="sec">Medallas <span class="muted">(${ids.length})</span></h3>
      <div class="medals" id="medals">${ids.length ? "" : `<p class="muted">Aún no tiene medallas.</p>`}</div>
      ${mine ? `<h3 class="sec">Seguridad</h3>
      <div class="card seg">
        ${justGoogle ? `<p class="ok">Entraste con tu cuenta de Google. Aquí abajo puedes poner una contraseña nueva.</p>` : ""}
        <div id="gstate"></div>
        <hr>
        <form id="pwform" novalidate>
          <label for="npw">Nueva contraseña</label>
          <input id="npw" type="password" minlength="6" autocomplete="new-password">
          <p class="err" id="perr" role="alert"></p>
          <button class="btn solid" id="pgo" type="submit">Cambiar contraseña</button>
        </form>
      </div>` : ""}
      <h3 class="sec">Récords</h3>
      <div class="records">${recs.map(([g, v]) => `<div class="card rec"><h4>${esc(g.name)}</h4>${v === null ? `<span class="muted">Sin récord aún</span>` : `<div class="big">${v} <small>${esc(g.unit)}</small></div>`}</div>`).join("")}</div>`;
    const mw = $("#medals");
    ids.forEach(id => {
      const m = MEDALS[id] || { name: String(id), desc: "", img: "" };
      const el = document.createElement("div"); el.className = "medal"; el.title = m.name + (m.desc ? " — " + m.desc : "");
      const fb = () => { const f = document.createElement("span"); f.className = "mfb"; f.textContent = "🏅"; return f; };
      let ic;
      if (m.img) { ic = document.createElement("img"); ic.alt = ""; ic.src = m.img; ic.onerror = () => ic.replaceWith(fb()); } else ic = fb();
      const b = document.createElement("b"); b.textContent = m.name;
      el.append(ic, b); mw.append(el);
    });
    if (mine) {
      justGoogle = false;
      const gs = $("#gstate");
      const drawG = (msg) => {
        const g = googleInfo();
        gs.innerHTML = (g
          ? `<p>Cuenta de Google: <b class="ok">vinculada</b> (${esc(g.email || "")}). Úsala para recuperar tu cuenta si olvidas la contraseña.</p><button class="btn" id="gun" type="button">Desvincular</button>`
          : `<p class="muted">Vincula tu cuenta de Google (opcional) para poder recuperar tu cuenta si olvidas la contraseña.</p><button class="btn solid" id="gln" type="button">Vincular cuenta de Google</button>`)
          + `<p class="err" id="gmsg" role="alert">${esc(msg || "")}</p>`;
        const b = $("#gun") || $("#gln");
        b.onclick = async () => {
          b.disabled = true;
          const r = await (g ? unlinkGoogle() : linkGoogle());
          if (r === false) { b.disabled = false; return; }
          drawG(r || "");
        };
      };
      drawG();
      $("#pwform").onsubmit = async e => {
        e.preventDefault(); const er = $("#perr"); er.className = "err"; er.textContent = ""; $("#pgo").disabled = true;
        const r = await changePassword($("#npw").value);
        $("#pgo").disabled = false;
        if (r) { er.textContent = r; return; }
        $("#npw").value = ""; er.className = "err ok"; er.textContent = "Contraseña actualizada.";
      };
      const f = $("#skinform");
      $("#skinbtn").onclick = () => { f.hidden = !f.hidden; };
      $("#sprem").onchange = e => $("#sbox").hidden = e.target.checked;
      f.onsubmit = async e => {
        e.preventDefault(); const er = $("#serr"); er.textContent = ""; $("#sgo").disabled = true;
        const r = await updateSkin($("#sprem").checked, $("#sfile").files[0]);
        if (r) { er.textContent = r; $("#sgo").disabled = false; return; }
        renderAuth(); Game.refresh(); renderProfile(p.name);
      };
    }
  } catch (e) { console.warn(e); if (tok === profTok) box.innerHTML = `<p class="muted">No se pudo cargar el perfil.</p>`; }
}

/* ---------- Ranking del juego ---------- */
async function renderRank() {
  const tb = $("#rank");
  try {
    const snap = await getDocs(query(collection(db, "scores"), orderBy("score", "desc"), limit(10)));
    const r = snap.docs.map(d => d.data());
    tb.innerHTML = r.length
      ? r.map((x, i) => `<tr><td>${i + 1}</td><td><span class="pl"><img src="${esc(okAv(x.avatar))}" alt=""><a href="${esc(pLink(x.name))}">${esc(x.name)}</a></span></td><td>${Number(x.score) || 0}</td></tr>`).join("")
      : `<tr><td class="empty">Sé el primero en el ranking.</td></tr>`;
  } catch (e) { console.warn(e); tb.innerHTML = `<tr><td class="empty">No se pudo cargar el ranking.</td></tr>`; }
}
async function saveScore(score) {
  const u = me(); if (!u || !score) return;
  try {
    const ref = doc(db, "scores", u.uid), snap = await getDoc(ref);
    if (snap.exists() && snap.data().score >= score) return;
    await setDoc(ref, { name: u.name, avatar: u.avatar, score });
    renderRank();
  } catch (e) { console.warn(e); }
}

/* ---------- Minijuego ---------- */
const Game = (() => {
  const cv = $("#cv"), c = cv.getContext("2d"), W = 800, GY = 200, S = 36;
  let raf = 0, last = 0, st = "idle", s, face = new Image();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reset = () => ({ y: GY - S, vy: 0, obs: [], tot: [], pts: [], speed: 5, dist: 0, next: 60, totems: 0, inv: 0, clouds: Array.from({ length: 4 }, () => ({ x: rnd(0, W), y: rnd(20, 90) })) });
  function loadFace() { face = new Image(); face.src = (me() || {}).avatar || DEF; }
  function burst(x, y, cols, n) { for (let i = 0; i < n; i++) s.pts.push({ x, y, vx: rnd(-4, 4), vy: rnd(-5, 1), l: rnd(25, 50), c: cols[i % cols.length] }); }
  function jump() {
    if (st === "idle" || st === "over") { s = reset(); st = "run"; return; }
    if (s.y >= GY - S) { s.vy = -12.5; burst(80, GY, ["#7a6a40", "#a89a70"], 6); }
  }
  function cactus(x, h) { // cactus de Minecraft, a bloques
    c.fillStyle = "#2f7d1f"; c.fillRect(x, GY - h, 18, h);
    c.fillStyle = "#3f9b2a"; c.fillRect(x + 2, GY - h, 6, h);
    c.fillStyle = "#1d5412"; for (let i = 0; i < h; i += 12) { c.fillRect(x + 12, GY - h + i + 3, 3, 3); c.fillRect(x + 4, GY - h + i + 8, 3, 3); }
    c.fillStyle = "#0d3a0a"; c.fillRect(x - 3, GY - h + 6, 3, 3); c.fillRect(x + 18, GY - h + 14, 3, 3);
  }
  function totem(x, y) {
    c.fillStyle = "#e8b923"; c.fillRect(x, y, 18, 26); c.fillRect(x - 5, y + 8, 28, 8);
    c.fillStyle = "#2e9e4a"; c.fillRect(x + 3, y + 3, 12, 6); c.fillRect(x + 7, y + 16, 4, 10);
    c.fillStyle = "#fff6c4"; c.fillRect(x + 5, y + 4, 3, 3); c.fillRect(x + 10, y + 4, 3, 3);
  }
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function parts(k) { s.pts.forEach(q => { q.x += q.vx * k; q.y += q.vy * k; q.vy += .25 * k; q.l -= k; }); s.pts = s.pts.filter(q => q.l > 0); }
  function update(k) {
    s.speed = Math.min(14, 5 + s.dist / 2500); s.dist += s.speed * k;
    s.vy += .7 * k; s.y = Math.min(GY - S, s.y + s.vy * k); if (s.y >= GY - S) s.vy = 0;
    s.next -= k * s.speed / 5;
    if (s.next <= 0) {
      const h = rnd(32, 58); s.obs.push({ x: W + 20, w: 18, h });
      if (Math.random() < .2) s.tot.push({ x: W + 20 + rnd(150, 260), y: rnd(95, 135), w: 18, h: 26 });
      s.next = rnd(55, 100);
    }
    s.obs.forEach(o => o.x -= s.speed * k); s.tot.forEach(t => t.x -= s.speed * k);
    s.clouds.forEach(cl => { cl.x -= .4 * k; if (cl.x < -60) { cl.x = W + 20; cl.y = rnd(20, 90); } });
    s.obs = s.obs.filter(o => o.x > -30); s.tot = s.tot.filter(t => t.x > -30);
    const p = { x: 64, y: s.y + 4, w: S - 8, h: S - 8 };
    s.tot = s.tot.filter(t => { if (hit(p, t)) { s.totems++; burst(t.x + 9, t.y + 13, ["#e8b923", "#2e9e4a", "#fff6c4"], 22); return false; } return true; });
    if (s.inv > 0) s.inv -= k;
    else for (const o of s.obs) if (hit(p, { x: o.x, y: GY - o.h, w: o.w, h: o.h })) {
      if (s.totems > 0) { s.totems--; s.inv = 60; burst(80, s.y + 18, ["#e8b923", "#2e9e4a", "#fff6c4", "#ffffff"], 50); s.obs = s.obs.filter(q => q !== o); }
      else { st = "over"; burst(80, s.y + 18, ["#f7b41e", "#ff8a3d", "#fff"], 36); saveScore(Math.floor(s.dist / 10)); }
      break;
    }
    parts(k);
  }
  function draw() {
    c.clearRect(0, 0, W, 240); c.imageSmoothingEnabled = false;
    c.fillStyle = "rgba(247,180,30,.07)"; s.clouds.forEach(cl => c.fillRect(cl.x, cl.y, 56, 14));
    c.fillStyle = "rgba(247,180,30,.5)"; c.fillRect(0, GY, W, 2);
    c.fillStyle = "rgba(247,180,30,.12)"; for (let x = -(s.dist % 40); x < W; x += 40) c.fillRect(x, GY + 10, 14, 3);
    s.obs.forEach(o => cactus(o.x, o.h)); s.tot.forEach(t => totem(t.x, t.y + Math.sin(s.dist / 15) * 3));
    if (!(st === "over") && (s.inv <= 0 || Math.floor(s.inv / 4) % 2)) c.drawImage(face, 60, s.y, S, S);
    if (st === "over") { c.globalAlpha = .4; c.drawImage(face, 60, s.y, S, S); c.globalAlpha = 1; }
    s.pts.forEach(q => { c.fillStyle = q.c; c.globalAlpha = Math.min(1, q.l / 20); c.fillRect(q.x, q.y, 4, 4); }); c.globalAlpha = 1;
    c.fillStyle = "#f5ecd6"; c.font = "700 16px Barlow, sans-serif"; c.textAlign = "right"; c.fillText(String(Math.floor(s.dist / 10)).padStart(5, "0"), W - 16, 28);
    if (s.totems) { totem(16, 12); c.textAlign = "left"; c.fillText("×" + s.totems, 44, 30); }
    c.textAlign = "center"; c.fillStyle = "#f7b41e";
    if (st === "idle") c.fillText("Pulsa espacio o toca para empezar", W / 2, 120);
    if (st === "over") { c.font = "800 24px Barlow, sans-serif"; c.fillText("Fin del juego", W / 2, 100); c.font = "500 15px Barlow, sans-serif"; c.fillStyle = "#a89a70"; c.fillText(me() ? "Pulsa para reintentar" : "Inicia sesión para guardar tu puntaje", W / 2, 126); }
  }
  function loop(t) {
    const k = Math.min(2.5, (t - last) / 16.67 || 1); last = t;
    if (st === "run") update(k); else parts(k);
    draw(); raf = requestAnimationFrame(loop);
  }
  const key = e => { if (!$("#v-juego").hidden && ["Space", "ArrowUp"].includes(e.code) && modal.hidden) { e.preventDefault(); jump(); } };
  addEventListener("keydown", key);
  cv.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
  return {
    show() { s = s || reset(); loadFace(); cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); },
    refresh() { loadFace(); }
  };
})();

/* ---------- Arranque ---------- */
$("#yr").textContent = new Date().getFullYear();
route();
onAuthStateChanged(auth, async user => {
  if (signing) return; // signUp/logIn manejan su propio perfil
  await loadProfile(user);
  ready = true; renderAuth(); Game.refresh();
  refreshView();
});
})();
