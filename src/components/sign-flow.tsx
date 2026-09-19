"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  PenLine,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  Printer,
  Eye,
  Building2,
  AlertTriangle,
  FileSignature,
  IdCard,
  Lock,
  KeyRound,
  BadgeCheck,
} from "lucide-react";
import { Avatar } from "@/components/bits";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { SignatureStamp, type StampData } from "@/components/signature-stamp";
import { DocSheet } from "@/components/doc-sheet";
import { DownloadPdfButton, type PdfEvidence } from "@/components/download-pdf";
import { MessageThread, type ThreadMessage, type ThreadPerson } from "@/components/message-thread";
import type { PageSetup } from "@/lib/page-setup";
import { DocMetaBlock, type DocMetaProps } from "@/components/doc-meta-block";
import { DocHeader, type OrgHeader } from "@/components/doc-header";
import { fieldClass } from "@/components/identity-fields";
import { buildStampLines, ENTITY_META, type EntityType } from "@/lib/entity";
import { cn, formatDateTime } from "@/lib/utils";
import { hasLetterhead } from "@/lib/letterhead";

export type SignFlowProps = {
  token: string;
  isCopy: boolean;
  isAttendee?: boolean;
  alreadyApproved?: boolean;
  alreadySigned: boolean;
  entityType: EntityType;
  recipient: {
    name: string;
    email: string;
    department: string | null;
    /** Datos tomados del registro de funcionarios (no editables) */
    identity: {
      grado?: string | null;
      cargo?: string | null;
      cedula?: string | null;
      dependencia?: string | null;
      unidad?: string | null;
      empresa?: string | null;
      nit?: string | null;
      area?: string | null;
      sucursal?: string | null;
    };
    registered: boolean;
    signedAt: string | null;
  };
  doc: {
    title: string;
    content: string;
    status: string;
    apaEnabled: boolean;
    docNumber: string | null;
    draftCode?: string | null;
    docTypeShort: string;
    city: string | null;
  };
  stamps: StampData[];
  logoVariant: string;
  logoUrl: string | null;
  org: OrgHeader;
  docMeta?: DocMetaProps | null;
  pageSetup?: PageSetup;
  /** Evidencia para descargar el PDF (solo con sesión y permiso). */
  pdf?: PdfEvidence | null;
  /** Enlace al expediente en la consola (solo con sesión). */
  expedienteUrl?: string | null;
  /** Identificador del documento para la verificación pública. */
  documentId?: string;
  /** Hilo de mensajes (visible para todos los relacionados). */
  messages?: ThreadMessage[];
  people?: ThreadPerson[];
  /** Puede escribir en el hilo (requiere sesión). */
  canComment?: boolean;
  /** Momento del sellado (separa elaboración de gestión). */
  sealedAt?: string | null;
};

