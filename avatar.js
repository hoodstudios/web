/* avatar.js — Avatar "Drop" (pixel art de cuerpo completo hecho con los píxeles de la skin).
 *
 *   createAvatar(canvas, { skinSources, slim, name })  -> habitación de bloques con el avatar paseando solo
 *       .destroy()   .download()   .addFurniture(fn)
 *   loadSkin(sources)                                  -> Promise<Image|null>   (prueba cada fuente en orden)
 *   createFigureSet(img, { slim, k })                  -> fotogramas ya dibujados para usarlos en otros canvas (minijuego)
 *       .get(anim, i) -> { fig, gx, gy }   .k   .w   .feet
 *   ANIMS                                              -> idle, walk, jump, dance
 *
 * El personaje se ve siempre igual (estilo Drop por defecto): el único dato del jugador es su skin.
 */

/* ============================================================
 * NÚCLEO (dibujo del personaje)
 * ============================================================ */
function detectSlim(img) {
  if (img.height < img.width) return false;               // skins viejas 64×32: siempre Steve
  try {
    const f = img.width / 64, c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d", { willReadFrequently: true }); x.drawImage(img, 0, 0);
    return x.getImageData(54 * f, 20 * f, 1, 1).data[3] === 0 && x.getImageData(55 * f, 20 * f, 1, 1).data[3] === 0;
  } catch (e) { return false; }                           // imagen "tainted" (sin CORS): no se puede leer
}
/* Cabeza grande (1 píxel de skin = 2 unidades) y cuerpo mini (1 píxel = 1 unidad). Unidad de dibujo u = 1 píxel
 * del cuerpo; k = píxeles de pantalla por unidad. Una pose son desplazamientos [dx, dy] por parte. */
