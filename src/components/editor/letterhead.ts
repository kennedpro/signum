import { Node, mergeAttributes } from "@tiptap/core";
import { logoMarkup } from "@/lib/letterhead";

/* ═══════════════════════════════════════════════════════════════════
   NODOS DEL MEMBRETE EN EL EDITOR

   · Letterhead — bloque con el sello (no editable) y líneas de texto
     (párrafos editables). Se serializa como:
       <div data-letterhead class="doc-letterhead">
         <span data-org-logo="variante" class="doc-letterhead__logo"></span>
         <div class="doc-letterhead__lines"><p>…</p></div>
       </div>
   · DocCode — marcador en línea, no editable, que muestra el código
     vigente ("Borrador 00000005" o el radicado). Se serializa vacío:
       <span data-doc-code></span>
   ═══════════════════════════════════════════════════════════════════ */

export type LetterheadOptions = {
  logoUrl: string | null;
  color: string;
  /** Código vigente del documento (Borrador nnnnnnnn o radicado). */
  code: string;
};

export const Letterhead = Node.create<LetterheadOptions>({
  name: "letterhead",
  group: "block",
  content: "paragraph+",
  defining: true,
  isolating: true,
  draggable: false,

  addOptions() {
    return { logoUrl: null, color: "#0e7490", code: "" };
  },

  addAttributes() {
    return {
      variant: {
        default: "institucional",
        parseHTML: (el) =>
          el.querySelector("[data-org-logo]")?.getAttribute("data-org-logo") || "institucional",
        renderHTML: () => ({}),
      },
      /** true → muestra el código del documento (Borrador/Radicado) arriba a la derecha. */
      withCode: {
        default: true,
        parseHTML: (el) => Boolean(el.querySelector(".doc-letterhead__code")),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-letterhead]", contentElement: ".doc-letterhead__lines" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const children: unknown[] = [
      ["span", { "data-org-logo": String(node.attrs.variant), class: "doc-letterhead__logo" }],
      ["div", { class: "doc-letterhead__lines" }, 0],
    ];
    if (node.attrs.withCode) {
      children.push(["div", { class: "doc-letterhead__code" }, ["p", {}, ["span", { "data-doc-code": "" }]]]);
    }
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-letterhead": "", class: "doc-letterhead" }),
      ...(children as [string, Record<string, string>, ...unknown[]][]),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("div");
      dom.className = "doc-letterhead";
      dom.setAttribute("data-letterhead", "");

      const logo = document.createElement("span");
      logo.className = "doc-letterhead__logo";
      logo.setAttribute("data-org-logo", String(node.attrs.variant));
      logo.contentEditable = "false";
      logo.innerHTML = logoMarkup(String(node.attrs.variant), {
        code: null,
        logoUrl: this.options.logoUrl,
        color: this.options.color,
      });

      const contentDOM = document.createElement("div");
      contentDOM.className = "doc-letterhead__lines";

      const codeBox = document.createElement("div");
      codeBox.className = "doc-letterhead__code";
      codeBox.contentEditable = "false";
      if (node.attrs.withCode) {
        const p = document.createElement("p");
        const span = document.createElement("span");
        span.setAttribute("data-doc-code", "");
        span.className = "doc-code__value";
        span.textContent = this.options.code;
        span.title = "Código asignado por SIGNUM (no editable). Al firmar se convierte en el radicado oficial.";
        p.appendChild(span);
        codeBox.appendChild(p);
      }

      dom.append(logo, contentDOM, codeBox);
      return {
        dom,
        contentDOM,
        ignoreMutation: (m) => logo.contains(m.target as globalThis.Node) || codeBox.contains(m.target as globalThis.Node),
      };
    };
  },
});

export type DocCodeOptions = { code: string };

export const DocCode = Node.create<DocCodeOptions>({
  name: "docCode",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addOptions() {
    return { code: "" };
  },

  parseHTML() {
    return [{ tag: "span[data-doc-code]" }];
  },

  renderHTML({ HTMLAttributes }) {
    // Se guarda VACÍO: el valor se resuelve al mostrar/imprimir.
    return ["span", mergeAttributes(HTMLAttributes, { "data-doc-code": "", class: "doc-code__value" })];
  },

  addNodeView() {
    return () => {
      const dom = document.createElement("span");
      dom.className = "doc-code__value";
      dom.setAttribute("data-doc-code", "");
      dom.contentEditable = "false";
      dom.title = "Código asignado por SIGNUM (no editable). Al firmar se convierte en el radicado oficial.";
      dom.textContent = this.options.code;
      return { dom, ignoreMutation: () => true };
    };
  },
});

/**
 * BLOQUE DE CONTACTO al cierre del documento.
 * Contenedor con líneas editables; se serializa como
 *   <div data-contact-block class="doc-contact"><p>…</p>…</div>
 * y por eso el editor lo reconoce al reabrir (no se duplica).
 */
export const ContactBlock = Node.create({
  name: "contactBlock",
  group: "block",
  content: "paragraph+",
  defining: true,
  isolating: true,
  draggable: false,

  parseHTML() {
    return [{ tag: "div[data-contact-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-contact-block": "", class: "doc-contact" }), 0];
  },
});
