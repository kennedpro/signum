import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { AppShell } from "@/components/shell";
import { getSessionContext } from "@/lib/auth";
import { getInboxCounts } from "@/lib/inbox";

/**
 * Marco de la consola SIGNUM (barra lateral, cabecera, bandeja) para páginas
 * que viven fuera del grupo (app) pero deben verse igual cuando el usuario
 * tiene sesión — p. ej. el portal de firma. Si no hay sesión devuelve null
 * y la página usa su propio marco público.
 */
export async function ConsoleFrame({ children }: { children: ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  if (ctx.user.mustChangePassword) redirect("/cuenta/clave");

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
      orgs={allOrgs.map((o) => ({ id: o.id, name: o.name, entityType: o.entityType, sigla: o.sigla }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      departments={departments}
      counts={counts}
    >
      {children}
    </AppShell>
  );
}

export async function hasConsoleSession() {
  return Boolean(await getSessionContext());
}
