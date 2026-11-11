/* zombies3d.js — ZOMBIES 3D (BETA): shooter arcade de rondas contra zombies lentos pero MUCHOS, en una escuela.
 * Solo accesible desde el Panel de Administración mientras esté en beta. Three.js local (vendor/).
 * Controles: WASD mover · Shift esprintar · C agacharse · Clic izq. disparar/atacar · Clic der. apuntar con mira · R recargar
 *            V golpe cuerpo a cuerpo rápido · 1/2/3 o rueda: arma principal / secundaria / melee · Esc pausa · M sonido
 * Precisión: las balas siempre salen EXACTAMENTE por el centro de la pantalla (cadera y mira, 100 %); el retroceso es solo visual. */
import * as THREE from "./vendor/three.module.js";

const V3 = THREE.Vector3, rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t, damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ======================= Armas (datos) ======================= */
const WEAPONS = {
  ak47:   { id: "ak47", slot: 0, name: "AK-47", kind: "gun", auto: true, delay: .1, dmg: 30, hs: 2.5, mag: 30, reserve: 150, reload: 2.2, kick: 1, snd: "ak", desc: "Potente y pesada. Mucho daño por bala.", pos: [.16, -.175, -.42], ads: [0, -.075, -.42], fov: 52 },
  m4a4:   { id: "m4a4", slot: 0, name: "M4A4", kind: "gun", auto: true, delay: .085, dmg: 24, hs: 2.5, mag: 30, reserve: 180, reload: 1.9, kick: .75, snd: "m4", desc: "Cadencia alta y retroceso suave.", pos: [.16, -.175, -.42], ads: [0, -.085, -.38], fov: 52 },
  pistol: { id: "pistol", slot: 1, name: "Pistola", kind: "gun", auto: false, delay: .14, dmg: 26, hs: 2.5, mag: 12, reserve: 96, reload: 1.35, kick: .8, snd: "pistol", desc: "Rápida de sacar. Semiautomática.", pos: [.17, -.15, -.34], ads: [0, -.056, -.3], fov: 58 },
  silenced: { id: "silenced", slot: 1, name: "Pistola silenciada", kind: "gun", auto: false, delay: .15, dmg: 22, hs: 2.7, mag: 15, reserve: 105, reload: 1.45, kick: .45, snd: "silenced", desc: "Casi sin ruido ni fogonazo.", pos: [.17, -.15, -.34], ads: [0, -.056, -.3], fov: 58 },
  knife:  { id: "knife", slot: 2, name: "Cuchillo", kind: "melee", delay: .34, dmg: 55, range: 1.9, arc: .75, knock: 1.4, cleave: 1, snd: "knife", desc: "Rápido y letal de cerca.", pos: [.2, -.2, -.38] },
  bat:    { id: "bat", slot: 2, name: "Bate", kind: "melee", delay: .62, dmg: 80, range: 2.5, arc: 1.05, knock: 7, cleave: 4, snd: "bat", desc: "Lento, golpea a varios y los lanza.", pos: [.22, -.22, -.4] }
};
const SLOT_DEF = ["ak47", "pistol", "knife"];

/* ======================= Sonido (sintetizado) ======================= */
const Snd = (() => {
  let AC = null, master = null, muted = false, amb = null, groanN = 0; try { muted = localStorage.getItem("hood_z3d_mute") === "1"; } catch (e) { /* sin almacenamiento */ }
  const ac = () => { if (AC === null) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .55; master.connect(AC.destination); } catch (e) { AC = false; } } if (AC && AC.state === "suspended") AC.resume(); return AC; };
  let nbuf = null; const noiseBuf = a => { if (!nbuf) { nbuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return nbuf; };
  const out = (a, pan, vol) => { let node = master; if (pan !== undefined && a.createStereoPanner) { const p = a.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(master); node = p; } return node; };
  function tone(f, d, type = "square", vol = .1, f2 = 0, delay = 0, pan, a0) {
    if (muted) return; const a = a0 || ac(); if (!a) return; const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g); g.connect(out(a, pan)); o.start(t); o.stop(t + d + .03);
  }
  function noise(d, vol = .1, fq = 2000, type = "lowpass", delay = 0, pan, q = 1, fq2 = 0) {
    if (muted) return; const a = ac(); if (!a) return; const t = a.currentTime + delay, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noiseBuf(a); f.type = type; f.frequency.setValueAtTime(fq, t); if (fq2) f.frequency.exponentialRampToValueAtTime(fq2, t + d); f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); s.connect(f); f.connect(g); g.connect(out(a, pan)); s.start(t, Math.random()); s.stop(t + d + .02);
  }
  const S = {
    ak: () => { noise(.16, .5, 3800, "lowpass", 0, 0, .7, 600); noise(.03, .45, 6000, "highpass"); tone(150, .14, "sawtooth", .28, 45); tone(90, .1, "square", .2, 40); },
    m4: () => { noise(.13, .42, 5200, "lowpass", 0, 0, .7, 900); noise(.025, .4, 7000, "highpass"); tone(210, .1, "sawtooth", .22, 60); },
    pistol: () => { noise(.1, .38, 4500, "lowpass", 0, 0, .8, 800); noise(.02, .35, 6500, "highpass"); tone(260, .09, "sawtooth", .2, 70); },
    silenced: () => { noise(.07, .14, 1400, "lowpass"); tone(320, .06, "triangle", .12, 140); noise(.015, .1, 5000, "highpass"); },
    empty: () => tone(1600, .03, "square", .06),
    magout: () => { noise(.05, .22, 1800, "bandpass", 0, 0, 3); tone(260, .06, "square", .06, 140); },
    magin: () => { noise(.06, .28, 1200, "bandpass", 0, 0, 3); tone(180, .08, "square", .09, 110); tone(900, .03, "square", .05, 0, .05); },
    bolt: () => { noise(.04, .22, 2600, "bandpass", 0, 0, 4); noise(.05, .22, 3200, "bandpass", .09, 0, 4); },
    draw: () => { noise(.09, .12, 2200, "bandpass", 0, 0, 2, 900); },
    swish: v => noise(.16, .18 * (v || 1), 1200, "bandpass", 0, 0, 1.4, 4200),
    stab: () => { noise(.06, .3, 1500, "lowpass"); tone(900, .04, "triangle", .08, 400); },
    knifehit: () => { noise(.09, .35, 900, "lowpass"); tone(220, .09, "sawtooth", .12, 80); tone(2200, .03, "square", .04); },
    bathit: () => { noise(.12, .5, 700, "lowpass"); tone(100, .18, "sine", .4, 40); tone(300, .05, "square", .12, 120); },
    hit: () => tone(1300, .035, "square", .05), head: () => { tone(1800, .08, "triangle", .12, 2600); tone(700, .05, "square", .06, 300); noise(.05, .2, 4000, "highpass"); },
    kill: () => { tone(700, .1, "triangle", .08, 1100); },
    step: sp => noise(.07, .1 * (sp || 1), 500, "lowpass"),
    hurt: () => { noise(.22, .45, 600, "lowpass"); tone(90, .25, "sawtooth", .25, 45); },
    beat: () => { tone(55, .14, "sine", .5, 40); tone(48, .14, "sine", .4, 36, .2); },
    round: () => { [110, 138, 165].forEach((f, i) => tone(f, 1.6, "sawtooth", .08, f * .98, i * .05)); noise(1.2, .12, 300, "lowpass", 0, 0, 1, 1800); tone(55, 1.8, "sine", .3, 40); },
    clear: () => [392, 494, 587, 784].forEach((f, i) => tone(f, .22, "triangle", .1, 0, i * .09)),
    over: () => { [220, 175, 130, 98].forEach((f, i) => tone(f, .6, "sawtooth", .1, f * .8, i * .28)); },
    pick: () => { tone(880, .08, "triangle", .08); tone(1320, .12, "triangle", .08, 0, .06); },
    ui: () => tone(700, .04, "square", .05),
    groan: (pan, vol, big) => {                                         // gruñido: sierra grave con vibrato y filtro "vocal"
      if (muted || groanN >= 3) return; const a = ac(); if (!a) return; groanN++;
      const t = a.currentTime, d = rnd(.8, 1.5), o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      const f0 = (big ? 55 : 80) * rnd(.85, 1.25); o.type = "sawtooth"; o.frequency.setValueAtTime(f0 * 1.4, t); o.frequency.exponentialRampToValueAtTime(f0, t + d);
      lfo.frequency.value = rnd(5, 9); lg.gain.value = 8; lfo.connect(lg); lg.connect(o.frequency);
      f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(rnd(350, 600), t); f.frequency.linearRampToValueAtTime(rnd(250, 420), t + d);
      g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol * .5, t + .15); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(f); f.connect(g); g.connect(out(a, pan)); o.start(t); lfo.start(t); o.stop(t + d + .05); lfo.stop(t + d + .05); setTimeout(() => groanN--, d * 1000);
    },
    zhit: (pan, vol) => noise(.1, vol * .35, 500, "lowpass", 0, pan), zdie: (pan, vol) => { tone(90, .5, "sawtooth", vol * .3, 35, 0, pan); noise(.25, vol * .3, 400, "lowpass", .25, pan); },
    atk: (pan, vol) => { tone(120, .3, "sawtooth", vol * .25, 70, 0, pan); noise(.2, vol * .2, 900, "bandpass", 0, pan, 2); }
  };
  function ambient() {
    if (muted || amb) return; const a = ac(); if (!a) return;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), l = a.createOscillator(), lg = a.createGain();
    s.buffer = noiseBuf(a); s.loop = true; f.type = "lowpass"; f.frequency.value = 260; g.gain.value = .07; l.frequency.value = .13; lg.gain.value = .035; l.connect(lg); lg.connect(g.gain);
    s.connect(f); f.connect(g); g.connect(master); s.start(); l.start(); amb = { s, l, g };
  }
  const stopAmb = () => { if (amb) { try { amb.s.stop(); amb.l.stop(); } catch (e) { /* ya parado */ } amb = null; } };
  return { ac, play: (n, ...a) => { if (!muted && S[n]) S[n](...a); }, ambient, stopAmb, get muted() { return muted; },
    toggle() { muted = !muted; try { localStorage.setItem("hood_z3d_mute", muted ? "1" : "0"); } catch (e) { /* sin almacenamiento */ } if (muted) stopAmb(); else ambient(); return muted; } };
})();

