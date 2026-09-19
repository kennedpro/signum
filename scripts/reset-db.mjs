/**
 * SIGNUM · Reinicio completo de la base de datos
 *
 *   node scripts/reset-db.mjs
 *
 * Elimina todas las tablas, vuelve a crear el esquema y carga los datos de
 * demostración. Úselo cuando el esquema quede desactualizado tras una
 * actualización del proyecto.
 *
 * ⚠️ Borra toda la información existente.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/** Misma lógica que src/lib/db-url.ts (aquí en JS para Node puro). */
const MANAGED =
  /\.neon\.tech|\.supabase\.co|\.render\.com|\.railway\.app|\.aivencloud\.com|\.rds\.amazonaws\.com/i;

function needsSsl(url) {
  return /sslmode=(require|verify-ca|verify-full)/i.test(url) || MANAGED.test(url);
}

function normalizeDbUrl(raw) {
  let url = String(raw).trim().replace(/^["']|["']$/g, "").trim();
  const [base, query = ""] = url.split("?");
  if (!query) return url;
  const drop = new Set(["sslmode", "channel_binding", "options", "target_session_attrs"]);
  const kept = query.split("&").filter((p) => p && !drop.has(p.split("=")[0].toLowerCase()));
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

const TABLES = [
  "security_logs",
  "audit_events",
  "signatures",
  "recipients",
  "documents",
  "users",
  "organizations",
];

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root });
}

async function main() {
  console.log("");
  console.log(C.cyan("╔══════════════════════════════════════════════╗"));
  console.log(C.cyan("║  SIGNUM · Reinicio de la base de datos       ║"));
  console.log(C.cyan("╚══════════════════════════════════════════════╝"));
  console.log("");

  if (!existsSync(resolve(root, ".env"))) {
    console.log(C.red("✗ No existe el archivo .env"));
    console.log("  Créelo con:  node scripts/crear-env.mjs\n");
    process.exit(1);
  }

  const auto = process.argv.includes("--si") || process.argv.includes("-y");
  if (!auto) {
    console.log(C.yellow("⚠ Se eliminarán TODAS las tablas y sus datos."));
    const rl = createInterface({ input: stdin, output: stdout });
    const r = (await rl.question("¿Continuar? (s/N): ")).trim().toLowerCase();
    rl.close();
    if (r !== "s") {
      console.log("Operación cancelada.\n");
      return;
    }
    console.log("");
  }

  // ── 1. Eliminar tablas ─────────────────────────────────────
  console.log(C.cyan("→ Eliminando tablas anteriores…"));
  const { Pool } = await import("pg");
  const dotenv = await import("dotenv");
  dotenv.config();

  const raw = process.env.DATABASE_URL ?? process.env["\uFEFFDATABASE_URL"];
  if (!raw) {
    console.log(C.red("✗ DATABASE_URL no está definida en .env\n"));
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: normalizeDbUrl(raw),
    ssl: needsSsl(raw) ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 20_000,
  });

  try {
    await pool.query(`DROP TABLE IF EXISTS ${TABLES.join(", ")} CASCADE`);
    console.log(C.green("✓ Tablas eliminadas"));
  } catch (e) {
    console.log(C.red("✗ No se pudo conectar: " + (e?.message ?? e)));
    console.log("  Verifique la conexión con:  npx tsx scripts/check-db.ts\n");
    process.exit(1);
  } finally {
    await pool.end();
  }

  // ── 2. Recrear esquema ─────────────────────────────────────
  console.log("");
  console.log(C.cyan("→ Creando el esquema…"));
  run("npx drizzle-kit push --force");

  // ── 3. Cargar datos ────────────────────────────────────────
  console.log("");
  console.log(C.cyan("→ Cargando datos de demostración…"));
  run("npx tsx src/db/seed.ts");

  console.log("");
  console.log(C.green("╔══════════════════════════════════════════════╗"));
  console.log(C.green("║  BASE DE DATOS LISTA                         ║"));
  console.log(C.green("╚══════════════════════════════════════════════╝"));
  console.log("");
  console.log("  Arranque con:   npm run dev");
  console.log("  Abra:           http://localhost:3000");
  console.log("");
  console.log(C.yellow("  Usuario: admin        Contraseña: admin"));
  console.log(C.yellow("  Usuario: carlos.gomez@entidad   Contraseña: admin"));
  console.log("");
}

main().catch((e) => {
  console.error(C.red("\n✗ " + (e?.message ?? e) + "\n"));
  process.exit(1);
});
