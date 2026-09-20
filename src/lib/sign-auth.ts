import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifySignPassword } from "@/lib/crypto-sign";
import { verifyPassword } from "@/lib/password";
import { hashOtp } from "@/lib/pki";

/**
 * Cada funcionario tiene su propia firma digital (clave personal en `users`).
 * Los destinatarios externos, sin ficha, usan la clave de un solo uso del sobre.
 */
export async function verifyPersonalSignature(opts: {
  password: string;
  email: string;
  recipientHash?: string | null;
  recipientSalt?: string | null;
}) {
  const password = String(opts.password ?? "");
  const [officer] = await db
    .select()
    .from(users)
    .where(eq(users.email, opts.email.toLowerCase()))
    .limit(1);

  if (officer) {
    const personal = verifySignPassword(
      password,
      officer.signPasswordHash,
      officer.signPasswordSalt
    );
    const login = verifyPassword(password, officer.passwordHash, officer.passwordSalt);
    return {
      ok: personal || login,
      officer,
      source: personal ? ("firma_personal" as const) : login ? ("acceso" as const) : null,
    };
  }

  const oneTime = verifySignPassword(password, opts.recipientHash, opts.recipientSalt);
  return { ok: oneTime, officer: null, source: oneTime ? ("sobre" as const) : null };
}

/** Valida el OTP de intención emitido para este destinatario. */
export function verifyOtpFor(
  recipient: {
    id: string;
    otpHash: string | null;
    otpExpiresAt: Date | null;
    otpAttempts: number;
  },
  code: string
): { ok: boolean; reason?: "sin_otp" | "vencido" | "agotado" | "incorrecto" } {
  if (!recipient.otpHash || !recipient.otpExpiresAt) return { ok: false, reason: "sin_otp" };
  if (recipient.otpExpiresAt.getTime() < Date.now()) return { ok: false, reason: "vencido" };
  if (recipient.otpAttempts >= 5) return { ok: false, reason: "agotado" };
  const ok = hashOtp(code, recipient.id) === recipient.otpHash;
  return ok ? { ok: true } : { ok: false, reason: "incorrecto" };
}
