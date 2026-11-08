/* mcplayer.js — Jugador de Minecraft en 3D (WebGL, sin librerías).
 *  - Modelo vanilla: cabeza, torso, brazos (Steve / Alex "slim") y piernas, con sus capas exteriores (sombrero, chaqueta, mangas, pantalón).
 *  - Poses calculadas con las mismas fórmulas del juego: idle (balanceo de brazos), agacharse (shift) y golpe (swing).
 *  - Efecto de aparición pixelado (disuelve por bloques) + destello morado, para el "teletransporte".
 *  - Skins: 64×64, 64×32 (antiguas, se convierten) o HD (se reducen). */

/* ============================================================ Skins */
export function toSkin64(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false;
  if (w === h) { g.drawImage(img, 0, 0, 64, 64); return c; }
  g.drawImage(img, 0, 0, 64, 32);                                           // formato antiguo 64×32: se amplía a 64×64
  const flip = (sx, sy, sw, sh, dx, dy) => { g.save(); g.translate(dx + sw, dy); g.scale(-1, 1); g.drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh); g.restore(); };
  const limb = (sx, sy, dx, dy) => {                                        // la pierna/brazo izquierdo es el derecho espejado (cada cara se voltea)
    flip(sx + 4, sy, 4, 4, dx + 4, dy); flip(sx + 8, sy, 4, 4, dx + 8, dy);
    flip(sx + 8, sy + 4, 4, 12, dx, dy + 4); flip(sx + 4, sy + 4, 4, 12, dx + 4, dy + 4);
    flip(sx, sy + 4, 4, 12, dx + 8, dy + 4); flip(sx + 12, sy + 4, 4, 12, dx + 12, dy + 4);
  };
  limb(0, 16, 16, 48); limb(40, 16, 32, 48);
  const hat = g.getImageData(32, 0, 32, 16).data; let solid = true;          // las skins antiguas traen el fondo del sombrero opaco: se limpia
  for (let i = 3; i < hat.length; i += 4) if (hat[i] < 128) { solid = false; break; }
  if (solid) g.clearRect(32, 0, 32, 16);
  return c;
}
export function isSlim(c) {                                                  // brazos finos (Alex): la columna extra del brazo está vacía
  try {
    const g = c.getContext("2d", { willReadFrequently: true });
    const a = g.getImageData(47, 20, 1, 12).data, b = g.getImageData(39, 52, 1, 12).data;
    for (let i = 3; i < a.length; i += 4) if (a[i] || b[i]) return false;
    return true;
  } catch (e) { return false; }
}
function glSkin(c) {                                                         // copia con las capas base opacas (como el juego)
  const o = document.createElement("canvas"); o.width = o.height = 64;
  const g = o.getContext("2d", { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0);
  for (const [x, y, w, h] of [[0, 0, 32, 16], [0, 16, 64, 16], [16, 48, 32, 16]]) {
    const im = g.getImageData(x, y, w, h), d = im.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
    g.putImageData(im, x, y);
  }
  return o;
}
/* Busto (cabeza + pecho) 16×16 para los espacios del selector */
export function bust(sk, slim) {
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  const aw = slim ? 3 : 4, put = (sx, sy, w, h, dx, dy) => g.drawImage(sk, sx, sy, w, h, dx, dy, w, h);
  put(44, 20, aw, 8, 4 - aw, 8); put(44, 36, aw, 8, 4 - aw, 8);               // brazo derecho + manga
  put(36, 52, aw, 8, 12, 8); put(52, 52, aw, 8, 12, 8);                       // brazo izquierdo + manga
  put(20, 20, 8, 8, 4, 8); put(20, 36, 8, 8, 4, 8);                           // torso + chaqueta
  put(8, 8, 8, 8, 4, 0); put(40, 8, 8, 8, 4, 0);                              // cara + sombrero
  return c;
}

/* ============================================================ Matrices (column-major) */
const M = {
  id: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
  T: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  S: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
  RX: a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; },
  RY: a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; },
  RZ: a => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; },
  persp(f, asp, n, fr) { const t = 1 / Math.tan(f / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, 2 * fr * n / (n - fr), 0]; },
  pt(m, p) { return [0, 1, 2, 3].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]); }
};

