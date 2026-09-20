import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";
import { getSessionContext, hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";
import { hashSignPassword } from "@/lib/crypto-sign";
import { logAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/plataforma/usuarios
 * Módulo de ASIGNACIÓN/CREACIÓN de usuarios — exclusivo del administrador
 * de PLATAFORMA. A diferencia de POST /api/usuarios (que crea siempre en
 * la empresa activa de quien hace la petición), este endpoint recibe la
 * empresa de destino de forma explícita: permite dar de alta un usuario
 * en CUALQUIER empresa sin necesidad de "entrar" primero a esa entidad.
 * Los metadatos detallados de firma (grado, dependencia, cédula…) se
 * completan luego desde el módulo de Funcionarios de esa empresa.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx || !ctx.isPlatformAdmin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const body = await req.json();
    const organizationId = cleanIdentity(body.organizationId, 60);
    if (!organizationId) {
      return NextResponse.json({ error: "Seleccione la empresa de destino." }, { status: 400 });
    }
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    if (!org) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

    const name = cleanIdentity(body.name, 120) ?? "";
    const email = (cleanIdentity(body.email, 160) ?? "").toLowerCase();
    const username = (cleanIdentity(body.username, 60) ?? "").toLowerCase() || null;
    const cargo = cleanIdentity(body.cargo, 90) ?? "";
    const systemRole = ["admin", "jefe_gestion", "usuario"].includes(String(body.systemRole))
      ? String(body.systemRole)
      : "usuario";

    if (name.length < 3 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Nombre y correo son obligatorios." }, { status: 400 });
    }

    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(username ? or(eq(users.email, email), eq(users.username, username)) : eq(users.email, email))
      .limit(1);
    if (taken) {
      return NextResponse.json({ error: "Ese correo o usuario ya está registrado." }, { status: 409 });
    }

    let password = String(body.password ?? "").trim();
    let generated = false;
    if (!password) {
      password = generateTempPassword();
      generated = true;
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
    }

    const creds = hashPassword(password);
    const sign = hashSignPassword(password);
    await db.insert(users).values({
      organizationId,
      name,
      email,
      username,
      passwordHash: creds.hash,
      passwordSalt: creds.salt,
      role: cargo || "Miembro",
      systemRole,
      department: "Dirección",
      color: "#22d3ee",
      cargo: cargo || null,
      mustChangePassword: true,
      signPasswordHash: sign.hash,
      signPasswordSalt: sign.salt,
    });

    await logAudit([
      {
        documentId: null,
        action: "editado",
        label: `Alta de usuario desde Plataforma: ${name}`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Empresa ${org.name} (${org.sigla}) · Rol ${systemRole}`,
      },
    ]);

    return NextResponse.json({ ok: true, password: generated ? password : undefined });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo crear el usuario." }, { status: 500 });
  }
}
