import "dotenv/config";
import type { Config } from "drizzle-kit";
import { needsSsl, normalizeDbUrl } from "./src/lib/db-url";
import { readEnv } from "./src/lib/env";

/**
 * Configuración de Drizzle Kit.
 * Lee DATABASE_URL desde .env y depura los parámetros que no son compatibles
 * con node-postgres (por ejemplo `channel_binding` de Neon).
 */
const raw = readEnv("DATABASE_URL") ?? "postgresql://signum:signum@127.0.0.1:5432/signum";

const url = normalizeDbUrl(raw);

export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: needsSsl(raw)
    ? { url, ssl: { rejectUnauthorized: false } }
    : { url },
} satisfies Config;
