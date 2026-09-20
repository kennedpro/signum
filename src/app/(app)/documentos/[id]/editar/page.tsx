import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients, users } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { docTypeOf } from "@/lib/doctypes";
import { DocHeader } from "@/components/doc-header";
import { FadeUp } from "@/components/motion";
import { SectionTitle } from "@/components/bits";
import { ConfigEditForm } from "@/components/config-edit-form";
import { ArrowLeft, Lock } from "lucide-react";

export const metadata = { title: "Configuración del documento" };
export const dynamic = "force-dynamic";

export default async function ConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(`/documentos/${id}/editar`)}`);

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) notFound();
  return redirect(`/documentos/${id}/editar-config`);
}
