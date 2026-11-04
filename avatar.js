/* avatar.js — Avatar 3D animado generado a partir de la skin de Minecraft.
 * Estilo "Minecraft Live": cabezota girada en 3D y cuerpo pequeño.
 *
 * Sin librerías ni sprites: el modelo son 6 cajas (cabeza, torso, 2 brazos, 2 piernas) cuyas
 * caras se recortan de la textura de la skin y se proyectan en un canvas 2D con transformaciones
 * afines. Eso permite girar el modelo, ver el costado de la cabeza y animar caminar, saludar, etc.
 *
 * Uso: const a = createAvatar(canvas, { skinSources: [url1, url2...], slim: false });
 *      a.destroy();   // al salir de la página del perfil
 * Ganchos para la futura tienda: a.setHat(fn), a.addFurniture(fn)
 */
const W = 480, H = 300;       // tamaño interno del canvas
const WALL = 235, FEET = 262; // fin de la pared y altura de los pies
const PX = 5;                 // píxeles de canvas por unidad del modelo
const BODY = 0.8;             // escala del cuerpo
const HEAD = 2.4;             // escala de la cabeza (cabezota)
const P = BODY * PX;          // px por unidad en el cuerpo
const HK = HEAD / BODY;       // la cabeza se agranda respecto al cuerpo
const CH = 24 * P + 8 * P * HK; // altura total en px

/* ---------- Matemática 3×3 mínima ---------- */
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mul = (A, B) => { const R = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return R; };
const app = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const LIGHT = (() => { const l = [-0.35, 0.75, 0.55], n = Math.hypot(...l); return l.map(x => x / n); })();

const loadImg = src => new Promise((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
});
async function loadFirst(list) {
  for (const s of list) { try { return await loadImg(s); } catch (e) { /* prueba la siguiente */ } }
  return null;
}
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];

/* Geometría de cada cara de una caja: [esquina superior-izquierda, vector U (textura →), vector V (textura ↓)] */
function geom(name, X0, X1, Y0, Y1, Z0, Z1) {
  const w = X1 - X0, h = Y1 - Y0, d = Z1 - Z0;
  switch (name) {
    case "front": return [[X0, Y1, Z1], [w, 0, 0], [0, -h, 0]];
    case "back":  return [[X1, Y1, Z0], [-w, 0, 0], [0, -h, 0]];
    case "right": return [[X0, Y1, Z0], [0, 0, d], [0, -h, 0]];  // costado −x
    case "left":  return [[X1, Y1, Z1], [0, 0, -d], [0, -h, 0]]; // costado +x
    default:      return [[X0, Y1, Z0], [w, 0, 0], [0, 0, d]];   // top
  }
}

