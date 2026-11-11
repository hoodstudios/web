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
export const furnKinds = () => Object.entries(FURN).map(([k, v]) => [k, v.name]);
export const petKinds = () => Object.entries(PETS).map(([k, v]) => [k, v.name]);
function buildModel(cat, kind) { const def = (cat === "pets" ? PETS : FURN)[kind]; if (!def) return null; const g = new THREE.Group(); def.build(g); return { g, def }; }

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
    thumbR.setSize(size, size, false); const sc = new THREE.Scene(); lights(sc); sc.add(m.g);
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
  const loop = () => { if (stopped || !canvas.isConnected) return; raf = requestAnimationFrame(loop); if (!drag) spin += .008; pv.rotation.y = spin; if (m.g.userData.squash) m.g.userData.squash.scale.y = .5 + Math.sin(performance.now() / 300) * .04; r.render(sc, cam); };
  loop(); return { stop() { stopped = true; cancelAnimationFrame(raf); r.dispose(); } };
}

/* ---------------- la habitación ---------------- */
export const TEST_FURN = ["bed", "sofa", "bookshelf", "tv", "desk", "plant", "lamp", "rug"], TEST_PET = "cat";
export function createRoom(canvas, { skinSources = [], slim = false, name = "avatar", cos = null, furn = [], pet = null, test = false } = {}) {
  const W = 960, H = 640; canvas.width = W; canvas.height = H;
  const R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); R.setPixelRatio(1); R.setSize(W, H, false); R.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(); lights(scene); const cam = isoCamera(W / H, 9.6), target = new THREE.Vector3(ROOM / 2, 1.15, ROOM / 2); cam.position.copy(target).addScaledVector(cam.userData.dir, 40); cam.lookAt(target);
  const right = new THREE.Vector3(1, 0, -1).normalize();                                  // eje horizontal de la pantalla sobre el suelo
  /* ----- estructura: suelo, paredes, rodapié, ventana y cuadros ----- */
  const wood = loadTex("img/madera.png", [ROOM, ROOM]), conc = loadTex("img/cemento-blanco.png", [ROOM, WALLH]), concW = loadTex("img/cemento-blanco.png", [ROOM, WALLH]);
  const M = (map, c = 0xffffff) => new THREE.MeshLambertMaterial({ map, color: c }), side = L(0x5a4128), cs = L(0xc9cfd0);
  const floor = new THREE.Mesh(BOX, [side, side, M(wood), side, side, side]); floor.scale.set(ROOM, .4, ROOM); floor.position.set(ROOM / 2, -.2, ROOM / 2); scene.add(floor);
  const wallN = new THREE.Mesh(BOX, [cs, cs, cs, cs, M(conc), cs]); wallN.scale.set(ROOM + .3, WALLH, .3); wallN.position.set(ROOM / 2 - .15, WALLH / 2, -.15); scene.add(wallN);
  const wallW = new THREE.Mesh(BOX, [M(concW, 0xe4e4e4), cs, cs, cs, cs, cs]); wallW.scale.set(.3, WALLH, ROOM); wallW.position.set(-.15, WALLH / 2, ROOM / 2); scene.add(wallW);
  const deco = new THREE.Group(); scene.add(deco);
  bx(deco, ROOM, .22, .06, ROOM / 2, 0, .03, WD2); bx(deco, .06, .22, ROOM, .03, 0, ROOM / 2, WD2);                      // rodapiés
  bx(deco, 1.9, 1.5, .08, 5.6, 1.1, .04, 0xf5f5f5); bx(deco, 1.7, 1.3, .06, 5.6, 1.2, .06, 0x8fd0ff, { em: true }); bx(deco, .06, 1.3, .08, 5.6, 1.2, .08, 0xf5f5f5); bx(deco, 1.7, .06, .08, 5.6, 1.82, .08, 0xf5f5f5); bx(deco, 2.1, .08, .2, 5.6, 1.04, .12, 0xd9d9d9);   // ventana
  bx(deco, .08, .8, .6, .04, 1.6, 2.2, 0x2c2c2c); bx(deco, .06, .68, .48, .08, 1.66, 2.2, 0xf1b04a); bx(deco, .08, .6, .9, .04, 1.7, 5.4, 0x2c2c2c); bx(deco, .06, .48, .78, .08, 1.76, 5.4, 0x5aa0d8);    // cuadros
  /* ----- muebles: se colocan solos pegados a las paredes o en el suelo ----- */
  const rects = [], items = []; let xN = .35, zW = 1.9; const floorSpots = [[5.7, 5.9], [2.4, 6.5], [6.9, 2.8], [3.4, 3.4]];
  function place(kind) {
    const def = FURN[kind]; if (!def) return; const m = buildModel("furn", kind), g = m.g; let x, z, rot = 0, w = def.w, d = def.d;
    if (def.place === "wallN" && xN + w <= ROOM - .2) { x = xN + w / 2; z = d / 2 + .08; xN += w + .25; }
    else if ((def.place === "wallN" || def.place === "wallW") && zW + w <= ROOM - .3) { rot = Math.PI / 2; [w, d] = [d, w]; x = w / 2 + .08; z = zW + d / 2; zW += d + .25; }
    else if (def.place === "rug") { x = 4.3; z = 4.3; }
    else { const s = floorSpots.shift() || [rnd(2, 6.5), rnd(2, 6.5)]; x = s[0]; z = s[1]; }
    g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g); items.push(g); if (!def.flat) rects.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  }
  const order = [...new Set(furn.filter(k => FURN[k]))].sort((a, b) => (FURN[b].place === "rug") - (FURN[a].place === "rug") || FURN[b].w - FURN[a].w);
  order.forEach(place);
  const blocked = (x, z, r = .32) => rects.some(q => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r);
  const lineFree = (ax, az, bx2, bz, r) => { for (let i = 0; i <= 14; i++) { const t = i / 14; if (blocked(lerp(ax, bx2, t), lerp(az, bz, t), r)) return false; } return true; };
  const spot = (fx, fz, r, tries = 24) => { for (let i = 0; i < tries; i++) { const x = rnd(.9, ROOM - .9), z = rnd(.9, ROOM - .9); if (!blocked(x, z, r) && Math.hypot(x - fx, z - fz) > 1.6 && lineFree(fx, fz, x, z, r)) return [x, z]; } return null; };
  /* ----- avatar 2D (sprite) ----- */
  const st = { mode: "idle", x: 4, z: 4.5, tx: 0, tz: 0, flip: false, t: 0, a: 0, next: 1.2, dur: 0 };
  while (blocked(st.x, st.z, .4)) { st.x = rnd(1, 7); st.z = rnd(3, 7); }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, alphaTest: .08, depthWrite: true })); sprite.visible = false; scene.add(sprite);
  const shadow = (r) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .28, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = .015; scene.add(m); return m; };
  const aShadow = shadow(.42); let img = null, set = null; const figTex = new WeakMap();
  const texOf = fig => { let t = figTex.get(fig); if (!t) { t = new THREE.CanvasTexture(fig); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; figTex.set(fig, t); } return t; };
  loadSkin(skinSources).then(i => { if (!alive || !i) return; img = i; set = createFigureSet(i, { slim, k: 3, cos }); });
  /* ----- mascota 3D ----- */
  let petG = null; const ps = { x: 5.5, z: 5.5, tx: 5.5, tz: 5.5, wait: 1, hop: 0, t: 0, yaw: 0 }; let pShadow = null;
  if (pet && PETS[pet]) { const m = buildModel("pets", pet); petG = new THREE.Group(); petG.add(m.g); petG.userData.sq = m.g.userData.squash; scene.add(petG); pShadow = shadow(.26); let tries = 0; while (blocked(ps.x, ps.z, .3) && tries++ < 40) { ps.x = rnd(1, 7); ps.z = rnd(1, 7); } ps.tx = ps.x; ps.tz = ps.z; }
  /* ----- corazones ----- */
  const heartTex = (() => { const rows = ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000"], c = document.createElement("canvas"); c.width = 7; c.height = 6; const g = c.getContext("2d"); rows.forEach((r, j) => [...r].forEach((v, i) => { if (v === "1") { g.fillStyle = i === 1 && j === 1 ? "#ff9db0" : "#ff4d6d"; g.fillRect(i, j, 1, 1); } })); const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const hearts = [];
  const burst = (x, y, z) => { for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false })); s.scale.set(.34, .3, 1); s.position.set(x, y, z).addScaledVector(right, (i - 1.5) * .3); s.renderOrder = 10; scene.add(s); hearts.push({ s, l: rnd(1, 1.5), p: rnd(0, 6) }); } };
  /* ----- comportamiento ----- */
  let alive = true, raf = 0, last = 0;
  const setMode = m => { st.mode = m; st.t = 0; st.a = 0; if (m === "idle") st.next = rnd(1.6, 4.2); if (m === "dance") st.dur = (ANIMS.dance.frames.length / ANIMS.dance.fps) * (3 + Math.floor(Math.random() * 3)); };
  const walkTo = () => { const s = spot(st.x, st.z, .34); if (!s) return setMode("idle"); st.tx = s[0]; st.tz = s[1]; setMode("walk"); };
  const pick = () => { const r = Math.random(); if (r < .6) walkTo(); else if (r < .8) setMode("dance"); else setMode("idle"); };
  function update(dt) {
    st.t += dt;
    if (st.mode === "walk") {
      const dx = st.tx - st.x, dz = st.tz - st.z, d = Math.hypot(dx, dz), step = 1.15 * dt; const sd = dx - dz; if (Math.abs(sd) > .02) st.flip = sd > 0;
      if (d <= step) { st.x = st.tx; st.z = st.tz; setMode("idle"); } else { st.x += dx / d * step; st.z += dz / d * step; st.a += dt * ANIMS.walk.fps; }
    } else if (st.mode === "dance") { st.a += dt * ANIMS.dance.fps; if (st.t > st.dur) setMode("idle"); }
    else if (st.mode === "jump") { st.a += dt * ANIMS.jump.fps * .75; if (st.a >= ANIMS.jump.frames.length) setMode("idle"); }
    else { st.a += dt * ANIMS.idle.fps; if (st.t > st.next) pick(); }
    if (petG) {                                                                              // mascota: pasea a su aire y salta si la tocas
      ps.t += dt; const dx = ps.tx - ps.x, dz = ps.tz - ps.z, d = Math.hypot(dx, dz); ps.hop = Math.max(0, ps.hop - dt * 2.4);
      if (d > .05) { const step = .8 * dt; ps.x += dx / d * Math.min(step, d); ps.z += dz / d * Math.min(step, d); ps.yaw = Math.atan2(dx, dz); }
      else { ps.wait -= dt; if (ps.wait <= 0) { ps.wait = rnd(1.5, 4); const s = spot(ps.x, ps.z, .3, 12); if (s) { ps.tx = s[0]; ps.tz = s[1]; } } }
      const mv = d > .05 ? 1 : 0, bob = Math.abs(Math.sin(ps.t * 9)) * .06 * mv + Math.sin(Math.PI * Math.min(1, ps.hop)) * .45 * (ps.hop > 0 ? 1 : 0);
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
  /* ----- interacción: tocar al avatar o a la mascota ----- */
  const ray = new THREE.Raycaster(), pt = new THREE.Vector2();
  const pick2 = e => { const r = canvas.getBoundingClientRect(); pt.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(pt, cam); if (sprite.visible && ray.intersectObject(sprite).length) return "a"; if (petG && ray.intersectObject(petG, true).length) return "p"; return null; };
  const onDown = e => { if (e.button) return; const k = pick2(e); if (!k) return; e.preventDefault(); if (k === "a") { burst(st.x, 2.1, st.z); if (st.mode !== "jump") setMode("jump"); } else { burst(ps.x, .8, ps.z); ps.hop = 1; } };
  const onMove = e => { canvas.style.cursor = pick2(e) ? "pointer" : "default"; };
  canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
  function destroy() { if (!alive) return; alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); try { R.dispose(); R.forceContextLoss(); } catch (e) { /* nada */ } }
  raf = requestAnimationFrame(frame);
  return { destroy, download() { exportAvatar(img, slim, name); }, addFurniture() { }, test };
}
