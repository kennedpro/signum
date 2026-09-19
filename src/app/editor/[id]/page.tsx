import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";
import { WordEditor } from "@/components/editor/word-editor";
import { getSessionContext, canManageUsers } from "@/lib/auth";
import { docTypeOf } from "@/lib/doctypes";
import type { PdfEvidence } from "@/components/download-pdf";
import type { DocMetaProps } from "@/components/doc-meta-block";
import type { StampData } from "@/components/signature-stamp";
import { withLetterhead, stripLegacyMeta, ensureMetaBlock, ensureContactBlock, tightenSignature, ensureAnexos } from "@/lib/letterhead";
import { splitDocumentHtml, joinDocumentHtml } from "@/lib/page-setup";
import { parsePageSetup } from "@/lib/page-setup";

export const metadata: Metadata = { title: "Editor de documento" };
export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/editor/${id}`)}`);

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) notFound();
  if (!ctx.isPlatformAdmin && doc.organizationId && doc.organizationId !== ctx.orgId) notFound();

  const org = ctx.org;
  const def = docTypeOf(doc.docType);

  const parties = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, id))
    .orderBy(asc(recipients.slot), asc(recipients.createdAt));

  const [sender] = doc.senderId
    ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1)
    : [null];

  const dest = parties.find((p) => p.kind === "destinatario") ?? null;
  const signers = parties.filter((p) => p.kind === "signer");

  const meta: DocMetaProps = {
    docType: doc.docType,
    code: doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : def.short),
    city: doc.city,
    subject: doc.subject,
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
    createdAt: doc.createdAt.toISOString(),
  };

  // Previsualización: los contenedores se muestran "como quedarían firmados"
  // con los datos de cada firmante, sin rúbrica todavía.
  const previewStamps: StampData[] = signers.map((s) => ({
    entityType: s.entityType,
    signerName: s.name,
    signerEmail: s.email,
    signerGrado: s.grado,
    signerCargo: s.cargo,
    signerCedula: s.cedula,
    signerDependencia: s.dependencia ?? s.department,
    signerUnidad: s.unidad,
    signerEmpresa: s.empresa,
    signerNit: s.nit,
    signerArea: s.area,
    signerSucursal: s.sucursal,
    logoVariant: org?.logoVariant ?? "institucional",
    logoUrl: org?.logoUrl ?? null,
    signatureData: null,
    createdAt: new Date(),
  }));

  const pdf: PdfEvidence | null = canManageUsers(ctx.user.systemRole)
    ? {
        documentId: doc.id,
        radicado: doc.docNumber,
        draftCode: doc.draftCode,
        organization: org?.name ?? "—",
        title: doc.title,
        sealHash: doc.sealHash,
        hashPre: doc.hashPre,
        hashPost: doc.hashPost,
        lockedAt: doc.lockedAt ? doc.lockedAt.toISOString() : null,
        verifyUrl: `/verificar/${doc.id}`,
        signatures: [],
      }
    : null;

  // Borradores creados antes del membrete editable: se les incorpora al abrirlos
  // (queda guardado con el primer autoguardado). Los documentos cerrados no se tocan.
  const editable = doc.status === "borrador";
  const orgIn = {
    name: org?.name ?? "Organización",
    entityType: org?.entityType,
    nit: org?.nit,
    sigla: org?.sigla,
    city: org?.city,
    address: org?.address,
    phone: org?.phone,
    website: org?.website,
    logoVariant: org?.logoVariant,
  };
  // Migración en el servidor: el borrador llega al editor ya normalizado
  // (sin bloque redundante, con datos del destinatario y UN solo bloque de contacto).
  const normalize = (html: string) => {
    if (!editable) return html;
    const parts = splitDocumentHtml(html);
    parts.body = stripLegacyMeta(parts.body);
    parts.body = ensureMetaBlock(parts.body, {
      docType: doc.docType, city: doc.city, subject: doc.subject, createdAt: doc.createdAt,
      sender: meta.sender, destinatario: meta.destinatario,
    });
    parts.body = tightenSignature(ensureAnexos(ensureContactBlock(parts.body, orgIn)));
    parts.footer = "";
    return joinDocumentHtml(parts);
  };
  const initialContent = editable
    ? normalize(withLetterhead(
        doc.content,
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
          docType: doc.docType,
          city: doc.city,
          subject: doc.subject,
          createdAt: doc.createdAt,
          sender: sender
            ? { name: sender.name, cargo: sender.cargo ?? sender.role, dependencia: sender.dependencia, unidad: sender.unidad }
            : null,
          destinatario: meta.destinatario,
        }
      ))
    : doc.content;

  return (
    <WordEditor
      documentId={doc.id}
      initialTitle={doc.title}
      initialContent={initialContent}
      editable={editable}
      apa={doc.apaEnabled}
      docTypeShort={def.short}
      docNumber={doc.docNumber}
      draftCode={doc.draftCode}
      city={doc.city}
      expedienteUrl={`/documentos/${doc.id}`}
      pdf={pdf}
      meta={meta}
      previewStamps={previewStamps}
      initialPageSetup={parsePageSetup(doc.pageSetup)}
      returnNote={doc.returnNote}
      org={{
        name: org?.name ?? "Organización",
        entityType: org?.entityType ?? "publica",
        nit: org?.nit,
        sigla: org?.sigla,
        city: org?.city,
        address: org?.address,
        phone: org?.phone,
        website: org?.website,
        logoUrl: org?.logoUrl,
        logoVariant: org?.logoVariant,
        primaryColor: org?.primaryColor,
      }}
    />
  );
}
