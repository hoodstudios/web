/* zombies3d.js — ZOMBIES 3D (BETA v2): shooter táctico-arcade de rondas contra zombis estilo Minecraft, en una escuela compacta.
 * Solo accesible desde el Panel de Administración mientras esté en beta. Three.js local (vendor/).
 * Controles: WASD mover · Shift esprintar · C agacharse · Q/E asomarse · Clic izq. disparar/atacar · Clic der. mira del arma
 *            Z apuntar desde la cadera (zoom) · B modo de disparo · R recargar · V golpe rápido · 1/2/3 o rueda cambiar arma · M sonido
 * Precisión: la bala sale SIEMPRE por el centro de la pantalla; el retroceso (estilo CS2) mueve ese centro hacia arriba y a los lados. */
import * as THREE from "./vendor/three.module.js";

const V3 = THREE.Vector3, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t, damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ======================= Armas (datos) =======================
 * pos = pose relajada (sin apuntar) · ads = mira del arma · hip = apuntar desde la cadera se calcula entre ambas
 * rc  = retroceso por disparo (radianes): up = hacia arriba, side = amplitud lateral, ph = fase del patrón */
const WEAPONS = {
  ak47: { id: "ak47", name: "AK-47", desc: "Potente y pesada. Retroceso fuerte.", slot: 0, kind: "gun", auto: true, delay: .1, dmg: 30, hs: 2.5, mag: 30, reserve: 150, reload: 2.3, snd: "ak", kick: 1.2, pos: [.17, -.2, -.44], ads: [0, -.076, -.42], fov: 50, rc: { up: .0105, side: .0058, ph: 0 } },
  m4a4: { id: "m4a4", name: "M4A4", desc: "Cadencia alta y retroceso suave.", slot: 0, kind: "gun", auto: true, delay: .085, dmg: 24, hs: 2.5, mag: 30, reserve: 180, reload: 1.95, snd: "m4", kick: .8, pos: [.17, -.2, -.44], ads: [0, -.086, -.38], fov: 52, rc: { up: .0078, side: .0042, ph: 1.7 } },
  pistol: { id: "pistol", name: "Pistola", desc: "Rápida de sacar. Semiautomática.", slot: 1, kind: "gun", auto: false, delay: .14, dmg: 26, hs: 2.6, mag: 12, reserve: 96, reload: 1.4, snd: "pistol", kick: 1, pos: [.17, -.16, -.34], ads: [0, -.057, -.3], fov: 58, rc: { up: .012, side: .0025, ph: .6 } },
  silenced: { id: "silenced", name: "Pistola silenciada", desc: "Casi sin ruido ni fogonazo.", slot: 1, kind: "gun", auto: false, delay: .15, dmg: 22, hs: 2.7, mag: 15, reserve: 105, reload: 1.5, snd: "silenced", kick: .7, pos: [.17, -.16, -.34], ads: [0, -.057, -.3], fov: 58, rc: { up: .0085, side: .002, ph: 2.4 } },
  knife: { id: "knife", name: "Cuchillo", desc: "Rápido y letal de cerca.", slot: 2, kind: "melee", delay: .34, dmg: 55, range: 1.9, arc: .75, knock: 1.4, cleave: 1, pos: [.2, -.2, -.38] },
  bat: { id: "bat", name: "Bate", desc: "Lento, golpea a varios y los lanza.", slot: 2, kind: "melee", delay: .62, dmg: 80, range: 2.5, arc: 1.05, knock: 7, cleave: 4, pos: [.22, -.18, -.4] }
};
const SLOT_DEF = ["ak47", "pistol", "knife"];
/* Patrón de retroceso (como CS2): primero sube con fuerza, después se desvía a los lados. Devuelve [pitch, yaw] en radianes para el disparo nº i del spray */
function recoilAt(w, i) {
  const r = w.rc, up = r.up * (i < 9 ? 1 + i * .09 : i < 16 ? 1.7 : 1.15), amp = r.side * Math.min(1, i / 5) * (i > 12 ? 1.5 : 1);
  return [up, Math.sin(i * .62 + r.ph) * amp + (i > 4 ? Math.sin(i * .21 + r.ph * 2) * r.side * .5 : 0)];
}

/* ======================= Audio sintetizado con reverb (interior/exterior) ======================= */
const Snd = (() => {
  let ac = null, master, dry, wet, conv, nb = null, amb = null, muted = false, indoor = 0, surf = 0, active = 0;
  try { muted = localStorage.getItem("hood_z3d_mute") === "1"; } catch (e) { /* sin almacenamiento */ }
  const init = () => {
    if (ac) { if (ac.state === "suspended") ac.resume(); return ac; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    master = ac.createGain(); master.gain.value = muted ? 0 : .85; const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; master.connect(comp); comp.connect(ac.destination);
    dry = ac.createGain(); dry.connect(master); wet = ac.createGain(); wet.gain.value = .25; conv = ac.createConvolver();
    const len = ac.sampleRate * 1.8, buf = ac.createBuffer(2, len, ac.sampleRate); for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    conv.buffer = buf; wet.connect(conv); conv.connect(master);
    nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; return ac;
  };
  const route = (n, w, pan) => { let o = n; if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); n.connect(p); o = p; } o.connect(dry); if (w) { const g = ac.createGain(); g.gain.value = w; o.connect(g); g.connect(wet); } };
  const env = (g, t, v, a, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); };
  const tone = (type, f0, f1, d, v, dl = 0, w = 0, pan = 0, att = .004) => { if (!ac || active > 40) return; const t = ac.currentTime + dl, o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d); env(g, t, v, att, d); o.connect(g); route(g, w, pan); o.start(t); o.stop(t + d + att + .05); active++; o.onended = () => active--; };
  const noise = (d, v, ft, f0, f1, q, dl = 0, w = 0, pan = 0, att = .002) => { if (!ac || active > 40) return; const t = ac.currentTime + dl, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = nb; s.loop = true; s.playbackRate.value = rnd(.9, 1.1); f.type = ft; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + d); f.Q.value = q; env(g, t, v, att, d); s.connect(f); f.connect(g); route(g, w, pan); s.start(t, Math.random()); s.stop(t + d + att + .05); active++; s.onended = () => active--; };
  const groan = (pan, vol, big) => {
    if (!ac) return; const t = ac.currentTime, d = rnd(.9, 1.6) * (big ? 1.3 : 1), f = rnd(78, 125) * (big ? .7 : 1), g = ac.createGain(), lp = ac.createBiquadFilter(), f1 = ac.createBiquadFilter(), lfo = ac.createOscillator(), lg = ac.createGain();
    lp.type = "lowpass"; lp.frequency.value = 500 + vol * 2800; f1.type = "bandpass"; f1.frequency.setValueAtTime(rnd(450, 700), t); f1.frequency.linearRampToValueAtTime(rnd(900, 1300), t + d); f1.Q.value = 3;
    lfo.frequency.value = rnd(5, 9); lg.gain.value = f * .05; lfo.connect(lg); const mix = ac.createGain(); mix.gain.value = 1; for (const k of [1, 1.51]) { const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f * k, t); o.frequency.linearRampToValueAtTime(f * k * rnd(.7, 1.15), t + d); lg.connect(o.frequency); o.connect(mix); o.start(t); o.stop(t + d + .1); }
    lfo.start(t); lfo.stop(t + d + .1); mix.connect(f1); f1.connect(lp); lp.connect(g); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2 * vol, t + d * .25); g.gain.linearRampToValueAtTime(0, t + d); route(g, .45 + indoor * .3, pan);
    noise(d * .8, .05 * vol, "bandpass", 700, 400, 1, 0, .3, pan, d * .2);
  };
  const S = {
    ak: () => { noise(.07, 1, "highpass", 2200, 900, .7, 0, .5); noise(.2, .8, "bandpass", 1100, 280, .8, 0, .4); tone("sine", 150, 42, .2, 1.1); tone("square", 800, 200, .05, .25); noise(.7, .3, "lowpass", 700, 150, .5, .02, 1.2); },
    m4: () => { noise(.06, 1, "highpass", 3000, 1200, .7, 0, .5); noise(.15, .75, "bandpass", 1500, 400, .9, 0, .4); tone("sine", 190, 60, .14, .95); tone("square", 1100, 300, .04, .2); noise(.55, .25, "lowpass", 900, 200, .5, .02, 1.1); },
    pistol: () => { noise(.05, .9, "highpass", 2600, 1000, .8, 0, .5); noise(.12, .6, "bandpass", 1800, 500, 1, 0, .4); tone("sine", 230, 70, .1, .8); noise(.4, .22, "lowpass", 1000, 250, .5, .02, 1); },
    silenced: () => { noise(.12, .35, "bandpass", 1600, 700, .6, 0, .12); tone("sine", 140, 70, .08, .3); tone("square", 500, 180, .03, .1, .01); },
    empty: () => { tone("square", 1700, 900, .02, .15); noise(.03, .25, "highpass", 3000, 2000, 1); },
    magout: () => { noise(.03, .45, "highpass", 1400, 900, 1); tone("triangle", 380, 150, .09, .35, .02); tone("sine", 90, 60, .08, .2, .05); },
    magin: () => { tone("triangle", 260, 120, .08, .45); noise(.04, .5, "highpass", 1200, 800, 1, .03); tone("sine", 100, 55, .1, .35, .02); },
    bolt: () => { noise(.025, .5, "highpass", 2500, 1800, 1); tone("square", 900, 300, .03, .2, .01); noise(.03, .55, "highpass", 2200, 1500, 1, .1); tone("triangle", 500, 200, .06, .25, .1); },
    draw: () => { noise(.12, .3, "bandpass", 1400, 600, 1.2); tone("triangle", 420, 260, .05, .15, .06); },
    swish: (k = 1) => { noise(.24, .45, "bandpass", 450 * k, 1900 * k, 1.8, 0, .1, 0, .06); },
    stab: () => { noise(.1, .5, "highpass", 1500, 900, 1); },
    knifehit: () => { noise(.08, .6, "highpass", 2500, 1200, 1); tone("sine", 230, 80, .12, .5); tone("sawtooth", 600, 240, .08, .15); },
    bathit: () => { tone("sine", 130, 42, .24, 1); noise(.1, .85, "lowpass", 3500, 500, .6); tone("square", 300, 90, .06, .3); noise(.4, .3, "lowpass", 600, 150, .5, .02, .8); },
    hit: () => { tone("sine", 1900, 1500, .05, .22); },
    head: () => { tone("sine", 2500, 1800, .09, .3); tone("triangle", 1250, 800, .12, .25, .01); noise(.05, .3, "highpass", 3000, 2000, 1); },
    kill: () => { tone("sine", 700, 1500, .1, .13, 0); tone("sine", 1050, 2200, .12, .1, .05); },
    step: (v = 1) => { if (surf === 0) { noise(.05, .22 * v, "bandpass", 2000, 1100, 2); tone("sine", 140, 70, .07, .2 * v); noise(.07, .08 * v, "highpass", 4000, 3000, 1, .02); } else { noise(.09, .2 * v, "lowpass", 900, 300, .6, 0, .1); tone("sine", 100, 60, .07, .12 * v); } },
    hurt: () => { tone("sawtooth", 190, 90, .28, .38); tone("square", 140, 70, .2, .2); noise(.18, .4, "bandpass", 700, 300, 1); },
    beat: () => { tone("sine", 62, 40, .16, .7); tone("sine", 58, 38, .16, .55, .17); },
    round: () => { tone("sawtooth", 55, 55, 1.8, .22, 0, .6, 0, .5); tone("sawtooth", 82, 82, 1.8, .17, 0, .6, 0, .6); tone("sine", 110, 220, 1.6, .22, .2, .4, 0, .8); noise(1.2, .18, "bandpass", 300, 1800, 2, 0, .6, 0, .8); },
    clear: () => { [392, 494, 587, 784].forEach((f, i) => tone("triangle", f, f, .55, .22, i * .1, .5)); },
    over: () => { tone("sawtooth", 220, 50, 1.6, .38, 0, .6); tone("sine", 70, 30, 1.8, .6); noise(1.4, .28, "lowpass", 800, 100, .6, 0, .7); },
    pick: () => { tone("sine", 800, 1400, .1, .22); },
    ui: () => { tone("square", 900, 700, .03, .1); },
    groan: (pan, vol, big) => groan(pan || 0, vol == null ? 1 : vol, big),
    zhit: (pan, vol = 1) => { noise(.1, .4 * vol, "bandpass", 500, 200, 1.5, 0, .2, pan); tone("sine", 160, 80, .1, .35 * vol, 0, .1, pan); },
    zdie: (pan, vol = 1) => { tone("sawtooth", 150, 55, .8, .32 * vol, 0, .5, pan, .02); noise(.5, .22 * vol, "lowpass", 900, 150, 1, .05, .4, pan); tone("sine", 70, 40, .3, .5 * vol, .35, .3, pan); },
    atk: (pan, vol = 1) => { tone("sawtooth", 210, 120, .3, .3 * vol, 0, .3, pan); noise(.28, .3 * vol, "bandpass", 1100, 600, 2, 0, .3, pan); },
    break: () => { noise(.25, .5, "highpass", 2000, 900, 1); tone("triangle", 800, 200, .1, .2); }
  };
  let ambNodes = [], ambTimer = 0;
  return {
    ac: init, get muted() { return muted; }, setIndoor(v) { indoor = v; if (wet) wet.gain.setTargetAtTime(.14 + v * .55, ac.currentTime, .3); }, setSurface(s) { surf = s; },
    play(n, ...a) { if (muted || !init()) return; try { (S[n] || (() => { }))(...a); } catch (e) { /* ignorar */ } },
    toggle() { muted = !muted; try { localStorage.setItem("hood_z3d_mute", muted ? "1" : "0"); } catch (e) { /* nada */ } if (master) master.gain.value = muted ? 0 : .85; return muted; },
    ambient() {
      if (!init() || amb) return; amb = true; const t = ac.currentTime;
      const w = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain(); w.buffer = nb; w.loop = true; f.type = "lowpass"; f.frequency.value = 380; g.gain.value = .07; l.frequency.value = .11; lg.gain.value = 140; l.connect(lg); lg.connect(f.frequency); w.connect(f); f.connect(g); g.connect(master); w.start(t); l.start(t);
      const dr = ac.createOscillator(), dr2 = ac.createOscillator(), dg = ac.createGain(), tl = ac.createOscillator(), tg = ac.createGain(); dr.type = "sine"; dr.frequency.value = 55; dr2.type = "triangle"; dr2.frequency.value = 82.7; dg.gain.value = .045; tl.frequency.value = .08; tg.gain.value = .02; tl.connect(tg); tg.connect(dg.gain); dr.connect(dg); dr2.connect(dg); dg.connect(master); dr.start(t); dr2.start(t); tl.start(t);
      ambNodes = [w, l, dr, dr2, tl]; ambTimer = setInterval(() => { if (!muted && Math.random() < .55) groan(rnd(-1, 1), rnd(.12, .3), Math.random() < .3); }, 6500);
    },
    stopAmb() { for (const n of ambNodes) { try { n.stop(); } catch (e) { /* ya parado */ } } ambNodes = []; amb = null; clearInterval(ambTimer); }
  };
})();

/* ======================= Mapa: escuela compacta (parece enorme, pero es pequeña) ======================= */
const WX = 26, WZ = 20, H = 3.6;                         // 52 × 40 m en total
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const BOXF = [[[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]], [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
  [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]], [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]]];
