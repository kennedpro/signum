"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

export type PdfEvidence = {
  documentId: string;
  radicado: string | null;
  draftCode: string | null;
  organization: string;
  title: string;
  sealHash: string | null;
  hashPre: string | null;
  hashPost: string | null;
  lockedAt: string | null;
  verifyUrl: string;
  signatures: {
    name: string;
    cargo: string | null;
    cedula: string | null;
    signedAt: string;
    keyFingerprint: string | null;
  }[];
};

/**
 * Descarga el PDF vectorial generado en el servidor
 * (/api/documentos/:id/pdf): texto seleccionable, hoja carta con
 * márgenes de 1", numeración APA y certificado de integridad.
 */
export function DownloadPdfButton({
  evidence,
  className,
  label = "Descargar PDF",
}: {
  evidence: PdfEvidence;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documentos/${encodeURIComponent(evidence.documentId)}/pdf`, {
        credentials: "same-origin",
        headers: { Accept: "application/pdf" },
      });
      if (!res.ok) {
        let message = `Error ${res.status}`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* respuesta sin cuerpo JSON */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const fallback = `${(evidence.radicado ?? `Borrador_${evidence.draftCode ?? "sin-codigo"}`).replace(/[^A-Za-z0-9._-]+/g, "_")}_SIGNUM.pdf`;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallback;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo generar el PDF.";
      setError(message);
      window.alert(`No se pudo generar el PDF: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={className}
      title={error ?? "Descarga el documento en PDF (carta, márgenes de 1\") con texto seleccionable y certificado de integridad"}
    >
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Generando PDF…
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          {label}
        </>
      )}
    </button>
  );
}
