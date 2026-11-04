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
const B = 0.78;              // cuerpo compacto, pero proporcional a la cabeza
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
  function layerFace(sx, sy, px, py, w, h, kk) {
    const k = img.width / 64, temp = document.createElement("canvas"); temp.width = temp.height = 8;
    const tc = temp.getContext("2d"); tc.imageSmoothingEnabled = false;
    tc.drawImage(img, sx * k, sy * k, 8 * k, 8 * k, 0, 0, 8, 8);
    // La skin ya trae alpha real: no alteramos colores blancos válidos.
    c.drawImage(temp, px, py, w, h);
  }
  function compactFace(sx, sy, px, py, w, h) {
    const k = img.width / 64, src = document.createElement("canvas"), out = document.createElement("canvas");
    src.width = out.width = src.height = out.height = 8;
    const sc = src.getContext("2d"), oc = out.getContext("2d"); sc.imageSmoothingEnabled = oc.imageSmoothingEnabled = false;
    sc.drawImage(img, sx * k, sy * k, 8 * k, 8 * k, 0, 0, 8, 8);
    // Conserva los bloques de 1 píxel y acerca únicamente el bloque derecho.
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) oc.drawImage(src, x, y, 1, 1, x >= 5 ? x - 1 : x, y, 1, 1);
    c.drawImage(out, px, py, w, h);
  }

  function drawChar(po) {
    const awR = slim ? 2 : 3; // brazo derecho: plano/estrecho, queda detrás
    const awL = slim ? 3 : 5; // brazo izquierdo: volumen del costado visible
    const legacy = img.height < img.width; // 64×32 = formato antiguo
    const headOnly = false; // cabeza aprobada; activamos el cuerpo Drops compacto
    const strips = (sx, sy, sw, x, y, dw, n, mirror = false) => {
      const k = img.width / 64; c.save();
      if (mirror) { c.translate(Math.round((x + dw) * S), 0); c.scale(-1, 1); x = 0; }
      for (let i = 0; i < n; i++) {
        const row = sy + Math.round(i * 11 / Math.max(1, n - 1));
        c.drawImage(img, sx * k, row * k, sw * k, k, Math.round(x * S), Math.round((y + i) * S), Math.round(dw * S), S);
      }
      c.restore();
    };
    const bust = false;
    c.save();
    c.translate(Math.round(st.x), FEET + Math.round(po.y * S));
    c.rotate(po.lean);
    c.scale(B, B); // cuerpo pequeño; la cabeza se agranda aparte

    if (!headOnly) {
    // Piernas cortas y planas: se leen como piezas de papel, no como un modelo 3D.
    strips(4, legacy ? 20 : 52, 4, -2, -7, 4, 3);
    strips(legacy ? 4 : 20, legacy ? 20 : 52, 4, 2, -7, 4, 3, true);

    c.translate(0, Math.round(po.bob * S)); // el torso respira / rebota; las piernas no
    // torso
    strips(20, 20, 8, -4, -14, 8, 4);
    if (!legacy) strips(20, 36, 8, -4, -14, 8, 4);
    // brazos (pivote en el hombro)
    const shoulder = -13;
    const armR = () => {
      strips(44, 20, awR, -7, shoulder, 3, 5);
      if (!legacy) strips(44, 36, awR, -7, shoulder, 3, 5);
    };
    const raised = po.aR > 1.2; // si el brazo está levantado (saludo), se dibuja delante de la cabeza grande
    if (!raised) armR();
    if (legacy) strips(44, 20, awL, 4, shoulder, 5, 3, true);
    else { strips(36, 52, awL, 4, shoulder, 5, 5); strips(52, 52, awL, 4, shoulder, 5, 5); }
    }
    // Cabeza "Drops" simplificada: menos superficie frontal y un costado corto
    // para que los rasgos queden juntos y la silueta se lea más tierna.
    const hk = HK / B; // la cabeza se dibuja a escala HK en total
    c.save();
    c.translate(0, -14 * S); c.rotate(po.head); c.scale(hk, hk);
    const ik = img.width / 64;
    // El lateral pasa de 4 a 3 píxeles lógicos; la cara de 8 a 7. Al
    // reagrupar con vecino más cercano los ojos quedan visualmente próximos.
    c.drawImage(img, 16 * ik, 8 * ik, 8 * ik, 8 * ik, 4 * S, -8 * S, 4 * S, 8 * S);
    if (!legacy) layerFace(48, 8, 4 * S, -8 * S, 4 * S, 8 * S, hk);
    // Proyección Drops de referencia: frente 8×8 + costado continuo de 4×8.
    // No se escala horizontalmente la cara; los ojos conservan sus cubos UV.
    compactFace(8, 8, -4 * S, -8 * S, 8 * S, 8 * S);
    if (!legacy) compactFace(40, 8, -4 * S, -8 * S, 8 * S, 8 * S);
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
    } else if (st.mode === "dance") {
      const d = Math.sin(time * 7); po.bob = -Math.abs(d) * 1.2; po.lean = d * 0.06;
      po.aR = d * 0.35; po.aL = -d * 0.35; po.head = d * 0.08;
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
    else if (r < 0.7) go("dance");
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
    } else if (st.mode === "dance" && st.t > 1.8) go("idle");
    else if (st.mode === "wave" && st.t > 1.8) go("idle");
    else if (st.mode === "jump" && st.t > 0.7) go("idle");
    else if (st.mode === "idle" && st.t > st.next) pick();
  }

  /* ---------- Escenario ---------- */
  function drawRoom() {
    // Habitación isométrica: planos con ángulos duros y una cuadrícula de bloques.
    c.fillStyle = "#111923"; c.fillRect(0, 0, W, H);
    c.fillStyle = "#d5d9d8"; c.fillRect(0, 0, W, WALL);
    c.fillStyle = "#314855"; c.fillRect(0, 0, W, 5);
    // Dos paredes y un suelo en perspectiva isométrica, sin túnel ni fuga central.
    c.fillStyle = "#c5cbca"; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * .18, WALL); c.lineTo(0, WALL); c.closePath(); c.fill();
    c.fillStyle = "#b9c0bf"; c.beginPath(); c.moveTo(W, 0); c.lineTo(W * .82, WALL); c.lineTo(W, WALL); c.closePath(); c.fill();
    c.fillStyle = "#18252d"; c.fillRect(0, WALL - 7, W, 7);
    c.fillStyle = "#8b5a32"; c.beginPath(); c.moveTo(0, WALL); c.lineTo(W, WALL); c.lineTo(W, H); c.lineTo(0, H); c.fill();
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
    if (onHer) { // caricia: salta y salen corazones; el clic nunca dirige el movimiento
      go("jump");
      for (let i = 0; i < 3; i++) hearts.push({ x: st.x - 12 + i * 14 + Math.random() * 6, y: FEET - CH * S - 36 - i * 12, l: 1.4 });
    }
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
