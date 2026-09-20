import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";
import { canManageUsers, getSessionContext, hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";
import { hashSignPassword } from "@/lib/crypto-sign";
import { logAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.?[^\s@]*$/;

function payload(body: Record<string, unknown>) {
  return {
    name: cleanIdentity(body.name, 120) ?? "",
    email: (cleanIdentity(body.email, 160) ?? "").toLowerCase(),
    username: (cleanIdentity(body.username, 60) ?? "").toLowerCase() || null,
    role: cleanIdentity(body.role, 90) ?? "Miembro",
    systemRole: ["admin", "jefe_gestion", "usuario"].includes(String(body.systemRole))
      ? String(body.systemRole)
      : "usuario",
    department: cleanIdentity(body.department, 90) ?? "Dirección",
    photoUrl: cleanIdentity(body.photoUrl, 400),
    grado: cleanIdentity(body.grado, 40),
    cargo: cleanIdentity(body.cargo, 70),
    cedula: cleanIdentity(body.cedula, 20),
    dependencia: cleanIdentity(body.dependencia, 95),
    unidad: cleanIdentity(body.unidad, 95),
    area: cleanIdentity(body.area, 70),
    sucursal: cleanIdentity(body.sucursal, 70),
    active: body.active === false ? "no" : "si",
  };
}

/** Alta de funcionario en el registro. */
export async function POST(req: Request) {
  const ctx = await getSessionContext();
  const me = ctx?.user;
  if (!ctx || !me || !canManageUsers(me.systemRole)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  if (!ctx.orgId) {
    return NextResponse.json(
      { error: "Elija una entidad activa antes de crear funcionarios." },
      { status: 400 }
    );
  }
  try {
    const body = await req.json();
    const data = payload(body);
    // Contraseña de acceso: si el administrador la deja en blanco se genera
    // una temporal (entorno de creación pensado para producción real, sin
    // depender de contraseñas de demostración fijas).
    let password = String(body.password ?? "").trim();
    let generated = false;
    if (!password) {
      password = generateTempPassword();
      generated = true;
    }

    if (data.name.length < 3 || !EMAIL_RE.test(data.email)) {
      return NextResponse.json({ error: "Nombre y correo son obligatorios." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres." },
        { status: 400 }
      );
    }

    const creds = hashPassword(password);
    const signPlain = String(body.signPassword ?? "").trim() || password;
    const sign = hashSignPassword(signPlain);
    await db.insert(users).values({
      ...data,
      organizationId: ctx.orgId,
      color: cleanIdentity(body.color, 20) ?? "#22d3ee",
      passwordHash: creds.hash,
      passwordSalt: creds.salt,
      // Cuenta nueva: debe definir su propia contraseña en el primer ingreso.
      mustChangePassword: true,
      signPasswordHash: sign.hash,
      signPasswordSalt: sign.salt,
    });

    await logAudit([
      {
        documentId: null,
        action: "editado",
        label: `Alta de funcionario: ${data.name}`,
        actorName: me.name,
        actorEmail: me.email,
        detail: `Rol ${data.systemRole} · ${data.cargo ?? data.role}`,
      },
    ]);

    return NextResponse.json({ ok: true, password: generated ? password : undefined });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: "No se pudo crear. ¿El correo o usuario ya existe?" },
      { status: 500 }
    );
  }
}

/** Actualización de ficha y credenciales. */
export async function PATCH(req: Request) {
  const ctx = await getSessionContext();
  const me = ctx?.user;
  if (!ctx || !me || !canManageUsers(me.systemRole)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = cleanIdentity(body.id, 60);
    if (!id) return NextResponse.json({ error: "Falta el identificador." }, { status: 400 });

    // Aislamiento entre empresas: un administrador de EMPRESA solo puede
    // editar funcionarios de su propia organización. El administrador de
    // PLATAFORMA (superadmin) puede editar cualquiera.
    const [target] = await db.select({ organizationId: users.organizationId, systemRole: users.systemRole }).from(users).where(eq(users.id, id)).limit(1);
    if (!target) return NextResponse.json({ error: "Funcionario no encontrado." }, { status: 404 });
    if (!ctx.isPlatformAdmin) {
      if (target.organizationId !== ctx.orgId) {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }
      if (target.systemRole === "superadmin") {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }
    }

    const data = payload(body);
    const patch: Record<string, unknown> = { ...data };
    // La contraseña de ACCESO ya no se toca desde la edición de ficha:
    // tiene su propio entorno dedicado → PATCH /api/usuarios/:id/clave
    // (evita mezclar "editar datos" con "otorgar una clave temporal").
    const signPassword = String(body.signPassword ?? "").trim();
    if (signPassword) {
      if (signPassword.length < 4) {
        return NextResponse.json({ error: "La clave de firma es demasiado corta." }, { status: 400 });
      }
      const sign = hashSignPassword(signPassword);
      patch.signPasswordHash = sign.hash;
      patch.signPasswordSalt = sign.salt;
    }

    await db.update(users).set(patch).where(eq(users.id, id));

    await logAudit([
      {
        documentId: null,
        action: "editado",
        label: `Ficha actualizada: ${data.name}`,
        actorName: me.name,
        actorEmail: me.email,
        detail: `Rol ${data.systemRole}`,
      },
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo actualizar." }, { status: 500 });
  }
}
