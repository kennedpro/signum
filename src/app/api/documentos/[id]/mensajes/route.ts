import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { canViewDocument } from "@/lib/access";
import { addMessage, listMessages, type MessageKind } from "@/lib/messages";
import { logAudit } from "@/lib/audit";
import { cleanIdentity } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

const KINDS: MessageKind[] = ["comentario", "archivo", "remision"];

/** ¿La persona con sesión está relacionada con el documento? */
async function access(id: string) {
  const ctx = await getSessionContext();
  if (!ctx) return { error: NextResponse.json({ error: "Sesión requerida." }, { status: 401 }) };
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return { error: NextResponse.json({ error: "Documento no encontrado." }, { status: 404 }) };
  const parts = await db.select().from(recipients).where(eq(recipients.documentId, id));
  const related = canViewDocument(ctx, doc, parts);
  if (!related) return { error: NextResponse.json({ error: "Sin acceso a este documento." }, { status: 403 }) };
  return { ctx, doc, parts };
}

/** GET — hilo completo del documento (solo relacionados). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(id);
  if ("error" in a) return a.error;
  const messages = await listMessages(id);
  return NextResponse.json({ code: a.doc.docNumber ?? a.doc.draftCode ?? null, messages });
}

/**
 * POST — comentario libre, archivo o remisión (también después de la firma).
 * body: { body: string; kind?: "comentario"|"archivo"|"remision"; toEmail?: string; toName?: string }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await access(id);
  if ("error" in a) return a.error;
  const { ctx, doc, parts } = a;
  const payload = (await req.json().catch(() => ({}))) as { body?: unknown; kind?: unknown; toEmail?: unknown; toName?: unknown };
  const body = cleanIdentity(payload.body, 1500);
  if (!body || body.length < 2) return NextResponse.json({ error: "Escriba el comentario." }, { status: 400 });
  const kind = (KINDS as string[]).includes(String(payload.kind)) ? (payload.kind as MessageKind) : "comentario";

  // Archivar: solo documentos ya firmados/sellados que llegaron a la bandeja
  // de esta persona como destinatario, revisor, asistente, participante o copia
  // (o un usuario con rol de gestión documental).
  if (kind === "archivo") {
    const { canManageUsers } = await import("@/lib/roles");
    const myRows = parts.filter((p) => p.email.toLowerCase() === ctx.user.email.toLowerCase());
    const inboxRow = myRows.some((p) => ["destinatario", "attendee", "participant", "copy"].includes(p.kind));
    if (doc.status !== "completado" || (!inboxRow && !canManageUsers(ctx.user.systemRole))) {
      return NextResponse.json(
        { error: "Solo se puede archivar un documento firmado que haya llegado a su bandeja." },
        { status: 403 }
      );
    }
  }

  const toEmail = (cleanIdentity(payload.toEmail, 160) ?? "").toLowerCase() || null;
  const to = toEmail ? parts.find((p) => p.email.toLowerCase() === toEmail) : null;
  const toName = to?.name ?? cleanIdentity(payload.toName, 120) ?? null;

  const row = await addMessage({
    documentId: doc.id,
    fromUserId: ctx.user.id,
    fromName: ctx.user.name,
    fromEmail: ctx.user.email,
    toName,
    toEmail: toEmail ?? null,
    kind,
    body,
  });
  await logAudit([
    {
      documentId: doc.id,
      action: kind === "archivo" ? "archivado" : kind === "remision" ? "remitido" : "comentado",
      label: `${ctx.user.name} ${kind === "archivo" ? "archivó" : kind === "remision" ? "remitió" : "comentó"} “${doc.title}”${toName ? ` · para ${toName}` : ""}`,
      actorName: ctx.user.name,
      actorEmail: ctx.user.email,
      detail: body.slice(0, 200),
    },
  ]).catch(() => undefined);
  return NextResponse.json({ ok: true, message: row });
}