/* ======================= Mapa: escuela ======================= */
const WX = 40, WZ = 30, H = 3.6;                         // el mundo mide 80 × 60 m (cerca incluida)
class Batch {                                              // geometría estática combinada (un solo dibujo) con color por vértice
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; this.col = new THREE.Color(); }
  box(cx, cy, cz, sx, sy, sz, color) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2; this.col.set(color);
    const F = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1],
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0]];
    for (const f of F) {
      const b = this.p.length / 3, sh = f[6] === 1 || f[5] === 1 ? 1 : f[5] === -1 ? .55 : (f[4] ? .85 : 1);   // sombreado simple por cara
      for (let k = 0; k < 4; k++) { this.p.push(...f[k]); this.n.push(f[4], f[5], f[6]); this.c.push(this.col.r * sh, this.col.g * sh, this.col.b * sh); }
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i); return new THREE.Mesh(g, mat);
  }
}
function canvasTex(w, h, draw, rep) { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; if (rep) t.repeat.set(rep[0], rep[1]); t.colorSpace = THREE.SRGBColorSpace; return t; }
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

function buildMap(scene) {
  const B = new Batch(), E = new Batch(), colliders = [];
  const col = (x0, z0, x1, z1, h = H) => colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), h });
  const BR = 0x8b4a3b, BR2 = 0x6f3a2e, CR = 0xd9cfb8, GRN = 0x3f6b57, WOOD = 0x8a5a2b, GRY = 0x6c7078, METAL = 0x7f8794;
  const T = .4;
  /* pared horizontal (a lo largo de X) con huecos (puertas) y ventanas opcionales */
  function hwall(z, xa, xb, gaps = [], win = false, color = CR, outside = 0) {
    const iv = []; let cur = xa; for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > cur) iv.push([cur, g0]); cur = g1; } if (cur < xb) iv.push([cur, xb]);
    for (const [a, b] of iv) {
      col(a, z - T / 2, b, z + T / 2); const L = b - a, cx = (a + b) / 2;
      if (win && L > 3) {                                                                         // ventanas: antepecho + dintel + pilares
        B.box(cx, .5, z, L, 1, T, outside ? BR2 : color); B.box(cx, H - .6, z, L, 1.2, T, outside ? BR : color);
        const n = Math.max(1, Math.floor(L / 2.8)), pw = L / n; for (let k = 0; k <= n; k++) B.box(a + k * pw, H / 2, z, k === 0 || k === n ? .4 : .55, H, T, outside ? BR : color);
        for (let k = 0; k < n; k++) E.box(a + (k + .5) * pw, 1.7, z, pw - .6, 1.2, .04, 0x1a2a3a);    // cristal oscuro
      } else { B.box(cx, H / 2, z, L, H, T, color); B.box(cx, .6, z, L, 1.2, T + .04, outside ? BR2 : GRN); }
    }
    for (const [g0, g1] of gaps) B.box((g0 + g1) / 2, H - .55, z, g1 - g0, 1.1, T, color);        // dintel de la puerta
  }
  function vwall(x, za, zb, gaps = [], color = CR, outside = 0) {
    const iv = []; let cur = za; for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) { if (g0 > cur) iv.push([cur, g0]); cur = g1; } if (cur < zb) iv.push([cur, zb]);
    for (const [a, b] of iv) { col(x - T / 2, a, x + T / 2, b); B.box(x, H / 2, (a + b) / 2, T, H, b - a, outside ? BR : color); B.box(x, .6, (a + b) / 2, T + .04, 1.2, b - a, outside ? BR2 : GRN); }
    for (const [g0, g1] of gaps) B.box(x, H - .55, (g0 + g1) / 2, T, 1.1, g1 - g0, outside ? BR : color);
  }
  const RX = [-19.5, -6.5, 6.5, 19.5], doorX = RX.map(c => [c - 1.5, c + 1.5]);
  /* edificio principal 52 × 24 m: pasillo central y 8 aulas */
  hwall(12, -26, 26, [[-8, -5], [5, 8]].map(g => g), true, CR, 1); hwall(-12, -26, 26, [[-8, -5], [5, 8]], true, CR, 1);   // fachadas con ventanas y 2 puertas cada una
  vwall(-26, -12, 12, [[-1.7, 1.7]], CR, 1); vwall(26, -12, 12, [[-1.7, 1.7]], CR, 1);
  hwall(2, -26, 26, doorX); hwall(-2, -26, 26, doorX);
  for (const x of [-13, 0, 13]) { vwall(x, 2, 12); vwall(x, -12, -2); }
  /* techo y suelo interior */
  B.box(0, H + .15, 0, 53, .3, 25, 0x3b3d44); E.box(0, H - .02, 0, 52, .02, 24, 0x111318);
  for (const lx of [-20, -10, 0, 10, 20]) E.box(lx, H - .05, 0, 2.4, .06, .5, 0xfff2cc);          // paneles de luz del pasillo
  for (const cx of RX) for (const sg of [1, -1]) E.box(cx, H - .05, sg * 7, 2.2, .06, .5, 0xe8efff);   // luces de las aulas
  /* aulas: pizarra, escritorio del profesor, pupitres */
  for (const cx of RX) for (const sg of [1, -1]) {
    const zb = sg * 11.72; B.box(cx, 1.7, zb, 6, 1.3, .06, 0x1f3d33); B.box(cx, 1.04, zb - sg * .06, 6.2, .05, .1, 0x9aa);
    col(cx - .8, sg * 10.4 - .4, cx + .8, sg * 10.4 + .4, 1); B.box(cx, .75, sg * 10.4, 1.6, .06, .8, WOOD); B.box(cx, .37, sg * 10.4, 1.5, .74, .7, 0x6d4620);
    for (const dx of [-3.6, 0, 3.6]) for (const dz of [5, 7, 9]) {
      const px = cx + dx, pz = sg * dz; col(px - .5, pz - .3, px + .5, pz + .3, .8);
      B.box(px, .74, pz, 1, .05, .6, 0xc79a5b); B.box(px - .45, .37, pz, .05, .74, .5, METAL); B.box(px + .45, .37, pz, .05, .74, .5, METAL);
      B.box(px, .45, pz - sg * .55, .42, .05, .4, 0x2f5f8f); B.box(px, .72, pz - sg * .75, .42, .4, .05, 0x2f5f8f);   // silla
    }
  }
  /* taquillas del pasillo (dejan libres las puertas) */
  const lockerGaps = [...doorX, [-26, -24.2], [24.2, 26]];
  for (const sg of [1, -1]) for (let x = -24; x < 24; x += .7) {
    const cx = x + .35; if (lockerGaps.some(([a, b]) => cx > a - .35 && cx < b + .35)) continue;
    B.box(cx, 1, sg * 1.72, .66, 2, .45, (Math.floor((x + 40) / .7) % 3 === 0) ? 0x2f6f8f : 0x3b7f5f);
  }
  for (const sg of [1, -1]) { let run = null; const segs = []; for (let x = -24; x < 24; x += .7) { const cx = x + .35; if (lockerGaps.some(([a, b]) => cx > a - .35 && cx < b + .35)) { if (run) { segs.push(run); run = null; } continue; } if (!run) run = [x, x + .7]; else run[1] = x + .7; } if (run) segs.push(run); for (const [a, b] of segs) col(a, sg * 1.5, b, sg * 1.95, 2); }
  /* patio exterior: cerca, árboles, autobús, coches, barricadas, farolas */
  const F = .15;
  hwall(-WZ, -WX, WX, [], false, 0x555a60); hwall(WZ, -WX, WX, [], false, 0x555a60); vwall(-WX, -WZ, WZ, [], 0x555a60); vwall(WX, -WZ, WZ, [], 0x555a60);
  const prop = (cx, cz, sx, sz, h, color, collide = true) => { B.box(cx, h / 2, cz, sx, h, sz, color); if (collide) col(cx - sx / 2, cz - sz / 2, cx + sx / 2, cz + sz / 2, h); };
  prop(-33, -21, 9, 2.6, 2.6, 0xe3a21a); B.box(-33, 2.1, -21, 9.05, .9, 2.65, 0x2c2f35); B.box(-33, 2.62, -21, 8.6, .12, 2.4, 0xe3a21a); // autobús escolar
  prop(-32, 14, 4.4, 1.9, 1.3, 0x7a2f2f); B.box(-32, 1.5, 14, 2.4, .5, 1.7, 0x2c2f35); prop(31, -14, 4.4, 1.9, 1.3, 0x2f4a7a); B.box(31, 1.5, -14, 2.4, .5, 1.7, 0x2c2f35);
  [[-16, -20, 3.2, 1], [16, 20, 3.2, 1], [18, -19, 1, 3.2], [-18, 19, 1, 3.2], [30, 4, 1, 3], [-30, -6, 1, 3]].forEach(([x, z, sx, sz]) => prop(x, z, sx, sz, 1, 0x9a9a92));   // barricadas
  const trees = [[-34, 24], [34, 24], [34, -24], [-30, -27], [0, -24], [0, 24], [14, 25], [-14, -25]];
  for (const [x, z] of trees) { prop(x, z, .7, .7, 3, 0x5a3a22); B.box(x, 4.2, z, 3.4, 2.6, 3.4, 0x2f6b36); B.box(x, 5.8, z, 2.2, 1.6, 2.2, 0x38803f); }
  for (const [x, z] of [[-33, 5], [-33, -5], [33, 7], [33, -3], [10, 18], [-10, -18]]) { prop(x, z, 2, .5, .45, 0x7a5a30); }   // bancos
  prop(-30, 0, .3, .3, 7, 0xcfcfcf); B.box(-29.2, 6.5, 0, 1.6, 1, .04, 0xc0392b);                      // asta de bandera
  prop(34, 0, .25, .25, 3.1, 0xcfcfcf); B.box(34, 3.1, 0, 1.2, .08, .08, 0xcfcfcf); prop(30.6, 0, .25, .25, 3.1, 0xcfcfcf);   // canasta
  const lamps = [[-33, 8], [33, -8], [0, 20], [0, -20]];
  for (const [x, z] of lamps) { prop(x, z, .25, .25, 5, 0x3a3d44); E.box(x, 5.1, z, .8, .15, .8, 0xffe6a8); }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), emat = new THREE.MeshBasicMaterial({ vertexColors: true });
  scene.add(B.mesh(mat)); scene.add(E.mesh(emat));
  /* suelos con textura */
  const tile = canvasTex(64, 64, (g, w, h) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? "#9aa1a6" : "#7b838a"; g.fillRect(x * 32, y * 32, 32, 32); } g.strokeStyle = "rgba(0,0,0,.25)"; g.strokeRect(0, 0, 64, 64); }, [26, 12]);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(52, 24), new THREE.MeshLambertMaterial({ map: tile })); fl.rotation.x = -Math.PI / 2; fl.position.y = .01; scene.add(fl);
  const grass = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#32502e"; g.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { g.fillStyle = hash(i, 3) > .5 ? "#3c6236" : "#2a4527"; g.fillRect(hash(i, 1) * w, hash(i, 2) * h, 2, 2); } }, [40, 30]);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(WX * 2, WZ * 2), new THREE.MeshLambertMaterial({ map: grass })); gr.rotation.x = -Math.PI / 2; scene.add(gr);
  const asph = canvasTex(64, 64, (g, w, h) => { g.fillStyle = "#3b3d42"; g.fillRect(0, 0, w, h); for (let i = 0; i < 200; i++) { g.fillStyle = hash(i, 5) > .5 ? "#44464c" : "#303237"; g.fillRect(hash(i, 6) * w, hash(i, 7) * h, 2, 2); } }, [10, 4]);
  const pv = new THREE.Mesh(new THREE.PlaneGeometry(76, 28), new THREE.MeshLambertMaterial({ map: asph })); pv.rotation.x = -Math.PI / 2; pv.position.set(0, .005, 0); pv.visible = false; scene.add(pv);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(14, 56), new THREE.MeshLambertMaterial({ map: asph })); road.rotation.x = -Math.PI / 2; road.position.set(-31, .006, 0); scene.add(road);
  const road2 = road.clone(); road2.position.x = 31; scene.add(road2);
  /* luces */
  const lights = []; for (const [x, y, z, c, i] of [[-17, 3, 0, 0xfff0d0, 14], [0, 3, 0, 0xfff0d0, 14], [17, 3, 0, 0xfff0d0, 14], [-33, 5, 8, 0xffe0a0, 40], [33, 5, -8, 0xffe0a0, 40], [0, 5, 20, 0xffe0a0, 40]]) { const l = new THREE.PointLight(c, i, 26, 2); l.position.set(x, y, z); scene.add(l); lights.push(l); }
  /* puntos de aparición */
  const spawnOut = [[-37, -26], [-37, 0], [-37, 26], [0, -27], [0, 27], [37, -26], [37, 0], [37, 26], [-19, -27], [19, -27], [-19, 27], [19, 27], [-37, 14], [37, -14]];
  const spawnIn = []; for (const cx of RX) for (const sg of [1, -1]) spawnIn.push([cx, sg * 8.5]);
  return { colliders, spawnOut, spawnIn, lights, start: { x: 0, z: 0, yaw: -Math.PI / 2 } };
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
  /* empuja un círculo fuera de las paredes/muebles */
  resolve(p, r, hMax = 9) {
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
  /* rayo 2D contra cajas: distancia al primer muro que tape la altura y del rayo */
  rayWall(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT; const x1 = ox + dx * maxT, z1 = oz + dz * maxT, seen = new Set();
    const a = Math.floor((Math.min(ox, x1) + WX) / this.cs), b = Math.floor((Math.max(ox, x1) + WX) / this.cs), d = Math.floor((Math.min(oz, z1) + WZ) / this.cs), e = Math.floor((Math.max(oz, z1) + WZ) / this.cs);
    for (let cx = Math.max(0, a); cx <= Math.min(this.gw - 1, b); cx++) for (let cz = Math.max(0, d); cz <= Math.min(this.gh - 1, e); cz++) for (const i of this.cells[cz * this.gw + cx]) {
      if (seen.has(i)) continue; seen.add(i); const c = this.col[i];
      let t0 = 0, t1 = best, ok = true;
      for (const [o, dd, lo, hi] of [[ox, dx, c.x0, c.x1], [oz, dz, c.z0, c.z1]]) {
        if (Math.abs(dd) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } } else { let ta = (lo - o) / dd, tb = (hi - o) / dd; if (ta > tb) [ta, tb] = [tb, ta]; t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; } }
      }
      if (ok && t0 < best && oy + dy * t0 < c.h && oy + dy * t0 > 0) best = t0;
    }
    return best;
  }
  flow(px, pz) {                                                    // BFS desde el jugador: distancia (en celdas) de cada celda libre
    const ix = clamp(Math.floor(px + WX), 0, this.NX - 1), iz = clamp(Math.floor(pz + WZ), 0, this.NZ - 1), s = iz * this.NX + ix; if (s === this.src) return; this.src = s;
    this.dist.fill(9999); let h = 0, t = 0; this.dist[s] = 0; this.queue[t++] = s; const NX = this.NX, NZ = this.NZ;
    while (h < t) {
      const cur = this.queue[h++], cx = cur % NX, cz = (cur / NX) | 0, nd = this.dist[cur] + 1;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0], dz = DIRS[k][1], nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= NX || nz >= NZ) continue; const ni = nz * NX + nx;
        if (this.blocked[ni] || this.dist[ni] <= nd) continue;
        if (dx && dz && (this.blocked[cz * NX + nx] || this.blocked[nz * NX + cx])) continue;                 // no cortar esquinas
        this.dist[ni] = nd; this.queue[t++] = ni;
      }
    }
  }
  next(x, z, out) {                                                 // vecino de menor distancia → hacia dónde ir
    const ix = clamp(Math.floor(x + WX), 0, this.NX - 1), iz = clamp(Math.floor(z + WZ), 0, this.NZ - 1), NX = this.NX; let bd = this.dist[iz * NX + ix], bx = -1, bz = -1;
    for (let k = 0; k < 8; k++) { const nx = ix + DIRS[k][0], nz = iz + DIRS[k][1]; if (nx < 0 || nz < 0 || nx >= NX || nz >= this.NZ) continue; const d = this.dist[nz * NX + nx]; if (d < bd) { bd = d; bx = nx; bz = nz; } }
    if (bx < 0) return false; out.x = bx - WX + .5; out.z = bz - WZ + .5; return true;
  }
  distAt(x, z) { return this.dist[clamp(Math.floor(z + WZ), 0, this.NZ - 1) * this.NX + clamp(Math.floor(x + WX), 0, this.NX - 1)]; }
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/* ======================= Modelos de armas (cajas) + llaveros ======================= */
const matCache = {}, M = c => matCache[c] || (matCache[c] = new THREE.MeshLambertMaterial({ color: c })), BOXG = new THREE.BoxGeometry(1, 1, 1);
const bx = (p, sx, sy, sz, x, y, z, c, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(BOXG, M(c)); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); p.add(m); return m; };
const CYG = new THREE.CylinderGeometry(1, 1, 1, 10); CYG.rotateX(Math.PI / 2);
const cy = (p, r, len, x, y, z, c) => { const m = new THREE.Mesh(CYG, M(c)); m.scale.set(r, r, len); m.position.set(x, y, z); p.add(m); return m; };
const SKIN = 0xd9a77a, SLEEVE = 0x39483a, GUN = 0x2a2c31, GUN2 = 0x4a4e55, WOODC = 0x8a4f25, BLK = 0x16171a;
function arm(p, hx, hy, hz, side, len = .5) {                      // mano + antebrazo que sale hacia abajo-atrás
  const g = new THREE.Group(); g.position.set(hx, hy, hz); g.userData.isArm = true; p.add(g);
  bx(g, .05, .05, .09, 0, 0, 0, SKIN); bx(g, .06, .06, len, side * .03, -.045, len / 2 + .03, SLEEVE, .3, side * -.15, 0); return g;
}
function buildWeapon(id) {
  const g = new THREE.Group(), o = { g, mag: null, bolt: null, muzzle: new THREE.Vector3(0, .02, -.5), anchor: new THREE.Vector3(-.03, -.02, .08), magBase: 0, boltBase: 0 };
  if (id === "ak47") {
    bx(g, .05, .07, .34, 0, 0, -.02, GUN); bx(g, .052, .02, .3, 0, .045, -.02, GUN2); cy(g, .011, .32, 0, .02, -.36, GUN2); cy(g, .016, .06, 0, .02, -.54, BLK); bx(g, .008, .04, .008, 0, .056, -.53, BLK); bx(g, .014, .02, .02, 0, .045, -.53, BLK); bx(g, .01, .03, .016, -.016, .07, .07, BLK); bx(g, .01, .03, .016, .016, .07, .07, BLK); bx(g, .05, .012, .03, 0, .06, .07, BLK);
    bx(g, .056, .05, .2, 0, -.005, -.3, WOODC); bx(g, .05, .018, .16, 0, .04, -.3, WOODC); bx(g, .045, .09, .22, 0, -.02, .24, WOODC, -.08, 0, 0);
    bx(g, .04, .1, .05, 0, -.085, .09, WOODC, -.35, 0, 0); o.mag = bx(g, .036, .17, .06, 0, -.13, -.07, GUN2, .28, 0, 0); o.bolt = bx(g, .012, .02, .05, .03, .015, -.04, BLK); o.boltBase = -.04;
    o.muzzle.set(0, .02, -.58); o.anchor.set(-.03, -.005, -.06);
    arm(g, .0, -.085, .1, 1, .55); arm(g, 0, -.055, -.3, -1, .6);
  } else if (id === "m4a4") {
    bx(g, .05, .075, .3, 0, 0, 0, 0x34373d); bx(g, .045, .02, .5, 0, .055, -.05, 0x2b2d31); cy(g, .027, .3, 0, .005, -.33, 0x25272b); cy(g, .008, .12, 0, .01, -.57, BLK); bx(g, .008, .04, .008, 0, .065, -.52, BLK); bx(g, .014, .02, .02, 0, .056, -.52, BLK);
    bx(g, .05, .075, .17, 0, -.01, .24, 0x2f3238, -.05, 0, 0); bx(g, .04, .1, .05, 0, -.085, .07, 0x2f3238, -.35, 0, 0); o.mag = bx(g, .034, .16, .055, 0, -.12, -.05, 0x22242a, .1, 0, 0);
    o.bolt = bx(g, .012, .02, .05, .03, .02, .0, BLK); o.boltBase = 0; bx(g, .01, .03, .016, -.013, .077, .02, BLK); bx(g, .01, .03, .016, .013, .077, .02, BLK);
    o.muzzle.set(0, .01, -.62); o.anchor.set(-.03, -.005, -.04);
    arm(g, 0, -.085, .07, 1, .55); arm(g, 0, -.04, -.3, -1, .6);
  } else if (id === "pistol" || id === "silenced") {
    const s = id === "silenced"; o.bolt = bx(g, .03, .036, .2, 0, .02, -.04, 0x3b3f46); bx(g, .028, .03, .17, 0, -.012, -.03, GUN); bx(g, .028, .09, .045, 0, -.06, .05, 0x23252a, -.18, 0, 0);
    bx(g, .007, .016, .007, 0, .047, -.13, BLK); bx(g, .007, .016, .012, -.009, .047, .05, BLK); bx(g, .007, .016, .012, .009, .047, .05, BLK); bx(g, .006, .02, .03, 0, -.03, -.01, GUN2);
    o.mag = bx(g, .022, .02, .03, 0, -.108, .06, GUN2); o.boltBase = -.04;
    if (s) { cy(g, .017, .17, 0, .02, -.22, 0x1d1f23); cy(g, .019, .012, 0, .02, -.305, BLK); o.muzzle.set(0, .02, -.31); } else o.muzzle.set(0, .022, -.14);
    o.anchor.set(-.02, -.05, .05);
    arm(g, 0, -.06, .06, 1, .5); const l = arm(g, -.035, -.075, .0, -1, .45); l.rotation.y = -.25;
  } else if (id === "knife") {
    bx(g, .026, .03, .11, 0, 0, .0, 0x1c1d21); bx(g, .06, .012, .016, 0, .0, -.06, 0x3b3f46); bx(g, .006, .036, .17, 0, .006, -.15, 0xcfd5dc); bx(g, .006, .014, .1, 0, -.008, -.17, 0xcfd5dc, 0, 0, 0);
    bx(g, .004, .012, .04, 0, .026, -.22, 0xe9eef3); o.anchor.set(0, -.01, .055); arm(g, 0, -.0, .02, 1, .55);
    g.userData.rest = [0, 0, 0];
  } else {                                                         // bate
    cy(g, .018, .26, 0, 0, .0, 0x1c1d21); cy(g, .027, .2, 0, 0, -.2, 0xb07a3a); cy(g, .036, .2, 0, 0, -.38, 0xb07a3a); cy(g, .04, .08, 0, 0, -.52, 0xa06c30); bx(g, .04, .04, .01, 0, 0, -.57, 0x7a4f22);
    o.anchor.set(0, -.018, .12); arm(g, 0, 0, .03, 1, .55); arm(g, 0, 0, -.1, -1, .5);
  }
  return o;
}

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

