import { randomUUID } from "node:crypto";
import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ═══════════════════════════════════════════════════════════════════
   1. CAPA DE DATOS Y PERSISTENCIA
   ═══════════════════════════════════════════════════════════════════ */

export const organizations = pgTable("organizations", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  entityType: text("entity_type").notNull().default("publica"), // publica | privada
  nit: text("nit"),
  sigla: text("sigla"),
  city: text("city").default("Bogotá D.C."),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  logoUrl: text("logo_url"),
  logoVariant: text("logo_variant").notNull().default("institucional"),
  primaryColor: text("primary_color").notNull().default("#0e7490"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Consecutivos por entidad.
 * scope = "draft"      → código provisional de edición: 00000001, 00000002…
 * scope = "INF-2026"   → radicado oficial por tipo y año: INF-2026-0316
 * Un único contador compartido por todos los funcionarios de la entidad.
 */
export const sequences = pgTable(
  "sequences",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organizations.id),
    scope: text("scope").notNull(),
    value: integer("value").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sequences_org_scope_idx").on(t.organizationId, t.scope)]
);

/**
 * LIBRO DE RADICACIÓN (append-only).
 * Cada número emitido —provisional u oficial— queda asentado una sola vez
 * con quién lo solicitó, cuándo, desde dónde y con qué huella. Encadenado
 * por hash: alterar o borrar un asiento rompe la cadena y es detectable.
 * Equivale al libro radicador físico exigido en gestión documental
 * (Acuerdo 060 de 2001 del Archivo General de la Nación).
 */
export const numberingLedger = pgTable(
  "numbering_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organizations.id),
    scope: text("scope").notNull(), // draft | INF-2026 | …
    kind: text("kind").notNull(), // provisional | radicado
    value: integer("value").notNull(),
    code: text("code").notNull(), // 00000001 | INF-2026-0316
    documentId: text("document_id"),
    documentTitle: text("document_title"),
    docType: text("doc_type"),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ntpIso: text("ntp_iso"),
    ntpSource: text("ntp_source"),
    hash: text("hash").notNull(),
    prevHash: text("prev_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ledger_org_scope_value_idx").on(t.organizationId, t.scope, t.value),
    index("ledger_document_idx").on(t.documentId),
    index("ledger_org_idx").on(t.organizationId),
  ]
);

