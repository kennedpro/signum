"use client";

import { useEffect, useReducer, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, FontSize } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { SignatureSlot } from "@/components/editor/signature-slot";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
  Save,
  Loader2,
  CheckCircle2,
  Eraser,
  PenSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DocHeader, type OrgHeader } from "@/components/doc-header";

function ToolBtn({
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-md transition",
        active
          ? "bg-neon/20 text-neonsoft ring-1 ring-neon/40"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-100",
        disabled && "cursor-not-allowed opacity-25 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

const Div = () => <span className="mx-1 h-5 w-px bg-line2" />;

export function EditorPane({
  documentId,
  initialTitle,
  initialContent,
  editable = true,
  org,
  apa = false,
  docTypeShort,
  docNumber,
  city,
}: {
  documentId?: string;
  initialTitle: string;
  initialContent: string;
  editable?: boolean;
  org?: OrgHeader;
  apa?: boolean;
  docTypeShort?: string;
  docNumber?: string | null;
  city?: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [savedSnapshot, setSavedSnapshot] = useState(initialContent);
  const [titleSnapshot, setTitleSnapshot] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      SignatureSlot,
    ],
    content: initialContent,
    editable,
    editorProps: {
      attributes: {
        class: apa
          ? "doc-content doc-apa min-h-[58vh] focus:outline-none"
          : "doc-content min-h-[58vh] focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const fn = () => force();
    editor.on("transaction", fn);
    return () => {
      editor.off("transaction", fn);
    };
  }, [editor]);

  const currentHtml = editor ? editor.getHTML() : "";
  const dirty = currentHtml !== savedSnapshot || title !== titleSnapshot;
  const words = editor ? editor.getText().split(/\s+/).filter(Boolean).length : 0;
  const slotCount = (currentHtml.match(/data-signature-slot/g) ?? []).length;

  function insertSlot() {
    if (!editor) return;
    const label = window.prompt(
      "Rol que aparecerá bajo la firma (ej.: EL CONTRATANTE, JEFE DE LA DEPENDENCIA)",
      "FIRMA AUTORIZADA"
    );
    if (label === null) return;
    editor
      .chain()
      .focus()
      .insertContent({
        type: "signatureSlot",
        attrs: {
          slot: slotCount + 1,
          label: label.trim().toUpperCase() || "FIRMA AUTORIZADA",
        },
      })
      .run();
  }

  async function save() {
    if (!editor || saving) return;
    if (!title.trim()) {
      setError("El documento necesita un título.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = { title: title.trim(), content: editor.getHTML() };
      const res = documentId
        ? await fetch(`/api/documentos/${documentId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/documentos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al guardar");
      const data = await res.json();
      setSavedSnapshot(payload.content);
      setTitleSnapshot(payload.title);
      setSavedAt(new Date());
      if (!documentId) {
        router.push(`/documentos/${data.id}`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  const e = editor as Editor | null;

  return (
    <div className="space-y-3">
      <div className="sticky top-14 z-20">
        <div className="hud flex flex-wrap items-center gap-0.5 rounded-lg p-1.5">
          <ToolBtn title="Deshacer" onClick={() => e?.commands.undo()} disabled={!e?.can().undo()}>
            <Undo2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Rehacer" onClick={() => e?.commands.redo()} disabled={!e?.can().redo()}>
            <Redo2 className="h-4 w-4" />
          </ToolBtn>
          <Div />
          <ToolBtn title="Título 1" active={e?.isActive("heading", { level: 1 })} onClick={() => e?.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Título 2" active={e?.isActive("heading", { level: 2 })} onClick={() => e?.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Título 3" active={e?.isActive("heading", { level: 3 })} onClick={() => e?.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </ToolBtn>
          <Div />
          <ToolBtn title="Negrita" active={e?.isActive("bold")} onClick={() => e?.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Cursiva" active={e?.isActive("italic")} onClick={() => e?.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Subrayado" active={e?.isActive("underline")} onClick={() => e?.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Tachado" active={e?.isActive("strike")} onClick={() => e?.chain().focus().toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Resaltado" active={e?.isActive("highlight")} onClick={() => e?.chain().focus().toggleHighlight().run()}>
            <Highlighter className="h-4 w-4" />
          </ToolBtn>
          <Div />
          <ToolBtn title="Izquierda" active={e?.isActive({ textAlign: "left" })} onClick={() => e?.chain().focus().setTextAlign("left").run()}>
            <AlignLeft className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Centrar" active={e?.isActive({ textAlign: "center" })} onClick={() => e?.chain().focus().setTextAlign("center").run()}>
            <AlignCenter className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Derecha" active={e?.isActive({ textAlign: "right" })} onClick={() => e?.chain().focus().setTextAlign("right").run()}>
            <AlignRight className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Justificar" active={e?.isActive({ textAlign: "justify" })} onClick={() => e?.chain().focus().setTextAlign("justify").run()}>
            <AlignJustify className="h-4 w-4" />
          </ToolBtn>
          <Div />
          <ToolBtn title="Viñetas" active={e?.isActive("bulletList")} onClick={() => e?.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Numerada" active={e?.isActive("orderedList")} onClick={() => e?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Cita" active={e?.isActive("blockquote")} onClick={() => e?.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Separador" onClick={() => e?.chain().focus().setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </ToolBtn>
          <ToolBtn title="Limpiar formato" onClick={() => e?.chain().focus().unsetAllMarks().run()}>
            <Eraser className="h-4 w-4" />
          </ToolBtn>
          <Div />
          {editable && (
            <button
              type="button"
              onClick={insertSlot}
              className="inline-flex items-center gap-1.5 rounded-md border border-neon/35 bg-neon/10 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-neonsoft transition hover:bg-neon/20"
              title="Reservar el espacio donde quedará la firma digital"
            >
              <PenSquare className="h-3.5 w-3.5" />
              Espacio de firma
            </button>
          )}

          <div className="ml-auto flex items-center gap-2 pl-2">
            <span className="hidden font-mono text-[10px] text-slate-600 lg:block">
              {words}P · {slotCount} FIRMA(S)
            </span>
            {dirty && editable && (
              <span className="hidden font-mono text-[10px] font-bold text-amber-400 sm:block">
                ● SIN GUARDAR
              </span>
            )}
            {!dirty && savedAt && !error && (
              <span className="hidden items-center gap-1 font-mono text-[10px] font-bold text-emerald-400 sm:flex">
                <CheckCircle2 className="h-3 w-3" /> GUARDADO
              </span>
            )}
            {editable && (
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-neon px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_20px_-6px_rgba(34,211,238,0.9)] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Guardando" : "Guardar"}
              </button>
            )}
          </div>
        </div>
        {error && (
          <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] font-medium text-rose-300">
            {error}
          </p>
        )}
      </div>

      <div className="mx-auto w-full overflow-x-auto">
        <p className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">
          Carta 21,59 × 27,94 cm · márgenes 2,54 cm · {apa ? "APA 7 · Times New Roman 12 · doble espacio" : "Times New Roman 12 · 1,5 líneas"}
        </p>
        <div className="paper">
          {org && (
            <DocHeader
              org={org}
              docNumber={docNumber}
              docTypeShort={docTypeShort}
              city={city}
            />
          )}
          {apa && (
            <p className="mb-2 text-right no-print">
              <span className="apa-badge">APA 7.ª ED.</span>
            </p>
          )}
          <input
            value={title}
            onChange={(ev) => setTitle(ev.target.value)}
            placeholder="Título del documento"
            readOnly={!editable}
            className="mb-4 w-full bg-transparent text-center text-[14pt] font-bold uppercase text-black outline-none placeholder:normal-case placeholder:text-stone-300"
            style={{ fontFamily: "var(--doc-font)" }}
          />
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
