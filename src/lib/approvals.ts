import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { recipients } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════
   REGLA DE APROBACIÓN PREVIA A LA FIRMA

   Las personas designadas como REVISORES/APROBADORES deben aprobar antes de
   que el documento llegue al firmante designado. Quedan fuera del quórum:
     · el firmante (su acto es la firma, no la aprobación);
     · el autor/emisor del documento (no se aprueba a sí mismo);
     · quienes ya aprobaron o ya firmaron.
   Si el autor es el propio firmante y no hay más participantes, el
   documento pasa directo a firma.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Solo los REVISORES designados ("attendee") aprueban: son las personas a las
 * que el autor pide "verifique y apruebe" antes de enviar a firma. El
 * destinatario y las copias reciben el resultado; no aprueban.
 */
export const APPROVER_KINDS = ["attendee"] as const;

export type ApproverRow = typeof recipients.$inferSelect;

/** Participantes que deben aprobar (excluye autor/emisor y firmantes). */
export async function listApprovers(documentId: string, excludeEmails: (string | null | undefined)[]) {
  const excluded = new Set(excludeEmails.filter(Boolean).map((e) => String(e).toLowerCase()));
  const signers = await db
    .select({ email: recipients.email })
    .from(recipients)
    .where(and(eq(recipients.documentId, documentId), eq(recipients.kind, "signer")));
  for (const s of signers) excluded.add(s.email.toLowerCase());

  const rows = await db
    .select()
    .from(recipients)
    .where(
      and(
        eq(recipients.documentId, documentId),
        inArray(recipients.kind, [...APPROVER_KINDS]),
        ne(recipients.status, "firmado")
      )
    );
  // Una misma persona puede figurar con varios roles: cuenta una sola vez.
  const seen = new Set<string>();
  return rows.filter((r) => {
    const e = r.email.toLowerCase();
    if (excluded.has(e) || seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}

/** Aprobaciones pendientes del documento. */
export async function pendingApprovals(documentId: string, excludeEmails: (string | null | undefined)[]) {
  const approvers = await listApprovers(documentId, excludeEmails);
  // "informado" = el emisor decidió no pedirle aprobación (o ya se cerró el flujo): no bloquea.
  return approvers.filter((a) => a.status !== "aprobado" && a.status !== "informado");
}

/** Marca como aprobadas TODAS las filas de una misma persona (todos sus roles). */
export async function markApproved(documentId: string, email: string, now: Date) {
  await db
    .update(recipients)
    .set({ status: "aprobado", approvedAt: now })
    .where(
      and(
        eq(recipients.documentId, documentId),
        inArray(recipients.kind, [...APPROVER_KINDS]),
        eq(recipients.email, email)
      )
    );
}

export function isApproverKind(kind: string): kind is (typeof APPROVER_KINDS)[number] {
  return (APPROVER_KINDS as readonly string[]).includes(kind);
}
