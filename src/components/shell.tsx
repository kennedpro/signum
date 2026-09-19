"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { usePageTitle } from "@/components/page-title";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Files,
  Plus,
  Search,
  Menu,
  X,
  ShieldCheck,
  Server,
  Lock,
  Activity,
  ShieldAlert,
  Building2,
  Inbox,
  PenSquare,
  ClipboardList,
  FilePen,
  Eye,
  IdCard,
  LogOut,
  CheckCircle2,
  BookMarked,
} from "lucide-react";
import { Avatar } from "@/components/bits";
import { BrandMark, BrandWord } from "@/components/brand";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/roles";

type ShellUser = {
  name: string;
  email: string;
  role: string;
  systemRole: string;
  department: string;
  color: string;
  photoUrl: string | null;
};

type ShellOrg = { id?: string; name: string; entityType: string; sigla?: string | null };

export type InboxCounts = {
  firma: number;
  actas: number;
  edicion: number;
  conocimiento: number;
  aprobacion: number;
};

/** Bandeja de entrada — menú superior. */
export const INBOX_TABS = [
  { key: "firma", label: "Para mi firma", icon: PenSquare, hint: "Documentos que debo firmar" },
  { key: "aprobacion", label: "Por aprobar", icon: CheckCircle2, hint: "Asistente: debe aprobar" },
  { key: "actas", label: "Actas", icon: ClipboardList, hint: "Actas donde figuro" },
  { key: "edicion", label: "En edición", icon: FilePen, hint: "Borradores en curso" },
  { key: "conocimiento", label: "De conocimiento", icon: Eye, hint: "Copias y participaciones" },
] as const;

const NAV = [
  { href: "/", label: "Inicio", icon: LayoutDashboard, exact: true, restricted: false },
  { href: "/bandeja", label: "Bandeja", icon: Inbox, exact: false, restricted: false },
  { href: "/documentos", label: "Repositorio", icon: Files, exact: false, restricted: false },
  { href: "/usuarios", label: "Funcionarios", icon: IdCard, exact: false, restricted: true },
  { href: "/radicacion", label: "Libro radicador", icon: BookMarked, exact: false, restricted: true },
  { href: "/seguridad", label: "Seguridad", icon: ShieldAlert, exact: false, restricted: true },
  { href: "/organizacion", label: "Organización", icon: Building2, exact: false, restricted: false },
];

function getTitle(pathname: string): { title: string; sub: string; code: string } {
  if (pathname === "/")
    return { title: "Inicio", sub: "Estado del entorno documental", code: "SYS-000" };
  if (pathname.startsWith("/bandeja"))
    return { title: "Bandeja de entrada", sub: "Su trabajo documental pendiente", code: "BOX-100" };
  if (pathname === "/documentos")
    return { title: "Repositorio", sub: "Documentos bajo custodia", code: "DOC-100" };
  if (pathname.includes("/nuevo"))
    return { title: "Configuración previa", sub: "Defina partes antes de redactar", code: "DOC-NEW" };
  if (pathname.includes("/editar"))
    return { title: "Editor", sub: "Redacción sobre estructura configurada", code: "DOC-EDT" };
  if (pathname.startsWith("/documentos/"))
    return { title: "Expediente", sub: "Firmas, evidencia y trazabilidad", code: "DOC-VIEW" };
  if (pathname.startsWith("/usuarios"))
    return {
      title: "Registro de funcionarios",
      sub: "Fichas oficiales y metadatos de firma",
      code: "USR-500",
    };
  if (pathname.startsWith("/radicacion"))
    return { title: "Libro de radicación", sub: "Numeración consecutiva inmutable", code: "RAD-600" };
  if (pathname.startsWith("/seguridad"))
    return { title: "Pista de auditoría", sub: "Acceso restringido por rol", code: "SEC-300" };
  if (pathname.startsWith("/organizacion"))
    return { title: "Perfil de la organización", sub: "Metadatos dinámicos", code: "ORG-400" };
  return { title: "SIGNUM", sub: "Gestión documental", code: "SYS" };
}

function NavList({
  onNavigate,
  canSecurity,
  pending,
}: {
  onNavigate: () => void;
  canSecurity: boolean;
  pending: number;
}) {
  const pathname = usePathname();
  return (
    <>
      {NAV.filter((n) => !n.restricted || canSecurity).map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[12.5px] font-medium transition-all",
              active
                ? "bg-neon/10 text-neonsoft shadow-[inset_0_0_0_1px_rgba(34,211,238,0.22)]"
                : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-neon shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            )}
            <item.icon
              className={cn(
                "h-[16px] w-[16px]",
                active ? "text-neon" : "text-slate-500 group-hover:text-slate-300"
              )}
            />
            <span className="flex-1">{item.label}</span>
            {item.href === "/bandeja" && pending > 0 && (
              <span className="grid min-w-[18px] place-items-center rounded bg-amber-400/15 px-1 font-mono text-[10px] font-bold text-amber-300 ring-1 ring-amber-400/30">
                {pending}
              </span>
            )}
            {item.restricted && (
              <Lock className="h-3 w-3 text-slate-600" aria-label="Acceso restringido" />
            )}
          </Link>
        );
      })}
    </>
  );
}

