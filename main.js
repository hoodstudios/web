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

import { createAvatar, createFigureSet, loadSkin, ANIMS } from "./avatar.js";

(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const headUrl = n => "https://minotar.net/helm/" + encodeURIComponent(n) + "/64.png";
const DEF = headUrl("MHF_Steve");
const okAv = a => typeof a === "string" && (a.startsWith("https://minotar.net/helm/") || a.startsWith("data:image/png;base64,")) ? a : DEF;
/* Fuentes de la skin completa, en orden de preferencia; la última es local para que siempre haya algo que mostrar */
const LOCAL_SKIN = "img/skin-default.png";
function skinSources(name, avatar, md) {
  if (md && md.skin) return [md.skin, LOCAL_SKIN];
  const prem = okAv(avatar) === headUrl(name), n = encodeURIComponent(name);
  return [...(prem ? ["https://minotar.net/skin/" + n, "https://mc-heads.net/skin/" + n] : []), "https://minotar.net/skin/char", LOCAL_SKIN];
}
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
  if (cur === "juego") Arcade.enter(); else Arcade.leave();
  $("#dc").hidden = cur !== "inicio"; dispatchEvent(new Event("dcsync"));
  window.scrollTo(0, 0); if (cur === "inicio") fitSub();
}
addEventListener("hashchange", route);

/* ---------- Galería del inicio (ruleta) ---------- */
/* Todas las imágenes de la carpeta "galeria/" aparecen solas aquí. Para obtener la lista:
 *  1) galeria/galeria.json (lo genera GitHub Actions en cada subida, ver .github/workflows/galeria.yml)
 *  2) si no existe, se le pregunta a la API de GitHub por el contenido de la carpeta (GitHub Pages). */
