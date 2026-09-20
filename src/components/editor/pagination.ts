import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { PAGE_CM } from "@/lib/page-setup";

/* ═══════════════════════════════════════════════════════════════════
   PAGINACIÓN VISUAL (modelo Word) PARA EL EDITOR CONTINUO

   ProseMirror edita un flujo continuo. Para que el contenido respete las
   hojas, esta extensión mide cada bloque de nivel superior en píxeles
   reales y, cuando un bloque no cabe COMPLETO en el resto de la hoja,
   le aplica un margen superior (decoración de nodo que NO se guarda en
   el documento) que lo mueve entero al inicio de la hoja siguiente:

       espacio restante de la hoja + hueco entre hojas.

   La geometría (alto útil, hueco y zoom) viaja dentro del ESTADO del
   plugin mediante transacciones con meta —nunca por mutación de
   opciones, que en Tiptap puede no alcanzar la instancia del plugin— y
   el factor píxel/cm se mide sobre la hoja real renderizada (no con una
   constante), con lo que los saltos coinciden exactamente con los
   separadores de página dibujados.

   Se recalcula al escribir, cambiar márgenes/zoom, cargar fuentes o
   imágenes y redimensionar.
   ═══════════════════════════════════════════════════════════════════ */

export type PaginationOptions = {
  /** Alto útil de la PRIMERA página (cm): resta el encabezado. */
  usableCm: number;
  /** Alto útil de las páginas siguientes (cm): sin encabezado. Si falta, se usa usableCm. */
  usableNextCm?: number;
  /** Hueco entre hojas (cm) = margen inf. + separación + margen sup. */
  gapCm: number;
  /** px de PANTALLA por cm en el lienzo (37,795 × zoom): si falta se mide del DOM. */
  pxPerCm?: number;
  /** factor de escala del lienzo (zoom/100): los estilos CSS se aplican antes del scale() */
  scale: number;
  /** Activa/desactiva el salto real de bloques */
  enabled: boolean;
};

type PgState = { deco: DecorationSet; opts: Required<Omit<PaginationOptions, "usableNextCm">> & { usableNextCm: number } };

const key = new PluginKey<PgState>("signum-pagination");
const OPT_META = Symbol("signum-pagination-options");
const TOLERANCE_PX = 3;

/** Inicio (en px de pantalla relativos al cuerpo) de la página p. */
function bodyStart(p: number, u1: number, uN: number, gapPx: number) {
  return p === 0 ? 0 : u1 + (p - 1) * uN + p * gapPx;
}
/** Coordenada renderizada donde TERMINA el cuerpo útil de la página p. */
function bodyEnd(p: number, u1: number, uN: number, gapPx: number) {
  return p === 0 ? u1 : u1 + p * uN + p * gapPx;
}
/**
 * Página cuyo CUERPO contiene la coordenada y. Si y cae en el hueco entre
 * dos hojas, se devuelve la página anterior (el bloque que se calcule
 * después se empujará al inicio de la siguiente, que es justo lo deseable).
 */
function pageAt(y: number, u1: number, uN: number, gapPx: number, maxPage: number) {
  let p = 0;
  for (let cand = 1; cand <= maxPage + 6; cand += 1) {
    if (bodyStart(cand, u1, uN, gapPx) <= y + 0.5) p = cand;
    else break;
  }
  return p;
}

type Measured = {
  from: number;
  size: number;
  /** Borde superior en el flujo NATURAL (sin saltos), px pantalla. */
  naturalTop: number;
  /** Alto real. */
  height: number;
  /** Margen inferior natural, px pantalla. */
  marginBottom: number;
  /** Margen superior natural, px pantalla. */
  marginTop: number;
  /** ¿Párrafo vacío (sirve para ignorar la marca final)? */
  empty: boolean;
};

