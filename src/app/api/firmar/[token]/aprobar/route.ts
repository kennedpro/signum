import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { documents, organizations, recipients, signatures, users } from "@/db/schema";
import { logAudit, logSecurity } from "@/lib/audit";
import { generateSignPassword, hashSignPassword, sha256, signToken } from "@/lib/crypto-sign";
import { isApproverKind, markApproved, pendingApprovals } from "@/lib/approvals";
import { addMessage } from "@/lib/messages";
import { nextRadicado } from "@/lib/radicado";
import { cleanIdentity } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/**
 * POST /api/firmar/:token/aprobar
 * Aprobación de un participante (destinatario, asistente, copia). Cuando
 * TODOS los participantes han aprobado, el documento pasa al firmante
 * designado con credenciales nuevas (enlace + clave fuera de banda).
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = (await req.json().catch(() => ({}))) as { comment?: unknown };
  const comment = cleanIdentity(payload.comment, 1500);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const [recipient] = await db.select().from(recipients).where(eq(recipients.token, token)).limit(1);
  if (!recipient) return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  if (!isApproverKind(recipient.kind)) {
    return NextResponse.json({ error: "Este enlace no es de aprobación." }, { status: 409 });
  }
  if (recipient.status === "aprobado") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (recipient.status === "informado") {
    return NextResponse.json({ error: "Este documento le fue compartido como copia; no requiere su aprobación." }, { status: 409 });
  }

  const [doc] = await db.select().from(documents).where(eq(documents.id, recipient.documentId)).limit(1);
  if (!doc) return NextResponse.json({ error: "Documento no disponible." }, { status: 404 });
  if (doc.status !== "en_aprobacion") {
    return NextResponse.json({ error: "Este documento no está en fase de aprobación." }, { status: 409 });
  }

  const now = new Date();
  await markApproved(doc.id, recipient.email, now);

  await logAudit([
    {
      documentId: doc.id,
      action: "aprobado",
      label: `${recipient.name} aprobó “${doc.title}”`,
      actorName: recipient.name,
      actorEmail: recipient.email,
      detail: `Rol: ${recipient.kind}`,
      ip,
    },
  ]);
  await logSecurity([
    {
      documentId: doc.id,
      recipientId: recipient.id,
      event: "autorizacion",
      result: "ok",
      actorName: recipient.name,
      actorEmail: recipient.email,
      detail: `Aprobación previa a la firma (${recipient.kind})`,
      ip,
    },
  ]);

  // Autor y emisor no forman parte del quórum.
  const [owner] = doc.ownerId ? await db.select().from(users).where(eq(users.id, doc.ownerId)).limit(1) : [null];
  const [sender] = doc.senderId ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1) : [null];
  await addMessage({
    documentId: doc.id,
    fromName: recipient.name,
    fromEmail: recipient.email,
    toName: sender?.name ?? owner?.name ?? null,
    toEmail: sender?.email ?? owner?.email ?? null,
    kind: "aprobacion",
    body: comment ?? "Documento aprobado.",
  });
  const pending = await pendingApprovals(doc.id, [owner?.email, sender?.email]);

  let released = false;
  let finalized = false;
  let radicado: string | null = doc.docNumber;
  let signerLink: { name: string; token: string; password: string } | null = null;
  if (pending.length === 0) {
    // La rúbrica del emisor/autor y del remitente NO se libera en el circuito
    // de aprobación: solo firman personas distintas de quien elaboró/envió.
    const excludedEmails = new Set(
      [owner?.email, sender?.email].filter(Boolean).map((e) => String(e).toLowerCase())
    );
    const signerRows = await db
      .select()
      .from(recipients)
      .where(and(eq(recipients.documentId, doc.id), eq(recipients.kind, "signer"), ne(recipients.status, "firmado")))
      .orderBy(asc(recipients.slot));
    const externalSigners = signerRows.filter((s) => !excludedEmails.has(s.email.toLowerCase()));

    if (externalSigners.length > 0) {
      // Una sola persona firma (modelo actual): se emiten credenciales a la primera pendiente.
      const signer = externalSigners[0];
      const plain = generateSignPassword();
      const creds = hashSignPassword(plain);
      const newToken = signToken();
      await db
        .update(recipients)
        .set({
          token: newToken,
          signPasswordHash: creds.hash,
          signPasswordSalt: creds.salt,
          status: "pendiente",
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(recipients.id, signer.id));
      signerLink = { name: signer.name, token: newToken, password: plain };
      await db.update(documents).set({ status: "en_firma", updatedAt: now }).where(eq(documents.id, doc.id));
      await logAudit([
        {
          documentId: doc.id,
          action: "enviado",
          label: `Todos los revisores aprobaron. “${doc.title}” pasó al firmante`,
          actorName: "SIGNUM",
          detail: `Firmante: ${signer.name}`,
        },
      ]);
    } else {
      // No queda ningún firmante externo (p. ej. el único firmante era el propio
      // emisor): el circuito de aprobación cierra el documento sin rúbrica del
      // emisor y lo sella/radica, dejando constancia de las aprobaciones.
      const [org] = await db
        .select()
        .from(organizations)
        .orderBy(asc(organizations.createdAt))
        .limit(1);
      const allSigs = await db.select({ hash: signatures.hash }).from(signatures).where(eq(signatures.documentId, doc.id));
      const seal = sha256([doc.content, ...allSigs.map((s) => s.hash), now.toISOString()]);
      if (!radicado) {
        radicado = await nextRadicado(
          doc.organizationId ?? org?.id ?? null,
          doc.docType,
          {
            documentId: doc.id,
            documentTitle: doc.title,
            actorId: owner?.id ?? null,
            actorName: "SIGNUM",
            actorEmail: null,
            ip,
            userAgent: null,
          },
          now
        );
      }
      await db
        .update(documents)
        .set({
          status: "completado",
          docNumber: radicado,
          radicadoAt: doc.radicadoAt ?? now,
          sealHash: seal,
          lockedAt: now,
          updatedAt: now,
        })
        .where(eq(documents.id, doc.id));
      await db
        .update(recipients)
        .set({ status: "informado" })
        .where(
          and(
            eq(recipients.documentId, doc.id),
            inArray(recipients.kind, ["copy", "destinatario", "attendee"])
          )
        );
      await logAudit([
        {
          documentId: doc.id,
          action: "radicado",
          label: `Documento radicado con el número ${radicado}`,
          actorName: "SIGNUM",
          actorEmail: null,
          detail: `Cierre por aprobación · Borrador ${doc.draftCode ?? "—"} → ${radicado}`,
        },
        {
          documentId: doc.id,
          action: "completado",
          label: `“${doc.title}” quedó sellado tras la aprobación (sin rúbrica del emisor)`,
          actorName: "SIGNUM",
          actorEmail: null,
          detail: `Sello ${seal.slice(0, 12)}… · ${allSigs.length} firma(s)`,
        },
      ]);
      await logSecurity([
        {
          documentId: doc.id,
          event: "sellado",
          result: "ok",
          actorName: "SIGNUM",
          detail: "Documento congelado tras circuito de aprobación",
          ntpIso: now.toISOString(),
          ntpSource: "SYS:server-utc",
          hashPost: seal,
        },
      ]);
      await addMessage({
        documentId: doc.id,
        fromName: "SIGNUM",
        fromEmail: null,
        toName: null,
        toEmail: null,
        kind: "aprobacion",
        body: `Todos los revisores aprobaron; el documento se radicó${radicado ? ` con el número ${radicado}` : ""} y quedó en solo lectura.`,
      }).catch(() => undefined);
      finalized = true;
    }
    released = true;
  }

  return NextResponse.json({
    ok: true,
    released,
    finalized,
    radicado,
    remaining: pending.length,
    signer: signerLink,
  });
}
