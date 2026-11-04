/* avatar.js — Avatar animado generado a partir de la skin de Minecraft.
 * Estilo "Minecraft Live": cabezota y cuerpo pequeño.
 * No usa sprites: recorta cabeza, torso, brazos y piernas de la textura de la skin
 * y las mueve en un canvas 2D (como un muñeco de papel).
 *
 * Uso: const a = createAvatar(canvas, { skinSources: [url1, url2...], slim: false });
 *      a.destroy();   // al salir de la página del perfil
 * Ganchos para la futura tienda: a.setHat(fn), a.addFurniture(fn)
 */
const W = 480, H = 300;      // tamaño interno del canvas
const S = 5;                 // píxeles de canvas por cada píxel de skin
const WALL = 235, FEET = 262; // fin de la pared y altura de los pies
// Proporciones (estilo Minecraft Live). B*S y HK*S son enteros para que los píxeles queden nítidos.
const B = 0.52;              // torso y extremidades diminutos
const HK = 3.35;             // cabeza cúbica dominante, proporción Drops
const CH = 24 * B + 8 * HK;  // altura total en unidades de skin

const loadImg = src => new Promise((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
});
async function loadFirst(list) {
  for (const s of list) { try { return await loadImg(s); } catch (e) { /* prueba la siguiente */ } }
  return null;
}
const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];