function compute(view: import("@tiptap/pm/view").EditorView, opts: PgState["opts"]): DecorationSet {
  if (!opts.enabled) return DecorationSet.empty;
  const scale = opts.scale || 1;

  // Factor píxel/cm REAL: ancho de la hoja renderizada / 21,59 cm (sin zoom).
  const paper = view.dom.closest?.(".wd-paper") as HTMLElement | null;
  const cssPxPerCm = paper && paper.offsetWidth > 100 ? paper.offsetWidth / PAGE_CM.width : 37.7952755906;
  const pxPerCm = opts.pxPerCm && opts.pxPerCm > 20 ? opts.pxPerCm : cssPxPerCm * scale;

  const u1 = opts.usableCm * pxPerCm;
  const uN = (opts.usableNextCm ?? opts.usableCm) * pxPerCm;
  const gapPx = opts.gapCm * pxPerCm;
  const toCss = (screenPx: number) => screenPx / scale;
  if (!(u1 > 50) || !(uN > 5)) return DecorationSet.empty;

  const pm = view.dom as HTMLElement;

  /* ── 1) Dos pasadas: se retiran TODOS los saltos aplicados, se mide el
        flujo natural real en una sola reordenación, y se restauran. Así la
        medición es exacta (no heurística) y el cálculo siempre converge. ── */
  const refs: { node: import("@tiptap/pm/model").Node; offset: number; dom: HTMLElement }[] = [];
  view.state.doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    if (dom instanceof HTMLElement && (dom.getBoundingClientRect().width !== 0 || dom.getBoundingClientRect().height !== 0)) {
      refs.push({ node, offset, dom });
    }
  });

  // El margen de salto vive en --pg-mt y lo aplica una regla con !important
  // (existen reglas como `p + div[data-signature-slot]{margin-top:4pt!important}`
  // que ganarían a un estilo en línea). Para medir el flujo natural se anula.
  const saved: { dom: HTMLElement; v: string }[] = [];
  for (const r of refs) {
    if (r.dom.classList.contains("pm-page-start")) {
      saved.push({ dom: r.dom, v: r.dom.style.getPropertyValue("--pg-mt") });
      r.dom.style.setProperty("--pg-mt", "0px");
    }
  }
  // Una sola reordenación forzada para medir el flujo natural completo.
  void pm.offsetHeight;

  const pmRect = pm.getBoundingClientRect();
  const pmCs = getComputedStyle(pm);
  const originY =
    pmRect.top + (parseFloat(pmCs.paddingTop) || 0) * scale + (parseFloat(pmCs.borderTopWidth) || 0) * scale;

  const measured: Measured[] = refs.map(({ node, offset, dom }) => {
    const rect = dom.getBoundingClientRect();
    const cs = getComputedStyle(dom);
    return {
      from: offset,
      size: node.nodeSize,
      naturalTop: rect.top - originY,
      height: rect.height,
      marginTop: (parseFloat(cs.marginTop) || 0) * scale,
      marginBottom: (parseFloat(cs.marginBottom) || 0) * scale,
      empty: node.isBlock && node.textContent.trim() === "" && node.childCount === 0,
    };
  });

  // Restauración inmediata: la siguiente transacción aplica el resultado;
  // entre medias el usuario no percibe parpadeo (mismo frame).
  for (const s of saved) s.dom.style.setProperty("--pg-mt", s.v);

  if (measured.length === 0) return DecorationSet.empty;
  let lastContentIdx = measured.length - 1;
  while (lastContentIdx > 0 && measured[lastContentIdx].empty) lastContentIdx -= 1;

  /* ── 2) Colocación voraz sobre el flujo natural + saltos decididos ──
        HISTÉRESIS: un bloque que ya estaba saltando solo vuelve a la hoja
        anterior si le sobra holgura clara (STICKY_PX). Sin esto, un bloque
        situado justo en el límite entra y sale del salto en cada medición
        (el "sube y baja" del pie de contacto).                            */
  const previouslyBroken = new Set<number>();
  for (const r of refs) if (r.dom.classList.contains("pm-page-start")) previouslyBroken.add(r.offset);
  const STICKY_PX = 14 * scale;

  const decos: Decoration[] = [];
  let shift = 0;
  let page = 0;
  let maxPage = 1;
  let prevBottom = measured[0].naturalTop;

  for (let i = 0; i < measured.length; i += 1) {
    const b = measured[i];
    const gapBefore = Math.max(0, b.naturalTop - prevBottom);
    const top = b.naturalTop + shift;
    page = Math.max(page, pageAt(Math.max(top, 0), u1, uN, gapPx, maxPage));
    const end = bodyEnd(page, u1, uN, gapPx);
    const flows = b.height > uN * 0.9; // bloque más alto que una hoja: fluye
    const ignoreOverflow = i > lastContentIdx; // marca final vacía
    const wasBroken = previouslyBroken.has(b.from);
    // Umbral: si ya saltaba, exigimos que quepa con holgura para deshacer el salto
    const limit = wasBroken ? end - STICKY_PX : end + TOLERANCE_PX;

    if (!flows && !ignoreOverflow && top + b.height > limit) {
      // No cabe completo: mover el bloque entero al inicio de la hoja siguiente.
      const nextStart = bodyStart(page + 1, u1, uN, gapPx);
      const newGap = nextStart - (prevBottom + shift);
      const marginScreen = Math.max(newGap, gapBefore, 0);
      decos.push(
        Decoration.node(b.from, b.from + b.size, {
          style: `--pg-mt:${toCss(marginScreen).toFixed(1)}px`,
          class: "pm-page-start",
        })
      );
      shift += Math.max(0, marginScreen - gapBefore);
      page += 1;
      maxPage = Math.max(maxPage, page + 1);
    } else if (flows) {
      let p = page;
      while (b.naturalTop + shift + b.height > bodyEnd(p, u1, uN, gapPx)) p += 1;
      page = p;
      maxPage = Math.max(maxPage, page + 1);
    }
    prevBottom = b.naturalTop + b.height;
  }

  return DecorationSet.create(view.state.doc, decos);
}

