import { sealSvg } from "@/lib/seal-svg";

/* ═══════════════════════════════════════════════════════════════════
   MEMBRETE EDITABLE (encabezado dentro del documento)

   El encabezado institucional, la fecha, el destinatario, el asunto y el
   pie de contacto forman parte del contenido del documento y se editan
   como cualquier otro texto. Solo dos elementos los controla el sistema
   mediante MARCADORES estables que se resuelven al mostrar/imprimir:

     <span data-org-logo="variante">   → sello o logo de la entidad
     <span data-doc-code>              → "Borrador 00000005" y, una vez
                                         firmado, el radicado "OFI-2026-0007"

   Gracias a los marcadores, asignar el radicado NO modifica el HTML
   almacenado: la huella SHA-256 firmada permanece válida.
   ═══════════════════════════════════════════════════════════════════ */

export type LetterheadOrg = {
  name: string;
  entityType?: string | null;
  nit?: string | null;
  sigla?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  logoVariant?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

export type LetterheadDoc = {
  docType: string;
  city?: string | null;
  subject?: string | null;
  createdAt?: Date | string | null;
  sender?: { name: string; cargo?: string | null; dependencia?: string | null; unidad?: string | null } | null;
  destinatario?: {
    name: string;
    cargo?: string | null;
    dependencia?: string | null;
    external?: boolean | null;
    companyName?: string | null;
  } | null;
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function longDate(d: Date | string | null | undefined) {
  const dt = d ? (typeof d === "string" ? new Date(d) : d) : new Date();
  const day = String(dt.getDate()).padStart(2, "0");
  return `${day} de ${MONTHS[dt.getMonth()]} de ${dt.getFullYear()}`;
}

const p = (text: string, opts: { strong?: boolean; cls?: string } = {}) => {
  const inner = opts.strong ? `<strong>${text}</strong>` : text;
  return `<p${opts.cls ? ` class="${opts.cls}"` : ""}>${inner}</p>`;
};
const blank = () => `<p></p>`;

/** ¿El contenido ya trae el membrete editable? */
export function hasLetterhead(html: string | null | undefined) {
  return /data-letterhead/.test(html ?? "");
}

/** Encabezado: sello a la izquierda y líneas de la entidad (editables) a la derecha. */
export function letterheadBlockHtml(org: LetterheadOrg, unit?: { dependencia?: string | null; unidad?: string | null }) {
  const variant = org.logoVariant ?? "institucional";
  // Jerarquía como en un membrete de oficio: entidad → unidad → dependencia → NIT/sigla.
  // Todo es texto editable; el usuario puede ajustar o borrar cualquier línea.
  const lines: string[] = [p(esc(org.name).toUpperCase(), { strong: true })];
  if (unit?.unidad && unit.unidad.trim().toUpperCase() !== org.name.trim().toUpperCase()) {
    lines.push(p(esc(unit.unidad).toUpperCase()));
  }
  if (unit?.dependencia && lines.length < 3) lines.push(p(esc(unit.dependencia).toUpperCase()));
  const ident = [org.sigla ? `Sigla ${org.sigla}` : null, org.nit ? `NIT ${org.nit}` : null].filter(Boolean).join(" · ");
  if (ident && lines.length < 4) lines.push(p(esc(ident).toUpperCase()));
  // Máximo 4 líneas: es lo que cabe en un encabezado de 1,25 cm dentro de un margen de 2,54 cm.
  // El código del documento (Borrador nnnnnnnn → radicado al sellar) va arriba a la derecha.
  return `<div data-letterhead="" class="doc-letterhead"><span data-org-logo="${esc(variant)}" class="doc-letterhead__logo"></span><div class="doc-letterhead__lines">${lines.slice(0, 4).join("")}</div><div class="doc-letterhead__code"><p><span data-doc-code=""></span></p></div></div>`;
}

/**
 * Bloque de datos del documento (editable), según el tipo documental.
 *
 * Criterio (como en un oficio real): NO se repite quién elabora ni quién
 * firma — eso lo acredita la estampa de firma y la trazabilidad. Solo va lo
 * que el lector necesita: fecha, a quién se dirige y el asunto.
 *   · oficio / memorando / certificación → fecha · destinatario · asunto
 *   · informe                             → fecha · dirigido a · asunto
 *   · acta                                → título/asunto centrado (sin fecha:
 *                                           la lleva el cuerpo del acta)
 *   · contrato                            → asunto/objeto centrado
 * El código provisional (Borrador 00000007) NO se imprime en el cuerpo: se
 * muestra en la cabecera de la consola; el radicado oficial se estampa al
 * sellar (marcador data-doc-code en el encabezado de página).
 */
export function metaBlockHtml(doc: LetterheadDoc) {
  const city = doc.city ?? "Bogotá D.C.";
  const d = doc.destinatario;
  const out: string[] = [];
  const subject = doc.subject?.trim();

  if (doc.docType === "acta") {
    out.push(p(esc(subject || "[Nombre del comité o reunión]"), { strong: true, cls: "doc-center" }));
    out.push(blank());
    return out.join("");
  }
  if (doc.docType === "contrato") {
    out.push(p(esc(subject || "[Objeto del contrato]"), { strong: true, cls: "doc-center" }));
    out.push(blank());
    return out.join("");
  }

  out.push(p(`${esc(city)}, ${longDate(doc.createdAt)}`));
  out.push(blank());

  if (d) {
    const treatment =
      doc.docType === "certificacion" ? "Se certifica que" : d.external ? "Señor(a)" : "Señor(a)";
    out.push(p(treatment));
    out.push(p(esc(d.name).toUpperCase(), { strong: true }));
    if (d.cargo) out.push(p(esc(d.cargo)));
    if (d.dependencia) out.push(p(esc(d.dependencia)));
    if (d.external && d.companyName) out.push(p(esc(d.companyName)));
    out.push(p(esc(city)));
    out.push(blank());
  }

  out.push(p(`<strong>Asunto:</strong> ${esc(subject || "[Asunto del documento]")}`));
  out.push(blank());
  return out.join("");
}

/**
 * Datos de contacto de la entidad al cierre del documento (editable):
 * van en el CUERPO, después del espacio de firma y del «Anexo:» si existe,
 * como en un oficio impreso. No se repiten por página.
 */
/** Datos de contacto institucionales al cierre del documento (iguales para toda la plataforma). */
export const CONTACT_LINES = [
  "Ronda de la Comunicación s/n, Edificio Central, 28050 Madrid, España",
  "Teléfono: +34 91 482 3800 ext. 4210",
  "soc.cyber@telefonicatech.com",
  "www.telefonicatech.com",
] as const;

export function contactBlockHtml(_org?: LetterheadOrg) {
  // Contenedor con marcador: el editor lo trata como bloque propio (no se duplica al reabrir)
  // y el PDF lo reconoce. Las líneas son editables dentro del bloque.
  return `<div data-contact-block="" class="doc-contact">${CONTACT_LINES.map((l) => p(esc(l))).join("")}</div>`;
}

/**
 * Documento completo (modelo Word):
 *   <section data-page-header>  membrete (logo + líneas)   ← se repite en cada página
 *   cuerpo: código, fecha, destinatario, asunto, texto, firma
 *   <section data-page-footer>  datos de contacto           ← se repite en cada página
 */
export function withLetterhead(body: string, org: LetterheadOrg, doc: LetterheadDoc) {
  if (hasLetterhead(body)) return body;
  const unit = doc.sender ? { dependencia: doc.sender.dependencia ?? null, unidad: doc.sender.unidad ?? null } : undefined;
  const header = `<section data-page-header="" class="doc-page-header">${letterheadBlockHtml(org, unit)}</section>`;
  return `${header}${metaBlockHtml(doc)}${insertContactAfterSignature(body, org)}`;
}

/** Coloca el bloque de contacto tras el último espacio de firma o tras el «Anexo:» si va después. */
export const ANEXOS_LINE = '<p><strong>Anexos:</strong> No.</p>';

/** ¿El cuerpo ya tiene la línea de anexos? */
export function hasAnexos(body: string) {
  return /<p>(?:<strong>)?Anexos?:/i.test(body ?? "");
}

/**
 * Tras la firma: salto de párrafo → «Anexos: …» (editable: Sí/No o detalle) →
 * salto de párrafo → bloque de contacto.
 */
export function insertContactAfterSignature(body: string, org: LetterheadOrg) {
  const contact = contactBlockHtml(org);
  const slotRe = /<div[^>]*data-signature-slot[^>]*>\s*<\/div>/gi;
  let lastSlotEnd = -1;
  for (const m of body.matchAll(slotRe)) lastSlotEnd = m.index! + m[0].length;
  const anexoRe = /<p>(?:<strong>)?Anexos?:[\s\S]*?<\/p>/gi;
  let lastAnexoEnd = -1;
  for (const m of body.matchAll(anexoRe)) lastAnexoEnd = m.index! + m[0].length;
  if (lastAnexoEnd >= 0) {
    // Ya hay anexos: contacto después (con salto)
    return body.slice(0, lastAnexoEnd) + blank() + contact + body.slice(lastAnexoEnd);
  }
  if (lastSlotEnd >= 0) {
    return body.slice(0, lastSlotEnd) + blank() + ANEXOS_LINE + blank() + contact + body.slice(lastSlotEnd);
  }
  return body + blank() + ANEXOS_LINE + blank() + contact;
}

/** Garantiza la línea «Anexos:» entre la firma y el contacto en documentos existentes. */
export function ensureAnexos(body: string): string {
  if (hasAnexos(body)) return body;
  const m = /<div[^>]*data-contact-block=""[^>]*>/i.exec(body ?? "");
  if (!m) return body;
  const at = m.index;
  // quitar párrafos vacíos justo antes del contacto y reinsertar con la estructura estándar
  const before = body.slice(0, at).replace(/(?:<p><\/p>)+$/i, "");
  return before + blank() + ANEXOS_LINE + blank() + body.slice(at);
}

/* ── Resolución de marcadores al MOSTRAR (nunca altera lo almacenado) ── */
export type PlaceholderContext = {
  code: string | null; // "Borrador 00000005" | "OFI-2026-0007"
  logoUrl?: string | null;
  color?: string | null;
};

const LOGO_RE = /<span([^>]*)data-org-logo="([^"]*)"([^>]*)>(?:\s|&nbsp;)*<\/span>/gi;
const CODE_RE = /<span([^>]*)data-doc-code(?:="[^"]*")?([^>]*)>[\s\S]*?<\/span>/gi;

