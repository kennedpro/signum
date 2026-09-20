import type { SessionContext } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";

/* ═══════════════════════════════════════════════════════════════════
   REGLA ÚNICA DE ACCESO A UN DOCUMENTO

   · Relacionados: autor, remitente, firmante, revisores, destinatario y
     copias → pueden ver el documento (y su hilo / trazabilidad).
   · Privilegiados (admin / jefe de gestión documental) → pueden ver
     cualquier documento DE SU MISMA ORGANIZACIÓN, nunca de otra.
   · Administrador de plataforma → todas las organizaciones.
   Esta misma regla se usa en el expediente, el PDF, los mensajes y la
   búsqueda por radicado, para que no haya criterios divergentes.
   ═══════════════════════════════════════════════════════════════════ */

export type AccessDoc = { id: string; ownerId: string | null; senderId: string | null; organizationId: string | null };
export type AccessParty = { email: string; kind?: string };

export function canViewDocument(ctx: SessionContext, doc: AccessDoc, parties: AccessParty[]) {
  const email = ctx.user.email.toLowerCase();
  // El administrador de la PLATAFORMA puede observar todas las empresas y sus
  // documentos (requisito explícito). El privilegio por organización se limita
  // a la propia empresa; el relacionado, a los documentos donde participa.
  if (ctx.isPlatformAdmin) return true;
  if (doc.ownerId === ctx.user.id || doc.senderId === ctx.user.id) return true;
  if (parties.some((p) => p.email.toLowerCase() === email)) return true;
  if (canManageUsers(ctx.user.systemRole)) {
    // Privilegio limitado a la propia organización (documentos sin organización: solo plataforma)
    return Boolean(doc.organizationId) && doc.organizationId === ctx.orgId;
  }
  return false;
}

/** Documento firmado consultado por radicado: solo quien lo creó, quien lo firmó (y privilegiados de su organización). */
export function canViewSealedByRadicado(ctx: SessionContext, doc: AccessDoc, parties: AccessParty[]) {
  const email = ctx.user.email.toLowerCase();
  if (doc.ownerId === ctx.user.id || doc.senderId === ctx.user.id) return true;
  if (parties.some((p) => p.kind === "signer" && p.email.toLowerCase() === email)) return true;
  if (ctx.isPlatformAdmin) return true;
  if (canManageUsers(ctx.user.systemRole)) return Boolean(doc.organizationId) && doc.organizationId === ctx.orgId;
  return false;
}