/* ============================================================ Geometría del modelo */
function pushBox(out, x0, y0, z0, x1, y1, z1, u, v, w, h, d) {
  const uv = (ux, uy, uw, uh) => { const e = 0.02; return [(ux + e) / 64, (uy + e) / 64, (ux + uw - e) / 64, (uy + uh - e) / 64]; };
  const face = (TL, TR, BR, BL, r, n) => {
    const Vs = [[TL, r[0], r[1]], [TR, r[2], r[1]], [BR, r[2], r[3]], [BL, r[0], r[3]]];
    for (const i of [0, 1, 2, 0, 2, 3]) out.push(...Vs[i][0], Vs[i][1], Vs[i][2], ...n);
  };
  face([x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1], uv(u + d, v + d, w, h), [0, 0, 1]);              // delante (+z)
  face([x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0], uv(u + 2 * d + w, v + d, w, h), [0, 0, -1]);     // detrás
  face([x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0], uv(u, v + d, d, h), [-1, 0, 0]);                 // lado derecho del personaje
  face([x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1], uv(u + d + w, v + d, d, h), [1, 0, 0]);          // lado izquierdo
  face([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], uv(u + d, v, w, d), [0, 1, 0]);                  // arriba
  face([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], uv(u + d + w, v, w, d), [0, -1, 0]);             // abajo
}
/* Cada parte: pivote de reposo (px, y hacia arriba, z hacia el frente), caja, UV base y UV de la capa exterior */
function buildParts(slim) {
  const aw = slim ? 3 : 4;
  const defs = [
    { id: "head", pv: [0, 24, 0], b: [-4, 24, -4, 4, 32, 4], w: 8, h: 8, d: 8, uv: [0, 0], ov: [32, 0], inf: 0.5 },
    { id: "body", pv: [0, 24, 0], b: [-4, 12, -2, 4, 24, 2], w: 8, h: 12, d: 4, uv: [16, 16], ov: [16, 32], inf: 0.25 },
    { id: "rArm", pv: [-5, slim ? 21.5 : 22, 0], b: [-4 - aw, 12, -2, -4, 24, 2], w: aw, h: 12, d: 4, uv: [40, 16], ov: [40, 32], inf: 0.25 },
    { id: "lArm", pv: [5, slim ? 21.5 : 22, 0], b: [4, 12, -2, 4 + aw, 24, 2], w: aw, h: 12, d: 4, uv: [32, 48], ov: [48, 48], inf: 0.25 },
    { id: "rLeg", pv: [-1.9, 12, 0], b: [-4, 0, -2, 0, 12, 2], w: 4, h: 12, d: 4, uv: [0, 16], ov: [0, 32], inf: 0.25 },
    { id: "lLeg", pv: [1.9, 12, 0], b: [0, 0, -2, 4, 12, 2], w: 4, h: 12, d: 4, uv: [16, 48], ov: [0, 48], inf: 0.25 }
  ];
  return defs.map(p => {
    const a = [], [px, py, pz] = p.pv, [x0, y0, z0, x1, y1, z1] = p.b, i = p.inf;
    pushBox(a, x0 - px, y0 - py, z0 - pz, x1 - px, y1 - py, z1 - pz, p.uv[0], p.uv[1], p.w, p.h, p.d);
    pushBox(a, x0 - px - i, y0 - py - i, z0 - pz - i, x1 - px + i, y1 - py + i, z1 - pz + i, p.ov[0], p.ov[1], p.w, p.h, p.d);
    return { id: p.id, pv: p.pv, data: new Float32Array(a), n: a.length / 8 };
  });
}

