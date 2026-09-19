import { DocumentRender } from "@/components/doc-render";
import type { StampData } from "@/components/signature-stamp";
import { resolvePlaceholders, type PlaceholderContext } from "@/lib/letterhead";
import { splitDocumentHtml, type PageSetup, DEFAULT_PAGE_SETUP } from "@/lib/page-setup";

/**
 * HOJA DEL DOCUMENTO (solo lectura) — misma geometría que el editor y el PDF.
 *
 *  ┌ margen superior ──────────────────────────────────────────────┐
 *  │  encabezado de página (a headerFromTop del borde)              │
 *  ├────────────────────────────────────────────────────────────────┤
 *  │  cuerpo (entre márgenes; el encabezado nunca lo superpone)     │
 *  ├────────────────────────────────────────────────────────────────┤
 *  │  pie de página (si existe), a footerFromBottom del borde       │
 *  └────────────────────────────────────────────────────────────────┘
 * Se usa en el expediente y en el portal de firma para que "lo que se ve"
 * sea exactamente "lo que se firma".
 */
export function DocSheet({
  html,
  signatures = [],
  apa = false,
  color = "#0e7490",
  placeholders,
  pageSetup = DEFAULT_PAGE_SETUP,
  children,
}: {
  html: string;
  signatures?: StampData[];
  apa?: boolean;
  color?: string;
  placeholders: PlaceholderContext;
  pageSetup?: PageSetup;
  /** Contenido adicional (p. ej. cabecera externa para documentos legados). */
  children?: React.ReactNode;
}) {
  const parts = splitDocumentHtml(html);
  const m = pageSetup.margins;
  const header = parts.header ? resolvePlaceholders(parts.header, placeholders) : "";
  const footer = parts.footer ? resolvePlaceholders(parts.footer, placeholders) : "";

  // Altura estimada del encabezado/pie (sin DOM): líneas × 0,42 cm (9 pt · 1,2) con un mínimo
  // para el logo (1,4 cm). El cuerpo empieza siempre debajo (comportamiento Word).
  const lines = (frag: string) => Math.max(1, (frag.match(/<p\b/gi) ?? []).length);
  const headerH = header ? Math.max(1.4, lines(header) * 0.42) : 0;
  const footerH = footer ? lines(footer) * 0.42 : 0;
  const effTop = header ? Math.max(m.top, pageSetup.headerFromTop + headerH + 0.3) : m.top;
  const effBottom = footer ? Math.max(m.bottom, pageSetup.footerFromBottom + footerH + 0.3) : m.bottom;

  return (
    <div
      className="paper doc-sheet"
      style={{
        ["--pt" as string]: `${effTop}cm`,
        ["--pr" as string]: `${m.right}cm`,
        ["--pb" as string]: `${effBottom}cm`,
        ["--pl" as string]: `${m.left}cm`,
      } as React.CSSProperties}
    >
      {header ? (
        /* Membrete: solo en la primera página, a headerFromTop del borde */
        <div
          className="doc-sheet__header"
          style={{ top: `${pageSetup.headerFromTop}cm`, left: `${m.left}cm`, right: `${m.right}cm` }}
          dangerouslySetInnerHTML={{ __html: header }}
        />
      ) : null}
      <div className="doc-sheet__body">
        {children}
        <DocumentRender html={parts.body} signatures={signatures} apa={apa} color={color} placeholders={placeholders} finalLook />
      </div>
      {footer ? (
        <div
          className="doc-sheet__footer"
          style={{ bottom: `${pageSetup.footerFromBottom}cm`, left: `${m.left}cm`, right: `${m.right}cm` }}
          dangerouslySetInnerHTML={{ __html: footer }}
        />
      ) : null}
    </div>
  );
}
