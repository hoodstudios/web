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

import { createAvatar } from "./avatar.js";

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
let avatarFx = null;
const stopAvatar = () => { if (avatarFx) { avatarFx.destroy(); avatarFx = null; } };
const me = () => profile;

/* ---------- Vistas ---------- */
const V = ["inicio", "proyectos", "calendario", "jugadores", "perfil", "juego", "mercado", "creditos"];
function hashParts() { const [h, ...r] = location.hash.slice(1).split("/"); let a = ""; try { a = decodeURIComponent(r.join("/")); } catch (e) {} return [h, a]; }
function refreshView() { const [h, a] = hashParts(); if (h === "jugadores") renderPlayers(); else if (h === "perfil") renderProfile(a); }
function route() {
  stopAvatar();
  const [h, arg] = hashParts(), cur = V.includes(h) ? h : "inicio";
  V.forEach(v => $("#v-" + v).hidden = v !== cur);
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.v === (["jugadores", "perfil", "juego", "mercado"].includes(cur) ? "comunidad" : cur)));
  if (cur === "jugadores") renderPlayers();
  if (cur === "perfil") renderProfile(arg);
  if (cur === "juego") { renderRank(); Game.show(); } else Game.stop();
  window.scrollTo(0, 0); if (cur === "inicio") fitSub();
}
addEventListener("hashchange", route);

/* ---------- Galería del inicio (ruleta) ---------- */
/* Todas las imágenes de la carpeta "galeria/" aparecen solas aquí. Para obtener la lista:
 *  1) galeria/galeria.json (lo genera GitHub Actions en cada subida, ver .github/workflows/galeria.yml)
 *  2) si no existe, se le pregunta a la API de GitHub por el contenido de la carpeta (GitHub Pages). */
