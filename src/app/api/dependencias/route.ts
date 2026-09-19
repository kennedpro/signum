import { NextResponse } from "next/server";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { DEPARTMENTS } from "@/lib/utils";

function initials(s: string) {
  return s
    .split(/[\s/-]+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w))
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/**
 * Dependencias de la entidad activa: las registradas en fichas de funcionarios
 * más el catálogo base. Búsqueda por nombre o por iniciales (TH → Talento Humano).
 */
export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  const compact = q.replace(/\s+/g, "");

  const rows = ctx.orgId
    ? await db
        .selectDistinct({ d: users.department, dep: users.dependencia })
        .from(users)
        .where(and(eq(users.organizationId, ctx.orgId), eq(users.active, "si"), isNotNull(users.department)))
    : [];

  const set = new Set<string>();
  for (const r of rows) {
    if (r.d) set.add(r.d);
    if (r.dep) set.add(r.dep);
  }
  for (const d of DEPARTMENTS) set.add(d);

  const items = [...set]
    .map((name) => ({ name, initials: initials(name) }))
    .map((it) => {
      const n = it.name.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else {
        if (n.startsWith(q)) score += 80;
        if (n.includes(q)) score += 40;
        if (it.initials.toLowerCase().startsWith(compact)) score += 90;
        if (n.split(/\s+/).some((w) => w.startsWith(q))) score += 30;
      }
      return { ...it, score };
    })
    .filter((it) => it.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 15)
    .map(({ name, initials }) => ({ name, initials }));

  return NextResponse.json({ departments: items });
}
