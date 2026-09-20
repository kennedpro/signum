import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Nodo atómico que reserva el espacio de la firma dentro del documento.
 * Se serializa como <div data-signature-slot="n" data-signature-label="ROL"></div>
 * y el renderizador del servidor lo sustituye por la estampa de firma digital.
 */
export const SignatureSlot = Node.create({
  name: "signatureSlot",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      slot: {
        default: 1,
        parseHTML: (el) => Number(el.getAttribute("data-signature-slot")) || 1,
        renderHTML: (attrs) => ({ "data-signature-slot": String(attrs.slot) }),
      },
      label: {
        default: "FIRMA AUTORIZADA",
        parseHTML: (el) =>
          el.getAttribute("data-signature-label") || "FIRMA AUTORIZADA",
        renderHTML: (attrs) => ({
          "data-signature-label": String(attrs.label ?? ""),
        }),
      },
      anchor: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-signature-anchor"),
        renderHTML: (attrs) => ({
          "data-signature-anchor":
            attrs.anchor ?? `SGN::SLOT::${attrs.slot ?? 1}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-signature-slot]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)];
  },
});
