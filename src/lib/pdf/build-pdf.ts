import PdfPrinter from "pdfmake";
import type {
  Content,
  ContentCanvas,
  ContentText,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { buildStampLines, type EntityType } from "@/lib/entity";
import { formatStampDate } from "@/lib/utils";
import { sealSvg } from "@/lib/seal-svg";
import { hasLetterhead } from "@/lib/letterhead";
import { DEFAULT_PAGE_SETUP, splitDocumentHtml, type PageSetup } from "@/lib/page-setup";

/* ═══════════════════════════════════════════════════════════════════
   GENERADOR DE PDF VECTORIAL (servidor)

   Sustituye la captura de pantalla (html2canvas) por un PDF real:
   · Texto seleccionable, copiable e indexable.
   · Tipografía nativa del PDF (Times / Helvetica / Courier), sin
     glifos remontados ni espaciados rotos.
   · Hoja carta 21,59 × 27,94 cm con márgenes de 1" (APA 7.ª ed.),
     número de página arriba a la derecha y pie de trazabilidad.
   · Estampas de firma, encabezado institucional y certificado de
     integridad construidos como objetos vectoriales.
   Ninguna dependencia externa de red: todo se genera en el servidor.
   ═══════════════════════════════════════════════════════════════════ */

const PAGE = { width: 612, height: 792, margin: 72 } as const; // puntos (1" = 72 pt) — valores por defecto
const CM = 72 / 2.54; // puntos por centímetro
const INDENT = 36; // 1,27 cm — sangría APA de primera línea
/** Ancho útil según los márgenes activos (se fija al construir el documento). */
let INNER = PAGE.width - PAGE.margin * 2;

const FONTS = {
  Times: { normal: "Times-Roman", bold: "Times-Bold", italics: "Times-Italic", bolditalics: "Times-BoldItalic" },
  Helvetica: { normal: "Helvetica", bold: "Helvetica-Bold", italics: "Helvetica-Oblique", bolditalics: "Helvetica-BoldOblique" },
  Courier: { normal: "Courier", bold: "Courier-Bold", italics: "Courier-Oblique", bolditalics: "Courier-BoldOblique" },
};

/* ── Tipos de entrada ──────────────────────────────────────────── */
export type PdfStamp = {
  signerName: string;
  signerEmail: string;
  signerGrado?: string | null;
  signerCargo?: string | null;
  signerCedula?: string | null;
  signerDependencia?: string | null;
  signerUnidad?: string | null;
  signerEmpresa?: string | null;
  signerNit?: string | null;
  signerArea?: string | null;
  signerSucursal?: string | null;
  entityType?: string | null;
  logoVariant?: string | null;
  logoUrl?: string | null;
  signatureData?: string | null;
  hashPost?: string | null;
  hash?: string | null;
  createdAt: Date | string;
  keyFingerprint?: string | null;
};

export type PdfInput = {
  title: string;
  html: string;
  apa: boolean;
  docType: string;
  docTypeShort: string;
  docNumber: string | null;
  draftCode: string | null;
  city: string | null;
  subject: string | null;
  createdAt: Date;
  lockedAt: Date | null;
  hashPre: string | null;
  hashPost: string | null;
  sealHash: string | null;
  verifyUrl: string;
  pageSetup?: PageSetup | null;
  org: {
    name: string;
    entityType: string;
    nit?: string | null;
    sigla?: string | null;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    logoVariant?: string | null;
    primaryColor?: string | null;
  };
  sender: { name: string; cargo: string | null; dependencia?: string | null } | null;
  destinatario: {
    name: string;
    cargo: string | null;
    dependencia: string | null;
    external?: boolean;
    companyName?: string | null;
  } | null;
  stamps: PdfStamp[];
};

/* ══ 1. TEXTO SEGURO PARA LAS FUENTES ESTÁNDAR (WinAnsi) ═══════════ */
const ANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split("").map((c) => c.charCodeAt(0))
);
const REPLACE: Record<string, string> = {
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "✓": "OK", "✔": "OK", "✗": "x", "✘": "x",
  "‐": "-", "‑": "-", "‒": "-", "―": "—", "′": "'", "″": '"', "≥": ">=", "≤": "<=",
  "≠": "!=", "≈": "~", "★": "*", "☆": "*", "◦": "-", "▪": "-", "■": "-", "□": "-",
  "\u200B": "", "\u200C": "", "\u200D": "", "\uFEFF": "", "\u00AD": "", "\u2028": "\n", "\u2029": "\n",
};

export function ansi(input: string): string {
  let out = "";
  for (const ch of String(input ?? "").normalize("NFC")) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      code === 0x09 || code === 0x0a || code === 0x0d ||
      (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || ANSI_EXTRA.has(code)
    ) { out += ch; continue; }
    if (ch in REPLACE) { out += REPLACE[ch]; continue; }
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (base && base !== ch && (base.charCodeAt(0) ?? 999) < 0x80) out += base;
    // Emoji y símbolos fuera del repertorio se omiten en silencio.
  }
  return out;
}

/* ══ 2. MINI PARSER HTML (sin DOM; el HTML de Tiptap está bien formado) ══ */
type HNode = { tag: string; attrs: Record<string, string>; children: HNode[]; text: string };

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", ndash: "–", mdash: "—",
  hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", copy: "©",
  reg: "®", deg: "°", middot: "·", iexcl: "¡", iquest: "¿", bull: "•", euro: "€", ordf: "ª", ordm: "º",
  ntilde: "ñ", Ntilde: "Ñ", aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", uuml: "ü", Uuml: "Ü",
};
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED[e] ?? m;
  });
}

