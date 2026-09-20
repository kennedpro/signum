/**
 * Sello institucional "FIRMA DIGITAL" como cadena SVG.
 * Se usa en el editor (membrete), en el expediente, en el portal de firma
 * y en el PDF vectorial: un solo origen para que el logo sea idéntico en
 * todas las vistas. No depende del DOM ni de React.
 */
export function sealSvg(variant: string | null | undefined, color: string): string {
  const corporate = variant === "corporativo";
  const accent = corporate ? "#22d3ee" : "#d4a017";
  const deep = corporate ? color : "#0f766e";
  const glyph = corporate
    ? `<circle cx="54" cy="50" r="15" fill="${deep}"/><circle cx="54" cy="50" r="15" fill="${accent}" opacity="0.2"/><g stroke="#ffffff" stroke-width="2.4" stroke-linecap="round"><path d="M54 35 v8"/><path d="M54 57 v8"/><path d="M39 50 h8"/><path d="M61 50 h8"/></g><circle cx="54" cy="50" r="5.5" fill="#ffffff"/><circle cx="54" cy="50" r="2.4" fill="${deep}"/>`
    : `<path d="M54 28 L70 34.5 V52 C70 62 63 69.5 54 73.5 C45 69.5 38 62 38 52 V34.5 Z" fill="${deep}"/><path d="M54 33 L66 37.8 V52 C66 59.6 60.6 65.6 54 69 C47.4 65.6 42 59.6 42 52 V37.8 Z" fill="${accent}" opacity="0.28"/><path d="M46.5 51.5 l5.5 6 11-13" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 128" width="108" height="128" role="img" aria-label="Sello firma digital">
<circle cx="54" cy="52" r="47" fill="none" stroke="${accent}" stroke-width="0.6" opacity="0.45"/>
<circle cx="54" cy="52" r="43.5" fill="none" stroke="${accent}" stroke-width="2.6" stroke-dasharray="1.2 5" opacity="0.85"/>
<g stroke="${deep}" stroke-width="2" stroke-linecap="round"><path d="M54 5 v6"/><path d="M54 93 v6"/><path d="M7 52 h6"/><path d="M95 52 h6"/></g>
<path d="M54 13 L86 31.5 V68.5 L54 87 L22 68.5 V31.5 Z" fill="#ffffff" stroke="${deep}" stroke-width="2.4" stroke-linejoin="round"/>
<path d="M54 20 L80 35 V65 L54 80 L28 65 V35 Z" fill="none" stroke="${accent}" stroke-width="0.7" stroke-dasharray="1.2 2.6" opacity="0.8"/>
<g stroke="${accent}" stroke-width="1.1" stroke-linecap="round" opacity="0.7"><path d="M22 44 h-7"/><path d="M86 60 h7"/><path d="M54 87 v6"/></g>
<circle cx="14.5" cy="44" r="1.6" fill="${accent}"/><circle cx="93.5" cy="60" r="1.6" fill="${deep}"/>
${glyph}
<path d="M6 66 h96 v18 h-96 z" fill="${deep}"/><path d="M6 66 h96 v4 h-96 z" fill="#ffffff" opacity="0.22"/>
<text x="54" y="79" text-anchor="middle" font-size="9.4" font-weight="700" letter-spacing="1.5" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">FIRMA DIGITAL</text>
<g stroke="${deep}" stroke-width="2.2" stroke-linecap="round" opacity="0.5"><path d="M30 104 h10"/><path d="M44 104 h4"/><path d="M52 104 h14"/><path d="M70 104 h8"/><path d="M34 112 h8"/><path d="M46 112 h16"/><path d="M66 112 h8"/></g>
</svg>`;
}