function buildFigure(img, o, k) {
  const PX = 3, PT = 2, PB = 1;                                 // margen (en u) para que las partes puedan moverse sin recortarse
  const P = o.pose || {}, pp = n => P[n] || [0, 0];             // pose: h, t, aL, aR, lL, lR
  const f = img.width / 64, legacy = img.height < img.width;
  const slim = o.arms === "slim" || (o.arms === "auto" && detectSlim(img)), aw = slim ? 3 : 4;
  const E = o.style === "drop" ? 16 * o.depth / 100 : 0, ox = (26 - (16 + E)) / 2 + PX;
  const fig = document.createElement("canvas"); fig.width = (26 + 2 * PX) * k; fig.height = (24 + PT + PB) * k;
  fig.padT = PT * k; fig.padB = PB * k;
  const c = fig.getContext("2d"); c.imageSmoothingEnabled = false; c.translate(0, PT * k);
  const X = x => Math.round((x + ox) * k);
  const part = (n, fn) => { const d = pp(n); c.save(); c.translate(Math.round(d[0] * k), Math.round(d[1] * k)); fn(); c.restore(); };
  const flip = (x, w, mirror, fn) => { c.save(); if (mirror) { c.translate(X(x) * 2 + Math.round(w * k), 0); c.scale(-1, 1); } fn(); c.restore(); };
  const head = (sx, sy, w, x, dw) => c.drawImage(img, sx * f, sy * f, w * f, 8 * f, X(x), 0, Math.round(dw * k), 16 * k);
  const strips = (sx, sy, w, x, y, dw, n, mirror) => flip(x, dw, mirror, () => {    // 12 filas de skin -> n filas
    for (let i = 0; i < n; i++) c.drawImage(img, sx * f, (sy + Math.round(i * 11 / (n - 1))) * f, w * f, f, X(x), (y + i) * k, Math.round(dw * k), k);
  });
  if (E > 0) {                                                  // 1) caras laterales (detrás de las frontales)
    const side = (u, ov, x, y, n, w = E) => {
      strips(u[0], u[1], 4, x, y, w, n);
      if (o.hat && ov) strips(ov[0], ov[1], 4, x, y, w, n);
      const x0 = X(x), W = Math.round(w * k), g = c.createLinearGradient(x0, 0, x0 + W, 0);
      g.addColorStop(0, "rgba(0,0,0,.25)"); g.addColorStop(1, "rgba(0,0,0,.6)");
      c.save(); c.globalCompositeOperation = "source-atop"; c.fillStyle = g; c.fillRect(x0, y * k, W, n * k); c.restore();
    };
    const armSide = () => part("aR", () => side(legacy ? [40, 20] : [40, 52], legacy ? null : [56, 52], 17, 16, 5, E - 2));
    part("lR", () => side(legacy ? [0, 20] : [24, 52], legacy ? null : [8, 52], 14, 20, 3, 2));
    part("t", () => side([28, 20], legacy ? null : [28, 36], 14, 16, 4, 2));
    if (!P.front) armSide();
    part("h", () => {
      const x0 = X(16), W = Math.round(E * k);
      head(16, 8, 8, 16, E); if (o.hat) head(48, 8, 8, 16, E);
      const g = c.createLinearGradient(x0, 0, x0 + W, 0); g.addColorStop(0, "rgba(0,0,0,.25)"); g.addColorStop(1, "rgba(0,0,0,.6)");
      c.save(); c.globalCompositeOperation = "source-atop"; c.fillStyle = g; c.fillRect(x0, 0, W, 16 * k); c.restore();
    });
    if (P.front) armSide();
  }
  [0, 1].forEach(L => {                                         // 2) caras frontales: capa base y exterior
    if (L && !o.hat) return;
    const dy = L ? 16 : 0, full = !(L && legacy);
    const arms = () => {
      if (!full) return;
      part("aL", () => strips(44, 20 + dy, aw, 0, 16, 3, 5));
      part("aR", () => strips(legacy ? 44 : (L ? 52 : 36), legacy ? 20 : 52, aw, 14, 16, 3, 5, legacy));
    };
    if (full) {
      part("lL", () => strips(4, 20 + dy, 4, 3, 20, 6, 3));
      part("lR", () => strips(legacy ? 4 : (L ? 4 : 20), legacy ? 20 : 52, 4, 8.5, 20, 5.5, 3, legacy));
      part("t", () => strips(20, 20 + dy, 8, 3, 16, 11, 4));
      if (!P.front) arms();
    }
    part("h", () => {
      head(8 + (L ? 32 : 0), 8, 8, 0, 16);
      if (!L) {                                                   // ojos más juntos
        const cell = (cx, r, xb, wb) => c.drawImage(img, (8 + cx) * f, (8 + r) * f, f, f, X(xb), 2 * r * k, Math.round(wb * k), 2 * k);
        for (const r of [4, 5]) {
          cell(0, r, 2, .5); cell(7, r, 13.5, .5);
          c.drawImage(img, 9 * f, (8 + r) * f, 2 * f, f, X(2.5), 2 * r * k, 4 * k, 2 * k);
          c.drawImage(img, 13 * f, (8 + r) * f, 2 * f, f, X(9.5), 2 * r * k, 4 * k, 2 * k);
        }
      }
    });
    if (full && P.front) arms();
  });
  fig.headX = ox * k;
  return fig;
}
/* Imagen cuadrada del avatar con fondo, sombra… (la que se descarga). */
function renderAvatar(img, o) {
  const S = o.size, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d"); c.imageSmoothingEnabled = false;
  c.beginPath(); if (c.roundRect) c.roundRect(0, 0, S, S, S * o.radius / 100); else c.rect(0, 0, S, S); c.clip();
  if (o.bg === "solid") { c.fillStyle = o.c1; c.fillRect(0, 0, S, S); }
  if (o.bg === "grad") { const g = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * .72); g.addColorStop(0, o.c1); g.addColorStop(1, o.c2); c.fillStyle = g; c.fillRect(0, 0, S, S); }
  const k = Math.max(1, Math.floor(S * o.fill / 100 / 26));
  const fig = buildFigure(img, o, k), w = fig.width, h = fig.height, fh = h - fig.padT - fig.padB;
  const x = Math.round((S - w) / 2), y = Math.round((S - fh) / 2) - fig.padT;
  const tint = col => { const m = document.createElement("canvas"); m.width = w; m.height = h; const t = m.getContext("2d"); t.drawImage(fig, 0, 0); t.globalCompositeOperation = "source-in"; t.fillStyle = col; t.fillRect(0, 0, w, h); return m; };
  c.save();
  if (o.flip) { c.translate(S, 0); c.scale(-1, 1); }
  if (o.shadow) {
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(S / 2, y + fig.padT + fh + k * .5, k * 10, k * 2, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(tint("rgba(0,0,0,.4)"), x + k, y + 2 * k);
  }
  c.drawImage(fig, x, y);
  c.restore();
  return cv;
}

