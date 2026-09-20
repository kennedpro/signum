"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  X,
  Loader2,
  Save,
  Copy,
  Check,
  LogIn,
  Landmark,
  Briefcase,
  Users,
  FileText,
} from "lucide-react";
import { Panel, SectionTitle } from "@/components/bits";
import { cn, formatDateTime } from "@/lib/utils";

export type CompanyRow = {
  id: string;
  name: string;
  sigla: string;
  entityType: "publica" | "privada";
  nit: string;
  city: string;
  users: number;
  documents: number;
  createdAt: string;
};

const fieldClass =
  "w-full rounded-md border border-line2 bg-panel2/60 px-3 py-2.5 text-[12.5px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

const empty = () => ({
  name: "",
  entityType: "publica" as "publica" | "privada",
  nit: "",
  sigla: "",
  city: "Bogotá D.C.",
  address: "",
  phone: "",
  website: "",
  primaryColor: "#0ea5e9",
  adminName: "",
  adminEmail: "",
  adminUsername: "",
  adminCargo: "",
  adminPassword: "",
});

/**
 * Módulo de ONBOARDING — el super administrador crea aquí el "ambiente"
 * individual de cada empresa nueva (pública o privada), con su primer
 * administrador ya listo para operar, sin tocar las demás empresas.
 */
