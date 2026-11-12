/* HOOD STUDIO — Habitación isométrica (3D) con el avatar en 2D.
 * - Cámara ortográfica isométrica (Three.js local): suelo de madera, paredes de cemento, ventana y cuadros, todo en bloques.
 * - El avatar sigue siendo un sprite 2D (los mismos fotogramas de siempre) que pasea, baila y salta entre muebles 3D.
 * - Muebles y mascotas son modelos de voxels hechos por código (sin archivos). Se eligen por "kind" en las tiendas del Mercado.
 * API: createRoom(canvas, opts) · modelThumb(cat, kind) · modelPreview(canvas, cat, kind) · FURN / PETS (catálogo de modelos). */
import * as THREE from "./vendor/three.module.js";
import { createFigureSet, loadSkin, ANIMS, exportAvatar } from "./avatar.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), lerp = (a, b, t) => a + (b - a) * t;
const ROOM = 8, WALLH = 3, PXU = 48, ISO_V = 1.1;                       // sala 8×8 bloques, paredes de 3, 1 bloque = 48 px de sprite
const BOX = new THREE.BoxGeometry(1, 1, 1), mats = {}, emats = {};
const L = c => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
const EM = c => emats[c] || (emats[c] = new THREE.MeshBasicMaterial({ color: c }));
const bx = (g, w, h, d, x, y, z, c, o = {}) => { const m = new THREE.Mesh(BOX, o.em ? EM(c) : L(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); if (o.r) m.rotation.set(...o.r); g.add(m); return m; };

/* ---------------- catálogo de modelos (huella w×d en bloques, "place" = dónde se coloca solo) ---------------- */
const WD = 0x8a5a2b, WD2 = 0x6d4620, WH = 0xf2f2f2;
export const FURN = {
  bed: { name: "Cama", w: 2, d: 3, place: "wallN", build(g) {
    bx(g, 2, .3, 3, 0, .1, 0, WD); bx(g, 1.84, .2, 2.7, 0, .4, .02, WH); bx(g, 1.86, .23, 1.7, 0, .42, .5, 0xc0392b); bx(g, 1.2, .12, .5, 0, .6, -1.0, 0xffffff); bx(g, 2, .95, .12, 0, .1, -1.44, WD2); bx(g, 2, .45, .12, 0, .1, 1.44, WD2);
    for (const sx of [-.95, .95]) for (const sz of [-1.4, 1.4]) bx(g, .1, .1, .1, sx, 0, sz, WD2); } },
  sofa: { name: "Sofá", w: 3, d: 1.2, place: "wallN", build(g) {
    bx(g, 3, .45, 1.2, 0, .1, 0, 0x3f6fb5); bx(g, 1.2, .2, .85, -.7, .55, .12, 0x4f82cc); bx(g, 1.2, .2, .85, .7, .55, .12, 0x4f82cc); bx(g, 3, .85, .3, 0, .1, -.45, 0x355f9f);
    for (const sx of [-1.4, 1.4]) bx(g, .24, .65, 1.2, sx, .1, 0, 0x2f5390); for (const sx of [-1.35, 1.35]) for (const sz of [-.5, .5]) bx(g, .08, .1, .08, sx, 0, sz, 0x2b2b2b); } },
  bookshelf: { name: "Librería", w: 2, d: .6, place: "wallN", build(g) {
    bx(g, 2, 2.3, .08, 0, 0, -.26, WD2); for (const sx of [-.96, .96]) bx(g, .08, 2.3, .6, sx, 0, 0, WD); for (const y of [0, .72, 1.44, 2.22]) bx(g, 2, .08, .6, 0, y, 0, WD);
    const cols = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0xecf0f1];
    for (const y of [.08, .8, 1.52]) { let x = -.88; for (let i = 0; i < 9 && x < .85; i++) { const w = rnd(.12, .22), h = rnd(.45, .62); bx(g, w, h, .36, x + w / 2, y, -.04, cols[(i * 3 + Math.floor(y * 5)) % cols.length]); x += w + .015; } } } },
  tv: { name: "Tele", w: 2, d: .8, place: "wallN", build(g) {
    bx(g, 2, .5, .7, 0, 0, 0, WD2); bx(g, 1.9, .04, .6, 0, .5, 0, WD); bx(g, .1, .12, .1, 0, .54, -.1, 0x222222); bx(g, 1.6, .9, .08, 0, .64, -.1, 0x15161a); bx(g, 1.48, .78, .02, 0, .7, -.05, 0x3b8cff, { em: true }); bx(g, .5, .08, .02, -.3, 1.2, -.04, 0x9fd0ff, { em: true }); } },
  desk: { name: "Escritorio", w: 2, d: 1.4, place: "wallN", build(g) {
    bx(g, 2, .08, .9, 0, .75, -.2, WD); for (const sx of [-.92, .92]) bx(g, .08, .75, .85, sx, 0, -.2, WD2);
    bx(g, .75, .45, .06, 0, 1.05, -.45, 0x15161a); bx(g, .65, .35, .02, 0, 1.1, -.42, 0x5cc8ff, { em: true }); bx(g, .1, .3, .1, 0, .83, -.45, 0x222222); bx(g, .55, .03, .2, 0, .83, -.05, 0x2b2d33);
    bx(g, .55, .08, .55, 0, .45, .55, 0xc0392b); bx(g, .55, .5, .08, 0, .5, .8, 0xa93226); bx(g, .08, .45, .08, 0, 0, .55, 0x222222); } },
  plant: { name: "Planta", w: .7, d: .7, place: "floor", build(g) {
    bx(g, .4, .38, .4, 0, 0, 0, 0xb5623a); bx(g, .44, .06, .44, 0, .38, 0, 0x9a4f2d); bx(g, .06, .5, .06, 0, .4, 0, 0x2d6a2d);
    for (const [x, y, z, s] of [[0, .85, 0, .5], [-.2, .7, .1, .34], [.2, .75, -.1, .34], [.05, 1.1, .05, .3], [-.1, .62, -.2, .28]]) bx(g, s, s * .7, s, x, y, z, y > 1 ? 0x45a04a : 0x2f8a3a); } },
  lamp: { name: "Lámpara", w: .5, d: .5, place: "floor", build(g) {
    bx(g, .34, .06, .34, 0, 0, 0, 0x2b2b2b); bx(g, .06, 1.35, .06, 0, .06, 0, 0x3a3a3a); bx(g, .46, .36, .46, 0, 1.38, 0, 0xffe7a0, { em: true }); bx(g, .5, .05, .5, 0, 1.74, 0, 0xd9b95a); } },
  rug: { name: "Alfombra", w: 3, d: 2, place: "rug", flat: true, build(g) {
    bx(g, 3, .03, 2, 0, 0, 0, 0xd8ccb0); bx(g, 2.7, .035, 1.7, 0, 0, 0, 0xb5362e); bx(g, 2.3, .04, 1.3, 0, 0, 0, 0xe8dcbc); bx(g, 1.9, .045, .9, 0, 0, 0, 0x3a6fb5); } }
};
export const PETS = {
  cat: { name: "Gato", build(g) {
    const c = 0xe0903a; bx(g, .22, .2, .46, 0, .13, 0, c); bx(g, .2, .18, .2, 0, .26, .3, c); bx(g, .06, .07, .06, -.07, .43, .3, c); bx(g, .06, .07, .06, .07, .43, .3, c); bx(g, .06, .06, .3, 0, .2, -.34, c, { r: [.6, 0, 0] });
    for (const [x, z] of [[-.07, .15], [.07, .15], [-.07, -.15], [.07, -.15]]) bx(g, .06, .13, .06, x, 0, z, 0xf5e6c8); bx(g, .04, .04, .02, -.05, .32, .405, 0x111111); bx(g, .04, .04, .02, .05, .32, .405, 0x111111); bx(g, .24, .06, .2, 0, .17, .08, 0xfff1d6); } },
  dog: { name: "Perro", build(g) {
    const c = 0x9a6a3a; bx(g, .28, .26, .56, 0, .2, 0, c); bx(g, .24, .22, .24, 0, .36, .36, c); bx(g, .14, .12, .16, 0, .34, .52, 0xd9b48a); bx(g, .06, .16, .08, -.14, .34, .32, 0x5a3a1a); bx(g, .06, .16, .08, .14, .34, .32, 0x5a3a1a); bx(g, .05, .05, .22, 0, .34, -.36, c, { r: [-.5, 0, 0] });
    for (const [x, z] of [[-.09, .2], [.09, .2], [-.09, -.2], [.09, -.2]]) bx(g, .08, .2, .08, x, 0, z, 0x7a4f26); bx(g, .05, .05, .02, -.06, .42, .485, 0x111111); bx(g, .05, .05, .02, .06, .42, .485, 0x111111); bx(g, .06, .05, .02, 0, .4, .6, 0x111111); } },
  slime: { name: "Slime", build(g) {
    const o = new THREE.Mesh(BOX, new THREE.MeshLambertMaterial({ color: 0x6fd05a, transparent: true, opacity: .78 })); o.scale.set(.56, .5, .56); o.position.y = .25; g.add(o); g.userData.squash = o;
    bx(g, .3, .26, .3, 0, .12, 0, 0x4aa63c); bx(g, .1, .1, .03, -.12, .3, .29, 0x1a3a14); bx(g, .1, .1, .03, .12, .3, .29, 0x1a3a14); bx(g, .1, .04, .03, 0, .14, .29, 0x1a3a14); } },
  chicken: { name: "Pollo", build(g) {
    bx(g, .3, .3, .36, 0, .2, 0, 0xf4f4f4); bx(g, .2, .26, .2, 0, .4, .2, 0xffffff); bx(g, .1, .06, .12, 0, .5, .34, 0xf0a030); bx(g, .06, .1, .06, 0, .32, .31, 0xd63a2a); bx(g, .06, .08, .1, 0, .66, .2, 0xd63a2a);
    bx(g, .06, .16, .22, -.17, .2, -.02, 0xe6e6e6); bx(g, .06, .16, .22, .17, .2, -.02, 0xe6e6e6); for (const x of [-.07, .07]) bx(g, .04, .2, .04, x, 0, 0, 0xf0b030); bx(g, .04, .04, .02, -.06, .5, .305, 0x111111); bx(g, .04, .04, .02, .06, .5, .305, 0x111111); } }
};
/* ---------------- texturas de bloque (pintadas por código, 16×16) ---------------- */
const rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const hexRGB = c => [(c >> 16) & 255, (c >> 8) & 255, c & 255], cssRGB = (c, j = 0) => `rgb(${clamp(c[0] + j, 0, 255)},${clamp(c[1] + j, 0, 255)},${clamp(c[2] + j, 0, 255)})`;
const TEXD = {
  spruce: { name: "Roble oscuro", c: 0x5b3f22, p: "planks", v: 12 }, birch: { name: "Abedul", c: 0xd6c58f, p: "planks", v: 10 }, oak: { name: "Roble", c: 0xa07a45, p: "planks", v: 10 },
  stone: { name: "Piedra", c: 0x808080, p: "noise", v: 16 }, cobble: { name: "Adoquín", c: 0x777777, p: "cobble", v: 20 }, brick: { name: "Ladrillos", c: 0x96513f, p: "brick", v: 12, m: 0xb9b0a4 },
  sandstone: { name: "Arenisca", c: 0xdccf9a, p: "noise", v: 7 }, quartz: { name: "Cuarzo", c: 0xece7df, p: "noise", v: 5 }, deepslate: { name: "Pizarra", c: 0x3f3f46, p: "tile", v: 9, m: 0x26262c },
  grass: { name: "Césped", c: 0x5aa042, p: "noise", v: 20 }, netherbrick: { name: "Ladrillo del Nether", c: 0x3b1c20, p: "brick", v: 7, m: 0x22100f }, checker: { name: "Ajedrez", c: 0xeeeeee, p: "checker", c2: 0x222222 },
  woolwhite: { name: "Lana blanca", c: 0xe8e8e8, p: "wool", v: 5 }, woolred: { name: "Lana roja", c: 0xa5322d, p: "wool", v: 5 }, woolblue: { name: "Lana azul", c: 0x3a4fb0, p: "wool", v: 5 }, woolyellow: { name: "Lana amarilla", c: 0xe8c534, p: "wool", v: 5 },
  prismarine: { name: "Prismarina", c: 0x5ba89a, p: "noise", v: 12 }, terracotta: { name: "Terracota", c: 0xa65a3a, p: "noise", v: 6 }
};
const FLOORS = ["spruce", "birch", "stone", "cobble", "brick", "sandstone", "quartz", "deepslate", "grass", "checker", "netherbrick", "terracotta"];
const WALLS = ["brick", "stone", "cobble", "sandstone", "quartz", "oak", "spruce", "birch", "woolwhite", "woolred", "woolblue", "woolyellow", "prismarine", "deepslate", "terracotta"];
const texCv = {};
function texCanvas(key) {
  if (texCv[key]) return texCv[key];
  const d = TEXD[key], c = document.createElement("canvas"); c.width = c.height = 16; const g = c.getContext("2d"), r = rng([...key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)), base = hexRGB(d.c), m = d.m != null ? hexRGB(d.m) : null, c2 = d.c2 != null ? hexRGB(d.c2) : null, v = d.v || 0;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let col = base, j = Math.round((r() - .5) * v * 2);
    if (d.p === "planks") { const b = y >> 2; j += ((b * 37) % 11 - 5) * 2; if (y % 4 === 3) j -= 30; if (x === (b * 5 + 3) % 16) j -= 30; }
    else if (d.p === "brick") { if (y % 4 === 3 || (x + ((y >> 2) % 2) * 4) % 8 === 7) { col = m; j = Math.round((r() - .5) * 8); } }
    else if (d.p === "cobble") { if (r() < .14) j -= 38; else if (r() < .1) j += 22; }
    else if (d.p === "tile") { if (x % 8 === 7 || y % 8 === 7) { col = m; j = 0; } }
    else if (d.p === "checker") { col = ((x >> 3) + (y >> 3)) % 2 ? c2 : base; j = Math.round((r() - .5) * 8); }
    g.fillStyle = cssRGB(col, j); g.fillRect(x, y, 1, 1);
  }
  return (texCv[key] = c);
}
const texMap = {};
function texFor(key, rx, ry) {
  const k = key + rx + "x" + ry; if (texMap[k]) return texMap[k];
  const t = new THREE.CanvasTexture(texCanvas(key)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return (texMap[k] = t);
}
const texThumbs = {};
function texThumb(key, size = 72) {
  const k = key + size; if (texThumbs[k]) return texThumbs[k];
  const c = document.createElement("canvas"); c.width = c.height = size; const g = c.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(texCanvas(key), 0, 0, size, size); return (texThumbs[k] = c.toDataURL("image/png"));
}
/* ---------------- ventanas con vistas a biomas (32×24 px) ---------------- */
const mixC = (a, b, t) => { const A = hexRGB(a), B = hexRGB(b); return cssRGB(A.map((v, i) => Math.round(lerp(v, B[i], t)))); };
const F = (g, c, x, y, w, h) => { g.fillStyle = typeof c === "number" ? cssRGB(hexRGB(c)) : c; g.fillRect(x, y, w, h); };
const sky = (g, a, b, h = 24) => { for (let y = 0; y < h; y++) F(g, mixC(a, b, y / Math.max(1, h - 1)), 0, y, 32, 1); };
const stars = (g, r, n, col = 0xffffff) => { for (let i = 0; i < n; i++) F(g, col, Math.floor(r() * 32), Math.floor(r() * 14), 1, 1); };
const cloud = (g, x, y) => { F(g, 0xffffff, x, y, 6, 2); F(g, 0xffffff, x + 1, y - 1, 3, 1); F(g, 0xe8f2ff, x, y + 2, 6, 1); };
const tree = (g, x, y, h, leaf = 0x2f8a3a, trunk = 0x6b4a26) => { F(g, trunk, x + 2, y + h - 4, 2, 4); F(g, leaf, x, y, 6, h - 3); F(g, leaf, x + 1, y - 1, 4, 1); };
const spruce = (g, x, y, h, snow) => { F(g, 0x5b3f22, x + 2, y + h - 2, 2, 2); for (let i = 0; i < 4; i++) { const w = 2 + i * 2, yy = y + i * Math.floor((h - 2) / 4); F(g, 0x1f5a35, x + 3 - w / 2, yy, w, Math.ceil((h - 2) / 4)); if (snow) F(g, 0xf4f8ff, x + 3 - w / 2, yy, w, 1); } };
const VIEWS = {
  plains: { name: "Llanura", draw(g, r) { sky(g, 0x5fb0ff, 0xcfeaff, 16); F(g, 0xffe45a, 24, 3, 4, 4); cloud(g, 4, 4); cloud(g, 15, 8); for (let x = 0; x < 32; x++) { const h = 14 + Math.round(Math.sin(x / 4) * 1.4); F(g, 0x5aa042, x, h, 1, 24 - h); F(g, 0x4a8a36, x, h + 3, 1, 21 - h); } tree(g, 5, 8, 9); tree(g, 22, 10, 8, 0x3c9a3f); for (let i = 0; i < 9; i++) F(g, [0xff5577, 0xffe14d, 0xffffff][i % 3], Math.floor(r() * 31), 18 + Math.floor(r() * 5), 1, 1); } },
  forest: { name: "Bosque", draw(g, r) { sky(g, 0x7fb5c8, 0xc8e0d0, 12); for (let x = 0; x < 32; x++) F(g, 0x3d7a34, x, 15, 1, 9); F(g, 0x4a8a36, 0, 19, 32, 5); for (const [x, y, h] of [[1, 3, 14], [9, 5, 12], [17, 2, 15], [25, 4, 13]]) tree(g, x, y, h, 0x2a6a2c); tree(g, 13, 9, 8, 0x347a35); tree(g, 28, 8, 9, 0x347a35); for (let i = 0; i < 6; i++) F(g, 0xd23a3a, Math.floor(r() * 31), 21 + Math.floor(r() * 3), 1, 1); } },
  desert: { name: "Desierto", draw(g, r) { sky(g, 0x8cd0ff, 0xfbe9b0, 15); F(g, 0xfff08a, 4, 3, 5, 5); for (let x = 0; x < 32; x++) { const h = 14 + Math.round(Math.sin(x / 5 + 1) * 2); F(g, 0xe6d28c, x, h, 1, 24 - h); F(g, 0xd2bb74, x, h + 4, 1, 20 - h); } for (let i = 0; i < 5; i++) F(g, 0xefdc9a, 18 + i, 13 - i, 10 - i * 2, 1); F(g, 0x2f8a3a, 21, 10, 2, 7); F(g, 0x2f8a3a, 19, 12, 2, 1); F(g, 0x2f8a3a, 19, 11, 1, 2); F(g, 0x2f8a3a, 23, 11, 2, 1); F(g, 0x2f8a3a, 24, 10, 1, 2); F(g, 0x2f8a3a, 6, 14, 2, 5); F(g, 0x2f8a3a, 8, 15, 1, 1); } },
  snow: { name: "Nieve", draw(g, r) { sky(g, 0x9fb6d0, 0xdfe8f2, 14); for (let x = 0; x < 32; x++) { const h = 14 + Math.round(Math.sin(x / 3) * 1.2); F(g, 0xf4f8ff, x, h, 1, 24 - h); F(g, 0xdde8f5, x, h + 4, 1, 20 - h); } spruce(g, 3, 4, 14, true); spruce(g, 14, 7, 11, true); spruce(g, 24, 3, 15, true); for (let i = 0; i < 16; i++) F(g, 0xffffff, Math.floor(r() * 32), Math.floor(r() * 20), 1, 1); } },
  ocean: { name: "Océano", draw(g, r) { sky(g, 0x6db6f2, 0xcdeaff, 12); F(g, 0xffee88, 22, 3, 4, 4); cloud(g, 3, 4); for (let y = 12; y < 24; y++) F(g, mixC(0x3b9be0, 0x0e4c96, (y - 12) / 11), 0, y, 32, 1); for (let i = 0; i < 12; i++) F(g, 0x9fd8ff, Math.floor(r() * 30), 13 + Math.floor(r() * 10), 2, 1); F(g, 0xe6d28c, 1, 11, 7, 2); F(g, 0x2f8a3a, 3, 7, 3, 4); F(g, 0x6b4a26, 4, 9, 1, 3); F(g, 0x8a5a2b, 15, 12, 7, 1); F(g, 0xf4f4f4, 18, 6, 1, 6); F(g, 0xf4f4f4, 17, 7, 4, 4); } },
  nether: { name: "Nether", draw(g, r) { sky(g, 0x2a0606, 0x8a1c0a); for (let x = 0; x < 32; x += 1) F(g, 0x6e2f2f, x, 0, 1, 2 + (x * 7 % 5)); F(g, 0xff6a10, 0, 19, 32, 5); for (let i = 0; i < 10; i++) F(g, 0xffd23a, Math.floor(r() * 31), 19 + Math.floor(r() * 4), 2, 1); for (const x of [4, 14, 26]) { F(g, 0x6e2f2f, x, 10, 3, 9); F(g, 0x5a2424, x, 10, 1, 9); } F(g, 0xf2f2f2, 18, 4, 6, 6); F(g, 0x111111, 19, 6, 1, 1); F(g, 0x111111, 22, 6, 1, 1); F(g, 0xc9c9c9, 19, 8, 4, 1); for (let i = 0; i < 6; i++) F(g, 0xff9a40, Math.floor(r() * 31), 12 + Math.floor(r() * 6), 1, 1); } },
  end: { name: "El End", draw(g, r) { sky(g, 0x07030f, 0x2a1450); stars(g, r, 26, 0xe3d4ff); stars(g, r, 8, 0xb48cff); F(g, 0xdcd9a0, 5, 17, 22, 2); F(g, 0xc9c68a, 8, 19, 16, 1); F(g, 0xb2b078, 11, 20, 10, 1); for (const [x, h] of [[8, 9], [15, 11], [23, 8]]) { F(g, 0x1a1024, x, 17 - h, 2, h); F(g, 0x2c1a44, x, 17 - h, 1, h); } F(g, 0xff66d8, 15, 4, 2, 2); F(g, 0x7a2a6a, 14, 6, 4, 1); F(g, 0x151024, 12, 7, 7, 3); F(g, 0xb06aff, 13, 8, 1, 1); F(g, 0xb06aff, 17, 8, 1, 1); } },
  night: { name: "Noche", draw(g, r) { sky(g, 0x0a0e2a, 0x24366e, 17); stars(g, r, 22); F(g, 0xf4f4dc, 24, 3, 4, 4); F(g, 0xd6d6bc, 26, 5, 2, 2); for (let x = 0; x < 32; x++) { const h = 16 + Math.round(Math.sin(x / 4) * 1.2); F(g, 0x1f3a28, x, h, 1, 24 - h); } F(g, 0x3b2c22, 6, 11, 9, 7); F(g, 0x2b1f18, 5, 9, 11, 2); F(g, 0x2b1f18, 7, 8, 7, 1); F(g, 0xffd75a, 8, 13, 2, 2); F(g, 0xffd75a, 12, 13, 2, 2); F(g, 0x181210, 10, 15, 2, 3); tree(g, 22, 10, 9, 0x1c4a2a, 0x2b1f18); } }
};
const viewTex = {};
function viewTexture(b) { if (!viewTex[b]) { const c = document.createElement("canvas"); c.width = 32; c.height = 24; VIEWS[b].draw(c.getContext("2d"), rng(b.length * 977 + b.charCodeAt(0))); const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; viewTex[b] = t; } return viewTex[b]; }
const WIN = {}; Object.keys(VIEWS).forEach(b => { WIN["win-" + b] = { name: "Ventana: " + VIEWS[b].name, w: 1.9, d: .12, win: true, build(g) {
  const FR = 0xf5f5f5, FD = 0xd2d2d2; bx(g, 1.9, .1, .1, 0, 0, .05, FR); bx(g, 1.9, .1, .1, 0, 1.4, .05, FR); bx(g, .1, 1.5, .1, -.9, 0, .05, FR); bx(g, .1, 1.5, .1, .9, 0, .05, FR); bx(g, .06, 1.3, .06, 0, .1, .05, FR); bx(g, 1.7, .06, .06, 0, .72, .05, FR);
  bx(g, 2.1, .08, .2, 0, -.06, .1, FD);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), new THREE.MeshBasicMaterial({ map: viewTexture(b), side: THREE.DoubleSide })); p.position.set(0, .75, .025); g.add(p); } }; });

