import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "signum_session";

/**
 * Guarda de acceso (convención `proxy.ts` de Next.js 16).
 * Comprueba la presencia y vigencia de la cookie de sesión; la verificación
 * criptográfica de la firma se realiza en el layout del servidor.
 * Las rutas públicas (login, portal de firma, health) quedan exentas.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/firmar") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/firmar") ||
    pathname.startsWith("/verificar") ||
    pathname.startsWith("/api/verificar") ||
    pathname.startsWith("/api/health");

  if (isPublic) return NextResponse.next();

  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const parts = raw?.split(".") ?? [];
  const exp = parts.length === 3 ? Number(parts[1]) : 0;
  const valid = parts.length === 3 && Number.isFinite(exp) && exp > Date.now();

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
