import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documentMessages } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";

/* ═══════════════════════════════════════════════════════════════════
   HILO DE MENSAJES DEL DOCUMENTO
   Un único punto para escribir y leer los comentarios asociados a cada
   acción del flujo (enviar a aprobar, aprobar, devolver, firmar, archivar,
   remitir, comentario libre). El texto se sanea siempre en el servidor.
   ═══════════════════════════════════════════════════════════════════ */

export type MessageKind =
  | "envio_aprobacion"
  | "envio_firma"
  | "aprobacion"
  | "devolucion"
  | "firma"
  | "archivo"
  | "remision"
  | "comentario";

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
  envio_aprobacion: "Enviado a aprobación",
  envio_firma: "Enviado a firma",
  aprobacion: "Aprobación",
  devolucion: "Devuelto para corrección",
  firma: "Firma",
  archivo: "Archivado",
  remision: "Remitido",
  comentario: "Comentario",
};

export type NewMessage = {
  documentId: string;
  fromUserId?: string | null;
  fromName: string;
  fromEmail?: string | null;
  toName?: string | null;
  toEmail?: string | null;
  kind: MessageKind;
  body: string;
};

export async function addMessage(m: NewMessage) {
  const body = cleanIdentity(m.body, 1500);
  if (!body) return null;
  const [row] = await db
    .insert(documentMessages)
    .values({
      documentId: m.documentId,
      fromUserId: m.fromUserId ?? null,
      fromName: cleanIdentity(m.fromName, 120) ?? "Usuario",
      fromEmail: m.fromEmail ? (cleanIdentity(m.fromEmail, 160) ?? "").toLowerCase() || null : null,
      toName: m.toName ? cleanIdentity(m.toName, 120) : null,
      toEmail: m.toEmail ? (cleanIdentity(m.toEmail, 160) ?? "").toLowerCase() || null : null,
      kind: m.kind,
      body,
    })
    .returning();
  return row;
}

export async function listMessages(documentId: string) {
  return db
    .select()
    .from(documentMessages)
    .where(eq(documentMessages.documentId, documentId))
    .orderBy(asc(documentMessages.createdAt));
}