/* ---- Vista en primera persona: escena propia, dibujada encima del mundo ---- */
const flashTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 2, 32, 32, 30); g.addColorStop(0, "#fff"); g.addColorStop(.3, "#ffd27a"); g.addColorStop(1, "rgba(255,120,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  x.fillStyle = "#fff6c8"; for (let i = 0; i < 6; i++) { x.save(); x.translate(32, 32); x.rotate(i * Math.PI / 3); x.fillRect(-2, 0, 4, 31); x.restore(); } return new THREE.CanvasTexture(c); })();
const smooth = x => x * x * (3 - 2 * x), easeOut = x => 1 - (1 - x) * (1 - x);
class ViewModel {
  constructor() {
    this.scene = new THREE.Scene(); this.cam = new THREE.PerspectiveCamera(58, 1, .01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x5a5560, 2.1)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(.6, 1, .8); this.scene.add(d);
    this.fl = new THREE.PointLight(0xffb060, 0, 2.5, 2); this.scene.add(this.fl);
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.flash.visible = false; this.scene.add(this.flash);
    this.kc = new Keychain(this.scene); this.models = {}; this.w = null; this.id = null; this.def = null;
    this.t = 0; this.bobT = 0; this.kick = 0; this.kickRot = 0; this.sx = 0; this.sy = 0; this.reloadT = -1; this.reloadDur = 1; this.equipT = 0; this.swingT = -1; this.swingDur = .3; this.swingType = 0; this.flashT = 0; this.sil = false; this.swingN = 0;
  }
  resize(w, h) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  setWeapon(id, charm) {
    if (this.w) this.scene.remove(this.w.g); this.id = id; this.def = WEAPONS[id]; this.w = this.models[id] || (this.models[id] = buildWeapon(id)); this.scene.add(this.w.g); this.kc.set(charm);
    this.equipT = 1; this.reloadT = -1; this.swingT = -1; this.w.g.visible = true; this.sil = id === "silenced";
  }
  fire() { const d = this.def; this.kick = Math.min(.05, this.kick + .02 * d.kick); this.kickRot = Math.min(.09, this.kickRot + .02 * d.kick); this.flashT = this.sil ? .02 : .05; this.fl.intensity = this.sil ? 0 : 3.2; this.flashRot = Math.random() * 6.28; this.flashS = rnd(.12, .2); if (this.w.bolt) this.w.boltK = 1; }
  reload(dur) { this.reloadT = 0; this.reloadDur = dur; }
  swing(dur, type) { this.swingT = 0; this.swingDur = dur; this.swingType = type; }
  update(dt, st) {
    const W = this.w; if (!W) return; const def = this.def, g = W.g, gun = def.kind === "gun"; this.t += dt;
    const ads = gun ? st.ads : 0, sp = st.sprint, spd = st.speed;
    this.sx = damp(this.sx, clamp(-st.dx * .0011, -.06, .06), 11, dt); this.sy = damp(this.sy, clamp(st.dy * .0011, -.05, .05), 11, dt);
    this.bobT += dt * spd * (sp > .5 ? 11 : 7.5);
    const bobA = spd * (1 - ads * .85) * (sp > .5 ? 1.8 : 1), bx0 = Math.sin(this.bobT) * .007 * bobA, by0 = Math.abs(Math.cos(this.bobT)) * -.008 * bobA, br = Math.sin(this.t * 1.4) * .0014 * (1 - ads * .8);
    let px = lerp(def.pos[0], gun ? def.ads[0] : 0, ads), py = lerp(def.pos[1], gun ? def.ads[1] : 0, ads), pz = lerp(def.pos[2], gun ? def.ads[2] : 0, ads);
    let rx = 0, ry = 0, rz = 0;
    px += bx0 + this.sx; py += by0 + br + this.sy * .6; rx += this.sy * .5; ry += this.sx * 1.2;
    px += sp * (gun ? .06 : .04); py -= sp * .08; pz += sp * .0; ry += sp * (gun ? .75 : .3); rx += sp * (gun ? .18 : -.2); rz -= sp * .15;
    this.kick = damp(this.kick, 0, 16, dt); this.kickRot = damp(this.kickRot, 0, 14, dt); pz += this.kick; rx += this.kickRot * (1 - ads * .35); py += this.kick * .3;
    if (st.crouch) py += .004;
    if (this.equipT > 0) { this.equipT = Math.max(0, this.equipT - dt / .4); const e = this.equipT * this.equipT; py -= e * .3; rx -= e * .9; rz += e * .3; }
    let magOff = 0, magVis = true;
    if (this.reloadT >= 0) {                                       // recarga: baja el arma, saca el cargador, lo mete y tira del cerrojo
      this.reloadT += dt; const r = Math.min(1, this.reloadT / this.reloadDur), d = r < .18 ? smooth(r / .18) : r < .82 ? 1 : smooth((1 - r) / .18);
      py -= d * .1; rx += d * .45; rz += d * .5; px -= d * .05;
      if (r < .25) magOff = 0; else if (r < .4) magOff = -(r - .25) / .15 * .3; else if (r < .6) { magOff = -.3; magVis = false; } else if (r < .72) magOff = -.3 * (1 - (r - .6) / .12); if (r >= .4 && r < .6) magVis = false;
      if (W.bolt && r > .82 && r < .95) W.boltK = Math.sin((r - .82) / .13 * Math.PI);
      if (r >= 1) this.reloadT = -1;
    }
    if (this.swingT >= 0) {
      this.swingT += dt / this.swingDur; const s = Math.min(1, this.swingT);
      if (this.id === "knife" && this.swingType === 0) {            // estocada
        const a = s < .3 ? -s / .3 * .3 : s < .5 ? -.3 + (s - .3) / .2 * 1.3 : 1 - (s - .5) / .5; pz -= a * .32; rx += a * .15; py += a * .03;
      } else {
        const a = s < .25 ? -s / .25 : s < .6 ? -1 + 2 * easeOut((s - .25) / .35) : 1 - (s - .6) / .4, bat = this.id === "bat", k = bat ? 1.25 : .8;
        rz += a * k * (this.swingType ? -1 : 1); ry += a * .55 * (bat ? 1 : .6); rx += (bat ? -a * .45 : -a * .2); px -= a * (bat ? .22 : .14); pz -= Math.max(0, a) * .15; py += (bat ? Math.abs(a) * .03 : 0);
      }
      if (this.swingT >= 1) this.swingT = -1;
    }
    if (!gun) { rz += .25; rx += .25; if (this.id === "bat") { rx += .55; ry += .1; px += .02; } else { rx += .1; ry += .35; } }
    g.position.set(px, py, pz); g.rotation.set(rx, ry, rz);
    if (W.mag) { W.mag.visible = magVis; W.mag.position.y = (W.magBase || (W.magBase = W.mag.position.y)) + magOff * 0 + (magOff ? magOff : 0); if (!W.magY0) W.magY0 = W.mag.position.y - magOff; W.mag.position.y = W.magY0 + magOff; }
    if (W.bolt) { W.boltK = Math.max(0, (W.boltK || 0) - dt * 14); if (!W.boltZ0) W.boltZ0 = W.bolt.position.z; W.bolt.position.z = W.boltZ0 + W.boltK * (this.id === "pistol" || this.id === "silenced" ? .045 : .04); }
    g.updateMatrixWorld(true);
    /* fogonazo */
    if (this.flashT > 0) { this.flashT -= dt; const m = new V3().copy(W.muzzle); g.localToWorld(m); this.flash.position.copy(m); this.flash.rotation.set(0, 0, this.flashRot); this.flash.scale.setScalar(this.flashS * (this.sil ? .3 : 1)); this.flash.visible = !this.sil || this.flashT > 0; this.fl.position.copy(m); }
    else { this.flash.visible = false; this.fl.intensity = 0; }
    /* llavero: ancla en el arma; la gravedad real = inversa de la cámara del mundo */
    if (this.kc.has) { const a = new V3().copy(W.anchor); g.localToWorld(a); const gv = new V3(0, -1, 0).applyQuaternion(st.camQuat.clone().invert()); this.kc.step(dt, a, gv); }
  }
}

/* ======================= Partículas y trazadoras (agrupadas, sin crear objetos nuevos) ======================= */
class Particles {
  constructor(scene, cap = 500) {
    this.cap = cap; this.n = 0; this.m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), cap); this.m.frustumCulled = false; this.m.count = 0;
    this.m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); scene.add(this.m);
    this.P = Array.from({ length: cap }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s: .05, g: 12, c: new THREE.Color() })); this.d = new THREE.Object3D(); this.col = new THREE.Color();
  }
  emit(x, y, z, vx, vy, vz, life, s, color, g = 12) { if (this.n >= this.cap) return; const p = this.P[this.n++]; p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.s = s; p.g = g; p.c.set(color); }
  burst(x, y, z, n, color, sp, s, life, up = 1, g = 12) { for (let i = 0; i < n; i++) this.emit(x, y, z, rnd(-sp, sp), rnd(-sp * .3, sp) * up, rnd(-sp, sp), life * rnd(.6, 1.2), s * rnd(.6, 1.3), color, g); }
  update(dt) {
    for (let i = this.n - 1; i >= 0; i--) {
      const p = this.P[i]; p.life -= dt; if (p.life <= 0) { const l = this.P[--this.n]; this.P[i] = l; this.P[this.n] = p; continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < p.s * .5) { p.y = p.s * .5; p.vx *= .5; p.vz *= .5; p.vy = Math.abs(p.vy) * .15; }
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

/* ======================= Zombis: muchos, lentos, con IA de flujo y cerco ======================= */
const ZMAX = 150, ZGW = 70, ZGH = 52, ZCELL = 1.2;
class Zombies {
  constructor(scene, world) {
    this.world = world; this.list = []; this.heads = new Int32Array(ZGW * ZGH); this.nxt = new Int32Array(ZMAX + 4);
    const mk = (sx, sy, sz, py = 0, pz = 0, mat) => { const g = new THREE.BoxGeometry(sx, sy, sz); g.translate(0, py, pz); const m = new THREE.InstancedMesh(g, mat || new THREE.MeshLambertMaterial({ color: 0xffffff }), ZMAX); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ZMAX * 3), 3); m.frustumCulled = false; m.count = 0; scene.add(m); return m; };
    this.legL = mk(.2, .8, .22, -.4); this.legR = mk(.2, .8, .22, -.4); this.torso = mk(.5, .65, .27); this.head = mk(.28, .3, .28);
    this.armL = mk(.14, .14, .6, 0, .3); this.armR = mk(.14, .14, .6, 0, .3);
    this.eyes = mk(.2, .045, .02, 0, 0, new THREE.MeshBasicMaterial({ color: 0xff2a1a })); this.eyes.instanceColor = null;
    const sg = new THREE.CircleGeometry(.55, 12); sg.rotateX(-Math.PI / 2); this.shadow = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .45, depthWrite: false }), ZMAX); this.shadow.frustumCulled = false; this.shadow.count = 0; scene.add(this.shadow);
    this.meshes = [this.legL, this.legR, this.torso, this.head, this.armL, this.armR];
    this.A = new THREE.Matrix4(); this.B = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new V3(); this.s1 = new V3(1, 1, 1); this.c = new THREE.Color(); this.tmp = { x: 0, z: 0 };
  }
  get alive() { let n = 0; for (const z of this.list) if (z.st === 1) n++; return n; }
  spawn(x, z, round, brute) {
    if (this.list.length >= ZMAX) return null;
    const sc = brute ? 1.3 : rnd(.94, 1.08), hp = (50 + 6 * round) * (brute ? 4 : 1) * (.9 + Math.random() * .2), sp = (brute ? .8 : rnd(.9, 1.4)) * (1 + .015 * round);
    const shirts = [0x6b3a3a, 0x3a4f6b, 0x4a5a3a, 0x6a6a3a, 0x555555, 0x7a4a2a, 0x3a3a55], pants = [0x2a2f3a, 0x3a3a3a, 0x2b3a2b, 0x40352a];
    const z0 = { x, z, vx: 0, vz: 0, kx: 0, kz: 0, yaw: Math.random() * 6.28, hp, mhp: hp, sp, brute, sc, st: 1, ph: Math.random() * 6, atk: 0, cd: rnd(0, .5), die: 0, fl: 0, ang: Math.random() * 6.28, gt: rnd(1, 6), los: false, losT: Math.random() * .3,
      cs: new THREE.Color(shirts[(Math.random() * shirts.length) | 0]), cp: new THREE.Color(pants[(Math.random() * pants.length) | 0]), ck: new THREE.Color().setHSL(rnd(.22, .33), rnd(.25, .45), rnd(.32, .45)), r: .36 * sc, rise: 0 };
    if (brute) z0.cs.multiplyScalar(.6); this.list.push(z0); return z0;
  }
  clear() { this.list.length = 0; }
  update(dt, P, ctx) {
    const W = this.world, L = this.list, px = P.x, pz = P.z;
    for (let i = L.length - 1; i >= 0; i--) {
      const z = L[i]; z.ph += dt * z.sp * 3.4; z.fl = Math.max(0, z.fl - dt * 5);
      if (z.st === 2) { z.die += dt; z.x += z.kx * dt; z.z += z.kz * dt; z.kx *= .92; z.kz *= .92; if (z.die > 2.4) { L[i] = L[L.length - 1]; L.pop(); } continue; }
      z.rise = Math.min(1, z.rise + dt * 2);
      const dx = px - z.x, dz = pz - z.z, d = Math.hypot(dx, dz) || 1e-6;
      z.losT -= dt; if (z.losT <= 0) { z.losT = .3 + Math.random() * .25; z.los = d < 12 && W.rayWall(z.x, 1.2, z.z, dx / d, 0, dz / d, d) >= d - .01; }
      let tx, tz;
      if (z.los || d < 2.2) { const rr = 1.05; tx = px + Math.cos(z.ang) * Math.min(rr, d * .5); tz = pz + Math.sin(z.ang) * Math.min(rr, d * .5); if (d < 2.4) { tx = px; tz = pz; } }
      else if (W.next(z.x, z.z, this.tmp)) { tx = this.tmp.x; tz = this.tmp.z; } else { tx = px; tz = pz; }
      let ux = tx - z.x, uz = tz - z.z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      const reach = .42 + z.r + .35, spd = z.sp * (z.atk > 0 ? .15 : 1) * z.rise;
      z.vx = damp(z.vx, d < reach * .8 ? 0 : ux * spd, 5, dt); z.vz = damp(z.vz, d < reach * .8 ? 0 : uz * spd, 5, dt);
      z.x += (z.vx + z.kx) * dt; z.z += (z.vz + z.kz) * dt; z.kx = damp(z.kx, 0, 6, dt); z.kz = damp(z.kz, 0, 6, dt);
      let ty = Math.atan2(d < 4 ? dx : ux, d < 4 ? dz : uz), dy = ty - z.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); z.yaw += dy * Math.min(1, dt * 6);
      z.cd -= dt;
      if (z.atk > 0) { z.atk -= dt; if (z.atk <= 0) { if (d < reach + .3) ctx.hurt((z.brute ? 26 : Math.min(22, 9 + ctx.round * .7)), z.x, z.z); z.cd = z.brute ? 1.3 : 1; } }
      else if (d < reach && z.cd <= 0) { z.atk = z.brute ? .8 : .65; ctx.sound("atk", z); }
      z.gt -= dt; if (z.gt <= 0) { z.gt = rnd(3, 8); if (d < 28) ctx.sound("groan", z); }
    }
    this.heads.fill(-1);
    for (let i = 0; i < L.length; i++) { const z = L[i], gx = clamp(Math.floor((z.x + WX) / ZCELL), 0, ZGW - 1), gz = clamp(Math.floor((z.z + WZ) / ZCELL), 0, ZGH - 1), k = gz * ZGW + gx; this.nxt[i] = this.heads[k]; this.heads[k] = i; }
    /* separación entre zombis (no se apilan: forman muchedumbre) + paredes */
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (a.st !== 1) continue; const gx = clamp(Math.floor((a.x + WX) / ZCELL), 0, ZGW - 1), gz = clamp(Math.floor((a.z + WZ) / ZCELL), 0, ZGH - 1);
      for (let cx = Math.max(0, gx - 1); cx <= Math.min(ZGW - 1, gx + 1); cx++) for (let cz = Math.max(0, gz - 1); cz <= Math.min(ZGH - 1, gz + 1); cz++) for (let j = this.heads[cz * ZGW + cx]; j >= 0; j = this.nxt[j]) {
        if (j <= i) continue; const b = L[j]; if (b.st !== 1) continue; const dx = b.x - a.x, dz = b.z - a.z, m = (a.r + b.r) * .95, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-8) { const d = Math.sqrt(d2), k = (m - d) / d * .5; a.x -= dx * k; a.z -= dz * k; b.x += dx * k; b.z += dz * k; }
      }
      W.resolve(a, a.r);
    }
    this.draw(P);
  }
  draw(P) {
    const L = this.list, n = L.length, A = this.A, B = this.B, q = this.q, e = this.e, v = this.v; let count = 0;
    for (let i = 0; i < n; i++) {
      const z = L[i], sc = z.sc, dying = z.st === 2; let k = 0, sink = 0, s = sc * (dying && z.die > 1.7 ? Math.max(0, 1 - (z.die - 1.7) / .7) : 1);
      if (dying) { k = smooth(Math.min(1, z.die / .55)); sink = z.die > 1 ? (z.die - 1) * .12 : 0; }
      q.setFromEuler(e.set(-k * 1.5, z.yaw, 0, "YXZ")); const yRise = (1 - (z.rise ?? 1)) * -1.2;
      A.compose(v.set(z.x, yRise - sink, z.z), q, this.s1.set(s, s, s));
      const w = Math.sin(z.ph), wa = dying ? 0 : 1, atk = z.atk > 0 ? 1 - z.atk / (z.brute ? .8 : .65) : -1, lean = .1 + (atk >= 0 ? atk * .25 : 0);
      const put = (mesh, x, y, z2, rx, rz, col, fl) => {
        e.set(rx, 0, rz, "XYZ"); q.setFromEuler(e); B.compose(v.set(x, y, z2), q, this.s1.set(1, 1, 1)); B.premultiply(A); mesh.setMatrixAt(count, B);
        if (col) { this.c.copy(col); if (fl) this.c.lerp(WHITE, fl); mesh.setColorAt(count, this.c); }
      };
      const f = z.fl * .8;
      put(this.legL, -.13, .8, 0, w * .55 * wa, 0, z.cp, 0); put(this.legR, .13, .8, 0, -w * .55 * wa, 0, z.cp, 0);
      put(this.torso, 0, 1.125, 0, lean + (dying ? 0 : Math.sin(z.ph * .5) * .03), Math.sin(z.ph) * .06 * wa, z.cs, f);
      put(this.head, 0, 1.62, .04 + lean * .2, lean * .8 + Math.sin(z.ph * .7) * .08 * wa, Math.sin(z.ph * .5) * .1 * wa, z.ck, f);
      const raise = atk >= 0 ? (atk < .6 ? -1.3 - atk * .3 : 1.0 - (atk - .6) / .4 * 1.6 + .2) : -1.35, sw = Math.sin(z.ph * .8) * .12;
      put(this.armL, -.34, 1.34, .05, (dying ? -.5 : raise) + sw, -.1, z.ck, f); put(this.armR, .34, 1.34, .05, (dying ? -.4 : raise) - sw, .1, z.ck, f);
      put(this.eyes, 0, 1.64, .19 + lean * .1, lean * .8, 0, null, 0);
      this.shadow.setMatrixAt(count, B.compose(v.set(z.x, .02, z.z), q.identity(), this.s1.set(s * (dying ? .8 : 1), 1, s * (dying ? .8 : 1))));
      count++;
    }
    for (const m of this.meshes) { m.count = count; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    this.eyes.count = count; this.eyes.instanceMatrix.needsUpdate = true; this.shadow.count = count; this.shadow.instanceMatrix.needsUpdate = true;
  }
  /* rayo del disparo: cabeza (esfera) y cuerpo (cilindro vertical). Devuelve el más cercano. */
  ray(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (const z of this.list) {
      if (z.st !== 1) continue; const sc = z.sc, rx = ox - z.x, rz = oz - z.z; if (rx * rx + rz * rz > (maxT + 2) * (maxT + 2)) continue;
      let th = Infinity, tc = Infinity;
      const hy = 1.63 * sc, hr = .22 * sc, ry = oy - hy, b = rx * dx + ry * dy + rz * dz, c = rx * rx + ry * ry + rz * rz - hr * hr, disc = b * b - c; if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0) th = t; }
      const a = dx * dx + dz * dz; if (a > 1e-8) { const R = .34 * sc, bb = rx * dx + rz * dz, cc = rx * rx + rz * rz - R * R, ds = bb * bb - a * cc; if (ds >= 0) { const t = (-bb - Math.sqrt(ds)) / a, yy = oy + dy * t; if (t > 0 && yy >= 0 && yy <= 1.5 * sc) tc = t; } }
      const t = Math.min(th, tc); if (t < bt) { bt = t; best = { z, t, head: th <= tc + .03 }; }
    }
    return best;
  }
  hit(z, dmg, kx, kz) { z.hp -= dmg; z.fl = 1; z.kx += kx; z.kz += kz; if (z.hp <= 0 && z.st === 1) { z.st = 2; z.die = 0; z.atk = 0; return true; } return false; }
}
const WHITE = new THREE.Color(1, 1, 1);

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
const CTRL_HELP = "WASD mover · Shift esprintar · C agacharse · Clic izq. disparar · Clic der. apuntar con la mira · R recargar · V golpe rápido · 1/2/3 o rueda cambiar arma · M sonido · Esc pausa";

