import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { UsersAdmin } from "@/components/users-admin";
import { FadeUp } from "@/components/motion";
import { getSessionContext, canManageUsers } from "@/lib/auth";
import { Lock } from "lucide-react";
import type { EntityType } from "@/lib/entity";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const ctx = await getSessionContext();
  const me = ctx?.user;
  if (!me || !canManageUsers(me.systemRole)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10">
          <Lock className="h-6 w-6 text-rose-400" />
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-100">
          Acceso restringido
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          El registro de funcionarios contiene datos personales y define los
          metadatos legales de cada firma. Solo el{" "}
          <strong className="text-slate-200">Administrador</strong> o el{" "}
          <strong className="text-slate-200">Jefe de Gestión Documental</strong>{" "}
          pueden administrarlo.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-md border border-line2 px-5 py-2.5 text-[12.5px] font-bold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
        >
          Volver a la consola
        </Link>
      </div>
    );
  }

  const list = ctx.orgId
    ? await db.select().from(users).where(eq(users.organizationId, ctx.orgId)).orderBy(asc(users.createdAt))
    : [];
  const org = ctx.org;
  const entityType: EntityType = org?.entityType === "privada" ? "privada" : "publica";

  return (
    <div className="mx-auto max-w-5xl">
      <FadeUp>
        <UsersAdmin
          entityType={entityType}
          officers={list.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            username: u.username,
            role: u.role,
            systemRole: u.systemRole,
            department: u.department,
            color: u.color,
            photoUrl: u.photoUrl,
            grado: u.grado,
            cargo: u.cargo,
            cedula: u.cedula,
            dependencia: u.dependencia,
            unidad: u.unidad,
            area: u.area,
            sucursal: u.sucursal,
            active: u.active,
            mustChangePassword: u.mustChangePassword,
            lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          }))}
        />
      </FadeUp>
    </div>
  );
}
