import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { generateSigningKeyPair } from "@/lib/pki";
import { logSecurity } from "@/lib/audit";

/**
 * Garantiza que el funcionario tenga su par de claves personal.
 * Se genera bajo demanda la primera vez que firma y queda registrado.
 */
export async function ensureSigningKeys(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return null;
  if (u.signingPublicKey && u.signingPrivateKeyEnc) {
    return {
      publicPem: u.signingPublicKey,
      privateEnc: u.signingPrivateKeyEnc,
      fingerprint: u.signingKeyFingerprint ?? "",
      created: false,
    };
  }
  const pair = generateSigningKeyPair();
  await db
    .update(users)
    .set({
      signingPublicKey: pair.publicPem,
      signingPrivateKeyEnc: pair.privateEnc,
      signingKeyFingerprint: pair.fingerprint,
      signingKeyCreatedAt: new Date(),
    })
    .where(eq(users.id, userId));
  await logSecurity([
    {
      documentId: null,
      event: "emision_llave",
      result: "ok",
      actorName: u.name,
      actorEmail: u.email,
      detail: `Par Ed25519 emitido · huella ${pair.fingerprint}`,
    },
  ]);
  return { ...pair, created: true };
}
