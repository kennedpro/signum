"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Trash2,
  Plus,
  Send,
  Loader2,
  CheckCircle2,
  Link2,
  Building2,
  ShieldCheck,
  KeyRound,
  Copy,
  PenSquare,
  Lock,
} from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { fieldClass } from "@/components/identity-fields";
import { DEPARTMENTS, cn } from "@/lib/utils";
import { ENTITY_META, type EntityType } from "@/lib/entity";

export type ConfiguredSigner = {
  id: string;
  name: string;
  email: string;
  slot: number | null;
  slotLabel: string | null;
  status: string;
};

type CopyRow = { name: string; email: string; department: string };

export function SendModal({
  open,
  onClose,
  approvers = [],
  circuit,
  docId,
  docTitle,
  docStatus,
  ownerName,
  ownerEmail,
  entityType,
  configuredSigners,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  docId: string;
  docTitle: string;
  docStatus: string;
  ownerName: string;
  ownerEmail: string;
  entityType: EntityType;
  configuredSigners: ConfiguredSigner[];
  /** Personas que deben aprobar antes de la firma (revisores/asistentes), excluido el autor. */
  approvers?: { name: string; kind: string; email: string }[];
  /** Circuito forzado por los dos botones del expediente: revisión/aprobación o firma directa. */
  circuit?: "aprobacion" | "firma";
  onSent: () => void;
}) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [copies, setCopies] = useState<CopyRow[]>([]);
  // Selección de aprobadores (todos marcados por defecto) y mensaje del emisor
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>(() => approvers.map((a) => a.email.toLowerCase()));
  const [message, setMessage] = useState("");
  const [signSelf, setSignSelf] = useState(true);
  const [signPassword, setSignPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpInfo, setOtpInfo] = useState<{
    maskedEmail: string;
    demoCode?: string;
  } | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [result, setResult] = useState<{
    signers: { name: string; token: string; password: string; slotLabel: string }[];
    copies: number;
    status: string;
    hashPre?: string | null;
    hashPost?: string | null;
    ntp?: { iso: string; source: string };
  } | null>(null);

  const onlyCopies = docStatus !== "borrador";
  const meta = ENTITY_META[entityType];

  /* Circuito explícito elegido con los dos botones del expediente:
     · "aprobacion" → una persona revisa y aprueba o devuelve; luego se libera al firmante.
                      En este circuito NUNCA se estampa la rúbrica del emisor.
     · "firma"      → despacho directo al firmante (con autofirma del emisor si es el firmante). */
  const forcedApproval = !onlyCopies && circuit === "aprobacion";
  const forcedDirect = !onlyCopies && circuit === "firma";
  const hasReviewers = approvers.length > 0;

  /** El emisor solo puede firmar si figura como firmante configurado. */
  const ownSlot = configuredSigners.find(
    (s) => s.email.toLowerCase() === ownerEmail.toLowerCase() && s.status !== "firmado"
  );
  const canSelfSign = Boolean(ownSlot) && !onlyCopies && !forcedApproval;
  /* En el circuito de aprobación hay que elegir al menos un revisor. */
  const needsApproval = forcedApproval && selectedApprovers.length > 0;
  const mode: "approve" | "selfsign" | "sign" = onlyCopies
    ? "sign"
    : forcedApproval
      ? "approve"
      : canSelfSign
        ? "selfsign"
        : "sign";
  const modeTitle = onlyCopies
    ? "Enviar copias de conocimiento"
    : forcedApproval
      ? "Enviar para revisión y aprobación"
      : canSelfSign
        ? "Enviar a firmar"
        : "Enviar a firmar";
  const modeAction = onlyCopies
    ? "Enviar copias"
    : forcedApproval
      ? "Enviar a aprobar"
      : canSelfSign
        ? "Enviar a firmar"
        : "Enviar a firmar";
  const modeEyebrow = onlyCopies
    ? "// distribución"
    : forcedApproval
      ? "// circuito de revisión y aprobación"
      : "// despacho a firma directa";

  // Reinicio del formulario cada vez que se abre el modal.
  useEffect(() => {
    if (open) {
      setSelectedApprovers(approvers.map((a) => a.email.toLowerCase()));
      setMessage("");
      setSignSelf(true);
      setSignPassword("");
      setOtp("");
      setOtpInfo(null);
      setHasInk(false);
      setError(null);
      setResult(null);
      setCopies([]);
    }
    // Solo al abrir/cambiar circuito; approvers ya llega estable desde el servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, circuit]);

  const copiesValid = copies.every(
    (c) => c.name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())
  );
  const valid =
    copiesValid &&
    (onlyCopies
      ? copies.length > 0
      : forcedApproval
        ? needsApproval
        : !canSelfSign ||
          !signSelf ||
          (hasInk && signPassword.trim().length >= 4 && /^\d{6}$/.test(otp.trim())));

  async function requestOtp() {
    setOtpLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documentos/${docId}/otp-emisor`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el código");
      setOtpInfo({ maskedEmail: data.maskedEmail, demoCode: data.demoCode });
      setOtp("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al solicitar el código");
    } finally {
      setOtpLoading(false);
    }
  }

  async function submit() {
    setError(null);
    setSending(true);
    try {
      let selfSignature = null;
      if (!needsApproval && canSelfSign && signSelf) {
        selfSignature = await padRef.current?.getSignature();
        if (!selfSignature) throw new Error("Trace o escriba su rúbrica antes de enviar.");
      }
      const res = await fetch(`/api/documentos/${docId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          copies,
          selfSignature,
          signPassword,
          otp: otp.trim(),
          // Circuito de aprobación: solo los revisores elegidos. Firma directa:
          // lista vacía para que los revisores configurados queden «informados»
          // y el documento pase directo al firmante.
          approvers: forcedApproval ? selectedApprovers : forcedDirect ? [] : approvers.length > 0 ? selectedApprovers : undefined,
          circuit: forcedApproval ? "aprobacion" : forcedDirect ? "firma" : undefined,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar");
      setSignPassword("");
      setOtp("");
      // Despachar lleva directo al portal de firma del firmante designado.
      const signerLink = data.signers?.[0]?.token
        ? `/firmar/${data.signers[0].token}`
        : null;
      if (data.selfSigned && !signerLink) {
        onSent();
        onClose();
        window.location.href = `/documentos/${docId}`;
        return;
      }
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSending(false);
    }
  }

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* noop */
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-void/80 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="hud flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl sm:rounded-xl"
          >
            {!result ? (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                  <div>
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.22em] text-neon">
                      {modeEyebrow}
                    </p>
                    <h3 className="mt-1 font-display text-xl font-bold text-slate-50">
                      {modeTitle}
                    </h3>
                    <p className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ring-1 ring-inset",
                          meta.badge
                        )}
                      >
                        {meta.short}
                      </span>
                      <span className="truncate text-[11px] text-slate-500">{docTitle}</span>
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="rounded-md border border-line p-1.5 text-slate-500 transition hover:text-rose-400"
                    aria-label="Cerrar"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                  {/* Firmantes definidos en la configuración previa */}
                  {!onlyCopies && (
                    <div className="rounded-lg border border-line bg-panel2/40 p-4">
                      <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        <Lock className="h-3.5 w-3.5 text-neon" />
                        Firmantes definidos en la configuración previa
                      </p>
                      <ul className="space-y-1.5">
                        {configuredSigners.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center gap-2.5 rounded-md border border-line bg-panel/50 px-3 py-2"
                          >
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-line2 font-mono text-[10px] font-bold text-neon">
                              {s.slot ?? "—"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[12px] font-semibold text-slate-200">
                                {s.name}
                              </p>
                              <p className="truncate font-mono text-[9.5px] text-slate-500">
                                {s.slotLabel}
                              </p>
                            </div>
                            {s.status === "firmado" ? (
                              <span className="rounded bg-emerald-400/12 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-300">
                                FIRMADO
                              </span>
                            ) : (
                              <span className="rounded bg-amber-400/12 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-300">
                                PENDIENTE
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 font-mono text-[9px] leading-snug text-slate-600">
                        ESTA LISTA NO SE MODIFICA AQUÍ. SE DEFINIÓ AL CREAR EL DOCUMENTO.
                      </p>
                      {forcedApproval && (
                        <p className="mt-1 font-mono text-[9px] leading-snug text-amber-300/80">
                          CIRCUITO DE REVISIÓN: LAS CREDENCIALES DE FIRMA SE EMITIRÁN SOLO CUANDO EL (LOS) REVISOR(ES) APRUEBEN.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Circuito de revisión y aprobación */}
                  {forcedApproval && hasReviewers && (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-4">
                      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-amber-300">
                        ¿Quién debe revisar y aprobar?
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {approvers.map((a) => {
                          const key = a.email.toLowerCase();
                          const on = selectedApprovers.includes(key);
                          return (
                            <li key={key + a.kind}>
                              <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-line px-3 py-2 text-[12px] text-slate-200 transition hover:border-amber-400/40">
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() =>
                                    setSelectedApprovers((cur) => (on ? cur.filter((e) => e !== key) : [...cur, key]))
                                  }
                                  className="h-3.5 w-3.5 accent-amber-400"
                                />
                                <span className="flex-1 truncate">{a.name}</span>
                                <span className="font-mono text-[9px] uppercase text-slate-500">
                                  {a.kind === "destinatario" ? "destinatario" : a.kind === "attendee" ? "asistente" : a.kind === "copy" ? "copia" : "participante"}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        {selectedApprovers.length > 0
                          ? `El revisor recibirá un enlace seguro para leer el documento: podrá APROBARLO o DEVOLVERLO con observaciones. Cuando ${selectedApprovers.length === 1 ? "apruebe" : "todos aprueben"}, el documento pasará automáticamente al firmante designado. La rúbrica del emisor no se estampa en este circuito.`
                          : "Seleccione al menos una persona que deba revisar y aprobar el documento."}
                      </p>
                    </div>
                  )}

                  {/* Circuito de aprobación sin revisores configurados */}
                  {forcedApproval && !hasReviewers && (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 p-4 text-[12px] leading-relaxed text-amber-200">
                      <p className="font-bold">No hay revisores configurados en este documento.</p>
                      <p className="mt-1 text-amber-200/80">
                        Cancele, abra «Configuración previa» y añada a la(s) persona(s) que deben
                        revisarlo; luego use de nuevo «Enviar a aprobar».
                      </p>
                    </div>
                  )}

                  {/* Aviso del circuito de firma directa: los revisores configurados quedan informados */}
                  {forcedDirect && approvers.length > 0 && (
                    <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.05] p-4 text-[11.5px] leading-relaxed text-slate-300">
                      <ShieldCheck className="mr-1 inline h-4 w-4 text-cyan-300" />
                      Despacho directo: {approvers.length === 1 ? "el revisor configurado recibirá" : "los revisores configurados recibirán"} el documento como copia de conocimiento, sin trámite de aprobación.
                    </div>
                  )}

                  {/* Mensaje del emisor (queda en el hilo del documento) */}
                  {!onlyCopies && (
                    <div className="rounded-lg border border-line bg-panel2/40 p-4">
                      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
                        Mensaje para {forcedApproval ? "quien revisa y aprueba" : "el firmante"}
                      </p>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        maxLength={1500}
                        placeholder={needsApproval
                          ? "Ej.: Jefe, respetuosamente me permito enviar el documento para su aprobación."
                          : "Ej.: Adjunto el documento para su firma. Quedo atento."}
                        className="mt-2 w-full resize-none rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-neon/50"
                      />
                      <p className="mt-1 font-mono text-[9px] text-slate-600">
                        {message.length}/1500 · quedará registrado en «Mensajes del documento», visible para todos los relacionados.
                      </p>
                    </div>
                  )}

                  {/* Rúbrica del emisor: SOLO en el circuito de firma directa.
                      En el circuito de aprobación no se muestra ni se estampa. */}
                  {!onlyCopies && !forcedApproval &&
                    (canSelfSign ? (
                      <div className="rounded-lg border border-line bg-panel2/40 p-4">
                        <label className="flex cursor-pointer items-center justify-between gap-3">
                          <div>
                            <p className="text-[12.5px] font-bold text-slate-200">
                              Estampar mi firma ahora
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {ownerName} · contenedor {ownSlot?.slot} ·{" "}
                              <span className="font-mono">{ownSlot?.slotLabel}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSignSelf((s) => !s)}
                            aria-pressed={signSelf}
                            className={cn(
                              "relative w-10 shrink-0 rounded-full transition",
                              signSelf ? "bg-neon" : "bg-line2"
                            )}
                            style={{ height: 22 }}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 h-[18px] w-[18px] rounded-full bg-void transition-all",
                                signSelf ? "left-[20px]" : "left-0.5"
                              )}
                            />
                          </button>
                        </label>
                        {signSelf && (
                          <div className="mt-3 space-y-3 border-t border-line pt-3">
                            <SignaturePad
                              ref={padRef}
                              defaultName={ownerName}
                              onInkChange={setHasInk}
                            />
                            <div>
                              <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-amber-300">
                                <KeyRound className="h-3.5 w-3.5" />
                                Su firma digital personal
                              </p>
                              <input
                                type="password"
                                value={signPassword}
                                onChange={(e) => setSignPassword(e.target.value)}
                                placeholder="Su clave personal de firma"
                                autoComplete="off"
                                className={fieldClass}
                              />
                              <p className="mt-1 font-mono text-[9px] text-slate-600">
                                CADA USUARIO TIENE LA SUYA · DEMO: FIRMA2026 O CLAVE DE ACCESO
                              </p>
                            </div>
                            {/* Paso de autenticación: código de intención */}
                            <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/[0.05] p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="flex items-center gap-1.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                  Paso 2 · Código de confirmación
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
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="flex items-start gap-2 rounded-lg border border-line bg-panel2/40 px-4 py-3 text-[11.5px] text-slate-400">
                        <PenSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                        Usted no figura como firmante de este documento; al despachar se
                        emitirán las credenciales para quienes sí fueron designados.
                      </p>
                    ))}

                  {/* Copias adicionales */}
                  <div className="rounded-lg border border-line bg-panel2/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                        <Building2 className="h-3.5 w-3.5 text-plasma" />
                        Copias adicionales ({copies.length})
                      </p>
                      <button
                        onClick={() =>
                          setCopies((c) => [...c, { name: "", email: "", department: "Legal" }])
                        }
                        className="inline-flex items-center gap-1 rounded border border-line2 px-2 py-1 font-mono text-[10px] font-bold text-slate-300 transition hover:border-neon/40 hover:text-neon"
                      >
                        <Plus className="h-3 w-3" />
                        AÑADIR
                      </button>
                    </div>
                    {copies.length === 0 && (
                      <p className="font-mono text-[10px] text-slate-600">
                        LAS COPIAS DE LA CONFIGURACIÓN PREVIA YA ESTÁN REGISTRADAS.
                      </p>
                    )}
                    <div className="space-y-2">
                      {copies.map((c, i) => (
                        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            value={c.name}
                            onChange={(e) =>
                              setCopies((arr) =>
                                arr.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x))
                              )
                            }
                            placeholder="Nombre"
                            className={fieldClass}
                          />
                          <input
                            value={c.email}
                            onChange={(e) =>
                              setCopies((arr) =>
                                arr.map((x, idx) =>
                                  idx === i ? { ...x, email: e.target.value } : x
                                )
                              )
                            }
                            placeholder="correo@entidad.gov.co"
                            className={fieldClass}
                          />
                          <div className="flex gap-2">
                            <select
                              value={c.department}
                              onChange={(e) =>
                                setCopies((arr) =>
                                  arr.map((x, idx) =>
                                    idx === i ? { ...x, department: e.target.value } : x
                                  )
                                )
                              }
                              className={fieldClass}
                            >
                              {DEPARTMENTS.map((d) => (
                                <option key={d} className="bg-panel">
                                  {d}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => setCopies((arr) => arr.filter((_, idx) => idx !== i))}
                              className="rounded p-1.5 text-slate-600 transition hover:bg-rose-500/10 hover:text-rose-400"
                              aria-label="Quitar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {error && (
                    <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-[12px] font-medium text-rose-300">
                      {error}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3.5">
                  <p className="hidden font-mono text-[9.5px] leading-snug text-slate-600 sm:block">
                    ENLACE 192 BITS + CLAVE FUERA DE BANDA
                    <br />
                    DOBLE SELLADO SHA-256 · NTP
                  </p>
                  <button
                    onClick={submit}
                    disabled={!valid || sending}
                    className="inline-flex items-center gap-2 rounded-md bg-neon px-5 py-2.5 text-[12px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_24px_-6px_rgba(34,211,238,0.9)] disabled:opacity-40 disabled:shadow-none"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {modeAction}
                  </button>
                </div>
              </>
            ) : (
              <div className="overflow-y-auto px-6 py-7">
                <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-xl border border-emerald-400/40 bg-emerald-400/10">
                  <ShieldCheck className="h-6 w-6 text-emerald-400" />
                </div>
                <h3 className="text-center font-display text-2xl font-bold text-slate-50">
                  Despacho ejecutado
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-center text-[12.5px] text-slate-400">
                  {result.status === "completado"
                    ? "Documento firmado, sellado y congelado en solo lectura."
                    : result.status === "en_aprobacion"
                      ? "El documento está en revisión. El revisor podrá aprobarlo o devolverlo; si lo aprueba, se libera automáticamente al firmante designado."
                      : "Entregue a cada firmante su enlace y su clave por canales distintos."}
                </p>

                {result.hashPost && (
                  <div className="mt-4 grid gap-2">
                    {[
                      { k: "HASH 1 · PRE-FIRMA", v: result.hashPre },
                      { k: "HASH 2 · POST-FIRMA", v: result.hashPost },
                    ].map((x) => (
                      <div key={x.k} className="rounded-md border border-line bg-panel2/50 p-2.5">
                        <p className="font-mono text-[8.5px] font-bold tracking-[0.16em] text-slate-500">
                          {x.k}
                        </p>
                        <p className="mt-0.5 break-all font-mono text-[9.5px] text-emerald-300">
                          {x.v}
                        </p>
                      </div>
                    ))}
                    {result.ntp && (
                      <p className="font-mono text-[9px] text-slate-600">
                        SELLO DE TIEMPO · {result.ntp.source} · {result.ntp.iso}
                      </p>
                    )}
                  </div>
                )}

                {result.signers.length > 0 && (
                  <div className="mt-5 space-y-2">
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Credenciales de firma
                    </p>
                    {result.signers.map((s) => (
                      <div
                        key={s.token}
                        className="rounded-md border border-line bg-panel2/50 px-3 py-2.5"
                      >
                        <p className="text-[12px] font-semibold text-slate-200">
                          {s.name}
                          <span className="ml-2 font-mono text-[9px] text-neon/70">
                            {s.slotLabel}
                          </span>
                        </p>
                        <div className="mt-2 flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5 shrink-0 text-neon" />
                          <span className="flex-1 truncate font-mono text-[9.5px] text-slate-500">
                            /firmar/{s.token.slice(0, 16)}…
                          </span>
                          <button
                            onClick={() =>
                              copyText(`l-${s.token}`, `${window.location.origin}/firmar/${s.token}`)
                            }
                            className={cn(
                              "shrink-0 rounded px-2.5 py-1 font-mono text-[9.5px] font-bold transition",
                              copied === `l-${s.token}`
                                ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40"
                                : "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                            )}
                          >
                            {copied === `l-${s.token}` ? "OK" : "ENLACE"}
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <KeyRound className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <span className="flex-1 font-mono text-[12px] font-bold tracking-[0.2em] text-amber-300">
                            {s.password}
                          </span>
                          <button
                            onClick={() => copyText(`p-${s.token}`, s.password)}
                            className={cn(
                              "shrink-0 rounded px-2.5 py-1 font-mono text-[9.5px] font-bold transition",
                              copied === `p-${s.token}`
                                ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40"
                                : "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/35"
                            )}
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <p className="font-mono text-[9px] leading-snug text-amber-400/70">
                      ⚠ ESTA CLAVE NO SE VOLVERÁ A MOSTRAR. ENVÍELA POR UN CANAL DISTINTO AL DEL ENLACE.
                    </p>
                  </div>
                )}

                {result.copies > 0 && (
                  <p className="mt-4 flex items-start gap-2 rounded-md border border-plasma/30 bg-plasma/10 px-4 py-2.5 text-[11.5px] text-plasma">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    {result.copies} copia(s) adicional(es) distribuida(s).
                  </p>
                )}

                <button
                  onClick={() => {
                    const dest = result.signers?.[0]?.token
                      ? `/firmar/${result.signers[0].token}`
                      : `/documentos/${docId}`;
                    onSent();
                    onClose();
                    setResult(null);
                    setCopies([]);
                    window.location.href = dest;
                  }}
                  className="mt-6 w-full rounded-md bg-neon py-3 text-[12.5px] font-bold uppercase tracking-wide text-void"
                >
                  Ver expediente
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