export function CompanyOnboarding({ companies }: { companies: CompanyRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sigla: string; name: string; username: string; email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/plataforma/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          entityType: form.entityType,
          nit: form.nit,
          sigla: form.sigla,
          city: form.city,
          address: form.address,
          phone: form.phone,
          website: form.website,
          primaryColor: form.primaryColor,
          admin: {
            name: form.adminName,
            email: form.adminEmail,
            username: form.adminUsername,
            cargo: form.adminCargo,
            password: form.adminPassword,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la empresa.");
      setResult({
        sigla: data.org.sigla,
        name: data.org.name,
        username: data.admin.username ?? data.admin.email,
        email: data.admin.email,
        password: data.admin.password,
      });
      setForm(empty());
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  async function enterAs(orgId: string) {
    setSwitching(orgId);
    try {
      await fetch("/api/sesion/entidad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      router.push("/");
      router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  async function copyPassword() {
    if (!result) return;
    await navigator.clipboard.writeText(result.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-4">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg border border-neon/30 bg-neon/10">
            <Building2 className="h-4 w-4 text-neon" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-slate-100">Empresas de la plataforma</p>
            <p className="font-mono text-[10px] text-slate-500">
              {companies.length} entorno(s) independiente(s) · cada uno con sus propios
              funcionarios y documentos
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
          {open ? "Cerrar" : "Nueva empresa"}
        </button>
      </Panel>

      {result && (
        <Panel className="border-emerald-400/30 bg-emerald-400/[0.05] p-4">
          <p className="text-[12.5px] font-bold text-emerald-300">
            Empresa creada: {result.name} ({result.sigla})
          </p>
          <p className="mt-1 text-[11.5px] text-slate-400">
            Administrador inicial <strong className="text-slate-200">{result.username}</strong>{" "}
            ({result.email}) — comparta esta contraseña temporal fuera de banda; no volverá a
            mostrarse:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded border border-line2 bg-panel/80 px-3 py-2 font-mono text-[13px] text-neonsoft">
              {result.password}
            </code>
            <button
              onClick={copyPassword}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 text-slate-400 hover:border-neon/40 hover:text-neon"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </Panel>
      )}

      {open && (
        <Panel className="p-5">
          <SectionTitle hint="NUEVA EMPRESA">Datos del ambiente institucional</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Razón social / nombre *" className={cn(fieldClass, "sm:col-span-2")} />
            <select value={form.entityType} onChange={(e) => set("entityType", e.target.value as "publica" | "privada")} className={fieldClass}>
              <option value="publica" className="bg-panel">Entidad pública</option>
              <option value="privada" className="bg-panel">Empresa privada</option>
            </select>
            <input value={form.sigla} onChange={(e) => set("sigla", e.target.value.toUpperCase())} placeholder="Sigla única * (ej. ADIP)" className={fieldClass} />
            <input value={form.nit} onChange={(e) => set("nit", e.target.value)} placeholder="NIT" className={fieldClass} />
            <input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="Ciudad" className={fieldClass} />
            <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Dirección" className={fieldClass} />
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="Teléfono" className={fieldClass} />
            <input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="Sitio web" className={fieldClass} />
            <label className="flex items-center gap-2 text-[11.5px] text-slate-400">
              Color institucional
              <input type="color" value={form.primaryColor} onChange={(e) => set("primaryColor", e.target.value)} className="h-8 w-14 rounded border border-line2 bg-transparent" />
            </label>
          </div>

          <p className="mb-2 mt-5 flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <Briefcase className="h-3.5 w-3.5" /> Administrador inicial de la empresa
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input value={form.adminName} onChange={(e) => set("adminName", e.target.value)} placeholder="Nombre completo *" className={cn(fieldClass, "sm:col-span-2")} />
            <input value={form.adminEmail} onChange={(e) => set("adminEmail", e.target.value)} placeholder="Correo *" className={fieldClass} />
            <input value={form.adminUsername} onChange={(e) => set("adminUsername", e.target.value)} placeholder="Usuario de acceso (opcional)" className={fieldClass} />
            <input value={form.adminCargo} onChange={(e) => set("adminCargo", e.target.value)} placeholder="Cargo (ej. Gerente General)" className={fieldClass} />
            <input type="password" value={form.adminPassword} onChange={(e) => set("adminPassword", e.target.value)} placeholder="Contraseña (vacío = generar automática)" className={fieldClass} />
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button onClick={submit} disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Crear empresa
            </button>
            <button onClick={() => setOpen(false)} className="rounded-md border border-line2 px-4 py-2 text-[12px] font-semibold text-slate-400">
              Cancelar
            </button>
          </div>
        </Panel>
      )}

      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[1fr_110px_90px_90px_130px_90px] gap-4 border-b border-line px-5 py-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-600 md:grid">
          <span>Empresa</span>
          <span>Tipo</span>
          <span>Usuarios</span>
          <span>Documentos</span>
          <span>Creada</span>
          <span />
        </div>
        <ul className="divide-y divide-line/60">
          {companies.map((c) => (
            <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 md:grid-cols-[1fr_110px_90px_90px_130px_90px] md:gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 bg-panel2/60">
                  <Landmark className="h-4 w-4 text-slate-500" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-200">{c.name}</p>
                  <p className="truncate font-mono text-[9.5px] text-slate-500">{c.sigla} · {c.city}</p>
                </div>
              </div>
              <span
                className={cn(
                  "hidden rounded px-2 py-0.5 text-center font-mono text-[9px] font-bold md:inline-block",
                  c.entityType === "privada" ? "bg-cyan-400/10 text-cyan-300" : "bg-amber-400/10 text-amber-300"
                )}
              >
                {c.entityType === "privada" ? "PRIVADA" : "PÚBLICA"}
              </span>
              <span className="hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 md:flex">
                <Users className="h-3 w-3 text-slate-600" /> {c.users}
              </span>
              <span className="hidden items-center gap-1.5 font-mono text-[11px] text-slate-400 md:flex">
                <FileText className="h-3 w-3 text-slate-600" /> {c.documents}
              </span>
              <span className="hidden font-mono text-[10px] text-slate-500 md:block">
                {formatDateTime(c.createdAt)}
              </span>
              <button
                onClick={() => enterAs(c.id)}
                disabled={switching === c.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 text-[10.5px] font-semibold text-slate-400 transition hover:border-neon/40 hover:text-neon disabled:opacity-50"
              >
                {switching === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                Entrar
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
