/* HOOD STUDIO — navegación, menú lateral y login sencillo
 *
 * IMPORTANTE: GitHub Pages es hosting estático (no tiene servidor), así que las
 * cuentas se guardan en el navegador de cada persona (localStorage).
 * Sirve para dar una experiencia de "cuenta", pero NO es seguridad real:
 * no protejas con esto información privada. Para cuentas reales y compartidas
 * entre dispositivos hay que conectar un backend (Firebase, Supabase, etc.).
 */

(function () {
  "use strict";

  /* ---------- Utilidades ---------- */
  const $ = (sel) => document.querySelector(sel);
  const USERS_KEY = "hood_users";
  const SESSION_KEY = "hood_session";

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- Vistas (navegación por # ) ---------- */
  const VIEWS = ["inicio", "quienes-somos", "hardhood"];

  function showView() {
    const name = location.hash.replace("#", "");
    const current = VIEWS.includes(name) ? name : "inicio";
    VIEWS.forEach((v) => {
      $("#view-" + v).hidden = v !== current;
    });
    document.querySelectorAll("[data-link]").forEach((a) => {
      a.classList.toggle("active", a.dataset.link === current);
    });
    window.scrollTo(0, 0);
    closeSidebar();
  }
  window.addEventListener("hashchange", showView);

  /* ---------- Barra lateral desplegable ---------- */
  const sidebar = $("#sidebar");
  const scrim = $("#scrim");
  const menuBtn = $("#menuBtn");

  function openSidebar() {
    sidebar.classList.add("open");
    scrim.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    menuBtn.setAttribute("aria-label", "Cerrar menú");
  }
  function closeSidebar() {
    sidebar.classList.remove("open");
    scrim.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Abrir menú");
  }
  menuBtn.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
  });
  scrim.addEventListener("click", closeSidebar);
  sidebar.addEventListener("click", (e) => {
    if (e.target.closest("a")) closeSidebar();
  });

  /* ---------- Cuentas ---------- */
  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + ":" + password);
    return toHex(await crypto.subtle.digest("SHA-256", data));
  }
  function newSalt() {
    return toHex(crypto.getRandomValues(new Uint8Array(16)));
  }

  function getSession() {
    return readJSON(SESSION_KEY, null);
  }

  async function signUp(username, password) {
    const users = readJSON(USERS_KEY, {});
    const key = username.toLowerCase();
    if (users[key]) return { ok: false, error: "Ese nombre de usuario ya existe. Prueba con otro." };
    const salt = newSalt();
    users[key] = { name: username, salt, hash: await hashPassword(password, salt) };
    if (!writeJSON(USERS_KEY, users)) return { ok: false, error: "No se pudo guardar la cuenta. Activa el almacenamiento del navegador." };
    writeJSON(SESSION_KEY, { name: username });
    return { ok: true };
  }

  async function logIn(username, password) {
    const users = readJSON(USERS_KEY, {});
    const user = users[username.toLowerCase()];
    if (!user) return { ok: false, error: "Usuario o contraseña incorrectos." };
    const hash = await hashPassword(password, user.salt);
    if (hash !== user.hash) return { ok: false, error: "Usuario o contraseña incorrectos." };
    writeJSON(SESSION_KEY, { name: user.name });
    return { ok: true };
  }

  function logOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
    renderAuth();
  }

  /* ---------- Esquina superior derecha ---------- */
  const authArea = $("#authArea");

  function renderAuth() {
    authArea.textContent = "";
    const session = getSession();

    if (session) {
      const span = document.createElement("span");
      span.className = "user-name";
      span.append("Hola, ");
      const b = document.createElement("b");
      b.textContent = session.name;
      span.append(b);

      const out = document.createElement("button");
      out.className = "btn";
      out.textContent = "Cerrar sesión";
      out.addEventListener("click", logOut);

      authArea.append(span, out);
    } else {
      const login = document.createElement("button");
      login.className = "btn";
      login.textContent = "Iniciar sesión";
      login.addEventListener("click", () => openModal("login"));

      const signup = document.createElement("button");
      signup.className = "btn btn-solid";
      signup.textContent = "Registrarse";
      signup.addEventListener("click", () => openModal("signup"));

      authArea.append(login, signup);
    }
  }

  /* ---------- Modal ---------- */
  const modal = $("#authModal");
  const form = $("#authForm");
  const errorBox = $("#authError");
  const submitBtn = $("#authSubmit");
  const tabs = document.querySelectorAll(".tabs button");
  let mode = "login";
  let lastFocus = null;

  function setMode(next) {
    mode = next;
    tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.mode === mode)));
    submitBtn.textContent = mode === "login" ? "Iniciar sesión" : "Crear cuenta";
    $("#password").autocomplete = mode === "login" ? "current-password" : "new-password";
    errorBox.textContent = "";
  }

  function openModal(initialMode) {
    lastFocus = document.activeElement;
    setMode(initialMode);
    form.reset();
    modal.hidden = false;
    $("#username").focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  $("#authClose").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.hidden) closeModal();
    else closeSidebar();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.textContent = "";

    const username = $("#username").value.trim();
    const password = $("#password").value;

    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      errorBox.textContent = "El usuario debe tener de 3 a 20 caracteres: letras, números o guion bajo.";
      return;
    }
    if (password.length < 6) {
      errorBox.textContent = "La contraseña debe tener al menos 6 caracteres.";
      return;
    }
    if (!window.crypto || !crypto.subtle) {
      errorBox.textContent = "Tu navegador no permite crear cuentas aquí. Abre la página con https.";
      return;
    }

    submitBtn.disabled = true;
    const result = mode === "login" ? await logIn(username, password) : await signUp(username, password);
    submitBtn.disabled = false;

    if (!result.ok) {
      errorBox.textContent = result.error;
      return;
    }
    closeModal();
    renderAuth();
  });

  /* ---------- Inicio ---------- */
  $("#year").textContent = new Date().getFullYear();
  renderAuth();
  showView();
})();