/* ===================== Animaciones =====================
 * Cada fotograma es una pose: desplazamientos [dx, dy] en u por parte: h (cabeza), t (torso), aL / aR (brazos),
 * lL / lR (piernas), más gx / gy (todo el personaje). front:true dibuja los brazos por delante de la cabeza. */
const M = (...a) => Object.assign({}, ...a);
const U = n => ({ h: [0, n], t: [0, n], aL: [0, n], aR: [0, n] });
const UP = (dx, l, r = l) => ({ aL: [-dx, l], aR: [dx, r], front: true });
const TUCK = { lL: [0, -1], lR: [0, -1] };
const AIR = (gy, a, dx = 3) => M({ gy }, TUCK, UP(dx, a));
export const ANIMS = {
  idle: { fps: 3, frames: [{}, {}, U(1), U(1)] },
  walk: { fps: 8, frames: [
    M({ lL: [0, -1], aR: [0, -1], aL: [0, 1] }), U(1),
    M({ lR: [0, -1], aL: [0, -1], aR: [0, 1] }), U(1)] },
  jump: { fps: 12, frames: [
    U(1), U(2), M({ gy: -2 }, UP(1, -3)), AIR(-4, -6), AIR(-5, -7), AIR(-5, -7), AIR(-4, -6),
    M({ gy: -2 }, TUCK, UP(2, -3)), M({ gy: -1 }, UP(0, 0)), U(2), U(1), {}] },
  dance: { fps: 6, frames: [
    M({ gx: -1, h: [-1, 0], aL: [-3, -6], aR: [0, 1], lL: [0, -1], front: true }), M(U(1), { gx: -1 }),
    M({ gx: 1, h: [1, 0], aR: [3, -6], aL: [0, 1], lR: [0, -1], front: true }), M(U(1), { gx: 1 })] }
};

/* Fotogramas del personaje ya dibujados (se crean la primera vez que se piden). */
export function createFigureSet(img, { slim = false, k = 3 } = {}) {
  const base = { style: "drop", depth: 50, arms: slim ? "slim" : "auto", hat: true };
  const cache = new Map();
  return {
    k, w: 32 * k, feet: 25 * k,                                  // ancho del lienzo y fila (px) donde apoyan los pies
    get(anim, i = 0) {
      const a = ANIMS[anim], n = a ? a.frames.length : 1, j = ((i % n) + n) % n, key = anim + ":" + j, pose = a ? a.frames[j] : {};
      let fig = cache.get(key);
      if (!fig) { fig = buildFigure(img, M(base, { pose }), k); cache.set(key, fig); }
      return { fig, gx: (pose.gx || 0) * k, gy: (pose.gy || 0) * k };
    }
  };
}

/* ============================================================
 * CARGA DE SKINS
 * ============================================================ */
const validSkin = i => i.width % 64 === 0 && (i.height === i.width || i.height * 2 === i.width);
function loadImg(src, cors) {
  return new Promise((ok, no) => {
    const i = new Image(); if (cors) i.crossOrigin = "anonymous";
    i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
  });
}
/* Prueba las fuentes en orden. Las de internet se piden primero con CORS (para poder leerlas y descargar el PNG)
 * y, si el servidor no lo permite, sin CORS (se ve igual, pero no se podrá exportar). */
export async function loadSkin(sources) {
  for (const s of sources) {
    for (const cors of /^https?:/.test(s) ? [true, false] : [false]) {
      try { const i = await loadImg(s, cors); if (validSkin(i)) return i; } catch (e) { /* siguiente */ }
    }
  }
  return null;
}

/* ============================================================
 * HABITACIÓN DE BLOQUES
 * ============================================================ */
const BLK = 48, COLS = 10, ROWS = 6, WALL_ROWS = 3;     // bloque = 16 px de textura × 3
const W = COLS * BLK, H = ROWS * BLK, WALL = WALL_ROWS * BLK, K = 3;
const MINX = BLK + 50, MAXX = W - BLK - 50, MINY = WALL + 34, MAXY = H - 14;   // zona del suelo por la que puede pasear (pies)
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const rnd = (a, b) => a + Math.random() * (b - a);