class Batch {                                              // geometría estática combinada: un solo dibujo, color por vértice, oclusión ambiental falsa y UV por metro
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.col = new THREE.Color(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, "YXZ"); this.s = new V3(1, 1, 1); }
  box(cx, cy, cz, sx, sy, sz, color, rotY = 0, rotZ = 0, uvs = 1) {
    this.col.set(color); const hx = sx / 2, hy = sy / 2, hz = sz / 2, floor = cy - hy < .06; this.e.set(0, rotY, rotZ, "YXZ"); this.q.setFromEuler(this.e); this.m.compose(new V3(cx, cy, cz), this.q, this.s);
    for (const [nl, cs] of BOXF) {
      if (nl[1] === -1 && floor) continue; const n = new V3(...nl).applyQuaternion(this.q), b = this.p.length / 3, an = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)], sh = n.y > .5 ? 1 : n.y < -.5 ? .5 : .76 + .14 * an[2];
      for (const c of cs) {
        const p = new V3(c[0] * hx, c[1] * hy, c[2] * hz).applyMatrix4(this.m), ao = (nl[1] === 0 && c[1] < 0 && floor) ? .68 : 1, k = sh * ao;
        this.p.push(p.x, p.y, p.z); this.n.push(n.x, n.y, n.z); this.c.push(this.col.r * k, this.col.g * k, this.col.b * k);
        if (an[1] >= an[0] && an[1] >= an[2]) this.u.push(p.x * uvs, p.z * uvs); else if (an[0] >= an[2]) this.u.push(p.z * uvs, p.y * uvs); else this.u.push(p.x * uvs, p.y * uvs);
      }
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2)); g.setIndex(this.i); const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
  }
}
function canvasTex(w, h, draw, rep) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; if (rep) t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; return t; }
const gray = (g, x, y, w, h, v) => { v = clamp(Math.round(v), 0, 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, w, h); };
const TEX = {};
function mapTextures() {
  if (TEX.brick) return TEX;
  TEX.brick = canvasTex(32, 32, (g) => { gray(g, 0, 0, 32, 32, 150); for (let r = 0; r < 4; r++) for (let b = 0; b < 2; b++) { const x = (b * 16 + (r % 2) * 8) % 32; for (let i = 0; i < 2; i++) { /* ladrillos de 16×8 con juntas */ const bx = (x + i * 0) % 32, v = 190 + hash(r, b) * 55; gray(g, bx + 1, r * 8 + 1, 14, 6, v); if (bx + 16 > 32) gray(g, 0, r * 8 + 1, 15 - (32 - bx) + 1, 6, v); break; } }
    for (let i = 0; i < 90; i++) gray(g, hash(i, 1) * 32 | 0, hash(i, 2) * 32 | 0, 1, 1, 150 + hash(i, 3) * 100); });
  TEX.plaster = canvasTex(16, 16, (g) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) gray(g, x, y, 1, 1, 226 + hash(x, y) * 29); for (let i = 0; i < 8; i++) gray(g, hash(i, 9) * 16 | 0, hash(i, 8) * 16 | 0, 1, 1, 190); });
  TEX.tile = canvasTex(32, 32, (g) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const v = (x + y) % 2 ? 150 : 185; for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) gray(g, x * 16 + i, y * 16 + j, 1, 1, v + hash(i + x * 16, j + y * 16) * 26 - 8); } g.fillStyle = "rgba(0,0,0,.35)"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); g.fillRect(0, 16, 32, 1); g.fillRect(16, 0, 1, 32); }, [18, 1.75]);
  TEX.wood = canvasTex(32, 32, (g) => { for (let r = 0; r < 4; r++) { const v = 150 + hash(r, 4) * 70; for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) gray(g, x, r * 8 + y, 1, 1, v + hash(x >> 2, y + r * 8) * 25 - (y === 0 ? 60 : 0)); } });
  TEX.grass = canvasTex(32, 32, (g) => { g.fillStyle = "#335a2f"; g.fillRect(0, 0, 32, 32); for (let i = 0; i < 260; i++) { g.fillStyle = hash(i, 3) > .55 ? "#3f6b39" : hash(i, 4) > .5 ? "#2a4a27" : "#4c7a3f"; g.fillRect(hash(i, 1) * 32 | 0, hash(i, 2) * 32 | 0, 1, 1); } });
  TEX.conc = canvasTex(32, 32, (g) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) gray(g, x, y, 1, 1, 96 + hash(x, y) * 34); g.fillStyle = "rgba(0,0,0,.3)"; g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32); });
  TEX.sky = canvasTex(1024, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#04060d"); gr.addColorStop(.6, "#0b1226"); gr.addColorStop(1, "#1a2440"); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 520; i++) { const a = .25 + hash(i, 5) * .75; g.fillStyle = `rgba(255,255,${230 + hash(i, 6) * 25 | 0},${a})`; const s = hash(i, 7) > .93 ? 2 : 1; g.fillRect(hash(i, 8) * w | 0, hash(i, 9) * h * .75 | 0, s, s); } });
  TEX.sky.wrapS = TEX.sky.wrapT = THREE.ClampToEdgeWrapping; TEX.sky.magFilter = THREE.LinearFilter; TEX.sky.minFilter = THREE.LinearFilter; return TEX;
}

function buildMap(scene) {
  const T3 = mapTextures(), BR = new Batch(), PL = new Batch(), E = new Batch(), colliders = [], flick = [];
  const col = (x0, z0, x1, z1, h = H) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h });
  const BRICK = 0xc0705c, PLAS = 0xe6dcc4, GRN = 0x4f8a6c, WOOD = 0x9a6a38, METAL = 0x86909c, DARK = 0x2b2e35, T = .3, ZH = 1.75;
  /* ---- paredes con huecos para puertas; ventanas opcionales; "ext" = ladrillo ---- */
  const split = (a, b, gaps) => { const iv = []; let cur = a; for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) { if (g0 > cur) iv.push([cur, g0]); cur = g1; } if (cur < b) iv.push([cur, b]); return iv; };
  function planks(B, cx, cy, cz, w, alongX, off) {           // tablones clavados (cierran ventanas y puertas)
    const n = 3; for (let k = 0; k < n; k++) { const ang = (k - 1) * .22, y = cy + (k - 1) * .32; if (alongX) B.box(cx, y, cz + off, w, .18, .06, 0x7a5430, 0, ang); else B.box(cx + off, y, cz, .06, .18, w, 0x7a5430, ang * 0 + 0, 0); }
  }
  function hwall(z, xa, xb, gaps = [], o = {}) {
    const B = o.ext ? BR : PL, c = o.ext ? BRICK : PLAS;
    for (const [a, b] of split(xa, xb, gaps)) {
      col(a, z - T / 2, b, z + T / 2); const L = b - a, cx = (a + b) / 2;
      if (o.win && L > 3) {
        B.box(cx, .55, z, L, 1.1, T, c); B.box(cx, H - .5, z, L, 1, T, c); const n = Math.max(1, Math.floor(L / 3)), pw = L / n;
        for (let k = 0; k <= n; k++) B.box(a + k * pw, H / 2, z, k === 0 || k === n ? .5 : .45, H, T, c);
        for (let k = 0; k < n; k++) { const wx = a + (k + .5) * pw; E.box(wx, 1.8, z, pw - .5, 1.5, .05, 0x101a28); B.box(wx, 1.8, z, .05, 1.5, .08, 0x30343a); B.box(wx, 1.8, z, pw - .5, .05, .08, 0x30343a); if (hash(wx, z) > .45) { planks(B, wx, 1.8, z, pw - .3, true, z > 0 ? .17 : -.17); } }
      } else { B.box(cx, H / 2, z, L, H, T, c); if (!o.ext) B.box(cx, .55, z, L, 1.1, T + .05, GRN); }
    }
    for (const [g0, g1] of gaps) { B.box((g0 + g1) / 2, H - .45, z, g1 - g0, .9, T, c); B.box(g0 - .06, 1.35, z, .12, 2.7, T + .06, 0x4a3a2a); B.box(g1 + .06, 1.35, z, .12, 2.7, T + .06, 0x4a3a2a); }
  }
  function vwall(x, za, zb, gaps = [], o = {}) {
    const B = o.ext ? BR : PL, c = o.ext ? BRICK : PLAS;
    for (const [a, b] of split(za, zb, gaps)) { col(x - T / 2, a, x + T / 2, b); B.box(x, H / 2, (a + b) / 2, T, H, b - a, c); if (!o.ext) B.box(x, .55, (a + b) / 2, T + .05, 1.1, b - a, GRN); }
    for (const [g0, g1] of gaps) { B.box(x, H - .45, (g0 + g1) / 2, T, .9, g1 - g0, c); B.box(x, 1.35, g0 - .06, T + .06, 2.7, .12, 0x4a3a2a); B.box(x, 1.35, g1 + .06, T + .06, 2.7, .12, 0x4a3a2a); }
  }
  /* ---- edificio 36 × 16: pasillo central + 8 aulas; 4 puertas BLOQUEADAS ---- */
  const DC = [-13.5, -4.5, 4.5, 13.5], open = { n: [-13.5, 4.5], s: [-4.5, 13.5] }, doors = c => [c - 1, c + 1];
  hwall(-8, -18, 18, [[3.4, 5.6]], { ext: true, win: true }); hwall(8, -18, 18, [[-5.6, -3.4]], { ext: true, win: true });
  vwall(-18, -8, 8, [[-1.5, 1.5]], { ext: true }); vwall(18, -8, 8, [[-1.5, 1.5]], { ext: true });
  hwall(-ZH, -18, 18, DC.map(doors)); hwall(ZH, -18, 18, DC.map(doors));
  for (const x of [-9, 0, 9]) { vwall(x, ZH, 8); vwall(x, -8, -ZH); }
  for (const [side, cs] of [[-1, DC.filter(c => !open.n.includes(c))], [1, DC.filter(c => !open.s.includes(c))]]) for (const c of cs) {   // barricadas en las puertas bloqueadas
    const z = side * ZH; col(c - 1, z - .3, c + 1, z + .3, H); for (let k = 0; k < 4; k++) PL.box(c, .55 + k * .55, z + side * .05, 2.1, .2, .1, 0x7a5430, 0, (k % 2 ? .06 : -.05));
    PL.box(c, 1.2, z - side * .05, 2.1, .2, .1, 0x7a5430, 0, .75); PL.box(c, 1.2, z - side * .05, 2.1, .2, .1, 0x7a5430, 0, -.75); E.box(c, 2.2, z + side * .12, .5, .22, .02, 0xd9372a);
  }
  for (const sx of [-1, 1]) E.box(sx * 17.75, 3, 0, .12, .3, .9, 0x2eff7a);           // letreros SALIDA al final del pasillo
  /* ---- techo, suelos ---- */
  PL.box(0, H + .15, 0, 37, .3, 17, 0x34363d); const light = (x, z, w, d) => E.box(x, H - .03, z, w, .06, d, 0xfff2cc);
  for (const lx of [-15, -9, -3, 3, 9, 15]) light(lx, 0, 1.6, .45);
  for (const c of DC) for (const sg of [1, -1]) light(c, sg * 5, 2, .45);
  const mats = { br: new THREE.MeshLambertMaterial({ vertexColors: true, map: T3.brick }), pl: new THREE.MeshLambertMaterial({ vertexColors: true, map: T3.plaster }), em: new THREE.MeshBasicMaterial({ vertexColors: true }) };
  const floor = (w, d, x, z, tex, y = .01, rep, c = 0xffffff) => { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(rep[0], rep[1]); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t, color: c })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); scene.add(m); return m; };
  floor(36, 3.5, 0, 0, T3.tile, .012, [18, 1.75]); floor(52, 40, 0, 0, T3.conc, .004, [26, 20], 0xb8b8b8);
  for (const [gx, gz] of [[-22, -16.5], [22, -16.5], [-22, 16.5], [22, 16.5]]) floor(7, 5, gx, gz, T3.grass, .008, [7, 5]);
  /* ---- aulas: pizarra, mesa del profesor, 9 pupitres cada una; algunas con muebles volcados ---- */
  const desk = (x, z, rot = 0, tip = false) => { PL.box(x, .74, z, .6, .05, 1, 0xc79a5b, rot, 0); PL.box(x - .26, .37, z - .4, .05, .74, .05, METAL); PL.box(x - .26, .37, z + .4, .05, .74, .05, METAL); PL.box(x + .26, .37, z - .4, .05, .74, .05, METAL); PL.box(x + .26, .37, z + .4, .05, .74, .05, METAL); PL.box(x + .62, .44, z, .42, .05, .42, 0x2f5f8f); PL.box(x + .8, .7, z, .05, .4, .42, 0x2f5f8f); if (!tip) col(x - .35, z - .55, x + .95, z + .55, .8); };
  for (const [xa, xb] of [[-18, -9], [-9, 0], [0, 9], [9, 18]]) for (const sg of [-1, 1]) {
    const zc = sg * 4.9, w = xa + .2; PL.box(w, 1.7, zc, .06, 1.2, 3.6, 0x1f4b3a); PL.box(w, 1.06, zc, .1, .06, 3.7, 0xc9c9c9); PL.box(w + .6, .5, zc, .7, 1, 1.5, 0x6d4620); col(w - .1, zc - .8, w + .95, zc + .8, 1);
    for (const cx of [xa + 2.8, xa + 4.7, xa + 6.6]) for (const dz of [-1.9, 0, 1.9]) desk(cx, zc + dz, 0, hash(cx, zc + dz) > .86);
    PL.box(xb - .15, 2.3, zc - 2.2, .05, .5, 1, 0xd9a04a); PL.box(xb - .15, 2.0, zc + 2, .05, .7, .5, 0x4a7ac0);      // pósters
    floor(9 - .4, 6.25 - .4, (xa + xb) / 2, sg * (ZH + 6.25 / 2), T3.wood, .014, [4.5, 3], 0xb38a5a);
  }
  /* ---- pasillo: taquillas, obstáculos y escombros que lo vuelven un laberinto ---- */
  const junk = (x, z0, z1, w) => {                                                 // montón de pupitres y sillas apilados
    const zc = (z0 + z1) / 2, d = Math.abs(z1 - z0); col(x - w / 2, Math.min(z0, z1), x + w / 2, Math.max(z0, z1), 1.5);
    for (let k = 0; k < 9; k++) { const rx = x + (hash(k, x) - .5) * (w - .5), rz = zc + (hash(k, z0 + 5) - .5) * (d - .4), y = .3 + (k % 3) * .38; PL.box(rx, y, rz, rnd(.6, 1), .45, rnd(.4, .9), k % 2 ? 0xc79a5b : 0x2f5f8f, hash(k, 3) * 3, hash(k, 4) * .6 - .3); }
    PL.box(x, 1.05, zc, w * .8, .08, d * .7, METAL, .3, .1);
  };
  const JK = [[-9, -ZH + .15, -.2], [9, .2, ZH - .15], [-16, .2, ZH - .15], [16, -ZH + .15, -.2], [0, 0, 0]].filter(j => j[0] !== 0);
  for (const [x, a, b] of JK) junk(x, a, b, 1.6);
  const lockerFree = x => !DC.some(c => Math.abs(x - c) < 1.5) && Math.abs(x) < 17.3, nearJunk = (x, sg) => JK.some(([jx, a]) => Math.abs(x - jx) < 2.3 && ((a < 0) === (sg > 0)));
  for (const sg of [1, -1]) { let run = null; for (let x = -17.2; x < 17.2; x += .7) { const cx = x + .35;
      if (!lockerFree(cx) || nearJunk(cx, sg)) { if (run) { col(run[0], sg * 1.17, run[1], sg * 1.6, 2); run = null; } continue; }
      PL.box(cx, 1, sg * 1.37, .66, 2, .45, (Math.floor((x + 40) / .7) % 3 === 0) ? 0x2f6f9f : 0x3b9a6f); PL.box(cx, 1.4, sg * 1.37 - sg * .23, .22, .5, .02, 0x20262e); if (hash(cx, sg) > .8) PL.box(cx, 1, sg * 1.37 - sg * .24, .4, 1.6, .03, 0x1c2128);
      if (!run) run = [x, x + .7]; else run[1] = x + .7; } if (run) col(run[0], sg * 1.17, run[1], sg * 1.6, 2); }
  for (const [x, z, w, d, c] of [[-12, .2, .9, .6, 0xdedede], [-2.5, -.9, .5, .7, 0xdedede], [6.5, .6, .8, .5, 0xdedede], [13.2, -.5, .6, .4, 0xdedede], [-6.5, .9, .7, .5, 0xdedede]]) PL.box(x, .014, z, w, .01, d, c, hash(x, z) * 3);   // papeles
  for (const [x, z, s] of [[-2, .4, 1.4], [3.8, -.5, 1.1], [-11, .6, 1], [11.5, .3, 1.6], [-5, -.9, .9]]) PL.box(x, .018, z, s, .01, s * .8, 0x4a0d0d, hash(x, 1) * 3);   // manchas de sangre
  /* ---- patio: muro perimetral, vehículos, contenedores, barricadas, árboles ---- */
  hwall(-WZ, -WX, WX, [], { ext: true }); hwall(WZ, -WX, WX, [], { ext: true }); vwall(-WX, -WZ, WZ, [], { ext: true }); vwall(WX, -WZ, WZ, [], { ext: true });
  for (let x = -WX + 1; x < WX; x += 4) { PL.box(x, H + .12, -WZ, .6, .5, .6, 0x6a2f25); PL.box(x, H + .12, WZ, .6, .5, .6, 0x6a2f25); }
  const prop = (cx, cz, sx, sz, h, color, rot = 0, collide = true) => { PL.box(cx, h / 2, cz, sx, h, sz, color, rot); if (collide) { const r = Math.abs(Math.sin(rot)) > .5 ? [sz, sx] : [sx, sz]; col(cx - r[0] / 2, cz - r[1] / 2, cx + r[0] / 2, cz + r[1] / 2, h); } };
  const vehicle = (x, z, len, rot, c, tall) => { prop(x, z, len, 1.9, 1.1, c, rot); PL.box(x, 1.4, z, len * .5, .6, 1.7, 0x25303c, rot); PL.box(x, 1.7, z, len * .48, .06, 1.7, c, rot); if (tall) PL.box(x + len * .2, 1.7, z, len * .3, .5, 1.8, 0xc9c9c9, rot); };
  prop(-10, -13.5, 9, 2.6, 2.4, 0xe3a21a); PL.box(-10, 2.1, -13.5, 9.05, .8, 2.65, 0x2c2f35); PL.box(-10, 2.62, -13.5, 8.6, .12, 2.4, 0xe3a21a); vehicle(8, -12.5, 4.4, 0, 0x9a3030); prop(16.5, -15.5, 6, 2.4, 2.6, 0x2f6f8a);
  vehicle(-14, 12.5, 4.4, .3, 0x30508a); prop(10, 12.6, 2.2, 1.2, 1.2, 0x2f6a3a); prop(14.5, 16, 6, 2.4, 2.8, 0x6a6f78); prop(-22.5, -4.5, 2.4, 6, 2.6, 0xa06a2a); vehicle(-21, 7, 4.4, 1.2, 0x7a7a3a); prop(22.5, 5, 2.4, 6, 2.6, 0x2f6f8a); vehicle(21, -7, 4.4, 1.5, 0x8a3a6a);
  for (const [x, z, sx, sz] of [[-1, -10.4, 2.6, .8], [-3.5, 10.4, 2.6, .8], [20.5, 11, .9, 3.4], [-20.8, -11, .9, 3.4], [6, -17.6, 3, .8], [-8, 17.6, 3, .8]]) { prop(x, z, sx, sz, 1, 0x9a9a92); PL.box(x, 1.05, z, sx, .1, sz * .4, 0xd9372a); }
  for (const [x, z] of [[-21, -17], [0, -17.5], [23, -14], [-23, 16], [3, 17.5], [23, 15], [-5, -10.6], [12, 10.6]]) { prop(x, z, .7, .7, 3, 0x5a3a22); PL.box(x, 4.2, z, 3.4, 2.6, 3.4, 0x2f7a36); PL.box(x, 5.8, z, 2.2, 1.6, 2.2, 0x3a9040); }
  for (const [x, z, r] of [[-24.6, 12, 1.57], [24.5, -12, 1.57], [-14, -10.6, 0], [14, 10.6, 0]]) prop(x, z, 2, .5, .45, 0x7a5a30, r);
  const lamps = [[-22, 0], [22, 0], [0, -15], [0, 15]]; for (const [x, z] of lamps) { prop(x, z, .25, .25, 5, 0x3a3d44); E.box(x, 5.1, z, .8, .15, .8, 0xffe6a8); }
  prop(-24, 0, .3, .3, 7, 0xcfcfcf); PL.box(-23.2, 6.5, 0, 1.6, 1, .04, 0xc0392b);
  /* ---- horizonte: ciudad apagada tras el muro (da sensación de mundo enorme) ---- */
  const cityMat = [0x0d111b, 0x0f1522, 0x0b0f18, 0x121827];
  for (let i = 0; i < 70; i++) {
    const side = i % 4, d = 34 + hash(i, 1) * 40, o = (hash(i, 2) - .5) * 130, w = 7 + hash(i, 3) * 10, h = 8 + hash(i, 4) * 26, x = side === 0 ? -d : side === 1 ? d : o, z = side === 2 ? -d : side === 3 ? d : o;
    if (Math.abs(x) < 31 && Math.abs(z) < 25) continue; E.box(x, h / 2, z, w, h, w * (.7 + hash(i, 5) * .6), cityMat[i % 4]);
    for (let k = 0; k < 7; k++) if (hash(i, k + 9) > .55) { const wy = 2 + hash(k, i) * (h - 3), wx = x + (hash(i, k + 3) - .5) * (w - 2); const sz = side < 2 ? 0 : 1; E.box(side === 0 ? x + w / 2 + .06 : side === 1 ? x - w / 2 - .06 : wx, wy, side === 2 ? z + w / 2 + .06 : side === 3 ? z - w / 2 - .06 : z, side < 2 ? .08 : .9, 1, side < 2 ? .9 : .08, hash(k, i) > .5 ? 0xffd27a : 0x9ad0ff); void sz; }
  }
  scene.add(BR.mesh(mats.br)); scene.add(PL.mesh(mats.pl)); scene.add(E.mesh(mats.em));
  /* ---- cielo estrellado y luna ---- */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 12), new THREE.MeshBasicMaterial({ map: T3.sky, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -2; scene.add(sky);
  const moon = new THREE.Mesh(new THREE.BoxGeometry(14, 14, 3), new THREE.MeshBasicMaterial({ color: 0xe8efff, fog: false })); moon.position.set(-90, 90, -110); moon.lookAt(0, 0, 0); scene.add(moon);
  /* ---- luces ---- */
  const lights = []; for (const [x, y, z, c, i, d] of [[-12, 3.1, 0, 0xffe9c0, 12, 18], [0, 3.1, 0, 0xffe9c0, 12, 18], [12, 3.1, 0, 0xffe9c0, 12, 18], [-22, 5, 0, 0xffe0a0, 38, 24], [22, 5, 0, 0xffe0a0, 38, 24], [0, 5, -15, 0xffe0a0, 38, 24], [0, 5, 15, 0xffe0a0, 38, 24]]) { const l = new THREE.PointLight(c, i, d, 2); l.position.set(x, y, z); scene.add(l); lights.push(l); flick.push({ l, base: i, ph: Math.random() * 9, bad: x === -12 || x === 12 }); }
  const spawnOut = [[-24.5, -18], [-24.5, 0], [-24.5, 18], [0, -18.7], [0, 18.7], [24.5, -18], [24.5, 0], [24.5, 18], [-12, -18.7], [12, -18.7], [-12, 18.7], [12, 18.7], [-24.5, 10], [24.5, -10]];
  const spawnIn = [[-13.5, -5], [4.5, -5], [-4.5, 5], [13.5, 5], [-16.5, 0], [16.5, 0]];
  return { colliders, spawnOut, spawnIn, lights, flick, start: { x: 0, z: 0, yaw: -Math.PI / 2 } };
}

/* rejilla de colisiones (celdas de 4 m) + campo de flujo (1 m) para que los zombis rodeen paredes */
class World {
  constructor(map) {
    this.col = map.colliders; this.cs = 4; this.gw = Math.ceil(WX * 2 / this.cs) + 1; this.gh = Math.ceil(WZ * 2 / this.cs) + 1; this.cells = Array.from({ length: this.gw * this.gh }, () => []);
    this.col.forEach((c, i) => { const a = Math.floor((c.x0 + WX) / this.cs), b = Math.floor((c.x1 + WX) / this.cs), d = Math.floor((c.z0 + WZ) / this.cs), e = Math.floor((c.z1 + WZ) / this.cs);
      for (let x = Math.max(0, a); x <= Math.min(this.gw - 1, b); x++) for (let z = Math.max(0, d); z <= Math.min(this.gh - 1, e); z++) this.cells[z * this.gw + x].push(i); });
    this.NX = WX * 2; this.NZ = WZ * 2; this.blocked = new Uint8Array(this.NX * this.NZ); this.dist = new Int16Array(this.NX * this.NZ).fill(9999); this.queue = new Int32Array(this.NX * this.NZ);
    for (let iz = 0; iz < this.NZ; iz++) for (let ix = 0; ix < this.NX; ix++) { const x = ix - WX + .5, z = iz - WZ + .5; this.blocked[iz * this.NX + ix] = this.col.some(c => x > c.x0 - .6 && x < c.x1 + .6 && z > c.z0 - .6 && z < c.z1 + .6 && c.h > .9) ? 1 : 0; }
    this.src = -1;
  }
  resolve(p, r, hMax = 9) {                                         // empuja un círculo fuera de paredes y muebles
    for (let it = 0; it < 2; it++) {
      const a = Math.floor((p.x - r + WX) / this.cs), b = Math.floor((p.x + r + WX) / this.cs), d = Math.floor((p.z - r + WZ) / this.cs), e = Math.floor((p.z + r + WZ) / this.cs);
      for (let cx = Math.max(0, a); cx <= Math.min(this.gw - 1, b); cx++) for (let cz = Math.max(0, d); cz <= Math.min(this.gh - 1, e); cz++) for (const i of this.cells[cz * this.gw + cx]) {
        const c = this.col[i]; if (c.h > hMax) continue;
        const px = clamp(p.x, c.x0, c.x1), pz = clamp(p.z, c.z0, c.z1), dx = p.x - px, dz = p.z - pz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-9) { const dd = Math.sqrt(d2), k = (r - dd) / dd; p.x += dx * k; p.z += dz * k; }
          else { const l = p.x - c.x0, rr = c.x1 - p.x, t = p.z - c.z0, bb = c.z1 - p.z, m = Math.min(l, rr, t, bb); if (m === l) p.x = c.x0 - r; else if (m === rr) p.x = c.x1 + r; else if (m === t) p.z = c.z0 - r; else p.z = c.z1 + r; }
        }
      }
    }
    p.x = clamp(p.x, -WX + r, WX - r); p.z = clamp(p.z, -WZ + r, WZ - r);
  }
  rayWall(ox, oy, oz, dx, dy, dz, maxT) {                           // distancia al primer obstáculo que tape la altura del rayo
    let best = maxT; const x1 = ox + dx * maxT, z1 = oz + dz * maxT, seen = new Set();
    const a = Math.floor((Math.min(ox, x1) + WX) / this.cs), b = Math.floor((Math.max(ox, x1) + WX) / this.cs), d = Math.floor((Math.min(oz, z1) + WZ) / this.cs), e = Math.floor((Math.max(oz, z1) + WZ) / this.cs);
    for (let cx = Math.max(0, a); cx <= Math.min(this.gw - 1, b); cx++) for (let cz = Math.max(0, d); cz <= Math.min(this.gh - 1, e); cz++) for (const i of this.cells[cz * this.gw + cx]) {
      if (seen.has(i)) continue; seen.add(i); const c = this.col[i]; let t0 = 0, t1 = best, ok = true;
      for (const [o, dd, lo, hi] of [[ox, dx, c.x0, c.x1], [oz, dz, c.z0, c.z1]]) {
        if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } } else { let ta = (lo - o) / dd, tb = (hi - o) / dd; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; } }
      }
      if (ok && t0 < best && oy + dy * t0 < c.h && oy + dy * t0 > 0) best = t0;
    }
    return best;
  }
  flow(px, pz) {                                                    // BFS desde el jugador
    const ix = clamp(Math.floor(px + WX), 0, this.NX - 1), iz = clamp(Math.floor(pz + WZ), 0, this.NZ - 1), s = iz * this.NX + ix; if (s === this.src) return; this.src = s;
    this.dist.fill(9999); let h = 0, t = 0; this.dist[s] = 0; this.queue[t++] = s; const NX = this.NX, NZ = this.NZ;
    while (h < t) {
      const cur = this.queue[h++], cx = cur % NX, cz = (cur / NX) | 0, nd = this.dist[cur] + 1;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dz = DIRS[k][1], nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue; const ni = nz * NX + nx;
        if (this.blocked[ni] || this.dist[ni] <= nd) continue; if (dx && dz && (this.blocked[cz * NX + nx] || this.blocked[nz * NX + cx])) continue;
        this.dist[ni] = nd; this.queue[t++] = ni;
      }
    }
  }
  next(x, z, out) {
    const ix = clamp(Math.floor(x + WX), 0, this.NX - 1), iz = clamp(Math.floor(z + WZ), 0, this.NZ - 1), NX = this.NX; let bd = this.dist[iz * NX + ix], bx = -1, bz = -1;
    for (let k = 0; k < 8; k++) { const nx = ix + DIRS[k][0], nz = iz + DIRS[k][1]; if (nx < 0 || nz < 0 || nx >= NX || nz >= this.NZ) continue; const d = this.dist[nz * NX + nx]; if (d < bd) { bd = d; bx = nx; bz = nz; } }
    if (bx < 0) return false; out.x = bx - WX + .5; out.z = bz - WZ + .5; return true;
  }
  distAt(x, z) { return this.dist[clamp(Math.floor(z + WZ), 0, this.NZ - 1) * this.NX + clamp(Math.floor(x + WX), 0, this.NX - 1)]; }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/* ======================= Modelos de armas (cajas con textura de ruido estilo Minecraft) ======================= */
const noiseTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 8; const x = c.getContext("2d"); for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const v = 205 + hash(i, j) * 50 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, j, 1, 1); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t; })();
const matCache = {}, M = c => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c, map: noiseTex })), BOXG = new THREE.BoxGeometry(1, 1, 1);
const bx = (p, sx, sy, sz, x, y, z, c, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(BOXG, M(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); p.add(m); return m; };
const SKIN = 0xc99468, SLEEVE = 0x2a9fb0, GUN = 0x2a2c31, GUN2 = 0x4a4e55, WOODC = 0x8a4f25, BLK = 0x16171a, STEEL = 0x9aa3ad;
function buildWeapon(id) {
  const g = new THREE.Group(), o = { g, mag: null, bolt: null, muzzle: new THREE.Vector3(0, .02, -.5), anchor: new THREE.Vector3(-.03, -.02, .08), rGrip: new V3(0, -.07, .09), lGrip: new V3(0, -.04, -.3), magBase: new V3(0, -.12, -.06) };
  if (id === "ak47") {
    bx(g, .052, .07, .34, 0, 0, -.02, GUN); bx(g, .054, .02, .3, 0, .045, -.02, GUN2); bx(g, .03, .012, .26, 0, .056, -.02, 0x3a3d44); bx(g, .014, .05, .03, 0, .03, -.19, BLK);
    bx(g, .024, .024, .34, 0, .02, -.36, GUN2); bx(g, .014, .014, .3, 0, .052, -.3, 0x3a3d44); bx(g, .03, .03, .06, 0, .02, -.54, BLK); bx(g, .036, .036, .03, 0, .02, -.575, 0x26282c);
    bx(g, .008, .04, .008, 0, .056, -.53, BLK); bx(g, .014, .02, .02, 0, .045, -.53, BLK); bx(g, .01, .03, .016, -.016, .07, .07, BLK); bx(g, .01, .03, .016, .016, .07, .07, BLK); bx(g, .05, .012, .03, 0, .06, .07, BLK);
    bx(g, .058, .055, .21, 0, -.005, -.3, WOODC); bx(g, .052, .016, .17, 0, .042, -.3, 0x7a4320); bx(g, .046, .1, .22, 0, -.02, .25, WOODC, -.08, 0, 0); bx(g, .05, .11, .02, 0, -.02, .36, 0x20201f, -.08, 0, 0);
    bx(g, .04, .1, .05, 0, -.085, .09, WOODC, -.35, 0, 0); bx(g, .045, .008, .09, 0, -.045, .03, GUN); o.mag = bx(g, .036, .1, .06, 0, -.1, -.065, GUN2, .12, 0, 0); bx(o.mag, 1, .8, 1, 0, -.9, .35, GUN2, .0, 0, 0); o.mag.userData.sub = true;
    o.bolt = bx(g, .012, .02, .05, .03, .015, -.04, BLK); o.muzzle.set(0, .02, -.6); o.anchor.set(-.03, -.005, -.06); o.rGrip.set(0, -.085, .1); o.lGrip.set(0, -.045, -.3); o.magBase.set(0, -.1, -.065);
  } else if (id === "m4a4") {
    bx(g, .052, .075, .3, 0, 0, 0, 0x34373d); bx(g, .046, .02, .5, 0, .055, -.05, 0x2b2d31); for (let k = 0; k < 9; k++) bx(g, .05, .006, .012, 0, .067, -.22 + k * .045, 0x1b1c1f);
    bx(g, .056, .06, .26, 0, -.005, -.3, 0x2f3238); cy(g, .027, .3, 0, .005, -.33, 0x25272b); bx(g, .02, .02, .1, 0, .1, .02, 0x2b2d31); bx(g, .03, .012, .16, 0, .09, .0, 0x2b2d31); bx(g, .014, .03, .03, 0, .075, -.03, 0x2b2d31);
    bx(g, .01, .03, .016, -.013, .077, .02, BLK); bx(g, .01, .03, .016, .013, .077, .02, BLK); bx(g, .02, .02, .03, 0, .01, -.62, BLK); bx(g, .034, .034, .06, 0, .01, -.63, 0x1d1e21);
    bx(g, .008, .04, .008, 0, .065, -.52, BLK); bx(g, .014, .02, .02, 0, .056, -.52, BLK); bx(g, .052, .075, .17, 0, -.01, .24, 0x2f3238, -.05, 0, 0); bx(g, .04, .1, .05, 0, -.085, .07, 0x2f3238, -.35, 0, 0);
    o.mag = bx(g, .034, .16, .055, 0, -.12, -.05, 0x22242a, .1, 0, 0); o.bolt = bx(g, .012, .02, .05, .03, .02, .0, BLK); o.muzzle.set(0, .01, -.66); o.anchor.set(-.03, -.005, -.04); o.rGrip.set(0, -.085, .075); o.lGrip.set(0, -.04, -.3); o.magBase.set(0, -.12, -.05);
  } else if (id === "pistol" || id === "silenced") {
    const s = id === "silenced"; o.bolt = bx(g, .03, .038, .2, 0, .02, -.04, 0x3b3f46); for (let k = 0; k < 4; k++) bx(g, .032, .03, .004, 0, .022, .03 + k * .012, 0x22242a); bx(g, .028, .03, .17, 0, -.012, -.03, GUN); bx(g, .028, .09, .045, 0, -.06, .05, 0x23252a, -.18, 0, 0);
    bx(g, .006, .02, .05, 0, -.03, -.0, GUN2); bx(g, .02, .006, .05, 0, -.037, -.02, GUN2); bx(g, .007, .016, .007, 0, .047, -.13, BLK); bx(g, .007, .016, .012, -.009, .047, .05, BLK); bx(g, .007, .016, .012, .009, .047, .05, BLK); bx(g, .012, .018, .014, 0, .03, .09, GUN2);
    o.mag = bx(g, .022, .02, .03, 0, -.108, .06, GUN2); if (s) { cy(g, .017, .17, 0, .02, -.22, 0x1d1f23); cy(g, .019, .012, 0, .02, -.305, BLK); o.muzzle.set(0, .02, -.31); } else o.muzzle.set(0, .022, -.14);
    o.anchor.set(-.02, -.05, .05); o.rGrip.set(0, -.055, .06); o.lGrip.set(-.03, -.075, .035); o.magBase.set(0, -.108, .06);
  } else if (id === "knife") {
    bx(g, .026, .03, .11, 0, 0, .0, 0x1c1d21); bx(g, .06, .012, .016, 0, .0, -.06, 0x3b3f46); bx(g, .006, .036, .17, 0, .006, -.15, 0xcfd5dc); bx(g, .006, .014, .1, 0, -.008, -.17, 0xcfd5dc); bx(g, .004, .012, .04, 0, .026, -.22, 0xe9eef3);
    o.anchor.set(0, -.01, .055); o.rGrip.set(0, 0, .02);
  } else {                                                         // bate
    cy(g, .018, .26, 0, 0, .0, 0x1c1d21); cy(g, .027, .2, 0, 0, -.2, 0xb07a3a); cy(g, .036, .2, 0, 0, -.38, 0xb07a3a); cy(g, .04, .08, 0, 0, -.52, 0xa06c30); bx(g, .04, .04, .01, 0, 0, -.57, 0x7a4f22); for (let k = 0; k < 3; k++) bx(g, .082, .006, .082, 0, 0, -.28 - k * .1, 0x8a5a28);
    o.anchor.set(0, -.018, .12); o.rGrip.set(0, 0, .03); o.lGrip.set(0, 0, -.12);
  }
  return o;
}
const CYG = new THREE.CylinderGeometry(1, 1, 1, 10); CYG.rotateX(Math.PI / 2);
function cy(p, r, len, x, y, z, c) { const m = new THREE.Mesh(CYG, M(c)); m.scale.set(r, r, len); m.position.set(x, y, z); p.add(m); return m; }
/* ---- Llaveros: pixel-art incluidos + cualquier objeto de la tienda con imagen ---- */
const CHARM_PAL = { W: "#e8e8e8", K: "#15151a", R: "#e23b3b", Y: "#f4c430", B: "#3b7de2", C: "#7fd4ff", G: "#3bd16f", O: "#f08a24", P: "#c050e0", D: "#8a5a2b", g: "#2f8f4a" };
const CHARMS = [
  { id: "c_skull", name: "Calavera", px: [".WWWWWW.", "WWWWWWWW", "WKKWWKKW", "WKKWWKKW", "WWWKKWWW", ".WWWWWW.", ".WKWKWK.", "..WWWWW."] },
  { id: "c_heart", name: "Corazón", px: [".RR..RR.", "RRRRRRRR", "RWRRRRRR", "RRRRRRRR", ".RRRRRR.", "..RRRR..", "...RR...", "........"] },
  { id: "c_star", name: "Estrella", px: ["...YY...", "...YY...", "YYYYYYYY", ".YYYYYY.", "..YYYY..", ".YYYYYY.", ".YY..YY.", "YY....YY"] },
  { id: "c_bolt", name: "Rayo", px: ["....YYY.", "...YYY..", "..YYY...", ".YYYYYY.", "...YYY..", "..YY....", "..Y.....", ".Y......"] },
  { id: "c_gem", name: "Gema", px: ["........", ".CCCCCC.", "CBCCCCBC", "CBBCCBBC", ".BBBBBB.", "..BBBB..", "...BB...", "........"] },
  { id: "c_pizza", name: "Pizza", px: ["DDDDDDDD", "OYYOYYOO", ".ORYYRO.", ".OYYYYO.", "..ORRO..", "..OYYO..", "...OO...", "...O...."] },
  { id: "c_zombie", name: "Zombi", px: ["gggggggg", "gggggggg", "gYKggYKg", "gKKggKKg", "gggggggg", "gKKKKKKg", "gKgKgKgg", ".gggggg."] },
  { id: "c_cherry", name: "Cerezas", px: ["....gg..", "...g..g.", "..g....g", ".RR..RR.", "RRRR.RRR", "RWRR.RWR", "RRRR.RRR", ".RR...RR"] }
];
const texCache = {};
function charmTex(def) {
  if (!def) return null; if (texCache[def.id]) return texCache[def.id]; let t;
  if (def.px) {
    const c = document.createElement("canvas"); c.width = c.height = 8; const x = c.getContext("2d");
    def.px.forEach((row, j) => [...row].forEach((ch, i) => { if (CHARM_PAL[ch]) { x.fillStyle = CHARM_PAL[ch]; x.fillRect(i, j, 1, 1); } }));
    t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  } else { t = new THREE.TextureLoader().load(def.img); }
  t.colorSpace = THREE.SRGBColorSpace; return (texCache[def.id] = t);
}
class Keychain {                                                    // cadena de Verlet: 3 eslabones + dije. Cuelga con la gravedad real de la pantalla
  constructor(scene) {
    this.N = 4; this.L = .03; this.p = []; this.o = []; for (let i = 0; i < this.N; i++) { this.p.push(new V3()); this.o.push(new V3()); }
    this.g = new THREE.Group(); this.g.visible = false; scene.add(this.g); this.links = [];
    for (let i = 0; i < this.N - 1; i++) { const m = new THREE.Mesh(BOXG, M(0xc9ced6)); m.scale.set(.007, this.L * 1.08, .007); this.g.add(m); this.links.push(m); }
    this.charm = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, alphaTest: .1 })); this.charm.scale.set(.065, .065, 1); this.g.add(this.charm);
    this.has = false; this.init = false;
  }
  set(def) { this.has = !!def; this.g.visible = this.has; if (def) { this.charm.material.map = charmTex(def); this.charm.material.needsUpdate = true; } this.init = false; }
  step(dt, anchor, grav) {
    if (!this.has) return; dt = Math.min(dt, .033);
    if (!this.init) { for (let i = 0; i < this.N; i++) { this.p[i].copy(anchor).addScaledVector(grav, i * this.L); this.o[i].copy(this.p[i]); } this.init = true; }
    const sub = 2, h = dt / sub, tmp = new V3();
    for (let s = 0; s < sub; s++) {
      this.p[0].copy(anchor); this.o[0].copy(anchor);
      for (let i = 1; i < this.N; i++) { tmp.copy(this.p[i]).sub(this.o[i]).multiplyScalar(.985); this.o[i].copy(this.p[i]); this.p[i].add(tmp).addScaledVector(grav, 9 * h * h); }
      for (let k = 0; k < 4; k++) for (let i = 0; i < this.N - 1; i++) {
        const a = this.p[i], b = this.p[i + 1]; tmp.copy(b).sub(a); const d = tmp.length() || 1e-6, diff = (d - this.L) / d;
        if (i === 0) b.addScaledVector(tmp, -diff); else { a.addScaledVector(tmp, diff * .5); b.addScaledVector(tmp, -diff * .5); }
      }
    }
    const up = new V3(0, 1, 0), q = new THREE.Quaternion(), dir = new V3();
    for (let i = 0; i < this.N - 1; i++) { const a = this.p[i], b = this.p[i + 1]; dir.copy(b).sub(a); const m = this.links[i]; m.position.copy(a).add(b).multiplyScalar(.5); q.setFromUnitVectors(up, dir.normalize()); m.quaternion.copy(q); }
    const e = this.p[this.N - 1], pr = this.p[this.N - 2]; dir.copy(e).sub(pr).normalize();
    this.charm.position.copy(e).addScaledVector(dir, .031); this.charm.rotation.set(0, 0, Math.atan2(dir.x, -dir.y));
  }
}