const GAL_DIR = "galeria", GAL_MS = 5000, GAL_EXT = /\.(png|jpe?g|webp|gif|avif)$/i;
let GALERIA = [], gi = 0, gtimer = 0, gimgs = [];
const gal = $("#gal");
async function galList() {
  const sort = l => l.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  // 1) GitHub Pages: pregunta a GitHub qué hay en la carpeta (siempre actualizado)
  try {
    const m = location.hostname.match(/^([^.]+)\.github\.io$/), repo = location.pathname.split("/")[1];
    if (m && repo) {
      const r = await fetch(`https://api.github.com/repos/${m[1]}/${repo}/contents/${GAL_DIR}`);
      if (r.ok) { const l = (await r.json()).filter(f => f.type === "file" && GAL_EXT.test(f.name)).map(f => f.name); if (l.length) return sort(l); }
    }
  } catch (e) {}
  // 2) servidor local (python -m http.server, Live Server...): lee el listado de la carpeta
  try {
    const r = await fetch(GAL_DIR + "/"); if (r.ok && /html/.test(r.headers.get("content-type") || "")) {
      const l = [...(await r.text()).matchAll(/href="([^"?#]+)"/g)].map(x => decodeURIComponent(x[1].split("/").pop())).filter(n => GAL_EXT.test(n));
      if (l.length) return sort([...new Set(l)]);
    }
  } catch (e) {}
  // 3) lista generada por GitHub Actions (galeria/galeria.json)
  try { const r = await fetch(GAL_DIR + "/galeria.json", { cache: "no-cache" }); if (r.ok) { const j = await r.json(); if (Array.isArray(j) && j.length) return j; } } catch (e) {}
  return ["equipo.png"];
}
function gshow(n) {
  if (!gimgs.length) return;
  const old = gimgs[gi]; gi = (n + gimgs.length) % gimgs.length;
  if (old && old !== gimgs[gi]) { old.classList.remove("on"); old.classList.add("prev"); setTimeout(() => old.classList.remove("prev"), 1200); }
  const cur = gimgs[gi]; cur.classList.remove("prev"); void cur.offsetWidth; cur.classList.add("on");
}
let glocked = false;
const glock = $("#glock");
function gauto() { clearInterval(gtimer); if (!glocked && gimgs.length > 1) gtimer = setInterval(() => gshow(gi + 1), GAL_MS); }
glock.onclick = () => { glocked = !glocked; glock.setAttribute("aria-pressed", glocked); glock.title = glock.ariaLabel = glocked ? "Soltar imagen (reanudar carrusel)" : "Fijar imagen (pausa el carrusel)"; gauto(); };
$("#gprev").onclick = () => { gshow(gi - 1); gauto(); }; $("#gnext").onclick = () => { gshow(gi + 1); gauto(); };
galList().then(async list => {
  const loaded = await Promise.all(list.map(f => new Promise(ok => { const i = new Image(), src = GAL_DIR + "/" + encodeURIComponent(f); i.alt = ""; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; })));
  gimgs = loaded.filter(Boolean); gimgs.forEach(i => gal.append(i));
  const multi = gimgs.length > 1; $("#gprev").hidden = $("#gnext").hidden = glock.hidden = !multi;
  gshow(0); gauto();
});
/* Splash rotativo (estilo Minecraft): una frase al azar de Splashes.txt cada vez que se abre/recarga la página.
 * En Splashes.txt: un splash por línea; las líneas vacías y las que empiezan con # se ignoran. */
(async () => {
  const el = $("#splash");
  try {
    const r = await fetch("Splashes.txt", { cache: "no-cache" }); if (!r.ok) return;
    const list = (await r.text()).split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
    if (!list.length) return;
    el.textContent = list[Math.floor(Math.random() * list.length)]; el.hidden = false;
  } catch (e) {}
})();
/* Alinea "Hub.Of.Original.Development" al ancho de HOOD/STUDIO */
function fitSub() {
  const h = $(".hl h1"), p = $(".hl .sub"); if (!h || !p || $("#v-inicio").hidden) return;
  p.style.fontSize = "10px"; p.style.fontSize = (10 * h.getBoundingClientRect().width / p.scrollWidth) + "px";
}
addEventListener("resize", fitSub); if (document.fonts) document.fonts.ready.then(fitSub);
/* Botón flotante de Discord: no se puede quitar, pero se arrastra a cualquier parte de la pantalla */
(() => {
  const el = $("#dc"), KEY = "dcpos2"; let moved = false;
  const clamp = (x, y) => [Math.min(Math.max(0, x), innerWidth - el.offsetWidth), Math.min(Math.max(0, y), innerHeight - el.offsetHeight)];
  const put = (x, y) => { [x, y] = clamp(x, y); el.style.left = x + "px"; el.style.top = y + "px"; };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ fx: el.offsetLeft / innerWidth, fy: el.offsetTop / innerHeight })); } catch (e) {} };
  let init = null; try { init = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  const place = () => init && typeof init.fx === "number" ? put(init.fx * innerWidth, init.fy * innerHeight) : put(16, innerHeight - el.offsetHeight - 112);
  place(); if (document.fonts) document.fonts.ready.then(place);
  addEventListener("resize", () => { if (el.hidden) return; init = { fx: el.offsetLeft / innerWidth, fy: el.offsetTop / innerHeight }; place(); });
  addEventListener("dcsync", place);
  let sx, sy, ox, oy, id = null;
  el.addEventListener("pointerdown", e => { if (e.button) return; id = e.pointerId; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; moved = false; });
  el.addEventListener("pointermove", e => {
    if (e.pointerId !== id) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    if (!moved) { moved = true; try { el.setPointerCapture(id); } catch (_) {} el.classList.add("drag"); }
    put(ox + dx, oy + dy);
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
const openM = m => {
  last = document.activeElement; form.reset(); form.hidden = false; $(".tabs").hidden = false; $("#gstep").hidden = true; $("#gerr").textContent = "";
  setMode(m); $("#skinbox").hidden = true; modal.hidden = false; $("#un").focus();
};
/* Paso opcional tras registrarse: vincular Google (el clic nuevo evita que el navegador bloquee la ventana emergente) */
function showStep() { form.hidden = true; $(".tabs").hidden = true; $("#glogin").hidden = true; $("#gstep").hidden = false; $("#glink").focus(); }
$("#glink").onclick = async () => {
  const b = $("#glink"), e = $("#gerr"); e.textContent = ""; b.disabled = true;
  const r = await linkGoogle(); b.disabled = false;
  if (r === false) return;
  if (r) return void (e.textContent = r);
  closeM(); refreshView();
};
$("#gskip").onclick = () => closeM();
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
  renderAuth(); Game.refresh(); refreshView();
  if (mode === "signup") showStep(); else closeM();
};

/* ---------- Filas con avatar de cuerpo completo (compartidas por Jugadores y Ranking) ---------- */
const figCache = new Map();
function figsFor(uid, name, avatar) {                        // { img, slim } de la skin del jugador (se guarda en caché)
  const key = uid + "|" + avatar;
  if (!figCache.has(key)) figCache.set(key, (async () => {
    let md = null;
    try { const d = await getDoc(doc(db, "avatars", uid)); md = d.exists() ? d.data() : null; } catch (e) { /* sin skin guardada */ }
    const img = await loadSkin(skinSources(name, avatar, md));
    return img ? { img, slim: !!(md && md.slim) } : null;
  })());
  return figCache.get(key);
}
function drawTrim(cv, fig) {                                 // recorta el hueco transparente para que el avatar llene su espacio
  let x = 0, y = 0, w = fig.width, h = fig.height;
  try {
    const d = fig.getContext("2d").getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    if (x1 >= 0) { x = x0; y = y0; w = x1 - x0 + 1; h = y1 - y0 + 1; }
  } catch (e) { const pt = fig.padT || 0, pb = fig.padB || 0; y = pt; h = fig.height - pt - pb; }
  cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fig, x, y, w, h, 0, 0, w, h);
}
async function paintFig(cv) {
  const { uid, name, avatar } = cv.dataset, f = await figsFor(uid, name, avatar);
  if (f) { try { drawTrim(cv, createFigureSet(f.img, { slim: f.slim, k: 3 }).get("idle", 0).fig); cv.classList.add("ready"); return; } catch (e) { console.warn(e); } }
  const im = new Image(); im.onload = () => { cv.width = im.width; cv.height = im.height; cv.getContext("2d").drawImage(im, 0, 0); cv.classList.add("ready"); }; im.src = okAv(avatar);
}
const figIO = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { figIO.unobserve(e.target); paintFig(e.target); } }), { rootMargin: "300px" }) : null;
function rowEl(o) {                                          // o: { uid, name, avatar, pos, val, unit, sub, mine, sm, i }
  const a = document.createElement("a"), p = o.pos;
  a.className = "prow" + (p <= 3 ? " t" + p : "") + (o.mine ? " mine" : "") + (o.sm ? " sm" : "");
  a.href = pLink(o.name); a.dataset.uid = o.uid; a.style.setProperty("--i", Math.min(o.i || 0, 14));
  a.innerHTML = `<span class="plate"><b class="pos"></b><span class="pfig"><canvas data-uid="${esc(o.uid)}" data-name="${esc(o.name)}" data-avatar="${esc(o.avatar || "")}" aria-hidden="true"></canvas></span></span>
    <span class="pnm"><b>${esc(o.name)}</b><span class="sub"></span></span><span class="pval"></span>`;
  a.addEventListener("animationend", e => { if (e.target === a) a.classList.add("done"); });
  setRow(a, o);
  const cv = a.querySelector("canvas"); if (o.now || !figIO) paintFig(cv); else figIO.observe(cv);
  return a;
}
function setRow(a, o) {                                      // actualiza posición, colores de top y estadística
  a.className = a.className.replace(/\bt[123]\b/g, "").trim() + (o.pos <= 3 ? " t" + o.pos : "");
  const pos = a.querySelector(".pos"); pos.textContent = o.pos; pos.dataset.l = String(o.pos).length;
  a.querySelector(".sub").textContent = o.sub || "";
  a.querySelector(".pval").innerHTML = `${esc(o.val)}${o.unit ? `<small>${esc(o.unit)}</small>` : ""}`;
}
function flip(box, mutate) {                                 // anima el cambio de orden (FLIP)
  const first = new Map([...box.children].map(e => [e, e.getBoundingClientRect().top]));
  mutate();
  [...box.children].forEach(e => {
    if (!first.has(e)) return; const dy = first.get(e) - e.getBoundingClientRect().top;
    if (dy) e.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: 650, easing: "cubic-bezier(.22,.8,.3,1)" });
  });
}

