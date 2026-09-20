import { NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { cleanIdentity } from "@/lib/sanitize";
import { getSessionContext, hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/password";
import { hashSignPassword, generateSignPassword } from "@/lib/crypto-sign";
import { logAudit } from "@/lib/audit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/plataforma/empresas
 * Módulo de ONBOARDING — exclusivo del administrador de PLATAFORMA.
 * Crea el "ambiente" individual de una empresa nueva (pública o privada)
 * junto con su primer administrador, listo para operar de inmediato:
 * el resto de funcionarios los da de alta ese administrador desde su
 * propio módulo de Funcionarios.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getSessionContext();
    if (!ctx || !ctx.isPlatformAdmin) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const body = await req.json();
    const name = cleanIdentity(body.name, 140) ?? "";
    const entityType = body.entityType === "privada" ? "privada" : "publica";
    const nit = cleanIdentity(body.nit, 30) ?? "";
    const sigla = (cleanIdentity(body.sigla, 20) ?? "").toUpperCase();
    const city = cleanIdentity(body.city, 80) ?? "Bogotá D.C.";
    const address = cleanIdentity(body.address, 160) ?? "";
    const phone = cleanIdentity(body.phone, 40) ?? "";
    const website = cleanIdentity(body.website, 120) ?? "";
    const primaryColor = /^#[0-9a-fA-F]{6}$/.test(String(body.primaryColor ?? ""))
      ? String(body.primaryColor)
      : entityType === "privada"
        ? "#7c3aed"
        : "#0ea5e9";

    if (name.length < 3) {
      return NextResponse.json({ error: "El nombre de la empresa es obligatorio." }, { status: 400 });
    }
    if (sigla.length < 2 || !/^[A-Z0-9-]+$/.test(sigla)) {
      return NextResponse.json(
        { error: "La sigla es obligatoria (solo letras, números y guiones)." },
        { status: 400 }
      );
    }

    const admin = body.admin ?? {};
    const adminName = cleanIdentity(admin.name, 120) ?? "";
    const adminEmail = (cleanIdentity(admin.email, 160) ?? "").toLowerCase();
    const adminUsername = (cleanIdentity(admin.username, 60) ?? "").toLowerCase() || null;
    const adminCargo = cleanIdentity(admin.cargo, 90) ?? "Administrador";
    if (adminName.length < 3 || !EMAIL_RE.test(adminEmail)) {
      return NextResponse.json(
        { error: "Nombre y correo del administrador de la empresa son obligatorios." },
        { status: 400 }
      );
    }

    const [siglaTaken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.sigla, sigla)).limit(1);
    if (siglaTaken) {
      return NextResponse.json({ error: `Ya existe una empresa con la sigla "${sigla}".` }, { status: 409 });
    }
    const [emailTaken] = await db
      .select({ id: users.id })
      .from(users)
      .where(adminUsername ? or(eq(users.email, adminEmail), eq(users.username, adminUsername)) : eq(users.email, adminEmail))
      .limit(1);
    if (emailTaken) {
      return NextResponse.json(
        { error: "Ese correo o usuario ya está registrado en otra cuenta." },
        { status: 409 }
      );
    }

    let password = String(admin.password ?? "").trim();
    let generated = false;
    if (!password) {
      password = generateTempPassword();
      generated = true;
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres." }, { status: 400 });
    }

    const [org] = await db
      .insert(organizations)
      .values({
        name,
        entityType,
        nit,
        sigla,
        city,
        address,
        phone,
        website,
        logoVariant: entityType === "privada" ? "corporativo" : "institucional",
        primaryColor,
      })
      .returning();

    const creds = hashPassword(password);
    const sign = hashSignPassword(generateSignPassword());
    await db.insert(users).values({
      organizationId: org.id,
      name: adminName,
      email: adminEmail,
      username: adminUsername,
      passwordHash: creds.hash,
      passwordSalt: creds.salt,
      role: adminCargo,
      systemRole: "admin",
      department: "Dirección",
      color: entityType === "privada" ? "#a78bfa" : "#0ea5e9",
      cargo: adminCargo,
      mustChangePassword: true,
      signPasswordHash: sign.hash,
      signPasswordSalt: sign.salt,
    });

    await logAudit([
      {
        documentId: null,
        action: "editado",
        label: `Nueva empresa creada: ${name} (${sigla})`,
        actorName: ctx.user.name,
        actorEmail: ctx.user.email,
        detail: `Tipo ${entityType.toUpperCase()} · administrador inicial ${adminName} <${adminEmail}>`,
      },
    ]);

    return NextResponse.json({
      ok: true,
      org: { id: org.id, name: org.name, sigla: org.sigla, entityType: org.entityType },
      admin: { name: adminName, email: adminEmail, username: adminUsername, password },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo crear la empresa." }, { status: 500 });
  }
}