function InboxBar({ counts }: { counts: InboxCounts }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("vista") ?? "firma";
  const onInbox = pathname.startsWith("/bandeja");

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
      <span className="mr-1 hidden shrink-0 items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-slate-600 lg:flex">
        <Inbox className="h-3 w-3" />
        bandeja
      </span>
      {INBOX_TABS.map((t) => {
        const active = onInbox && current === t.key;
        const n = counts[t.key];
        return (
          <Link
            key={t.key}
            href={`/bandeja?vista=${t.key}`}
            title={t.hint}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11.5px] font-semibold transition",
              active
                ? "border-neon/45 bg-neon/12 text-neonsoft"
                : "border-line bg-panel/50 text-slate-400 hover:border-line2 hover:text-slate-200"
            )}
          >
            <t.icon className={cn("h-3.5 w-3.5", active ? "text-neon" : "text-slate-500")} />
            {t.label}
            <span
              className={cn(
                "rounded px-1 font-mono text-[9.5px] font-bold",
                n > 0
                  ? active
                    ? "bg-neon/25 text-neonsoft"
                    : "bg-amber-400/15 text-amber-300"
                  : "text-slate-600"
              )}
            >
              {String(n).padStart(2, "0")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function AppShell({
  user,
  org,
  orgs = [],
  isPlatformAdmin = false,
  departments = [],
  counts,
  children,
}: {
  user: ShellUser;
  org: ShellOrg;
  orgs?: ShellOrg[];
  isPlatformAdmin?: boolean;
  departments?: string[];
  counts: InboxCounts;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [clock, setClock] = useState("");

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date())
      );
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, []);

  const routeTitle = getTitle(pathname);
  const pageTitle = usePageTitle();
  const { title, sub, code } = pageTitle
    ? { title: pageTitle.title, sub: pageTitle.sub ?? routeTitle.sub, code: pageTitle.code ?? routeTitle.code }
    : routeTitle;
  const canSecurity = user.systemRole === "jefe_gestion" || user.systemRole === "admin";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  const roleLabel = ROLE_LABEL[user.systemRole] ?? "Usuario";

  const sidebar = (
    <div className="flex h-full flex-col border-r border-line bg-deep/95 backdrop-blur-xl">
      <Link
        href="/"
        onClick={() => setOpen(false)}
        title="Ir al Inicio"
        className="flex items-center gap-3 border-b border-line px-5 py-4 transition hover:bg-white/[0.03]"
      >
        <BrandMark size={42} />
        <BrandWord />
      </Link>

      <div className="px-4 pt-4">
        <Link
          href="/documentos/nuevo"
          className="group flex items-center justify-center gap-2 rounded-md bg-neon/15 px-4 py-2.5 text-[12.5px] font-bold uppercase tracking-[0.08em] text-neonsoft ring-1 ring-neon/40 transition-all hover:bg-neon/25 hover:shadow-[0_0_22px_-6px_rgba(34,211,238,0.7)]"
        >
          <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
          Nuevo documento
        </Link>
      </div>

      <nav className="mt-5 flex-1 space-y-1 overflow-y-auto px-3">
        <p className="px-2 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
          // operación
        </p>
        <NavList
          onNavigate={() => setOpen(false)}
          canSecurity={canSecurity}
          pending={counts.firma}
        />

        <p className="px-2 pb-1.5 pt-6 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
          // {isPlatformAdmin ? "entidades" : "entidad activa"}
        </p>
        <div className="space-y-0.5">
          {(isPlatformAdmin ? orgs : [org]).filter(Boolean).map((env) => {
            const active = env.id === org.id || env.name === org.name;
            return (
              <button
                key={env.id ?? env.name}
                type="button"
                disabled={!isPlatformAdmin || !env.id}
                onClick={async () => {
                  if (!env.id) return;
                  await fetch("/api/sesion/entidad", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orgId: env.id }),
                  });
                  router.refresh();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-[12px] transition",
                  active ? "bg-neon/10 text-neonsoft" : "text-slate-400 hover:bg-white/[0.03]"
                )}
              >
                <Building2 className="h-[13px] w-[13px] text-slate-600" />
                <span className="flex-1 truncate">{env.name}</span>
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                )}
              </button>
            );
          })}
        </div>
        {departments.length > 0 && (
          <>
            <p className="px-2 pb-1.5 pt-5 font-mono text-[9px] font-bold uppercase tracking-[0.22em] text-slate-600">
              // dependencias
            </p>
            <div className="space-y-0.5">
              {departments.map((d) => (
                <div
                  key={d}
                  className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[12px] text-slate-400"
                >
                  <Server className="h-[13px] w-[13px] text-slate-600" />
                  <span className="min-w-0 flex-1 truncate">{d}</span>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" />
                </div>
              ))}
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-line px-4 py-3.5">
        <div className="mb-3 grid grid-cols-3 gap-1.5">
          {[
            { icon: Lock, label: "TLS" },
            { icon: ShieldCheck, label: "SHA-256" },
            { icon: Activity, label: "AUDIT" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-1 rounded-md border border-line bg-panel/60 py-1.5"
            >
              <s.icon className="h-3 w-3 text-emerald-400" />
              <span className="font-mono text-[8px] uppercase tracking-wider text-slate-500">
                {s.label}
              </span>
            </div>
          ))}
        </div>

        <Link
          href="/organizacion"
          className="mb-2.5 flex items-center gap-2 rounded-md border border-line bg-panel/60 px-2.5 py-1.5 transition hover:border-neon/40"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">{org.name}</span>
          <span
            className={cn(
              "shrink-0 rounded px-1.5 font-mono text-[8.5px] font-bold",
              org.entityType === "privada"
                ? "bg-cyan-400/10 text-cyan-300"
                : "bg-amber-400/10 text-amber-300"
            )}
          >
            {org.entityType === "privada" ? "PRIV" : "PUB"}
          </span>
        </Link>

        {/* Perfil con foto en miniatura */}
        <div className="flex items-center gap-2.5 rounded-md border border-line bg-panel/40 p-2">
          <Avatar
            name={user.name}
            color={user.color}
            photoUrl={user.photoUrl}
            size="lg"
            className="rounded-lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-slate-100">{user.name}</p>
            <p className="truncate font-mono text-[9px] uppercase tracking-wide text-slate-500">
              {user.role}
            </p>
            <span
              className={cn(
                "mt-0.5 inline-block rounded px-1.5 font-mono text-[8.5px] font-bold",
                canSecurity
                  ? "bg-emerald-400/12 text-emerald-300"
                  : "bg-slate-500/12 text-slate-400"
              )}
            >
              {roleLabel.toUpperCase()}
            </span>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line2 text-slate-500 transition hover:border-rose-500/50 hover:text-rose-400"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[254px] lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-void/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[272px] shadow-2xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute -right-11 top-4 rounded-md border border-line bg-panel p-2 text-slate-300"
              aria-label="Cerrar menú"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[254px]">
        <header className="sticky top-0 z-30 border-b border-line bg-deep/85 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md border border-line p-1.5 text-slate-400 hover:text-neon lg:hidden"
              aria-label="Abrir menú"
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="hidden rounded border border-neon/30 bg-neon/10 px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.14em] text-neon sm:inline-block">
              {code}
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-[15px] font-bold uppercase tracking-[0.1em] text-slate-100">
                {title}
              </h1>
              <p className="hidden truncate text-[11px] text-slate-500 sm:block">{sub}</p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded border border-line bg-panel/70 px-2.5 py-1.5 font-mono text-[10.5px] text-emerald-400 xl:flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {clock}
              </span>
              <form
                className="hidden items-center gap-2 rounded-md border border-line bg-panel/70 px-3 py-1.5 transition focus-within:border-neon/50 md:flex"
                onSubmit={(e) => {
                  e.preventDefault();
                  router.push(
                    q.trim() ? `/documentos?q=${encodeURIComponent(q.trim())}` : "/documentos"
                  );
                }}
              >
                <Search className="h-3.5 w-3.5 text-slate-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Radicado (INF-2026-0010) o título…"
                  className="w-32 bg-transparent text-[12.5px] text-slate-200 outline-none placeholder:text-slate-600"
                />
              </form>
              <Link
                href="/documentos/nuevo"
                className="inline-flex items-center gap-1.5 rounded-md border border-neon/40 bg-neon/10 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide text-neonsoft transition hover:bg-neon/20"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Crear</span>
              </Link>
              <Avatar
                name={user.name}
                color={user.color}
                photoUrl={user.photoUrl}
                size="md"
                className="rounded-lg"
              />
            </div>
          </div>

          {/* MENÚ SUPERIOR — BANDEJA DE ENTRADA */}
          <Suspense fallback={<div className="h-9" />}>
            <InboxBar counts={counts} />
          </Suspense>
          <div className="neon-line h-px w-full opacity-60" />
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-7">{children}</main>
      </div>
    </div>
  );
}
