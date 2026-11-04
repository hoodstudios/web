/* avatar.js — Avatar 3D de Minecraft (WebGL, sin librerías).
 * Modelo de jugador con proporciones normales (cabeza 8, cuerpo 12×8×4, brazos y piernas 12),
 * texturizado con la skin del jugador, dentro de una habitación hecha de bloques
 * (suelo de madera, paredes de cemento blanco).
 *
 *   createAvatar(canvas, { skinSources, slim })  -> habitación del perfil (se mueve solo, se puede acariciar)
 *   createAvatarSprite({ skinSources, slim })    -> avatar suelto para el minijuego (canvas con fondo transparente)
 *
 * Animaciones: idle, walk, dance, jump (el toque usa jump a 0.75×; el minijuego usa walk y jump a 1.5×).
 */

/* ===================== Matemáticas mínimas (mat4 en columnas) ===================== */
const M4 = {
  id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  T(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  S(x, y, z) { const o = M4.id(); o[0] = x; o[5] = y; o[10] = z; return o; },
  RX(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
  RY(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
  RZ(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o;
  },
  ortho(l, r, b, t, n, f) {
    const o = M4.id();
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); return o;
  },
  look(e, c, up) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const z = nrm(sub(e, c)), x = nrm(cr(up, z)), y = cr(z, x), o = M4.id();
    o[0] = x[0]; o[4] = x[1]; o[8] = x[2];
    o[1] = y[0]; o[5] = y[1]; o[9] = y[2];
    o[2] = z[0]; o[6] = z[1]; o[10] = z[2];
    o[12] = -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]);
    o[13] = -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]);
    o[14] = -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]);
    return o;
  },
  nm: m => new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]),
  vec(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
  }
};

/* ===================== Carga de la skin ===================== */
const loadImg = src => new Promise((ok, no) => {
  const i = new Image(); i.crossOrigin = "anonymous";
  i.onload = () => ok(i); i.onerror = () => no(new Error("img")); i.src = src;
});
async function loadFirst(list) {
  for (const s of list) { try { return await loadImg(s); } catch (e) { /* prueba la siguiente */ } }
  return null;
}

// Skin por defecto (por si ninguna fuente carga): un Steve sencillo, dibujado por código.
function defaultSkin() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), R = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  const SK = "#c08a62", HAIR = "#3b2a1a", SH = "#14a3a3", PA = "#3a3aa0", SO = "#6b6b6b";
  R(HAIR, 8, 0, 8, 8); R(SK, 16, 0, 8, 8);                                  // cabeza: arriba / abajo
  R(SK, 0, 8, 32, 8); R(HAIR, 0, 8, 32, 2); R(HAIR, 24, 8, 8, 8);            // lados, cara, nuca
  R(HAIR, 8, 8, 8, 2); R("#fff", 9, 12, 2, 1); R("#fff", 13, 12, 2, 1);
  R("#4a3fb0", 10, 12, 1, 1); R("#4a3fb0", 13, 12, 1, 1); R("#8a5a3c", 11, 14, 2, 1);
  R(SH, 16, 16, 24, 16);                                                       // torso
  R(PA, 0, 16, 16, 16); R(SO, 0, 30, 16, 2);                                   // pierna derecha
  R(PA, 16, 48, 16, 16); R(SO, 16, 62, 16, 2);                                 // pierna izquierda
  R(SK, 40, 16, 16, 16); R(SH, 40, 20, 16, 5);                                 // brazo derecho
  R(SK, 32, 48, 16, 16); R(SH, 32, 52, 16, 5);                                 // brazo izquierdo
  return c;
}

