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
  getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp, increment
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
  { id: "runner", name: "Desert Rush", col: "scores", field: "score", unit: "puntos" }
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
const SUB = ["juego", "jugadores", "mercado"];      // secciones de la barra lateral (de arriba abajo)
let prevView = null, outTimer = 0, subIdx = -1;
const pill = $("#subnav .sn-pill");
/* La píldora amarilla se coloca con la posición real del icono activo (funciona igual en vertical y en horizontal) */
function movePill(i, instant) {
  const a = $$("#subnav a")[i]; if (!a || !pill) return;
  if (instant) pill.style.transition = "none";
  pill.style.transform = `translate(${a.offsetLeft}px,${a.offsetTop}px)`;
  if (instant) { void pill.offsetWidth; pill.style.transition = ""; }
}
/* Jugadores: la página no hace scroll, solo la tabla. Se calcula la altura que queda libre bajo la cabecera. */
function fitPlayers() {
  const w = $(".plwrap"); if (!w || $("#v-jugadores").hidden) return;
  let y = 0, el = w; while (el) { y += el.offsetTop; el = el.offsetParent; }   // offsetTop ignora las animaciones de entrada
  w.style.height = Math.max(240, innerHeight - y - (matchMedia("(max-width:860px)").matches ? 92 : 20)) + "px";
}
addEventListener("resize", () => { movePill(subIdx, true); fitPlayers(); });
if (document.fonts) document.fonts.ready.then(() => { movePill(subIdx, true); fitPlayers(); });
const OUTSTY = ["top", "left", "width", "right", "margin", "box-sizing"];
function route() {
  stopAvatar();
  const [h, arg] = hashParts(), cur = V.includes(h) ? h : "inicio", prev = prevView, curEl = $("#v-" + cur);
  const sub = prev && prev !== cur && SUB.includes(prev) && SUB.includes(cur), dir = sub ? Math.sign(SUB.indexOf(cur) - SUB.indexOf(prev)) : 0;
  const prevBox = sub ? $("#v-" + prev).getBoundingClientRect() : null;   // dónde está ahora la sección que se va (antes de ocultarla)
  clearTimeout(outTimer);
  V.forEach(v => { const e = $("#v-" + v); e.classList.remove("vin", "vout", "from-b", "from-t", "to-t", "to-b"); OUTSTY.forEach(p => e.style.removeProperty(p)); e.hidden = v !== cur; });
  if (prev && prev !== cur) {                                 // la sección nueva entra suave; entre secciones de la barra, deslizando en vertical
    void curEl.offsetWidth; curEl.classList.add("vin", dir > 0 ? "from-b" : dir < 0 ? "from-t" : "fade");
    if (sub) {                                                // la anterior se queda congelada en su sitio y se desliza hacia fuera
      const pe = $("#v-" + prev); pe.hidden = false;
      Object.assign(pe.style, { top: prevBox.top + "px", left: prevBox.left + "px", width: prevBox.width + "px", right: "auto", margin: "0", boxSizing: "border-box" });
      pe.classList.add("vout", dir > 0 ? "to-t" : "to-b");
      outTimer = setTimeout(() => { pe.hidden = true; pe.classList.remove("vout", "to-t", "to-b"); OUTSTY.forEach(p => pe.style.removeProperty(p)); }, 340);
    }
  }
  prevView = cur;
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.v === (["jugadores", "perfil", "juego", "mercado"].includes(cur) ? "comunidad" : cur)));
  const sn = $("#subnav"), si = SUB.indexOf(cur), was = sn.classList.contains("show");
  sn.hidden = false; sn.classList.toggle("show", si >= 0);
  if (si >= 0) { subIdx = si; movePill(si, !was); }            // si la barra ya estaba visible, la píldora se desliza; si no, aparece en su sitio
  $$("#subnav a").forEach((a, i) => a.classList.toggle("on", i === si));
  if (cur === "jugadores") renderPlayers();
  if (cur === "perfil") renderProfile(arg);
  if (cur === "juego") Arcade.enter(); else Arcade.leave();
  document.body.classList.toggle("noscroll", cur === "juego");
  document.body.classList.toggle("plfix", cur === "jugadores");
  if (cur === "jugadores") { fitPlayers(); requestAnimationFrame(fitPlayers); }
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
    if (s.exists()) { const d = s.data(); profile = { uid: user.uid, name: d.name, avatar: okAv(d.avatar), medalIds: Array.isArray(d.medalIds) ? d.medalIds : [], xp: Math.floor(Number(d.xp)) || 0, coins: Number(d.coins ?? d.monedas) || 0 }; }
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
    profile = { uid: cred.user.uid, name, avatar, medalIds: [], xp: 0, coins: 0 };
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
    <span class="pnm"><b>${esc(o.name)}</b><span class="lv"></span><span class="sub"></span></span><span class="pval"></span>`;
  a.addEventListener("animationend", e => { if (e.target === a) a.classList.add("done"); });
  setRow(a, o);
  const cv = a.querySelector("canvas"); if (o.now || !figIO) paintFig(cv); else figIO.observe(cv);
  return a;
}
function setRow(a, o) {                                      // actualiza posición, colores de top y estadística
  a.className = a.className.replace(/\bt[123]\b/g, "").trim() + (o.pos <= 3 ? " t" + o.pos : "");
  const pos = a.querySelector(".pos"); pos.textContent = o.pos; pos.dataset.l = String(o.pos).length;
  a.querySelector(".sub").textContent = o.sub || "";
  const lv = a.querySelector(".lv"); lv.innerHTML = lvHtml(o.xp || 0); lvAnim(lv);
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
  { id: "xp", label: "Nivel de XP" }, { id: "medallas", label: "Medallas" }, { id: "monedas", label: "Monedas" },
  { id: "nuevos", label: "Más nuevos" }, { id: "antiguos", label: "Más antiguos" },
  { id: "puntuaciones", label: "Mejores puntuaciones" }
];
let plSort = "xp", plData = [], plRows = new Map();
const coinsOf = d => Number(d.coins ?? d.monedas) || 0;
const msOf = d => { try { return d.createdAt.toMillis(); } catch (e) { return 0; } };
const shortDate = ts => { try { return ts.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return "—"; } };
const nf = n => Number(n).toLocaleString("es-MX");
/* Nivel de XP: empiezas en el nivel 0 y la primera barra son 100 puntos; cada nivel pide más (nivel L → L+1 = 100 + 10·L + 12·L²).
 * Nivel 30 ≈ 110 mil XP en total (días de juego reales); nivel 100 ≈ 4 millones (posible, pero a largo plazo). */
const xpNeed = L => 100 + 10 * L + 12 * L * L;
const xpOf = d => Math.floor(Number(d && d.xp)) || 0;
function xpInfo(total) { let x = Math.max(0, Math.floor(Number(total) || 0)), L = 0, n = xpNeed(0); while (x >= n && L < 999) { x -= n; L++; n = xpNeed(L); } return { lvl: L, cur: x, need: n, pct: x / n }; }
const lvHtml = xp => { const i = xpInfo(xp); return `<em>Nv ${i.lvl}</em><i class="xbar" title="${nf(i.cur)} / ${nf(i.need)} XP"><u data-w="${(i.pct * 100).toFixed(1)}"></u></i>`; };
const lvAnim = root => requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll(".xbar u").forEach(u => { u.style.width = u.dataset.w + "%"; })));
function statOf(u, mode) {
  const med = medalCount(u), co = coinsOf(u), sc = u.score;
  switch (mode) {
    case "xp": { const i = xpInfo(xpOf(u)); return { val: "Nv " + i.lvl, unit: nf(xpOf(u)) + " XP", sub: med + (med === 1 ? " medalla" : " medallas") }; }
    case "monedas": return { val: nf(co), unit: "monedas", sub: med + (med === 1 ? " medalla" : " medallas") };
    case "nuevos": case "antiguos": return { val: shortDate(u.createdAt), unit: mode === "nuevos" ? "se unió" : "miembro desde", sub: med + (med === 1 ? " medalla" : " medallas") };
    case "puntuaciones": return { val: sc ? nf(sc) : "—", unit: sc ? "puntos" : "sin récord", sub: med + (med === 1 ? " medalla" : " medallas") };
    default: return { val: nf(med), unit: med === 1 ? "medalla" : "medallas", sub: nf(co) + " monedas" };
  }
}
function sortPlayers(list, mode) {
  const nm = (a, b) => String(a.name).localeCompare(String(b.name));
  const f = {
    xp: (a, b) => xpOf(b) - xpOf(a) || nm(a, b),
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
    const o = { uid: u.id, name: u.name, avatar: u.avatar, pos: i + 1, i, mine: u.id === mine, xp: xpOf(u), ...statOf(u, plSort) };
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
  lab.textContent = SORTS.find(s => s.id === plSort).label;
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
    const ids = Array.isArray(p.medalIds) ? p.medalIds : [], xpT = xpOf(p), xi = xpInfo(xpT);
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
      <div class="card lvcard"><div class="lvbig"><small>Nivel</small><b>${xi.lvl}</b></div>
        <div class="lvmain"><div class="xbar big"><u data-w="${(xi.pct * 100).toFixed(1)}"></u></div>
          <p class="muted">${nf(xi.cur)} / ${nf(xi.need)} XP para el nivel ${xi.lvl + 1} · ${nf(xpT)} XP en total</p></div></div>
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
    lvAnim(box);
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
    game: { id: "runner", name: "Desert Rush", col: "scores", field: "score", unit: "puntos" } },
  { id: "end", name: "Elytra Fly", acc: "#b57cf0", img: "img/mundos/end.png", bg: "img/fondos/end.jpg", b: .8, game: null },
  { id: "oceano", name: "Coral Stack", acc: "#3fd0e0", img: "img/mundos/oceano.png", bg: "img/fondos/oceano.jpg", game: null }
];
let selWorld = 0, rankTok = 0;

/* El ranking de cada minijuego usa las mismas filas que Jugadores (rowEl): placa de bloque, avatar de cuerpo completo y animaciones */
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
    const xps = new Map(); try { (await getDocs(query(collection(db, "players"), limit(300)))).docs.forEach(d => xps.set(d.id, xpOf(d.data()))); } catch (e) { /* sin niveles */ }
    if (tok !== rankTok) return;
    const u = me(), top = all.slice(0, 50);
    box.innerHTML = "";
    if (!top.length) box.innerHTML = `<p class="empty">Sé el primero en el ranking.</p>`;
    top.forEach((x, i) => box.append(rowEl({ uid: x.id, name: String(x.name || "?"), avatar: x.avatar, pos: i + 1, i, sm: true, now: i < 10,
      mine: !!u && u.uid === x.id, xp: xps.get(x.id) || 0, val: nf(Math.floor(Number(x[w.game.field])) || 0), unit: w.game.unit })));
    box.scrollTop = 0; box.classList.toggle("end", top.length <= 9);
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
  const box = $("#rk-me"); let set = null, crop = null, raf = 0, cv = null, tok = 0, last = -1, shown = "";
  const loop = t => {
    if (cv && set) { const i = Math.floor(t / 1000 * ANIMS.idle.fps) % ANIMS.idle.frames.length;
      if (i !== last) { last = i; const { fig } = set.get("idle", i), [cx, cy, cw, ch] = crop || [0, 0, fig.width, fig.height]; cv.width = cw; cv.height = ch; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fig, cx, cy, cw, ch, 0, 0, cw, ch); } }
    raf = requestAnimationFrame(loop);
  };
  async function load(u) {
    const k = ++tok, f = u ? await figsFor(u.uid, u.name, u.avatar) : await loadSkin(["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN]).then(i => i && { img: i, slim: false });
    if (k !== tok || !f) return; set = createFigureSet(f.img, { slim: f.slim, k: 3 }); last = -1; crop = null;
    try {                                                     // recorte = unión de todos los fotogramas idle: sin huecos transparentes y sin saltitos
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let n = 0; n < ANIMS.idle.frames.length; n++) { const fg = set.get("idle", n).fig, w = fg.width, h = fg.height, d = fg.getContext("2d").getImageData(0, 0, w, h).data;
        for (let j = 0; j < h; j++) for (let q = 0; q < w; q++) if (d[(j * w + q) * 4 + 3] > 8) { if (q < x0) x0 = q; if (q > x1) x1 = q; if (j < y0) y0 = j; if (j > y1) y1 = j; } }
      if (x1 >= 0) crop = [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
    } catch (e) { crop = null; }
  }
  return {
    render(d) {
      const u = me(); if (!d) { box.hidden = true; return; } box.hidden = false;
      const g = WORLDS[selWorld].game, sig = (u ? u.uid : "guest") + "|" + (u && u.avatar);
      const sub = !u ? "Inicia sesión para entrar al ranking" : d.pos ? "Puesto #" + d.pos : d.best ? "Fuera del top 200" : "Aún sin récord";
      box.innerHTML = `<div class="rec"><small>Record</small><b>${d.best ? nf(d.best) : "—"}</b><span>${sub}</span>${u ? `<div class="lv">${lvHtml(u.xp || 0)}</div>` : ""}</div>
        <div class="you"><canvas aria-hidden="true"></canvas></div>
        <p class="rk-note" id="rk-note" hidden></p>`;
      lvAnim(box); cv = box.querySelector("canvas");
      if (sig !== shown || !set) { shown = sig; set = null; load(u); } else last = -1;
      if (!raf) raf = requestAnimationFrame(loop);
    },
    note(t) { const n = $("#rk-note"); if (n) { n.textContent = t; n.hidden = false; } },
    start() { if (!raf) raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    reset() { shown = ""; }
  };
})();

/* ---------- Minijuego: Desert Rush ----------
 * Controles: espacio / ↑ / W / toque = saltar (mantén para saltar más alto, con límite)
 *            ↓ / Shift / S / deslizar hacia abajo = caer más rápido
 * Biomas (por puntaje): Desierto → Templo → Aldea → Desierto rojo → Mesetas → Mineshaft (cueva).
 * Entrar a un bioma da XP (más lejos = más XP); en la Mineshaft la velocidad sube sin tope.
 * Monedas: aparecen al azar, máximo 25 por día (ventana de 24 h desde la primera). XP y monedas se guardan en players/<uid>. */
const Game = (() => {
  const cv = $("#cv"), c = cv.getContext("2d"), S = 36, B = 24, CB = 32, MAXT = 3, COIN_MAX = 25, DAY = 864e5;
  const BIO = [
    { at: 0,    name: "Desierto",            xp: 0 },
    { at: 5000,  name: "Templo del desierto", xp: 40 },
    { at: 15000, name: "Aldea del desierto",  xp: 80 },
    { at: 25000, name: "Desierto rojo",       xp: 130 },
    { at: 35000, name: "Mesetas",             xp: 190 },
    { at: 50000, name: "Mineshaft",           xp: 260 }
  ], CAVE = 5, CAVE_AT = BIO[CAVE].at;
  /* Velocidad: de 5 a 10 en los primeros 6 000 puntos; después sube sin parar, en línea recta y suave */
  const SPD_AT = 6000;                                        // la curva de velocidad es independiente de los biomas
  const spdAt = sc => sc < SPD_AT ? 5 + 5 * sc / SPD_AT : 10 + (sc - SPD_AT) * .0005;
  /* Qué aparece en cada bioma (peso relativo): los obstáculos nuevos se van sumando */
  const POOL = [
    [["cactus", 1]],
    [["cactus", 70], ["husk", 30]],
    [["cactus", 50], ["husk", 25], ["camel", 25]],
    [["cactus", 40], ["husk", 15], ["camel", 15], ["parched", 30]],
    [["cactus", 32], ["husk", 12], ["camel", 12], ["parched", 20], ["pit", 24]],
    [["cart", 30], ["husk", 10], ["parched", 14], ["pit", 22], ["bat", 22]]
  ];
  let W = 800, H = 380, GY = 258, SC = 1;                     // el mundo se adapta a la ventana: W×H lógicos, SC = escala en pantalla
  const IMG = {}; ["totem", "cactus", "flor", "arena", "arena-roja"].forEach(n => { const i = new Image(); i.src = "img/" + n + ".png"; IMG[n] = i; });
  const ok = i => i.complete && i.naturalWidth > 0;
  const TOUCH = matchMedia("(pointer:coarse)").matches;
  let best = 0, bestKey = "";
  let raf = 0, last = 0, st = "idle", s, figs = null, figKey = "", figTok = 0, aT = 0, aAir = false, overAt = 0, py0 = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function fit() {                                           // el lienzo ocupa toda la ventana (altura lógica ≈380, ancho mínimo 480)
    const vw = innerWidth, vh = innerHeight; SC = Math.min(vh / 380, vw / 480);
    const nw = Math.ceil(vw / SC), nh = Math.ceil(vh / SC), ngy = Math.round(nh * .68), d = ngy - GY;
    if (s && d && s.y >= GY - S) s.y += d;
    W = nw; H = nh; GY = ngy; cv.width = W; cv.height = H;
  }
  const reset = () => ({ y: GY - S, vy: 0, obs: [], gaps: [], arrows: [], tot: [], coin: [], pts: [], speed: 5, dist: 0, next: 420,
    totems: 0, inv: 0, boost: 0, dash: 0, hold: 0, holding: false, fast: false, buf: 0, fall: false, shake: 0,
    biome: 0, bt: 0, banner: 0, bname: "", bxp: 0, mile: 0, xp: 0, coins: 0, pxp: 0, pcn: 0,
    dj: 0, djFade: 0, ja: 99, pop: 0, flash: 0, recT: 0, recDone: false, lvUp: 0, lvTxt: "", gainT: 0, gainN: 0, xpGlow: 0, fl: [], xpArr: 0,
    base: (me() && me().xp) || 0, xpShow: (me() && me().xp) || 0,
    clouds: Array.from({ length: 6 }, () => ({ x: rnd(0, W), y: rnd(16, GY * .42) })) });

  /* ---- Sprites pixel art (estilo Minecraft Java): cada píxel del dibujo = 3 unidades del mundo ---- */
  const mk = (rows, pal, px = 3) => {
    const w = Math.max(...rows.map(r => r.length)), cn = document.createElement("canvas"); cn.width = w * px; cn.height = rows.length * px;
    const g = cn.getContext("2d"); rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * px, y * px, px, px); } })); return cn;
  };
  const cartRows = ["RRRRRRRRRR", "IGGGGGGGGI", "IGGGGGGGGI", "IGGGGGGGGI", "IIIIIIIIII", ".KK....KK.", ".KK....KK."];
  const cartPal = { R: "#b9b9c2", I: "#8e8e96", G: "#4a4a52", K: "#222228", W: "#f1f1f1", T: "#c8321e", D: "#8f1f12" };
  const SP = {
    husk: mk(["HHHHHH", "HEHHEH", "HHHHHH", "HHmmHH", "CCCCCC", "HCCCCH", "DCCCCD", "DCCCCD", "PPPPPP", "PPQQPP", "PPQQPP", "BBQQBB"],
      { H: "#9b8860", E: "#2b2218", m: "#6e5d3c", C: "#5f7f86", D: "#4d6a70", P: "#5a4a3a", Q: "#3d3126", B: "#2f261d" }, 4),
    parched: mk(["KKKKKK", "KEKKEK", "KKKKKK", "KTTTTK", "SSRRSS", "S.RR.S", "S.SS.S", "S.RR.S", "..SS..", "SS..SS", "SS..SS", "TT..TT"],
      { K: "#ddd4b2", E: "#2a2418", R: "#b9b08c", S: "#cfc6a2", T: "#8d855f" }, 4),
    camel: mk(["................", "CCC.............", "CECN............", "CCCNN....DDD....", "..CNN...DDDDD...", "...NNCCCCCCCCCCT", "...CCCCCCCCCCCCT", "...CCCCCCCCCCCC.", "...CCCCCCCCCCCC.", "...LL.LL..LL.LL.", "...LL.LL..LL.LL.", "...LL.LL..LL.LL."],
      { C: "#cfa75a", D: "#b88d42", L: "#a47a36", N: "#cfa75a", E: "#2a2118", T: "#b88d42" }, 5),
    cart: mk(cartRows, cartPal, 4),
    tnt: mk(["RRRRRRRRRR", "WWWWWWWWWW", "WKWKKWKWKW", "RRRRRRRRRR", ...cartRows], { ...cartPal, R: "#d23a22" }, 4),
    bat0: mk(["B.......B", "BB.B.B.BB", "BBBBBBBBB", ".BBBBBBB.", "..BrBrB.."], { B: "#3a2f45", r: "#e04a4a" }, 4),
    bat1: mk(["..BBBBB..", ".BBrBrBB.", "BBBBBBBBB", "B.B...B.B"], { B: "#3a2f45", r: "#e04a4a" }, 4),
    coin: mk([".OOOO.", "OYYYYO", "OYwYYO", "OYYYYO", "OYYYYO", ".OOOO."], { O: "#a8730f", Y: "#f5c93a", w: "#fff3b0" })
  };

  /* ---- Fondo dinámico: capas con parallax que cambian con el bioma ---- */
  const hx = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mixc = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgb = (a, al = 1) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;
  const hs = (n, sd) => { const x = Math.sin(n * 127.1 + sd * 311.7) * 43758.5453; return x - Math.floor(x); };   // azar repetible por celda
  const P_A = { sky: ["#27356b", "#c06a4c", "#f6bd6e"].map(hx), hz: hx("#f6bd6e"), sun: hx("#fff0b8"), sunA: 1, grd: hx("#d9ca9a"), dune: ["#dcae63", "#cc9849", "#b9843c"].map(hx), cac: hx("#8d7c52") };
  const P_R = { sky: ["#3a1f4a", "#c9573a", "#f09a58"].map(hx), hz: hx("#f09a58"), sun: hx("#ffd6a0"), sunA: 1, grd: hx("#c98a5a"), dune: ["#c8693f", "#b0552f", "#964426"].map(hx), cac: hx("#8a5b46") };
  const P_M = { sky: ["#2a0d14", "#8f3a22", "#e8894a"].map(hx), hz: hx("#e8894a"), sun: hx("#ffb479"), sunA: 1, grd: hx("#b5541c"), rock: ["#a9573b", "#8c4531", "#74372a"].map(hx) };
  const P_C = { sky: ["#07070b", "#15131b", "#2b2530"].map(hx), hz: hx("#2b2530"), sun: hx("#2b2530"), sunA: 0, grd: hx("#3d3b42") };
  const PAL = [P_A, P_A, P_A, P_R, P_M, P_C], SYK = [.3, .3, .32, .36, .46, .46];
  const ridge = (x, base, amp, wl, sd) => base - amp * (.5 + .5 * (.6 * Math.sin(x / wl + sd) + .4 * Math.sin(x / (wl * .47) + sd * 2.3)));
  function saguaro(x, y, h, col, al) {
    const t = Math.max(3, Math.round(h * .2)), a = Math.round(h * .3);
    c.globalAlpha = al; c.fillStyle = rgb(col);
    c.fillRect(x, y - h, t, h);
    c.fillRect(x - a, y - h * .55, a + t, t); c.fillRect(x - a, y - h * .55 - a, t, a + t);
    c.fillRect(x, y - h * .38, a + t, t); c.fillRect(x + a, y - h * .38 - a * .8, t, a * .8 + t);
  }
  /* Templo del desierto: pirámide escalonada con franja azul y dos torres */
  function temple(x, y, al, hz) {
    const sand = rgb(mixc(hx("#c99a52"), hz, .35)), dark = rgb(mixc(hx("#9d7438"), hz, .35)), blue = rgb(mixc(hx("#3d6f8a"), hz, .35));
    c.globalAlpha = al; c.fillStyle = sand;
    c.fillRect(x - 48, y - 12, 96, 12); c.fillRect(x - 36, y - 24, 72, 12); c.fillRect(x - 24, y - 36, 48, 12); c.fillRect(x - 32, y - 50, 10, 38); c.fillRect(x + 22, y - 50, 10, 38);
    c.fillStyle = blue; c.fillRect(x - 48, y - 8, 96, 3); c.fillStyle = dark; c.fillRect(x - 6, y - 14, 12, 14); c.fillRect(x - 32, y - 50, 10, 3); c.fillRect(x + 22, y - 50, 10, 3);
  }
  /* Aldea del desierto: casas de adobe y un pozo */
  function village(x, y, al, hz) {
    const wall = rgb(mixc(hx("#d8bd86"), hz, .4)), roof = rgb(mixc(hx("#a98443"), hz, .4)), door = rgb(mixc(hx("#6e4f27"), hz, .4)), stone = rgb(mixc(hx("#8a8579"), hz, .4));
    const house = (ox, w, h) => { c.fillStyle = wall; c.fillRect(x + ox, y - h, w, h); c.fillStyle = roof; c.fillRect(x + ox - 2, y - h - 4, w + 4, 5); c.fillStyle = door; c.fillRect(x + ox + w / 2 - 3, y - 9, 6, 9); };
    c.globalAlpha = al; house(-46, 26, 20); house(-12, 24, 26); house(22, 28, 22);
    c.fillStyle = stone; c.fillRect(x + 60, y - 8, 12, 8); c.fillStyle = door; c.fillRect(x + 59, y - 19, 2, 11); c.fillRect(x + 71, y - 19, 2, 11); c.fillRect(x + 58, y - 21, 16, 3);
  }
  function dunes(f, base, amp, wl, sd, col, al, cac, lm, hz) {
    const sc = s.dist * f; c.globalAlpha = al; c.fillStyle = rgb(col);
    c.beginPath(); c.moveTo(-8, GY + 2);
    for (let x = -8; x <= W + 8; x += 8) c.lineTo(x, ridge(x + sc, base, amp, wl, sd));
    c.lineTo(W + 8, GY + 2); c.closePath(); c.fill();
    c.globalAlpha = al * .5; c.strokeStyle = "rgba(255,235,190,.5)"; c.lineWidth = 2; c.beginPath();
    for (let x = -8; x <= W + 8; x += 8) { const y = ridge(x + sc, base, amp, wl, sd); x === -8 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
    if (cac) { const C = 190; for (let k = Math.floor(sc / C) - 1; k <= Math.floor((sc + W) / C) + 1; k++) {
      if (hs(k, sd) < .45) continue; const wx = k * C + hs(k, sd + 1) * C * .7, x = Math.round(wx - sc);
      if (x < -40 || x > W + 40) continue; saguaro(x, ridge(wx, base, amp, wl, sd) + 2, 14 + hs(k, sd + 2) * 16, cac, al * .9); } }
    if (lm) for (let k = Math.floor(sc / lm.cell) - 1; k <= Math.floor((sc + W) / lm.cell) + 1; k++) {
      if (hs(k, sd + 5) < lm.skip) continue; const wx = k * lm.cell + hs(k, sd + 6) * lm.cell * .5, x = Math.round(wx - sc);
      if (x < -110 || x > W + 110) continue; lm.fn(x, ridge(wx, base, amp, wl, sd) + 2, al, hz);
    }
    c.globalAlpha = 1;
  }
  function mesas(f, h0, h1, w0, w1, cell, sd, col, al) {
    const sc = s.dist * f; c.globalAlpha = al;
    for (let k = Math.floor(sc / cell) - 1; k <= Math.floor((sc + W) / cell) + 1; k++) {
      const r1 = hs(k, sd), r2 = hs(k, sd + 1), r3 = hs(k, sd + 2), w = Math.round(w0 + r1 * (w1 - w0)), h = Math.round(h0 + r2 * (h1 - h0));
      const x = Math.round(k * cell + r3 * (cell - w) * .9 - sc); if (x > W + 4 || x + w < -4) continue;
      c.fillStyle = rgb(col); c.fillRect(x, GY - h, w, h + 2);
      const bw = Math.round(w * (.35 + .2 * r2)), bh = Math.round(h * .26); c.fillRect(x + Math.round((w - bw) * r3), GY - h - bh, bw, bh + 1);
      c.fillStyle = "rgba(0,0,0,.13)"; for (let y = GY - h * .7; y < GY; y += h * .24) c.fillRect(x, Math.round(y), w, Math.max(2, Math.round(h * .07)));
      c.fillStyle = "rgba(255,215,170,.2)"; c.fillRect(x, GY - h, w, 3);
    }
    c.globalAlpha = 1;
  }
  /* Mineshaft: roca al fondo, techo con estalactitas, marcos de madera y antorchas */
  function cave(al) {
    c.globalAlpha = al;
    const s1 = s.dist * .1; for (let k = Math.floor(s1 / 64) - 1; k <= Math.floor((s1 + W) / 64) + 1; k++) for (let y = 0; y < GY; y += 32) {
      const r = hs(k * 31 + y, 5); c.fillStyle = r > .55 ? "rgba(255,255,255,.035)" : r < .25 ? "rgba(0,0,0,.18)" : "rgba(0,0,0,0)"; c.fillRect(k * 64 - s1, y, 62, 30);
    }
    const s2 = s.dist * .3, f3 = s.dist * .35;
    for (let k = Math.floor(f3 / 330) - 1; k <= Math.floor((f3 + W) / 330) + 1; k++) {            // marcos de madera
      if (hs(k, 9) < .2) continue; const x = Math.round(k * 330 - f3);
      c.globalAlpha = al * .7; c.fillStyle = "#4e351b"; c.fillRect(x, 30, 10, GY - 30); c.fillRect(x + 100, 30, 10, GY - 30); c.fillRect(x - 10, 34, 130, 12);
      c.fillStyle = "#6b4a25"; c.fillRect(x, 30, 3, GY - 30); c.fillRect(x + 100, 30, 3, GY - 30); c.fillRect(x - 10, 34, 130, 3);
    }
    for (let k = Math.floor(f3 / 430) - 1; k <= Math.floor((f3 + W) / 430) + 1; k++) {            // antorchas con halo
      if (hs(k, 11) < .35) continue; const x = Math.round(k * 430 + 160 - f3), y = GY - 118, fl = (Math.floor(s.dist / 6) + k) % 3;
      const gl = c.createRadialGradient(x + 2, y, 4, x + 2, y, 110); gl.addColorStop(0, "rgba(255,170,60,.34)"); gl.addColorStop(1, "rgba(255,170,60,0)");
      c.globalAlpha = al; c.fillStyle = gl; c.fillRect(x - 110, y - 110, 224, 220);
      c.fillStyle = "#6b4a25"; c.fillRect(x, y + 4, 4, 14); c.fillStyle = fl ? "#ffb02e" : "#ffd36b"; c.fillRect(x - 1, y - 6, 6, 10); c.fillStyle = "#fff1a8"; c.fillRect(x + 1, y - 2, 2, 5);
    }
    c.globalAlpha = al; c.fillStyle = "#0b0a0f"; c.fillRect(0, 0, W, 22);                         // techo
    for (let x = 0; x < W + 16; x += 16) { const kx = Math.floor((x + s2) / 16), h = 6 + hs(kx, 3) * 38 * (hs(kx, 4) > .45 ? 1 : .25); c.fillRect(x - ((s2 % 16 + 16) % 16), 22, 16, h); }
    c.globalAlpha = 1;
  }
  function drawBG() {
    const bt = Math.min(5, Math.max(0, s.bt)), i = Math.floor(bt), j = Math.min(5, i + 1), f = bt - i, pa = PAL[i], pb = PAL[j];
    const hz = mixc(pa.hz, pb.hz, f), sunC = mixc(pa.sun, pb.sun, f), sunA = pa.sunA + (pb.sunA - pa.sunA) * f;
    const g = c.createLinearGradient(0, 0, 0, GY); [0, .55, 1].forEach((p, q) => g.addColorStop(p, rgb(mixc(pa.sky[q], pb.sky[q], f))));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (sunA > .01) {                                                                              // sol cuadrado con halo
      const sx = Math.round(W * .74), sy = Math.round(GY * (SYK[i] + (SYK[j] - SYK[i]) * f));
      const halo = c.createRadialGradient(sx, sy, 8, sx, sy, 130); halo.addColorStop(0, rgb(sunC, .45 * sunA)); halo.addColorStop(1, rgb(sunC, 0));
      c.fillStyle = halo; c.fillRect(sx - 130, sy - 130, 260, 260); c.globalAlpha = sunA; c.fillStyle = rgb(sunC); c.fillRect(sx - 20, sy - 20, 40, 40); c.globalAlpha = 1;
    }
    const cl = i === 5 ? 0 : j === 5 ? 1 - f : 1;                                                  // nubes de bloques (no hay en la cueva)
    if (cl > .01) { c.fillStyle = `rgba(255,${Math.round(255 - 55 * Math.min(1, bt / 3))},${Math.round(255 - 105 * Math.min(1, bt / 3))},${.15 * cl})`;
      s.clouds.forEach(q => { c.fillRect(Math.round(q.x), Math.round(q.y), 72, 8); c.fillRect(Math.round(q.x) + 14, Math.round(q.y) - 8, 40, 8); }); }
    for (let b = 0; b < 6; b++) {
      const w = Math.max(0, 1 - Math.abs(bt - b)); if (w < .01) continue; const pal = PAL[b];
      if (b <= 3) {
        const hzb = pal.hz, d = pal.dune.map((col, q) => mixc(col, hzb, [.6, .32, .1][q]));
        dunes(.07, GY - 74, 30, 230, 1.7, d[0], w, mixc(pal.cac, hzb, .35), b === 1 ? { cell: 820, skip: .4, fn: temple } : null, hzb);
        dunes(.16, GY - 40, 22, 150, 4.2, d[1], w, null, b === 2 ? { cell: 560, skip: .35, fn: village } : null, hzb);
        dunes(.32, GY - 12, 14, 100, 7.9, d[2], w, null, null, hzb);
      } else if (b === 4) {
        const r = P_M.rock.map((col, q) => mixc(col, P_M.hz, [.6, .3, .1][q]));
        mesas(.07, 70, 120, 150, 270, 360, 3, r[0], w); mesas(.16, 44, 80, 110, 190, 270, 8, r[1], w); mesas(.32, 14, 28, 60, 110, 170, 13, r[2], w);
      } else cave(w);
    }
    c.fillStyle = rgb(mixc(pa.grd, pb.grd, f)); c.fillRect(0, GY, W, H - GY);                       // suelo
    const ti = Math.round(bt), fl = IMG[ti >= 3 ? "arena-roja" : "arena"];
    if (ti >= 5) {
      for (let y = GY, r = 0; y < H; y += 40, r++) for (let x = -(s.dist % 40), q = 0; x < W; x += 40, q++) {
        const kx = Math.floor((s.dist - x) / 40);
        c.fillStyle = hs(kx * 7 + r, 2) > .5 ? "#47454c" : "#3c3a41"; c.fillRect(x, y, 40, 40);
        c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(x, y + 37, 40, 3); c.fillRect(x + 37, y, 3, 40); c.fillStyle = "rgba(255,255,255,.07)"; c.fillRect(x, y, 40, 3);
      }
    } else { c.globalAlpha = .85; for (let y = GY; y < H; y += 40) for (let x = -(s.dist % 40); x < W; x += 40) if (ok(fl)) c.drawImage(fl, x, y, 40, 40); }
    c.globalAlpha = 1; c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(0, GY, W, 3);                        // línea del suelo
    const rl = Math.max(0, Math.min(1, bt - 4));
    if (rl > .01) { c.globalAlpha = rl; c.fillStyle = "#5b3d1e"; for (let x = -(s.dist % 18); x < W; x += 18) c.fillRect(x, GY - 3, 10, 3); c.fillStyle = "#a4a4ad"; c.fillRect(0, GY - 4, W, 2); c.globalAlpha = 1; }
  }

  /* ---- Progreso: XP y monedas (límite diario por juego) ---- */
  let cs = { win: 0, n: 0 };
  const CKEY = () => "hood_runner_coins2_" + (me() ? me().uid : "guest");
  const csFresh = () => { if (cs.win && Date.now() - cs.win >= DAY) cs = { win: 0, n: 0 }; return cs; };
  const coinsLeft = () => COIN_MAX - csFresh().n;
  function csLoad() { try { const j = JSON.parse(localStorage.getItem(CKEY()) || "null"); cs = j && typeof j.win === "number" ? { win: j.win, n: Number(j.n) || 0 } : { win: 0, n: 0 }; } catch (e) { cs = { win: 0, n: 0 }; } }
  function csSave() { try { localStorage.setItem(CKEY(), JSON.stringify(cs)); } catch (e) { /* sin almacenamiento */ } }
  async function csRemote() {
    const u = me(); if (!u) return;
    try { const d = await getDoc(doc(db, "players", u.uid)); if (d.exists()) { const r = d.data(), w = Number(r.coinWin_runner) || 0, n = Number(r.coinN_runner) || 0; if (w > cs.win || (w === cs.win && n > cs.n)) { cs = { win: w, n }; csSave(); } } } catch (e) { /* se usa lo local */ }
  }
  async function flush() {                                    // guarda lo ganado en la partida (XP y monedas) en el perfil del jugador
    if (!s) return; const xp = s.pxp, cn = s.pcn; s.pxp = 0; s.pcn = 0; const u = me(); if (!u || (!xp && !cn)) return;
    u.xp = (u.xp || 0) + xp; u.coins = (u.coins || 0) + cn;
    const data = { xp: increment(xp) }; if (cn) Object.assign(data, { coins: increment(cn), coinWin_runner: cs.win, coinN_runner: cs.n });   // la ventana de monedas solo se envía si hubo monedas
    try { await updateDoc(doc(db, "players", u.uid), data); Arcade.refresh(); }
    catch (e) { u.xp -= xp; u.coins -= cn; console.warn("No se pudo guardar XP/monedas:", e); Mine.note(`No se pudo guardar tu XP/monedas${e && e.code ? " (" + e.code + ")" : ""}.`); }
  }
  async function loadBest() {                                 // tu récord anterior: con él se decide el color dorado y el aviso de nuevo récord
    const u = me(), key = u ? u.uid : "guest"; if (key !== bestKey) { best = 0; bestKey = key; }
    let b = 0;
    if (u) { try { const d = await getDoc(doc(db, "scores", u.uid)); if (d.exists()) b = Math.floor(Number(d.data().score)) || 0; } catch (e) { /* sin récord */ } }
    else { try { b = Number(localStorage.getItem("hood_runner_best2")) || 0; } catch (e) { /* sin almacenamiento */ } }
    if (key === bestKey) best = Math.max(best, b);
  }
  const gainXP = n => { s.xp += n; s.pxp += n; s.fl.push({ n, t: 0 }); };   // la XP "viaja" a la barra y se suma al llegar (ver timers)
  function takeCoin() { const q = csFresh(); if (q.n >= COIN_MAX) return false; if (!q.win) q.win = Date.now(); q.n++; s.coins++; s.pcn++; csSave(); return true; }

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

  /* ---- Entrada: saltar (mantener = más alto) y caída rápida ---- */
  function doJump(air) { s.vy = -9.8; s.hold = 0; s.buf = 0; s.ja = 0; if (!air) burst(80, GY, ["#7a6a40", "#a89a70"], 6); }
  function press() {
    if (st === "idle" || st === "over") { if (st === "over" && performance.now() - overAt < 450) return; s = reset(); st = "run"; csLoad(); csRemote(); loadBest(); return; }
    s.holding = true;
    if (s.y >= GY - S - .5 && !s.fall) doJump();
    else if (!s.fall && s.boost <= 0 && s.dj <= 0) { doJump(true); s.dj = 180; s.djFade = 0; burst(80, s.y + S, ["#ffffff", "#cfe9ff", "#a8d4ff"], 12); }   // doble salto: se recarga en 3 s
    else s.buf = 8;                                                        // sin doble salto disponible: el salto se guarda unos instantes
  }
  const release = () => { if (s) s.holding = false; };
  const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function parts(k) { s.pts.forEach(q => { q.x += q.vx * k; q.y += q.vy * k; q.vy += .25 * k; q.l -= k; }); s.pts = s.pts.filter(q => q.l > 0); }

  /* ---- Cajas de colisión de cada obstáculo ---- */
  function boxes(o) {
    switch (o.t) {
      case "cactus": return [{ x: o.x + 3, y: GY - o.h, w: CB - 6, h: o.h }];
      case "husk": return [{ x: o.x + 4, y: GY - 48, w: 16, h: 48 }, { x: o.x - 27, y: GY - 33, w: 27, h: 7 }];
      case "camel": return [{ x: o.x + 9, y: GY - 58, w: 62, h: 58 }];
      case "parched": return [{ x: o.x + 4, y: GY - 48, w: 16, h: 48 }];
      case "cart": return [{ x: o.x + 2, y: GY - 25, w: o.w - 4, h: 25 }];
      case "tnt": return [{ x: o.x + 2, y: GY - 42, w: o.w - 4, h: 42 }];
      case "bat": return [{ x: o.x + 4, y: o.y + 4, w: 28, h: 14 }];
    }
    return [];
  }
  function die() { st = "over"; overAt = performance.now(); burst(80, s.y + 18, ["#f7b41e", "#ff8a3d", "#fff"], 36);
    const sc = Math.floor(s.dist / 10); if (sc > best) best = sc;
    if (!me()) { try { localStorage.setItem("hood_runner_best2", String(best)); } catch (e) { /* sin almacenamiento */ } }
    saveScore(sc); flush(); }
  function hurt(rm) {                                          // golpe: el tótem de inmortalidad lo absorbe
    if (s.totems > 0) { s.totems--; s.inv = 60; burst(80, s.y + 18, ["#e8b923", "#2e9e4a", "#fff6c4", "#ffffff"], 50); if (rm) rm(); return true; }
    die(); return false;
  }
  function launch(x, y, cols) { s.vy = -16.5; s.boost = 70; s.dash = 40; s.hold = 99; s.fall = false; s.fast = false; burst(x, y, cols, 30); }

  function spawn() {
    const pool = POOL[Math.min(s.biome, POOL.length - 1)], tot = pool.reduce((a, q) => a + q[1], 0), sp = s.speed, x = W + 20;
    let r = Math.random() * tot, kind = pool[0][0], extra = 0;
    for (const q of pool) if ((r -= q[1]) < 0) { kind = q[0]; break; }
    r = Math.random();
    if (kind === "cactus") { const n = r < .45 ? 1 : r < .85 ? 2 : 3; s.obs.push({ t: "cactus", x, w: CB, h: n * CB, n, fl: n < 3 && Math.random() < .07 }); }
    else if (kind === "cart") {
      if (Math.random() < .2) s.obs.push({ t: "tnt", x, w: 40, h: 44 });                       // vagoneta con TNT: impulsa, pero explota
      else { const n = r < .6 ? 1 : 2; s.obs.push({ t: "cart", x, w: n * 40 + (n - 1) * 2, h: 28, n }); }
    }
    else if (kind === "husk") { s.obs.push({ t: "husk", x, w: 24, h: 48, dv: 5.5 }); extra = sp * 12; }   // dash al aparecer
    else if (kind === "camel") { s.obs.push({ t: "camel", x, w: 80, h: 60 }); }
    else if (kind === "parched") {                              // la flecha sale primero y va a velocidad propia fija; el esqueleto llega ~42 fotogramas después a cualquier velocidad
      const dv = 2.4, D = W - 72, d = Math.max(0, 42 * sp - D * dv / (sp + dv));
      s.arrows.push({ x, y: GY - 32, dv }); s.obs.push({ t: "parched", x: x + d, w: 24, h: 48 }); extra = d + sp * 10;
    }
    else if (kind === "pit") { const gw = Math.round(90 + sp * 8); s.gaps.push({ x, w: gw, lava: s.biome >= CAVE }); extra = gw + sp * 8; }
    else if (kind === "bat") { s.obs.push({ t: "bat", x, w: 36, h: 20, y: GY - 140, ph: rnd(0, 6), dv: 1.8 }); extra = sp * 10; }
    if (s.totems < MAXT && !s.tot.length && Math.random() < .06) s.tot.push({ x: x + rnd(90, 170), y: GY - rnd(60, 95), w: 26, h: 26 });
    if (coinsLeft() > 0 && Math.random() < .12) s.coin.push({ x: x + rnd(60, 240), y: GY - rnd(26, 110), w: 18, h: 18, ph: rnd(0, 6) });
    s.next = sp * 42 + rnd(60, 300) + extra;                     // separación mínima = tiempo de salto + margen: siempre es posible
  }

  /* Un paso de simulación. El fotograma se divide en pasos de ≤6 px de avance para que nada atraviese al jugador, por alta que sea la velocidad */
  function step(k) {
    const sc = s.dist / 10; let bi = 0;
    for (let i = BIO.length - 1; i >= 0; i--) if (sc >= BIO[i].at) { bi = i; break; }
    if (bi !== s.biome) { s.biome = bi; s.banner = 190; s.bname = BIO[bi].name; s.bxp = BIO[bi].xp; s.pop = 40; s.flash = 26; gainXP(BIO[bi].xp); }
    if (bi === CAVE) { const m = Math.floor((sc - CAVE_AT) / 1000); if (m > s.mile) { s.mile = m; const x = 60 + 12 * m; gainXP(x); s.banner = 130; s.bname = "Mineshaft · nivel " + m; s.bxp = x; } }
    s.bt += (s.biome - s.bt) * Math.min(1, .02 * k);
    const v = s.speed * (s.dash > 0 ? 2.2 : 1) * k; s.dist += v;
    if (!s.recDone && best > 0 && s.dist / 10 > best) { s.recDone = true; s.recT = 150; s.pop = 40; burst(80, s.y + 10, ["#ffcf33", "#fff3b0", "#ffffff"], 40); }
    // física vertical: salto variable (mantener = menos gravedad hasta un límite) y caída rápida
    const cx = 78, over = s.boost <= 0 && s.gaps.some(g => cx > g.x + 6 && cx < g.x + g.w - 6), air = s.y < GY - S - 2;
    let grav = .7; if (s.holding && s.vy < 0 && s.hold < 16) { grav = .38; s.hold += k; }
    s.vy += grav * k; s.ja += k;
    if (s.fast && !s.fall && air && s.boost <= 0 && s.ja > 8) { if (s.vy < 10) s.vy = 10; s.vy += 1.4 * k; }
    s.vy = Math.min(26, s.vy); s.y += s.vy * k;
    if (!over && !s.fall && s.y >= GY - S) {
      if (s.vy > 7) burst(80, GY, ["#7a6a40", "#a89a70"], 4);
      s.y = GY - S; s.vy = 0; s.hold = 0; s.fast = false; s.ja = 99; if (s.buf > 0) doJump();
    } else if (over && s.y > GY - S + 6) s.fall = true;        // el suelo no está: cae por el pozo
    if (s.fall && s.y > H + 30) {
      if (s.totems > 0) {                                      // el tótem te salva: reapareces sobre suelo firme
        s.totems--; s.fall = false; s.y = -S - 10; s.vy = 0; s.inv = 120; s.holding = false; s.fast = false;
        s.gaps = s.gaps.filter(g => g.x > 340); s.obs = s.obs.filter(o => o.x > 340); s.arrows = s.arrows.filter(a => a.x > 340); s.next = Math.max(s.next, 240);
        burst(80, 60, ["#e8b923", "#2e9e4a", "#fff6c4", "#ffffff"], 50);
      } else { die(); return; }
    }
    s.next -= v; if (s.next <= 0) spawn();
    s.gaps.forEach(g => g.x -= v);
    s.obs.forEach(o => {
      o.x -= v;
      if (o.t === "husk") { o.x -= o.dv * k; o.dv = Math.max(.9, o.dv - .13 * k); }
      else if (o.t === "bat") { o.x -= o.dv * k; o.ph += .12 * k; o.y = GY - 140 + Math.sin(o.ph) * 12; }
    });
    s.arrows.forEach(a => a.x -= v + a.dv * k);
    s.tot.forEach(t => t.x -= v); s.coin.forEach(q => q.x -= v);
    s.clouds.forEach(cl => { cl.x -= .4 * k; if (cl.x < -60) { cl.x = W + 20; cl.y = rnd(20, GY * .5); } });
    s.obs = s.obs.filter(o => o.x + (o.w || 30) > -40); s.gaps = s.gaps.filter(g => g.x + g.w > -30); s.arrows = s.arrows.filter(a => a.x > -40);
    s.tot = s.tot.filter(t => t.x > -40); s.coin = s.coin.filter(q => q.x > -40);
    const p = { x: 64, y: s.y + 4, w: S - 8, h: S - 8 };
    s.tot = s.tot.filter(t => { if (hit(p, t)) { s.totems = Math.min(MAXT, s.totems + 1); burst(t.x + 13, t.y + 13, ["#e8b923", "#2e9e4a", "#fff6c4"], 22); return false; } return true; });
    s.coin = s.coin.filter(q => { if (hit(p, q) && takeCoin()) { burst(q.x + 9, q.y + 9, ["#f5c93a", "#fff3b0", "#a8730f"], 12); return false; } return true; });
    if (s.fall) return;
    for (const o of s.obs) {
      if (o.t === "cactus" && o.fl && s.boost <= 0 && hit(p, { x: o.x, y: GY - o.h - 21, w: CB, h: 21 })) {      // flor: gran impulso hacia delante y arriba, no hace daño
        o.fl = false; launch(o.x + 16, GY - o.h - 10, ["#d2708a", "#fcb0ad", "#fa8685"]); continue;
      }
      if (o.t === "tnt" && s.boost <= 0 && boxes(o).some(b => hit(p, b))) {                                      // TNT: impulsa igual, pero la explosión hace daño
        s.obs = s.obs.filter(q => q !== o); s.shake = 14; burst(o.x + 20, GY - 24, ["#ff8a3d", "#f7b41e", "#fff", "#d23a22"], 50);
        if (s.totems > 0) { s.totems--; launch(o.x + 20, GY - 24, ["#ff8a3d", "#f7b41e"]); s.inv = 0; } else { die(); return; }
        break;
      }
      if (s.inv <= 0 && s.boost <= 0 && boxes(o).some(b => hit(p, b))) { if (hurt(() => { s.obs = s.obs.filter(q => q !== o); })) break; return; }
    }
    for (const a of s.arrows) if (s.inv <= 0 && s.boost <= 0 && hit(p, { x: a.x, y: a.y, w: 32, h: 7 })) { if (hurt(() => { s.arrows = s.arrows.filter(q => q !== a); })) break; return; }
  }
  function update(k) {
    s.speed = spdAt(s.dist / 10);
    const n = Math.max(1, Math.ceil(s.speed * (s.dash > 0 ? 2.2 : 1) * k / 6));
    for (let i = 0; i < n && st === "run"; i++) step(k / n);
    if (s.inv > 0) s.inv -= k; if (s.buf > 0) s.buf -= k; if (s.dash > 0) s.dash -= k; timers(k);
    if (s.boost > 0) { s.boost -= k; if (s.boost <= 0) s.inv = Math.max(s.inv, 30); }
    if (s.dj > 0) { s.dj -= k; if (s.dj <= 0) { s.dj = 0; s.djFade = 30; } } else if (s.djFade > 0) s.djFade -= k;
    parts(k);
  }
  function timers(k) {                                        // animaciones de interfaz (también corren en la pantalla de muerte)
    ["pop", "flash", "recT", "lvUp", "xpGlow", "shake", "banner"].forEach(n => { if (s[n] > 0) s[n] -= k; });
    for (const f of s.fl) f.t += k / 34;
    s.fl = s.fl.filter(f => {
      if (f.t < 1) return true;
      const a = xpInfo(s.base + s.xpArr).lvl; s.xpArr += f.n; s.xpGlow = 30; const b = xpInfo(s.base + s.xpArr).lvl;
      if (b > a) { s.lvUp = 150; s.lvTxt = "¡Nivel " + b + "!"; s.pop = Math.max(s.pop, 30); burst(80, s.y + 10, ["#b8f046", "#e6ff9a", "#ffffff", "#8fe03a"], 44); }
      return false;
    });
    s.xpShow += (s.base + s.xpArr - s.xpShow) * Math.min(1, .12 * k);
  }

  /* ---- Dibujo ---- */
  function player() {
    if (!figs) { c.fillStyle = "#f7b41e"; c.fillRect(60, s.y, S, S); return; }
    const air = s.y < GY - S - 0.5;
    if (air !== aAir) { aAir = air; aT = 0; }
    const anim = st !== "run" ? "idle" : air ? "jump" : "walk";
    const a = ANIMS[anim], n = a.frames.length, i = anim === "jump" ? Math.min(7, Math.floor(aT)) : Math.floor(aT) % n;
    const { fig } = figs.get(anim, i);
    c.save(); c.translate(78, 0); c.scale(-1, 1);
    c.drawImage(fig, -figs.w / 2, s.y + S - figs.feet);
    c.restore();
  }
  function drawGap(g) {
    const x = Math.round(g.x);
    if (g.lava) {
      c.fillStyle = "#140805"; c.fillRect(x - 3, GY, g.w + 6, H - GY);
      const lg = c.createLinearGradient(0, GY + 8, 0, H); lg.addColorStop(0, "#ffb02e"); lg.addColorStop(.4, "#ff6a13"); lg.addColorStop(1, "#b32a08");
      c.fillStyle = lg; c.fillRect(x, GY + 8, g.w, H - GY - 8);
      for (let i = 0; i < g.w / 14; i++) { const t = s.dist / 22 + i * 1.7; c.fillStyle = i % 2 ? "#ffd36b" : "#ff9a2b"; c.fillRect(x + 4 + i * 14, GY + 12 + Math.round((Math.sin(t) + 1) * 6) , 8, 5); }
      const gl = c.createLinearGradient(0, GY - 46, 0, GY); gl.addColorStop(0, "rgba(255,120,30,0)"); gl.addColorStop(1, "rgba(255,120,30,.3)"); c.fillStyle = gl; c.fillRect(x - 14, GY - 46, g.w + 28, 46);
    } else {
      const pg = c.createLinearGradient(0, GY, 0, H); pg.addColorStop(0, "#2a1a0c"); pg.addColorStop(1, "#050301");
      c.fillStyle = pg; c.fillRect(x, GY, g.w, H - GY); c.fillStyle = "#8a6a3a"; c.fillRect(x - 3, GY, 3, H - GY); c.fillRect(x + g.w, GY, 3, H - GY);
      c.fillStyle = "rgba(0,0,0,.35)"; c.fillRect(x, GY, g.w, 6);
    }
  }
  function drawObs(o) {
    const x = Math.round(o.x);
    switch (o.t) {
      case "cactus":
        for (let i = 0; i < o.n; i++) { if (ok(IMG.cactus)) c.drawImage(IMG.cactus, x, GY - (i + 1) * CB, CB, CB); else { c.fillStyle = "#3f9b2a"; c.fillRect(x, GY - (i + 1) * CB, CB, CB); } }
        if (o.fl && ok(IMG.flor)) c.drawImage(IMG.flor, x, GY - o.h - CB, CB, CB);
        break;
      case "husk":
        c.drawImage(SP.husk, x, GY - 48); c.fillStyle = "#8a6a3a"; c.fillRect(x - 19, GY - 32, 24, 4); c.fillStyle = "#d4d4d8"; c.fillRect(x - 27, GY - 33, 8, 7); c.fillStyle = "#6f553a"; c.fillRect(x - 4, GY - 33, 4, 7);
        break;
      case "camel": c.drawImage(SP.camel, x, GY - 60); break;
      case "parched":
        c.drawImage(SP.parched, x, GY - 48); c.fillStyle = "#7a5a30"; c.fillRect(x - 8, GY - 40, 4, 28); c.fillRect(x - 4, GY - 42, 4, 4); c.fillRect(x - 4, GY - 16, 4, 4); c.fillStyle = "#e6e0d0"; c.fillRect(x - 4, GY - 37, 1, 22);
        break;
      case "cart": for (let i = 0; i < o.n; i++) c.drawImage(SP.cart, x + i * 42, GY - 28); break;
      case "tnt":
        c.drawImage(SP.tnt, x, GY - 44);
        if (Math.floor(s.dist / 14) % 3 === 0) { c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(x, GY - 44, 40, 16); }          // parpadeo de TNT
        break;
      case "bat": c.drawImage(Math.floor(o.ph * 1.7) % 2 ? SP.bat1 : SP.bat0, x, Math.round(o.y)); break;
    }
  }
  function djBar() {                                          // barrita sutil bajo los pies: recarga del doble salto; se desvanece al llenarse
    if (st !== "run") return; const full = s.dj <= 0; if (full && s.djFade <= 0) return;
    const a = full ? Math.max(0, s.djFade / 30) : 1, pct = full ? 1 : 1 - s.dj / 180, x = 64, w = 28, y = Math.round(s.y + S + 6);
    c.save(); c.shadowBlur = 0; c.globalAlpha = .5 * a; c.fillStyle = "#000"; c.fillRect(x, y, w, 3);
    c.globalAlpha = .85 * a; c.fillStyle = full ? "#fff3b0" : "#cfe9ff"; c.fillRect(x, y, Math.round(w * pct), 3); c.restore();
  }
  function hud() {
    const sc = Math.floor(s.dist / 10), gold = s.recDone, u = me(), F = " 'Noto Sans', sans-serif";
    c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 6; c.lineJoin = "round";
    /* puntuación: centrada; se infla al cambiar de bioma o superar el récord, y es dorada si ya superaste tu mejor marca */
    const pk = 1 + .32 * Math.pow(Math.max(0, s.pop) / 40, 2), txt = String(sc).padStart(5, "0");
    c.save(); c.translate(W / 2, 44); c.scale(pk, pk); c.textAlign = "center"; c.font = "800 36px" + F;
    c.shadowBlur = 0; c.lineWidth = 5; c.strokeStyle = "rgba(0,0,0,.55)"; c.strokeText(txt, 0, 0);
    c.fillStyle = gold ? "#ffcf33" : "#f5ecd6"; if (gold) { c.shadowColor = "rgba(255,190,30,.85)"; c.shadowBlur = 16; } c.fillText(txt, 0, 0); c.restore();
    c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = 6; c.textAlign = "center";
    if (st === "run" && s.recT > 0) { const ag = 150 - s.recT, z = 1 + Math.max(0, 1 - ag / 14) * .7; c.save(); c.globalAlpha = Math.min(1, s.recT / 30, ag / 6); c.translate(W / 2, 72); c.scale(z, z); c.fillStyle = "#ffcf33"; c.font = "800 16px" + F; c.fillText("¡NUEVO RÉCORD!", 0, 0); c.restore(); }
    /* esquina: monedas, barra de nivel (con el número del nivel a la derecha) y, debajo, los tótems */
    c.textAlign = "left"; c.font = "700 13px" + F;
    c.drawImage(SP.coin, 14, 8, 16, 16); c.fillStyle = "#f5c93a"; c.fillText(csFresh().n + "/" + COIN_MAX, 36, 21);
    const gl = Math.max(0, s.xpGlow) / 30, bx = 14, by = 34, bw = 132, bh = 9;
    if (u) {
      const inf = xpInfo(s.xpShow);
      c.shadowBlur = 0; c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(bx - 2, by - 2, bw + 4, bh + 4); c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(bx, by, bw, bh);
      c.fillStyle = gl > 0 ? "#e6ff9a" : "#8fe03a"; c.fillRect(bx, by, Math.round(bw * inf.pct), bh);
      if (gl > 0) { c.fillStyle = `rgba(255,255,255,${.5 * gl})`; c.fillRect(bx, by, Math.round(bw * inf.pct), bh); }
      c.shadowBlur = 6; c.font = `800 ${14 + Math.round(3 * gl)}px` + F; c.fillStyle = "#e9f7c8"; c.fillText(String(inf.lvl), bx + bw + 9, by + 10);
    }
    s.fl.forEach(f => {                                       // "+N XP": aparece bajo la barra, salta hacia ella y se añade
      const p = f.t < .3 ? 0 : (f.t - .3) / .7, y = by + 40 - 36 * p * p, z = 1.4 - .75 * p, al = f.t < .1 ? f.t / .1 : p > .85 ? (1 - p) / .15 : 1;
      c.save(); c.globalAlpha = Math.max(0, al); c.translate(bx + bw / 2, y); c.scale(z, z); c.textAlign = "center"; c.fillStyle = "#b8f046"; c.font = "800 15px" + F; c.fillText("+" + f.n + " XP", 0, 0); c.restore();
    });
    c.textAlign = "left";
    for (let i = 0; i < s.totems; i++) if (ok(IMG.totem)) c.drawImage(IMG.totem, 14 + i * 26, 54, 22, 22);
    c.textAlign = "center";
    if (st === "run" && s.banner > 0) { const ag = 190 - s.banner, z = 1 + Math.max(0, 1 - ag / 20) * .8; c.save(); c.globalAlpha = Math.min(1, s.banner / 40, ag / 6); c.translate(W / 2, GY * .46); c.scale(z, z);
      c.fillStyle = "#f7b41e"; c.font = "800 24px" + F; c.fillText(s.bname, 0, 0); if (s.bxp) { c.font = "700 15px" + F; c.fillStyle = "#b8f046"; c.fillText("+" + s.bxp + " XP", 0, 24); } c.restore(); }
    if (st === "run" && s.lvUp > 0) { const ag = 150 - s.lvUp, z = 1 + Math.max(0, 1 - ag / 16) * .9; c.save(); c.globalAlpha = Math.min(1, s.lvUp / 30, ag / 5); c.translate(W / 2, GY * .64); c.scale(z, z); c.fillStyle = "#b8f046"; c.font = "800 28px" + F; c.fillText(s.lvTxt, 0, 0); c.restore(); }
    c.font = "700 16px" + F; c.fillStyle = "#f7b41e";
    if (st === "idle") c.fillText("Pulsa espacio o toca para empezar", W / 2, GY * .55);
    if (st === "over") {
      const lines = TOUCH
        ? ["Tocar: saltar (mantén = más alto)", "Deslizar hacia abajo en el aire: caer rápido", "Tocar otra vez en el aire: doble salto (recarga 3 s)", "Tótem: sobrevives a un golpe o caída"]
        : ["Saltar: Espacio / ↑ / W (mantén = más alto)", "Caer rápido: ↓ / Shift / S (solo en el aire)", "Doble salto: pulsa otra vez en el aire (recarga 3 s)", "Tótem: sobrevives a un golpe o caída"];
      const pw = Math.min(W - 24, 470), py = 96, ph = 118 + lines.length * 19;
      c.shadowBlur = 0; c.fillStyle = "rgba(0,0,0,.5)"; c.fillRect(Math.round(W / 2 - pw / 2), py, pw, ph); c.shadowBlur = 6;
      c.font = "800 24px" + F; c.fillStyle = "#f7b41e"; c.fillText("Fin del juego", W / 2, py + 32);
      c.font = "600 15px" + F; c.fillStyle = s.recDone ? "#ffcf33" : "#b8f046"; c.fillText((s.recDone ? "¡Nuevo récord!  " : "") + "+" + s.xp + " XP" + (s.coins ? "  ·  +" + s.coins + " monedas" : ""), W / 2, py + 56);
      c.font = "700 15px" + F; c.fillStyle = "#e6d9b0"; c.fillText(me() ? "Pulsa para reintentar" : "Inicia sesión para guardar tu puntaje, XP y monedas", W / 2, py + 80);
      c.font = "500 13px" + F; c.fillStyle = "rgba(245,236,214,.85)"; lines.forEach((l, i) => c.fillText(l, W / 2, py + 108 + i * 19));
    }
    c.shadowBlur = 0;
  }
  function draw() {
    c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = false;
    c.save(); if (s.shake > 0) c.translate(rnd(-4, 4), rnd(-4, 4));
    drawBG();
    s.gaps.forEach(drawGap);
    s.obs.forEach(drawObs);
    s.arrows.forEach(a => { const x = Math.round(a.x), y = Math.round(a.y); c.fillStyle = "#8a6a3a"; c.fillRect(x + 8, y + 2, 20, 3); c.fillStyle = "#cfcfd6"; c.fillRect(x, y, 8, 7); c.fillStyle = "#e6e0d0"; c.fillRect(x + 26, y, 6, 7); });
    s.tot.forEach(t => { const y = t.y + Math.sin(s.dist / 15) * 3; if (ok(IMG.totem)) c.drawImage(IMG.totem, t.x, y, 26, 26); else { c.fillStyle = "#e8b923"; c.fillRect(t.x, y, 26, 26); } });
    s.coin.forEach(q => { const w = Math.max(3, Math.abs(Math.cos(s.dist / 18 + q.ph)) * 18), y = q.y + Math.sin(s.dist / 15 + q.ph) * 3; c.drawImage(SP.coin, Math.round(q.x + (18 - w) / 2), Math.round(y), w, 18); });
    if (st !== "over" && (s.inv <= 0 || Math.floor(s.inv / 4) % 2)) player();
    if (st === "over") { c.globalAlpha = .4; player(); c.globalAlpha = 1; }
    djBar();
    s.pts.forEach(q => { c.fillStyle = q.c; c.globalAlpha = Math.min(1, q.l / 20); c.fillRect(q.x, q.y, 4, 4); }); c.globalAlpha = 1;
    c.restore();
    if (s.flash > 0) { c.fillStyle = `rgba(255,255,255,${.4 * s.flash / 26})`; c.fillRect(0, 0, W, H); }
    hud();
  }
  function loop(t) {
    const k = Math.min(2.5, (t - last) / 16.67 || 1); last = t;
    if (st === "run") update(k); else { parts(k); timers(k); }
    aT += k / 60 * (st !== "run" ? ANIMS.idle.fps : aAir ? ANIMS.jump.fps * 1.5 : ANIMS.walk.fps * 1.5);   // andar y salto a 1,5×
    draw(); raf = requestAnimationFrame(loop);
  }
  const live = () => !$("#v-juego").hidden && $("#gamecard").classList.contains("open") && modal.hidden;
  const UP = ["Space", "ArrowUp", "KeyW"], DOWN = ["ArrowDown", "ShiftLeft", "ShiftRight", "KeyS"];
  addEventListener("keydown", e => {
    if (!live()) return;
    if (UP.includes(e.code)) { e.preventDefault(); if (!e.repeat) press(); }
    else if (DOWN.includes(e.code)) { e.preventDefault(); if (!e.repeat && s && s.y < GY - S - 2 && !s.fall) s.fast = true; }   // solo cuenta si la pulsas estando en el aire
  });
  addEventListener("keyup", e => { if (UP.includes(e.code)) release(); else if (DOWN.includes(e.code) && s) s.fast = false; });
  const gcEl = $("#gamecard");                               // se puede tocar en cualquier punto de la pantalla: mantener = salto alto, deslizar hacia abajo = caer rápido
  /* Táctil: si tocas estando en el aire, el salto espera ~90 ms; si en ese tiempo deslizas hacia abajo, solo cae (no vuelve a saltar al aterrizar) */
  let pend = 0, swiped = false;
  gcEl.addEventListener("pointerdown", e => {
    if (e.target.closest(".gc-close")) return; e.preventDefault(); try { gcEl.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
    py0 = e.clientY; swiped = false; clearTimeout(pend); pend = 0;
    if (st === "run" && s && s.y < GY - S - 2) pend = setTimeout(() => { pend = 0; if (!swiped) press(); }, 90); else press();
  });
  gcEl.addEventListener("pointermove", e => {
    if (py0 !== null && s && !swiped && e.clientY - py0 > 18) { swiped = true; clearTimeout(pend); pend = 0; if (s.y < GY - S - 2 && !s.fall) { s.fast = true; s.holding = false; } }
  });
  gcEl.addEventListener("contextmenu", e => e.preventDefault());
  const up = () => { py0 = null; if (pend) { clearTimeout(pend); pend = 0; if (!swiped) press(); } release(); if (s) s.fast = false; };
  gcEl.addEventListener("pointerup", up); gcEl.addEventListener("pointercancel", up);
  addEventListener("resize", () => { if (gcEl.classList.contains("open")) fit(); });
  const begin = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); };
  return {
    show() { fit(); s = s || reset(); loadFace(); begin(); },
    start() { fit(); s = reset(); st = "run"; csLoad(); csRemote(); loadBest(); loadFace(); begin(); },
    stop() { cancelAnimationFrame(raf); if (s) flush(); },
    refresh() { loadFace(); }
  };
})();

/* ---------- Jugar: el personaje salta a la isla y el juego ocupa toda la ventana (sin pantalla completa del navegador) ---------- */
const Play = (() => {
  const gc = $("#gamecard");
  const isOpen = () => gc.classList.contains("open");
  function jumpTo(target, done) {
    const src = document.querySelector("#rk-me canvas");
    if (!src || !src.width) return done();
    const a = src.getBoundingClientRect(), b = target.getBoundingClientRect();
    const f = document.createElement("canvas"); f.width = src.width; f.height = src.height; f.getContext("2d").drawImage(src, 0, 0);
    f.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;z-index:300;pointer-events:none;image-rendering:pixelated;transform-origin:50% 100%`;
    document.body.append(f); src.style.visibility = "hidden";
    const ex = b.left + b.width / 2 - a.width / 2, ey = b.top + b.height * .4 - a.height, lift = Math.min(240, innerHeight * .3), T = 800, t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / T), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const x = (ex - a.left) * e, y = (ey - a.top) * e - Math.sin(Math.PI * t) * lift;
      f.style.transform = `translate(${x}px,${y}px) scale(${1 - .4 * t}) rotate(${Math.sin(Math.PI * t) * -14}deg)`;
      if (t < 1) requestAnimationFrame(step); else { f.remove(); src.style.visibility = ""; done(); }
    };
    requestAnimationFrame(step);
  }
  function open(w) {
    gc.classList.add("open"); gc.setAttribute("aria-hidden", "false");
    Game.start();
  }
  function close() {
    if (!isOpen()) return;
    gc.classList.remove("open"); gc.setAttribute("aria-hidden", "true"); Game.stop();
  }
  $("#gc-close").onclick = close;
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  return { jumpTo, open, close, isOpen };
})();