/* ---------- Jugadores ---------- */
const SORTS = [
  { id: "medallas", label: "Medallas" }, { id: "monedas", label: "Monedas" },
  { id: "nuevos", label: "Más nuevos" }, { id: "antiguos", label: "Más antiguos" },
  { id: "puntuaciones", label: "Mejores puntuaciones" }
];
let plSort = "medallas", plData = [], plRows = new Map();
const coinsOf = d => Number(d.coins ?? d.monedas) || 0;
const msOf = d => { try { return d.createdAt.toMillis(); } catch (e) { return 0; } };
const shortDate = ts => { try { return ts.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return "—"; } };
const nf = n => Number(n).toLocaleString("es-MX");
function statOf(u, mode) {
  const med = medalCount(u), co = coinsOf(u), sc = u.score;
  switch (mode) {
    case "monedas": return { val: nf(co), unit: "monedas", sub: med + (med === 1 ? " medalla" : " medallas") };
    case "nuevos": case "antiguos": return { val: shortDate(u.createdAt), unit: mode === "nuevos" ? "se unió" : "miembro desde", sub: med + (med === 1 ? " medalla" : " medallas") };
    case "puntuaciones": return { val: sc ? nf(sc) : "—", unit: sc ? "puntos" : "sin récord", sub: med + (med === 1 ? " medalla" : " medallas") };
    default: return { val: nf(med), unit: med === 1 ? "medalla" : "medallas", sub: nf(co) + " monedas" };
  }
}
function sortPlayers(list, mode) {
  const nm = (a, b) => String(a.name).localeCompare(String(b.name));
  const f = {
    medallas: (a, b) => medalCount(b) - medalCount(a) || nm(a, b),
    monedas: (a, b) => coinsOf(b) - coinsOf(a) || nm(a, b),
    nuevos: (a, b) => msOf(b) - msOf(a) || nm(a, b),
    antiguos: (a, b) => (msOf(a) || Infinity) - (msOf(b) || Infinity) || nm(a, b),
    puntuaciones: (a, b) => (b.score || 0) - (a.score || 0) || nm(a, b)
  }[mode];
  return [...list].sort(f);
}
function paintPlayers(animate) {
  const box = $("#players"), list = sortPlayers(plData, plSort);
  if (!list.length) { box.innerHTML = `<p class="empty">Aún no hay jugadores registrados.</p>`; plRows.clear(); return; }
  const first = !box.querySelector(".prow"), mine = me() && me().uid;
  const apply = () => list.forEach((u, i) => {
    const o = { uid: u.id, name: u.name, avatar: u.avatar, pos: i + 1, i, mine: u.id === mine, ...statOf(u, plSort) };
    let el = plRows.get(u.id);
    if (!el) { el = rowEl(o); plRows.set(u.id, el); } else setRow(el, o);
    el.classList.toggle("mine", o.mine);
    box.append(el);                                          // append ordena los nodos existentes
  });
  if (first || !animate) { box.innerHTML = ""; if (first) plRows.clear(); apply(); } else flip(box, apply);
}
async function renderPlayers() {
  const box = $("#players");
  try {
    const [snap, sc] = await Promise.all([
      getDocs(query(collection(db, "players"), limit(100))),
      getDocs(query(collection(db, "scores"), limit(500))).catch(() => null)
    ]);
    const scores = new Map(); if (sc) sc.docs.forEach(d => scores.set(d.id, Math.floor(Number(d.data().score)) || 0));
    plData = snap.docs.map(d => ({ id: d.id, ...d.data(), score: scores.get(d.id) || 0 }));
    const had = !!box.querySelector(".prow"); plRows = had ? plRows : new Map();
    paintPlayers(had);
  } catch (e) { console.warn(e); box.innerHTML = `<p class="empty">No se pudo cargar la lista de jugadores.</p>`; }
}
(() => {                                                     // menú del filtro
  const root = $("#flt"), btn = $("#flt-btn"), menu = $("#flt-menu"), lab = $("#flt-label");
  const ck = `<svg class="ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>`;
  menu.innerHTML = SORTS.map((s, k) => `<button class="flt-opt" type="button" role="option" data-s="${s.id}" style="--k:${k}" aria-selected="${s.id === plSort}">${s.label}${ck}</button>`).join("");
  const set = o => { root.classList.toggle("open", o); btn.setAttribute("aria-expanded", o); };
  btn.onclick = e => { e.stopPropagation(); set(!root.classList.contains("open")); };
  menu.onclick = e => {
    const b = e.target.closest(".flt-opt"); if (!b) return;
    plSort = b.dataset.s; lab.textContent = SORTS.find(s => s.id === plSort).label;
    menu.querySelectorAll(".flt-opt").forEach(x => x.setAttribute("aria-selected", x === b));
    set(false); paintPlayers(true);
  };
  document.addEventListener("click", e => { if (!root.contains(e.target)) set(false); });
  addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
})();

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
        <canvas id="acv" role="img" aria-label="Avatar de ${esc(p.name)} en su habitación"></canvas>
        <div class="avatar-tools"><button class="btn solid mini" id="avatar-download" type="button">Descargar avatar</button></div>
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
    avatarFx = createAvatar($("#acv"), { skinSources: skinSources(p.name, p.avatar, md), slim: !!(md && md.slim), name: p.name });
    $("#avatar-download").onclick = () => avatarFx.download();
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

