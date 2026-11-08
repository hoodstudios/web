/* Visor 3D sencillo con rasterizador por software (z-buffer), sin librerías.
 *  - Textura 2D  -> se extruye como los items de Minecraft (cada píxel opaco es un cubito, con grosor).
 *  - Modelo .bbmodel (Blockbench) -> cubos con sus texturas, recortes y rotaciones.
 *  El z-buffer evita las partes "transparentes" que salían al ordenar caras. Incluye brillo especular,
 *  un destello que barre el modelo y, opcionalmente, el brillo morado de los objetos encantados.
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

/* ---- Modelos de Blockbench (.bbmodel): cubos con sus texturas incrustadas ---- */
const rotPt = (p, o, r) => {
  let x = p[0] - o[0], y = p[1] - o[1], z = p[2] - o[2];
  const rx = (r[0] || 0) * Math.PI / 180, ry = (r[1] || 0) * Math.PI / 180, rz = (r[2] || 0) * Math.PI / 180;
  let c = Math.cos(rx), s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(ry); s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
  return [x + o[0], y + o[1], z + o[2]];
};
function boxUv(el, w, h, d) {
  const [u, v] = el.uv_offset || [0, 0];
  return { north: [u + d, v + d, u + d + w, v + d + h], east: [u, v + d, u + d, v + d + h], south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h],
    west: [u + d + w, v + d, u + 2 * d + w, v + d + h], up: [u + d, v, u + d + w, v + d], down: [u + d + w, v, u + d + 2 * w, v + d] };
}
export function parseBB(text) {
  const j = typeof text === "string" ? JSON.parse(text) : text;
  if (!j || !Array.isArray(j.elements)) throw new Error("No parece un .bbmodel válido");
  return j;
}
function buildBB(text) {
  const j = parseBB(text), res = j.resolution || { width: j.texture_width || 16, height: j.texture_height || 16 };
  const texs = (j.textures || []).map(t => { const im = new Image(); im.src = t.source || ""; return { im, uw: t.uv_width || res.width || 16, vh: t.uv_height || res.height || 16 }; });
  const chains = new Map();
  const walk = (nodes, chain) => (nodes || []).forEach(n => {
    if (typeof n === "string") chains.set(n, chain);
    else if (n && typeof n === "object") walk(n.children, [{ o: n.origin || [0, 0, 0], r: n.rotation || [0, 0, 0] }, ...chain]);
  });
  walk(j.outliner, []);
  const raw = [];
  for (const el of j.elements) {
    if (el.type && el.type !== "cube") continue;
    const f = el.from || [0, 0, 0], to = el.to || [0, 0, 0], inf = el.inflate || 0;
    const A = [f[0] - inf, f[1] - inf, f[2] - inf], B = [to[0] + inf, to[1] + inf, to[2] + inf];
    const uvs = el.box_uv && !el.faces ? boxUv(el, to[0] - f[0], to[1] - f[1], to[2] - f[2]) : null;
    const C = {                                              // esquinas (arriba-izq, arriba-der, abajo-izq) vistas desde fuera
      north: [[B[0], B[1], A[2]], [A[0], B[1], A[2]], [B[0], A[1], A[2]]], south: [[A[0], B[1], B[2]], [B[0], B[1], B[2]], [A[0], A[1], B[2]]],
      east: [[B[0], B[1], B[2]], [B[0], B[1], A[2]], [B[0], A[1], B[2]]], west: [[A[0], B[1], A[2]], [A[0], B[1], B[2]], [A[0], A[1], A[2]]],
      up: [[A[0], B[1], A[2]], [B[0], B[1], A[2]], [A[0], B[1], B[2]]], down: [[A[0], A[1], B[2]], [B[0], A[1], B[2]], [A[0], A[1], A[2]]]
    };
    const chain = chains.get(el.uuid) || [], org = el.origin || [0, 0, 0], rot = el.rotation || [0, 0, 0];
    const tr = p => { let q = rotPt(p, org, rot); for (const g of chain) q = rotPt(q, g.o, g.r); return q; };
    const mid = tr([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]);
    for (const dir of Object.keys(C)) {
      const fc = (el.faces && el.faces[dir]) || null, uv = fc ? fc.uv : uvs && uvs[dir];
      if (!uv || (fc && (fc.texture === null || fc.texture === undefined) && texs.length === 0)) continue;
      if (fc && fc.texture === null) continue;
      const tx = texs[fc && Number.isInteger(fc.texture) ? fc.texture : 0]; if (!tx) continue;
      let q = C[dir].map(tr); q = [q[0], q[1], [q[1][0] + q[2][0] - q[0][0], q[1][1] + q[2][1] - q[0][1], q[1][2] + q[2][2] - q[0][2]], q[2]]; // TL, TR, BR, BL
      for (let s = 0; s < ((fc && fc.rotation) || 0) / 90; s++) q = [q[3], q[0], q[1], q[2]];
      raw.push({ q, mid, uv, tx });
    }
  }
  if (!raw.length) return [];
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  raw.forEach(r => r.q.forEach(p => p.forEach((a, k) => { if (a < mn[k]) mn[k] = a; if (a > mx[k]) mx[k] = a; })));
  const ctr = mn.map((a, k) => (a + mx[k]) / 2), size = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const T = p => [(p[0] - ctr[0]) / size, -(p[1] - ctr[1]) / size, (p[2] - ctr[2]) / size];
  return raw.map(r => {
    const q = r.q.map(T), m = T(r.mid), e1 = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], e2 = [q[3][0] - q[0][0], q[3][1] - q[0][1], q[3][2] - q[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map(a => a / l);
    const fcn = [(q[0][0] + q[2][0]) / 2 - m[0], (q[0][1] + q[2][1]) / 2 - m[1], (q[0][2] + q[2][2]) / 2 - m[2]];
    if (n[0] * fcn[0] + n[1] * fcn[1] + n[2] * fcn[2] < 0) n = n.map(a => -a);
    return { v: [...q[0], ...q[1], ...q[2], ...q[3]], n, c: [150, 150, 160], tex: { t: r.tx, uv: r.uv } };
  });
}
export function avgColor(img) {
  try { const { d } = pixelsOf(img); let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n | 0, g / n | 0, b / n | 0] : null; } catch (e) { return null; }
}


