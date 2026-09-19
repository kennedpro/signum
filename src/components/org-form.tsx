"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Save,
  ShieldCheck,
  Landmark,
  Briefcase,
  KeyRound,
  Columns2,
  Eye,
  ArrowRight,
  Minus,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Panel, SectionTitle } from "@/components/bits";
import { StampLogo, SignatureStamp } from "@/components/signature-stamp";
import { fieldClass } from "@/components/identity-fields";
import { ENTITY_META, IDENTITY_SCHEMA, type EntityType } from "@/lib/entity";
import { cn } from "@/lib/utils";

/** Persona de muestra usada en todas las previsualizaciones. */
const DEMO = {
  name: "Carlos Ernesto Gomez Rodriguez",
  email: "carlos.gomez3224@correo.entidad.gov.co",
  grado: "Mayor",
  cedula: "1098613224",
  cargoPub: "Jefe Esquema De Seguridad",
  cargoPriv: "Director de Tecnología",
  dependencia: "Grupo Proteccion A Personas E Instalaciones Gubernamentales",
  unidad: "Direccion De Proteccion Y Servicios Especiales",
  area: "Dirección de Tecnología",
};

function stampFor(
  entityType: EntityType,
  org: { name: string; nit: string; city: string; logoUrl: string }
) {
  return {
    entityType,
    signerName: DEMO.name,
    signerEmail: DEMO.email,
    signerGrado: DEMO.grado,
    signerCargo: entityType === "publica" ? DEMO.cargoPub : DEMO.cargoPriv,
    signerCedula: DEMO.cedula,
    signerDependencia: DEMO.dependencia,
    signerUnidad: DEMO.unidad,
    signerEmpresa: org.name || "Razón social",
    signerNit: org.nit || "901.234.567-8",
    signerArea: DEMO.area,
    signerSucursal: org.city || "Bogotá D.C.",
    logoVariant: entityType === "privada" ? "corporativo" : "institucional",
    logoUrl: entityType === "privada" ? org.logoUrl || null : null,
    hashPost: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
    createdAt: new Date(),
  };
}

