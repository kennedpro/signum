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

/**
 * Genera una contraseña temporal legible y robusta (para altas y
 * restablecimientos hechos por un administrador). Se entrega UNA sola
 * vez fuera de banda; el usuario debe cambiarla en su primer ingreso.
 */
export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}
