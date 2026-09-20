import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { canManageUsers } from "@/lib/roles";
import { hashPassword, generateTempPassword } from "@/lib/password";
import { logSecurity } from "@/lib/audit";

/**
 * PATCH /api/usuarios/:id/clave
 * Entorno DEDICADO de restablecimiento de contraseña (separado de la
 * edición de ficha): un administrador de empresa restablece la clave de
 * SU personal; el administrador de plataforma puede hacerlo para
 * cualquier funcionario de cualquier empresa. Nunca restablece la clave
 * de otro administrador de plataforma (eso solo se cambia uno mismo,
 * ver /api/mi-cuenta/clave).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await getSessionContext();
    if (!ctx || !canManageUsers(ctx.user.systemRole)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const [target] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "Funcionario no encontrado." }, { status: 404 });

    if (!ctx.isPlatformAdmin && target.organizationId !== ctx.orgId) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    if (target.systemRole === "superadmin" && target.id !== ctx.user.id) {
      return NextResponse.json(
        { error: "La clave de un administrador de plataforma solo puede cambiarla él mismo." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === "set" ? "set" : "generate";
    const forceChange = body?.forceChange !== false;

    let plain: string;
    if (mode === "set") {
      plain = String(body?.newPassword ?? "").trim();
      if (plain.length < 6) {
        return NextResponse.json(
          { error: "La contraseña debe tener al menos 6 caracteres." },
          { status: 400 }
        );
      }
    } else {
      plain = generateTempPassword();
    }

    const { hash, salt } = hashPassword(plain);
    await db
      .update(users)
      .set({ passwordHash: hash, passwordSalt: salt, mustChangePassword: forceChange })
      .where(eq(users.id, id));

    await logSecurity([
      {
        documentId: null,
        organizationId: target.organizationId,
        event: "clave_restablecida",
        result: "ok",
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Contraseña de acceso restablecida para ${target.name} (${target.email})${
          forceChange ? " · deberá definir una nueva en su próximo ingreso" : ""
        }`,
      },
    ]);

    return NextResponse.json({ ok: true, password: plain });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo restablecer la contraseña." }, { status: 500 });
  }
}