const VOID = new Set(["br", "hr", "img", "input", "meta", "link", "col", "wbr", "area", "base", "source", "track", "param", "embed"]);
const TOKEN =
  /<!--[\s\S]*?-->|<\/\s*([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
const ATTR = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g;

export function parseHtml(html: string): HNode {
  const root: HNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: HNode[] = [root];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(html))) {
    const [, close, open, rawAttrs, selfClose, text, stray] = m;
    const parent = stack[stack.length - 1];
    if (text !== undefined || stray !== undefined) {
      parent.children.push({ tag: "#text", attrs: {}, children: [], text: decode(text ?? "<") });
      continue;
    }
    if (close) {
      const tag = close.toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      continue;
    }
    if (open) {
      const tag = open.toLowerCase();
      const attrs: Record<string, string> = {};
      ATTR.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = ATTR.exec(rawAttrs ?? ""))) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? "");
      const node: HNode = { tag, attrs, children: [], text: "" };
      parent.children.push(node);
      if (!VOID.has(tag) && !selfClose) stack.push(node);
    }
  }
  return root;
}

function styleOf(attrs: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const decl of (attrs.style ?? "").split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim().replace(/!important/i, "").trim();
  }
  return out;
}
function pt(v?: string): number | undefined {
  if (!v) return undefined;
  const m = v.match(/^(-?[\d.]+)\s*(pt|px|em|rem)?$/i);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  const u = (m[2] ?? "px").toLowerCase();
  if (!Number.isFinite(n)) return undefined;
  if (u === "pt") return n;
  if (u === "px") return n * 0.75;
  return n * 12;
}
function fontOf(v?: string): "Times" | "Helvetica" | "Courier" | undefined {
  if (!v) return undefined;
  const f = v.toLowerCase();
  if (/courier|mono/.test(f)) return "Courier";
  if (/arial|helvetica|calibri|verdana|tahoma|segoe|sans/.test(f)) return "Helvetica";
  if (/times|georgia|cambria|garamond|serif|book/.test(f)) return "Times";
  return undefined;
}
function colorOf(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  if (/^[a-z]+$/.test(s) && s !== "transparent" && s !== "inherit" && s !== "initial") return s;
  return undefined;
}
function alignOf(v?: string): "left" | "center" | "right" | "justify" | undefined {
  return v === "left" || v === "center" || v === "right" || v === "justify" ? v : undefined;
}

/* ══ 3. CONVERSIÓN A pdfmake ═════════════════════════════════════════ */
type Ink = {
  bold?: boolean; italics?: boolean; decoration?: ("underline" | "lineThrough")[];
  color?: string; background?: string; fontSize?: number; font?: string; link?: string;
};
type Ctx = {
  apa: boolean;
  color: string;
  stamps: PdfStamp[];
  cursor: { i: number };
  plain: boolean; // dentro de listas, tablas o citas: sin sangría de primera línea
  logo: (variant?: string | null) => string | null;
  code: string; // "Borrador 00000005" | radicado — resuelve <span data-doc-code>
};

const INLINE = new Set(["a", "abbr", "b", "strong", "i", "em", "u", "s", "strike", "del", "mark", "code", "span", "br", "sub", "sup", "small", "img", "font", "label", "time", "kbd"]);

function run(text: string, st: Ink): ContentText {
  const r: ContentText = { text: ansi(text) };
  if (st.bold) r.bold = true;
  if (st.italics) r.italics = true;
  if (st.decoration?.length) r.decoration = st.decoration.length > 1 ? st.decoration : st.decoration[0];
  if (st.color) r.color = st.color;
  if (st.background) r.background = st.background;
  if (st.fontSize) r.fontSize = st.fontSize;
  if (st.font) r.font = st.font;
  if (st.link) r.link = st.link;
  return r;
}

