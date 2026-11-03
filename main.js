/* HOOD STUDIO — cuentas, jugadores, minijuego
 * NOTA: GitHub Pages no tiene servidor. Cuentas, tabla de jugadores y ranking
 * se guardan en el navegador de cada persona (localStorage), por lo que cada
 * visitante solo ve sus propios datos. Para tablas compartidas entre todos
 * hace falta un backend (Firebase / Supabase). */
(() => {
"use strict";
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const K = { u: "hood_users_v2", s: "hood_session_v2", r: "hood_rank_v2" };
["hood_users", "hood_session"].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); // borra el registro anterior
const rd = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? f : v; } catch (e) { return f; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const headUrl = n => "https://minotar.net/helm/" + encodeURIComponent(n) + "/64.png";
const DEF = headUrl("MHF_Steve");
const session = () => rd(K.s, null);
const me = () => { const s = session(); return s ? (rd(K.u, {})[s.key] || null) : null; };

/* ---------- Vistas ---------- */
const V = ["inicio", "proyectos", "calendario", "jugadores", "juego", "creditos"];
function route() {
  const h = location.hash.slice(1), cur = V.includes(h) ? h : "inicio";
  V.forEach(v => $("#v-" + v).hidden = v !== cur);
  $$(".nav a").forEach(a => a.classList.toggle("on", a.dataset.v === cur));
  if (cur === "jugadores") renderPlayers();
  if (cur === "juego") { renderRank(); Game.show(); } else Game.stop();
  window.scrollTo(0, 0);
}
addEventListener("hashchange", route);

/* ---------- Slider de proyectos ---------- */
const slides = $$(".slide"); let si = 0;
if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
  setInterval(() => { slides[si].classList.remove("on"); si = (si + 1) % slides.length; slides[si].classList.add("on"); }, 5000);

/* ---------- Cuentas ---------- */
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const hashPw = async (p, salt) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + p)));
function skinToHead(file) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width !== 64 || (img.height !== 64 && img.height !== 32)) return no(new Error("size"));
      const c = document.createElement("canvas"); c.width = c.height = 64;
      const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
      x.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
      if (img.height === 64) x.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
      URL.revokeObjectURL(url); ok(c.toDataURL());
    };
    img.onerror = () => no(new Error("img")); img.src = url;
  });
}
async function signUp(name, pw, prem, file) {
  const users = rd(K.u, {}), key = name.toLowerCase();
  if (users[key]) return "Ese nombre ya está registrado.";
  let avatar = DEF;
  if (prem) avatar = headUrl(name);
  else if (file) { try { avatar = await skinToHead(file); } catch (e) { return "La skin debe ser un PNG de 64×64 (o 64×32)."; } }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  users[key] = { name, salt, hash: await hashPw(pw, salt), avatar, medals: 0 };
  if (!wr(K.u, users)) return "No se pudo guardar. Activa el almacenamiento del navegador.";
  wr(K.s, { key }); return null;
}
async function logIn(name, pw) {
  const key = name.toLowerCase(), u = rd(K.u, {})[key];
  if (!u || (await hashPw(pw, u.salt)) !== u.hash) return "Usuario o contraseña incorrectos.";
  wr(K.s, { key }); return null;
}
function renderAuth() {
  const box = $("#auth"), u = me(); box.textContent = "";
  const mk = (t, c, f) => { const b = document.createElement("button"); b.className = c; b.textContent = t; b.onclick = f; return b; };
  if (u) {
    const d = document.createElement("div"); d.className = "me";
    d.innerHTML = `<img src="${esc(u.avatar)}" alt=""><span>${esc(u.name)}</span>`;
    box.append(d, mk("Salir", "btn", () => { localStorage.removeItem(K.s); renderAuth(); Game.refresh(); }));
  } else box.append(mk("Iniciar sesión", "btn", () => openM("login")), mk("Registrarse", "btn solid", () => openM("signup")));
}

/* ---------- Modal ---------- */
const modal = $("#modal"), form = $("#form"); let mode = "login", last = null;
function setMode(m) {
  mode = m; $$(".tabs button").forEach(t => t.setAttribute("aria-selected", t.dataset.m === m));
  $("#su").hidden = m !== "signup"; $("#go").textContent = m === "login" ? "Iniciar sesión" : "Crear cuenta";
  $("#pw").autocomplete = m === "login" ? "current-password" : "new-password"; $("#err").textContent = "";
}
const openM = m => { last = document.activeElement; form.reset(); setMode(m); $("#skinbox").hidden = true; modal.hidden = false; $("#un").focus(); };
const closeM = () => { modal.hidden = true; last && last.focus && last.focus(); };
$$(".tabs button").forEach(t => t.onclick = () => setMode(t.dataset.m));
$("#prem").onchange = e => $("#skinbox").hidden = e.target.checked;
$("#mx").onclick = closeM; modal.onclick = e => { if (e.target === modal) closeM(); };
addEventListener("keydown", e => { if (e.key === "Escape" && !modal.hidden) closeM(); });
form.onsubmit = async e => {
  e.preventDefault(); const err = $("#err"); err.textContent = "";
  const name = $("#un").value.trim(), pw = $("#pw").value;
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return void (err.textContent = "Tu nombre de Minecraft tiene de 3 a 16 caracteres: letras, números o guion bajo.");
  if (pw.length < 6) return void (err.textContent = "La contraseña debe tener al menos 6 caracteres.");
  if (!crypto.subtle) return void (err.textContent = "Abre la página con https para crear cuentas.");
  $("#go").disabled = true;
  const r = mode === "login" ? await logIn(name, pw) : await signUp(name, pw, $("#prem").checked, $("#skin").files[0]);
  $("#go").disabled = false;
  if (r) return void (err.textContent = r);
  closeM(); renderAuth(); Game.refresh(); if (location.hash === "#jugadores") renderPlayers();
};

/* ---------- Jugadores ---------- */
function renderPlayers() {
  const list = Object.values(rd(K.u, {})).sort((a, b) => b.medals - a.medals || a.name.localeCompare(b.name));
  $("#players").innerHTML = list.length
    ? list.map((u, i) => `<tr><td>${i + 1}</td><td><span class="pl"><img src="${esc(u.avatar)}" alt="">${esc(u.name)}</span></td><td>${u.medals}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">Aún no hay jugadores registrados.</td></tr>`;
}

/* ---------- Ranking del juego ---------- */
function renderRank() {
  const r = rd(K.r, []);
  $("#rank").innerHTML = r.length
    ? r.map((x, i) => `<tr><td>${i + 1}</td><td><span class="pl"><img src="${esc(x.avatar)}" alt="">${esc(x.name)}</span></td><td>${x.score}</td></tr>`).join("")
    : `<tr><td class="empty">Sé el primero en el ranking.</td></tr>`;
}
function saveScore(score) {
  const u = me(); if (!u || !score) return;
  const r = rd(K.r, []), i = r.findIndex(x => x.name === u.name);
  if (i >= 0) { if (r[i].score >= score) return; r[i].score = score; r[i].avatar = u.avatar; }
  else r.push({ name: u.name, avatar: u.avatar, score });
  r.sort((a, b) => b.score - a.score); wr(K.r, r.slice(0, 10)); renderRank();
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

$("#yr").textContent = new Date().getFullYear();
renderAuth(); route();
})();
