import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, securityLogs } from "@/db/schema";
import {
  ShieldAlert,
  FileText,
  Hash,
  Clock,
  CheckCircle2,
  XCircle,
  Link2Off,
  Lock,
} from "lucide-react";
import { FadeUp } from "@/components/motion";
import { Panel, SectionTitle } from "@/components/bits";
import { verifyChain } from "@/lib/audit";
import { getSessionContext } from "@/lib/auth";
import { cn, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const EVENT_META: Record<string, { label: string; color: string }> = {
  intento_firma: { label: "Intento de firma", color: "text-sky-300" },
  autorizacion: { label: "Autorización 2FA", color: "text-cyan-300" },
  firma_exitosa: { label: "Firma exitosa", color: "text-emerald-300" },
  clave_invalida: { label: "Clave inválida", color: "text-rose-300" },
  bloqueo_temporal: { label: "Bloqueo temporal", color: "text-rose-400" },
  sellado: { label: "Sellado / solo lectura", color: "text-violet-300" },
  clave_restablecida: { label: "Contraseña restablecida por administrador", color: "text-amber-300" },
  cambio_clave: { label: "Cambio de contraseña propia", color: "text-emerald-300" },
};

export default async function SeguridadPage() {
  /* ── RBAC: Jefe de Gestión Documental, Administrador de empresa o
     Administrador de plataforma. La VISIBILIDAD además se limita a la
     propia empresa (o a todas, solo para el administrador de plataforma). */
  const ctx = await getSessionContext();
  const me = ctx?.user ?? null;
  const allowed = Boolean(
    me && (me.systemRole === "jefe_gestion" || me.systemRole === "admin" || me.systemRole === "superadmin")
  );

  if (!ctx || !allowed) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10">
          <Lock className="h-6 w-6 text-rose-400" />
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-100">Acceso restringido</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          La pista de auditoría de seguridad contiene evidencia forense (intentos de
          firma, claves rechazadas y huellas criptográficas). Solo el rol{" "}
          <strong className="text-slate-200">Jefe de Gestión Documental</strong> o un
          administrador pueden consultarla.
        </p>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-slate-600">
          rol actual: {me?.systemRole ?? "desconocido"} · se requiere jefe_gestion
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-line2 px-5 py-2.5 text-[12.5px] font-bold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
        >
          Volver a la consola
        </Link>
      </div>
    );
  }

  // Se trae la bitácora COMPLETA (todas las empresas) para poder verificar la
  // cadena de hashes global —es un único libro encadenado de la plataforma—,
  // pero solo se MUESTRAN los registros de la empresa activa (o todos, si es
  // el administrador de plataforma sin una entidad elegida).
  const allLogs = await db
    .select({
      id: securityLogs.id,
      event: securityLogs.event,
      result: securityLogs.result,
      actorName: securityLogs.actorName,
      actorEmail: securityLogs.actorEmail,
      detail: securityLogs.detail,
      ip: securityLogs.ip,
      ntpIso: securityLogs.ntpIso,
      ntpSource: securityLogs.ntpSource,
      hashPre: securityLogs.hashPre,
      hashPost: securityLogs.hashPost,
      hash: securityLogs.hash,
      prevHash: securityLogs.prevHash,
      createdAt: securityLogs.createdAt,
      docId: securityLogs.documentId,
      docTitle: documents.title,
      docOrgId: documents.organizationId,
      logOrgId: securityLogs.organizationId,
    })
    .from(securityLogs)
    .leftJoin(documents, eq(securityLogs.documentId, documents.id))
    .orderBy(desc(securityLogs.createdAt))
    .limit(500);

  // Integridad: se calcula sobre la cadena GLOBAL completa (tal como se firmó).
  const chronoAll = [...allLogs].reverse();
  const chain = verifyChain(chronoAll.map((l) => ({ hash: l.hash, prevHash: l.prevHash })));
  const chainLen = chain.length;

  // Visibilidad: solo su empresa; el administrador de plataforma sin entidad
  // elegida ve todo. Los eventos sin documento asociado (p. ej. rotación de
  // clave de firma) solo se muestran a quien esté viendo su propia empresa
  // cuando el actor pertenece a ella, o a la plataforma sin filtrar.
  const logs = ctx.isPlatformAdmin && !ctx.orgId
    ? allLogs.slice(0, 150)
    : allLogs
        .filter((l) => (l.docId ? l.docOrgId === ctx.orgId : l.logOrgId === ctx.orgId))
        .slice(0, 150);

  const fails = logs.filter((l) => l.result === "fail").length;
  const signs = logs.filter((l) => l.event === "firma_exitosa").length;
  const seals = logs.filter((l) => l.event === "sellado").length;

  const KPI = [
    { label: "Registros", value: logs.length, icon: ShieldAlert, tone: "text-neon" },
    { label: "Firmas OK", value: signs, icon: CheckCircle2, tone: "text-emerald-400" },
    { label: "Rechazos", value: fails, icon: XCircle, tone: "text-rose-400" },
    { label: "Firmados y Gestionados", value: seals, icon: Lock, tone: "text-violet-300" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <FadeUp className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPI.map((k) => (
          <Panel key={k.label} className="p-4">
            <div className="flex items-start justify-between">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {k.label}
              </p>
              <k.icon className={cn("h-4 w-4", k.tone)} />
            </div>
            <p className="mt-2 font-display text-[30px] font-bold leading-none text-slate-50">
              {String(k.value).padStart(2, "0")}
            </p>
          </Panel>
        ))}
      </FadeUp>

      {/* Verificación forense de la cadena */}
      <FadeUp delay={0.05}>
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
            {chain.ok ? <Hash className="h-5 w-5" /> : <Link2Off className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-slate-100">
              {chain.ok
                ? "Cadena de integridad verificada"
                : `Cadena rota en el registro #${chain.brokenAt}`}
            </p>
            <p className="font-mono text-[10px] text-slate-500">
              {chainLen} eslabones · cada log encadena el hash del anterior (SHA-256)
            </p>
          </div>
          <span
            className={cn(
              "rounded border px-3 py-1 font-mono text-[10.5px] font-bold tracking-widest",
              chain.ok
                ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                : "border-rose-500/40 bg-rose-500/10 text-rose-300"
            )}
          >
            {chain.ok ? "ÍNTEGRA" : "ALTERADA"}
          </span>
        </Panel>
      </FadeUp>

      <FadeUp delay={0.08}>
        <Panel>
          <div className="border-b border-line px-5 py-3.5">
            <SectionTitle hint="PISTA DE AUDITORÍA">
              Logs de seguridad · intentos, NTP y doble sellado
            </SectionTitle>
          </div>
          {logs.length === 0 && (
            <p className="px-6 py-14 text-center text-[13px] text-slate-500">
              Sin registros de seguridad todavía.
            </p>
          )}
          <ul className="divide-y divide-line/60">
            {logs.map((l) => {
              const meta = EVENT_META[l.event] ?? { label: l.event, color: "text-slate-300" };
              return (
                <li key={l.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        l.result === "fail" ? "bg-rose-400" : "bg-emerald-400"
                      )}
                    />
                    <p className={cn("text-[12.5px] font-bold", meta.color)}>{meta.label}</p>
                    <span className="text-[11.5px] text-slate-500">· {l.actorName}</span>
                    <span className="ml-auto font-mono text-[9.5px] text-slate-600">
                      {formatDateTime(l.createdAt)}
                      {l.ip ? ` · ${l.ip}` : ""}
                    </span>
                  </div>
                  {l.detail && (
                    <p className="mt-0.5 pl-4 text-[11.5px] text-slate-400">{l.detail}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-4">
                    {l.docId && l.docTitle && (
                      <Link
                        href={`/documentos/${l.docId}`}
                        className="inline-flex items-center gap-1.5 rounded border border-line2 px-2 py-0.5 font-mono text-[9.5px] text-slate-400 transition hover:border-neon/40 hover:text-neon"
                      >
                        <FileText className="h-2.5 w-2.5" />
                        {l.docTitle.length > 34 ? `${l.docTitle.slice(0, 34)}…` : l.docTitle}
                      </Link>
                    )}
                    {l.ntpSource && (
                      <span className="inline-flex items-center gap-1 rounded border border-line2 px-2 py-0.5 font-mono text-[9.5px] text-slate-500">
                        <Clock className="h-2.5 w-2.5 text-cyan-400/70" />
                        {l.ntpSource}
                      </span>
                    )}
                    {l.hashPre && (
                      <span className="rounded border border-line2 px-2 py-0.5 font-mono text-[9.5px] text-slate-600">
                        PRE {l.hashPre.slice(0, 14)}…
                      </span>
                    )}
                    {l.hashPost && (
                      <span className="rounded border border-emerald-400/25 px-2 py-0.5 font-mono text-[9.5px] text-emerald-300/80">
                        POST {l.hashPost.slice(0, 14)}…
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      </FadeUp>
    </div>
  );
}
