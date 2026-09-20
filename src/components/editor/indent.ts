import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphIndent: {
      /** Sangrías del párrafo/título actual en cm (como la regla de Word). */
      setParagraphIndent: (indent: { first?: number | null; left?: number | null; right?: number | null }) => ReturnType;
      unsetParagraphIndent: () => ReturnType;
    };
  }
}

const cm = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

/**
 * SANGRÍAS A NIVEL DE PÁRRAFO (regla de Word).
 * · first → sangría de primera línea (text-indent), puede ser negativa (francesa).
 * · left  → sangría izquierda (margin-left).
 * · right → sangría derecha (margin-right).
 * Se guardan como estilos inline del párrafo; el PDF las lee del mismo sitio.
 */
export const ParagraphIndent = Extension.create({
  name: "paragraphIndent",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indentFirst: {
            default: null,
            parseHTML: (el) => cm((el as HTMLElement).style.textIndent?.replace("cm", "")),
            renderHTML: (a) => (a.indentFirst != null ? { style: `text-indent: ${a.indentFirst}cm` } : {}),
          },
          indentLeft: {
            default: null,
            parseHTML: (el) => cm((el as HTMLElement).style.marginLeft?.replace("cm", "")),
            renderHTML: (a) => (a.indentLeft != null ? { style: `margin-left: ${a.indentLeft}cm` } : {}),
          },
          indentRight: {
            default: null,
            parseHTML: (el) => cm((el as HTMLElement).style.marginRight?.replace("cm", "")),
            renderHTML: (a) => (a.indentRight != null ? { style: `margin-right: ${a.indentRight}cm` } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphIndent:
        (indent) =>
        ({ commands }) =>
          this.options.types.every((type: string) => {
            const attrs: Record<string, number | null> = {};
            if (indent.first !== undefined) attrs.indentFirst = indent.first;
            if (indent.left !== undefined) attrs.indentLeft = indent.left;
            if (indent.right !== undefined) attrs.indentRight = indent.right;
            return commands.updateAttributes(type, attrs);
          }),
      unsetParagraphIndent:
        () =>
        ({ commands }) =>
          this.options.types.every(
            (type: string) =>
              commands.resetAttributes(type, "indentFirst") &&
              commands.resetAttributes(type, "indentLeft") &&
              commands.resetAttributes(type, "indentRight")
          ),
    };
  },
});
