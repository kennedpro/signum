import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { getSessionContext } from "@/lib/auth";
import { getInboxCounts } from "@/lib/inbox";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  // Clave temporal (alta reciente o restablecida): debe definir la propia
  // antes de continuar. El módulo vive fuera de este grupo de rutas para
  // evitar cualquier bucle de redirección.
  if (ctx.user.mustChangePassword) redirect("/cuenta/clave");

  // RENDIMIENTO: las consultas independientes van en paralelo (antes eran
  // secuenciales: 3 viajes de ida y vuelta a la base por cada página).
  const [allOrgs, counts, deptRows] = await Promise.all([
    ctx.isPlatformAdmin ? db.select().from(organizations) : Promise.resolve([]),
    getInboxCounts(ctx.user.email, ctx.user.id),
    ctx.orgId
      ? db
          .selectDistinct({ department: users.department })
          .from(users)
          .where(and(eq(users.organizationId, ctx.orgId), eq(users.active, "si")))
      : Promise.resolve([]),
  ]);
  const departments = deptRows.map((d) => d.department).filter(Boolean);

  return (
    <AppShell
      user={{
        name: ctx.user.name,
        email: ctx.user.email,
        role: ctx.user.cargo ?? ctx.user.role,
        systemRole: ctx.user.systemRole,
        department: ctx.user.department,
        color: ctx.user.color,
        photoUrl: ctx.user.photoUrl ?? null,
      }}
      org={{
        id: ctx.org?.id ?? "",
        name: ctx.org?.name ?? "Organización sin configurar",
        entityType: ctx.org?.entityType ?? "publica",
      }}
      orgs={allOrgs.map((o) => ({
        id: o.id,
        name: o.name,
        entityType: o.entityType,
        sigla: o.sigla,
      }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      departments={departments}
      counts={counts}
    >
      {children}
    </AppShell>
  );
}
