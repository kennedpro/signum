import { Mark, mergeAttributes } from "@tiptap/core";
import "@tiptap/extension-text-style"; // aporta el comando removeEmptyTextStyle

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/** Marca de tamaño de fuente (px/pt) aplicada vía style, como Word. */
export const FontSize = Mark.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] };
  },
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (el) => el.style.fontSize || null,
        renderHTML: (attrs) =>
          attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
      },
    };
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

export { mergeAttributes };
