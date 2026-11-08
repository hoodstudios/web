# web
pagina oficial del estudio

## Créditos (selector de personajes)
- Archivos: `creditos.js`, `mcplayer.js` (modelo 3D WebGL), `creditos.css`, `img/creditos/*.jpg` (End/Nether/Overworld), `sonidos/teleport.ogg|mp3`.
- Datos en Firestore, colección `credits`. Pega las reglas nuevas de `firestore.rules` (bloque `match /credits/{id}`).
- Admin (HOODSTUDIO): inicia sesión, abre Créditos → "+" en espacios vacíos para añadir; elige un personaje y pulsa "Editar".
- En `creditos.js`, `DEMO_SI_FALLA = true` muestra un HOOD21 de ejemplo si Firestore no responde; ponlo en `false` al terminar.
