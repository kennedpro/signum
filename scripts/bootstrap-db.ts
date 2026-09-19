import "dotenv/config";
import { ensureDatabase } from "../src/db/bootstrap";

async function main() {
  console.log("\n── SIGNUM · Preparación automática de PostgreSQL ──────────\n");

  // Pistas mientras se espera (Neon suspendido, red lenta) y límite máximo:
  // nunca dejar la consola en silencio ni colgada indefinidamente.
  const started = Date.now();
  const hint = setInterval(() => {
    const s = Math.round((Date.now() - started) / 1000);
    console.log(
      `  … sigue en proceso (${s} s). Con bases en la nube (Neon) la primera conexión y el esquema pueden tardar 30-90 s.`
    );
  }, 20_000);
  const watchdog = setTimeout(() => {
    console.error("\n✗ La preparación superó los 4 minutos y se detuvo.\n");
    console.error("  Causas frecuentes:");
    console.error("   · Sin conexión a internet o firewall bloqueando el puerto 5432.");
    console.error("   · DATABASE_URL apunta a un host inexistente o suspendido.");
    console.error("   · Otra ventana de SIGNUM sigue abierta y bloquea la base: ciérrela y reintente.");
    console.error("\n  Verifique la conexión con:  npx tsx scripts/check-db.ts\n");
    process.exit(1);
  }, 240_000);
  hint.unref();
  watchdog.unref();

  try {
    const result = await ensureDatabase();
    clearInterval(hint);
    clearTimeout(watchdog);
    console.log(`✓ Base de datos: ${result.database}`);
    console.log("✓ Esquema creado o actualizado sin borrar información");
    console.log(result.adminCreated ? "✓ Cuenta admin creada" : "✓ Cuenta admin disponible");
    console.log(
      result.carlosCreated
        ? "✓ Cuenta carlos.gomez@entidad creada"
        : "✓ Cuenta carlos.gomez@entidad disponible"
    );
    console.log("\n  Usuario: admin                    Contraseña: admin");
    console.log("  Usuario: carlos.gomez@entidad     Contraseña: admin\n");
    // La semilla de demostración usa el pool compartido de la aplicación; sus
    // conexiones inactivas mantendrían el proceso vivo 30 s más. Se cierran ya.
    try {
      const { pool } = await import("../src/db");
      await pool.end();
    } catch {
      /* el pool no llegó a crearse */
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("✗ No se pudo preparar la base:\n");
    console.error("  " + message + "\n");
    if (/password authentication|SASL|SCRAM/i.test(message)) {
      console.error("  Neon rechazó la contraseña de DATABASE_URL.");
      console.error("  Copie una conexión nueva desde Neon → Connect.\n");
    }
    process.exit(1);
  }
}

main();
