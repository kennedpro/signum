import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";
import { hashSignPassword } from "@/lib/crypto-sign";
import { logAudit, logSecurity } from "@/lib/audit";

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const [org] = await db
      .select()
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    if (!org) {
      return NextResponse.json({ error: "Organización no encontrada." }, { status: 404 });
    }

    const entityType = body.entityType === "privada" ? "privada" : "publica";
    const logoUrlRaw = cleanIdentity(body.logoUrl, 400);
    const logoUrl =
      logoUrlRaw && /^https:\/\/[^\s"'<>]+$/i.test(logoUrlRaw) ? logoUrlRaw : null;

    await db
      .update(organizations)
      .set({
        name: cleanIdentity(body.name, 140) ?? org.name,
        entityType,
        nit: cleanIdentity(body.nit, 30),
        sigla: cleanIdentity(body.sigla, 20),
        city: cleanIdentity(body.city, 80) ?? org.city,
        logoUrl,
        logoVariant: entityType === "privada" ? "corporativo" : "institucional",
      })
      .where(eq(organizations.id, org.id));

    await logAudit([
      {
        documentId: null,
        action: "editado",
        label: `Perfil de la organización actualizado a ${entityType.toUpperCase()}`,
        actorName: "Administrador",
        detail: `Metadatos dinámicos: ${
          entityType === "publica" ? "Grado/Dependencia/Unidad" : "Cargo/Área/Empresa/NIT"
        }`,
      },
    ]);

    return NextResponse.json({ ok: true, entityType });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo actualizar el perfil." }, { status: 500 });
  }
}

/** Rotación de la contraseña adicional de firma del usuario activo. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const password = String(body.signPassword ?? "").trim();
    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña de firma debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }
    const { getSessionUser } = await import("@/lib/auth");
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    const { hash, salt } = hashSignPassword(password);
    await db
      .update(users)
      .set({ signPasswordHash: hash, signPasswordSalt: salt })
      .where(eq(users.id, user.id));

    await logSecurity([
      {
        documentId: null,
        event: "autorizacion",
        result: "ok",
        actorName: user.name,
        actorEmail: user.email,
        detail: "Contraseña adicional de firma actualizada (scrypt)",
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo actualizar la clave." }, { status: 500 });
  }
}