export function SignFlow({
  token,
  isCopy,
  isAttendee = false,
  alreadyApproved = false,
  alreadySigned,
  entityType,
  recipient,
  doc,
  stamps,
  logoVariant,
  logoUrl,
  org,
  docMeta = null,
  pageSetup,
  pdf = null,
  expedienteUrl = null,
  documentId,
  messages = [],
  people = [],
  canComment = false,
  sealedAt = null,
}: SignFlowProps) {
  const router = useRouter();
  const padRef = useRef<SignaturePadHandle>(null);
  const identity = recipient.identity;
  const [consent, setConsent] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [signPassword, setSignPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpInfo, setOtpInfo] = useState<{
    maskedEmail: string;
    expiresAt: string;
    demoCode?: string;
  } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [returned, setReturned] = useState(false);

  async function returnToAuthor() {
    if (returning) return;
    if (returnReason.trim().length < 5) { setError("Indique el motivo de la devolución (mínimo 5 caracteres)."); return; }
    setReturning(true); setError(null);
    try {
      const res = await fetch(`/api/firmar/${token}/devolver`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo devolver el documento");
      setReturned(true); setReturnOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally { setReturning(false); }
  }

  async function requestOtp() {
    setOtpLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/firmar/${token}/otp`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el código");
      setOtpInfo({ maskedEmail: data.maskedEmail, expiresAt: data.expiresAt, demoCode: data.demoCode });
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al solicitar el código");
    } finally {
      setOtpLoading(false);
    }
  }
  const [done, setDone] = useState<{
    hashPre: string;
    hashPost: string;
    ntp?: { iso: string; source: string };
    signedAt: string;
    completed: boolean;
    /** Cierre por aprobación sin firma externa (rúbrica del emisor excluida). */
    finalized?: boolean;
    radicado?: string | null;
  } | null>(
    alreadySigned && recipient.signedAt
      ? { hashPre: "", hashPost: "", signedAt: recipient.signedAt, completed: true }
      : null
  );

  const meta = ENTITY_META[entityType];

  /* ── Estado visible del documento para ESTE participante ──────────
     El badge se deriva del estado real (documento sellado, aprobación
     registrada o firma propia), no solo de la acción hecha en esta sesión.
     Antes, un asistente veía «Requiere firma» sobre un documento ya
     completado, y se le ofrecía aprobar un acta cerrada.               */
  const sealed = doc.status === "completado";
  const approvalClosed = sealed || doc.status === "en_firma";
  const badge = isCopy
    ? { label: "Copia", Icon: Building2, cls: "border-violet-300 bg-violet-50 text-violet-700" }
    : isAttendee
      ? sealed
        ? { label: "Documento firmado", Icon: CheckCircle2, cls: "border-emerald-300 bg-emerald-50 text-emerald-700" }
        : alreadyApproved || done
          ? { label: "Aprobado", Icon: CheckCircle2, cls: "border-emerald-300 bg-emerald-50 text-emerald-700" }
          : { label: "Requiere aprobación", Icon: Eye, cls: "border-amber-300 bg-amber-50 text-amber-700" }
      : done || sealed
        ? { label: "Firmado", Icon: CheckCircle2, cls: "border-emerald-300 bg-emerald-50 text-emerald-700" }
        : { label: "Requiere firma", Icon: Eye, cls: "border-amber-300 bg-amber-50 text-amber-700" };

  const stampLines = buildStampLines(entityType, {
    name: recipient.name,
    email: recipient.email,
    ...identity,
  });

  const previewStamp: StampData = {
    entityType,
    signerName: recipient.name,
    signerEmail: recipient.email,
    signerGrado: identity.grado ?? null,
    signerCargo: identity.cargo ?? null,
    signerCedula: identity.cedula ?? null,
    signerDependencia: identity.dependencia ?? null,
    signerUnidad: identity.unidad ?? null,
    signerEmpresa: identity.empresa ?? null,
    signerNit: identity.nit ?? null,
    signerArea: identity.area ?? null,
    signerSucursal: identity.sucursal ?? null,
    // identidad congelada desde el registro
    logoVariant,
    logoUrl,
    signatureData: preview,
    createdAt: new Date(),
  };

  async function refreshPreview() {
    const sig = await padRef.current?.getSignature();
    setPreview(sig?.dataUrl ?? null);
  }

  async function confirmSign() {
    if (signing) return;
    setError(null);
    const sig = await padRef.current?.getSignature();
    if (!sig) {
      setError("Trace o escriba su rúbrica para continuar.");
      return;
    }
    if (signPassword.trim().length < 4) {
      setError("Ingrese su clave personal de firma digital.");
      return;
    }
    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Ingrese el código de confirmación de 6 dígitos.");
      return;
    }
    setSigning(true);
    try {
      const res = await fetch(`/api/firmar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sig, signPassword, otp: otp.trim(), consent: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo registrar la firma");
      setModalOpen(false);
      setDone(data);
      // Recarga la página desde el servidor: el documento se ve FIRMADO
      // (estampa inyectada + radicado), no como borrador.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        id="print-area"
      >
        <DocSheet
          html={doc.content}
          signatures={stamps}
          apa={doc.apaEnabled}
          color={org.primaryColor ?? "#0e7490"}
          pageSetup={pageSetup}
          placeholders={{
            code: doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : doc.docTypeShort),
            logoUrl: logoUrl,
            color: org.primaryColor ?? "#0e7490",
          }}
        >
          {!hasLetterhead(doc.content) && (
            <>
              <DocHeader
                org={org}
                docNumber={doc.docNumber}
                draftCode={doc.draftCode}
                docTypeShort={doc.docTypeShort}
                city={doc.city}
              />
              {docMeta && <DocMetaBlock meta={docMeta} />}
            </>
          )}
          {/* Estado del documento para este participante: capa flotante bajo el radicado, NO altera el flujo */}
          <span
            className={cn(
              "no-print doc-status-badge inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[9.5px] font-bold uppercase tracking-wider",
              badge.cls
            )}
            style={{ right: `${pageSetup?.margins.right ?? 2.54}cm`, top: `${(pageSetup?.headerFromTop ?? 1.25) + 1.15}cm` }}
          >
            <badge.Icon className="h-3 w-3" />
            {badge.label}
          </span>
        </DocSheet>
        {documentId && (
          <MessageThread
            documentId={documentId}
            code={doc.docNumber ?? (doc.draftCode ? `Borrador ${doc.draftCode}` : doc.docTypeShort)}
            initialMessages={messages}
            people={people}
            canWrite={canComment}
            canArchive={false}
            sealedAt={sealedAt}
            className="mt-5"
          />
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.08 }}
        className="space-y-4 lg:sticky lg:top-5"
      >
        <div className="hud rounded-lg p-5">
          <span className="corner-tl" />
          <span className="corner-br" />
          <div className="flex items-start justify-between gap-2">
            <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-slate-500">
              {isCopy ? "// participante · copia" : isAttendee ? "// participante · aprobación" : "// firmante autorizado"}
            </p>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ring-1 ring-inset",
                meta.badge
              )}
            >
              {meta.short}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={recipient.name} color="#22d3ee" size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold text-slate-100">{recipient.name}</p>
              <p className="truncate font-mono text-[10.5px] text-slate-500">{recipient.email}</p>
              {recipient.department && (
                <p className="mt-0.5 inline-flex items-center gap-1 font-mono text-[9.5px] uppercase text-slate-600">
                  <Building2 className="h-3 w-3" />
                  {recipient.department}
                </p>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {returned || (doc.status === "borrador" && !isCopy && !isAttendee && !done) ? (
            <motion.div key="returned" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hud rounded-lg border-amber-400/30 p-5">
              <p className="flex items-center gap-2 text-[12.5px] font-bold text-amber-200">
                <AlertTriangle className="h-4 w-4" /> Documento devuelto al autor
              </p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-slate-400">
                El documento está en corrección. Cuando el autor lo vuelva a despachar recibirá un nuevo enlace de firma;
                este enlace ya no permite firmar.
              </p>
            </motion.div>
          ) : done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", damping: 20, stiffness: 230 }}
              className="hud rounded-lg border-emerald-400/30 p-5 text-center"
            >
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-emerald-400/40 bg-emerald-400/10">
                <ShieldCheck className="h-6 w-6 text-emerald-400" />
              </span>
              <h3 className="mt-3 font-display text-xl font-bold text-slate-50">
                {isCopy ? "Copia registrada" : isAttendee ? "Aprobación registrada" : "Firma estampada"}
              </h3>
              <p className="mx-auto mt-1 max-w-xs text-[11.5px] leading-relaxed text-slate-400">
                {isAttendee
                  ? done.finalized
                    ? `Todos los revisores aprobaron y el documento quedó radicado${done.radicado ? ` con el número ${done.radicado}` : ""}, sellado y en solo lectura.`
                    : done.completed
                      ? "Todos los revisores aprobaron. El firmante designado ya recibió el documento."
                      : "Su aprobación quedó registrada. Faltan aprobaciones de otros participantes."
                  : done.completed
                    ? "Todas las partes firmaron. El documento quedó congelado en solo lectura."
                    : "El documento espera las firmas restantes."}
              </p>
              {done.hashPost && (
                <div className="mt-3 space-y-1.5 text-left">
                  {[
                    { k: "HASH 1 · PRE-FIRMA", v: done.hashPre },
                    { k: "HASH 2 · POST-FIRMA", v: done.hashPost },
                  ].map((x) => (
                    <div key={x.k} className="rounded-md border border-line bg-panel2/60 px-3 py-2">
                      <p className="font-mono text-[8px] font-bold tracking-[0.16em] text-slate-500">
                        {x.k}
                      </p>
                      <p className="break-all font-mono text-[8.6px] text-emerald-300">{x.v}</p>
                    </div>
                  ))}
                  {done.ntp && (
                    <p className="font-mono text-[8.5px] text-slate-600">
                      {done.ntp.source} · {done.ntp.iso}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-4 space-y-2 text-left">
                {pdf && (
                  <DownloadPdfButton
                    evidence={pdf}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-neon px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)]"
                    label="Descargar PDF"
                  />
                )}
                {documentId && (
                  <a
                    href={`/verificar/${documentId}`}
                    target="_blank"
                    rel="noopener"
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-[12px] font-bold text-emerald-300 transition hover:bg-emerald-400/20"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Verificación pública
                  </a>
                )}
                <button
                  onClick={() => window.print()}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-line2 px-4 py-2.5 text-[12px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
                >
                  <Printer className="h-4 w-4" />
                  Imprimir constancia
                </button>
                {expedienteUrl && (
                  <a
                    href={expedienteUrl}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-line2 px-4 py-2.5 text-[12px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
                  >
                    <FileSignature className="h-4 w-4" />
                    Ver expediente
                  </a>
                )}
              </div>
            </motion.div>
          ) : isAttendee || alreadyApproved ? (
            <motion.div key="att" className="hud rounded-lg p-5">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-cyan-300">
                Aprobación previa a la firma
              </p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-400">
                Usted figura en este documento como participante. Revíselo y apruébelo; cuando
                todos los participantes aprueben, el firmante designado recibirá el documento.
                Si algo debe corregirse, devuélvalo al autor con el motivo.
              </p>
              {alreadyApproved || approvalClosed ? (
                <p className="mt-4 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12px] text-emerald-300">
                  {sealed
                    ? "El documento ya fue firmado y radicado. Su participación quedó registrada en la trazabilidad."
                    : alreadyApproved
                      ? "Ya registró su aprobación."
                      : "La fase de aprobación cerró: el documento está en firma."}
                </p>
              ) : returnOpen ? (
                <div className="mt-4 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                  <p className="text-[11.5px] font-bold text-amber-200">Motivo de la devolución</p>
                  <textarea value={returnReason} onChange={(ev) => setReturnReason(ev.target.value)} rows={3} maxLength={600}
                    placeholder="Indique qué debe corregirse." className={cn(fieldClass, "mt-2 w-full resize-none text-[12px]")} />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={returnToAuthor} disabled={returning}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-[11.5px] font-bold uppercase text-void disabled:opacity-50">
                      {returning ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Confirmar devolución
                    </button>
                    <button type="button" onClick={() => { setReturnOpen(false); setReturnReason(""); }}
                      className="rounded-md border border-line2 px-3 py-2 text-[11.5px] font-semibold text-slate-300">Cancelar</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    setSigning(true);
                    setError(null);
                    try {
                      const res = await fetch(`/api/firmar/${token}/aprobar`, { method: "POST" });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error);
                      setDone({
                        hashPre: "",
                        hashPost: "",
                        signedAt: new Date().toISOString(),
                        completed: Boolean(data.released),
                        finalized: Boolean(data.finalized),
                        radicado: data.radicado ?? null,
                      });
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "No se pudo aprobar");
                    } finally {
                      setSigning(false);
                    }
                  }}
                  disabled={signing}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-neon py-3 text-[12.5px] font-bold uppercase tracking-wide text-void"
                >
                  {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Aprobar documento
                </button>
              )}
              {!alreadyApproved && !approvalClosed && !returnOpen && (
                <button type="button" onClick={() => { setReturnOpen(true); setError(null); }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/20">
                  <AlertTriangle className="h-4 w-4" /> Devolver para corrección
                </button>
              )}
              {error && <p className="mt-3 text-[12px] text-rose-300">{error}</p>}
            </motion.div>
          ) : isCopy ? (
            <motion.div key="copy" className="hud rounded-lg border-plasma/25 p-5">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-plasma" />
                <div>
                  <p className="text-[12.5px] font-bold text-plasma">Solo lectura</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">
                    Recibió una copia informativa en su entorno. No requiere firma; su
                    apertura quedó registrada en la bitácora de auditoría.
                  </p>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="sign" exit={{ opacity: 0, y: -8 }} className="space-y-4">
              {/* Identidad tomada del registro de funcionarios — solo lectura */}
              <div className="hud rounded-lg p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    <IdCard className="h-3.5 w-3.5 text-neon" />
                    Datos de la estampa
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[8.5px] font-bold",
                      recipient.registered
                        ? "bg-emerald-400/12 text-emerald-300 ring-1 ring-emerald-400/30"
                        : "bg-amber-400/12 text-amber-300 ring-1 ring-amber-400/30"
                    )}
                  >
                    <BadgeCheck className="h-3 w-3" />
                    {recipient.registered ? "VERIFICADO" : "SIN REGISTRO"}
                  </span>
                </div>

                <dl className="mt-3 space-y-1">
                  {stampLines.map((l) => (
                    <div
                      key={l.label}
                      className="flex gap-2 rounded border border-line bg-panel2/40 px-2.5 py-1.5"
                    >
                      <dt className="w-[76px] shrink-0 font-mono text-[9px] uppercase tracking-wider text-slate-500">
                        {l.label}
                      </dt>
                      <dd className="min-w-0 flex-1 truncate text-[11.5px] text-slate-200">
                        {l.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                <p className="mt-2.5 flex items-start gap-1.5 font-mono text-[9px] leading-snug text-slate-600">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0 text-slate-600" />
                  {recipient.registered
                    ? "DATOS TOMADOS DEL REGISTRO DE FUNCIONARIOS. NO SON EDITABLES AQUÍ."
                    : "ESTE CORREO NO ESTÁ EN EL REGISTRO. SE USARÁN LOS DATOS DEL DESPACHO."}
                </p>
              </div>

              <div className="hud rounded-lg p-5">
                <label className="flex cursor-pointer items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setConsent((c) => !c)}
                    aria-pressed={consent}
                    className={cn(
                      "mt-0.5 grid shrink-0 place-items-center rounded border transition",
                      consent ? "border-neon bg-neon text-void" : "border-line2 bg-panel2"
                    )}
                    style={{ height: 18, width: 18 }}
                  >
                    {consent && <CheckCircle2 className="h-3 w-3" />}
                  </button>
                  <span className="text-[11.5px] leading-relaxed text-slate-400">
                    He revisado el documento y acepto firmarlo electrónicamente. Reconozco
                    que la clave adicional es de uso personal e intransferible y que mi
                    firma tiene plena validez conforme al{" "}
                    <strong className="text-slate-300">Decreto 2364 de 2012</strong>.
                  </span>
                </label>
                <button
                  onClick={() => setModalOpen(true)}
                  disabled={!consent}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-neon px-4 py-3 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_26px_-6px_rgba(34,211,238,0.9)] disabled:opacity-35 disabled:shadow-none"
                >
                  <FileSignature className="h-4 w-4" />
                  Firmar documento
                </button>

                {/* Aprobar = firmar. Si algo debe corregirse, se devuelve al autor con el motivo. */}
                {!returnOpen ? (
                  <button
                    type="button"
                    onClick={() => { setReturnOpen(true); setError(null); }}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/20"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Devolver para corrección
                  </button>
                ) : (
                  <div className="mt-2 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
                    <p className="text-[11.5px] font-bold text-amber-200">Motivo de la devolución</p>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      El documento volverá a borrador para que su autor lo corrija. Su observación quedará en la trazabilidad.
                    </p>
                    <textarea
                      value={returnReason}
                      onChange={(ev) => setReturnReason(ev.target.value)}
                      rows={3}
                      maxLength={600}
                      placeholder="Ej.: Ajustar el asunto y la fecha; falta anexo referenciado en el punto 3."
                      className={cn(fieldClass, "mt-2 w-full resize-none text-[12px]")}
                    />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={returnToAuthor} disabled={returning}
                        className="flex flex-1 items-center justify-center gap-2 rounded-md bg-amber-400 px-3 py-2 text-[11.5px] font-bold uppercase text-void disabled:opacity-50">
                        {returning ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                        Confirmar devolución
                      </button>
                      <button type="button" onClick={() => { setReturnOpen(false); setReturnReason(""); }}
                        className="rounded-md border border-line2 px-3 py-2 text-[11.5px] font-semibold text-slate-300">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
                {error && !modalOpen && <p className="mt-2 text-[12px] text-rose-300">{error}</p>}
                <p className="mt-3 flex items-start gap-1.5 font-mono text-[9px] leading-snug text-slate-600">
                  <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                  DOBLE SELLADO SHA-256 (PRE Y POST FIRMA) + ESTAMPA DE TIEMPO OFICIAL.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center bg-void/85 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => !signing && setModalOpen(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0, scale: 0.97 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="hud max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-xl p-6 sm:rounded-xl"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-neon">
                    // adopte su firma
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold text-slate-50">
                    Rúbrica y segundo factor
                  </h3>
                </div>
                <PenLine className="h-5 w-5 text-slate-600" />
              </div>

              <div onPointerUp={refreshPreview} onBlur={refreshPreview}>
                <SignaturePad
                  ref={padRef}
                  defaultName={recipient.name}
                  onInkChange={(v) => {
                    setHasInk(v);
                    if (v) void refreshPreview();
                  }}
                />
              </div>

              <div className="mt-4">
                <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  <KeyRound className="h-3.5 w-3.5" />
                  Su firma digital personal
                </p>
                <input
                  type="password"
                  value={signPassword}
                  onChange={(e) => setSignPassword(e.target.value)}
                  placeholder="Clave personal de firma"
                  autoComplete="off"
                  className={fieldClass}
                />
                <p className="mt-1 font-mono text-[9px] text-slate-600">
                  CADA FUNCIONARIO TIENE LA SUYA · DEMO: FIRMA2026 O SU CLAVE DE ACCESO
                </p>
              </div>

              {/* Segundo factor dinámico: intención de firma */}
              <div className="mt-4 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.05] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Código de confirmación
                  </p>
                  <button
                    type="button"
                    onClick={requestOtp}
                    disabled={otpLoading}
                    className="rounded border border-cyan-400/40 px-2 py-1 font-mono text-[9.5px] font-bold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50"
                  >
                    {otpLoading ? "ENVIANDO…" : otpInfo ? "REENVIAR" : "ENVIAR CÓDIGO"}
                  </button>
                </div>
                {otpInfo && (
                  <p className="mt-2 font-mono text-[9.5px] text-slate-400">
                    Enviado a {otpInfo.maskedEmail} · vence en 5 min
                    {otpInfo.demoCode && (
                      <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-amber-300">
                        DEMO: {otpInfo.demoCode}
                      </span>
                    )}
                  </p>
                )}
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="6 dígitos"
                  className={cn(fieldClass, "mt-2 font-mono tracking-[0.4em]")}
                />
                <p className="mt-1 font-mono text-[9px] leading-snug text-slate-600">
                  Acredita su INTENCIÓN de firmar en este momento. Ley 527/1999 art. 7 · Decreto 2364/2012.
                </p>
              </div>

              <div className="mt-4">
                <p className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  Previsualización en el contenedor protegido
                </p>
                <div className="overflow-x-auto rounded-md bg-[#fdfcf9] p-4">
                  <SignatureStamp data={previewStamp} />
                </div>
              </div>

              {error && (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[12px] font-medium text-rose-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={signing}
                  className="flex-1 rounded-md border border-line2 py-2.5 text-[12px] font-semibold text-slate-400 transition hover:text-slate-200"
                >
                  Volver
                </button>
                <button
                  onClick={confirmSign}
                  disabled={!hasInk || signing || otp.length !== 6}
                  className="flex flex-[1.6] items-center justify-center gap-2 rounded-md bg-neon py-2.5 text-[12px] font-bold uppercase tracking-wide text-void transition disabled:opacity-40"
                >
                  {signing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sellando…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Autorizar y firmar
                    </>
                  )}
                </button>
              </div>
              <p className="mt-3 text-center font-mono text-[9px] text-slate-600">
                {formatDateTime(new Date())} · SESIÓN SEGURA · DECRETO 2364/2012
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
