import Link from "next/link";
import { headers } from "next/headers";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  documents,
  organizations,
  recipients,
  signatures,
  users,
} from "@/db/schema";
import type { EntityType } from "@/lib/entity";
import { docTypeOf, docTypeTitle } from "@/lib/doctypes";
import { SetPageTitle } from "@/components/page-title";
import { getSessionContext } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";
import type { PdfEvidence } from "@/components/download-pdf";
import { listMessages } from "@/lib/messages";
import { SignFlow } from "@/components/sign-flow";
import { parsePageSetup } from "@/lib/page-setup";
import { ShieldX, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FirmarTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [recipient] = await db
    .select()
    .from(recipients)
    .where(eq(recipients.token, token))
    .limit(1);

  if (!recipient) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10">
          <ShieldX className="h-6 w-6 text-rose-400" />
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-100">
          Enlace no válido
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          Este enlace de firma no existe o fue revocado. Solicite al emisor un nuevo
          enlace seguro.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-neon/40 bg-neon/10 px-5 py-2.5 text-[12.5px] font-bold text-neonsoft"
        >
          <ArrowLeft className="h-4 w-4" />
          Ir a la consola
        </Link>
      </div>
    );
  }

  const [doc] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, recipient.documentId))
    .limit(1);

  if (!doc) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-display text-2xl font-bold text-slate-100">
          Documento no disponible
        </h1>
        <p className="mt-2 text-[13px] text-slate-400">
          El documento asociado a este enlace fue retirado.
        </p>
      </div>
    );
  }

  // Apertura: una sola vez (evita duplicados si el servidor renderiza dos veces)
  if (recipient.status === "pendiente") {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const opened = await db
      .update(recipients)
      .set({ status: "visto", viewedAt: new Date() })
      .where(and(eq(recipients.id, recipient.id), eq(recipients.status, "pendiente")))
      .returning({ id: recipients.id });
    if (opened.length > 0) {
      const { logAudit } = await import("@/lib/audit");
      await logAudit([
        {
          documentId: doc.id,
          action: "visto",
          label: `${recipient.name} abrió el documento “${doc.title}”`,
          actorName: recipient.name,
          actorEmail: recipient.email,
          detail: recipient.kind === "copy" ? "Vista de copia" : "Vista previa a firma",
          ip,
        },
      ]);
    }
    recipient.status = "visto";
  }

  const [org] = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  const entityType: EntityType =
    (recipient.entityType ?? org?.entityType) === "privada" ? "privada" : "publica";

  const docSignatures = await db
    .select()
    .from(signatures)
    .where(eq(signatures.documentId, doc.id))
    .orderBy(asc(signatures.createdAt));

  const stamps = docSignatures.map((s) => ({
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
    createdAt: s.createdAt.toISOString(),
  }));

  // Identidad oficial desde el registro de funcionarios
  const [officer] = await db
    .select()
    .from(users)
    .where(eq(users.email, recipient.email))
    .limit(1);

  const [sender] = doc.senderId
    ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1)
    : [null];
  const parties = await db
    .select()
    .from(recipients)
    .where(eq(recipients.documentId, doc.id))
    .orderBy(asc(recipients.slot), asc(recipients.createdAt));
  const dest = parties.find((p) => p.kind === "destinatario") ?? null;
  // Con sesión iniciada: descarga del PDF (mismo criterio que el expediente) y enlace al expediente.
  const session = await getSessionContext();
  const canDownload = Boolean(
    session &&
      (canManageUsers(session.user.systemRole) ||
        doc.ownerId === session.user.id ||
        doc.senderId === session.user.id ||
        parties.some((p) => p.email.toLowerCase() === session.user.email.toLowerCase()) ||
        doc.status === "completado")
  );
  const pdf: PdfEvidence | null = canDownload
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
        signatures: docSignatures.map((s) => ({
          name: s.signerName,
          cargo: s.signerCargo,
          cedula: s.signerCedula,
          signedAt: s.createdAt.toISOString(),
          keyFingerprint: s.signerKeyFingerprint,
        })),
      }
    : null;

  // Hilo de mensajes y personas relacionadas
  const thread = (await listMessages(doc.id)).map((m) => ({
    id: m.id, fromName: m.fromName, fromEmail: m.fromEmail, toName: m.toName, toEmail: m.toEmail, kind: m.kind, body: m.body, createdAt: m.createdAt.toISOString(),
  }));
  const peopleMap = new Map<string, { name: string; email: string; role?: string | null }>();
  if (sender) peopleMap.set(sender.email.toLowerCase(), { name: sender.name, email: sender.email, role: "Remitente" });
  for (const r of parties) {
    if (!peopleMap.has(r.email.toLowerCase())) {
      peopleMap.set(r.email.toLowerCase(), { name: r.name, email: r.email, role: r.kind === "signer" ? "Firmante" : r.kind === "destinatario" ? "Destinatario" : r.kind === "attendee" ? "Asistente" : "Copia" });
    }
  }
  const people = [...peopleMap.values()].filter((p) => p.email.toLowerCase() !== recipient.email.toLowerCase());

  // Fase de aprobación: cualquier participante que no sea firmante debe aprobar
  // (o ya aprobó). Cerrada la fase, su enlace es de solo lectura (copia).
  // "informado" = el emisor no le pidió aprobación: ve el documento como copia (solo lectura).
  const isApprovalPhase =
    recipient.kind === "attendee" &&
    recipient.status !== "informado" &&
    (doc.status === "en_aprobacion" || recipient.status === "aprobado");

  return (
    <>
      <SetPageTitle
        title={docTypeTitle(doc.docType)}
        sub={doc.docNumber ? `Radicado ${doc.docNumber}` : doc.draftCode ? `Borrador ${doc.draftCode}` : "Firma"}
        code={docTypeOf(doc.docType).short}
      />
    <SignFlow
      token={token}
      isCopy={recipient.kind !== "signer" && !isApprovalPhase}
      isAttendee={recipient.kind !== "signer" && isApprovalPhase}
      alreadyApproved={recipient.status === "aprobado"}
      alreadySigned={recipient.status === "firmado"}
      entityType={entityType}
      recipient={{
        name: recipient.name,
        email: recipient.email,
        department: recipient.department,
        registered: Boolean(officer),
        identity: {
          grado: officer?.grado ?? recipient.grado,
          cargo: officer?.cargo ?? recipient.cargo,
          cedula: officer?.cedula ?? recipient.cedula,
          dependencia:
            officer?.dependencia ?? recipient.dependencia ?? recipient.department,
          unidad: officer?.unidad ?? recipient.unidad,
          empresa: recipient.empresa ?? org?.name ?? null,
          nit: recipient.nit ?? org?.nit ?? null,
          area: officer?.area ?? recipient.area,
          sucursal: officer?.sucursal ?? recipient.sucursal ?? org?.city ?? null,
        },
        signedAt: recipient.signedAt ? recipient.signedAt.toISOString() : null,
      }}
      doc={{
        title: doc.title,
        content: doc.content,
        status: doc.status,
        apaEnabled: doc.apaEnabled,
        docNumber: doc.docNumber,
        draftCode: doc.draftCode,
        docTypeShort: docTypeOf(doc.docType).short,
        city: doc.city,
      }}
      docMeta={{
        docType: doc.docType,
        code: doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : docTypeOf(doc.docType).short),
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
      }}
      stamps={stamps}
      pageSetup={parsePageSetup(doc.pageSetup)}
      pdf={pdf}
      expedienteUrl={session ? `/documentos/${doc.id}` : null}
      documentId={doc.id}
      messages={thread}
      people={people}
      canComment={Boolean(session)}
      sealedAt={doc.lockedAt ? doc.lockedAt.toISOString() : null}
      logoVariant={org?.logoVariant ?? "institucional"}
      logoUrl={org?.logoUrl ?? null}
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
    </>
  );
}
