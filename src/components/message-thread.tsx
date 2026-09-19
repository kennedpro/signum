"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Archive, Forward, Loader2, MessageSquareText, Send } from "lucide-react";
import { Panel, SectionTitle } from "@/components/bits";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════
   HILO DE MENSAJES DEL DOCUMENTO

   DOCUMENTO ELECTRÓNICO No. XXXXXXXX-XX
   [USUARIO 1]
   Comentario: …
   Para: …
   Fecha: DD/MM/AAAA HH:MM
   ↓
   [USUARIO 2] …

   Lo ven todos los relacionados con el documento, antes y después de la
   firma. Permite añadir comentarios, archivar o remitir (con destinatario).
   ═══════════════════════════════════════════════════════════════════ */

export type ThreadMessage = {
  id: string;
  fromName: string;
  fromEmail: string | null;
  toName: string | null;
  toEmail: string | null;
  kind: string;
  body: string;
  createdAt: string;
};

export type ThreadPerson = { name: string; email: string; role?: string | null };

const KIND_LABEL: Record<string, string> = {
  envio_aprobacion: "ENVÍO A APROBACIÓN",
  envio_firma: "ENVÍO A FIRMA",
  aprobacion: "APROBACIÓN",
  devolucion: "DEVOLUCIÓN",
  firma: "FIRMA",
  archivo: "ARCHIVO",
  remision: "REMISIÓN",
  comentario: "COMENTARIO",
};
const KIND_TONE: Record<string, string> = {
  envio_aprobacion: "text-amber-300 border-amber-400/40",
  envio_firma: "text-neon border-neon/40",
  aprobacion: "text-emerald-300 border-emerald-400/40",
  devolucion: "text-orange-300 border-orange-400/40",
  firma: "text-emerald-300 border-emerald-400/40",
  archivo: "text-slate-300 border-slate-400/40",
  remision: "text-sky-300 border-sky-400/40",
  comentario: "text-slate-300 border-line2",
};

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function MessageThread({
  documentId,
  code,
  initialMessages,
  people,
  canWrite = true,
  canArchive = false,
  className,
  sealedAt = null,
}: {
  documentId: string;
  /** Radicado o borrador: "INF-2026-0010" / "Borrador 00000017" */
  code: string;
  initialMessages: ThreadMessage[];
  /** Personas relacionadas (para dirigir un comentario o remitir) */
  people: ThreadPerson[];
  canWrite?: boolean;
  /** Archivar solo si el documento está firmado y llegó a la bandeja de esta persona. */
  canArchive?: boolean;
  className?: string;
  /** Momento del sellado (firma completa). Separa los mensajes de ELABORACIÓN de los de GESTIÓN. */
  sealedAt?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [text, setText] = useState("");
  const [to, setTo] = useState("");
  const [kind, setKind] = useState<"comentario" | "archivo" | "remision">("comentario");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => setMessages(initialMessages), [initialMessages]);

  /* Dos paquetes independientes:
     · ELABORACIÓN — desde la creación hasta el sellado (envíos, aprobaciones, devoluciones, firma).
     · GESTIÓN     — después del sellado (comentarios, remisiones, archivo).                       */
  const sealedMs = sealedAt ? new Date(sealedAt).getTime() : null;
  const before = messages.filter((m) => sealedMs === null || new Date(m.createdAt).getTime() <= sealedMs || m.kind === "firma");
  const after = messages.filter((m) => sealedMs !== null && new Date(m.createdAt).getTime() > sealedMs && m.kind !== "firma");
  const groups = [
    ...(before.length ? [{ key: "elaboracion", title: "Elaboración y firma", items: before }] : []),
    ...(sealedMs !== null ? [{ key: "gestion", title: "Gestión posterior a la firma", items: after }] : []),
  ].filter((g) => g.items.length > 0 || g.key === "gestion");

  const send = useCallback(async () => {
    if (busy) return;
    if (text.trim().length < 2) { setError("Escriba el comentario."); return; }
    if (kind === "archivo" && !canArchive) { setError("Solo se puede archivar un documento firmado que haya llegado a su bandeja."); return; }
    if (kind === "remision" && !to) { setError("Indique a quién remite el documento."); return; }
    setBusy(true); setError(null);
    try {
      const target = people.find((p) => p.email === to);
      const res = await fetch(`/api/documentos/${documentId}/mensajes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text.trim(), kind, toEmail: to || undefined, toName: target?.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar");
      setMessages((m) => [...m, { ...data.message, createdAt: data.message.createdAt ?? new Date().toISOString() }]);
      setText(""); setTo(""); setKind("comentario"); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally { setBusy(false); }
  }, [busy, text, kind, to, people, documentId, router, canArchive]);

  return (
    <Panel className={cn("p-5", className)}>
      <SectionTitle hint={`${messages.length} mensaje(s)`}>Mensajes del documento</SectionTitle>
      <p className="mb-3 font-mono text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-300">
        Documento electrónico No. {code}
      </p>

      {messages.length === 0 ? (
        <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[11.5px] text-slate-500">
          Aún no hay mensajes. Los comentarios de envío, aprobación, firma, archivo o remisión aparecerán aquí.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <section key={g.key}>
              <p className={cn("mb-1.5 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em]", g.key === "gestion" ? "text-emerald-300" : "text-amber-300")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", g.key === "gestion" ? "bg-emerald-400" : "bg-amber-400")} />
                {g.title}
                <span className="text-slate-600">· {g.items.length}</span>
              </p>
              {g.items.length === 0 && (
                <p className="rounded-md border border-dashed border-line px-3 py-3 text-center text-[11px] text-slate-500">
                  Sin mensajes posteriores a la firma. Use «Comentar», «Remitir» o «Archivar».
                </p>
              )}
              <ol className="space-y-1">
                {g.items.map((m, i) => (
                  <li key={m.id}>
                    <div className={cn("rounded-md border bg-panel2/40 px-3 py-2.5", KIND_TONE[m.kind] ?? KIND_TONE.comentario)}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-100">[{m.fromName}]</p>
                        <span className="font-mono text-[8.5px] font-bold tracking-[0.14em]">{KIND_LABEL[m.kind] ?? m.kind.toUpperCase()}</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-200"><span className="text-slate-500">Comentario:</span> {m.body}</p>
                      <p className="text-[11px] text-slate-400"><span className="text-slate-500">Para:</span> {m.toName ?? "Todos los relacionados"}</p>
                      <p className="font-mono text-[10px] text-slate-500"><span>Fecha:</span> {fmt(m.createdAt)}</p>
                    </div>
                    {i < g.items.length - 1 && (
                      <div className="flex justify-center py-0.5 text-slate-600"><ArrowDown className="h-3.5 w-3.5" /></div>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="mt-3">
          {!open ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setKind("comentario"); setOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft">
                <MessageSquareText className="h-3.5 w-3.5" /> Comentar
              </button>
              <button type="button" onClick={() => { setKind("remision"); setOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-sky-400/40 hover:text-sky-300">
                <Forward className="h-3.5 w-3.5" /> Remitir
              </button>
              {canArchive && (
                <button type="button" onClick={() => { setKind("archivo"); setOpen(true); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition hover:border-slate-400/60">
                  <Archive className="h-3.5 w-3.5" /> Archivar
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-line bg-panel2/40 p-3">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {kind === "remision" ? "Remitir documento" : kind === "archivo" ? "Archivar documento" : "Nuevo comentario"}
              </p>
              <select value={to} onChange={(e) => setTo(e.target.value)}
                className="mt-2 w-full rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-neon/50">
                <option value="">{kind === "remision" ? "Seleccione a quién remite…" : "Para: todos los relacionados"}</option>
                {people.map((p) => <option key={p.email} value={p.email}>{p.name}{p.role ? ` · ${p.role}` : ""}</option>)}
              </select>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1500}
                placeholder={kind === "archivo" ? "Ej.: Se archiva en el expediente 2026-014 de la dependencia." : kind === "remision" ? "Ej.: Se remite para su conocimiento y fines pertinentes." : "Escriba su comentario…"}
                className="mt-2 w-full resize-none rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12px] text-slate-200 outline-none focus:border-neon/50" />
              {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={send} disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-neon px-3 py-2 text-[11.5px] font-bold uppercase text-void disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
                </button>
                <button type="button" onClick={() => { setOpen(false); setError(null); }}
                  className="rounded-md border border-line2 px-3 py-2 text-[11.5px] font-semibold text-slate-300">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