/* ---- Vista en primera persona: brazos estilo Minecraft con codo (IK de 2 huesos), 3 posturas de apuntado y asomarse ---- */
const flashTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "#fff"); g.addColorStop(.3, "#ffd27a"); g.addColorStop(1, "rgba(255,120,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#fff6c8"; for (let i = 0; i < 6; i++) { x.save(); x.translate(32, 32); x.rotate(i * Math.PI / 3); x.fillRect(-2, 0, 4, 31); x.restore(); } return new THREE.CanvasTexture(c); })();
const smooth = x => x * x * (3 - 2 * x), easeOut = x => 1 - (1 - x) * (1 - x);
class Arm {
  constructor(scene, side) {
    this.side = side; this.up = new THREE.Mesh(BOXG, M(SLEEVE)); this.fo = new THREE.Mesh(BOXG, M(SKIN)); this.cuff = new THREE.Mesh(BOXG, M(0x1f7f8c)); this.S = new V3(side * .21, -.3, .12); this.E = new V3(); this.t = new V3(); this.d = new V3(); this.pole = new V3(); this.g = new THREE.Group();
    this.g.add(this.up, this.fo, this.cuff); scene.add(this.g);
  }
  place(m, a, b, th, lenAdd = 0) { const len = a.distanceTo(b) + lenAdd; m.position.copy(a).add(b).multiplyScalar(.5); m.scale.set(th, th, len); m.lookAt(b); }
  update(H) {
    const S = this.S, l1 = .34, l2 = .34, d = this.d.copy(H).sub(S), L = Math.min(d.length(), (l1 + l2) * .995), dir = d.normalize(), a = (l1 * l1 - l2 * l2 + L * L) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    this.pole.set(this.side * .55, -1, .15); this.pole.addScaledVector(dir, -this.pole.dot(dir)).normalize(); this.E.copy(S).addScaledVector(dir, a).addScaledVector(this.pole, h);
    this.t.copy(S).addScaledVector(dir, L); this.place(this.up, S, this.E, .095); this.place(this.fo, this.E, H, .088, .05); this.cuff.position.copy(this.E).lerp(H, .16); this.cuff.scale.set(.1, .1, .09); this.cuff.lookAt(H);
  }
}
class ViewModel {
  constructor() {
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(58, 1, .01, 10); this.cam.rotation.order = "YXZ";
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x5a5560, 2.1)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(.6, 1, .8); this.scene.add(d);
    this.fl = new THREE.PointLight(0xffb060, 0, 2.5, 2); this.scene.add(this.fl);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.flash.visible = false; this.scene.add(this.flash);
    this.kc = new Keychain(this.scene); this.aR = new Arm(this.scene, 1); this.aL = new Arm(this.scene, -1); this.spare = new THREE.Mesh(BOXG, M(0x2a2c31)); this.spare.scale.set(.034, .12, .055); this.spare.visible = false; this.scene.add(this.spare);
    this.models = {}; this.w = null; this.id = null; this.def = null; this.t = 0; this.bobT = 0; this.kick = 0; this.kickRot = 0; this.sx = 0; this.sy = 0; this.reloadT = -1; this.reloadDur = 1; this.equipT = 0; this.swingT = -1; this.swingDur = .3; this.swingType = 0; this.flashT = 0; this.sil = false; this.hT = new V3(); this.lT = new V3(); this.tmp = new V3(); this.lastL = new V3();
  }
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  setWeapon(id, charm) {
    if (this.w) this.scene.remove(this.w.g); this.id = id; this.def = WEAPONS[id]; this.w = this.models[id] || (this.models[id] = buildWeapon(id)); if (!this.w.magY0 && this.w.mag) this.w.magY0 = this.w.mag.position.y; if (!this.w.boltZ0 && this.w.bolt) this.w.boltZ0 = this.w.bolt.position.z;
    this.scene.add(this.w.g); this.kc.set(charm); this.equipT = 1; this.reloadT = -1; this.swingT = -1; this.w.g.visible = true; this.sil = id === "silenced"; this.aL.g.visible = id !== "knife"; this.spare.visible = false;
  }
  fire() { const d = this.def; this.kick = Math.min(.05, this.kick + .02 * d.kick); this.kickRot = Math.min(.09, this.kickRot + .02 * d.kick); this.flashT = this.sil ? .02 : .05; this.fl.intensity = this.sil ? 0 : 3.2; this.flashRot = Math.random() * 6.28; this.flashS = rnd(.12, .2); if (this.w.bolt) this.w.boltK = 1; }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  swing(dur, type) { this.swingT = 0; this.swingDur = dur; this.swingType = type; }
  update(dt, st) {
    const W = this.w; if (!W) return; const def = this.def, g = W.g, gun = def.kind === "gun"; this.t += dt;
    const ads = gun ? st.ads : 0, aim = gun ? st.aim * (1 - ads) : 0, sp = st.sprint, spd = st.speed, lean = st.lean || 0;
    this.sx = damp(this.sx, clamp(-st.dx * .0011, -.06, .06), 11, dt); this.sy = damp(this.sy, clamp(st.dy * .0011, -.05, .05), 11, dt); this.bobT += dt * spd * (sp > .5 ? 11 : 7.5);
    const bobA = spd * (1 - ads * .85) * (sp > .5 ? 1.8 : 1), bx0 = Math.sin(this.bobT) * .007 * bobA, by0 = Math.abs(Math.cos(this.bobT)) * -.008 * bobA, br = Math.sin(this.t * 1.4) * .0014 * (1 - ads * .8);
    const P0 = def.pos, A = gun ? def.ads : P0, Hp = [A[0] + (P0[0] - A[0]) * .5, A[1] + (P0[1] - A[1]) * .42, A[2] + (P0[2] - A[2]) * .78], low = gun ? (1 - aim) * (1 - ads) : 0;
    let px = lerp(lerp(P0[0], Hp[0], aim), A[0], ads), py = lerp(lerp(P0[1], Hp[1], aim), A[1], ads), pz = lerp(lerp(P0[2], Hp[2], aim), A[2], ads), rx = low * -.04, ry = low * .1, rz = low * .03;
    px += bx0 + this.sx; py += by0 + br + this.sy * .6; rx += this.sy * .5; ry += this.sx * 1.2;
    px += sp * (gun ? .06 : .04); py -= sp * .08; ry += sp * (gun ? .75 : .3); rx += sp * (gun ? .18 : -.2); rz -= sp * .15; px -= lean * .05; rz += lean * .1;
    this.kick = damp(this.kick, 0, 16, dt); this.kickRot = damp(this.kickRot, 0, 14, dt); pz += this.kick; rx += this.kickRot * (1 - ads * .35); py += this.kick * .3; if (st.crouch) py += .004;
    if (this.equipT > 0) { this.equipT = Math.max(0, this.equipT - dt / .4); const e = this.equipT * this.equipT; py -= e * .3; rx -= e * .9; rz += e * .3; }
    let magOff = 0, magVis = true, rp = -1;
    if (this.reloadT >= 0) {
      this.reloadT += dt; const r = rp = Math.min(1, this.reloadT / this.reloadDur), d = r < .18 ? smooth(r / .18) : r < .82 ? 1 : smooth((1 - r) / .18); py -= d * .1; rx += d * .45; rz += d * .5; px -= d * .05;
      if (r < .25) magOff = 0; else if (r < .4) magOff = -(r - .25) / .15 * .3; else if (r < .6) magOff = -.3; else if (r < .72) magOff = -.3 * (1 - (r - .6) / .12); if (r >= .4 && r < .6) magVis = false;
      if (W.bolt && r > .82 && r < .95) W.boltK = Math.sin((r - .82) / .13 * Math.PI); if (r >= 1) this.reloadT = -1;
    }
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur; const s = Math.min(1, this.swingT);
      if (this.id === "knife" && this.swingType === 0) { const a = s < .3 ? -s / .3 * .3 : s < .5 ? -.3 + (s - .3) / .2 * 1.3 : 1 - (s - .5) / .5; pz -= a * .32; rx += a * .15; py += a * .03; }
      else { const a = s < .25 ? -s / .25 : s < .6 ? -1 + 2 * easeOut((s - .25) / .35) : 1 - (s - .6) / .4, bat = this.id === "bat", k = bat ? 1.25 : .8; rz += a * k * (this.swingType ? -1 : 1); ry += a * .55 * (bat ? 1 : .6); rx += (bat ? -a * .45 : -a * .2); px -= a * (bat ? .22 : .14); pz -= Math.max(0, a) * .15; py += (bat ? Math.abs(a) * .03 : 0); }
      if (this.swingT >= 1) this.swingT = -1;
    }
    if (!gun) { rz += .25; rx += .25; if (this.id === "bat") { rx += .55; ry += .1; px += .02; } else { rx += .1; ry += .35; } }
    g.position.set(px, py, pz); g.rotation.set(rx, ry, rz);
    if (W.mag) { W.mag.visible = magVis; W.mag.position.y = W.magY0 + magOff; }
    if (W.bolt) { W.boltK = Math.max(0, (W.boltK || 0) - dt * 14); W.bolt.position.z = W.boltZ0 + W.boltK * (this.id === "pistol" || this.id === "silenced" ? .045 : .04); }
    g.updateMatrixWorld(true);
    /* manos: la derecha en la empuñadura; la izquierda en el guardamano, o en el cargador al recargar */
    this.hT.copy(W.rGrip); g.localToWorld(this.hT); this.aR.update(this.hT);
    if (this.aL.g.visible) {
      this.lT.copy(W.lGrip); if (rp >= 0 && gun) {
        const mp = this.tmp.copy(W.magBase); mp.y = W.magY0 + magOff; const w = rp < .18 ? 0 : rp < .28 ? smooth((rp - .18) / .1) : rp < .74 ? 1 : smooth(1 - (rp - .74) / .14);
        if (rp >= .4 && rp < .6) { const k = (rp - .4) / .2; mp.set(-.1 - Math.sin(k * Math.PI) * .03, -.34 + k * .04, mp.z + .02); } this.lT.lerp(mp, w);
      }
      g.localToWorld(this.lT); this.aL.update(this.lT);
      this.spare.visible = rp >= .4 && rp < .6; if (this.spare.visible) { this.spare.position.copy(this.lT).add(this.tmp.set(0, .05, 0)); this.spare.quaternion.copy(g.quaternion); }
    }
    this.aR.g.visible = true;
    if (this.flashT > 0) { this.flashT -= dt; const m = new V3().copy(W.muzzle); g.localToWorld(m); this.flash.position.copy(m); this.flash.rotation.set(0, 0, this.flashRot); this.flash.scale.setScalar(this.flashS * (this.sil ? .3 : 1)); this.flash.visible = !this.sil || this.flashT > 0; this.fl.position.copy(m); }
    else { this.flash.visible = false; this.fl.intensity = 0; }
    this.cam.rotation.z = st.roll || 0;
    if (this.kc.has) { const a = new V3().copy(W.anchor); g.localToWorld(a); const gv = new V3(0, -1, 0).applyQuaternion(st.camQuat.clone().invert()); this.kc.step(dt, a, gv); }
  }
}

