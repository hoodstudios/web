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
  getFirestore, doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp, increment, deleteDoc, arrayUnion
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
import { Mercado } from "./mercado.js";
import { Cofres } from "./cofres.js";

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
  { id: "runner", name: "Desert Rush", col: "scores", field: "score", unit: "puntos" },
  { id: "coral", name: "Coral Stack", col: "scores_coral", field: "score", unit: "puntos" },
  { id: "elytra", name: "Elytra Fly", col: "scores_elytra", field: "score", unit: "puntos" }
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
  if (cur === "mercado") Mercado.enter(); else Mercado.leave();
  document.body.classList.toggle("mkfix", cur === "mercado");
  document.body.classList.toggle("noscroll", cur === "juego");
  document.body.classList.toggle("plfix", cur === "jugadores");
  if (cur === "jugadores") { fitPlayers(); requestAnimationFrame(fitPlayers); }
  $("#dc").hidden = cur !== "inicio"; dispatchEvent(new Event("dcsync"));
  window.scrollTo(0, 0); if (cur === "inicio") fitSub();
}
addEventListener("hashchange", route);
Cofres.init({ db, auth, esc, me, fb: { doc, getDoc, setDoc, updateDoc, increment, arrayUnion }, lvl: xp => xpInfo(xp).lvl, link: pLink, refresh: () => renderAuth() });
Mercado.init({
  db, auth, esc, me,
  fb: { doc, getDoc, setDoc, updateDoc, getDocs, collection, deleteDoc, increment, arrayUnion },
  patchMe: p => { if (profile) Object.assign(profile, p); },
  face: async () => {
    const u = me(), f = u ? await figsFor(u.uid, u.name, u.avatar) : await loadSkin(["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN]).then(i => i && { img: i, slim: false });
    return f ? { img: f.img, slim: f.slim } : null;
  },
  onChange: () => {                                          // se cambió algo puesto (sombrero, marco, fondo): refresca todo lo que lo muestra
    const u = me(); if (u) for (const k of [...figCache.keys()]) if (k.startsWith(u.uid + "|")) figCache.delete(k);
    renderAuth(); if (hashParts()[0] === "perfil") route();
  }
});

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
    if (s.exists()) { const d = s.data(); profile = { uid: user.uid, name: d.name, avatar: okAv(d.avatar), medalIds: Array.isArray(d.medalIds) ? d.medalIds : [], xp: Math.floor(Number(d.xp)) || 0, coins: Number(d.coins ?? d.monedas) || 0, inv: Array.isArray(d.inv) ? d.inv : [], equip: d.equip && typeof d.equip === "object" ? d.equip : {}, chests: Math.max(0, Math.floor(Number(d.chests)) || 0), lvChest: Number.isFinite(Number(d.lvChest)) && d.lvChest !== null ? Math.floor(Number(d.lvChest)) : null }; }
  } catch (e) { console.warn(e); }
  if (profile) setTimeout(() => Cofres.sync(profile), 400);
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
    profile = { uid: cred.user.uid, name, avatar, medalIds: [], xp: 0, coins: 0, inv: [], equip: {} };
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
    box.append(d); Mercado.decorate({ equip: u.equip, frameEls: [d.querySelector("img")] }); Cofres.badge(box, u);
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
    let md = null, hat = null;
    try { const [d, pl] = await Promise.all([getDoc(doc(db, "avatars", uid)), getDoc(doc(db, "players", uid)).catch(() => null)]); md = d.exists() ? d.data() : null; const e = pl && pl.exists() && pl.data().equip; hat = e && typeof e.hat === "string" ? e.hat : null; } catch (e) { /* sin skin guardada */ }
    const img = await loadSkin(skinSources(name, avatar, md));
    return img ? { img, slim: !!(md && md.slim), hat } : null;
  })());
  return figCache.get(key);
}
function drawTrim(cv, fig, ref) {                              // recorta el hueco transparente; con ref (figura SIN sombrero) todos usan el mismo recuadro y el sombrero que sobresalga se corta
  const src = ref || fig; let x = 0, y = 0, w = src.width, h = src.height;
  try {
    const d = src.getContext("2d").getImageData(0, 0, w, h).data; let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (d[(j * w + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; }
    if (x1 >= 0) { x = x0; y = y0; w = x1 - x0 + 1; h = y1 - y0 + 1; }
  } catch (e) { const pt = src.padT || 0, pb = src.padB || 0; y = pt; h = src.height - pt - pb; }
  const dx = Math.round((fig.width - src.width) / 2), dy = fig.height - src.height;       // las figuras comparten pies y centro
  cv.width = w; cv.height = h; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fig, x + dx, y + dy, w, h, 0, 0, w, h);
}
const enchCv = new Set(); let enchT = 0;
function enchTick() {                                          // sombreros encantados en tablas: redibuja el brillo mientras estén en pantalla
  for (const cv of enchCv) {
    if (!cv.isConnected) { enchCv.delete(cv); continue; }
    const r = cv.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
    try { drawTrim(cv, cv._set.get("idle", 0).fig, cv._ref); } catch (e) { enchCv.delete(cv); }
  }
  if (!enchCv.size) { clearInterval(enchT); enchT = 0; }
}
async function paintFig(cv) {
  const { uid, name, avatar } = cv.dataset, f = await figsFor(uid, name, avatar);
  if (f) { try {
    const cos = await Mercado.hatCos(f.hat), set = createFigureSet(f.img, { slim: f.slim, k: 3, cos });
    const ref = cos ? createFigureSet(f.img, { slim: f.slim, k: 3 }).get("idle", 0).fig : null; cv._ref = ref;
    drawTrim(cv, set.get("idle", 0).fig, ref); cv.classList.add("ready");
    if (set.ench) { cv._set = set; enchCv.add(cv); if (!enchT) enchT = setInterval(enchTick, 90); }
    return;
  } catch (e) { console.warn(e); } }
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
    const cref = doc(db, "scores_coral", u.uid), c2 = await getDoc(cref);
    if (c2.exists()) await updateDoc(cref, { avatar });
    const eref = doc(db, "scores_elytra", u.uid), e2 = await getDoc(eref);
    if (e2.exists()) await updateDoc(eref, { avatar });
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
    box.innerHTML = `<div class="pwrap"><aside class="chestrail" id="chestrail"></aside><div class="pmain">
      <div class="card prof">
        <img class="pface" id="pface" src="${esc(okAv(p.avatar))}" alt="Cabeza de ${esc(p.name)}">
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
      <h3 class="sec">Inventario</h3>
      <div class="card invbox" id="invbox"></div>
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
      <div class="records">${recs.map(([g, v]) => `<div class="card rec"><h4>${esc(g.name)}</h4>${v === null ? `<span class="muted">Sin récord aún</span>` : `<div class="big">${v} <small>${esc(g.unit)}</small></div>`}</div>`).join("")}</div></div></div>`;
    lvAnim(box);
    Cofres.rail($("#chestrail"), { mine, count: mine ? (me().chests || 0) : Math.floor(Number(p.chests)) || 0, name: p.name }); if (mine) Cofres.seen(me());
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
    const pe = p.equip && typeof p.equip === "object" ? p.equip : {}, pinv = Array.isArray(p.inv) ? p.inv : [];
    Mercado.decorate({ equip: pe, frameEls: [$("#pface")], bgEl: box });
    Mercado.inventory($("#invbox"), { inv: pinv, equip: pe, mine, name: p.name });
    const pcos = await Mercado.hatCos(pe.hat);
    if (tok !== profTok) return;
    avatarFx = createAvatar($("#acv"), { skinSources: skinSources(p.name, p.avatar, md), slim: !!(md && md.slim), name: p.name, cos: pcos });
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
    game: { id: "runner", name: "Desert Rush", col: "scores", field: "score", unit: "puntos", label: "Minijuego Desert Rush: esquiva los obstáculos" } },
  { id: "end", name: "Elytra Fly", acc: "#b57cf0", img: "img/mundos/end.png", bg: "img/fondos/end.jpg", b: .8,
    game: { id: "elytra", name: "Elytra Fly", col: "scores_elytra", field: "score", unit: "puntos", label: "Minijuego Elytra Fly: vuela entre los pilares del End" } },
  { id: "oceano", name: "Coral Stack", acc: "#3fd0e0", img: "img/mundos/oceano.png", bg: "img/fondos/oceano.jpg",
    game: { id: "coral", name: "Coral Stack", col: "scores_coral", field: "score", unit: "puntos", label: "Minijuego Coral Stack: apila los bloques de coral" } }
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
async function saveScore(score, g = WORLDS[0].game) {
  const u = me(); if (!u || !score) return;
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
    if (cv && set) { const i = Math.floor(t / 1000 * ANIMS.idle.fps) % ANIMS.idle.frames.length, key = i * 100 + (set.ench ? Math.floor(Date.now() / 85) % 14 : 0);
      if (key !== last) { last = key; const { fig } = set.get("idle", i), [cx, cy, cw, ch] = crop || [0, 0, fig.width, fig.height]; cv.width = cw; cv.height = ch; const g = cv.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fig, cx, cy, cw, ch, 0, 0, cw, ch); } }
    raf = requestAnimationFrame(loop);
  };
  async function load(u) {
    const k = ++tok, f = u ? await figsFor(u.uid, u.name, u.avatar) : await loadSkin(["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN]).then(i => i && { img: i, slim: false });
    const cos = f ? await Mercado.hatCos(f.hat) : null;
    if (k !== tok || !f) return; set = createFigureSet(f.img, { slim: f.slim, k: 3, cos }); last = -1; crop = null;
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
    try { await updateDoc(doc(db, "players", u.uid), data); Arcade.refresh(); Cofres.sync(u); }
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
    const u = me(), key = u ? u.uid + "|" + u.avatar + "|" + ((u.equip && u.equip.hat) || "") : "guest";
    if (key === figKey && figs) return;
    const tok = ++figTok; figKey = key;
    let md = null;
    if (u) { try { const d = await getDoc(doc(db, "avatars", u.uid)); md = d.exists() ? d.data() : null; } catch (e) { /* sin skin guardada */ } }
    const srcs = u ? skinSources(u.name, u.avatar, md) : ["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN];
    const img = await loadSkin(srcs), cos = await Mercado.hatCos(u && u.equip && u.equip.hat);
    if (tok !== figTok) return;
    figs = img ? createFigureSet(img, { slim: !!(md && md.slim), k: 2, cos }) : null;
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
  const live = () => Play.id() === "runner" && !$("#v-juego").hidden && $("#gamecard").classList.contains("open") && modal.hidden;
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
    if (Play.id() !== "runner" || e.target.closest(".gc-close")) return; e.preventDefault(); try { gcEl.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
    py0 = e.clientY; swiped = false; clearTimeout(pend); pend = 0;
    if (st === "run" && s && s.y < GY - S - 2) pend = setTimeout(() => { pend = 0; if (!swiped) press(); }, 90); else press();
  });
  gcEl.addEventListener("pointermove", e => {
    if (Play.id() === "runner" && py0 !== null && s && !swiped && e.clientY - py0 > 18) { swiped = true; clearTimeout(pend); pend = 0; if (s.y < GY - S - 2 && !s.fall) { s.fast = true; s.holding = false; } }
  });
  gcEl.addEventListener("contextmenu", e => e.preventDefault());
  const up = () => { if (Play.id() !== "runner") return; py0 = null; if (pend) { clearTimeout(pend); pend = 0; if (!swiped) press(); } release(); if (s) s.fast = false; };
  gcEl.addEventListener("pointerup", up); gcEl.addEventListener("pointercancel", up);
  addEventListener("resize", () => { if (gcEl.classList.contains("open") && Play.id() === "runner") fit(); });
  const begin = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); };
  return {
    show() { fit(); s = s || reset(); loadFace(); begin(); },
    start() { fit(); s = reset(); st = "run"; csLoad(); csRemote(); loadBest(); loadFace(); begin(); },
    stop() { cancelAnimationFrame(raf); if (s) flush(); },
    refresh() { loadFace(); }
  };
})();

/* ---------- Minijuego: Coral Stack (Tetris bajo el mar) ----------
 * Controles: ← → mover · ↓ bajar · Espacio caída directa · ↑ / X girar · Z girar al revés · A girar 180° · C / Shift guardar (HOLD) · P pausa · M sonido
 * Táctil: botones en pantalla. Mecánica estilo TETR.IO: SRS con patadas, 7-bag, HOLD, NEXT ×5, DAS/ARR, bloqueo con reinicios, T-Spin, Back-to-Back, combos, All Clear.
 * XP por líneas: 1→5, 2→10, 3→20, 4→50; con combo ×2 (combo 1-3) o ×3 (combo 4+). Tope de XP por partida para que no se pueda farmear.
 * Monedas: aparecen incrustadas en algunas piezas; se cobran al romper su línea. Máximo 25 por ventana de 24 h. */
