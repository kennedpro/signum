import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { needsSsl, normalizeDbUrl } from "@/lib/db-url";
import { readEnv } from "@/lib/env";

const raw = readEnv("DATABASE_URL");

if (!raw) {
  throw new Error(
    [
      "",
      "╭──────────────────────────────────────────────────────────╮",
      "│  Falta la variable DATABASE_URL                          │",
      "╰──────────────────────────────────────────────────────────╯",
      "",
      "  Cree el archivo .env en la raíz del proyecto. En Windows:",
      "     powershell -ExecutionPolicy Bypass -File scripts/crear-env.ps1",
      "",
      "  O manualmente con el contenido:",
      "     DATABASE_URL=postgresql://usuario:clave@host/base?sslmode=require",
      "",
      "  Verifique la conexión con:",
      "     npx tsx scripts/check-db.ts",
      "",
    ].join("\n")
  );
}

const connectionString = normalizeDbUrl(raw);
const ssl = needsSsl(raw) ? { rejectUnauthorized: false } : undefined;

const globalForDb = globalThis as typeof globalThis & {
  __signumPool?: Pool;
};

export const pool =
  globalForDb.__signumPool ??
  new Pool({
    connectionString,
    ssl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 20_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__signumPool = pool;
}

export const db = drizzle(pool);