/* ======================= Partículas, decales de sangre y trazadoras ======================= */
class Particles {
  constructor(scene, cap = 600) {
    this.cap = cap; this.n = 0; this.m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), cap); this.m.frustumCulled = false; this.m.count = 0;
    this.m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); scene.add(this.m);
    this.P = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: .05, g: 12, c: new THREE.Color() })); this.d = new THREE.Object3D();
    const dg = new THREE.PlaneGeometry(1, 1); dg.rotateX(-Math.PI / 2); this.dec = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: 0x5a0d0d, transparent: true, opacity: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 140); this.dec.frustumCulled = false; this.dec.count = 0; scene.add(this.dec); this.dn = 0; this.dt = 0;
  }
  emit(x, y, z, vx, vy, vz, life, s, color, g = 12) { if (this.n >= this.cap) return; const p = this.P[this.n++]; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.s = s; p.g = g; p.c.set(color); }
  burst(x, y, z, n, color, sp, s, life, up = 1, g = 12) { for (let i = 0; i < n; i++) this.emit(x, y, z, rnd(-sp, sp), rnd(-sp * .3, sp) * up, rnd(-sp, sp), life * rnd(.6, 1.2), s * rnd(.6, 1.3), Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, g); }
  gibs(x, y, z, n) { this.burst(x, y, z, n, [0x2aaec1, 0x5b3d99, 0x5f9f45, 0x8f1414, 0x4a8a38], 3.2, .09, 1.4, 1.5, 12); }
  splat(x, z, r) { const d = this.d; d.position.set(x, .02 + (this.dt % 7) * .0008, z); d.rotation.set(0, Math.random() * 6.28, 0); d.scale.set(r, 1, r * rnd(.7, 1.2)); d.updateMatrix(); this.dec.setMatrixAt(this.dt % 140, d.matrix); this.dt++; this.dn = Math.min(140, this.dn + 1); this.dec.count = this.dn; this.dec.instanceMatrix.needsUpdate = true; }
  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      const p = this.P[i]; p.life -= dt; if (p.life <= 0) { const l = this.P[--this.n]; this.P[i] = l; this.P[this.n] = p; continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < p.s * .5) { p.y = p.s * .5; p.vx *= .5; p.vz *= .5; p.vy = Math.abs(p.vy) * .25; }
    }
    for (let i = 0; i < this.n; i++) { const p = this.P[i], k = Math.min(1, p.life / p.max * 3); this.d.position.set(p.x, p.y, p.z); this.d.rotation.set(p.x * 7, p.z * 5, 0); this.d.scale.setScalar(p.s * k); this.d.updateMatrix(); this.m.setMatrixAt(i, this.d.matrix); this.m.setColorAt(i, p.c); }
    this.m.count = this.n; this.m.instanceMatrix.needsUpdate = true; if (this.m.instanceColor) this.m.instanceColor.needsUpdate = true;
  }
}
class Tracers {
  constructor(scene, cap = 16) { this.T = []; this.i = 0; const mat = new THREE.MeshBasicMaterial({ color: 0xffe3a0, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < cap; i++) { const m = new THREE.Mesh(BOXG, mat); m.visible = false; m.frustumCulled = false; scene.add(m); this.T.push({ m, life: 0 }); } }
  spawn(a, b, thin = 1) { const t = this.T[this.i++ % this.T.length], len = a.distanceTo(b); t.m.position.copy(a).add(b).multiplyScalar(.5); t.m.lookAt(b); t.m.scale.set(.012 * thin, .012 * thin, len); t.m.visible = true; t.life = .07; }
  update(dt) { for (const t of this.T) if (t.life > 0) { t.life -= dt; if (t.life <= 0) t.m.visible = false; } }
}

/* ======================= Zombis estilo Minecraft con articulaciones (cintura, codos, rodillas) ======================= */
const PX = .05625;                                                  // 1 píxel de skin = 5,6 cm → 32 px = 1,8 m
function mcBox(pw, ph, pd, u, v, pivot) {                           // caja con el reparto UV de las skins de Minecraft (atlas 64×64)
  const g = new THREE.BoxGeometry(pw * PX, ph * PX, pd * PX), uv = g.attributes.uv;
  const R = { "-x": [u, v + pd, u + pd, v + pd + ph], "+z": [u + pd, v + pd, u + pd + pw, v + pd + ph], "+x": [u + pd + pw, v + pd, u + 2 * pd + pw, v + pd + ph], "-z": [u + 2 * pd + pw, v + pd, u + 2 * pd + 2 * pw, v + pd + ph], "+y": [u + pd, v, u + pd + pw, v + pd], "-y": [u + pd + pw, v, u + 2 * pd + pw, v + pd] };
  ["+x", "-x", "+y", "-y", "+z", "-z"].forEach((k, f) => { const [x0, y0, x1, y1] = R[k], a = x0 / 64, b = x1 / 64, t = 1 - y0 / 64, d = 1 - y1 / 64; uv.setXY(f * 4, a, t); uv.setXY(f * 4 + 1, b, t); uv.setXY(f * 4 + 2, a, d); uv.setXY(f * 4 + 3, b, d); });
  g.translate(0, pivot === "top" ? -ph * PX / 2 : ph * PX / 2, 0); return g;
}
const ZSKIN = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), px = (x, y, w, h, col, n = .1) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = 1 + (hash(x + i, y + j) - .5) * n * 2, cc = new THREE.Color(col); g.fillStyle = `rgb(${clamp(cc.r * k * 255, 0, 255) | 0},${clamp(cc.g * k * 255, 0, 255) | 0},${clamp(cc.b * k * 255, 0, 255) | 0})`; g.fillRect(x + i, y + j, 1, 1); } };
  const GRN = 0x5f9f45, CY = 0x2aaec1, PU = 0x5b3d99, SH = 0x4a4a52;
  px(0, 0, 32, 16, GRN, .14); px(8, 8, 8, 8, 0x66a84a, .1);                                                   // cabeza + cara
  px(10, 11, 2, 2, 0x1a1a1a, 0); px(14, 11, 2, 2, 0x1a1a1a, 0); px(12, 13, 2, 1, 0x3f6b2f, 0); px(11, 14, 4, 1, 0x2a2a2a, 0); px(10, 10, 2, 1, 0x3f6b2f, 0); px(14, 10, 2, 1, 0x3f6b2f, 0); px(9, 15, 2, 1, 0x3f6b2f, .2);
  px(0, 16, 24, 10, CY, .1); px(0, 26, 24, 10, CY, .1); px(0, 30, 24, 6, CY, .1); px(0, 34, 24, 2, PU, .08); px(12, 26, 4, 4, PU, .08);   // pecho / abdomen (camisa + cinturón)
  px(24, 16, 16, 10, CY, .1); px(24, 26, 16, 10, GRN, .12); px(24, 26, 16, 2, 0x1f8a9b, .05);                   // brazo: manga / antebrazo
  px(40, 16, 16, 10, PU, .1); px(40, 26, 16, 10, PU, .1); px(40, 33, 16, 3, SH, .08); px(48, 26, 4, 4, SH, .06); // pierna: muslo / espinilla + zapatos
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const ZMAX = 150, ZGW = 50, ZGH = 38, ZCELL = 1.2, ONE = new V3(1, 1, 1), RED = new THREE.Color(1, .25, .25);
class Zombies {
  constructor(scene, world) {
    this.world = world; this.list = []; this.heads = new Int32Array(ZGW * ZGH); this.nxt = new Int32Array(ZMAX + 4); this.mat = new THREE.MeshLambertMaterial({ map: ZSKIN });
    const mk = g => { const m = new THREE.InstancedMesh(g, this.mat, ZMAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ZMAX * 3), 3); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
    this.abd = mk(mcBox(8, 6, 4, 0, 26, "bottom")); this.chest = mk(mcBox(8, 6, 4, 0, 16, "bottom")); this.head = mk(mcBox(8, 8, 8, 0, 0, "bottom"));
    this.uA = mk(mcBox(4, 6, 4, 24, 16, "top")); this.uB = mk(mcBox(4, 6, 4, 24, 16, "top")); this.fA = mk(mcBox(4, 6, 4, 24, 26, "top")); this.fB = mk(mcBox(4, 6, 4, 24, 26, "top"));
    this.tA = mk(mcBox(4, 6, 4, 40, 16, "top")); this.tB = mk(mcBox(4, 6, 4, 40, 16, "top")); this.sA = mk(mcBox(4, 6, 4, 40, 26, "top")); this.sB = mk(mcBox(4, 6, 4, 40, 26, "top"));
    this.meshes = [this.abd, this.chest, this.head, this.uA, this.uB, this.fA, this.fB, this.tA, this.tB, this.sA, this.sB];
    const sg = new THREE.CircleGeometry(.5, 12); sg.rotateX(-Math.PI / 2); this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .45, depthWrite: false }), ZMAX); this.shadow.frustumCulled = false; this.shadow.count = 0; scene.add(this.shadow);
    this.A = new THREE.Matrix4(); this.Mb = new THREE.Matrix4(); this.Mc = new THREE.Matrix4(); this.Mh = new THREE.Matrix4(); this.Mu = new THREE.Matrix4(); this.Mf = new THREE.Matrix4(); this.Mt = new THREE.Matrix4(); this.Ms = new THREE.Matrix4(); this.L = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, "XYZ"); this.v = new V3(); this.c = new THREE.Color(); this.tmp = { x: 0, z: 0 };
  }
  get alive() { let n = 0; for (const z of this.list) if (z.st === 1) n++; return n; }
  spawn(x, z, round, brute) {
    if (this.list.length >= ZMAX) return null;
    const sc = brute ? 1.28 : rnd(.94, 1.06), hp = (50 + 6 * round) * (brute ? 4 : 1) * (.9 + Math.random() * .2), sp = (brute ? .8 : rnd(.9, 1.4)) * (1 + .015 * round), tn = Math.random();
    const z0 = { x, z, vx: 0, vz: 0, kx: 0, kz: 0, yaw: Math.random() * 6.28, hp, mhp: hp, sp, brute, sc, st: 1, ph: Math.random() * 6, atk: 0, atkD: .7, cd: rnd(0, .5), die: 0, dieT: Math.random() < .5 ? 1 : -1, fl: 0, flinch: 0, ang: Math.random() * 6.28, gt: rnd(1, 6), los: false, losT: Math.random() * .3,
      tint: brute ? new THREE.Color(.62, .78, .62) : new THREE.Color(1, 1, 1).multiplyScalar(.88 + tn * .2).lerp(tn > .8 ? new THREE.Color(1, .8, .7) : tn < .2 ? new THREE.Color(.8, .95, 1) : new THREE.Color(1, 1, 1), .5), r: .34 * sc, rise: 0, mv: 0, lean: rnd(0, .1) };
    this.list.push(z0); return z0;
  }
  clear() { this.list.length = 0; }
  update(dt, P, ctx) {
    const W = this.world, L = this.list, px = P.x, pz = P.z;
    for (let i = L.length - 1; i >= 0; i--) {
      const z = L[i]; z.fl = Math.max(0, z.fl - dt * 5); z.flinch = Math.max(0, z.flinch - dt * 4);
      if (z.st === 2) { z.die += dt; z.x += z.kx * dt; z.z += z.kz * dt; z.kx *= .93; z.kz *= .93; if (z.die > 2.6) { L[i] = L[L.length - 1]; L.pop(); } continue; }
      z.rise = Math.min(1, z.rise + dt * 1.1);
      const dx = px - z.x, dz = pz - z.z, d = Math.hypot(dx, dz) || 1e-6;
      z.losT -= dt; if (z.losT <= 0) { z.losT = .3 + Math.random() * .25; z.los = d < 12 && W.rayWall(z.x, 1.2, z.z, dx / d, 0, dz / d, d) >= d - .01; }
      let tx, tz;
      if (z.los || d < 2.2) { tx = px + Math.cos(z.ang) * Math.min(1.05, d * .5); tz = pz + Math.sin(z.ang) * Math.min(1.05, d * .5); if (d < 2.4) { tx = px; tz = pz; } }
      else if (W.next(z.x, z.z, this.tmp)) { tx = this.tmp.x; tz = this.tmp.z; } else { tx = px; tz = pz; }
      let ux = tx - z.x, uz = tz - z.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const reach = z.r + .35 + .75, spd = z.sp * (z.atk > 0 ? .1 : 1) * Math.min(1, z.rise * 1.3) * (1 - z.flinch * .8);
      z.vx = damp(z.vx, d < reach * .75 ? 0 : ux * spd, 5, dt); z.vz = damp(z.vz, d < reach * .75 ? 0 : uz * spd, 5, dt);
      z.x += (z.vx + z.kx) * dt; z.z += (z.vz + z.kz) * dt; z.kx = damp(z.kx, 0, 6, dt); z.kz = damp(z.kz, 0, 6, dt);
      const mvv = Math.hypot(z.vx, z.vz); z.mv = damp(z.mv, clamp(mvv / 1.2, 0, 1.3), 6, dt); z.ph += dt * (1.5 + mvv * 3.2);
      let ty = Math.atan2(d < 4 ? dx : ux, d < 4 ? dz : uz), dy = ty - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * Math.min(1, dt * 6);
      z.cd -= dt;
      if (z.atk > 0) { z.atk -= dt; if (z.atk <= 0) { if (d < reach + .3) ctx.hurt((z.brute ? 26 : Math.min(22, 9 + ctx.round * .7)), z.x, z.z); z.cd = z.brute ? 1.3 : 1; } }
      else if (d < reach && z.cd <= 0 && z.rise > .9) { z.atkD = z.brute ? .85 : .7; z.atk = z.atkD; ctx.sound("atk", z); }
      z.gt -= dt; if (z.gt <= 0) { z.gt = rnd(3, 8); if (d < 28) ctx.sound("groan", z); }
    }
    this.heads.fill(-1);
    for (let i = 0; i < L.length; i++) { const z = L[i], gx = clamp(Math.floor((z.x + WX) / ZCELL), 0, ZGW - 1), gz = clamp(Math.floor((z.z + WZ) / ZCELL), 0, ZGH - 1), k = gz * ZGW + gx; this.nxt[i] = this.heads[k]; this.heads[k] = i; }
    for (let i = 0; i < L.length; i++) {                                    // separación entre zombis (forman muchedumbre) y paredes
      const a = L[i]; if (a.st !== 1) continue; const gx = clamp(Math.floor((a.x + WX) / ZCELL), 0, ZGW - 1), gz = clamp(Math.floor((a.z + WZ) / ZCELL), 0, ZGH - 1);
      for (let cx = Math.max(0, gx - 1); cx <= Math.min(ZGW - 1, gx + 1); cx++) for (let cz = Math.max(0, gz - 1); cz <= Math.min(ZGH - 1, gz + 1); cz++) for (let j = this.heads[cz * ZGW + cx]; j >= 0; j = this.nxt[j]) {
        if (j <= i) continue; const b = L[j]; if (b.st !== 1) continue; const dx = b.x - a.x, dz = b.z - a.z, m = (a.r + b.r) * .95, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-8) { const d = Math.sqrt(d2), k = (m - d) / d * .5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
      W.resolve(a, a.r);
    }
    this.draw(P);
  }
  /* Esqueleto: pelvis → abdomen → pecho → cabeza / hombros → codos; caderas → rodillas. Cada articulación es una matriz encadenada. */
  draw() {
    const L = this.list, n = L.length, A = this.A, q = this.q, e = this.e, v = this.v; let c = 0;
    const jt = (out, parent, tx, ty, tz, rx, ry, rz) => { e.set(rx, ry, rz, "XYZ"); q.setFromEuler(e); this.L.compose(v.set(tx, ty, tz), q, ONE); out.multiplyMatrices(parent, this.L); return out; };
    for (let i = 0; i < n; i++) {
      const z = L[i], sc = z.sc, dying = z.st === 2, ph = z.ph, mv = z.mv, dk = dying ? smooth(Math.min(1, z.die / .75)) : 0, rs = 1 - smooth(z.rise);
      const s = sc * (dying && z.die > 1.9 ? Math.max(.01, 1 - (z.die - 1.9) / .7) : 1), buck = dying ? Math.sin(Math.min(1, z.die / .3) * Math.PI / 2) : 0;
      const atkP = z.atk > 0 ? 1 - z.atk / z.atkD : -1, wind = atkP >= 0 ? (atkP < .55 ? smooth(atkP / .55) : 1 - smooth((atkP - .55) / .2)) : 0, slam = atkP >= .55 ? smooth(Math.min(1, (atkP - .55) / .2)) * (atkP > .8 ? 1 - (atkP - .8) / .2 : 1) : 0, fl = z.flinch;
      const gv = Math.sin(ph), gc = Math.cos(ph), sway = Math.sin(ph * .5);
      q.setFromEuler(e.set(dying ? -dk * 1.5 * z.dieT : 0, z.yaw, 0, "YXZ")); A.compose(v.set(z.x, dying ? -buck * .12 : 0, z.z), q, this.s1 || (this.s1 = new V3()).set(s, s, s));
      /* tronco */
      const abdL = .16 + z.lean + gv * gv * .05 * mv + rs * 1.1 + wind * -.22 + slam * .35 - fl * .25 + (dying ? dk * .2 : 0), abdT = gv * .2 * mv, chL = .13 + wind * -.38 + slam * .55 - fl * .35 + rs * .3, chT = -gv * .26 * mv + sway * .05;
      jt(this.Mb, A, 0, .675 - buck * .08 - rs * .25, 0, abdL, abdT, sway * .05 * mv);
      jt(this.Mc, this.Mb, 0, .3375, 0, chL, chT, -sway * .04);
      jt(this.Mh, this.Mc, 0, .3375, 0, .08 - chL * .5 + fl * .5 + (dying ? dk * .5 * z.dieT : 0) + Math.sin(ph * 1.3) * .06 * (1 - mv * .5), Math.sin(ph * .7) * .3 * (1 - mv * .4) + gv * .15 * mv, sway * .12 + (dying ? dk * .4 : 0));
      /* piernas: cadera + rodilla */
      const hipA = gv * .62 * mv * (1 - rs * .5) + rs * .4, kneeA = Math.max(0, -gc) * .95 * mv + .1 + rs * .6 + buck * .9, hipB = -gv * .62 * mv * (1 - rs * .5) + rs * .4, kneeB = Math.max(0, gc) * .95 * mv + .1 + rs * .6 + buck * .9;
      /* brazos: horizontales hacia delante (zombi), con codo y balanceo; ataque: se alzan y golpean */
      const raise = -1.38 + rs * 1.0 - wind * 1.1 + slam * 1.3 + fl * -.5, spA = .14 + Math.sin(ph * .8) * .06, elb = -.32 - Math.abs(Math.sin(ph * 1.6)) * .14 - wind * .5 + slam * .35, off = sc;
      const aa = dying ? -.4 + dk * 1.1 : raise + Math.sin(ph + .5) * .16 * mv, ab = dying ? -.2 + dk * 1.3 : raise - Math.sin(ph + .5) * .16 * mv, ea = dying ? -.2 : elb + Math.sin(ph) * .1, eb = dying ? -.1 : elb - Math.sin(ph) * .1, spd = dying ? .5 + dk * .6 : spA;
      const put = (mesh, M, col, hit) => { mesh.setMatrixAt(c, M); this.c.copy(z.tint); if (hit) this.c.lerp(RED, hit); mesh.setColorAt(c, this.c); }, hit = z.fl * .8;
      put(this.abd, this.Mb, 1, hit); put(this.chest, this.Mc, 1, hit); put(this.head, this.Mh, 1, hit);
      jt(this.Mu, this.Mc, .3375, .3375 - .05, 0, aa, 0, spd); put(this.uA, this.Mu, 1, hit); jt(this.Mf, this.Mu, 0, -.3375, 0, ea, 0, 0); put(this.fA, this.Mf, 1, hit);
      jt(this.Mu, this.Mc, -.3375, .3375 - .05, 0, ab, 0, -spd); put(this.uB, this.Mu, 1, hit); jt(this.Mf, this.Mu, 0, -.3375, 0, eb, 0, 0); put(this.fB, this.Mf, 1, hit);
      jt(this.Mt, A, .1125, .675 - buck * .1, 0, hipA, 0, 0); put(this.tA, this.Mt, 1, hit); jt(this.Ms, this.Mt, 0, -.3375, 0, kneeA, 0, 0); put(this.sA, this.Ms, 1, hit);
      jt(this.Mt, A, -.1125, .675 - buck * .1, 0, hipB, 0, 0); put(this.tB, this.Mt, 1, hit); jt(this.Ms, this.Mt, 0, -.3375, 0, kneeB, 0, 0); put(this.sB, this.Ms, 1, hit);
      this.shadow.setMatrixAt(c, this.Mu.compose(v.set(z.x, .02, z.z), q.identity(), this.s1.set(s * (dying ? .8 : 1) * 1.1, 1, s * (dying ? .8 : 1) * 1.1)));
      c++; void off;
    }
    for (const m of this.meshes) { m.count = c; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    this.shadow.count = c; this.shadow.instanceMatrix.needsUpdate = true;
  }
  /* rayo del disparo: cabeza (esfera, algo adelantada por la postura encorvada) y cuerpo (cilindro vertical) */
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (const z of this.list) {
      if (z.st !== 1) continue; const sc = z.sc, lean = .14 * sc + z.lean * sc, hxp = z.x + Math.sin(z.yaw) * lean, hzp = z.z + Math.cos(z.yaw) * lean, hy = 1.55 * sc, hr = .27 * sc, rx0 = ox - z.x, rz0 = oz - z.z; if (rx0 * rx0 + rz0 * rz0 > (maxT + 2) * (maxT + 2)) continue;
      let th = Infinity, tc = Infinity; const rx = ox - hxp, ry = oy - hy, rz = oz - hzp, b = rx * dx + ry * dy + rz * dz, c = rx * rx + ry * ry + rz * rz - hr * hr, disc = b * b - c; if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) th = t; }
      const a = dx * dx + dz * dz; if (a > 1e-8) { const R = .32 * sc, bb = rx0 * dx + rz0 * dz, cc = rx0 * rx0 + rz0 * rz0 - R * R, ds = bb * bb - a * cc; if (ds >= 0) { const t = (-bb - Math.sqrt(ds)) / a, yy = oy + dy * t; if (t > 0 && yy >= 0 && yy <= 1.4 * sc) tc = t; } }
      const t = Math.min(th, tc); if (t < bt) { bt = t; best = { z, t, head: th <= tc + .03 }; }
    }
    return best;
  }
  hit(z, dmg, kx, kz) { z.hp -= dmg; z.fl = 1; z.flinch = Math.min(1, z.flinch + (dmg > 40 ? 1 : .55)); z.kx += kx; z.kz += kz; if (z.hp <= 0 && z.st === 1) { z.st = 2; z.die = 0; z.atk = 0; return true; } return false; }
}

