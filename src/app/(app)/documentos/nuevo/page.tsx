import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewDocWizard } from "@/components/wizard/new-doc-wizard";
import { getSessionContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Nuevo documento" };
export const dynamic = "force-dynamic";

export default async function NuevoDocumentoPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const org = ctx.org;
  const me = {
    id: ctx.user.id,
    name: ctx.user.name,
    email: ctx.user.email,
    cargo: ctx.user.cargo ?? ctx.user.role,
    department: ctx.user.department,
    color: ctx.user.color,
    photoUrl: ctx.user.photoUrl,
  };

  return (
    <NewDocWizard
      me={me}
      org={{
        name: org?.name ?? "Organización",
        entityType: org?.entityType ?? "publica",
        nit: org?.nit,
        sigla: org?.sigla,
        city: org?.city,
        address: org?.address,
        phone: org?.phone,
        website: org?.website,
        logoUrl: org?.logoUrl,
        logoVariant: org?.logoVariant,
        primaryColor: org?.primaryColor,
      }}
    />
  );
}
