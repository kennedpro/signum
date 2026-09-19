import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  documents,
  recipients,
  securityLogs,
  signatures,
  users,
} from "@/db/schema";
import { buildDocumentHtml } from "@/lib/doctypes";
import { hashSignPassword, signToken } from "@/lib/crypto-sign";

/* ═══════════════════════════════════════════════════════════════════
   DEMOSTRACIÓN DE ARRANQUE
   Si la base no tiene documentos, crea el juego de ejemplo completo
   (dos entidades, funcionarios, documentos en cada estado) sin tocar
   las cuentas que el bootstrap ya garantizó. Así la bandeja nunca
   queda en blanco en una instalación nueva.
   ═══════════════════════════════════════════════════════════════════ */

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const pwd = () => {
  const { hash, salt } = hashSignPassword("DEMO-FIRM");
  return { signPasswordHash: hash, signPasswordSalt: salt };
};

function svgSig(name: string, color = "#111827") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="130" viewBox="0 0 420 130"><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="'Segoe Script','Brush Script MT',cursive" font-size="60" fill="${color}" transform="rotate(-3 210 65)">${name}</text><path d="M55 104 Q 155 120 245 102 T 372 100" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function seedDemoIfEmpty() {
  const [{ value: total }] = await db.select({ value: count() }).from(documents);
  if (total > 0) return false;

  const byUser = (u: string) =>
    db.select().from(users).where(eq(users.username, u)).limit(1);
  const [carlos] = await byUser("carlos.gomez@entidad");
  const [andres] = await byUser("andres.rios@entidad");
  const [camila] = await byUser("camila.duarte@entidad");
  const [laura] = await byUser("laura.mesa@aurora");
  const [mateo] = await byUser("mateo.rojas@aurora");
  if (!carlos || !andres || !camila) return false;

  const P = (u: typeof carlos, slotLabel: string) => ({
    name: u.name,
    email: u.email,
    cargo: u.cargo ?? u.role,
    department: u.department,
    slotLabel,
  });

  // ── 1) Acta completada (DIPRO) ──────────────────────────────────
  const actaHtml = buildDocumentHtml({
    docType: "acta", docNumber: "", title: "Acta de Comité de Seguridad — Sesión Ordinaria",
    subject: "Comité Institucional de Seguridad", city: "Bogotá D.C.", apaEnabled: false,
    sender: { name: carlos.name, cargo: carlos.cargo ?? "", department: carlos.department },
    destinatario: P(andres, "SECRETARIO"), signers: [P(carlos, "PRESIDENTE DEL COMITÉ")],
    attendees: [P(camila, ""), P(andres, "")], copies: [],
  });
  const t1 = hoursAgo(24 * 6), s1 = hoursAgo(24 * 6 - 2), s2 = hoursAgo(24 * 5);
  const h1 = `h1${Date.now()}`, h2 = `h2${Date.now()}`;
  const [acta] = await db.insert(documents).values({
    organizationId: carlos.organizationId, docType: "acta",
    title: "Acta de Comité de Seguridad — Sesión Ordinaria", subject: "Comité Institucional de Seguridad",
    city: "Bogotá D.C.", content: actaHtml, status: "completado", configLocked: true,
    ownerId: carlos.id, senderId: carlos.id, ownerSignedAt: s1,
    draftCode: "00000001", docNumber: "ACTA-2026-0001", radicadoAt: s2,
    hashPre: "pre-demo", hashPost: h2, sealHash: `seal-${Date.now()}`, lockedAt: s2,
    createdAt: t1, updatedAt: s2,
  }).returning();
  const [rCarlos] = await db.insert(recipients).values({
    documentId: acta.id, kind: "signer", slot: 1, slotLabel: "PRESIDENTE DEL COMITÉ",
    userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo,
    department: carlos.department, dependencia: carlos.dependencia, unidad: carlos.unidad,
    cedula: carlos.cedula, grado: carlos.grado, entityType: "publica",
    status: "firmado", token: signToken(), signedAt: s1, viewedAt: s1, createdAt: t1, ...pwd(),
  }).returning();
  const [rAndres] = await db.insert(recipients).values({
    documentId: acta.id, kind: "signer", slot: 2, slotLabel: "SECRETARIO",
    userId: andres.id, name: andres.name, email: andres.email, cargo: andres.cargo,
    department: andres.department, dependencia: andres.dependencia, cedula: andres.cedula,
    grado: andres.grado, entityType: "publica", status: "firmado", token: signToken(),
    signedAt: s2, viewedAt: s2, createdAt: t1, ...pwd(),
  }).returning();
  await db.insert(recipients).values([
    { documentId: acta.id, kind: "attendee", userId: camila.id, name: camila.name, email: camila.email, cargo: camila.cargo, department: camila.department, entityType: "publica", status: "informado", token: signToken(), createdAt: t1 },
    { documentId: acta.id, kind: "destinatario", userId: andres.id, name: andres.name, email: andres.email, cargo: andres.cargo, department: andres.department, dependencia: andres.dependencia, entityType: "publica", status: "informado", token: signToken(), createdAt: t1 },
  ]);
  await db.insert(signatures).values([
    { documentId: acta.id, recipientId: rCarlos.id, slot: 1, entityType: "publica", signerName: carlos.name, signerEmail: carlos.email, signerGrado: carlos.grado, signerCargo: carlos.cargo, signerCedula: carlos.cedula, signerDependencia: carlos.dependencia, signerUnidad: carlos.unidad, signatureData: svgSig("C. Gomez R."), method: "dibujada", hash: h1, hashPre: "pre-demo", hashPost: h1, ntpIso: s1.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s1 },
    { documentId: acta.id, recipientId: rAndres.id, slot: 2, entityType: "publica", signerName: andres.name, signerEmail: andres.email, signerGrado: andres.grado, signerCargo: andres.cargo, signerCedula: andres.cedula, signerDependencia: andres.dependencia, signatureData: svgSig("A. Ríos B."), method: "escrita", hash: h2, hashPre: h1, hashPost: h2, prevHash: h1, ntpIso: s2.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s2 },
  ]);

  // ── 2) Informe APA en firma (DIPRO) ─────────────────────────────
  const infHtml = buildDocumentHtml({
    docType: "informe", docNumber: "", title: "Informe Técnico de Gestión — Esquemas de Protección",
    subject: "Evaluación trimestral de esquemas asignados", city: "Bogotá D.C.", apaEnabled: true,
    sender: { name: andres.name, cargo: andres.cargo ?? "", department: andres.department },
    destinatario: P(carlos, "APROBÓ"), signers: [P(carlos, "APROBÓ")],
    attendees: [], copies: [],
  });
  const t2 = hoursAgo(40), s3 = hoursAgo(20);
  const h3 = `h3${Date.now()}`;
  const [inf] = await db.insert(documents).values({
    organizationId: carlos.organizationId, docType: "informe",
    title: "Informe Técnico de Gestión — Esquemas de Protección",
    subject: "Evaluación trimestral de esquemas asignados", city: "Bogotá D.C.",
    content: infHtml, apaEnabled: true, status: "en_firma", configLocked: true,
    ownerId: andres.id, senderId: andres.id, draftCode: "00000002",
    hashPre: "pre-demo", createdAt: t2, updatedAt: s3,
  }).returning();
  await db.insert(recipients).values([
    { documentId: inf.id, kind: "signer", slot: 1, slotLabel: "APROBÓ", userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo, department: carlos.department, dependencia: carlos.dependencia, cedula: carlos.cedula, grado: carlos.grado, entityType: "publica", status: "pendiente", token: signToken(), createdAt: t2, ...pwd() },
    { documentId: inf.id, kind: "destinatario", userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo, department: carlos.department, dependencia: carlos.dependencia, entityType: "publica", status: "pendiente", token: signToken(), createdAt: t2 },
  ]);
  await db.insert(signatures).values({
    documentId: inf.id, slot: 0, entityType: "publica", signerName: andres.name, signerEmail: andres.email,
    signerCargo: andres.cargo, signerCedula: andres.cedula, signerDependencia: andres.dependencia,
    signatureData: svgSig("A. Ríos B."), method: "dibujada", hash: h3, hashPre: "pre-demo", hashPost: h3,
    ntpIso: s3.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s3,
  });

  // ── 3) Memorando en firma (DIPRO) ───────────────────────────────
  const memHtml = buildDocumentHtml({
    docType: "memorando", docNumber: "", title: "Memorando — Refuerzo de esquemas de protección",
    subject: "Refuerzo temporal de esquemas", city: "Bogotá D.C.", apaEnabled: false,
    sender: { name: camila.name, cargo: camila.cargo ?? "", department: camila.department },
    destinatario: P(carlos, "JEFE DE LA DEPENDENCIA"), signers: [P(carlos, "JEFE DE LA DEPENDENCIA")],
    attendees: [], copies: [],
  });
  const t3 = hoursAgo(16);
  const [mem] = await db.insert(documents).values({
    organizationId: carlos.organizationId, docType: "memorando",
    title: "Memorando — Refuerzo de esquemas de protección", subject: "Refuerzo temporal de esquemas",
    city: "Bogotá D.C.", content: memHtml, status: "en_firma", configLocked: true,
    ownerId: camila.id, senderId: camila.id, draftCode: "00000003", createdAt: t3, updatedAt: t3,
  }).returning();
  await db.insert(recipients).values([
    { documentId: mem.id, kind: "signer", slot: 1, slotLabel: "JEFE DE LA DEPENDENCIA", userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo, department: carlos.department, dependencia: carlos.dependencia, cedula: carlos.cedula, grado: carlos.grado, entityType: "publica", status: "visto", token: signToken(), viewedAt: hoursAgo(6), createdAt: t3, ...pwd() },
    { documentId: mem.id, kind: "destinatario", userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo, department: carlos.department, dependencia: carlos.dependencia, entityType: "publica", status: "visto", token: signToken(), createdAt: t3 },
  ]);

  // ── 4) Oficio borrador (DIPRO) ──────────────────────────────────
  const ofiHtml = buildDocumentHtml({
    docType: "oficio", docNumber: "", title: "Oficio — Solicitud de información interinstitucional",
    subject: "Solicitud de información", city: "Bogotá D.C.", apaEnabled: false,
    sender: { name: carlos.name, cargo: carlos.cargo ?? "", department: carlos.department },
    destinatario: laura ? { name: laura.name, email: laura.email, cargo: laura.cargo ?? "", department: laura.department } : { name: "Laura Mesa Restrepo", email: "laura.mesa@aurora.co", cargo: "Directora de Operaciones", department: "Operaciones" },
    signers: [P(carlos, "FIRMA AUTORIZADA")], attendees: [], copies: [],
  });
  const t4 = hoursAgo(30);
  const [ofi] = await db.insert(documents).values({
    organizationId: carlos.organizationId, docType: "oficio",
    title: "Oficio — Solicitud de información interinstitucional", subject: "Solicitud de información",
    city: "Bogotá D.C.", content: ofiHtml, status: "borrador", configLocked: true,
    ownerId: carlos.id, senderId: carlos.id, draftCode: "00000004", createdAt: t4, updatedAt: t4,
  }).returning();
  await db.insert(recipients).values([
    { documentId: ofi.id, kind: "signer", slot: 1, slotLabel: "FIRMA AUTORIZADA", userId: carlos.id, name: carlos.name, email: carlos.email, cargo: carlos.cargo, department: carlos.department, dependencia: carlos.dependencia, cedula: carlos.cedula, grado: carlos.grado, entityType: "publica", status: "pendiente", token: signToken(), createdAt: t4, ...pwd() },
    { documentId: ofi.id, kind: "destinatario", userId: laura?.id ?? null, name: laura?.name ?? "Laura Mesa Restrepo", email: laura?.email ?? "laura.mesa@aurora.co", cargo: laura?.cargo ?? "Directora de Operaciones", department: laura?.department ?? "Operaciones", empresa: "Consultoría Aurora S.A.S.", entityType: "privada", status: "pendiente", token: signToken(), createdAt: t4 },
  ]);

  // ── 5) Certificación borrador (DIPRO) ───────────────────────────
  const cerHtml = buildDocumentHtml({
    docType: "certificacion", docNumber: "", title: "Certificación Laboral",
    subject: "Constancia de vinculación", city: "Bogotá D.C.", apaEnabled: false,
    sender: { name: camila.name, cargo: camila.cargo ?? "", department: camila.department },
    destinatario: P(andres, "INTERESADO"), signers: [P(camila, "JEFE DE TALENTO HUMANO")],
    attendees: [], copies: [],
  });
  const t5 = hoursAgo(26);
  const [cer] = await db.insert(documents).values({
    organizationId: camila.organizationId, docType: "certificacion",
    title: "Certificación Laboral", subject: "Constancia de vinculación", city: "Bogotá D.C.",
    content: cerHtml, status: "borrador", configLocked: true,
    ownerId: camila.id, senderId: camila.id, draftCode: "00000005", createdAt: t5, updatedAt: t5,
  }).returning();
  await db.insert(recipients).values([
    { documentId: cer.id, kind: "signer", slot: 1, slotLabel: "JEFE DE TALENTO HUMANO", userId: camila.id, name: camila.name, email: camila.email, cargo: camila.cargo, department: camila.department, dependencia: camila.dependencia, cedula: camila.cedula, grado: camila.grado, entityType: "publica", status: "pendiente", token: signToken(), createdAt: t5, ...pwd() },
    { documentId: cer.id, kind: "destinatario", userId: andres.id, name: andres.name, email: andres.email, cargo: andres.cargo, department: andres.department, dependencia: andres.dependencia, entityType: "publica", status: "pendiente", token: signToken(), createdAt: t5 },
  ]);

  // ── 6) Informe borrador (AURORA, privada) si existe la entidad ──
  if (laura && mateo) {
    const aurHtml = buildDocumentHtml({
      docType: "informe", docNumber: "", title: "Informe Comercial — Cierre trimestral",
      subject: "Resultados comerciales del trimestre", city: "Medellín", apaEnabled: true,
      sender: { name: mateo.name, cargo: mateo.cargo ?? "", department: mateo.department },
      destinatario: P(laura, "APROBÓ"), signers: [P(laura, "APROBÓ")],
      attendees: [], copies: [],
    });
    const t6 = hoursAgo(8);
    const [aur] = await db.insert(documents).values({
      organizationId: laura.organizationId, docType: "informe",
      title: "Informe Comercial — Cierre trimestral", subject: "Resultados comerciales del trimestre",
      city: "Medellín", content: aurHtml, apaEnabled: true, status: "borrador", configLocked: true,
      ownerId: mateo.id, senderId: mateo.id, draftCode: "00000001", createdAt: t6, updatedAt: t6,
    }).returning();
    await db.insert(recipients).values([
      { documentId: aur.id, kind: "signer", slot: 1, slotLabel: "APROBÓ", userId: laura.id, name: laura.name, email: laura.email, cargo: laura.cargo, department: laura.department, cedula: laura.cedula, area: laura.area, empresa: "Consultoría Aurora S.A.S.", nit: "901.234.567-8", entityType: "privada", status: "pendiente", token: signToken(), createdAt: t6, ...pwd() },
      { documentId: aur.id, kind: "destinatario", userId: laura.id, name: laura.name, email: laura.email, cargo: laura.cargo, department: laura.department, empresa: "Consultoría Aurora S.A.S.", entityType: "privada", status: "pendiente", token: signToken(), createdAt: t6 },
    ]);
  }

  // ── Bitácora mínima para que el Inicio y la auditoría tengan vida ──
  await db.insert(auditEvents).values([
    { documentId: acta.id, action: "creado", label: "Se creó acta de comité", actorName: carlos.name, actorEmail: carlos.email, createdAt: t1 },
    { documentId: acta.id, action: "firmado", label: `${carlos.name} firmó el acta`, actorName: carlos.name, actorEmail: carlos.email, createdAt: s1 },
    { documentId: acta.id, action: "firmado", label: `${andres.name} firmó el acta`, actorName: andres.name, actorEmail: andres.email, createdAt: s2 },
    { documentId: acta.id, action: "radicado", label: "Documento radicado ACTA-2026-0001", actorName: "SIGNUM", createdAt: s2 },
    { documentId: inf.id, action: "creado", label: "Se creó informe técnico", actorName: andres.name, actorEmail: andres.email, createdAt: t2 },
    { documentId: inf.id, action: "enviado", label: "Informe enviado a aprobación", actorName: andres.name, actorEmail: andres.email, createdAt: s3 },
    { documentId: mem.id, action: "creado", label: "Se creó memorando", actorName: camila.name, actorEmail: camila.email, createdAt: t3 },
    { documentId: mem.id, action: "enviado", label: "Memorando enviado a firma", actorName: camila.name, actorEmail: camila.email, createdAt: t3 },
    { documentId: ofi.id, action: "creado", label: "Se creó oficio (borrador)", actorName: carlos.name, actorEmail: carlos.email, createdAt: t4 },
    { documentId: cer.id, action: "creado", label: "Se creó certificación (borrador)", actorName: camila.name, actorEmail: camila.email, createdAt: t5 },
  ]);
  await db.insert(securityLogs).values([
    { documentId: acta.id, event: "firma_exitosa", result: "ok", actorName: carlos.name, actorEmail: carlos.email, detail: "Contenedor 1 · Ed25519 demo", ntpIso: s1.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s1 },
    { documentId: acta.id, event: "firma_exitosa", result: "ok", actorName: andres.name, actorEmail: andres.email, detail: "Contenedor 2 · Ed25519 demo", ntpIso: s2.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s2 },
    { documentId: acta.id, event: "sellado", result: "ok", actorName: "SIGNUM", detail: "Documento congelado", ntpIso: s2.toISOString(), ntpSource: "NTP:worldtimeapi/UTC", createdAt: s2 },
  ]);

  return true;
}
