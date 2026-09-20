import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Formato oficial de estampa: 21/05/2025 8:00:00 a. m. */
export function formatStampDate(d: Date | string | null | undefined) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  let h = date.getHours();
  const ampm = h < 12 ? "a. m." : "p. m.";
  h = h % 12 || 12;
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${h}:${min}:${sec} ${ampm}`;
}

export function timeAgo(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora mismo";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} d`;
  return formatDate(date);
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function shortHash(hash?: string | null) {
  if (!hash) return "—";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

// ─── Metadatos de estado (tema consola oscura) ───────────────────────────────
export const DOC_STATUS: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  borrador: {
    label: "Borrador",
    dot: "bg-slate-400",
    badge: "bg-slate-400/10 text-slate-300 ring-slate-400/25",
  },
  en_aprobacion: {
    label: "En aprobación",
    dot: "bg-sky-400",
    badge: "bg-sky-400/10 text-sky-300 ring-sky-400/30",
  },
  en_firma: {
    label: "En firma",
    dot: "bg-amber-400",
    badge: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  },
  completado: {
    label: "Firmado y gestionado",
    dot: "bg-emerald-400",
    badge: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
  },
};

export const RECIPIENT_STATUS: Record<string, { label: string; badge: string }> = {
  pendiente: {
    label: "Pendiente",
    badge: "bg-slate-400/10 text-slate-400 ring-slate-400/25",
  },
  visto: { label: "Visto", badge: "bg-sky-400/10 text-sky-300 ring-sky-400/30" },
  firmado: {
    label: "Firmado",
    badge: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
  },
  informado: {
    label: "Informado",
    badge: "bg-violet-400/10 text-violet-300 ring-violet-400/30",
  },
  aprobado: {
    label: "Aprobado",
    badge: "bg-cyan-400/10 text-cyan-300 ring-cyan-400/30",
  },
};

export const DEPARTMENTS = [
  "Dirección",
  "Finanzas",
  "Legal",
  "Talento Humano",
  "Operaciones",
  "Tecnología",
  "Comercial",
  "Seguridad",
  "Externo",
];

export const GRADOS = [
  "",
  "Mayor",
  "Capitán",
  "Teniente",
  "Subteniente",
  "Sargento",
  "Coronel",
  "General",
  "Ingeniero",
  "Abogado",
  "Doctor",
  "Especialista",
];

export const AUDIT_META: Record<string, { label: string; color: string }> = {
  creado: { label: "Documento creado", color: "bg-slate-400" },
  editado: { label: "Documento editado", color: "bg-indigo-400" },
  enviado: { label: "Enviado a firmar", color: "bg-amber-400" },
  visto: { label: "Documento visto", color: "bg-sky-400" },
  aprobado: { label: "Aprobación registrada", color: "bg-cyan-400" },
  firmado: { label: "Firma registrada", color: "bg-emerald-400" },
  copiado: { label: "Copia distribuida", color: "bg-violet-400" },
  completado: { label: "Flujo completado", color: "bg-cyan-400" },
  radicado: { label: "Radicado asignado", color: "bg-teal-400" },
  rechazado: { label: "Firma rechazada", color: "bg-rose-400" },
  exportado: { label: "PDF descargado", color: "bg-fuchsia-400" },
  devuelto: { label: "Devuelto para corrección", color: "bg-orange-400" },
  comentado: { label: "Comentario", color: "bg-slate-400" },
  archivado: { label: "Archivado", color: "bg-slate-500" },
  remitido: { label: "Remitido", color: "bg-sky-400" },
  eliminado: { label: "Borrador eliminado", color: "bg-rose-400" },
};
