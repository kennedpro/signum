import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, organizations, recipients, signatures, users } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { canViewDocument } from "@/lib/access";
import { docTypeOf } from "@/lib/doctypes";
import { logAudit } from "@/lib/audit";
import { renderDocumentPdf } from "@/lib/pdf/build-pdf";
import { parsePageSetup } from "@/lib/page-setup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/documentos/:id/pdf
 * PDF vectorial del documento (texto seleccionable) con certificado de
 * integridad. Requiere sesión. Pueden descargar:
 *  · Administrador / Jefe de Gestión Documental: siempre.
 *  · Autor, emisor o participante del documento: siempre.
 *  · Cualquier funcionario de la misma entidad: solo documentos completados.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{20,40}$/i.test(id)) {
    return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  }
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const parties = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, doc.id))
    .orderBy(asc(recipients.slot), asc(recipients.createdAt));

  const allowed = canViewDocument(ctx, doc, parties);
  if (!allowed) {
    return NextResponse.json({ error: "No tiene permiso para descargar este documento." }, { status: 403 });
  }

  const [org] = doc.organizationId
    ? await db.select().from(organizations).where(eq(organizations.id, doc.organizationId)).limit(1)
    : await db.select().from(organizations).orderBy(asc(organizations.createdAt)).limit(1);

  const [sender] = doc.senderId
    ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1)
    : [null];

  const sigs = await db
    .select()
    .from(signatures)
    .where(eq(signatures.documentId, doc.id))
    .orderBy(asc(signatures.slot), asc(signatures.createdAt));

  const dest = parties.find((p) => p.kind === "destinatario") ?? null;
  const def = docTypeOf(doc.docType);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  const verifyUrl = host ? `${proto}://${host}/verificar/${doc.id}` : `/verificar/${doc.id}`;

  try {
    const rendered = await renderDocumentPdf({
      title: doc.title,
      html: doc.content,
      apa: doc.apaEnabled,
      docType: doc.docType,
      docTypeShort: def.short,
      docNumber: doc.docNumber,
      draftCode: doc.draftCode,
      city: doc.city,
      subject: doc.subject,
      createdAt: doc.createdAt,
      lockedAt: doc.lockedAt,
      hashPre: doc.hashPre,
      hashPost: doc.hashPost,
      sealHash: doc.sealHash,
      verifyUrl,
      pageSetup: parsePageSetup(doc.pageSetup),
      org: {
        name: org?.name ?? "Organización",
        entityType: org?.entityType ?? "publica",
        nit: org?.nit,
        sigla: org?.sigla,
        city: org?.city,
        address: org?.address,
        phone: org?.phone,
        website: org?.website,
        logoVariant: org?.logoVariant,
        primaryColor: org?.primaryColor,
      },
      sender: sender
        ? { name: sender.name, cargo: sender.cargo ?? sender.role, dependencia: sender.dependencia }
        : null,
      destinatario: dest
        ? {
            name: dest.name,
            cargo: dest.cargo,
            dependencia: dest.dependencia ?? dest.department,
            external: dest.external,
            companyName: dest.companyName,
          }
        : null,
      stamps: sigs.map((s) => ({
        signerName: s.signerName,
        signerEmail: s.signerEmail,
        signerGrado: s.signerGrado,
        signerCargo: s.signerCargo,
        signerCedula: s.signerCedula,
        signerDependencia: s.signerDependencia,
        signerUnidad: s.signerUnidad,
        signerEmpresa: s.signerEmpresa,
        signerNit: s.signerNit,
        signerArea: s.signerArea,
        signerSucursal: s.signerSucursal,
        entityType: s.entityType,
        logoVariant: s.logoVariant,
        logoUrl: s.logoUrl,
        signatureData: s.signatureData,
        hashPost: s.hashPost,
        hash: s.hash,
        createdAt: s.createdAt,
        keyFingerprint: s.signerKeyFingerprint,
      })),
    });

    const base = doc.docNumber ?? `Borrador_${doc.draftCode ?? "sin-codigo"}`;
    const filename = `${base.replace(/[^A-Za-z0-9._-]+/g, "_")}_SIGNUM.pdf`;

    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    await logAudit([
      {
        documentId: doc.id,
        action: "exportado",
        label: `${ctx.user.name} descargó el PDF de “${doc.title}”`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `PDF vectorial · ${rendered.pages} página(s) · ${filename}`,
        ip,
      },
    ]).catch(() => undefined);

    return new Response(new Uint8Array(rendered.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(rendered.buffer.length),
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Signum-Pages": String(rendered.pages),
      },
    });
  } catch (error) {
    console.error("[SIGNUM][pdf]", error);
    return NextResponse.json({ error: "No fue posible generar el PDF." }, { status: 500 });
  }
}