/** Tarjeta de previsualización de un perfil. */
function ProfileCard({
  entityType,
  org,
  active,
}: {
  entityType: EntityType;
  org: { name: string; nit: string; city: string; logoUrl: string };
  active: boolean;
}) {
  const meta = ENTITY_META[entityType];
  const otherKeys = IDENTITY_SCHEMA[entityType === "publica" ? "privada" : "publica"].map(
    (f) => f.key
  );
  const keys = IDENTITY_SCHEMA[entityType].map((f) => f.key);

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition",
        active ? "border-neon/45 bg-neon/[0.05]" : "border-line bg-panel2/30"
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        {entityType === "publica" ? (
          <Landmark className="h-4 w-4 text-amber-300" />
        ) : (
          <Briefcase className="h-4 w-4 text-cyan-300" />
        )}
        <p className="text-[13px] font-bold text-slate-100">{meta.label}</p>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[9px] font-bold ring-1 ring-inset",
            meta.badge
          )}
        >
          {meta.short}
        </span>
        {active && (
          <span className="ml-auto rounded bg-neon/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-neonsoft ring-1 ring-neon/35">
            ACTIVO
          </span>
        )}
      </div>

      {/* Estampa real renderizada en el contenedor fantasma */}
      <div className="overflow-x-auto rounded-md bg-[#fdfcf9] p-3">
        <SignatureStamp data={stampFor(entityType, org)} label="FIRMA AUTORIZADA" />
      </div>

      {/* Diferencias de campos */}
      <ul className="mt-3 space-y-1">
        {IDENTITY_SCHEMA[entityType].map((f) => {
          const exclusive = !otherKeys.includes(f.key);
          return (
            <li
              key={f.key}
              className="flex items-center gap-2 rounded border border-line bg-panel/50 px-2.5 py-1"
            >
              {exclusive ? (
                <Plus className="h-3 w-3 shrink-0 text-emerald-400" />
              ) : (
                <span className="h-3 w-3 shrink-0 text-center font-mono text-[9px] text-slate-600">
                  ·
                </span>
              )}
              <span className="flex-1 text-[11.5px] text-slate-300">{f.label}</span>
              <span
                className={cn(
                  "font-mono text-[8.5px] font-bold",
                  f.required ? "text-amber-300" : "text-slate-600"
                )}
              >
                {f.required ? "OBLIG." : "OPC."}
              </span>
            </li>
          );
        })}
        {IDENTITY_SCHEMA[entityType === "publica" ? "privada" : "publica"]
          .filter((f) => !keys.includes(f.key))
          .map((f) => (
            <li
              key={`x-${f.key}`}
              className="flex items-center gap-2 rounded border border-line/50 px-2.5 py-1 opacity-45"
            >
              <Minus className="h-3 w-3 shrink-0 text-rose-400" />
              <span className="flex-1 text-[11.5px] text-slate-500 line-through">
                {f.label}
              </span>
              <span className="font-mono text-[8.5px] text-slate-600">OMITIDO</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function OrgForm({
  initial,
}: {
  initial: {
    name: string;
    entityType: EntityType;
    nit: string;
    sigla: string;
    city: string;
    logoUrl: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"activo" | "comparar">("comparar");

  const meta = ENTITY_META[form.entityType];
  const variant = form.entityType === "privada" ? "corporativo" : "institucional";

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/organizacion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg("Perfil guardado. Los nuevos documentos usarán estos metadatos.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function savePwd() {
    setPwdMsg(null);
    const res = await fetch("/api/organizacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signPassword: pwd }),
    });
    const data = await res.json();
    setPwdMsg(res.ok ? "Contraseña de firma actualizada (scrypt)." : data.error);
    if (res.ok) setPwd("");
  }

  return (
    <div className="space-y-5">
      {/* ── Selector de perfil + datos ─────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Panel className="p-5">
          <SectionTitle hint="METADATOS DINÁMICOS">Perfil de la organización</SectionTitle>

          <div className="grid gap-2 sm:grid-cols-2">
            {(["publica", "privada"] as EntityType[]).map((t) => {
              const active = form.entityType === t;
              const Icon = t === "publica" ? Landmark : Briefcase;
              return (
                <button
                  key={t}
                  onClick={() => setForm((f) => ({ ...f, entityType: t }))}
                  className={cn(
                    "flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition",
                    active
                      ? "border-neon/50 bg-neon/[0.07] shadow-[0_0_20px_-10px_rgba(34,211,238,0.8)]"
                      : "border-line bg-panel2/40 hover:border-line2"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-md border",
                      active
                        ? "border-neon/40 bg-neon/10 text-neon"
                        : "border-line2 text-slate-500"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="text-[13px] font-bold text-slate-100">
                    {ENTITY_META[t].label}
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">
                    {ENTITY_META[t].hint}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Razón social / Entidad"
              className={cn(fieldClass, "sm:col-span-2")}
            />
            <input
              value={form.nit}
              onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))}
              placeholder="NIT (901.234.567-8)"
              className={fieldClass}
            />
            <input
              value={form.sigla}
              onChange={(e) => setForm((f) => ({ ...f, sigla: e.target.value }))}
              placeholder="Sigla"
              className={fieldClass}
            />
            <input
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              placeholder="Ciudad / Sede"
              className={fieldClass}
            />
            <input
              value={form.logoUrl}
              onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
              placeholder="URL https del logo corporativo (opcional)"
              className={fieldClass}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar perfil
            </button>
            {msg && <p className="text-[11.5px] text-emerald-300">{msg}</p>}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle hint="SEGUNDO FACTOR">Contraseña de firma</SectionTitle>
            <p className="mb-3 text-[11.5px] leading-relaxed text-slate-400">
              Clave personal exigida en cada firma. Derivada con{" "}
              <span className="font-mono text-slate-300">scrypt</span> + sal aleatoria.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="Nueva clave (mín. 6)"
                className={fieldClass}
              />
              <button
                onClick={savePwd}
                className="inline-flex shrink-0 items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12px] font-bold text-amber-300"
              >
                <KeyRound className="h-4 w-4" />
                Rotar
              </button>
            </div>
            {pwdMsg && <p className="mt-2 text-[11.5px] text-slate-300">{pwdMsg}</p>}
            <p className="mt-2 font-mono text-[9px] text-slate-600">
              CLAVE DEMO ACTUAL: FIRMA2026
            </p>
          </Panel>

          <Panel className="p-5">
            <SectionTitle>Insignia activa</SectionTitle>
            <div className="flex items-center gap-3">
              <div className="w-[56px] shrink-0">
                <StampLogo variant={variant} logoUrl={form.logoUrl || null} />
              </div>
              <p className="text-[11.5px] leading-relaxed text-slate-400">
                {variant === "institucional"
                  ? "Escarapela institucional dorada con banda FIRMA DIGITAL."
                  : "Logotipo corporativo. Cargue el suyo con una URL https."}
              </p>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-snug text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              {meta.hint}
            </p>
          </Panel>
        </div>
      </div>

      {/* ── Visualizador de los dos perfiles ───────────────────── */}
      <Panel className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="CONTENEDOR FIJO 120×44 MM">
            Visualizador de perfiles de firma
          </SectionTitle>
          <div className="flex items-center gap-1 rounded-md border border-line bg-panel/60 p-1">
            {(
              [
                { k: "comparar", label: "Comparar ambos", icon: Columns2 },
                { k: "activo", label: "Solo el activo", icon: Eye },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setMode(t.k)}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-[11.5px] font-semibold transition",
                  mode === t.k
                    ? "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {mode === "comparar" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <ProfileCard
              entityType="publica"
              org={form}
              active={form.entityType === "publica"}
            />
            <ProfileCard
              entityType="privada"
              org={form}
              active={form.entityType === "privada"}
            />
          </div>
        ) : (
          <div className="max-w-2xl">
            <ProfileCard entityType={form.entityType} org={form} active />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel2/40 px-4 py-3">
          <p className="flex-1 text-[11.5px] leading-relaxed text-slate-400">
            Ambos bloques ocupan{" "}
            <span className="font-mono text-slate-200">exactamente 120 × 44 mm</span>. Al
            cambiar de perfil solo cambian el logo y las líneas de texto: el contenido
            inferior del documento nunca se desplaza.
          </p>
          <Link
            href="/documentos/nuevo"
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-neon/40 bg-neon/10 px-4 py-2 text-[12px] font-bold text-neonsoft transition hover:bg-neon/20"
          >
            Probar en un documento
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Panel>
    </div>
  );
}
