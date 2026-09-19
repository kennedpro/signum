import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";
import { canManageUsers, getSessionContext, getSessionUser, hashPassword } from "@/lib/auth";
import { hashSignPassword } from "@/lib/crypto-sign";
import { logAudit, logSecurity } from "@/lib/audit";

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
  if (!me || !canManageUsers(me.systemRole)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const data = payload(body);
    const password = String(body.password ?? "").trim();

    if (data.name.length < 3 || !EMAIL_RE.test(data.email)) {
      return NextResponse.json({ error: "Nombre y correo son obligatorios." }, { status: 400 });
    }
    if (password.length < 4) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 4 caracteres." },
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

    return NextResponse.json({ ok: true });
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
  const me = await getSessionUser();
  if (!me || !canManageUsers(me.systemRole)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  try {
    const body = await req.json();
    const id = cleanIdentity(body.id, 60);
    if (!id) return NextResponse.json({ error: "Falta el identificador." }, { status: 400 });

    const data = payload(body);
    const password = String(body.password ?? "").trim();
    const patch: Record<string, unknown> = { ...data };

    if (password) {
      if (password.length < 4) {
        return NextResponse.json({ error: "Contraseña demasiado corta." }, { status: 400 });
      }
      const creds = hashPassword(password);
      patch.passwordHash = creds.hash;
      patch.passwordSalt = creds.salt;
      await logSecurity([
        {
          documentId: null,
          event: "autorizacion",
          result: "ok",
          actorName: me.name,
          actorEmail: me.email,
          detail: `Contraseña de acceso restablecida para ${data.name}`,
        },
      ]);
    }
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