/* ============================================================ Poses (fórmulas de ModelBiped, pasadas al sistema del visor) */
const W = (x, y, z, rx, ry, rz) => ({ p: [x, 24 - y, -z], r: [rx, -ry, -rz] });   // espacio del modelo de MC (y abajo, z atrás) → mundo (y arriba, z al frente)
function computePose({ age, sneak: s, sw, head, slim }) {
  const ay = slim ? 0.5 : 0, P = {};
  let bodyY = 0, rArm = { x: -5, y: 2 + ay + 3.2 * s, z: 0 }, lArm = { x: 5, y: 2 + ay + 3.2 * s, z: 0 };
  let rAx = Math.sin(age * 0.067) * 0.05 + 0.4 * s, lAx = -Math.sin(age * 0.067) * 0.05 + 0.4 * s;
  let rAy = 0, lAy = 0, rAz = Math.cos(age * 0.09) * 0.05 + 0.05, lAz = -(Math.cos(age * 0.09) * 0.05 + 0.05);
  if (sw > 0) {                                                                  // golpe con el brazo derecho (6 ticks)
    bodyY = Math.sin(Math.sqrt(sw) * Math.PI * 2) * 0.2;
    rArm.z = Math.sin(bodyY) * 5; rArm.x = -Math.cos(bodyY) * 5; lArm.z = -Math.sin(bodyY) * 5; lArm.x = Math.cos(bodyY) * 5;
    rAy += bodyY; lAy += bodyY; lAx += bodyY;
    let f = 1 - sw; f = 1 - f * f * f * f;
    const f1 = Math.sin(f * Math.PI), f2 = Math.sin(sw * Math.PI) * -(head.x - 0.7) * 0.75;
    rAx -= f1 * 1.2 + f2; rAy += bodyY * 2; rAz += Math.sin(sw * Math.PI) * -0.4;
  }
  P.head = W(0, 4.2 * s, 0, head.x, head.y, 0);
  P.body = W(0, 3.2 * s, 0, 0.5 * s, bodyY, 0);
  P.rArm = W(rArm.x, rArm.y, rArm.z, rAx, rAy, rAz);
  P.lArm = W(lArm.x, lArm.y, lArm.z, lAx, lAy, lAz);
  P.rLeg = W(-1.9, 12 + 0.2 * s, 0.1 + 3.9 * s, 0, 0, 0.005);
  P.lLeg = W(1.9, 12 + 0.2 * s, 0.1 + 3.9 * s, 0, 0, -0.005);
  return P;
}

/* ============================================================ "Cerebro": acciones aleatorias (idle / shift repetido / golpes / mirar alrededor) */
const rnd = (a, b) => a + Math.random() * (b - a);
export class Brain {
  constructor() { this.t = 0; this.sneak = 0; this.sneakT = 0; this.sw = 0; this.swinging = false; this.q = []; this.qt = 0; this.wait = rnd(1.4, 2.6); this.look = 0; this.lookT = 0; this.last = ""; }
  swing() { if (!this.swinging) { this.swinging = true; this.sw = 0.0001; } }
  push(fn, dt) { this.q.push({ fn, dt }); }
  pick() {
    const bag = ["sneak", "punch", "look", "sneak", "punch"].filter(a => a !== this.last); const a = bag[(Math.random() * bag.length) | 0]; this.last = a;
    if (a === "sneak") {                                                          // agacharse y pararse varias veces (shift)
      const n = 2 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) { this.push(() => this.sneakT = 1, rnd(0.16, 0.3)); this.push(() => this.sneakT = 0, rnd(0.16, 0.3)); }
      if (Math.random() < 0.4) { this.push(() => this.sneakT = 1, rnd(0.7, 1.3)); this.push(() => this.sneakT = 0, 0.1); }
    } else if (a === "punch") {                                                   // golpes seguidos
      const n = 1 + ((Math.random() * 4) | 0);
      for (let i = 0; i < n; i++) this.push(() => this.swing(), rnd(0.36, 0.5));
    } else { this.push(() => this.lookT = rnd(-0.7, 0.7), rnd(0.8, 1.4)); this.push(() => this.lookT = rnd(-0.7, 0.7), rnd(0.6, 1.1)); this.push(() => this.lookT = 0, 0.2); }
    this.wait = rnd(1.6, 4.2);
  }
  update(dt) {
    this.t += dt;
    if (this.q.length) { this.qt -= dt; if (this.qt <= 0) { const a = this.q.shift(); a.fn(); this.qt = a.dt; } }
    else { this.wait -= dt; if (this.wait <= 0) this.pick(); }
    this.sneak += (this.sneakT - this.sneak) * Math.min(1, dt * 20);
    if (this.swinging) { this.sw += dt / 0.3; if (this.sw >= 1) { this.swinging = false; this.sw = 0; } }
    this.look += (this.lookT - this.look) * Math.min(1, dt * 6);
  }
}

/* ============================================================ Renderizador */
const VS = `attribute vec3 aPos;attribute vec2 aUv;attribute vec3 aNrm;uniform mat4 uMvp;uniform mat4 uNm;varying vec2 vUv;varying float vSh;
void main(){gl_Position=uMvp*vec4(aPos,1.);vUv=aUv;vec3 n=normalize((uNm*vec4(aNrm,0.)).xyz);float up=n.y>0.?n.y*n.y:n.y*n.y*.5;vSh=n.x*n.x*.6+n.z*n.z*.8+up;}`;
const FS = `precision highp float;varying vec2 vUv;varying float vSh;uniform sampler2D uTex;uniform float uAppear,uFlash,uBlock;
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){vec4 c=texture2D(uTex,vUv);if(c.a<.1)discard;
if(uAppear<1.){float h=hs(floor(gl_FragCoord.xy/uBlock));if(h>uAppear)discard;}
vec3 col=c.rgb*(.3+.8*vSh);col=mix(col,vec3(.62,.3,1.),(1.-uAppear)*.55);col=mix(col,vec3(.9,.7,1.),uFlash);gl_FragColor=vec4(min(col,1.),1.);}`;

