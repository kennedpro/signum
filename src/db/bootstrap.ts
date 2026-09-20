import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { needsSsl, normalizeDbUrl } from "@/lib/db-url";
import { readEnv } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { hashSignPassword } from "@/lib/crypto-sign";
import { SEED_ORGS, SEED_USERS, SEED_LOGIN_PASSWORD, SEED_SIGN_PASSWORD } from "@/db/seed-data";

/* ═══════════════════════════════════════════════════════════════════
   INICIALIZADOR AUTOMÁTICO DE BASE DE DATOS

   Se ejecuta al arrancar Next.js:
   1. Conecta a PostgreSQL/Neon.
   2. Crea o actualiza las tablas con SQL idempotente.
   3. Garantiza las DOS empresas base (pública y privada) y sus
      cuentas iniciales, incluido el administrador de PLATAFORMA
      (superadmin), definidas en src/db/seed-data.ts.

   No borra documentos, empresas ni usuarios existentes: solo crea lo
   que falte (emparejado por `sigla` en empresas y por usuario/correo
   en cuentas). Para reemplazar TODO el contenido anterior por las dos
   empresas nuevas use: npx tsx scripts/reset-empresas.ts
   ═══════════════════════════════════════════════════════════════════ */

const globalBootstrap = globalThis as typeof globalThis & {
  __signumBootstrap?: Promise<BootstrapResult>;
};

export type BootstrapResult = {
  schemaUpdated: boolean;
  superadminCreated: boolean;
  usersCreated: number;
  database: string;
};

function schemaPath() {
  const candidates = [
    join(process.cwd(), "scripts", "schema.sql"),
    join(process.cwd(), "..", "scripts", "schema.sql"),
    join(process.cwd(), ".next", "server", "scripts", "schema.sql"),
  ];
  const path = candidates.find(existsSync);
  if (!path) {
    throw new Error(
      "No se encontró scripts/schema.sql. Vuelva a descargar el proyecto completo."
    );
  }
  return path;
}

