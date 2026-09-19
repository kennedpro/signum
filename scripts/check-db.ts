import "dotenv/config";
import { Pool } from "pg";
import { needsSsl, normalizeDbUrl } from "../src/lib/db-url";
import { readEnv } from "../src/lib/env";

/**
 * Diagnóstico de conexión.
 *   npx tsx scripts/check-db.ts
 */

const raw = readEnv("DATABASE_URL");

function mask(u: string) {
  return u.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:••••••@");
}

async function main() {
  console.log("\n── Diagnóstico de conexión SIGNUM ───────────────────\n");

  if (!raw) {
    console.error("✗ No se encontró DATABASE_URL.\n");
    console.error("  El archivo .env no existe o está mal guardado.");
    console.error("  Créelo con:");
    console.error("     powershell -ExecutionPolicy Bypass -File scripts/crear-env.ps1\n");
    console.error("  Windows suele guardar 'env.txt' en vez de '.env'.");
    console.error("  Verifique con:  dir .env\n");
    process.exit(1);
  }

  const url = normalizeDbUrl(raw);
  const ssl = needsSsl(raw);

  console.log("  Cadena  :", mask(url));
  console.log("  TLS     :", ssl ? "activado" : "desactivado (local)");
  console.log("  Host    :", new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname);
  console.log("");

  const pool = new Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 20_000,
  });

  try {
    const t0 = Date.now();
    const { rows } = await pool.query(
      "select current_database() as db, current_user as usr, version() as v"
    );
    const ms = Date.now() - t0;
    console.log("✓ Conexión establecida en", ms, "ms");
    console.log("  Base de datos:", rows[0].db);
    console.log("  Usuario      :", rows[0].usr);
    console.log("  Servidor     :", String(rows[0].v).split(",")[0]);

    const { rows: tables } = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`
    );

    if (tables.length === 0) {
      console.log("\n⚠ La base está vacía. Ejecute:");
      console.log("    npx drizzle-kit push --force");
      console.log("    npx tsx src/db/seed.ts\n");
    } else {
      console.log("\n  Tablas encontradas:", tables.map((t) => t.table_name).join(", "));
      // Verificación de las columnas de autenticación
      const { rows: cols } = await pool.query(
        `select column_name from information_schema.columns
         where table_schema='public' and table_name='users'`
      );
      const names = cols.map((c: { column_name: string }) => c.column_name);
      const required = ["username", "password_hash", "password_salt", "system_role", "active"];
      const missing = required.filter((c) => !names.includes(c));

      if (missing.length > 0) {
        console.log("\n✗ ESQUEMA DESACTUALIZADO");
        console.log("  Faltan columnas en «users»:", missing.join(", "));
        console.log("\n  Solución (borra y recrea todo):");
        console.log("     node scripts/reset-db.mjs\n");
        process.exitCode = 1;
        return;
      }
      console.log("  Columnas de acceso: completas ✓");

      try {
        const { rows: u } = await pool.query(
          "select count(*)::int as n, count(password_hash)::int as c from users"
        );
        const { rows: d } = await pool.query("select count(*)::int as n from documents");
        console.log(`  Registros: ${u[0].n} usuario(s), ${d[0].n} documento(s)`);

        if (u[0].n === 0) {
          console.log("\n⚠ Sin usuarios registrados. Ejecute:");
          console.log("     npx tsx src/db/seed.ts\n");
        } else if (u[0].c === 0) {
          console.log("\n⚠ Los usuarios no tienen contraseña asignada. Ejecute:");
          console.log("     node scripts/reset-db.mjs\n");
        } else {
          const { rows: who } = await pool.query(
            "select coalesce(username, email) as login, system_role from users order by created_at limit 5"
          );
          console.log("\n  Cuentas disponibles:");
          for (const w of who) {
            console.log(`     ${w.login}  ·  ${w.system_role}`);
          }
          console.log("\n✓ Todo listo. Arranque con:  npm run dev\n");
        }
      } catch (err) {
        console.log("\n⚠ Error al consultar los datos:", err instanceof Error ? err.message : err);
        console.log("  Ejecute: node scripts/reset-db.mjs\n");
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("\n✗ No se pudo conectar:", msg, "\n");

    if (/password authentication|SASL|SCRAM/i.test(msg)) {
      console.error("  → Usuario o contraseña incorrectos. Revise la cadena en .env.");
    } else if (/ENOTFOUND|EAI_AGAIN/i.test(msg)) {
      console.error("  → No se resuelve el host. Revise su conexión a internet.");
    } else if (/ETIMEDOUT|timeout/i.test(msg)) {
      console.error("  → Tiempo agotado. Un firewall o proxy puede estar bloqueando el 5432.");
    } else if (/self.signed|certificate|SSL|TLS/i.test(msg)) {
      console.error("  → Problema de certificado. Confirme que la URL termine en ?sslmode=require");
    } else if (/ECONNREFUSED/i.test(msg)) {
      console.error("  → No hay servidor en esa dirección. ¿PostgreSQL local apagado?");
    }
    console.error("");
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
