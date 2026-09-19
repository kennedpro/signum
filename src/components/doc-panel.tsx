"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Send,
  Printer,
  PencilLine,
  Trash2,
  CopyPlus,
  Link2,
  Check,
  Building2,
  Clock3,
  ShieldAlert,
  Users,
  UserRound,
  PenLine,
  CheckCircle2,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import {
  Avatar,
  RecipientBadge,
  SectionTitle,
  DocStatusBadge,
  Panel,
} from "@/components/bits";
import { SendModal, type ConfiguredSigner } from "@/components/send-modal";
import { DownloadPdfButton, type PdfEvidence } from "@/components/download-pdf";
import { cn, formatDateTime } from "@/lib/utils";
import { ENTITY_META, type EntityType } from "@/lib/entity";

type SignerRow = {
  id: string;
  name: string;
  email: string;
  cargo: string | null;
  slot: number | null;
  slotLabel: string | null;
  status: string;
  token: string;
  signedAt: string | null;
};

type PersonRow = {
  id: string;
  name: string;
  email: string;
  cargo: string | null;
  department: string | null;
  status: string;
};

export function DocPanel({
  doc,
  owner,
  sender,
  signers,
  attendees,
  participants,
  copies,
  entityType,
  autoOpen = false,
  pdf = null,
}: {
  entityType: EntityType;
  autoOpen?: boolean;
  pdf?: PdfEvidence | null;
  doc: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    docTypeLabel: string;
    docNumber: string | null;
    apaEnabled: boolean;
    /** Observación del firmante si devolvió el documento para corrección. */
    returnNote?: string | null;
    /** Lo que le corresponde hacer al usuario actual sobre este documento. */
    myAction?: { kind: "sign" | "approve" | "wait"; token: string | null; label: string } | null;
    /** Participantes que aún deben aprobar (solo en fase de aprobación). */
    pendingApprovers?: { name: string; kind: string; email: string }[];
    /** Aprobadores configurados (borrador): definen el texto del botón de despacho. */
    approvers?: { name: string; kind: string; email: string }[];
    /** El usuario actual es el firmante designado. */
    ownerIsSigner?: boolean;
    /** El usuario actual puede avanzar el documento a firma (autor/emisor/privilegiado). */
    canAdvance?: boolean;
  };
  owner: { name: string; email: string; color: string; photoUrl: string | null } | null;
  sender: { name: string; cargo: string | null; color: string; photoUrl: string | null } | null;
  signers: SignerRow[];
  attendees: PersonRow[];
  participants: PersonRow[];
  copies: PersonRow[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  // Circuito elegido: revisión/aprobación o firma directa (las copias posteriores no fuerzan circuito).
  const [modalCircuit, setModalCircuit] = useState<"aprobacion" | "firma">("firma");
  const openDispatch = (circuit: "aprobacion" | "firma") => {
    setModalCircuit(circuit);
    setModalOpen(true);
  };

  // Apertura automática al llegar desde el editor con ?firmar=1
  useEffect(() => {
    if (autoOpen) setModalOpen(true);
  }, [autoOpen]);

  // Sincronía con el editor abierto en otra pestaña: al guardar allí, refresca aquí.
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel("signum-doc");
      ch.onmessage = (ev) => {
        if (ev.data?.id === doc.id) router.refresh();
      };
    } catch {
      /* navegador sin BroadcastChannel */
    }
    return () => ch?.close();
  }, [doc.id, router]);

  const [copied, setCopied] = useState<string | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceReason, setAdvanceReason] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [advanceResult, setAdvanceResult] = useState<{ name: string; token: string; password: string } | null>(null);

  async function advanceToSignature() {
    if (advancing) return;
    if (advanceReason.trim().length < 5) { setAdvanceError("Indique el motivo (mínimo 5 caracteres)."); return; }
    setAdvancing(true); setAdvanceError(null);
    try {
      const res = await fetch(`/api/documentos/${doc.id}/avanzar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: advanceReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo avanzar");
      setAdvanceResult(data.signer);
      setAdvanceOpen(false);
      router.refresh();
    } catch (e) {
      setAdvanceError(e instanceof Error ? e.message : "Error inesperado");
    } finally { setAdvancing(false); }
  }
  const [deleting, setDeleting] = useState(false);

  const done = signers.filter((s) => s.status === "firmado").length;
  const total = signers.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const copyLink = async (token: string) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/firmar/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* noop */
    }
  };

  const removeDoc = async () => {
    if (!confirm("¿Eliminar este borrador? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    await fetch(`/api/documentos/${doc.id}`, { method: "DELETE" });
    router.push("/documentos");
    router.refresh();
  };

  const PeopleBlock = ({
    title,
    hint,
    rows,
    icon: Icon,
    tone,
  }: {
    title: string;
    hint: string;
    rows: PersonRow[];
    icon: typeof Users;
    tone: string;
  }) =>
    rows.length === 0 ? null : (
      <Panel className="p-5">
        <SectionTitle hint={hint}>{title}</SectionTitle>
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-white/[0.03]"
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-md border",
                  tone
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold text-slate-200">{r.name}</p>
                <p className="truncate font-mono text-[9.5px] text-slate-500">
                  {r.cargo ?? r.department ?? r.email}
                </p>
              </div>
              <RecipientBadge status={r.status} />
            </li>
          ))}
        </ul>
      </Panel>
    );

  return (
    <div className="space-y-5">
      <Panel className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle hint={doc.id.slice(0, 8).toUpperCase()}>Estado</SectionTitle>
          <DocStatusBadge status={doc.status} />
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-line2 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-300">
            {doc.docTypeLabel.toUpperCase()}
          </span>
          {doc.docNumber && (
            <span className="rounded border border-line2 px-2 py-0.5 font-mono text-[9px] text-slate-400">
              {doc.docNumber}
            </span>
          )}
          <span
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[9px] font-bold ring-1 ring-inset",
              ENTITY_META[entityType].badge
            )}
          >
            {ENTITY_META[entityType].short}
          </span>
          {doc.apaEnabled && (
            <span className="rounded border border-cyan-400/30 px-2 py-0.5 font-mono text-[9px] font-bold text-cyan-300">
              APA 7
            </span>
          )}
        </div>

        {sender && (
          <div className="mb-3 flex items-center gap-2.5 rounded-md border border-line bg-panel2/40 px-3 py-2">
            <Avatar name={sender.name} color={sender.color} photoUrl={sender.photoUrl} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-semibold text-slate-200">{sender.name}</p>
              <p className="truncate font-mono text-[9px] uppercase text-slate-500">
                remitente · {sender.cargo ?? "—"}
              </p>
            </div>
          </div>
        )}

          {doc.returnNote && doc.status === "borrador" && (
            <div className="mb-3 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2.5">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-amber-300">Devuelto para corrección</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-amber-100/90">{doc.returnNote}</p>
              <p className="mt-1 font-mono text-[9px] text-amber-300/70">Corrija el documento en el editor y vuelva a despacharlo.</p>
            </div>
          )}

        {total > 0 && (
          <div className="mb-3">
            <div className="mb-1.5 flex justify-between font-mono text-[10px] text-slate-500">
              <span>PROGRESO DE FIRMA</span>
              <span className="text-neonsoft">
                {done}/{total} · {pct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-line2">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  done === total
                    ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]"
                    : "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        <p className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500">
          <Clock3 className="h-3.5 w-3.5" />
          {formatDateTime(doc.createdAt)}
        </p>
      </Panel>

      <Panel className="p-5">
        <SectionTitle>Acciones</SectionTitle>
        <div className="space-y-2">
          {doc.myAction?.kind === "sign" && doc.myAction.token && (
            <a
              href={`/firmar/${doc.myAction.token}`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-neon px-4 py-3 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)]"
            >
              <PenLine className="h-4 w-4" />
              Firmar documento
            </a>
          )}
          {doc.myAction?.kind === "approve" && doc.myAction.token && (
            <a
              href={`/firmar/${doc.myAction.token}`}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-neon px-4 py-3 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)]"
            >
              <CheckCircle2 className="h-4 w-4" />
              Aprobar o devolver
            </a>
          )}
          {doc.myAction?.kind === "wait" && (
            <p className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200">
              Usted es el firmante designado. Podrá firmar cuando todos los participantes aprueben el documento.
            </p>
          )}
          {doc.status === "borrador" ? (
            <>
              {/* Dos despachos juntos: revisión/aprobación o firma directa */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => openDispatch("aprobacion")}
                  title="Enviar a una persona para que lo revise: podrá aprobarlo o devolverlo con observaciones"
                  className="flex items-center justify-center gap-2 rounded-md border border-amber-400/50 bg-amber-400/15 px-3 py-3 text-[12px] font-bold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/25 hover:shadow-[0_0_22px_-8px_rgba(251,191,36,0.9)]"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Enviar a aprobar
                </button>
                <button
                  onClick={() => openDispatch("firma")}
                  title="Despacho directo al firmante designado (con su rúbrica si usted es el firmante)"
                  className="flex items-center justify-center gap-2 rounded-md bg-neon px-3 py-3 text-[12px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)]"
                >
                  <Send className="h-4 w-4" />
                  Enviar a firmar
                </button>
              </div>
              {(doc.approvers?.length ?? 0) === 0 && (
                <p className="rounded-md border border-dashed border-amber-400/30 px-3 py-2 text-[10.5px] leading-snug text-amber-200/80">
                  «Enviar a aprobar» requiere revisores: agréguelos en «Configuración previa».
                </p>
              )}
              <a
                href={`/editor/${doc.id}`}
                target={`signum-editor-${doc.id}`}
                rel="opener"
                className="flex w-full items-center justify-center gap-2 rounded-md border border-line2 px-4 py-2.5 text-[12.5px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
              >
                <PencilLine className="h-4 w-4" />
                Abrir editor (pestaña nueva)
              </a>
              <a
                href={`/documentos/${doc.id}/editar-config`}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-line2 px-4 py-2.5 text-[12.5px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
              >
                <Settings2 className="h-4 w-4" />
                Configuración previa
              </a>
            </>
            ) : (
            <button
              onClick={() => openDispatch("firma")}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-plasma/40 bg-plasma/10 px-4 py-2.5 text-[12.5px] font-bold text-plasma transition hover:bg-plasma/20"
            >
              <CopyPlus className="h-4 w-4" />
              Enviar copias a entornos
            </button>
          )}
          {pdf && (
            <DownloadPdfButton
              evidence={pdf}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-teal-400/40 bg-teal-400/10 px-4 py-2.5 text-[12.5px] font-bold text-teal-300 transition hover:bg-teal-400/20"
              label="Descargar PDF"
            />
          )}
          <button
            onClick={() => window.print()}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-line2 px-4 py-2.5 text-[12.5px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
          >
            <Printer className="h-4 w-4" />
            Imprimir / PDF
          </button>
          {doc.status === "borrador" && (
            <button
              onClick={removeDoc}
              disabled={deleting}
              className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-[11.5px] font-semibold text-rose-400 transition hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Eliminando…" : "Eliminar borrador"}
            </button>
          )}
        </div>
      </Panel>

      {doc.status === "en_aprobacion" && (doc.pendingApprovers?.length ?? 0) > 0 && (
        <Panel className="p-5 border-amber-400/25">
          <SectionTitle hint={`${doc.pendingApprovers!.length} pendiente(s)`}>Aprobaciones previas a la firma</SectionTitle>
          <ul className="space-y-1.5">
            {doc.pendingApprovers!.map((a) => (
              <li key={a.email + a.kind} className="flex items-center gap-3 rounded-md px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-200">{a.name}</p>
                  <p className="truncate font-mono text-[9.5px] uppercase text-slate-500">
                    {a.kind === "destinatario" ? "Destinatario" : a.kind === "attendee" ? "Asistente" : a.kind === "copy" ? "Copia" : "Participante"} · sin aprobar
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-slate-500">
            El firmante recibirá el documento cuando todos aprueben.
          </p>
          {doc.canAdvance && !advanceOpen && !advanceResult && (
            <button type="button" onClick={() => setAdvanceOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11.5px] font-bold uppercase tracking-wide text-amber-200 transition hover:bg-amber-400/20">
              Avanzar a firma sin esperar
            </button>
          )}
          {advanceOpen && (
            <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3">
              <p className="text-[11.5px] font-bold text-amber-200">Motivo de la excepción</p>
              <p className="mt-0.5 text-[10.5px] text-slate-400">Quedará registrado en la bitácora quién avanzó el documento y qué aprobaciones se omitieron.</p>
              <textarea value={advanceReason} onChange={(e) => setAdvanceReason(e.target.value)} rows={2} maxLength={400}
                placeholder="Ej.: El destinatario es una cuenta de plataforma; la aprobación no aplica."
                className="mt-2 w-full resize-none rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-amber-400/60" />
              {advanceError && <p className="mt-1 text-[11px] text-rose-300">{advanceError}</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={advanceToSignature} disabled={advancing}
                  className="flex flex-1 items-center justify-center rounded-md bg-amber-400 px-3 py-2 text-[11.5px] font-bold uppercase text-void disabled:opacity-50">
                  {advancing ? "Avanzando…" : "Confirmar"}
                </button>
                <button type="button" onClick={() => { setAdvanceOpen(false); setAdvanceReason(""); }}
                  className="rounded-md border border-line2 px-3 py-2 text-[11.5px] font-semibold text-slate-300">Cancelar</button>
              </div>
            </div>
          )}
          {advanceResult && (
            <div className="mt-3 rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-[11.5px] text-emerald-200">
              Documento enviado a firma de <b>{advanceResult.name}</b>. Clave de firma (entréguela por otro canal):{" "}
              <code className="font-mono text-emerald-100">{advanceResult.password}</code>
            </div>
          )}
        </Panel>
      )}

      {signers.length > 0 && (
        <Panel className="p-5">
          <SectionTitle hint={`${done}/${total}`}>Firmantes designados</SectionTitle>
          <ul className="space-y-1.5">
            {signers.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 transition hover:bg-white/[0.03]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-line2 font-mono text-[10px] font-bold text-neon">
                  {s.slot ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-slate-200">{s.name}</p>
                  <p className="truncate font-mono text-[9.5px] text-slate-500">
                    {s.slotLabel ?? s.cargo ?? s.email}
                  </p>
                </div>
                {s.status !== "firmado" && doc.status === "en_firma" && (
                  <button
                    onClick={() => copyLink(s.token)}
                    title="Copiar enlace seguro de firma"
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-md border transition",
                      copied === s.token
                        ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-300"
                        : "border-line2 text-slate-500 hover:border-neon/40 hover:text-neon"
                    )}
                  >
                    {copied === s.token ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Link2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
                <RecipientBadge status={s.status} />
              </li>
            ))}
          </ul>
          {signers.some((s) => s.status !== "firmado") && doc.status === "en_firma" && (
            <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-snug text-slate-600">
              <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500/70" />
              Enlace de un solo uso + clave personal por canal separado.
            </p>
          )}
        </Panel>
      )}

      <PeopleBlock
        title="Asistentes"
        hint="ACTA"
        rows={attendees}
        icon={Users}
        tone="border-amber-400/30 bg-amber-400/10 text-amber-300"
      />
      <PeopleBlock
        title="Participantes"
        hint="INFORME"
        rows={participants}
        icon={UserRound}
        tone="border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
      />
      <PeopleBlock
        title="Copias de conocimiento"
        hint="SOLO LECTURA"
        rows={copies}
        icon={Building2}
        tone="border-plasma/30 bg-plasma/10 text-plasma"
      />

      <SendModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        circuit={modalCircuit}
        docId={doc.id}
        docTitle={doc.title}
        docStatus={doc.status}
        approvers={doc.approvers ?? []}
        ownerName={owner?.name ?? "Propietario"}
        ownerEmail={owner?.email ?? ""}
        entityType={entityType}
        configuredSigners={signers.map<ConfiguredSigner>((s) => ({
          id: s.id,
          name: s.name,
          email: s.email,
          slot: s.slot,
          slotLabel: s.slotLabel,
          status: s.status,
        }))}
        onSent={() => router.refresh()}
      />
    </div>
  );
}
