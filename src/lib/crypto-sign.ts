import crypto from "crypto";

/* ═══════════════════════════════════════════════════════════════════
   MOTOR CRIPTOGRÁFICO
   Contraseña adicional de firma (segundo factor), estampa de tiempo
   oficial y doble sellado SHA-256 (pre-firma / post-firma).
   ═══════════════════════════════════════════════════════════════════ */

/** SHA-256 sobre la concatenación canónica de las partes. */
export function sha256(parts: (string | null | undefined)[]) {
  return crypto
    .createHash("sha256")
    .update(parts.filter((p) => p != null).join("|"), "utf8")
    .digest("hex");
}

export const sealHash = sha256;

/** Token público de 192 bits para enlaces de firma. */
export function signToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** Clave de firma legible entregada fuera de banda (out-of-band). */
export function generateSignPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

// ─── Derivación scrypt de la contraseña adicional ────────────────────
export function hashSignPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password.trim(), salt, 64).toString("hex");
  return { hash, salt };
}

export function verifySignPassword(
  password: string,
  hash?: string | null,
  salt?: string | null
) {
  if (!hash || !salt) return false;
  try {
    const candidate = crypto.scryptSync(String(password).trim(), salt, 64);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ─── Estampa de tiempo oficial (NTP con degradación segura) ───────── */
export type Stamp = { iso: string; source: string };

export async function officialTimestamp(): Promise<Stamp> {
  try {
    const res = await fetch("https://worldtimeapi.org/api/timezone/Etc/UTC", {
      signal: AbortSignal.timeout(1200),
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as { utc_datetime?: string };
      if (data.utc_datetime) {
        return { iso: new Date(data.utc_datetime).toISOString(), source: "NTP:worldtimeapi/UTC" };
      }
    }
  } catch {
    /* sin red: se degrada al reloj monotónico del servidor */
  }
  return { iso: new Date().toISOString(), source: "SYS:server-utc" };
}

/**
 * DOBLE SELLADO.
 * hashPre  → huella del documento con el hueco en blanco (texto inferior ya
 *            acomodado en sus coordenadas definitivas).
 * hashPost → huella tras inyectar el bloque visual y congelar el archivo.
 */
export function computePreHash(input: {
  documentId: string;
  content: string;
  slot: number;
  signerEmail: string;
  ntpIso: string;
}) {
  return sha256([
    "PRE",
    input.documentId,
    input.content,
    `slot:${input.slot}`,
    input.signerEmail,
    input.ntpIso,
  ]);
}

export function computePostHash(input: {
  hashPre: string;
  prevHash: string | null;
  stampPayload: string;
  signatureData: string;
  ntpIso: string;
}) {
  return sha256([
    "POST",
    input.hashPre,
    input.prevHash ?? "GENESIS",
    input.stampPayload,
    input.signatureData.slice(0, 128),
    input.ntpIso,
  ]);
}

/** Anti fuerza bruta: bloqueo temporal progresivo. */
export const MAX_ATTEMPTS = 5;
export function lockWindowMs(attempts: number) {
  if (attempts < MAX_ATTEMPTS) return 0;
  return Math.min(30 * 60_000, 2 ** (attempts - MAX_ATTEMPTS) * 60_000);
}
