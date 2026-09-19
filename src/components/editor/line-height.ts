import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    paragraphLineHeight: {
      /** Interlineado del párrafo/título seleccionado (1, 1.15, 1.5, 2…). */
      setParagraphLineHeight: (lineHeight: string) => ReturnType;
      unsetParagraphLineHeight: () => ReturnType;
    };
  }
}

/**
 * INTERLINEADO A NIVEL DE BLOQUE (como Word).
 *
 * El interlineado se guarda en el párrafo o título como
 * `style="line-height: X"`. Aplicarlo a un <span> no funciona: la altura de
 * línea de un bloque nunca baja del valor que ya tiene el párrafo, así que
 * pasar de 2,0 a 1,0 no producía ningún cambio visible.
 */
export const ParagraphLineHeight = Extension.create({
  name: "paragraphLineHeight",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => {
              const v = (element as HTMLElement).style.lineHeight;
              return v && v !== "normal" ? v : null;
            },
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphLineHeight:
        (lineHeight) =>
        ({ commands }) =>
          this.options.types.every((type: string) => commands.updateAttributes(type, { lineHeight })),
      unsetParagraphLineHeight:
        () =>
        ({ commands }) =>
          this.options.types.every((type: string) => commands.resetAttributes(type, "lineHeight")),
    };
  },
});