/* ---------- Mundos del Arcade y ranking ---------- */
/* Para añadir un minijuego: pon su "game" (col = colección de Firestore, field = campo del récord). Los mundos con game:null salen como "Próximamente". */
const WORLDS = [
  { id: "desierto", name: "Desierto", acc: "#f2c14e", img: "img/mundos/desierto.png", bg: "img/fondos/desierto.jpg",
    game: { id: "runner", name: "Salta el cactus", col: "scores", field: "score", unit: "puntos" } },
  { id: "end", name: "El End", acc: "#b57cf0", img: "img/mundos/end.png", bg: "img/fondos/end.jpg", b: .8, game: null },
  { id: "oceano", name: "Océano", acc: "#3fd0e0", img: "img/mundos/oceano.png", bg: "img/fondos/oceano.jpg", game: null }
];
let selWorld = 0, rankTok = 0;

async function renderRank() {
  const w = WORLDS[selWorld], box = $("#rank"), tok = ++rankTok;
  if (!w.game) { box.classList.add("end"); box.innerHTML = `<p class="empty">Este mundo aún no tiene ranking.</p>`; Mine.render(null); return; }
  box.classList.remove("end");
  try {
    let docs;
    try { docs = (await getDocs(query(collection(db, w.game.col), orderBy(w.game.field, "desc"), limit(200)))).docs; }
    catch (e) { console.warn("ranking: consulta ordenada falló, ordeno en el navegador", e); docs = (await getDocs(query(collection(db, w.game.col), limit(200)))).docs; }
    if (tok !== rankTok) return;
    const all = docs.map(d => ({ id: d.id, ...d.data() })).filter(x => Number(x[w.game.field]) > 0).sort((a, b) => Number(b[w.game.field]) - Number(a[w.game.field]));
    const u = me(), top = all.slice(0, 10);
    box.innerHTML = "";
    if (!top.length) box.innerHTML = `<p class="empty">Sé el primero en el ranking.</p>`;
    top.forEach((x, i) => box.append(rowEl({ uid: x.id, name: String(x.name || "?"), avatar: x.avatar, pos: i + 1, i, sm: true, now: true,
      mine: !!u && u.uid === x.id, val: nf(Math.floor(Number(x[w.game.field])) || 0), unit: w.game.unit })));
    box.scrollTop = 0; box.classList.toggle("end", top.length <= 5);
    const idx = u ? all.findIndex(x => x.id === u.uid) : -1;
    let best = idx >= 0 ? Math.floor(Number(all[idx][w.game.field])) : null;
    if (u && best === null) { try { const s = await getDoc(doc(db, w.game.col, u.uid)); if (s.exists()) best = Math.floor(Number(s.data()[w.game.field])) || null; } catch (e) { /* sin récord */ } }
    if (tok === rankTok) Mine.render({ pos: idx >= 0 ? idx + 1 : null, best });
  } catch (e) { console.warn(e); if (tok === rankTok) { box.classList.add("end"); box.innerHTML = `<p class="empty">No se pudo cargar el ranking${e && e.code ? " (" + esc(e.code) + ")" : ""}.</p>`; } }
}
async function saveScore(score) {
  const u = me(), g = WORLDS[0].game; if (!u || !score) return;
  try {
    const ref = doc(db, g.col, u.uid), snap = await getDoc(ref);
    if (snap.exists() && snap.data()[g.field] >= score) return;
    await setDoc(ref, { name: u.name, avatar: u.avatar, [g.field]: Math.floor(score) });
    if (WORLDS[selWorld].game === g) renderRank();
  } catch (e) { console.warn("No se pudo guardar el puntaje:", e); Mine.note(`No se pudo guardar tu puntaje${e && e.code ? " (" + e.code + ")" : ""}.`); }
}

