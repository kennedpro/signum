import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { docTypeOf } from "@/lib/doctypes";
import { DocHeader } from "@/components/doc-header";
import { FadeUp } from "@/components/motion";
import { Panel, SectionTitle } from "@/components/bits";
import { ConfigEditForm } from "@/components/config-edit-form";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Configuración del documento" };
export const dynamic = "force-dynamic";

export default async function EditConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/documentos/${id}/editar-config`)}`);

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) notFound();
  if (doc.status !== "borrador") return redirect(`/documentos/${id}`);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <FadeUp className="flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel/70 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-400 transition hover:text-neon"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          INICIO
        </Link>
        <Link
          href={`/documentos/${id}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-3 py-1.5 font-mono text-[11px] font-semibold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
        >
          <Lock className="h-3.5 w-3.5" />
          Ver expediente
        </Link>
      </FadeUp>

      <FadeUp delay={0.05}>
        <Panel className="p-6">
          <SectionTitle hint="editable mientras sea borrador">
            Configuración del documento
          </SectionTitle>
          <p className="mb-4 text-[12.5px] leading-relaxed text-slate-400">
            Aquí está todo lo definido al crear el documento: título, asunto, ciudad, remitente,
            destinatario, firmante, asistentes que aprueban y copias de conocimiento. Puede
            ajustarlo en cualquier momento antes de despachar; el texto redactado se conserva.
          </p>
          <ConfigEditForm doc={doc} def={docTypeOf(doc.docType)} />
        </Panel>
      </FadeUp>
    </div>
  );
}
