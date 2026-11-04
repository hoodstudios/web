/* avatar.js — Avatar animado 2.5D isométrico al estilo Minecraft Live.
 * Renderiza un personaje con proporciones exageradas (cabezota) y una habitación isométrica.
 * Extrae las caras frontal, superior y lateral de la skin para dar volumen 3D real.
 * Soporta animaciones básicas, capas de superposición (overlay) y exportación a PNG.
 */
const W = 480, H = 300;      // Tamaño interno del canvas
const S = 4.5;               // Píxeles de canvas por píxel de skin (escala general)
const B = 0.8;               // Escala del cuerpo
const HK = 2.2;              // Escala de la cabeza

const loadImg = src => new Promise((ok, no) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
});
async function loadFirst(list) {
  for (const s of list) { try { return await loadImg(s); } catch (e) {} }
  return null;
}

export function createAvatar(canvas, { skinSources = [], slim = false } = {}) {
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext("2d"); c.imageSmoothingEnabled = false;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let img = null, status = "loading", raf = 0, last = 0, time = 0, alive = true;
  const st = { mode: "idle", t: 0, dir: 0 };
  const items = { hat: null, furniture: [] };

  /* ---------- Renderizador de Bloques Isométricos ---------- */
  function drawBlock(ctx, px, py, w, h, d, tex, scale) {
    if (!tex) return;
    ctx.save();
    ctx.translate(px * S, py * S);
    ctx.scale(scale * S, scale * S); // 1 unidad = 1 píxel de skin

    // Cara Izquierda (Fondo)
    if (tex.left) {
      ctx.save();
      ctx.translate(-w / 2, -h / 2);
      ctx.transform(1, 0.5, 0, 1, 0, 0);
      ctx.drawImage(img, tex.left[0], tex.left[1], tex.left[2], tex.left[3], 0, 0, d, h);
      ctx.restore();
    }

    // Cara Superior
    if (tex.top) {
      ctx.save();
      ctx.translate(-w / 2, -h / 2);
      ctx.transform(1, -0.5, 1, 0.5, 0, 0);
      ctx.drawImage(img, tex.top[0], tex.top[1], tex.top[2], tex.top[3], 0, 0, w, d);
      ctx.restore();
    }

    // Cara Frontal
    if (tex.front) {
      ctx.save();
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(img, tex.front[0], tex.front[1], tex.front[2], tex.front[3], 0, 0, w, h);
      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------- Extracción de Coordenadas UV ---------- */
  const aw = slim ? 3 : 4; // Ancho del brazo (slim = 3px, clásico = 4px)

  const uv = {
    head: { top: [8, 0, 8, 8], front: [8, 8, 8, 8], left: [16, 8, 8, 8] },
    headOverlay: { top: [40, 0, 8, 8], front: [40, 8, 8, 8], left: [48, 8, 8, 8] },
    body: { top: [20, 16, 8, 4], front: [20, 20, 8, 12], left: [28, 20, 4, 12] },
    bodyOverlay: { top: [20, 32, 8, 4], front: [20, 36, 8, 12], left: [28, 36, 4, 12] },
    arm: { top: [44, 16, aw, 4], front: [44, 20, aw, 12], left: [44 + aw, 20, 4, 12] },
    armOverlay: { top: [44, 32, aw, 4], front: [44, 36, aw, 12], left: [44 + aw, 36, 4, 12] },
    leg: { top: [4, 16, 4, 4], front: [4, 20, 4, 12], left: [8, 20, 4, 12] },
    legOverlay: { top: [4, 32, 4, 4], front: [4, 36, 4, 12], left: [8, 36, 4, 12] }
  };

  /* ---------- Dibujo del Personaje ---------- */
  function drawChar(pose) {
    // El centro de coordenadas (0,0) es el centro del torso
    const baseY = -14; 
    const yOff = pose.y || 0;

    c.save();
    c.translate(W / 2, H / 2 + yOff * S);
    
    // Animación base (respiración/caminar)
    const bob = pose.bob || 0;
    c.translate(0, bob * S);

    // 1. Pierna Izquierda (Fondo)
    c.save();
    c.translate(-2, -8);
    c.rotate(pose.lL * 0.5);
    c.translate(2, 8);
    drawBlock(c, -2, -8, 4, 12, 4, uv.leg, B);
    if (img.height === 64) drawBlock(c, -2, -8, 4.1, 12.1, 4.1, uv.legOverlay, B);
    c.restore();

    // 2. Brazo Izquierdo (Fondo)
    c.save();
    c.translate(-6, -20);
    c.rotate(pose.aL * 0.5);
    c.translate(6, 20);
    drawBlock(c, -6, -20, aw, 12, 4, uv.arm, B);
    if (img.height === 64) drawBlock(c, -6, -20, aw + 0.1, 12.1, 4.1, uv.armOverlay, B);
    c.restore();

    // 3. Pierna Derecha (Frente)
    c.save();
    c.translate(2, -8);
    c.rotate(pose.lR * 0.5);
    c.translate(-2, 8);
    drawBlock(c, 2, -8, 4, 12, 4, uv.leg, B);
    if (img.height === 64) drawBlock(c, 2, -8, 4.1, 12.1, 4.1, uv.legOverlay, B);
    c.restore();

    // 4. Torso
    c.save();
    c.rotate(pose.lean || 0);
    c.translate(0, -14);
    c.rotate(pose.spin || 0);
    c.translate(0, 14);
    drawBlock(c, 0, -14, 8, 12, 4, uv.body, B);
    if (img.height === 64) drawBlock(c, 0, -14, 8.1, 12.1, 4.1, uv.bodyOverlay, B);
    c.restore();

    // 5. Brazo Derecho (Frente)
    c.save();
    c.translate(6, -20);
    c.rotate(pose.aR * 0.5);
    c.translate(-6, 20);
    drawBlock(c, 6, -20, aw, 12, 4, uv.arm, B);
    if (img.height === 64) drawBlock(c, 6, -20, aw + 0.1, 12.1, 4.1, uv.armOverlay, B);
    c.restore();

    // 6. Cabeza
    c.save();
    c.translate(0, -24); // Pivote en el cuello
    c.rotate(pose.head || 0);
    drawBlock(c, 0, -24 - 4 * HK, 8, 8, 8, uv.head, HK);
    if (img.height === 64) drawBlock(c, 0, -24 - 4 * HK, 8.1, 8.1, 8.1, uv.headOverlay, HK);
    
    // Gancho para sombreros personalizados
    if (items.hat) {
      c.save();
      c.translate(0, -24 - 8 * HK);
      c.scale(HK, HK);
      items.hat(c, S, time);
      c.restore();
    }
    c.restore();

    c.restore();
  }

  /* ---------- Poses y Animaciones ---------- */
  function getPose() {
    const p = { y: 0, bob: 0, lean: 0, head: 0, aR: 0.05, aL: -0.05, lR: 0, lL: 0 };
    const breathe = Math.sin(time * 2.5);

    if (st.mode === "idle") {
      p.bob = breathe * 0.3;
      p.head = Math.sin(time * 1.2) * 0.03;
      p.aR += breathe * 0.03;
      p.aL -= breathe * 0.03;
    } else if (st.mode === "walk") {
      const a = Math.sin(time * 10);
      p.lR = a;
      p.lL = -a;
      p.aR = -a;
      p.aL = a;
      p.bob = Math.abs(a) * 0.5;
      p.head = -0.05 * Math.sign(a);
    } else if (st.mode === "jump") {
      const t = Math.min(1, st.t / 0.8);
      const s = Math.sin(Math.PI * t);
      p.y = -s * 15;
      p.lR = 0.3 * s;
      p.lL = 0.3 * s;
      p.aR = 0.7 * s;
      p.aL = -0.7 * s;
    } else if (st.mode === "wave") {
      const t = Math.min(1, st.t / 1.5);
      const e = Math.max(0, Math.min(1, st.t / 0.2, (1.5 - st.t) / 0.2));
      p.aR = 0.05 + 2.5 * e + Math.sin(time * 15) * 0.2 * e;
      p.head = 0.1 * e;
      p.bob = breathe * 0.2;
    }
    return p;
  }

  /* ---------- Habitación Isométrica ---------- */
  function drawRoom() {
    // Fondo base oscuro
    c.fillStyle = "#0a0f14";
    c.fillRect(0, 0, W, H);

    c.save();
    c.translate(W / 2, H / 2 + 40);

    // Piso (Diamante isométrico)
    c.save();
    c.transform(1, 0.5, -1, 0.5, 0, 0);
    c.fillStyle = "#2a3b4c";
    c.fillRect(-150, -150, 300, 300);
    // Cuadrícula del piso
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.lineWidth = 2;
    for (let i = -150; i <= 150; i += 30) {
      c.beginPath(); c.moveTo(i, -150); c.lineTo(i, 150); c.stroke();
      c.beginPath(); c.moveTo(-150, i); c.lineTo(150, i); c.stroke();
    }
    c.restore();

    // Pared Izquierda
    c.save();
    c.transform(1, 0.5, 0, 1, 0, 0);
    c.fillStyle = "#1e2833";
    c.fillRect(-150, -100, 150, 100);
    c.restore();

    // Pared Derecha
    c.save();
    c.transform(1, -0.5, 0, 1, 0, 0);
    c.fillStyle = "#17202a";
    c.fillRect(0, -100, 150, 100);
    c.restore();

    // Iluminación ambiental
    const g = c.createRadialGradient(0, -20, 10, 0, -20, 200);
    g.addColorStop(0, "rgba(247,180,30,0.15)");
    g.addColorStop(1, "rgba(247,180,30,0)");
    c.fillStyle = g;
    c.fillRect(-150, -150, 300, 300);

    c.restore();

    // Muebles (Gancho para la tienda)
    for (const f of items.furniture) f(c, { S, time, W, H });
  }

  /* ---------- Loop de Renderizado ---------- */
  function render() {
    c.clearRect(0, 0, W, H);
    c.imageSmoothingEnabled = false;
    
    drawRoom();

    if (!img) {
      c.fillStyle = "#a89a70";
      c.font = "500 16px 'Noto Sans', sans-serif";
      c.textAlign = "center";
      c.fillText(status === "fail" ? "No se pudo cargar la skin" : "Cargando avatar...", W / 2, H / 2);
      return;
    }

    const pose = getPose();
    drawChar(pose);
  }

  function update(dt) {
    time += dt;
    st.t += dt;

    if (st.mode === "walk" && st.t > 2) go("idle");
    else if (st.mode === "wave" && st.t > 1.5) go("idle");
    else if (st.mode === "jump" && st.t > 0.8) go("idle");
    else if (st.mode === "idle" && Math.random() < 0.005) {
      // Cambios aleatorios sutiles de animación
      if (Math.random() < 0.3) go("wave");
      else if (Math.random() < 0.3) go("jump");
    }
  }

  function go(m) {
    st.mode = m;
    st.t = 0;
  }

  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    update(dt);
    render();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- Exportación a PNG ---------- */
  function download(size = 512, background = "transparent") {
    const out = document.createElement("canvas");
    out.width = out.height = size;
    const oc = out.getContext("2d");
    oc.imageSmoothingEnabled = false;

    if (background !== "transparent") {
      oc.fillStyle = background;
      oc.fillRect(0, 0, size, size);
    }

    if (!img) return;

    // Configurar un canvas temporal para renderizar el personaje aislado
    const temp = document.createElement("canvas");
    temp.width = W;
    temp.height = H;
    const tc = temp.getContext("2d");
    tc.imageSmoothingEnabled = false;

    // Guardar contexto original
    const oldCtx = c;
    // @ts-ignore - Redirigir el contexto temporalmente para dibujar el personaje
    c = tc; 
    c.clearRect(0, 0, W, H);
    drawChar(getPose());
    c = oldCtx; // Restaurar

    // Dibujar en el canvas de exportación centrado y escalado
    const scale = size / 140; // Escala para que quepa bien
    const dx = (size - W * scale) / 2;
    const dy = (size - H * scale) / 2;
    
    oc.drawImage(temp, dx, dy, W * scale, H * scale);

    const a = document.createElement("a");
    a.download = `hood-avatar-${size}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  }

  /* ---------- Inicialización ---------- */
  loadFirst(skinSources).then(i => {
    if (!alive) return;
    img = i;
    status = i ? "ok" : "fail";
    if (reduce) render();
  });

  if (reduce) {
    render();
  } else {
    raf = requestAnimationFrame(frame);
  }

  return {
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
    },
    setHat(fn) { items.hat = fn; },
    addFurniture(fn) { items.furniture.push(fn); },
    play(mode) {
      if (["idle", "walk", "jump", "wave"].includes(mode)) go(mode);
    },
    download
  };
}
