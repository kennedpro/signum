"use client";

import { useState } from "react";
import { FileText, ArrowLeft, Check, PenSquare } from "lucide-react";
import { TEMPLATES, BLANK_HTML, type DocTemplate } from "@/lib/templates";
import { EditorPane } from "@/components/editor/editor-pane";

export function NewDocumentWizard() {
  const [picked, setPicked] = useState<DocTemplate | null>(null);
  const [blank, setBlank] = useState(false);

  if (picked || blank) {
    return (
      <div>
        <button
          onClick={() => {
            setPicked(null);
            setBlank(false);
          }}
          className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-line bg-panel/70 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-400 transition hover:text-neon"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          PLANTILLA:{" "}
          <span className="text-neonsoft">
            {picked ? picked.name.toUpperCase() : "EN BLANCO"}
          </span>
        </button>
        <EditorPane
          initialTitle={picked ? picked.name : "Documento sin título"}
          initialContent={picked ? picked.html : BLANK_HTML}
          editable
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-7 text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.26em] text-neon">
          // paso 1 — seleccione la base
        </p>
        <h2 className="mt-2 font-display text-3xl font-bold text-slate-50">
          Plantillas con <span className="text-neon">espacio de firma reservado</span>
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-[13px] text-slate-400">
          Cada plantilla incluye el bloque de cierre (“Atentamente,”) y el área
          donde se estampará la firma digital certificada al momento de firmar.
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <button
          onClick={() => setBlank(true)}
          className="group flex flex-col items-start gap-3 rounded-lg border border-dashed border-line2 bg-panel/40 p-5 text-left transition hover:border-neon/50 hover:bg-panel"
        >
          <span className="grid h-11 w-11 place-items-center rounded-lg border border-line2 bg-panel2 text-slate-400 group-hover:text-neon">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-[15px] font-bold text-slate-100">
              Documento en blanco
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              Hoja limpia con una ranura de firma al final.
            </p>
          </div>
        </button>

        {TEMPLATES.map((t) => (
          <button
            key={t.key}
            onClick={() => setPicked(t)}
            className="hud group relative flex flex-col items-start gap-3 rounded-lg p-5 text-left transition hover:-translate-y-0.5 hover:border-neon/40"
          >
            <span className="corner-tl opacity-0 transition group-hover:opacity-100" />
            <span className="corner-br opacity-0 transition group-hover:opacity-100" />
            <span className="absolute right-4 top-4 rounded border border-line2 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500">
              {t.category}
            </span>
            <span className="grid h-11 w-11 place-items-center rounded-lg border border-neon/25 bg-neon/10 text-neon">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <p className="pr-16 font-display text-[15px] font-bold leading-snug text-slate-100">
                {t.name}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                {t.description}
              </p>
            </div>
            <div className="mt-auto flex w-full items-center justify-between pt-2">
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-slate-500">
                <PenSquare className="h-3 w-3 text-neon/70" />
                {t.slots} ESPACIO(S) DE FIRMA
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-neon opacity-0 transition group-hover:opacity-100">
                <Check className="h-3.5 w-3.5" />
                Usar
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
