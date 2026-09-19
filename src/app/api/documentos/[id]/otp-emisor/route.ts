import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, recipients } from "@/db/schema";
import { getSessionContext } from "@/lib/auth";
import { generateOtp, hashOtp, OTP_TTL_MS } from "@/lib/pki";
import { logSecurity } from "@/lib/audit";
import { readEnv } from "@/lib/env";

/**
 * OTP para el EMISOR que firma su propio documento al despachar.
 * El código se guarda sobre su fila de firmante (signer) del documento.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const email = ctx.user.email.toLowerCase().trim();
  const [slot] = await db
    .select()
    .from(recipients)
    .where(
      and(
        eq(recipients.documentId, id),
        eq(recipients.kind, "signer"),
        sql`lower(${recipients.email}) = ${email}`
      )
    )
    .limit(1);
  if (!slot) {
    const [prev] = await db
      .select({ name: recipients.name, email: recipients.email })
      .from(recipients)
      .where(and(eq(recipients.documentId, id), eq(recipients.kind, "signer")))
      .limit(1);
    return NextResponse.json(
      {
        error: prev
          ? `El firmante designado es ${prev.name} (${prev.email}). ` +
            `Usted está firmando como ${email}.`
          : "Este documento no tiene firmantes configurados.",
      },
      { status: 409 }
    );
  }

  const code = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL_MS);
  await db
    .update(recipients)
    .set({ otpHash: hashOtp(code, slot.id), otpExpiresAt: expires, otpAttempts: 0, otpVerifiedAt: null })
    .where(eq(recipients.id, slot.id));

  const h = await headers();
  await logSecurity([
    {
      documentId: doc.id,
      recipientId: slot.id,
      event: "otp_emitido",
      result: "ok",
      actorName: ctx.user.name,
      actorEmail: ctx.user.email,
      detail: "Código de intención para firma del emisor",
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  ]);

  const demo = (readEnv("OTP_DELIVERY") ?? "demo") === "demo";
  return NextResponse.json({
    ok: true,
    channel: demo ? "demo" : "email",
    maskedEmail: ctx.user.email.replace(/^(..).*(@.*)$/, "$1••••$2"),
    expiresAt: expires.toISOString(),
    ...(demo ? { demoCode: code } : {}),
  });
}
