import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  documents,
  organizations,
  recipients,
  signatures,
  users,
} from "@/db/schema";
import {
  computePostHash,
  computePreHash,
  generateSignPassword,
  hashSignPassword,
  officialTimestamp,
  sha256,
  signToken,
  verifySignPassword,
} from "@/lib/crypto-sign";
import { cleanIdentity } from "@/lib/sanitize";
import { logAudit, logSecurity } from "@/lib/audit";
import { pendingApprovals as listPendingApprovals } from "@/lib/approvals";
import { getSessionContext } from "@/lib/auth";
import { addMessage } from "@/lib/messages";
import { canManageUsers } from "@/lib/roles";
import { buildStampLines, type EntityType } from "@/lib/entity";
import { docTypeOf } from "@/lib/doctypes";
import { nextRadicado } from "@/lib/radicado";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * DESPACHO DEL DOCUMENTO.
 * Los firmantes ya fueron definidos en la configuración previa: aquí se
 * emiten sus credenciales, se estampa opcionalmente la firma del emisor
 * y se distribuyen las copias de conocimiento.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Solo el autor, el emisor designado o un rol privilegiado pueden despachar.
    const ctx = await getSessionContext();
    if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });

    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }
    const allowed =
      canManageUsers(ctx.user.systemRole) || doc.ownerId === ctx.user.id || doc.senderId === ctx.user.id;
    if (!allowed) {
      return NextResponse.json({ error: "No tiene permiso para despachar este documento." }, { status: 403 });
    }

    const [owner] = doc.ownerId
      ? await db.select().from(users).where(eq(users.id, doc.ownerId)).limit(1)
      : [null];
    const [org] = await db
      .select()
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);

    const entityType: EntityType = org?.entityType === "privada" ? "privada" : "publica";
    const ownerName = owner?.name ?? "Propietario";
    const ownerEmail = owner?.email ?? "";
    const isDraft = doc.status === "borrador";
    const def = docTypeOf(doc.docType);

    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const ua = h.get("user-agent")?.slice(0, 200) ?? null;

    const events: Omit<typeof auditEvents.$inferInsert, "hash" | "prevHash">[] = [];
    const now = new Date();

    // ── Copias adicionales (permitidas también tras el cierre) ─────
    const extraCopies = (Array.isArray(body.copies) ? body.copies : [])
      .map((raw: unknown) => {
        const r = raw as Record<string, unknown>;
        return {
          name: cleanIdentity(r.name, 120) ?? "",
          email: (cleanIdentity(r.email, 160) ?? "").toLowerCase(),
          department: cleanIdentity(r.department, 80),
        };
      })
      .filter((r: { name: string; email: string }) => r.name && EMAIL_RE.test(r.email))
      .slice(0, 20);

    for (const c of extraCopies) {
      await db.insert(recipients).values({
        documentId: doc.id,
        kind: "copy",
        name: c.name,
        email: c.email,
        department: c.department,
        entityType,
        token: signToken(),
        status: "pendiente",
      });
      events.push({
        documentId: doc.id,
        action: "copiado",
        label: `Copia de “${doc.title}” distribuida al entorno ${c.department ?? "Externo"}`,
        actorName: ownerName,
        actorEmail: ownerEmail,
        detail: `${c.name} · ${c.email}`,
        ip,
      });
    }

    if (!isDraft) {
      await logAudit(events);
      return NextResponse.json({
        ok: true,
        status: doc.status,
        signers: [],
        copies: extraCopies.length,
        selfSigned: false,
      });
    }

    // ── Firmantes ya configurados ──────────────────────────────────
    const signerRows = await db
      .select()
      .from(recipients)
      .where(and(eq(recipients.documentId, doc.id), eq(recipients.kind, "signer")))
      .orderBy(asc(recipients.slot));

    if (signerRows.length === 0) {
      return NextResponse.json(
        { error: "El documento no tiene firmantes configurados." },
        { status: 409 }
      );
    }

    let ntp = { iso: now.toISOString(), source: "SYS:server-utc" };
    let hashPre: string | null = null;
    let hashPost: string | null = null;
    let selfSigned = false;

    const wantsSelfSign =
      body.selfSignature &&
      typeof body.selfSignature.dataUrl === "string" &&
      body.selfSignature.dataUrl.startsWith("data:image/");

    // El emisor solo puede firmar el contenedor donde figura su correo
    const ownSlot = signerRows.find(
      (r) => r.email.toLowerCase() === ownerEmail.toLowerCase()
    );

    // ── Circuito de revisión/aprobación: se resuelve ANTES que cualquier rúbrica ──
    // Selección de aprobadores desde el modal (correos). Los participantes NO
    // seleccionados quedan como "informado" (reciben el documento pero no bloquean).
    const [senderUser] = doc.senderId
      ? await db.select().from(users).where(eq(users.id, doc.senderId)).limit(1)
      : [null];
    const message = cleanIdentity(body.message, 1500);
    const selected = Array.isArray(body.approvers)
      ? (body.approvers as unknown[]).map((e) => String(e).toLowerCase().trim()).filter(Boolean)
      : null;
    {
      const approverKinds = ["attendee"] as const;
      const all = await db.select().from(recipients)
        .where(and(eq(recipients.documentId, doc.id), inArray(recipients.kind, [...approverKinds])));
      const excluded = new Set([ownerEmail, senderUser?.email, ctx.user.email].filter(Boolean).map((e) => String(e).toLowerCase()));
      for (const r of all) {
        const email = r.email.toLowerCase();
        if (excluded.has(email) || r.status === "aprobado" || r.status === "firmado") continue;
        const wantsApproval = selected ? selected.includes(email) : true;
        const next = wantsApproval ? "pendiente" : "informado";
        if (r.status !== next) {
          await db.update(recipients).set({ status: next }).where(eq(recipients.id, r.id));
        }
      }
    }
    const waitApprovals = await listPendingApprovals(doc.id, [ownerEmail, senderUser?.email, ctx.user.email]);
    // La rúbrica del emisor SOLO existe en el circuito de firma directa: si hay
    // aprobaciones pendientes, se ignora cualquier autofirma enviada por el cliente.
    const approvalCircuit = waitApprovals.length > 0;
    if (body.circuit === "aprobacion" && waitApprovals.length === 0) {
      return NextResponse.json(
        { error: "No hay revisores seleccionados. Añádalos en la configuración previa o use «Enviar a firmar»." },
        { status: 400 }
      );
    }

    if (wantsSelfSign && ownSlot && !approvalCircuit) {
      const password = String(body.signPassword ?? "");
      ntp = await officialTimestamp();

      await logSecurity([
        {
          documentId: doc.id,
          recipientId: ownSlot.id,
          event: "intento_firma",
          result: "ok",
          actorName: ownerName,
          actorEmail: ownerEmail,
          detail: "Emisor solicita autorización de firma",
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
        },
      ]);

      const { verifyPersonalSignature, verifyOtpFor } = await import("@/lib/sign-auth");
      const selfAuth = await verifyPersonalSignature({ // clave personal
        password,
        email: ownerEmail,
        recipientHash: owner?.signPasswordHash,
        recipientSalt: owner?.signPasswordSalt,
      });
      // Intención de firma del emisor: OTP de un solo uso sobre su fila de firmante.
      const otpOk = verifyOtpFor(ownSlot!, String(body.otp ?? ""));
      if (!selfAuth.ok) {
        await logSecurity([
          {
            documentId: doc.id,
            recipientId: ownSlot.id,
            event: "clave_invalida",
            result: "fail",
            actorName: ownerName,
            actorEmail: ownerEmail,
            detail: "Contraseña de firma incorrecta",
            ip,
            userAgent: ua,
            ntpIso: ntp.iso,
            ntpSource: ntp.source,
          },
        ]);
        return NextResponse.json(
          { error: "Contraseña de firma incorrecta." },
          { status: 401 }
        );
      }
      if (!otpOk.ok) {
        await logSecurity([
          {
            documentId: doc.id,
            recipientId: ownSlot.id,
            event: "otp_invalido",
            result: "fail",
            actorName: ownerName,
            actorEmail: ownerEmail,
            detail: `OTP ${otpOk.reason}`,
            ip,
            userAgent: ua,
            ntpIso: ntp.iso,
            ntpSource: ntp.source,
          },
        ]);
        const otpMsg: Record<string, string> = {
          sin_otp: "Solicite primero el código de confirmación.",
          vencido: "El código venció. Solicite uno nuevo.",
          agotado: "Demasiados intentos. Solicite un código nuevo.",
          incorrecto: "Código de confirmación incorrecto.",
        };
        return NextResponse.json(
          { error: otpMsg[otpOk.reason ?? "incorrecto"] },
          { status: 401 }
        );
      }
      await db
        .update(recipients)
        .set({ otpVerifiedAt: new Date(), otpHash: null, otpExpiresAt: null })
        .where(eq(recipients.id, ownSlot.id));

      await logSecurity([
        {
          documentId: doc.id,
          recipientId: ownSlot.id,
          event: "autorizacion",
          result: "ok",
          actorName: ownerName,
          actorEmail: ownerEmail,
          detail: "Segundo factor validado (scrypt)",
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
        },
      ]);

      const [prev] = await db
        .select({ hash: signatures.hash })
        .from(signatures)
        .where(eq(signatures.documentId, doc.id))
        .orderBy(desc(signatures.createdAt))
        .limit(1);

      const slot = ownSlot.slot ?? 1;
      hashPre = computePreHash({
        documentId: doc.id,
        content: doc.content,
        slot,
        signerEmail: ownerEmail,
        ntpIso: ntp.iso,
      });

      const identity = {
        grado: owner?.grado ?? null,
        cargo: ownSlot.cargo ?? owner?.cargo ?? owner?.role ?? null,
        cedula: owner?.cedula ?? null,
        dependencia: owner?.dependencia ?? ownSlot.department ?? null,
        unidad: owner?.unidad ?? null,
        empresa: org?.name ?? null,
        nit: org?.nit ?? null,
        area: owner?.area ?? owner?.department ?? null,
        sucursal: owner?.sucursal ?? org?.city ?? null,
      };

      const stampPayload = buildStampLines(entityType, {
        name: ownerName,
        email: ownerEmail,
        ...identity,
      })
        .map((l) => `${l.label}=${l.value}`)
        .join(";");

      hashPost = computePostHash({
        hashPre,
        prevHash: prev?.hash ?? null,
        stampPayload,
        signatureData: body.selfSignature.dataUrl,
        ntpIso: ntp.iso,
      });

      await db.insert(signatures).values({
        documentId: doc.id,
        recipientId: ownSlot.id,
        slot,
        entityType,
        signerName: ownerName,
        signerEmail: ownerEmail,
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
        signatureData: body.selfSignature.dataUrl,
        method: body.selfSignature.method === "escrita" ? "escrita" : "dibujada",
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
        .set({ status: "firmado", signedAt: now, viewedAt: ownSlot.viewedAt ?? now })
        .where(eq(recipients.id, ownSlot.id));

      selfSigned = true;
      events.push({
        documentId: doc.id,
        action: "firmado",
        label: `${ownerName} estampó su firma en “${doc.title}”`,
        actorName: ownerName,
        actorEmail: ownerEmail,
        detail: `Contenedor ${slot} · ${ownSlot.slotLabel ?? ""} · huella ${hashPost.slice(0, 12)}…`,
        ip,
      });

      await logSecurity([
        {
          documentId: doc.id,
          recipientId: ownSlot.id,
          event: "firma_exitosa",
          result: "ok",
          actorName: ownerName,
          actorEmail: ownerEmail,
          detail: `Inyección en contenedor ${slot} · perfil ${entityType}`,
          ip,
          userAgent: ua,
          ntpIso: ntp.iso,
          ntpSource: ntp.source,
          hashPre,
          hashPost,
        },
      ]);
    }

    // ── Emisión de credenciales para el firmante (solo si no hay aprobaciones pendientes) ──
    // En el circuito de aprobación las credenciales se emiten al liberar el
    // documento tras la última aprobación. En firma directa se emiten ahora.
    // La posible fila de firmante del AUTOR/EMISOR se excluye en el circuito
    // de aprobación: la rúbrica del emisor solo existe en la firma directa.
    const emitterEmails = new Set(
      [ownerEmail, senderUser?.email, ctx.user.email].filter(Boolean).map((e) => String(e).toLowerCase())
    );
    const pending = waitApprovals.length
      ? []
      : signerRows.filter((r) => {
          if (r.id === ownSlot?.id && selfSigned) return false;
          if (approvalCircuit && emitterEmails.has(r.email.toLowerCase())) return false;
          return true;
        });
    const issued: { name: string; email: string; token: string; password: string; slotLabel: string }[] =
      [];

    for (const r of pending) {
      if (r.status === "firmado") continue;
      const plain = generateSignPassword();
      const creds = hashSignPassword(plain);
      const token = signToken();
      await db
        .update(recipients)
        .set({
          token,
          signPasswordHash: creds.hash,
          signPasswordSalt: creds.salt,
          failedAttempts: 0,
          lockedUntil: null,
        })
        .where(eq(recipients.id, r.id));
      issued.push({
        name: r.name,
        email: r.email,
        token,
        password: plain,
        slotLabel: r.slotLabel ?? "FIRMA AUTORIZADA",
      });
    }

    if (issued.length > 0) {
      events.push({
        documentId: doc.id,
        action: "enviado",
        label: `“${doc.title}” enviado a ${issued.map((s) => s.name).join(", ")} para firma`,
        actorName: ownerName,
        actorEmail: ownerEmail,
        detail: `${def.short} · ${issued.length} firmante(s) · enlace + clave fuera de banda`,
        ip,
      });
    }

    const pendingApprovals = await listPendingApprovals(doc.id, [ownerEmail, senderUser?.email, ctx.user.email]);

    // ── Estado ─────────────────────────────────────────────────────
    const allSigned = issued.length === 0 && pendingApprovals.length === 0;
    const newStatus = allSigned
      ? "completado"
      : pendingApprovals.length > 0
        ? "en_aprobacion"
        : "en_firma";
    const seal = allSigned
      ? sha256([doc.content, hashPost ?? "", ntp.iso, `type:${doc.docType}`])
      : null;

    // Radicado oficial solo cuando el documento queda firmado y sellado.
    let radicado: string | null = doc.docNumber;
    if (allSigned && !radicado) {
      radicado = await nextRadicado(
        doc.organizationId ?? org?.id ?? null,
        doc.docType,
        {
          documentId: doc.id,
          documentTitle: doc.title,
          actorId: owner?.id ?? null,
          actorName: ownerName,
          actorEmail: ownerEmail,
          ip,
          userAgent: ua,
        },
        now
      );
    }

    await db
      .update(documents)
      .set({
        status: newStatus,
        returnNote: null,
        organizationId: doc.organizationId ?? org?.id ?? null,
        docNumber: radicado,
        radicadoAt: allSigned ? (doc.radicadoAt ?? now) : doc.radicadoAt,
        ownerSignedAt: selfSigned ? now : doc.ownerSignedAt,
        hashPre: hashPre ?? doc.hashPre,
        hashPost: hashPost ?? doc.hashPost,
        sealHash: seal ?? doc.sealHash,
        lockedAt: allSigned ? now : null,
        updatedAt: now,
      })
      .where(eq(documents.id, doc.id));

    if (allSigned && radicado) {
      events.push({
        documentId: doc.id,
        action: "radicado",
        label: `Documento radicado con el número ${radicado}`,
        actorName: "SIGNUM",
        actorEmail: null,
        detail: `Borrador ${doc.draftCode ?? "—"} → ${radicado}`,
      });
    }

    if (allSigned) {
      await db
        .update(recipients)
        .set({ status: "informado" })
        .where(
          and(eq(recipients.documentId, doc.id), inArray(recipients.kind, ["copy", "destinatario"]))
        );
      events.push({
        documentId: doc.id,
        action: "completado",
        label: `“${doc.title}” quedó sellado y en solo lectura`,
        actorName: ownerName,
        actorEmail: ownerEmail,
        detail: "Todos los contenedores firmados",
        ip,
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

    // Hilo de mensajes: comentario del emisor dirigido a los aprobadores / al firmante
    if (message) {
      const targets =
        newStatus === "en_aprobacion"
          ? waitApprovals.map((a) => ({ name: a.name, email: a.email }))
          : issued.map((i) => ({ name: i.name, email: i.email }));
      if (targets.length === 0) targets.push({ name: "Participantes", email: "" });
      for (const t of targets) {
        await addMessage({
          documentId: doc.id,
          fromUserId: ctx.user.id,
          fromName: ctx.user.name,
          fromEmail: ctx.user.email,
          toName: t.name,
          toEmail: t.email || null,
          kind: newStatus === "en_aprobacion" ? "envio_aprobacion" : "envio_firma",
          body: message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      status: newStatus,
      radicado,
      signers: issued,
      copies: extraCopies.length,
      selfSigned,
      hashPre,
      hashPost,
      ntp,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "No se pudo enviar el documento." }, { status: 500 });
  }
}
