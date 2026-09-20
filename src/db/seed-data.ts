/* ═══════════════════════════════════════════════════════════════════
   FUENTE ÚNICA DE VERDAD — Empresas y cuentas base de SIGNUM
   ───────────────────────────────────────────────────────────────────
   Este módulo define las DOS empresas activas (una pública, una
   privada) y sus funcionarios de arranque, además del administrador
   de PLATAFORMA (superadmin), que es el único perfil capaz de
   observar ambas empresas a la vez.

   Lo consumen dos caminos, siempre con los mismos datos:
   · src/db/bootstrap.ts   → arranque automático (crea solo si falta).
   · scripts/reset-empresas.ts → reinicio manual (borra todo y recrea).
   ═══════════════════════════════════════════════════════════════════ */

export type SeedOrg = {
  sigla: string;
  name: string;
  entityType: "publica" | "privada";
  nit: string;
  city: string;
  address: string;
  phone: string;
  website: string;
  logoVariant: string;
  primaryColor: string;
};

export type SeedUser = {
  /** null → administrador de plataforma, sin empresa asignada. */
  orgSigla: string | null;
  username: string;
  email: string;
  name: string;
  role: string;
  systemRole: "superadmin" | "admin" | "jefe_gestion" | "usuario";
  department: string;
  color: string;
  grado?: string | null;
  cargo?: string | null;
  cedula?: string | null;
  dependencia?: string | null;
  unidad?: string | null;
  area?: string | null;
  sucursal?: string | null;
};

/** Contraseña de acceso y de firma por defecto para las cuentas sembradas. */
export const SEED_LOGIN_PASSWORD = "admin";
export const SEED_SIGN_PASSWORD = "FIRMA2026";

/* ─── Empresa pública ─────────────────────────────────────────────── */
export const ORG_PUBLICA: SeedOrg = {
  sigla: "ADIP",
  name: "Agencia Distrital de Innovación Pública",
  entityType: "publica",
  nit: "900.555.234-1",
  city: "Bogotá D.C.",
  address: "Cra 30 No. 24-90, Centro Administrativo Distrital",
  phone: "(601) 381 4000",
  website: "www.adip.gov.co",
  logoVariant: "institucional",
  primaryColor: "#0ea5e9",
};

/* ─── Empresa privada ─────────────────────────────────────────────── */
export const ORG_PRIVADA: SeedOrg = {
  sigla: "VANTARA",
  name: "Vantara Ingeniería y Tecnología S.A.S.",
  entityType: "privada",
  nit: "901.778.245-6",
  city: "Medellín",
  address: "Cra 43A No. 5-15, El Poblado",
  phone: "(604) 501 2200",
  website: "www.vantara.com.co",
  logoVariant: "corporativo",
  primaryColor: "#7c3aed",
};

export const SEED_ORGS: SeedOrg[] = [ORG_PUBLICA, ORG_PRIVADA];