/* ---------- Arcade: isla grande + selector de mundos ---------- */
const Arcade = (() => {
  const N = WORLDS.length, mod = i => ((i % N) + N) % N;
  const stage = $("#wc-stage"), bgs = $("#ar-bgs"), dots = $("#wc-dots"), mainEl = $("#ar-main"), tip = $("#ar-tip");
  let cur = 0, sel = -1, lastWheel = 0, active = false, launching = false, sx = null;

  const cards = WORLDS.map((w, i) => {
    const el = document.createElement("article");
    el.className = "wc-card"; el.dataset.i = i; el.dataset.w = w.id; el.style.setProperty("--acc", w.acc);
    el.setAttribute("role", "option"); el.setAttribute("aria-label", w.name + (w.game ? " — " + w.game.name : " — Próximamente"));
    el.innerHTML = `<img class="ico" src="${w.img}" alt="" draggable="false">`;
    stage.append(el);
    const bg = document.createElement("div"); bg.className = "ar-bg"; bg.style.backgroundImage = `url("${w.bg}")`; if (w.b) bg.style.setProperty("--b", w.b); bgs.append(bg);
    const d = document.createElement("i"); d.setAttribute("role", "button"); d.setAttribute("aria-label", w.name); d.onclick = () => go(i); dots.append(d);
    return { el, bg, d };
  });

  function apply(k, dir) {                                     // un mundo se ha elegido: fondo, título, juego y ranking
    const prev = sel; sel = k; selWorld = k; const w = WORLDS[k], g = w.game;
    cards.forEach((c, i) => {
      c.bg.classList.toggle("on", i === k); c.d.classList.toggle("on", i === k);
      c.el.classList.toggle("cur", i === k); c.el.setAttribute("aria-selected", i === k);
      c.el.classList.remove("from-b", "from-t", "to-t", "to-b");
      if (prev >= 0 && dir) { if (i === k) c.el.classList.add(dir > 0 ? "from-b" : "from-t"); else if (i === prev) c.el.classList.add(dir > 0 ? "to-t" : "to-b"); }
    });
    mainEl.style.setProperty("--acc", w.acc);
    $("#ar-name").textContent = g ? g.name : w.name;
    tip.textContent = g ? "Haz clic en la isla para jugar" : "Próximamente";
    mainEl.classList.toggle("soon", !g);
    mainEl.classList.remove("swap"); void mainEl.offsetWidth; mainEl.classList.add("swap");
    renderRank();
  }
  function go(i) { const n = mod(i); if (n === cur && sel === n) return; const d = n === cur ? 0 : (mod(n - cur) <= N / 2 ? 1 : -1); cur = n; apply(n, d); }
  const move = dir => go(cur + dir);

  mainEl.addEventListener("wheel", e => {                      // la rueda sobre la isla cambia de mundo
    const dy = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (Math.abs(dy) < 6) return; e.preventDefault();
    const now = performance.now(); if (now - lastWheel < 520) return; lastWheel = now; move(dy > 0 ? 1 : -1);
  }, { passive: false });
  stage.addEventListener("keydown", e => {
    if (["ArrowUp", "ArrowLeft"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); move(-1); }
    else if (["ArrowDown", "ArrowRight"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); move(1); }
    else if (e.key === "Enter") { e.preventDefault(); launch(); }
  });
  stage.addEventListener("pointerdown", e => { if (!e.button) sx = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  stage.addEventListener("pointerup", e => {
    const s0 = sx; sx = null; if (!s0 || s0.id !== e.pointerId) return;
    const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) return move(dy < 0 ? 1 : -1);   // deslizar en vertical cambia de mundo
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && e.target.closest(".wc-card.cur")) launch();
  });
  stage.addEventListener("pointercancel", () => { sx = null; });

  function launch() {                                          // clic en la isla: el personaje salta y arranca el juego
    const w = WORLDS[cur], el = cards[cur].el;
    if (!w.game) { el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); return; }
    if (launching || Play.isOpen()) return; launching = true;
    Play.jumpTo(el.querySelector(".ico") || el, () => { launching = false; Play.open(w); });
  }

  return {
    enter() { active = true; bgs.classList.add("on"); sel = -1; apply(cur, 0); Mine.reset(); Mine.start(); },
    leave() { active = false; bgs.classList.remove("on"); Play.close(); Game.stop(); Mine.stop(); },
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