// ─── Perfil del usuario + rol de sistema + foto ──────────────────────
export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: text("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  /** Credenciales de acceso al entorno */
  username: text("username").unique(),
  passwordHash: text("password_hash"),
  passwordSalt: text("password_salt"),
  active: text("active").notNull().default("si"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  role: text("role").notNull().default("Miembro"),
  /** RBAC: superadmin | admin | jefe_gestion | usuario */
  systemRole: text("system_role").notNull().default("usuario"),
  /**
   * Obliga a definir una contraseña propia en el próximo ingreso.
   * true → cuenta recién creada por un administrador o con clave
   * restablecida (clave temporal conocida por terceros).
   * false → clave definida por el propio usuario (o cuenta de
   * demostración estable, pensada para acceso repetido de prueba).
   */
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  department: text("department").notNull().default("Dirección"),
  color: text("color").notNull().default("#22d3ee"),
  photoUrl: text("photo_url"),
  grado: text("grado"),
  cargo: text("cargo"),
  cedula: text("cedula"),
  dependencia: text("dependencia"),
  unidad: text("unidad"),
  area: text("area"),
  sucursal: text("sucursal"),
  signPasswordHash: text("sign_password_hash"),
  signPasswordSalt: text("sign_password_salt"),
  /** Par de claves Ed25519 personal. La privada se guarda cifrada (AES-256-GCM). */
  signingPublicKey: text("signing_public_key"),
  signingPrivateKeyEnc: text("signing_private_key_enc"),
  signingKeyFingerprint: text("signing_key_fingerprint"),
  signingKeyCreatedAt: timestamp("signing_key_created_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Documentos con configuración previa ─────────────────────────────
export const documents = pgTable(
  "documents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organizationId: text("organization_id").references(() => organizations.id),
    /** acta | informe | memorando | oficio | contrato | certificacion */
    docType: text("doc_type").notNull().default("memorando"),
    /** Radicado oficial (INF-2026-0316). Nulo mientras es borrador. */
    docNumber: text("doc_number"),
    /** Código provisional de edición (00000001). */
    draftCode: text("draft_code"),
    radicadoAt: timestamp("radicado_at", { withTimezone: true }),
    title: text("title").notNull(),
    subject: text("subject"),
    city: text("city"),
    content: text("content").notNull().default(""),
    /** Normas APA 7.ª edición */
    apaEnabled: boolean("apa_enabled").notNull().default(false),
    apaAuthors: text("apa_authors"),
    apaInstitution: text("apa_institution"),
    apaCourse: text("apa_course"),
    apaInstructor: text("apa_instructor"),
    /** Configuración de página (JSON): márgenes, encabezado/pie desde el borde, sangrías. */
    pageSetup: text("page_setup"),
    /** Última observación del firmante al DEVOLVER el documento al autor (se limpia al reenviar). */
    returnNote: text("return_note"),
    status: text("status").notNull().default("borrador"),
    /** Configuración previa cerrada: define firmantes y destinatarios */
    configLocked: boolean("config_locked").notNull().default(false),
    ownerId: text("owner_id").references(() => users.id),
    senderId: text("sender_id").references(() => users.id),
    ownerSignedAt: timestamp("owner_signed_at", { withTimezone: true }),
    hashPre: text("hash_pre"),
    hashPost: text("hash_post"),
    sealHash: text("seal_hash"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_status_idx").on(t.status), index("documents_type_idx").on(t.docType)]
);

// ─── Destinatarios: firmantes, asistentes, participantes y copias ───
export const recipients = pgTable(
  "recipients",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** signer | attendee | participant | copy */
    kind: text("kind").notNull().default("signer"),
    /** Orden y rótulo del contenedor de firma */
    slot: integer("slot"),
    slotLabel: text("slot_label"),
    userId: text("user_id").references(() => users.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    department: text("department"),
    entityType: text("entity_type").notNull().default("publica"),
    grado: text("grado"),
    cargo: text("cargo"),
    cedula: text("cedula"),
    dependencia: text("dependencia"),
    unidad: text("unidad"),
    empresa: text("empresa"),
    nit: text("nit"),
    area: text("area"),
    sucursal: text("sucursal"),
    /** Destinatario de otra empresa (solo PARA). */
    external: boolean("external").notNull().default(false),
    companyName: text("company_name"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** OTP de intención de firma (segundo factor dinámico) */
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
    status: text("status").notNull().default("pendiente"),
    token: text("token").notNull().unique(),
    signPasswordHash: text("sign_password_hash"),
    signPasswordSalt: text("sign_password_salt"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recipients_document_idx").on(t.documentId),
    index("recipients_token_idx").on(t.token),
    index("recipients_email_idx").on(t.email),
  ]
);

// ─── Firmas ──────────────────────────────────────────────────────────
export const signatures = pgTable(
  "signatures",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    recipientId: text("recipient_id").references(() => recipients.id, { onDelete: "set null" }),
    slot: integer("slot").notNull().default(1),
    entityType: text("entity_type").notNull().default("publica"),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email").notNull(),
    signerGrado: text("signer_grado"),
    signerCargo: text("signer_cargo"),
    signerCedula: text("signer_cedula"),
    signerDependencia: text("signer_dependencia"),
    signerUnidad: text("signer_unidad"),
    signerEmpresa: text("signer_empresa"),
    signerNit: text("signer_nit"),
    signerArea: text("signer_area"),
    signerSucursal: text("signer_sucursal"),
    logoVariant: text("logo_variant").notNull().default("institucional"),
    logoUrl: text("logo_url"),
    signatureData: text("signature_data").notNull(),
    method: text("method").notNull().default("dibujada"),
    hashPre: text("hash_pre"),
    hashPost: text("hash_post"),
    hash: text("hash").notNull(),
    prevHash: text("prev_hash"),
    ntpIso: text("ntp_iso"),
    ntpSource: text("ntp_source"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** Evidencia jurídica (Ley 527/1999 · Decreto 2364/2012) */
    consentText: text("consent_text"),
    consentHash: text("consent_hash"),
    otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
    authFactors: text("auth_factors"),
    canonicalPayload: text("canonical_payload"),
    signatureAlg: text("signature_alg"),
    signatureValue: text("signature_value"),
    signerPublicKey: text("signer_public_key"),
    signerKeyFingerprint: text("signer_key_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signatures_document_idx").on(t.documentId)]
);

/* ─── LOGS 1: Trazabilidad por documento ─────────────────────────── */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    label: text("label").notNull(),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email"),
    detail: text("detail"),
    ip: text("ip"),
    hash: text("hash"),
    prevHash: text("prev_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_document_idx").on(t.documentId)]
);

/* ─── LOGS 2: Pista de seguridad (rol restringido) ───────────────── */
export const securityLogs = pgTable(
  "security_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id").references(() => documents.id, { onDelete: "cascade" }),
    /** Empresa a la que pertenece el evento (para eventos sin documento: alta,
     *  restablecimiento de contraseña, cambio de perfil, etc.). Permite que
     *  cada empresa vea SOLO su propia pista de seguridad. */
    organizationId: text("organization_id").references(() => organizations.id),
    recipientId: text("recipient_id"),
    event: text("event").notNull(),
    result: text("result").notNull().default("ok"),
    actorName: text("actor_name").notNull(),
    actorEmail: text("actor_email"),
    detail: text("detail"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ntpIso: text("ntp_iso"),
    ntpSource: text("ntp_source"),
    hashPre: text("hash_pre"),
    hashPost: text("hash_post"),
    hash: text("hash"),
    prevHash: text("prev_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("security_document_idx").on(t.documentId)]
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Recipient = typeof recipients.$inferSelect;
export type Signature = typeof signatures.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type SecurityLog = typeof securityLogs.$inferSelect;

/**
 * HILO DE MENSAJES DEL DOCUMENTO (trazabilidad conversacional).
 * Cada envío a aprobar, aprobación, devolución, firma, archivo o remisión puede
 * llevar un comentario dirigido a una persona. Lo ven todos los relacionados
 * con el documento, antes y después de la firma.
 */
export const documentMessages = pgTable("document_messages", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  /** Autor del mensaje */
  fromUserId: text("from_user_id"),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email"),
  /** Destinatario del mensaje (persona a la que se dirige la acción) */
  toName: text("to_name"),
  toEmail: text("to_email"),
  /** Tipo de acción que originó el mensaje: envio_aprobacion, aprobacion, devolucion, firma, archivo, remision, comentario */
  kind: text("kind").notNull().default("comentario"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DocumentMessage = typeof documentMessages.$inferSelect;