/** Crea la empresa si no existe una con esa `sigla`; nunca la borra ni la duplica. */
async function ensureOrganizationBySigla(
  client: PoolClient,
  org: {
    sigla: string;
    name: string;
    entityType: string;
    nit: string;
    city: string;
    address: string;
    phone: string;
    website: string;
    logoVariant: string;
    primaryColor: string;
  }
) {
  const found = await client.query<{ id: string }>(
    "select id from organizations where sigla=$1 limit 1",
    [org.sigla]
  );
  if (found.rows[0]) return found.rows[0].id;

  const id = randomUUID();
  await client.query(
    `insert into organizations
      (id, name, entity_type, nit, sigla, city, address, phone, website,
       logo_variant, primary_color, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
    [
      id,
      org.name,
      org.entityType,
      org.nit,
      org.sigla,
      org.city,
      org.address,
      org.phone,
      org.website,
      org.logoVariant,
      org.primaryColor,
    ]
  );
  return id;
}

async function ensureAccount(
  client: PoolClient,
  data: {
    organizationId: string | null;
    username: string;
    email: string;
    name: string;
    role: string;
    systemRole: string;
    department: string;
    color: string;
    grado?: string | null;
    cargo?: string | null;
    cedula?: string | null;
    dependencia?: string | null;
    unidad?: string | null;
    area?: string | null;
    sucursal?: string | null;
    password: string;
    signPassword?: string;
  }
) {
  const found = await client.query<{
    id: string;
    password_hash: string | null;
    password_salt: string | null;
  }>(
    "select id, password_hash, password_salt from users where username=$1 or email=$2 limit 1",
    [data.username, data.email]
  );

  if (found.rows[0]) {
    // Repara instalaciones antiguas sin credenciales; no pisa claves cambiadas.
    if (!found.rows[0].password_hash || !found.rows[0].password_salt) {
      const access = hashPassword(data.password);
      await client.query(
        `update users set username=$1, password_hash=$2, password_salt=$3,
          active='si', system_role=$4 where id=$5`,
        [data.username, access.hash, access.salt, data.systemRole, found.rows[0].id]
      );
    }
    return false;
  }

  const access = hashPassword(data.password);
  const sign = data.signPassword ? hashSignPassword(data.signPassword) : null;

  await client.query(
    `insert into users
      (id, organization_id, name, email, username, password_hash, password_salt,
       active, role, system_role, department, color, grado, cargo, cedula,
       dependencia, unidad, area, sucursal, sign_password_hash, sign_password_salt,
       must_change_password, created_at)
     values
      ($1,$2,$3,$4,$5,$6,$7,'si',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,false,now())`,
    [
      randomUUID(),
      data.organizationId,
      data.name,
      data.email,
      data.username,
      access.hash,
      access.salt,
      data.role,
      data.systemRole,
      data.department,
      data.color,
      data.grado ?? null,
      data.cargo ?? null,
      data.cedula ?? null,
      data.dependencia ?? null,
      data.unidad ?? null,
      data.area ?? null,
      data.sucursal ?? null,
      sign?.hash ?? null,
      sign?.salt ?? null,
    ]
  );
  return true;
}

const PREFIX: Record<string, string> = {
  acta: "ACTA",
  informe: "INF",
  memorando: "MEM",
  oficio: "OFI",
  contrato: "CTO",
  certificacion: "CER",
};

async function nextSeq(client: PoolClient, orgId: string | null, scope: string) {
  const r = await client.query<{ value: number }>(
    `insert into sequences (id, organization_id, scope, value, updated_at)
     values ($1, $2, $3, 1, now())
     on conflict (organization_id, scope)
     do update set value = sequences.value + 1, updated_at = now()
     returning value`,
    [randomUUID(), orgId, scope]
  );
  return Number(r.rows[0].value);
}

async function backfillNumbering(client: PoolClient) {
  const pending = await client.query<{
    id: string;
    organization_id: string | null;
    doc_type: string;
    status: string;
    doc_number: string | null;
    draft_code: string | null;
    created_at: Date;
  }>(
    `select id, organization_id, doc_type, status, doc_number, draft_code, created_at
     from documents
     where draft_code is null or (status = 'completado' and doc_number is null)
     order by created_at asc`
  );
  for (const d of pending.rows) {
    const draft = d.draft_code ?? String(await nextSeq(client, d.organization_id, "draft")).padStart(8, "0");
    let number = d.doc_number;
    if (d.status === "completado" && !number) {
      const prefix = PREFIX[d.doc_type] ?? "DOC";
      const year = new Date(d.created_at).getFullYear();
      const v = await nextSeq(client, d.organization_id, `${prefix}-${year}`);
      number = `${prefix}-${year}-${String(v).padStart(4, "0")}`;
    }
    await client.query(
      `update documents set draft_code = $1, doc_number = coalesce(doc_number, $2),
         radicado_at = case when $2::text is not null and radicado_at is null then now() else radicado_at end
       where id = $3`,
      [draft, number, d.id]
    );
  }
}

/**
 * Divide el SQL en sentencias respetando bloques $$…$$ (funciones plpgsql).
 */
function splitStatements(sqlText: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  const lines = sqlText.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.replace(/--.*$/, inDollar ? "$&" : "");
    if (!inDollar && line.trim() === "") continue;
    buf += rawLine + "\n";
    const dollars = (rawLine.match(/\$\$/g) ?? []).length;
    if (dollars % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*$/.test(rawLine.replace(/--.*$/, ""))) {
      const st = buf.trim();
      if (st && !/^--/.test(st)) out.push(st);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Errores que significan "ya está hecho": se ignoran sin ruido. */
const BENIGN = [
  /already exists/i,
  /ya existe/i,
  /duplicate_object/i,
  /multiple primary keys/i,
  /42710/, // duplicate_object
  /42P07/, // duplicate_table
  /42701/, // duplicate_column
  /42723/, // duplicate_function
];

/**
 * Aplica el esquema sentencia por sentencia, sin transacción global:
 * un "ya existe" no aborta el resto, y un error REAL se reporta con la
 * sentencia exacta que falló. Esto es lo que permite actualizar bases
 * antiguas (creadas por drizzle-kit o a mano) sin tocar el SQL Editor.
 */
async function applySchema(client: PoolClient, sqlText: string) {
  const statements = splitStatements(sqlText);
  const failures: { statement: string; error: string }[] = [];
  const started = Date.now();
  console.log(`[SIGNUM] Aplicando esquema: ${statements.length} sentencias (idempotentes)…`);
  let done = 0;
  for (const st of statements) {
    done += 1;
    if (done % 40 === 0 || done === statements.length) {
      console.log(`[SIGNUM]   ${done}/${statements.length} · ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    try {
      await client.query(st);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      const msg = `${err.code ?? ""} ${err.message ?? String(e)}`;
      if (BENIGN.some((re) => re.test(msg))) continue;
      failures.push({ statement: st.split("\n")[0].slice(0, 110), error: err.message ?? msg });
    }
  }
  if (failures.length) {
    const detail = failures.map((f) => `  • ${f.statement}\n    → ${f.error}`).join("\n");
    throw new Error(`El esquema no pudo aplicarse por completo:\n${detail}`);
  }
}