/* ======================= Partida ======================= */
class Game {
  constructor() {
    this.lo = this.loadLoadout(); this.charms = [...CHARMS]; this.editSlot = 0; this.playing = false; this.paused = false; this.over = false; this.locked = false; this.dead = false; this.raf = 0; this.last = performance.now(); this.ema = 16; this.perfT = 0;
    if (!document.getElementById("z3d-css")) { const s = document.createElement("style"); s.id = "z3d-css"; s.textContent = CSS; document.head.appendChild(s); }
    const root = this.root = document.createElement("div"); root.id = "z3d"; document.body.appendChild(root);
    this.pr = Math.min(window.devicePixelRatio || 1, 1.5); this.maxPr = this.pr;
    this.R = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); this.R.setPixelRatio(this.pr); this.R.autoClear = false; this.R.domElement.className = "zmain"; root.appendChild(this.R.domElement);
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0a0f1d); this.scene.fog = new THREE.Fog(0x0a0f1d, 9, 58);
    this.scene.add(new THREE.HemisphereLight(0x7a8cc0, 0x2a2c34, 1.5)); const moon = new THREE.DirectionalLight(0x9fb2e6, .9); moon.position.set(-20, 40, 15); this.scene.add(moon);
    this.map = buildMap(this.scene); this.world = new World(this.map); this.Z = new Zombies(this.scene, this.world); this.parts = new Particles(this.scene); this.tr = new Tracers(this.scene);
    this.cam = new THREE.PerspectiveCamera(74, 1, .05, 120); this.cam.rotation.order = "YXZ"; this.vm = new ViewModel();
    this.buildUI(); this.onResize = () => this.resize(); window.addEventListener("resize", this.onResize); this.resize(); this.bindInput();
    this.P = { x: 0, z: 0, vx: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0, eye: 1.65, hp: 100, st: 100, stLock: false, stDelay: 0, ads: 0, sprint: 0, crouch: 0, speed: 0 };
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
      if (!this.playing) return; const c = e.code; if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "KeyC", "Digit1", "Digit2", "Digit3", "KeyR", "KeyV", "KeyM"].includes(c)) e.preventDefault();
      this.keys[c] = true; if (e.repeat || this.paused || this.over) { if (c === "KeyM" && !e.repeat) Snd.toggle(); return; }
      if (c === "Digit1") this.select(0); else if (c === "Digit2") this.select(1); else if (c === "Digit3") this.select(2); else if (c === "KeyR") this.reload(); else if (c === "KeyV") this.quickMelee(); else if (c === "KeyM") Snd.toggle();
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
    const P = this.P, m = this.map.start; Object.assign(P, { x: m.x, z: m.z, vx: 0, vz: 0, yaw: m.yaw, pitch: 0, eye: 1.65, hp: 100, st: 100, stLock: false, stDelay: 0, ads: 0, sprint: 0, crouch: 0, speed: 0 });
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
    if (killed) { s.kills++; s.score += 60 + (head ? 100 : 0); if (head) s.hs++; Snd.play("kill"); Snd.play("zdie", pan.p, pan.v); this.parts.burst(z.x, 1.1, z.z, 14, 0x7a1515, 3, .07, 1, 1.2, 10); }
    else Snd.play("zhit", pan.p, pan.v);
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
    if (a.mag <= 0) this.reload();
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
    const sens = .0022 * (gun ? lerp(1, .55, P.ads) : 1); let dx = this.mdx, dy = this.mdy; this.mdx = this.mdy = 0; if (this.mouseGrace > 0) { this.mouseGrace -= dt; dx = dy = 0; } if (dying) dx = dy = 0;
    P.yaw -= dx * sens; P.pitch = clamp(P.pitch - dy * sens, -1.45, 1.45);
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
    const wantAds = gun && this.adsHeld && this.rlT < 0 && !sprinting && !dying; P.ads = damp(P.ads, wantAds ? 1 : 0, 14, dt);
    if (this.rlT >= 0) { this.rlT += dt; const r = this.rlT / this.rlDur; if (this.rlCue < 1 && r > .25) { this.rlCue = 1; Snd.play("magout"); } if (this.rlCue < 2 && r > .6) { this.rlCue = 2; Snd.play("magin"); } if (this.rlCue < 3 && r > .84 && this.def.id !== "pistol" && this.def.id !== "silenced") { this.rlCue = 3; Snd.play("bolt"); }
      if (r >= 1) { const need = def.mag - a.mag, take = Math.min(need, a.res); a.mag += take; a.res -= take; this.rlT = -1; } }
    if (!dying) {
      if (gun) {
        const trig = def.auto ? this.fireHeld : this.click;
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
    const cam = this.cam, tf = lerp(74, gun ? def.fov : 74, P.ads) + P.sprint * 5 + this.punch * 1.1; if (Math.abs(cam.fov - tf) > .02) { cam.fov = damp(cam.fov, tf, 20, dt); cam.updateProjectionMatrix(); }
    const bob = Math.sin(this.vm.bobT) * .012 * P.speed * (1 - P.ads * .8), sh = this.shake * .02; cam.position.set(P.x, P.eye + Math.abs(bob) * .6, P.z);
    cam.rotation.set(P.pitch + (Math.random() - .5) * sh, P.yaw + (Math.random() - .5) * sh, bob * .5 + (dying ? .6 : 0)); cam.updateMatrixWorld();
    this.vm.update(dt, { ads: P.ads, sprint: P.sprint, speed: sp > .3 ? P.speed : 0, crouch: P.crouch > .5, dx, dy, camQuat: cam.quaternion });
    this.parts.update(dt); this.tr.update(dt); this.updateHUD(dt);
  }
  updateHUD(dt) {
    const H = this.hud, c = H.c, P = this.P, S = this.state, d = this.def, set = (k, el, v) => { if (c[k] !== v) { c[k] = v; el.textContent = v; } };
    set("hp", H.hp, Math.ceil(Math.max(0, P.hp))); H.hpb.style.width = Math.max(0, P.hp) + "%"; H.stb.style.width = P.st + "%"; H.stb.style.opacity = P.stLock ? .45 : 1;
    set("rd", H.rd, "RONDA " + S.round); set("zl", H.zl, "Zombis: " + (this.toSpawn + this.Z.alive)); set("sc", H.sc, S.score); set("wn", H.wn, d.name);
    set("am", H.am, d.kind === "gun" ? this.ammo[this.wid].mag + " / " + this.ammo[this.wid].res : "—");
    H.hm.style.opacity = this.hmT > 0 ? 1 : 0; this.hmT -= dt; H.cx.classList.toggle("ads", P.ads > .5 && d.kind === "gun"); H.cx.style.opacity = d.kind === "gun" ? 1 - P.ads * .6 : .6;
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
