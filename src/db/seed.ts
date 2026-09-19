import "dotenv/config";
import { db } from "@/db";
import {
  auditEvents,
  documents,
  organizations,
  recipients,
  securityLogs,
  signatures,
  users,
} from "@/db/schema";
import { sealHash, signToken, hashSignPassword } from "@/lib/hash";
import { buildDocumentHtml } from "@/lib/doctypes";
import { hashPassword } from "@/lib/password";

const PHOTOS = {
  carlos:
    "https://images.pexels.com/photos/26150470/pexels-photo-26150470.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
  andres:
    "https://images.pexels.com/photos/38740728/pexels-photo-38740728.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
  camila:
    "https://images.pexels.com/photos/33680700/pexels-photo-33680700.jpeg?auto=compress&cs=tinysrgb&dpr=1&fit=crop&h=200&w=200",
};

function svgSig(name: string, color = "#111827") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="130" viewBox="0 0 420 130"><text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="'Segoe Script','Brush Script MT',cursive" font-size="60" fill="${color}" transform="rotate(-3 210 65)">${name}</text><path d="M55 104 Q 155 120 245 102 T 372 100" stroke="${color}" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const pwd = (plain = "DEMO-FIRM") => {
  const { hash, salt } = hashSignPassword(plain);
  return { signPasswordHash: hash, signPasswordSalt: salt };
};
/** Credenciales de acceso a la consola. */
const acc = (p: string) => {
  const { hash, salt } = hashPassword(p);
  return { passwordHash: hash, passwordSalt: salt };
};

