"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  X,
  Loader2,
  Save,
  Copy,
  Check,
  KeyRound,
  Search,
  BadgeCheck,
  CircleSlash,
} from "lucide-react";
import { Panel, SectionTitle } from "@/components/bits";
import { ResetPasswordPanel } from "@/components/reset-password-panel";
import { ROLE_LABEL } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { CompanyRow } from "@/components/platform/company-onboarding";

export type GlobalUserRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  systemRole: string;
  active: string;
  mustChangePassword: boolean;
  orgId: string | null;
  orgName: string | null;
  orgSigla: string | null;
  createdAt: string;
};

const fieldClass =
  "w-full rounded-md border border-line2 bg-panel2/60 px-3 py-2.5 text-[12.5px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

const empty = () => ({
  organizationId: "",
  name: "",
  email: "",
  username: "",
  cargo: "",
  systemRole: "usuario",
  password: "",
});

/**
 * Módulo de ASIGNACIÓN/CREACIÓN de usuarios — visión GLOBAL de todas las
 * empresas para el administrador de plataforma: crear una cuenta en
 * cualquier empresa sin tener que "entrar" primero a ella, y restablecer
 * la contraseña de cualquier funcionario. La edición detallada de la
 * ficha (grado, dependencia, cédula…) sigue haciéndose por empresa en
 * Funcionarios, para no pisar los metadatos que estampan la firma.
 */
export function GlobalUsers({ users, companies }: { users: GlobalUserRow[]; companies: CompanyRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetForId, setResetForId] = useState<string | null>(null);
  const [filterOrg, setFilterOrg] = useState<string>("");
  const [q, setQ] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      if (filterOrg && u.orgId !== filterOrg) return false;
      if (!needle) return true;
      return (
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle) ||
        (u.username ?? "").toLowerCase().includes(needle)
      );
    });
  }, [users, filterOrg, q]);

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plataforma/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear el usuario.");
      if (data.password) setResult(data.password as string);
      setForm(empty());
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-neon/30 bg-neon/10">
            <Users className="h-4 w-4 text-neon" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-slate-100">Usuarios de todas las empresas</p>
            <p className="font-mono text-[10px] text-slate-500">
              {users.length} cuenta(s) · asignación, creación y restablecimiento de clave
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setOpen((v) => !v);
            setResult(null);
          }}
          className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void"
        >
          {open ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {open ? "Cerrar" : "Nuevo usuario"}
        </button>
      </Panel>

      {result && (
        <Panel className="border-emerald-400/30 bg-emerald-400/[0.05] p-4">
          <p className="text-[12.5px] font-bold text-emerald-300">Usuario creado</p>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Contraseña temporal generada — compártala fuera de banda:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-line2 bg-panel/80 px-3 py-2 font-mono text-[13px] text-neonsoft">
              {result}
            </code>
            <button onClick={copyResult} className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 text-slate-400 hover:border-neon/40 hover:text-neon">
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </Panel>
      )}

      {open && (
        <Panel className="p-5">
          <SectionTitle hint="ASIGNACIÓN">Nuevo usuario en cualquier empresa</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={form.organizationId} onChange={(e) => set("organizationId", e.target.value)} className={cn(fieldClass, "sm:col-span-2")}>
              <option value="" className="bg-panel">Seleccione la empresa de destino *</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id} className="bg-panel">
                  {c.sigla} — {c.name}
                </option>
              ))}
            </select>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nombre completo *" className={cn(fieldClass, "sm:col-span-2")} />
            <input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Correo *" className={fieldClass} />
            <input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="Usuario de acceso (opcional)" className={fieldClass} />
            <input value={form.cargo} onChange={(e) => set("cargo", e.target.value)} placeholder="Cargo" className={fieldClass} />
            <select value={form.systemRole} onChange={(e) => set("systemRole", e.target.value)} className={fieldClass}>
              <option value="usuario" className="bg-panel">Usuario</option>
              <option value="jefe_gestion" className="bg-panel">Jefe de Gestión Documental</option>
              <option value="admin" className="bg-panel">Administrador</option>
            </select>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Contraseña (vacío = generar automática)" className={cn(fieldClass, "sm:col-span-2")} />
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Los metadatos de firma (grado, dependencia, cédula…) se completan luego desde
            Funcionarios, dentro de esa empresa.
          </p>

          {error && (
            <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Crear usuario
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-line2 px-4 py-2 text-[12px] font-semibold text-slate-400">
              Cancelar
            </button>
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border border-line bg-panel2/50 px-3 py-1.5">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o usuario…" className="w-52 bg-transparent text-[12px] text-slate-200 outline-none placeholder:text-slate-600" />
          </div>
          <select value={filterOrg} onChange={(e) => setFilterOrg(e.target.value)} className="rounded-md border border-line bg-panel2/50 px-3 py-1.5 text-[12px] text-slate-300 outline-none">
            <option value="" className="bg-panel">Todas las empresas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id} className="bg-panel">{c.sigla}</option>
            ))}
          </select>
          <span className="ml-auto font-mono text-[10.5px] text-slate-500">{filtered.length} resultado(s)</span>
        </div>
        <ul className="divide-y divide-line/60">
          {filtered.map((u) => (
            <li key={u.id}>
              <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 md:grid-cols-[110px_1fr_150px_120px_90px_36px] md:gap-4">
                <span className="hidden rounded bg-slate-500/12 px-2 py-0.5 text-center font-mono text-[9px] font-bold text-slate-300 md:inline-block">
                  {u.orgSigla ?? "PLATAFORMA"}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-200">{u.name}</p>
                  <p className="truncate font-mono text-[9.5px] text-slate-500">
                    {u.username ?? u.email}
                    {u.mustChangePassword && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-400/12 px-1 py-0.5 text-[8.5px] font-bold text-amber-300">
                        <KeyRound className="h-2.5 w-2.5" /> TEMPORAL
                      </span>
                    )}
                  </p>
                </div>
                <span
                  className={cn(
                    "hidden rounded px-2 py-0.5 text-center font-mono text-[9px] font-bold md:inline-block",
                    u.systemRole === "superadmin"
                      ? "bg-gold/15 text-gold"
                      : u.systemRole === "admin"
                        ? "bg-plasma/12 text-plasma"
                        : u.systemRole === "jefe_gestion"
                          ? "bg-emerald-400/12 text-emerald-300"
                          : "bg-slate-500/12 text-slate-400"
                  )}
                >
                  {ROLE_LABEL[u.systemRole] ?? u.systemRole}
                </span>
                <span className="hidden md:block">
                  {u.active === "si" ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-emerald-300">
                      <BadgeCheck className="h-3 w-3" /> ACTIVO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-slate-600">
                      <CircleSlash className="h-3 w-3" /> INACTIVO
                    </span>
                  )}
                </span>
                <span className="hidden md:block" />
                <button
                  onClick={() => setResetForId(resetForId === u.id ? null : u.id)}
                  className="grid h-8 w-8 place-items-center rounded-md border border-line2 text-slate-500 transition hover:border-amber-400/50 hover:text-amber-400 disabled:opacity-30"
                  aria-label={`Restablecer contraseña de ${u.name}`}
                  title="Restablecer contraseña"
                  disabled={u.systemRole === "superadmin"}
                >
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
              </div>
              {resetForId === u.id && (
                <div className="px-5 pb-4">
                  <ResetPasswordPanel userId={u.id} userName={u.name} onClose={() => setResetForId(null)} />
                </div>
              )}
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-5 py-10 text-center text-[12.5px] text-slate-500">Sin resultados.</li>
          )}
        </ul>
      </Panel>
    </div>
  );
}