export function logoMarkup(variant: string | null | undefined, ctx: PlaceholderContext) {
  if (ctx.logoUrl && /^https:\/\/[^\s"'<>]+$/i.test(ctx.logoUrl)) {
    return `<img src="${esc(ctx.logoUrl)}" alt="Logo de la organización" class="sig-logo sig-logo--img" />`;
  }
  return sealSvg(variant, ctx.color ?? "#0e7490");
}

/** Sustituye los marcadores por su representación visual actual. */
export function resolvePlaceholders(html: string, ctx: PlaceholderContext) {
  return html
    .replace(LOGO_RE, (_m, a: string, variant: string, b: string) =>
      `<span${a}data-org-logo="${esc(variant)}"${b}>${logoMarkup(variant, ctx)}</span>`)
    .replace(CODE_RE, (_m, a: string, b: string) =>
      `<span${a}data-doc-code=""${b}>${esc(ctx.code ?? "")}</span>`);
}

/**
 * Limpieza de borradores generados con la versión anterior del bloque de
 * datos: retira el código provisional impreso en el cuerpo y las líneas
 * redundantes «Elaborado por / Dirigido a» (con el nombre, cargo y
 * dependencia que las seguían). Solo actúa sobre patrones exactos generados
 * por SIGNUM; nunca toca texto escrito por el usuario.
 */
export function stripLegacyMeta(html: string): string {
  let out = html ?? "";
  // Pie de contacto de la versión anterior (sección repetida por página): se retira; se recoloca en el cuerpo.
  out = out.replace(/<section[^>]*data-page-footer=""[^>]*>[\s\S]*?<\/section>/gi, "");
  // Código provisional impreso en el cuerpo
  out = out.replace(/<p class="doc-code"><span data-doc-code=""[^>]*><\/span><\/p>/gi, "");
  out = out.replace(/<p class="doc-code">[^<]*<\/p>/gi, "");
  // «Elaborado por» + nombre (strong) + hasta 2 líneas (cargo, dependencia)
  out = out.replace(/<p>Elaborado por<\/p><p><strong>[^<]*<\/strong><\/p>(?:<p>(?!Dirigido a|Asunto|<strong>)[^<]*<\/p>){0,2}/gi, "");
  // «Dirigido a» + nombre (strong) + hasta 1 línea (cargo)
  out = out.replace(/<p>Dirigido a<\/p><p><strong>[^<]*<\/strong><\/p>(?:<p>(?!Asunto|<strong>)[^<]*<\/p>){0,1}/gi, "");
  return out;
}

/**
 * Garantiza el bloque de datos (fecha · destinatario · asunto) al inicio del
 * cuerpo si el borrador no lo tiene (documentos creados con versiones previas).
 */
export function ensureMetaBlock(body: string, doc: LetterheadDoc): string {
  const hasDate = /<p>[^<]*\d{1,2} de [a-záéíóú]+ de \d{4}<\/p>/i.test(body);
  const hasSubject = /<strong>Asunto:<\/strong>/i.test(body);
  const hasRecipient = /<p>Se[ñn]or\(a\)<\/p>/i.test(body);
  if (hasDate && hasSubject && (hasRecipient || !doc.destinatario)) return body;
  // Retira restos parciales del bloque anterior y antepone el bloque completo.
  let rest = body
    .replace(/^(?:<p>[^<]*\d{1,2} de [a-záéíóú]+ de \d{4}<\/p>)?(?:<p><\/p>)*/i, "")
    .replace(/^<p><strong>Asunto:<\/strong>[^<]*<\/p>(?:<p><\/p>)*/i, "");
  return metaBlockHtml(doc) + rest;
}

/**
 * Garantiza UN solo bloque de contacto al cierre (tras firma/anexo).
 * · Elimina duplicados y el formato antiguo (párrafos sueltos generados por SIGNUM
 *   con dirección/teléfono/web de la entidad).
 * · Si no existe, lo inserta tras la firma o el anexo.
 */
export function ensureContactBlock(body: string, org: LetterheadOrg): string {
  let out = body ?? "";
  // a) Proteger los bloques nuevos mientras se limpia el formato antiguo.
  const kept: string[] = [];
  out = out.replace(/<div[^>]*data-contact-block=""[^>]*>[\s\S]*?<\/div>/gi, (m) => {
    kept.push(m);
    return `\u0000CONTACT${kept.length - 1}\u0000`;
  });
  // b) Formato antiguo (párrafos sueltos: dirección / Teléfono: … / [correo] / sitio web)
  const oldGroup = new RegExp(
    "(?:<p><\\/p>)?<p>[^<]{6,120}<\\/p><p>Tel[ée]fono:[^<]*<\\/p>(?:<p>[^<]*@[^<]*<\\/p>)?<p>(?:https?:\\/\\/)?www\\.[^<]*<\\/p>",
    "gi"
  );
  out = out.replace(oldGroup, "");
  // c) Restaurar: si hay varios bloques nuevos, conservar solo el último.
  const last = kept.length - 1;
  out = out.replace(/\u0000CONTACT(\d+)\u0000/g, (_m, i: string) => (Number(i) === last ? kept[last] : ""));
  if (/data-contact-block=""/.test(out)) return out;
  return insertContactAfterSignature(out, org);
}

/** Quita los párrafos vacíos entre el cierre («Atentamente,» u otro) y el espacio de firma. */
export function tightenSignature(body: string): string {
  return (body ?? "").replace(/(<\/p>)(?:<p><\/p>)+(<div[^>]*data-signature-slot)/gi, "$1$2");
}
