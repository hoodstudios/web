/* navliquid.js — Selector "liquid glass" de la barra superior.
 * Una píldora amarilla (sólida) se desliza entre el botón anterior y el nuevo: se estira hasta cubrir ambos y se recoge
 * con un pequeño rebote. Usa la Web Animations API, así que no depende de las transiciones CSS. */
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
    const l0 = Math.min(a.l, b.l), r1 = Math.max(a.l + a.w, b.l + b.w);
    set(b);
    const px = n => n + "px", ez = "cubic-bezier(.4,0,.2,1)";
    anim = pill.animate([
      { left: px(a.l), width: px(a.w), transform: "scale(1,1)", easing: ez },
      { left: px(l0), width: px(r1 - l0), transform: "scale(1,.84)", offset: .42, easing: ez },
      { left: px(b.l), width: px(b.w), transform: "scale(1.06,.97)", offset: .82, easing: ez },
      { left: px(b.l), width: px(b.w), transform: "scale(1,1)" }
    ], { duration: 600, easing: "linear" });
    anim.onfinish = anim.oncancel = () => { anim = null; };
    // el texto cambia de color justo cuando la píldora pasa por debajo (a mitad del movimiento)
    prev.style.color = "#000"; on.style.color = "var(--t)";
    setTimeout(() => { prev.style.color = ""; on.style.color = ""; }, 190);
  }
  new MutationObserver(() => update(true)).observe(nav, { subtree: true, attributes: true, attributeFilter: ["class"] });
  const refit = () => update(false);
  addEventListener("resize", refit);
  if (window.ResizeObserver) new ResizeObserver(refit).observe(nav);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
  update(false);
}
