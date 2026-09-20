import Link from "next/link";
import { asc, eq, count } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users, documents } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { Lock, Globe2 } from "lucide-react";
import { FadeUp } from "@/components/motion";
import { CompanyOnboarding, type CompanyRow } from "@/components/platform/company-onboarding";
import { GlobalUsers, type GlobalUserRow } from "@/components/platform/global-users";

export const dynamic = "force-dynamic";

export default async function PlataformaPage() {
  const ctx = await getSessionContext();

  if (!ctx || !ctx.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-xl border border-rose-500/40 bg-rose-500/10">
          <Lock className="h-6 w-6 text-rose-400" />
        </span>
        <h1 className="font-display text-2xl font-bold text-slate-100">Acceso restringido</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
          El módulo de Plataforma crea y administra empresas completas. Solo el{" "}
          <strong className="text-slate-200">Administrador de Plataforma</strong> puede acceder.
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

  const orgs = await db.select().from(organizations).orderBy(asc(organizations.createdAt));

  const [userCounts, docCounts, allUsers] = await Promise.all([
    db.select({ organizationId: users.organizationId, value: count() }).from(users).groupBy(users.organizationId),
    db.select({ organizationId: documents.organizationId, value: count() }).from(documents).groupBy(documents.organizationId),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        username: users.username,
        role: users.role,
        systemRole: users.systemRole,
        active: users.active,
        mustChangePassword: users.mustChangePassword,
        organizationId: users.organizationId,
        orgName: organizations.name,
        orgSigla: organizations.sigla,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .orderBy(asc(users.createdAt)),
  ]);

  const companies: CompanyRow[] = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    sigla: o.sigla ?? "—",
    entityType: o.entityType === "privada" ? "privada" : "publica",
    nit: o.nit ?? "",
    city: o.city ?? "",
    users: userCounts.find((c) => c.organizationId === o.id)?.value ?? 0,
    documents: docCounts.find((c) => c.organizationId === o.id)?.value ?? 0,
    createdAt: o.createdAt.toISOString(),
  }));

  const globalUsers: GlobalUserRow[] = allUsers.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username,
    role: u.role,
    systemRole: u.systemRole,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    orgId: u.organizationId,
    orgName: u.orgName,
    orgSigla: u.orgSigla,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <FadeUp className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg border border-neon/30 bg-neon/10">
          <Globe2 className="h-5 w-5 text-neon" />
        </span>
        <div>
          <p className="font-display text-lg font-bold text-slate-100">Plataforma SIGNUM</p>
          <p className="text-[12px] text-slate-500">
            {companies.length} empresa(s) · {globalUsers.length} cuenta(s) en total
          </p>
        </div>
      </FadeUp>

      <CompanyOnboarding companies={companies} />
      <GlobalUsers users={globalUsers} companies={companies} />
    </div>
  );
}
