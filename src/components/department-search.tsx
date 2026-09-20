"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, X } from "lucide-react";
import { fieldClass } from "@/components/identity-fields";
import { cn } from "@/lib/utils";

/**
 * Selector de dependencia con búsqueda por nombre o iniciales (TH, OAJ, ADIP…).
 * Combina lista desplegable y filtro en el mismo cuadro.
 */
export function DepartmentSearch({
  label,
  value,
  onChange,
  placeholder = "Escriba nombre o iniciales (TH, Legal, ADIP)…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ name: string; initials: string }[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch(`/api/dependencias?q=${encodeURIComponent(q)}`);
      if (res.ok) setItems((await res.json()).departments ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const hide = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  return (
    <div ref={box} className="space-y-1.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      {value ? (
        <div className="flex items-center gap-2 rounded-lg border border-neon/35 bg-neon/[0.07] px-3 py-2">
          <Building2 className="h-3.5 w-3.5 text-neon" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-100">{value}</span>
          <button
            type="button"
            onClick={() => {
              onChange("");
              setQ("");
              setOpen(true);
            }}
            className="rounded p-1 text-slate-500 hover:text-rose-400"
            aria-label="Cambiar dependencia"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className={cn(fieldClass, "pl-9 pr-8")}
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          {open && (
            <ul className="absolute z-[60] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-deep shadow-2xl">
              {items.length === 0 && (
                <li className="px-3 py-3 font-mono text-[10px] text-slate-500">Sin coincidencias</li>
              )}
              {items.map((it) => (
                <li key={it.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(it.name);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-neon/10"
                  >
                    <span className="grid h-7 w-9 shrink-0 place-items-center rounded border border-line2 font-mono text-[9.5px] font-bold text-neon">
                      {it.initials.slice(0, 4)}
                    </span>
                    <span className="truncate text-[12.5px] text-slate-100">{it.name}</span>
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
