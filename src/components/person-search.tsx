"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Building2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/bits";
import { fieldClass } from "@/components/identity-fields";
import { cn } from "@/lib/utils";
import type { PersonHit } from "@/lib/people-search";

export type PickedPerson = {
  userId: string | null;
  name: string;
  email: string;
  cargo: string;
  department: string;
  photoUrl: string | null;
  color: string;
  external: boolean;
  companyName: string;
};

export function PersonSearch({
  label,
  value,
  onChange,
  allowExternal = false,
  placeholder = "Buscar por nombre, apellidos o iniciales…",
}: {
  label: string;
  value: PickedPerson | null;
  onChange: (p: PickedPerson | null) => void;
  allowExternal?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [open, setOpen] = useState(false);
  const [external, setExternal] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/funcionarios?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const data = await res.json();
      setHits(data.people ?? []);
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function hide(e: MouseEvent) {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  function pick(h: PersonHit) {
    onChange({
      userId: h.id,
      name: h.name,
      email: h.email,
      cargo: h.cargo ?? "",
      department: h.department,
      photoUrl: h.photoUrl,
      color: h.color,
      external: false,
      companyName: "",
    });
    setQ("");
    setOpen(false);
    setExternal(false);
  }

  return (
    <div ref={box} className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        {allowExternal && (
          <button
            type="button"
            onClick={() => {
              setExternal((v) => !v);
              onChange(null);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[9px] font-bold",
              external
                ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
                : "text-slate-500 hover:text-neon"
            )}
          >
            <UserPlus className="h-3 w-3" />
            {external ? "EXTERNO" : "¿OTRA EMPRESA?"}
          </button>
        )}
      </div>

      {value && !external ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-neon/35 bg-neon/[0.07] p-2.5">
          <Avatar
            name={value.name}
            color={value.color}
            photoUrl={value.photoUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold text-slate-100">{value.name}</p>
            <p className="truncate font-mono text-[9.5px] text-slate-400">
              {value.cargo || "—"}
            </p>
            <p className="truncate font-mono text-[9.5px] text-slate-500">
              <Building2 className="mr-1 inline h-3 w-3 text-neon/70" />
              {value.department || "Sin dependencia"} · {value.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-slate-500 hover:text-rose-400"
            aria-label="Quitar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : external ? (
        <div className="grid gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3">
          <p className="flex items-center gap-1.5 font-mono text-[9.5px] text-amber-300">
            <Building2 className="h-3 w-3" />
            Destinatario externo — no figura en el registro
          </p>
          <input
            value={value?.name ?? ""}
            onChange={(e) =>
              onChange({
                userId: null,
                name: e.target.value,
                email: value?.email ?? "",
                cargo: value?.cargo ?? "",
                department: value?.department ?? "Externo",
                photoUrl: null,
                color: "#f59e0b",
                external: true,
                companyName: value?.companyName ?? "",
              })
            }
            placeholder="Nombre y apellidos *"
            className={fieldClass}
          />
          <input
            value={value?.email ?? ""}
            onChange={(e) =>
              onChange({
                ...(value ?? {
                  userId: null,
                  cargo: "",
                  department: "Externo",
                  photoUrl: null,
                  color: "#f59e0b",
                  external: true,
                  companyName: "",
                  name: "",
                  email: "",
                }),
                email: e.target.value,
                external: true,
              })
            }
            placeholder="Correo *"
            className={fieldClass}
          />
          <input
            value={value?.companyName ?? ""}
            onChange={(e) =>
              onChange({
                ...(value ?? {
                  userId: null,
                  name: "",
                  email: "",
                  cargo: "",
                  department: "Externo",
                  photoUrl: null,
                  color: "#f59e0b",
                  external: true,
                  companyName: "",
                }),
                companyName: e.target.value,
                external: true,
              })
            }
            placeholder="Empresa / entidad de origen *"
            className={fieldClass}
          />
          <input
            value={value?.cargo ?? ""}
            onChange={(e) =>
              onChange({
                ...(value as PickedPerson),
                cargo: e.target.value,
                external: true,
              })
            }
            placeholder="Cargo (opcional)"
            className={fieldClass}
          />
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn(fieldClass, "pl-9")}
          />
          {open && (
            /* Lista en flujo (no flotante): empuja el contenido y nunca queda
               recortada por paneles con overflow:hidden ni tapa los botones. */
            <ul className="mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-deep/95 shadow-xl">
              {hits.length === 0 && (
                <li className="px-3 py-3 font-mono text-[10px] text-slate-500">
                  Sin coincidencias en esta entidad
                </li>
              )}
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => pick(h)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-neon/10"
                  >
                    <Avatar name={h.name} color={h.color} photoUrl={h.photoUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-slate-100">
                        {h.name}
                      </p>
                      <p className="truncate font-mono text-[9.5px] text-slate-500">
                        {h.initials} · {h.cargo ?? h.department}
                        {h.department ? ` · ${h.department}` : ""}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
