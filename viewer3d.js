/* Visor 3D sencillo (canvas 2D, sin librerías).
 *  - Textura 2D  -> se extruye como los items de Minecraft (cada píxel opaco es un cubito, con grosor).
 *  - Modelo OBJ  -> malla de triángulos con sombreado plano.
 *  Arrastra para girar; si no lo tocas gira solo. */

const MAXPX = 32;

function pixelsOf(img) {
  const s = Math.min(1, MAXPX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, w, h);
  return { w, h, d: g.getImageData(0, 0, w, h).data };
}

/* cada cara: [x0,y0,z0, x1,y1,z1, x2,y2,z2, x3,y3,z3], normal [nx,ny,nz], color [r,g,b] */
function buildExtrude(img) {
  const { w, h, d } = pixelsOf(img), faces = [];
  const th = Math.max(1, w / 16) / 2, ox = w / 2, oy = h / 2;
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 40;
  const sc = 1 / Math.max(w, h);
  const q = (v, n, col) => faces.push({ v: v.map((a, i) => a * sc), n, c: col });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!on(x, y)) continue;
    const i = (y * w + x) * 4, col = [d[i], d[i + 1], d[i + 2]];
    const X0 = x - ox, X1 = x + 1 - ox, Y0 = y - oy, Y1 = y + 1 - oy;
    q([X0, Y0, th, X1, Y0, th, X1, Y1, th, X0, Y1, th], [0, 0, 1], col);
    q([X1, Y0, -th, X0, Y0, -th, X0, Y1, -th, X1, Y1, -th], [0, 0, -1], col);
    if (!on(x - 1, y)) q([X0, Y0, -th, X0, Y0, th, X0, Y1, th, X0, Y1, -th], [-1, 0, 0], col);
    if (!on(x + 1, y)) q([X1, Y0, th, X1, Y0, -th, X1, Y1, -th, X1, Y1, th], [1, 0, 0], col);
    if (!on(x, y - 1)) q([X0, Y0, -th, X1, Y0, -th, X1, Y0, th, X0, Y0, th], [0, -1, 0], col);
    if (!on(x, y + 1)) q([X0, Y1, th, X1, Y1, th, X1, Y1, -th, X0, Y1, -th], [0, 1, 0], col);
  }
  return faces;
}

function buildObj(text, color) {
  const vs = [], faces = [];
  const lines = String(text).split("\n");
  for (const ln of lines) {
    const p = ln.trim().split(/\s+/);
    if (p[0] === "v") vs.push([+p[1] || 0, -(+p[2] || 0), +p[3] || 0]);                 // y invertida: la pantalla crece hacia abajo
    else if (p[0] === "f") {
      const idx = p.slice(1).map(s => { let n = parseInt(s.split("/")[0], 10); return n < 0 ? vs.length + n : n - 1; }).filter(n => vs[n]);
      for (let i = 1; i + 1 < idx.length; i++) faces.push([idx[0], idx[i], idx[i + 1]]);
    }
  }
  if (!vs.length || !faces.length) return [];
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  vs.forEach(v => v.forEach((a, k) => { if (a < mn[k]) mn[k] = a; if (a > mx[k]) mx[k] = a; }));
  const ctr = mn.map((a, k) => (a + mx[k]) / 2), size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const T = vs.map(v => v.map((a, k) => (a - ctr[k]) / size));
  const col = color || [170, 170, 185], out = [];
  for (const f of faces.slice(0, 20000)) {
    const [a, b, c] = f.map(i => T[i]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(a => -a / l);              // la y invertida cambia el sentido
    out.push({ v: [...a, ...b, ...c], n, c: col, tri: true, two: true });
  }
  return out;
}

export function avgColor(img) {
  try { const { d } = pixelsOf(img); let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n | 0, g / n | 0, b / n | 0] : null; } catch (e) { return null; }
}

/* canvas: el elemento donde dibujar. Devuelve { set({img,obj,color}), stop() } */
export function viewer3d(canvas, src = {}) {
  let faces = [], yaw = 0.6, pitch = -0.28, drag = null, last = performance.now(), stopped = false, resumeAt = 0, raf = 0;
  const g = canvas.getContext("2d");
  function set(s) {
    try {
      if (s && s.obj) faces = buildObj(s.obj, s.color || (s.img && avgColor(s.img)));
      else if (s && s.img && s.img.width) faces = buildExtrude(s.img);
      else faces = [];
    } catch (e) { faces = []; }
  }
  set(src);
  const down = e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); };
  const move = e => { if (!drag) return; yaw = drag.yaw + (e.clientX - drag.x) * 0.012; pitch = Math.max(-1.2, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.012)); };
  const up = () => { drag = null; resumeAt = performance.now() + 1800; };
  canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
  canvas.style.touchAction = "none"; canvas.style.cursor = "grab";

  function frame(now) {
    if (stopped || !canvas.isConnected) { stopped = true; return; }
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!drag && now > resumeAt) yaw += dt * 0.9;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const S = Math.min(W, H) * 0.78, cx = W / 2, cy = H / 2;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (x, y, z) => {                                                       // yaw (Y) y luego pitch (X)
      const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
    };
    const list = [];
    for (const f of faces) {
      const n = rot(f.n[0], f.n[1], f.n[2]);
      if (n[2] <= 0 && !f.two) continue;                                             // cara de atrás
      const k = f.tri ? 3 : 4, P = [];
      let z = 0;
      for (let i = 0; i < k; i++) { const r = rot(f.v[i * 3], f.v[i * 3 + 1], f.v[i * 3 + 2]); P.push(r); z += r[2]; }
      list.push({ f, P, z: z / k, nz: f.two && n[2] < 0 ? -n[2] : n[2], n });
    }
    list.sort((a, b) => a.z - b.z);
    for (const it of list) {
      const sh = 0.45 + 0.55 * Math.max(0, it.nz * 0.7 + (-it.n[1]) * 0.35 + it.n[0] * 0.15);
      const c = it.f.c;
      g.fillStyle = g.strokeStyle = `rgb(${Math.min(255, c[0] * sh) | 0},${Math.min(255, c[1] * sh) | 0},${Math.min(255, c[2] * sh) | 0})`;
      g.lineWidth = 0.7; g.beginPath();
      it.P.forEach((p, i) => { const X = cx + p[0] * S, Y = cy + p[1] * S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.closePath(); g.fill(); g.stroke();
    }
  }
  raf = requestAnimationFrame(frame);
  return { set, stop() { stopped = true; cancelAnimationFrame(raf); } };
}
