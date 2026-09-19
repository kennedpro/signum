import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, documents, recipients, users } from "@/db/schema";
import { sanitizeDocumentHtml } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { getSessionContext, type SessionContext } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";
import { sha256 } from "@/lib/hash";
import { normalizePageSetup, serializePageSetup, splitDocumentHtml, joinDocumentHtml } from "@/lib/page-setup";
import { cleanIdentity } from "@/lib/sanitize";
import { ensureMetaBlock, stripLegacyMeta } from "@/lib/letterhead";
import { generateSignPassword, hashSignPassword, signToken } from "@/lib/crypto-sign";
import { and as andOp } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Ventana en la que los autoguardados consecutivos se registran como un solo evento. */
const AUTOSAVE_AUDIT_WINDOW_MS = 10 * 60 * 1000;

type Doc = typeof documents.$inferSelect;

/** Puede editar/eliminar el borrador: autor, emisor o rol privilegiado. */
function canEdit(ctx: SessionContext, doc: Doc) {
  if (canManageUsers(ctx.user.systemRole)) return true;
  return doc.ownerId === ctx.user.id || doc.senderId === ctx.user.id;
}

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}

/** GET /api/documentos/:id — datos y partes del documento (requiere sesión y pertenencia). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
  const parts = await db.select().from(recipients).where(eq(recipients.documentId, id));
  const involved =
    canManageUsers(ctx.user.systemRole) ||
    doc.ownerId === ctx.user.id ||
    doc.senderId === ctx.user.id ||
    parts.some((p) => p.email.toLowerCase() === ctx.user.email.toLowerCase());
  if (!involved) return NextResponse.json({ error: "Sin acceso a este documento." }, { status: 403 });
  const [sender] = doc.senderId ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1) : [null];
  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    subject: doc.subject,
    city: doc.city,
    status: doc.status,
    docType: doc.docType,
    senderId: doc.senderId,
    parties: [
      ...(sender
        ? [{ kind: "sender", userId: sender.id, name: sender.name, email: sender.email, cargo: sender.cargo ?? sender.role, department: sender.department, color: sender.color, photoUrl: sender.photoUrl }]
        : []),
      ...parts.map((p) => ({
        kind: p.kind, userId: p.userId, name: p.name, email: p.email, cargo: p.cargo, department: p.department,
        dependencia: p.dependencia, external: p.external, companyName: p.companyName, status: p.status, slotLabel: p.slotLabel,
      })),
    ],
  });
}

/**
 * PATCH /api/documentos/:id
 * Guarda título y contenido de un borrador. Admite `mode: "auto"` para el
 * autoguardado del editor: idempotente (sin escritura ni auditoría cuando
 * nada cambió) y con auditoría colapsada por ventanas de 10 minutos para
 * no inundar la bitácora. El guardado manual siempre deja evidencia.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    type PersonIn = { name?: unknown; email?: unknown; cargo?: unknown; department?: unknown; userId?: unknown; external?: unknown; companyName?: unknown; slotLabel?: unknown };
    const body = (await req.json()) as {
      title?: unknown; content?: unknown; mode?: unknown; pageSetup?: unknown;
      city?: unknown; subject?: unknown; senderId?: unknown;
      destinatario?: PersonIn | null;
      signer?: PersonIn | null;
      attendees?: PersonIn[];
      copies?: PersonIn[];
    };
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const person = (r: PersonIn | null | undefined) => {
      if (!r || typeof r !== "object") return null;
      const email = (cleanIdentity(r.email, 160) ?? "").toLowerCase();
      const name = cleanIdentity(r.name, 120);
      if (!name || !EMAIL_RE.test(email)) return null;
      return {
        name, email,
        cargo: cleanIdentity(r.cargo, 120),
        department: cleanIdentity(r.department, 120),
        userId: cleanIdentity(r.userId, 60),
        external: Boolean(r.external),
        companyName: cleanIdentity(r.companyName, 160),
        slotLabel: cleanIdentity(r.slotLabel, 60),
      };
    };
    const signerIn = body.signer !== undefined ? person(body.signer) : undefined;
    const attendeesIn = Array.isArray(body.attendees) ? body.attendees.map(person).filter((x): x is NonNullable<typeof x> => Boolean(x)).slice(0, 30) : undefined;
    const copiesIn = Array.isArray(body.copies) ? body.copies.map(person).filter((x): x is NonNullable<typeof x> => Boolean(x)).slice(0, 30) : undefined;
    const title = String(body.title ?? "").trim().slice(0, 220);
    let content = sanitizeDocumentHtml(String(body.content ?? ""));
    // Cambios de cabecera (configuración previa): opcionales
    const city = body.city !== undefined ? cleanIdentity(body.city, 80) : undefined;
    const subject = body.subject !== undefined ? (cleanIdentity(body.subject, 200) ?? "") : undefined;
    const senderId = body.senderId !== undefined ? cleanIdentity(body.senderId, 60) : undefined;
    const dest = body.destinatario && typeof body.destinatario === "object"
      ? {
          name: cleanIdentity(body.destinatario.name, 120),
          email: (cleanIdentity(body.destinatario.email, 160) ?? "").toLowerCase(),
          cargo: cleanIdentity(body.destinatario.cargo, 120),
          department: cleanIdentity(body.destinatario.department, 120),
          userId: cleanIdentity(body.destinatario.userId, 60),
          external: Boolean(body.destinatario.external),
          companyName: cleanIdentity(body.destinatario.companyName, 160),
        }
      : undefined;
    const headerChanged = city !== undefined || subject !== undefined || senderId !== undefined || dest !== undefined;
    const partiesChanged = signerIn !== undefined || attendeesIn !== undefined || copiesIn !== undefined;
    const auto = body.mode === "auto";
    // Configuración de página: se normaliza SIEMPRE (rangos seguros), nunca se guarda tal cual llega.
    const pageSetup =
      body.pageSetup && typeof body.pageSetup === "object"
        ? serializePageSetup(normalizePageSetup(body.pageSetup as Parameters<typeof normalizePageSetup>[0]))
        : undefined;
    if (!title) {
      return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });
    }

    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    if (!canEdit(ctx, doc)) {
      return NextResponse.json({ error: "No tiene permiso para editar este documento." }, { status: 403 });
    }
    if (doc.status !== "borrador") {
      return NextResponse.json(
        { error: "Solo se pueden editar documentos en borrador." },
        { status: 409 }
      );
    }

    // Configuración previa: firmante, asistentes y copias (sincronización de la tabla de partes)
    if (partiesChanged) {
      if (signerIn) {
        const [cur] = await db.select().from(recipients).where(andOp(eq(recipients.documentId, id), eq(recipients.kind, "signer"))).limit(1);
        const label = signerIn.slotLabel ?? cur?.slotLabel ?? "FIRMA AUTORIZADA";
        if (cur && cur.email.toLowerCase() === signerIn.email) {
          await db.update(recipients).set({ name: signerIn.name, cargo: signerIn.cargo, department: signerIn.department, dependencia: signerIn.department, userId: signerIn.userId, slotLabel: label }).where(eq(recipients.id, cur.id));
        } else {
          // Firmante nuevo: credenciales nuevas (las anteriores quedan inválidas)
          const creds = hashSignPassword(generateSignPassword());
          const values = { name: signerIn.name, email: signerIn.email, cargo: signerIn.cargo, department: signerIn.department, dependencia: signerIn.department, userId: signerIn.userId, slotLabel: label, token: signToken(), signPasswordHash: creds.hash, signPasswordSalt: creds.salt, status: "pendiente" as const, failedAttempts: 0, lockedUntil: null };
          if (cur) await db.update(recipients).set(values).where(eq(recipients.id, cur.id));
          else await db.insert(recipients).values({ documentId: id, kind: "signer", slot: 1, entityType: "publica", ...values });
        }
      }
      const syncKind = async (kind: "attendee" | "copy", list: NonNullable<typeof attendeesIn> | undefined) => {
        if (!list) return;
        const existing = await db.select().from(recipients).where(andOp(eq(recipients.documentId, id), eq(recipients.kind, kind)));
        const wanted = new Map(list.map((p) => [p.email, p]));
        for (const e of existing) {
          if (!wanted.has(e.email.toLowerCase())) await db.delete(recipients).where(eq(recipients.id, e.id));
        }
        for (const p of list) {
          const found = existing.find((e) => e.email.toLowerCase() === p.email);
          if (found) await db.update(recipients).set({ name: p.name, cargo: p.cargo, department: p.department, dependencia: p.department, userId: p.userId }).where(eq(recipients.id, found.id));
          else await db.insert(recipients).values({ documentId: id, kind, name: p.name, email: p.email, cargo: p.cargo, department: p.department, dependencia: p.department, userId: p.userId, entityType: "publica", token: signToken(), status: "pendiente" });
        }
      };
      await syncKind("attendee", attendeesIn);
      await syncKind("copy", copiesIn);
    }

    // Configuración previa: actualizar destinatario/remitente y reconstruir el bloque de datos
    // (fecha · destinatario · asunto) sin tocar el texto redactado por el usuario.
    if (headerChanged) {
      if (dest && dest.name && dest.email) {
        const [existing] = await db.select().from(recipients).where(and(eq(recipients.documentId, id), eq(recipients.kind, "destinatario"))).limit(1);
        const values = { name: dest.name, email: dest.email, cargo: dest.cargo, department: dest.department, dependencia: dest.department, userId: dest.userId, external: dest.external, companyName: dest.companyName };
        if (existing) await db.update(recipients).set(values).where(eq(recipients.id, existing.id));
        else await db.insert(recipients).values({ documentId: id, kind: "destinatario", status: "pendiente", token: (await import("@/lib/crypto-sign")).signToken(), entityType: "publica", ...values });
      }
      const newCity = city ?? doc.city;
      const newSubject = subject ?? doc.subject;
      const newSenderId = senderId ?? doc.senderId;
      const [snd] = newSenderId ? await db.select().from(users).where(eq(users.id, newSenderId)).limit(1) : [null];
      const [d2] = await db.select().from(recipients).where(and(eq(recipients.documentId, id), eq(recipients.kind, "destinatario"))).limit(1);
      const parts = splitDocumentHtml(content);
      // Retira el bloque de datos anterior (fecha, Señor(a)+destinatario, Asunto) y antepone el nuevo
      let bodyHtml = stripLegacyMeta(parts.body)
        .replace(/^(?:<p>[^<]*\d{1,2} de [a-záéíóú]+ de \d{4}<\/p>)?(?:<p><\/p>)*/i, "")
        .replace(/^<p>Se[ñn]or\(a\)<\/p>(?:<p>(?!<strong>Asunto)[\s\S]*?<\/p>){1,6}?(?:<p><\/p>)*/i, "")
        .replace(/^<p>Se certifica que<\/p>(?:<p>(?!<strong>Asunto)[\s\S]*?<\/p>){1,6}?(?:<p><\/p>)*/i, "")
        .replace(/^<p><strong>Asunto:<\/strong>[^<]*<\/p>(?:<p><\/p>)*/i, "");
      bodyHtml = ensureMetaBlock(bodyHtml, {
        docType: doc.docType, city: newCity, subject: newSubject, createdAt: doc.createdAt,
        sender: snd ? { name: snd.name, cargo: snd.cargo ?? snd.role, dependencia: snd.dependencia } : null,
        destinatario: d2 ? { name: d2.name, cargo: d2.cargo, dependencia: d2.dependencia ?? d2.department, external: d2.external, companyName: d2.companyName } : null,
      });
      content = sanitizeDocumentHtml(joinDocumentHtml({ ...parts, body: bodyHtml }));
    }

    const contentHash = sha256([content]);
    const unchanged = !headerChanged && !partiesChanged && doc.title === title && doc.content === content && (pageSetup === undefined || pageSetup === doc.pageSetup);
    if (unchanged) {
      return NextResponse.json({ ok: true, unchanged: true, savedAt: doc.updatedAt.toISOString(), contentHash });
    }

    const now = new Date();
    await db
      .update(documents)
      .set({
        title, content, updatedAt: now,
        ...(pageSetup !== undefined ? { pageSetup } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(subject !== undefined ? { subject: subject || null } : {}),
        ...(senderId !== undefined && senderId ? { senderId } : {}),
      })
      .where(and(eq(documents.id, id), eq(documents.status, "borrador")));

    let audited = true;
    if (auto) {
      const [recent] = await db
        .select({ id: auditEvents.id })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.documentId, id),
            eq(auditEvents.action, "editado"),
            eq(auditEvents.actorEmail, ctx.user.email),
            gt(auditEvents.createdAt, new Date(now.getTime() - AUTOSAVE_AUDIT_WINDOW_MS))
          )
        )
        .orderBy(desc(auditEvents.createdAt))
        .limit(1);
      audited = !recent;
    }

    if (audited) {
      await logAudit([
        {
          documentId: id,
          action: "editado",
          label: `${ctx.user.name} guardó cambios en “${title}”`,
          actorName: ctx.user.name,
          actorEmail: ctx.user.email,
          detail: `${auto ? "Autoguardado" : "Guardado manual"} · huella ${contentHash.slice(0, 12)}…`,
          ip: await clientIp(),
        },
      ]);
    }

    return NextResponse.json({ ok: true, savedAt: now.toISOString(), contentHash, audited });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo guardar el documento." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    if (!canEdit(ctx, doc)) {
      return NextResponse.json({ error: "No tiene permiso para eliminar este documento." }, { status: 403 });
    }
    if (doc.status !== "borrador") {
      return NextResponse.json({ error: "Solo se pueden eliminar borradores." }, { status: 409 });
    }

    await db.delete(documents).where(eq(documents.id, id));
    await logAudit([
      {
        documentId: null,
        action: "eliminado",
        label: `${ctx.user.name} eliminó el borrador “${doc.title}”`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: doc.draftCode ? `Borrador ${doc.draftCode}` : null,
        ip: await clientIp(),
      },
    ]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  }
}
