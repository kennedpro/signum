import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { ORG_COOKIE, getSessionUser, isPlatformAdmin } from "@/lib/auth";

export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me || !isPlatformAdmin(me.systemRole)) {
    return NextResponse.json(
      { error: "Solo el administrador de la plataforma puede cambiar de entidad." },
      { status: 403 }
    );
  }
  const body = await req.json();
  const orgId = String(body.orgId ?? "");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const res = NextResponse.json({ ok: true, name: org.name });
  res.cookies.set({
    name: ORG_COOKIE,
    value: org.id,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return res;
}
