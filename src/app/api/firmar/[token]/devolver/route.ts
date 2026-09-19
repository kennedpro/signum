import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { logAudit, logSecurity } from "@/lib/audit";
import { cleanIdentity } from "@/lib/sanitize";
import { addMessage } from "@/lib/messages";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * POST /api/firmar/:token/devolver
 * El FIRMANTE designado devuelve el documento al autor para corrección, con
 * un motivo obligatorio. El documento vuelve a "borrador" (editable por su
 * autor), se invalidan las credenciales de firma emitidas y todo queda en la
 * bitácora. Solo procede mientras el documento está en firma y el firmante
 * aún no ha firmado.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
      return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
    }
    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = cleanIdentity(body.reason, 600);
    if (!reason || reason.length < 5) {
      return NextResponse.json(
        { error: "Indique el motivo de la devolución (mínimo 5 caracteres)." },
        { status: 400 }
      );
    }

    const [recipient] = await db.select().from(recipients).where(eq(recipients.token, token)).limit(1);
    if (!recipient) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
    if (recipient.status === "firmado") {
      return NextResponse.json({ error: "Ya firmó este documento; no puede devolverlo." }, { status: 409 });
    }

    const [doc] = await db.select().from(documents).where(eq(documents.id, recipient.documentId)).limit(1);
    if (!doc) return NextResponse.json({ error: "Documento no disponible." }, { status: 404 });
    // Firmante: devuelve en fase de firma. Participantes: devuelven en fase de aprobación.
    const isSigner = recipient.kind === "signer";
    if (isSigner && doc.status !== "en_firma") {
      return NextResponse.json({ error: "El documento no está en fase de firma." }, { status: 409 });
    }
    if (!isSigner && doc.status !== "en_aprobacion") {
      return NextResponse.json({ error: "El documento no está en fase de aprobación." }, { status: 409 });
    }

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const ua = h.get("user-agent")?.slice(0, 200) ?? null;
    const now = new Date();

    // 1) Documento vuelve a borrador con la observación del firmante.
    await db
      .update(documents)
      .set({ status: "borrador", returnNote: `${recipient.name}: ${reason}`, updatedAt: now })
      .where(and(eq(documents.id, doc.id), inArray(documents.status, ["en_firma", "en_aprobacion"])));

    // 2) Se invalidan los enlaces/claves de firma emitidos (se regeneran al reenviar).
    await db
      .update(recipients)
      .set({ status: "pendiente", signPasswordHash: null, signPasswordSalt: null, otpHash: null, otpExpiresAt: null, otpAttempts: 0, viewedAt: null })
      .where(and(eq(recipients.documentId, doc.id), eq(recipients.kind, "signer"), inArray(recipients.status, ["pendiente", "visto"])));

    // 2b) Las aprobaciones ya otorgadas se reinician: el documento va a cambiar.
    await db
      .update(recipients)
      .set({ status: "pendiente", approvedAt: null })
      .where(and(eq(recipients.documentId, doc.id), eq(recipients.kind, "attendee"), eq(recipients.status, "aprobado")));

    // 2c) Hilo de mensajes: la observación va dirigida al autor/emisor.
    const [authorRow] = doc.senderId
      ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1)
      : doc.ownerId
        ? await db.select().from(users).where(eq(users.id, doc.ownerId)).limit(1)
        : [null];
    await addMessage({
      documentId: doc.id,
      fromName: recipient.name,
      fromEmail: recipient.email,
      toName: authorRow?.name ?? null,
      toEmail: authorRow?.email ?? null,
      kind: "devolucion",
      body: reason,
    });

    // 3) Trazabilidad (bitácora encadenada + registro de seguridad).
    await logAudit([
      {
        documentId: doc.id,
        action: "devuelto",
        label: `${recipient.name} devolvió “${doc.title}” para corrección`,
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: reason,
        ip,
      },
    ]);
    await logSecurity([
      {
        documentId: doc.id,
        recipientId: recipient.id,
        event: "devolucion",
        result: "ok",
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: `Enlace de firma invalidado · motivo registrado (${reason.length} caracteres)`,
        ip,
        userAgent: ua,
      },
    ]);

    return NextResponse.json({ ok: true, status: "borrador" });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo devolver el documento." }, { status: 500 });
  }
}
