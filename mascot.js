/* mascot.js — Mascota animada generada a partir de la skin de Minecraft.
 * No usa sprites: recorta cabeza, torso, brazos y piernas de la textura de la skin
 * y las mueve en un canvas 2D (como un muñeco de papel).
 *
 * Uso: const m = createMascot(canvas, { skinSources: [url1, url2...], slim: false });
 *      m.destroy();   // al salir de la página del perfil
 * Ganchos para la futura tienda: m.setHat(fn), m.addFurniture(fn)
 */
const W = 480, H = 270;      // tamaño interno del canvas
const S = 5;                 // píxeles de canvas por cada píxel de skin
const WALL = 205, FEET = 232; // fin de la pared y altura de los pies

const loadImg = src => new Promise((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
});
async function loadFirst(list) {
  for (const s of list) { try { return await loadImg(s); } catch (e) { /* prueba la siguiente */ } }
  return null;
}
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];

export function createMascot(canvas, { skinSources = [], slim = false } = {}) {
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.imageSmoothingEnabled = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let img = null, status = "loading", raf = 0, last = 0, time = 0, alive = true;
  const items = { hat: null, furniture: [] };
  const hearts = [];
  const st = { mode: "idle", t: 0, x: W / 2, tx: W / 2, dir: 0, phase: 0, next: 1.2 };

  /* ---------- Dibujo de una parte de la skin ---------- */
  // (sx,sy,sw,sh) = recorte en unidades de skin 64×64; (px,py) = posición del pivote en unidades;
  // (ax,ay) = pivote dentro de la parte; rot = giro; ky = estiramiento vertical; flip = espejo
  function part(sx, sy, sw, sh, px, py, ax, ay, rot = 0, ky = 1, flip = false) {
    const k = img.width / 64;
    c.save();
    c.translate(Math.round(px * S), Math.round(py * S));
    c.rotate(rot); c.scale(flip ? -1 : 1, ky);
    c.drawImage(img, sx * k, sy * k, sw * k, sh * k, -ax * S, -ay * S, sw * S, sh * S);
    c.restore();
  }

  function drawChar(po) {
    const aw = slim ? 3 : 4, legacy = img.height < img.width; // 64×32 = formato antiguo
    c.save();
    c.translate(Math.round(st.x), FEET + Math.round(po.y * S));
    c.rotate(po.lean);

    // piernas (el personaje de frente: su pierna derecha queda a la izquierda del espectador)
    part(4, 20, 4, 12, -2, -12, 2, 0, 0, po.lR);
    if (!legacy) part(4, 36, 4, 12, -2, -12, 2, 0, 0, po.lR);
    if (legacy) part(4, 20, 4, 12, 2, -12, 2, 0, 0, po.lL, true);
    else { part(20, 52, 4, 12, 2, -12, 2, 0, 0, po.lL); part(4, 52, 4, 12, 2, -12, 2, 0, 0, po.lL); }

    c.translate(0, Math.round(po.bob * S)); // el torso respira / rebota; las piernas no
    // torso
    part(20, 20, 8, 12, 0, -24, 4, 0);
    if (!legacy) part(20, 36, 8, 12, 0, -24, 4, 0);
    // brazos (pivote en el hombro)
    const shoulder = -22;
    part(44, 20, aw, 12, -4 - aw / 2, shoulder, aw / 2, 2, po.aR, po.sR);
    if (!legacy) part(44, 36, aw, 12, -4 - aw / 2, shoulder, aw / 2, 2, po.aR, po.sR);
    if (legacy) part(44, 20, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL, true);
    else { part(36, 52, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL); part(52, 52, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL); }
    // cabeza (pivote en el cuello)
    part(8, 8, 8, 8, 0, -24, 4, 8, po.head);
    if (!legacy) part(40, 8, 8, 8, 0, -24, 4, 8, po.head);
    // sombrero (gancho para la tienda): origen en el cuello
    if (items.hat) { c.save(); c.translate(0, -24 * S); c.rotate(po.head); items.hat(c, S, time); c.restore(); }
    c.restore();
  }

  /* ---------- Poses por estado ---------- */
  function pose() {
    const po = { y: 0, bob: 0, lean: 0, head: 0, aR: 0.05, aL: -0.05, sR: 1, sL: 1, lR: 1, lL: 1 };
    const breathe = Math.sin(time * 2.2);
    if (st.mode === "idle") {
      po.bob = breathe * 0.35; po.head = Math.sin(time * 1.1) * 0.03;
      po.aR += breathe * 0.02; po.aL -= breathe * 0.02;
    } else if (st.mode === "walk") {
      const a = Math.sin(st.phase);
      po.lR = 1 - 0.28 * Math.max(0, a); po.lL = 1 - 0.28 * Math.max(0, -a); // la pierna que avanza se "acorta" (perspectiva)
      po.sR = 1 - 0.14 * Math.max(0, -a); po.sL = 1 - 0.14 * Math.max(0, a);
      po.bob = -Math.abs(a) * 0.9;
      po.aR += a * 0.14; po.aL += a * 0.14;
      po.lean = st.dir * 0.05; po.head = -st.dir * 0.04;
    } else if (st.mode === "wave") {
      const p = st.t / 1.8, k = Math.min(1, st.t / 0.25, (1.8 - st.t) / 0.25);
      const e = Math.max(0, k);
      po.aR = 0.05 + 2.4 * e + Math.sin(time * 12) * 0.22 * e;
      po.head = 0.08 * e; po.bob = breathe * 0.3;
    } else if (st.mode === "jump") {
      const p = Math.min(1, st.t / 0.7), s = Math.sin(Math.PI * p);
      po.y = -s * 16; po.lR = po.lL = 1 - 0.25 * s; po.aR = 0.05 + 0.7 * s; po.aL = -0.05 - 0.7 * s;
      if (p > 0.85) po.bob = 0.7; // pequeño "aplastón" al caer
    }
    return po;
  }

  /* ---------- Comportamiento ---------- */
  function go(m) { st.mode = m; st.t = 0; if (m === "idle") st.dir = 0, st.next = 1.5 + Math.random() * 2.5; }
  function walkTo(x) { st.tx = Math.max(70, Math.min(W - 70, x)); if (Math.abs(st.tx - st.x) > 6) go("walk"); }
  function pick() {
    const r = Math.random();
    if (r < 0.5) walkTo(90 + Math.random() * (W - 180));
    else if (r < 0.7) go("wave");
    else if (r < 0.85) go("jump");
    else go("idle");
  }
  function update(dt) {
    time += dt; st.t += dt;
    for (const h of hearts) { h.y -= 28 * dt; h.l -= dt; }
    while (hearts.length && hearts[0].l <= 0) hearts.shift();
    if (st.mode === "walk") {
      const dx = st.tx - st.x, step = 42 * dt; st.dir = Math.sign(dx);
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
    for (const f of items.furniture) f(c, { S, time, W, H, floor: FEET });
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
    c.clearRect(0, 0, W, H); c.imageSmoothingEnabled = false;
    drawRoom();
    if (!img) { msg(status === "fail" ? "No se pudo cargar la skin" : "Cargando mascota…"); return; }
    const po = pose();
    const lift = Math.min(1, -po.y / 16);
    c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.ellipse(Math.round(st.x), FEET + 2, 36 * (1 - lift * 0.4), 6 * (1 - lift * 0.4), 0, 0, Math.PI * 2); c.fill();
    drawChar(po);
    for (const h of hearts) drawHeart(h.x, h.y, h.l / 0.6);
  }

  /* ---------- Interacción ---------- */
  function onPointer(e) {
    if (!img) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const onHer = Math.abs(x - st.x) < 8 * S && y > FEET - 32 * S && y < FEET + 8;
    if (onHer) { // caricia: salta o saluda, y salen corazones
      go(Math.random() < 0.5 ? "jump" : "wave");
      for (let i = 0; i < 3; i++) hearts.push({ x: st.x - 12 + i * 14 + Math.random() * 6, y: FEET - 34 * S - i * 10, l: 1.2 });
    } else walkTo(x);
  }
  canvas.addEventListener("pointerdown", onPointer);

  /* ---------- Arranque ---------- */
  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); render(); raf = requestAnimationFrame(frame);
  }
  loadFirst(skinSources).then(i => {
    if (!alive) return;
    img = i; status = i ? "ok" : "fail";
    if (reduce) render();
  });
  if (reduce) render(); else raf = requestAnimationFrame(frame);

  return {
    destroy() { alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onPointer); },
    setHat(fn) { items.hat = fn; },
    addFurniture(fn) { items.furniture.push(fn); }
  };
}