// Devuelve un canvas (64k × 64k) con la skin ya en formato moderno (convierte las de 64×32).
async function loadSkin(sources) {
  const img = await loadFirst(sources);
  if (!img) return defaultSkin();
  const k = Math.max(1, Math.round(img.width / 64));
  const c = document.createElement("canvas"); c.width = c.height = 64 * k;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  if (img.height < img.width) { // formato antiguo: la mitad de abajo (extremidades izquierdas) se copia, volteada
    const flip = (sx, sy, w, h, dx, dy) => {
      g.save(); g.translate((dx + w) * k, dy * k); g.scale(-1, 1);
      g.drawImage(c, sx * k, sy * k, w * k, h * k, 0, 0, w * k, h * k); g.restore();
    };
    const limb = (ox, oy, dx, dy) => {
      flip(ox + 4, oy, 4, 4, dx + 4, dy); flip(ox + 8, oy, 4, 4, dx + 8, dy);
      flip(ox, oy + 4, 4, 12, dx + 8, dy + 4); flip(ox + 4, oy + 4, 4, 12, dx + 4, dy + 4);
      flip(ox + 8, oy + 4, 4, 12, dx, dy + 4); flip(ox + 12, oy + 4, 4, 12, dx + 12, dy + 4);
    };
    limb(40, 16, 32, 48); limb(0, 16, 16, 48);
  }
  return c;
}

/* ===================== Geometría ===================== */
// Cada vértice: posición(3) + normal(3) + uv(2)
function pushQuad(out, o, u, v, n, uv) {
  const P = [o, [o[0] + u[0], o[1] + u[1], o[2] + u[2]],
    [o[0] + u[0] + v[0], o[1] + u[1] + v[1], o[2] + u[2] + v[2]], [o[0] + v[0], o[1] + v[1], o[2] + v[2]]];
  const UV = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  for (const i of [0, 1, 2, 0, 2, 3]) out.push(P[i][0], P[i][1], P[i][2], n[0], n[1], n[2], UV[i][0], UV[i][1]);
}
// Las 6 caras de un cubo con el origen en el centro: [ox,oy,oz, ux,uy,uz, vx,vy,vz, nx,ny,nz]
function faceDefs(hx, hy, hz) {
  return {
    front: [-hx, hy, hz, 2 * hx, 0, 0, 0, -2 * hy, 0, 0, 0, 1],
    back: [hx, hy, -hz, -2 * hx, 0, 0, 0, -2 * hy, 0, 0, 0, -1],
    right: [-hx, hy, -hz, 0, 0, 2 * hz, 0, -2 * hy, 0, -1, 0, 0],   // costado derecho del personaje (-x)
    left: [hx, hy, hz, 0, 0, -2 * hz, 0, -2 * hy, 0, 1, 0, 0],      // costado izquierdo (+x)
    top: [-hx, hy, -hz, 2 * hx, 0, 0, 0, 0, 2 * hz, 0, 1, 0],
    bottom: [-hx, -hy, hz, 2 * hx, 0, 0, 0, 0, -2 * hz, 0, -1, 0]
  };
}
function skinBox(u, v, w, h, d, inf) { // caja con UV de skin de Minecraft (origen u,v; tamaño w,h,d)
  const f = faceDefs(w / 2 + inf, h / 2 + inf, d / 2 + inf), out = [];
  const rect = {
    right: [u, v + d, d, h], front: [u + d, v + d, w, h], left: [u + d + w, v + d, d, h],
    back: [u + d + w + d, v + d, w, h], top: [u + d, v, w, d], bottom: [u + d + w, v, w, d]
  };
  for (const k in f) {
    const a = f[k], r = rect[k];
    pushQuad(out, [a[0], a[1], a[2]], [a[3], a[4], a[5]], [a[6], a[7], a[8]], [a[9], a[10], a[11]],
      [r[0] / 64, r[1] / 64, (r[0] + r[2]) / 64, (r[1] + r[3]) / 64]);
  }
  return new Float32Array(out);
}

