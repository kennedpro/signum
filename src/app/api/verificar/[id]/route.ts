import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, organizations, signatures } from "@/db/schema";
import { sha256 } from "@/lib/crypto-sign";
import { verifyCanonical } from "@/lib/pki";
import { verifyDocumentChain } from "@/lib/audit";

/**
 * VERIFICACIÓN INDEPENDIENTE (pública, sin sesión).
 * Recalcula las huellas, valida cada firma Ed25519 con su clave pública y
 * comprueba la cadena de auditoría. Es lo que un perito ejecutaría.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const [org] = doc.organizationId
    ? await db.select().from(organizations).where(eq(organizations.id, doc.organizationId)).limit(1)
    : [null];

  const sigs = await db
    .select()
    .from(signatures)
    .where(eq(signatures.documentId, id))
    .orderBy(asc(signatures.slot), asc(signatures.createdAt));

  const documentHashNow = sha256([doc.content]);

  const checks = sigs.map((s) => {
    let payload: Record<string, unknown> | null = null;
    try {
      payload = s.canonicalPayload ? JSON.parse(s.canonicalPayload) : null;
    } catch {
      payload = null;
    }
    const payloadDocHash = (payload?.documentHash as string | undefined) ?? null;
    const integrity = payloadDocHash ? payloadDocHash === documentHashNow : null;
    const consentIntegrity =
      s.consentText && s.consentHash ? sha256([s.consentText]) === s.consentHash : null;
    const asymmetric =
      s.signerPublicKey && s.signatureValue && s.canonicalPayload
        ? verifyCanonical(s.signerPublicKey, s.canonicalPayload, s.signatureValue)
        : null;

    return {
      slot: s.slot,
      signer: {
        name: s.signerName,
        email: s.signerEmail,
        cedula: s.signerCedula,
        cargo: s.signerCargo,
      },
      signedAt: s.createdAt.toISOString(),
      timestampSource: s.ntpSource,
      algorithm: s.signatureAlg ?? "SHA-256-CHAIN",
      keyFingerprint: s.signerKeyFingerprint,
      authFactors: s.authFactors?.split(",") ?? [],
      otpVerified: Boolean(s.otpVerifiedAt),
      consentPresent: Boolean(s.consentText),
      results: {
        identidad: asymmetric,
        intencion: consentIntegrity === null ? null : consentIntegrity && Boolean(s.otpVerifiedAt),
        integridad: integrity,
      },
      hashPre: s.hashPre,
      hashPost: s.hashPost,
      publicKeyPem: s.signerPublicKey,
    };
  });

  const chain = await verifyDocumentChain(id);
  const allTrue = (k: "identidad" | "intencion" | "integridad") =>
    checks.length > 0 && checks.every((c) => c.results[k] !== false);

  return NextResponse.json({
    document: {
      id: doc.id,
      title: doc.title,
      number: doc.docNumber,
      type: doc.docType,
      status: doc.status,
      organization: org?.name ?? null,
      nit: org?.nit ?? null,
      sealHash: doc.sealHash,
      lockedAt: doc.lockedAt?.toISOString() ?? null,
      documentHash: documentHashNow,
    },
    legalBasis: ["Ley 527 de 1999", "Decreto 2364 de 2012", "Ley Modelo CNUDMI sobre Firmas Electrónicas"],
    verdict: {
      identidad: allTrue("identidad"),
      intencion: allTrue("intencion"),
      integridad: allTrue("integridad") && chain.ok,
      auditChain: chain.ok ? "íntegra" : `rota en el eslabón ${chain.brokenAt}`,
      valid:
        allTrue("identidad") && allTrue("intencion") && allTrue("integridad") && chain.ok,
    },
    signatures: checks,
    verifiedAt: new Date().toISOString(),
  });
}