const LX = -0.45, LY = -0.6, LZ = 0.66, LL = Math.hypot(LX, LY, LZ), L = [LX / LL, LY / LL, LZ / LL];
const HV = (() => { const h = [L[0], L[1], L[2] + 1], l = Math.hypot(h[0], h[1], h[2]); return [h[0] / l, h[1] / l, h[2] / l]; })();

function texPix(t) {                                         // píxeles de la textura (una vez que cargó)
  if (t.pix) return t.pix;
  const im = t.im; if (!im.complete || !im.naturalWidth) return null;
  const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
  return (t.pix = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height });
}

/* canvas: el elemento donde dibujar. Devuelve { set({img,bb,ench}), stop() } */
export function viewer3d(canvas, src = {}) {
  let faces = [], rad = 0.6, ench = false, yaw = 0.6, pitch = -0.25, drag = null, last = performance.now(), stopped = false, resumeAt = 0, raf = 0, t0 = performance.now();
  const vis = canvas.getContext("2d"), off = document.createElement("canvas"), og = off.getContext("2d");
  let buf = null, depth = null, RW = 0, RH = 0;
  function set(s) {
    try {
      if (s && s.bb) faces = buildBB(s.bb);
      else if (s && s.img && s.img.width) faces = buildExtrude(s.img);
      else faces = [];
    } catch (e) { console.warn("visor3d:", e); faces = []; }
    ench = !!(s && s.ench);
    rad = 0.3; faces.forEach(f => { for (let i = 0; i < f.v.length; i += 3) rad = Math.max(rad, Math.hypot(f.v[i], f.v[i + 1], f.v[i + 2])); });
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
    const dpr = Math.min(2, window.devicePixelRatio || 1), cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const OW = Math.round(cw * dpr), OH = Math.round(ch * dpr);
    if (canvas.width !== OW || canvas.height !== OH) { canvas.width = OW; canvas.height = OH; }
    const ss = Math.min(1.6, 560 / Math.max(OW, OH)), W = Math.max(8, Math.round(OW * ss)), H = Math.max(8, Math.round(OH * ss));   // se dibuja un poco más grande y se reduce: bordes suaves
    if (W !== RW || H !== RH) { RW = W; RH = H; off.width = W; off.height = H; buf = og.createImageData(W, H); depth = new Float32Array(W * H); }
    const px = buf.data; px.fill(0); depth.fill(-1e9);
    const tm = (now - t0) / 1000, S = Math.min(W, H) * 0.46 / rad, cx = W / 2, cy = H / 2;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const rot = (x, y, z) => { const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw; return [x1, y * cp - z1 * sp, y * sp + z1 * cp]; };
    const sweepP = (tm * 0.5) % 2.4 - 0.7;                                   // posición del destello (0..1 = de una esquina a la otra)
    for (const f of faces) {
      const n = rot(f.n[0], f.n[1], f.n[2]); if (n[2] <= 0.001) continue;
      const P = [rot(f.v[0], f.v[1], f.v[2]), rot(f.v[3], f.v[4], f.v[5]), rot(f.v[6], f.v[7], f.v[8]), rot(f.v[9], f.v[10], f.v[11])];
      const lam = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), dif = 0.52 + 0.58 * lam;
      const sp2 = Math.pow(Math.max(0, n[0] * HV[0] + n[1] * HV[1] + n[2] * HV[2]), 26) * 150 + Math.pow(1 - n[2], 3) * 14;   // reflejo
      let tx = null, uv = null;
      if (f.tex) { tx = texPix(f.tex.t); if (!tx) continue; const sx = tx.w / f.tex.t.uw, sy = tx.h / f.tex.t.vh, u = f.tex.uv; uv = [[u[0] * sx, u[1] * sy], [u[2] * sx, u[1] * sy], [u[2] * sx, u[3] * sy], [u[0] * sx, u[3] * sy]]; }
      const X = P.map(p => cx + p[0] * S), Y = P.map(p => cy + p[1] * S), Z = P.map(p => p[2]);
      for (const [a, b, c2] of [[0, 1, 2], [0, 2, 3]]) {
        const x0 = X[a], y0 = Y[a], x1 = X[b], y1 = Y[b], x2 = X[c2], y2 = Y[c2];
        const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-6) continue;
        const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
        const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
        for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
          const qx = x + 0.5, qy = y + 0.5;
          const w0 = ((y1 - y2) * (qx - x2) + (x2 - x1) * (qy - y2)) / den, w1 = ((y2 - y0) * (qx - x2) + (x0 - x2) * (qy - y2)) / den, w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const z = w0 * Z[a] + w1 * Z[b] + w2 * Z[c2], di = y * W + x; if (z <= depth[di]) continue;
          let r, g, bl;
          if (tx) {
            const u = w0 * uv[a][0] + w1 * uv[b][0] + w2 * uv[c2][0], v = w0 * uv[a][1] + w1 * uv[b][1] + w2 * uv[c2][1];
            const ix = Math.min(tx.w - 1, Math.max(0, u | 0)), iy = Math.min(tx.h - 1, Math.max(0, v | 0)), ti = (iy * tx.w + ix) * 4;
            if (tx.d[ti + 3] < 110) continue; r = tx.d[ti]; g = tx.d[ti + 1]; bl = tx.d[ti + 2];
          } else { r = f.c[0]; g = f.c[1]; bl = f.c[2]; }
          depth[di] = z;
          r = r * dif + sp2; g = g * dif + sp2; bl = bl * dif + sp2;
          const d = ((qx + qy) / (W + H) - sweepP) / 0.07, sw = d > -1 && d < 1 ? (1 - d * d) * 55 : 0;     // destello que cruza el modelo
          r += sw; g += sw; bl += sw;
          if (ench) { const q1 = Math.sin((qx - qy) * 0.07 / ss + tm * 2.4) * 0.5 + 0.5, q2 = Math.sin((qx + qy * 0.5) * 0.05 / ss - tm * 1.7) * 0.5 + 0.5, k = q1 * q1 * q2 * 0.9; r += 130 * k; g += 50 * k; bl += 240 * k; }
          const o = di * 4; px[o] = r > 255 ? 255 : r; px[o + 1] = g > 255 ? 255 : g; px[o + 2] = bl > 255 ? 255 : bl; px[o + 3] = 255;
        }
      }
    }
    og.putImageData(buf, 0, 0);
    vis.setTransform(1, 0, 0, 1, 0, 0); vis.clearRect(0, 0, OW, OH); vis.imageSmoothingEnabled = true; vis.imageSmoothingQuality = "high"; vis.drawImage(off, 0, 0, OW, OH);
  }
  raf = requestAnimationFrame(frame);
  return { set, stop() { stopped = true; cancelAnimationFrame(raf); } };
}
