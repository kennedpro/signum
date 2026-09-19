import Link from "next/link";
import {
  PenSquare,
  ClipboardList,
  FilePen,
  Eye,
  ChevronRight,
  Inbox,
  KeyRound,
  FileText,
  CheckCircle2,
} from "lucide-react";
import { Avatar, DocStatusBadge, Panel, RecipientBadge } from "@/components/bits";
import { FadeUp } from "@/components/motion";
import { currentUser, getInbox, getInboxCounts, type InboxView } from "@/lib/inbox";
import { docTypeOf } from "@/lib/doctypes";
import { cn, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const VIEWS: Record<
  InboxView,
  { label: string; icon: typeof Inbox; hint: string; empty: string; tone: string }
> = {
  firma: {
    label: "Para mi firma",
    icon: PenSquare,
    hint: "Documentos donde el creador lo designó como firmante",
    empty: "No tiene documentos esperando su firma.",
    tone: "text-amber-300 border-amber-400/30 bg-amber-400/10",
  },
  aprobacion: {
    label: "Por aprobar",
    icon: CheckCircle2,
    hint: "Documentos donde figura como asistente y debe aprobar",
    empty: "No tiene aprobaciones pendientes.",
    tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",
  },
  actas: {
    label: "Actas",
    icon: ClipboardList,
    hint: "Actas en las que figura como asistente, firmante o autor",
    empty: "No figura en ningún acta todavía.",
    tone: "text-cyan-300 border-cyan-400/30 bg-cyan-400/10",
  },
  edicion: {
    label: "En edición",
    icon: FilePen,
    hint: "Borradores propios pendientes de despachar",
    empty: "No tiene borradores en edición.",
    tone: "text-slate-300 border-line2 bg-panel2/60",
  },
  conocimiento: {
    label: "De conocimiento",
    icon: Eye,
    hint: "Copias y documentos donde participa sin firmar",
    empty: "No ha recibido copias de conocimiento.",
    tone: "text-plasma border-plasma/30 bg-plasma/10",
  },
};

export default async function BandejaPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const { vista } = await searchParams;
  const view: InboxView = (
    ["firma", "aprobacion", "actas", "edicion", "conocimiento"] as const
  ).includes(vista as InboxView)
    ? (vista as InboxView)
    : "firma";

  const me = await currentUser();
  if (!me) {
    return (
      <p className="py-16 text-center text-[13px] text-slate-500">
        No hay usuario configurado en el entorno.
      </p>
    );
  }

  const items = await getInbox(view, me.email, me.id);
  const counts = await getInboxCounts(me.email, me.id);
  const meta = VIEWS[view];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <FadeUp className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(VIEWS) as InboxView[]).map((k) => {
          const v = VIEWS[k];
          const active = k === view;
          return (
            <Link key={k} href={`/bandeja?vista=${k}`}>
              <Panel
                className={cn(
                  "p-4 transition",
                  active ? "border-neon/45 bg-neon/[0.05]" : "hover:border-line2"
                )}
              >
                <div className="flex items-start justify-between">
                  <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
                    {v.label}
                  </p>
                  <v.icon className={cn("h-4 w-4", active ? "text-neon" : "text-slate-500")} />
                </div>
                <p className="mt-2 font-display text-[30px] font-bold leading-none text-slate-50">
                  {String(counts[k]).padStart(2, "0")}
                </p>
              </Panel>
            </Link>
          );
        })}
      </FadeUp>

      <FadeUp delay={0.05}>
        <Panel>
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
            <span
              className={cn("grid h-9 w-9 place-items-center rounded-lg border", meta.tone)}
            >
              <meta.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-slate-100">{meta.label}</p>
              <p className="font-mono text-[10px] text-slate-500">{meta.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              <Avatar
                name={me.name}
                color={me.color}
                photoUrl={me.photoUrl}
                size="sm"
                className="rounded-md"
              />
              <span className="hidden font-mono text-[10px] text-slate-500 sm:inline">
                {me.email}
              </span>
            </div>
          </div>

          {items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Inbox className="h-7 w-7 text-slate-700" />
              <p className="text-[13px] text-slate-500">{meta.empty}</p>
            </div>
          )}

          <ul className="divide-y divide-line/60">
            {items.map((it) => {
              const def = docTypeOf(it.docType);
              // Firmante con el documento aún en aprobación: al expediente (no puede firmar todavía).
              const href =
                (view === "firma" || view === "aprobacion") && it.token && !(view === "firma" && it.status === "en_aprobacion")
                  ? `/firmar/${it.token}`
                  : view === "edicion"
                    ? `/documentos/${it.id}/editar`
                    : `/documentos/${it.id}`;
              return (
                <li key={`${it.id}-${it.token ?? "x"}`}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3.5 px-5 py-3.5 transition hover:bg-neon/[0.04]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 bg-panel2/60">
                      <FileText className="h-4 w-4 text-slate-500 group-hover:text-neon" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-slate-200 group-hover:text-neonsoft">
                        {it.title}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] text-slate-600">
                        <span className="rounded border border-line2 px-1.5 text-slate-400">
                          {def.short}
                        </span>
                        {it.docNumber ? (
                          <span className="text-teal-300">{it.docNumber}</span>
                        ) : it.draftCode ? (
                          <span className="text-amber-300/80">Borrador {it.draftCode}</span>
                        ) : null}
                        <span>·</span>
                        {it.ownerName && (
                          <>
                            <Avatar
                              name={it.ownerName}
                              color={it.ownerColor ?? "#22d3ee"}
                              photoUrl={it.ownerPhoto}
                              size="xs"
                            />
                            <span className="truncate">{it.ownerName}</span>
                            <span>·</span>
                          </>
                        )}
                        <span>{timeAgo(it.updatedAt)}</span>
                        {it.slotLabel && view === "firma" && (
                          <span className="text-neon/70">· {it.slotLabel}</span>
                        )}
                      </div>
                    </div>

                    {view === "firma" && (
                      <span className="hidden items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 font-mono text-[9.5px] font-bold text-amber-300 sm:flex">
                        <KeyRound className="h-3 w-3" />
                        FIRMAR
                      </span>
                    )}
                    {it.myStatus && view !== "edicion" && view !== "firma" && (
                      <RecipientBadge status={it.myStatus} />
                    )}
                    <DocStatusBadge status={it.status} />
                    <ChevronRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-neon" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </FadeUp>
    </div>
  );
}
