/* navliquid.js — Selector "liquid glass" de la barra superior.
 * Una píldora amarilla (sólida) se desliza entre el botón anterior y el nuevo. Usa la Web Animations API, así que no depende de las transiciones CSS. */
const nav = document.querySelector(".nav");
if (nav && nav.animate) {
  const pill = document.createElement("span");
  pill.className = "liq-pill"; pill.setAttribute("aria-hidden", "true"); pill.style.opacity = "0";
  nav.prepend(pill); nav.classList.add("liq");
  let cur = null, anim = null;
  const box = a => ({ l: a.offsetLeft, w: a.offsetWidth, t: a.offsetTop, h: a.offsetHeight });
  const set = b => { pill.style.left = b.l + "px"; pill.style.top = b.t + "px"; pill.style.width = b.w + "px"; pill.style.height = b.h + "px"; };

  function update(animate) {
    const on = nav.querySelector("a.on");
    if (!on) { pill.style.opacity = "0"; cur = null; return; }
    const b = box(on);
    if (!cur || !animate || on === cur) {                       // primera vez, cambio de tamaño o mismo botón: sin animación
      if (!anim) set(b);
      pill.style.opacity = "1"; cur = on; return;
    }
    const cs = getComputedStyle(pill), a = { l: parseFloat(cs.left) || 0, w: parseFloat(cs.width) || 0 };
    if (anim) anim.cancel();
    const prev = cur; cur = on;
    set(b);
    const px = n => n + "px", ez = "cubic-bezier(.45,0,.2,1)";
    // Solo se desliza: se estira como mucho unos píxeles a mitad del trayecto, sin importar la distancia
    const dir = Math.sign(b.l - a.l) || 1, ext = Math.min(10, Math.abs(b.l - a.l) * .06);
    const mid = { l: (a.l + b.l) / 2 - (dir < 0 ? ext : 0), w: (a.w + b.w) / 2 + ext };
    anim = pill.animate([
      { left: px(a.l), width: px(a.w), easing: ez },
      { left: px(mid.l), width: px(mid.w), offset: .5, easing: ez },
      { left: px(b.l), width: px(b.w) }
    ], { duration: 420, easing: "linear" });
    anim.onfinish = anim.oncancel = () => { anim = null; };
    // el texto cambia de color justo cuando la píldora pasa por debajo (a mitad del movimiento)
    prev.style.color = "#000"; on.style.color = "var(--t)";
    setTimeout(() => { prev.style.color = ""; on.style.color = ""; }, 150);
  }
  new MutationObserver(() => update(true)).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const refit = () => update(false);
  addEventListener("resize", refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(nav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  update(false);
}
