/* navliquid.js — Selector de la barra superior con movimiento tipo Apple.
 * Una píldora amarilla (sólida) viaja de un botón al otro como UNA sola pieza, movida por un resorte real:
 * sale rápido, rebasa un poco el destino y se asienta. No se estira ni se encoge durante el viaje (solo cambia de ancho para
 * ajustarse al botón nuevo, sin rebotar). Como es una simulación, si haces clic otra vez a mitad del camino
 * retoma desde donde está y con su velocidad: nunca se atora ni "salta". */
const nav = document.querySelector(".nav");
if (nav) {
  const pill = document.createElement("span");
  pill.className = "liq-pill"; pill.setAttribute("aria-hidden", "true"); pill.style.opacity = "0";
  nav.prepend(pill); nav.classList.add("liq");

  /* Esta animación NO se apaga con "reducir movimiento" del sistema (igual que el carrusel de proyectos): el selector siempre se desliza. */
  const links = () => [...nav.querySelectorAll("a")];
  /* resorte de la posición: rápido y con un rebote corto al llegar (estilo menú de consola); resorte del ancho: amortiguación crítica (sin rebote) */
  const KL = 460, CL = 2 * 0.66 * Math.sqrt(KL), KW = 460, CW = 2 * Math.sqrt(KW);
  const MAX_OVER = 6;                                   // px máximos que puede pasarse del destino (que no se salga de la cápsula)
  const MAX_MS = 1400;                                    // seguro anti-atorón: pasado este tiempo, se coloca en su sitio sí o sí

  let cur = null, raf = 0, last = 0, t0 = 0, dir = 1, colored = null;
  const S = { l: 0, w: 0, vl: 0, vw: 0 }, T = { l: 0, w: 0 };
  const box = a => ({ l: a.offsetLeft, w: a.offsetWidth, t: a.offsetTop, h: a.offsetHeight });
  const paint = () => { pill.style.transform = "translateX(" + S.l.toFixed(2) + "px)"; pill.style.width = S.w.toFixed(2) + "px"; };

  /* el texto se vuelve negro justo cuando la píldora pasa por debajo de él (no antes ni después) */
  function tint() {
    const cx = S.l + S.w / 2;
    const under = links().find(a => cx >= a.offsetLeft && cx < a.offsetLeft + a.offsetWidth) || null;
    if (under === colored) return;
    colored = under;
    links().forEach(a => { a.style.color = a === under ? "#000" : "var(--t)"; });
  }
  const untint = () => { colored = null; links().forEach(a => { a.style.color = ""; }); };

  function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function snap() {                                       // colocar la píldora exactamente en su destino
    halt(); S.l = T.l; S.w = T.w; S.vl = S.vw = 0; paint(); untint();
  }

  function frame(now) {
    const dt = Math.min(0.032, Math.max(0, (now - last) / 1000)); last = now;
    const n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
    for (let i = 0; i < n; i++) {
      S.vl += (-KL * (S.l - T.l) - CL * S.vl) * h; S.l += S.vl * h;
      S.vw += (-KW * (S.w - T.w) - CW * S.vw) * h; S.w += S.vw * h;
    }
    const over = (S.l - T.l) * dir;                       // cuánto se pasó del destino, en el sentido del viaje
    if (over > MAX_OVER) { S.l = T.l + dir * MAX_OVER; if (S.vl * dir > 0) S.vl = 0; }
    if (S.w < 0) S.w = 0;
    paint(); tint();
    const quiet = Math.abs(S.l - T.l) < 0.05 && Math.abs(S.vl) < 1 && Math.abs(S.w - T.w) < 0.05 && Math.abs(S.vw) < 1;
    if (quiet || now - t0 > MAX_MS) { snap(); return; }
    raf = requestAnimationFrame(frame);
  }

  function update(animate) {
    const on = nav.querySelector("a.on");
    if (!on) { snap(); pill.style.opacity = "0"; cur = null; return; }
    const b = box(on);
    T.l = b.l; T.w = b.w;
    pill.style.top = b.t + "px"; pill.style.height = b.h + "px";
    if (!cur || !animate || (on === cur && !raf)) {     // primera vez, cambio de tamaño o mismo botón: sin animación
      snap(); pill.style.opacity = "1"; cur = on; return;
    }
    cur = on;
    dir = Math.sign(T.l - S.l) || 1;
    last = t0 = performance.now();                        // el resorte arranca (o se redirige) con la posición y velocidad actuales
    tint();
    if (!raf) raf = requestAnimationFrame(frame);
  }

  new MutationObserver(() => update(true)).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const refit = () => update(false);
  addEventListener("resize", refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(nav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  document.addEventListener("visibilitychange", () => { if (document.hidden && raf) snap(); });   // pestaña en segundo plano: nunca queda a medias
  update(false);
}