const GAL_DIR = "galeria", GAL_MS = 5000, GAL_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
let GALERIA = [], gi = 0, gtimer = 0, gimgs = [];
const gal = $("#gal"), gdots = $("#gdots");
async function galList() {
  try { const r = await fetch(GAL_DIR + "/galeria.json", { cache: "no-cache" }); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; } } catch (e) {}
  try {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/), repo = location.pathname.split("/")[1];
    if (m && repo) {
      const r = await fetch(`https://api.github.com/repos/${m[1]}/${repo}/contents/${GAL_DIR}`);
      if (r.ok) return (await r.json()).filter(f => f.type === "file" && GAL_EXT.test(f.name)).map(f => f.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
  } catch (e) {}
  return [];
}
function gshow(n) {
  if (!gimgs.length) return;
  const old = gimgs[gi]; gi = (n + gimgs.length) % gimgs.length;
  if (old && old !== gimgs[gi]) { old.classList.remove("on"); old.classList.add("prev"); setTimeout(() => old.classList.remove("prev"), 1200); }
  const cur = gimgs[gi]; cur.classList.remove("prev"); void cur.offsetWidth; cur.classList.add("on");
  [...gdots.children].forEach((d, k) => d.classList.toggle("on", k === gi));
}
function gauto() { clearInterval(gtimer); if (gimgs.length > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) gtimer = setInterval(() => gshow(gi + 1), GAL_MS); }
$("#gprev").onclick = () => { gshow(gi - 1); gauto(); }; $("#gnext").onclick = () => { gshow(gi + 1); gauto(); };
galList().then(list => {
  GALERIA = list.map(f => GAL_DIR + "/" + encodeURIComponent(f));
  gimgs = GALERIA.map(src => { const i = new Image(); i.alt = ""; i.decoding = "async"; i.src = src; gal.append(i); return i; });
  gdots.innerHTML = GALERIA.map(() => "<i></i>").join("");
  const multi = GALERIA.length > 1; $("#gprev").hidden = $("#gnext").hidden = gdots.hidden = !multi;
  gshow(0); gauto();
});
/* Alinea "Hub.Of.Original.Development" al ancho de HOOD/STUDIO */
function fitSub() {
  const h = $(".hl h1"), p = $(".hl .sub"); if (!h || !p || $("#v-inicio").hidden) return;
  p.style.fontSize = "10px"; p.style.fontSize = (10 * h.getBoundingClientRect().width / p.scrollWidth) + "px";
}
addEventListener("resize", fitSub); if (document.fonts) document.fonts.ready.then(fitSub);
/* Botón flotante de Discord: no se puede quitar, pero se arrastra a cualquier parte de la pantalla */
(() => {
  const el = $("#dc"), KEY = "dcpos"; let moved = false;
  const clamp = (x, y) => [Math.min(Math.max(0, x), innerWidth - el.offsetWidth), Math.min(Math.max(0, y), innerHeight - el.offsetHeight)];
  const put = (x, y) => { [x, y] = clamp(x, y); el.style.left = x + "px"; el.style.top = y + "px"; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ fx: el.offsetLeft / innerWidth, fy: el.offsetTop / innerHeight })); } catch (e) {} };
  let init = null; try { init = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const place = () => init && typeof init.fx === "number" ? put(init.fx * innerWidth, init.fy * innerHeight) : put(innerWidth - el.offsetWidth - 16, innerHeight - el.offsetHeight - 16);
  place(); if (document.fonts) document.fonts.ready.then(place);
  addEventListener("resize", () => { init = { fx: el.offsetLeft / innerWidth, fy: el.offsetTop / innerHeight }; place(); });
  let sx, sy, ox, oy, id = null;
  el.addEventListener("pointerdown", e => { if (e.button) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; moved = false; el.setPointerCapture(id); });
  el.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true; el.classList.add("drag"); put(ox + dx, oy + dy);
  });
  const end = e => { if (e.pointerId !== id) return; id = null; el.classList.remove("drag"); if (moved) { init = { fx: el.offsetLeft / innerWidth, fy: el.offsetTop / innerHeight }; save(); } };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("click", e => { if (moved) { e.preventDefault(); moved = false; } }, true); // arrastrar no abre el enlace
  el.addEventListener("dragstart", e => e.preventDefault());
})();

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
/* Lee el PNG de la skin: devuelve la cabeza (avatar), la skin completa normalizada y si es de brazos delgados */
function readSkin(file) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return no(new Error("size"));
      const sk = document.createElement("canvas"); sk.width = 64; sk.height = img.height;
      const sx = sk.getContext("2d", { willReadFrequently: true }); sx.drawImage(img, 0, 0);
      const hd = document.createElement("canvas"); hd.width = hd.height = 64;
      const hx = hd.getContext("2d"); hx.imageSmoothingEnabled = false;
      hx.drawImage(sk, 8, 8, 8, 8, 0, 0, 64, 64);
      if (img.height === 64) hx.drawImage(sk, 40, 8, 8, 8, 0, 0, 64, 64);
      let slim = false;
      if (img.height === 64) { const d = sx.getImageData(55, 20, 1, 12).data; slim = [3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47].every(i => d[i] === 0); }
      const skin = sk.toDataURL("image/png");
      if (skin.length > 30000) return no(new Error("big"));
      ok({ head: hd.toDataURL("image/png"), skin, slim });
    };
    img.onerror = () => no(new Error("img")); img.src = url;
  });
}
const skinErr = e => e && e.message === "big" ? "La skin pesa demasiado. Prueba con otra o comprímela." : "La skin debe ser un PNG de 64×64 (o 64×32).";
async function loadProfile(user) {
  profile = null;
  if (!user) return;
  try {
    const s = await getDoc(doc(db, "players", user.uid));
    if (s.exists()) { const d = s.data(); profile = { uid: user.uid, name: d.name, avatar: okAv(d.avatar), medalIds: Array.isArray(d.medalIds) ? d.medalIds : [] }; }
  } catch (e) { console.warn(e); }
}
async function signUp(name, pw, prem, file) {
  let avatar = DEF, skinData = null, slim = false;
  if (prem) avatar = headUrl(name);
  else if (file) { try { const r = await readSkin(file); avatar = r.head; skinData = r.skin; slim = r.slim; } catch (e) { return skinErr(e); } }
  signing = true;
  try {
    let cred;
    try { cred = await createUserWithEmailAndPassword(auth, mail(name), pw); } catch (e) { return fe(e); }
    try { await setDoc(doc(db, "players", cred.user.uid), { name, avatar, medalIds: [], createdAt: serverTimestamp() }); }
    catch (e) { try { await deleteUser(cred.user); } catch (_) {} return fe(e); }
    try { await setDoc(doc(db, "avatars", cred.user.uid), { skin: skinData, slim }); } catch (e) { console.warn(e); }
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
    d.innerHTML = `<img src="${esc(u.avatar)}" alt="Mi perfil">`;
    box.append(d);
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
    const snap = await getDocs(query(collection(db, "players"), limit(100)));
    const list = snap.docs.map(d => d.data()).sort((a, b) => medalCount(b) - medalCount(a) || String(a.name).localeCompare(String(b.name)));
    tb.innerHTML = list.length
      ? list.map((u, i) => `<tr><td>${i + 1}</td><td><span class="pl"><img src="${esc(okAv(u.avatar))}" alt=""><a href="${esc(pLink(u.name))}">${esc(u.name)}</a></span></td><td>${medalCount(u)}</td></tr>`).join("")
      : `<tr><td colspan="3" class="empty">Aún no hay jugadores registrados.</td></tr>`;
  } catch (e) { console.warn(e); tb.innerHTML = `<tr><td colspan="3" class="empty">No se pudo cargar la lista de jugadores.</td></tr>`; }
}