function inlines(nodes: HNode[], st: Ink, out: ContentText[], ctx: Ctx) {
  for (const n of nodes) {
    if (n.tag === "#text") {
      const t = n.text.replace(/[ \t\r\n\f]+/g, " ");
      if (t) out.push(run(t, st));
      continue;
    }
    if (n.tag === "br") { out.push({ text: "\n" }); continue; }
    if (n.tag === "img") continue;
    if (n.tag === "span" && n.attrs["data-doc-code"] !== undefined) {
      out.push(run(ctx.code, { ...st, bold: true }));
      continue;
    }
    if (n.tag === "span" && n.attrs["data-org-logo"] !== undefined) continue; // solo dentro del membrete
    const css = styleOf(n.attrs);
    const next: Ink = { ...st, decoration: st.decoration ? [...st.decoration] : undefined };
    const addDeco = (d: "underline" | "lineThrough") => { next.decoration = [...(next.decoration ?? []), d]; };
    if (n.tag === "strong" || n.tag === "b") next.bold = true;
    if (n.tag === "em" || n.tag === "i") { next.italics = true; if (!next.color) next.color = "#57534e"; }
    if (n.tag === "u") addDeco("underline");
    if (n.tag === "s" || n.tag === "strike" || n.tag === "del") addDeco("lineThrough");
    if (n.tag === "mark") next.background = colorOf(css["background-color"]) ?? "#fef08a";
    if (n.tag === "code" || n.tag === "kbd") next.font = "Courier";
    if (n.tag === "a" && /^https:\/\/[^\s"'<>]+$/i.test(n.attrs.href ?? "")) {
      next.link = n.attrs.href; next.color = "#1d4ed8"; addDeco("underline");
    }
    const fs = pt(css["font-size"]); if (fs && fs >= 5 && fs <= 72) next.fontSize = fs;
    const col = colorOf(css.color); if (col) next.color = col;
    const bg = colorOf(css["background-color"]); if (bg && n.tag !== "mark") next.background = bg;
    const ff = fontOf(css["font-family"]); if (ff) next.font = ff;
    if (/bold|[6-9]00/.test(css["font-weight"] ?? "")) next.bold = true;
    if (css["font-style"] === "italic") next.italics = true;
    if (/underline/.test(css["text-decoration"] ?? "")) addDeco("underline");
    if (/line-through/.test(css["text-decoration"] ?? "")) addDeco("lineThrough");
    inlines(n.children, next, out, ctx);
  }
}

function trimRuns(runs: ContentText[]) {
  if (runs.length) {
    const f = runs[0]; if (typeof f.text === "string") f.text = f.text.replace(/^[ ]+/, "");
    const l = runs[runs.length - 1]; if (typeof l.text === "string") l.text = l.text.replace(/[ ]+$/, "");
  }
  return runs.filter((r) => r.text !== "");
}

function textOf(n: HNode): string {
  return n.tag === "#text" ? n.text : n.children.map(textOf).join("");
}

function upper(runs: ContentText[]) {
  return runs.map((r) => ({ ...r, text: typeof r.text === "string" ? r.text.toUpperCase() : r.text }));
}

function paragraph(children: HNode[], o: { align?: ContentText["alignment"]; lineHeight?: number; cls?: string }, ctx: Ctx): Content {
  const runs = trimRuns((() => { const r: ContentText[] = []; inlines(children, {}, r, ctx); return r; })());
  const empty = runs.every((r) => !String(r.text).trim());
  const base: ContentText = { text: empty ? "\u00a0" : runs };
  base.alignment = o.align ?? (ctx.apa ? "left" : "justify");
  if (o.lineHeight) base.lineHeight = o.lineHeight;
  const isRef = /\bapa-ref\b/.test(o.cls ?? "");
  if (ctx.apa) {
    base.margin = [0, 0, 0, 0];
    if (isRef) { base.margin = [INDENT, 0, 0, 0]; base.leadingIndent = -INDENT; }
    else if (!empty && !ctx.plain) base.leadingIndent = INDENT;
  } else {
    base.margin = [0, 0, 0, 0];
  }
  if (/\bdoc-code\b/.test(o.cls ?? "")) base.bold = true;
  if (/\bdoc-contact\b|\bdoc-footer\b/.test(o.cls ?? "")) {
    base.fontSize = 10;
    base.lineHeight = 1.25;
    base.leadingIndent = 0;
    base.margin = [0, 0, 0, 0];
  }
  if (/\bdoc-center\b/.test(o.cls ?? "")) base.alignment = "center";
  return base;
}

function heading(n: HNode, level: number, align: ContentText["alignment"] | undefined, ctx: Ctx): Content {
  const runs = trimRuns((() => { const r: ContentText[] = []; inlines(n.children, {}, r, ctx); return r; })());
  const text: ContentText["text"] = runs.length ? runs : "\u00a0";
  if (ctx.apa) {
    if (level === 1) return { text, bold: true, fontSize: 12, alignment: align ?? "center", lineHeight: 2, margin: [0, 0, 0, 0] };
    if (level === 2) return { text, bold: true, fontSize: 12, alignment: align ?? "left", lineHeight: 2, margin: [0, 0, 0, 0] };
    return { text, bold: true, italics: true, fontSize: 12, alignment: align ?? "left", lineHeight: 2, margin: [0, 0, 0, 0] };
  }
  if (level === 1) return { text: runs.length ? upper(runs) : text, bold: true, fontSize: 14, alignment: align ?? "center", lineHeight: 1.3, margin: [0, 0, 0, 12] };
  if (level === 2) return { text: runs.length ? upper(runs) : text, bold: true, fontSize: 12, alignment: align ?? "left", lineHeight: 1.3, margin: [0, 14, 0, 6] };
  return { text, bold: true, italics: true, fontSize: 12, alignment: align ?? "left", lineHeight: 1.3, margin: [0, 10, 0, 4] };
}

function list(n: HNode, ctx: Ctx): Content {
  const inner: Ctx = { ...ctx, plain: true };
  const items: Content[] = [];
  for (const li of n.children) {
    if (li.tag !== "li") continue;
    const parts = blocks(li.children, inner);
    items.push(parts.length === 1 ? parts[0] : { stack: parts });
  }
  const margin: [number, number, number, number] = ctx.apa ? [INDENT, 0, 0, 0] : [0, 2, 0, 8];
  return n.tag === "ol" ? { ol: items, margin } : { ul: items, margin };
}

const GRID: CustomTableLayout = {
  hLineWidth: () => 0.75, vLineWidth: () => 0.75,
  hLineColor: () => "#111111", vLineColor: () => "#111111",
  paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3, paddingBottom: () => 3,
};

function table(n: HNode, ctx: Ctx): Content {
  const rows: HNode[] = [];
  const collect = (node: HNode) => {
    for (const c of node.children) {
      if (c.tag === "tr") rows.push(c);
      else if (c.tag === "thead" || c.tag === "tbody" || c.tag === "tfoot") collect(c);
    }
  };
  collect(n);
  const grid: (TableCell | undefined)[][] = rows.map(() => []);
  let cols = 0;
  rows.forEach((tr, r) => {
    let c = 0;
    for (const cell of tr.children) {
      if (cell.tag !== "td" && cell.tag !== "th") continue;
      while (grid[r][c] !== undefined) c++;
      const colSpan = Math.max(1, parseInt(cell.attrs.colspan ?? "1", 10) || 1);
      const rowSpan = Math.max(1, parseInt(cell.attrs.rowspan ?? "1", 10) || 1);
      const parts = blocks(cell.children, { ...ctx, plain: true });
      const content: TableCell = {
        stack: parts.length ? parts : [{ text: "\u00a0" }],
        ...(cell.tag === "th" ? { bold: true, fillColor: "#f1f5f9" } : {}),
        ...(colSpan > 1 ? { colSpan } : {}),
        ...(rowSpan > 1 ? { rowSpan } : {}),
      };
      grid[r][c] = content;
      for (let dc = 1; dc < colSpan; dc++) grid[r][c + dc] = {};
      for (let dr = 1; dr < rowSpan && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < colSpan; dc++) grid[r + dr][c + dc] = {};
      }
      c += colSpan;
    }
    cols = Math.max(cols, grid[r].length);
  });
  if (!cols) return { text: "" };
  const body = grid.map((row) => Array.from({ length: cols }, (_, i) => row[i] ?? { text: "" }));
  const hasHeader = rows[0]?.children.some((c) => c.tag === "th") ?? false;
  return {
    table: { headerRows: hasHeader ? 1 : 0, widths: Array(cols).fill("*"), body, dontBreakRows: true },
    layout: GRID,
    fontSize: 11,
    lineHeight: 1.3,
    margin: [0, 4, 0, 10],
  };
}

