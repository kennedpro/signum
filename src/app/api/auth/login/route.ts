import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_COOKIE,
  createSessionToken,
  findByLogin,
  verifyPassword,
} from "@/lib/auth";
import { logSecurity } from "@/lib/audit";

/** El registro de auditoría nunca debe impedir la autenticación. */
async function safeLog(entries: Parameters<typeof logSecurity>[0]) {
  try {
    await logSecurity(entries);
  } catch (e) {
    console.error("[auth] no se pudo escribir la pista de seguridad:", e);
  }
}

/** Recorre `cause` porque Drizzle envuelve el error real de PostgreSQL. */
function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && !seen.has(current) && parts.length < 6) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      current = current.cause;
    } else if (typeof current === "object" && current && "message" in current) {
      parts.push(String((current as { message: unknown }).message));
      current = "cause" in current ? (current as { cause?: unknown }).cause : null;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join(" · ");
}

/** Traduce fallos de base de datos a instrucciones accionables. */
function dbHint(message: string): string | null {
  if (/password authentication failed|SASL|SCRAM/i.test(message)) {
    return "Neon rechazó la contraseña de DATABASE_URL. En Neon pulse Connect, copie la conexión actual y reemplácela en .env; después reinicie npm run dev.";
  }
  if (/column .*username.* does not exist/i.test(message)) {
    return "La base de datos tiene un esquema desactualizado (falta «username»). Ejecute: node scripts/reset-db.mjs";
  }
  if (/relation .*(users|security_logs|organizations).* does not exist/i.test(message)) {
    return "Las tablas no existen. Ejecute: npx drizzle-kit push --force y luego npx tsx src/db/seed.ts";
  }
  if (/column .*(password_hash|system_role|active).* does not exist/i.test(message)) {
    return "Faltan columnas de autenticación. Ejecute: node scripts/reset-db.mjs";
  }
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|getaddrinfo/i.test(message)) {
    return "No hay conexión con Neon. Verifique DATABASE_URL con: npx tsx scripts/check-db.ts";
  }
  return null;
}

export async function POST(req: Request) {
  // Garantiza JSON siempre (evita el error "Unexpected token '<'")
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;

  try {
    const body = await req.json();
    const login = String(body.login ?? "").trim();
    const password = String(body.password ?? "");

    if (!login || !password) {
      return NextResponse.json({ error: "Ingrese usuario y contraseña." }, { status: 400 });
    }

    const user = await findByLogin(login);

    // Sin usuarios en la base: la semilla no se ha ejecutado
    if (!user) {
      const [{ total }] = await db
        .select({ total: users.id })
        .from(users)
        .limit(1)
        .then((r) => (r.length ? [{ total: 1 }] : [{ total: 0 }]));

      if (total === 0) {
        return NextResponse.json(
          {
            error:
              "No hay usuarios registrados. Ejecute en la terminal: npx tsx src/db/seed.ts",
          },
          { status: 503 }
        );
      }
    }

    const ok =
      user &&
      user.active === "si" &&
      verifyPassword(password, user.passwordHash, user.passwordSalt);

    if (!ok) {
      await safeLog([
        {
          documentId: null,
          event: "acceso_denegado",
          result: "fail",
          actorName: user?.name ?? login,
          actorEmail: user?.email ?? null,
          detail: user
            ? user.active !== "si"
              ? "Cuenta inactiva"
              : "Contraseña incorrecta"
            : "Usuario inexistente",
          ip,
          userAgent: ua,
        },
      ]);
      return NextResponse.json(
        {
          error:
            user && user.active !== "si"
              ? "La cuenta está inactiva. Contacte al administrador."
              : "Usuario o contraseña incorrectos.",
        },
        { status: 401 }
      );
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    await safeLog([
      {
        documentId: null,
        event: "acceso_concedido",
        result: "ok",
        actorName: user.name,
        actorEmail: user.email,
        detail: `Inicio de sesión · rol ${user.systemRole}`,
        ip,
        userAgent: ua,
      },
    ]);

    const res = NextResponse.json({ ok: true, name: user.name });
    res.cookies.set({
      name: SESSION_COOKIE,
      value: createSessionToken(user.id),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 8 * 60 * 60,
    });
    return res;
  } catch (e) {
    const message = errorChain(e);
    console.error("[auth] error al iniciar sesión:", message);
    return NextResponse.json(
      {
        error:
          dbHint(message) ??
          "No se pudo consultar la base de datos. Ejecute: npx tsx scripts/check-db.ts",
      },
      { status: 500 }
    );
  }
}