const Coral = (() => {
  const cv = $("#cv"), c = cv.getContext("2d");
  const COLS = 10, ROWS = 40, VIS = 20, HID = ROWS - VIS, COIN_MAX = 25, DAY = 864e5, XP_CAP = 250;
  const F = " 'Noto Sans', sans-serif", KINDS = "IOTSZJL";
  const TEX = ["cyan", "yellow", "purple", "green", "red", "blue", "pink"];
  const GLOW = ["#3fe6ff", "#ffd83a", "#c24bff", "#4cf06a", "#ff4a4a", "#4a7bff", "#ff7ab8"];
  const TOUCH = matchMedia("(pointer:coarse)").matches;
  const BASE = { I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], O: [[1,1],[1,1]], T: [[0,1,0],[1,1,1],[0,0,0]], S: [[0,1,1],[1,1,0],[0,0,0]],
    Z: [[1,1,0],[0,1,1],[0,0,0]], J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]] };
  const cw = m => m.map((_, r) => m.map((_, q) => m[m.length - 1 - q][r]));
  const ROT = KINDS.split("").map(k => { const a = [BASE[k]]; for (let i = 1; i < 4; i++) a.push(cw(a[i - 1]));
    return a.map(m => { const cells = []; m.forEach((row, y) => row.forEach((v, x) => v && cells.push([x, y]))); return { n: m.length, cells }; }); });
  const KJ = { "01": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "10": [[0,0],[1,0],[1,-1],[0,2],[1,2]], "12": [[0,0],[1,0],[1,-1],[0,2],[1,2]], "21": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    "23": [[0,0],[1,0],[1,1],[0,-2],[1,-2]], "32": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], "30": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], "03": [[0,0],[1,0],[1,1],[0,-2],[1,-2]] };
  const KI = { "01": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], "10": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], "12": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], "21": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    "23": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], "32": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], "30": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], "03": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]] };
  const IM = {}, ld = (k, src) => { const i = new Image(); i.src = src; IM[k] = i; };
  TEX.forEach(n => ld("t_" + n, `img/coral/tex-${n}.png`));
  for (let i = 0; i < 11; i++) ld("fish" + i, `img/coral/fish${i}.png`);
  for (let i = 0; i < 7; i++) ld("big" + i, `img/coral/big${i}.png`);
  for (let i = 0; i < 4; i++) ld("axo" + i, `img/coral/axo${i}.png`);
  ["puffer", "puffer-small", "drowned"].forEach(n => ld(n, `img/coral/${n}.png`));
  const ok = i => i && i.complete && i.naturalWidth > 0;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const mixc = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t))), rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`;
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const shade = (h, f) => rgb(f >= 0 ? mixc(hex(h), [255, 255, 255], f) : mixc(hex(h), [0, 0, 0], -f));

  /* ---- sonido (WebAudio sintetizado; M = silenciar) ---- */
  let AC = null, muted = false; try { muted = localStorage.getItem("hood_coral_mute") === "1"; } catch (e) { /* sin almacenamiento */ }
  function ac() { if (AC === null) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = false; } } if (AC && AC.state === "suspended") AC.resume(); return AC; }
  function tone(f, d, type = "square", vol = .04, f2 = 0, delay = 0) {
    if (muted) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .03);
  }
  const SCALE = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
  const sfx = {
    move: () => tone(480, .025, "square", .012), rot: () => tone(660, .04, "triangle", .03), hold: () => tone(360, .08, "triangle", .04, 600),
    lock: () => tone(170, .07, "sine", .06, 90), hard: () => { tone(260, .13, "sine", .1, 45); tone(90, .1, "square", .03, 40); },
    clear: (n, cb) => { for (let i = 0; i < n; i++) tone(SCALE[Math.min(10, Math.max(0, cb) + i)], .2, "triangle", .06, 0, i * .045); },
    spin: () => { tone(400, .28, "square", .035, 1300); tone(800, .3, "triangle", .04, 1600, .05); },
    quad: () => { [0, 2, 4, 5, 7].forEach((n, i) => tone(SCALE[n], .3, "triangle", .06, 0, i * .05)); tone(130, .3, "sawtooth", .03, 60); },
    all: () => { for (let i = 0; i < 9; i++) tone(SCALE[i % 8] * (i > 7 ? 2 : 1), .3, "triangle", .06, 0, i * .06); },
    lvl: () => [0, 2, 4, 6].forEach((n, i) => tone(SCALE[n], .22, "square", .035, 0, i * .07)),
    coin: () => { tone(988, .06, "square", .04); tone(1319, .16, "square", .04, 0, .06); }, tick: () => tone(880, .03, "square", .02),
    cd: () => tone(440, .12, "square", .05), go: () => tone(880, .3, "square", .06, 1320),
    over: () => { tone(330, .7, "sawtooth", .06, 55); tone(247, .7, "triangle", .05, 40, .1); }
  };

  /* ---- estado ---- */
  let W = 800, H = 450, DPR = 1, L = null, raf = 0, last = 0, st = "idle", s = null, best = 0, bestKey = "", figs = null, figKey = "", figTok = 0, overAt = 0;
  const held = new Set(), ptrs = new Map();
  let cs = { win: 0, n: 0 };
  const CKEY = () => "hood_coral_coins_" + (me() ? me().uid : "guest");
  const csFresh = () => { if (cs.win && Date.now() - cs.win >= DAY) cs = { win: 0, n: 0 }; return cs; };
  function csLoad() { try { const j = JSON.parse(localStorage.getItem(CKEY()) || "null"); cs = j && typeof j.win === "number" ? { win: j.win, n: Number(j.n) || 0 } : { win: 0, n: 0 }; } catch (e) { cs = { win: 0, n: 0 }; } }
  const csSave = () => { try { localStorage.setItem(CKEY(), JSON.stringify(cs)); } catch (e) { /* sin almacenamiento */ } };
  async function csRemote() {
    const u = me(); if (!u) return;
    try { const d = await getDoc(doc(db, "players", u.uid)); if (d.exists()) { const r = d.data(), w = Number(r.coinWin_coral) || 0, n = Number(r.coinN_coral) || 0; if (w > cs.win || (w === cs.win && n > cs.n)) { cs = { win: w, n }; csSave(); } } } catch (e) { /* se usa lo local */ }
  }
  async function flush() {
    if (!s) return; const xp = s.pxp, cn = s.pcn; s.pxp = 0; s.pcn = 0; const u = me(); if (!u || (!xp && !cn)) return;
    u.xp = (u.xp || 0) + xp; u.coins = (u.coins || 0) + cn;
    const data = { xp: increment(xp) }; if (cn) Object.assign(data, { coins: increment(cn), coinWin_coral: cs.win, coinN_coral: cs.n });
    try { await updateDoc(doc(db, "players", u.uid), data); Arcade.refresh(); Cofres.sync(u); }
    catch (e) { u.xp -= xp; u.coins -= cn; console.warn("No se pudo guardar XP/monedas:", e); Mine.note(`No se pudo guardar tu XP/monedas${e && e.code ? " (" + e.code + ")" : ""}.`); }
  }
  async function loadBest() {
    const u = me(), key = u ? u.uid : "guest"; if (key !== bestKey) { best = 0; bestKey = key; }
    let b = 0;
    if (u) { try { const d = await getDoc(doc(db, "scores_coral", u.uid)); if (d.exists()) b = Math.floor(Number(d.data().score)) || 0; } catch (e) { /* sin récord */ } }
    else { try { b = Number(localStorage.getItem("hood_coral_best")) || 0; } catch (e) { /* sin almacenamiento */ } }
    if (key === bestKey) best = Math.max(best, b);
  }
  async function loadFace() {
    const u = me(), key = u ? u.uid + "|" + u.avatar + "|" + ((u.equip && u.equip.hat) || "") : "guest"; if (key === figKey && figs) return;
    const tok = ++figTok; figKey = key; let md = null;
    if (u) { try { const d = await getDoc(doc(db, "avatars", u.uid)); md = d.exists() ? d.data() : null; } catch (e) { /* sin skin */ } }
    const srcs = u ? skinSources(u.name, u.avatar, md) : ["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN];
    const img = await loadSkin(srcs), cos = await Mercado.hatCos(u && u.equip && u.equip.hat); if (tok !== figTok) return;
    figs = img ? createFigureSet(img, { slim: !!(md && md.slim), k: 4, cos }) : null; if (!figs) figKey = "";
  }

  /* ---- geometría de la pantalla ---- */
  function fit() {
    DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); L = layout(); reef = null; bc = null;
  }
  function layout() {
    const portrait = W / H < .8, o = { portrait }; let cs0, bx, by, side;
    if (!portrait) {
      cs0 = Math.floor(Math.min((H - 28) / 20, W / 22)); bx = Math.round((W - 10 * cs0) / 2); by = Math.round((H - 20 * cs0) / 2);
      const free = Math.max(60, bx - Math.round(.7 * cs0) - 8), lw = Math.min(Math.round(8.5 * cs0), free), rw = Math.min(Math.round(6.6 * cs0), free);
      const lx = bx - Math.round(.7 * cs0) - lw, rx = bx + 10 * cs0 + Math.round(.7 * cs0), u = cs0;
      Object.assign(o, { cs: cs0, bx, by, lx, lw, rx, rw,
        panel: { x: lx, y: by, w: lw, h: 2.3 * u }, score: { x: lx, y: by + 2.5 * u, w: lw, h: 2.6 * u },
        av: { x: lx, y: by + 5.3 * u, w: lw, h: 6.2 * u }, hold: { x: lx, y: by + 11.7 * u, w: Math.min(lw, 5.6 * u), h: 3.7 * u },
        txt: { x: lx, y: by + 15.7 * u, w: lw, h: 4.3 * u }, next: { x: rx, y: by, w: rw, h: 14.2 * u },
        time: { x: rx, y: by + 14.6 * u, w: rw, h: 5.4 * u } });
    } else {
      side = Math.round(Math.min(66, W * .17)); const tc = TOUCH ? Math.round(Math.min(124, H * .19)) : 0, top = Math.round(Math.max(56, H * .075));
      cs0 = Math.floor(Math.min((W - 2 * (side + 6)) / 10, (H - top - tc - 14) / 20)); bx = Math.round((W - 10 * cs0) / 2);
      by = Math.round(top + (H - top - tc - 20 * cs0) / 2); const lx = bx - side - 4, rx = bx + 10 * cs0 + 4;
      Object.assign(o, { cs: cs0, bx, by, lx, lw: side, rx, rw: side,
        panel: { x: 10, y: 8, w: Math.min(120, W * .34), h: 38 }, score: { x: 10 + Math.min(120, W * .34) + 6, y: 6, w: W - 70 - (10 + Math.min(120, W * .34) + 6), h: 44 },
        hold: { x: lx, y: by, w: side, h: side * .78 }, av: { x: lx, y: by + side * .9, w: side, h: Math.min(side * 2.4, 20 * cs0 * .38) },
        txt: { x: lx, y: by + side * .9 + Math.min(side * 2.4, 20 * cs0 * .38) + 8, w: side, h: 60 },
        next: { x: rx, y: by, w: side, h: 14.2 * cs0 * .9 }, time: { x: rx, y: by + 14.2 * cs0 * .9 + 8, w: side, h: 60 } });
    }
    o.btn = []; if (TOUCH) {
      const defs = o.portrait
        ? (() => { const a = 4, bw = (W - 20 - 3 * 6) / a, bh = Math.round(Math.min(56, H * .085)), y0 = H - 2 * bh - 14; const r = [];
            [["left", "◀"], ["right", "▶"], ["ccw", "↺"], ["cw", "↻"]].forEach(([id, t], i) => r.push({ id, t, x: 10 + i * (bw + 6), y: y0, w: bw, h: bh }));
            r.push({ id: "soft", t: "▼", x: 10, y: y0 + bh + 6, w: bw, h: bh }, { id: "hold", t: "HOLD", x: 10 + bw + 6, y: y0 + bh + 6, w: bw, h: bh }, { id: "hard", t: "⤓ DROP", x: 10 + 2 * (bw + 6), y: y0 + bh + 6, w: 2 * bw + 6, h: bh }); return r; })()
        : (() => { const bs = clamp(Math.min(64, (o.lx - 18) / 2.1), 36, 64), g = 8, r = [], bt = H - 14 - 2 * bs - g, rx0 = W - 10 - 2 * bs - g;
            r.push({ id: "left", t: "◀", x: 10, y: bt, w: bs, h: bs }, { id: "right", t: "▶", x: 10 + bs + g, y: bt, w: bs, h: bs }, { id: "soft", t: "▼", x: 10, y: bt + bs + g, w: 2 * bs + g, h: bs });
            r.push({ id: "ccw", t: "↺", x: rx0, y: bt, w: bs, h: bs }, { id: "cw", t: "↻", x: rx0 + bs + g, y: bt, w: bs, h: bs }, { id: "hold", t: "HOLD", x: rx0, y: bt + bs + g, w: bs, h: bs }, { id: "hard", t: "⤓", x: rx0 + bs + g, y: bt + bs + g, w: bs, h: bs }); return r; })();
      o.btn = defs;
    }
    return o;
  }

  /* ---- partida ---- */
  const fresh = () => ({
    g: Array.from({ length: ROWS }, () => Array(COLS).fill(null)), bag: [], q: [], hold: null, canHold: true, p: null, cg: 4 + Math.floor(rnd(0, 5)),
    ms: 0, cd: 3400, cdN: 4, go: 0, paused: false, over: false, score: 0, lines: 0, pieces: 0, lvF: 1, lvl: 1, combo: -1, b2b: -1, D: 0, dep: 0,
    xp: 0, coins: 0, pxp: 0, pcn: 0, xpArr: 0, cArr: 0, xpGlow: 0, lvUp: 0, lvTxt: "", pop: 0, base: (me() && me().xp) || 0, xpShow: (me() && me().xp) || 0,
    fl: [], cf: [], ev: null, fxl: [], pts: [], rings: [], trails: [], shake: 0, flash: 0, flashC: "#fff", danger: 0, recDone: false, recT: 0, bannerT: 0, banner: "", banT: 0,
    dasDir: 0, dasT: 0, arrT: 0, life: [], lifeT: 0, scare: 0, ph: 0, ovT: 0, capNote: 0, spinMsg: 0
  });
  const coinsPending = () => { let n = 0; s.g.forEach(r => r.forEach(x => { if (x && x.coin) n++; })); s.q.forEach(x => { if (x.coin) n++; }); if (s.p && s.p.cc) n++; if (s.hold && s.hold.coin) n++; return n; };
  function coinRoll() { if (--s.cg > 0) return false; s.cg = 9 + Math.floor(rnd(0, 8)); return COIN_MAX - csFresh().n - coinsPending() > 0; }
  function fillQ() { while (s.q.length < 8) { if (!s.bag.length) { s.bag = [0, 1, 2, 3, 4, 5, 6]; for (let i = 6; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]]; } } s.q.push({ k: s.bag.pop(), coin: coinRoll() }); } }
  const fits = (k, r, x, y) => ROT[k][r].cells.every(([cx, cy]) => { const gx = x + cx, gy = y + cy; return gx >= 0 && gx < COLS && gy < ROWS && (gy < 0 || !s.g[gy][gx]); });
  function mkPiece(q) { const k = q.k; return { k, r: 0, x: k === 1 ? 4 : 3, y: k === 0 ? 18 : 19, cc: q.coin ? pick(ROT[k][0].cells).slice() : null, lt: 0, lr: 0, low: 0, ga: 0, kick: 0, last: "" }; }
  function spawn(q) {
    q = q || s.q.shift(); fillQ(); const p = mkPiece(q); p.low = p.y;
    if (!fits(p.k, 0, p.x, p.y)) { p.y--; if (!fits(p.k, 0, p.x, p.y)) { s.p = p; topOut(); return; } }
    s.p = p; s.pieces++;
  }
  const grounded = () => !fits(s.p.k, s.p.r, s.p.x, s.p.y + 1);
  function bump() { const p = s.p; if (p.y > p.low) { p.low = p.y; p.lr = 0; } if (grounded() && p.lr < 15) { p.lt = 0; p.lr++; } }
  function move(dx) {
    const p = s.p; if (!p || !fits(p.k, p.r, p.x + dx, p.y)) return false;
    p.x += dx; p.last = "move"; bump(); sfx.move(); avMove(dx); return true;
  }
  function rot(d) {
    const p = s.p; if (!p) return false; const n = (p.r + d + 4) % 4;
    const list = p.k === 1 ? [[0, 0]] : d === 2 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : (p.k === 0 ? KI : KJ)[p.r + "" + n];
    for (let i = 0; i < list.length; i++) {
      const nx = p.x + list[i][0], ny = p.y - list[i][1];
      if (fits(p.k, n, nx, ny)) {
        if (p.cc) { const m = ROT[p.k][0].n, [ox, oy] = p.cc; p.cc = d === 1 ? [m - 1 - oy, ox] : d === -1 ? [oy, m - 1 - ox] : [m - 1 - ox, m - 1 - oy]; }
        p.r = n; p.x = nx; p.y = ny; p.kick = i; p.last = "rot"; bump(); sfx.rot(); return true;
      }
    }
    return false;
  }
  function doHold() {
    if (!s.p || !s.canHold) return; const q = { k: s.p.k, coin: !!s.p.cc }; sfx.hold();
    const prev = s.hold; s.hold = q; s.canHold = false; s.p = null; s.pieces--;
    spawn(prev || null); s.canHold = false; avDo("walk", 260, 0, { flip: false }); avSay("↻", 700);
  }
  const ghostY = () => { const p = s.p; let y = p.y; while (fits(p.k, p.r, p.x, y + 1)) y++; return y; };
  function hardDrop() {
    const p = s.p; if (!p) return; const y0 = p.y, y1 = ghostY(), rows = y1 - y0; p.y = y1; s.score += 2 * rows; p.last = rows > 0 ? "drop" : p.last;
    const cells = ROT[p.k][p.r].cells;
    if (rows > 0) cells.forEach(([cx, cy]) => s.trails.push({ gx: p.x + cx, y0: y0 + cy, y1: y1 + cy, k: p.k, t: 0 }));
    s.shake = Math.max(s.shake, 5 + Math.min(rows, 14) * .35); sfx.hard(); avHop(); lock(true);
  }
  const lockMs = () => clamp(500 - (s.lvl - 1) * 14, 200, 500) / 16.667;
  const gravity = () => { const Lg = 1 + (s.lvF - 1) * .85, sec = Math.pow(Math.max(.02, .8 - (Lg - 1) * .007), Lg - 1); return Math.min(20, 1 / (sec * 60)); };

  function lock(hard) {
    const p = s.p, cells = ROT[p.k][p.r].cells; let spin = 0;
    if (p.k === 2 && p.last === "rot") {
      const cr = [[0, 0], [2, 0], [0, 2], [2, 2]].map(([cx, cy]) => { const gx = p.x + cx, gy = p.y + cy; return gx < 0 || gx >= COLS || gy >= ROWS || (gy >= 0 && !!s.g[gy][gx]); });
      if (cr.filter(Boolean).length >= 3) {
        const fr = [[0, 1], [1, 3], [2, 3], [0, 2]][p.r]; // esquinas frontales: r0 arriba(0,1) · r1 derecha(1,3) · r2 abajo(2,3) · r3 izquierda(0,2)
        spin = (cr[fr[0]] && cr[fr[1]]) || p.kick === 4 ? 2 : 1;
      }
    }
    if (cells.every(([, cy]) => p.y + cy < HID)) { cells.forEach(([cx, cy]) => { const gy = p.y + cy; if (gy >= 0) s.g[gy][p.x + cx] = { k: p.k, coin: false }; }); s.p = null; topOut(); return; }
    cells.forEach(([cx, cy]) => { s.g[p.y + cy][p.x + cx] = { k: p.k, coin: !!p.cc && p.cc[0] === cx && p.cc[1] === cy }; s.fxl.push({ gx: p.x + cx, gy: p.y + cy, k: p.k, t: 0 }); });
    if (!hard) { s.shake = Math.max(s.shake, 1.5); sfx.lock(); }
    s.p = null; s.canHold = true; s.dasT = Math.min(s.dasT, 1e9);
    resolve(spin, p); if (!s.over) spawn();
  }
  const ptX = gx => L.bx + gx * L.cs, ptY = gy => L.by + (gy - HID) * L.cs;
  function burst(x, y, cols, n, o = {}) { for (let i = 0; i < n && s.pts.length < 500; i++) s.pts.push({ x, y, vx: rnd(-(o.sp || 4), o.sp || 4), vy: rnd(-(o.up || 5), 1.5), l: rnd(25, 55), m: 55, c: cols[i % cols.length], sz: rnd(2, o.sz || 4.5), ty: o.ty || 0 }); }
  const comboCol = n => n >= 7 ? "#ff5cf0" : n >= 4 ? "#ff9a2e" : n >= 2 ? "#6dfc7a" : "#5fe8ff";

  function resolve(spin, p) {
    const full = []; for (let y = 0; y < ROWS; y++) if (s.g[y].every(Boolean)) full.push(y);
    const n = full.length;
    if (!n) {
      if (spin) { s.score += (spin === 2 ? 400 : 100) * s.lvl; showEv(spin === 2 ? "T-SPIN" : "T-SPIN MINI", [], 0, 0, "#c24bff"); sfx.spin(); avDo("jump", 600, 1); }
      s.combo = -1; return;
    }
    s.combo++; const cb = s.combo;
    let coinsGot = 0; const cells = [];
    full.forEach(y => s.g[y].forEach((x, gx) => { cells.push({ gx, gy: y, k: x.k }); if (x.coin) { coinsGot++; s.cf.push({ x: ptX(gx) + L.cs / 2, y: ptY(y) + L.cs / 2, t: -s.cf.length * .12 }); } }));
    s.g = s.g.filter((_, y) => !full.includes(y)); while (s.g.length < ROWS) s.g.unshift(Array(COLS).fill(null));
    s.lines += n;
    const hardClear = n === 4 || spin > 0; if (hardClear) s.b2b++; else s.b2b = -1;
    const table = spin ? (spin === 2 ? [0, 800, 1200, 1600] : [0, 200, 400, 400]) : [0, 100, 300, 500, 800];
    let pts = table[n] * s.lvl; if (hardClear && s.b2b > 0) pts = Math.floor(pts * 1.5);
    pts += cb > 0 ? 50 * cb * s.lvl : 0;
    const allc = s.g.every(r => r.every(x => !x)); if (allc) pts += 2500 * s.lvl;
    s.score += pts;
    /* XP: 1→5, 2→10, 3→20, 4→50; combo 1-3 → ×2, combo 4+ → ×3; tope por partida */
    let xp = [0, 5, 10, 20, 50][n]; const mult = cb >= 4 ? 3 : cb >= 1 ? 2 : 1; xp *= mult;
    const room = Math.max(0, XP_CAP - s.xp); if (xp > room) { xp = room; s.capNote = 240; }
    if (xp > 0) { s.xp += xp; s.pxp += xp; s.fl.push({ n: xp, t: 0 }); }
    if (coinsGot) { const q = csFresh(); if (!q.win) q.win = Date.now(); const take = Math.min(coinsGot, COIN_MAX - q.n); q.n += take; s.coins += take; s.pcn += take; csSave(); s.cf.length = Math.min(s.cf.length, take + (s.cf.length - coinsGot)); sfx.coin(); }
    const nm = (spin ? "T-SPIN" + (spin === 1 ? " MINI" : "") + " " : "") + ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"][n];
    const sub = []; if (s.b2b > 0) sub.push("BACK-TO-BACK x" + s.b2b); if (cb > 0) sub.push(cb + " COMBO"); if (allc) sub.push("ALL CLEAR");
    const col = allc ? "#ffe45c" : spin ? "#d27dff" : n === 4 ? "#ffd23f" : comboCol(cb);
    showEv(nm.trim(), sub, xp, coinsGot ? Math.min(coinsGot, 99) : 0, col, mult);
    /* efectos: barrido, chispas del color de cada bloque, onda de choque */
    const mid = full.reduce((a, y) => a + y, 0) / n; full.forEach(y => s.rings.push({ kind: "row", gy: y, t: 0, c: col }));
    cells.forEach(o => burst(ptX(o.gx) + L.cs / 2, ptY(o.gy) + L.cs / 2, [GLOW[o.k], "#ffffff"], 2, { sp: 5 + n, up: 6, sz: 5 }));
    if (n >= 4 || spin || allc || cb >= 3) s.rings.push({ kind: "ring", x: L.bx + 5 * L.cs, y: ptY(mid) + L.cs / 2, t: 0, c: col });
    s.shake = Math.max(s.shake, 3 + n * 2.2 + (hardClear ? 3 : 0)); s.flash = 8 + n * 4; s.flashC = col; s.scare = Math.min(1.6, s.scare + .35 * n);
    if (allc) { sfx.all(); s.banner = "ALL CLEAR"; s.bannerT = 160; s.shake = 16; } else if (n === 4) sfx.quad(); else if (spin) { sfx.spin(); sfx.clear(n, cb); } else sfx.clear(n, cb);
    if (spin || n === 4 || allc || cb >= 3) { avDo("dance", n === 4 || allc ? 2400 : 1700, 2); avSay(allc ? "★" : "♪", 1500); }
    else { avDo("jump", 650, 1); avSay(n >= 3 ? "!!" : "!", 900); }
    av.ring = 40; av.ringC = col;
    if (!allc) { /* si el tablero casi llega al techo y se limpia, alivio */ }
  }
  function showEv(name, sub, xp, coins, col, mult = 1) { s.ev = { name, sub, xp, coins, col, mult, t: 0 }; s.pop = 22; }
  function topOut() {
    if (s.over) return; s.over = true; st = "over"; overAt = performance.now(); s.ovT = 0; s.shake = 18; sfx.over(); s.p = null;
    for (let y = HID; y < ROWS; y++) s.g[y].forEach((x, gx) => { if (x) burst(ptX(gx) + L.cs / 2, ptY(y) + L.cs / 2, [GLOW[x.k], "#fff"], 1, { sp: 6, up: 8 }); });
    avDo("idle", 99999, 5); avSay("...", 99999);
    const sc = Math.min(4999999, Math.floor(s.score)); if (sc > best) best = sc;
    if (!me()) { try { localStorage.setItem("hood_coral_best", String(best)); } catch (e) { /* sin almacenamiento */ } }
    saveScore(sc, WORLDS[2].game); flush();
  }

  /* ---- avatar: acompaña la partida y reacciona ---- */
  const av = { anim: "idle", t: 0, until: 0, pr: 0, flip: false, dx: 0, hop: 0, vh: 0, say: "", sayT: 0, ring: 0, ringC: "#fff" };
  function avDo(anim, ms, pr, o = {}) { const now = performance.now(); if (pr < av.pr && now < av.until) return; if (anim !== av.anim) av.t = 0; av.anim = anim; av.until = now + ms; av.pr = pr; if ("flip" in o) av.flip = o.flip; if (anim === "jump") { av.vh = -5.2; } }
  const avSay = (t, ms) => { av.say = t; av.sayT = ms; };
  function avMove(dx) { av.dx = clamp(av.dx + dx * 5, -14, 14); if (av.pr <= 0) avDo("walk", 230, 0, { flip: dx > 0 }); }
  function avHop() { if (av.pr <= 0 && !s.over) { av.vh = -3.2; } }
  function avTick(k) {
    const now = performance.now(); if (now > av.until && av.anim !== "idle") { av.anim = "idle"; av.pr = 0; av.t = 0; }
    const a = ANIMS[av.anim], fps = av.anim === "jump" ? a.fps * 1.9 : av.anim === "walk" ? a.fps * 1.4 : a.fps; av.t += k / 60 * fps;
    av.dx *= Math.pow(.9, k); av.vh += .42 * k; av.hop += av.vh * k; if (av.hop >= 0) { av.hop = 0; av.vh = Math.min(0, av.vh); if (av.vh === 0) av.vh = 0; }
    if (av.sayT > 0) { av.sayT -= k * 16.667; if (av.sayT <= 0) av.say = ""; } if (av.ring > 0) av.ring -= k;
    if (!s.over && s.danger > .7 && av.pr < 1 && !av.say) avSay("!?", 600);
  }

  /* ---- bucle de actualización ---- */
  function startGame() {
    s = fresh(); st = "run"; csLoad(); csRemote(); loadBest(); loadFace(); held.clear(); fillQ(); s.cBase = csFresh().n;
    av.anim = "idle"; av.pr = 0; av.until = 0; av.say = ""; av.hop = 0; av.vh = 0; av.dx = 0; s.life = []; s.lifeT = 0; for (let i = 0; i < 9; i++) spawnLife(true);
    sfx.cd();
  }
  const input = {
    left: d => { if (d) { s.dasDir = -1; s.dasT = 0; s.arrT = 0; move(-1); } else if (s.dasDir === -1) { s.dasDir = held.has("right") ? 1 : 0; s.dasT = 0; } },
    right: d => { if (d) { s.dasDir = 1; s.dasT = 0; s.arrT = 0; move(1); } else if (s.dasDir === 1) { s.dasDir = held.has("left") ? -1 : 0; s.dasT = 0; } }
  };
  function act(a, down) {
    if (!s) return;
    if (st === "over") { if (down && (a === "hard" || a === "cw" || a === "hold") && performance.now() - overAt > 650) startGame(); return; }
    if (down) { ac(); if (held.has(a) && a !== "") { /* ya pulsada */ } held.add(a); } else held.delete(a);
    if (s.paused) { if (down) s.paused = false; return; }
    if (s.cd > 0 || !s.p) return;
    if (a === "left" || a === "right") { input[a](down); return; }
    if (!down) return;
    if (a === "cw") rot(1); else if (a === "ccw") rot(-1); else if (a === "r180") rot(2); else if (a === "hard") hardDrop(); else if (a === "hold") doHold();
  }
  function timers(k) {
    const ms = k * 16.667;
    ["pop", "flash", "xpGlow", "lvUp", "capNote", "bannerT", "recT"].forEach(n => { if (s[n] > 0) s[n] -= k; });
    s.shake *= Math.pow(.86, k); if (s.shake < .1) s.shake = 0; s.scare *= Math.pow(.97, k);
    if (s.ev) { s.ev.t += ms; if (s.ev.t > 4200) s.ev = null; }
    for (const f of s.fl) f.t += k / 46;
    s.fl = s.fl.filter(f => {
      if (f.t < 1) return true; const a = xpInfo(s.base + s.xpArr).lvl; s.xpArr += f.n; s.xpGlow = 30; sfx.tick(); const b = xpInfo(s.base + s.xpArr).lvl;
      if (b > a) { s.lvUp = 170; s.lvTxt = "LEVEL " + b; s.pop = 30; sfx.lvl(); avDo("dance", 2000, 3); avSay("★", 1600); }
      return false;
    });
    for (const q of s.cf) q.t += k / 50; s.cf = s.cf.filter(q => { if (q.t < 1) return true; s.cArr++; return false; });
    s.xpShow += (s.base + s.xpArr - s.xpShow) * Math.min(1, .12 * k);
    s.fxl.forEach(f => f.t += k); s.fxl = s.fxl.filter(f => f.t < 14);
    s.rings.forEach(r => r.t += k); s.rings = s.rings.filter(r => r.t < 34);
    s.trails.forEach(t => t.t += k); s.trails = s.trails.filter(t => t.t < 12);
    s.pts.forEach(q => { q.x += q.vx * k; q.y += q.vy * k; q.vy += (q.ty ? -.02 : .22) * k; q.vx *= Math.pow(.985, k); q.l -= k; }); s.pts = s.pts.filter(q => q.l > 0);
    if (s.over) s.ovT += k;
    avTick(k);
  }
  function update(k) {
    const ms = k * 16.667;
    if (s.paused) return;
    if (s.cd > 0) { s.cd -= ms; const n = Math.ceil(s.cd / 1000); if (n < s.cdN && n >= 1) { s.cdN = n; sfx.cd(); } if (s.cd <= 0) { s.go = 700; sfx.go(); spawn(); } timers(k); return; }
    if (s.go > 0) s.go -= ms;
    if (!s.over) {
      s.ms += ms; s.lvF = 1 + Math.max(s.lines / 8, s.ms / 42000); const lv = Math.floor(s.lvF);
      if (lv > s.lvl) { s.lvl = lv; s.banner = "DEEPER"; s.bannerT = 150; s.banT = 0; s.pop = 24; sfx.lvl(); avDo("jump", 700, 2); avSay("!", 900); burst(L.bx + 5 * L.cs, L.by + 10 * L.cs, ["#7be8ff", "#ffffff"], 30, { sp: 7, up: 7 }); }
      s.dep = (s.lvF - 1) * 18; const sc = Math.floor(s.score); if (best > 0 && sc > best && !s.recDone) { s.recDone = true; s.recT = 170; sfx.lvl(); avDo("dance", 1500, 3); }
      /* DAS / ARR */
      if (s.dasDir && s.p) { s.dasT += ms; if (s.dasT >= 130) { s.arrT += ms; while (s.arrT >= 28) { s.arrT -= 28; if (!move(s.dasDir)) break; } } }
      /* gravedad, bajada suave y bloqueo */
      const p = s.p;
      if (p) {
        const soft = held.has("soft"), g = gravity(), rate = soft ? Math.max(g * 20, .55) : g; p.ga += rate * k;
        while (p.ga >= 1) { p.ga -= 1; if (fits(p.k, p.r, p.x, p.y + 1)) { p.y++; p.last = "drop"; if (soft) s.score++; if (p.y > p.low) { p.low = p.y; p.lr = 0; } } else { p.ga = 0; break; } }
        if (grounded()) { p.lt += k; if (p.lt >= lockMs() || (soft && p.lt > 3 && p.lr >= 15)) lock(false); } else p.lt = 0;
      }
      let top = ROWS; for (let y = HID - 2; y < ROWS && top === ROWS; y++) if (s.g[y].some(Boolean)) top = y; const h = ROWS - top; s.danger += ((h >= 16 ? 1 : h >= 14 ? .45 : 0) - s.danger) * Math.min(1, .08 * k);
    }
    timers(k); life(k);
  }

  /* ---- vida marina ---- */
  let dolphin = null;
  function makeDolphin() {
    const Wd = 48, Hd = 22, o = document.createElement("canvas"); o.width = Wd; o.height = Hd; const g = o.getContext("2d"), cy = 11;
    const hf = x => x < 8 ? 1 + x * .15 : x < 14 ? lerp(2.2, 5, (x - 8) / 6) : x < 30 ? 5 + Math.sin((x - 14) / 16 * Math.PI) : x < 40 ? lerp(5, 3.2, (x - 30) / 10) : Math.max(1, 3.2 - (x - 40) * .32);
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    for (let x = 0; x < Wd; x++) { const h = hf(x), y0 = Math.round(cy - h), y1 = Math.round(cy + h);
      for (let y = y0; y <= y1; y++) { const v = (y - y0) / Math.max(1, y1 - y0); let col = v < .36 ? "#4a6b8a" : v < .6 ? "#7ca0bd" : "#dce9f2"; if (Math.abs(v - .36) < .07 && (x + y) % 2) col = "#7ca0bd"; if (Math.abs(v - .6) < .07 && (x + y) % 2) col = "#dce9f2"; px(x, y, col); } }
    for (let x = 16; x <= 28; x++) { const fh = Math.max(0, Math.round(6 - Math.abs(x - 19) * (x > 19 ? .62 : 1.8))); for (let i = 1; i <= fh; i++) px(x, Math.round(cy - hf(x)) - i, "#41607b"); }
    for (let x = 0; x < 6; x++) { const lh = Math.round(2 + (5 - x) * .9); for (let y = -lh; y <= lh; y++) if (!(x < 2 && Math.abs(y) < 1)) px(x, cy + y, "#41607b"); }
    for (let i = 0; i < 5; i++) for (let j = 0; j <= 4 - i; j++) px(23 + i, Math.round(cy + hf(23 + i)) + j, "#41607b");
    px(38, cy - 2, "#0b1218"); px(39, cy + 1, "#2c4258");
    const d = g.getImageData(0, 0, Wd, Hd), a = d.data, solid = (x, y) => x >= 0 && y >= 0 && x < Wd && y < Hd && a[(y * Wd + x) * 4 + 3] > 0, out = [];
    for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) out.push([x, y]);
    out.forEach(([x, y]) => px(x, y, "#2a4156")); return o;
  }
  function drawSquid(x, y, u, ph, a) {
    c.save(); c.translate(Math.round(x), Math.round(y)); c.globalAlpha = a;
    const gl = c.createRadialGradient(0, 0, 0, 0, 0, u * 12); gl.addColorStop(0, "rgba(80,255,225,.42)"); gl.addColorStop(1, "rgba(80,255,225,0)"); c.globalCompositeOperation = "lighter"; c.fillStyle = gl; c.fillRect(-u * 12, -u * 12, u * 24, u * 24); c.globalCompositeOperation = "source-over";
    const R = (px, py, w, h, col) => { c.fillStyle = col; c.fillRect(px * u, py * u, w * u, h * u); };
    R(-3, -7, 6, 1, "#12324f"); R(-4, -6, 8, 9, "#16406a"); R(-3, -6, 2, 3, "#1b5a8c"); R(-4, 3, 8, 1, "#102c47");
    [[-2, -4], [1, -3], [-1, 0], [2, 1], [-3, 2]].forEach(([dx, dy], i) => R(dx, dy, 1, 1, (Math.floor(ph * 2) + i) % 3 ? "#7dffe3" : "#c9fff3"));
    R(-4, -1, 1, 2, "#0a1b2d"); R(3, -1, 1, 2, "#0a1b2d"); R(-3, 0, 1, 1, "#e9fffb"); R(2, 0, 1, 1, "#e9fffb");
    for (let i = -3; i <= 2; i++) { const len = 7 + (i & 1) * 2; for (let j = 0; j < len; j++) R(i + Math.round(Math.sin(ph + j * .6 + i) * 1.2), 4 + j, 1, 1, j > len - 3 ? "#7dffe3" : "#1a4f80"); }
    c.restore();
  }
  function spawnLife(init) {
    const D = s.D, wts = [["school", 5 * (1 - .45 * D)], ["puffer", 1.8 * (1 - .4 * D)], ["dolphin", 1.5 * Math.max(0, 1 - D * 1.5)], ["axo", 1.5 * (1 - .2 * D)], ["naut", D < .08 ? .3 : .6 + D], ["drown", D > .3 ? (D - .3) * 3 : 0], ["squid", D > .35 ? (D - .35) * 4 : 0]];
    let r = Math.random() * wts.reduce((a, b) => a + b[1], 0), t = "school"; for (const w of wts) { if ((r -= w[1]) <= 0) { t = w[0]; break; } }
    const dir = Math.random() < .5 ? 1 : -1, sc = H / 540, layer = Math.floor(rnd(0, 3)), ls = [.6, .85, 1.1][layer], x0 = init ? rnd(0, W) : dir > 0 ? -140 : W + 140, by = rnd(H * .08, H * .66);
    const mk = (o) => s.life.push(Object.assign({ x: x0, y: by, vx: dir * rnd(25, 45), ph: rnd(0, 6), amp: rnd(6, 20), fr: rnd(.8, 1.6), layer, dir, scale: ls * sc, a: 1 }, o));
    if (t === "school") { const col = Math.floor(rnd(0, 11)), n = 3 + Math.floor(rnd(0, 4)), sp = dir * rnd(35, 60), z = rnd(.42, .7) * ls * sc;
      for (let i = 0; i < n; i++) mk({ t: "fish", im: "fish" + (Math.random() < .2 ? Math.floor(rnd(0, 11)) : col), x: x0 - dir * (i * rnd(26, 46)), y: by + rnd(-26, 26), vx: sp * rnd(.94, 1.06), scale: z * rnd(.9, 1.1), ph: rnd(0, 6), amp: 5 }); }
    else if (t === "puffer") mk({ t: "puffer", im: Math.random() < .3 ? "puffer" : "puffer-small", scale: rnd(.5, .75) * ls * sc, vx: dir * rnd(14, 28) });
    else if (t === "dolphin") { mk({ t: "dolphin", vx: dir * rnd(95, 150), amp: rnd(26, 52), fr: rnd(.9, 1.3), scale: rnd(.7, 1.05) * (layer ? .85 : .65) * sc, y: by * .7 }); }
    else if (t === "axo") mk({ t: "axo", im: "axo" + Math.floor(rnd(0, 4)), scale: rnd(.5, .8) * ls * sc, vx: dir * rnd(14, 26), amp: rnd(10, 22) });
    else if (t === "naut") mk({ t: "naut", im: "big" + Math.floor(rnd(0, 7)), scale: rnd(.5, .85) * ls * sc, vx: dir * rnd(9, 18), amp: rnd(8, 16) });
    else if (t === "drown") mk({ t: "drown", im: "drowned", scale: rnd(.55, .9) * ls * sc, vx: dir * rnd(6, 12), y: rnd(H * .2, H * .6), amp: rnd(14, 28), fr: rnd(.3, .5) });
    else mk({ t: "squid", scale: rnd(1.4, 2.2) * ls * sc, vx: dir * rnd(10, 18), amp: rnd(8, 18), y: rnd(H * .25, H * .7) });
  }
  function life(k) {
    const dt = k / 60, D = s.D; s.lifeT -= dt;
    if (s.lifeT <= 0 && s.life.length < 20) { spawnLife(false); s.lifeT = rnd(.7, 1.8); }
    const sp = 1 + s.scare;
    s.life.forEach(o => { o.ph += dt * o.fr * (1 + s.scare * .6); o.x += o.vx * dt * (o.t === "squid" ? .6 + .9 * Math.max(0, Math.sin(o.ph * 1.6)) : 1) * sp; o.dy = Math.sin(o.ph) * o.amp; });
    s.life = s.life.filter(o => o.x > -260 && o.x < W + 260);
  }
  function drawLife(layer) {
    s.life.forEach(o => {
      if (o.layer !== layer) return; const y = o.y + (o.dy || 0), D = s.D; let a = o.a * (1 - D * .15);
      if (o.t === "squid") { drawSquid(o.x, y, o.scale * 2.4, o.ph, Math.min(1, .5 + D)); return; }
      let im = null, w, h, flip = o.vx < 0, rot = 0;
      if (o.t === "dolphin") { dolphin = dolphin || makeDolphin(); im = dolphin; w = 48 * o.scale * 3; h = 22 * o.scale * 3; flip = o.vx < 0; rot = Math.atan2(Math.cos(o.ph) * o.amp * o.fr * .12, Math.abs(o.vx) * .06) * (flip ? -1 : 1) * .6; }
      else { im = IM[o.im]; if (!ok(im)) return; w = im.naturalWidth * o.scale; h = im.naturalHeight * o.scale; flip = o.t === "naut" ? o.vx < 0 : o.vx > 0; if (o.t === "drown") { flip = false; rot = Math.sin(o.ph) * .12; } else if (o.t !== "fish") rot = Math.sin(o.ph) * .06; }
      c.save(); c.translate(Math.round(o.x), Math.round(y)); if (rot) c.rotate(rot); if (flip) c.scale(-1, 1); c.globalAlpha = a; c.imageSmoothingEnabled = o.t !== "dolphin" && o.scale < .98;
      c.drawImage(im, -w / 2, -h / 2, w, h); c.restore();
    });
  }

  /* ---- arrecife procedural (pixel art, capas con paralaje) ---- */
  let reef = null, bc = null, bcReady = false;
  const CORAL_COLS = ["#e0679c", "#a43bd0", "#3fd0e0", "#3a63e8", "#e8c93a", "#d84444", "#3cc552", "#ff8a3d", "#f08bd0"];
  const mul = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  function buildReef() {
    const px = Math.max(3, Math.round(H / 120)), TW = Math.ceil(Math.max(W, 900) / px) * px, layers = [];
    [{ hg: .36, n: 7, sp: 4, sd: 11, dk: .35 }, { hg: .27, n: 8, sp: 9, sd: 23, dk: .12 }, { hg: .19, n: 8, sp: 16, sd: 37, dk: -.1 }].forEach((cf, li) => {
      const o = document.createElement("canvas"), oh = Math.ceil(H * cf.hg / px) * px; o.width = TW; o.height = oh; const g = o.getContext("2d"), R = mul(cf.sd * 97);
      const U = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }, wrap = fn => { fn(0); fn(-TW); };
      const sandA = shade("#d8c58c", -.5 - cf.dk * .3), sandB = shade("#c4b073", -.5 - cf.dk * .3);
      for (let y = oh - px * 3; y < oh; y += px) for (let x = 0; x < TW; x += px) U(x, y, px, px, R() < .5 ? sandA : sandB);
      for (let i = 0; i < 6 + li * 2; i++) { const rx = R() * TW, rw = (3 + R() * 5) * px; wrap(o2 => { U(rx + o2, oh - px * 5, rw, px * 2, shade("#7c8794", -.45 + cf.dk)); U(rx + o2 + px, oh - px * 6, rw - px * 2, px, shade("#9aa5b2", -.4 + cf.dk)); }); }
      const n = Math.round(cf.n * TW / 900);
      for (let i = 0; i < n; i++) {
        const x = (i + R()) * TW / n, base = shade(pick2(R, CORAL_COLS), cf.dk * .5), by = oh - px * 3, kind = Math.floor(R() * 6), col0 = pick2(R, CORAL_COLS), sh = f => shade(col0, f + cf.dk * .4);
        wrap(ox => {
          const X = x + ox;
          if (kind === 0) { const nt = 3 + Math.floor(R() * 3); for (let j = 0; j < nt; j++) { const wt = 3 + Math.floor(R() * 2), ht = 7 + Math.floor(R() * 14), tx = X + j * (wt - 1) * px; U(tx, by - ht * px, wt * px, ht * px, sh(0)); U(tx, by - ht * px, px, ht * px, sh(.28)); U(tx + (wt - 1) * px, by - ht * px, px, ht * px, sh(-.28)); U(tx + px, by - ht * px, (wt - 2) * px, px, sh(-.6)); U(tx, by - ht * px - px, wt * px, px, sh(.4)); } }
          else if (kind === 1) { const rx = 7 + Math.floor(R() * 6), ry = rx * .66; for (let q = -rx; q <= rx; q++) { const hh = Math.round(ry * Math.sqrt(1 - (q / rx) ** 2)); U(X + q * px, by - hh * px, px, hh * px, sh(0)); U(X + q * px, by - hh * px, px, px, sh(.32));
              for (let j = 1; j < 4; j++) { const yy = Math.round(hh * j / 4 + Math.sin(q * .85 + j * 2.1) * .9); if (yy > 0 && yy < hh) U(X + q * px, by - yy * px, px, px, sh(-.38)); } } }
          else if (kind === 2) { const sy = by - 3 * px; U(X, sy, px * 2, px * 3, sh(-.5)); const rays = 9; for (let r = 0; r <= rays; r++) { const an = -Math.PI / 2 + (r / rays - .5) * 2.0, len = 11 + R() * 7; for (let d = 1; d < len; d++) U(X + Math.cos(an) * d * px, sy + Math.sin(an) * d * px, px, px, sh(d % 5 === 0 ? .3 : -.05)); }
              [.55, .8].forEach(f => { for (let r = 0; r < rays * 4; r++) { const an = -Math.PI / 2 + (r / (rays * 4) - .5) * 2.0; U(X + Math.cos(an) * 15 * f * px, sy + Math.sin(an) * 15 * f * px, px, px, sh(.15)); } }); }
          else if (kind === 3) { const br = (x0, y0, len, an, d) => { for (let t2 = 0; t2 < len; t2++) { const bx2 = x0 + Math.cos(an) * t2 * px, by2 = y0 + Math.sin(an) * t2 * px; U(bx2, by2, px * (d > 1 ? 2 : 1), px, sh(t2 % 3 ? 0 : .22)); }
              if (d > 0) { const ex = x0 + Math.cos(an) * len * px, ey = y0 + Math.sin(an) * len * px; br(ex, ey, len * .74, an - rnd(.35, .65), d - 1); br(ex, ey, len * .74, an + rnd(.35, .65), d - 1); } }; br(X, by, 8 + R() * 3, -Math.PI / 2 + (R() - .5) * .3, 4); }
          else if (kind === 4) { const ht = 18 + Math.floor(R() * 24), g1 = shade("#2f9e4a", -.1 + cf.dk), g2 = shade("#53c261", cf.dk); for (let j = 0; j < ht; j++) { const off = Math.round(Math.sin(j * .33 + X) * 2); U(X + off * px, by - j * px, 2 * px, px, j % 4 < 2 ? g1 : g2); if (j % 7 === 3) U(X + (off + 2) * px, by - j * px, 2 * px, px, g2); } }
          else { const rx = 4 + Math.floor(R() * 4); for (let q = -rx; q <= rx; q++) { const hh = Math.round(rx * .7 * Math.sqrt(1 - (q / rx) ** 2)); U(X + q * px, by - hh * px, px, hh * px, shade("#7c8794", -.35 + cf.dk)); U(X + q * px, by - hh * px, px, px, shade("#a3aebb", -.3 + cf.dk)); } }
        });
        void base;
      }
      layers.push({ o, sp: cf.sp });
    });
    reef = { px, TW, layers };
  }
  const pick2 = (R, a) => a[Math.floor(R() * a.length)];
  function blocks() {
    const sz = Math.max(8, Math.round(L.cs * DPR)), allOk = TEX.every(n => ok(IM["t_" + n]));
    if (bc && bc.sz === sz && (bcReady || !allOk)) return bc;
    bcReady = allOk; bc = KINDS.split("").map((_, i) => {
      const o = document.createElement("canvas"); o.width = o.height = sz; const g = o.getContext("2d"), im = IM["t_" + TEX[i]]; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      if (ok(im)) g.drawImage(im, 0, 0, sz, sz); else { g.fillStyle = GLOW[i]; g.fillRect(0, 0, sz, sz); }
      const b = Math.max(2, Math.round(sz * .1)); g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(0, 0, sz, b); g.fillRect(0, 0, b, sz); g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, sz - b, sz, b); g.fillRect(sz - b, 0, b, sz);
      const lw = Math.max(1, sz * .05); g.strokeStyle = "rgba(0,10,25,.65)"; g.lineWidth = lw; g.strokeRect(lw / 2, lw / 2, sz - lw, sz - lw); return o;
    }); bc.sz = sz; return bc;
  }
  const BUB = [];
  function drawBG(k) {
    const D = s.D = lerp(s.D, clamp((s.lvF - 1) / 16, 0, 1), Math.min(1, .01 * k)); s.ph += k / 60;
    const top = mixc([76, 206, 230], [2, 8, 26], D), mid = mixc([22, 126, 190], [4, 16, 50], D), bot = mixc([8, 58, 120], [1, 4, 16], D);
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rgb(top)); gr.addColorStop(.55, rgb(mid)); gr.addColorStop(1, rgb(bot)); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    if (D < .85) { c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 6; i++) { const x = ((i * .19 + .06 + Math.sin(s.ph * .15 + i) * .03) * W), w = W * (.04 + (i % 3) * .02); const g2 = c.createLinearGradient(0, 0, 0, H * .85); g2.addColorStop(0, `rgba(180,245,255,${.2 * (1 - D)})`); g2.addColorStop(1, "rgba(180,245,255,0)"); c.fillStyle = g2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w - W * .12, H * .85); c.lineTo(x - W * .12, H * .85); c.fill(); } c.restore(); }
    if (!reef) buildReef();
    const fogC = rgb(bot);
    drawLife(0);
    reef.layers.forEach((ly, i) => {
      if (i === 1) drawLife(1);
      const off = -((s.ph * ly.sp) % reef.TW), y = H - ly.o.height;
      c.drawImage(ly.o, off, y); c.drawImage(ly.o, off + reef.TW, y); if (reef.TW < W + 10) c.drawImage(ly.o, off + 2 * reef.TW, y);
      if (i < 2) { const fg = c.createLinearGradient(0, H * .5, 0, H); fg.addColorStop(0, "rgba(0,0,0,0)"); fg.addColorStop(1, fogC.replace("rgb", "rgba").replace(")", "," + [.5, .3][i] + ")")); c.fillStyle = fg; c.fillRect(0, H * .5, W, H * .5); }
    });
    drawLife(2);
    if (D > .35) { c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 26; i++) { const x = (i * 97.3 + s.ph * (6 + i % 5)) % W, y = (i * 53.7 + Math.sin(s.ph * .6 + i) * 14 + s.ph * 5 * (1 + i % 3)) % H; c.fillStyle = `rgba(150,255,235,${.5 * (D - .3)})`; c.fillRect(Math.round(x), Math.round(y), 2, 2); } c.restore(); }
    while (BUB.length < 22) BUB.push({ x: Math.random(), y: Math.random() * 1.1, r: rnd(1.5, 4), v: rnd(.03, .09) });
    BUB.forEach(b => { b.y -= b.v * k / 60; b.x += Math.sin(s.ph + b.r * 9) * .0004 * k; if (b.y < -.05) { b.y = 1.05; b.x = Math.random(); } c.strokeStyle = `rgba(210,250,255,${.45 - D * .25})`; c.lineWidth = 1; c.beginPath(); c.arc(b.x * W, b.y * H, b.r, 0, 6.3); c.stroke(); c.fillStyle = "rgba(255,255,255,.4)"; c.fillRect(b.x * W - b.r * .4, b.y * H - b.r * .5, 1.5, 1.5); });
    c.fillStyle = `rgba(0,6,22,${D * .38})`; c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,8,24,${.45 + D * .2})`); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  }

  /* ---- dibujo ---- */
  const panel = (x, y, w, h, a = .55, b = "rgba(130,225,255,.28)") => { c.fillStyle = `rgba(3,16,40,${a})`; c.beginPath(); c.roundRect(x, y, w, h, 8); c.fill(); c.strokeStyle = b; c.lineWidth = 1.5; c.stroke(); };
  function T(str, x, y, size, col, al = "left", wt = 800, o = 0) { c.font = `${wt} ${size}px${F}`; c.textAlign = al; c.textBaseline = "alphabetic"; if (o) { c.lineJoin = "round"; c.lineWidth = o; c.strokeStyle = "rgba(0,15,35,.75)"; c.strokeText(str, x, y); } c.fillStyle = col; c.fillText(str, x, y); }
  const COINPX = ["..oooo..", ".oyyyyo.", "oyyhhyyo", "oyhyyyyo", "oyhyyyyo", "oyyyyyyo", ".oyyyyo.", "..oooo.."], CP = { o: "#a8730f", y: "#f5c93a", h: "#fff3b0" };
  let coinSp = null;
  function coinImg() { if (coinSp) return coinSp; const o = document.createElement("canvas"); o.width = o.height = 8; const g = o.getContext("2d"); COINPX.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ".") { g.fillStyle = CP[ch]; g.fillRect(x, y, 1, 1); } })); return coinSp = o; }
  function drawCoin(x, y, sz, spin = true) { const w = spin ? Math.max(sz * .22, Math.abs(Math.cos(s.ph * 3.2 + x * .05)) * sz) : sz; c.imageSmoothingEnabled = false; c.drawImage(coinImg(), Math.round(x - w / 2), Math.round(y - sz / 2), Math.round(w), Math.round(sz)); }
  function cell(k, x, y, size, a = 1) { c.globalAlpha = a; c.imageSmoothingEnabled = true; c.drawImage(blocks()[k], x, y, size, size); c.globalAlpha = 1; }
  function drawMini(k, cx, cy, m, a = 1) { const cells = ROT[k][0].cells, xs = cells.map(q => q[0]), ys = cells.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const ox = cx - (x1 - x0 + 1) * m / 2, oy = cy - (y1 - y0 + 1) * m / 2; cells.forEach(([px, py]) => cell(k, Math.round(ox + (px - x0) * m), Math.round(oy + (py - y0) * m), Math.ceil(m), a)); }
  const fmtT = ms => { const t = Math.floor(ms / 10), cc = t % 100, ss = Math.floor(t / 100) % 60, mm = Math.floor(t / 6000); return mm + ":" + String(ss).padStart(2, "0") + ":" + String(cc).padStart(2, "0"); };

  function drawBoard() {
    const { bx, by, cs: z } = L, bw = 10 * z, bh = 20 * z, cb = Math.max(0, s.combo), gc = comboCol(cb);
    c.save(); if (s.shake) c.translate(rnd(-s.shake, s.shake) * .6, rnd(-s.shake, s.shake) * .6);
    c.fillStyle = "rgba(2,12,34,.78)"; c.fillRect(bx, by, bw, bh);
    c.strokeStyle = "rgba(160,230,255,.07)"; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 10; i++) { c.moveTo(bx + i * z + .5, by); c.lineTo(bx + i * z + .5, by + bh); } for (let j = 1; j < 20; j++) { c.moveTo(bx, by + j * z + .5); c.lineTo(bx + bw, by + j * z + .5); } c.stroke();
    if (s.danger > .02) { const pulse = .5 + .5 * Math.sin(s.ph * 8), g2 = c.createLinearGradient(0, by, 0, by + bh * .4); g2.addColorStop(0, `rgba(255,40,40,${s.danger * (.25 + .2 * pulse)})`); g2.addColorStop(1, "rgba(255,40,40,0)"); c.fillStyle = g2; c.fillRect(bx, by, bw, bh * .4); }
    c.save(); c.beginPath(); c.rect(bx, by - 2.2 * z, bw, bh + 2.2 * z); c.clip();
    const over = s.over ? Math.max(0, 1 - s.ovT / 45) : 1;
    for (let y = HID - 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) { const q = s.g[y][x]; if (!q) continue; const px = bx + x * z, py = by + (y - HID) * z; cell(q.k, px, py, z, over * (y < HID ? .45 : 1)); if (q.coin) drawCoin(px + z / 2, py + z / 2, z * .64); }
    s.fxl.forEach(f => { if (f.gy < HID) return; c.fillStyle = `rgba(255,255,255,${.7 * (1 - f.t / 14)})`; c.fillRect(bx + f.gx * z, by + (f.gy - HID) * z, z, z); });
    s.trails.forEach(t => { const a = 1 - t.t / 12; const g2 = c.createLinearGradient(0, by + (t.y0 - HID) * z, 0, by + (t.y1 - HID) * z); g2.addColorStop(0, "rgba(255,255,255,0)"); g2.addColorStop(1, GLOW[t.k] + "cc"); c.globalAlpha = a * .55; c.fillStyle = g2; c.fillRect(bx + t.gx * z + z * .12, by + (t.y0 - HID) * z, z * .76, (t.y1 - t.y0 + 1) * z); c.globalAlpha = 1; });
    const p = s.p;
    if (p && !s.over) {
      const gy = ghostY(), cells = ROT[p.k][p.r].cells;
      cells.forEach(([cx, cy]) => { const X = bx + (p.x + cx) * z, Y = by + (gy + cy - HID) * z; if (gy + cy < HID) return; c.fillStyle = GLOW[p.k] + "33"; c.fillRect(X, Y, z, z); c.strokeStyle = GLOW[p.k] + "bb"; c.lineWidth = 1.5; c.strokeRect(X + 1, Y + 1, z - 2, z - 2); });
      const dim = grounded() ? clamp(p.lt / lockMs(), 0, 1) * .45 : 0;
      cells.forEach(([cx, cy]) => { const gy2 = p.y + cy; if (gy2 < HID - 2) return; const X = bx + (p.x + cx) * z, Y = by + (gy2 - HID) * z; cell(p.k, X, Y, z, gy2 < HID ? .5 : 1); if (dim) { c.fillStyle = `rgba(0,0,20,${dim})`; c.fillRect(X, Y, z, z); } if (p.cc && p.cc[0] === cx && p.cc[1] === cy) drawCoin(X + z / 2, Y + z / 2, z * .64); });
    }
    c.restore();
    s.rings.forEach(r => { if (r.kind === "row") { const a = 1 - r.t / 22; if (a <= 0 || r.gy < HID) return; const y = by + (r.gy - HID) * z, e = Math.min(1, r.t / 5); c.globalAlpha = Math.max(0, a); c.fillStyle = "#fff"; c.fillRect(bx + bw / 2 - bw * e / 2, y + z * (.5 - .5 * (1 - r.t / 22)), bw * e, z * (1 - r.t / 22)); c.globalCompositeOperation = "lighter"; const g2 = c.createLinearGradient(0, y - z, 0, y + 2 * z); g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(.5, r.c); g2.addColorStop(1, "rgba(0,0,0,0)"); c.globalAlpha = a * .6; c.fillStyle = g2; c.fillRect(bx, y - z, bw, 3 * z); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1; }
      else { const a = 1 - r.t / 34; c.strokeStyle = r.c; c.globalAlpha = Math.max(0, a) * .8; c.lineWidth = 3 + 6 * a; c.beginPath(); c.arc(r.x, r.y, r.t * z * .3, 0, 6.3); c.stroke(); c.globalAlpha = 1; } });
    /* marco: brilla con el color del combo */
    const glow = s.flash > 0 ? s.flash / 30 : 0; c.shadowColor = glow > 0 ? s.flashC : gc; c.shadowBlur = 8 + glow * 28 + (cb >= 2 ? 8 : 0); c.strokeStyle = glow > 0 ? s.flashC : cb >= 1 ? gc : "rgba(150,230,255,.55)"; c.lineWidth = 2.5; c.strokeRect(bx - 1.25, by - 1.25, bw + 2.5, bh + 2.5); c.shadowBlur = 0;
    c.restore();
  }
  function drawPieces() {
    const { hold, next, cs: z } = L;
    panel(hold.x, hold.y, hold.w, hold.h); T("HOLD", hold.x + 8, hold.y + Math.max(11, z * .62), Math.max(9, z * .5), "rgba(190,240,255,.8)", "left", 800);
    if (s.hold) drawMini(s.hold.k, hold.x + hold.w / 2, hold.y + hold.h * .6, Math.min(z * .72, hold.w / 5.2), s.canHold ? 1 : .35), s.hold.coin && drawCoin(hold.x + hold.w - 11, hold.y + 12, 11, false);
    panel(next.x, next.y, next.w, next.h); T("NEXT", next.x + 8, next.y + Math.max(11, z * .62), Math.max(9, z * .5), "rgba(190,240,255,.8)", "left", 800);
    const m = Math.min(z * .72, (next.w - 10) / 4.3), slot = (next.h - z * .9) / 5;
    for (let i = 0; i < 5; i++) { const q = s.q[i]; if (!q) continue; const cy = next.y + z * .9 + slot * (i + .5); drawMini(q.k, next.x + next.w / 2, cy, i === 0 ? m * 1.08 : m * .9, i === 0 ? 1 : .88); if (q.coin) drawCoin(next.x + next.w - 11, cy - slot * .32, 10, false); }
  }
  function xpBar(x, y, w, h) {
    const u = me(), gl = Math.max(0, s.xpGlow) / 30; if (!u) { T("Invitado", x, y + h, h * 1.1, "rgba(220,240,255,.7)", "left", 700); return; }
    const inf = xpInfo(s.xpShow); c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(x - 2, y - 2, w + 4, h + 4); c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(x, y, w, h);
    c.fillStyle = gl > 0 ? "#e6ff9a" : "#8fe03a"; c.fillRect(x, y, Math.round(w * inf.pct), h); if (gl > 0) { c.fillStyle = `rgba(255,255,255,${.5 * gl})`; c.fillRect(x, y, Math.round(w * inf.pct), h); }
    T(String(inf.lvl), x + w + 8, y + h + 2 + 2 * gl, 14 + Math.round(4 * gl), "#e9f7c8", "left", 800, 3);
  }
  function drawLeft() {
    const { panel: pn, score: sc, av: ava, txt, cs: z, portrait } = L, shown = Math.max(0, s.coins - s.cf.length > 0 ? 0 : 0), cnt = Math.max(0, csFresh().n - (s.coins - s.cArr));
    panel(pn.x, pn.y, pn.w, pn.h, .5);
    const fs = Math.max(11, Math.min(15, pn.h * .36)); drawCoin(pn.x + 14, pn.y + pn.h * .32, fs + 3, false); T(cnt + "/" + COIN_MAX, pn.x + 28, pn.y + pn.h * .32 + fs * .36, fs, "#f5c93a", "left", 800, 2);
    const bx0 = pn.x + 10, bw0 = pn.w - 40; xpBar(bx0, pn.y + pn.h * .62, bw0, Math.max(7, pn.h * .17));
    /* puntuación */
    const gold = s.recDone, pk = 1 + .3 * Math.pow(Math.max(0, s.pop) / 30, 2), txt0 = String(Math.floor(s.score)).padStart(5, "0"), fz = Math.min(sc.h * .86, sc.w / 3.3, 44);
    c.save(); c.translate(sc.x + (portrait ? sc.w / 2 : sc.w / 2), sc.y + sc.h * .8); c.scale(pk, pk); if (gold) { c.shadowColor = "rgba(255,190,30,.85)"; c.shadowBlur = 14; } T(txt0, 0, 0, fz, gold ? "#ffcf33" : "#f5fbff", "center", 800, 5); c.restore();
    if (s.recT > 0) { const ag = 170 - s.recT; c.save(); c.globalAlpha = Math.min(1, s.recT / 30, ag / 6); T("¡NUEVO RÉCORD!", sc.x + sc.w / 2, sc.y + sc.h + 14 * (1 + Math.max(0, 1 - ag / 14) * .4), portrait ? 11 : 14, "#ffcf33", "center", 800, 3); c.restore(); }
    /* avatar */
    drawAvatar(ava);
    /* texto de combo, XP y monedas */
    const e = s.ev, fl = Math.max(9, Math.min(portrait ? 11 : 16, z * .66));
    if (e) {
      panel(txt.x, txt.y - 2, txt.w, Math.min(txt.h, H - txt.y - 4), .45, "rgba(130,225,255,.15)");
      const a = e.t < 3200 ? 1 : 1 - (e.t - 3200) / 1000, pop = 1 + Math.max(0, 1 - e.t / 160) * .5; c.save(); c.globalAlpha = Math.max(0, a);
      const tw = txt.w - 4, nm = e.name; let f1 = Math.min(fl * 1.7, 26); c.font = `800 ${f1}px${F}`; while (c.measureText(nm).width > tw && f1 > 8) { f1 -= 1; c.font = `800 ${f1}px${F}`; }
      c.translate(txt.x + 2, txt.y + f1 + 2); c.scale(pop, pop); c.shadowColor = e.col; c.shadowBlur = 10; T(nm, 0, 0, f1, e.col, "left", 800, 4); c.restore(); c.save(); c.globalAlpha = Math.max(0, a);
      let yy = txt.y + f1 + 6; e.sub.forEach(sb => { yy += fl * 1.05; let f2 = fl * .78; c.font = `800 ${f2}px${F}`; while (c.measureText(sb).width > tw && f2 > 7) { f2 -= .5; c.font = `800 ${f2}px${F}`; } T(sb, txt.x + 2, yy, f2, sb.includes("COMBO") ? comboCol(s.combo) : sb.includes("BACK") ? "#ffb347" : "#ffe45c", "left", 800, 3); });
      yy += fl * 1.15; if (e.xp > 0) T("+" + e.xp + " XP" + (e.mult > 1 ? " ×" + e.mult : ""), txt.x + 2, yy, fl * .95, "#b8f046", "left", 800, 3); else if (s.capNote > 0) T("XP MAX", txt.x + 2, yy, fl * .95, "#9fb4c8", "left", 800, 3);
      if (e.coins) { yy += fl * 1.1; drawCoin(txt.x + 9, yy - fl * .32, fl, false); T("+" + e.coins, txt.x + 22, yy, fl * .95, "#f5c93a", "left", 800, 3); }
      c.restore();
    }
  }
  function drawAvatar(r) {
    const { cs: z } = L; panel(r.x, r.y, r.w, r.h, .3, "rgba(130,225,255,.18)");
    if (av.ring > 0) { c.save(); c.globalAlpha = av.ring / 40 * .6; c.strokeStyle = av.ringC; c.lineWidth = 3; c.beginPath(); c.ellipse(r.x + r.w / 2, r.y + r.h * .55, r.w * (.2 + (1 - av.ring / 40) * .35), r.h * (.25 + (1 - av.ring / 40) * .3), 0, 0, 6.3); c.stroke(); c.restore(); }
    if (!figs) { c.fillStyle = "#f7b41e"; c.fillRect(r.x + r.w / 2 - 12, r.y + r.h - 40, 24, 32); return; }
    const a = ANIMS[av.anim], n = a.frames.length, i = av.anim === "jump" ? Math.min(n - 1, Math.floor(av.t)) : Math.floor(av.t) % n, { fig, gx, gy } = figs.get(av.anim, i);
    let sc = Math.min(r.w * .92 / figs.w, r.h / (figs.feet * 1.18)); sc = Math.max(.5, Math.floor(sc * 4 * DPR) / (4 * DPR)); const swim = Math.sin(performance.now() / 650) * 2.2, u = r.h / 160;
    const baseY = r.y + r.h - 8 + (s.over ? 6 : 0) + av.hop * u * 2 + swim, cx = r.x + r.w / 2 + av.dx * u;
    c.save(); c.imageSmoothingEnabled = false; if (s.over) c.globalAlpha = .55; c.translate(cx, 0); if (av.anim === "walk" && !av.flip) c.scale(1, 1); if (av.anim === "walk") c.scale(av.flip ? -1 : 1, 1);
    const shake = s.danger > .6 && !s.over ? Math.sin(performance.now() / 35) * 1.2 : 0;
    c.drawImage(fig, -figs.w * sc / 2 + gx * sc + shake, baseY - figs.feet * sc + gy * sc, fig.width * sc, fig.height * sc); c.restore();
    c.fillStyle = "rgba(0,10,30,.25)"; c.beginPath(); c.ellipse(cx, r.y + r.h - 4, r.w * .22 * (1 + av.hop * .01), 3, 0, 0, 6.3); c.fill();
    if (av.say) { const bw = Math.max(22, av.say.length * 11 + 12), bx2 = cx + r.w * .12, by2 = baseY - figs.feet * sc - 4; c.save(); c.globalAlpha = Math.min(1, av.sayT / 150); c.fillStyle = "rgba(255,255,255,.92)"; c.beginPath(); c.roundRect(bx2, by2 - 22, bw, 20, 8); c.fill(); T(av.say, bx2 + bw / 2, by2 - 7, 14, "#12304f", "center", 800); c.restore(); }
  }
  function drawRight() {
    const { time: t, cs: z, portrait } = L, f = Math.max(9, z * .5); panel(t.x, t.y, t.w, t.h, .5);
    if (!portrait) { T("TIEMPO", t.x + 10, t.y + z * .9, f, "rgba(190,240,255,.8)", "left", 800); T(fmtT(s.ms), t.x + 10, t.y + z * 2.1, Math.min(z * 1.15, t.w / 5.6), "#fff", "left", 800, 3);
      T("LÍNEAS  " + s.lines, t.x + 10, t.y + z * 3.3, f * 1.1, "#d6f3ff", "left", 700, 2); T(Math.round(s.dep) + " m", t.x + 10, t.y + z * 4.5, f * 1.1, "#7be8ff", "left", 800, 2); }
    else { T("TIEMPO", t.x + 4, t.y + 12, 9, "rgba(190,240,255,.8)", "left", 800); T(fmtT(s.ms), t.x + 4, t.y + 27, 12, "#fff", "left", 800, 2); T(s.lines + " L", t.x + 4, t.y + 43, 11, "#d6f3ff", "left", 700, 2); T(Math.round(s.dep) + " m", t.x + 4, t.y + 57, 11, "#7be8ff", "left", 800, 2); }
  }
  function drawFly() {
    const { panel: pn, txt, bx, by, cs: z } = L; const bar = { x: pn.x + 10 + (pn.w - 40) / 2, y: pn.y + pn.h * .7 }, ci = { x: pn.x + 14, y: pn.y + pn.h * .32 };
    s.fl.forEach(f => { const p = f.t < .3 ? 0 : (f.t - .3) / .7, sx = txt.x + txt.w * .35, sy = txt.y + z * 3.4, x = lerp(sx, bar.x, p * p), y = lerp(sy, bar.y, p) - Math.sin(p * Math.PI) * 24, zz = 1.35 - .6 * p, al = f.t < .1 ? f.t / .1 : p > .88 ? (1 - p) / .12 : 1;
      c.save(); c.globalAlpha = Math.max(0, al); c.translate(x, y); c.scale(zz, zz); T("+" + f.n + " XP", 0, 0, 15, "#b8f046", "center", 800, 3); c.restore(); });
    s.cf.forEach(q => { if (q.t < 0) return; const p = q.t, e = p * p * (3 - 2 * p), x = lerp(q.x, ci.x, e), y = lerp(q.y, ci.y, e) - Math.sin(p * Math.PI) * 60; drawCoin(x, y, lerp(z * .7, 14, e)); });
  }
  function drawOverlay() {
    const { bx, by, cs: z } = L, cx = bx + 5 * z;
    if (s.cd > 0) { const n = Math.ceil(s.cd / 1000), fr = 1 - ((s.cd % 1000) / 1000); if (n <= 3) { c.save(); c.translate(cx, by + 9 * z); const sz = 1 + (1 - fr) * .5; c.scale(sz, sz); c.globalAlpha = Math.min(1, 1.3 - fr); T(String(n), 0, z * 2, z * 6, "#fff", "center", 800, 8); c.restore(); } else T("PREPARADO", cx, by + 9.5 * z, z * 1.5, "#d6f3ff", "center", 800, 5); }
    if (s.go > 0) { c.save(); c.globalAlpha = Math.min(1, s.go / 300); c.translate(cx, by + 9 * z); c.scale(1 + (1 - s.go / 700) * .6, 1 + (1 - s.go / 700) * .6); T("GO!", 0, z * 1.5, z * 4.5, "#7dffb0", "center", 800, 8); c.restore(); }
    if (s.banner && s.bannerT > 0) { const ag = 160 - s.bannerT, zz = 1 + Math.max(0, 1 - ag / 14) * .8; c.save(); c.globalAlpha = Math.min(1, s.bannerT / 30, ag / 6); c.translate(cx, by + 6 * z); c.scale(zz, zz);
      T(s.banner, 0, 0, z * (s.banner === "ALL CLEAR" ? 2.1 : 1.8), s.banner === "ALL CLEAR" ? "#ffe45c" : "#7be8ff", "center", 800, 6);
      if (s.banner === "DEEPER") T(Math.round(s.dep) + " m", 0, z * 1.3, z * .95, "#d6f3ff", "center", 800, 4); c.restore(); }
    if (s.lvUp > 0) { const ag = 170 - s.lvUp, zz = 1 + Math.max(0, 1 - ag / 16) * .9; c.save(); c.globalAlpha = Math.min(1, s.lvUp / 30, ag / 5); c.translate(cx, by + 12 * z); c.scale(zz, zz); T(s.lvTxt + "!", 0, 0, z * 1.6, "#b8f046", "center", 800, 6); c.restore(); }
    if (s.paused) { c.fillStyle = "rgba(0,10,30,.6)"; c.fillRect(bx, by, 10 * z, 20 * z); T("PAUSA", cx, by + 9.5 * z, z * 1.8, "#fff", "center", 800, 5); T(TOUCH ? "Toca para continuar" : "Pulsa P para continuar", cx, by + 11.2 * z, z * .7, "#d6f3ff", "center", 700, 3); }
    if (st === "over" && s.ovT > 30) {
      const lines = TOUCH ? ["Botones: mover, girar, caída directa y HOLD", "Mantén ▼ para bajar rápido", "Limpia líneas seguidas para encadenar combos", "T-Spin, QUAD y Back-to-Back dan más puntos"]
        : ["← →: mover   ↓: bajar   Espacio: caída directa", "↑ / X: girar   Z: girar al revés   A: 180°", "C / Shift: guardar pieza (HOLD)   P: pausa   M: sonido", "Combos y Back-to-Back = más puntos y XP ×2 / ×3"];
      const pw = Math.min(W - 16, Math.max(10 * z + 20, 340)), ph = 168 + lines.length * 17, py = clamp(by + 10 * z - ph / 2, 8, H - ph - 8), a = Math.min(1, (s.ovT - 30) / 15);
      c.save(); c.globalAlpha = a; panel(W / 2 - pw / 2, py, pw, ph, .86, "rgba(130,225,255,.5)");
      T("Fin del juego", W / 2, py + 34, 26, "#7be8ff", "center", 800); T(String(Math.floor(s.score)).padStart(5, "0"), W / 2, py + 72, 34, s.recDone ? "#ffcf33" : "#fff", "center", 800, 3);
      T((s.recDone ? "¡Nuevo récord!  " : "") + s.lines + " líneas · " + fmtT(s.ms), W / 2, py + 94, 14, "#d6f3ff", "center", 700);
      T("+" + s.xp + " XP" + (s.coins ? "  ·  +" + s.coins + " monedas" : ""), W / 2, py + 116, 15, s.recDone ? "#ffcf33" : "#b8f046", "center", 800);
      T(me() ? (TOUCH ? "Toca para reintentar" : "Pulsa Espacio para reintentar") : "Inicia sesión para guardar puntaje, XP y monedas", W / 2, py + 140, 15, "#ffe9a8", "center", 800);
      lines.forEach((l, i) => T(l, W / 2, py + 166 + i * 17, 12, "rgba(220,240,255,.85)", "center", 500)); c.restore();
    }
  }
  function drawTouch() {
    L.btn.forEach(b => { const on = [...ptrs.values()].includes(b.id); c.fillStyle = on ? "rgba(120,230,255,.55)" : "rgba(5,25,55,.55)"; c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 12); c.fill(); c.strokeStyle = "rgba(150,230,255,.5)"; c.lineWidth = 1.5; c.stroke();
      T(b.t, b.x + b.w / 2, b.y + b.h / 2 + Math.min(b.h, 40) * .18, b.t.length > 2 ? Math.min(b.h * .34, 15) : Math.min(b.h * .5, 26), "#eaffff", "center", 800); });
  }
  function draw(k) {
    c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H); drawBG(k);
    blocks(); drawLeft(); drawRight(); drawPieces(); drawBoard();
    c.save(); c.globalCompositeOperation = "source-over";
    s.pts.forEach(q => { const a = Math.min(1, q.l / 18); c.globalAlpha = a; if (q.ty) { c.strokeStyle = q.c; c.lineWidth = 1; c.beginPath(); c.arc(q.x, q.y, q.sz, 0, 6.3); c.stroke(); } else { c.fillStyle = q.c; c.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz); } }); c.restore(); c.globalAlpha = 1;
    drawFly(); drawOverlay(); if (TOUCH) drawTouch();
    if (s.flash > 0) { c.fillStyle = s.flashC; c.globalAlpha = .12 * s.flash / 30; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  }
  function loop(t) {
    const k = Math.min(2.5, (t - last) / 16.67 || 1); last = t;
    if (s) { if (st === "run") update(k); else timers(k), life(k); draw(k); }
    raf = requestAnimationFrame(loop);
  }

  /* ---- entrada ---- */
  const live = () => Play.id() === "coral" && !$("#v-juego").hidden && $("#gamecard").classList.contains("open") && modal.hidden;
  const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "soft", ArrowUp: "cw", KeyX: "cw", KeyZ: "ccw", KeyA: "r180", Space: "hard", KeyC: "hold", ShiftLeft: "hold", ShiftRight: "hold" };
  addEventListener("keydown", e => {
    if (!live() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === "KeyM") { muted = !muted; try { localStorage.setItem("hood_coral_mute", muted ? "1" : "0"); } catch (_) { /* sin almacenamiento */ } if (!muted) sfx.cd(); return; }
    if (e.code === "KeyP" || (e.code === "Enter" && s && s.paused)) { e.preventDefault(); if (s && st === "run" && s.cd <= 0) s.paused = !s.paused; return; }
    if (e.code === "Enter" && st === "over") { act("hard", true); return; }
    const a = KEYS[e.code]; if (!a) return; e.preventDefault(); if (e.repeat) return; act(a, true);
  });
  addEventListener("keyup", e => { if (!live() && !s) return; const a = KEYS[e.code]; if (a) act(a, false); });
  const hit = (x, y) => L.btn.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  cv.addEventListener("pointerdown", e => {
    if (!live()) return; e.preventDefault(); const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, b = hit(x, y);
    ac(); if (b) { ptrs.set(e.pointerId, b.id); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ } act(b.id, true); return; }
    if (s && st === "over") act("hard", true); else if (s && s.paused) s.paused = false;
  });
  const pup = e => { const id = ptrs.get(e.pointerId); if (id) { ptrs.delete(e.pointerId); act(id, false); } };
  cv.addEventListener("pointerup", pup); cv.addEventListener("pointercancel", pup);
  addEventListener("resize", () => { if (live()) fit(); });
  addEventListener("blur", () => { if (s && st === "run" && s.cd <= 0 && live()) s.paused = true; held.clear(); if (s) s.dasDir = 0; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && s && st === "run" && s.cd <= 0) s.paused = true; });
  const begin = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); };
  return {
    start() { fit(); startGame(); begin(); },
    stop() { cancelAnimationFrame(raf); raf = 0; ptrs.clear(); held.clear(); if (s) { s.paused = s.paused || (st === "run" && s.cd <= 0); flush(); } },
    refresh() { loadFace(); }
  };
})();