/* ---------------- modelos de Blockbench (.bbmodel): jerarquía de huesos + animaciones ---------------- */
const CUSTOM = new Map(), D2R = Math.PI / 180, num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
export const bbVersion = id => CUSTOM.has(id) ? CUSTOM.get(id).ver : null;
export function bbAnimNames(text) { try { const j = typeof text === "string" ? JSON.parse(text) : text; return (j.animations || []).map(a => a.name).filter(Boolean); } catch (e) { return []; } }
function bbBoxUv(el, w, h, d) {
  const [u, v] = el.uv_offset || [0, 0];
  return { north: [u + d, v + d, u + d + w, v + d + h], east: [u, v + d, u + d, v + d + h], south: [u + 2 * d + w, v + d, u + 2 * d + 2 * w, v + d + h], west: [u + d + w, v + d, u + 2 * d + w, v + d + h], up: [u + d, v, u + d + w, v + d], down: [u + d + w, v, u + d + 2 * w, v + d] };
}
function sampleCh(kf, t, dflt) {
  if (!kf || !kf.length) return dflt; if (t <= kf[0].t) return kf[0].v; const last = kf[kf.length - 1]; if (t >= last.t) return last.v;
  let i = 0; while (i < kf.length - 2 && kf[i + 1].t <= t) i++; const a = kf[i], b = kf[i + 1]; if (a.i === "step") return a.v;
  let f = (t - a.t) / ((b.t - a.t) || 1); if (a.i === "catmullrom" || a.i === "bezier") f = f * f * (3 - 2 * f); return [lerp(a.v[0], b.v[0], f), lerp(a.v[1], b.v[1], f), lerp(a.v[2], b.v[2], f)];
}
function bbInstance(def, isPet) {
  const j = def.j, res = j.resolution || { width: j.texture_width || 16, height: j.texture_height || 16 };
  if (!def.mats) def.mats = (j.textures || []).map(t => { const im = new Image(), tex = new THREE.Texture(im); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace; im.onload = () => { tex.needsUpdate = true; }; im.src = t.source || ""; return { mat: new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, alphaTest: .1 }), uw: t.uv_width || res.width || 16, vh: t.uv_height || res.height || 16 }; });
  const grey = new THREE.MeshLambertMaterial({ color: 0xb0b0b8, side: THREE.DoubleSide }), matList = [...def.mats.map(m => m.mat), grey], nodes = new Map(), els = new Map((j.elements || []).map(e => [e.uuid, e])), used = new Set();
  const track = o => ({ o, p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone() });
  function cubeMesh(el, po) {
    if ((el.type && el.type !== "cube") || el.visibility === false) return null;
    const f = el.from || [0, 0, 0], to = el.to || [0, 0, 0], inf = el.inflate || 0, org = el.origin || [0, 0, 0], rot = el.rotation || [0, 0, 0];
    const A = [f[0] - inf, f[1] - inf, f[2] - inf], B = [to[0] + inf, to[1] + inf, to[2] + inf], uvs = el.box_uv && !el.faces ? bbBoxUv(el, to[0] - f[0], to[1] - f[1], to[2] - f[2]) : null;
    const C = { north: [[B[0], B[1], A[2]], [A[0], B[1], A[2]], [B[0], A[1], A[2]]], south: [[A[0], B[1], B[2]], [B[0], B[1], B[2]], [A[0], A[1], B[2]]], east: [[B[0], B[1], B[2]], [B[0], B[1], A[2]], [B[0], A[1], B[2]]], west: [[A[0], B[1], A[2]], [A[0], B[1], B[2]], [A[0], A[1], A[2]]], up: [[A[0], B[1], A[2]], [B[0], B[1], A[2]], [A[0], B[1], B[2]]], down: [[A[0], A[1], B[2]], [B[0], A[1], B[2]], [A[0], A[1], A[2]]] };
    const pos = [], uv = [], idx = [], groups = []; let n = 0;
    for (const dir of Object.keys(C)) {
      const fc = (el.faces && el.faces[dir]) || null, u = fc ? fc.uv : uvs && uvs[dir]; if (!u || (fc && fc.texture === null)) continue;
      const ti = fc && Number.isInteger(fc.texture) ? fc.texture : 0, tx = def.mats[ti], mi = tx ? ti : matList.length - 1, uw = tx ? tx.uw : 16, vh = tx ? tx.vh : 16;
      const c = C[dir]; let q = [c[0], c[1], [c[1][0] + c[2][0] - c[0][0], c[1][1] + c[2][1] - c[0][1], c[1][2] + c[2][2] - c[0][2]], c[2]];
      for (let k = 0; k < ((fc && fc.rotation) || 0) / 90; k++) q = [q[3], q[0], q[1], q[2]];
      const uc = [[u[0], u[1]], [u[2], u[1]], [u[2], u[3]], [u[0], u[3]]];
      q.forEach((p, k) => { pos.push(p[0] - org[0], p[1] - org[1], p[2] - org[2]); uv.push(uc[k][0] / uw, 1 - uc[k][1] / vh); });
      groups.push([idx.length, 6, mi]); idx.push(n, n + 2, n + 1, n, n + 3, n + 2); n += 4;
    }
    if (!n) return null;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals(); groups.forEach(g => geo.addGroup(...g));
    const m = new THREE.Mesh(geo, matList); m.position.set(org[0] - po[0], org[1] - po[1], org[2] - po[2]); m.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, "ZYX"); return m;
  }
  const root = new THREE.Group();
  const walk = (list, parent, po) => (list || []).forEach(nd => {
    if (typeof nd === "string") { const el = els.get(nd); const m = el && cubeMesh(el, po); if (m) { parent.add(m); nodes.set(nd, track(m)); used.add(nd); } }
    else if (nd && typeof nd === "object") { const g = new THREE.Group(), o = nd.origin || [0, 0, 0], r = nd.rotation || [0, 0, 0]; g.position.set(o[0] - po[0], o[1] - po[1], o[2] - po[2]); g.rotation.set(r[0] * D2R, r[1] * D2R, r[2] * D2R, "ZYX"); parent.add(g); nodes.set(nd.uuid, track(g)); walk(nd.children, g, o); }
  });
  walk(j.outliner, root, [0, 0, 0]);
  for (const [u, el] of els) if (!used.has(u)) { const m = cubeMesh(el, [0, 0, 0]); if (m) { root.add(m); nodes.set(u, track(m)); } }
  const anims = (j.animations || []).map(a => ({ name: a.name || "animación", loop: a.loop || "once", len: num(a.length), tracks: Object.entries(a.animators || {}).map(([u, an]) => { const nd = nodes.get(u); if (!nd) return null; const ch = {}; (an.keyframes || []).forEach(k => { const p = (k.data_points || [])[0] || {}, d = k.channel === "scale" ? 1 : 0; (ch[k.channel] = ch[k.channel] || []).push({ t: num(k.time), v: [num(p.x, d), num(p.y, d), num(p.z, d)], i: k.interpolation || "linear" }); }); Object.values(ch).forEach(l => l.sort((x, y) => x.t - y.t)); return { nd, ch }; }).filter(Boolean) })).filter(a => a.tracks.length);
  const inner = new THREE.Group(); inner.add(root); inner.rotation.y = Math.PI; inner.scale.setScalar(def.sc / 16);       // el frente de Blockbench (norte) mira hacia +z
  const g = new THREE.Group(); g.add(inner); g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), ctr = box.getCenter(new THREE.Vector3()); inner.position.set(-ctr.x, -box.min.y, -ctr.z); g.updateMatrixWorld(true);
  let cur = null, t = 0;
  const reset = () => nodes.forEach(n => { n.o.position.copy(n.p); n.o.rotation.copy(n.r); n.o.scale.copy(n.s); });
  function choose(moving) {
    if (!anims.length) return null; const by = re => anims.find(a => re.test(a.name));
    if (def.anim) { const a = anims.find(x => x.name === def.anim); if (a) return a; }
    if (isPet) return (moving ? by(/walk|run|move|camin|corre/i) : by(/idle|stand|rest|esper/i)) || (moving ? null : anims.find(a => a.loop === "loop")) || anims.find(a => a.loop === "loop") || anims[0];
    return by(/idle|loop|ambient/i) || anims.find(a => a.loop === "loop") || null;
  }
  function tick(dt, moving) {
    const a = choose(moving); if (a !== cur) { reset(); cur = a; t = 0; } if (!cur) return;
    t += dt; let tt = t; if (cur.len > 0) tt = cur.loop === "loop" ? t % cur.len : Math.min(t, cur.len);
    for (const { nd, ch } of cur.tracks) {
      const p = sampleCh(ch.position, tt, [0, 0, 0]), r = sampleCh(ch.rotation, tt, [0, 0, 0]), s = sampleCh(ch.scale, tt, [1, 1, 1]);
      nd.o.position.set(nd.p.x + p[0], nd.p.y + p[1], nd.p.z + p[2]); nd.o.rotation.set(nd.r.x + r[0] * D2R, nd.r.y + r[1] * D2R, nd.r.z + r[2] * D2R, "ZYX"); nd.o.scale.set(nd.s.x * s[0], nd.s.y * s[1], nd.s.z * s[2]);
    }
  }
  return { g, tick, box };
}
export function registerBB(id, text, o = {}) {
  try {
    const j = JSON.parse(text); if (!j || !Array.isArray(j.elements)) return false;
    const def = { name: o.name || "Modelo", bb: true, id, j, sc: clamp(Number(o.sc) || 1, .05, 20), anim: o.anim || "", place: "floor" }, m = bbInstance(def, false), sz = m.box.getSize(new THREE.Vector3());
    def.w = Math.max(.5, Math.ceil(sz.x / .25 - .01) * .25); def.d = Math.max(.5, Math.ceil(sz.z / .25 - .01) * .25);
    CUSTOM.set(id, { def, ver: text.length + "|" + def.sc + "|" + def.anim }); for (const k of [...thumbs.keys()]) if (k.includes("bb:" + id + ":")) thumbs.delete(k); return true;
  } catch (e) { console.warn("bbmodel:", e); return false; }
}
const texKindDef = k => { const [pre, key] = k.split("-"); return (pre === "floor" || pre === "wall") && TEXD[key] ? { tex: true, pre, key, name: (pre === "floor" ? "Piso: " : "Pared: ") + TEXD[key].name } : null; };
const defOf = (cat, k) => String(k).startsWith("bb:") ? (CUSTOM.get(k.slice(3)) || {}).def : cat === "pets" ? PETS[k] : (FURN[k] || WIN[k] || texKindDef(k));
export const hasKind = (cat, k) => !!defOf(cat, k);
export const furnKinds = () => Object.entries(FURN).map(([k, v]) => [k, v.name]);
export const winKinds = () => Object.entries(WIN).map(([k, v]) => [k, v.name]);
export const floorKinds = () => FLOORS.map(k => ["floor-" + k, "Piso: " + TEXD[k].name]);
export const wallKinds = () => WALLS.map(k => ["wall-" + k, "Pared: " + TEXD[k].name]);
export const kindGroup = k => k.startsWith("bb:") ? "furn" : FURN[k] ? "furn" : WIN[k] ? "win" : k.startsWith("floor-") ? "floor" : k.startsWith("wall-") ? "wall" : "furn";
export const petKinds = () => Object.entries(PETS).map(([k, v]) => [k, v.name]);
function buildModel(cat, kind) {
  const def = defOf(cat, kind); if (!def) return null; if (def.bb) { const m = bbInstance(def, cat === "pets"); return { g: m.g, def, tick: m.tick }; }
  const g = new THREE.Group();
  if (def.tex) {
    const sd = L(def.pre === "floor" ? 0x5a4128 : 0xc9cfd0);
    if (def.pre === "floor") { const m = new THREE.Mesh(BOX, [sd, sd, new THREE.MeshLambertMaterial({ map: texFor(def.key, 3, 3) }), sd, sd, sd]); m.scale.set(3, .3, 3); m.position.y = .15; g.add(m); }
    else { const m = new THREE.Mesh(BOX, [sd, sd, sd, sd, new THREE.MeshLambertMaterial({ map: texFor(def.key, 3, 2) }), sd]); m.scale.set(3, 2, .3); m.position.y = 1; g.add(m); }
  } else def.build(g);
  return { g, def };
}


