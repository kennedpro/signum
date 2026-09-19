import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";

export type InboxView = "firma" | "actas" | "edicion" | "conocimiento" | "aprobacion";

export type InboxItem = {
  id: string;
  title: string;
  docType: string;
  docNumber: string | null;
  draftCode: string | null;
  status: string;
  updatedAt: Date;
  ownerName: string | null;
  ownerColor: string | null;
  ownerPhoto: string | null;
  myRole: string;
  myStatus: string | null;
  token: string | null;
  slotLabel: string | null;
};

const BASE = {
  id: documents.id,
  title: documents.title,
  docType: documents.docType,
  docNumber: documents.docNumber,
  draftCode: documents.draftCode,
  status: documents.status,
  updatedAt: documents.updatedAt,
  ownerName: users.name,
  ownerColor: users.color,
  ownerPhoto: users.photoUrl,
};

/** Documentos que la persona debe firmar (designada por quien creó el documento). */
async function forSignature(email: string) {
  return db
    .select({
      ...BASE,
      myStatus: recipients.status,
      token: recipients.token,
      slotLabel: recipients.slotLabel,
    })
    .from(recipients)
    .innerJoin(documents, eq(recipients.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(
      and(
        eq(recipients.email, email),
        eq(recipients.kind, "signer"),
        inArray(recipients.status, ["pendiente", "visto"]),
        inArray(documents.status, ["en_firma", "en_aprobacion"])
      )
    )
    .orderBy(desc(documents.updatedAt));
}

/** Actas en las que la persona figura (asistente, firmante o autora). */
async function myActas(email: string, userId: string | null) {
  return db
    .selectDistinctOn([documents.id], {
      ...BASE,
      myStatus: recipients.status,
      token: recipients.token,
      slotLabel: recipients.slotLabel,
    })
    .from(documents)
    .leftJoin(recipients, eq(recipients.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(
      and(
        eq(documents.docType, "acta"),
        or(
          eq(recipients.email, email),
          userId ? eq(documents.ownerId, userId) : sql`false`,
          userId ? eq(documents.senderId, userId) : sql`false`
        )
      )
    )
    .orderBy(documents.id);
}

/** Borradores propios en edición. */
async function myDrafts(userId: string | null) {
  if (!userId) return [];
  return db
    .select({ ...BASE, myStatus: sql<string | null>`null`, token: sql<string | null>`null`, slotLabel: sql<string | null>`null` })
    .from(documents)
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(
      and(
        eq(documents.status, "borrador"),
        or(eq(documents.ownerId, userId), eq(documents.senderId, userId))
      )
    )
    .orderBy(desc(documents.updatedAt));
}

/** Participantes (destinatario, asistentes, copias) pendientes de aprobar. */
async function forApproval(email: string) {
  return db
    .select({
      ...BASE,
      myStatus: recipients.status,
      token: recipients.token,
      slotLabel: recipients.slotLabel,
    })
    .from(recipients)
    .innerJoin(documents, eq(recipients.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(
      and(
        eq(recipients.email, email),
        eq(recipients.kind, "attendee"),
        inArray(recipients.status, ["pendiente", "visto"]),
        eq(documents.status, "en_aprobacion")
      )
    )
    .orderBy(desc(documents.updatedAt));
}

/** Copias de conocimiento, participaciones, asistencias y destinatarios finales.
 *  El DESTINATARIO solo ve el documento en Conocimiento una vez firmado/sellado. */
async function myKnowledge(email: string) {
  return db
    .select({
      ...BASE,
      myStatus: recipients.status,
      token: recipients.token,
      slotLabel: recipients.kind,
    })
    .from(recipients)
    .innerJoin(documents, eq(recipients.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(
      and(
        eq(recipients.email, email),
        or(
          inArray(recipients.kind, ["copy", "attendee", "participant"]),
          and(eq(recipients.kind, "destinatario"), eq(documents.status, "completado"))
        )
      )
    )
    .orderBy(desc(documents.updatedAt));
}

export async function getInbox(view: InboxView, email: string, userId: string | null) {
  const rows =
    view === "firma"
      ? await forSignature(email)
      : view === "aprobacion"
        ? await forApproval(email)
        : view === "actas"
          ? await myActas(email, userId)
          : view === "edicion"
            ? await myDrafts(userId)
            : await myKnowledge(email);

  const roleOf: Record<InboxView, string> = {
    firma: "Firmante designado",
    aprobacion: "Revisor por aprobar",
    actas: "Relacionado en el acta",
    edicion: "Autor / borrador",
    conocimiento: "Conocimiento",
  };

  return rows.map<InboxItem>((r) => ({
    id: r.id,
    title: r.title,
    docType: r.docType,
    docNumber: r.docNumber,
    draftCode: r.draftCode,
    status: r.status,
    updatedAt: r.updatedAt,
    ownerName: r.ownerName,
    ownerColor: r.ownerColor,
    ownerPhoto: r.ownerPhoto,
    myRole: roleOf[view],
    myStatus: r.myStatus ?? null,
    token: r.token ?? null,
    slotLabel: r.slotLabel ?? null,
  }));
}

export async function getInboxCounts(email: string, userId: string | null) {
  const [a, b, c, d, e] = await Promise.all([
    forSignature(email),
    myActas(email, userId),
    myDrafts(userId),
    myKnowledge(email),
    forApproval(email),
  ]);
  return {
    firma: a.length,
    actas: b.length,
    edicion: c.length,
    conocimiento: d.length,
    aprobacion: e.length,
  };
}

/** Usuario autenticado en la sesión actual. */
export async function currentUser() {
  const { getSessionUser } = await import("@/lib/auth");
  return getSessionUser();
}