async function runBootstrap(): Promise<BootstrapResult> {
  const raw = readEnv("DATABASE_URL");
  if (!raw) {
    throw new Error(
      "Falta DATABASE_URL. Créelo una sola vez con: node scripts/crear-env.mjs"
    );
  }

  const connectionString = normalizeDbUrl(raw);
  let host = "la base de datos";
  try {
    host = new URL(connectionString).host || host;
  } catch {
    /* cadena no estándar: se omite el host en el mensaje */
  }
  const managed = needsSsl(raw);
  console.log(
    `[SIGNUM] Conectando a ${host}…` +
      (managed ? " (si la base estaba suspendida, despertarla puede tardar hasta 30 s)" : "")
  );

  const pool = new Pool({
    connectionString,
    ssl: managed ? { rejectUnauthorized: false } : undefined,
    max: 2,
    connectionTimeoutMillis: 25_000,
  });
  const t0 = Date.now();
  const client = await pool.connect();
  console.log(`[SIGNUM] Conexión establecida en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  let locked = false;

  try {
    // Evita que dos instancias migren la misma base al mismo tiempo.
    // Se usa la variante NO bloqueante: con el pooler de Neon (PgBouncer en
    // modo transacción) un candado de sesión puede quedar huérfano en otro
    // backend y `pg_advisory_lock` esperaría para siempre. Si no se obtiene,
    // se continúa sin él: el SQL es idempotente.
    try {
      const r = await client.query<{ ok: boolean }>(
        "select pg_try_advisory_lock(7319042601) as ok"
      );
      locked = Boolean(r.rows[0]?.ok);
      if (!locked) {
        console.log(
          "[SIGNUM] Otra instancia parece estar actualizando la base; se continúa sin candado."
        );
      }
    } catch {
      locked = false;
    }

    const sql = readFileSync(schemaPath(), "utf8");
    await applySchema(client, sql);

    // Empresas base: una pública y una privada, emparejadas por `sigla`.
    // Nunca se borran ni se duplican aquí; solo se crean si faltan.
    const orgIdBySigla = new Map<string, string>();
    for (const org of SEED_ORGS) {
      const id = await ensureOrganizationBySigla(client, org);
      orgIdBySigla.set(org.sigla, id);
    }

    const bootstrapPassword = readEnv("BOOTSTRAP_ADMIN_PASSWORD") ?? SEED_LOGIN_PASSWORD;
    let superadminCreated = false;
    let usersCreated = 0;

    for (const u of SEED_USERS) {
      const organizationId = u.orgSigla ? (orgIdBySigla.get(u.orgSigla) ?? null) : null;
      const created = await ensureAccount(client, {
        organizationId,
        username: u.username,
        email: u.email,
        name: u.name,
        role: u.role,
        systemRole: u.systemRole,
        department: u.department,
        color: u.color,
        grado: u.grado ?? null,
        cargo: u.cargo ?? null,
        cedula: u.cedula ?? null,
        dependencia: u.dependencia ?? null,
        unidad: u.unidad ?? null,
        area: u.area ?? null,
        sucursal: u.sucursal ?? null,
        password: bootstrapPassword,
        signPassword: SEED_SIGN_PASSWORD,
      });
      if (created) {
        usersCreated += 1;
        if (u.systemRole === "superadmin") superadminCreated = true;
      }
    }

    // Producción: NO se siembran documentos automáticamente.
    // Para cargar el entorno de demostración de forma voluntaria se ejecuta:
    //   npx tsx src/db/seed-demo.ts

    /**
     * Retrocompatibilidad: documentos creados antes de la numeración
     * reciben su código provisional (borradores) o un radicado consecutivo
     * (ya firmados), sin alterar los que ya tenían número.
     */
    await backfillNumbering(client);

    const info = await client.query<{ current_database: string }>(
      "select current_database()"
    );

    return {
      schemaUpdated: true,
      superadminCreated,
      usersCreated,
      database: info.rows[0]?.current_database ?? "postgres",
    };
  } finally {
    if (locked) {
      try {
        await client.query("select pg_advisory_unlock(7319042601)");
      } catch {
        // La conexión se cerrará de todas formas.
      }
    }
    client.release();
    await pool.end();
  }
}

/** Una sola ejecución por proceso, incluso con recarga en desarrollo. */
export function ensureDatabase() {
  if (readEnv("AUTO_BOOTSTRAP_DB") === "false") {
    return Promise.resolve({
      schemaUpdated: false,
      superadminCreated: false,
      usersCreated: 0,
      database: "disabled",
    });
  }

  globalBootstrap.__signumBootstrap ??= runBootstrap().catch((error) => {
    // Permite reintentar en una recarga si Neon estaba suspendido.
    delete globalBootstrap.__signumBootstrap;
    throw error;
  });
  return globalBootstrap.__signumBootstrap;
}
