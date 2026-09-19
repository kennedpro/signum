import { notFound, redirect } from "next/navigation";
import { canViewDocument } from "@/lib/access";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  documents,
  organizations,
  recipients,
  signatures,
  users,
} from "@/db/schema";
import { ArrowLeft, ShieldCheck, Fingerprint, FileCheck2, Hash, MessageSquareText } from "lucide-react";
import { SectionTitle, Panel } from "@/components/bits";
import { DocPanel } from "@/components/doc-panel";
import { DocSheet } from "@/components/doc-sheet";
import { parsePageSetup } from "@/lib/page-setup";
import { DocHeader } from "@/components/doc-header";
import { DocMetaBlock, type DocMetaProps } from "@/components/doc-meta-block";
import { hasLetterhead } from "@/lib/letterhead";
import { SetPageTitle } from "@/components/page-title";
import { pendingApprovals } from "@/lib/approvals";
import { listMessages } from "@/lib/messages";
import { MessageThread } from "@/components/message-thread";
import { FadeUp } from "@/components/motion";
import { AUDIT_META, cn, formatDate, formatDateTime } from "@/lib/utils";
import { ENTITY_META, type EntityType } from "@/lib/entity";
import { docTypeOf, docTypeTitle } from "@/lib/doctypes";
import { getSessionContext, canManageUsers } from "@/lib/auth";
import type { PdfEvidence } from "@/components/download-pdf";

export const dynamic = "force-dynamic";