/* ======================= Interfaz (HTML/CSS) ======================= */
const CSS = `
#z3d{position:fixed;inset:0;z-index:99999;background:#05070d;color:#e9eef7;font-family:system-ui,Segoe UI,Roboto,sans-serif;user-select:none;overflow:hidden}
#z3d canvas.zmain{position:absolute;inset:0;width:100%;height:100%;display:block}
#z3d .zh{position:absolute;inset:0;pointer-events:none;display:none}
#z3d.play .zh{display:block}
#z3d .zv{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 55%,rgba(200,0,0,.85));opacity:0}
#z3d .zdm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
#z3d .zdm i{position:absolute;left:-26px;top:-150px;width:52px;height:30px;background:linear-gradient(#ff3b30,transparent);clip-path:polygon(50% 0,100% 100%,0 100%);filter:blur(1px)}
#z3d .zcx{position:absolute;left:50%;top:50%;width:0;height:0}
#z3d .zcx b{position:absolute;background:#fff;box-shadow:0 0 2px #000}
#z3d .zcx .d{left:-1.5px;top:-1.5px;width:3px;height:3px;border-radius:50%}
#z3d .zcx .l{width:9px;height:2px;top:-1px}#z3d .zcx .l1{left:-17px}#z3d .zcx .l2{left:8px}
#z3d .zcx .v{width:2px;height:9px;left:-1px}#z3d .zcx .v1{top:-17px}#z3d .zcx .v2{top:8px}
#z3d .zcx.ads .l,#z3d .zcx.ads .v{opacity:0}
#z3d .zcx.hip .l1{left:-12px}#z3d .zcx.hip .l2{left:4px}#z3d .zcx.hip .v1{top:-12px}#z3d .zcx.hip .v2{top:4px}
#z3d .zhm{position:absolute;left:50%;top:50%;width:0;height:0;opacity:0}
#z3d .zhm b{position:absolute;width:10px;height:2px;background:#fff;left:-5px;top:-1px;box-shadow:0 0 3px #000}
#z3d .zhm b:nth-child(1){transform:translate(-14px,-14px) rotate(45deg)}#z3d .zhm b:nth-child(2){transform:translate(14px,-14px) rotate(-45deg)}#z3d .zhm b:nth-child(3){transform:translate(-14px,14px) rotate(-45deg)}#z3d .zhm b:nth-child(4){transform:translate(14px,14px) rotate(45deg)}
#z3d .zhm.hs b{background:#ff3b30}
#z3d .zbl{position:absolute;left:22px;bottom:22px;width:240px}
#z3d .zbar{height:14px;background:rgba(0,0,0,.55);border:2px solid rgba(255,255,255,.25);border-radius:4px;overflow:hidden}
#z3d .zbar i{display:block;height:100%;width:100%;background:linear-gradient(#ff6b57,#c0291b);transition:width .12s}
#z3d .zbar.st{height:7px;margin-top:6px}#z3d .zbar.st i{background:linear-gradient(#ffe08a,#e0a82e)}
#z3d .zhp{font:800 26px/1 system-ui;margin-bottom:6px;text-shadow:0 2px 6px #000}
#z3d .zbr{position:absolute;right:26px;bottom:22px;text-align:right;text-shadow:0 2px 6px #000}
#z3d .zam{font:800 46px/1 system-ui}#z3d .zam small{font-size:22px;opacity:.7}#z3d .zwn{font:700 13px system-ui;letter-spacing:.12em;text-transform:uppercase;opacity:.8}
#z3d .ztc{position:absolute;top:14px;left:50%;transform:translateX(-50%);text-align:center;text-shadow:0 2px 8px #000}
#z3d .zrd{font:900 34px/1 system-ui;letter-spacing:.08em;color:#ff5a36}#z3d .zzl{font:700 14px system-ui;opacity:.85;margin-top:4px}
#z3d .ztr{position:absolute;top:16px;right:22px;text-align:right;font:800 22px system-ui;text-shadow:0 2px 6px #000}#z3d .ztr small{display:block;font:600 12px system-ui;opacity:.7}
#z3d .zbn{position:absolute;left:0;right:0;top:26%;text-align:center;font:900 54px system-ui;letter-spacing:.1em;color:#ff5a36;text-shadow:0 0 24px rgba(255,60,30,.6),0 3px 0 #000;opacity:0;transition:opacity .4s}
#z3d .zbn small{display:block;font:700 18px system-ui;color:#fff;letter-spacing:.06em;margin-top:6px}
#z3d .zhint{position:absolute;left:50%;bottom:74px;transform:translateX(-50%);font:600 13px system-ui;opacity:.0;transition:opacity .5s;text-shadow:0 2px 6px #000;background:rgba(0,0,0,.45);padding:6px 12px;border-radius:8px}
#z3d .zbeta{position:absolute;left:12px;top:10px;font:800 11px system-ui;letter-spacing:.2em;color:#ffcf5a;opacity:.9}
#z3d .zscr{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(4,6,12,.82);backdrop-filter:blur(3px)}
#z3d .zscr.on{display:flex}
#z3d .zbox{width:min(1020px,96vw);max-height:96vh;overflow:auto;padding:22px 26px;background:rgba(14,18,28,.94);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 20px 70px #000}
#z3d h1{margin:0;font:900 30px system-ui;letter-spacing:.06em}#z3d h1 em{font-style:normal;color:#ff5a36}#z3d h1 span{font:800 11px system-ui;letter-spacing:.18em;background:#ffcf5a;color:#111;padding:3px 7px;border-radius:5px;margin-left:10px;vertical-align:middle}
#z3d .zcols{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}
@media(max-width:820px){#z3d .zcols{grid-template-columns:1fr}}
#z3d .zsl{margin-bottom:12px}#z3d .zsl h4{margin:0 0 6px;font:700 12px system-ui;letter-spacing:.14em;text-transform:uppercase;opacity:.65}
#z3d .zrow{display:flex;gap:8px}
#z3d button{font:700 14px system-ui;color:#fff;background:#1c2436;border:2px solid #2d3a56;border-radius:10px;padding:9px 12px;cursor:pointer;transition:.12s}
#z3d button:hover{border-color:#ff5a36;transform:translateY(-1px)}#z3d button.sel{border-color:#ff5a36;background:#33201e}
#z3d .zw{flex:1;text-align:left}#z3d .zw small{display:block;font:500 11px system-ui;opacity:.65;margin-top:2px}
#z3d .zpv{width:100%;height:210px;border-radius:12px;background:radial-gradient(circle at 50% 35%,#27324a,#0d111b);display:block}
#z3d .zkg{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:7px;margin-top:10px;max-height:140px;overflow:auto}
#z3d .zkg button{padding:4px;height:54px;display:flex;align-items:center;justify-content:center;font-size:11px}
#z3d .zkg img{width:40px;height:40px;object-fit:contain;image-rendering:pixelated}
#z3d .zgo{margin-top:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
#z3d .zgo .big{background:#c0291b;border-color:#ff5a36;font-size:18px;padding:12px 30px;letter-spacing:.1em}
#z3d .zhelp{font:500 12px/1.6 system-ui;opacity:.7;margin-left:auto;max-width:430px}
#z3d .zst{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}#z3d .zst div{background:#1a2133;border-radius:10px;padding:12px;text-align:center}#z3d .zst b{display:block;font:900 28px system-ui;color:#ff5a36}
#z3d .zc{text-align:center}
`;
const CTRL_HELP = "WASD mover · Shift esprintar · C agacharse · Q/E asomarse · Clic izq. disparar · Clic der. mira del arma · Z apuntar desde la cadera (zoom) · B modo de disparo · R recargar · V golpe rápido · 1/2/3 o rueda cambiar arma · M sonido";

