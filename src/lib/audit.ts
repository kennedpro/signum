import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, securityLogs } from "@/db/schema";
import { sha256 } from "@/lib/crypto-sign";

type AuditInput = Omit<typeof auditEvents.$inferInsert, "hash" | "prevHash">;
type SecurityInput = Omit<typeof securityLogs.$inferInsert, "hash" | "prevHash">;

/**
 * REGISTRO 1 — Logs de Documento (Trazabilidad).
 * Quién creó el archivo, qué se editó en la fase "líquida" y las IPs.
 * Cada fila encadena con el hash de la anterior (hash-chain).
 */
export async function logAudit(entries: AuditInput[]) {
  if (!entries.length) return;

  const [last] = await db
    .select({ hash: auditEvents.hash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  let prev = last?.hash ?? "GENESIS";
  const base = Date.now();
  const rows = entries.map((e, i) => {
    const at = e.createdAt instanceof Date ? e.createdAt : new Date(base + i);
    const hash = sha256([prev, e.action, e.label, e.actorName, e.documentId ?? "", at.toISOString()]);
    const row = { ...e, createdAt: at, prevHash: prev === "GENESIS" ? null : prev, hash };
    prev = hash;
    return row;
  });

  await db.insert(auditEvents).values(rows);
}

/**
 * REGISTRO 2 — Logs de Seguridad (Pista de Auditoría).
 * Intentos de firma exitosos y fallidos, estampas NTP y doble sellado.
 */
export async function logSecurity(entries: SecurityInput[]) {
  if (!entries.length) return;

  const [last] = await db
    .select({ hash: securityLogs.hash })
    .from(securityLogs)
    .orderBy(desc(securityLogs.createdAt))
    .limit(1);

  let prev = last?.hash ?? "GENESIS";
  const base = Date.now();
  const rows = entries.map((e, i) => {
    const at = e.createdAt instanceof Date ? e.createdAt : new Date(base + i);
    const hash = sha256([
      prev,
      e.event,
      e.result ?? "ok",
      e.actorName,
      e.documentId ?? "",
      e.ntpIso ?? "",
      e.hashPre ?? "",
      e.hashPost ?? "",
    ]);
    const row = { ...e, createdAt: at, prevHash: prev === "GENESIS" ? null : prev, hash };
    prev = hash;
    return row;
  });

  await db.insert(securityLogs).values(rows);
}

/**
 * Verificación forense: recorre la cadena siguiendo los enlaces de hash
 * (independiente del orden de consulta). Si algún eslabón no encuentra su
 * predecesor, la cadena está alterada.
 */
export function verifyChain(
  rows: { hash: string | null; prevHash: string | null }[]
): { ok: boolean; brokenAt: number | null; length: number } {
  if (rows.length === 0) return { ok: true, brokenAt: null, length: 0 };

  const byHash = new Map<string, { hash: string | null; prevHash: string | null }>();
  for (const r of rows) if (r.hash) byHash.set(r.hash, r);

  let linked = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.prevHash) {
      linked += 1;
      continue;
    }
    if (!byHash.has(r.prevHash)) {
      // El predecesor puede estar fuera de la ventana consultada.
      const isOldest = rows.every((o) => o.hash !== r.prevHash);
      if (isOldest && i !== rows.length - 1) return { ok: false, brokenAt: i, length: rows.length };
    }
    linked += 1;
  }
  return { ok: true, brokenAt: null, length: linked };
}

/**
 * Verificación forense de un documento contra la CADENA GLOBAL.
 * La bitácora encadena eventos de toda la entidad, así que se recorre la
 * cadena completa en orden y se comprueba que cada eslabón enlace con el
 * anterior. Devuelve además cuántos eventos del documento están cubiertos.
 */
export async function verifyDocumentChain(documentId: string) {
  const { asc } = await import("drizzle-orm");
  const all = await db
    .select({
      id: auditEvents.id,
      documentId: auditEvents.documentId,
      hash: auditEvents.hash,
      prevHash: auditEvents.prevHash,
    })
    .from(auditEvents)
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

  let brokenAt: number | null = null;
  for (let i = 1; i < all.length; i++) {
    if (all[i].prevHash !== all[i - 1].hash) {
      brokenAt = i;
      break;
    }
  }
  const mine = all.filter((r) => r.documentId === documentId);
  const covered = mine.every((r) => Boolean(r.hash));
  return {
    ok: brokenAt === null && covered,
    brokenAt,
    length: mine.length,
    globalLength: all.length,
  };
}
