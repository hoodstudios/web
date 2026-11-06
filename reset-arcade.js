/* Reinicia el arcade de TODOS los jugadores: XP, monedas y puntuaciones (colección "scores").
 *
 * Uso (una sola vez, desde tu computadora):
 *   1) Firebase → Configuración del proyecto → Cuentas de servicio → "Generar nueva clave privada" (descarga un .json). No lo subas al repositorio.
 *   2) npm install firebase-admin
 *   3) node reset-arcade.js ruta/a/la-clave.json            (solo muestra qué haría)
 *      node reset-arcade.js ruta/a/la-clave.json --confirmar  (lo aplica)
 */
const admin = require("firebase-admin");
const [keyPath, flag] = process.argv.slice(2);
if (!keyPath) { console.error("Falta la ruta de la clave de servicio (.json)."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(require(require("path").resolve(keyPath))) });
const db = admin.firestore(), apply = flag === "--confirmar";

async function batched(docs, fn) {
  for (let i = 0; i < docs.length; i += 400) {
    const b = db.batch(); docs.slice(i, i + 400).forEach(d => fn(b, d.ref)); if (apply) await b.commit();
  }
}
(async () => {
  const players = (await db.collection("players").get()).docs, scores = (await db.collection("scores").get()).docs;
  console.log(`${players.length} jugadores (XP y monedas → 0) · ${scores.length} puntuaciones (se borran)`);
  await batched(players, (b, ref) => b.update(ref, { xp: 0, coins: 0, coinWin_runner: 0, coinN_runner: 0, monedas: admin.firestore.FieldValue.delete() }));
  await batched(scores, (b, ref) => b.delete(ref));
  console.log(apply ? "Listo: arcade reiniciado." : "Simulación: no se cambió nada. Repite con --confirmar para aplicarlo.");
})().catch(e => { console.error(e); process.exit(1); });
