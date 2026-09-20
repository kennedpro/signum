"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import TiptapImage from "@tiptap/extension-image";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Quote, Minus, Undo2, Redo2, Save, Loader2, Eraser,
  PenSquare, FilePlus2, Printer, Eye, ArrowLeft, Home, Table2, Image as ImageIcon, Link2, Ruler as RulerIcon,
  ZoomIn, ZoomOut, CheckCircle2, ChevronsUpDown, ChevronDown, IndentIncrease, IndentDecrease,
  CalendarDays, Rows3, Columns3, Trash2, TableProperties, Baseline, Pencil, ShieldCheck,
  FileText, LayoutTemplate, BookOpen, AlertCircle, Merge, Maximize2, Type, Grid2X2,
  PanelTop, PanelBottom, X, Settings2,
} from "lucide-react";
import { SignatureSlot } from "@/components/editor/signature-slot";
import { ParagraphLineHeight } from "@/components/editor/line-height";
import { Letterhead, DocCode, ContactBlock } from "@/components/editor/letterhead";
import { hasLetterhead, letterheadBlockHtml, stripLegacyMeta, ensureMetaBlock, ensureContactBlock } from "@/lib/letterhead";
import { ParagraphIndent } from "@/components/editor/indent";
import { Ruler, type RulerIndents } from "@/components/editor/ruler";
import { Pagination, setPaginationOptions } from "@/components/editor/pagination";
import { DEFAULT_PAGE_SETUP, PAGE_CM, joinDocumentHtml, splitDocumentHtml, usableArea, type PageSetup } from "@/lib/page-setup";
import { DownloadPdfButton, type PdfEvidence } from "@/components/download-pdf";
import { DocHeader, type OrgHeader } from "@/components/doc-header";
import { DocMetaBlock, type DocMetaProps } from "@/components/doc-meta-block";
import { DocumentRender } from "@/components/doc-render";
import type { StampData } from "@/components/signature-stamp";
import { cn } from "@/lib/utils";

/* ══ GEOMETRÍA CARTA (la misma del PDF) ═════════════════════════════ */
const PX_PER_CM = 37.7952755906;
const PAGE_H_CM = PAGE_CM.height;
const AUTOSAVE_DELAY_MS = 1500; // autoguardado: 1,5 s después de la última pulsación
const PAGE_GAP_CM = 0.9; // separación visual entre hojas (como el fondo gris de Word)

type Tab = "archivo" | "inicio" | "insertar" | "diseno" | "referencias" | "vista" | "encabezado";

const TABS: { key: Tab; label: string }[] = [
  { key: "archivo", label: "Archivo" },
  { key: "inicio", label: "Inicio" },
  { key: "insertar", label: "Insertar" },
  { key: "diseno", label: "Diseño de página" },
  { key: "referencias", label: "Referencias" },
  { key: "vista", label: "Vista" },
];

