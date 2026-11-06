/* coral.js — CORAL STACK: tetris submarino (estilo TETR.IO) para HOOD STUDIO.
 *   createCoral(ctx) -> { start(), stop() }       createEngine() -> motor puro (se puede probar sin navegador)
 * ctx: { $, me, db, doc, getDoc, updateDoc, increment, faceSet(k), saveScore(score, game), xpNeed(L), refresh(), note(msg), live() , game } */

import { ANIMS } from "./avatar.js";

/* ================= MOTOR ================= */
export const COLS = 10, ROWS = 20, HID = 2, H = ROWS + HID;
export const TYPES = "IJLOSTZ";
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], J: [[1,0,0],[1,1,1],[0,0,0]], L: [[0,0,1],[1,1,1],[0,0,0]],
  O: [[1,1],[1,1]], S: [[0,1,1],[1,1,0],[0,0,0]], T: [[0,1,0],[1,1,1],[0,0,0]], Z: [[1,1,0],[0,1,1],[0,0,0]]
};
const rotCW = m => m[0].map((_, x) => m.map(r => r[x]).reverse());
const KJ = { "01": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "10": [[0,0],[1,0],[1,-1],[0,2],[1,2]], "12": [[0,0],[1,0],[1,-1],[0,2],[1,2]], "21": [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  "23": [[0,0],[1,0],[1,1],[0,-2],[1,-2]], "32": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], "30": [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]], "03": [[0,0],[1,0],[1,1],[0,-2],[1,-2]] };
const KI = { "01": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], "10": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], "12": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]], "21": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  "23": [[0,0],[2,0],[-1,0],[2,1],[-1,-2]], "32": [[0,0],[-2,0],[1,0],[-2,-1],[1,2]], "30": [[0,0],[1,0],[-2,0],[1,-2],[-2,1]], "03": [[0,0],[-1,0],[2,0],[-1,2],[2,-1]] };
const newBag = rng => { const b = [...TYPES]; for (let i = 6; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
export const gravity = lv => Math.pow(Math.max(.05, .8 - (lv - 1) * .007), lv - 1);          // segundos por fila (guía oficial): cada nivel va más rápido

export function createEngine(rng = Math.random) {
  const e = { board: Array.from({ length: H }, () => Array(COLS).fill(null)), cur: null, hold: null, canHold: true, queue: [], bag: [],
    score: 0, lines: 0, level: 1, combo: -1, b2b: false, over: false, events: [], gT: 0, lockT: 0, lockN: 0, lastRot: false, kick: 0, ghostY: 0, pieces: 0 };
  const fill = () => { while (e.queue.length < 7) { if (!e.bag.length) e.bag = newBag(rng); e.queue.push(e.bag.pop()); } };
  const hit = (m, x, y) => { for (let j = 0; j < m.length; j++) for (let i = 0; i < m.length; i++) if (m[j][i]) { const bx = x + i, by = y + j; if (bx < 0 || bx >= COLS || by >= H || (by >= 0 && e.board[by][bx])) return true; } return false; };
  const ground = () => hit(e.cur.m, e.cur.x, e.cur.y + 1);
  const ghost = () => { let y = e.cur.y; while (!hit(e.cur.m, e.cur.x, y + 1)) y++; e.ghostY = y; };
  const resetLock = () => { if (ground() && e.lockN < 15) { e.lockT = 0; e.lockN++; } };
  e.spawn = t => {
    fill(); const m = SHAPES[t || e.queue[0]].map(r => r.slice()), ty = t || e.queue.shift(); fill();
    e.cur = { t: ty, m, r: 0, x: Math.floor((COLS - m.length) / 2), y: 1 }; e.gT = e.lockT = e.lockN = 0; e.lastRot = false; e.pieces++;
    if (hit(m, e.cur.x, e.cur.y)) { e.over = true; e.events.push({ type: "over" }); } ghost();
  };
  e.move = dx => { if (e.over || hit(e.cur.m, e.cur.x + dx, e.cur.y)) return false; e.cur.x += dx; e.lastRot = false; resetLock(); ghost(); return true; };
  e.rotate = dir => {
    const p = e.cur; if (e.over || p.t === "O") return false;
    const n = dir === 2 ? 2 : dir === 1 ? 1 : 3; let m = p.m; for (let i = 0; i < n; i++) m = rotCW(m);
    const nr = (p.r + n) % 4, ks = dir === 2 ? [[0, 0]] : (p.t === "I" ? KI : KJ)[p.r + "" + nr];
    for (let k = 0; k < ks.length; k++) { const [kx, ky] = ks[k]; if (!hit(m, p.x + kx, p.y - ky)) { p.m = m; p.r = nr; p.x += kx; p.y -= ky; e.lastRot = true; e.kick = k; resetLock(); ghost(); e.events.push({ type: "rot" }); return true; } }
    return false;
  };
  e.step = soft => { if (hit(e.cur.m, e.cur.x, e.cur.y + 1)) return false; e.cur.y++; e.lastRot = false; if (soft) e.score += 1; return true; };
  e.hardDrop = () => { if (e.over) return; const d = e.ghostY - e.cur.y; const x0 = e.cur.x, m = e.cur.m, y0 = e.cur.y; e.cur.y = e.ghostY; e.score += 2 * d; e.events.push({ type: "drop", dist: d, x: x0, m, y0, y1: e.ghostY, t: e.cur.t }); e.lastRot = e.lastRot && d === 0; lock(); };
  e.holdPiece = () => { if (e.over || !e.canHold) return false; const t = e.cur.t; if (e.hold) { const h = e.hold; e.hold = t; e.spawn(h); } else { e.hold = t; e.spawn(); } e.canHold = false; e.events.push({ type: "hold" }); return true; };
  function lock() {
    const p = e.cur; let tspin = false, mini = false;
    if (p.t === "T" && e.lastRot) {
      const occ = (cx, cy) => { const bx = p.x + cx, by = p.y + cy; return bx < 0 || bx >= COLS || by >= H || (by >= 0 && e.board[by][bx]); };
      const c = [occ(0, 0), occ(2, 0), occ(0, 2), occ(2, 2)], n = c.filter(Boolean).length;
      if (n >= 3) { tspin = true; const f = [[0, 1], [1, 3], [2, 3], [0, 2]][p.r], fr = c[f[0]] + c[f[1]]; mini = fr < 2 && e.kick < 4; }
    }
    let allHidden = true;
    for (let j = 0; j < p.m.length; j++) for (let i = 0; i < p.m.length; i++) if (p.m[j][i]) { const by = p.y + j, bx = p.x + i; if (by >= HID) allHidden = false; if (by >= 0) e.board[by][bx] = p.t; }
    const rows = []; for (let y = 0; y < H; y++) if (e.board[y].every(Boolean)) rows.push(y);
    rows.forEach(y => { e.board.splice(y, 1); e.board.unshift(Array(COLS).fill(null)); });
    const n = rows.length, lvl = e.level, special = n === 4 || (tspin && n > 0); let pts = 0, b2bHit = false, perfect = false;
    if (n > 0) {
      pts = tspin ? (mini ? [100, 200, 400][n] || 400 : [400, 800, 1200, 1600][n]) : [0, 100, 300, 500, 800][n];
      if (special && e.b2b) { pts = Math.floor(pts * 1.5); b2bHit = true; }
      e.combo++; if (e.combo > 0) pts += 50 * e.combo; pts *= lvl;
      perfect = e.board.every(r => r.every(c => !c)); if (perfect) pts += [800, 1200, 1800, 2000][n - 1] * lvl;
      e.b2b = special;
    } else { e.combo = -1; if (tspin) pts = (mini ? 100 : 400) * lvl; }
    e.score += pts; const before = e.lines; e.lines += n; const nl = Math.min(20, 1 + Math.floor(e.lines / 10)), up = nl > e.level; e.level = nl;
    e.events.push({ type: "lock", n, tspin, mini, combo: e.combo, b2b: b2bHit, perfect, rows, pts, up, level: e.level, tens: Math.floor(e.lines / 10) - Math.floor(before / 10), t: p.t });
    e.canHold = true;
    if (allHidden) { e.over = true; e.events.push({ type: "over" }); return; }
    e.spawn();
  }
  e.tick = (dt, soft) => {
    if (e.over) return;
    const g = soft ? Math.max(.02, gravity(e.level) / 20) : gravity(e.level); e.gT += dt;
    while (e.gT >= g) { if (e.step(soft)) { e.gT -= g; e.lockT = 0; } else { e.gT = 0; break; } }
    if (ground()) { e.lockT += dt; if (e.lockT >= .5) lock(); } else e.lockT = 0;
  };
  e.spawn(); return e;
}

/* ================= JUEGO ================= */
const FONT = '"Minecraft Ten","Silkscreen",monospace';
const TEX = { I: "cian", J: "azul", L: "naranja", O: "amarillo", S: "rosa", T: "morado", Z: "rojo" };
const FALL = { I: "#31d7e8", J: "#2f55e0", L: "#e8872a", O: "#ecd93a", S: "#e0529c", T: "#a02ac0", Z: "#d12b3a" };
const COIN_MAX = 25, DAY = 864e5, XP_TABLE = [0, 5, 10, 20, 50], XP_SESSION_CAP = 400, XP_DAY_CAP = 1500;
const PAL = ["#ff8a00", "#ffd23f", "#ff4d6d", "#4cc9f0", "#7b2ff7", "#2ec4b6", "#ffffff", "#9ef01a", "#f72585", "#1b9aaa"];
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(lerp(v, b[i], t)));

export function createCoral(ctx) {
  const { $, me } = ctx, gc = $("#gamecard"), cv = $("#cc"), c = cv.getContext("2d");
  const VW = 1280, VH = 720, CELL = 32, BX = 480, BY = 40;
  const img = n => { const i = new Image(); i.src = "img/coral/" + n + ".png"; return i; };
  const TEXI = {}; Object.keys(TEX).forEach(k => TEXI[k] = img(TEX[k]));
  const SPR = { globo: img("globo"), chico: img("globo-chico"), nautilo: img("nautilo"), ajolote: img("ajolote"), ahogado: img("ahogado") };
  const ok = i => i && i.complete && i.naturalWidth > 0;
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---- sprites procedurales: peces tropicales (muchas combinaciones) y delfín ---- */
  const cvs = (w, h) => { const k = document.createElement("canvas"); k.width = w; k.height = h; return k; };
  function fishSprite() {
    const big = Math.random() < .5, w = big ? 15 : 11, h = big ? 11 : 7, k = cvs(w, h), x = k.getContext("2d");
    const base = pick(PAL); let acc = pick(PAL); while (acc === base) acc = pick(PAL);
    const cx = w * .56, cy = (h - 1) / 2, rx = (w - 4) / 2, ry = h / 2 - .4, pat = Math.floor(rnd(0, 6)), seed = Math.floor(rnd(0, 99));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i - cx) / rx, dy = (j - cy) / ry; let col = null;
      if (dx * dx + dy * dy <= 1) {
        col = base;
        if (pat === 0 && i % 4 < 2) col = acc; else if (pat === 1 && ((i * 7 + j * 13 + seed) % 5 === 0)) col = acc; else if (pat === 2 && j > cy) col = acc;
        else if (pat === 3 && (i + j) % 4 < 2) col = acc; else if (pat === 4 && i > cx + rx * .35) col = acc; else if (pat === 5 && j === Math.round(cy)) col = acc;
      } else if (i < 4 && Math.abs(j - cy) <= (4 - i) * (h / 8) + .4) col = pat === 3 ? base : acc;
      else if (big && i > cx - 3 && i < cx + 3 && j < cy - ry + .5 && j >= 0 && j < 2.2) col = acc;
      if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); }
    }
    x.fillStyle = "#fff"; x.fillRect(Math.round(cx + rx * .55), Math.round(cy - 1), 1, 1); x.fillStyle = "#111"; x.fillRect(Math.round(cx + rx * .7), Math.round(cy - 1), 1, 1);
    return k;
  }
  function dolphinSprite() {
    const w = 32, h = 14, k = cvs(w, h), x = k.getContext("2d"), cx = 15, cy = 6.5, rx = 12.5, ry = 4.2;
    const set = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (i - cx) / rx, dy = (j - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(i, j, j > cy + 1.2 ? "#cfe3f4" : j < cy - 1.5 ? "#456a8f" : "#5f86ab");
      else if (i >= 25 && i < 31 && j >= 5 && j <= 7) set(i, j, j === 7 ? "#cfe3f4" : "#5f86ab");
      else if (i < 5 && Math.abs(j - cy) <= (5 - i) * .9 + .3 && i + Math.abs(j - cy) > 2) set(i, j, "#456a8f");
      else if (i >= 12 && i <= 16 && j < cy - ry + 1 && j >= 1 && j > (i - 11) * -.5 + 3 - 2) set(i, j, "#3a5a7c");
    }
    for (let i = 13; i <= 16; i++) { set(i, 11, "#456a8f"); } set(14, 12, "#456a8f"); set(15, 12, "#456a8f"); set(23, 5, "#0b1a2a");
    return k;
  }
  const FISH = Array.from({ length: 18 }, fishSprite), DOLPHIN = dolphinSprite();

  /* ---- estado ---- */
  let E = null, raf = 0, last = 0, running = false, over = false, overT = 0, tcur = 0, started = false;
  let figs = null, avA = "idle", avT = 0, avUntil = 0, avOnce = false;
  let sc = 1, ox = 0, oy = 0, W = 0, Hh = 0, dpr = 1;
  let fx, mobs, snow, bubbles, rays, reef, shake, flashA, depthV, depthT;
  let xpS, xpDayLeft, coinS, cs = { win: 0, n: 0 }, barXP = 0, coinShow = 0, lvl0 = { L: 0, cur: 0, need: 100 }, xpBase = 0, scoreShow = 0, limitShown = false, saved = false;
  const keys = { l: false, r: false, d: false }; let dir = 0, das = 0, arr = 0, tHold = 0;

  /* ---- progreso: XP (límite por partida y por día) y monedas (límite diario) ---- */
  const uid = () => me() ? me().uid : "guest";
  const CKEY = () => "hood_coral_coins_" + uid(), XKEY = () => "hood_coral_xp_" + uid();
  const csFresh = () => { if (cs.win && Date.now() - cs.win >= DAY) cs = { win: 0, n: 0 }; return cs; };
  function lv(xp) { let L = 0, need = ctx.xpNeed(0); while (xp >= need && L < 999) { xp -= need; L++; need = ctx.xpNeed(L); } return { L, cur: xp, need }; }
  function loadProgress() {
    try { const j = JSON.parse(localStorage.getItem(CKEY()) || "null"); cs = j && typeof j.win === "number" ? { win: j.win, n: Number(j.n) || 0 } : { win: 0, n: 0 }; } catch (e) { cs = { win: 0, n: 0 }; }
    let xd = { win: 0, n: 0 }; try { const j = JSON.parse(localStorage.getItem(XKEY()) || "null"); if (j && typeof j.win === "number") xd = { win: j.win, n: Number(j.n) || 0 }; } catch (e) { /* sin almacenamiento */ }
    if (xd.win && Date.now() - xd.win >= DAY) xd = { win: 0, n: 0 }; xpDayLeft = XP_DAY_CAP - xd.n; ctx.xd = xd;
    const u = me(); xpBase = u ? (u.xp || 0) : 0; lvl0 = lv(xpBase); barXP = xpBase;
    if (u) ctx.getDoc(ctx.doc(ctx.db, "players", u.uid)).then(d => { if (!d.exists()) return; const r = d.data(), w = Number(r["coinWin_coral"]) || 0, n = Number(r["coinN_coral"]) || 0; if (w > cs.win || (w === cs.win && n > cs.n)) cs = { win: w, n }; }).catch(() => {});
  }
  const saveLocal = () => { try { localStorage.setItem(CKEY(), JSON.stringify(cs)); localStorage.setItem(XKEY(), JSON.stringify(ctx.xd)); } catch (e) { /* sin almacenamiento */ } };
  async function flush() {
    const xp = xpS.pend, cn = coinS.pend; xpS.pend = 0; coinS.pend = 0; const u = me(); if (!u || (!xp && !cn)) return;
    u.xp = (u.xp || 0) + xp; u.coins = (u.coins || 0) + cn;
    const data = { xp: ctx.increment(xp) }; if (cn) Object.assign(data, { coins: ctx.increment(cn), coinWin_coral: cs.win, coinN_coral: cs.n });
    try { await ctx.updateDoc(ctx.doc(ctx.db, "players", u.uid), data); ctx.refresh(); }
    catch (e) { u.xp -= xp; u.coins -= cn; console.warn("No se pudo guardar XP/monedas:", e); ctx.note("No se pudo guardar tu XP/monedas" + (e && e.code ? " (" + e.code + ")" : "") + "."); }
  }
  function gainXP(n, x, y) {
    n = Math.min(n, XP_SESSION_CAP - xpS.sess, xpDayLeft);
    if (n <= 0) { if (!limitShown) { limitShown = true; feed("XP LIMIT REACHED", "#9fb3c8"); } return 0; }
    xpS.sess += n; xpS.pend += n; xpDayLeft -= n; ctx.xd.n += n; if (!ctx.xd.win) ctx.xd.win = Date.now(); saveLocal();
    fx.fly.push({ x, y, tx: 40 + 150, ty: 88, t: 0, k: "xp", v: n }); return n;
  }
  function takeCoin(x, y) {
    const q = csFresh(); if (q.n >= COIN_MAX) return false; if (!q.win) q.win = Date.now(); q.n++; coinS.sess++; coinS.pend++; saveLocal();
    fx.fly.push({ x, y, tx: 66, ty: 55, t: 0, k: "coin", v: 1 }); return true;
  }

  /* ---- efectos ---- */
  const PC = t => FALL[t];
  function feed(txt, col, big) { fx.feed.push({ txt, col, t: 0, big: !!big }); if (fx.feed.length > 6) fx.feed.shift(); }
  function react(a, dur, once) { avA = a; avT = 0; avUntil = performance.now() + dur * 1000; avOnce = !!once; }
  function burst(x, y, cols, n, sp = 260) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(sp * .3, sp); fx.p.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, l: rnd(.4, .9), t: 0, s: rnd(3, 7), c: pick(cols) }); } }
  const cellXY = (cx, cy) => [BX + cx * CELL, BY + (cy - HID) * CELL];
  function onEvent(ev) {
    if (ev.type === "drop") {
      shake = Math.max(shake, Math.min(10, 2 + ev.dist * .35)); fx.trail.push({ x: ev.x, m: ev.m, y0: ev.y0, y1: ev.y1, t: ev.t, a: 1 });
      if (ev.dist > 0) { const [px, py] = cellXY(ev.x + 1.5, ev.y1 + 2); burst(px, py, ["#fff", FALL[ev.t]], 8, 140); }
    } else if (ev.type === "rot") { react("walk", .15); }
    else if (ev.type === "lock") {
      const [px, py] = cellXY(COLS / 2, ev.rows.length ? ev.rows[0] : 12);
      if (ev.n > 0) {
        ev.rows.forEach(r => { fx.rows.push({ y: r, t: 0 }); const [, ry] = cellXY(0, r); burst(BX + rnd(20, 300), ry + 16, ["#fff", "#ffe9a8", "#8be9ff", "#ff9ec8"], 10, 380); });
        const name = ev.tspin ? "T-SPIN " + (ev.mini ? "MINI " : "") + ["", "SINGLE", "DOUBLE", "TRIPLE"][ev.n] : ["", "SINGLE", "DOUBLE", "TRIPLE", "QUAD"][ev.n];
        const col = ev.n === 4 || ev.tspin ? "#ffd84a" : ev.n === 3 ? "#ff9e3d" : ev.n === 2 ? "#8be9ff" : "#ffffff";
        feed(name, col, true); fx.pop.push({ txt: name, col, t: 0, y: 330 });
        if (ev.b2b) feed("BACK-TO-BACK", "#ff7ad0");
        if (ev.combo >= 1) { feed("COMBO x" + ev.combo, "#7dffb0"); fx.pop.push({ txt: ev.combo + " COMBO", col: "#7dffb0", t: 0, y: 380 }); }
        if (ev.perfect) { feed("ALL CLEAR", "#ffffff", true); fx.pop.push({ txt: "ALL CLEAR", col: "#fff", t: 0, y: 250 }); flashA = 1; shake = 16; }
        if (ev.n === 4) { flashA = Math.max(flashA, .55); shake = Math.max(shake, 12); } else shake = Math.max(shake, 4 + ev.n * 2);
        const mult = ev.combo >= 4 ? 3 : ev.combo >= 1 ? 2 : 1, got = gainXP(XP_TABLE[ev.n] * mult, 40 + 100, 560);
        if (got) feed("+" + got + " XP" + (mult > 1 ? "  (x" + mult + ")" : ""), "#6ee7ff");
        let coins = ev.tens + (ev.perfect ? 1 : 0), cg = 0; while (coins-- > 0) if (takeCoin(100, 600 + cg * 6)) cg++;
        if (cg) feed("+" + cg + " COIN" + (cg > 1 ? "S" : ""), "#ffd84a");
        react(ev.n >= 4 || ev.tspin || ev.perfect ? "dance" : "jump", ev.n >= 4 || ev.tspin || ev.perfect ? 1.8 : .9, ev.n < 4 && !ev.tspin && !ev.perfect);
        if (ev.up) { feed("LEVEL " + ev.level, "#ffffff", true); fx.pop.push({ txt: "LEVEL " + ev.level, col: "#8be9ff", t: 0, y: 200 }); depthT = clamp((ev.level - 1) / 12, 0, 1); }
      } else if (ev.tspin) { const n = "T-SPIN" + (ev.mini ? " MINI" : ""); feed(n, "#e7a6ff", true); fx.pop.push({ txt: n, col: "#e7a6ff", t: 0, y: 330 }); react("jump", .9, true); }
    } else if (ev.type === "over") { over = true; overT = 0; finish(); }
  }
  async function finish() {
    if (saved) return; saved = true; const s = E ? E.score : 0; await flush();
    if (s > 0) ctx.saveScore(s, ctx.game);
  }

  /* ---- fondo: océano que se oscurece al subir de nivel ---- */
  const BG = [[[31, 150, 190], [8, 70, 110]], [[10, 60, 100], [3, 20, 45]], [[3, 22, 50], [0, 3, 10]]];
  function bgCols(d) { const t = d * 2, i = Math.min(1, Math.floor(t)), f = t - i; return [mix(BG[i][0], BG[i + 1][0], f), mix(BG[i][1], BG[i + 1][1], f)]; }
  function buildReef() {
    const r = cvs(1280, 190), x = r.getContext("2d"); x.imageSmoothingEnabled = false; const names = Object.keys(TEXI); let px = -10;
    while (px < 1290) {
      const w = Math.round(rnd(2, 5)), hh = Math.round(rnd(1, 6)), t = pick(names), S = 24, shape = pick(["tower", "stairs", "fan"]);
      for (let i = 0; i < w; i++) {
        const h2 = shape === "tower" ? hh : shape === "stairs" ? Math.max(1, hh - i) : Math.max(1, hh - Math.abs(i - (w >> 1)));
        for (let j = 0; j < h2; j++) { if (ok(TEXI[t])) x.drawImage(TEXI[t], px + i * S, 190 - (j + 1) * S, S, S); else { x.fillStyle = FALL[t]; x.fillRect(px + i * S, 190 - (j + 1) * S, S, S); } x.fillStyle = "rgba(0,0,0,.22)"; x.fillRect(px + i * S, 190 - (j + 1) * S, S, 2); }
      }
      px += w * 24 + Math.round(rnd(0, 40));
    }
    x.fillStyle = "#c9b27a"; x.fillRect(0, 176, 1280, 14); return r;
  }
  const MOBS = {
    fish: { n: 9, spawn: d => ({ s: pick(FISH), sc: rnd(2.2, 4), v: rnd(30, 85), y: rnd(90, 560), a: rnd(.55, 1), bob: rnd(4, 14) }) },
    puffer: { n: 2, spawn: d => ({ s: SPR.globo, sc: 1.3, v: rnd(18, 32), y: rnd(120, 500), a: .95, bob: 14, px: 1 }) },
    chico: { n: 2, spawn: d => ({ s: SPR.chico, sc: 1.4, v: rnd(24, 44), y: rnd(120, 520), a: .95, bob: 10, px: 1 }) },
    nautilo: { n: 1, spawn: d => ({ s: SPR.nautilo, sc: 1.1, v: rnd(12, 22), y: rnd(150, 450), a: .95, bob: 26, px: 1 }) },
    ajolote: { n: 1, spawn: d => ({ s: SPR.ajolote, sc: 1, v: rnd(14, 24), y: rnd(380, 560), a: .95, bob: 8, px: 1, left: true }) },
    ahogado: { n: 1, spawn: d => ({ s: SPR.ahogado, sc: 1.7, v: rnd(8, 14), y: rnd(120, 420), a: .85, bob: 38, px: 1, nf: true, deep: .25 }) },
    delfin: { n: 1, spawn: d => ({ s: DOLPHIN, sc: 3.4, v: rnd(120, 170), y: rnd(130, 360), a: 1, bob: 70, hz: .9, shallow: .7 }) }
  };
  function spawnMob(kind, first) {
    const m = MOBS[kind].spawn(), W0 = VW, face = Math.random() < .5 ? 1 : -1; const o = { kind, ...m, dir: face, t: rnd(0, 9), hz: m.hz || rnd(.6, 1.3) };
    if (o.left) o.dir = -o.dir; const w = (o.s.width || 16) * o.sc;
    o.x = first ? rnd(0, W0) : (face > 0 ? -w - 20 : W0 + w + 20); mobs.push(o);
  }
  function updateBG(dt) {
    depthV += (depthT - depthV) * Math.min(1, dt * .8);
    const cnt = {}; mobs.forEach(m => cnt[m.kind] = (cnt[m.kind] || 0) + 1);
    for (const k in MOBS) { const d = MOBS[k], ok2 = (!d.deep || depthV >= d.deep) && (!d.shallow || depthV <= d.shallow); if (ok2 && (cnt[k] || 0) < d.n && Math.random() < dt * .6) spawnMob(k, false); }
    mobs.forEach(m => { m.t += dt; m.x += m.dir * m.v * dt; });
    mobs = mobs.filter(m => m.x > -400 && m.x < VW + 400 && !((MOBS[m.kind].deep && depthV < MOBS[m.kind].deep - .1) || (MOBS[m.kind].shallow && depthV > MOBS[m.kind].shallow + .15)));
    snow.forEach(s => { s.y += s.v * dt; s.x += Math.sin(tcur + s.p) * 6 * dt; if (s.y > VH + 5) { s.y = -5; s.x = rnd(0, VW); } });
    bubbles.forEach(b => { b.y -= b.v * dt; b.x += Math.sin(tcur * 2 + b.p) * 10 * dt; if (b.y < -10) { b.y = VH + rnd(0, 200); b.x = rnd(0, VW); } });
  }
  function drawBG() {
    const [t0, b0] = bgCols(depthV), g = c.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, `rgb(${t0})`); g.addColorStop(1, `rgb(${b0})`); c.fillStyle = g; c.fillRect(0, 0, W, Hh);
    c.save(); c.translate(ox, oy); c.scale(sc, sc); c.imageSmoothingEnabled = false;
    const ra = .13 * (1 - depthV); if (ra > .01) rays.forEach(r => { const x = r.x + Math.sin(tcur * .25 + r.p) * 40; c.fillStyle = `rgba(255,255,255,${ra * r.a})`; c.beginPath(); c.moveTo(x, -20); c.lineTo(x + r.w, -20); c.lineTo(x + r.w - 200, VH + 20); c.lineTo(x - 200, VH + 20); c.fill(); });
    snow.forEach(s => { c.fillStyle = `rgba(210,240,255,${s.a * (.4 + depthV * .5)})`; c.fillRect(s.x, s.y, s.s, s.s); });
    if (depthV > .45) for (let i = 0; i < 26; i++) { const x = (i * 241 + Math.sin(tcur * .4 + i) * 30) % VW, y = (i * 97 + tcur * (6 + i % 5)) % VH; c.fillStyle = `rgba(90,255,230,${.25 * Math.abs(Math.sin(tcur * 1.3 + i))})`; c.fillRect(x, y, 3, 3); }
    mobs.slice().sort((a, b) => a.a - b.a).forEach(m => {
      const w = (m.s.width || 16) * m.sc, h = (m.s.height || 16) * m.sc, y = m.y + Math.sin(m.t * m.hz * 2) * m.bob, dark = 1 - depthV * .55;
      c.save(); c.translate(m.x, y); const fl = m.nf ? 1 : m.dir * (m.left ? -1 : 1); c.scale(fl, 1);
      if (m.kind === "delfin") c.rotate(Math.cos(m.t * m.hz * 2) * .35 * (m.dir > 0 ? 1 : 1));
      c.globalAlpha = m.a * (m.px ? 1 : 1); c.drawImage(m.s, -w / 2, -h / 2, w, h);
      c.globalAlpha = (1 - dark) * .8 * m.a; c.globalCompositeOperation = "source-atop"; c.fillStyle = "#001428"; c.fillRect(-w / 2, -h / 2, w, h); c.restore();
    });
    bubbles.forEach(b => { c.strokeStyle = "rgba(220,245,255,.45)"; c.lineWidth = 1.5; c.strokeRect(b.x, b.y, b.s, b.s); });
    c.globalAlpha = lerp(1, .5, depthV); c.drawImage(reef, 0, VH - 190, VW, 190); c.globalAlpha = 1; c.fillStyle = `rgba(0,10,30,${.15 + depthV * .4})`; c.fillRect(0, VH - 190, VW, 190);
    c.restore();
  }

  /* ---- dibujo del juego ---- */
  function block(x, y, s, t, a = 1) {
    c.globalAlpha = a; if (ok(TEXI[t])) c.drawImage(TEXI[t], x, y, s, s); else { c.fillStyle = FALL[t]; c.fillRect(x, y, s, s); }
    c.fillStyle = "rgba(255,255,255,.38)"; c.fillRect(x, y, s, 3); c.fillRect(x, y, 3, s); c.fillStyle = "rgba(0,0,0,.4)"; c.fillRect(x, y + s - 3, s, 3); c.fillRect(x + s - 3, y, 3, s); c.globalAlpha = 1;
  }
  function mini(t, cx, cy, s) {                                          // pieza pequeña centrada en (cx, cy)
    const m = SHAPES[t]; let x0 = 9, x1 = -1, y0 = 9, y1 = -1;
    m.forEach((r, j) => r.forEach((v, i) => { if (v) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); } }));
    const w = (x1 - x0 + 1) * s, h = (y1 - y0 + 1) * s;
    m.forEach((r, j) => r.forEach((v, i) => { if (v) block(Math.round(cx - w / 2 + (i - x0) * s), Math.round(cy - h / 2 + (j - y0) * s), s, t); }));
  }
  const txt = (s, x, y, size, col, al = "left", a = 1) => { c.globalAlpha = a; c.font = size + "px " + FONT; c.textAlign = al; c.fillStyle = "rgba(0,0,0,.65)"; c.fillText(s, x + 2, y + 2); c.fillStyle = col; c.fillText(s, x, y); c.globalAlpha = 1; };
  const panel = (x, y, w, h, a = .5) => { c.fillStyle = `rgba(0,10,24,${a})`; c.fillRect(x, y, w, h); c.strokeStyle = "rgba(160,225,255,.35)"; c.lineWidth = 2; c.strokeRect(x, y, w, h); };
  function coinIcon(x, y, s, spin) { const w = Math.max(3, Math.abs(Math.cos(spin)) * s); c.fillStyle = "#b8860b"; c.fillRect(x - w / 2 - 1, y - s / 2 - 1, w + 2, s + 2); c.fillStyle = "#ffd84a"; c.fillRect(x - w / 2, y - s / 2, w, s); c.fillStyle = "#fff3a8"; c.fillRect(x - w / 2 + 1, y - s / 2 + 1, Math.max(1, w / 3), s - 2); }
  function drawAvatar(now, dt) {
    if (!figs) return; avT += dt * ANIMS[avA].fps * (avA === "jump" ? .9 : 1);
    if (now > avUntil && avA !== "idle") { avA = "idle"; avT = 0; }
    const n = ANIMS[avA].frames.length, i = avA === "jump" && avOnce ? Math.min(n - 1, Math.floor(avT)) : Math.floor(avT) % n, f = figs.get(avA, i);
    c.save(); c.translate(150, 372); c.scale(-1, 1); c.imageSmoothingEnabled = false; if (over) c.globalAlpha = .55;
    c.drawImage(f.fig, Math.round(-figs.w / 2) - f.gx, -figs.feet + f.gy); c.restore();
  }
  function drawHUD(now, dt) {
    const u = me(), q = csFresh(), l = lv(barXP);
    panel(40, 36, 330, 70, .45); coinIcon(66, 55, 20, coinShow); txt(q.n + "/" + COIN_MAX, 88, 62, 20, "#ffe27a");
    txt("LV " + l.L, 330, 62, 16, "#9fe9ff", "right"); c.fillStyle = "rgba(0,0,0,.6)"; c.fillRect(52, 74, 306, 14); c.fillStyle = "#35d0ff"; c.fillRect(52, 74, 306 * clamp(l.cur / l.need, 0, 1), 14); c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(52, 74, 306 * clamp(l.cur / l.need, 0, 1), 4);
    txt("+" + xpS.sess + " XP", 358, 100, 12, "#bfefff", "right");
    scoreShow += (E.score - scoreShow) * Math.min(1, dt * 10); const sstr = String(Math.round(scoreShow)).padStart(6, "0");
    panel(40, 124, 330, 74, .45); txt(sstr, 205, 178, 52, "#fff6d6", "center"); txt("SCORE", 52, 146, 12, "#9fb3c8");
    drawAvatar(now, dt);
    panel(60, 396, 160, 110, .5); txt("HOLD", 68, 416, 13, "#fff"); if (E.hold) mini(E.hold, 140, 462, 24);
    c.globalAlpha = E.canHold ? 0 : .5; c.fillStyle = "#000"; c.fillRect(60, 396, 160, 110); c.globalAlpha = 1;
    let y = 560; fx.feed.slice().reverse().forEach((f, k) => { const a = clamp(1 - Math.max(0, f.t - 2.2) / .8, 0, 1) * clamp(f.t * 6, 0, 1); if (a <= 0) return; const x = 40 + (1 - clamp(f.t * 6, 0, 1)) * -40; txt(f.txt, x, y, f.big ? 24 : 17, f.col, "left", a); y += f.big ? 30 : 24; });
    panel(830, 36, 140, 480, .5); txt("NEXT", 842, 58, 14, "#fff"); for (let k = 0; k < 5; k++) mini(E.queue[k], 900, 120 + k * 88, 24);
    const T = Math.floor(tcur), tm = Math.floor(T / 3600) + ":" + String(Math.floor(T / 60) % 60).padStart(2, "0") + ":" + String(T % 60).padStart(2, "0");
    txt("TIEMPO", 900, 560, 15, "#9fb3c8", "center"); txt(tm, 900, 590, 26, "#fff", "center");
    txt("LEVEL " + E.level, 1010, 70, 20, "#8be9ff"); txt("LINES " + E.lines, 1010, 100, 16, "#fff");
  }
  function drawBoard() {
    c.save(); if (shake > .2) c.translate(rnd(-shake, shake), rnd(-shake, shake));
    panel(BX - 6, BY - 6, COLS * CELL + 12, ROWS * CELL + 12, .6); c.fillStyle = "rgba(0,8,20,.55)"; c.fillRect(BX, BY, COLS * CELL, ROWS * CELL);
    c.strokeStyle = "rgba(255,255,255,.05)"; c.lineWidth = 1; for (let i = 1; i < COLS; i++) { c.beginPath(); c.moveTo(BX + i * CELL, BY); c.lineTo(BX + i * CELL, BY + ROWS * CELL); c.stroke(); } for (let j = 1; j < ROWS; j++) { c.beginPath(); c.moveTo(BX, BY + j * CELL); c.lineTo(BX + COLS * CELL, BY + j * CELL); c.stroke(); }
    fx.trail.forEach(tr => { const a = tr.a * .5; E.board; tr.m.forEach((r, j) => r.forEach((v, i) => { if (v) { const [x, y0] = cellXY(tr.x + i, tr.y0 + j), [, y1] = cellXY(0, tr.y1 + j); const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(1, FALL[tr.t]); c.globalAlpha = a; c.fillStyle = g; c.fillRect(x + 6, Math.max(BY, y0), CELL - 12, Math.max(0, y1 - Math.max(BY, y0))); c.globalAlpha = 1; } })); });
    for (let y = HID; y < H; y++) for (let x = 0; x < COLS; x++) { const t = E.board[y][x]; if (t) block(BX + x * CELL, BY + (y - HID) * CELL, CELL, t); }
    if (!over) {
      const p = E.cur; p.m.forEach((r, j) => r.forEach((v, i) => { if (v) { const gy = E.ghostY + j; if (gy >= HID) { c.strokeStyle = FALL[p.t]; c.globalAlpha = .55; c.lineWidth = 3; c.strokeRect(BX + (p.x + i) * CELL + 2, BY + (gy - HID) * CELL + 2, CELL - 4, CELL - 4); c.globalAlpha = 1; } } }));
      const lockA = E.lockT > 0 ? 1 - E.lockT / .5 * .45 : 1;
      p.m.forEach((r, j) => r.forEach((v, i) => { const by = p.y + j; if (v && by >= HID) block(BX + (p.x + i) * CELL, BY + (by - HID) * CELL, CELL, p.t, lockA); }));
    }
    fx.rows.forEach(r => { const [, y] = cellXY(0, r.y), a = clamp(1 - r.t / .35, 0, 1); c.fillStyle = `rgba(255,255,255,${a})`; c.fillRect(BX, y - (1 - a) * 4, COLS * CELL, CELL + (1 - a) * 8); });
    c.restore();
  }
  function drawFX(dt) {
    fx.p.forEach(p => { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; const a = clamp(1 - p.t / p.l, 0, 1); c.globalAlpha = a; c.fillStyle = p.c; c.fillRect(p.x, p.y, p.s, p.s); }); c.globalAlpha = 1; fx.p = fx.p.filter(p => p.t < p.l);
    fx.fly.forEach(f => { f.t += dt * 1.6; const t = clamp(f.t, 0, 1), e = t * t * (3 - 2 * t), x = lerp(f.x, f.tx, e), y = lerp(f.y, f.ty, e) - Math.sin(Math.PI * e) * 70;
      if (f.k === "xp") { c.fillStyle = "#6ee7ff"; c.fillRect(x - 5, y - 5, 10, 10); c.fillStyle = "#fff"; c.fillRect(x - 2, y - 2, 4, 4); } else coinIcon(x, y, 18, f.t * 12);
      if (f.t >= 1) { if (f.k === "xp") barXP += f.v; else coinShow += 2; } });
    fx.fly = fx.fly.filter(f => f.t < 1);
    fx.pop.forEach(p => { p.t += dt; const a = clamp(1 - Math.max(0, p.t - 1) / .6, 0, 1), s = 1 + Math.max(0, .35 - p.t) * 2.2; c.save(); c.translate(BX + COLS * CELL / 2, p.y - p.t * 25); c.scale(s, s); txt(p.txt, 0, 0, 30, p.col, "center", a); c.restore(); });
    fx.pop = fx.pop.filter(p => p.t < 1.6); fx.feed.forEach(f => f.t += dt); fx.feed = fx.feed.filter(f => f.t < 3);
    fx.rows.forEach(r => r.t += dt); fx.rows = fx.rows.filter(r => r.t < .4); fx.trail.forEach(t => t.a -= dt * 4); fx.trail = fx.trail.filter(t => t.a > 0);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame); const dt = Math.min(.05, (now - last) / 1000 || .016); last = now; tcur += over ? 0 : dt; shake *= Math.pow(.02, dt); flashA = Math.max(0, flashA - dt * 2.5); coinShow += dt * 3;
    if (!over) input(dt); if (!over) E.tick(dt, keys.d); while (E.events.length) onEvent(E.events.shift());
    updateBG(dt); drawBG();
    c.save(); c.translate(ox, oy); c.scale(sc, sc); c.imageSmoothingEnabled = false;
    drawBoard(); drawHUD(now, dt); drawFX(dt);
    if (over) { overT += dt; c.fillStyle = `rgba(0,0,0,${Math.min(.6, overT * 1.2)})`; c.fillRect(BX, BY, COLS * CELL, ROWS * CELL); const a = clamp(overT * 2, 0, 1);
      txt("GAME OVER", BX + 160, 300, 38, "#ff6b6b", "center", a); txt("SCORE " + E.score, BX + 160, 345, 22, "#fff", "center", a); txt("LINES " + E.lines + "  ·  LV " + E.level, BX + 160, 380, 16, "#9fb3c8", "center", a); txt("ESPACIO / R: REINTENTAR", BX + 160, 430, 15, "#ffe27a", "center", a * (.6 + .4 * Math.sin(overT * 5))); }
    c.restore();
    if (flashA > 0) { c.fillStyle = `rgba(255,255,255,${flashA * .45})`; c.fillRect(0, 0, W, Hh); }
  }

  /* ---- entrada: DAS/ARR como en TETR.IO ---- */
  const DAS = .13, ARR = .025;
  function input(dt) {
    if (dir) { das += dt; if (das >= DAS) { arr += dt; while (arr >= ARR) { arr -= ARR; if (!E.move(dir)) break; } } }
  }
  const act = {
    ArrowLeft: d => { keys.l = true; dir = -1; das = arr = 0; if (E.move(-1)) react("walk", .2); },
    ArrowRight: d => { keys.r = true; dir = 1; das = arr = 0; if (E.move(1)) react("walk", .2); },
    ArrowDown: () => { keys.d = true; }, Space: () => E.hardDrop(), ArrowUp: () => E.rotate(1), KeyX: () => E.rotate(1), KeyZ: () => E.rotate(-1), ControlLeft: () => E.rotate(-1), KeyA: () => E.rotate(2),
    KeyC: () => E.holdPiece(), ShiftLeft: () => E.holdPiece(), ShiftRight: () => E.holdPiece()
  };
  const alias = {};
  addEventListener("keydown", e => {
    if (!running || !ctx.live()) return; const code = e.code;
    if (over) { if (code === "Space" || code === "KeyR" || code === "Enter") { e.preventDefault(); start(); } return; }
    const k = alias[code] || code; if (!act[k] || (e.repeat && k !== "ArrowDown")) { if (act[k]) e.preventDefault(); return; } e.preventDefault(); act[k]();
  });
  addEventListener("keyup", e => {
    if (!running) return; const k = alias[e.code] || e.code;
    if (k === "ArrowLeft") { keys.l = false; dir = keys.r ? 1 : 0; das = arr = 0; } else if (k === "ArrowRight") { keys.r = false; dir = keys.l ? -1 : 0; das = arr = 0; } else if (k === "ArrowDown") keys.d = false;
  });
  /* táctil: toque = girar, arrastrar = mover, deslizar abajo = bajar, lanzar hacia abajo = caída, toque en HOLD = guardar */
  let tp = null;
  cv.addEventListener("pointerdown", e => { if (!running || e.pointerType === "mouse") return; e.preventDefault(); e.stopPropagation(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ } tp = { x: e.clientX, y: e.clientY, ax: e.clientX, t: performance.now(), moved: false, sx: e.clientX, sy: e.clientY }; });
  cv.addEventListener("pointermove", e => {
    if (!tp || over) return; const step = CELL * sc * .9;
    while (e.clientX - tp.ax >= step) { tp.ax += step; tp.moved = true; E.move(1); } while (tp.ax - e.clientX >= step) { tp.ax -= step; tp.moved = true; E.move(-1); }
    keys.d = e.clientY - tp.y > 50; if (keys.d) tp.moved = true;
  });
  const tend = e => {
    if (!tp) return; keys.d = false; if (over) { if (performance.now() - tp.t < 400) start(); tp = null; return; }
    const dy = e.clientY - tp.y, dt = performance.now() - tp.t;
    if (dy > 120 && dt < 260) E.hardDrop(); else if (!tp.moved && dt < 300) { const vx = (e.clientX - ox) / sc, vy = (e.clientY - oy) / sc; if (vx > 40 && vx < 230 && vy > 390 && vy < 510) E.holdPiece(); else E.rotate(1); } tp = null;
  };
  cv.addEventListener("pointerup", tend); cv.addEventListener("pointercancel", () => { tp = null; keys.d = false; });
  cv.addEventListener("contextmenu", e => e.preventDefault());

  /* ---- ciclo de vida ---- */
  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.round(innerWidth * dpr); Hh = Math.round(innerHeight * dpr); cv.width = W; cv.height = Hh;
    sc = Math.min(W / VW, Hh / VH); ox = (W - VW * sc) / 2; oy = (Hh - VH * sc) / 2;
  }
  addEventListener("resize", () => { if (running) fit(); });
  function start() {
    cancelAnimationFrame(raf); fit(); E = createEngine(); over = false; saved = false; limitShown = false; tcur = 0; shake = 0; flashA = 0; scoreShow = 0; coinShow = 0; dir = 0; keys.l = keys.r = keys.d = false;
    fx = { p: [], fly: [], pop: [], feed: [], rows: [], trail: [] }; xpS = { sess: 0, pend: 0 }; coinS = { sess: 0, pend: 0 }; depthV = depthT = 0; avA = "idle"; avUntil = 0;
    if (!reef || !started) { reef = buildReef(); started = true; setTimeout(() => { reef = buildReef(); }, 600); }
    mobs = []; for (let i = 0; i < 7; i++) spawnMob("fish", true); spawnMob("puffer", true); spawnMob("chico", true); spawnMob("delfin", true);
    snow = Array.from({ length: 60 }, () => ({ x: rnd(0, VW), y: rnd(0, VH), v: rnd(8, 26), s: rnd(1, 3), a: rnd(.2, .6), p: rnd(0, 6) }));
    bubbles = Array.from({ length: 22 }, () => ({ x: rnd(0, VW), y: rnd(0, VH), v: rnd(20, 60), s: rnd(3, 8), p: rnd(0, 6) }));
    rays = Array.from({ length: 6 }, (_, i) => ({ x: i * 240 + rnd(-40, 40), w: rnd(60, 130), a: rnd(.4, 1), p: rnd(0, 6) }));
    loadProgress(); ctx.faceSet(5).then(f => { figs = f; }); running = true; last = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() { if (!running) return; running = false; cancelAnimationFrame(raf); if (E && !saved) finish(); }
  return { start, stop };
}