function rule(): Content {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: INNER, y2: 0, lineWidth: 0.6, lineColor: "#b9b3ab" }], margin: [0, 10, 0, 10] };
}

function line(width: number, color = "#1c1917"): ContentCanvas {
  return { canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.8, lineColor: color }] };
}

function emptySlot(label: string | null): Content {
  return {
    unbreakable: true,
    margin: [0, 26, 0, 10],
    stack: [
      line(210),
      { text: ansi(label || "FIRMA AUTORIZADA"), font: "Helvetica", fontSize: 7.5, bold: true, characterSpacing: 1, color: "#57534e", lineHeight: 1.2, margin: [0, 4, 0, 0] },
    ],
  };
}

function stampBlock(s: PdfStamp, label: string | null, ctx: Ctx): Content {
  const entityType: EntityType = s.entityType === "privada" ? "privada" : "publica";
  const lines = buildStampLines(entityType, {
    name: s.signerName, email: s.signerEmail, grado: s.signerGrado, cargo: s.signerCargo, cedula: s.signerCedula,
    dependencia: s.signerDependencia, unidad: s.signerUnidad, empresa: s.signerEmpresa, nit: s.signerNit,
    area: s.signerArea, sucursal: s.signerSucursal,
  });
  const fingerprint = s.hashPost ?? s.hash ?? null;
  const hasInk = !!s.signatureData && /^data:image\/(png|jpe?g);base64,/i.test(s.signatureData);
  const svg = ctx.logo(s.logoVariant);
  const logo: Content = svg ? { svg, fit: [46, 54], alignment: "center" } : { text: "" };

  const meta: Content[] = [
    { text: "Firmado digitalmente por:", bold: true, fontSize: 7.5, color: "#0f172a", margin: [0, 0, 0, 2] },
    ...lines.map((l): Content => ({ text: [{ text: `${ansi(l.label)}: `, bold: true }, { text: ansi(l.value) }], fontSize: 7 })),
    { text: formatStampDate(s.createdAt), fontSize: 7, color: "#475569", margin: [0, 2, 0, 0] },
  ];

  const stack: Content[] = [
    hasInk ? { image: s.signatureData as string, fit: [150, 42] } : { text: "\u00a0", fontSize: 26 },
    { ...line(210), margin: [0, 2, 0, 3] },
  ];
  stack.push({
    table: { widths: [56, "*"], body: [[logo, { stack: meta, margin: [2, 0, 0, 0] }]] },
    layout: {
      hLineWidth: () => 0.75, vLineWidth: (i) => (i === 1 ? 0 : 0.75),
      hLineColor: () => "#94a3b8", vLineColor: () => "#94a3b8",
      paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 6, paddingBottom: () => 6,
    },
  });
  if (label) stack.push({ text: ansi(label), fontSize: 7.5, bold: true, characterSpacing: 1, color: "#57534e", margin: [0, 3, 0, 0] });
  if (fingerprint) {
    stack.push({
      text: [
        { text: " SHA-256 ", background: "#dcfce7", color: "#166534", bold: true, fontSize: 6.5 },
        { text: `  ${ansi(fingerprint)}`, font: "Courier", fontSize: 6.5, color: "#334155" },
      ],
      margin: [0, 3, 0, 0],
    });
  }

  return {
    unbreakable: true,
    margin: [0, 4, 0, 10],
    columns: [{ width: 340, stack, font: "Helvetica", lineHeight: 1.2, alignment: "left" }, { width: "*", text: "" }],
  };
}

