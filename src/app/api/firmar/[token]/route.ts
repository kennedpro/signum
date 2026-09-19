import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, organizations, recipients, signatures, users } from "@/db/schema";
import {
  MAX_ATTEMPTS,
  computePostHash,
  computePreHash,
  lockWindowMs,
  officialTimestamp,
  sha256,
  verifySignPassword,
} from "@/lib/crypto-sign";

import { logAudit, logSecurity } from "@/lib/audit";
import { buildStampLines, type EntityType } from "@/lib/entity";
import { verifyOtpFor, verifyPersonalSignature } from "@/lib/sign-auth";
import { addMessage } from "@/lib/messages";
import {
  SIGNATURE_ALG,
  canonicalize,
  consentStatement,
  signCanonical,
  type CanonicalSignature,
} from "@/lib/pki";
import { ensureSigningKeys } from "@/lib/signing-keys";
import { nextRadicado } from "@/lib/radicado";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
  const ua = h.get("user-agent")?.slice(0, 200) ?? null;

  try {
    const { token } = await params;
    const body = await req.json();
    const dataUrl = String(body.dataUrl ?? "");
    const method = body.method === "escrita" ? "escrita" : "dibujada";
    const password = String(body.signPassword ?? "");
    const otpCode = String(body.otp ?? "").trim();
    const consentAccepted = body.consent === true;

    if (!consentAccepted) {
      return NextResponse.json(
        { error: "Debe aceptar la declaración de voluntad para firmar." },
        { status: 400 }
      );
    }

    if (!dataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "La firma no tiene un formato válido." }, { status: 400 });
    }
    if (dataUrl.length > 700_000) {
      return NextResponse.json({ error: "Imagen de firma demasiado grande." }, { status: 400 });
    }

    const [recipient] = await db
      .select()
      .from(recipients)
      .where(eq(recipients.token, token))
      .limit(1);
    if (!recipient) {
      return NextResponse.json({ error: "Enlace no válido." }, { status: 404 });
    }
    if (recipient.kind !== "signer") {
      return NextResponse.json(
        { error: "Este destinatario recibe una copia; no requiere firma." },
        { status: 409 }
      );
    }
    if (recipient.status === "firmado") {
      return NextResponse.json({ error: "Ya firmó este documento." }, { status: 409 });
    }

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, recipient.documentId))
      .limit(1);
    if (!doc) {
      return NextResponse.json({ error: "Documento no disponible." }, { status: 404 });
    }
    if (doc.status !== "en_firma") {
      return NextResponse.json(
        { error: "Este documento ya no admite nuevas firmas." },
        { status: 409 }
      );
    }

    const [org] = await db
      .select()
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    const entityType: EntityType =
      (recipient.entityType ?? org?.entityType) === "privada" ? "privada" : "publica";

    const ntp = await officialTimestamp();

    // ═══ FASE 1 — VALIDACIÓN DEL SEGUNDO FACTOR ═══════════════════
    if (recipient.lockedUntil && recipient.lockedUntil.getTime() > Date.now()) {
      const mins = Math.ceil((recipient.lockedUntil.getTime() - Date.now()) / 60000);
      await logSecurity([
        {
          documentId: doc.id,
          recipientId: recipient.id,
          event: "bloqueo_temporal",
          result: "fail",
          actorName: recipient.name,
          actorEmail: recipient.email,
          detail: `Acceso bloqueado ${mins} min por intentos fallidos`,
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
        },
      ]);
      return NextResponse.json(
        { error: `Firma bloqueada temporalmente. Reintente en ${mins} minuto(s).` },
        { status: 429 }
      );
    }

    await logSecurity([
      {
        documentId: doc.id,
        recipientId: recipient.id,
        event: "intento_firma",
        result: "ok",
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: "Solicitud de autorización de firma",
        ip,
        userAgent: ua,
        ntpIso: ntp.iso,
        ntpSource: ntp.source,
      },
    ]);

    const auth = await verifyPersonalSignature({
      password,
      email: recipient.email,
      recipientHash: recipient.signPasswordHash,
      recipientSalt: recipient.signPasswordSalt,
    });

    if (!auth.ok) {
      const attempts = recipient.failedAttempts + 1;
      const window = lockWindowMs(attempts);
      await db
        .update(recipients)
        .set({
          failedAttempts: attempts,
          lockedUntil: window ? new Date(Date.now() + window) : null,
        })
        .where(eq(recipients.id, recipient.id));

      await logSecurity([
        {
          documentId: doc.id,
          recipientId: recipient.id,
          event: window ? "bloqueo_temporal" : "clave_invalida",
          result: "fail",
          actorName: recipient.name,
          actorEmail: recipient.email,
          detail: `Intento ${attempts}/${MAX_ATTEMPTS} con clave incorrecta`,
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
        },
      ]);

      return NextResponse.json(
        {
          error: window
            ? "Demasiados intentos. Firma bloqueada temporalmente."
            : `Clave de firma incorrecta. Intento ${attempts} de ${MAX_ATTEMPTS}.`,
        },
        { status: 401 }
      );
    }

    await logSecurity([
      {
        documentId: doc.id,
        recipientId: recipient.id,
        event: "autorizacion",
        result: "ok",
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: "Segundo factor validado (scrypt)",
        ip,
        userAgent: ua,
        ntpIso: ntp.iso,
        ntpSource: ntp.source,
      },
    ]);

    // ═══ FASE 1b — INTENCIÓN: OTP DE UN SOLO USO ══════════════════
    const otpCheck = verifyOtpFor(recipient, otpCode);
    if (!otpCheck.ok) {
      await db
        .update(recipients)
        .set({ otpAttempts: recipient.otpAttempts + 1 })
        .where(eq(recipients.id, recipient.id));
      await logSecurity([
        {
          documentId: doc.id,
          recipientId: recipient.id,
          event: "otp_invalido",
          result: "fail",
          actorName: recipient.name,
          actorEmail: recipient.email,
          detail: `OTP ${otpCheck.reason}`,
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
        },
      ]);
      const msg: Record<string, string> = {
        sin_otp: "Solicite primero el código de confirmación.",
        vencido: "El código venció. Solicite uno nuevo.",
        agotado: "Demasiados intentos con el código. Solicite uno nuevo.",
        incorrecto: "Código de confirmación incorrecto.",
      };
      return NextResponse.json({ error: msg[otpCheck.reason ?? "incorrecto"] }, { status: 401 });
    }
    const otpVerifiedAt = new Date();
    await db
      .update(recipients)
      .set({ otpVerifiedAt, otpHash: null, otpExpiresAt: null })
      .where(eq(recipients.id, recipient.id));

    // ═══ FASE 2 — INYECCIÓN PASIVA ════════════════════════════════
    /**
     * IDENTIDAD DESDE EL REGISTRO DE FUNCIONARIOS.
     * Los metadatos de la estampa se toman de la ficha oficial del usuario;
     * el cliente NO puede alterarlos. Si el correo no está registrado se usan
     * los datos capturados en el despacho.
     */
    const [officer] = await db
      .select()
      .from(users)
      .where(eq(users.email, recipient.email))
      .limit(1);

    const identity = {
      grado: officer?.grado ?? recipient.grado,
      cargo: officer?.cargo ?? recipient.cargo,
      cedula: officer?.cedula ?? recipient.cedula,
      dependencia: officer?.dependencia ?? recipient.dependencia ?? recipient.department,
      unidad: officer?.unidad ?? recipient.unidad,
      empresa: recipient.empresa ?? (entityType === "privada" ? org?.name ?? null : null),
      nit: recipient.nit ?? (entityType === "privada" ? org?.nit ?? null : null),
      area: officer?.area ?? recipient.area,
      sucursal: officer?.sucursal ?? recipient.sucursal ?? org?.city ?? null,
    };

    const now = new Date();
    const [prev] = await db
      .select({ hash: signatures.hash })
      .from(signatures)
      .where(eq(signatures.documentId, doc.id))
      .orderBy(desc(signatures.createdAt))
      .limit(1);
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(signatures)
      .where(eq(signatures.documentId, doc.id));
    const slot = (existing ?? 0) + 1;

    const hashPre = computePreHash({
      documentId: doc.id,
      content: doc.content,
      slot,
      signerEmail: recipient.email,
      ntpIso: ntp.iso,
    });

    const stampPayload = buildStampLines(entityType, {
      name: recipient.name,
      email: recipient.email,
      ...identity,
    })
      .map((l) => `${l.label}=${l.value}`)
      .join(";");

    const hashPost = computePostHash({
      hashPre,
      prevHash: prev?.hash ?? null,
      stampPayload,
      signatureData: dataUrl,
      ntpIso: ntp.iso,
    });

    // ═══ FASE 2b — FIRMA ASIMÉTRICA PERSONAL (Ed25519) ═════════════
    const documentHash = sha256([doc.content]);
    const consentText = consentStatement({
      signerName: recipient.name,
      docTitle: doc.title,
      docNumber: doc.docNumber,
      documentHash,
    });
    const consentHash = sha256([consentText]);
    const authFactors = [
      auth.source === "firma_personal"
        ? "clave_firma_personal"
        : auth.source === "acceso"
          ? "contrasena_acceso"
          : "clave_sobre",
      "otp_correo",
      "enlace_unico_192b",
    ];

    const keys = officer ? await ensureSigningKeys(officer.id) : null;
    const canonicalObj: CanonicalSignature = {
      version: "signum-sig-1",
      documentId: doc.id,
      documentHash,
      slot,
      signer: {
        name: recipient.name,
        email: recipient.email,
        cedula: identity.cedula ?? null,
        cargo: identity.cargo ?? null,
        organization: org?.name ?? null,
      },
      consentText,
      consentHash,
      authFactors,
      timestamp: ntp.iso,
      timestampSource: ntp.source,
      prevSignatureHash: prev?.hash ?? null,
      rubricHash: sha256([dataUrl]),
    };
    const canonicalPayload = canonicalize(canonicalObj);
    const signatureValue = keys ? signCanonical(keys.privateEnc, canonicalPayload) : null;

    await db.insert(signatures).values({
      consentText,
      consentHash,
      otpVerifiedAt,
      authFactors: authFactors.join(","),
      canonicalPayload,
      signatureAlg: keys ? SIGNATURE_ALG : "SHA-256-CHAIN",
      signatureValue,
      signerPublicKey: keys?.publicPem ?? null,
      signerKeyFingerprint: keys?.fingerprint ?? null,
      documentId: doc.id,
      recipientId: recipient.id,
      slot,
      entityType,
      signerName: recipient.name,
      signerEmail: recipient.email,
      signerGrado: identity.grado,
      signerCargo: identity.cargo,
      signerCedula: identity.cedula,
      signerDependencia: identity.dependencia,
      signerUnidad: identity.unidad,
      signerEmpresa: identity.empresa,
      signerNit: identity.nit,
      signerArea: identity.area,
      signerSucursal: identity.sucursal,
      logoVariant: org?.logoVariant ?? "institucional",
      logoUrl: org?.logoUrl ?? null,
      signatureData: dataUrl,
      method,
      hashPre,
      hashPost,
      hash: hashPost,
      prevHash: prev?.hash ?? null,
      ntpIso: ntp.iso,
      ntpSource: ntp.source,
      ip,
      userAgent: ua,
    });

    await db
      .update(recipients)
      .set({
        status: "firmado",
        signedAt: now,
        viewedAt: recipient.viewedAt ?? now,
        failedAttempts: 0,
        lockedUntil: null,
        ...identity,
      })
      .where(eq(recipients.id, recipient.id));

    await logSecurity([
      {
        documentId: doc.id,
        recipientId: recipient.id,
        event: "firma_exitosa",
        result: "ok",
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: `Contenedor ${slot} · ${entityType} · identidad ${
          officer ? "verificada en registro" : "del despacho"
        } · factores: ${authFactors.join("+")} · ${keys ? `Ed25519 ${keys.fingerprint}` : "sin llave"}`,
        ip,
        userAgent: ua,
        ntpIso: ntp.iso,
        ntpSource: ntp.source,
        hashPre,
        hashPost,
      },
    ]);

    const events: Parameters<typeof logAudit>[0] = [
      {
        documentId: doc.id,
        action: "firmado",
        label: `${recipient.name} firmó “${doc.title}”`,
        actorName: recipient.name,
        actorEmail: recipient.email,
        detail: `Contenedor ${slot} · firma ${method} · huella ${hashPost.slice(0, 12)}…`,
        ip,
      },
    ];

    // ═══ FASE 3 — BLOQUEO EN SOLO LECTURA ═════════════════════════
    const remaining = await db
      .select({ id: recipients.id })
      .from(recipients)
      .where(
        and(
          eq(recipients.documentId, doc.id),
          eq(recipients.kind, "signer"),
          inArray(recipients.status, ["pendiente", "visto"])
        )
      );
    const completed = remaining.length === 0;

    let radicado: string | null = doc.docNumber;
    if (completed) {
      const allSigs = await db
        .select({ hash: signatures.hash })
        .from(signatures)
        .where(eq(signatures.documentId, doc.id));
      const seal = sha256([doc.content, ...allSigs.map((s) => s.hash), ntp.iso]);

      // Radicación oficial: consecutivo por entidad, tipo y año (INF-2026-0316).
      // Solo se asigna una vez; si ya existía se conserva.
      if (!radicado) {
        radicado = await nextRadicado(
          doc.organizationId,
          doc.docType,
          {
            documentId: doc.id,
            documentTitle: doc.title,
            actorId: officer?.id ?? null,
            actorName: recipient.name,
            actorEmail: recipient.email,
            ip,
            userAgent: ua,
          },
          now
        );
      }

      await db
        .update(documents)
        .set({
          status: "completado",
          docNumber: radicado,
          radicadoAt: doc.radicadoAt ?? now,
          hashPre: doc.hashPre ?? hashPre,
          hashPost,
          sealHash: seal,
          lockedAt: now,
          updatedAt: now,
        })
        .where(eq(documents.id, doc.id));

      events.push({
        documentId: doc.id,
        action: "radicado",
        label: `Documento radicado con el número ${radicado}`,
        actorName: "SIGNUM",
        actorEmail: null,
        detail: `Borrador ${doc.draftCode ?? "—"} → ${radicado}`,
      });

      await db
        .update(recipients)
        .set({ status: "informado" })
        .where(
          and(eq(recipients.documentId, doc.id), inArray(recipients.kind, ["copy", "destinatario"]))
        );

      events.push({
        documentId: doc.id,
        action: "completado",
        label: `Flujo de firma completado para “${doc.title}”`,
        actorName: "SIGNUM",
        actorEmail: null,
        detail: `Sello ${seal.slice(0, 12)}… · ${allSigs.length} firma(s)`,
      });

      await logSecurity([
        {
          documentId: doc.id,
          event: "sellado",
          result: "ok",
          actorName: "SIGNUM",
          detail: "Documento congelado en solo lectura",
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
          hashPre,
          hashPost: seal,
        },
      ]);
    }

    await logAudit(events);

    // Hilo de mensajes: constancia de la firma (con comentario opcional del firmante)
    const signComment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1500) : "";
    await addMessage({
      documentId: doc.id,
      fromName: recipient.name,
      fromEmail: recipient.email,
      toName: null,
      toEmail: null,
      kind: "firma",
      body: signComment || (completed ? `Documento firmado y radicado${radicado ? ` con el número ${radicado}` : ""}.` : "Documento firmado."),
    }).catch(() => undefined);

    return NextResponse.json({
      ok: true,
      hashPre,
      hashPost,
      hash: hashPost,
      documentHash,
      ntp,
      slot,
      signedAt: now.toISOString(),
      completed,
      radicado,
      evidence: {
        alg: keys ? SIGNATURE_ALG : "SHA-256-CHAIN",
        keyFingerprint: keys?.fingerprint ?? null,
        authFactors,
        consentHash,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo registrar la firma." }, { status: 500 });
  }
}
