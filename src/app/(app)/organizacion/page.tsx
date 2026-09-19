import { asc } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { OrgForm } from "@/components/org-form";
import { FadeUp } from "@/components/motion";
import type { EntityType } from "@/lib/entity";

export const dynamic = "force-dynamic";

export default async function OrganizacionPage() {
  const [org] = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
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
