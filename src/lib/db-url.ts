/**
 * Normalización de la cadena de conexión.
 *
 * Los proveedores gestionados (Neon, Supabase, Railway…) entregan URLs con
 * parámetros pensados para libpq —como `channel_binding`— que node-postgres
 * no negocia igual y que en Windows provocan fallos de handshake.
 * Aquí se depuran esos parámetros y se determina la política TLS.
 *
 * La conexión sigue siendo cifrada: solo se omite la validación de la cadena
 * de certificados, que en equipos Windows a menudo no está disponible.
 */

const MANAGED_HOSTS =
  /\.neon\.tech|\.supabase\.co|\.render\.com|\.railway\.app|\.aivencloud\.com|\.cockroachlabs\.cloud|\.azure\.com|\.rds\.amazonaws\.com/i;

export function needsSsl(url: string) {
  return /sslmode=(require|verify-ca|verify-full)/i.test(url) || MANAGED_HOSTS.test(url);
}

/** Elimina parámetros incompatibles y deja la URL lista para `pg`. */
export function normalizeDbUrl(raw: string): string {
  let url = raw.trim();

  // Algunos editores dejan comillas al pegar la cadena
  if (
    (url.startsWith('"') && url.endsWith('"')) ||
    (url.startsWith("'") && url.endsWith("'"))
  ) {
    url = url.slice(1, -1);
  }

  const [base, query = ""] = url.split("?");
  if (!query) return url;

  /**
   * `sslmode` se retira porque la política TLS se define explícitamente en la
   * configuración del Pool; dejarlo genera un aviso de obsolescencia en `pg`.
   * `channel_binding` no lo negocia node-postgres igual que libpq.
   */
  const drop = new Set([
    "sslmode",
    "channel_binding",
    "options",
    "target_session_attrs",
  ]);
  const kept = query
    .split("&")
    .filter((p) => p && !drop.has(p.split("=")[0].toLowerCase()));

  return kept.length ? `${base}?${kept.join("&")}` : base;
}