/** Membrete editable: sello a la izquierda, líneas de la entidad a la derecha. */
function letterhead(n: HNode, ctx: Ctx): Content {
  const logoNode = n.children.find((c) => c.tag === "span" && c.attrs["data-org-logo"] !== undefined);
  const linesNode = n.children.find((c) => c.tag === "div") ?? n;
  const svg = ctx.logo(logoNode?.attrs["data-org-logo"] ?? null);
  const lines: Content[] = [];
  let first = true;
  for (const c of linesNode.children) {
    if (c.tag !== "p") continue;
    const runs = trimRuns((() => { const r: ContentText[] = []; inlines(c.children, {}, r, ctx); return r; })());
    if (!runs.length) continue;
    lines.push({
      text: runs,
      font: "Helvetica",
      fontSize: first ? 9.5 : 9,
      bold: first ? true : undefined,
      color: first ? "#4b5563" : "#6b7280",
      lineHeight: 1.2,
      alignment: "left",
      margin: [0, 0, 0, 1],
    });
    first = false;
  }
  const hasCode = n.children.some((c) => c.tag === "div" && /doc-letterhead__code/.test(c.attrs.class ?? ""));
  return {
    columns: [
      svg ? { width: 44, svg, fit: [42, 50] } : { width: 44, text: "" },
      { width: "*", stack: lines, margin: [6, 2, 0, 0] },
      ...(hasCode
        ? [{ width: "auto" as const, text: ansi(ctx.code), font: "Helvetica", fontSize: 9, bold: true, color: "#374151", alignment: "right" as const, margin: [8, 2, 0, 0] as [number, number, number, number] }]
        : []),
    ],
    columnGap: 4,
    margin: [0, 0, 0, 6],
    unbreakable: true,
  };
}

function slot(n: HNode, ctx: Ctx): Content {
  const s = ctx.stamps[ctx.cursor.i++];
  const label = n.attrs["data-signature-label"] || null;
  return s ? stampBlock(s, label, ctx) : emptySlot(label);
}

const cmOf = (v?: string) => {
  const m = (v ?? "").match(/^(-?[\d.]+)\s*cm$/i);
  return m ? Math.round(parseFloat(m[1]) * CM * 100) / 100 : undefined;
};

function applyIndents(content: Content, css: Record<string, string>): Content {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return content;
  const c = content as ContentText;
  const first = cmOf(css["text-indent"]);
  const left = cmOf(css["margin-left"]);
  const right = cmOf(css["margin-right"]);
  if (first === undefined && left === undefined && right === undefined) return content;
  const m = Array.isArray(c.margin) && c.margin.length === 4 ? [...c.margin] : [0, 0, 0, 0];
  if (left !== undefined) m[0] = left;
  if (right !== undefined) m[2] = right;
  return { ...c, margin: m as [number, number, number, number], ...(first !== undefined ? { leadingIndent: first } : {}) };
}

function block(n: HNode, ctx: Ctx): Content[] {
  const css = styleOf(n.attrs);
  const align = alignOf(css["text-align"]);
  const lh = parseFloat(css["line-height"] ?? "");
  const lineHeight = Number.isFinite(lh) && lh > 0 && lh < 5 ? lh : undefined;
  switch (n.tag) {
    case "p": return [applyIndents(paragraph(n.children, { align, lineHeight, cls: n.attrs.class ?? "" }, ctx), css)];
    case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
      return [applyIndents(heading(n, Math.min(3, Number(n.tag[1])), align, ctx), css)];
    case "section":
      // encabezado/pie de página ya extraídos por splitDocumentHtml; si llegara alguno, se ignora
      if (n.attrs["data-page-header"] !== undefined || n.attrs["data-page-footer"] !== undefined) return [];
      return blocks(n.children, ctx);
    case "ul": case "ol": return [list(n, ctx)];
    case "blockquote": {
      const parts = blocks(n.children, { ...ctx, plain: true });
      return [{ stack: parts, margin: [INDENT, 0, 0, ctx.apa ? 0 : 8] }];
    }
    case "hr": return [rule()];
    case "table": return [table(n, ctx)];
    case "pre": return [{ text: ansi(textOf(n)), font: "Courier", fontSize: 10, lineHeight: 1.2, preserveLeadingSpaces: true, margin: [0, 0, 0, 8] }];
    case "img": {
      const alt = n.attrs.alt?.trim();
      return [{ text: ansi(`[Imagen${alt ? `: ${alt}` : ""}]`), italics: true, fontSize: 9, color: "#64748b", alignment: "center", margin: [0, 4, 0, 8] }];
    }
    case "div":
      if (n.attrs["data-signature-slot"] !== undefined) return [slot(n, ctx)];
      if (n.attrs["data-letterhead"] !== undefined) return [letterhead(n, ctx)];
      if (n.attrs["data-contact-block"] !== undefined) {
        const lines = blocks(n.children, { ...ctx, plain: true }).map((c) =>
          typeof c === "object" && c !== null && !Array.isArray(c)
            ? { ...(c as ContentText), fontSize: 10, lineHeight: 1.25, leadingIndent: 0, alignment: "left" as const, margin: [0, 0, 0, 0] as [number, number, number, number] }
            : c
        );
        return [{ stack: lines, margin: [0, 6, 0, 0], unbreakable: true }];
      }
      return blocks(n.children, ctx);
    default:
      return blocks(n.children, ctx);
  }
}

