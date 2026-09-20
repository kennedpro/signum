import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { logSecurity } from "@/lib/audit";

/**
 * POST /api/mi-cuenta/clave
 * Auto-servicio: cualquier usuario autenticado cambia su PROPIA
 * contraseña de acceso (requiere conocer la actual). Es el único camino
 * para que un administrador de plataforma cambie su propia clave, y el
 * paso obligatorio tras un alta o un restablecimiento (mustChangePassword).
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const currentPassword = String(body?.currentPassword ?? "");
    const newPassword = String(body?.newPassword ?? "").trim();

    if (!verifyPassword(currentPassword, user.passwordHash, user.passwordSalt)) {
      return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "La nueva contraseña debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }
    if (newPassword === currentPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña debe ser distinta de la actual." },
        { status: 400 }
      );
    }

    const { hash, salt } = hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: false })
      .where(eq(users.id, user.id));

    await logSecurity([
      {
        documentId: null,
        organizationId: user.organizationId,
        event: "cambio_clave",
        result: "ok",
        actorName: user.name,
        actorEmail: user.email,
        detail: "El usuario cambió su propia contraseña de acceso.",
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo cambiar la contraseña." }, { status: 500 });
  }
}
