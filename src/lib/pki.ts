import crypto from "crypto";
import { readEnv } from "@/lib/env";

/* ═══════════════════════════════════════════════════════════════════
   PKI INTERNA — FIRMA ASIMÉTRICA POR FUNCIONARIO (Ed25519)

   Cada usuario posee un par de claves propio. La clave privada nunca se
   almacena en claro: se cifra con AES-256-GCM usando una clave maestra
   del servidor (SIGNING_MASTER_KEY). Así:

   · Identificación del firmante  → solo su clave privada produce la firma
   · Intención                    → la firma cubre el texto de consentimiento
   · Integridad                   → la firma cubre el hash del documento

   Cualquier tercero puede verificar con la clave pública, sin contraseñas.
   ═══════════════════════════════════════════════════════════════════ */

const ALG = "Ed25519";

function masterKey(): Buffer {
  const raw =
    readEnv("SIGNING_MASTER_KEY") ??
    readEnv("SESSION_SECRET") ??
    "signum-dev-master-key-cambiar-en-produccion";
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/** Genera un par Ed25519 y devuelve la privada cifrada + la pública en PEM. */
export function generateSigningKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return {
    publicPem,
    privateEnc: encryptPrivateKey(privatePem),
    fingerprint: keyFingerprint(publicPem),
  };
}

/** Huella corta y legible de la clave pública (SHA-256, formato XX:XX:…). */
export function keyFingerprint(publicPem: string) {
  const der = crypto.createPublicKey(publicPem).export({ type: "spki", format: "der" });
  const hex = crypto.createHash("sha256").update(der).digest("hex");
  return hex.slice(0, 32).match(/.{2}/g)!.join(":").toUpperCase();
}

function encryptPrivateKey(pem: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const enc = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

function decryptPrivateKey(payload: string) {
  const [v, ivB, tagB, encB] = payload.split(".");
  if (v !== "v1") throw new Error("Formato de clave privada no reconocido");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    Buffer.from(ivB, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encB, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Carga útil canónica que se firma. Orden fijo y JSON estable, para que la
 * verificación sea reproducible por un perito independiente.
 */
export type CanonicalSignature = {
  version: "signum-sig-1";
  documentId: string;
  documentHash: string;
  slot: number;
  signer: {
    name: string;
    email: string;
    cedula: string | null;
    cargo: string | null;
    organization: string | null;
  };
  consentText: string;
  consentHash: string;
  authFactors: string[];
  timestamp: string;
  timestampSource: string;
  prevSignatureHash: string | null;
  rubricHash: string;
};

export function canonicalize(payload: CanonicalSignature) {
  const sorted = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sorted((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sorted(payload));
}

/** Firma la carga canónica con la clave privada del funcionario. */
export function signCanonical(privateEnc: string, canonical: string) {
  const privateKey = crypto.createPrivateKey(decryptPrivateKey(privateEnc));
  return crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64");
}

/** Verificación pública: no requiere secretos. */
export function verifyCanonical(publicPem: string, canonical: string, signatureB64: string) {
  try {
    const publicKey = crypto.createPublicKey(publicPem);
    return crypto.verify(
      null,
      Buffer.from(canonical, "utf8"),
      publicKey,
      Buffer.from(signatureB64, "base64")
    );
  } catch {
    return false;
  }
}

export const SIGNATURE_ALG = ALG;

/* ─── OTP de intención (código de 6 dígitos, 5 minutos) ──────────── */
export function generateOtp() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export function hashOtp(code: string, recipientId: string) {
  return crypto
    .createHmac("sha256", masterKey())
    .update(`${recipientId}:${code.trim()}`)
    .digest("hex");
}

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

/** Texto legal que el firmante acepta. Se firma tal cual. */
export function consentStatement(opts: {
  signerName: string;
  docTitle: string;
  docNumber: string | null;
  documentHash: string;
}) {
  return [
    `Yo, ${opts.signerName}, declaro que he leído íntegramente el documento`,
    `"${opts.docTitle}"${opts.docNumber ? ` (No. ${opts.docNumber})` : ""},`,
    `cuya huella SHA-256 es ${opts.documentHash},`,
    "y manifiesto de forma libre, expresa e inequívoca mi voluntad de firmarlo",
    "electrónicamente, con los mismos efectos jurídicos de mi firma manuscrita,",
    "conforme a la Ley 527 de 1999 y al Decreto 2364 de 2012 de la República de Colombia.",
  ].join(" ");
}