/* Habitación: bloques de 16 unidades. Suelo de madera, paredes de cemento blanco. */
function buildRoom() {
  const blocks = new Map(), key = (i, j, k) => i + "," + j + "," + k;
  const add = (i, j, k, t) => blocks.set(key(i, j, k), { i, j, k, t });
  for (let i = -5; i <= 5; i++) for (let k = -4; k <= 3; k++) add(i, -1, k, "wood");              // suelo
  for (let j = 0; j <= 3; j++) {
    for (let i = -5; i <= 5; i++) add(i, j, -4, "conc");                                           // pared del fondo
    for (let k = -3; k <= 3; k++) { add(-5, j, k, "conc"); add(5, j, k, "conc"); }                 // paredes laterales
  }
  const out = { wood: [], conc: [] };
  const dirs = [["front", 0, 0, 1], ["back", 0, 0, -1], ["right", -1, 0, 0], ["left", 1, 0, 0], ["top", 0, 1, 0], ["bottom", 0, -1, 0]];
  const F = faceDefs(8, 8, 8);
  for (const b of blocks.values()) for (const [name, dx, dy, dz] of dirs) {
    if (blocks.has(key(b.i + dx, b.j + dy, b.k + dz))) continue; // cara tapada por otro bloque
    const a = F[name], cx = b.i * 16, cy = b.j * 16 + 8, cz = b.k * 16;
    pushQuad(out[b.t], [a[0] + cx, a[1] + cy, a[2] + cz], [a[3], a[4], a[5]], [a[6], a[7], a[8]], [a[9], a[10], a[11]], [0, 0, 1, 1]);
  }
  return { wood: new Float32Array(out.wood), conc: new Float32Array(out.conc) };
}