/* Tu sección del ranking: fija bajo la tabla, con tu personaje en animación idle */
const Mine = (() => {
  const box = $("#rk-me"); let set = null, raf = 0, cv = null, tok = 0, last = -1, shown = "";
  const loop = t => {
    if (cv && set) { const i = Math.floor(t / 1000 * ANIMS.idle.fps) % ANIMS.idle.frames.length;
      if (i !== last) { last = i; const { fig } = set.get("idle", i); cv.width = fig.width; cv.height = fig.height; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fig, 0, 0); } }
    raf = requestAnimationFrame(loop);
  };
  async function load(u) {
    const k = ++tok, f = u ? await figsFor(u.uid, u.name, u.avatar) : await loadSkin(["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN]).then(i => i && { img: i, slim: false });
    if (k !== tok || !f) return; set = createFigureSet(f.img, { slim: f.slim, k: 3 }); last = -1;
  }
  return {
    render(d) {
      const u = me(); if (!d) { box.hidden = true; return; } box.hidden = false;
      const g = WORLDS[selWorld].game, sig = (u ? u.uid : "guest") + "|" + (u && u.avatar);
      box.innerHTML = `<div class="you"><canvas aria-hidden="true"></canvas></div>
        <div class="who"><small>Tu posición</small><b>${u ? esc(u.name) : "Invitado"}</b>
          ${u ? `<span>${d.best ? "Tu récord: " + nf(d.best) + " " + esc(g.unit) : "Aún sin récord"}</span>` : `<span>Inicia sesión para entrar al ranking</span>`}</div>
        <div class="pp"><b>${d.pos ? "#" + d.pos : "—"}</b><small>${d.pos ? "de la clasificación" : u ? (d.best ? "fuera del top 200" : "sin clasificar") : ""}</small></div>
        <p class="rk-note" id="rk-note" hidden></p>`;
      cv = box.querySelector("canvas");
      if (sig !== shown || !set) { shown = sig; set = null; load(u); } else last = -1;
      if (!raf) raf = requestAnimationFrame(loop);
    },
    note(t) { const n = $("#rk-note"); if (n) { n.textContent = t; n.hidden = false; } },
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    reset() { shown = ""; }
  };
})();

/* ---------- Minijuego ---------- */
const Game = (() => {
  const cv = $("#cv"), c = cv.getContext("2d"), W = 800, GY = 200, S = 36, B = 24, BIOME_AT = 21000, MAXT = 3;
  const IMG = {}; ["totem", "cactus", "flor", "arena", "arena-roja"].forEach(n => { const i = new Image(); i.src = "img/" + n + ".png"; IMG[n] = i; });
  const ok = i => i.complete && i.naturalWidth > 0;
  let raf = 0, last = 0, st = "idle", s, figs = null, figKey = "", figTok = 0, aT = 0, aAir = false;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const reset = () => {
    cv.style.background = "";
    return { y: GY - S, vy: 0, obs: [], tot: [], pts: [], speed: 5, dist: 0, next: 420, totems: 0, inv: 0, boost: 0, biome: 0, banner: 0,
      clouds: Array.from({ length: 4 }, () => ({ x: rnd(0, W), y: rnd(20, 90) })),
      mesas: Array.from({ length: 3 }, (_, i) => ({ x: i * 300 + rnd(0, 120), w: rnd(120, 200), h: rnd(50, 95) })) };
  };
  /* El personaje es el avatar Drop del jugador (con su skin); si no ha iniciado sesión, el Steve por defecto */
  async function loadFace() {
    const u = me(), key = u ? u.uid + "|" + u.avatar : "guest";
    if (key === figKey && figs) return;
    const tok = ++figTok; figKey = key;
    let md = null;
    if (u) { try { const d = await getDoc(doc(db, "avatars", u.uid)); md = d.exists() ? d.data() : null; } catch (e) { /* sin skin guardada */ } }
    const srcs = u ? skinSources(u.name, u.avatar, md) : ["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN];
    const img = await loadSkin(srcs);
    if (tok !== figTok) return;
    figs = img ? createFigureSet(img, { slim: !!(md && md.slim), k: 2 }) : null;
    if (!figs) figKey = "";
  }
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
  /* Dibuja al avatar mirando a la derecha (hacia donde corre): andar a 1,5× en el suelo y salto a 1,5× en el aire */
  function player() {
    if (!figs) { c.fillStyle = "#f7b41e"; c.fillRect(60, s.y, S, S); return; }
    const air = s.y < GY - S - 0.5;
    if (air !== aAir) { aAir = air; aT = 0; }
    const anim = st !== "run" ? "idle" : air ? "jump" : "walk";
    const a = ANIMS[anim], n = a.frames.length, i = anim === "jump" ? Math.min(7, Math.floor(aT)) : Math.floor(aT) % n;
    const { fig } = figs.get(anim, i);                       // sin desplazamiento vertical propio: la altura la pone la física del juego
    c.save(); c.translate(78, 0); c.scale(-1, 1);
    c.drawImage(fig, -figs.w / 2, s.y + S - figs.feet);
    c.restore();
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
    if (st !== "over" && (s.inv <= 0 || Math.floor(s.inv / 4) % 2)) player();
    if (st === "over") { c.globalAlpha = .4; player(); c.globalAlpha = 1; }
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
    aT += k / 60 * (st !== "run" ? ANIMS.idle.fps : aAir ? ANIMS.jump.fps * 1.5 : ANIMS.walk.fps * 1.5);   // andar y salto a 1,5×
    draw(); raf = requestAnimationFrame(loop);
  }
  const key = e => { if (!$("#v-juego").hidden && !$("#gamecard").hidden && ["Space", "ArrowUp"].includes(e.code) && modal.hidden) { e.preventDefault(); jump(); } };
  addEventListener("keydown", key);
  cv.addEventListener("pointerdown", e => { e.preventDefault(); jump(); });
  return {
    show() { s = s || reset(); loadFace(); cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); },
    refresh() { loadFace(); }
  };
})();

/* ---------- Arcade: carrusel vertical de mundos ---------- */
const Arcade = (() => {
  const N = WORLDS.length, mod = i => ((i % N) + N) % N, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const stage = $("#wc-stage"), bgs = $("#ar-bgs"), dots = $("#wc-dots"), mainEl = $("#ar-main");
  let pos = 0, target = 0, sel = -1, raf = 0, from = 0, t0 = 0, lastWheel = 0, active = false, drag = null;
  const cur = () => mod(Math.round(target));

  const cards = WORLDS.map((w, i) => {
    const el = document.createElement("article");
    el.className = "wc-card"; el.dataset.i = i; el.dataset.w = w.id; el.style.setProperty("--acc", w.acc);
    el.setAttribute("role", "option"); el.setAttribute("aria-label", w.name + (w.game ? " — " + w.game.name : " — Próximamente"));
    el.innerHTML = `<div class="cover" style="background-image:url('${w.bg}')"></div><img class="ico" src="${w.img}" alt="" draggable="false">
      ${w.game ? "" : `<span class="tag">Próximamente</span>`}<div class="lbl">${esc(w.name)}</div>`;
    stage.append(el);
    const bg = document.createElement("div"); bg.className = "ar-bg"; bg.style.backgroundImage = `url("${w.bg}")`; if (w.b) bg.style.setProperty("--b", w.b); bgs.append(bg);
    const d = document.createElement("i"); d.setAttribute("role", "button"); d.setAttribute("aria-label", w.name); d.onclick = () => go(i); dots.append(d);
    return { el, bg, d };
  });

  function layout() {
    const near = mod(Math.round(pos));
    cards.forEach((c, i) => {
      let d = i - pos; d -= N * Math.round(d / N);
      const a = Math.abs(d), s = Math.sign(d), t = Math.min(a, 1);
      const y = s * (94 * t + 40 * Math.max(0, Math.min(a, 2) - 1)), z = -Math.min(a, 2) * 150, rx = clamp(-d * 30, -48, 48), sc = 1 - .16 * t;
      const op = a < 1.25 ? 1 : Math.max(0, 1 - (a - 1.25) / .5);
      c.el.style.transform = `translateY(${y}%) translateZ(${z}px) rotateX(${rx}deg) scale(${sc})`;
      c.el.style.filter = a < .02 ? "none" : `blur(${(t * 3.5).toFixed(2)}px) brightness(${(1 - t * .5).toFixed(2)})`;
      c.el.style.opacity = op; c.el.style.zIndex = 20 - Math.round(a * 4);
      c.el.style.pointerEvents = op < .05 ? "none" : "";
      c.el.classList.toggle("cur", i === near); c.el.setAttribute("aria-selected", i === near);
    });
  }
  function apply(k) {                                          // un mundo se ha elegido: fondo, título, juego y ranking
    sel = k; selWorld = k; const w = WORLDS[k], g = w.game;
    cards.forEach((c, i) => { c.bg.classList.toggle("on", i === k); c.d.classList.toggle("on", i === k); });
    mainEl.style.setProperty("--acc", w.acc);
    $("#ar-world").textContent = g ? w.name : "Próximamente"; $("#ar-name").textContent = g ? g.name : w.name;
    $("#rk-game").textContent = g ? g.name : w.name;
    $("#gamecard").hidden = !g; $("#soonbox").hidden = !!g;
    if (g) { if (active) Game.show(); } else { Game.stop(); $("#soon-img").src = w.img; $("#soon-p").textContent = w.name + " todavía está en construcción."; }
    mainEl.classList.remove("swap"); void mainEl.offsetWidth; mainEl.classList.add("swap");
    renderRank();
  }
  function sync() { cards.forEach((c, i) => c.d.classList.toggle("on", i === cur())); if (cur() !== sel) apply(cur()); }

  const DUR = 700, ease = x => 1 - Math.pow(1 - x, 3.4);
  function tween(to) { target = to; from = pos; t0 = performance.now(); sync(); if (!raf) raf = requestAnimationFrame(step); }
  function step(now) {
    const x = Math.min(1, (now - t0) / DUR); pos = from + (target - from) * ease(x); layout();
    if (x < 1) raf = requestAnimationFrame(step); else { raf = 0; pos = target; layout(); }
  }
  const halt = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  function go(i) { const base = Math.round(target); tween(base + mod(i - mod(base) + N / 2) - N / 2); }
  const move = dir => tween(Math.round(target) + dir);
  $("#wc-up").onclick = () => move(-1); $("#wc-down").onclick = () => move(1);

  $("#wc").addEventListener("wheel", e => {                    // la rueda cambia de mundo
    if (Math.abs(e.deltaY) < 6) return; e.preventDefault();
    const now = performance.now(); if (now - lastWheel < 520) return; lastWheel = now; move(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  stage.addEventListener("keydown", e => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); move(e.key === "ArrowUp" ? -1 : 1); }
  });
  stage.addEventListener("pointerdown", e => {
    if (e.button) return; halt();
    drag = { id: e.pointerId, y0: e.clientY, p0: pos, moved: false, card: e.target.closest(".wc-card"), t: performance.now(), y: e.clientY, v: 0 };
  });
  stage.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y0, stepPx = (cards[0].el.offsetHeight || 190) * .84;
    if (!drag.moved && Math.abs(dy) > 8) { drag.moved = true; stage.classList.add("drag"); try { stage.setPointerCapture(drag.id); } catch (_) {} }
    if (!drag.moved) return;
    const now = performance.now(); drag.v = (e.clientY - drag.y) / Math.max(1, now - drag.t); drag.y = e.clientY; drag.t = now;
    pos = drag.p0 - dy / stepPx; layout();
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; stage.classList.remove("drag");
    if (!d.moved) { if (d.card) { const i = +d.card.dataset.i; if (i !== cur()) go(i); } return; }
    const dy = e.clientY - d.y0, stepPx = (cards[0].el.offsetHeight || 190) * .84, base = Math.round(d.p0);
    let t = Math.round(pos - d.v * 160 / stepPx); if (t === base && Math.abs(dy) > 40) t = base + (dy < 0 ? 1 : -1);
    tween(t);
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", e => { if (drag && e.pointerId === drag.id) { drag = null; stage.classList.remove("drag"); tween(Math.round(pos)); } });

  layout();
  return {
    enter() { active = true; sel = -1; layout(); sync(); Mine.reset(); Mine.start(); },
    leave() { active = false; Game.stop(); Mine.stop(); },
    refresh() { if (active && sel >= 0) { Mine.reset(); renderRank(); } },
    playable: () => active && !!WORLDS[sel] && !!WORLDS[sel].game
  };
})();

/* ---------- Arranque ---------- */
$("#yr").textContent = new Date().getFullYear();
route();
onAuthStateChanged(auth, async user => {
  if (signing) return; // signUp/logIn manejan su propio perfil
  await loadProfile(user);
  ready = true; renderAuth(); Game.refresh(); Arcade.refresh();
  refreshView();
});
})();