export function createAvatar(canvas, { skinSources = [], slim = false, name = "avatar" } = {}) {
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.imageSmoothingEnabled = false;
  let img = null, set = null, bg = null, raf = 0, last = 0, alive = true;
  const furniture = [], hearts = [];
  const st = { mode: "idle", x: W / 2, y: (WALL + H) / 2 + 8, tx: 0, ty: 0, flip: false, t: 0, a: 0, next: 1.2, dur: 0 };

  /* ---------- Escenario: suelo de madera y paredes de cemento blanco, todo en bloques ---------- */
  function buildBg(wood, conc) {
    const b = document.createElement("canvas"); b.width = W; b.height = H;
    const x = b.getContext("2d"); x.imageSmoothingEnabled = false;
    const tile = (tex, col, row, fb, edge) => {
      if (tex && tex.naturalWidth) x.drawImage(tex, col * BLK, row * BLK, BLK, BLK); else { x.fillStyle = fb; x.fillRect(col * BLK, row * BLK, BLK, BLK); }
      x.fillStyle = edge; x.fillRect(col * BLK, row * BLK + BLK - 2, BLK, 2); x.fillRect(col * BLK + BLK - 2, row * BLK, 2, BLK);   // borde del bloque
    };
    for (let r = 0; r < ROWS; r++) for (let q = 0; q < COLS; q++) {
      const side = q === 0 || q === COLS - 1;
      if (r < WALL_ROWS || side) tile(conc, q, r, "#cfd5d6", "rgba(0,0,0,.10)");
      else tile(wood, q, r, "#82613a", "rgba(0,0,0,.28)");
    }
    x.fillStyle = "rgba(0,0,0,.2)"; x.fillRect(0, 0, BLK, H); x.fillRect(W - BLK, 0, BLK, H);            // paredes laterales: un poco más oscuras
    let g = x.createLinearGradient(0, WALL, 0, WALL + 26); g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(BLK, WALL, W - 2 * BLK, 26);                                              // sombra de la pared sobre el suelo
    for (const [x0, dir] of [[BLK, 1], [W - BLK, -1]]) {
      g = x.createLinearGradient(x0, 0, x0 + dir * 22, 0); g.addColorStop(0, "rgba(0,0,0,.3)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(dir > 0 ? x0 : x0 - 22, 0, 22, H);                                      // esquinas
    }
    g = x.createLinearGradient(0, 0, 0, WALL); g.addColorStop(0, "rgba(0,0,0,.12)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(BLK, 0, W - 2 * BLK, WALL);                                               // un toque de luz en la pared
    return b;
  }
  const tex = src => loadImg(src, false).catch(() => null);
  Promise.all([tex("img/madera.png"), tex("img/cemento-blanco.png")]).then(([w, cc]) => { if (alive) bg = buildBg(w, cc); });
  const defaultBg = () => { c.fillStyle = "#cfd5d6"; c.fillRect(0, 0, W, WALL); c.fillStyle = "#82613a"; c.fillRect(0, WALL, W, H - WALL); };

  /* ---------- Comportamiento ---------- */
  function setMode(m) {
    st.mode = m; st.t = 0; st.a = 0;
    if (m === "idle") st.next = rnd(1.6, 4.2);
    if (m === "dance") st.dur = (ANIMS.dance.frames.length / ANIMS.dance.fps) * (3 + Math.floor(Math.random() * 3));
  }
  function walkTo() {
    for (let i = 0; i < 8; i++) {                                // destino al azar, que no quede demasiado cerca
      st.tx = Math.round(rnd(MINX, MAXX)); st.ty = Math.round(rnd(MINY, MAXY));
      if (Math.hypot(st.tx - st.x, st.ty - st.y) > 70) break;
    }
    setMode("walk");
  }
  function pick() {
    const r = Math.random();
    if (r < .6) walkTo(); else if (r < .8) setMode("dance"); else setMode("idle");
  }
  function update(dt) {
    st.t += dt;
    for (const h of hearts) { h.y -= 34 * dt; h.l -= dt; }
    while (hearts.length && hearts[0].l <= 0) hearts.shift();
    if (st.mode === "walk") {
      const dx = st.tx - st.x, dy = st.ty - st.y, d = Math.hypot(dx, dy), step = 54 * dt;
      if (Math.abs(dx) > 1) st.flip = dx > 0;                    // izquierda = sin voltear, derecha = volteado
      if (d <= step) { st.x = st.tx; st.y = st.ty; setMode("idle"); }
      else { st.x += dx / d * step; st.y += dy / d * step; st.a += dt * ANIMS.walk.fps; }
    } else if (st.mode === "dance") {
      st.a += dt * ANIMS.dance.fps; if (st.t > st.dur) setMode("idle");
    } else if (st.mode === "jump") {
      st.a += dt * ANIMS.jump.fps * .75;                         // salto al tocarlo: velocidad 0,75
      if (st.a >= ANIMS.jump.frames.length) setMode("idle");
    } else {
      st.a += dt * ANIMS.idle.fps; if (st.t > st.next) pick();
    }
  }

  /* ---------- Dibujo ---------- */
  function drawHeart(x, y, a) {
    c.globalAlpha = Math.max(0, Math.min(1, a));
    HEART.forEach((row, j) => [...row].forEach((v, i) => {
      if (v !== "1") return;
      c.fillStyle = i === 1 && j === 1 ? "#ff9db0" : "#ff4d6d"; c.fillRect(x + i * K, y + j * K, K, K);
    }));
    c.globalAlpha = 1;
  }
  function render() {
    c.clearRect(0, 0, W, H);
    if (bg) c.drawImage(bg, 0, 0); else defaultBg();
    for (const f of furniture) f(c, { W, H, BLK, WALL });
    if (set) {
      const anim = st.mode === "walk" ? "walk" : st.mode === "dance" ? "dance" : st.mode === "jump" ? "jump" : "idle";
      const n = ANIMS[anim].frames.length, i = anim === "jump" ? Math.min(n - 1, Math.floor(st.a)) : Math.floor(st.a) % n;
      const { fig, gx, gy } = set.get(anim, i), x = Math.round(st.x), y = Math.round(st.y);
      const sc = Math.max(.55, 1 + gy / (K * 14));                // la sombra del suelo se encoge al saltar
      c.fillStyle = "rgba(0,0,0,.3)"; c.beginPath(); c.ellipse(x, y + 1, K * 8 * sc, K * 2 * sc, 0, 0, Math.PI * 2); c.fill();
      c.save(); c.translate(x, 0); if (st.flip) c.scale(-1, 1);
      c.drawImage(fig, Math.round(-set.w / 2) + gx, y - set.feet + gy);
      c.restore();
    }
    for (const h of hearts) drawHeart(Math.round((h.x + Math.sin(h.l * 5 + h.p) * 5) / K) * K, Math.round(h.y / K) * K, h.l / .5);
  }
  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); render(); raf = requestAnimationFrame(frame);
  }

  /* ---------- Interacción: tocarlo = corazones + salto (el avatar ya no se controla con el clic) ---------- */
  const onAvatar = e => {
    if (!set) return false;
    const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    return Math.abs(x - st.x) < 38 && y > st.y - set.feet + 6 - 10 && y < st.y + 6;
  };
  function onDown(e) {
    if (e.button) return;
    if (!onAvatar(e)) return;
    e.preventDefault();
    for (let i = 0; i < 4; i++) hearts.push({ x: st.x - 30 + i * 20 + rnd(-4, 4), y: st.y - set.feet - 4 - rnd(0, 22), l: rnd(1.0, 1.5), p: rnd(0, 6) });
    if (st.mode !== "jump") setMode("jump");
  }
  const onMove = e => { canvas.style.cursor = onAvatar(e) ? "pointer" : "default"; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);

  /* ---------- Arranque ---------- */
  loadSkin(skinSources).then(i => {
    if (!alive || !i) return;
    img = i; set = createFigureSet(i, { slim, k: K });
  });
  raf = requestAnimationFrame(frame);

  /* Descarga el avatar tal cual se ve por defecto en el generador (cuerpo completo, degradado dorado). */
  function download() {
    if (!img) return;
    try {
      const cv = renderAvatar(img, { size: 512, style: "drop", depth: 50, arms: slim ? "slim" : "auto", hat: true, flip: false, fill: 80,
        shadow: true, bg: "grad", c1: "#f7b41e", c2: "#000000", radius: 0 });
      cv.toBlob(b => {
        if (!b) return;
        const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name + "-avatar.png"; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    } catch (e) { console.warn("No se pudo exportar el avatar:", e); }
  }

  return {
    destroy() { alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); },
    addFurniture(fn) { furniture.push(fn); },
    download
  };
}
