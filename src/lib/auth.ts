import crypto from "crypto";
import { cookies } from "next/headers";
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users, type Organization, type User } from "@/db/schema";
import { readEnv } from "@/lib/env";

/* ═══════════════════════════════════════════════════════════════════
   AUTENTICACIÓN Y CONTROL DE ACCESO
   Sesión en cookie firmada con HMAC-SHA256 (httpOnly, sameSite lax).
   ═══════════════════════════════════════════════════════════════════ */

export const SESSION_COOKIE = "signum_session";
export const ORG_COOKIE = "signum_org";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function secret() {
  return (
    readEnv("SESSION_SECRET") ??
    "signum-dev-secret-cambiar-en-produccion-0000000000000000"
  );
}

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string) {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token?: string | null): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expRaw, sig] = parts;
  const payload = `${userId}.${expRaw}`;
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  if (Number(expRaw) < Date.now()) return null;
  return userId;
}

// ─── Contraseñas de acceso (scrypt + sal) ────────────────────────────
export { hashPassword, verifyPassword } from "@/lib/password";

// ─── Sesión activa ───────────────────────────────────────────────────
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.active !== "si") return null;
  return user;
}

/** Busca por nombre de usuario o por correo. */
export async function findByLogin(login: string) {
  const value = login.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, value), eq(users.email, value)))
    .limit(1);
  return user ?? null;
}

// ─── Roles ───────────────────────────────────────────────────────────
export type SystemRole = "admin" | "jefe_gestion" | "usuario";

export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  jefe_gestion: "Jefe de Gestión Documental",
  usuario: "Usuario",
};

/** Acceso a la pista de auditoría de seguridad. */
export function canViewSecurity(role?: string | null) {
  return role === "admin" || role === "jefe_gestion";
}

/** Administración de funcionarios y perfil de la organización. */
export function canManageUsers(role?: string | null) {
  return role === "admin" || role === "jefe_gestion";
}

export function isAdmin(role?: string | null) {
  return role === "admin";
}

export function isPlatformAdmin(role?: string | null) {
  return role === "admin";
}

export type SessionContext = {
  user: User;
  org: Organization | null;
  orgId: string | null;
  isPlatformAdmin: boolean;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const platform = isPlatformAdmin(user.systemRole);
  const jar = await cookies();
  const chosen = jar.get(ORG_COOKIE)?.value ?? null;
  let orgId = user.organizationId;
  if (platform && chosen) orgId = chosen;
  const [org] = orgId
    ? await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1)
    : [null];
  return {
    user,
    org: org ?? null,
    orgId: org?.id ?? user.organizationId ?? null,
    isPlatformAdmin: platform,
  };
}