const DEFAULTS: PgState["opts"] = {
  usableCm: 22.86,
  usableNextCm: 22.86,
  gapCm: 5.98,
  pxPerCm: 0,
  scale: 1,
  enabled: true,
};

export const Pagination = Extension.create<PaginationOptions>({
  name: "signumPagination",

  addOptions() {
    return { ...DEFAULTS };
  },

  addProseMirrorPlugins() {
    const ext = this;
    let scheduled: number | null = null;

    const run = (view: import("@tiptap/pm/view").EditorView) => {
      const state = key.getState(view.state);
      if (!state) return;
      const next = compute(view, state.opts);
      const cur = state.deco;
      const sig = (set: DecorationSet) =>
        set
          .find()
          .map((d) => {
            const style = (d as unknown as { type: { attrs?: { style?: string } } }).type.attrs?.style ?? "";
            // redondeo a 2 px: el ruido sub-píxel de la medición no debe provocar re-despachos
            const px = Math.round((parseFloat(style.replace(/[^\d.]/g, "")) || 0) / 2) * 2;
            return `${d.from}:${px}`;
          })
          .join("|");
      if (sig(cur) !== sig(next)) view.dispatch(view.state.tr.setMeta(key, { deco: next }));
    };
    const schedule = (view: import("@tiptap/pm/view").EditorView) => {
      if (scheduled !== null) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = null;
        run(view);
      });
    };

    return [
      new Plugin<PgState>({
        key,
        state: {
          init: () => ({ deco: DecorationSet.empty, opts: { ...ext.options } as PgState["opts"] }),
          apply(tr, prev) {
            const optMeta = tr.getMeta(key) as { opts?: Partial<PaginationOptions>; deco?: DecorationSet } | undefined;
            const opts = optMeta?.opts
              ? { ...prev.opts, ...optMeta.opts }
              : prev.opts;
            if (optMeta?.deco) return { deco: optMeta.deco, opts };
            const deco = tr.docChanged ? prev.deco.map(tr.mapping, tr.doc) : prev.deco;
            return { deco, opts };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.deco ?? DecorationSet.empty;
          },
        },
        view(view) {
          // Cálculo inicial diferido y recalculo tras cargar fuentes/imágenes.
          const timers = [60, 200, 600, 1400].map((ms) =>
            window.setTimeout(() => schedule(view), ms)
          );
          if (typeof document !== "undefined" && "fonts" in document) {
            (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready
              ?.then(() => schedule(view))
              .catch(() => undefined);
          }
          // Se observa SOLO el contenido (ancho/altura natural). La hoja (.wd-paper) no se
          // observa: su altura cambia precisamente al aplicar los saltos y realimentaba el cálculo.
          const ro = new ResizeObserver(() => schedule(view));
          ro.observe(view.dom);
          return {
            update: () => schedule(view),
            destroy: () => {
              ro.disconnect();
              timers.forEach((t) => window.clearTimeout(t));
              if (scheduled !== null) window.cancelAnimationFrame(scheduled);
            },
          };
        },
      }),
    ];
  },
});

/** Actualiza la geometría en caliente (vive en el estado del plugin). */
export function setPaginationOptions(editor: import("@tiptap/core").Editor, opts: Partial<PaginationOptions>) {
  editor.view.dispatch(editor.view.state.tr.setMeta(key, { opts }));
  requestAnimationFrame(() => {
    const st = key.getState(editor.view.state);
    if (st) {
      const next = compute(editor.view, st.opts);
      editor.view.dispatch(editor.view.state.tr.setMeta(key, { deco: next }));
    }
  });
}
