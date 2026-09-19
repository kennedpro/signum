import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { BookMarked, Lock, ShieldCheck, ShieldX, Hash, FileText } from "lucide-react";
import { db } from "@/db";
import { numberingLedger, organizations } from "@/db/schema";
import { Panel, SectionTitle } from "@/components/bits";
import { FadeUp } from "@/components/motion";
import { getSessionContext, canViewSecurity } from "@/lib/auth";
import { verifyLedger } from "@/lib/radicado";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RadicacionPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const ctx = await getSessionContext();
  if (!ctx || !canViewSecurity(ctx.user.systemRole)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10">
          <Lock className="h-6 w-6 text-rose-400" />
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-100">Acceso restringido</h1>
        <p className="mt-2 text-[13px] text-slate-400">
          El libro de radicación es evidencia documental. Solo el Jefe de Gestión Documental o
          el administrador pueden consultarlo.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-md border border-line2 px-5 py-2.5 text-[12.5px] font-bold text-slate-300">
          Volver al Inicio
        </Link>
      </div>
    );
  }

  const orgId = ctx.orgId;
  const [org] = orgId
    ? await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
    : [null];

  const kindFilter = tipo === "provisional" || tipo === "radicado" ? tipo : null;

  const rows = await db
    .select()
    .from(numberingLedger)
    .where(
      orgId
        ? kindFilter
          ? sql`${numberingLedger.organizationId} = ${orgId} and ${numberingLedger.kind} = ${kindFilter}`
          : eq(numberingLedger.organizationId, orgId)
        : sql`false`
    )
    .orderBy(desc(numberingLedger.createdAt), desc(numberingLedger.id))
    .limit(300);

  const chain = await verifyLedger(orgId);
  const totalProv = rows.filter((r) => r.kind === "provisional").length;
  const totalRad = rows.filter((r) => r.kind === "radicado").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <FadeUp className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-lg border border-teal-400/30 bg-teal-400/10">
            <BookMarked className="h-5 w-5 text-teal-300" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-slate-100">Libro de radicación</h2>
            <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
              {org?.name ?? "—"} · registro inmutable de numeración
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-panel/70 p-1">
          {[
            { k: null, label: "Todo" },
            { k: "provisional", label: "Provisionales" },
            { k: "radicado", label: "Radicados" },
          ].map((f) => (
            <Link
              key={f.label}
              href={f.k ? `/radicacion?tipo=${f.k}` : "/radicacion"}
              className={cn(
                "rounded-md px-3 py-1.5 text-[11.5px] font-semibold transition",
                (kindFilter ?? null) === f.k
                  ? "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </FadeUp>

      <FadeUp delay={0.04}>
        <Panel
          className={cn(
            "flex flex-wrap items-center gap-3 p-4",
            chain.ok ? "border-emerald-400/30" : "border-rose-500/40"
          )}
        >
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-lg border",
              chain.ok
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-400"
                : "border-rose-500/40 bg-rose-500/10 text-rose-400"
            )}
          >
            {chain.ok ? <ShieldCheck className="h-5 w-5" /> : <ShieldX className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-100">
              {chain.ok
                ? "Libro íntegro: cada asiento enlaza con el anterior"
                : `Cadena rota en el asiento #${chain.brokenAt}${chain.code ? ` (${chain.code})` : ""}${
                    "reason" in chain && chain.reason ? ` · ${chain.reason}` : ""
                  }`}
            </p>
            <p className="font-mono text-[10px] text-slate-500">
              {chain.length} asientos · {totalProv} provisionales · {totalRad} radicados · protegido por
              trigger de base de datos (sin UPDATE/DELETE)
            </p>
          </div>
        </Panel>
      </FadeUp>

      <FadeUp delay={0.08}>
        <Panel>
          <div className="border-b border-line px-5 py-3.5">
            <SectionTitle hint="ACUERDO 060/2001 AGN">Asientos</SectionTitle>
          </div>
          <div className="hidden grid-cols-[140px_1fr_170px_150px_120px] gap-3 border-b border-line px-5 py-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-600 md:grid">
            <span>Código</span><span>Documento</span><span>Solicitante</span><span>Fecha (NTP)</span><span>Huella</span>
          </div>
          {rows.length === 0 && (
            <p className="px-6 py-12 text-center text-[13px] text-slate-500">Sin asientos todavía.</p>
          )}
          <ul className="divide-y divide-line/60">
            {rows.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-1.5 px-5 py-3 md:grid-cols-[140px_1fr_170px_150px_120px] md:items-center md:gap-3">
                <span
                  className={cn(
                    "inline-block w-fit rounded px-2 py-0.5 font-mono text-[11px] font-bold",
                    r.kind === "radicado"
                      ? "bg-teal-400/12 text-teal-300 ring-1 ring-teal-400/30"
                      : "bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/25"
                  )}
                >
                  {r.code}
                </span>
                <div className="min-w-0">
                  {r.documentId ? (
                    <Link href={`/documentos/${r.documentId}`} className="flex items-center gap-1.5 truncate text-[12.5px] text-slate-200 hover:text-neonsoft">
                      <FileText className="h-3 w-3 shrink-0 text-slate-500" />
                      {r.documentTitle ?? r.documentId}
                    </Link>
                  ) : (
                    <p className="truncate text-[12.5px] text-slate-300">{r.documentTitle ?? "—"}</p>
                  )}
                  <p className="font-mono text-[9.5px] text-slate-600">
                    {r.kind === "radicado" ? "RADICADO OFICIAL" : "CÓDIGO PROVISIONAL"} · {r.scope}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-slate-300">{r.actorName}</p>
                  <p className="truncate font-mono text-[9.5px] text-slate-600">{r.ip ?? "—"}</p>
                </div>
                <p className="font-mono text-[10px] text-slate-400">
                  {formatDateTime(r.createdAt)}
                  <span className="block text-[8.5px] text-slate-600">{r.ntpSource}</span>
                </p>
                <p className="flex items-center gap-1 font-mono text-[9.5px] text-slate-500" title={r.hash}>
                  <Hash className="h-3 w-3 text-neon/60" />
                  {r.hash.slice(0, 12)}…
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </FadeUp>
    </div>
  );
}
