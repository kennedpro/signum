/* ═══════════════════════════════════════════════════════════════════
   CONFIGURACIÓN DE PÁGINA (modelo Word)

   Hoja carta 21,59 × 27,94 cm. Todo en centímetros.
   · margins      → márgenes del cuerpo (arrastrables desde la regla).
   · headerFromTop→ distancia del ENCABEZADO al borde superior (Word: 1,25 cm).
   · footerFromBottom → distancia del PIE al borde inferior.
   · indentFirst / indentLeft / indentRight → sangrías del párrafo actual
     (se aplican como estilo del párrafo; aquí solo viven los valores por
     defecto que muestra la regla cuando no hay selección).

   Se guarda como JSON en documents.page_setup y se valida al leer:
   nunca se confía en valores fuera de rango (evita hojas rotas o PDF
   con márgenes negativos).
   ═══════════════════════════════════════════════════════════════════ */

export const PAGE_CM = { width: 21.59, height: 27.94 } as const;

export type PageSetup = {
  margins: { top: number; right: number; bottom: number; left: number };
  headerFromTop: number;
  footerFromBottom: number;
  differentFirstPage: boolean;
};

export const DEFAULT_PAGE_SETUP: PageSetup = {
  margins: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 },
  headerFromTop: 1.25,
  footerFromBottom: 1.25,
  differentFirstPage: false,
};

const LIMITS = {
  margin: { min: 0.5, max: 7 },
  headerFooter: { min: 0.3, max: 5 },
} as const;

const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};

/** Convierte lo almacenado (JSON o null) en una configuración válida. */
export function parsePageSetup(raw: string | null | undefined): PageSetup {
  if (!raw) return DEFAULT_PAGE_SETUP;
  try {
    const j = JSON.parse(raw) as Partial<PageSetup> & { margins?: Partial<PageSetup["margins"]> };
    return normalizePageSetup(j);
  } catch {
    return DEFAULT_PAGE_SETUP;
  }
}

export function normalizePageSetup(j: Partial<PageSetup> & { margins?: Partial<PageSetup["margins"]> }): PageSetup {
  const d = DEFAULT_PAGE_SETUP;
  const m: Partial<PageSetup["margins"]> = j.margins ?? {};
  const margins = {
    top: clamp(m.top, LIMITS.margin.min, LIMITS.margin.max, d.margins.top),
    right: clamp(m.right, LIMITS.margin.min, LIMITS.margin.max, d.margins.right),
    bottom: clamp(m.bottom, LIMITS.margin.min, LIMITS.margin.max, d.margins.bottom),
    left: clamp(m.left, LIMITS.margin.min, LIMITS.margin.max, d.margins.left),
  };
  // El área útil nunca puede ser menor de 6 cm de ancho ni de alto.
  if (PAGE_CM.width - margins.left - margins.right < 6) {
    margins.left = d.margins.left;
    margins.right = d.margins.right;
  }
  if (PAGE_CM.height - margins.top - margins.bottom < 6) {
    margins.top = d.margins.top;
    margins.bottom = d.margins.bottom;
  }
  const headerFromTop = clamp(j.headerFromTop, LIMITS.headerFooter.min, LIMITS.headerFooter.max, d.headerFromTop);
  const footerFromBottom = clamp(j.footerFromBottom, LIMITS.headerFooter.min, LIMITS.headerFooter.max, d.footerFromBottom);
  return {
    margins,
    headerFromTop: Math.min(headerFromTop, margins.top - 0.2),
    footerFromBottom: Math.min(footerFromBottom, margins.bottom - 0.2),
    differentFirstPage: Boolean(j.differentFirstPage),
  };
}

export function serializePageSetup(s: PageSetup) {
  return JSON.stringify(normalizePageSetup(s));
}

/** Área útil del cuerpo en cm. */
export function usableArea(s: PageSetup) {
  return {
    width: PAGE_CM.width - s.margins.left - s.margins.right,
    height: PAGE_CM.height - s.margins.top - s.margins.bottom,
  };
}

/* ── Encabezado y pie: bloques del documento identificados por marcador ──
   Se usa <section data-page-header> … </section>: el cuerpo nunca produce
   <section>, así que el cierre es inequívoco y el sanitizador lo respeta. */

export function splitDocumentHtml(html: string) {
  let header = "";
  let footer = "";
  let body = html ?? "";
  const h = body.match(/<section[^>]*data-page-header=""[^>]*>([\s\S]*?)<\/section>/i);
  if (h) {
    header = h[1];
    body = body.replace(h[0], "");
  }
  const f = body.match(/<section[^>]*data-page-footer=""[^>]*>([\s\S]*?)<\/section>/i);
  if (f) {
    footer = f[1];
    body = body.replace(f[0], "");
  }
  return { header, body: body.trim(), footer };
}

/** Recompone el HTML completo con los marcadores de encabezado y pie. */
export function joinDocumentHtml(parts: { header: string; body: string; footer: string }) {
  const header = parts.header.trim()
    ? `<section data-page-header="" class="doc-page-header">${parts.header}</section>`
    : "";
  const footer = parts.footer.trim()
    ? `<section data-page-footer="" class="doc-page-footer">${parts.footer}</section>`
    : "";
  return `${header}${parts.body}${footer}`;
}

export function hasPageHeader(html: string | null | undefined) {
  return /data-page-header=""/.test(html ?? "");
}