export function createAvatar(canvas, { skinSources = [], slim = false } = {}) {
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.imageSmoothingEnabled = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let img = null, shades = [], status = "loading", raf = 0, last = 0, time = 0, alive = true, look = null;
  const items = { hat: null, furniture: [] };
  const hearts = [];
  const st = { mode: "idle", t: 0, x: W / 2, tx: W / 2, dir: 0, phase: 0, next: 1.2, yaw: -0.35 };

  /* ---------- Dibujo de una cara texturizada ---------- */
  function face(T, part, name, inf, tex) {
    const [bx, by, bz, w, h, d] = part.box;
    const X0 = bx - inf, X1 = bx + w + inf, Y0 = by - inf, Y1 = by + h + inf, Z0 = bz - inf, Z1 = bz + d + inf;
    const [u, v] = tex;
    const R = { top: [u + d, v, w, d], right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h] };
    const mir = part.mirror;
    const reg = R[mir ? (name === "left" ? "right" : name === "right" ? "left" : name) : name];
    const [P0, U, V] = geom(name, X0, X1, Y0, Y1, Z0, Z1);
    const A0 = T(P0), B0 = T(add(P0, U)), C0 = T(add(P0, V));
    const n = cross(sub(C0.q, A0.q), sub(B0.q, A0.q)), nl = Math.hypot(n[0], n[1], n[2]) || 1;
    if (n[2] / nl < 0.03) return;                     // cara de espaldas o de canto: no se dibuja
    let A = A0, B = B0, C = C0;
    if (mir) { A = B0; B = A0; C = T(add(add(P0, U), V)); } // espejo para skins antiguas (64×32)
    const dot = (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl;
    const lvl = Math.min(3, Math.round(Math.max(0, 0.55 - dot) * 0.45 / 0.1)); // la cara de frente conserva los colores originales
    const k = img.width / 64, sw = reg[2], sh = reg[3];
    c.setTransform((B.x - A.x) / sw, (B.y - A.y) / sw, (C.x - A.x) / sh, (C.y - A.y) / sh, A.x, A.y);
    c.drawImage(shades[lvl], reg[0] * k, reg[1] * k, sw * k, sh * k, 0, 0, sw, sh);
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- Modelo ---------- */
  function buildParts(po) {
    const aw = slim ? 3 : 4, legacy = img.height < img.width; // 64×32 = formato antiguo
    const pr = (id, box, tex, ov, inf, pivot, R, extra = {}) => ({ id, box, tex, ov, inf, pivot, R, ...extra });
    const hd = po.head, hr = mul(rotZ(hd.r), mul(rotX(hd.p), rotY(hd.y)));
    const bobU = po.bob, bobL = po.bobAll ? po.bob : 0;
    return [
      pr("legR", [-4, 0, -2, 4, 12, 4], [0, 16], [0, 32], 0.25, [-2, 12, 0], rotX(po.lR), { bob: bobL }),
      pr("legL", [0, 0, -2, 4, 12, 4], legacy ? [0, 16] : [16, 48], legacy ? null : [0, 48], 0.25, [2, 12, 0], rotX(po.lL), { bob: bobL, mirror: legacy }),
      pr("body", [-4, 12, -2, 8, 12, 4], [16, 16], legacy ? null : [16, 32], 0.25, [0, 12, 0], rotX(0), { bob: bobU }),
      pr("armR", [-4 - aw, 12, -2, aw, 12, 4], [40, 16], legacy ? null : [40, 32], 0.25, [-4 - aw / 2, 22, 0], mul(rotZ(po.aR.b), rotX(po.aR.a)), { bob: bobU, bias: po.aR.b < -1.2 ? 60 : 0 }),
      pr("armL", [4, 12, -2, aw, 12, 4], legacy ? [40, 16] : [32, 48], legacy ? null : [48, 48], 0.25, [4 + aw / 2, 22, 0], mul(rotZ(po.aL.b), rotX(po.aL.a)), { bob: bobU, mirror: legacy }),
      pr("head", [-4, 24, -4, 8, 8, 8], [0, 0], legacy ? null : [32, 0], 0.5, [0, 24, 0], hr, { bob: bobU, head: true })
    ];
  }

  function drawModel(po) {
    const cam = mul(rotX(0.2), rotY(po.yaw)), lean = rotZ(po.lean);
    const cx = Math.round(st.x), cy = FEET - po.jump;
    const parts = buildParts(po);
    for (const part of parts) {
      const pv = part.pivot, R = part.R;
      part.T = p => {
        let q = app(R, sub(p, pv)); q = add(q, pv);
        if (part.head) q = [q[0] * HK, 24 + (q[1] - 24) * HK, q[2] * HK];
        q[1] += part.bob;
        q = app(cam, app(lean, q));
        return { x: cx + q[0] * P, y: cy - q[1] * P, q };
      };
      const [bx, by, bz, w, h, d] = part.box;
      part.depth = part.T([bx + w / 2, by + h / 2, bz + d / 2]).q[2] + (part.bias || 0);
    }
    parts.sort((a, b) => a.depth - b.depth); // de lejos a cerca
    for (const part of parts) {
      for (const f of ["top", "front", "back", "right", "left"]) face(part.T, part, f, 0, part.tex);
      if (part.ov) for (const f of ["top", "front", "back", "right", "left"]) face(part.T, part, f, part.inf, part.ov);
    }
    if (items.hat) { const t = parts.find(q => q.head).T([0, 32, 0]); items.hat(c, { x: t.x, y: t.y, k: P * HK, yaw: po.yaw, roll: po.head.r }, time); }
  }

  /* ---------- Poses por estado ---------- */
  function pose() {
    const po = { yaw: st.yaw, lean: 0, bob: 0, bobAll: false, jump: 0, lR: 0, lL: 0,
      head: { y: 0, p: 0, r: 0 }, aR: { a: 0, b: -0.06 }, aL: { a: 0, b: 0.06 } };
    const breathe = Math.sin(time * 2.2);
    if (st.mode === "idle") {
      po.bob = breathe * 0.22;
      if (!reduce) po.yaw += Math.sin(time * 0.6) * 0.1;
      po.head.y = look !== null ? Math.max(-0.7, Math.min(0.7, (look - st.x) / 220)) - po.yaw * 0.3 : (reduce ? 0 : Math.sin(time * 0.9) * 0.25);
      po.head.r = Math.sin(time * 1.3) * 0.03;
      po.aR.b -= breathe * 0.02; po.aL.b += breathe * 0.02;
    } else if (st.mode === "walk") {
      const s = Math.sin(st.phase);
      po.lR = s * 0.6; po.lL = -s * 0.6; po.aR.a = -s * 0.5; po.aL.a = s * 0.5;
      po.bob = Math.abs(s) * 0.5; po.bobAll = true;
      po.head.y = -st.yaw * 0.45; po.lean = -st.dir * 0.03;
    } else if (st.mode === "wave") {
      const k = Math.max(0, Math.min(1, st.t / 0.25, (1.8 - st.t) / 0.25));
      po.aR.b = -(0.06 + 2.4 * k) - Math.sin(time * 12) * 0.25 * k;
      po.head.r = 0.08 * k; po.head.y = -st.yaw * 0.5; po.bob = breathe * 0.2;
    } else if (st.mode === "jump") {
      const p = Math.min(1, st.t / 0.7), s = Math.sin(Math.PI * p);
      po.jump = s * 50; po.lR = po.lL = -s * 0.5;
      po.aR.b = -0.06 - 0.8 * s; po.aL.b = 0.06 + 0.8 * s;
      po.head.y = -st.yaw * 0.5; po.head.p = -0.15 * s;
      if (p > 0.85) po.bob = -0.5; // pequeño "aplastón" al caer
    }
    return po;
  }

  /* ---------- Comportamiento ---------- */
  const targetYaw = () => st.mode === "walk" ? (st.dir >= 0 ? 1.3 : -1.3) : st.mode === "wave" ? -0.12 : st.mode === "jump" ? -0.2 : -0.35;
  function go(m) { st.mode = m; st.t = 0; if (m === "idle") { st.dir = 0; st.next = 1.5 + Math.random() * 2.5; } }
  function walkTo(x) { st.tx = Math.max(80, Math.min(W - 80, x)); st.dir = Math.sign(st.tx - st.x) || 1; if (Math.abs(st.tx - st.x) > 6) go("walk"); }
  function pick() {
    if (reduce) { st.next = 2; st.t = 0; return; } // con "reducir movimiento" solo reacciona a tus clics
    const r = Math.random();
    if (r < 0.5) walkTo(100 + Math.random() * (W - 200));
    else if (r < 0.7) go("wave");
    else if (r < 0.85) go("jump");
    else go("idle");
  }
  function update(dt) {
    time += dt; st.t += dt;
    st.yaw += (targetYaw() - st.yaw) * Math.min(1, dt * 7);
    for (const h of hearts) { h.y -= 34 * dt; h.l -= dt; }
    while (hearts.length && hearts[0].l <= 0) hearts.shift();
    if (st.mode === "walk") {
      const dx = st.tx - st.x, step = 42 * dt; st.dir = Math.sign(dx) || st.dir;
      if (Math.abs(dx) <= step) { st.x = st.tx; go("idle"); } else { st.x += st.dir * step; st.phase += dt * 9; }
    } else if (st.mode === "wave" && st.t > 1.8) go("idle");
    else if (st.mode === "jump" && st.t > 0.7) go("idle");
    else if (st.mode === "idle" && st.t > st.next) pick();
  }

  /* ---------- Escenario ---------- */
  function drawRoom() {
    c.fillStyle = "#0b0904"; c.fillRect(0, 0, W, WALL);
    c.fillStyle = "rgba(247,180,30,.05)"; for (let x = 0; x < W; x += 48) c.fillRect(x, 0, 2, WALL);
    c.fillStyle = "#3a2a0a"; c.fillRect(0, WALL - 8, W, 8);
    c.fillStyle = "#17110a"; c.fillRect(0, WALL, W, H - WALL);
    c.fillStyle = "rgba(247,180,30,.1)";
    for (let y = WALL + 20, r = 0; y < H; y += 22, r++) {
      c.fillRect(0, y, W, 2);
      for (let x = (r % 2) * 40; x < W; x += 80) c.fillRect(x, y - 22, 2, 22);
    }
    for (const f of items.furniture) f(c, { S: PX, time, W, H, floor: FEET });
  }
  function drawHeart(x, y, a) {
    c.globalAlpha = Math.max(0, Math.min(1, a)); c.fillStyle = "#ff5a7a";
    HEART.forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") c.fillRect(Math.round(x + i * 3), Math.round(y + j * 3), 3, 3); }));
    c.globalAlpha = 1;
  }
  function msg(t) {
    c.fillStyle = "#a89a70"; c.font = "500 16px Barlow, sans-serif"; c.textAlign = "center"; c.fillText(t, W / 2, FEET - 40);
  }
  function render() {
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = false;
    drawRoom();
    if (!img) { msg(status === "fail" ? "No se pudo cargar la skin" : "Cargando avatar…"); return; }
    const po = pose(), lift = Math.min(1, po.jump / 50);
    c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath();
    c.ellipse(Math.round(st.x), FEET + 2, 4 * HEAD * PX * 0.9 * (1 - lift * 0.4), 7 * (1 - lift * 0.4), 0, 0, Math.PI * 2); c.fill();
    drawModel(po);
    for (const h of hearts) drawHeart(h.x, h.y, h.l / 0.6);
  }

  /* ---------- Interacción ---------- */
  const toCanvas = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  function onDown(e) {
    if (!img) return;
    e.preventDefault();
    const [x, y] = toCanvas(e);
    const onHer = Math.abs(x - st.x) < 4 * HEAD * PX && y > FEET - CH && y < FEET + 8;
    if (onHer) { // caricia: salta o saluda, y salen corazones
      go(Math.random() < 0.5 ? "jump" : "wave");
      for (let i = 0; i < 3; i++) hearts.push({ x: st.x - 12 + i * 14 + Math.random() * 6, y: FEET - CH - 36 - i * 12, l: 1.4 });
    } else walkTo(x);
  }
  const onMove = e => { look = toCanvas(e)[0]; };
  const onLeave = () => { look = null; };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);

  /* ---------- Arranque ---------- */
  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); render(); raf = requestAnimationFrame(frame);
  }
  loadFirst(skinSources).then(i => {
    if (!alive) return;
    img = i; status = i ? "ok" : "fail";
    if (i) shades = [0, 0.1, 0.2, 0.3].map(a => { // la misma skin en 4 niveles de sombra (para dar volumen)
      const cv = document.createElement("canvas"); cv.width = i.width; cv.height = i.height;
      const x = cv.getContext("2d"); x.drawImage(i, 0, 0);
      if (a) { x.globalCompositeOperation = "source-atop"; x.fillStyle = `rgba(0,0,0,${a})`; x.fillRect(0, 0, cv.width, cv.height); }
      return cv;
    });
  });
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerleave", onLeave);
    },
    setHat(fn) { items.hat = fn; },
    addFurniture(fn) { items.furniture.push(fn); }
  };
}