export function createAvatar(canvas, { skinSources = [], slim = false } = {}) {
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
  function part(sx, sy, sw, sh, px, py, ax, ay, rot = 0, ky = 1, flip = false, kk = 1) {
    const k = img.width / 64;
    c.save();
    c.translate(Math.round(px * S), Math.round(py * S));
    c.rotate(rot); c.scale(flip ? -kk : kk, ky * kk);
    c.drawImage(img, sx * k, sy * k, sw * k, sh * k, -ax * S, -ay * S, sw * S, sh * S);
    c.restore();
  }

  function drawChar(po) {
    const aw = slim ? 3 : 4, legacy = img.height < img.width; // 64×32 = formato antiguo
    const bust = false;
    c.save();
    c.translate(Math.round(st.x), FEET + Math.round(po.y * S));
    c.rotate(po.lean);
    c.scale(B, B); // cuerpo pequeño; la cabeza se agranda aparte

    // Piernas cortas y planas: se leen como piezas de papel, no como un modelo 3D.
    part(4, 20, 4, 7, -2, -7, 2, 0, 0, po.lR);
    if (!legacy) part(4, 36, 4, 7, -2, -7, 2, 0, 0, po.lR);
    if (legacy) part(4, 20, 4, 7, 2, -7, 2, 0, 0, po.lL, true);
    else { part(20, 52, 4, 7, 2, -7, 2, 0, 0, po.lL); part(4, 52, 4, 7, 2, -7, 2, 0, 0, po.lL); }

    c.translate(0, Math.round(po.bob * S)); // el torso respira / rebota; las piernas no
    // torso
    part(20, 20, 8, 9, 0, -14, 4, 0);
    if (!legacy) part(20, 36, 8, 9, 0, -14, 4, 0);
    // brazos (pivote en el hombro)
    const shoulder = -13;
    const armR = () => {
      part(44, 20, aw, 12, -4 - aw / 2, shoulder, aw / 2, 2, po.aR, po.sR);
      if (!legacy) part(44, 36, aw, 12, -4 - aw / 2, shoulder, aw / 2, 2, po.aR, po.sR);
    };
    const raised = po.aR > 1.2; // si el brazo está levantado (saludo), se dibuja delante de la cabeza grande
    if (!raised) armR();
    if (legacy) part(44, 20, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL, true);
    else { part(36, 52, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL); part(52, 52, aw, 12, 4 + aw / 2, shoulder, aw / 2, 2, po.aL, po.sL); }
    // Cabeza "Drops" simplificada: menos superficie frontal y un costado corto
    // para que los rasgos queden juntos y la silueta se lea más tierna.
    const hk = HK / B; // la cabeza se dibuja a escala HK en total
    c.save();
    c.translate(0, -14 * S); c.rotate(po.head); c.scale(hk, hk);
    const ik = img.width / 64;
    // El lateral pasa de 4 a 3 píxeles lógicos; la cara de 8 a 7. Al
    // reagrupar con vecino más cercano los ojos quedan visualmente próximos.
    c.drawImage(img, 16 * ik, 8 * ik, 8 * ik, 8 * ik, 3.5 * S, -7 * S, 3 * S, 7 * S);
    if (!legacy) c.drawImage(img, 48 * ik, 8 * ik, 8 * ik, 8 * ik, 3.5 * S, -7 * S, 3 * S, 7 * S);
    c.drawImage(img, 8 * ik, 8 * ik, 8 * ik, 8 * ik, -3.5 * S, -7 * S, 7 * S, 7 * S);
    if (!legacy) c.drawImage(img, 40 * ik, 8 * ik, 8 * ik, 8 * ik, -3.5 * S, -7 * S, 7 * S, 7 * S);
    c.restore();
    if (raised) armR();
    // sombrero (gancho para la tienda): origen en el cuello, a la escala de la cabeza
    if (items.hat) { c.save(); c.translate(0, -24 * S); c.rotate(po.head); c.scale(hk, hk); items.hat(c, S, time); c.restore(); }
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
      po.y = -s * 9; po.lR = po.lL = 1 - 0.25 * s; po.aR = 0.05 + 0.7 * s; po.aL = -0.05 - 0.7 * s;
      if (p > 0.85) po.bob = 0.7; // pequeño "aplastón" al caer
    }
    return po;
  }

  /* ---------- Comportamiento ---------- */
  function go(m) { st.mode = m; st.t = 0; if (m === "idle") st.dir = 0, st.next = 1.5 + Math.random() * 2.5; }
  function walkTo(x) { st.tx = Math.max(80, Math.min(W - 80, x)); if (Math.abs(st.tx - st.x) > 6) go("walk"); }
  function pick() {
    const r = Math.random();
    if (r < 0.5) walkTo(100 + Math.random() * (W - 200));
    else if (r < 0.7) go("wave");
    else if (r < 0.85) go("jump");
    else go("idle");
  }
  function update(dt) {
    time += dt; st.t += dt;
    for (const h of hearts) { h.y -= 34 * dt; h.l -= dt; }
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
    // Habitación isométrica: planos con ángulos duros y una cuadrícula de bloques.
    c.fillStyle = "#111923"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#263744"; c.fillRect(0, 0, W, WALL);
    c.fillStyle = "#314855"; c.fillRect(0, 0, W, 5);
    // Dos paredes y un suelo en perspectiva isométrica, sin túnel ni fuga central.
    c.fillStyle = "#20313a"; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * .18, WALL); c.lineTo(0, WALL); c.closePath(); c.fill();
    c.fillStyle = "#19262f"; c.beginPath(); c.moveTo(W, 0); c.lineTo(W * .82, WALL); c.lineTo(W, WALL); c.closePath(); c.fill();
    c.fillStyle = "#18252d"; c.fillRect(0, WALL - 7, W, 7);
    c.fillStyle = "#3e5254"; c.beginPath(); c.moveTo(0, WALL); c.lineTo(W, WALL); c.lineTo(W, H); c.lineTo(0, H); c.fill();
    c.strokeStyle = "rgba(188,207,176,.09)"; c.lineWidth = 2;
    for (let y = WALL + 12; y < H + 30; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    for (let x = -W; x < W * 2; x += 42) { c.beginPath(); c.moveTo(W / 2 + (x - W / 2) * .35, WALL); c.lineTo(x, H); c.stroke(); }
    c.fillStyle = "rgba(0,0,0,.24)"; c.fillRect(0, WALL - 2, W, 2);
    // iluminación cálida tipo diorama
    const g = c.createRadialGradient(W * .52, WALL + 18, 8, W * .52, WALL + 18, 180); g.addColorStop(0, "rgba(255,216,117,.20)"); g.addColorStop(1, "rgba(255,216,117,0)"); c.fillStyle = g; c.fillRect(0, WALL, W, H - WALL);
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
    if (!img) { msg(status === "fail" ? "No se pudo cargar la skin" : "Cargando avatar…"); return; }
    const po = pose();
    const lift = Math.min(1, -po.y / 9);
    c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.ellipse(Math.round(st.x), FEET + 2, 4 * HK * S * 0.9 * (1 - lift * 0.4), 7 * (1 - lift * 0.4), 0, 0, Math.PI * 2); c.fill();
    drawChar(po);
    for (const h of hearts) drawHeart(h.x, h.y, h.l / 0.6);
  }

  /* ---------- Interacción ---------- */
  function onPointer(e) {
    if (!img) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    const onHer = Math.abs(x - st.x) < 4 * HK * S && y > FEET - CH * S && y < FEET + 8;
    if (onHer) { // caricia: salta o saluda, y salen corazones
      go(Math.random() < 0.5 ? "jump" : "wave");
      for (let i = 0; i < 3; i++) hearts.push({ x: st.x - 12 + i * 14 + Math.random() * 6, y: FEET - CH * S - 36 - i * 12, l: 1.4 });
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
    addFurniture(fn) { items.furniture.push(fn); },
    play(mode) { if (["idle", "walk", "jump", "wave"].includes(mode)) go(mode); },
    // Exporta el canvas ya rasterizado; al ampliar se fuerza NEAREST NEIGHBOR.
    download(size = 512, background = "transparent") {
      const out = document.createElement("canvas"); out.width = out.height = size;
      const oc = out.getContext("2d"); oc.imageSmoothingEnabled = false;
      if (background !== "transparent") { oc.fillStyle = background; oc.fillRect(0, 0, size, size); }
      const scale = Math.min(size / W, size / H);
      oc.drawImage(canvas, Math.floor((size - W * scale) / 2), Math.floor((size - H * scale) / 2), Math.floor(W * scale), Math.floor(H * scale));
      const a = document.createElement("a"); a.download = `hood-avatar-${size}.png`; a.href = out.toDataURL("image/png"); a.click();
    }
  };
}
