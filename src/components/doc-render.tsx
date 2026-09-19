import { Fragment } from "react";
import {
  SignatureStamp,
  SignatureSlotPlaceholder,
  type StampData,
} from "@/components/signature-stamp";
import { resolvePlaceholders, type PlaceholderContext } from "@/lib/letterhead";

const SLOT_RE = /<div[^>]*data-signature-slot[^>]*>\s*<\/div>/gi;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1] : null;
}

type Piece =
  | { kind: "html"; html: string }
  | { kind: "slot"; index: number; label: string | null };

export function parseSlots(html: string): { pieces: Piece[]; slotCount: number } {
  const pieces: Piece[] = [];
  let last = 0;
  let slotCount = 0;
  SLOT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SLOT_RE.exec(html)) !== null) {
    if (m.index > last) pieces.push({ kind: "html", html: html.slice(last, m.index) });
    slotCount += 1;
    pieces.push({
      kind: "slot",
      index: Number(attr(m[0], "data-signature-slot")) || slotCount,
      label: attr(m[0], "data-signature-label"),
    });
    last = m.index + m[0].length;
  }
  if (last < html.length) pieces.push({ kind: "html", html: html.slice(last) });
  return { pieces, slotCount };
}

/** Cuenta los contenedores fantasma disponibles en una plantilla. */
export function countSlots(html: string) {
  return (html.match(/data-signature-slot/g) ?? []).length;
}

/**
 * MOTOR DE INYECCIÓN PASIVA.
 * Localiza cada contenedor fantasma y estampa dentro el bloque de firma.
 * El resto del documento conserva sus coordenadas: el contenedor vacío y
 * el firmado tienen exactamente las mismas dimensiones.
 */
export function DocumentRender({
  html,
  signatures = [],
  showPlaceholders = true,
  color = "#0e7490",
  apa = false,
  placeholders,
  finalLook = false,
}: {
  html: string;
  signatures?: StampData[];
  showPlaceholders?: boolean;
  color?: string;
  apa?: boolean;
  /** Código vigente y logo para resolver los marcadores del membrete. */
  placeholders?: PlaceholderContext;
  /** Vista "documento final": los espacios de firma se muestran limpios (sin rótulos técnicos). */
  finalLook?: boolean;
}) {
  // Los marcadores (logo, radicado) se resuelven al mostrar; el HTML almacenado no cambia.
  const resolved = resolvePlaceholders(html, {
    code: placeholders?.code ?? null,
    logoUrl: placeholders?.logoUrl ?? null,
    color: placeholders?.color ?? color,
  });
  const { pieces, slotCount } = parseSlots(resolved);
  // <section data-page-header|footer> se renderizan tal cual (CSS .doc-page-header/.doc-page-footer)
  // dentro del flujo; en el PDF se repiten por página.
  let cursor = 0;
  const overflow = signatures.slice(slotCount);

  return (
    <div className={apa ? "doc-content doc-apa" : "doc-content"}>
      {pieces.map((piece, i) => {
        if (piece.kind === "html") {
          return <div key={`h-${i}`} dangerouslySetInnerHTML={{ __html: piece.html }} />;
        }
        const sig = signatures[cursor];
        const slotNumber = cursor + 1;
        cursor += 1;
        if (sig) {
          return <SignatureStamp key={`s-${i}`} data={sig} label={piece.label} color={color} />;
        }
        if (!showPlaceholders) return <Fragment key={`s-${i}`} />;
        return <SignatureSlotPlaceholder key={`s-${i}`} label={piece.label} index={slotNumber} final={finalLook} />;
      })}

      {overflow.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-5">
          {overflow.map((sig, i) => (
            <SignatureStamp key={`o-${i}`} data={sig} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}