export function createPlayer(canvas) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
  if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);
  const loc = { p: gl.getAttribLocation(pr, "aPos"), u: gl.getAttribLocation(pr, "aUv"), n: gl.getAttribLocation(pr, "aNrm") };
  const U = n => gl.getUniformLocation(pr, n), uMvp = U("uMvp"), uNm = U("uNm"), uAppear = U("uAppear"), uFlash = U("uFlash"), uBlock = U("uBlock");
  const tex = gl.createTexture();
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  let parts = [], slim = false, ready = false, mats = null, cssW = 1, cssH = 1;
  const cam = { frac: 1.18, top: 0.84, sx: 0, yaw: 0.5, fov: 0.42 };

  function setSkin(sk, sl) {
    slim = !!sl; parts.forEach(p => gl.deleteBuffer(p.buf));
    parts = buildParts(slim).map(p => { p.buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, p.buf); gl.bufferData(gl.ARRAY_BUFFER, p.data, gl.STATIC_DRAW); return p; });
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glSkin(sk));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ready = true;
  }
  function size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1); cssW = canvas.clientWidth; cssH = canvas.clientHeight;
    const w = Math.max(2, Math.round(cssW * dpr)), h = Math.max(2, Math.round(cssH * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); return dpr;
  }
  function camera(o) {
    const asp = canvas.width / canvas.height, t = Math.tan(cam.fov / 2), d = 16 / (cam.frac * t), ty = 32 - cam.top * d * t;
    const pop = o.pop == null ? 1 : o.pop, e = (1 - pop) * (1 - pop);
    const P = M.mul(M.T(cam.sx, 0, 0), M.persp(cam.fov, asp, 1, 800)), V = M.T(0, -ty, -d);
    const Rr = M.mul(M.RX(-0.06), M.RY(cam.yaw)), root = M.mul(Rr, M.S(1 - 0.4 * e, 1 + 0.22 * e, 1 - 0.4 * e));
    return { PV: M.mul(P, V), root, Rr };
  }
  /* o: { appear 0..1, flash 0..1, pop 0..1, age (ticks), brain, head:{x,y}, yaw, frac, top, sx } */
  function aim(o) {                                                      // coloca la cámara (sin dibujar) para poder proyectar puntos
    size(); Object.assign(cam, { yaw: o.yaw ?? cam.yaw, frac: o.frac ?? cam.frac, top: o.top ?? cam.top, sx: o.sx ?? cam.sx }); mats = camera(o);
  }
  function draw(o) {
    aim(o); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!ready || o.appear <= 0.001) return;
    const b = o.brain, P = computePose({ age: o.age, sneak: b.sneak, sw: b.sw, head: o.head, slim });
    gl.uniform1f(uAppear, Math.min(1, o.appear)); gl.uniform1f(uFlash, o.flash || 0); gl.uniform1f(uBlock, Math.max(3, canvas.height / 90));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const p of parts) {
      const q = P[p.id], R = M.mul(M.RZ(q.r[2]), M.mul(M.RY(q.r[1]), M.RX(q.r[0])));
      const model = M.mul(mats.root, M.mul(M.T(q.p[0], q.p[1], q.p[2]), R));
      gl.uniformMatrix4fv(uMvp, false, M.mul(mats.PV, model)); gl.uniformMatrix4fv(uNm, false, M.mul(mats.Rr, R));
      gl.bindBuffer(gl.ARRAY_BUFFER, p.buf);
      gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(loc.u); gl.vertexAttribPointer(loc.u, 2, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 32, 20);
      gl.drawArrays(gl.TRIANGLES, 0, p.n);
    }
  }
  /* Punto del modelo (px, y arriba) → píxeles CSS del lienzo */
  function project(pt) {
    if (!mats) return { x: cssW / 2, y: cssH / 2 };
    const c = M.pt(M.mul(mats.PV, mats.root), pt);
    return { x: (c[0] / c[3] * 0.5 + 0.5) * cssW, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * cssH };
  }
  return { setSkin, draw, aim, project, get slim() { return slim; }, destroy() { try { gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch (e) {} } };
}
