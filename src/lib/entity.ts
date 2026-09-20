/**
 * METADATOS DINÁMICOS POR TIPO DE ENTIDAD
 * ───────────────────────────────────────────────────────────────
 * Una institución pública (Policía, Ejército) exige campos jerárquicos
 * (Grado, Dependencia, Unidad). Una empresa privada requiere datos
 * corporativos (Cargo, Área, Empresa, NIT, Sucursal).
 * El mismo motor construye el bloque sin alterar el texto inferior.
 */

export type EntityType = "publica" | "privada";

export type IdentityFieldKey =
  | "grado"
  | "cargo"
  | "cedula"
  | "dependencia"
  | "unidad"
  | "empresa"
  | "nit"
  | "area"
  | "sucursal";

export type IdentityField = {
  key: IdentityFieldKey;
  label: string;
  placeholder: string;
  required: boolean;
  /** Máximo de caracteres para no desbordar el contenedor fantasma. */
  max: number;
};

/** Campos capturados según el perfil de la organización. */
export const IDENTITY_SCHEMA: Record<EntityType, IdentityField[]> = {
  publica: [
    { key: "grado", label: "Grado", placeholder: "Mayor, Coronel, Patrullero…", required: true, max: 40 },
    { key: "cargo", label: "Cargo", placeholder: "Jefe Esquema De Seguridad", required: true, max: 70 },
    { key: "cedula", label: "Cédula", placeholder: "1098613224", required: true, max: 20 },
    { key: "dependencia", label: "Dependencia", placeholder: "Grupo Protección A Personas", required: true, max: 95 },
    { key: "unidad", label: "Unidad", placeholder: "Dirección De Protección Y Servicios", required: false, max: 95 },
  ],
  privada: [
    { key: "cargo", label: "Cargo", placeholder: "Gerente de Ventas, Director de TI", required: true, max: 70 },
    { key: "area", label: "Área", placeholder: "Dirección Comercial", required: true, max: 70 },
    { key: "cedula", label: "Cédula", placeholder: "1098613224", required: true, max: 20 },
    { key: "empresa", label: "Empresa", placeholder: "Razón social", required: true, max: 80 },
    { key: "nit", label: "NIT", placeholder: "901.234.567-8", required: true, max: 30 },
    { key: "sucursal", label: "Sucursal", placeholder: "Sede Bogotá D.C.", required: false, max: 70 },
  ],
};

export type IdentityValues = Partial<Record<IdentityFieldKey, string | null>>;

/**
 * Construye las líneas del bloque de texto que se estampa junto al logo.
 * Público → usa "Grado". Privado → lo omite y agrega "Empresa / NIT".
 * Se limita a 7 líneas para respetar el alto del contenedor fantasma.
 */
export function buildStampLines(
  entityType: EntityType,
  v: IdentityValues & { name?: string | null; email?: string | null }
): { label: string; value: string }[] {
  const push = (
    out: { label: string; value: string }[],
    label: string,
    value?: string | null
  ) => {
    if (value && String(value).trim()) out.push({ label, value: String(value).trim() });
  };

  const lines: { label: string; value: string }[] = [];
  push(lines, "Nombre", v.name);

  if (entityType === "publica") {
    push(lines, "Grado", v.grado);
    push(lines, "Cargo", v.cargo);
    push(lines, "Cédula", v.cedula);
    push(lines, "Dependencia", v.dependencia);
    push(lines, "Unidad", v.unidad);
  } else {
    push(lines, "Cargo", v.cargo);
    push(lines, "Área", v.area);
    push(lines, "Cédula", v.cedula);
    push(lines, "Empresa", v.empresa);
    push(lines, "NIT", v.nit);
    push(lines, "Sucursal", v.sucursal);
  }

  push(lines, "Correo", v.email);
  return lines.slice(0, 8);
}

export const ENTITY_META: Record<
  EntityType,
  { label: string; short: string; badge: string; hint: string }
> = {
  publica: {
    label: "Entidad pública",
    short: "PÚBLICA",
    badge: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
    hint: "Campos jerárquicos: Grado, Dependencia y Unidad. Escarapela institucional.",
  },
  privada: {
    label: "Empresa privada",
    short: "PRIVADA",
    badge: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/30",
    hint: "Campos corporativos: Cargo, Área, Empresa y NIT. Logotipo corporativo.",
  },
};

/** Dimensiones del contenedor fantasma (capa de maquetación rígida). */
export const GHOST_BOX = {
  widthMm: 120,
  heightMm: 44,
  /** 1mm ≈ 3.7795px @96dpi */
  widthPx: 454,
  heightPx: 166,
  maxLines: 8,
} as const;
