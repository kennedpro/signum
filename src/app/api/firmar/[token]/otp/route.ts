import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/pki";
import { logSecurity } from "@/lib/audit";
import { readEnv } from "@/lib/env";

/**
 * Emite un código de un solo uso (OTP) que acredita la INTENCIÓN de firmar.
 * En producción se envía por correo/SMS; en modo demostración se devuelve
 * en la respuesta para poder probar sin servidor de correo.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;

  const [recipient] = await db
    .select()
    .from(recipients)
    .where(eq(recipients.token, token))
    .limit(1);
  if (!recipient || recipient.kind !== "signer") {
    return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
  }
  if (recipient.status === "firmado") {
    return NextResponse.json({ error: "Este documento ya fue firmado." }, { status: 409 });
  }
  const [doc] = await db
    .select({ id: documents.id, title: documents.title, status: documents.status })
    .from(documents)
    .where(eq(documents.id, recipient.documentId))
    .limit(1);
  if (!doc || doc.status !== "en_firma") {
    return NextResponse.json({ error: "El documento no admite firma ahora." }, { status: 409 });
  }

  const code = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL_MS);
  await db
    .update(recipients)
    .set({
      otpHash: hashOtp(code, recipient.id),
      otpExpiresAt: expires,
      otpAttempts: 0,
      otpVerifiedAt: null,
    })
    .where(eq(recipients.id, recipient.id));

  await logSecurity([
    {
      documentId: doc.id,
      recipientId: recipient.id,
      event: "otp_emitido",
      result: "ok",
      actorName: recipient.name,
      actorEmail: recipient.email,
      detail: `Código de intención enviado a ${maskEmail(recipient.email)} · vence ${expires.toISOString()}`,
      ip,
    },
  ]);

  // Canal de entrega: correo real si está configurado; si no, modo demostración.
  const demo = (readEnv("OTP_DELIVERY") ?? "demo") === "demo";

  return NextResponse.json({
    ok: true,
    channel: demo ? "demo" : "email",
    maskedEmail: maskEmail(recipient.email),
    expiresAt: expires.toISOString(),
    ...(demo ? { demoCode: code } : {}),
  });
}

function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!d) return email;
  const head = u.slice(0, 2);
  return `${head}${"•".repeat(Math.max(3, u.length - 2))}@${d}`;
}
