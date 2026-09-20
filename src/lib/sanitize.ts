/**
 * Saneamiento defensivo del HTML producido por el editor.
 * El contenido del documento se renderiza con dangerouslySetInnerHTML, por lo que
 * toda entrada debe pasar por aquí antes de persistirse (defensa contra XSS
 * almacenado, inyección de marcos y exfiltración vía recursos remotos).
 */

const BLOCKED_TAGS =
  /<\s*\/?\s*(script|iframe|object|embed|link|meta|style|form|input|button|base|svg|math|frame|frameset|applet|template)\b[^>]*>/gi;

const BLOCK_WITH_CONTENT =
  /<\s*(script|style|iframe|object|embed|template)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;

// Atributos de evento: onclick, onerror, onload, onpointerdown, …
const EVENT_ATTRS = /\s+on[a-z-]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

// Protocolos peligrosos en href/src/action
const DANGEROUS_URLS =
  /\s+(href|src|action|xlink:href|formaction)\s*=\s*("|')?\s*(javascript|vbscript|file)\s*:[^"'>\s]*("|')?/gi;

// Esquema data: solo se admite en src de imágenes (rúbricas PNG/JPEG); en href/action se elimina siempre.
const DATA_URLS =
  /\s+(href|action|xlink:href|formaction)\s*=\s*("|')?\s*data\s*:[^"'>\s]*("|')?/gi;
const DATA_SRC_NON_IMAGE =
  /\s+src\s*=\s*("|')?\s*data\s*:(?!image\/(png|jpe?g|webp|gif);base64,)[^"'>\s]*("|')?/gi;

// Fugas de estilo (expression, url(), @import)
const RISKY_STYLE = /\s+style\s*=\s*("[^"]*(expression|javascript:|url\s*\()[^"]*"|'[^']*(expression|javascript:|url\s*\()[^']*')/gi;

const MAX_LENGTH = 400_000; // ~400 KB de HTML por documento

export function sanitizeDocumentHtml(input: string): string {
  let html = String(input ?? "");
  if (html.length > MAX_LENGTH) html = html.slice(0, MAX_LENGTH);

  html = html
    .replace(BLOCK_WITH_CONTENT, "")
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(DANGEROUS_URLS, "")
    .replace(DATA_URLS, "")
    .replace(DATA_SRC_NON_IMAGE, "")
    .replace(RISKY_STYLE, "")
    // Neutraliza intentos de romper el contexto con comentarios condicionales
    .replace(/<!--[\s\S]*?-->/g, "");

  return html.trim();
}

/** Escapa texto plano que se inyecta en atributos o etiquetas. */
export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Normaliza y valida datos de identidad institucional. */
export function cleanIdentity(v: unknown, max = 160): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
  return s.length ? s : null;
}
