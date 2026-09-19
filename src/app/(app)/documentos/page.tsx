import Link from "next/link";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";
import { desc, eq, ilike, and, inArray, or, type SQL } from "drizzle-orm";
import { redirect } from "next/navigation";
import { canViewDocument, canViewSealedByRadicado } from "@/lib/access";
import { FileText, Plus, SearchX, ChevronRight, Search } from "lucide-react";
import { Avatar, DocStatusBadge, Panel } from "@/components/bits";
import { FadeUp } from "@/components/motion";
import { DOC_STATUS, cn, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

  const TABS = [
  { key: null, label: "Todos" },
  { key: "borrador", label: "Borradores" },
  { key: "en_aprobacion", label: "En aprobación" },
  { key: "en_firma", label: "En firma" },
  { key: "completado", label: "Firmados y gestionados" },
];

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; q?: string }>;
}) {
  const { estado, q } = await searchParams;
  const { getSessionContext } = await import("@/lib/auth");
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login?next=/documentos");

  const query = (q ?? "").trim();
  // Búsqueda por RADICADO (p. ej. INF-2026-0010): solo documentos firmados.
  const looksLikeRadicado = /^[A-Z]{2,6}-\d{4}-\d{3,6}$/i.test(query);

  const conditions: SQL[] = [];
  if (ctx.orgId && !ctx.isPlatformAdmin) conditions.push(eq(documents.organizationId, ctx.orgId));
  if (looksLikeRadicado) {
    conditions.push(eq(documents.status, "completado"));
    conditions.push(ilike(documents.docNumber, query));
  } else {
    if (estado && DOC_STATUS[estado]) conditions.push(eq(documents.status, estado));
    if (query) conditions.push(or(ilike(documents.title, `%${query}%`), ilike(documents.docNumber, `%${query}%`), ilike(documents.subject, `%${query}%`))!);
  }

  const docsAll = await db
    .select({
      id: documents.id,
      title: documents.title,
      status: documents.status,
      docNumber: documents.docNumber,
      draftCode: documents.draftCode,
      updatedAt: documents.updatedAt,
      ownerName: users.name,
      ownerColor: users.color,
      ownerId: documents.ownerId,
      senderId: documents.senderId,
      organizationId: documents.organizationId,
    })
    .from(documents)
    .leftJoin(users, eq(documents.ownerId, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(documents.updatedAt));

  // Visibilidad por documento: relacionados o privilegiados de la misma organización.
  // Por radicado (firmado): solo quien lo creó, quien lo firmó o privilegiados de su organización.
  const allIds = docsAll.map((d) => d.id);
  const partiesAll = allIds.length
    ? await db.select({ documentId: recipients.documentId, email: recipients.email, kind: recipients.kind }).from(recipients).where(inArray(recipients.documentId, allIds))
    : [];
  const docs = docsAll.filter((d) => {
    const parts = partiesAll.filter((p) => p.documentId === d.id);
    return looksLikeRadicado ? canViewSealedByRadicado(ctx, d, parts) : canViewDocument(ctx, d, parts);
  });

  const ids = docs.map((d) => d.id);
  const rs = ids.length
    ? await db
        .select({
          documentId: recipients.documentId,
          kind: recipients.kind,
          status: recipients.status,
        })
        .from(recipients)
        .where(inArray(recipients.documentId, ids))
    : [];

  const progressFor = (id: string) => {
    const s = rs.filter((r) => r.documentId === id && r.kind === "signer");
    return { signed: s.filter((r) => r.status === "firmado").length, total: s.length };
  };

  const countFor = (k: string | null) =>
    k === null ? docs.length : docs.filter((d) => d.status === k).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <FadeUp className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel/70 p-1">
          {TABS.map((t) => {
            const active = (estado ?? null) === t.key;
            return (
              <Link
                key={t.label}
                href={
                  t.key
                    ? `/documentos?estado=${t.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`
                    : `/documentos${q ? `?q=${encodeURIComponent(q)}` : ""}`
                }
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] font-semibold transition",
                  active
                    ? "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                    : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                )}
              >
                {t.label}
                <span className="font-mono text-[10px] text-slate-500">
                  {String(countFor(t.key)).padStart(2, "0")}
                </span>
              </Link>
            );
          })}
        </div>
        <Link
          href="/documentos/nuevo"
          className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_22px_-6px_rgba(34,211,238,0.8)]"
        >
          <Plus className="h-4 w-4" />
          Nuevo
        </Link>
      </FadeUp>

      {q && (
        <FadeUp className="flex items-center gap-3 rounded-lg border border-neon/25 bg-neon/[0.06] px-4 py-2.5 text-[12.5px] text-slate-300">
          <Search className="h-4 w-4 text-neon" />
          {looksLikeRadicado ? "Radicado" : "Filtro activo"}: <span className="font-semibold text-neonsoft">“{q}”</span> —{" "}
          {docs.length} resultado(s)
          {looksLikeRadicado && docs.length === 0 && (
            <span className="text-slate-500"> · solo se muestran documentos firmados que usted creó o firmó</span>
          )}
          <Link href="/documentos" className="ml-auto font-mono text-[11px] text-neon hover:underline">
            LIMPIAR
          </Link>
        </FadeUp>
      )}

      <FadeUp delay={0.05}>
        <Panel className="overflow-hidden">
          <div className="hidden grid-cols-[1fr_130px_130px_110px_20px] items-center gap-4 border-b border-line px-5 py-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-600 md:grid">
            <span>Documento</span>
            <span>Estado</span>
            <span>Firmas</span>
            <span>Actualizado</span>
            <span />
          </div>

          {docs.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-lg border border-line bg-panel2">
                <SearchX className="h-5 w-5 text-slate-500" />
              </span>
              <p className="font-display text-lg font-bold text-slate-200">Sin resultados</p>
              <p className="max-w-sm text-[12.5px] text-slate-500">
                No hay documentos con estos filtros.
              </p>
              <Link
                href="/documentos/nuevo"
                className="mt-1 inline-flex items-center gap-2 rounded-md border border-neon/40 bg-neon/10 px-4 py-2 text-[12px] font-bold text-neonsoft"
              >
                <Plus className="h-4 w-4" />
                Crear documento
              </Link>
            </div>
          )}

          {docs.map((doc) => {
            const p = progressFor(doc.id);
            return (
              <Link
                key={doc.id}
                href={`/documentos/${doc.id}`}
                className="group grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line/60 px-5 py-3 transition last:border-0 hover:bg-neon/[0.04] md:grid-cols-[1fr_130px_130px_110px_20px] md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 bg-panel2/60">
                    <FileText className="h-4 w-4 text-slate-500 group-hover:text-neon" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-slate-200 group-hover:text-neonsoft">
                      {doc.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] text-slate-600">
                      {doc.ownerName && (
                        <>
                          <Avatar name={doc.ownerName} color={doc.ownerColor ?? "#22d3ee"} size="xs" />
                          <span className="truncate">{doc.ownerName}</span>
                          <span>·</span>
                        </>
                      )}
                      {doc.docNumber ? (
                        <span className="text-teal-300">{doc.docNumber}</span>
                      ) : (
                        <span className="text-amber-300/80">Borrador {doc.draftCode ?? "—"}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="hidden md:block">
                  <DocStatusBadge status={doc.status} />
                </div>

                <div className="hidden md:block">
                  {p.total === 0 ? (
                    <span className="font-mono text-[11px] text-slate-600">—</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-14 overflow-hidden rounded-full bg-line2">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            p.signed === p.total ? "bg-emerald-400" : "bg-amber-400"
                          )}
                          style={{ width: `${Math.round((p.signed / p.total) * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        {p.signed}/{p.total}
                      </span>
                    </div>
                  )}
                </div>

                <span className="hidden font-mono text-[10.5px] text-slate-500 md:block">
                  {timeAgo(doc.updatedAt)}
                </span>

                <div className="flex items-center gap-2 md:justify-end">
                  <span className="md:hidden">
                    <DocStatusBadge status={doc.status} />
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-700 transition group-hover:translate-x-0.5 group-hover:text-neon" />
                </div>
              </Link>
            );
          })}
        </Panel>
      </FadeUp>
    </div>
  );
}
