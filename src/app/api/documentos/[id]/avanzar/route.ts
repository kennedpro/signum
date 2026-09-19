import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";
import { logAudit, logSecurity } from "@/lib/audit";
import { generateSignPassword, hashSignPassword, signToken } from "@/lib/crypto-sign";
import { pendingApprovals } from "@/lib/approvals";
import { cleanIdentity } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

/**
 * POST /api/documentos/:id/avanzar
 * El AUTOR/EMISOR (o un rol privilegiado) libera un documento detenido en
 * aprobación —por ejemplo, un participante que no responde o una cuenta de
 * plataforma que no aprueba— y lo pasa al firmante designado. Es una
 * excepción controlada: exige motivo, se registra quién la ejecutó y qué
 * aprobaciones quedaron pendientes, y emite credenciales nuevas al firmante.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
    const reason = cleanIdentity(body.reason, 400);
    if (!reason || reason.length < 5) {
      return NextResponse.json({ error: "Indique el motivo para avanzar sin todas las aprobaciones." }, { status: 400 });
    }

    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    const allowed = canManageUsers(ctx.user.systemRole) || doc.ownerId === ctx.user.id || doc.senderId === ctx.user.id;
    if (!allowed) return NextResponse.json({ error: "No tiene permiso sobre este documento." }, { status: 403 });
    if (doc.status !== "en_aprobacion") {
      return NextResponse.json({ error: "El documento no está en fase de aprobación." }, { status: 409 });
    }

    const [owner] = doc.ownerId ? await db.select().from(users).where(eq(users.id, doc.ownerId)).limit(1) : [null];
    const [sender] = doc.senderId ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1) : [null];
    const pending = await pendingApprovals(doc.id, [owner?.email, sender?.email]);

    const [signer] = await db
      .select()
      .from(recipients)
      .where(and(eq(recipients.documentId, doc.id), eq(recipients.kind, "signer")))
      .limit(1);
    if (!signer) return NextResponse.json({ error: "El documento no tiene firmante designado." }, { status: 409 });

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const ua = h.get("user-agent")?.slice(0, 200) ?? null;
    const now = new Date();

    const plain = generateSignPassword();
    const creds = hashSignPassword(plain);
    const newToken = signToken();
    await db
      .update(recipients)
      .set({ token: newToken, signPasswordHash: creds.hash, signPasswordSalt: creds.salt, status: "pendiente", failedAttempts: 0, lockedUntil: null })
      .where(eq(recipients.id, signer.id));
    await db.update(documents).set({ status: "en_firma", updatedAt: now }).where(eq(documents.id, doc.id));

    const skipped = pending.map((p) => `${p.name} (${p.kind})`).join(", ") || "ninguna";
    await logAudit([
      {
        documentId: doc.id,
        action: "enviado",
        label: `${ctx.user.name} avanzó “${doc.title}” al firmante sin completar las aprobaciones`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Motivo: ${reason} · Aprobaciones omitidas: ${skipped}`,
        ip,
      },
    ]);
    await logSecurity([
      {
        documentId: doc.id,
        event: "excepcion_aprobacion",
        result: "ok",
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Avance manual a firma · omitidas: ${skipped} · motivo: ${reason}`,
        ip,
        userAgent: ua,
      },
    ]);

    return NextResponse.json({
      ok: true,
      status: "en_firma",
      skipped: pending.map((p) => ({ name: p.name, kind: p.kind })),
      signer: { name: signer.name, email: signer.email, token: newToken, password: plain, slotLabel: signer.slotLabel ?? "FIRMA AUTORIZADA" },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo avanzar el documento." }, { status: 500 });
  }
}