async function main() {
  console.log("→ Limpiando…");
  await db.delete(securityLogs);
  await db.delete(signatures);
  await db.delete(recipients);
  await db.delete(auditEvents);
  await db.delete(documents);
  await db.delete(users);
  await db.delete(organizations);

  console.log("→ Organización…");
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Dirección De Protección Y Servicios Especiales",
      entityType: "publica",
      nit: "800.141.397-2",
      sigla: "DIPRO",
      city: "Bogotá D.C.",
      address: "Av. El Dorado No. 75-25",
      phone: "(601) 315 9000",
      website: "www.dipro.gov.co",
      logoVariant: "institucional",
      primaryColor: "#0f766e",
      createdAt: hoursAgo(24 * 40),
    })
    .returning();

  console.log("→ Usuarios…");
  const owner = hashSignPassword("FIRMA2026");
  const [carlos, andres, camila] = await db
    .insert(users)
    .values([
      {
        organizationId: org.id,
        name: "Carlos Ernesto Gomez Rodriguez",
        email: "carlos.gomez3224@correo.entidad.gov.co",
        username: "carlos.gomez@entidad",
        ...acc("admin"),
        role: "Jefe Esquema De Seguridad",
        systemRole: "jefe_gestion",
        department: "Seguridad",
        color: "#22d3ee",
        photoUrl: PHOTOS.carlos,
        grado: "Mayor",
        cargo: "Jefe Esquema De Seguridad",
        cedula: "1098613224",
        dependencia: "Grupo Protección A Personas E Instalaciones Gubernamentales",
        unidad: "Dirección De Protección Y Servicios Especiales",
        area: "Dirección de Seguridad",
        sucursal: "Sede Central Bogotá",
        signPasswordHash: owner.hash,
        signPasswordSalt: owner.salt,
        createdAt: hoursAgo(24 * 30),
      },
      {
        organizationId: org.id,
        name: "Andrés Ríos Beltrán",
        email: "andres.rios@correo.entidad.gov.co",
        username: "andres.rios@entidad",
        ...acc("admin"),
        role: "Asesor Jurídico",
        systemRole: "usuario",
        department: "Legal",
        color: "#a78bfa",
        photoUrl: PHOTOS.andres,
        grado: "Abogado",
        cargo: "Asesor Jurídico Grado 03",
        cedula: "79554120",
        dependencia: "Oficina Asesora Jurídica",
        unidad: "Dirección Administrativa",
        area: "Jurídica",
        createdAt: hoursAgo(24 * 29),
      },
      {
        organizationId: org.id,
        name: "Camila Duarte Peña",
        email: "camila.duarte@correo.entidad.gov.co",
        username: "camila.duarte@entidad",
        ...acc("admin"),
        role: "Jefa de Talento Humano",
        systemRole: "usuario",
        department: "Talento Humano",
        color: "#34d399",
        photoUrl: PHOTOS.camila,
        grado: "Especialista",
        cargo: "Jefe Grupo Talento Humano",
        cedula: "52889341",
        dependencia: "Grupo de Administración de Personal",
        unidad: "Dirección de Talento Humano",
        area: "Talento Humano",
        createdAt: hoursAgo(24 * 28),
      },
    ])
    .returning();

  // Cuenta de administración del sistema
  await db.insert(users).values({
    organizationId: org.id,
    name: "Administrador del Sistema",
    email: "admin@entidad.gov.co",
    username: "admin",
    ...acc("admin"),
    role: "Administrador del Sistema",
    systemRole: "admin",
    department: "Tecnología",
    color: "#a78bfa",
    grado: "Ingeniero",
    cargo: "Administrador de la Plataforma",
    cedula: "1000000001",
    dependencia: "Oficina de Tecnologías de la Información",
    unidad: "Dirección Administrativa",
    area: "Tecnología",
    sucursal: "Sede Central Bogotá",
    createdAt: hoursAgo(24 * 31),
  });

  const P = (u: typeof carlos, slotLabel: string) => ({
    name: u.name,
    email: u.email,
    cargo: u.cargo ?? u.role,
    department: u.department,
    slotLabel,
  });

  /* ── 1. ACTA sellada ────────────────────────────────────────── */
  console.log("→ Acta sellada…");
  const actaCfg = {
    docType: "acta" as const,
    docNumber: "ACTA-2026-014",
    title: "Acta de Comité de Seguridad — Sesión Ordinaria",
    subject: "Comité Institucional de Seguridad",
    city: "Bogotá D.C.",
    apaEnabled: false,
    sender: { name: carlos.name, cargo: carlos.cargo ?? "", department: carlos.department },
    signers: [P(carlos, "PRESIDENTE DEL COMITÉ"), P(andres, "SECRETARIO")],
    attendees: [
      P(camila, ""),
      {
        name: "Elena Vargas Ochoa",
        email: "elena.vargas@correo.entidad.gov.co",
        cargo: "Jefe Grupo Operativo",
        department: "Operaciones",
        slotLabel: "",
      },
    ],
    participants: [],
    copies: [
      {
        name: "Archivo de Gestión",
        email: "archivo@correo.entidad.gov.co",
        cargo: "",
        department: "Dirección",
        slotLabel: "",
      },
    ],
  };
  const actaHtml = buildDocumentHtml(actaCfg);
  const t1 = hoursAgo(24 * 6);
  const s1 = hoursAgo(24 * 6 - 2);
  const s2 = hoursAgo(24 * 5);
  const h1 = sealHash(["GENESIS", actaHtml, carlos.email, s1.toISOString()]);
  const h2 = sealHash([h1, actaHtml, andres.email, s2.toISOString()]);
  const seal = sealHash([actaHtml, h1, h2, s2.toISOString()]);

  const [docActa] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: "acta",
      docNumber: actaCfg.docNumber,
      title: actaCfg.title,
      subject: actaCfg.subject,
      city: actaCfg.city,
      content: actaHtml,
      status: "completado",
      configLocked: true,
      ownerId: carlos.id,
      senderId: carlos.id,
      ownerSignedAt: s1,
      hashPre: sealHash(["PRE", actaHtml, carlos.email, s1.toISOString()]),
      hashPost: h2,
      sealHash: seal,
      lockedAt: s2,
      createdAt: t1,
      updatedAt: s2,
    })
    .returning();

  const [rc1, rc2] = await db
    .insert(recipients)
    .values([
      {
        documentId: docActa.id,
        kind: "signer",
        slot: 1,
        slotLabel: "PRESIDENTE DEL COMITÉ",
        userId: carlos.id,
        name: carlos.name,
        email: carlos.email,
        cargo: carlos.cargo,
        department: carlos.department,
        entityType: "publica",
        ...pwd(),
        status: "firmado",
        token: signToken(),
        signedAt: s1,
        viewedAt: s1,
        createdAt: t1,
      },
      {
        documentId: docActa.id,
        kind: "signer",
        slot: 2,
        slotLabel: "SECRETARIO",
        userId: andres.id,
        name: andres.name,
        email: andres.email,
        cargo: andres.cargo,
        department: andres.department,
        entityType: "publica",
        ...pwd(),
        status: "firmado",
        token: signToken(),
        signedAt: s2,
        viewedAt: hoursAgo(24 * 5 + 3),
        createdAt: t1,
      },
      {
        documentId: docActa.id,
        kind: "attendee",
        name: camila.name,
        email: camila.email,
        cargo: camila.cargo,
        department: camila.department,
        entityType: "publica",
        status: "informado",
        token: signToken(),
        createdAt: t1,
      },
      {
        documentId: docActa.id,
        kind: "attendee",
        name: "Elena Vargas Ochoa",
        email: "elena.vargas@correo.entidad.gov.co",
        cargo: "Jefe Grupo Operativo",
        department: "Operaciones",
        entityType: "publica",
        status: "informado",
        token: signToken(),
        createdAt: t1,
      },
      {
        documentId: docActa.id,
        kind: "copy",
        name: "Archivo de Gestión",
        email: "archivo@correo.entidad.gov.co",
        department: "Dirección",
        entityType: "publica",
        status: "informado",
        token: signToken(),
        createdAt: t1,
      },
    ])
    .returning();

  const sigBase = {
    documentId: docActa.id,
    entityType: "publica",
    logoVariant: "institucional",
    ntpSource: "NTP:worldtimeapi/UTC",
  };
  await db.insert(signatures).values([
    {
      ...sigBase,
      recipientId: rc1.id,
      slot: 1,
      signerName: carlos.name,
      signerEmail: carlos.email,
      signerGrado: carlos.grado,
      signerCargo: carlos.cargo,
      signerCedula: carlos.cedula,
      signerDependencia: carlos.dependencia,
      signerUnidad: carlos.unidad,
      signatureData: svgSig("C. Gomez R."),
      method: "dibujada",
      hashPre: sealHash(["PRE", actaHtml, carlos.email, s1.toISOString()]),
      hashPost: h1,
      hash: h1,
      ntpIso: s1.toISOString(),
      ip: "10.8.0.12",
      createdAt: s1,
    },
    {
      ...sigBase,
      recipientId: rc2.id,
      slot: 2,
      signerName: andres.name,
      signerEmail: andres.email,
      signerGrado: andres.grado,
      signerCargo: andres.cargo,
      signerCedula: andres.cedula,
      signerDependencia: andres.dependencia,
      signerUnidad: andres.unidad,
      signatureData: svgSig("A. Ríos B."),
      method: "escrita",
      hashPre: sealHash(["PRE", actaHtml, andres.email, s2.toISOString()]),
      hashPost: h2,
      hash: h2,
      prevHash: h1,
      ntpIso: s2.toISOString(),
      ip: "10.8.0.21",
      createdAt: s2,
    },
  ]);

  /* ── 2. INFORME APA en firma (pendiente para Carlos) ────────── */
  console.log("→ Informe APA en firma…");
  const infCfg = {
    docType: "informe" as const,
    docNumber: "INF-2026-031",
    title: "Informe Técnico de Gestión — Esquemas de Protección",
    subject: "Evaluación trimestral de esquemas asignados",
    city: "Bogotá D.C.",
    apaEnabled: true,
    sender: { name: andres.name, cargo: andres.cargo ?? "", department: andres.department },
    signers: [P(andres, "ELABORÓ"), P(carlos, "APROBÓ")],
    attendees: [],
    participants: [P(camila, "")],
    copies: [],
  };
  const infHtml = buildDocumentHtml(infCfg);
  const t2 = hoursAgo(40);
  const s3 = hoursAgo(20);
  const h3 = sealHash(["GENESIS", infHtml, andres.email, s3.toISOString()]);

  const [docInf] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: "informe",
      docNumber: infCfg.docNumber,
      title: infCfg.title,
      subject: infCfg.subject,
      city: infCfg.city,
      content: infHtml,
      apaEnabled: true,
      apaAuthors: andres.name,
      apaInstitution: org.name,
      status: "en_firma",
      configLocked: true,
      ownerId: andres.id,
      senderId: andres.id,
      hashPre: sealHash(["PRE", infHtml, andres.email, s3.toISOString()]),
      createdAt: t2,
      updatedAt: s3,
    })
    .returning();

  const [ri1] = await db
    .insert(recipients)
    .values([
      {
        documentId: docInf.id,
        kind: "signer",
        slot: 1,
        slotLabel: "ELABORÓ",
        userId: andres.id,
        name: andres.name,
        email: andres.email,
        cargo: andres.cargo,
        department: andres.department,
        entityType: "publica",
        ...pwd(),
        status: "firmado",
        token: signToken(),
        signedAt: s3,
        viewedAt: s3,
        createdAt: t2,
      },
      {
        documentId: docInf.id,
        kind: "signer",
        slot: 2,
        slotLabel: "APROBÓ",
        userId: carlos.id,
        name: carlos.name,
        email: carlos.email,
        cargo: carlos.cargo,
        department: carlos.department,
        entityType: "publica",
        ...pwd(),
        status: "pendiente",
        token: signToken(),
        createdAt: t2,
      },
      {
        documentId: docInf.id,
        kind: "participant",
        name: camila.name,
        email: camila.email,
        cargo: camila.cargo,
        department: camila.department,
        entityType: "publica",
        status: "informado",
        token: signToken(),
        createdAt: t2,
      },
    ])
    .returning();

  await db.insert(signatures).values({
    ...sigBase,
    documentId: docInf.id,
    recipientId: ri1.id,
    slot: 1,
    signerName: andres.name,
    signerEmail: andres.email,
    signerGrado: andres.grado,
    signerCargo: andres.cargo,
    signerCedula: andres.cedula,
    signerDependencia: andres.dependencia,
    signerUnidad: andres.unidad,
    signatureData: svgSig("A. Ríos B."),
    method: "dibujada",
    hashPre: sealHash(["PRE", infHtml, andres.email, s3.toISOString()]),
    hashPost: h3,
    hash: h3,
    ntpIso: s3.toISOString(),
    ip: "10.8.0.21",
    createdAt: s3,
  });

  /* ── 3. MEMORANDO en firma (pendiente para Carlos) ──────────── */
  console.log("→ Memorando en firma…");
  const memCfg = {
    docType: "memorando" as const,
    docNumber: "MEM-2026-042",
    title: "Memorando — Refuerzo de esquemas de protección",
    subject: "Refuerzo temporal de esquemas",
    city: "Bogotá D.C.",
    apaEnabled: false,
    sender: { name: camila.name, cargo: camila.cargo ?? "", department: camila.department },
    signers: [P(carlos, "JEFE DE LA DEPENDENCIA")],
    attendees: [],
    participants: [],
    copies: [
      {
        name: "Dirección General",
        email: "direccion@correo.entidad.gov.co",
        cargo: "",
        department: "Dirección",
        slotLabel: "",
      },
    ],
  };
  const memHtml = buildDocumentHtml(memCfg);
  const t3 = hoursAgo(16);

  const [docMem] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: "memorando",
      docNumber: memCfg.docNumber,
      title: memCfg.title,
      subject: memCfg.subject,
      city: memCfg.city,
      content: memHtml,
      status: "en_firma",
      configLocked: true,
      ownerId: camila.id,
      senderId: camila.id,
      createdAt: t3,
      updatedAt: hoursAgo(10),
    })
    .returning();

  await db.insert(recipients).values([
    {
      documentId: docMem.id,
      kind: "signer",
      slot: 1,
      slotLabel: "JEFE DE LA DEPENDENCIA",
      userId: carlos.id,
      name: carlos.name,
      email: carlos.email,
      cargo: carlos.cargo,
      department: carlos.department,
      entityType: "publica",
      ...pwd(),
      status: "visto",
      token: signToken(),
      viewedAt: hoursAgo(6),
      createdAt: t3,
    },
    {
      documentId: docMem.id,
      kind: "copy",
      name: "Dirección General",
      email: "direccion@correo.entidad.gov.co",
      department: "Dirección",
      entityType: "publica",
      status: "pendiente",
      token: signToken(),
      createdAt: t3,
    },
  ]);

  /* ── 4 y 5. Borradores ──────────────────────────────────────── */
  console.log("→ Borradores…");
  const certCfg = {
    docType: "certificacion" as const,
    docNumber: "CER-2026-088",
    title: "Certificación Laboral",
    subject: "Constancia de vinculación",
    city: "Bogotá D.C.",
    apaEnabled: false,
    sender: { name: carlos.name, cargo: carlos.cargo ?? "", department: carlos.department },
    signers: [P(carlos, "JEFE DE TALENTO HUMANO")],
    attendees: [],
    participants: [],
    copies: [],
  };
  const certHtml = buildDocumentHtml(certCfg);
  const [docCert] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: "certificacion",
      docNumber: certCfg.docNumber,
      title: certCfg.title,
      subject: certCfg.subject,
      city: certCfg.city,
      content: certHtml,
      status: "borrador",
      configLocked: true,
      ownerId: carlos.id,
      senderId: carlos.id,
      createdAt: hoursAgo(8),
      updatedAt: hoursAgo(2),
    })
    .returning();

  await db.insert(recipients).values({
    documentId: docCert.id,
    kind: "signer",
    slot: 1,
    slotLabel: "JEFE DE TALENTO HUMANO",
    userId: carlos.id,
    name: carlos.name,
    email: carlos.email,
    cargo: carlos.cargo,
    department: carlos.department,
    entityType: "publica",
    ...pwd(),
    status: "pendiente",
    token: signToken(),
    createdAt: hoursAgo(8),
  });

  const ofiCfg = {
    docType: "oficio" as const,
    docNumber: "OFI-2026-120",
    title: "Oficio — Solicitud de información interinstitucional",
    subject: "Solicitud de información",
    city: "Bogotá D.C.",
    apaEnabled: false,
    sender: { name: carlos.name, cargo: carlos.cargo ?? "", department: carlos.department },
    signers: [P(carlos, "FIRMA AUTORIZADA")],
    attendees: [],
    participants: [],
    copies: [],
  };
  const ofiHtml = buildDocumentHtml(ofiCfg);
  const [docOfi] = await db
    .insert(documents)
    .values({
      organizationId: org.id,
      docType: "oficio",
      docNumber: ofiCfg.docNumber,
      title: ofiCfg.title,
      subject: ofiCfg.subject,
      city: ofiCfg.city,
      content: ofiHtml,
      status: "borrador",
      configLocked: true,
      ownerId: carlos.id,
      senderId: carlos.id,
      createdAt: hoursAgo(30),
      updatedAt: hoursAgo(29),
    })
    .returning();

  await db.insert(recipients).values({
    documentId: docOfi.id,
    kind: "signer",
    slot: 1,
    slotLabel: "FIRMA AUTORIZADA",
    userId: carlos.id,
    name: carlos.name,
    email: carlos.email,
    cargo: carlos.cargo,
    department: carlos.department,
    entityType: "publica",
    ...pwd(),
    status: "pendiente",
    token: signToken(),
    createdAt: hoursAgo(30),
  });

  /* ── Trazabilidad ───────────────────────────────────────────── */
  console.log("→ Trazabilidad…");
  const raw = [
    { d: docActa.id, a: "creado", l: `Se creó acta de reunión “${docActa.title}”`, n: carlos.name, e: carlos.email, t: t1, det: "Config. previa: 2 firmantes, 2 asistentes, 1 copia", ip: "10.8.0.12" },
    { d: docActa.id, a: "firmado", l: `${carlos.name} estampó su firma`, n: carlos.name, e: carlos.email, t: s1, det: "Contenedor 1 · PRESIDENTE DEL COMITÉ", ip: "10.8.0.12" },
    { d: docActa.id, a: "enviado", l: `“${docActa.title}” enviado a ${andres.name} para firma`, n: carlos.name, e: carlos.email, t: s1, det: "ACTA · 1 firmante", ip: "10.8.0.12" },
    { d: docActa.id, a: "visto", l: `${andres.name} abrió el documento`, n: andres.name, e: andres.email, t: hoursAgo(24 * 5 + 3), det: null, ip: "10.8.0.21" },
    { d: docActa.id, a: "firmado", l: `${andres.name} firmó el acta`, n: andres.name, e: andres.email, t: s2, det: "Contenedor 2 · SECRETARIO", ip: "10.8.0.21" },
    { d: docActa.id, a: "completado", l: "Flujo completado y documento sellado", n: "SIGNUM", e: null, t: s2, det: `Sello ${seal.slice(0, 12)}…`, ip: null },
    { d: docInf.id, a: "creado", l: `Se creó informe “${docInf.title}”`, n: andres.name, e: andres.email, t: t2, det: "Config. previa: 2 firmantes · APA 7", ip: "10.8.0.21" },
    { d: docInf.id, a: "firmado", l: `${andres.name} firmó como ELABORÓ`, n: andres.name, e: andres.email, t: s3, det: "Contenedor 1", ip: "10.8.0.21" },
    { d: docInf.id, a: "enviado", l: `Informe enviado a ${carlos.name} para aprobación`, n: andres.name, e: andres.email, t: s3, det: "INFORME · 1 firmante", ip: "10.8.0.21" },
    { d: docMem.id, a: "creado", l: "Se creó memorando 042-2026", n: camila.name, e: camila.email, t: t3, det: "Config. previa: 1 firmante, 1 copia", ip: "10.8.0.44" },
    { d: docMem.id, a: "enviado", l: `Memorando enviado a ${carlos.name} para firma`, n: camila.name, e: camila.email, t: hoursAgo(10), det: "MEMO · copia a Dirección", ip: "10.8.0.44" },
    { d: docMem.id, a: "visto", l: `${carlos.name} abrió el memorando`, n: carlos.name, e: carlos.email, t: hoursAgo(6), det: null, ip: "10.8.0.12" },
    { d: docCert.id, a: "creado", l: "Se creó certificación laboral", n: carlos.name, e: carlos.email, t: hoursAgo(8), det: "Config. previa: 1 firmante", ip: "10.8.0.12" },
    { d: docCert.id, a: "editado", l: "Se guardaron cambios en la certificación", n: carlos.name, e: carlos.email, t: hoursAgo(2), det: null, ip: "10.8.0.12" },
    { d: docOfi.id, a: "creado", l: "Se creó oficio 120-2026", n: carlos.name, e: carlos.email, t: hoursAgo(30), det: "Config. previa: 1 firmante", ip: "10.8.0.12" },
  ];

  let prev = "GENESIS";
  await db.insert(auditEvents).values(
    raw
      .sort((a, b) => a.t.getTime() - b.t.getTime())
      .map((r, idx) => {
        r.t = new Date(r.t.getTime() + idx * 1000);
        return r;
      })
      .map((r) => {
        const hash = sealHash([prev, r.a, r.l, r.n, r.d, r.t.toISOString()]);
        const row = {
          documentId: r.d,
          action: r.a,
          label: r.l,
          actorName: r.n,
          actorEmail: r.e,
          detail: r.det,
          ip: r.ip,
          prevHash: prev === "GENESIS" ? null : prev,
          hash,
          createdAt: r.t,
        };
        prev = hash;
        return row;
      })
  );

  /* ── Pista de seguridad ─────────────────────────────────────── */
  console.log("→ Pista de seguridad…");
  const secRaw = [
    { d: docActa.id, ev: "intento_firma", r: "ok", n: carlos.name, e: carlos.email, det: "Emisor solicita autorización", t: s1, pre: null as string | null, post: null as string | null, ip: "10.8.0.12" },
    { d: docActa.id, ev: "autorizacion", r: "ok", n: carlos.name, e: carlos.email, det: "Segundo factor validado (scrypt)", t: s1, pre: null, post: null, ip: "10.8.0.12" },
    { d: docActa.id, ev: "firma_exitosa", r: "ok", n: carlos.name, e: carlos.email, det: "Inyección en contenedor 1", t: s1, pre: sealHash(["PRE", actaHtml, carlos.email, s1.toISOString()]), post: h1, ip: "10.8.0.12" },
    { d: docActa.id, ev: "clave_invalida", r: "fail", n: andres.name, e: andres.email, det: "Intento 1/5 con clave incorrecta", t: hoursAgo(24 * 5 + 2), pre: null, post: null, ip: "10.8.0.21" },
    { d: docActa.id, ev: "firma_exitosa", r: "ok", n: andres.name, e: andres.email, det: "Inyección en contenedor 2", t: s2, pre: sealHash(["PRE", actaHtml, andres.email, s2.toISOString()]), post: h2, ip: "10.8.0.21" },
    { d: docActa.id, ev: "sellado", r: "ok", n: "SIGNUM", e: null, det: "Documento congelado en solo lectura", t: s2, pre: null, post: seal, ip: null },
    { d: docInf.id, ev: "autorizacion", r: "ok", n: andres.name, e: andres.email, det: "Segundo factor validado (scrypt)", t: s3, pre: null, post: null, ip: "10.8.0.21" },
    { d: docInf.id, ev: "firma_exitosa", r: "ok", n: andres.name, e: andres.email, det: "Inyección en contenedor 1", t: s3, pre: sealHash(["PRE", infHtml, andres.email, s3.toISOString()]), post: h3, ip: "10.8.0.21" },
    { d: docMem.id, ev: "intento_firma", r: "ok", n: carlos.name, e: carlos.email, det: "Solicitud de autorización de firma", t: hoursAgo(5.5), pre: null, post: null, ip: "10.8.0.12" },
    { d: docMem.id, ev: "clave_invalida", r: "fail", n: carlos.name, e: carlos.email, det: "Intento 1/5 con clave incorrecta", t: hoursAgo(5.4), pre: null, post: null, ip: "10.8.0.12" },
  ];

  let sprev = "GENESIS";
  await db.insert(securityLogs).values(
    secRaw
      .sort((a, b) => a.t.getTime() - b.t.getTime())
      .map((r, idx) => {
        r.t = new Date(r.t.getTime() + idx * 1000);
        return r;
      })
      .map((r) => {
        const hash = sealHash([sprev, r.ev, r.r, r.n, r.d, r.t.toISOString(), r.pre ?? "", r.post ?? ""]);
        const row = {
          documentId: r.d,
          event: r.ev,
          result: r.r,
          actorName: r.n,
          actorEmail: r.e,
          detail: r.det,
          ip: r.ip,
          ntpIso: r.t.toISOString(),
          ntpSource: "NTP:worldtimeapi/UTC",
          hashPre: r.pre,
          hashPost: r.post,
          prevHash: sprev === "GENESIS" ? null : sprev,
          hash,
          createdAt: r.t,
        };
        sprev = hash;
        return row;
      })
  );

  console.log("✓ Semilla completada");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