/* ===================== Núcleo de render ===================== */
const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec2 aU;uniform mat4 uVP;uniform mat4 uM;uniform mat3 uNM;
varying vec2 vU;varying vec3 vN;void main(){gl_Position=uVP*uM*vec4(aP,1.0);vN=uNM*aN;vU=aU;}`;
const FS = `precision mediump float;varying vec2 vU;varying vec3 vN;uniform sampler2D uT;uniform float uLit,uEdge,uA,uCut;
void main(){vec4 c=texture2D(uT,vU);if(uCut>0.5&&c.a<0.1)discard;float s=1.0;
if(uLit>0.5){float d=dot(normalize(vN),normalize(vec3(-0.35,0.8,0.5)));s=clamp(0.62+0.38*d,0.5,1.0);}
if(uEdge>0.5){vec2 f=min(vU,1.0-vU);float e=min(f.x,f.y);s*=mix(0.82,1.0,smoothstep(0.0,0.055,e));}
gl_FragColor=vec4(c.rgb*s,c.a*uA);}`;

const HEART = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"];
const ASSET = n => new URL("img/" + n, import.meta.url).href;

// Partes del cuerpo: [clave, u, v, w, h, d, inflado, articulación]
function partList(slim) {
  const aw = slim ? 3 : 4;
  return [
    ["head", 0, 0, 8, 8, 8, 0, "head"], ["hat", 32, 0, 8, 8, 8, 0.5, "head"],
    ["body", 16, 16, 8, 12, 4, 0, "body"], ["jacket", 16, 32, 8, 12, 4, 0.25, "body"],
    ["armR", 40, 16, aw, 12, 4, 0, "armR"], ["sleeveR", 40, 32, aw, 12, 4, 0.25, "armR"],
    ["armL", 32, 48, aw, 12, 4, 0, "armL"], ["sleeveL", 48, 48, aw, 12, 4, 0.25, "armL"],
    ["legR", 0, 16, 4, 12, 4, 0, "legR"], ["pantsR", 0, 32, 4, 12, 4, 0.25, "legR"],
    ["legL", 16, 48, 4, 12, 4, 0, "legL"], ["pantsL", 0, 48, 4, 12, 4, 0.25, "legL"]
  ];
}

function makeCore(canvas, skinCanvas, slim, { room = false, preserve = false } = {}) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: preserve });
  if (!gl) return null;
  const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, "aP"); gl.bindAttribLocation(prog, 1, "aN"); gl.bindAttribLocation(prog, 2, "aU");
  gl.linkProgram(prog); gl.useProgram(prog);
  const U = n => gl.getUniformLocation(prog, n);
  const u = { VP: U("uVP"), M: U("uM"), NM: U("uNM"), Lit: U("uLit"), Edge: U("uEdge"), A: U("uA"), Cut: U("uCut") };
  for (let i = 0; i < 3; i++) gl.enableVertexAttribArray(i);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  const textures = [], buffers = [];
  let dead = false;
  const mkTex = src => {
    const t = gl.createTexture(); textures.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([160, 160, 160, 255]));
    return t;
  };
  const mkBuf = data => { const b = gl.createBuffer(); buffers.push(b); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); return { b, n: data.length / 8 }; };
  const lazyTex = file => { // textura de bloque: gris hasta que carga la imagen
    const t = mkTex(null), im = new Image();
    im.onload = () => { if (dead) return; gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); };
    im.src = ASSET(file); return t;
  };

  const skinTex = mkTex(skinCanvas);
  const parts = partList(slim).map(p => ({ joint: p[7], mesh: mkBuf(skinBox(p[1], p[2], p[3], p[4], p[5], p[6])) }));
  const quad = (() => { const o = []; pushQuad(o, [-0.5, 0.5, 0], [1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, 1, 1]); return mkBuf(new Float32Array(o)); })();
  let roomMeshes = null, woodTex = null, concTex = null;
  if (room) { const r = buildRoom(); roomMeshes = { wood: mkBuf(r.wood), conc: mkBuf(r.conc) }; woodTex = lazyTex("madera.png"); concTex = lazyTex("cemento.png"); }
  const heartTex = (() => {
    const c = document.createElement("canvas"); c.width = 7; c.height = 6; const g = c.getContext("2d");
    HEART.forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") { g.fillStyle = j === 1 && (i === 1 || i === 2) ? "#ffb3c4" : "#ff4f74"; g.fillRect(i, j, 1, 1); } }));
    return mkTex(c);
  })();
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return mkTex(c);
  })();

  function draw(mesh, tex, M, o = {}) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniformMatrix4fv(u.M, false, M); gl.uniformMatrix3fv(u.NM, false, M4.nm(M));
    gl.uniform1f(u.Lit, o.lit === false ? 0 : 1); gl.uniform1f(u.Edge, o.edge ? 1 : 0);
    gl.uniform1f(u.A, o.a === undefined ? 1 : o.a); gl.uniform1f(u.Cut, o.cut ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  }

  // Dibuja al personaje. root = matriz base; p = pose (ángulos en radianes)
  function drawChar(root, p) {
    const aw = slim ? 3 : 4;
    const base = M4.mul(root, M4.T(0, p.y || 0, 0));
    const upper = M4.mul(M4.mul(M4.mul(base, M4.T(0, 12, 0)), M4.RY(p.twist || 0)), M4.RX(-(p.lean || 0)));
    const J = {
      body: M4.mul(upper, M4.T(0, 6, 0)),
      head: M4.mul(M4.mul(M4.mul(M4.mul(upper, M4.T(0, 12, 0)), M4.RY(p.headY || 0)), M4.mul(M4.RX(-(p.headX || 0)), M4.RZ(p.headZ || 0))), M4.T(0, 4, 0)),
      armR: M4.mul(M4.mul(M4.mul(upper, M4.T(-(4 + aw / 2), 10, 0)), M4.mul(M4.RZ(-(p.zR || 0)), M4.RX(-(p.xR || 0)))), M4.T(0, -4, 0)),
      armL: M4.mul(M4.mul(M4.mul(upper, M4.T(4 + aw / 2, 10, 0)), M4.mul(M4.RZ(p.zL || 0), M4.RX(-(p.xL || 0)))), M4.T(0, -4, 0)),
      legR: M4.mul(M4.mul(M4.mul(base, M4.T(-2, 12, 0)), M4.mul(M4.RZ(-(p.lzR || 0)), M4.RX(-(p.lR || 0)))), M4.T(0, -6, 0)),
      legL: M4.mul(M4.mul(M4.mul(base, M4.T(2, 12, 0)), M4.mul(M4.RZ(p.lzL || 0), M4.RX(-(p.lL || 0)))), M4.T(0, -6, 0))
    };
    gl.depthMask(true);
    for (const pt of parts) draw(pt.mesh, skinTex, J[pt.joint], { cut: true });
  }

  function resize(w, h) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
  }
  function clear(bg) {
    if (bg) gl.clearColor(bg[0], bg[1], bg[2], 1); else gl.clearColor(0, 0, 0, 0);
    gl.depthMask(true); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }
  function setVP(VP) { gl.uniformMatrix4fv(u.VP, false, VP); core.VP = VP; }

  const core = {
    VP: M4.id(),
    // Habitación completa. s = { x, z, face, yaw, pose, hearts }
    drawRoom(w, h, s) {
      resize(w, h); clear(null);
      setVP(M4.mul(M4.persp(0.56, w / h, 20, 900), M4.look([0, 122, 268], [0, 20, -6], [0, 1, 0])));
      draw(roomMeshes.wood, woodTex, M4.id(), { edge: true });
      draw(roomMeshes.conc, concTex, M4.id(), { edge: true });
      const lift = Math.max(0, Math.min(1, (s.pose.y || 0) / 12));
      gl.depthMask(false); // sombra
      draw(quad, shadowTex, M4.mul(M4.T(s.x, 0.15, s.z), M4.mul(M4.RX(-Math.PI / 2), M4.S(22 - lift * 6, 14 - lift * 4, 1))), { lit: false, a: 1 - lift * 0.4 });
      drawChar(M4.mul(M4.mul(M4.T(s.x, 0, s.z), M4.S(s.face, 1, 1)), M4.RY(s.yaw)), s.pose);
      gl.depthMask(false); // corazones
      for (const hh of s.hearts) {
        if (hh.age < 0) continue;
        const a = Math.max(0, Math.min(1, (hh.life - hh.age) / 0.35));
        draw(quad, heartTex, M4.mul(M4.T(hh.x, hh.y, hh.z), M4.S(7.7, 6.6, 1)), { lit: false, a });
      }
      gl.depthMask(true);
    },
    // Personaje solo, con cámara ortográfica. view = { yaw, pitch, face }
    drawSolo(w, h, pose, view, bg, half, cy) {
      resize(w, h); clear(bg);
      const V = M4.mul(M4.mul(M4.T(0, 0, -80), M4.RX(view.pitch)), M4.T(0, -cy, 0));
      setVP(M4.mul(M4.ortho(-half, half, -half * h / w, half * h / w, 1, 200), V));
      drawChar(M4.mul(M4.S(view.face || 1, 1, 1), M4.RY(view.yaw)), pose);
    },
    // posición en pantalla (px CSS relativos al canvas) de un punto del mundo
    project(x, y, z, cssW, cssH) {
      const v = M4.vec(core.VP, x, y, z); return [(v[0] / v[3] * 0.5 + 0.5) * cssW, (1 - (v[1] / v[3] * 0.5 + 0.5)) * cssH];
    },
    dispose() {
      dead = true;
      textures.forEach(t => gl.deleteTexture(t)); buffers.forEach(b => gl.deleteBuffer(b));
      const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext();
    }
  };
  return core;
}

/* ===================== Animaciones ===================== */
// anim: idle | walk | dance | jump. t = tiempo de la animación (ya multiplicado por su velocidad).
const TAU = Math.PI * 2;
const easeOut = x => 1 - (1 - x) * (1 - x);
function poseFor(anim, t) {
  const p = { y: 0, lean: 0, twist: 0, headX: 0, headY: 0, headZ: 0, xR: 0, xL: 0, zR: 0.05, zL: 0.05, lR: 0, lL: 0, lzR: 0, lzL: 0 };
  if (anim === "idle") {
    const b = Math.sin(t * 2.0);
    p.zR = p.zL = 0.06 + b * 0.035; p.headY = Math.sin(t * 0.8) * 0.22; p.headX = Math.sin(t * 1.3) * 0.04;
    p.xR = Math.sin(t * 1.1) * 0.03; p.xL = -p.xR;
  } else if (anim === "walk") {
    const s = Math.sin(t * TAU), A = 0.85;
    p.lR = s * A; p.lL = -s * A; p.xR = -s * 0.75; p.xL = s * 0.75;
    p.y = -12 * (1 - Math.cos(A * Math.abs(s)));
    p.twist = s * 0.07; p.headY = -s * 0.05; p.zR = p.zL = 0.04;
  } else if (anim === "dance") {
    const ph = t * TAU * 2.1, s = Math.sin(ph), c = Math.cos(ph);
    p.y = Math.abs(s) * 3.2;
    p.zR = 2.45 + c * 0.45; p.zL = 2.45 - c * 0.45;               // brazos arriba, alternando
    p.xR = s * 0.35; p.xL = -s * 0.35;
    p.lR = Math.max(0, s) * 0.55; p.lL = Math.max(0, -s) * 0.55;   // levanta una pierna y luego la otra
    p.lzR = Math.max(0, s) * 0.2; p.lzL = Math.max(0, -s) * 0.2;
    p.twist = c * 0.45; p.headY = -c * 0.35; p.headZ = s * 0.18; p.lean = 0.08 + Math.abs(s) * 0.08;
  } else if (anim === "jump") {
    const q = Math.max(0, Math.min(1, t / 0.9));
    if (q < 0.14) { // se agacha y echa los brazos atrás
      const k = easeOut(q / 0.14);
      p.y = -2.4 * k; p.xR = p.xL = -0.7 * k; p.lR = p.lL = 0.25 * k; p.lean = 0.12 * k;
    } else if (q < 0.86) { // en el aire: brazos arriba, piernas separadas
      const a = (q - 0.14) / 0.72, e = Math.sqrt(Math.sin(Math.PI * a));
      p.y = Math.sin(Math.PI * a) * 12; p.zR = p.zL = 0.1 + 2.2 * e; p.xR = p.xL = -0.1 * e;
      p.lR = 0.45 * e; p.lL = -0.3 * e; p.lzR = p.lzL = 0.12 * e; p.headX = -0.12 * e;
    } else { // aterriza
      const k = Math.sin(Math.PI * (q - 0.86) / 0.14);
      p.y = -2 * k; p.xR = p.xL = -0.3 * k; p.zR = p.zL = 0.1 + 0.3 * (1 - (q - 0.86) / 0.14);
    }
  }
  return p;
}

/* ===================== Avatar de la habitación (perfil) ===================== */
const ROOM_W = 8 / 5; // proporción del canvas
const BOUND = { x: 56, zMin: -42, zMax: 44 };

export function createAvatar(canvas, { skinSources = [], slim = false } = {}) {
  let alive = true, core = null, raf = 0, last = 0, skinC = null;
  const st = { mode: "idle", t: 0, at: 0, x: 0, z: 14, tx: 0, tz: 14, face: 1, yaw: 0.55, next: 1.2, anim: "idle", speed: 1, dur: 0 };
  const hearts = [];

  function go(mode, speed = 1) {
    st.mode = mode; st.t = 0; st.at = 0; st.speed = speed;
    st.anim = mode === "pet" ? "jump" : mode;
    if (mode === "idle") st.next = 1.4 + Math.random() * 2.4;
  }
  function pick() {
    const r = Math.random();
    if (r < 0.58) {
      go("walk");
      st.tx = (Math.random() * 2 - 1) * BOUND.x; st.tz = BOUND.zMin + Math.random() * (BOUND.zMax - BOUND.zMin);
      if (Math.hypot(st.tx - st.x, st.tz - st.z) < 14) st.tx = -Math.sign(st.x || 1) * (20 + Math.random() * 30);
    } else if (r < 0.78) { go("dance"); st.dur = 3.2 + Math.random() * 2.8; }
    else go("idle");
  }
  function update(dt) {
    st.t += dt; st.at += dt * st.speed;
    for (const h of hearts) { h.age += dt; if (h.age > 0) { h.y += 15 * dt; h.x += h.vx * dt; } }
    while (hearts.length && hearts[0].age >= hearts[0].life) hearts.shift();
    let yawT = 0.55;
    if (st.mode === "walk") {
      const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz), step = 34 * dt;
      if (Math.abs(dx) > 1.5) st.face = Math.sign(dx);
      yawT = 1.45;
      if (d <= step) { st.x = st.tx; st.z = st.tz; go("idle"); }
      else { st.x += dx / d * step; st.z += dz / d * step; }
    } else if (st.mode === "dance") { if (st.t > st.dur) go("idle"); }
    else if (st.mode === "pet") { if (st.at > 0.9) go("idle"); }
    else if (st.mode === "idle" && st.t > st.next) pick();
    st.yaw += (yawT - st.yaw) * Math.min(1, dt * 9);
  }
  function render() {
    if (!core) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), cw = canvas.clientWidth;
    if (!cw) return;
    const w = Math.min(1600, Math.round(cw * dpr)), h = Math.round(w / ROOM_W);
    core.drawRoom(w, h, { x: st.x, z: st.z, face: st.face, yaw: st.yaw, pose: poseFor(st.anim, st.at), hearts });
  }
  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    update(dt); render(); raf = requestAnimationFrame(frame);
  }

  // ¿el puntero está sobre el personaje?
  function hit(e) {
    if (!core) return false;
    const r = canvas.getBoundingClientRect(); if (!r.width) return false;
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const [fx, fy] = core.project(st.x, 0, st.z, r.width, r.height), [, hy] = core.project(st.x, 33, st.z, r.width, r.height);
    const ht = fy - hy, hw = ht * 0.34;
    return Math.abs(px - fx) < hw && py > hy - ht * 0.1 && py < fy + ht * 0.06;
  }
  function onDown(e) {
    if (!hit(e)) return; // tocar el suelo no hace nada: solo se puede acariciar al personaje
    e.preventDefault();
    go("pet", 0.75);    // salto a 0.75× + corazones
    for (let i = 0; i < 4; i++) hearts.push({ x: st.x + (i - 1.5) * 6 + (Math.random() - .5) * 3, y: 38 + i * 5, z: st.z + 12, vx: (Math.random() - .5) * 6, age: -i * 0.13, life: 1.5 });
  }
  function onMove(e) { if (e.pointerType === "mouse") canvas.style.cursor = hit(e) ? "pointer" : "default"; }
  canvas.style.touchAction = "manipulation";
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);

  loadSkin(skinSources).then(sk => {
    if (!alive) return;
    skinC = sk;
    core = makeCore(canvas, sk, slim, { room: true });
    if (core) raf = requestAnimationFrame(frame); // se anima siempre (en escritorio fallaba con "reducir movimiento")
  });

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      if (core) core.dispose(); core = null;
    },
    // Descarga solo al personaje (sin habitación), en 3/4, con el fondo elegido.
    download(size = 512, background = "transparent") {
      if (!skinC) return;
      const cv = document.createElement("canvas"); cv.width = cv.height = size;
      const c = makeCore(cv, skinC, slim, { preserve: true }); if (!c) return;
      let bg = null;
      if (background !== "transparent") { const n = parseInt(background.slice(1), 16); bg = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }
      c.drawSolo(size, size, poseFor("idle", 0.4), { yaw: 0.5, pitch: 0.16, face: 1 }, bg, 24, 16);
      const a = document.createElement("a"); a.download = `hood-avatar-${size}.png`; a.href = cv.toDataURL("image/png"); a.click();
      c.dispose();
    }
  };
}

/* ===================== Avatar suelto (minijuego) ===================== */
// Canvas transparente con el personaje de perfil, mirando siempre a la derecha.
export function createAvatarSprite({ skinSources = [], slim = false, size = 192 } = {}) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  let alive = true, core = null, anim = "idle", speed = 1, at = 0;
  const api = {
    canvas, ready: false,
    play(a, s = 1) { anim = a; speed = s; at = 0; },
    render(dt) {
      if (!core) return false;
      at += dt * speed;
      const p = poseFor(anim, at); p.y = 0; // la altura del salto la pone el juego
      core.drawSolo(size, size, p, { yaw: 1.4, pitch: 0.12, face: 1 }, null, 20, 16);
      return true;
    },
    destroy() { alive = false; if (core) core.dispose(); core = null; api.ready = false; }
  };
  loadSkin(skinSources).then(sk => {
    if (!alive) return;
    core = makeCore(canvas, sk, slim, { preserve: true }); api.ready = !!core;
  });
  return api;
}