/* ---------- Minijuego: Elytra Fly (estilo Flappy Bird en el End) ----------
 * Espacio / clic / toque: aletear · Shift (o deslizar hacia delante en el móvil): cohete (dash recto, recarga 5 s) · P pausa · M sonido
 * Cada pilar pasado = 5 XP. Cada Ender Dragon derrotado = 50 XP + monedas. Monedas: máx. 25 por ventana de 24 h.
 * Fase de batalla: el dragón aparece cada cierto tiempo, los pilares se retraen arriba/abajo y algunos llevan un cristal del End:
 * tocarlo no daña, explota y envía un rayo que hiere al dragón. */
const Elytra = (() => {
  const cv = $("#cv"), c = cv.getContext("2d");
  const COIN_MAX = 25, DAY = 864e5, F = " 'Noto Sans', sans-serif", TOUCH = matchMedia("(pointer:coarse)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
  const mixc = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t))), rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`, hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const SKY = [30, 14, 56];
  const IM = {}, ld = (k, src) => { const i = new Image(); i.src = src; IM[k] = i; };
  ld("obs", "img/end/obsidian.png"); ld("dragon", "img/end/dragon.png");
  const ok = i => i && i.complete && i.naturalWidth > 0;

  /* ---- sonido ---- */
  let AC = null, muted = false; try { muted = localStorage.getItem("hood_elytra_mute") === "1"; } catch (e) { /* sin almacenamiento */ }
  function ac() { if (AC === null) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = false; } } if (AC && AC.state === "suspended") AC.resume(); return AC; }
  function tone(f, d, type = "square", vol = .04, f2 = 0, delay = 0) {
    if (muted) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + .03);
  }
  function noise(d, vol, type, f1, f2, delay = 0, q = 1) {         // ruido filtrado: silbido del cohete y chisporroteo del fuego artificial
    if (muted) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, n = Math.max(1, Math.floor(a.sampleRate * d)), b = a.createBuffer(1, n, a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + d); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(t);
  }
  const blastSfx = (big, delay = 0) => { noise(big ? .45 : .3, big ? .17 : .1, "lowpass", 2600, 140, delay); tone(big ? 110 : 150, .3, "sine", big ? .11 : .06, 35, delay); for (let i = 0; i < (big ? 7 : 3); i++) noise(.05, .05, "highpass", 3200 + Math.random() * 1500, 6000, delay + .15 + i * .07 + Math.random() * .05); };
  const sfx = {
    flap: () => tone(340, .09, "triangle", .035, 190), pass: () => { tone(880, .06, "square", .025); tone(1175, .1, "square", .025, 0, .05); },
    coin: () => { tone(988, .06, "square", .04); tone(1319, .16, "square", .04, 0, .06); }, dash: () => { noise(.6, .1, "bandpass", 450, 3400, 0, .8); tone(220, .5, "sawtooth", .018, 800); blastSfx(true, .14); }, blast: () => blastSfx(false),
    ready: () => tone(1500, .1, "triangle", .03), crystal: () => { tone(140, .35, "square", .07, 40); tone(900, .3, "triangle", .05, 2400, .03); }, beam: () => tone(1800, .4, "sawtooth", .03, 300),
    hurt: () => { tone(150, .35, "sawtooth", .06, 60); tone(1200, .15, "square", .03, 300); }, roar: () => { tone(95, .9, "sawtooth", .07, 45); tone(150, .8, "sawtooth", .04, 70, .05); },
    fire: () => tone(420, .25, "sawtooth", .04, 130), breath: () => tone(110, 1.1, "sawtooth", .04, 70), warn: () => { tone(660, .12, "square", .04); tone(660, .12, "square", .04, 0, .18); },
    win: () => [0, 4, 7, 12, 16].forEach((n, i) => tone(440 * Math.pow(2, n / 12), .3, "triangle", .06, 0, i * .08)), lvl: () => [0, 4, 7, 12].forEach((n, i) => tone(520 * Math.pow(2, n / 12), .2, "square", .035, 0, i * .07)), tick: () => tone(880, .03, "square", .02),
    over: () => { tone(330, .6, "sawtooth", .06, 55); tone(247, .6, "triangle", .05, 40, .1); }
  };

  /* ---- estado ---- */
  let W = 800, H = 450, DPR = 1, SC = 1, LW = 960, LH = 540, raf = 0, last = 0, st = "idle", s = null, best = 0, bestKey = "", figs = null, figKey = "", figTok = 0, overAt = 0, bg = null;
  let cs = { win: 0, n: 0 }; const ptr = new Map();
  const CKEY = () => "hood_elytra_coins_" + (me() ? me().uid : "guest");
  const csFresh = () => { if (cs.win && Date.now() - cs.win >= DAY) cs = { win: 0, n: 0 }; return cs; };
  function csLoad() { try { const j = JSON.parse(localStorage.getItem(CKEY()) || "null"); cs = j && typeof j.win === "number" ? { win: j.win, n: Number(j.n) || 0 } : { win: 0, n: 0 }; } catch (e) { cs = { win: 0, n: 0 }; } }
  const csSave = () => { try { localStorage.setItem(CKEY(), JSON.stringify(cs)); } catch (e) { /* sin almacenamiento */ } };
  async function csRemote() {
    const u = me(); if (!u) return;
    try { const d = await getDoc(doc(db, "players", u.uid)); if (d.exists()) { const r = d.data(), w = Number(r.coinWin_elytra) || 0, n = Number(r.coinN_elytra) || 0; if (w > cs.win || (w === cs.win && n > cs.n)) { cs = { win: w, n }; csSave(); } } } catch (e) { /* se usa lo local */ }
  }
  async function flush() {
    if (!s) return; const xp = s.pxp, cn = s.pcn; s.pxp = 0; s.pcn = 0; const u = me(); if (!u || (!xp && !cn)) return;
    u.xp = (u.xp || 0) + xp; u.coins = (u.coins || 0) + cn;
    const data = { xp: increment(xp) }; if (cn) Object.assign(data, { coins: increment(cn), coinWin_elytra: cs.win, coinN_elytra: cs.n });
    try { await updateDoc(doc(db, "players", u.uid), data); Arcade.refresh(); Cofres.sync(u); }
    catch (e) { u.xp -= xp; u.coins -= cn; console.warn("No se pudo guardar XP/monedas:", e); Mine.note(`No se pudo guardar tu XP/monedas${e && e.code ? " (" + e.code + ")" : ""}.`); }
  }
  async function loadBest() {
    const u = me(), key = u ? u.uid : "guest"; if (key !== bestKey) { best = 0; bestKey = key; }
    let b = 0;
    if (u) { try { const d = await getDoc(doc(db, "scores_elytra", u.uid)); if (d.exists()) b = Math.floor(Number(d.data().score)) || 0; } catch (e) { /* sin récord */ } }
    else { try { b = Number(localStorage.getItem("hood_elytra_best")) || 0; } catch (e) { /* sin almacenamiento */ } }
    if (key === bestKey) best = Math.max(best, b);
  }
  async function loadFace() {
    const u = me(), key = u ? u.uid + "|" + u.avatar + "|" + ((u.equip && u.equip.hat) || "") : "guest"; if (key === figKey && figs) return;
    const tok = ++figTok; figKey = key; let md = null;
    if (u) { try { const d = await getDoc(doc(db, "avatars", u.uid)); md = d.exists() ? d.data() : null; } catch (e) { /* sin skin */ } }
    const srcs = u ? skinSources(u.name, u.avatar, md) : ["https://minotar.net/skin/MHF_Steve", "https://mc-heads.net/skin/MHF_Steve", LOCAL_SKIN];
    const img = await loadSkin(srcs), cos = await Mercado.hatCos(u && u.equip && u.equip.hat); if (tok !== figTok) return;
    figs = img ? createFigureSet(img, { slim: !!(md && md.slim), k: 3, cos }) : null; if (!figs) figKey = "";
  }
  function fit() {
    DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; SC = clamp(Math.min(H / 540, W / 420), .45, 2.2); LW = W / SC; LH = H / SC;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); bg = null; if (s && !s.run && !s.dead) { s.x = px(); s.y = LH / 2; }
  }
  const px = () => Math.min(260, LW * .28);

  /* ---- partida ---- */
  const fresh = () => ({
    x: px(), y: LH / 2, vy: 0, t: 0, sec: 0, run: false, dead: false, deadT: 0, ang: 0, spin: 1, score: 0, pil: 0, kills: 0, pillars: [], lastGy: LH / 2, noSpawn: 0, stubT: 0, crystalT: 2,
    dashT: 0, dashCd: 0, dashFade: 0, dashed: false, fk: 1, flapN: 0, coinsObj: [], fire: [], zone: null, gas: [], beams: [], boss: null, bossMode: false, tNorm: 0, bossIn: 38,
    dr: { lvl: 1, hp: 100, max: 100, dmg: 22, ghost: 100 }, xp: 0, coins: 0, pxp: 0, pcn: 0, xpArr: 0, cArr: 0, base: (me() && me().xp) || 0, xpShow: (me() && me().xp) || 0, xpGlow: 0,
    lvUp: 0, lvTxt: "", fl: [], cf: [], pts: [], rings: [], shake: 0, flash: 0, flashC: "#fff", pop: 0, recDone: false, recT: 0, banner: "", bannerT: 0, bannerC: "#fff", bannerSub: "", paused: false, ph: 0, wing: 0
  });
  const coinsPending = () => s.coinsObj.length;
  function startGame() { s = fresh(); st = "ready"; csLoad(); csRemote(); loadBest(); loadFace(); ptr.clear(); }
  function burst(x, y, cols, n, o = {}) { for (let i = 0; i < n && s.pts.length < 600; i++) { const a = rnd(0, 6.283), v = (o.ring ? rnd(.88, 1) : rnd(.3, 1)) * (o.sp || 160); s.pts.push({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), l: rnd(.35, .9) * (o.life || 1), m: .9 * (o.life || 1), c: cols[i % cols.length], sz: rnd(2, o.sz || 5), g: o.g === undefined ? 260 : o.g }); } }
  function flap() {
    if (st === "over") { if (performance.now() - overAt > 650) startGame(); return; }
    ac(); if (s.paused) { s.paused = false; return; } if (s.dead) return;
    if (!s.run) { s.run = true; st = "run"; sfx.ready(); }
    if (s.dashT > 0) return; s.vy = -430; s.fk = 0; s.flapN++; sfx.flap(); burst(s.x - 8, s.y + 8, ["#e8e8ff", "#a9a9c9"], 3, { sp: 70, g: 120, sz: 3, life: .6, vx: -60 });
  }
  const FW = ["#b02e26", "#f9801d", "#fed83d", "#80c71f", "#3ab3da", "#8932b8", "#f38baa", "#ffffff"];       // colores de tinte de Minecraft
  function firework(x, y, n, big) {                          // explosión de fuego artificial: bola de chispas de 2 colores + núcleo blanco
    const a = FW[Math.random() * FW.length | 0], b = FW[Math.random() * FW.length | 0], sp = big ? 340 : 210;
    burst(x, y, [a, a, b], n, { ring: true, sp, g: 120, sz: big ? 9 : 6, life: big ? 1.25 : .9 });
    burst(x, y, ["#ffffff", "#fff3b0"], Math.round(n / 3), { ring: true, sp: sp * .45, g: 100, sz: 6, life: .8 });
    if (big) burst(x, y, [b, "#ffffff"], Math.round(n / 2), { ring: true, sp: sp * .7, g: 140, sz: 6, life: 1.1 });
  }
  function dash() {
    if (!s || !s.run || s.dead || s.paused || s.dashCd > 0) return; s.dashT = .45; s.dashCd = 5; s.dashed = true; s.vy = Math.min(s.vy, 0) * .2; s.dashFade = 1; sfx.dash(); s.shake = Math.max(s.shake, 4);
    firework(s.x - 16, s.y, 40, true); s.rings.push({ x: s.x, y: s.y, t: 0, c: "#ffd27a" }); s.fwT = 0;
  }
  function kill(why) {
    if (s.dead) return; s.dead = true; st = "over"; overAt = performance.now(); s.deadT = 0; s.shake = 14; s.flash = .25; s.flashC = "#ff5ad9"; s.vy = -260; s.spin = Math.random() < .5 ? -1 : 1; sfx.over();
    burst(s.x, s.y, ["#ffffff", "#ff7ae6", "#b57cf0"], 28, { sp: 300, sz: 6 }); s.fire = []; s.zone = null;
    const sc = Math.floor(s.score); if (sc > best) best = sc; if (!me()) { try { localStorage.setItem("hood_elytra_best", String(best)); } catch (e) { /* sin almacenamiento */ } }
    saveScore(Math.min(4999999, sc), WORLDS[1].game); flush(); void why;
  }
  const hitRect = (cx, cy, r, x, y, w, h) => { const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h); return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r; };

  /* ---- pilares ---- */
  const geo = p => {
    if (p.kind === "top") return { th: p.h, by: LH + 40 };
    if (p.kind === "bot") return { th: -40, by: LH - p.h };
    return { th: lerp(p.gy - p.gap / 2, p.stT, p.ret), by: lerp(p.gy + p.gap / 2, LH - p.stB, p.ret) };
  };
  function spawnPillar(boss) {
    const x = LW + 80;
    if (!boss) {
      const gap = clamp(222 - s.pil * 1.6, 158, 222), mg = 78, gy = clamp(s.lastGy + rnd(-185, 185), mg + gap / 2, LH - mg - gap / 2); s.lastGy = gy;
      const p = { x, w: 74, kind: "full", gy, gap, ret: 0, stT: Math.min(gy - gap / 2, LH * .15), stB: Math.min(LH - gy - gap / 2, LH * .15), passed: false, xp: true, retire: false, crystal: false };
      s.pillars.push(p);
      if (Math.random() < .2 && COIN_MAX - csFresh().n - coinsPending() > 0) s.coinsObj.push({ p, ox: 37, oy: gy, ph: rnd(0, 6) });
    } else {
      const top = Math.random() < .5, h = rnd(.13, .19) * LH, p = { x, w: 74, kind: top ? "top" : "bot", h, ret: 1, passed: false, xp: false, crystal: false, crystalDone: false };
      if (s.boss && s.boss.ph === "fight" && s.crystalT <= 0) { p.crystal = true; s.crystalT = rnd(2.4, 3.4); }
      s.pillars.push(p);
    }
  }
  const crystalPos = p => { const g = geo(p); return p.kind === "top" ? { x: p.x + p.w / 2, y: g.th + 34 } : { x: p.x + p.w / 2, y: g.by - 34 }; };

  /* ---- Ender Dragon ---- */
  const DW = () => clamp(LW * .38, 230, 380), DH = () => DW() * 223 / 687;
  const hoverX = () => LW - DW() * .46 - 6;
  const mouth = b => ({ x: b.x - .445 * DW(), y: b.y + .04 * DH() });
  function startBoss() {
    s.bossMode = true; s.boss = { ph: "in", t: 0, x: LW + DW(), y: LH * .4, atk: null, cd: 1.4, hurt: 0, left: 46, last: "", flap: 0, rot: 0, dieT: 0 }; s.stubT = .6; s.crystalT = 1.2;
    s.pillars.forEach(p => { if (p.kind === "full" && p.x + p.w > s.x - 30) { p.retire = true; p.xp = false; } });
    s.coinsObj = s.coinsObj.filter(o => o.p.x < s.x);
    s.banner = "¡EL ENDER DRAGON SE ACERCA!"; s.bannerSub = "Toca los cristales del End para herirlo"; s.bannerT = 3.2; s.bannerC = "#ff7ae6"; s.shake = 12; sfx.roar(); sfx.warn();
  }
  function endBoss(msg) { s.boss = null; s.bossMode = false; s.tNorm = 0; s.bossIn = 52; s.noSpawn = 2.4; s.fire = []; s.zone = null; if (msg) { s.banner = msg; s.bannerSub = ""; s.bannerT = 2.2; s.bannerC = "#d6c1ff"; } }
  function pickAtk(b) {
    const w = [["fire", 4], ["breath", 3], ["charge", 3]].filter(a => a[0] !== b.last || Math.random() < .25); let r = Math.random() * w.reduce((a, q) => a + q[1], 0), k = w[0][0]; for (const q of w) { if ((r -= q[1]) <= 0) { k = q[0]; break; } }
    b.last = k; b.atk = { k, t: 0, shots: 0, n: Math.min(5, 2 + Math.ceil(s.dr.lvl / 2)), y: s.y, sub: "tele" }; if (k === "breath" || k === "charge") sfx.warn();
  }
  const endAtk = b => { b.atk = null; b.cd = Math.max(.5, 1.5 - .1 * s.dr.lvl) + rnd(0, .5); };
  function shoot(b) { const m = mouth(b), dx = s.x - m.x, dy = s.y - m.y, d = Math.hypot(dx, dy) || 1, v = 300 + 24 * s.dr.lvl; s.fire.push({ x: m.x, y: m.y, vx: dx / d * v, vy: dy / d * v, r: 13, t: 0 }); sfx.fire(); burst(m.x, m.y, ["#ff7ae6", "#ffffff"], 8, { sp: 120, g: 0, sz: 4, life: .5 }); }
  function hurtBoss() {
    const b = s.boss, d = s.dr; if (!b || b.ph !== "fight") return; d.hp = Math.max(0, d.hp - d.dmg); b.hurt = .5; b.atk = null; b.cd = 1.3; s.fire = []; s.zone = null; s.shake = Math.max(s.shake, 8); sfx.hurt();
    burst(b.x, b.y, ["#ffffff", "#ff7ae6", "#b57cf0"], 30, { sp: 260, sz: 6 });
    if (d.hp <= 0) { b.ph = "dead"; b.dieT = 0; b.atk = null; s.kills++; s.score += 10; s.banner = "¡DRAGÓN DERROTADO!"; s.bannerSub = "+50 XP"; s.bannerT = 3.2; s.bannerC = "#ffe45c"; s.shake = 16; s.flash = .5; s.flashC = "#ffffff"; sfx.win(); s.pop = .4;
      s.fl.push({ n: 50, t: 0, x: b.x, y: b.y }); s.xp += 50; s.pxp += 50;
      const q = csFresh(); if (!q.win) q.win = Date.now(); const take = Math.max(0, Math.min(5, COIN_MAX - q.n)); if (take) { q.n += take; s.coins += take; s.pcn += take; csSave(); for (let i = 0; i < take; i++) s.cf.push({ x: b.x + rnd(-40, 40), y: b.y + rnd(-20, 20), t: -i * .12 }); sfx.coin(); } }
  }
  function updBoss(dt) {
    const b = s.boss; if (!b) return; b.t += dt; b.flap += dt * (b.ph === "dead" ? 2 : 5.5); if (b.hurt > 0) b.hurt -= dt;
    const dw = DW(), dh = DH(), hx = hoverX(), hy = clamp(s.y, LH * .3, LH * .7);
    if (b.ph === "in") { b.x += (hx - b.x) * Math.min(1, 1.5 * dt); b.y += (LH * .4 - b.y) * Math.min(1, 2 * dt); if (Math.abs(hx - b.x) < 8 && b.t > 1.4) { b.ph = "fight"; b.cd = 1; } return; }
    if (b.ph === "out") { b.x += 340 * dt; b.y -= 110 * dt; if (b.x > LW + dw) endBoss(); return; }
    if (b.ph === "dead") { b.dieT += dt; b.y += 60 * b.dieT * dt * 2; b.rot += dt * .5; if (Math.random() < .6) burst(b.x + rnd(-dw / 3, dw / 3), b.y + rnd(-dh / 3, dh / 3), ["#ff7ae6", "#ffffff", "#b57cf0"], 3, { sp: 140, sz: 6 }); if (b.dieT > 2.4) { burst(b.x, b.y, ["#ffffff", "#ff7ae6", "#b57cf0", "#ffe45c"], 60, { sp: 420, sz: 8 }); s.dr = { lvl: s.dr.lvl + 1, hp: 100, max: 100, dmg: Math.max(12, 22 - 2 * s.dr.lvl), ghost: 100 }; endBoss(); s.bossIn = 55; } return; }
    b.left -= dt; const a = b.atk;
    if (!a) { b.x += (hx - b.x) * Math.min(1, 3 * dt); b.y += (hy - b.y) * Math.min(1, .9 * dt); b.cd -= dt; if (b.left <= 0) { b.ph = "out"; s.fire = []; s.banner = "El dragón huye..."; s.bannerSub = "Volverá con la vida que le dejaste"; s.bannerT = 2.6; s.bannerC = "#d6c1ff"; return; } if (b.cd <= 0) pickAtk(b); return; }
    a.t += dt;
    if (a.k === "fire") { b.x += (hx - b.x) * Math.min(1, 3 * dt); b.y += (hy - b.y) * Math.min(1, 1.4 * dt); if (a.t > .6 + a.shots * .34 && a.shots < a.n) { shoot(b); a.shots++; } if (a.shots >= a.n && a.t > .6 + a.n * .34 + .3) endAtk(b); }
    else if (a.k === "breath") {
      b.x += (hx - b.x) * Math.min(1, 3 * dt); if (a.t < .65) a.y = s.y; b.y += ((a.y - .04 * dh) - b.y) * Math.min(1, 6 * dt);
      if (a.t > 1 && a.t < 2.1) { if (!a.on) { a.on = true; sfx.breath(); s.shake = Math.max(s.shake, 5); } const m = mouth(b); s.zone = { x: 0, y: a.y - 27, w: m.x, h: 54, my: m.y }; if (Math.random() < .9) s.gas.push({ x: rnd(0, m.x), y: a.y + rnd(-26, 26), r: rnd(10, 22), l: .5, v: rnd(40, 140) });
        if (!s.dead && hitRect(s.x, s.y, 10, 0, a.y - 27, m.x, 54)) kill("breath"); } else s.zone = null;
      if (a.t > 2.3) { s.zone = null; endAtk(b); }
    } else if (a.k === "charge") {
      if (a.sub === "tele") { b.x += (LW - dw * .3 - b.x) * Math.min(1, 4 * dt); if (a.t < .6) a.y = s.y; b.y += (a.y - b.y) * Math.min(1, 7 * dt); if (a.t > .95) { a.sub = "go"; s.shake = Math.max(s.shake, 6); sfx.roar(); } }
      else if (a.sub === "go") { b.x -= 1250 * dt; if (Math.random() < .8) burst(b.x + dw * .3, b.y + rnd(-20, 20), ["#b57cf0", "#ff7ae6"], 1, { sp: 60, g: 0, sz: 6, life: .6 }); if (!s.dead && hitRect(s.x, s.y, 10, b.x - dw * .38, b.y - dh * .2, dw * .76, dh * .46)) kill("charge"); if (b.x < -dw) { a.sub = "ret"; b.x = LW + dw; a.t = 0; } }
      else { b.x += (hx - b.x) * Math.min(1, 3.2 * dt); b.y += (hy - b.y) * Math.min(1, 3 * dt); if (Math.abs(hx - b.x) < 8 || a.t > 1.6) endAtk(b); }
    }
  }

  /* ---- bucle principal ---- */
  function timers(dt) {
    ["pop", "flash", "xpGlow", "lvUp", "bannerT", "recT"].forEach(n => { if (s[n] > 0) s[n] -= dt; });
    s.shake *= Math.pow(.86, dt * 60); if (s.shake < .1) s.shake = 0; s.ph += dt;
    for (const f of s.fl) f.t += dt / .75;
    s.fl = s.fl.filter(f => { if (f.t < 1) return true; const a = xpInfo(s.base + s.xpArr).lvl; s.xpArr += f.n; s.xpGlow = .5; sfx.tick(); const b = xpInfo(s.base + s.xpArr).lvl; if (b > a) { s.lvUp = 2.6; s.lvTxt = "NIVEL " + b; s.pop = .5; sfx.lvl(); } return false; });
    for (const q of s.cf) q.t += dt / .8; s.cf = s.cf.filter(q => { if (q.t < 1) return true; s.cArr++; return false; });
    s.xpShow += (s.base + s.xpArr - s.xpShow) * Math.min(1, 7 * dt);
    s.pts.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.vx *= Math.pow(.97, dt * 60); q.l -= dt; }); s.pts = s.pts.filter(q => q.l > 0);
    s.rings.forEach(r => r.t += dt); s.rings = s.rings.filter(r => r.t < .6); s.gas.forEach(g => { g.l -= dt; g.x -= g.v * dt; }); s.gas = s.gas.filter(g => g.l > 0); s.beams.forEach(b => b.t += dt); s.beams = s.beams.filter(b => b.t < .5);
    if (s.dashFade > 0 && s.dashCd <= 0) s.dashFade -= dt * 1.6; s.fk = Math.min(1, s.fk + dt / .3);
  }
  function update(dt) {
    timers(dt); s.t += dt;
    if (!s.run) { s.y = LH / 2 + Math.sin(s.t * 3) * 9; s.x = px(); return; }
    if (s.paused) return;
    if (s.dead) { s.deadT += dt; s.vy = Math.min(s.vy + 1500 * dt, 800); s.y += s.vy * dt; s.ang += 7 * s.spin * dt; s.pillars.forEach(p => { p.x -= 40 * dt; }); updBoss(dt); return; }
    s.sec += dt; s.ms = s.sec * 1000; const base = Math.min(310, 165 + s.sec * 1.5) * (s.bossMode ? .88 : 1), v = base * (s.dashT > 0 ? 2.3 : 1);
    if (s.dashT > 0) {
      s.dashT -= dt; s.vy += (0 - s.vy) * Math.min(1, 20 * dt); s.y += s.vy * dt;
      burst(s.x - 22, s.y + rnd(-3, 3), ["#fff3b0", "#ffd27a", "#ffb347"], 2, { sp: 40, g: 0, sz: 4, life: .5, vx: -260 });        // chispas del cohete
      if (Math.random() < .7) burst(s.x - 26, s.y + rnd(-4, 4), ["#8a8a96", "#c8c8d4"], 1, { sp: 18, g: -30, sz: 8, life: .85, vx: -200 });   // humo
      s.fwT = (s.fwT || 0) - dt; if (s.fwT <= 0) { s.fwT = .12; firework(s.x - 44, s.y + rnd(-8, 8), 9, false); }
      if (s.dashT <= 0) { firework(s.x + 8, s.y, 46, true); sfx.blast(); s.shake = Math.max(s.shake, 3); }
    }
    else { s.vy = Math.min(s.vy + 1450 * dt, 700); s.y += s.vy * dt; }
    if (s.dashCd > 0) { s.dashCd -= dt; if (s.dashCd <= 0) { s.dashCd = 0; sfx.ready(); burst(s.x, s.y + 30, ["#ffffff", "#ffcf6b"], 8, { sp: 90, g: 0, sz: 3, life: .5 }); } }
    if (s.y < 16) { s.y = 16; if (s.vy < 0) s.vy = 0; } if (s.y > LH + 50) { kill("void"); return; }
    s.ang = Math.PI / 2 + clamp(s.vy * .0013, -.55, .8);
    /* spawn */
    if (!s.bossMode) { s.tNorm += dt; if (s.tNorm >= s.bossIn && !s.dead) startBoss(); }
    if (s.noSpawn > 0) s.noSpawn -= dt;
    const spacing = Math.max(235, base * 1.55), lp = s.pillars[s.pillars.length - 1];
    if (!s.bossMode && s.noSpawn <= 0 && (!lp || lp.x < LW + 80 - spacing)) spawnPillar(false);
    if (s.bossMode) { s.stubT -= dt; s.crystalT -= dt; if (s.stubT <= 0 && s.boss && s.boss.ph !== "dead") { spawnPillar(true); s.stubT = rnd(1, 1.45); } }
    /* pilares */
    for (const p of s.pillars) {
      p.x -= v * dt; if (p.retire && p.ret < 1) p.ret = Math.min(1, p.ret + dt * 1.1);
      const g = geo(p);
      if (!p.passed && p.x + p.w < s.x - 14) { p.passed = true; if (p.xp) { s.pil++; s.score++; s.xp += 5; s.pxp += 5; s.fl.push({ n: 5, t: 0, x: s.x, y: s.y }); s.pop = .25; sfx.pass(); } }
      if (hitRect(s.x, s.y, 10, p.x, -60, p.w, g.th + 60) || hitRect(s.x, s.y, 10, p.x, g.by, p.w, LH - g.by + 60)) { if (p.kind === "full" ? true : true) { kill("pilar"); return; } }
      if (p.crystal && !p.crystalDone) { const q = crystalPos(p); if ((q.x - s.x) ** 2 + (q.y - s.y) ** 2 < 34 * 34) { p.crystalDone = true; crystalBoom(q); } }
    }
    s.pillars = s.pillars.filter(p => p.x > -p.w - 60);
    /* monedas sueltas */
    s.coinsObj = s.coinsObj.filter(o => { o.cx = o.p.x + o.ox; o.cy = o.oy; if (o.cx < -40) return false; if ((o.cx - s.x) ** 2 + (o.cy - s.y) ** 2 < 28 * 28) { const q = csFresh(); if (q.n >= COIN_MAX) return false; if (!q.win) q.win = Date.now(); q.n++; s.coins++; s.pcn++; csSave(); s.cf.push({ x: o.cx, y: o.cy, t: 0 }); sfx.coin(); burst(o.cx, o.cy, ["#ffe45c", "#ffffff"], 8, { sp: 120, g: 0, sz: 4, life: .5 }); return false; } return true; });
    /* bolas de fuego */
    for (const f of s.fire) { f.x += f.vx * dt; f.y += f.vy * dt; f.t += dt; if (Math.random() < .7) burst(f.x, f.y, ["#ff7ae6", "#b57cf0"], 1, { sp: 30, g: 0, sz: 5, life: .45 }); if (!s.dead && (f.x - s.x) ** 2 + (f.y - s.y) ** 2 < (f.r + 9) ** 2) { kill("fuego"); return; } }
    s.fire = s.fire.filter(f => f.x > -40 && f.x < LW + 60 && f.y > -60 && f.y < LH + 60);
    updBoss(dt);
    const sc = Math.floor(s.score); if (best > 0 && sc > best && !s.recDone) { s.recDone = true; s.recT = 3; sfx.lvl(); s.pop = .5; }
    bgScroll(dt, v);
  }
  function crystalBoom(q) {
    sfx.crystal(); s.shake = Math.max(s.shake, 7); burst(q.x, q.y, ["#ff7ae6", "#ffffff", "#9af0ff"], 30, { sp: 280, sz: 6 }); s.rings.push({ x: q.x, y: q.y, t: 0, c: "#ff7ae6" });
    const b = s.boss; if (b && b.ph === "fight") { const m = { x: b.x, y: b.y }; s.beams.push({ x0: q.x, y0: q.y, x1: m.x, y1: m.y, t: 0 }); sfx.beam(); hurtBoss(); }
  }

  /* ---- fondo del End (islas, End Cities y chorus, con paralaje) ---- */
  const bgOff = [0, 0, 0];
  function bgScroll(dt, v) { bgOff[0] += v * dt * .05; bgOff[1] += v * dt * .12; bgOff[2] += v * dt * .26; }
  const mul = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  function buildBG() {
    const TW = Math.ceil(Math.max(LW, 900) * 1.5 / 8) * 8, layers = [];
    [{ u: 2, fog: .72, n: 7, sd: 5, ymin: .3, ymax: .8, wmin: 14, wmax: 26 }, { u: 3, fog: .45, n: 5, sd: 17, ymin: .45, ymax: .88, wmin: 16, wmax: 30 }, { u: 4, fog: .15, n: 4, sd: 29, ymin: .72, ymax: 1, wmin: 16, wmax: 30 }].forEach(cf => {
      const o = document.createElement("canvas"); o.width = TW; o.height = Math.ceil(LH); const g = o.getContext("2d"), R = mul(cf.sd * 131), u = cf.u;
      const col = h => rgb(mixc(hex(h), SKY, cf.fog)), U = (x, y, w, h, cc) => { g.fillStyle = cc; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
      const tower = (x, y) => {
        const bw = 6 + Math.floor(R() * 5), bh = 14 + Math.floor(R() * 20), L0 = col("#b98ac6"), M0 = col("#9a6aa8"), D0 = col("#6d4579"), Wn = col("#ffd96b"), Wp = col("#ff8be8");
        U(x - bw * u / 2, y - bh * u, bw * u, bh * u, M0); U(x - bw * u / 2, y - bh * u, u, bh * u, L0); U(x + bw * u / 2 - u, y - bh * u, u, bh * u, D0);
        for (let j = 3; j < bh - 2; j += 6) { U(x - bw * u / 2, y - j * u - 4 * u, bw * u, u, L0); const nw = Math.max(1, Math.floor((bw - 2) / 3)); for (let k = 0; k < nw; k++) U(x - bw * u / 2 + (1 + k * 3) * u + u * .0, y - j * u - 2.5 * u, 2 * u, 2 * u, R() < .75 ? Wn : Wp); }
        for (let k = 0; k < bw; k += 2) U(x - bw * u / 2 + k * u, y - bh * u - u, u, u, M0);
        const rw = Math.max(3, bw - 3), rh = 5; U(x - rw * u / 2, y - (bh + rh) * u, rw * u, rh * u, M0); U(x - rw * u / 2, y - (bh + rh) * u, u, rh * u, L0); U(x - rw * u / 2 + u, y - (bh + 3) * u, u * 2, u * 1.5, Wn); U(x - rw * u / 2 - u, y - (bh + rh + 1) * u, (rw + 2) * u, u, D0);
        if (R() < .6) { const side = R() < .5 ? -1 : 1, bl = 6 + Math.floor(R() * 6), by2 = y - (4 + Math.floor(R() * Math.max(1, bh - 8))) * u; U(side > 0 ? x + bw * u / 2 : x - bw * u / 2 - bl * u, by2, bl * u, u * 1.5, D0); U(side > 0 ? x + bw * u / 2 + bl * u : x - bw * u / 2 - bl * u - 3 * u, by2 - 3 * u, 3 * u, 4.5 * u, M0); }
      };
      const chorus = (x, y) => {
        const h = 5 + Math.floor(R() * 8), A = col("#a073b3"), B = col("#6b4580"), Fl = col("#e6b1f2"), Fc = col("#fff0ff"), Fr = col("#d9c2ec"), Fd = col("#a98cc4");
        U(x - u, y - h * u, 2 * u, h * u, A); U(x + 0, y - h * u, u, h * u, B);
        const tip = (tx, ty) => { U(tx - 1.5 * u, ty - 2 * u, 3 * u, 2 * u, Fl); U(tx - .5 * u, ty - 1.5 * u, u, u, Fc); };
        tip(x, y - h * u); if (h > 6) { const sd = R() < .5 ? -1 : 1, by2 = y - Math.floor(h * .55) * u, bl = 3 + Math.floor(R() * 2); U(sd > 0 ? x + u : x - u - bl * u, by2, bl * u, u, A); const ex = sd > 0 ? x + u + bl * u : x - u - bl * u; U(ex - (sd > 0 ? 0 : -0), by2 - 3 * u, u, 3 * u, B); tip(ex + .5 * u, by2 - 3 * u); }
        if (R() < .6) { const fx = x + (R() < .5 ? -4 : 3) * u; U(fx, y - 3 * u, 3 * u, 3 * u, Fr); U(fx + u, y - 2 * u, 2 * u, 2 * u, Fd); }
      };
      const island = (cx, cy, hw) => {
        const dmax = Math.round(hw * .95);
        for (let i = -hw; i <= hw; i++) { const d = Math.round(dmax * Math.pow(1 - Math.abs(i) / hw, .9)) + (R() < .3 ? 1 : 0);
          for (let j = 0; j <= d; j++) { const t = j / Math.max(1, d); let cc = j < 2 ? "#ece6a2" : t < .4 ? "#d4cf91" : t < .75 ? "#aaa46e" : "#767146"; if (R() < .15) cc = shadeHex(cc, R() < .5 ? .1 : -.12); U(cx + i * u, cy + j * u, u, u, col(cc)); } }
        const nt = R() < .7 ? 1 + Math.floor(R() * 2) : 0; for (let k = 0; k < nt; k++) tower(cx + (k - .5 * (nt - 1)) * hw * u * .9 + rnd(-hw * .2, hw * .2) * u, cy);
        const nc = 1 + Math.floor(R() * 4); for (let k = 0; k < nc; k++) chorus(cx + rnd(-hw * .85, hw * .85) * u, cy);
      };
      for (let i = 0; i < cf.n; i++) { const hw = Math.round(rnd(cf.wmin, cf.wmax) / 2), cx = (i + .15 + R() * .7) * TW / cf.n, cy = (cf.ymin + R() * (cf.ymax - cf.ymin)) * LH; island(cx, cy, hw); if (cx - hw * u < 0) island(cx + TW, cy, hw); if (cx + hw * u > TW) island(cx - TW, cy, hw); }
      layers.push({ o, TW, fog: cf.fog });
    });
    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() < .15 ? 2 : 1, ph: Math.random() * 6 }));
    bg = { layers, stars };
  }
  function shadeHex(h, f) { return rgb(f >= 0 ? mixc(hex(h), [255, 255, 255], f) : mixc(hex(h), [0, 0, 0], -f)).replace(/rgb\((\d+),(\d+),(\d+)\)/, (_, r, g, b) => "#" + [r, g, b].map(n => (+n).toString(16).padStart(2, "0")).join("")); }
  function drawBG() {
    if (!bg) buildBG(); const t = s.ph;
    const gr = c.createLinearGradient(0, 0, 0, LH); gr.addColorStop(0, "#0c0418"); gr.addColorStop(.55, "#24104a"); gr.addColorStop(1, "#43207a"); c.fillStyle = gr; c.fillRect(0, 0, LW, LH);
    [[.2, .3, 260, "rgba(150,80,230,.22)"], [.75, .55, 320, "rgba(60,200,220,.10)"], [.5, .9, 380, "rgba(200,90,240,.18)"]].forEach(([a, b2, r, cc], i) => { const x = a * LW + Math.sin(t * .05 + i) * 40, y = b2 * LH, g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, cc); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); });
    c.fillStyle = "#fff"; bg.stars.forEach(q => { c.globalAlpha = .35 + .5 * Math.abs(Math.sin(t * .8 + q.ph)); c.fillRect(Math.round(q.x * LW), Math.round(q.y * LH * .85), q.r, q.r); }); c.globalAlpha = 1;
    c.imageSmoothingEnabled = false;
    bg.layers.forEach((ly, i) => { const off = -(bgOff[i] % ly.TW); for (let x = off; x < LW; x += ly.TW) c.drawImage(ly.o, Math.round(x), 0); });
    c.save(); c.globalCompositeOperation = "lighter"; for (let i = 0; i < 26; i++) { const x = (i * 83.7 + t * (8 + i % 5) * -1 + 4000) % LW, y = (i * 47.3 + Math.sin(t * .5 + i) * 18 + t * 4) % LH; c.fillStyle = i % 3 ? "rgba(180,110,255,.5)" : "rgba(255,130,235,.45)"; c.fillRect(Math.round(x), Math.round(y), 2, 2); } c.restore();
  }

  /* ---- dibujo del mundo ---- */
  let pat = null, wingSp = null, crysSp = null;
  function wingImg() {
    if (wingSp) return wingSp; const Wd = 11, Ht = 24, o = document.createElement("canvas"); o.width = Wd; o.height = Ht; const g = o.getContext("2d"), R = mul(7);
    const cols = ["#d3d3de", "#b4b4c4", "#9696a8", "#7a7a8c"];
    for (let y = 0; y < Ht; y++) { const hw = Math.round(2.2 + 3.4 * Math.sin(Math.min(1, y / 9) * Math.PI / 2) - Math.max(0, y - 17) * .62); for (let x = 0; x < Wd; x++) { const dx = x - 5; if (Math.abs(dx) > hw || hw < 1) continue; let k = 1 + (dx < -hw + 1 ? -1 : 0) + (dx > hw - 1 ? 1 : 0) + (R() < .22 ? 1 : 0) - (y % 6 === 0 ? 0 : 0); k = clamp(k + (x < 4 ? -1 : 0), 0, 3); g.fillStyle = (y === 0 || Math.abs(dx) === hw) ? "#4f4f60" : cols[k]; g.fillRect(x, y, 1, 1); } }
    g.fillStyle = "#e6e6f2"; for (let y = 3; y < 18; y += 5) g.fillRect(3, y, 2, 1);
    return wingSp = o;
  }
  let wingDk = null;
  function wingDark() {
    if (wingDk) return wingDk; const w = wingImg(), o = document.createElement("canvas"); o.width = w.width; o.height = w.height; const g = o.getContext("2d");
    g.drawImage(w, 0, 0); g.globalCompositeOperation = "source-atop"; g.fillStyle = "rgba(0,0,0,.38)"; g.fillRect(0, 0, o.width, o.height); return wingDk = o;
  }
  function drawWing(f, theta, far) {
    c.save(); c.rotate(theta); c.scale(1, 1); c.globalAlpha = 1; c.imageSmoothingEnabled = false; const k = f * 3; c.drawImage(far ? wingDark() : wingImg(), -5.5 * k, 0, 11 * k, 24 * k); c.restore();
  }
  function drawPlayer() {
    c.save(); c.translate(s.x, s.y); c.rotate(s.ang); c.scale(-1, 1);
    const bobAng = s.dead ? 0 : 0;
    if (!figs) { c.fillStyle = "#f7b41e"; c.fillRect(-10, -22, 20, 34); c.restore(); return; }
    const f = 62 / figs.feet, { fig, gx, gy } = figs.get("walk", 0), cy = figs.feet * .5 * f;
    const open = .2 + (s.fk < 1 ? 1.0 * Math.sin(s.fk * Math.PI) : 0) + .06 * Math.sin(s.t * 4), sh = { x: figs.w * f * .06, y: -figs.feet * f * .7 + cy };
    c.save(); c.translate(sh.x + 3, sh.y); drawWing(f, -open * .85, true); c.restore();
    c.save(); c.translate(sh.x, sh.y); drawWing(f, -open, false); c.restore();               // las dos elytras van detrás del avatar
    c.imageSmoothingEnabled = false; c.drawImage(fig, -figs.w * f / 2 + gx * f, cy - figs.feet * f + gy * f, fig.width * f, fig.height * f);
    void bobAng; c.restore();
  }
  function crystalImg() { return crysSp; }
  function drawCrystal(x, y, flip) {
    const t = s.ph, bob = Math.sin(t * 2.4 + x * .01) * 3, cx = x, cy = y + bob, a = Math.abs(Math.cos(t * 1.6 + x * .02)), w = 12 + 12 * a;
    const gl = c.createRadialGradient(cx, cy, 0, cx, cy, 52); gl.addColorStop(0, "rgba(255,122,230,.55)"); gl.addColorStop(1, "rgba(255,122,230,0)"); c.fillStyle = gl; c.fillRect(cx - 52, cy - 52, 104, 104);
    c.save(); c.translate(cx, cy); if (flip) c.scale(1, -1);
    c.fillStyle = "#3a2f4a"; c.fillRect(-14, 20, 28, 6); c.fillStyle = "#554a66"; c.fillRect(-14, 20, 28, 2);
    c.fillStyle = "rgba(255,150,240,.55)"; c.fillRect(-w, -22, w * 2, 40); c.strokeStyle = "#ffd0f6"; c.lineWidth = 2; c.strokeRect(-w, -22, w * 2, 40);
    c.fillStyle = "rgba(255,90,215,.8)"; c.fillRect(-w * .62, -14, w * 1.24, 24); c.fillStyle = "#fff"; c.fillRect(-w * .3, -8, w * .6, 12); c.restore();
  }
  function drawPillar(p) {
    const g = geo(p), k = 4; if (!ok(IM.obs)) { c.fillStyle = "#14091f"; } else { pat = pat || c.createPattern(IM.obs, "repeat"); pat.setTransform(new DOMMatrix([k, 0, 0, k, Math.round(p.x), 0])); c.fillStyle = pat; }
    c.imageSmoothingEnabled = false;
    const part = (y0, y1, capTop) => {
      if (y1 - y0 < 1) return; c.fillStyle = pat || "#14091f"; c.fillRect(p.x, y0, p.w, y1 - y0);
      c.fillStyle = "rgba(0,0,0,.38)"; c.fillRect(p.x + p.w - 8, y0, 8, y1 - y0); c.fillStyle = "rgba(190,130,255,.14)"; c.fillRect(p.x, y0, 6, y1 - y0);
      c.strokeStyle = "rgba(167,123,255,.22)"; c.lineWidth = 7; c.strokeRect(p.x + 1, y0 - 4, p.w - 2, y1 - y0 + 8); c.strokeStyle = "#a77bff"; c.lineWidth = 2; c.strokeRect(p.x + 1, y0 - 4, p.w - 2, y1 - y0 + 8);
      const cy = capTop ? y1 - 14 : y0; c.fillStyle = "#0c0516"; c.fillRect(p.x - 5, cy, p.w + 10, 14); c.fillStyle = pat || "#14091f"; c.fillRect(p.x - 5, cy, p.w + 10, 14); c.fillStyle = "rgba(0,0,0,.3)"; c.fillRect(p.x - 5, cy + 8, p.w + 10, 6); c.strokeStyle = "#c9a3ff"; c.lineWidth = 2; c.strokeRect(p.x - 4, cy + 1, p.w + 8, 12);
    };
    if (g.th > 0) part(-30, g.th, true); if (g.by < LH + 30) part(g.by, LH + 30, false);
    if (p.crystal && !p.crystalDone) { const q = crystalPos(p); drawCrystal(q.x, q.y, p.kind === "top"); }
  }
  function drawBoss() {
    const b = s.boss; if (!b) return; const dw = DW(), dh = DH(), im = IM.dragon;
    if (s.zone) { const z = s.zone, a = s.boss.atk ? Math.min(1, (b.atk.t - 1) * 6) : 1, gr = c.createLinearGradient(0, 0, z.x + z.w, 0); gr.addColorStop(0, "rgba(160,60,255,0)"); gr.addColorStop(.6, "rgba(190,80,255,.55)"); gr.addColorStop(1, "rgba(255,130,235,.85)"); c.globalAlpha = a; c.fillStyle = gr; c.fillRect(z.x, z.y, z.w, z.h); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(z.x, z.y + z.h / 2 - 6, z.w, 12); c.globalAlpha = 1; }
    s.gas.forEach(g => { c.globalAlpha = Math.min(1, g.l * 2) * .5; c.fillStyle = "#d28bff"; c.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2); }); c.globalAlpha = 1;
    const a = b.atk;
    if (a && a.k === "breath" && a.t < 1) { const m = mouth(b), al = .25 + .2 * Math.sin(a.t * 24); c.fillStyle = `rgba(255,90,215,${al})`; c.fillRect(0, a.y - 27, m.x, 54); c.fillStyle = `rgba(255,200,245,${al + .2})`; c.fillRect(0, a.y - 2, m.x, 4); }
    if (a && a.k === "charge" && a.sub === "tele") { const al = .3 + .25 * Math.sin(a.t * 26); c.fillStyle = `rgba(255,60,90,${al})`; c.fillRect(0, a.y - 22, LW, 44); c.fillStyle = "rgba(255,255,255,.7)"; c.font = "800 34px" + F; c.textAlign = "left"; c.fillText("!", 22, a.y + 12); }
    if (!ok(im)) { c.fillStyle = "#3a1a66"; c.fillRect(b.x - dw / 2, b.y - dh / 2, dw, dh); }
    else {
      c.save(); c.translate(b.x, b.y); c.rotate(b.rot * (b.ph === "dead" ? 1 : 0)); c.scale(-1, 1); c.imageSmoothingEnabled = false;
      const flapK = 1 + Math.sin(b.flap) * .13, split = 95, iw = im.naturalWidth, ih = im.naturalHeight, k = dw / iw, bob = Math.sin(b.t * 2) * 4;
      c.translate(0, bob); const lw = (ih - split) * k;
      c.drawImage(im, 0, split, iw, ih - split, -dw / 2, -dh / 2 + split * k, dw, lw);
      c.drawImage(im, 0, 0, iw, split, -dw / 2, -dh / 2 + split * k - split * k * flapK, dw, split * k * flapK);
      if (b.hurt > 0) { c.globalCompositeOperation = "lighter"; c.globalAlpha = Math.min(1, b.hurt * 2) * .7; c.drawImage(im, 0, split, iw, ih - split, -dw / 2, -dh / 2 + split * k, dw, lw); c.drawImage(im, 0, 0, iw, split, -dw / 2, -dh / 2 + split * k - split * k * flapK, dw, split * k * flapK); }
      c.restore();
    }
    if (a && a.k === "fire" && a.t < .6 + a.n * .34) { const m = mouth(b), r = 8 + 14 * Math.min(1, a.t / .6), g = c.createRadialGradient(m.x, m.y, 0, m.x, m.y, r * 2); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(.4, "rgba(255,122,230,.6)"); g.addColorStop(1, "rgba(255,122,230,0)"); c.fillStyle = g; c.fillRect(m.x - r * 2, m.y - r * 2, r * 4, r * 4); }
  }
  function drawFire(f) {
    const g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 2.4); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(.35, "rgba(255,122,230,.85)"); g.addColorStop(1, "rgba(150,60,255,0)"); c.fillStyle = g; c.fillRect(f.x - f.r * 2.4, f.y - f.r * 2.4, f.r * 4.8, f.r * 4.8);
    c.save(); c.translate(f.x, f.y); c.rotate(f.t * 8); c.fillStyle = "#e060ff"; c.fillRect(-f.r * .6, -f.r * .6, f.r * 1.2, f.r * 1.2); c.fillStyle = "#fff"; c.fillRect(-f.r * .3, -f.r * .3, f.r * .6, f.r * .6); c.restore();
  }
  function drawCoinObj(x, y, sz) { const w = Math.max(sz * .22, Math.abs(Math.cos(s.ph * 3.2 + x * .05)) * sz); c.imageSmoothingEnabled = false; c.drawImage(coinImg(), Math.round(x - w / 2), Math.round(y - sz / 2), Math.round(w), Math.round(sz)); }
  const COINPX = ["..oooo..", ".oyyyyo.", "oyyhhyyo", "oyhyyyyo", "oyhyyyyo", "oyyyyyyo", ".oyyyyo.", "..oooo.."], CP = { o: "#a8730f", y: "#f5c93a", h: "#fff3b0" };
  let coinSp = null;
  function coinImg() { if (coinSp) return coinSp; const o = document.createElement("canvas"); o.width = o.height = 8; const g = o.getContext("2d"); COINPX.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== ".") { g.fillStyle = CP[ch]; g.fillRect(x, y, 1, 1); } })); return coinSp = o; }
  function drawWorld() {
    c.save(); c.scale(SC, SC); if (s.shake) c.translate(rnd(-s.shake, s.shake) * .6, rnd(-s.shake, s.shake) * .6);
    drawBG();
    s.pillars.forEach(drawPillar); s.coinsObj.forEach(o => drawCoinObj(o.cx || o.p.x + o.ox, o.cy || o.oy, 24));
    drawBoss(); s.fire.forEach(drawFire);
    s.beams.forEach(b => { const a = 1 - b.t / .5; c.globalAlpha = a; c.strokeStyle = "#ffd0f6"; c.lineWidth = 8 * a + 2; c.shadowColor = "#ff7ae6"; c.shadowBlur = 16; c.beginPath(); c.moveTo(b.x0, b.y0); c.lineTo(b.x1, b.y1); c.stroke(); c.shadowBlur = 0; c.globalAlpha = 1; });
    s.rings.forEach(r => { const a = 1 - r.t / .6; c.globalAlpha = a; c.strokeStyle = r.c; c.lineWidth = 2 + 6 * a; c.beginPath(); c.arc(r.x, r.y, r.t * 260, 0, 6.3); c.stroke(); c.globalAlpha = 1; });
    if (s.dashT > 0) { const g = c.createLinearGradient(s.x - 150, 0, s.x, 0); g.addColorStop(0, "rgba(255,200,100,0)"); g.addColorStop(1, "rgba(255,200,100,.5)"); c.fillStyle = g; c.fillRect(s.x - 150, s.y - 8, 150, 16); }
    drawPlayer();
    if ((s.dashCd > 0 || s.dashFade > 0) && !s.dead) { const al = s.dashCd > 0 ? 1 : clamp(s.dashFade, 0, 1), fill = s.dashCd > 0 ? 1 - s.dashCd / 5 : 1; c.globalAlpha = al * .9; c.fillStyle = "rgba(0,0,0,.45)"; c.fillRect(s.x - 24, s.y + 34, 48, 5); c.fillStyle = s.dashCd > 0 ? "#ffb347" : "#fff6c9"; c.fillRect(s.x - 24, s.y + 34, 48 * fill, 5); c.globalAlpha = 1; }
    s.pts.forEach(q => { c.globalAlpha = Math.min(1, q.l / (q.m * .5)); c.fillStyle = q.c; c.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz); }); c.globalAlpha = 1;
    c.restore();
  }

  /* ---- HUD (pantalla) ---- */
  const panel = (x, y, w, h, a = .55, b = "rgba(190,140,255,.35)") => { c.fillStyle = `rgba(10,4,26,${a})`; c.beginPath(); c.roundRect(x, y, w, h, 8); c.fill(); c.strokeStyle = b; c.lineWidth = 1.5; c.stroke(); };
  function T(str, x, y, size, col, al = "left", wt = 800, o = 0) { c.font = `${wt} ${size}px${F}`; c.textAlign = al; c.textBaseline = "alphabetic"; if (o) { c.lineJoin = "round"; c.lineWidth = o; c.strokeStyle = "rgba(10,0,30,.8)"; c.strokeText(str, x, y); } c.fillStyle = col; c.fillText(str, x, y); }
  const hudCoin = (x, y, sz) => { c.imageSmoothingEnabled = false; c.drawImage(coinImg(), Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz); };
  function drawHUD() {
    const u = me(), pn = { x: 10, y: 8, w: Math.min(190, W * .42), h: 40 }, gl = Math.max(0, s.xpGlow) / .5, cnt = Math.max(0, csFresh().n - (s.coins - s.cArr));
    panel(pn.x, pn.y, pn.w, pn.h, .5); hudCoin(pn.x + 15, pn.y + 14, 17); T(cnt + "/" + COIN_MAX, pn.x + 30, pn.y + 19, 14, "#f5c93a", "left", 800, 2);
    if (u) { const bx = pn.x + 10, bw = pn.w - 42, by = pn.y + 26, inf = xpInfo(s.xpShow); c.fillStyle = "rgba(0,0,0,.55)"; c.fillRect(bx - 2, by - 2, bw + 4, 11); c.fillStyle = "rgba(255,255,255,.14)"; c.fillRect(bx, by, bw, 7); c.fillStyle = gl > 0 ? "#e6ff9a" : "#8fe03a"; c.fillRect(bx, by, Math.round(bw * inf.pct), 7); T(String(inf.lvl), bx + bw + 8, by + 9 + 2 * gl, 14 + Math.round(4 * gl), "#e9f7c8", "left", 800, 3); }
    const gold = s.recDone, pk = 1 + .3 * Math.pow(Math.max(0, s.pop) / .5, 2), fz = Math.min(46, W * .12);
    c.save(); c.translate(W / 2, 54); c.scale(pk, pk); if (gold) { c.shadowColor = "rgba(255,190,30,.85)"; c.shadowBlur = 14; } T(String(Math.floor(s.score)), 0, 0, fz, gold ? "#ffcf33" : "#fff", "center", 800, 5); c.restore();
    if (s.recT > 0) { c.save(); c.globalAlpha = Math.min(1, s.recT, (3 - s.recT) * 6); T("¡NUEVO RÉCORD!", W / 2, 82, 14, "#ffcf33", "center", 800, 3); c.restore(); }
    const b = s.boss; if (b && b.ph !== "dead") { const bw = Math.min(W - 40, 420), bx = (W - bw) / 2, by = s.recT > 0 ? 114 : 94; s.dr.ghost += (s.dr.hp - s.dr.ghost) * .06;
      panel(bx - 8, by - 20, bw + 16, 40, .55, "rgba(255,122,230,.5)"); T("ENDER DRAGON  Nv." + s.dr.lvl, bx, by - 5, 11, "#ffd0f6", "left", 800, 2); if (b.ph === "fight") T(Math.max(0, Math.ceil(b.left)) + " s", bx + bw, by - 5, 11, "#d6c1ff", "right", 800, 2);
      c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(bx, by, bw, 10); c.fillStyle = "#ffffff"; c.fillRect(bx, by, bw * s.dr.ghost / 100, 10); const gr = c.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, "#b03cff"); gr.addColorStop(1, "#ff7ae6"); c.fillStyle = gr; c.fillRect(bx, by, bw * s.dr.hp / 100, 10);
      c.fillStyle = "rgba(0,0,0,.5)"; for (let i = 1; i < 5; i++) c.fillRect(bx + bw * i / 5 - 1, by, 2, 10); }
    if (s.banner && s.bannerT > 0) { const ag = 3.2 - s.bannerT, zz = 1 + Math.max(0, 1 - ag / .25) * .6; c.save(); c.globalAlpha = clamp(Math.min(s.bannerT * 2, ag * 5), 0, 1); c.translate(W / 2, H * .3); c.scale(zz, zz); T(s.banner, 0, 0, Math.min(34, W * .07), s.bannerC, "center", 800, 6); if (s.bannerSub) T(s.bannerSub, 0, 26, Math.min(16, W * .04), "#e9dcff", "center", 700, 4); c.restore(); }
    if (s.lvUp > 0) { c.save(); c.globalAlpha = Math.min(1, s.lvUp); T(s.lvTxt + "!", W / 2, H * .42, 28, "#b8f046", "center", 800, 6); c.restore(); }
    s.fl.forEach(f => { const p = f.t < .25 ? 0 : (f.t - .25) / .75, sx = f.x * SC, sy = f.y * SC - 20, ex = pn.x + 10 + (pn.w - 42) / 2, ey = pn.y + 30, x = lerp(sx, ex, p * p), y = lerp(sy, ey, p) - Math.sin(p * Math.PI) * 30, zz = 1.4 - .7 * p, al = f.t < .1 ? f.t / .1 : p > .88 ? (1 - p) / .12 : 1;
      c.save(); c.globalAlpha = Math.max(0, al); c.translate(x, y); c.scale(zz, zz); T("+" + f.n + " XP", 0, 0, 15, "#b8f046", "center", 800, 3); c.restore(); });
    s.cf.forEach(q => { if (q.t < 0) return; const p = q.t, e = p * p * (3 - 2 * p), x = lerp(q.x * SC, pn.x + 15, e), y = lerp(q.y * SC, pn.y + 14, e) - Math.sin(p * Math.PI) * 50; hudCoin(x, y, Math.round(lerp(26, 15, e))); });
  }
  function drawOverlay() {
    if (st === "ready") { const a = .7 + .3 * Math.sin(s.t * 4); c.save(); c.globalAlpha = a; T("Elytra Fly", W / 2, H * .3, Math.min(44, W * .1), "#e9dcff", "center", 800, 6); T(TOUCH ? "Toca para aletear · desliza → para el cohete" : "Espacio o clic para aletear · Shift: cohete", W / 2, H * .3 + 34, Math.min(17, W * .042), "#ffe9a8", "center", 800, 4); c.restore(); }
    if (s.paused) { c.fillStyle = "rgba(10,0,30,.6)"; c.fillRect(0, 0, W, H); T("PAUSA", W / 2, H / 2, 40, "#fff", "center", 800, 5); T(TOUCH ? "Toca para continuar" : "Pulsa P para continuar", W / 2, H / 2 + 28, 16, "#d6c1ff", "center", 700, 3); }
    if (st === "over" && s.deadT > .5) {
      const lines = TOUCH ? ["Toca: aletear   Desliza → : cohete (recarga 5 s)", "Cada pilar pasado = 5 XP", "Toca los cristales del End para herir al dragón"] : ["Espacio / clic: aletear   Shift: cohete (recarga 5 s)", "Cada pilar pasado = 5 XP · cada dragón = 50 XP", "Toca los cristales del End para herir al dragón"];
      const pw = Math.min(W - 16, 360), ph = 190 + lines.length * 17, py = clamp(H / 2 - ph / 2, 8, H - ph - 8), a = Math.min(1, (s.deadT - .5) / .3);
      c.save(); c.globalAlpha = a; panel(W / 2 - pw / 2, py, pw, ph, .88, "rgba(190,140,255,.55)"); T("Fin del juego", W / 2, py + 36, 28, "#d6b8ff", "center", 800); T(String(Math.floor(s.score)), W / 2, py + 76, 38, s.recDone ? "#ffcf33" : "#fff", "center", 800, 3);
      T((s.recDone ? "¡Nuevo récord!  " : "") + s.pil + " pilares" + (s.kills ? " · " + s.kills + (s.kills > 1 ? " dragones" : " dragón") : ""), W / 2, py + 100, 14, "#e9dcff", "center", 700);
      T("+" + s.xp + " XP" + (s.coins ? "  ·  +" + s.coins + " monedas" : ""), W / 2, py + 122, 15, s.recDone ? "#ffcf33" : "#b8f046", "center", 800);
      T(me() ? (TOUCH ? "Toca para reintentar" : "Pulsa Espacio para reintentar") : "Inicia sesión para guardar puntaje, XP y monedas", W / 2, py + 148, 15, "#ffe9a8", "center", 800);
      lines.forEach((l, i) => T(l, W / 2, py + 176 + i * 17, 12, "rgba(235,225,255,.85)", "center", 500)); c.restore(); }
    if (s.flash > 0) { c.fillStyle = s.flashC; c.globalAlpha = Math.min(.5, s.flash) ; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  }
  function draw() { c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, H); drawWorld(); drawHUD(); drawOverlay(); }
  function loop(t) {
    const dt = Math.min(.05, (t - last) / 1000 || .016); last = t;
    if (s) { if (!s.paused) update(dt); else timers(0); draw(); }
    raf = requestAnimationFrame(loop);
  }

  /* ---- entrada ---- */
  const live = () => Play.id() === "elytra" && !$("#v-juego").hidden && $("#gamecard").classList.contains("open") && modal.hidden;
  addEventListener("keydown", e => {
    if (!live() || e.ctrlKey || e.metaKey || e.altKey || !s) return;
    if (e.code === "KeyM") { muted = !muted; try { localStorage.setItem("hood_elytra_mute", muted ? "1" : "0"); } catch (_) { /* sin almacenamiento */ } if (!muted) sfx.ready(); return; }
    if (e.code === "KeyP") { e.preventDefault(); if (s.run && !s.dead) s.paused = !s.paused; return; }
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW" || (e.code === "Enter" && st === "over")) { e.preventDefault(); if (!e.repeat) flap(); }
    else if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyX") { e.preventDefault(); if (!e.repeat) dash(); }
  });
  cv.addEventListener("pointerdown", e => {
    if (!live() || !s) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, done: false }); flap();
  });
  cv.addEventListener("pointermove", e => {
    const p = ptr.get(e.pointerId); if (!p || p.done || !live()) return; const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (dx > 38 && dx > Math.abs(dy) * 1.4) { p.done = true; dash(); }
  });
  const pup = e => ptr.delete(e.pointerId); cv.addEventListener("pointerup", pup); cv.addEventListener("pointercancel", pup);
  addEventListener("resize", () => { if (live()) fit(); });
  addEventListener("blur", () => { if (s && st === "run" && live()) s.paused = true; });
  document.addEventListener("visibilitychange", () => { if (document.hidden && s && st === "run") s.paused = true; });
  const begin = () => { cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); };
  return {
    start() { fit(); startGame(); begin(); },
    stop() { cancelAnimationFrame(raf); raf = 0; ptr.clear(); if (s) { if (st === "run" && !s.dead) s.paused = true; flush(); } },
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
  let curId = null;
  const MODS = { runner: () => Game, coral: () => Coral, elytra: () => Elytra };
  function open(w) {
    curId = w.game.id; $("#cv").setAttribute("aria-label", w.game.label || w.game.name);
    gc.classList.add("open"); gc.setAttribute("aria-hidden", "false");
    MODS[curId]().start();
    try { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); $("#cv").focus({ preventScroll: true }); } catch (e) { /* sin foco */ }
  }
  function close() {
    if (!isOpen()) return;
    gc.classList.remove("open"); gc.setAttribute("aria-hidden", "true"); if (curId) MODS[curId]().stop(); curId = null;
  }
  $("#gc-close").onclick = close;
  addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  return { jumpTo, open, close, isOpen, id: () => curId };
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
    leave() { active = false; bgs.classList.remove("on"); Play.close(); Game.stop(); Coral.stop(); Elytra.stop(); Mine.stop(); },
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
  ready = true; renderAuth(); Game.refresh(); Coral.refresh(); Elytra.refresh(); Arcade.refresh(); Mercado.refresh();
  refreshView();
});
})();