/* ======================= Partida ======================= */
class Game {
  constructor() {
    this.lo = this.loadLoadout(); this.charms = [...CHARMS]; this.editSlot = 0; this.playing = false; this.paused = false; this.over = false; this.locked = false; this.dead = false; this.raf = 0; this.last = performance.now(); this.ema = 16; this.perfT = 0;
    if (!document.getElementById("z3d-css")) { const s = document.createElement("style"); s.id = "z3d-css"; s.textContent = CSS; document.head.appendChild(s); }
    const root = this.root = document.createElement("div"); root.id = "z3d"; document.body.appendChild(root);
    this.pr = Math.min(window.devicePixelRatio || 1, 1.5); this.maxPr = this.pr;
    this.R = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); this.R.setPixelRatio(this.pr); this.R.autoClear = false; this.R.domElement.className = "zmain"; root.appendChild(this.R.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0a0f1d); this.scene.fog = new THREE.Fog(0x0a0f1d, 8, 75); this.R.toneMapping = THREE.ACESFilmicToneMapping; this.R.toneMappingExposure = 1.15;
    this.scene.add(new THREE.HemisphereLight(0x8a9cd0, 0x3a3c48, 2.7)); const moon = new THREE.DirectionalLight(0xa8bcf0, 1.4); moon.position.set(-20, 40, 15); this.scene.add(moon);
    this.map = buildMap(this.scene); this.world = new World(this.map); this.Z = new Zombies(this.scene, this.world); this.parts = new Particles(this.scene); this.tr = new Tracers(this.scene);
    this.cam = new THREE.PerspectiveCamera(74, 1, .05, 120); this.cam.rotation.order = "YXZ"; this.vm = new ViewModel();
    this.buildUI(); this.onResize = () => this.resize(); window.addEventListener("resize", this.onResize); this.resize(); this.bindInput();
    this.P = { x: 0, z: 0, vx: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0, eye: 1.65, hp: 100, st: 100, stLock: false, stDelay: 0, ads: 0, aim: 0, lean: 0, sprint: 0, crouch: 0, speed: 0 };
    this.keys = {}; this.mdx = 0; this.mdy = 0; this.fireHeld = false; this.adsHeld = false; this.click = false; this.menuT = 0;
    this.cur = 0; this.ammo = {}; this.state = { round: 0, kills: 0, score: 0, hs: 0 }; this.showMenu(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop); this.loadShopCharms();
  }
  /* ---------- datos ---------- */
  loadLoadout() {
    try { const o = JSON.parse(localStorage.getItem("z3d_loadout")); if (o && Array.isArray(o.w) && o.w.length === 3 && o.w.every((id, i) => WEAPONS[id] && WEAPONS[id].slot === i)) return { w: o.w, k: o.k || {} }; } catch (e) { /* sin datos */ }
    return { w: [...SLOT_DEF], k: {} };
  }
  saveLoadout() { try { localStorage.setItem("z3d_loadout", JSON.stringify(this.lo)); } catch (e) { /* sin almacenamiento */ } }
  async loadShopCharms() {
    try { const H = window.HOOD; if (!H) return; const s = await H.fb.getDocs(H.fb.collection(H.db, "shop")); const L = [];
      s.forEach(d => { const v = d.data(); if (typeof v.img === "string" && /^(data:image|https?:)/.test(v.img)) L.push({ id: "s_" + d.id, name: v.name || d.id, img: v.img }); });
      L.sort((a, b) => a.name.localeCompare(b.name, "es")); this.charms = [...CHARMS, ...L]; if (this.menuOn) this.renderMenu(); } catch (e) { console.warn("z3d shop", e); }
  }
  charmFor(id) { const k = this.lo.k[id]; return k ? this.charms.find(c => c.id === k) || null : null; }
  /* ---------- interfaz ---------- */
  buildUI() {
    const r = this.root, h = document.createElement("div"); h.className = "zh";
    h.innerHTML = `<div class="zv"></div><div class="zdm"><i></i></div><div class="zbeta">ZOMBIES 3D · BETA</div>
    <div class="zcx"><b class="d"></b><b class="l l1"></b><b class="l l2"></b><b class="v v1"></b><b class="v v2"></b></div><div class="zhm"><b></b><b></b><b></b><b></b></div>
    <div class="ztc"><div class="zrd">RONDA 1</div><div class="zzl">Zombis: 0</div></div><div class="ztr"><span class="zsc">0</span><small>PUNTOS</small></div>
    <div class="zbl"><div class="zhp">100</div><div class="zbar"><i class="hpb"></i></div><div class="zbar st"><i class="stb"></i></div></div>
    <div class="zbr"><div class="zwn"></div><div class="zam"></div></div><div class="zbn"></div><div class="zhint"></div>`;
    r.appendChild(h); this.hud = { h, v: h.querySelector(".zv"), dm: h.querySelector(".zdm"), cx: h.querySelector(".zcx"), hm: h.querySelector(".zhm"), rd: h.querySelector(".zrd"), zl: h.querySelector(".zzl"), sc: h.querySelector(".zsc"), hp: h.querySelector(".zhp"), hpb: h.querySelector(".hpb"), stb: h.querySelector(".stb"), wn: h.querySelector(".zwn"), am: h.querySelector(".zam"), bn: h.querySelector(".zbn"), hint: h.querySelector(".zhint"), c: {} };
    this.menu = document.createElement("div"); this.menu.className = "zscr"; r.appendChild(this.menu);
    this.pause = document.createElement("div"); this.pause.className = "zscr"; this.pause.innerHTML = `<div class="zbox zc" style="max-width:460px"><h1>PAUSA</h1><p style="opacity:.7">${CTRL_HELP}</p><div class="zgo" style="justify-content:center"><button class="big" data-a="resume">CONTINUAR</button><button data-a="menu">Menú</button></div></div>`; r.appendChild(this.pause);
    this.overEl = document.createElement("div"); this.overEl.className = "zscr"; r.appendChild(this.overEl);
    this.pause.addEventListener("click", e => { const a = e.target.dataset && e.target.dataset.a; if (a === "menu") { this.endRun(); this.showMenu(); } else this.lock(); });
    this.root.addEventListener("click", e => { if (this.playing && !this.paused && !this.over && !this.locked && !e.target.closest(".zscr")) this.lock(); });
  }
  showMenu() { this.playing = false; this.paused = false; this.menuOn = true; this.root.classList.remove("play"); this.pause.classList.remove("on"); this.overEl.classList.remove("on"); this.menu.classList.add("on"); this.renderMenu(); Snd.stopAmb(); }
  thumb(c) { if (c.img) return c.img; if (c.th) return c.th; const cv = document.createElement("canvas"); cv.width = cv.height = 8; const x = cv.getContext("2d"); c.px.forEach((row, j) => [...row].forEach((ch, i) => { if (CHARM_PAL[ch]) { x.fillStyle = CHARM_PAL[ch]; x.fillRect(i, j, 1, 1); } })); return (c.th = cv.toDataURL()); }
  renderMenu() {
    const lo = this.lo, ids = [["ak47", "m4a4"], ["pistol", "silenced"], ["knife", "bat"]], names = ["Arma principal", "Arma secundaria", "Cuerpo a cuerpo"], wid = lo.w[this.editSlot], cur = lo.k[wid] || "";
    const best = (() => { try { return +localStorage.getItem("z3d_best") || 0; } catch (e) { return 0; } })();
    this.menu.innerHTML = `<div class="zbox"><h1>ZOMBIES <em>3D</em><span>BETA · ADMIN</span></h1><div style="opacity:.7;font-size:13px;margin-top:4px">Sobrevive a las rondas de zombis en la escuela. Récord: <b>ronda ${best}</b></div>
    <div class="zcols"><div>${ids.map((pair, s) => `<div class="zsl"><h4>${names[s]}</h4><div class="zrow">${pair.map(id => `<button class="zw ${lo.w[s] === id ? "sel" : ""}" data-w="${id}" data-s="${s}">${WEAPONS[id].name}<small>${WEAPONS[id].desc}</small></button>`).join("")}</div></div>`).join("")}
    <h4 style="margin:6px 0;font:700 12px system-ui;letter-spacing:.14em;text-transform:uppercase;opacity:.65">Llavero para ${WEAPONS[wid].name}</h4>
    <div class="zkg"><button data-k="" class="${cur === "" ? "sel" : ""}">Ninguno</button>${this.charms.map(c => `<button data-k="${esc(c.id)}" title="${esc(c.name)}" class="${cur === c.id ? "sel" : ""}"><img src="${esc(this.thumb(c))}" alt="${esc(c.name)}"></button>`).join("")}</div></div>
    <div><canvas class="zpv" width="480" height="280"></canvas><div style="font-size:12px;opacity:.6;margin-top:6px;text-align:center">Los llaveros cuelgan del arma y se mueven con física. Los objetos de la tienda con imagen aparecen aquí.</div></div></div>
    <div class="zgo"><button class="big" data-a="play">JUGAR</button><button data-a="exit">Salir</button><div class="zhelp">${CTRL_HELP}</div></div></div>`;
    this.menu.onclick = e => {
      const b = e.target.closest("button"); if (!b) return; Snd.play("ui");
      if (b.dataset.w) { lo.w[+b.dataset.s] = b.dataset.w; this.editSlot = +b.dataset.s; this.saveLoadout(); this.renderMenu(); }
      else if (b.dataset.k !== undefined) { if (b.dataset.k) lo.k[wid] = b.dataset.k; else delete lo.k[wid]; this.saveLoadout(); this.renderMenu(); }
      else if (b.dataset.a === "play") this.start(); else if (b.dataset.a === "exit") Z3D.close();
    };
    this.initPreview(this.menu.querySelector(".zpv"), wid, this.charmFor(wid));
  }
  initPreview(cv, id, charm) {
    if (!this.pv) { this.pv = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(30, 480 / 280, .05, 10), t: 0 }; this.pv.scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2)); const d = new THREE.DirectionalLight(0xffffff, 1.6); d.position.set(1, 1.5, 1); this.pv.scene.add(d); this.pv.cam.position.set(0, .02, 1.7); this.pv.kc = new Keychain(this.pv.scene); }
    if (this.pv.r) this.pv.r.dispose(); this.pv.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); this.pv.r.setSize(480, 280, false); this.pv.r.setPixelRatio(1);
    if (this.pv.wg) this.pv.scene.remove(this.pv.wg); this.pv.o = buildWeapon(id); this.pv.wg = this.pv.o.g; this.pv.wg.traverse(o => { if (o.userData.isArm) o.visible = false; }); this.pv.wg.position.z = id === "knife" || id === "bat" ? .0 : .05; if (id === "bat") this.pv.wg.position.z = .25; this.pv.scene.add(this.pv.wg); this.pv.kc.set(charm);
  }
  /* ---------- entrada ---------- */
  bindInput() {
    const D = (t, f, o) => { document.addEventListener(t, f, o); (this.off ||= []).push(() => document.removeEventListener(t, f, o)); };
    D("keydown", e => {
      if (!this.playing) return; const c = e.code; if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "KeyC", "Digit1", "Digit2", "Digit3", "KeyR", "KeyV", "KeyM", "KeyZ", "KeyB", "KeyQ", "KeyE"].includes(c)) e.preventDefault();
      this.keys[c] = true; if (e.repeat || this.paused || this.over) { if (c === "KeyM" && !e.repeat) Snd.toggle(); return; }
      if (c === "Digit1") this.select(0); else if (c === "Digit2") this.select(1); else if (c === "Digit3") this.select(2); else if (c === "KeyR") this.reload(); else if (c === "KeyV") this.quickMelee(); else if (c === "KeyM") Snd.toggle(); else if (c === "KeyZ") this.aimHip = !this.aimHip; else if (c === "KeyB") { const d = this.def; if (d.kind === "gun" && d.auto) { this.semi[this.wid] = !this.semi[this.wid]; Snd.play("ui"); } }
    });
    D("keyup", e => { this.keys[e.code] = false; });
    D("mousemove", e => { if (this.active()) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    D("mousedown", e => { if (!this.active()) return; if (e.button === 0) { this.fireHeld = true; this.click = true; } else if (e.button === 2) this.adsHeld = true; e.preventDefault(); });
    D("mouseup", e => { if (e.button === 0) this.fireHeld = false; else if (e.button === 2) this.adsHeld = false; });
    D("contextmenu", e => { if (this.playing) e.preventDefault(); });
    D("wheel", e => { if (this.active() && e.deltaY) this.select((this.cur + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });
    D("pointerlockchange", () => {
      this.locked = document.pointerLockElement === this.R.domElement;
      if (this.locked) { this.paused = false; this.pause.classList.remove("on"); Snd.ambient(); }
      else if (this.playing && !this.over) { this.paused = true; this.pause.classList.add("on"); this.fireHeld = this.adsHeld = false; this.keys = {}; }
    });
    D("visibilitychange", () => { if (document.hidden && this.playing && !this.over && !this.paused) { this.paused = true; this.pause.classList.add("on"); } });
  }
  active() { return this.playing && !this.paused && !this.over && (this.locked || this.fake); }
  lock() { try { const p = this.R.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { /* sin pointer lock */ } }
  resize() { const w = window.innerWidth, h = window.innerHeight; this.R.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.vm.resize(w, h); }
  /* ---------- partida ---------- */
  start() {
    this.menuOn = false; this.menu.classList.remove("on"); this.overEl.classList.remove("on"); this.root.classList.add("play"); if (this.pv && this.pv.r) { this.pv.r.dispose(); this.pv.r = null; }
    Snd.ac(); this.reset(); this.playing = true; this.paused = false; this.over = false; this.lock(); Snd.ambient();
  }
  reset() {
    const P = this.P, m = this.map.start; Object.assign(P, { x: m.x, z: m.z, vx: 0, vz: 0, yaw: m.yaw, pitch: 0, eye: 1.65, hp: 100, st: 100, stLock: false, stDelay: 0, ads: 0, aim: 0, lean: 0, sprint: 0, crouch: 0, speed: 0 }); this.aimHip = false; this.rp = 0; this.ry = 0; this.shotI = 0; this.lastShot = -9; this.semi = {}; this.clock = 0; this.indT = 0;
    this.Z.clear(); this.state = { round: 0, kills: 0, score: 0, hs: 0 }; this.ammo = {}; for (const id of this.lo.w) { const d = WEAPONS[id]; if (d.kind === "gun") this.ammo[id] = { mag: d.mag, res: d.reserve }; }
    this.cur = 0; this.cool = 0; this.rlT = -1; this.swingHit = false; this.quickPrev = -1; this.meleeN = 0; this.punch = 0; this.shake = 0; this.hurtT = 0; this.hurtAng = 0; this.regen = 0; this.beatT = 0; this.stepD = 0; this.hmT = 0; this.bannerT = 0; this.hintT = 7; this.phase = "count"; this.cdT = 3.5; this.toSpawn = 0; this.spawnT = 0; this.cap = 80; this.mouseGrace = .3;
    this.vm.setWeapon(this.lo.w[0], this.charmFor(this.lo.w[0])); this.keys = {}; this.fireHeld = this.adsHeld = false; this.world.src = -1; this.world.flow(P.x, P.z); this.beginRound(1); this.hud.c = {};
  }
  endRun() { this.playing = false; this.over = false; this.pause.classList.remove("on"); this.overEl.classList.remove("on"); this.root.classList.remove("play"); try { document.exitPointerLock(); } catch (e) { /* nada */ } Snd.stopAmb(); }
  get wid() { return this.lo.w[this.cur]; }
  get def() { return WEAPONS[this.wid]; }
  select(i, quick) {
    if (i === this.cur || this.over) return; this.rlT = -1; this.vm.reloadT = -1; this.cur = i; if (!quick) this.quickPrev = -1; const id = this.lo.w[i]; this.vm.setWeapon(id, this.charmFor(id)); this.cool = .3; Snd.play("draw"); this.swingHit = false; this.adsHeld = this.adsHeld && WEAPONS[id].kind === "gun";
  }
  banner(t, sub, dur = 2.6) { const b = this.hud.bn; b.innerHTML = t + (sub ? `<small>${sub}</small>` : ""); b.style.opacity = 1; this.bannerT = dur; }
  beginRound(n) {
    const s = this.state; s.round = n; this.toSpawn = Math.min(150, 10 + 6 * (n - 1)); this.phase = "count"; this.cdT = n === 1 ? 4 : 5; this.spawnT = 0; Snd.play("round");
    this.banner("RONDA " + n, n === 1 ? "¡Sobrevive!" : this.toSpawn + " zombis se acercan");
    if (n > 1) for (const id in this.ammo) { const d = WEAPONS[id], a = this.ammo[id]; a.res = Math.min(Math.round(d.reserve * 1.5), a.res + d.mag * 2); }
  }
  pickSpawn() {
    const P = this.P, round = this.state.round; let best = null;
    for (let t = 0; t < 8; t++) {
      const inside = round >= 2 && Math.random() < .35, arr = inside ? this.map.spawnIn : this.map.spawnOut, s = arr[(Math.random() * arr.length) | 0], x = s[0] + rnd(-1.2, 1.2), z = s[1] + rnd(-1.2, 1.2);
      if (this.world.distAt(x, z) >= 9999) continue; const d = Math.hypot(x - P.x, z - P.z); if (d > 16) return [x, z]; if (!best || d > best.d) best = { d, x, z };
    }
    return best ? [best.x, best.z] : null;
  }
  hurt(dmg, fx, fz) {
    const P = this.P; if (this.over) return; P.hp -= dmg; this.hurtT = .7; this.shake = Math.min(1, this.shake + .5); this.regen = 5; Snd.play("hurt"); this.hurtAng = [fx, fz];
    if (P.hp <= 0) this.gameOver();
  }
  gameOver() {
    this.over = true; this.fireHeld = this.adsHeld = false; try { document.exitPointerLock(); } catch (e) { /* nada */ } Snd.play("over"); Snd.stopAmb(); const s = this.state; let best = 0; try { best = +localStorage.getItem("z3d_best") || 0; if (s.round > best) { best = s.round; localStorage.setItem("z3d_best", best); } } catch (e) { /* nada */ }
    this.overEl.innerHTML = `<div class="zbox zc" style="max-width:520px"><h1 style="color:#ff5a36">HAS CAÍDO</h1><div class="zst"><div><b>${s.round}</b>Ronda</div><div><b>${s.kills}</b>Zombis</div><div><b>${s.score}</b>Puntos</div></div><div style="opacity:.7">Récord: ronda ${best} · Headshots: ${s.hs}</div><div class="zgo" style="justify-content:center"><button class="big" data-a="again">REINTENTAR</button><button data-a="menu">Arsenal</button><button data-a="exit">Salir</button></div></div>`;
    this.overEl.classList.add("on"); this.overEl.onclick = e => { const a = e.target.dataset && e.target.dataset.a; if (!a) return; if (a === "again") this.start(); else if (a === "menu") { this.endRun(); this.showMenu(); } else if (a === "exit") Z3D.close(); };
  }
  reload() {
    const d = this.def; if (d.kind !== "gun" || this.rlT >= 0 || this.over) return; const a = this.ammo[this.wid]; if (a.mag >= d.mag || a.res <= 0) return;
    this.rlT = 0; this.rlDur = d.reload; this.rlCue = 0; this.vm.reload(d.reload); this.adsHeld = false;
  }
  quickMelee() { if (this.over || this.rlT >= 0 || this.def.kind === "melee") { if (this.def.kind === "melee") this.attack(); return; } this.quickPrev = this.cur; this.select(2, true); this.cool = 0; this.equipSkip(); this.attack(); }
  equipSkip() { this.vm.equipT = .25; }
  attack() {
    const d = this.def; if (this.cool > 0 || this.swingHit || this.vm.swingT >= 0) return; this.meleeN++; this.vm.swing(d.delay * 1.05, this.meleeN % 2); this.swingHit = true; this.swingAt = 0; this.cool = d.delay; Snd.play("swish", d.id === "bat" ? 1.3 : 1);
  }
  meleeStrike() {
    const d = this.def, P = this.P, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), cand = [];
    for (const z of this.Z.list) {
      if (z.st !== 1) continue; const dx = z.x - P.x, dz = z.z - P.z, dist = Math.hypot(dx, dz); if (dist > d.range + z.r) continue;
      const ang = Math.acos(clamp((dx * fx + dz * fz) / (dist || 1), -1, 1)); if (ang > d.arc && dist > z.r + .5) continue;
      if (this.world.rayWall(P.x, 1.2, P.z, dx / (dist || 1), 0, dz / (dist || 1), dist) < dist - z.r) continue; cand.push({ z, dist });
    }
    cand.sort((a, b) => a.dist - b.dist); let hit = 0;
    for (const { z, dist } of cand.slice(0, d.cleave)) { hit++; const kx = (z.x - P.x) / (dist || 1) * d.knock * 2.2, kz = (z.z - P.z) / (dist || 1) * d.knock * 2.2; this.damage(z, d.dmg, false, kx, kz, z.x, 1.2 * z.sc, z.z, true); }
    if (hit) { Snd.play(d.id === "bat" ? "bathit" : "knifehit"); this.shake = Math.max(this.shake, .25); this.vm.kick = .02; }
  }
  damage(z, dmg, head, kx, kz, hx, hy, hz, melee) {
    const killed = this.Z.hit(z, dmg, kx, kz), s = this.state, pan = this.pan(z);
    this.parts.burst(hx, hy, hz, head ? 9 : 6, head ? 0x8f1414 : 0x6a1212, 2.4, .05, .7, 1.3, 11); s.score += 10;
    if (killed) { s.kills++; s.score += 60 + (head ? 100 : 0); if (head) s.hs++; Snd.play("kill"); Snd.play("zdie", pan.p, pan.v); this.parts.burst(z.x, 1.1, z.z, 10, 0x7a1515, 3, .07, 1, 1.2, 10); this.parts.gibs(z.x, 1.1, z.z, 12); this.parts.burst(z.x, .1, z.z, 6, 0x777777, 1.5, .1, .6, .5, 2); this.parts.splat(z.x, z.z, rnd(.8, 1.3)); }
    else { Snd.play("zhit", pan.p, pan.v); if (Math.random() < .35) this.parts.splat(z.x + rnd(-.4, .4), z.z + rnd(-.4, .4), rnd(.25, .5)); }
    if (!melee) Snd.play(head ? "head" : "hit"); this.hmT = .18; this.hud.hm.classList.toggle("hs", !!head || killed);
  }
  pan(z) {
    const P = this.P, dx = z.x - P.x, dz = z.z - P.z, d = Math.hypot(dx, dz) || 1, rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw); return { p: (dx * rx + dz * rz) / d * Math.min(1, d / 4), v: clamp(1.1 - d / 28, 0, 1) };
  }
  shoot() {
    const d = this.def, a = this.ammo[this.wid], cam = this.cam; a.mag--; this.cool = d.delay; this.vm.fire(); Snd.play(d.snd); this.punch = Math.min(1, this.punch + .55);
    const dir = new V3(); cam.getWorldDirection(dir); const o = cam.position, W = this.world; cam.updateMatrixWorld();
    let wallT = W.rayWall(o.x, o.y, o.z, dir.x, dir.y, dir.z, 90), floorHit = false; if (dir.y < -1e-4) { const tf = -o.y / dir.y; if (tf < wallT) { wallT = tf; floorHit = true; } }
    const h = this.Z.ray(o.x, o.y, o.z, dir.x, dir.y, dir.z, wallT), endT = h ? h.t : wallT, end = new V3(o.x + dir.x * endT, o.y + dir.y * endT, o.z + dir.z * endT);
    const mz = this.vm.w.g.localToWorld(this.vm.w.muzzle.clone()); cam.localToWorld(mz); this.tr.spawn(mz, end, this.vm.sil ? .6 : 1);
    if (h) { const hs = h.head; this.damage(h.z, d.dmg * (hs ? d.hs : 1), hs, dir.x * 1.2, dir.z * 1.2, end.x, end.y, end.z, false); }
    else if (wallT < 89) this.parts.burst(end.x - dir.x * .05, end.y - dir.y * .05, end.z - dir.z * .05, floorHit ? 5 : 6, floorHit ? 0x59603f : 0x9a9a92, 1.6, .04, .5, 1, 9);
    const rx = Math.cos(this.P.yaw), rz = -Math.sin(this.P.yaw), sp = this.vm.sil ? 0 : 1; this.parts.emit(o.x + rx * .2 + dir.x * .35, o.y - .18, o.z + rz * .2 + dir.z * .35, rx * rnd(1.5, 2.5) + rnd(-.3, .3), rnd(1.5, 2.6), rz * rnd(1.5, 2.5), 1.4, .028, 0xd9a830, 14); void sp;
    this.kickRecoil(d); if (a.mag <= 0) this.reload();
  }
  kickRecoil(d) {                                                    // retroceso estilo CS2: el CENTRO de la mira sube y se desvía; la bala siempre va al centro
    if (this.clock - this.lastShot > Math.max(.32, d.delay * 2.4)) this.shotI = 0; const [up, sd] = recoilAt(d, this.shotI++), m = (this.P.ads > .5 ? .85 : this.P.aim > .5 ? 1 : 1.2) * (this.P.crouch > .5 ? .8 : 1);
    this.rp = Math.min(.55, this.rp + up * m); this.ry += sd * m; this.lastShot = this.clock;
  }
  /* ---------- bucle ---------- */
  loop(t) {
    this.raf = requestAnimationFrame(this.loop); let dt = (t - this.last) / 1000; this.last = t; dt = clamp(dt, 0, .05);
    this.ema = lerp(this.ema, dt * 1000 || 16, .05); this.perfT += dt; if (this.perfT > 1.5) { this.perfT = 0; this.adapt(); }
    if (this.playing && !this.paused && !this.over) this.update(dt); else if (this.over && this.playing) this.update(dt * .3, true);
    if (!this.playing && this.menuOn) { this.menuT += dt; this.cam.position.set(-6, 2.2, -6); this.cam.rotation.set(-.08, this.menuT * .08, 0); this.cam.fov = 70; this.cam.updateProjectionMatrix(); this.Z.draw(this.P); this.parts.update(dt); this.renderPreview(dt); }
    this.R.clear(); this.R.render(this.scene, this.cam); if (this.playing && !this.over) { this.R.clearDepth(); this.R.render(this.vm.scene, this.vm.cam); }
  }
  adapt() {
    const ms = this.ema; if (ms > 24 && (this.pr > .7 || this.cap > 40)) { if (this.pr > .7) { this.pr = Math.max(.7, this.pr - .2); this.R.setPixelRatio(this.pr); this.resize(); } this.cap = Math.max(40, this.cap - 12); }
    else if (ms < 13 && this.playing) { this.cap = Math.min(ZMAX - 6, this.cap + 6); if (this.pr < this.maxPr) { this.pr = Math.min(this.maxPr, this.pr + .1); this.R.setPixelRatio(this.pr); this.resize(); } }
  }
  renderPreview(dt) {
    const p = this.pv; if (!p || !p.r || !p.wg) return; p.t += dt; p.wg.rotation.set(Math.sin(p.t * 1.3) * .12, p.t * .6 + .6, Math.sin(p.t * .9) * .1); p.wg.updateMatrixWorld(true);
    if (p.kc.has) { const a = p.o.anchor.clone(); p.wg.localToWorld(a); p.kc.step(dt, a, new V3(0, -1, 0)); } p.r.render(p.scene, p.cam);
  }
  update(dt, dying) {
    const P = this.P, K = this.keys, def = this.def, gun = def.kind === "gun", W = this.world, S = this.state;
    /* ratón */
    const sens = .0022 * (this.cam.fov / 74); let dx = this.mdx, dy = this.mdy; this.mdx = this.mdy = 0; if (this.mouseGrace > 0) { this.mouseGrace -= dt; dx = dy = 0; } if (dying) dx = dy = 0;
    P.yaw -= dx * sens; P.pitch = clamp(P.pitch - dy * sens, -1.45, 1.45); this.clock += dt;
    { const firing = this.clock - this.lastShot < def.delay * 1.6 + .05, rate = firing ? 1.1 : 7; this.rp = damp(this.rp, 0, rate, dt); this.ry = damp(this.ry, 0, rate, dt); }
    P.lean = damp(P.lean, dying ? 0 : (K.KeyE ? 1 : 0) - (K.KeyQ ? 1 : 0), 10, dt);
    /* movimiento */
    let mx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0), mz = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0); if (dying) mx = mz = 0; const moving = mx || mz, wantCrouch = !!K.KeyC && !dying;
    const canSprint = !!K.ShiftLeft && mz > 0 && !wantCrouch && !this.adsHeld && !(this.fireHeld && gun) && P.st > 0 && !P.stLock && this.rlT < 0 && !dying;
    const sprinting = canSprint && moving; P.crouch = damp(P.crouch, wantCrouch ? 1 : 0, 12, dt); P.sprint = damp(P.sprint, sprinting ? 1 : 0, 9, dt);
    if (sprinting) { P.st = Math.max(0, P.st - 22 * dt); P.stDelay = .8; if (P.st <= 0) P.stLock = true; } else { P.stDelay -= dt; if (P.stDelay <= 0) { P.st = Math.min(100, P.st + 16 * dt); if (P.st > 25) P.stLock = false; } }
    const base = sprinting ? 6.8 : wantCrouch ? 2.3 : this.adsHeld && gun ? 2.8 : 4.4; const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx; const wl = Math.hypot(wx, wz) || 1; wx = wx / wl * base * (moving ? 1 : 0); wz = wz / wl * base * (moving ? 1 : 0);
    P.vx = damp(P.vx, wx, moving ? 11 : 14, dt); P.vz = damp(P.vz, wz, moving ? 11 : 14, dt); P.x += P.vx * dt; P.z += P.vz * dt; const sp = Math.hypot(P.vx, P.vz); P.speed = clamp(sp / 4.4, 0, 1.4);
    P.eye = damp(P.eye, wantCrouch ? 1.05 : 1.65, 12, dt);
    /* armas */
    this.cool -= dt; const a = gun ? this.ammo[this.wid] : null;
    const wantAds = gun && this.adsHeld && this.rlT < 0 && !sprinting && !dying; P.ads = damp(P.ads, wantAds ? 1 : 0, 14, dt); P.aim = damp(P.aim, gun && this.aimHip && !sprinting && !dying ? 1 : 0, 12, dt);
    if (this.rlT >= 0) { this.rlT += dt; const r = this.rlT / this.rlDur; if (this.rlCue < 1 && r > .25) { this.rlCue = 1; Snd.play("magout"); } if (this.rlCue < 2 && r > .6) { this.rlCue = 2; Snd.play("magin"); } if (this.rlCue < 3 && r > .84 && this.def.id !== "pistol" && this.def.id !== "silenced") { this.rlCue = 3; Snd.play("bolt"); }
      if (r >= 1) { const need = def.mag - a.mag, take = Math.min(need, a.res); a.mag += take; a.res -= take; this.rlT = -1; } }
    if (!dying) {
      if (gun) {
        const trig = def.auto && !this.semi[this.wid] ? this.fireHeld : this.click;
        if (trig && this.cool <= 0 && this.rlT < 0 && this.vm.equipT < .35) { if (a.mag > 0) this.shoot(); else { this.cool = .25; Snd.play("empty"); this.reload(); } }
      } else if (this.fireHeld && this.cool <= 0) this.attack();
    }
    this.click = false;
    if (this.swingHit) { this.swingAt += dt; if (this.swingAt >= this.def.delay * (this.def.id === "bat" ? .5 : .42)) { this.swingHit = false; this.meleeStrike(); } }
    if (this.quickPrev >= 0 && this.vm.swingT < 0 && !this.swingHit && this.cool <= 0) { const q = this.quickPrev; this.quickPrev = -1; this.select(q); }
    /* rondas y aparición */
    W.flow(P.x, P.z); const alive = this.Z.alive;
    if (!dying) {
      if (this.phase === "count") { this.cdT -= dt; if (this.cdT <= 0) this.phase = "active"; }
      else if (this.phase === "active") {
        this.spawnT -= dt; let guard = 3;
        while (this.toSpawn > 0 && this.spawnT <= 0 && this.Z.list.length < Math.min(this.cap, ZMAX) && guard-- > 0) {
          const s = this.pickSpawn(); if (!s) break; const rd = S.round, brute = rd >= 4 && Math.random() < Math.min(.28, .06 + .03 * (rd - 4)); if (this.Z.spawn(s[0], s[1], rd, brute)) { this.toSpawn--; } this.spawnT = Math.max(.18, 1.05 - .045 * rd) / (rd > 6 ? 1.6 : 1);
        }
        if (this.toSpawn <= 0 && alive === 0) { S.score += 50 * S.round; Snd.play("clear"); this.banner("RONDA SUPERADA", "+" + 50 * S.round + " puntos", 2.2); this.phase = "wait"; this.cdT = 3; }
      } else if (this.phase === "wait") { this.cdT -= dt; if (this.cdT <= 0) this.beginRound(S.round + 1); }
    }
    this.Z.update(dt, P, { round: S.round, hurt: (d, x, z) => this.hurt(d, x, z), sound: (n, z) => { const q = this.pan(z); if (q.v > .02) Snd.play(n, q.p, q.v, z.brute); } });
    /* los zombis bloquean al jugador: pueden acorralarlo */
    for (const z of this.Z.list) { if (z.st !== 1) continue; const dx = P.x - z.x, dz = P.z - z.z, m = .35 + z.r, d2 = dx * dx + dz * dz; if (d2 < m * m && d2 > 1e-8) { const d = Math.sqrt(d2), k = (m - d) / d; P.x += dx * k * .85; P.z += dz * k * .85; z.x -= dx * k * .15; z.z -= dz * k * .15; } }
    W.resolve(P, .35);
    /* salud, sonidos de pasos y latido */
    if (!dying) { this.regen -= dt; if (this.regen <= 0 && P.hp < 100) P.hp = Math.min(100, P.hp + 5 * dt); }
    this.stepD += sp * dt; if (sp > .8 && this.stepD > (sprinting ? 2.3 : 1.8)) { this.stepD = 0; Snd.play("step", wantCrouch ? .35 : sprinting ? 1.2 : .8); }
    if (P.hp < 35 && P.hp > 0) { this.beatT -= dt; if (this.beatT <= 0) { this.beatT = .85; Snd.play("beat"); } }
    this.hurtT = Math.max(0, this.hurtT - dt); this.shake = Math.max(0, this.shake - dt * 2.2); this.punch = Math.max(0, this.punch - dt * 8);
    /* cámara (los disparos salen SIEMPRE del centro exacto: sin retroceso en la mira real) */
    const cam = this.cam, tf = lerp(lerp(74, 62, P.aim), gun ? def.fov : 74, P.ads) + P.sprint * 5 + this.punch * 1.1; if (Math.abs(cam.fov - tf) > .02) { cam.fov = damp(cam.fov, tf, 20, dt); cam.updateProjectionMatrix(); }
    const bob = Math.sin(this.vm.bobT) * .012 * P.speed * (1 - P.ads * .8), sh = this.shake * .02; let lo = P.lean * .4; if (Math.abs(lo) > .01) { const sg = Math.sign(lo), rdx = Math.cos(P.yaw) * sg, rdz = -Math.sin(P.yaw) * sg, tw = W.rayWall(P.x, 1.4, P.z, rdx, 0, rdz, Math.abs(lo) + .25); lo = sg * Math.min(Math.abs(lo), Math.max(0, tw - .25)); }
    cam.position.set(P.x + Math.cos(P.yaw) * lo, P.eye + Math.abs(bob) * .6 - Math.abs(P.lean) * .07, P.z - Math.sin(P.yaw) * lo);
    const roll = -P.lean * .2 + bob * .5 + (dying ? .6 : 0); cam.rotation.set(clamp(P.pitch + this.rp, -1.5, 1.5) + (Math.random() - .5) * sh, P.yaw + this.ry + (Math.random() - .5) * sh, roll); cam.updateMatrixWorld();
    this.vm.update(dt, { ads: P.ads, sprint: P.sprint, speed: sp > .3 ? P.speed : 0, crouch: P.crouch > .5, dx, dy, camQuat: cam.quaternion, aim: P.aim, lean: P.lean, roll });
    this.indT -= dt; if (this.indT <= 0) { this.indT = .15; const ind = Math.abs(P.x) < 18 && Math.abs(P.z) < 8; this.indoor = damp(this.indoor || 0, ind ? 1 : 0, 1, .15 * 4); Snd.setIndoor(this.indoor); Snd.setSurface(ind ? 0 : 1); }
    for (const f of this.map.flick) if (f.bad) f.l.intensity = f.base * (Math.sin(this.clock * 23 + f.ph) * Math.sin(this.clock * 7.3 + f.ph) > .62 ? .12 : .9 + Math.random() * .1);
    this.parts.update(dt); this.tr.update(dt); this.updateHUD(dt);
  }
  updateHUD(dt) {
    const H = this.hud, c = H.c, P = this.P, S = this.state, d = this.def, set = (k, el, v) => { if (c[k] !== v) { c[k] = v; el.textContent = v; } };
    set("hp", H.hp, Math.ceil(Math.max(0, P.hp))); H.hpb.style.width = Math.max(0, P.hp) + "%"; H.stb.style.width = P.st + "%"; H.stb.style.opacity = P.stLock ? .45 : 1;
    set("rd", H.rd, "RONDA " + S.round); set("zl", H.zl, "Zombis: " + (this.toSpawn + this.Z.alive)); set("sc", H.sc, S.score); set("wn", H.wn, d.name + (d.kind === "gun" && d.auto ? (this.semi[this.wid] ? " · SEMI" : " · AUTO") : ""));
    set("am", H.am, d.kind === "gun" ? this.ammo[this.wid].mag + " / " + this.ammo[this.wid].res : "—");
    H.hm.style.opacity = this.hmT > 0 ? 1 : 0; this.hmT -= dt; H.cx.classList.toggle("ads", P.ads > .5 && d.kind === "gun"); H.cx.classList.toggle("hip", P.aim > .5); H.cx.style.opacity = d.kind === "gun" ? 1 - P.ads * .6 : .6;
    const lowHp = P.hp < 35 ? (35 - P.hp) / 35 * .45 : 0; H.v.style.opacity = Math.min(1, this.hurtT * .9 + lowHp);
    if (this.hurtT > 0 && this.hurtAng) { const dx = this.hurtAng[0] - P.x, dz = this.hurtAng[1] - P.z, fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw); H.dm.style.opacity = Math.min(1, this.hurtT * 1.8); H.dm.style.transform = `rotate(${Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz)}rad)`; } else H.dm.style.opacity = 0;
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) H.bn.style.opacity = 0; }
    if (this.hintT > 0) { this.hintT -= dt; H.hint.textContent = CTRL_HELP; H.hint.style.opacity = this.hintT > 0 && this.hintT < 6.5 ? .9 : 0; } else H.hint.style.opacity = 0;
  }
  destroy() {
    cancelAnimationFrame(this.raf); this.off.forEach(f => f()); window.removeEventListener("resize", this.onResize); try { document.exitPointerLock(); } catch (e) { /* nada */ } Snd.stopAmb();
    if (this.pv && this.pv.r) this.pv.r.dispose(); this.R.dispose(); this.root.remove();
  }
}

/* ======================= API pública (solo administradores, BETA) ======================= */
let game = null;
export const Z3D = {
  open() { if (game) return game; game = new Game(); return game; },
  close() { if (game) { game.destroy(); game = null; } },
  get game() { return game; }
};
