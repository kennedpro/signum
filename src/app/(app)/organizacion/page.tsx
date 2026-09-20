import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { OrgForm } from "@/components/org-form";
import { FadeUp } from "@/components/motion";
import { Panel } from "@/components/bits";
import { getSessionContext } from "@/lib/auth";
import { Building2 } from "lucide-react";
import type { EntityType } from "@/lib/entity";

export const dynamic = "force-dynamic";

export default async function OrganizacionPage() {
  const ctx = await getSessionContext();

  // El administrador de PLATAFORMA no pertenece a ninguna empresa: hasta
  // que elija una en la barra lateral no hay un perfil que editar aquí.
  if (!ctx?.orgId) {
    return (
      <div className="mx-auto max-w-2xl">
        <FadeUp>
          <Panel className="flex flex-col items-center gap-3 p-10 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-lg border border-line2 bg-panel2/60">
              <Building2 className="h-5 w-5 text-slate-500" />
            </span>
            <p className="font-display text-lg font-bold text-slate-200">
              Ninguna entidad seleccionada
            </p>
            <p className="max-w-sm text-[12.5px] text-slate-500">
              Como administrador de plataforma, elija una empresa en el panel lateral
              (“entidades”) para ver y editar su perfil institucional.
            </p>
          </Panel>
        </FadeUp>
      </div>
    );
  }

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);

  return (
    <div className="mx-auto max-w-6xl">
      <FadeUp>
        <OrgForm
          initial={{
            name: org?.name ?? "Mi organización",
            entityType: (org?.entityType === "privada" ? "privada" : "publica") as EntityType,
            nit: org?.nit ?? "",
            sigla: org?.sigla ?? "",
            city: org?.city ?? "Bogotá D.C.",
            logoUrl: org?.logoUrl ?? "",
          }}
        />
      </FadeUp>
    </div>
  );
}
