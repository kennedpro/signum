import Link from "next/link";
import { db } from "@/db";
import { auditEvents, documents, users } from "@/db/schema";
import { and, count, desc, eq } from "drizzle-orm";
import {
  ArrowUpRight,
  FileText,
  PenLine,
  CheckCircle2,
  Send,
  Archive,
  Plus,
  ChevronRight,
  UserCheck,
  Terminal,
  ShieldCheck,
  Cpu,
  Inbox,
} from "lucide-react";
import { Avatar, DocStatusBadge, SectionTitle, Panel } from "@/components/bits";
import { FadeUp } from "@/components/motion";
import { AUDIT_META, timeAgo, cn } from "@/lib/utils";
import { currentUser, getInboxCounts } from "@/lib/inbox";
import { docTypeOf } from "@/lib/doctypes";
import { INBOX_LINKS } from "@/lib/nav";

export const dynamic = "force-dynamic";

const FLOW = [
  { icon: Plus, label: "Configurar" },
  { icon: FileText, label: "Redactar" },
  { icon: PenLine, label: "Firmar" },
  { icon: Send, label: "Distribuir" },
  { icon: Archive, label: "Sellar" },
];

export default async function DashboardPage() {
  const { getSessionContext } = await import("@/lib/auth");
  const ctx = await getSessionContext();
  const me = ctx?.user ?? (await currentUser());
  const counts = me
    ? await getInboxCounts(me.email, me.id)
    : { firma: 0, actas: 0, edicion: 0, conocimiento: 0, aprobacion: 0 };
  const orgFilter = ctx?.orgId ? eq(documents.organizationId, ctx.orgId) : undefined;

  const byStatus = await db
    .select({ status: documents.status, value: count() })
    .from(documents)
    .where(orgFilter)
    .groupBy(documents.status);
  const stat = (s: string) => byStatus.find((r) => r.status === s)?.value ?? 0;
  const total = byStatus.reduce((a, r) => a + r.value, 0);

  const recentDocs = await db
    .select({
      id: documents.id,
      title: documents.title,
      docType: documents.docType,
      status: documents.status,
      updatedAt: documents.updatedAt,
      ownerName: users.name,
      ownerColor: users.color,
      ownerPhoto: users.photoUrl,
    })
    .from(documents)
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(orgFilter)
    .orderBy(desc(documents.updatedAt))
    .limit(6);

  const activity = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      label: auditEvents.label,
      actor: auditEvents.actorName,
      docId: auditEvents.documentId,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(40);

  const seen = new Set<string>();
  const uniqueActivity = activity.filter((ev) => {
    const key = `${ev.action}|${ev.actor}|${ev.docId ?? ev.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 7);

  const first = (me?.name ?? "operador").split(" ")[0];

  const KPIS = [
    { label: "Total", value: total, icon: FileText, tone: "text-neon", hint: "en custodia" },
    { label: "Borradores", value: stat("borrador"), icon: PenLine, tone: "text-slate-400", hint: "en edición" },
    { label: "En firma", value: stat("en_firma"), icon: UserCheck, tone: "text-amber-400", hint: "esperando rúbrica" },
    { label: "Firmados y Gestionados", value: stat("completado"), icon: CheckCircle2, tone: "text-emerald-400", hint: "hash verificado" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FadeUp>
        <Panel className="scanline overflow-hidden">
          <div className="hud-grid relative p-6 sm:p-8">
            <div className="relative flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-xl">
                <p className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-neon">
                  <Terminal className="h-3.5 w-3.5" />
                  sesión iniciada · {first}
                </p>
                <h2 className="mt-3 font-display text-3xl font-bold leading-[1.12] text-slate-50 sm:text-[38px]">
                  Configure las partes,{" "}
                  <span className="text-neon">redacte y selle</span> con trazabilidad
                  completa.
                </h2>
                <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-slate-400">
                  Defina remitente, firmantes, asistentes y copias antes de editar. El
                  documento nace con cabecera institucional, formato APA opcional y
                  contenedores de firma protegidos.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/documentos/nuevo"
                    className="inline-flex items-center gap-2 rounded-md bg-neon px-5 py-2.5 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_26px_-6px_rgba(34,211,238,0.85)]"
                  >
                    <Plus className="h-4 w-4" />
                    Nuevo documento
                  </Link>
                  <Link
                    href="/bandeja?vista=firma"
                    className="inline-flex items-center gap-2 rounded-md border border-line2 px-5 py-2.5 text-[12.5px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
                  >
                    Mi bandeja
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="hidden items-center md:flex">
                {FLOW.map((step, i) => (
                  <div key={step.label} className="flex items-center">
                    <div className="flex flex-col items-center gap-1.5 px-1.5">
                      <span
                        className={cn(
                          "grid h-10 w-10 place-items-center rounded-lg border",
                          i === 0
                            ? "pulse-ring border-neon/60 bg-neon/15 text-neon"
                            : "border-line2 bg-panel/70 text-slate-400"
                        )}
                      >
                        <step.icon className="h-[16px] w-[16px]" />
                      </span>
                      <span className="font-mono text-[8.5px] uppercase tracking-wider text-slate-500">
                        {step.label}
                      </span>
                    </div>
                    {i < FLOW.length - 1 && (
                      <svg width="22" height="4" className="-mt-5 text-neon/40">
                        <line
                          x1="0"
                          y1="2"
                          x2="22"
                          y2="2"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="anim-dash"
                        />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </FadeUp>

      {/* Bandeja resumida */}
      <FadeUp delay={0.04}>
        <Panel className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-neon" />
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Su bandeja de entrada
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {INBOX_LINKS.map((t) => (
              <Link
                key={t.key}
                href={`/bandeja?vista=${t.key}`}
                className="group rounded-lg border border-line bg-panel2/40 p-3.5 transition hover:border-neon/40"
              >
                <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {t.label}
                </p>
                <p className="mt-1.5 font-display text-[26px] font-bold leading-none text-slate-50 group-hover:text-neonsoft">
                  {String(counts[t.key]).padStart(2, "0")}
                </p>
              </Link>
            ))}
          </div>
        </Panel>
      </FadeUp>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((k, i) => (
          <FadeUp key={k.label} delay={0.04 * i}>
            <Panel className="p-4">
              <div className="flex items-start justify-between">
                <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  {k.label}
                </p>
                <k.icon className={cn("h-4 w-4", k.tone)} />
              </div>
              <p className="mt-2.5 font-display text-[34px] font-bold leading-none text-slate-50">
                {String(k.value).padStart(2, "0")}
              </p>
              <p className="mt-1.5 text-[10.5px] text-slate-500">{k.hint}</p>
            </Panel>
          </FadeUp>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <FadeUp delay={0.08}>
          <Panel>
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <SectionTitle>Actividad documental</SectionTitle>
              <Link
                href="/documentos"
                className="flex items-center gap-1 font-mono text-[11px] font-semibold text-neon hover:underline"
              >
                VER TODO
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {recentDocs.length === 0 && (
              <p className="px-5 py-12 text-center text-[13px] text-slate-500">
                Sin documentos. Cree el primero desde “Nuevo documento”.
              </p>
            )}
            {recentDocs.map((doc, i) => (
              <Link
                key={doc.id}
                href={`/documentos/${doc.id}`}
                className={cn(
                  "group flex items-center gap-3.5 px-5 py-3 transition hover:bg-neon/[0.04]",
                  i !== recentDocs.length - 1 && "border-b border-line/60"
                )}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line2 bg-panel2/60">
                  <FileText className="h-[15px] w-[15px] text-slate-500 group-hover:text-neon" />
                </span>
                {doc.ownerName && (
                  <Avatar
                    name={doc.ownerName}
                    color={doc.ownerColor ?? "#22d3ee"}
                    photoUrl={doc.ownerPhoto}
                    size="sm"
                    className="hidden rounded-md sm:inline-flex"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-200 group-hover:text-neonsoft">
                    {doc.title}
                  </p>
                  <p className="truncate font-mono text-[10px] text-slate-600">
                    {docTypeOf(doc.docType).short} · {doc.ownerName ?? "—"} ·{" "}
                    {timeAgo(doc.updatedAt)}
                  </p>
                </div>
                <DocStatusBadge status={doc.status} />
                <ChevronRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-neon" />
              </Link>
            ))}
          </Panel>
        </FadeUp>

        <div className="space-y-5">
          <FadeUp delay={0.12}>
            <Panel>
              <div className="border-b border-line px-5 py-3.5">
                <SectionTitle hint="ÚLTIMOS EVENTOS">Movimiento reciente</SectionTitle>
              </div>
              <ol className="overflow-hidden px-4 py-4">
                {uniqueActivity.map((ev, i) => {
                  const meta = AUDIT_META[ev.action] ?? AUDIT_META.editado;
                  return (
                    <li key={ev.id} className="relative flex gap-3 pb-3.5 last:pb-0">
                      {i !== activity.length - 1 && (
                        <span className="absolute left-[4px] top-3.5 h-full w-px bg-line" />
                      )}
                      <span
                        className={cn(
                          "relative mt-1 h-[9px] w-[9px] shrink-0 rounded-full ring-4 ring-panel",
                          meta.color
                        )}
                      />
                      <div className="min-w-0 flex-1 overflow-hidden">
                        {ev.docId ? (
                          <Link
                            href={`/documentos/${ev.docId}`}
                            className="block truncate text-[12px] text-slate-300 hover:text-neonsoft"
                            title={ev.label}
                          >
                            {ev.label}
                          </Link>
                        ) : (
                          <p className="truncate text-[12px] text-slate-300" title={ev.label}>
                            {ev.label}
                          </p>
                        )}
                        <p className="truncate font-mono text-[9.5px] text-slate-600">
                          {ev.actor} · {timeAgo(ev.createdAt)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          </FadeUp>

          <FadeUp delay={0.16}>
            <Panel className="p-4">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Postura de seguridad
                </p>
              </div>
              <ul className="mt-3 space-y-1.5 text-[11.5px] text-slate-500">
                {[
                  "Trazabilidad por documento",
                  "Pista de seguridad restringida por rol",
                  "Doble sellado SHA-256 pre/post",
                  "Contenedor de firma 120×44 mm",
                ].map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <Cpu className="h-3 w-3 text-neon/70" />
                    {s}
                  </li>
                ))}
              </ul>
            </Panel>
          </FadeUp>
        </div>
      </div>
    </div>
  );
}