/* ---------------- texturas ---------------- */
const texCache = {};
function loadTex(src, rep) {
  const key = src + rep;
  if (!texCache[key]) { const t = new THREE.TextureLoader().load(src); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(rep[0], rep[1]); texCache[key] = t; }
  return texCache[key];
}
function isoCamera(aspect, h) {
  const cam = new THREE.OrthographicCamera(-h * aspect / 2, h * aspect / 2, h / 2, -h / 2, .1, 200), p = 30 * Math.PI / 180, a = Math.PI / 4;
  cam.userData.dir = new THREE.Vector3(Math.cos(p) * Math.sin(a), Math.sin(p), Math.cos(p) * Math.cos(a)); return cam;
}
function lights(scene) { scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a890, 1.55)); const d = new THREE.DirectionalLight(0xfff2dc, 1.1); d.position.set(-6, 14, 9); scene.add(d); }

/* ---------------- miniaturas y vistas previas (tienda e inventario) ---------------- */
let thumbR = null; const thumbs = new Map();
export function modelThumb(cat, kind, size = 112) {
  const key = cat + ":" + kind + ":" + size; if (thumbs.has(key)) return thumbs.get(key);
  let url = "";
  try {
    const m = buildModel(cat, kind); if (!m) return "";
    if (!thumbR) { thumbR = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); thumbR.setPixelRatio(1); }
    thumbR.setSize(size, size, false); const sc = new THREE.Scene(); lights(sc); sc.add(m.g); if (m.tick) m.tick(.001, false);
    const box = new THREE.Box3().setFromObject(m.g), ctr = box.getCenter(new THREE.Vector3()), r = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) * 1.15 + .2, cam = isoCamera(1, r * 1.35);
    cam.position.copy(ctr).addScaledVector(cam.userData.dir, 20); cam.lookAt(ctr); m.g.rotation.y = .5; thumbR.setClearColor(0, 0); thumbR.render(sc, cam); url = thumbR.domElement.toDataURL("image/png");
  } catch (e) { console.warn("miniatura:", e); }
  thumbs.set(key, url); return url;
}
export function modelPreview(canvas, cat, kind) {
  let r = null, raf = 0, stopped = false;
  try { r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch (e) { return { stop() { } }; }
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300; r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); r.setSize(w, h, false);
  const sc = new THREE.Scene(); lights(sc); const m = buildModel(cat, kind); if (!m) return { stop() { } }; const pv = new THREE.Group(); pv.add(m.g); sc.add(pv);
  const box = new THREE.Box3().setFromObject(m.g), ctr = box.getCenter(new THREE.Vector3()); m.g.position.sub(ctr); m.g.position.y += 0;
  const rr = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z), cam = isoCamera(w / h, Math.max(1.6, rr * 1.7)); cam.position.copy(cam.userData.dir).multiplyScalar(20); cam.lookAt(0, 0, 0);
  let drag = false, lx = 0, spin = 0; canvas.onpointerdown = e => { drag = true; lx = e.clientX; canvas.setPointerCapture(e.pointerId); }; canvas.onpointermove = e => { if (drag) { spin += (e.clientX - lx) * .012; lx = e.clientX; } }; canvas.onpointerup = () => { drag = false; };
  const loop = () => { if (stopped || !canvas.isConnected) return; raf = requestAnimationFrame(loop); if (!drag) spin += .008; pv.rotation.y = spin; if (m.g.userData.squash) m.g.userData.squash.scale.y = .5 + Math.sin(performance.now() / 300) * .04; if (m.tick) m.tick(.016, true); r.render(sc, cam); };
  loop(); return { stop() { stopped = true; cancelAnimationFrame(raf); r.dispose(); } };
}

