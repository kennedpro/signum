import { db } from "@/db";
import { sql } from "drizzle-orm";
import { getBootstrapState } from "@/lib/bootstrap-state";

export const dynamic = "force-dynamic";

/**
 * Estado de salud: conexión a la base y estado del arranque (bootstrap).
 * No expone datos sensibles: solo estado, intento y mensaje de error técnico.
 */
export async function GET() {
  const bootstrap = getBootstrapState();
  try {
    await db.execute(sql`select 1`);
    const ok = bootstrap.status !== "failed";
    return Response.json(
      { ok, database: "up", bootstrap },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { ok: false, database: "down", error: message, bootstrap },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
