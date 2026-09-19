import crypto from "crypto";

/**
 * Derivación de contraseñas de acceso (scrypt + sal aleatoria).
 * Módulo aislado de `next/headers` para poder usarse también en scripts
 * como la semilla de la base de datos.
 */
export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(
  password: string,
  hash?: string | null,
  salt?: string | null
) {
  if (!hash || !salt) return false;
  try {
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
