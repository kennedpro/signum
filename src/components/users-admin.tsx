"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  UserPlus,
  Loader2,
  Save,
  X,
  Pencil,
  ShieldCheck,
  IdCard,
  KeyRound,
  BadgeCheck,
  CircleSlash,
} from "lucide-react";
import { Panel, SectionTitle, Avatar } from "@/components/bits";
import { fieldClass } from "@/components/identity-fields";
import { IDENTITY_SCHEMA, type EntityType } from "@/lib/entity";
import { ROLE_LABEL } from "@/lib/roles";
import { GRADOS, cn, formatDateTime } from "@/lib/utils";

export type OfficerRow = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  systemRole: string;
  department: string;
  color: string;
  photoUrl: string | null;
  grado: string | null;
  cargo: string | null;
  cedula: string | null;
  dependencia: string | null;
  unidad: string | null;
  area: string | null;
  sucursal: string | null;
  active: string;
  lastLoginAt: string | null;
};

const empty = (): Partial<OfficerRow> & { password?: string; signPassword?: string } => ({
  name: "",
  email: "",
  username: "",
  systemRole: "usuario",
  department: "Dirección",
  color: "#22d3ee",
  active: "si",
  password: "",
});

export function UsersAdmin({
  officers,
  entityType,
}: {
  officers: OfficerRow[];
  entityType: EntityType;
}) {
  const router = useRouter();
  const [form, setForm] = useState<
    (Partial<OfficerRow> & { password?: string; signPassword?: string }) | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const schema = IDENTITY_SCHEMA[entityType];
  const set = (k: string, v: string | boolean) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const editing = Boolean(form.id);
      const res = await fetch("/api/usuarios", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(editing ? "Ficha actualizada." : "Funcionario registrado.");
      setForm(null);
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
            <IdCard className="h-4 w-4 text-neon" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-slate-100">
              Registro de funcionarios
            </p>
            <p className="font-mono text-[10px] text-slate-500">
              {officers.length} fichas · los metadatos de firma se toman de aquí
            </p>
          </div>
        </div>
        <button
          onClick={() => setForm(empty())}
          className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void"
        >
          <UserPlus className="h-4 w-4" />
          Nuevo funcionario
        </button>
      </Panel>

      {msg && (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-4 py-2.5 text-[12px] text-emerald-300">
          {msg}
        </p>
      )}

      {/* Formulario */}
      {form && (
        <Panel className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <SectionTitle hint={form.id ? "EDICIÓN" : "ALTA"}>
              {form.id ? `Editar: ${form.name}` : "Nuevo funcionario"}
            </SectionTitle>
            <button
              onClick={() => setForm(null)}
              className="rounded-md border border-line p-1.5 text-slate-500 hover:text-rose-400"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Identificación
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nombre completo *"
              className={cn(fieldClass, "sm:col-span-2")}
            />
            <input
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              placeholder="Correo institucional *"
              className={fieldClass}
            />
            <input
              value={form.username ?? ""}
              onChange={(e) => set("username", e.target.value)}
              placeholder="Usuario de acceso (ej. carlos.gomez@entidad)"
              className={fieldClass}
            />
          </div>

          <p className="mb-2 mt-4 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Metadatos de firma ({entityType === "publica" ? "pública" : "privada"})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {schema.map((f) => {
              const wide = ["dependencia", "unidad", "cargo", "area", "empresa"].includes(
                f.key
              );
              if (f.key === "grado") {
                return (
                  <select
                    key={f.key}
                    value={(form.grado as string) ?? ""}
                    onChange={(e) => set("grado", e.target.value)}
                    className={fieldClass}
                  >
                    {GRADOS.map((g) => (
                      <option key={g || "n"} value={g} className="bg-panel">
                        {g || "Grado (jerarquía)"}
                      </option>
                    ))}
                  </select>
                );
              }
              if (["empresa", "nit"].includes(f.key)) return null;
              return (
                <input
                  key={f.key}
                  value={(form[f.key as keyof OfficerRow] as string) ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={`${f.label} — ${f.placeholder}`}
                  maxLength={f.max}
                  className={cn(fieldClass, wide && "sm:col-span-2")}
                />
              );
            })}
            <input
              value={form.department ?? ""}
              onChange={(e) => set("department", e.target.value)}
              placeholder="Departamento / entorno"
              className={fieldClass}
            />
            <input
              value={form.photoUrl ?? ""}
              onChange={(e) => set("photoUrl", e.target.value)}
              placeholder="URL https de la foto"
              className={fieldClass}
            />
          </div>

          <p className="mb-2 mt-4 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Acceso y permisos
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={form.systemRole ?? "usuario"}
              onChange={(e) => set("systemRole", e.target.value)}
              className={fieldClass}
            >
              <option value="usuario" className="bg-panel">Usuario</option>
              <option value="jefe_gestion" className="bg-panel">
                Jefe de Gestión Documental
              </option>
              <option value="admin" className="bg-panel">Administrador</option>
            </select>
            <input
              type="password"
              value={form.password ?? ""}
              onChange={(e) => set("password", e.target.value)}
              placeholder={form.id ? "Nueva contraseña de acceso" : "Contraseña de acceso *"}
              className={fieldClass}
            />
            <input
              type="password"
              value={form.signPassword ?? ""}
              onChange={(e) => set("signPassword", e.target.value)}
              placeholder="Clave personal de firma digital"
              className={cn(fieldClass, "sm:col-span-2")}
            />
            <select
              value={form.active ?? "si"}
              onChange={(e) => set("active", e.target.value)}
              className={fieldClass}
            >
              <option value="si" className="bg-panel">Activo</option>
              <option value="no" className="bg-panel">Inactivo</option>
            </select>
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
            <button
              onClick={() => setForm(null)}
              className="rounded-md border border-line2 px-4 py-2 text-[12px] font-semibold text-slate-400"
            >
              Cancelar
            </button>
          </div>
        </Panel>
      )}

      {/* Listado */}
      <Panel>
        <div className="hidden grid-cols-[1fr_150px_130px_100px_36px] gap-4 border-b border-line px-5 py-2.5 font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-600 md:grid">
          <span>Funcionario</span>
          <span>Acceso</span>
          <span>Rol</span>
          <span>Estado</span>
          <span />
        </div>
        <ul className="divide-y divide-line/60">
          {officers.map((o) => (
            <li
              key={o.id}
              className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 md:grid-cols-[1fr_150px_130px_100px_36px] md:gap-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  name={o.name}
                  color={o.color}
                  photoUrl={o.photoUrl}
                  size="md"
                  className="rounded-lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-200">{o.name}</p>
                  <p className="truncate font-mono text-[9.5px] text-slate-500">
                    {[o.grado, o.cargo ?? o.role, o.cedula && `CC ${o.cedula}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <p className="hidden truncate font-mono text-[10px] text-slate-400 md:block">
                {o.username ?? o.email}
              </p>
              <span
                className={cn(
                  "hidden rounded px-2 py-0.5 text-center font-mono text-[9px] font-bold md:inline-block",
                  o.systemRole === "admin"
                    ? "bg-plasma/12 text-plasma"
                    : o.systemRole === "jefe_gestion"
                      ? "bg-emerald-400/12 text-emerald-300"
                      : "bg-slate-500/12 text-slate-400"
                )}
              >
                {ROLE_LABEL[o.systemRole] ?? o.systemRole}
              </span>
              <span className="hidden md:block">
                {o.active === "si" ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-emerald-300">
                    <BadgeCheck className="h-3 w-3" /> ACTIVO
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-[9.5px] text-slate-600">
                    <CircleSlash className="h-3 w-3" /> INACTIVO
                  </span>
                )}
              </span>
              <button
                onClick={() => {
                  setForm({ ...o, password: "" });
                  setMsg(null);
                  setError(null);
                }}
                className="grid h-8 w-8 place-items-center rounded-md border border-line2 text-slate-500 transition hover:border-neon/40 hover:text-neon"
                aria-label={`Editar ${o.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel className="p-4">
        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-400">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <span>
            Los campos <strong className="text-slate-200">Grado, Cédula, Cargo,
            Dependencia y Unidad</strong> registrados aquí son los que se estampan
            en la firma digital. El firmante <strong className="text-slate-200">no
            puede modificarlos</strong> al firmar: se toman de esta ficha oficial.
          </span>
        </p>
        <p className="mt-2 flex items-start gap-2 text-[11.5px] leading-relaxed text-slate-400">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            La contraseña de acceso es distinta de la clave de firma. Esta última se
            gestiona en <strong className="text-slate-200">Organización</strong>.
          </span>
        </p>
      </Panel>
    </div>
  );
}
