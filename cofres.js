/* cofres.js — COFRES DEL END: ganas uno por cada nivel. Se acumulan ("X 3"), se abren a pantalla completa con una ruleta
 * estilo cajas de Counter-Strike y dan monedas (10–500) o items de la tienda (incluidos los exclusivos).
 * Los premios los edita la cuenta HOODSTUDIO (documento config/chest). Cuántos cofres has abierto se guarda en
 * players/{uid}.chestsOpened; las reglas de Firestore impiden abrir más cofres que niveles tengas.
 * createCofres(deps) -> { unopened, pending, markSeen, updateDot, mount, open } */
const DEF = { min: 10, max: 500, items: [], prizes: [
  { type: "coins", min: 10, max: 25, w: 50 }, { type: "coins", min: 26, max: 60, w: 26 }, { type: "coins", min: 61, max: 120, w: 14 },
  { type: "coins", min: 121, max: 250, w: 7 }, { type: "coins", min: 251, max: 500, w: 3 }] };
const RAR = { common: ["#9aa7b4", "COMÚN"], rare: ["#3b7bff", "RARO"], epic: ["#c040ff", "ÉPICO"], legend: ["#ffb300", "LEGENDARIO"] };
const rnd = (a, b) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function createCofres(D) {
  const { me, xpInfo, db, doc, getDoc, setDoc, updateDoc, increment, Mercado, refreshAuth } = D;
  let cfg = null, busy = false;

  /* ---- cuántos cofres tiene el jugador ---- */
  const unopened = () => { const u = me(); return u ? Math.max(0, xpInfo(u.xp || 0).lvl - (u.chestsOpened || 0)) : 0; };
  const seenKey = () => "hood_chest_seen_" + (me() ? me().uid : "x");
  const seen = () => { try { return Number(localStorage.getItem(seenKey())) || 0; } catch (e) { return 0; } };
  const pending = () => unopened() > seen();
  const markSeen = () => { try { localStorage.setItem(seenKey(), String(unopened())); } catch (e) { /* sin almacenamiento */ } updateDot(); };
  function updateDot() {                                         // puntito de aviso junto a tu cabeza (arriba); se quita al entrar al perfil
    const m = document.querySelector("#auth .me"); if (!m) return; let d = m.querySelector(".mdot");
    if (pending()) { if (!d) { d = document.createElement("i"); d.className = "mdot"; d.title = "¡Tienes cofres por abrir!"; m.append(d); } d.textContent = unopened() > 1 ? unopened() : ""; }
    else if (d) d.remove();
  }
  setInterval(updateDot, 4000);

  /* ---- premios ---- */
  async function loadCfg(force) {
    if (cfg && !force) return cfg;
    try { const s = await getDoc(doc(db, "config", "chest")); const d = s.exists() ? s.data() : null; cfg = d && Array.isArray(d.prizes) && d.prizes.length ? { min: Number(d.min) || 10, max: Number(d.max) || 500, items: d.items || [], prizes: d.prizes } : DEF; }
    catch (e) { cfg = DEF; }
    return cfg;
  }
  const itemRar = it => it && (it.hidden || it.price >= 400) ? "legend" : it && it.price >= 150 ? "epic" : "rare";
  const coinRar = v => v >= 300 ? "legend" : v >= 120 ? "epic" : v >= 45 ? "rare" : "common";
  function prizeOf(p, owned) {                                  // convierte una entrada de la tabla en un premio concreto (o null)
    if (p.type === "item") { const it = Mercado.itemOf(p.id); if (!it || owned.includes(p.id)) return null; return { type: "item", id: p.id, name: it.name, img: typeof it.img === "string" ? it.img : "", rar: itemRar(it) }; }
    const a = clamp(ri(Number(p.min) || 10, Number(p.max) || 25), cfg.min, cfg.max); return { type: "coins", amount: a, name: a + " monedas", rar: coinRar(a) };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function roll(owned) {                                        // sorteo por pesos; los items que ya tienes no salen
    const pool = cfg.prizes.map(p => ({ p, w: Math.max(1, Number(p.w) || 1) })).filter(x => x.p.type !== "item" || prizeOf(x.p, owned));
    let t = rnd(0, pool.reduce((s, x) => s + x.w, 0)); for (const x of pool) { if ((t -= x.w) <= 0) return prizeOf(x.p, owned); } return prizeOf(pool[0].p, owned);
  }
  const tileHTML = p => `<div class="cf-t" style="--c:${RAR[p.rar][0]}">${p.type === "coins" ? `<span class="cf-coin"></span><b>${p.amount}</b><small>monedas</small>` : `${p.img ? `<img src="${esc(p.img)}" alt="">` : `<span class="cf-box"></span>`}<small>${esc(p.name)}</small>`}</div>`;

  /* ---- cofre del End dibujado en píxeles ---- */
  function drawChest(c, x, y, s, open, glow) {                  // 16×16 unidades; open 0..1 levanta la tapa
    c.imageSmoothingEnabled = false; const R = (a, b, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x + a * s), Math.round(y + b * s), Math.round(w * s), Math.round(h * s)); };
    if (open > 0) { const g = c.createLinearGradient(0, y + 6 * s, 0, y - 60 * s); g.addColorStop(0, glow); g.addColorStop(1, "rgba(255,255,255,0)"); c.globalAlpha = Math.min(1, open * 1.4); c.fillStyle = g; c.fillRect(x + 1.5 * s, y - 60 * s, 13 * s, 66 * s); c.globalAlpha = 1; }
    R(0, 6, 16, 10, "#0b2523"); R(0, 6, 16, 1, "#16413d"); R(0, 15, 16, 1, "#061615"); R(0, 6, 1, 10, "#102f2c"); R(15, 6, 1, 10, "#061615");
    for (let i = 0; i < 14; i++) R(1 + (i * 7) % 14, 7 + (i * 5) % 8, 2, 1, i % 2 ? "#0f2f2c" : "#08201e");
    R(5.5, 10, 5, 5, "#3be08a"); R(6.5, 11, 3, 3, "#0b2523"); R(7, 12, 2, 1, "#aaffd8");          // anillo verde
    const lift = open * 7, sq = 1 - open * .8, ly = 6 - 6 * sq - lift;                                // tapa: se encoge y sube
    c.globalAlpha = 1 - Math.max(0, open - .8) * 4; R(0, ly, 16, 6 * sq, "#12403b"); R(0, ly, 16, Math.max(.6, sq), "#1f5f58"); R(0, ly + 6 * sq - .5, 16, .5, "#061615");
    R(6.5, ly + 4 * sq, 3, 4 * sq + 1, "#e0a31b"); R(7, ly + 5 * sq, 2, 1.5 * sq, "#ffe27a"); c.globalAlpha = 1;
  }

  /* ---- apertura a pantalla completa ---- */
  async function open() {
    const u = me(); if (!u || busy || unopened() <= 0) return; busy = true;
    try {
      await loadCfg(true); await Mercado.loadShop(); const prize = roll(u.inv || []);
      const upd = { chestsOpened: increment(1) }; if (prize.type === "coins") upd.coins = increment(prize.amount); else upd.inv = [...(u.inv || []), prize.id];
      try { await updateDoc(doc(db, "players", u.uid), upd); }
      catch (e) { console.warn(e); alert("No se pudo abrir el cofre" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas de Firestore?"); busy = false; return; }
      u.chestsOpened = (u.chestsOpened || 0) + 1; if (prize.type === "coins") u.coins = (u.coins || 0) + prize.amount; else u.inv = [...(u.inv || []), prize.id];
      await show(prize);
    } finally { busy = false; }
    markSeen(); if (refreshAuth) refreshAuth(); const host = document.querySelector("#chestside"); if (host && host.isConnected) mount(host);
  }
  function show(prize) {
    return new Promise(done => {
      const decoys = [], pool = cfg.prizes.map(p => prizeOf(p, [])).filter(Boolean); for (let i = 0; i < 64; i++) decoys.push(pool[ri(0, pool.length - 1)] || prize);
      const WIN = 54; decoys[WIN] = prize; const TW = 150, GAP = 10;
      const ov = document.createElement("div"); ov.className = "cf-ov"; const col = RAR[prize.rar][0];
      ov.innerHTML = `<canvas class="cf-cv"></canvas><div class="cf-roll"><div class="cf-ptr"></div><div class="cf-win"><div class="cf-strip">${decoys.map(tileHTML).join("")}</div></div></div>
        <div class="cf-res" style="--c:${col}"><small>¡HAS OBTENIDO!</small><b>${esc(prize.name)}</b><em>${RAR[prize.rar][1]}</em></div>
        <div class="cf-btns"><button class="cf-b" id="cf-skip" type="button">Saltar</button><button class="cf-b solid" id="cf-ok" type="button" hidden>Aceptar</button><button class="cf-b" id="cf-more" type="button" hidden></button></div>`;
      document.body.append(ov); document.body.classList.add("cf-lock"); requestAnimationFrame(() => ov.classList.add("on"));
      const cv = ov.querySelector(".cf-cv"), c = cv.getContext("2d"), strip = ov.querySelector(".cf-strip"), tiles = [...strip.children];
      let W = 0, H = 0, t0 = performance.now(), phase = 0, raf = 0, parts = [], finished = false, shake = 0;
      const fit = () => { const d = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d; cv.dataset.d = d; }; fit(); addEventListener("resize", fit);
      const burst = (n, spd) => { const d = +cv.dataset.d; for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(spd * .3, spd) * d; parts.push({ x: W / 2, y: H * .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 150 * d, l: rnd(.7, 1.6), t: 0, s: rnd(4, 10) * d, c: Math.random() < .5 ? col : "#fff" }); } };
      const frame = now => {
        raf = requestAnimationFrame(frame); const t = (now - t0) / 1000, d = +cv.dataset.d, dt = 1 / 60; c.clearRect(0, 0, W, H);
        const S = Math.min(W, H) / 22, cx = W / 2 - 8 * S;
        if (phase === 0) {                                        // 1) cae y tiembla cada vez más
          const drop = Math.min(1, t / .7), bounce = drop < 1 ? 0 : Math.sin((t - .7) * 40) * Math.max(0, .4 - (t - .7)) * S * 2, sh = t > .9 ? (t - .9) * 1.6 * S * .08 : 0;
          const y = H * .5 - 8 * S + (drop - 1) * H * .6 + bounce + rnd(-sh, sh); drawChest(c, cx + rnd(-sh, sh), y, S, 0, col);
          c.globalAlpha = Math.min(1, t) * .5; const g = c.createRadialGradient(W / 2, H * .5, 0, W / 2, H * .5, S * 14); g.addColorStop(0, "rgba(59,224,138,.5)"); g.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = g; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
          if (t > 1.9) { phase = 1; t0 = now; burst(60, 700); }
        } else if (phase === 1) {                                 // 2) se abre: la tapa sube y sale un haz del color del premio
          const o = Math.min(1, t / .7); drawChest(c, cx, H * .5 - 8 * S, S, o, col);
          if (t > 1.1) { phase = 2; t0 = now; ov.classList.add("roll"); startRoll(); }
        } else if (phase === 2) { const o = Math.max(0, 1 - t / .8); c.globalAlpha = o; drawChest(c, cx, H * .5 - 8 * S + t * S * 3, S, 1, col); c.globalAlpha = 1; }
        parts.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * d * dt; c.globalAlpha = Math.max(0, 1 - p.t / p.l); c.fillStyle = p.c; c.fillRect(p.x, p.y, p.s, p.s); }); c.globalAlpha = 1; parts = parts.filter(p => p.t < p.l);
        if (phase === 2 && !finished) tick();
      };
      let lastIdx = -1; const win = ov.querySelector(".cf-win");
      const tick = () => { const r = strip.getBoundingClientRect(), w = win.getBoundingClientRect(), i = Math.floor((w.left + w.width / 2 - r.left) / (TW + GAP)); if (i !== lastIdx) { tiles[lastIdx] && tiles[lastIdx].classList.remove("hot"); tiles[i] && tiles[i].classList.add("hot"); lastIdx = i; } };
      function startRoll() {
        const w = win.clientWidth, target = WIN * (TW + GAP) + TW / 2 - w / 2 + rnd(-TW * .38, TW * .38);
        strip.style.transition = "none"; strip.style.transform = "translateX(0)"; void strip.offsetWidth;
        strip.style.transition = "transform 6.6s cubic-bezier(.08,.8,.14,1)"; strip.style.transform = `translateX(${-target}px)`;
        strip.addEventListener("transitionend", reveal, { once: true });
      }
      function reveal() {
        if (finished) return; finished = true; tiles.forEach((t, i) => t.classList.toggle("dim", i !== WIN)); tiles[WIN].classList.add("winner"); ov.classList.add("done");
        const r = tiles[WIN].getBoundingClientRect(), d = +cv.dataset.d; for (let i = 0; i < 90; i++) { const a = rnd(0, 6.283), v = rnd(200, 900) * d; parts.push({ x: (r.left + r.width / 2) * d, y: (r.top + r.height / 2) * d, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 250 * d, l: rnd(.8, 1.8), t: 0, s: rnd(5, 12) * d, c: Math.random() < .6 ? col : "#fff" }); }
        ov.querySelector("#cf-skip").hidden = true; ov.querySelector("#cf-ok").hidden = false;
        const n = unopened(); if (n > 0) { const b = ov.querySelector("#cf-more"); b.hidden = false; b.textContent = "Abrir otro  X " + n; }
      }
      const close = (again) => { cancelAnimationFrame(raf); removeEventListener("resize", fit); ov.classList.remove("on"); document.body.classList.remove("cf-lock"); setTimeout(() => ov.remove(), 350); done(); if (again) setTimeout(open, 400); };
      ov.querySelector("#cf-skip").onclick = () => { if (phase < 2) { phase = 2; t0 = performance.now(); ov.classList.add("roll"); startRoll(); } strip.style.transition = "none"; const w = win.clientWidth; strip.style.transform = `translateX(${-(WIN * (TW + GAP) + TW / 2 - w / 2)}px)`; reveal(); };
      ov.querySelector("#cf-ok").onclick = () => close(false); ov.querySelector("#cf-more").onclick = () => close(true);
      addEventListener("keydown", function k(e) { if (!ov.isConnected) return removeEventListener("keydown", k); if (e.key === "Escape" && finished) close(false); });
      raf = requestAnimationFrame(frame);
    });
  }

  /* ---- panel del perfil (a la izquierda) ---- */
  function mount(host) {
    if (!host) return; const n = unopened(), adm = Mercado.isAdmin();
    host.innerHTML = `<div class="cf-panel${n ? " has" : ""}"><canvas width="96" height="96" class="cf-mini"></canvas>${n > 1 ? `<span class="cf-x">X ${n}</span>` : ""}
      <b>Cofres del End</b><small>${n ? (n === 1 ? "Tienes 1 cofre" : "Tienes " + n + " cofres") : "Sube de nivel para ganar uno"}</small>
      <button class="btn solid mini" id="cf-open" type="button" ${n ? "" : "disabled"}>Abrir</button>${adm ? `<button class="btn mini" id="cf-edit" type="button">Editar premios</button>` : ""}</div>`;
    const cv = host.querySelector(".cf-mini"), c = cv.getContext("2d"); let a = 0; const draw = () => { if (!cv.isConnected) return; a += .05; c.clearRect(0, 0, 96, 96); if (n) { c.fillStyle = `rgba(59,224,138,${.18 + Math.sin(a) * .08})`; c.beginPath(); c.arc(48, 52, 40, 0, 6.283); c.fill(); } c.globalAlpha = n ? 1 : .45; drawChest(c, 8, 12 + (n ? Math.sin(a * 2) * 1.5 : 0), 5, 0, "#3be08a"); c.globalAlpha = 1; requestAnimationFrame(draw); }; draw();
    host.querySelector("#cf-open").onclick = open; const e = host.querySelector("#cf-edit"); if (e) e.onclick = editor;
  }

  /* ---- editor de premios (solo HOODSTUDIO) ---- */
  async function editor() {
    if (!Mercado.isAdmin()) return; await Mercado.loadShop(); await loadCfg(true);
    const items = Mercado.shopList(), rows = cfg.prizes.map(p => ({ ...p })), m = document.createElement("div"); m.className = "cf-ed";
    const render = () => {
      m.innerHTML = `<div class="cf-edbox"><button class="cf-edx" type="button">✕</button><h3>Premios del Cofre del End</h3><p class="muted">Cada fila es un premio posible. El peso decide qué tan seguido sale (más alto = más común). Monedas: entre 10 y 500.</p>
        <div class="cf-rows">${rows.map((r, i) => `<div class="cf-row" data-i="${i}">${r.type === "item"
          ? `<span>Item</span><select data-k="id">${items.map(it => `<option value="${esc(it.id)}"${it.id === r.id ? " selected" : ""}>${esc(it.name)}${it.hidden ? " (exclusivo)" : ""}</option>`).join("")}</select>`
          : `<span>Monedas</span><input data-k="min" type="number" min="10" max="500" value="${r.min}"><i>a</i><input data-k="max" type="number" min="10" max="500" value="${r.max}">`}
          <label>Peso <input data-k="w" type="number" min="1" max="1000" value="${r.w}"></label><button data-del type="button">✕</button></div>`).join("")}</div>
        <div class="cf-edb"><button class="btn mini" data-add="coins" type="button">+ Monedas</button><button class="btn mini" data-add="item" type="button">+ Item de la tienda</button><button class="btn solid mini" data-save type="button">Guardar</button></div><p class="err" id="cf-err"></p></div>`;
      m.querySelector(".cf-edx").onclick = () => m.remove();
      m.querySelectorAll(".cf-row").forEach(el => { const i = +el.dataset.i; el.querySelectorAll("[data-k]").forEach(inp => inp.onchange = () => { rows[i][inp.dataset.k] = inp.type === "number" ? Number(inp.value) : inp.value; }); el.querySelector("[data-del]").onclick = () => { rows.splice(i, 1); render(); }; });
      m.querySelector('[data-add="coins"]').onclick = () => { rows.push({ type: "coins", min: 10, max: 50, w: 10 }); render(); };
      m.querySelector('[data-add="item"]').onclick = () => { if (!items.length) return; rows.push({ type: "item", id: items[0].id, w: 3 }); render(); };
      m.querySelector("[data-save]").onclick = async () => {
        const err = m.querySelector("#cf-err"); err.textContent = ""; const coins = rows.filter(r => r.type === "coins");
        if (!rows.length) return void (err.textContent = "Agrega al menos un premio.");
        for (const r of rows) { if (!(Number(r.w) >= 1)) return void (err.textContent = "Todos los pesos deben ser 1 o más."); if (r.type === "coins" && !(r.min >= 10 && r.max <= 500 && r.min <= r.max)) return void (err.textContent = "Monedas: mínimo 10, máximo 500 y mínimo ≤ máximo."); }
        const data = { min: 10, max: 500, items: [...new Set(rows.filter(r => r.type === "item").map(r => r.id))], prizes: rows.map(r => r.type === "item" ? { type: "item", id: r.id, w: Math.floor(r.w) } : { type: "coins", min: Math.floor(r.min), max: Math.floor(r.max), w: Math.floor(r.w) }) };
        try { await setDoc(doc(db, "config", "chest"), data); cfg = data; m.remove(); alert("Premios guardados."); } catch (e) { err.textContent = "No se pudo guardar" + (e && e.code ? " (" + e.code + ")" : "") + ". ¿Publicaste las reglas nuevas?"; }
      };
    };
    render(); document.body.append(m);
  }
  return { unopened, pending, markSeen, updateDot, mount, open };
}