/** Título de la pestaña: tipo documental + radicado/borrador. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [d] = await db.select({ docType: documents.docType, docNumber: documents.docNumber, draftCode: documents.draftCode }).from(documents).where(eq(documents.id, id)).limit(1);
  if (!d) return { title: "Documento" };
  const ref = d.docNumber ?? (d.draftCode ? `Borrador ${d.draftCode}` : "");
  return { title: `${docTypeTitle(d.docType)}${ref ? ` · ${ref}` : ""}` };
}

export default async function DocumentoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ firmar?: string }>;
}) {
  const { id } = await params;
  const { firmar } = await searchParams;

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) notFound();

  // CONTROL DE ACCESO: solo relacionados con el documento o privilegiados de la misma organización.
  const viewer = await getSessionContext();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/documentos/${id}`)}`);
  const accessParties = await db.select({ email: recipients.email, kind: recipients.kind }).from(recipients).where(eq(recipients.documentId, id));
  if (!canViewDocument(viewer, doc, accessParties)) notFound();

  // RENDIMIENTO: 5 consultas independientes en paralelo (antes: una tras otra).
  const [ownerRows, senderRows, orgRows, parties, docSignatures, timeline] = await Promise.all([
    doc.ownerId ? db.select().from(users).where(eq(users.id, doc.ownerId)).limit(1) : Promise.resolve([]),
    doc.senderId ? db.select().from(users).where(eq(users.id, doc.senderId)).limit(1) : Promise.resolve([]),
    db.select().from(organizations).orderBy(asc(organizations.createdAt)).limit(1),
    db
      .select()
      .from(recipients)
      .where(eq(recipients.documentId, id))
      .orderBy(asc(recipients.slot), asc(recipients.createdAt)),
    db
      .select()
      .from(signatures)
      .where(eq(signatures.documentId, id))
      .orderBy(asc(signatures.slot), asc(signatures.createdAt)),
    db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.documentId, id))
      .orderBy(asc(auditEvents.createdAt)),
  ]);
  const owner = ownerRows[0] ?? null;
  const sender = senderRows[0] ?? null;
  const org = orgRows[0];

  const entityType: EntityType = org?.entityType === "privada" ? "privada" : "publica";
  const def = docTypeOf(doc.docType);

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

  const of = (kind: string) =>
    parties
      .filter((r) => r.kind === kind)
      .map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        cargo: r.cargo,
        department: r.department,
        status: r.status,
      }));

  const signerRows = parties
    .filter((r) => r.kind === "signer")
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      cargo: r.cargo,
      slot: r.slot,
      slotLabel: r.slotLabel,
      status: r.status,
      token: r.token,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
    }));

  // ── Acción pendiente del usuario que ha iniciado sesión sobre ESTE documento ──
  //   · firmante designado con el documento en firma → "Firmar documento"
  //   · destinatario / asistente / copia con el documento en aprobación → "Aprobar o devolver"
  const sessionForAction = await getSessionContext();
  const myEmail = sessionForAction?.user.email.toLowerCase() ?? "";
  const mine = parties.filter((r) => r.email.toLowerCase() === myEmail);
  const mySigner = mine.find((r) => r.kind === "signer" && r.status !== "firmado");
  const myApproval = mine.find((r) => r.kind !== "signer" && r.status !== "aprobado" && r.status !== "firmado");
  const myAction =
    doc.status === "en_firma" && mySigner
      ? { kind: "sign" as const, token: mySigner.token, label: mySigner.slotLabel ?? "FIRMA AUTORIZADA" }
      : doc.status === "en_aprobacion" && myApproval
        ? { kind: "approve" as const, token: myApproval.token, label: myApproval.kind }
        : doc.status === "en_aprobacion" && mySigner
          ? { kind: "wait" as const, token: null, label: "Pendiente de aprobación de los participantes" }
          : null;

  // Aprobaciones pendientes (fase de aprobación) y permiso para avanzar la firma.
  const pendingApprovers =
    doc.status === "en_aprobacion"
      ? (await pendingApprovals(doc.id, [owner?.email, sender?.email])).map((p) => ({ name: p.name, kind: p.kind, email: p.email }))
      : [];
  // Hilo de mensajes y personas relacionadas (para dirigir comentarios/remisiones)
  const messages = (await listMessages(doc.id)).map((m) => ({
    id: m.id, fromName: m.fromName, fromEmail: m.fromEmail, toName: m.toName, toEmail: m.toEmail, kind: m.kind, body: m.body, createdAt: m.createdAt.toISOString(),
  }));
  const peopleMap = new Map<string, { name: string; email: string; role?: string | null }>();
  if (owner) peopleMap.set(owner.email.toLowerCase(), { name: owner.name, email: owner.email, role: "Autor" });
  if (sender) peopleMap.set(sender.email.toLowerCase(), { name: sender.name, email: sender.email, role: "Remitente" });
  for (const r of parties) {
    if (!peopleMap.has(r.email.toLowerCase())) {
      peopleMap.set(r.email.toLowerCase(), { name: r.name, email: r.email, role: r.kind === "signer" ? "Firmante" : r.kind === "destinatario" ? "Destinatario" : r.kind === "attendee" ? "Asistente" : "Copia" });
    }
  }
  const people = [...peopleMap.values()].filter((p) => p.email.toLowerCase() !== (sessionForAction?.user.email.toLowerCase() ?? ""));

  // Archivar: solo documentos ya firmados/sellados que LLEGARON a la bandeja
  // de esta persona como destinatario, revisor, asistente, participante o copia.
  const INBOX_KINDS = ["destinatario", "attendee", "participant", "copy"];
  const canArchive =
    doc.status === "completado" &&
    parties.some(
      (p) => p.email.toLowerCase() === myEmail && INBOX_KINDS.includes(p.kind)
    );

  // Aprobadores configurados (para el texto del botón en borrador): todos los participantes
  // salvo autor/emisor y firmantes.
  const approvers =
    doc.status === "borrador"
      ? (await pendingApprovals(doc.id, [owner?.email, sender?.email])).map((p) => ({ name: p.name, kind: p.kind, email: p.email }))
      : [];
  const ownerIsSigner = Boolean(
    sessionForAction && parties.some((p) => p.kind === "signer" && p.email.toLowerCase() === sessionForAction.user.email.toLowerCase())
  );
  const canAdvance = Boolean(
    sessionForAction &&
      (canManageUsers(sessionForAction.user.systemRole) || doc.ownerId === sessionForAction.user.id || doc.senderId === sessionForAction.user.id)
  );

  // ¿Quién ve el botón "Descargar PDF"?
  // · Administrador o Jefe de Gestión Documental: siempre.
  // · Demás usuarios: solo cuando el documento está completado.
  const ctx = await getSessionContext();
  const privileged = ctx ? canManageUsers(ctx.user.systemRole) : false;
  const canDownload = privileged || doc.status === "completado";
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

  const orgHeader = {
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
  };

  const dest = parties.find((p) => p.kind === "destinatario") ?? null;
  const docMeta: DocMetaProps = {
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <SetPageTitle
        title={docTypeTitle(doc.docType)}
        sub={doc.docNumber ? `Radicado ${doc.docNumber}` : doc.draftCode ? `Borrador ${doc.draftCode}` : "Documento"}
        code={def.short}
      />
      <FadeUp className="relative flex items-center justify-between gap-3">
        <Link
          href="/documentos"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel/70 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-400 transition hover:text-neon"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          REPOSITORIO
        </Link>
        {/* Acceso central al hilo de comentarios (editorial y firmado), a la
            misma altura que «Repositorio» y centrado con el documento. */}
        <a
          href="#mensajes"
          className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-4 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-neonsoft transition hover:bg-neon/20 hover:shadow-[0_0_22px_-8px_rgba(34,211,238,0.9)] sm:inline-flex"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Comentarios
          {messages.length > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[9px] font-bold text-void">
              {messages.length}
            </span>
          )}
        </a>
        <p className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600 md:block">
          UID {doc.id}
        </p>
      </FadeUp>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_340px]">
        <FadeUp delay={0.05}>
          <div id="print-area" className="space-y-5">
            <div className="w-full overflow-x-auto">
              <DocSheet
                html={doc.content}
                signatures={stamps}
                apa={doc.apaEnabled}
                color={org?.primaryColor ?? "#0e7490"}
                pageSetup={parsePageSetup(doc.pageSetup)}
                placeholders={{ code: docMeta.code, logoUrl: org?.logoUrl ?? null, color: org?.primaryColor ?? "#0e7490" }}
              >
                {!hasLetterhead(doc.content) && (
                  <>
                    <DocHeader
                      org={orgHeader}
                      docNumber={doc.docNumber}
                      draftCode={doc.draftCode}
                      docTypeShort={def.short}
                      city={doc.city}
                    />
                    <DocMetaBlock meta={docMeta} />
                  </>
                )}
                {doc.apaEnabled && (
                  <p className="no-print mb-3 text-right">
                    <span className="apa-badge">APA 7.ª ED.</span>
                  </p>
                )}
              </DocSheet>
            </div>

            {doc.status === "completado" && (
              <Panel className="mx-auto max-w-[880px] p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-lg border border-emerald-400/40 bg-emerald-400/10">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                    </span>
                    <div>
                      <p className="font-display text-lg font-bold text-slate-100">
                        Certificado de finalización
                      </p>
                      <p className="font-mono text-[10.5px] uppercase tracking-wider text-slate-500">
                        integridad verificada · cadena completa
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/verificar/${doc.id}`}
                      target="_blank"
                      className="rounded border border-neon/40 bg-neon/10 px-3 py-1 font-mono text-[10.5px] font-bold tracking-wider text-neonsoft hover:bg-neon/20"
                    >
                      VERIFICACIÓN PÚBLICA ↗
                    </Link>
                    <span className="rounded border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 font-mono text-[10.5px] font-bold tracking-widest text-emerald-300">
                      VÁLIDO
                    </span>
                  </div>
                </div>
                <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-slate-500">
                  Cualquier tercero puede comprobar identidad (Ed25519), intención (OTP +
                  declaración firmada) e integridad (SHA-256 + cadena) sin acceso a la consola:
                  <span className="ml-1 text-slate-300">/verificar/{doc.id}</span>
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border border-line bg-panel2/50 p-3.5">
                    <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      <Fingerprint className="h-3.5 w-3.5 text-neon" />
                      Doble sellado criptográfico
                    </p>
                    <p className="mt-2 font-mono text-[8.5px] font-bold tracking-wider text-slate-600">
                      HASH 1 · PRE-FIRMA
                    </p>
                    <p className="break-all font-mono text-[9.5px] leading-relaxed text-slate-400">
                      {doc.hashPre ?? "—"}
                    </p>
                    <p className="mt-1.5 font-mono text-[8.5px] font-bold tracking-wider text-slate-600">
                      HASH 2 · POST-FIRMA
                    </p>
                    <p className="break-all font-mono text-[9.5px] leading-relaxed text-emerald-300">
                      {doc.hashPost ?? "—"}
                    </p>
                    <p className="mt-1.5 font-mono text-[8.5px] font-bold tracking-wider text-slate-600">
                      SELLO DEL SOBRE
                    </p>
                    <p className="break-all font-mono text-[9.5px] leading-relaxed text-neonsoft">
                      {doc.sealHash ?? "—"}
                    </p>
                  </div>
                  <div className="rounded-md border border-line bg-panel2/50 p-3.5">
                    <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      <FileCheck2 className="h-3.5 w-3.5 text-neon" />
                      Resumen del sobre
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[11.5px] text-slate-400">
                      <li>Tipo: {def.label}</li>
                      <li>{docSignatures.length} firma(s) estampada(s)</li>
                      <li>{of("copy").length} copia(s) de conocimiento</li>
                      <li>{of("attendee").length} asistente(s) registrados</li>
                      <li>{timeline.length} evento(s) en trazabilidad</li>
                      <li>Perfil: {ENTITY_META[entityType].label}</li>
                      <li>
                        Emitido {formatDate(doc.createdAt)} · cerrado{" "}
                        {formatDate(doc.updatedAt)}
                      </li>
                      <li>
                        Bloqueo solo lectura:{" "}
                        {doc.lockedAt ? formatDateTime(doc.lockedAt) : "—"}
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    Cadena criptográfica de firmas
                  </p>
                  {docSignatures.map((s, i) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded border border-line bg-panel/50 px-2.5 py-1.5"
                    >
                      <span className="font-mono text-[9.5px] text-slate-600">
                        #{String(i + 1).padStart(2, "0")}
                      </span>
                      <Hash className="h-3 w-3 shrink-0 text-neon/60" />
                      <span className="truncate font-mono text-[10px] text-slate-400">
                        {s.hash}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[9.5px] text-slate-600">
                        {s.signerName.split(" ")[0]}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
          <div id="mensajes" className="scroll-mt-20">
            <MessageThread
              documentId={doc.id}
              code={doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : def.short)}
              initialMessages={messages}
              people={people}
              canArchive={canArchive}
              sealedAt={doc.lockedAt ? doc.lockedAt.toISOString() : null}
              className="mx-auto mt-5 max-w-[880px]"
            />
          </div>
        </FadeUp>

        <FadeUp delay={0.1} className="space-y-5">
          <DocPanel
            entityType={entityType}
            autoOpen={firmar === "1" && doc.status === "borrador"}
            pdf={pdf}
            doc={{
              id: doc.id,
              title: doc.title,
              status: doc.status,
              createdAt: doc.createdAt.toISOString(),
              docTypeLabel: def.label,
              returnNote: doc.returnNote,
              myAction,
              pendingApprovers,
              canAdvance,
              approvers,
              ownerIsSigner,
              docNumber: doc.docNumber,
              apaEnabled: doc.apaEnabled,
            }}
            owner={
              owner
                ? {
                    name: owner.name,
                    email: owner.email,
                    color: owner.color,
                    photoUrl: owner.photoUrl,
                  }
                : null
            }
            sender={
              sender
                ? {
                    name: sender.name,
                    cargo: sender.cargo ?? sender.role,
                    color: sender.color,
                    photoUrl: sender.photoUrl,
                  }
                : null
            }
            signers={signerRows}
            attendees={of("attendee")}
            participants={of("participant")}
            copies={of("copy")}
          />

          {/* TRAZABILIDAD — dos fases independientes: elaboración/firma y gestión posterior */}
          {(() => {
            const sealedMs = doc.lockedAt ? doc.lockedAt.getTime() : null;
            const phases = [
              {
                key: "elaboracion",
                title: "Elaboración y firma",
                tone: "text-amber-300",
                items: timeline.filter((ev) => sealedMs === null || ev.createdAt.getTime() <= sealedMs),
              },
              ...(sealedMs !== null
                ? [{
                    key: "gestion",
                    title: "Gestión posterior a la firma",
                    tone: "text-emerald-300",
                    items: timeline.filter((ev) => ev.createdAt.getTime() > sealedMs),
                  }]
                : []),
            ];
            return (
              <Panel>
                <div className="border-b border-line px-5 py-3.5">
                  <SectionTitle hint={`${timeline.length} EVENTOS`}>Trazabilidad del documento</SectionTitle>
                </div>
                <div className="max-h-[480px] overflow-y-auto px-5 py-4">
                  {phases.map((ph) => (
                    <section key={ph.key} className="mb-4 last:mb-0">
                      <p className={cn("mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em]", ph.tone)}>
                        {ph.title} <span className="text-slate-600">· {ph.items.length}</span>
                      </p>
                      {ph.items.length === 0 ? (
                        <p className="rounded-md border border-dashed border-line px-3 py-2 text-[11px] text-slate-500">Sin eventos en esta fase.</p>
                      ) : (
                        <ol>
                          {ph.items.map((ev, i) => {
                            const meta = AUDIT_META[ev.action] ?? AUDIT_META.editado;
                            return (
                              <li key={ev.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                                {i !== ph.items.length - 1 && (
                                  <span className="absolute left-[4px] top-3.5 h-full w-px bg-line" />
                                )}
                                <span className={cn("relative mt-1 h-[9px] w-[9px] shrink-0 rounded-full ring-4 ring-panel", meta.color)} />
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold text-slate-200">{meta.label}</p>
                                  <p className="text-[11px] text-slate-400">{ev.label}</p>
                                  <p className="font-mono text-[9.5px] text-slate-600">
                                    {ev.actorName} · {formatDateTime(ev.createdAt)}
                                    {ev.ip ? ` · ${ev.ip}` : ""}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </section>
                  ))}
                </div>
              </Panel>
            );
          })()}

          <Panel className="p-5">
            <SectionTitle hint="COLOMBIA">Blindaje jurídico</SectionTitle>
            <p className="text-[11px] leading-relaxed text-slate-400">
              <strong className="text-slate-200">Decreto 2364 de 2012.</strong> La
              contraseña adicional acredita <em>autenticidad</em>; el contenedor inyectado
              sin alterar el texto inferior garantiza <em>integridad</em>; y la pista de
              auditoría encadenada sustenta el <em>no repudio</em>.
            </p>
          </Panel>
        </FadeUp>
      </div>
    </div>
  );
}