function blocks(nodes: HNode[], ctx: Ctx): Content[] {
  const out: Content[] = [];
  let buf: HNode[] = [];
  const flush = () => {
    if (buf.length) { out.push(paragraph(buf, {}, ctx)); buf = []; }
  };
  for (const n of nodes) {
    if (n.tag === "#text" || INLINE.has(n.tag)) {
      if (n.tag === "#text" && !n.text.trim()) continue;
      buf.push(n);
      continue;
    }
    flush();
    out.push(...block(n, ctx));
  }
  flush();
  return out;
}

/* ══ 4. LOGO INSTITUCIONAL: ver src/lib/seal-svg.ts (compartido) ══ */
export { sealSvg };

/* ══ 5. ENCABEZADO, BLOQUE META Y CERTIFICADO ═════════════════════ */
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function longDate(d: Date) { return `${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; }
function fmtDateTime(d: Date | string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeStyle: "medium" }).format(new Date(d));
}

function headerBlock(input: PdfInput, color: string, logo: string | null): Content {
  const { org } = input;
  const meta1 = [org.sigla ? `Sigla: ${org.sigla}` : null, org.nit ? `NIT ${org.nit}` : null, org.entityType === "privada" ? "Entidad privada" : "Entidad pública"].filter(Boolean).join(" · ");
  const meta2 = [org.address, input.city ?? org.city, org.phone, org.website].filter(Boolean).join(" · ");
  const right: Content[] = [];
  if (input.docTypeShort) {
    right.push({
      table: { body: [[{ text: ansi(input.docTypeShort), bold: true, fontSize: 7.5, characterSpacing: 1.2, color: "#0f172a", margin: [4, 2, 4, 2] }]] },
      layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8, hLineColor: () => "#334155", vLineColor: () => "#334155", paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
      margin: [0, 6, 0, 4],
    });
  }
  if (input.docNumber) right.push({ text: `Radicado No. ${ansi(input.docNumber)}`, fontSize: 8, bold: true, color: "#0f172a", alignment: "right" });
  else if (input.draftCode) right.push({ text: `Borrador ${ansi(input.draftCode)}`, fontSize: 8, color: "#475569", alignment: "right" });

  const body: Content[] = [{ text: ansi(org.name).toUpperCase(), bold: true, fontSize: 11.5, color: "#0f172a", margin: [0, 6, 0, 2] }];
  if (meta1) body.push({ text: ansi(meta1), fontSize: 7.5, color: "#475569" });
  if (meta2) body.push({ text: ansi(meta2), fontSize: 7.5, color: "#475569" });

  return {
    stack: [
      {
        columns: [
          logo ? { width: 54, svg: logo, fit: [50, 60] } : { width: 54, text: "" },
          { width: "*", stack: body, margin: [8, 0, 8, 0] },
          { width: "auto", stack: right },
        ],
        columnGap: 4,
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: INNER, y2: 0, lineWidth: 2, lineColor: color }], margin: [0, 8, 0, 14] },
    ],
    font: "Helvetica",
    lineHeight: 1.2,
    alignment: "left",
  };
}

function metaBlock(input: PdfInput): Content {
  // Documentos LEGADOS (sin membrete en el contenido): mismo criterio que el editor,
  // sin "Elaborado por" ni código provisional; solo fecha, destinatario y asunto.
  const L = (t: string, bold = false, center = false): Content => ({
    text: ansi(t), bold, lineHeight: 1.25, alignment: center ? "center" : "left", margin: [0, 0, 0, 0],
  });
  const city = input.city ?? "Bogotá D.C.";
  const d = input.destinatario;
  const out: Content[] = [];
  if (input.docType === "acta" || input.docType === "contrato") {
    out.push(L(input.subject || input.title, true, true));
    out.push(L("\u00a0"));
    return { stack: out, margin: [0, 0, 0, 4] };
  }
  out.push(L(`${city}, ${longDate(input.createdAt)}`));
  out.push(L("\u00a0"));
  if (d) {
    out.push(L(input.docType === "certificacion" ? "Se certifica que" : "Señor(a)"));
    out.push(L(d.name.toUpperCase(), true));
    if (d.cargo) out.push(L(d.cargo));
    if (d.dependencia) out.push(L(d.dependencia));
    if (d.external && d.companyName) out.push(L(d.companyName));
    out.push(L(city));
    out.push(L("\u00a0"));
  }
  if (input.subject) out.push({ text: [{ text: "Asunto: ", bold: true }, { text: ansi(input.subject) }], lineHeight: 1.25, alignment: "left" });
  out.push(L("\u00a0"));
  return { stack: out, margin: [0, 0, 0, 4] };
}

function certificate(input: PdfInput, reference: string, verifyUrl: string): Content {
  const rows: [string, string][] = [
    ["Documento", input.title],
    ["Radicado", reference],
    ["Entidad", input.org.name],
    ["Sello del sobre (SHA-256)", input.sealHash ?? "—"],
    ["Huella pre-firma", input.hashPre ?? "—"],
    ["Huella post-firma", input.hashPost ?? "—"],
    ["Bloqueado en solo lectura", fmtDateTime(input.lockedAt)],
    ["Generado", fmtDateTime(new Date())],
  ];
  const signatures: Content[] = input.stamps.length
    ? input.stamps.map((s, i): Content => ({
        text: [
          { text: `${i + 1}. `, bold: true },
          { text: ansi(s.signerName), bold: true },
          { text: ansi(s.signerCargo ? ` — ${s.signerCargo}` : "") },
          { text: ansi(s.signerCedula ? ` · CC ${s.signerCedula}` : "") },
          { text: `\nFirmado el ${fmtDateTime(s.createdAt)}`, color: "#555555" },
          { text: s.keyFingerprint ? `\nLlave ${ansi(s.keyFingerprint)}` : "", font: "Courier", color: "#555555" },
        ],
        fontSize: 8.5,
        margin: [0, 0, 0, 5],
      }))
    : [{ text: "Sin firmas registradas (borrador).", fontSize: 8.5, color: "#555555" }];

  return {
    pageBreak: "before",
    font: "Helvetica",
    lineHeight: 1.3,
    alignment: "left",
    table: {
      widths: ["*"],
      body: [[{
        margin: [10, 10, 10, 10],
        stack: [
          { text: [{ text: "SIGNUM  ", bold: true, fontSize: 15, color: "#0f766e" }, { text: "CERTIFICADO DE INTEGRIDAD", fontSize: 9, characterSpacing: 2, color: "#0f766e" }] },
          { text: `Este documento fue firmado electrónicamente. Las huellas siguientes permiten comprobar que su contenido no ha sido alterado desde la firma. Verificación pública e independiente en: ${verifyUrl}`, fontSize: 9, margin: [0, 8, 0, 8] },
          {
            table: { widths: [150, "*"], body: rows.map(([k, v]) => [{ text: ansi(k), color: "#555555", fontSize: 8.5 }, { text: ansi(v), font: "Courier", fontSize: 8 }]) },
            layout: "noBorders",
          },
          { text: "Firmas registradas", bold: true, fontSize: 9, margin: [0, 10, 0, 4] },
          ...signatures,
          { text: "Fundamento: Ley 527 de 1999 · Decreto 2364 de 2012 · Ley Modelo CNUDMI sobre Firmas Electrónicas. Cualquier modificación del contenido invalida las huellas aquí consignadas.", fontSize: 7.5, color: "#777777", margin: [0, 8, 0, 0] },
        ],
      }]],
    },
    layout: { hLineWidth: () => 2, vLineWidth: () => 2, hLineColor: () => "#0f766e", vLineColor: () => "#0f766e" },
  };
}

/* ══ 6. DOCUMENTO COMPLETO ═════════════════════════════════════════ */
function buildHeaderFooterBlocks(input: PdfInput, withLogo: boolean) {
  const color = input.org.primaryColor ?? "#0e7490";
  const setup = input.pageSetup ?? DEFAULT_PAGE_SETUP;
  INNER = PAGE.width - (setup.margins.left + setup.margins.right) * CM;
  const cache = new Map<string, string>();
  const logo = (variant?: string | null) => {
    if (!withLogo) return null;
    const key = variant ?? "institucional";
    if (!cache.has(key)) cache.set(key, sealSvg(key, color));
    return cache.get(key) ?? null;
  };
  const reference = input.docNumber ?? `Borrador ${input.draftCode ?? "—"}`;
  const ctx: Ctx = { apa: input.apa, color, stamps: input.stamps, cursor: { i: 0 }, plain: true, logo, code: reference };
  const parts = splitDocumentHtml(input.html);
  const header = parts.header ? blocks(parseHtml(parts.header).children, ctx) : [];
  const footer = parts.footer ? blocks(parseHtml(parts.footer).children, ctx) : [];
  return { header, footer };
}

export function buildDefinition(input: PdfInput, opts: { withLogo: boolean; compress?: boolean; headerHeightPt?: number; footerHeightPt?: number }): TDocumentDefinitions {
  const color = input.org.primaryColor ?? "#0e7490";
  const setup = input.pageSetup ?? DEFAULT_PAGE_SETUP;
  const mL = setup.margins.left * CM, mR = setup.margins.right * CM;
  // El encabezado (membrete) va SOLO en la primera página: el margen superior es el normal y el
  // membrete se imprime como primer bloque del contenido. El pie (si existe) sí se repite.
  const mT = setup.margins.top * CM;
  const mB = Math.max(setup.margins.bottom * CM, setup.footerFromBottom * CM + (opts.footerHeightPt ?? 0) + 22);
  INNER = PAGE.width - mL - mR;
  const headerTop = setup.headerFromTop * CM;
  const footerBottom = setup.footerFromBottom * CM;
  const logoCache = new Map<string, string>();
  const logo = (variant?: string | null) => {
    if (!opts.withLogo) return null;
    const key = variant ?? "institucional";
    if (!logoCache.has(key)) logoCache.set(key, sealSvg(key, color));
    return logoCache.get(key) ?? null;
  };
  const reference = input.docNumber ?? `Borrador ${input.draftCode ?? "—"}`;
  const ctx: Ctx = { apa: input.apa, color, stamps: input.stamps, cursor: { i: 0 }, plain: false, logo, code: reference };
  const parts = splitDocumentHtml(input.html);
  const inline = hasLetterhead(input.html) || parts.header.length > 0;
  const tree = parseHtml(parts.body);
  const body = blocks(tree.children, ctx);
  const headerContent = parts.header ? blocks(parseHtml(parts.header).children, { ...ctx, plain: true }) : [];
  const footerContent = parts.footer ? blocks(parseHtml(parts.footer).children, { ...ctx, plain: true }) : [];
  const overflow = input.stamps.slice(ctx.cursor.i).map((s) => stampBlock(s, null, ctx));

  const verifyUrl = input.verifyUrl;

  return {
    pageSize: "LETTER",
    pageMargins: [mL, mT, mR, mB],
    compress: opts.compress ?? true,
    info: {
      title: input.title,
      author: input.org.name,
      subject: reference,
      keywords: "SIGNUM, firma digital, documento",
      creator: "SIGNUM · Gestión documental y firma digital",
      producer: "SIGNUM",
    },
    // Oficio institucional: Arial/Helvetica 11 pt, interlineado sencillo. APA: Times 12 pt, doble.
    defaultStyle: input.apa
      ? { font: "Times", fontSize: 12, lineHeight: 2, color: "#000000" }
      : { font: "Helvetica", fontSize: 11, lineHeight: 1, color: "#000000" },
    // Número de página APA arriba a la derecha (en todas las páginas); el membrete va en el contenido (solo página 1)
    header: (page) =>
      input.apa
        ? { text: String(page), font: "Times", fontSize: 12, alignment: "right", margin: [mL, headerTop, mR, 0] }
        : { text: "" },
    // PIE repetido en cada página, a footerFromBottom del borde
    footer: (page, count) => ({
      stack: [
        ...(footerContent.length
          ? [{ stack: footerContent, font: "Helvetica", fontSize: 9, lineHeight: 1.15, color: "#374151", margin: [0, 0, 0, 3] as [number, number, number, number] } as Content]
          : []),
        {
          columns: [
            { text: ansi(`SIGNUM · ${reference} · Verificación: ${verifyUrl}`), fontSize: 7, color: "#64748b" },
            { text: `Página ${page} de ${count}`, alignment: "right", fontSize: 7, color: "#64748b", width: 90 },
          ],
          font: "Helvetica",
          lineHeight: 1,
        },
      ],
      margin: [mL, Math.max(0, mB - footerBottom - (footerContent.length ? 30 : 10)), mR, 0],
    }),
    content: [
      // Membrete solo en la primera página (como primer bloque del cuerpo)
      ...(headerContent.length
        ? [{ stack: headerContent, font: "Helvetica", fontSize: 10, lineHeight: 1.15, color: "#374151", margin: [0, Math.min(0, headerTop - mT), 0, 10] } as Content]
        : []),
      ...(inline ? [] : [headerBlock(input, color, logo(input.org.logoVariant)), metaBlock(input)]),
      ...body,
      ...overflow,
      certificate(input, reference, verifyUrl),
    ],
  };
}

export type RenderedPdf = { buffer: Buffer; pages: number; withLogo: boolean };

/**
 * Mide la altura real (pt) de un bloque con el propio motor de pdfmake:
 * se imprime en una página de prueba y se lee la posición del cursor.
 */
async function measureBlock(content: Content[], widthPt: number): Promise<number> {
  if (!content.length) return 0;
  const printer = new PdfPrinter(FONTS);
  return new Promise<number>((resolve) => {
    let height = 0;
    const def: TDocumentDefinitions = {
      pageSize: "LETTER",
      pageMargins: [0, 0, 0, 0],
      defaultStyle: { font: "Helvetica", fontSize: 10, lineHeight: 1.15 },
      content: [
        { stack: content, width: widthPt } as Content,
        { text: "", id: "__end__" } as Content,
      ],
      pageBreakBefore: (node) => {
        if ((node as { id?: string }).id === "__end__") {
          const y = (node as { startPosition?: { top?: number } }).startPosition?.top ?? 0;
          height = y;
        }
        return false;
      },
    };
    const doc = printer.createPdfKitDocument(def);
    doc.on("data", () => undefined);
    doc.on("end", () => resolve(height));
    doc.on("error", () => resolve(0));
    doc.end();
  });
}

async function print(def: TDocumentDefinitions): Promise<Buffer> {
  const printer = new PdfPrinter(FONTS);
  const doc = printer.createPdfKitDocument(def);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

/**
 * Genera el PDF. Si el sello SVG no pudiera dibujarse en algún entorno,
 * se reintenta sin logo para no dejar nunca al usuario sin su documento.
 */
export async function renderDocumentPdf(input: PdfInput, opts: { compress?: boolean } = {}): Promise<RenderedPdf> {
  let withLogo = true;
  let buffer: Buffer;
  const setup = input.pageSetup ?? DEFAULT_PAGE_SETUP;
  const innerW = PAGE.width - (setup.margins.left + setup.margins.right) * CM;
  // 1) Medir encabezado y pie reales para no superponerlos al cuerpo.
  const measure = async (withLogoFlag: boolean) => {
    const probe = buildHeaderFooterBlocks(input, withLogoFlag);
    const [h, f] = await Promise.all([measureBlock(probe.header, innerW), measureBlock(probe.footer, innerW)]);
    return { headerHeightPt: h, footerHeightPt: f };
  };
  let m = { headerHeightPt: 0, footerHeightPt: 0 };
  try {
    m = await measure(true);
  } catch (error) {
    console.warn("[SIGNUM][pdf] No se pudo medir el encabezado; se usa una estimación:", (error as Error).message);
    m = { headerHeightPt: 46, footerHeightPt: 0 };
  }
  try {
    buffer = await print(buildDefinition(input, { withLogo: true, compress: opts.compress, ...m }));
  } catch (error) {
    console.warn("[SIGNUM][pdf] Sello SVG no renderizable, se genera sin logo:", (error as Error).message);
    withLogo = false;
    buffer = await print(buildDefinition(input, { withLogo: false, compress: opts.compress, ...m }));
  }
  const pages = (buffer.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  return { buffer, pages, withLogo };
}