/* ---------- Perfil ---------- */
const fmtDate = ts => { try { return ts.toDate().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return "—"; } };
async function updateSkin(prem, file, slimChk) {
  const u = me(); if (!u) return "Inicia sesión primero.";
  let avatar, skinData = null, slim = !!slimChk;
  if (prem) avatar = headUrl(u.name);
  else if (file) { try { const r = await readSkin(file); avatar = r.head; skinData = r.skin; slim = r.slim; } catch (e) { return skinErr(e); } }
  else return "Sube tu skin o marca la opción de cuenta premium.";
  try {
    await updateDoc(doc(db, "players", u.uid), { avatar });
    await setDoc(doc(db, "avatars", u.uid), { skin: skinData, slim });
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
    const mdoc = getDoc(doc(db, "avatars", uid)).then(x => x.exists() ? x.data() : null).catch(() => null);
    const recs = await Promise.all(GAMES.map(async g => {
      try { const s = await getDoc(doc(db, g.col, uid)); return [g, s.exists() ? Number(s.data()[g.field]) || 0 : null]; }
      catch (e) { return [g, null]; }
    }));
    if (tok !== profTok) return;
    const md = await mdoc;
    if (tok !== profTok) return;
    stopAvatar();
    const ids = Array.isArray(p.medalIds) ? p.medalIds : [];
    box.innerHTML = `
      <div class="card prof">
        <img class="pface" src="${esc(okAv(p.avatar))}" alt="Cabeza de ${esc(p.name)}">
        <div class="pinfo">
          <h2>${esc(p.name)}</h2>
          <p class="muted">Miembro desde ${esc(fmtDate(p.createdAt))}</p>
          ${mine ? `<button class="btn" id="skinbtn" type="button">Cambiar skin</button><button class="btn" id="outbtn" type="button">Cerrar sesión</button>
          <form class="card skinform" id="skinform" hidden novalidate>
            <label class="chk"><input type="checkbox" id="sprem"> Usar mi skin oficial (cuenta premium)</label>
            <div id="slimrow" hidden><label class="chk"><input type="checkbox" id="sslim"> Mi skin usa brazos delgados (modelo Alex)</label></div>
            <div id="sbox"><label for="sfile">Sube tu skin (PNG 64×64)</label><input id="sfile" type="file" accept="image/png"></div>
            <p class="err" id="serr" role="alert"></p>
            <button class="btn solid" id="sgo" type="submit">Guardar</button>
          </form>` : ""}
        </div>
      </div>
      <h3 class="sec">Avatar</h3>
      <div class="card avatarbox">
        <canvas id="acv" role="img" aria-label="Avatar de ${esc(p.name)}"></canvas>
        <p class="muted small">Haz clic en ella para acariciarla, o en el suelo para que camine hacia allí.</p>
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
    const CHAR = "https://minotar.net/skin/char";
    const srcName = okAv(p.avatar) === headUrl(p.name) ? p.name : "char";
    const srcs = md && md.skin ? [md.skin, CHAR] : ["https://minotar.net/skin/" + encodeURIComponent(srcName), CHAR];
    avatarFx = createAvatar($("#acv"), { skinSources: srcs, slim: !!(md && md.slim) });
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
      $("#outbtn").onclick = async () => { try { await signOut(auth); } catch (e) { console.warn(e); } location.hash = "#inicio"; };
      $("#skinbtn").onclick = () => { f.hidden = !f.hidden; };
      $("#sprem").onchange = e => { $("#sbox").hidden = e.target.checked; $("#slimrow").hidden = !e.target.checked; };
      f.onsubmit = async e => {
        e.preventDefault(); const er = $("#serr"); er.textContent = ""; $("#sgo").disabled = true;
        const r = await updateSkin($("#sprem").checked, $("#sfile").files[0], $("#sslim").checked);
        if (r) { er.textContent = r; $("#sgo").disabled = false; return; }
        renderAuth(); Game.refresh(); renderProfile(p.name);
      };
    }
  } catch (e) { console.warn(e); if (tok === profTok) box.innerHTML = `<p class="muted">No se pudo cargar el perfil.</p>`; }
}

/* ---------- Ranking del juego ---------- */
async function renderRank() {
  const tb = $("#rank");
  const row = (x, i) => {
    const n = String(x.name || "?"), mine = me() && me().name === n;
    return `<tr${mine ? ' class="mine"' : ""}><td>${i + 1}</td><td><span class="pl"><img src="${esc(okAv(x.avatar))}" alt=""><a href="${esc(pLink(n))}">${esc(n)}</a></span></td><td>${Math.floor(Number(x.score)) || 0}</td></tr>`;
  };
  try {
    let docs;
    try { docs = (await getDocs(query(collection(db, "scores"), orderBy("score", "desc"), limit(10)))).docs; }
    catch (e) { console.warn("ranking: consulta ordenada falló, ordeno en el navegador", e); docs = (await getDocs(query(collection(db, "scores"), limit(200)))).docs; }
    const r = docs.map(d => d.data()).filter(x => Number(x.score) > 0).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 10);
    tb.innerHTML = r.length ? r.map(row).join("") : `<tr><td colspan="3" class="empty">Sé el primero en el ranking.</td></tr>`;
  } catch (e) { console.warn(e); tb.innerHTML = `<tr><td colspan="3" class="empty">No se pudo cargar el ranking${e && e.code ? " (" + esc(e.code) + ")" : ""}.</td></tr>`; }
}
async function saveScore(score) {
  const u = me(); if (!u || !score) return;
  try {
    const ref = doc(db, "scores", u.uid), snap = await getDoc(ref);
    if (snap.exists() && snap.data().score >= score) return;
    await setDoc(ref, { name: u.name, avatar: u.avatar, score: Math.floor(score) });
    renderRank();
  } catch (e) { console.warn("No se pudo guardar el puntaje:", e); const t = $("#rank"); if (t) t.insertAdjacentHTML("beforeend", `<tr><td colspan="3" class="empty">No se pudo guardar tu puntaje${e && e.code ? " (" + esc(e.code) + ")" : ""}.</td></tr>`); }
}

/* ---------- Minijuego ---------- */
const Game = (() => {
  const cv = $("#cv"), c = cv.getContext("2d"), W = 800, GY = 200, S = 36, B = 24, BIOME_AT = 21000, MAXT = 3;
  const IMG = {}; ["totem", "cactus", "flor", "arena", "arena-roja"].forEach(n => { const i = new Image(); i.src = "img/" + n + ".png"; IMG[n] = i; });
  const ok = i => i.complete && i.naturalWidth > 0;
  let raf = 0, last = 0, st = "idle", s, face = new Image();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reset = () => {
    cv.style.background = "";
    return { y: GY - S, vy: 0, obs: [], tot: [], pts: [], speed: 5, dist: 0, next: 420, totems: 0, inv: 0, boost: 0, biome: 0, banner: 0,
      clouds: Array.from({ length: 4 }, () => ({ x: rnd(0, W), y: rnd(20, 90) })),
      mesas: Array.from({ length: 3 }, (_, i) => ({ x: i * 300 + rnd(0, 120), w: rnd(120, 200), h: rnd(50, 95) })) };
  };
  function loadFace() { face = new Image(); face.src = (me() || {}).avatar || DEF; }
  function burst(x, y, cols, n) { for (let i = 0; i < n; i++) s.pts.push({ x, y, vx: rnd(-4, 4), vy: rnd(-5, 1), l: rnd(25, 50), c: cols[i % cols.length] }); }
  function jump() {
    if (st === "idle" || st === "over") { s = reset(); st = "run"; return; }
    if (s.y >= GY - S) { s.vy = -12.5; burst(80, GY, ["#7a6a40", "#a89a70"], 6); }
  }
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function parts(k) { s.pts.forEach(q => { q.x += q.vx * k; q.y += q.vy * k; q.vy += .25 * k; q.l -= k; }); s.pts = s.pts.filter(q => q.l > 0); }
  function update(k) {
    const bi = s.dist / 10 >= BIOME_AT ? 1 : 0;
    if (bi !== s.biome) { s.biome = bi; s.banner = 170; cv.style.background = "linear-gradient(#3a1606,#000)"; }
    // velocidad: sube despacio y se detiene en un tope, para que siempre sea cuestión de habilidad
    s.speed = Math.min(bi ? 11.5 : 10.5, 5 + s.dist / 6000);
    const v = s.speed * k; s.dist += v;
    s.vy += .7 * k; s.y = Math.min(GY - S, s.y + s.vy * k); if (s.y >= GY - S) s.vy = 0;
    s.next -= v;
    if (s.next <= 0) { // separación mínima = tiempo de salto + margen de reacción: siempre es posible
      const r = Math.random(), n = r < .45 ? 1 : r < .85 ? 2 : 3, fl = n < 3 && Math.random() < .18;
      s.obs.push({ x: W + 20, n, h: n * B, fl });
      if (s.totems < MAXT && !s.tot.length && Math.random() < .05) s.tot.push({ x: W + 20 + rnd(90, 170), y: rnd(100, 130), w: 26, h: 26 });
      s.next = s.speed * 42 + rnd(60, 300) + (fl ? s.speed * 10 : 0);
    }
    s.obs.forEach(o => o.x -= v); s.tot.forEach(t => t.x -= v);
    s.clouds.forEach(cl => { cl.x -= .4 * k; if (cl.x < -60) { cl.x = W + 20; cl.y = rnd(20, 90); } });
    s.mesas.forEach(m => { m.x -= 1.2 * k; if (m.x + m.w < 0) { m.x = W + rnd(0, 100); m.w = rnd(120, 200); m.h = rnd(50, 95); } });
    s.obs = s.obs.filter(o => o.x > -30); s.tot = s.tot.filter(t => t.x > -40);
    const p = { x: 64, y: s.y + 4, w: S - 8, h: S - 8 };
    s.tot = s.tot.filter(t => { if (hit(p, t)) { s.totems = Math.min(MAXT, s.totems + 1); burst(t.x + 13, t.y + 13, ["#e8b923", "#2e9e4a", "#fff6c4"], 22); return false; } return true; });
    if (s.inv > 0) s.inv -= k; if (s.boost > 0) s.boost -= k; if (s.banner > 0) s.banner -= k;
    for (const o of s.obs) {
      if (o.fl && hit(p, { x: o.x, y: GY - o.h - 16, w: B, h: 16 })) { // flor: impulso que te saca de ritmo, no mata
        o.fl = false; s.vy = -17; s.boost = 22; burst(o.x + 12, GY - o.h - 8, ["#d2708a", "#fcb0ad", "#fa8685"], 24); continue;
      }
      if (s.inv <= 0 && s.boost <= 0 && hit(p, { x: o.x + 2, y: GY - o.h, w: B - 4, h: o.h })) {
        if (s.totems > 0) { s.totems--; s.inv = 60; burst(80, s.y + 18, ["#e8b923", "#2e9e4a", "#fff6c4", "#ffffff"], 50); s.obs = s.obs.filter(q => q !== o); }
        else { st = "over"; burst(80, s.y + 18, ["#f7b41e", "#ff8a3d", "#fff"], 36); saveScore(Math.floor(s.dist / 10)); }
        break;
      }
    }
    parts(k);
  }
  function draw() {
    c.clearRect(0, 0, W, 240); c.imageSmoothingEnabled = false;
    if (s.biome) { c.fillStyle = "rgba(190,90,30,.25)"; s.mesas.forEach(m => { c.fillRect(m.x, GY - m.h, m.w, m.h); }); c.fillStyle = "rgba(220,120,50,.4)"; s.mesas.forEach(m => c.fillRect(m.x, GY - m.h, m.w, 4)); }
    else { c.fillStyle = "rgba(247,180,30,.07)"; s.clouds.forEach(cl => c.fillRect(cl.x, cl.y, 56, 14)); }
    const fl = IMG[s.biome ? "arena-roja" : "arena"]; c.globalAlpha = .75;
    for (let x = -(s.dist % 40); x < W; x += 40) { if (ok(fl)) c.drawImage(fl, x, GY, 40, 40); else { c.fillStyle = s.biome ? "#b5541c" : "#d9ca9a"; c.fillRect(x, GY, 40, 40); } }
    c.globalAlpha = 1;
    s.obs.forEach(o => {
      for (let i = 0; i < o.n; i++) { if (ok(IMG.cactus)) c.drawImage(IMG.cactus, o.x, GY - (i + 1) * B, B, B); else { c.fillStyle = "#3f9b2a"; c.fillRect(o.x, GY - (i + 1) * B, B, B); } }
      if (o.fl && ok(IMG.flor)) c.drawImage(IMG.flor, o.x, GY - o.h - B, B, B);
    });
    s.tot.forEach(t => { const y = t.y + Math.sin(s.dist / 15) * 3; if (ok(IMG.totem)) c.drawImage(IMG.totem, t.x, y, 26, 26); else { c.fillStyle = "#e8b923"; c.fillRect(t.x, y, 26, 26); } });
    if (st !== "over" && (s.inv <= 0 || Math.floor(s.inv / 4) % 2)) c.drawImage(face, 60, s.y, S, S);
    if (st === "over") { c.globalAlpha = .4; c.drawImage(face, 60, s.y, S, S); c.globalAlpha = 1; }
    s.pts.forEach(q => { c.fillStyle = q.c; c.globalAlpha = Math.min(1, q.l / 20); c.fillRect(q.x, q.y, 4, 4); }); c.globalAlpha = 1;
    c.fillStyle = "#f5ecd6"; c.font = "700 16px 'Noto Sans', sans-serif"; c.textAlign = "right"; c.fillText(String(Math.floor(s.dist / 10)).padStart(5, "0"), W - 16, 28);
    for (let i = 0; i < s.totems; i++) if (ok(IMG.totem)) c.drawImage(IMG.totem, 14 + i * 26, 10, 22, 22);
    c.textAlign = "center"; c.fillStyle = "#f7b41e";
    if (s.banner > 0) { c.globalAlpha = Math.min(1, s.banner / 40); c.font = "800 22px 'Noto Sans', sans-serif"; c.fillText("Desierto meseta", W / 2, 70); c.globalAlpha = 1; }
    c.font = "700 16px 'Noto Sans', sans-serif";
    if (st === "idle") c.fillText("Pulsa espacio o toca para empezar", W / 2, 120);
    if (st === "over") { c.font = "800 24px 'Noto Sans', sans-serif"; c.fillText("Fin del juego", W / 2, 100); c.font = "500 15px 'Noto Sans', sans-serif"; c.fillStyle = "#a89a70"; c.fillText(me() ? "Pulsa para reintentar" : "Inicia sesión para guardar tu puntaje", W / 2, 126); }
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
