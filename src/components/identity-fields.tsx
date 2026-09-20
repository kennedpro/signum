"use client";

import { IDENTITY_SCHEMA, type EntityType, type IdentityFieldKey } from "@/lib/entity";
import { GRADOS, cn } from "@/lib/utils";

export type IdentityState = Partial<Record<IdentityFieldKey, string>>;

export const fieldClass =
  "w-full rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

/** Formulario que cambia automáticamente según el perfil de la organización. */
export function IdentityFields({
  entityType,
  values,
  onChange,
  columns = 2,
}: {
  entityType: EntityType;
  values: IdentityState;
  onChange: (key: IdentityFieldKey, value: string) => void;
  columns?: 1 | 2;
}) {
  const schema = IDENTITY_SCHEMA[entityType];

  return (
    <div className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
      {schema.map((f) => {
        const wide =
          columns === 2 &&
          ["dependencia", "unidad", "empresa", "cargo", "area", "sucursal"].includes(f.key);
        if (f.key === "grado") {
          return (
            <select
              key={f.key}
              value={values.grado ?? ""}
              onChange={(e) => onChange("grado", e.target.value)}
              className={fieldClass}
              aria-label="Grado"
            >
              {GRADOS.map((g) => (
                <option key={g || "none"} value={g} className="bg-panel">
                  {g || "Grado (jerarquía)"}
                </option>
              ))}
            </select>
          );
        }
        return (
          <input
            key={f.key}
            value={values[f.key] ?? ""}
            onChange={(e) => onChange(f.key, e.target.value)}
            placeholder={`${f.label}${f.required ? " *" : ""} — ${f.placeholder}`}
            maxLength={f.max}
            aria-label={f.label}
            className={cn(fieldClass, wide && "sm:col-span-2")}
          />
        );
      })}
    </div>
  );
}

/** Validación de campos obligatorios según el perfil activo. */
export function missingIdentity(entityType: EntityType, values: IdentityState) {
  return IDENTITY_SCHEMA[entityType]
    .filter((f) => f.required && !String(values[f.key] ?? "").trim())
    .map((f) => f.label);
}
