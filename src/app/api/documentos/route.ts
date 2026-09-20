import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";
import { sanitizeDocumentHtml, cleanIdentity } from "@/lib/sanitize";
import { logAudit } from "@/lib/audit";
import { buildDocumentHtml, docTypeOf, type DocTypeKey } from "@/lib/doctypes";
import { withLetterhead } from "@/lib/letterhead";
import { generateSignPassword, hashSignPassword, signToken } from "@/lib/crypto-sign";
import { getSessionContext } from "@/lib/auth";
import { nextDraftCode } from "@/lib/radicado";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PartyIn = {
  name?: unknown;
  email?: unknown;
  cargo?: unknown;
  department?: unknown;
  slotLabel?: unknown;
  userId?: unknown;
  external?: unknown;
  companyName?: unknown;
};

function one(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PartyIn;
  const name = cleanIdentity(p.name, 120) ?? "";
  const email = (cleanIdentity(p.email, 160) ?? "").toLowerCase();
  if (!name || !EMAIL_RE.test(email)) return null;
  return {
    name,
    email,
    cargo: cleanIdentity(p.cargo, 90) ?? "",
    department: cleanIdentity(p.department, 90) ?? "",
    slotLabel: (cleanIdentity(p.slotLabel, 60) ?? "FIRMA AUTORIZADA").toUpperCase(),
    userId: cleanIdentity(p.userId, 60),
    external: Boolean(p.external),
    companyName: cleanIdentity(p.companyName, 140) ?? "",
  };
}

function many(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list.map(one).filter((p): p is NonNullable<typeof p> => Boolean(p)).slice(0, 25);
}

export async function POST(req: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const body = await req.json();
    const docType = (
      ["acta", "informe", "memorando", "oficio", "contrato", "certificacion"].includes(
        String(body.docType)
      )
        ? body.docType
        : "memorando"
    ) as DocTypeKey;
    const def = docTypeOf(docType);
    const title = cleanIdentity(body.title, 200) ?? "";
    if (title.length < 3) {
      return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });
    }

    const signers = many(body.signers).slice(0, 1);
    if (signers.length !== 1) {
      return NextResponse.json(
        { error: "Debe designar un único firmante de la entidad." },
        { status: 400 }
      );
    }
    const destinatario = one(body.destinatario);
    if (!destinatario) {
      return NextResponse.json({ error: "El destinatario es obligatorio." }, { status: 400 });
    }
    const attendees = many(body.attendees);
    const copies = many(body.copies);
    const org = ctx.org;
    const entityType = org?.entityType === "privada" ? "privada" : "publica";

    const senderId = cleanIdentity(body.senderId, 60) ?? ctx.user.id;
    const [sender] = await db.select().from(users).where(eq(users.id, senderId)).limit(1);

    const city = cleanIdentity(body.city, 80) ?? org?.city ?? "Bogotá D.C.";
    const subject = cleanIdentity(body.subject, 200) ?? "";
    const apaEnabled = Boolean(body.apaEnabled);

    // Código provisional de edición (00000001), asentado en el libro radicador
    // con quién lo pidió, cuándo y desde dónde. El radicado oficial se asigna al firmar.
    const h = req.headers;
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const draftCode = await nextDraftCode(ctx.orgId, {
      documentTitle: title,
      docType,
      actorId: ctx.user.id,
      actorName: ctx.user.name,
      actorEmail: ctx.user.email,
      ip,
      userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
    });

    const html = buildDocumentHtml({
      docType,
      docNumber: "",
      title,
      subject,
      city,
      apaEnabled,
      sender: {
        name: sender?.name ?? ctx.user.name,
        cargo: sender?.cargo ?? sender?.role,
        department: sender?.department,
      },
      destinatario,
      signers,
      attendees,
      participants: [],
      copies,
    });

    const fullHtml = withLetterhead(
      html,
      {
        name: org?.name ?? "Organización",
        entityType: org?.entityType,
        nit: org?.nit,
        sigla: org?.sigla,
        city: org?.city,
        address: org?.address,
        phone: org?.phone,
        website: org?.website,
        logoVariant: org?.logoVariant,
      },
      {
        docType,
        city,
        subject,
        createdAt: new Date(),
        sender: {
          name: sender?.name ?? ctx.user.name,
          cargo: sender?.cargo ?? sender?.role,
          dependencia: sender?.dependencia ?? sender?.department,
          unidad: sender?.unidad ?? null,
        },
        destinatario: {
          name: destinatario.name,
          cargo: destinatario.cargo,
          dependencia: destinatario.department,
          external: destinatario.external,
          companyName: destinatario.companyName,
        },
      }
    );

    const [doc] = await db
      .insert(documents)
      .values({
        organizationId: ctx.orgId,
        docType,
        docNumber: null,
        draftCode,
        title,
        subject: subject || null,
        city,
        content: sanitizeDocumentHtml(fullHtml),
        apaEnabled,
        status: "borrador",
        configLocked: true,
        ownerId: ctx.user.id,
        senderId: sender?.id ?? ctx.user.id,
      })
      .returning({ id: documents.id });

    const rows: (typeof recipients.$inferInsert)[] = [];
    const s = signers[0];
    const creds = hashSignPassword(generateSignPassword());
    rows.push({
      documentId: doc.id,
      kind: "signer",
      slot: 1,
      slotLabel: s.slotLabel,
      userId: s.userId,
      name: s.name,
      email: s.email,
      cargo: s.cargo || null,
      department: s.department || null,
      entityType,
      token: signToken(),
      signPasswordHash: creds.hash,
      signPasswordSalt: creds.salt,
      status: "pendiente",
    });
    rows.push({
      documentId: doc.id,
      kind: "destinatario",
      userId: destinatario.userId,
      name: destinatario.name,
      email: destinatario.email,
      cargo: destinatario.cargo || null,
      department: destinatario.department || null,
      external: destinatario.external,
      companyName: destinatario.companyName || null,
      entityType,
      token: signToken(),
      status: "pendiente",
    });
    for (const a of attendees) {
      rows.push({
        documentId: doc.id,
        kind: "attendee",
        userId: a.userId,
        name: a.name,
        email: a.email,
        cargo: a.cargo || null,
        department: a.department || null,
        entityType,
        token: signToken(),
        status: "pendiente",
      });
    }
    for (const c of copies) {
      rows.push({
        documentId: doc.id,
        kind: "copy",
        userId: c.userId,
        name: c.name,
        email: c.email,
        cargo: c.cargo || null,
        department: c.department || null,
        entityType,
        token: signToken(),
        status: "pendiente",
      });
    }
    await db.insert(recipients).values(rows);

    await logAudit([
      {
        documentId: doc.id,
        action: "creado",
        label: `Se creó ${def.label.toLowerCase()} “${title}”`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Borrador ${draftCode} · 1 firmante · ${attendees.length} asistente(s) · destinatario ${destinatario.name}`,
      },
    ]);

    return NextResponse.json({ id: doc.id, draftCode });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo crear el documento." }, { status: 500 });
  }
}