const FONTS = ["Times New Roman", "Arial", "Calibri", "Georgia", "Cambria", "Garamond", "Courier New", "Verdana", "Tahoma"];
const SIZES = ["8pt", "9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "36pt"];
const LINE_HEIGHTS: { v: string; label: string }[] = [
  { v: "1", label: "1,0 · Sencillo" },
  { v: "1.15", label: "1,15" },
  { v: "1.5", label: "1,5 líneas" },
  { v: "2", label: "2,0 · Doble (APA)" },
];
const TEXT_COLORS = ["#000000", "#334155", "#7f1d1d", "#b91c1c", "#9a3412", "#a16207", "#15803d", "#0f766e", "#1d4ed8", "#4338ca", "#6d28d9", "#be185d"];
const MARK_COLORS = ["#fef08a", "#bbf7d0", "#bae6fd", "#fecdd3", "#e9d5ff", "#fed7aa"];

/* ── Piezas de la cinta ─────────────────────────────────────────── */
function IconBtn({
  icon: Icon, label, onClick, active, disabled, className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={onClick}
      className={cn("rb-btn", active && "is-active", className)}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function BigBtn({
  icon: Icon, label, onClick, active, disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={onClick}
      className={cn("rb-big", active && "is-active")}
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </button>
  );
}

function Group({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rb-group", className)}>
      <div className="rb-group__body">{children}</div>
      <p className="rb-group__title">{title}</p>
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="rb-rows">{children}</div>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="rb-row">{children}</div>;
}

/* ══ EDITOR ═══════════════════════════════════════════════════════ */
export function WordEditor({
  documentId,
  initialTitle,
  initialContent,
  editable,
  org,
  apa,
  docTypeShort,
  docNumber,
  draftCode = null,
  city,
  expedienteUrl,
  pdf = null,
  meta = null,
  previewStamps = [],
  initialPageSetup = DEFAULT_PAGE_SETUP,
  returnNote = null,
}: {
  documentId: string;
  initialTitle: string;
  initialContent: string;
  editable: boolean;
  org: OrgHeader;
  apa: boolean;
  docTypeShort: string;
  docNumber: string | null;
  draftCode?: string | null;
  city: string | null;
  expedienteUrl: string;
  pdf?: PdfEvidence | null;
  meta?: DocMetaProps | null;
  previewStamps?: StampData[];
  initialPageSetup?: PageSetup;
  /** Observación del firmante si devolvió el documento para corrección. */
  returnNote?: string | null;
}) {
  const code = docNumber ?? (draftCode ? `Borrador ${draftCode}` : docTypeShort);
  /* El HTML almacenado se divide en ENCABEZADO (zona del margen superior,
     se repite en cada página), CUERPO y PIE. Si el documento aún no tiene
     encabezado de página pero trae el membrete en el cuerpo, se migra al
     encabezado la primera vez que se abre (queda guardado al autoguardar). */
  const [initialParts] = useState(() => {
    const parts = splitDocumentHtml(initialContent);
    if (!parts.header) {
      const m = parts.body.match(/<div[^>]*data-letterhead=""[^>]*>[\s\S]*?<\/div>\s*<\/div>/i);
      if (m) {
        parts.header = m[0];
        parts.body = parts.body.replace(m[0], "");
      } else if (editable) {
        parts.header = letterheadBlockHtml(org);
      }
    }
    if (editable) {
      // Documentos de versiones previas: bloque viejo fuera, datos del destinatario y contacto en su sitio,
      // y el código del documento arriba a la derecha del membrete.
      parts.body = stripLegacyMeta(parts.body);
      if (meta) {
        parts.body = ensureMetaBlock(parts.body, {
          docType: meta.docType, city: meta.city, subject: meta.subject, createdAt: meta.createdAt,
          sender: meta.sender, destinatario: meta.destinatario,
        });
      }
      parts.body = ensureContactBlock(parts.body, org);
      if (parts.header && !/data-doc-code/.test(parts.header)) {
        parts.header = parts.header.replace(/<\/div>\s*<\/div>\s*$/, '</div><div class="doc-letterhead__code"><p><span data-doc-code=""></span></p></div></div>');
      }
      parts.footer = ""; // el contacto ya no va en el pie de página
    }
    return parts;
  });
  const inlineLetterhead = hasLetterhead(initialContent) || Boolean(initialParts.header);
  const [pageSetup, setPageSetup] = useState<PageSetup>(initialPageSetup);
  const [zone, setZone] = useState<"body" | "header" | "footer">("body");
  const [setupOpen, setSetupOpen] = useState(false);
  const [indents, setIndents] = useState<RulerIndents>({ first: 0, left: 0, right: 0 });
  const [tab, setTab] = useState<Tab>("inicio");
  const [title, setTitle] = useState(initialTitle);
  const [saved, setSaved] = useState(initialContent);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [zoom, setZoom] = useState(100);
  const [preview, setPreview] = useState(false);
  const [ribbonOpen, setRibbonOpen] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  // Formato base del documento: oficio institucional (Arial 11, sencillo) o APA 7 (Times 12, doble)
  const baseFont = apa ? "Times New Roman" : "Arial";
  const baseSize = apa ? "12pt" : "11pt";
  const baseLine = apa ? "2" : "1";
  const [fontSel, setFontSel] = useState(baseFont);
  const [sizeSel, setSizeSel] = useState(baseSize);
  const [lineSel, setLineSel] = useState(baseLine);
  const [pages, setPages] = useState(1);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerBoxRef = useRef<HTMLDivElement>(null);
  const footerBoxRef = useRef<HTMLDivElement>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      ParagraphLineHeight,
      SignatureSlot,
      Table.configure({ resizable: false, HTMLAttributes: { class: "doc-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      TiptapImage.configure({ inline: false, allowBase64: false }),
      Letterhead.configure({ logoUrl: org.logoUrl ?? null, color: org.primaryColor ?? "#0e7490", code }),
      DocCode.configure({ code }),
      ParagraphIndent,
      ContactBlock,
      Pagination.configure({ enabled: true }),
    ],
    content: initialParts.body,
    editable: editable && !preview,
    editorProps: {
      attributes: {
        class: cn("doc-content focus:outline-none", apa && "doc-apa"),
        spellcheck: "true",
      },
    },
  });

  /* Encabezado y pie de página: editores propios (zona del margen, como en Word). */
  const headerEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle, Color, FontFamily, FontSize, ParagraphLineHeight, ParagraphIndent,
      TiptapImage.configure({ inline: false, allowBase64: false }),
      Letterhead.configure({ logoUrl: org.logoUrl ?? null, color: org.primaryColor ?? "#0e7490", code }),
      DocCode.configure({ code }),
    ],
    content: initialParts.header || "<p></p>",
    editable: false,
    editorProps: { attributes: { class: "doc-content doc-zone doc-zone--header focus:outline-none" } },
  });
  const footerEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle, Color, FontFamily, FontSize, ParagraphLineHeight, ParagraphIndent,
      DocCode.configure({ code }),
    ],
    content: initialParts.footer || "<p></p>",
    editable: false,
    editorProps: { attributes: { class: "doc-content doc-zone doc-zone--footer focus:outline-none" } },
  });

  /* Altura real del encabezado y del pie (cm), medida sobre su CONTENIDO.
     · Estimación inicial generosa (evita que el cuerpo empiece encima antes de pintar).
     · useLayoutEffect: se mide antes del pintado, y se re-mide en cada cambio del
       editor de encabezado/pie y ante cualquier cambio de tamaño del contenido.   */
  const estimate = (frag: string) => {
    if (!frag) return 0;
    const lines = Math.max(1, (frag.match(/<p\b/gi) ?? []).length);
    // 9 pt · 1,2 ≈ 0,40 cm por línea + holgura de ajuste de texto largo; mínimo el alto del logo (1,5 cm)
    return Math.max(1.5, lines * 0.42 + 0.35);
  };
  const [hfHeights, setHfHeights] = useState({ header: estimate(initialParts.header), footer: initialParts.footer ? estimate(initialParts.footer) - 0.9 : 0 });
  const measureHF = useCallback(() => {
    const k = PX_PER_CM * (zoom / 100);
    const inner = (box: HTMLDivElement | null) => {
      if (!box) return 0;
      // contenido real: el ProseMirror (edición) o el render (vista previa)
      const el = box.querySelector<HTMLElement>(".ProseMirror, .doc-content") ?? box;
      return Math.max(el.scrollHeight, el.offsetHeight) / k;
    };
    const h = inner(headerBoxRef.current);
    const f = inner(footerBoxRef.current);
    setHfHeights((cur) => {
      const nh = h > 0.2 ? h : cur.header;
      const nf = footerBoxRef.current ? f : 0;
      return Math.abs(cur.header - nh) > 0.02 || Math.abs(cur.footer - nf) > 0.02 ? { header: nh, footer: nf } : cur;
    });
  }, [zoom]);
  useLayoutEffect(() => {
    measureHF();
    const t1 = window.setTimeout(measureHF, 60);
    const t2 = window.setTimeout(measureHF, 300);
    const ro = new ResizeObserver(measureHF);
    for (const box of [headerBoxRef.current, footerBoxRef.current]) {
      if (!box) continue;
      ro.observe(box);
      const el = box.querySelector<HTMLElement>(".ProseMirror, .doc-content");
      if (el) ro.observe(el);
    }
    return () => { ro.disconnect(); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [measureHF, preview, zone, headerEditor, footerEditor]);
  useEffect(() => {
    if (!headerEditor || !footerEditor) return;
    headerEditor.on("update", measureHF);
    footerEditor.on("update", measureHF);
    return () => { headerEditor.off("update", measureHF); footerEditor.off("update", measureHF); };
  }, [headerEditor, footerEditor, measureHF]);

  /* Solo la zona activa es editable (modo "Encabezado y pie de página" de Word). */
  useEffect(() => {
    const on = editable && !preview;
    editor?.setEditable(on && zone === "body");
    headerEditor?.setEditable(on && zone === "header");
    footerEditor?.setEditable(on && zone === "footer");
    const target = zone === "header" ? headerEditor : zone === "footer" ? footerEditor : editor;
    if (on && target && !target.isFocused) target.commands.focus("end");
  }, [editor, headerEditor, footerEditor, editable, preview, zone]);

  /* El editor activo recibe los comandos de la cinta. */
  const active = zone === "header" ? headerEditor : zone === "footer" ? footerEditor : editor;
  useEffect(() => {
    setTab((t) => (zone !== "body" ? "encabezado" : t === "encabezado" ? "inicio" : t));
    setRibbonOpen(true);
  }, [zone]);

  /* Re-render en cada transacción + sincroniza los selectores con el cursor */
  useEffect(() => {
    const ed = active;
    if (!ed) return;
    const fn = () => {
      force();
      const block = ed.isActive("heading") ? ed.getAttributes("heading") : ed.getAttributes("paragraph");
      setIndents({
        first: typeof block.indentFirst === "number" ? block.indentFirst : 0,
        left: typeof block.indentLeft === "number" ? block.indentLeft : 0,
        right: typeof block.indentRight === "number" ? block.indentRight : 0,
      });
      const ts = ed.getAttributes("textStyle");
      const family = typeof ts.fontFamily === "string" ? ts.fontFamily.replace(/["']/g, "").split(",")[0].trim() : "";
      setFontSel(FONTS.includes(family) ? family : baseFont);
      const size = typeof ts.fontSize === "string" ? ts.fontSize.trim() : "";
      setSizeSel(SIZES.includes(size) ? size : baseSize);
      const lh = typeof block.lineHeight === "string" ? block.lineHeight : "";
      setLineSel(lh || baseLine);
    };
    ed.on("transaction", fn);
    ed.on("selectionUpdate", fn);
    fn();
    return () => { ed.off("transaction", fn); ed.off("selectionUpdate", fn); };
  }, [active, baseFont, baseSize, baseLine]);

  /* Paginación real: mide el contenido de la hoja y calcula cuántas páginas
     carta ocupa (22,86 cm útiles por página, igual que el PDF). */
  // Margen efectivo (Word): el cuerpo nunca se superpone al encabezado/pie.
  const effTop = Math.max(pageSetup.margins.top, pageSetup.headerFromTop + hfHeights.header + 0.25);
  const effBottom = Math.max(pageSetup.margins.bottom, pageSetup.footerFromBottom + hfHeights.footer + 0.25);
  const effSetup: PageSetup = { ...pageSetup, margins: { ...pageSetup.margins, top: effTop, bottom: effBottom } };
  const usable = usableArea(effSetup);
  // Entre dos páginas hay: margen inferior de la anterior + hueco + margen superior NORMAL de la
  // siguiente (el encabezado solo va en la primera página).
  const gapCm = effBottom + PAGE_GAP_CM + pageSetup.margins.top;
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => {
      // Factor real píxel/cm medido sobre la hoja (el sheet está dentro del scale(),
      // offsetWidth/Height no incluyen el zoom).
      const paperEl = el.closest(".wd-paper") as HTMLElement | null;
      const k = paperEl && paperEl.offsetWidth > 100 ? paperEl.offsetWidth / PAGE_CM.width : PX_PER_CM;
      const breaks = el.querySelectorAll(".pm-page-start").length;

      // Conteo EXACTO por posiciones renderizadas: se localiza el borde inferior
      // del último bloque con contenido (se ignoran párrafos vacíos finales, que
      // son solo la marca del cursor y no deben crear hojas en blanco).
      const nextUsable = PAGE_H_CM - pageSetup.margins.top - effBottom;
      const bound = (p: number) =>
        p === 0 ? usable.height : usable.height + p * nextUsable + p * gapCm;
      const pmEl = el.querySelector(".ProseMirror") ?? el;
      const children = Array.from(pmEl.children) as HTMLElement[];
      let last = children.length - 1;
      while (last >= 0) {
        const c = children[last];
        const hasContent =
          c.textContent?.trim() ||
          c.querySelector("img,table,div[data-signature-slot],.sig-ghost,.doc-contact,.doc-letterhead");
        if (hasContent) break;
        last -= 1;
      }
      let p = Math.max(0, breaks);
      let lastBottom = 0;
      if (last >= 0) {
        lastBottom =
          children[last].offsetTop +
          children[last].offsetHeight +
          (parseFloat(getComputedStyle(children[last]).marginBottom) || 0);
        while (lastBottom > bound(p) * k + 2) p += 1;
      }
      // Histéresis: solo se reduce el número de páginas si sobra holgura clara (≈ 0,5 cm);
      // así la hoja no alterna entre N y N+1 páginas por ruido de medición.
      setPages((prev) => {
        const next = p + 1;
        if (next >= prev || last < 0) return next;
        const slack = bound(next - 1) * k - lastBottom;
        return slack > 0.5 * k ? next : prev;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ["class", "style"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [preview, usable.height, gapCm, zoom]);

  useEffect(() => {
    if (!msg) return;
    const t = window.setTimeout(() => setMsg(null), 3200);
    return () => window.clearTimeout(t);
  }, [msg]);

  const text = editor?.getText() ?? "";
  const words = text.split(/\s+/).filter(Boolean).length;
  const chars = text.replace(/\s/g, "").length;
  const bodyHtml = editor?.getHTML() ?? "";
  const headerHtml = headerEditor?.getHTML() ?? "";
  const footerHtml = footerEditor?.getHTML() ?? "";
  const emptyZone = (h: string) => !h || h === "<p></p>";
  const html = joinDocumentHtml({
    header: emptyZone(headerHtml) ? "" : headerHtml,
    body: bodyHtml,
    footer: emptyZone(footerHtml) ? "" : footerHtml,
  });
  const pageSetupJson = JSON.stringify(pageSetup);
  const [savedSetup, setSavedSetup] = useState(JSON.stringify(initialPageSetup));
  const dirty = html !== saved || title !== savedTitle || pageSetupJson !== savedSetup;
  const slots = (bodyHtml.match(/data-signature-slot/g) ?? []).length;

  /* ── Guardado (manual y automático) ──────────────────────────
     El editor renderiza cada cambio al instante en el navegador; el
     servidor solo recibe, con debounce, el HTML completo saneado. Se envía
     el documento íntegro (no parches) porque la huella SHA-256 que se
     firma se calcula sobre el contenido completo persistido.             */
  const latestRef = useRef({ title: initialTitle, html: initialContent, saved: initialContent, savedTitle: initialTitle, setup: JSON.stringify(initialPageSetup), savedSetup: JSON.stringify(initialPageSetup) });
  const seqRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | null>(null);
  latestRef.current.title = title;
  latestRef.current.saved = saved;
  latestRef.current.savedTitle = savedTitle;
  latestRef.current.html = html;
  latestRef.current.setup = pageSetupJson;
  latestRef.current.savedSetup = savedSetup;

  const persist = useCallback(
    async (mode: "auto" | "manual", opts: { keepalive?: boolean } = {}) => {
      if (!editable) return;
      const snapshot = latestRef.current;
      const payloadTitle = snapshot.title.trim() || meta?.code || "Documento";
      const payloadHtml = snapshot.html;
      const payloadSetup = snapshot.setup;
      if (payloadHtml === snapshot.saved && payloadTitle === snapshot.savedTitle && payloadSetup === snapshot.savedSetup) return;
      const seq = ++seqRef.current;
      setSaving(true);
      setSaveError(null);
      try {
        const res = await fetch(`/api/documentos/${documentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: payloadTitle, content: payloadHtml, pageSetup: JSON.parse(payloadSetup), mode }),
          keepalive: opts.keepalive ?? false,
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; savedAt?: string };
        if (!res.ok) throw new Error(data.error ?? "Error al guardar");
        // Ignora respuestas que llegan después de un guardado más reciente.
        if (seq !== seqRef.current) return;
        setSaved(payloadHtml);
        setSavedTitle(payloadTitle);
        setSavedSetup(payloadSetup);
        setSavedAt(data.savedAt ? new Date(data.savedAt) : new Date());
        if (mode === "manual") setMsg({ text: "Cambios guardados", ok: true });
        try { new BroadcastChannel("signum-doc").postMessage({ id: documentId, saved: true }); } catch {}
      } catch (err) {
        if (seq !== seqRef.current) return;
        const text = err instanceof Error ? err.message : "No se pudo guardar";
        setSaveError(text);
        if (mode === "manual") setMsg({ text, ok: false });
      } finally {
        if (seq === seqRef.current) setSaving(false);
      }
    },
    [documentId, editable, meta?.code]
  );

  const save = useCallback(async () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (inFlightRef.current) await inFlightRef.current.catch(() => undefined);
    inFlightRef.current = persist("manual");
    await inFlightRef.current;
    inFlightRef.current = null;
  }, [persist]);

  /* Autoguardado con debounce: se reprograma en cada cambio. */
  useEffect(() => {
    if (!editable || preview || !dirty) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      inFlightRef.current = persist("auto").finally(() => { inFlightRef.current = null; });
    }, AUTOSAVE_DELAY_MS);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [html, title, dirty, editable, preview, persist]);

  /* Al ocultar o cerrar la pestaña: guardado inmediato con keepalive. */
  useEffect(() => {
    if (!editable) return;
    const flush = () => {
      if (document.visibilityState !== "hidden") return;
      if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
      void persist("auto", { keepalive: true });
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [editable, persist]);

  useEffect(() => {
    const h = (ev: BeforeUnloadEvent) => { if (dirty && saveError) { ev.preventDefault(); ev.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, saveError]);

  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") { ev.preventDefault(); void save(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [save]);

  /* ── Volver: guarda pendientes, avisa al expediente y cierra la pestaña ── */
  const goBack = useCallback(async () => {
    if (editable && dirty) {
      try { await save(); } catch { /* el aviso de error queda en pantalla */ }
    }
    try { new BroadcastChannel("signum-doc").postMessage({ id: documentId, saved: true, closed: true }); } catch {}
    // Si esta pestaña la abrió el expediente (window.open), se cierra y el usuario vuelve a donde estaba.
    if (window.opener && !window.opener.closed) {
      try { window.opener.focus(); } catch {}
      window.close();
      return;
    }
    if (window.history.length > 1 && document.referrer.includes("/documentos/")) {
      window.history.back();
      return;
    }
    window.location.href = expedienteUrl;
  }, [editable, dirty, save, documentId, expedienteUrl]);

  /* ── Acciones de inserción ─────────────────────────────────────── */
  function insertSlot() {
    if (!editor) return;
    const label = window.prompt("Rótulo bajo la firma:", "FIRMA AUTORIZADA");
    if (label === null) return;
    editor.chain().focus().insertContent({
      type: "signatureSlot",
      attrs: { slot: slots + 1, label: label.trim().toUpperCase() || "FIRMA AUTORIZADA" },
    }).run();
  }

  function insertTable(rows: number, cols: number) {
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }

  function insertDate() {
    const d = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
    editor?.chain().focus().insertContent(`${city ?? "Bogotá D.C."}, ${d}`).run();
  }

  function insertImage() {
    const url = window.prompt("Dirección https de la imagen:");
    if (url && /^https:\/\/[^\s"'<>]+$/i.test(url)) editor?.chain().focus().setImage({ src: url, alt: "" }).run();
  }

  function setLink() {
    if (!editor) return;
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Dirección https del enlace (vacío para quitar):", prev);
    if (url === null) return;
    if (!url.trim()) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) { setMsg({ text: "Solo se admiten enlaces https", ok: false }); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  function stepSize(delta: number) {
    const idx = Math.max(0, SIZES.indexOf(sizeSel));
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, idx + delta))];
    setSizeSel(next);
    editor?.chain().focus().setFontSize(next).run();
  }

  const e = active;
  const can = (fn: () => boolean) => (e ? fn() : false);
  const locked = !editable || preview;
  const inTable = !!e?.isActive("table");
  const savedLabel = savedAt
    ? `Guardado ${savedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
    : "Guardado";
  const status = saving ? "Guardando…" : saveError ? "Error al guardar" : dirty ? "Escribiendo…" : savedLabel;
  const guides = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 1);
  useEffect(() => {
    if (!editor) return;
    setPaginationOptions(editor, {
      usableCm: usable.height,
      usableNextCm: PAGE_H_CM - pageSetup.margins.top - effBottom,
      gapCm,
      // pxPerCm se mide desde la hoja real (offsetWidth / 21,59 cm); solo se informa el zoom.
      scale: zoom / 100,
      enabled: !preview,
    });
  }, [editor, usable.height, gapCm, zoom, preview]);

  return (
    <div className="wd-shell">
      {/* ══ Barra de título (identidad SIGNUM) ══ */}
      <header className="wd-titlebar">
        <a href="/" className="wd-brand" title="Ir a la consola">
          <span className="wd-brand__mark">S</span>
          <span className="wd-brand__type">SIGNUM<small>EDITOR</small></span>
        </a>
        <span className="wd-titlebar__sep" />
        <div className="wd-doc">
          <FileText className="h-4 w-4 shrink-0 text-cyan-300/80" />
          <input
            value={title}
            disabled={!editable}
            onChange={(ev) => setTitle(ev.target.value)}
            aria-label="Título del documento"
            className="wd-doc__title"
            placeholder="Título del documento"
          />
          <span
            className={cn("wd-status", saving ? "is-saving" : saveError ? "is-error" : dirty ? "is-dirty" : "is-saved")}
            title={saveError ?? (editable ? "Autoguardado activo: los cambios se guardan solos al dejar de escribir" : undefined)}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : saveError ? <AlertCircle className="h-3 w-3" /> : dirty ? <Pencil className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {status}
          </span>
          {!editable && (
            <span className="wd-lock"><ShieldCheck className="h-3 w-3" /> Solo lectura</span>
          )}
        </div>
        <div className="wd-actions">
          {msg && (
            <span className={cn("wd-toast", msg.ok ? "is-ok" : "is-err")}>
              {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {msg.text}
            </span>
          )}
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className={cn("wd-action", preview && "is-on")}
            title={preview ? "Volver a la edición" : "Ver el documento tal como se firmará"}
          >
            {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {preview ? "Editar" : "Vista previa"}
          </button>
          {pdf && <DownloadPdfButton evidence={pdf} className="wd-action" label="PDF" />}
          <button
            type="button"
            onClick={save}
            disabled={locked || saving || !dirty}
            className="wd-action wd-action--primary"
            title="Guardar (Ctrl+S)"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
          <button type="button" onClick={() => void goBack()} className="wd-action wd-action--ghost" title="Guardar y volver al documento">
            <ArrowLeft className="h-4 w-4" /> Volver
          </button>
        </div>
      </header>

      {/* ══ Cinta de opciones ══ */}
      <div className="wd-ribbon-wrap">
        <div className="wd-tabs">
          {[...TABS, ...(zone !== "body" ? [{ key: "encabezado" as Tab, label: "Encabezado y pie de página" }] : [])].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTab(t.key); setRibbonOpen(true); }}
              className={cn("wd-tab", tab === t.key && ribbonOpen && "is-active", t.key === "encabezado" && "is-contextual")}
            >
              {t.label}
            </button>
          ))}
          <span className="wd-tabs__info">
            {pages} pág. · {words} palabras · {slots} firma(s)
          </span>
          <button
            type="button"
            onClick={() => setRibbonOpen((v) => !v)}
            title={ribbonOpen ? "Contraer la cinta" : "Expandir la cinta"}
            aria-pressed={ribbonOpen}
            className="wd-tabs__toggle"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {ribbonOpen ? "Contraer" : "Cinta"}
          </button>
        </div>

        {ribbonOpen && (
          <div className="wd-ribbon">
            {tab === "archivo" && (
              <>
                <Group title="Documento">
                  <BigBtn icon={FilePlus2} label="Nuevo" onClick={() => window.open("/documentos/nuevo", "_blank")} />
                  <BigBtn icon={Save} label="Guardar" onClick={save} disabled={locked || !dirty} />
                  <BigBtn icon={Printer} label="Imprimir" onClick={() => window.print()} />
                  <BigBtn icon={Eye} label="Vista previa" active={preview} onClick={() => setPreview((v) => !v)} />
                </Group>
                <Group title="Navegación">
                  <BigBtn icon={ArrowLeft} label="Volver" onClick={() => void goBack()} />
                  <BigBtn icon={Settings2} label="Configuración previa" disabled={!editable} onClick={() => { window.location.href = `/documentos/${documentId}/editar-config`; }} />
                  <BigBtn icon={Home} label="Consola" onClick={() => { window.location.href = "/"; }} />
                </Group>
                <Group title="Información" className="rb-group--wide">
                  <dl className="rb-info">
                    <div><dt>Tipo</dt><dd>{docTypeShort}</dd></div>
                    <div><dt>Código</dt><dd>{docNumber ? `Radicado ${docNumber}` : draftCode ? `Borrador ${draftCode}` : "sin código"}</dd></div>
                    <div><dt>Entidad</dt><dd className="truncate">{org.name}</dd></div>
                    <div><dt>Estado</dt><dd>{editable ? "Borrador editable" : "Cerrado · solo lectura"}</dd></div>
                  </dl>
                </Group>
              </>
            )}

            {tab === "inicio" && (
              <>
                <Group title="Deshacer">
                  <Rows>
                    <Row><IconBtn icon={Undo2} label="Deshacer (Ctrl+Z)" disabled={locked || !can(() => e!.can().undo())} onClick={() => e?.chain().focus().undo().run()} /></Row>
                    <Row><IconBtn icon={Redo2} label="Rehacer (Ctrl+Y)" disabled={locked || !can(() => e!.can().redo())} onClick={() => e?.chain().focus().redo().run()} /></Row>
                  </Rows>
                </Group>

                <Group title="Fuente">
                  <Rows>
                    <Row>
                      <select
                        value={fontSel}
                        disabled={locked}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        onChange={(ev) => { setFontSel(ev.target.value); e?.chain().focus().setFontFamily(ev.target.value).run(); }}
                        className="rb-select w-[150px]"
                        aria-label="Fuente"
                        style={{ fontFamily: fontSel }}
                      >
                        {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                      </select>
                      <select
                        value={sizeSel}
                        disabled={locked}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        onChange={(ev) => { setSizeSel(ev.target.value); e?.chain().focus().setFontSize(ev.target.value).run(); }}
                        className="rb-select w-[64px]"
                        aria-label="Tamaño"
                      >
                        {SIZES.map((s) => <option key={s} value={s}>{s.replace("pt", "")}</option>)}
                      </select>
                      <IconBtn icon={ZoomIn} label="Aumentar tamaño" disabled={locked} onClick={() => stepSize(1)} />
                      <IconBtn icon={ZoomOut} label="Reducir tamaño" disabled={locked} onClick={() => stepSize(-1)} />
                      <IconBtn icon={Eraser} label="Borrar formato" disabled={locked} onClick={() => e?.chain().focus().unsetAllMarks().clearNodes().run()} />
                    </Row>
                    <Row>
                      <IconBtn icon={Bold} label="Negrita (Ctrl+B)" active={!!e?.isActive("bold")} disabled={locked} onClick={() => e?.chain().focus().toggleBold().run()} />
                      <IconBtn icon={Italic} label="Cursiva (Ctrl+I)" active={!!e?.isActive("italic")} disabled={locked} onClick={() => e?.chain().focus().toggleItalic().run()} />
                      <IconBtn icon={UnderlineIcon} label="Subrayado (Ctrl+U)" active={!!e?.isActive("underline")} disabled={locked} onClick={() => e?.chain().focus().toggleUnderline().run()} />
                      <IconBtn icon={Strikethrough} label="Tachado" active={!!e?.isActive("strike")} disabled={locked} onClick={() => e?.chain().focus().toggleStrike().run()} />
                      <span className="rb-vsep" />
                      <label className="rb-color" title="Color de fuente">
                        <Type className="h-4 w-4" />
                        <i style={{ background: (e?.getAttributes("textStyle").color as string) || "#000" }} />
                        <input type="color" disabled={locked} onChange={(ev) => e?.chain().focus().setColor(ev.target.value).run()} />
                      </label>
                      <div className="rb-swatches">
                        {TEXT_COLORS.map((c) => (
                          <button key={c} type="button" disabled={locked} title={`Color ${c}`} style={{ background: c }}
                            onMouseDown={(ev) => ev.preventDefault()} onClick={() => e?.chain().focus().setColor(c).run()} />
                        ))}
                      </div>
                      <label className="rb-color" title="Color de resaltado">
                        <Highlighter className="h-4 w-4" />
                        <i style={{ background: (e?.getAttributes("highlight").color as string) || "#fef08a" }} />
                        <input type="color" disabled={locked} onChange={(ev) => e?.chain().focus().toggleHighlight({ color: ev.target.value }).run()} />
                      </label>
                      <div className="rb-swatches rb-swatches--marks">
                        {MARK_COLORS.map((c) => (
                          <button key={c} type="button" disabled={locked} title={`Resaltar ${c}`} style={{ background: c }}
                            onMouseDown={(ev) => ev.preventDefault()} onClick={() => e?.chain().focus().toggleHighlight({ color: c }).run()} />
                        ))}
                      </div>
                    </Row>
                  </Rows>
                </Group>

                <Group title="Párrafo">
                  <Rows>
                    <Row>
                      <IconBtn icon={List} label="Viñetas" active={!!e?.isActive("bulletList")} disabled={locked} onClick={() => e?.chain().focus().toggleBulletList().run()} />
                      <IconBtn icon={ListOrdered} label="Numeración" active={!!e?.isActive("orderedList")} disabled={locked} onClick={() => e?.chain().focus().toggleOrderedList().run()} />
                      <IconBtn icon={IndentDecrease} label="Disminuir nivel" disabled={locked || !can(() => e!.can().liftListItem("listItem"))} onClick={() => e?.chain().focus().liftListItem("listItem").run()} />
                      <IconBtn icon={IndentIncrease} label="Aumentar nivel" disabled={locked || !can(() => e!.can().sinkListItem("listItem"))} onClick={() => e?.chain().focus().sinkListItem("listItem").run()} />
                      <span className="rb-vsep" />
                      <label className="rb-inline" title="Interlineado">
                        <Baseline className="h-4 w-4" />
                        <select
                          value={lineSel}
                          disabled={locked}
                          onMouseDown={(ev) => ev.stopPropagation()}
                          onChange={(ev) => { setLineSel(ev.target.value); e?.chain().focus().setParagraphLineHeight(ev.target.value).run(); }}
                          className="rb-select w-[128px]"
                          aria-label="Interlineado"
                        >
                          {LINE_HEIGHTS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
                        </select>
                      </label>
                    </Row>
                    <Row>
                      <IconBtn icon={AlignLeft} label="Alinear a la izquierda" active={!!e?.isActive({ textAlign: "left" })} disabled={locked} onClick={() => e?.chain().focus().setTextAlign("left").run()} />
                      <IconBtn icon={AlignCenter} label="Centrar" active={!!e?.isActive({ textAlign: "center" })} disabled={locked} onClick={() => e?.chain().focus().setTextAlign("center").run()} />
                      <IconBtn icon={AlignRight} label="Alinear a la derecha" active={!!e?.isActive({ textAlign: "right" })} disabled={locked} onClick={() => e?.chain().focus().setTextAlign("right").run()} />
                      <IconBtn icon={AlignJustify} label="Justificar" active={!!e?.isActive({ textAlign: "justify" })} disabled={locked} onClick={() => e?.chain().focus().setTextAlign("justify").run()} />
                      <span className="rb-vsep" />
                      <IconBtn icon={Quote} label="Cita en bloque" active={!!e?.isActive("blockquote")} disabled={locked} onClick={() => e?.chain().focus().toggleBlockquote().run()} />
                      <IconBtn icon={Minus} label="Línea separadora" disabled={locked} onClick={() => e?.chain().focus().setHorizontalRule().run()} />
                      <IconBtn icon={Link2} label="Enlace" active={!!e?.isActive("link")} disabled={locked} onClick={setLink} />
                    </Row>
                  </Rows>
                </Group>

                <Group title="Estilos">
                  <div className="rb-styles">
                    {[
                      { key: "p", label: "Normal", cls: "st-normal", active: !!e?.isActive("paragraph") && !e?.isActive("blockquote"), run: () => e?.chain().focus().setParagraph().run() },
                      { key: "h1", label: "Título 1", cls: "st-h1", active: !!e?.isActive("heading", { level: 1 }), run: () => e?.chain().focus().toggleHeading({ level: 1 }).run() },
                      { key: "h2", label: "Título 2", cls: "st-h2", active: !!e?.isActive("heading", { level: 2 }), run: () => e?.chain().focus().toggleHeading({ level: 2 }).run() },
                      { key: "h3", label: "Título 3", cls: "st-h3", active: !!e?.isActive("heading", { level: 3 }), run: () => e?.chain().focus().toggleHeading({ level: 3 }).run() },
                      { key: "q", label: "Cita", cls: "st-quote", active: !!e?.isActive("blockquote"), run: () => e?.chain().focus().toggleBlockquote().run() },
                    ].map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        disabled={locked}
                        onMouseDown={(ev) => ev.preventDefault()}
                        onClick={s.run}
                        className={cn("st-card", s.active && "is-active")}
                        title={s.label}
                      >
                        <span className={s.cls}>AaBb</span>
                        <small>{s.label}</small>
                      </button>
                    ))}
                  </div>
                </Group>
              </>
            )}

            {tab === "insertar" && (
              <>
                <Group title="Firma digital">
                  <BigBtn icon={PenSquare} label="Espacio de firma" disabled={locked} onClick={insertSlot} />
                </Group>
                <Group title="Tablas">
                  <div className="flex items-start gap-1">
                    <BigBtn icon={Table2} label="Tabla 3×3" disabled={locked} onClick={() => insertTable(3, 3)} />
                    <BigBtn icon={Grid2X2} label="Tabla 4×2" disabled={locked} onClick={() => insertTable(4, 2)} />
                    {inTable && (
                      <Rows>
                        <Row>
                          <IconBtn icon={Rows3} label="Insertar fila debajo" disabled={locked} onClick={() => e?.chain().focus().addRowAfter().run()} />
                          <IconBtn icon={Columns3} label="Insertar columna a la derecha" disabled={locked} onClick={() => e?.chain().focus().addColumnAfter().run()} />
                          <IconBtn icon={TableProperties} label="Fila de encabezado" disabled={locked} onClick={() => e?.chain().focus().toggleHeaderRow().run()} />
                          <IconBtn icon={Merge} label="Combinar / dividir celdas" disabled={locked} onClick={() => e?.chain().focus().mergeOrSplit().run()} />
                        </Row>
                        <Row>
                          <IconBtn icon={Trash2} label="Eliminar fila" disabled={locked} onClick={() => e?.chain().focus().deleteRow().run()} />
                          <IconBtn icon={Trash2} label="Eliminar columna" disabled={locked} onClick={() => e?.chain().focus().deleteColumn().run()} className="rb-btn--danger" />
                          <IconBtn icon={Trash2} label="Eliminar tabla" disabled={locked} onClick={() => e?.chain().focus().deleteTable().run()} className="rb-btn--danger" />
                        </Row>
                      </Rows>
                    )}
                  </div>
                </Group>
                <Group title="Encabezado y pie">
                  <BigBtn icon={PanelTop} label="Encabezado" disabled={locked} onClick={() => setZone("header")} />
                  <BigBtn icon={PanelBottom} label="Pie de página" disabled={locked} onClick={() => setZone("footer")} />
                </Group>
                <Group title="Elementos">
                  <BigBtn icon={ImageIcon} label="Imagen" disabled={locked} onClick={insertImage} />
                  <BigBtn icon={CalendarDays} label="Fecha y lugar" disabled={locked} onClick={insertDate} />
                  <BigBtn icon={Minus} label="Separador" disabled={locked} onClick={() => e?.chain().focus().setHorizontalRule().run()} />
                  <BigBtn icon={Link2} label="Enlace" active={!!e?.isActive("link")} disabled={locked} onClick={setLink} />
                </Group>
              </>
            )}

            {tab === "diseno" && (
              <>
                <Group title="Configurar página">
                  <BigBtn icon={Settings2} label="Márgenes" disabled={locked} onClick={() => setSetupOpen(true)} />
                  <BigBtn icon={PanelTop} label="Encabezado" disabled={locked} onClick={() => setZone("header")} />
                  <BigBtn icon={PanelBottom} label="Pie de página" disabled={locked} onClick={() => setZone("footer")} />
                </Group>
                <Group title="Página actual" className="rb-group--wide">
                  <dl className="rb-info rb-info--3">
                    <div><dt>Tamaño</dt><dd>Carta · 21,59 × 27,94 cm</dd></div>
                    <div><dt>Orientación</dt><dd>Vertical</dd></div>
                    <div><dt>Márgenes</dt><dd>{pageSetup.margins.top.toFixed(2).replace(".", ",")} / {pageSetup.margins.right.toFixed(2).replace(".", ",")} / {pageSetup.margins.bottom.toFixed(2).replace(".", ",")} / {pageSetup.margins.left.toFixed(2).replace(".", ",")} cm</dd></div>
                    <div><dt>Fuente base</dt><dd>{apa ? "Times New Roman 12 pt" : "Arial 11 pt"}</dd></div>
                    <div><dt>Interlineado</dt><dd>{apa ? "Doble (APA 7.ª ed.)" : "Sencillo (1,0)"}</dd></div>
                    <div><dt>Formato</dt><dd>{apa ? "Normas APA 7.ª edición" : "Institucional"}</dd></div>
                  </dl>
                </Group>
                <Group title="Interlineado del documento">
                  <Rows>
                    <Row>
                      {LINE_HEIGHTS.map((l) => (
                        <button
                          key={l.v}
                          type="button"
                          disabled={locked}
                          onMouseDown={(ev) => ev.preventDefault()}
                          onClick={() => { if (!e) return; const { from, to } = e.state.selection; setLineSel(l.v); e.chain().focus().selectAll().setParagraphLineHeight(l.v).setTextSelection({ from, to }).run(); }}
                          className={cn("rb-chip", lineSel === l.v && "is-active")}
                        >
                          {l.v.replace(".", ",")}
                        </button>
                      ))}
                    </Row>
                    <Row><span className="rb-hint">Se aplica a todo el texto. APA exige 2,0.</span></Row>
                  </Rows>
                </Group>
                <Group title="Mostrar">
                  <BigBtn icon={RulerIcon} label="Regla" active={showRuler} onClick={() => setShowRuler((v) => !v)} />
                  <BigBtn icon={LayoutTemplate} label="Saltos de página" active={showGuides} onClick={() => setShowGuides((v) => !v)} />
                </Group>
              </>
            )}

            {tab === "referencias" && (
              <>
                <Group title="Citas APA 7">
                  <BigBtn icon={Quote} label="Cita (Autor, año)" disabled={locked} onClick={() => e?.chain().focus().insertContent("(Apellido, 2024, p. 15)").run()} />
                  <BigBtn icon={BookOpen} label="Cita narrativa" disabled={locked} onClick={() => e?.chain().focus().insertContent("Apellido (2024) afirma que ").run()} />
                </Group>
                <Group title="Lista de referencias">
                  <BigBtn icon={List} label="Referencia" disabled={locked} onClick={() =>
                    e?.chain().focus().insertContent('<p class="apa-ref">Apellido, A. A. (2024). <em>Título de la obra</em>. Editorial. https://doi.org/xx.xxxx</p>').run()} />
                  <BigBtn icon={FileText} label="Título «Referencias»" disabled={locked} onClick={() => e?.chain().focus().insertContent("<h2>Referencias</h2>").run()} />
                </Group>
                <Group title="Guía" className="rb-group--wide">
                  <p className="rb-hint max-w-[360px]">
                    Sangría francesa automática en cada referencia (clase <code>apa-ref</code>), orden alfabético por
                    apellido, interlineado doble y títulos de nivel según APA 7.ª edición.
                  </p>
                </Group>
              </>
            )}

            {tab === "encabezado" && (
              <>
                <Group title="Encabezado y pie de página">
                  <BigBtn icon={PanelTop} label="Encabezado" active={zone === "header"} onClick={() => setZone("header")} />
                  <BigBtn icon={PanelBottom} label="Pie de página" active={zone === "footer"} onClick={() => setZone("footer")} />
                </Group>
                <Group title="Insertar">
                  <BigBtn icon={ImageIcon} label="Logo / imagen" disabled={locked} onClick={insertImage} />
                  <BigBtn icon={CalendarDays} label="Fecha" disabled={locked} onClick={insertDate} />
                  <BigBtn icon={FileText} label="Código del documento" disabled={locked} onClick={() => e?.chain().focus().insertContent({ type: "docCode" }).run()} />
                  <BigBtn icon={LayoutTemplate} label="Membrete institucional" disabled={locked || zone !== "header"} onClick={() => headerEditor?.chain().focus().insertContent(letterheadBlockHtml(org)).run()} />
                </Group>
                <Group title="Posición" className="rb-group--wide">
                  <Rows>
                    <Row>
                      <label className="rb-inline" title="Distancia del encabezado al borde superior">
                        <PanelTop className="h-4 w-4" /> Encabezado desde arriba
                        <input type="number" step="0.1" min="0.3" max="5" className="rb-select w-[70px]" value={pageSetup.headerFromTop}
                          onChange={(ev) => setPageSetup((ps) => ({ ...ps, headerFromTop: Math.min(ps.margins.top - 0.2, Math.max(0.3, Number(ev.target.value) || 0.3)) }))} /> cm
                      </label>
                    </Row>
                    <Row>
                      <label className="rb-inline" title="Distancia del pie al borde inferior">
                        <PanelBottom className="h-4 w-4" /> Pie de página desde abajo
                        <input type="number" step="0.1" min="0.3" max="5" className="rb-select w-[70px]" value={pageSetup.footerFromBottom}
                          onChange={(ev) => setPageSetup((ps) => ({ ...ps, footerFromBottom: Math.min(ps.margins.bottom - 0.2, Math.max(0.3, Number(ev.target.value) || 0.3)) }))} /> cm
                      </label>
                    </Row>
                  </Rows>
                </Group>
                <Group title="Cerrar">
                  <BigBtn icon={X} label="Cerrar encabezado y pie" onClick={() => setZone("body")} />
                </Group>
              </>
            )}

            {tab === "vista" && (
              <>
                <Group title="Zoom">
                  <IconBtn icon={ZoomOut} label="Alejar" onClick={() => setZoom((z) => Math.max(50, z - 10))} />
                  <span className="rb-zoom">{zoom}%</span>
                  <IconBtn icon={ZoomIn} label="Acercar" onClick={() => setZoom((z) => Math.min(200, z + 10))} />
                  <button type="button" className="rb-chip" onClick={() => setZoom(100)}>100%</button>
                  <button type="button" className="rb-chip" onClick={() => setZoom(130)} title="Ampliar al ancho de la ventana"><Maximize2 className="h-3 w-3" /> Ancho</button>
                </Group>
                <Group title="Mostrar">
                  <BigBtn icon={RulerIcon} label="Regla" active={showRuler} onClick={() => setShowRuler((v) => !v)} />
                  <BigBtn icon={LayoutTemplate} label="Saltos de página" active={showGuides} onClick={() => setShowGuides((v) => !v)} />
                  <BigBtn icon={Eye} label="Vista previa" active={preview} onClick={() => setPreview((v) => !v)} />
                </Group>
              </>
            )}
          </div>
        )}
        {/* ══ Aviso: documento devuelto por el firmante ══ */}
      {returnNote && editable && (
        <div className="wd-return" role="status">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <div>
            <b>Devuelto para corrección.</b> {returnNote}
            <span> · Corrija el documento y vuelva a despacharlo desde el expediente («Firmar y despachar»).</span>
          </div>
        </div>
      )}

      {/* ══ Regla horizontal funcional (fija junto a la cinta, como en Word) ══ */}
        {showRuler && (
          <div className="wd-ruler-wrap">
            <Ruler
              rulerRef={rulerRef}
              zoom={zoom}
              marginLeft={pageSetup.margins.left}
              marginRight={pageSetup.margins.right}
              indents={indents}
              disabled={locked}
              onMargins={({ left, right }) => setPageSetup((ps) => ({ ...ps, margins: { ...ps.margins, left, right } }))}
              onIndents={(i) => {
                setIndents(i);
                e?.chain().focus().setParagraphIndent({ first: i.first || null, left: i.left || null, right: i.right || null }).run();
              }}
              onOpenSetup={() => setSetupOpen(true)}
            />
          </div>
        )}
      </div>

      {/* ══ Lienzo con la hoja ══ */}
      <div
        className="wd-canvas"
        ref={canvasRef}
        onScroll={(ev) => {
          if (rulerRef.current) rulerRef.current.style.transform = `translateX(${-ev.currentTarget.scrollLeft}px)`;
        }}
      >
        <div id="print-area" className="mx-auto" style={{ width: `calc(${PAGE_CM.width}cm * ${zoom / 100})` }}>
          <div className="origin-top-left" style={{ transform: `scale(${zoom / 100})`, width: `${PAGE_CM.width}cm` }}>
            <div
              className={cn("paper wd-paper", preview && "is-preview", zone !== "body" && "is-editing-hf")}
              style={{
                ["--pt" as string]: `${effTop}cm`,
                ["--pr" as string]: `${pageSetup.margins.right}cm`,
                ["--pb" as string]: `${effBottom}cm`,
                ["--pl" as string]: `${pageSetup.margins.left}cm`,
                minHeight: `calc(${effTop + effBottom}cm + ${usable.height}cm + ${(pages - 1) * (PAGE_H_CM - pageSetup.margins.top - effBottom)}cm + ${(pages - 1) * gapCm}cm)`,
              } as React.CSSProperties}
              onDoubleClick={(ev) => {
                // Doble clic en la zona del margen superior/inferior → editar encabezado/pie (como Word)
                if (!editable || preview) return;
                const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                const yCm = ((ev.clientY - rect.top) / rect.height) * (rect.height / ((PX_PER_CM * zoom) / 100));
                if (yCm < effTop) setZone("header");
                else if (yCm > rect.height / ((PX_PER_CM * zoom) / 100) - effBottom) setZone("footer");
              }}
            >
              {/* Guías de margen y saltos de página */}
              <div className="wd-margin-guides" style={{ inset: `${effTop}cm ${pageSetup.margins.right}cm ${effBottom}cm ${pageSetup.margins.left}cm` }} aria-hidden="true" />
              {guides.map((k) => (
                <div
                  key={k}
                  className={cn("wd-pagegap", !showGuides && "is-quiet")}
                  style={{
                    top: `calc(${effTop}cm + ${usable.height}cm + ${(k - 1) * (PAGE_H_CM - pageSetup.margins.top - effBottom)}cm + ${(k - 1) * gapCm}cm)`,
                    height: `${gapCm}cm`,
                  }}
                  aria-hidden="true"
                >
                  <span className="wd-pagegap__bottom" style={{ height: `${effBottom}cm` }} />
                  <span className="wd-pagegap__void" style={{ height: `${PAGE_GAP_CM}cm` }}>
                    <em>Página {k + 1}</em>
                  </span>
                  {/* El encabezado (membrete) va solo en la primera página: las siguientes usan el margen normal */}
                  <span className="wd-pagegap__top" style={{ height: `${pageSetup.margins.top}cm` }} />
                </div>
              ))}

              {/* ENCABEZADO: dentro del margen superior, a headerFromTop del borde */}
              <div
                ref={headerBoxRef}
                className={cn("wd-zone wd-zone--header", zone === "header" && "is-active")}
                style={{ top: `${pageSetup.headerFromTop}cm`, left: `${pageSetup.margins.left}cm`, right: `${pageSetup.margins.right}cm` }}
                onDoubleClick={(ev) => { ev.stopPropagation(); if (editable && !preview) setZone("header"); }}
              >
                {zone === "header" && <span className="wd-zone__tag">Encabezado</span>}
                {preview ? (
                  <DocumentRender html={emptyZone(headerHtml) ? "" : headerHtml} apa={false} color={org.primaryColor ?? "#0e7490"} placeholders={{ code, logoUrl: org.logoUrl ?? null, color: org.primaryColor ?? "#0e7490" }} />
                ) : (
                  <EditorContent editor={headerEditor} />
                )}
              </div>

              {/* CUERPO */}
              <div ref={sheetRef} className={cn("wd-body", zone !== "body" && "is-dimmed")} onDoubleClick={(ev) => { ev.stopPropagation(); if (zone !== "body") setZone("body"); }}>
                {!inlineLetterhead && (
                  <>
                    <DocHeader org={org} docNumber={docNumber} draftCode={draftCode} docTypeShort={docTypeShort} city={city} />
                    {meta && <DocMetaBlock meta={meta} />}
                  </>
                )}
                {preview ? (
                  <div className="select-none">
                    <DocumentRender
                      html={bodyHtml}
                      signatures={previewStamps}
                      apa={apa}
                      color={org.primaryColor ?? "#0e7490"}
                      placeholders={{ code, logoUrl: org.logoUrl ?? null, color: org.primaryColor ?? "#0e7490" }}
                      finalLook
                    />
                  </div>
                ) : (
                  <EditorContent editor={editor} />
                )}
              </div>

              {/* PIE: dentro del margen inferior, a footerFromBottom del borde */}
              <div
                ref={footerBoxRef}
                className={cn("wd-zone wd-zone--footer", zone === "footer" && "is-active")}
                style={{ bottom: `${pageSetup.footerFromBottom}cm`, left: `${pageSetup.margins.left}cm`, right: `${pageSetup.margins.right}cm` }}
                onDoubleClick={(ev) => { ev.stopPropagation(); if (editable && !preview) setZone("footer"); }}
              >
                {zone === "footer" && <span className="wd-zone__tag">Pie de página</span>}
                {preview ? (
                  <DocumentRender html={emptyZone(footerHtml) ? "" : footerHtml} apa={false} color={org.primaryColor ?? "#0e7490"} placeholders={{ code, logoUrl: org.logoUrl ?? null, color: org.primaryColor ?? "#0e7490" }} />
                ) : (
                  <EditorContent editor={footerEditor} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Diálogo: Configurar página ══ */}
      {setupOpen && (
        <PageSetupDialog
          value={pageSetup}
          onClose={() => setSetupOpen(false)}
          onApply={(ps) => { setPageSetup(ps); setSetupOpen(false); }}
        />
      )}

      {/* ══ Barra de estado ══ */}
      <footer className="wd-statusbar">
        <span><FileText className="h-3 w-3" /> {pages} página{pages === 1 ? "" : "s"}</span>
        <span>{words} palabras</span>
        <span>{chars} caracteres</span>
        <span>Español (Colombia)</span>
        {apa && <span className="wd-statusbar__apa">APA 7.ª ed.</span>}
        <span title="Márgenes de la página">Márgenes {pageSetup.margins.top.toFixed(2).replace(".", ",")} · {pageSetup.margins.right.toFixed(2).replace(".", ",")} · {pageSetup.margins.bottom.toFixed(2).replace(".", ",")} · {pageSetup.margins.left.toFixed(2).replace(".", ",")} cm</span>
        {zone !== "body" && (
          <button type="button" className="wd-statusbar__exit" onClick={() => setZone("body")} title="Volver al cuerpo del documento">
            <X className="h-3 w-3" /> Cerrar {zone === "header" ? "encabezado" : "pie de página"}
          </button>
        )}
        {editable && <span title="Los cambios se guardan automáticamente 1,5 s después de dejar de escribir"><Save className="h-3 w-3" /> Autoguardado</span>}
        <span className="ml-auto truncate">
          {docTypeShort} · {docNumber ? `Radicado ${docNumber}` : draftCode ? `Borrador ${draftCode}` : "sin código"} · {org.name}
          {preview && " · VISTA PREVIA (así se firmará y descargará)"}
        </span>
        <label className="wd-zoom">
          <ZoomOut className="h-3 w-3" />
          <input type="range" min={50} max={200} step={10} value={zoom} onChange={(ev) => setZoom(Number(ev.target.value))} aria-label="Zoom" />
          <ZoomIn className="h-3 w-3" />
          <b>{zoom}%</b>
          <ChevronDown className="hidden" />
        </label>
      </footer>
    </div>
  );
}

/* ══ Diálogo "Configurar página" (márgenes y posición de encabezado/pie) ══ */
function PageSetupDialog({
  value,
  onClose,
  onApply,
}: {
  value: PageSetup;
  onClose: () => void;
  onApply: (ps: PageSetup) => void;
}) {
  const [v, setV] = useState<PageSetup>(value);
  const num = (n: number) => n.toFixed(2);
  const set = (path: "top" | "right" | "bottom" | "left" | "headerFromTop" | "footerFromBottom", raw: string) => {
    const n = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n)) return;
    setV((cur) =>
      path === "headerFromTop" || path === "footerFromBottom"
        ? { ...cur, [path]: n }
        : { ...cur, margins: { ...cur.margins, [path]: n } }
    );
  };
  const presets: { label: string; m: PageSetup["margins"] }[] = [
    { label: "Normal (2,54 cm)", m: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 } },
    { label: "Estrecho (1,27 cm)", m: { top: 1.27, right: 1.27, bottom: 1.27, left: 1.27 } },
    { label: "Moderado", m: { top: 2.54, right: 1.91, bottom: 2.54, left: 1.91 } },
    { label: "Oficio institucional", m: { top: 3, right: 2.5, bottom: 2.5, left: 3 } },
  ];
  const Field = ({ label, path, val }: { label: string; path: Parameters<typeof set>[0]; val: number }) => (
    <label className="ps-field">
      <span>{label}</span>
      <input type="number" step="0.1" min="0.3" max="7" defaultValue={num(val)} onBlur={(ev) => set(path, ev.target.value)} />
      <em>cm</em>
    </label>
  );
  return (
    <div className="ps-backdrop" role="presentation" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <div className="ps-dialog" role="dialog" aria-modal="true" aria-labelledby="ps-title">
        <div className="ps-head">
          <div>
            <p className="ps-eyebrow"><Settings2 className="h-3.5 w-3.5" /> Diseño de página</p>
            <h2 id="ps-title">Configurar página</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <p className="ps-note">Hoja carta 21,59 × 27,94 cm · vertical. Los cambios se aplican a todo el documento y al PDF.</p>
        <div className="ps-presets">
          {presets.map((p) => (
            <button key={p.label} type="button" className={cn("rb-chip", JSON.stringify(p.m) === JSON.stringify(v.margins) && "is-active")} onClick={() => setV((cur) => ({ ...cur, margins: p.m }))}>{p.label}</button>
          ))}
        </div>
        <fieldset className="ps-group">
          <legend>Márgenes</legend>
          <Field label="Superior" path="top" val={v.margins.top} />
          <Field label="Inferior" path="bottom" val={v.margins.bottom} />
          <Field label="Izquierdo" path="left" val={v.margins.left} />
          <Field label="Derecho" path="right" val={v.margins.right} />
        </fieldset>
        <fieldset className="ps-group">
          <legend>Encabezado y pie de página</legend>
          <Field label="Encabezado desde arriba" path="headerFromTop" val={v.headerFromTop} />
          <Field label="Pie de página desde abajo" path="footerFromBottom" val={v.footerFromBottom} />
        </fieldset>
        <div className="ps-actions">
          <button type="button" className="cancel-button" onClick={onClose}>Cancelar</button>
          <button type="button" className="wd-action wd-action--primary" onClick={() => onApply(v)}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}
