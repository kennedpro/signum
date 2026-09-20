/* ═══════════════════════════════════════════════════════════════════
   LIMITADOR DE INTENTOS (en memoria, por proceso)

   Protege el inicio de sesión y los endpoints públicos por token frente
   a fuerza bruta y enumeración. Ventana deslizante con bloqueo temporal;
   la clave combina IP + identificador (usuario o token) para no castigar
   a toda una oficina detrás de la misma IP por un único atacante.

   Al ser en memoria, en un despliegue con varias instancias cada una
   lleva su propio contador (suficiente como primera barrera; la base de
   datos ya aplica bloqueos persistentes en la firma).
   ═══════════════════════════════════════════════════════════════════ */

type Bucket = { count: number; first: number; blockedUntil: number };

const g = globalThis as typeof globalThis & { __signumRate?: Map<string, Bucket> };
const store = (g.__signumRate ??= new Map<string, Bucket>());

const MAX_KEYS = 20_000;

function prune(now: number) {
  if (store.size < MAX_KEYS) return;
  for (const [k, b] of store) {
    if (b.blockedUntil < now && now - b.first > 60 * 60 * 1000) store.delete(k);
    if (store.size < MAX_KEYS / 2) break;
  }
}

export type RateOptions = {
  /** Intentos permitidos dentro de la ventana */
  limit: number;
  /** Ventana en ms */
  windowMs: number;
  /** Bloqueo en ms al superar el límite */
  blockMs: number;
};

export const RATE_LOGIN: RateOptions = { limit: 6, windowMs: 10 * 60 * 1000, blockMs: 15 * 60 * 1000 };
export const RATE_TOKEN: RateOptions = { limit: 20, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 };

/** Registra un intento y devuelve si está permitido y cuántos segundos faltan si está bloqueado. */
export function hit(key: string, opts: RateOptions): { ok: boolean; retryAfterSec: number; remaining: number } {
  const now = Date.now();
  prune(now);
  const b = store.get(key);
  if (b && b.blockedUntil > now) {
    return { ok: false, retryAfterSec: Math.ceil((b.blockedUntil - now) / 1000), remaining: 0 };
  }
  if (!b || now - b.first > opts.windowMs) {
    store.set(key, { count: 1, first: now, blockedUntil: 0 });
    return { ok: true, retryAfterSec: 0, remaining: opts.limit - 1 };
  }
  b.count += 1;
  if (b.count > opts.limit) {
    b.blockedUntil = now + opts.blockMs;
    return { ok: false, retryAfterSec: Math.ceil(opts.blockMs / 1000), remaining: 0 };
  }
  return { ok: true, retryAfterSec: 0, remaining: opts.limit - b.count };
}

/** Limpia el contador (p. ej. tras un inicio de sesión correcto). */
export function reset(key: string) {
  store.delete(key);
}

/** IP del cliente (primer salto de X-Forwarded-For) o "local". */
export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Respuesta 429 uniforme con Retry-After. */
export function tooMany(retryAfterSec: number, message = "Demasiados intentos. Inténtelo más tarde.") {
  return new Response(JSON.stringify({ error: message, retryAfterSec }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" },
  });
}
