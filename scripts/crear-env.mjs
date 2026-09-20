/**
 * SIGNUM · Generador del archivo .env
 *
 * Funciona en Windows, macOS y Linux sin depender de PowerShell.
 *
 *   node scripts/crear-env.mjs "postgresql://usuario:clave@host/base?sslmode=require"
 *
 * O sin argumentos para que lo pregunte:
 *   node scripts/crear-env.mjs
 */
import { writeFileSync, existsSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

function clean(v) {
  return String(v ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

async function main() {
  console.log("");
  console.log(C.cyan("╔══════════════════════════════════════════════╗"));
  console.log(C.cyan("║  SIGNUM · Generador del archivo .env         ║"));
  console.log(C.cyan("╚══════════════════════════════════════════════╝"));
  console.log("");

  let dbUrl = clean(process.argv[2]);
  let appUrl = clean(process.argv[3]) || "http://localhost:3000";

  const rl = createInterface({ input: stdin, output: stdout });

  try {
    if (existsSync(envPath)) {
      console.log(C.yellow("Ya existe un archivo .env en esta carpeta."));
      const r = clean(await rl.question("¿Desea reemplazarlo? (s/N): "));
      if (r.toLowerCase() !== "s") {
        console.log("Operación cancelada. Se conserva el .env actual.\n");
        return;
      }
      copyFileSync(envPath, `${envPath}.backup`);
      console.log(C.yellow("Copia de seguridad guardada como .env.backup\n"));
    }

    if (!dbUrl) {
      console.log("Pegue la cadena de conexión de su base de datos:");
      console.log(
        C.dim("  Neon:  postgresql://usuario:clave@ep-xxxx.neon.tech/neondb?sslmode=require")
      );
      console.log(
        C.dim("  Local: postgresql://postgres:clave@127.0.0.1:5432/signum")
      );
      console.log("");
      dbUrl = clean(await rl.question("DATABASE_URL: "));
    }

    if (!dbUrl) {
      console.log(C.red("\n✗ No ingresó ninguna cadena. Operación abortada.\n"));
      process.exitCode = 1;
      return;
    }
    if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
      console.log(C.red("\n✗ La cadena debe comenzar con postgresql:// o postgres://"));
      console.log(`  Recibido: ${dbUrl}\n`);
      process.exitCode = 1;
      return;
    }
  } finally {
    rl.close();
  }

  const secret = randomBytes(48).toString("base64url");

  const content = [
    "# SIGNUM - Variables de entorno",
    "# Generado por scripts/crear-env.mjs",
    "",
    `DATABASE_URL=${dbUrl}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `SESSION_SECRET=${secret}`,
    "NODE_ENV=development",
    "",
  ].join("\n");

  // UTF-8 sin BOM
  writeFileSync(envPath, content, { encoding: "utf8" });

  const masked = dbUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:••••••@");

  console.log("");
  console.log(C.green("✓ Archivo .env creado correctamente"));
  console.log(C.dim(`  Ubicación: ${envPath}`));
  console.log("");
  console.log(C.dim("  DATABASE_URL        = " + masked));
  console.log(C.dim("  NEXT_PUBLIC_APP_URL = " + appUrl));
  console.log(C.dim("  SESSION_SECRET      = ••••••  (generado aleatoriamente)"));
  console.log("");
  console.log(C.cyan("  Siguiente paso — verifique la conexión:"));
  console.log("     npx tsx scripts/check-db.ts");
  console.log("");
}

main();
