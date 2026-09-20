import { randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { numberingLedger } from "@/db/schema";
import { docTypeOf } from "@/lib/doctypes";
import { officialTimestamp, sha256 } from "@/lib/crypto-sign";

/* ═══════════════════════════════════════════════════════════════════
   RADICACIÓN CONSECUTIVA POR ENTIDAD — CON LIBRO RADICADOR

   · En edición: código provisional 00000001, 00000002… (por entidad)
   · Al firmarse: radicado oficial PREFIJO-AÑO-NNNN (INF-2026-0316),
     consecutivo por entidad, tipo documental y año.

   GARANTÍAS (todas dentro de UNA conexión y UNA transacción):
   1. Serialización por entidad: pg_advisory_xact_lock. Dos personas que
      crean o firman "al tiempo" se encolan durante milisegundos; el
      segundo recibe el número siguiente. Nunca el mismo.
   2. Atomicidad: contador y asiento del libro se confirman juntos. Si el
      asiento falla, el número no se consume → sin huecos fantasma.
   3. Unicidad defensiva: índice único (org, scope, value) en el libro.
   4. Evidencia: quién, cuándo (NTP), IP, agente, y hash encadenado al
      asiento anterior de la misma entidad.
   5. Inmutabilidad: trigger en base de datos rechaza UPDATE/DELETE.
   ═══════════════════════════════════════════════════════════════════ */

export type IssueContext = {
  documentId?: string | null;
  documentTitle?: string | null;
  docType?: string | null;
  actorId?: string | null;
  actorName: string;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

type Issued = { value: number; code: string; ledgerId: string; hash: string };

async function issue(
  organizationId: string | null,
  scope: string,
  kind: "provisional" | "radicado",
  format: (v: number) => string,
  ctx: IssueContext
): Promise<Issued> {
  const ntp = await officialTimestamp();
  const orgKey = organizationId ?? "GLOBAL";

  // Una sola conexión física para toda la operación: el candado consultivo
  // de transacción vive en esa conexión y se libera en COMMIT/ROLLBACK.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ledger:${orgKey}`]);

    // 1) Consecutivo atómico
    const seq = await client.query<{ value: number | string }>(
      `INSERT INTO sequences (id, organization_id, scope, value, updated_at)
       VALUES ($1, $2, $3, 1, now())
       ON CONFLICT (organization_id, scope)
       DO UPDATE SET value = sequences.value + 1, updated_at = now()
       RETURNING value`,
      [randomUUID(), organizationId, scope]
    );
    const value = Number(seq.rows[0]?.value);
    if (!Number.isFinite(value)) throw new Error(`No se pudo obtener consecutivo ${scope}`);
    const code = format(value);

    // 2) Último eslabón del libro de esta entidad (bajo el candado → sin bifurcaciones)
    const prev = await client.query<{ hash: string }>(
      organizationId
        ? `SELECT hash FROM numbering_ledger WHERE organization_id = $1
           ORDER BY created_at DESC, id DESC LIMIT 1`
        : `SELECT hash FROM numbering_ledger WHERE organization_id IS NULL
           ORDER BY created_at DESC, id DESC LIMIT 1`,
      organizationId ? [organizationId] : []
    );
    const prevHash = prev.rows[0]?.hash ?? null;

    const hash = sha256([
      prevHash ?? "GENESIS",
      orgKey,
      scope,
      String(value),
      code,
      ctx.documentId ?? "",
      ctx.actorEmail ?? ctx.actorName,
      ntp.iso,
    ]);

    // 3) Asiento inmutable
    const ledgerId = randomUUID();
    await client.query(
      `INSERT INTO numbering_ledger
        (id, organization_id, scope, kind, value, code, document_id, document_title, doc_type,
         actor_id, actor_name, actor_email, ip, user_agent, ntp_iso, ntp_source, hash, prev_hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, clock_timestamp())`,
      [
        ledgerId, organizationId, scope, kind, value, code,
        ctx.documentId ?? null, ctx.documentTitle ?? null, ctx.docType ?? null,
        ctx.actorId ?? null, ctx.actorName, ctx.actorEmail ?? null,
        ctx.ip ?? null, ctx.userAgent ?? null, ntp.iso, ntp.source, hash, prevHash,
      ]
    );

    await client.query("COMMIT");
    return { value, code, ledgerId, hash };
  } catch (e) {
    try { await client.query("ROLLBACK"); } catch { /* ya cerrada */ }
    throw e;
  } finally {
    client.release();
  }
}

/** Código provisional de borrador: 00000001 */
export async function nextDraftCode(organizationId: string | null, ctx: IssueContext) {
  const r = await issue(organizationId, "draft", "provisional", (v) => String(v).padStart(8, "0"), ctx);
  return r.code;
}

/** Radicado oficial al firmar: INF-2026-0316 */
export async function nextRadicado(
  organizationId: string | null,
  docType: string,
  ctx: IssueContext,
  when = new Date()
) {
  const prefix = docTypeOf(docType).numberPrefix;
  const year = when.getFullYear();
  const r = await issue(
    organizationId,
    `${prefix}-${year}`,
    "radicado",
    (v) => `${prefix}-${year}-${String(v).padStart(4, "0")}`,
    { ...ctx, docType }
  );
  return r.code;
}

/** Muestra el identificador vigente del documento. */
export function displayNumber(doc: { docNumber: string | null; draftCode: string | null }) {
  return doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : "Sin código");
}

/**
 * Verificación forense del libro de una entidad.
 * Sigue los ENLACES de hash (no el reloj): desde GENESIS, cada eslabón
 * debe tener exactamente un sucesor y todos deben ser alcanzables.
 */
export async function verifyLedger(organizationId: string | null) {
  const rows = await db
    .select({
      id: numberingLedger.id,
      hash: numberingLedger.hash,
      prevHash: numberingLedger.prevHash,
      code: numberingLedger.code,
    })
    .from(numberingLedger)
    .where(
      organizationId
        ? eq(numberingLedger.organizationId, organizationId)
        : sql`${numberingLedger.organizationId} is null`
    )
    .orderBy(numberingLedger.createdAt, numberingLedger.id);

  if (rows.length === 0) return { ok: true, brokenAt: null, code: null, length: 0 };

  const byPrev = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.prevHash ?? "GENESIS";
    byPrev.set(k, [...(byPrev.get(k) ?? []), r]);
  }
  // Bifurcación: dos asientos con el mismo predecesor
  for (const [k, list] of byPrev) {
    if (list.length > 1) {
      const idx = rows.findIndex((r) => r.id === list[1].id);
      return { ok: false, brokenAt: idx, code: list[1].code, length: rows.length, reason: `bifurcación tras ${k.slice(0, 10)}` };
    }
  }
  // Recorrido desde GENESIS
  let cur = byPrev.get("GENESIS")?.[0];
  let visited = 0;
  while (cur) {
    visited++;
    cur = byPrev.get(cur.hash)?.[0];
  }
  if (visited !== rows.length) {
    return { ok: false, brokenAt: visited, code: null, length: rows.length, reason: "eslabón huérfano" };
  }
  return { ok: true, brokenAt: null, code: null, length: rows.length };
}