/* ─── Cuentas base ────────────────────────────────────────────────── */
export const SEED_USERS: SeedUser[] = [
  // ── Administrador de PLATAFORMA: sin empresa, ve las dos ──────────
  {
    orgSigla: null,
    username: "superadmin",
    email: "superadmin@signum.plataforma",
    name: "Administrador de Plataforma SIGNUM",
    role: "Administrador de Plataforma",
    systemRole: "superadmin",
    department: "Plataforma",
    color: "#f4c145",
    cargo: "Administrador de Plataforma",
  },

  // ── ADIP (pública) ─────────────────────────────────────────────
  {
    orgSigla: "ADIP",
    username: "diana.ortiz@adip",
    email: "diana.ortiz@adip.gov.co",
    name: "Diana Marcela Ortiz Salazar",
    role: "Directora General",
    systemRole: "admin",
    department: "Dirección General",
    color: "#a78bfa",
    grado: "Directora",
    cargo: "Directora General",
    cedula: "1010123456",
    dependencia: "Despacho de la Dirección General",
    unidad: "Agencia Distrital de Innovación Pública",
    area: "Dirección",
  },
  {
    orgSigla: "ADIP",
    username: "jorge.salcedo@adip",
    email: "jorge.salcedo@adip.gov.co",
    name: "Jorge Iván Salcedo Pardo",
    role: "Jefe de Gestión Documental",
    systemRole: "jefe_gestion",
    department: "Gestión Documental",
    color: "#22d3ee",
    grado: "Profesional Especializado",
    cargo: "Jefe de Gestión Documental",
    cedula: "1015789456",
    dependencia: "Grupo de Gestión Documental",
    unidad: "Dirección Administrativa",
    area: "Administrativa",
  },
  {
    orgSigla: "ADIP",
    username: "valentina.cardenas@adip",
    email: "valentina.cardenas@adip.gov.co",
    name: "Valentina Cárdenas Ruiz",
    role: "Asesora Jurídica",
    systemRole: "usuario",
    department: "Legal",
    color: "#34d399",
    grado: "Abogada",
    cargo: "Asesora Jurídica",
    cedula: "1019456789",
    dependencia: "Oficina Asesora Jurídica",
    unidad: "Dirección Administrativa",
    area: "Legal",
  },
  {
    orgSigla: "ADIP",
    username: "felipe.herrera@adip",
    email: "felipe.herrera@adip.gov.co",
    name: "Felipe Antonio Herrera Gómez",
    role: "Profesional de Talento Humano",
    systemRole: "usuario",
    department: "Talento Humano",
    color: "#f59e0b",
    grado: "Profesional Universitario",
    cargo: "Profesional de Talento Humano",
    cedula: "1022345678",
    dependencia: "Subdirección de Talento Humano",
    unidad: "Dirección Administrativa",
    area: "Talento Humano",
  },

  // ── Vantara (privada) ───────────────────────────────────────────
  {
    orgSigla: "VANTARA",
    username: "santiago.blandon@vantara",
    email: "santiago.blandon@vantara.com.co",
    name: "Santiago Blandón Vélez",
    role: "Gerente General",
    systemRole: "admin",
    department: "Gerencia General",
    color: "#a78bfa",
    cargo: "Gerente General",
    cedula: "1128456712",
    area: "Dirección",
    sucursal: "Sede Medellín (Principal)",
  },
  {
    orgSigla: "VANTARA",
    username: "manuela.restrepo@vantara",
    email: "manuela.restrepo@vantara.com.co",
    name: "Manuela Restrepo Zuluaga",
    role: "Coordinadora de Gestión Documental",
    systemRole: "jefe_gestion",
    department: "Gestión Documental",
    color: "#22d3ee",
    cargo: "Coordinadora de Gestión Documental",
    cedula: "1035678123",
    area: "Administrativa",
    sucursal: "Sede Medellín (Principal)",
  },
  {
    orgSigla: "VANTARA",
    username: "julian.cardenas@vantara",
    email: "julian.cardenas@vantara.com.co",
    name: "Julián Esteban Cárdenas Mora",
    role: "Ejecutivo Comercial",
    systemRole: "usuario",
    department: "Comercial",
    color: "#f59e0b",
    cargo: "Ejecutivo Comercial",
    cedula: "1019988776",
    area: "Comercial",
    sucursal: "Sede Bogotá (Sucursal Comercial)",
  },
  {
    orgSigla: "VANTARA",
    username: "camila.zapata@vantara",
    email: "camila.zapata@vantara.com.co",
    name: "Camila Andrea Zapata Osorio",
    role: "Analista de TI",
    systemRole: "usuario",
    department: "Tecnología",
    color: "#34d399",
    cargo: "Analista de TI",
    cedula: "1042233445",
    area: "Tecnología",
    sucursal: "Sede Medellín (Principal)",
  },
];