/* ---------------- la habitación (con modo edición tipo Sims) ---------------- */
export const TEST_FURN = ["bed", "sofa", "bookshelf", "tv", "desk", "plant", "lamp", "rug", "win-plains"], TEST_PET = "cat";
const snap = (v, s = .25) => Math.round(v / s) * s;
export function createRoom(canvas, o = {}) {
  const { skinSources = [], slim = false, name = "avatar", cos = null, pet = null, editable = false, test = false, onSave = null } = o;
  const W = 960, H = 640; canvas.width = W; canvas.height = H;
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); R.setPixelRatio(1); R.setSize(W, H, false); R.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(); lights(scene); const cam = isoCamera(W / H, 9.6), target = new THREE.Vector3(ROOM / 2, 1.15, ROOM / 2); cam.position.copy(target).addScaledVector(cam.userData.dir, 40); cam.lookAt(target);
  const right = new THREE.Vector3(1, 0, -1).normalize();
  /* ----- catálogo (id → {id, kind, name}) ----- */
  const catalog = new Map(); (o.catalog || []).forEach(c => catalog.set(c.id, c)); (o.items || []).forEach(c => catalog.set(c.id, { ...catalog.get(c.id), ...c }));
  const allK = [...furnKinds(), ...winKinds(), ...floorKinds(), ...wallKinds()];
  if (test) allK.forEach(([k, n]) => { const id = "t_" + k; if (!catalog.has(id)) catalog.set(id, { id, kind: k, name: n }); });
  const kindOf = id => { const c = catalog.get(id); return c && c.kind; };
  /* ----- estructura: suelo, paredes, rodapié (el piso y las paredes cambian de textura) ----- */
  const wood = loadTex("img/madera.png", [ROOM, ROOM]), conc = loadTex("img/cemento-blanco.png", [ROOM, WALLH]);
  const M = (map, c = 0xffffff) => new THREE.MeshLambertMaterial({ map, color: c }), side = L(0x5a4128), cs = L(0xc9cfd0);
  const floorM = M(wood), wallNM = M(conc), wallWM = M(conc, 0xe4e4e4);
  const floor = new THREE.Mesh(BOX, [side, side, floorM, side, side, side]); floor.scale.set(ROOM, .4, ROOM); floor.position.set(ROOM / 2, -.2, ROOM / 2); scene.add(floor);
  const wallN = new THREE.Mesh(BOX, [cs, cs, cs, cs, wallNM, cs]); wallN.scale.set(ROOM + .3, WALLH, .3); wallN.position.set(ROOM / 2 - .15, WALLH / 2, -.15); scene.add(wallN);
  const wallW = new THREE.Mesh(BOX, [wallWM, cs, cs, cs, cs, cs]); wallW.scale.set(.3, WALLH, ROOM); wallW.position.set(-.15, WALLH / 2, ROOM / 2); scene.add(wallW);
  const deco = new THREE.Group(); scene.add(deco); bx(deco, ROOM, .22, .06, ROOM / 2, 0, .03, WD2); bx(deco, .06, .22, ROOM, .03, 0, ROOM / 2, WD2);
  let floorId = null, wallId = null;
  const setFloor = id => { const k = id && kindOf(id), d = k && texKindDef(k); floorId = d && d.pre === "floor" ? id : null; floorM.map = floorId ? texFor(d.key, ROOM, ROOM) : wood; floorM.needsUpdate = true; };
  const setWall = id => { const k = id && kindOf(id), d = k && texKindDef(k); wallId = d && d.pre === "wall" ? id : null; wallNM.map = wallWM.map = wallId ? texFor(d.key, ROOM, WALLH) : conc; wallNM.needsUpdate = wallWM.needsUpdate = true; };
  /* ----- muebles y ventanas colocados ----- */
  const placed = new Map(); let rects = [];
  const dimsOf = P => P.r % 2 ? [P.def.d, P.def.w] : [P.def.w, P.def.d];
  const rebuild = () => { rects = []; for (const P of placed.values()) { if (P.def.flat || P.def.win) continue; const [w, d] = dimsOf(P); rects.push({ x0: P.x - w / 2, x1: P.x + w / 2, z0: P.z - d / 2, z1: P.z + d / 2 }); } };
  const valid = P => {
    if (P.def.win) { if (P.p - P.def.w / 2 < .1 || P.p + P.def.w / 2 > ROOM - .1) return false; for (const Q of placed.values()) if (Q !== P && Q.def.win && Q.side === P.side && Math.abs(Q.p - P.p) < (Q.def.w + P.def.w) / 2 - .01) return false; return true; }
    const [w, d] = dimsOf(P); if (P.x - w / 2 < .05 || P.x + w / 2 > ROOM - .05 || P.z - d / 2 < .05 || P.z + d / 2 > ROOM - .05) return false;
    if (P.def.flat) return true;
    for (const Q of placed.values()) if (Q !== P && !Q.def.flat && !Q.def.win) { const [w2, d2] = dimsOf(Q); if (Math.abs(Q.x - P.x) < (w + w2) / 2 - .01 && Math.abs(Q.z - P.z) < (d + d2) / 2 - .01) return false; }
    return true;
  };
  const apply = P => { const g = P.g; if (P.def.win) { if (P.side === "W") { g.position.set(0, 1, P.p); g.rotation.y = Math.PI / 2; } else { g.position.set(P.p, 1, 0); g.rotation.y = 0; } } else { g.position.set(P.x, 0, P.z); g.rotation.y = P.r * Math.PI / 2; } };
  function autoPlace(P) {
    if (P.def.win) { for (const sd of ["N", "W"]) for (let p = 1.2; p <= ROOM - 1.2; p += .5) { P.side = sd; P.p = p; if (valid(P)) return true; } P.side = "N"; P.p = 4; return false; }
    if (P.def.place === "rug") { P.x = 4.3; P.z = 4.3; P.r = 0; return true; }
    if (P.def.place === "wallN") {
      P.r = 0; P.z = P.def.d / 2 + .08; for (let x = P.def.w / 2 + .35; x <= ROOM - P.def.w / 2; x += .25) { P.x = x; if (valid(P)) return true; }
      P.r = 1; P.x = P.def.d / 2 + .08; for (let z = P.def.w / 2 + .35; z <= ROOM - P.def.w / 2; z += .25) { P.z = z; if (valid(P)) return true; }
    }
    P.r = 0; for (let z = 6.2; z >= 1.5; z -= .5) for (let x = 5.8; x >= 1.2; x -= .5) { P.x = x; P.z = z; if (valid(P)) return true; }
    P.x = 4; P.z = 4; return false;
  }
  function addItem(id, ly) {
    const kind = kindOf(id); if (!kind || placed.has(id)) return null; const m = buildModel("furn", kind); if (!m || m.def.tex) return null;
    const P = { id, kind, def: m.def, g: m.g, tick: m.tick, x: 4, z: 4, r: 0, side: "N", p: 4 }; m.g.userData.pid = id; scene.add(m.g); placed.set(id, P);
    let ok = false;
    if (ly && typeof ly === "object") { if (P.def.win) { if (ly.w === "N" || ly.w === "W") { P.side = ly.w; P.p = clamp(Number(ly.p) || 4, 1, ROOM - 1); } } else { P.x = Number(ly.x) || 4; P.z = Number(ly.z) || 4; P.r = ((Math.round(Number(ly.r)) || 0) % 4 + 4) % 4; } ok = valid(P); }
    if (!ok) autoPlace(P); apply(P); rebuild(); return P;
  }
  function removeItem(id) { const P = placed.get(id); if (!P) return; scene.remove(P.g); placed.delete(id); rebuild(); }
  const state = () => { const layout = {}; for (const P of placed.values()) layout[P.id] = P.def.win ? { w: P.side, p: +P.p.toFixed(2) } : { x: +P.x.toFixed(2), z: +P.z.toFixed(2), r: P.r }; return { items: [...placed.values()].map(P => ({ id: P.id, kind: P.kind })), layout, floorId, wallId }; };
  function load(st) { for (const id of [...placed.keys()]) removeItem(id); const ly = st.layout || {}; st.items.forEach(i => addItem(i.id, ly[i.id])); setFloor(st.floorId); setWall(st.wallId); fixActors(); showSel(); }
  /* ----- ocupación (para que el avatar y la mascota no atraviesen los muebles) ----- */
  const blocked = (x, z, r = .32) => rects.some(q => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r);
  const lineFree = (ax, az, bx2, bz, r) => { for (let i = 0; i <= 14; i++) { const t = i / 14; if (blocked(lerp(ax, bx2, t), lerp(az, bz, t), r)) return false; } return true; };
  const spot = (fx, fz, r, tries = 24) => { for (let i = 0; i < tries; i++) { const x = rnd(.9, ROOM - .9), z = rnd(.9, ROOM - .9); if (!blocked(x, z, r) && Math.hypot(x - fx, z - fz) > 1.6 && lineFree(fx, fz, x, z, r)) return [x, z]; } return null; };
  const freeNear = r => { for (let i = 0; i < 80; i++) { const x = rnd(.9, ROOM - .9), z = rnd(.9, ROOM - .9); if (!blocked(x, z, r)) return [x, z]; } return [4, 4]; };
  /* ----- avatar 2D (sprite) ----- */
  const st = { mode: "idle", x: 4, z: 4.5, tx: 0, tz: 0, flip: false, t: 0, a: 0, next: 1.2, dur: 0 };
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .08, depthWrite: true })); sprite.visible = false; scene.add(sprite);
  const shadow = r => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .015; scene.add(m); return m; };
  const aShadow = shadow(.42); let img = null, set = null; const figTex = new WeakMap();
  const texOf = fig => { let t = figTex.get(fig); if (!t) { t = new THREE.CanvasTexture(fig); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; figTex.set(fig, t); } return t; };
  loadSkin(skinSources).then(i => { if (!alive || !i) return; img = i; set = createFigureSet(i, { slim, k: 3, cos }); });
  /* ----- mascota 3D ----- */
  let petG = null; const ps = { x: 5.5, z: 5.5, tx: 5.5, tz: 5.5, wait: 1, hop: 0, t: 0, yaw: 0 }; let pShadow = null;
  let petTick = null; if (pet && defOf("pets", pet)) { const m = buildModel("pets", pet); petTick = m.tick; petG = new THREE.Group(); petG.add(m.g); petG.userData.sq = m.g.userData.squash; scene.add(petG); pShadow = shadow(.26); }
  /* ----- estado inicial ----- */
  let items0 = o.items || []; if (test && !items0.length) { items0 = TEST_FURN.map(k => ({ id: "t_" + k, kind: k })); }
  let alive = true, raf = 0, last = 0;
  const fixActors = () => { if (blocked(st.x, st.z, .4)) { [st.x, st.z] = freeNear(.4); if (st.mode === "walk") st.mode = "idle"; } if (petG && blocked(ps.x, ps.z, .3)) { [ps.x, ps.z] = freeNear(.3); ps.tx = ps.x; ps.tz = ps.z; } };
  { const ly = o.layout || {}; items0.forEach(i => addItem(i.id, ly[i.id])); setFloor(o.floorId); setWall(o.wallId); [st.x, st.z] = freeNear(.4); if (petG) { [ps.x, ps.z] = freeNear(.3); ps.tx = ps.x; ps.tz = ps.z; } }
  /* ----- corazones ----- */
  const heartTex = (() => { const rows = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"], c = document.createElement("canvas"); c.width = 7; c.height = 6; const g = c.getContext("2d"); rows.forEach((r, j) => [...r].forEach((v, i) => { if (v === "1") { g.fillStyle = i === 1 && j === 1 ? "#ff9db0" : "#ff4d6d"; g.fillRect(i, j, 1, 1); } })); const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const hearts = [];
  const burst = (x, y, z) => { for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false })); s.scale.set(.34, .3, 1); s.position.set(x, y, z).addScaledVector(right, (i - 1.5) * .3); s.renderOrder = 10; scene.add(s); hearts.push({ s, l: rnd(1, 1.5), p: rnd(0, 6) }); } };
  /* ----- comportamiento ----- */
  const setMode = m => { st.mode = m; st.t = 0; st.a = 0; if (m === "idle") st.next = rnd(1.6, 4.2); if (m === "dance") st.dur = (ANIMS.dance.frames.length / ANIMS.dance.fps) * (3 + Math.floor(Math.random() * 3)); };
  const walkTo = () => { const s = spot(st.x, st.z, .34); if (!s) return setMode("idle"); st.tx = s[0]; st.tz = s[1]; setMode("walk"); };
  const pick = () => { const r = Math.random(); if (r < .6) walkTo(); else if (r < .8) setMode("dance"); else setMode("idle"); };
  function update(dt) {
    st.t += dt; for (const P of placed.values()) if (P.tick) P.tick(dt, false);
    if (st.mode === "walk") {
      const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz), step = 1.15 * dt; const sd = dx - dz; if (Math.abs(sd) > .02) st.flip = sd > 0;
      if (d <= step) { st.x = st.tx; st.z = st.tz; setMode("idle"); } else { st.x += dx / d * step; st.z += dz / d * step; st.a += dt * ANIMS.walk.fps; }
    } else if (st.mode === "dance") { st.a += dt * ANIMS.dance.fps; if (st.t > st.dur) setMode("idle"); }
    else if (st.mode === "jump") { st.a += dt * ANIMS.jump.fps * .75; if (st.a >= ANIMS.jump.frames.length) setMode("idle"); }
    else { st.a += dt * ANIMS.idle.fps; if (st.t > st.next && !editing) pick(); }
    if (petG) {
      ps.t += dt; const dx = ps.tx - ps.x, dz = ps.tz - ps.z, d = Math.hypot(dx, dz); ps.hop = Math.max(0, ps.hop - dt * 2.4);
      if (d > .05) { const step = .8 * dt; ps.x += dx / d * Math.min(step, d); ps.z += dz / d * Math.min(step, d); ps.yaw = Math.atan2(dx, dz); }
      else { ps.wait -= dt; if (ps.wait <= 0) { ps.wait = rnd(1.5, 4); const s = editing ? null : spot(ps.x, ps.z, .3, 12); if (s) { ps.tx = s[0]; ps.tz = s[1]; } } }
      if (petTick) petTick(dt, d > .05); const mv = d > .05 ? 1 : 0, bob = Math.abs(Math.sin(ps.t * 9)) * .06 * mv + Math.sin(Math.PI * Math.min(1, ps.hop)) * .45 * (ps.hop > 0 ? 1 : 0);
      petG.position.set(ps.x, bob, ps.z); petG.rotation.y = lerp(petG.rotation.y, ps.yaw, .2); petG.rotation.z = Math.sin(ps.t * 9) * .06 * mv; if (petG.userData.sq) petG.userData.sq.scale.y = .5 + Math.sin(ps.t * (mv ? 9 : 2)) * (mv ? .07 : .02);
      pShadow.position.set(ps.x, .015, ps.z); pShadow.scale.setScalar(1 - bob * .6);
    }
    for (let i = hearts.length - 1; i >= 0; i--) { const h = hearts[i]; h.l -= dt; h.s.position.y += .75 * dt; h.s.position.addScaledVector(right, Math.sin(h.l * 5 + h.p) * .004); h.s.material.opacity = clamp(h.l / .5, 0, 1); if (h.l <= 0) { scene.remove(h.s); h.s.material.dispose(); hearts.splice(i, 1); } }
  }
  function render() {
    if (set) {
      const anim = st.mode === "walk" ? "walk" : st.mode === "dance" ? "dance" : st.mode === "jump" ? "jump" : "idle", n = ANIMS[anim].frames.length, i = anim === "jump" ? Math.min(n - 1, Math.floor(st.a)) : Math.floor(st.a) % n;
      const { fig, gx, gy } = set.get(anim, i), sh = (st.flip ? -gx : gx) / PXU;
      sprite.visible = true; sprite.material.map = texOf(fig); sprite.scale.set((st.flip ? -1 : 1) * fig.width / PXU * ISO_V, fig.height / PXU * ISO_V, 1); sprite.center.set(.5, (fig.height - set.feet) / fig.height);
      sprite.position.set(st.x, -gy / PXU * ISO_V, st.z).addScaledVector(right, sh * ISO_V); aShadow.position.set(st.x, .015, st.z); aShadow.scale.setScalar(Math.max(.55, 1 + gy / 42));
    }
    R.render(scene, cam);
  }
  function frame(t) { if (!alive) return; if (!canvas.isConnected) return destroy(); const dt = Math.min(.05, (t - last) / 1000 || 0); last = t; update(dt); render(); raf = requestAnimationFrame(frame); }
  /* ----- selección (modo edición) ----- */
  let editing = false, selId = null, drag = null, snapshot = null, ptab = "furn", saving = false, note = "";
  const selMesh = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ color: 0x35e06a, transparent: true, opacity: .5, depthTest: false })); selMesh.renderOrder = 5; selMesh.visible = false; scene.add(selMesh);
  function showSel() {
    const P = editing && placed.get(selId); if (!P) { selMesh.visible = false; return; }
    selMesh.material.color.set(valid(P) ? 0x35e06a : 0xe03535); selMesh.visible = true;
    if (P.def.win) { selMesh.scale.set(P.def.w + .12, 1.65, .16); selMesh.rotation.y = P.side === "W" ? Math.PI / 2 : 0; if (P.side === "W") selMesh.position.set(.08, 1.78, P.p); else selMesh.position.set(P.p, 1.78, .08); }
    else { const [w, d] = dimsOf(P); selMesh.rotation.y = 0; selMesh.scale.set(w + .08, .05, d + .08); selMesh.position.set(P.x, .04, P.z); }
  }
  const ray = new THREE.Raycaster(), pt = new THREE.Vector2(), planeY = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), tmp = new THREE.Vector3();
  const aim = e => { const r = canvas.getBoundingClientRect(); pt.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(pt, cam); };
  const floorHit = e => { aim(e); return ray.ray.intersectPlane(planeY, tmp) ? tmp.clone() : null; };
  const wallHit = e => {
    aim(e); let best = null;
    const a = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3()); if (a && a.x > 0 && a.x < ROOM && a.y > .2 && a.y < WALLH + .3) best = { side: "N", p: a.x, t: a.distanceTo(ray.ray.origin) };
    const b = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Vector3()); if (b && b.z > 0 && b.z < ROOM && b.y > .2 && b.y < WALLH + .3 && (!best || b.distanceTo(ray.ray.origin) < best.t)) best = { side: "W", p: b.z };
    return best;
  };
  const pidOf = e => { aim(e); const hit = ray.intersectObjects([...placed.values()].map(P => P.g), true); for (const h of hit) { let o2 = h.object; while (o2 && !(o2.userData && o2.userData.pid)) o2 = o2.parent; if (o2) return o2.userData.pid; } return null; };
  function onDown(e) {
    if (e.button) return;
    if (editing) {
      const id = pidOf(e); selId = id; showSel(); renderBar();
      if (id) { const P = placed.get(id); e.preventDefault(); canvas.setPointerCapture(e.pointerId); const h = floorHit(e); drag = { id, ox: h ? h.x - P.x : 0, oz: h ? h.z - P.z : 0, x: P.x, z: P.z, r: P.r, side: P.side, p: P.p }; canvas.style.cursor = "grabbing"; }
      return;
    }
    aim(e); let k = null; if (sprite.visible && ray.intersectObject(sprite).length) k = "a"; else if (petG && ray.intersectObject(petG, true).length) k = "p"; if (!k) return;
    e.preventDefault(); if (k === "a") { burst(st.x, 2.1, st.z); if (st.mode !== "jump") setMode("jump"); } else { burst(ps.x, .8, ps.z); ps.hop = 1; }
  }
  function onMove(e) {
    if (editing) {
      if (drag) { const P = placed.get(drag.id); if (!P) return;
        if (P.def.win) { const w = wallHit(e); if (w) { P.side = w.side; P.p = clamp(snap(w.p), P.def.w / 2 + .1, ROOM - P.def.w / 2 - .1); } }
        else { const h = floorHit(e); if (h) { const [w, d] = dimsOf(P); P.x = clamp(snap(h.x - drag.ox), w / 2 + .05, ROOM - w / 2 - .05); P.z = clamp(snap(h.z - drag.oz), d / 2 + .05, ROOM - d / 2 - .05); } }
        apply(P); rebuild(); showSel(); return; }
      canvas.style.cursor = pidOf(e) ? "grab" : "default"; return;
    }
    aim(e); canvas.style.cursor = (sprite.visible && ray.intersectObject(sprite).length) || (petG && ray.intersectObject(petG, true).length) ? "pointer" : "default";
  }
  function onUp() {
    if (!drag) return; const P = placed.get(drag.id); canvas.style.cursor = "grab";
    if (P && !valid(P)) { P.x = drag.x; P.z = drag.z; P.r = drag.r; P.side = drag.side; P.p = drag.p; apply(P); rebuild(); }
    drag = null; showSel(); fixActors();
  }
  function rotateSel() {
    const P = placed.get(selId); if (!P) return; const bk = { r: P.r, side: P.side, p: P.p };
    if (P.def.win) P.side = P.side === "N" ? "W" : "N"; else P.r = (P.r + 1) % 4;
    if (!valid(P)) { if (P.def.win) { P.p = clamp(P.p, P.def.w / 2 + .1, ROOM - P.def.w / 2 - .1); } if (!valid(P)) Object.assign(P, bk); }
    apply(P); rebuild(); showSel(); fixActors();
  }
  function removeSel() { if (!selId) return; removeItem(selId); selId = null; showSel(); renderBar(); }
  const onKey = e => {
    if (!editing || e.target.closest && e.target.closest("input,textarea,select")) return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateSel(); } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); } else if (e.key === "Escape") { selId = null; showSel(); renderBar(); }
  };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp); document.addEventListener("keydown", onKey);
  /* ----- barra de edición (debajo de la habitación) ----- */
  const bar = document.createElement("div"); bar.className = "rm-bar"; bar.style.cssText = "max-width:720px;margin:10px auto 0;display:flex;flex-direction:column;gap:8px;font-size:.85rem"; bar.hidden = !editable; canvas.after(bar);
  const PT = [["furn", "Muebles"], ["win", "Ventanas"], ["floor", "Pisos"], ["wall", "Paredes"]];
  const thumbFor = c => { const g = kindGroup(c.kind); return g === "floor" || g === "wall" ? texThumb(c.kind.split("-")[1], 64) : modelThumb("furn", c.kind, 96); };
  function renderBar() {
    if (!editable) return;
    if (!editing) { bar.innerHTML = `<div style="display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap"><button class="btn" type="button" data-a="edit">🛠 Editar habitación</button>${test ? `<small class="muted">Modo prueba (administrador): muebles de ejemplo.</small>` : ""}</div>`; return; }
    const list = [...catalog.values()].filter(c => kindGroup(c.kind) === ptab && defOf("furn", c.kind)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const on = c => ptab === "floor" ? floorId === c.id : ptab === "wall" ? wallId === c.id : placed.has(c.id);
    const sel = placed.get(selId);
    bar.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">${PT.map(([k, n]) => `<button class="btn${k === ptab ? " solid" : ""}" type="button" data-t="${k}">${n}</button>`).join("")}</div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding:4px 2px;min-height:96px">${list.length ? list.map(c => `<button type="button" data-id="${esc2(c.id)}" title="${esc2(c.name || c.kind)}" style="flex:0 0 auto;width:84px;border:2px solid ${on(c) ? "#35e06a" : "rgba(128,128,128,.35)"};border-radius:10px;background:rgba(128,128,128,.12);color:inherit;padding:4px;cursor:pointer;font:inherit;font-size:.7rem"><img src="${thumbFor(c)}" alt="" style="width:100%;height:56px;object-fit:contain;image-rendering:${ptab === "floor" || ptab === "wall" ? "pixelated" : "auto"}"><div style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc2(String(c.name || c.kind).replace(/^(Piso|Pared|Ventana): /, ""))}</div></button>`).join("") : `<small class="muted" style="align-self:center">No tienes nada de esta sección. Compra en el Mercado → Muebles.</small>`}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center"><button class="btn" type="button" data-a="rot" ${sel ? "" : "disabled"}>↻ ${sel && sel.def.win ? "Cambiar de pared" : "Rotar"} (R)</button><button class="btn" type="button" data-a="del" ${sel ? "" : "disabled"}>🗑 Guardar en inventario</button><button class="btn solid" type="button" data-a="save" ${saving ? "disabled" : ""}>✔ Listo</button><button class="btn" type="button" data-a="cancel">Cancelar</button></div>
      <small class="muted" style="text-align:center">${note || (ptab === "floor" || ptab === "wall" ? "Toca una textura para aplicarla; tócala otra vez para volver a la de siempre." : "Toca un artículo para ponerlo, arrástralo en la habitación para moverlo. Rojo = no cabe.")}</small>`;
  }
  const esc2 = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  bar.onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "edit") { editing = true; snapshot = state(); selId = null; note = ""; canvas.style.cursor = "default"; return renderBar(); }
    if (b.dataset.t) { ptab = b.dataset.t; return renderBar(); }
    if (b.dataset.id) {
      const c = catalog.get(b.dataset.id); if (!c) return; const g = kindGroup(c.kind);
      if (g === "floor") setFloor(floorId === c.id ? null : c.id); else if (g === "wall") setWall(wallId === c.id ? null : c.id);
      else if (placed.has(c.id)) selId = c.id; else { if (placed.size >= 16) { note = "Máximo 16 muebles y ventanas."; return renderBar(); } const P = addItem(c.id); selId = P ? c.id : null; note = ""; fixActors(); }
      showSel(); return renderBar();
    }
    if (b.dataset.a === "rot") return rotateSel();
    if (b.dataset.a === "del") return removeSel();
    if (b.dataset.a === "cancel") { load(snapshot); editing = false; selId = null; showSel(); canvas.style.cursor = "default"; return renderBar(); }
    if (b.dataset.a === "save") {
      saving = true; renderBar();
      try { if (onSave) await onSave(state()); editing = false; selId = null; note = ""; showSel(); canvas.style.cursor = "default"; }
      catch (er) { console.warn(er); note = "No se pudo guardar. ¿Publicaste las reglas de Firestore?"; }
      saving = false; renderBar();
    }
  };
  renderBar();
  function destroy() { if (!alive) return; alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp); document.removeEventListener("keydown", onKey); bar.remove(); try { R.dispose(); R.forceContextLoss(); } catch (e) { /* nada */ } }
  raf = requestAnimationFrame(frame);
  return { destroy, download() { exportAvatar(img, slim, name); }, test };
}
