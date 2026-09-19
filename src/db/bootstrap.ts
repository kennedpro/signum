import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { needsSsl, normalizeDbUrl } from "@/lib/db-url";
import { readEnv } from "@/lib/env";
import { hashPassword } from "@/lib/password";
import { hashSignPassword } from "@/lib/crypto-sign";

/* ═══════════════════════════════════════════════════════════════════
   INICIALIZADOR AUTOMÁTICO DE BASE DE DATOS

   Se ejecuta al arrancar Next.js:
   1. Conecta a PostgreSQL/Neon.
   2. Crea o actualiza las tablas con SQL idempotente.
   3. Garantiza las cuentas iniciales admin y Carlos.

   No borra documentos ni usuarios existentes.
   ═══════════════════════════════════════════════════════════════════ */

const globalBootstrap = globalThis as typeof globalThis & {
  __signumBootstrap?: Promise<BootstrapResult>;
};

export type BootstrapResult = {
  schemaUpdated: boolean;
  adminCreated: boolean;
  carlosCreated: boolean;
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

async function ensureOrganization(client: PoolClient) {
  const found = await client.query<{ id: string }>(
    "select id from organizations order by created_at limit 1"
  );
  if (found.rows[0]) return found.rows[0].id;

  const id = randomUUID();
  await client.query(
    `insert into organizations
      (id, name, entity_type, nit, sigla, city, address, phone, website,
       logo_variant, primary_color, created_at)
     values ($1,$2,'publica',$3,$4,$5,$6,$7,$8,'institucional','#0f766e',now())`,
    [
      id,
      "Dirección De Protección Y Servicios Especiales",
      "800.141.397-2",
      "DIPRO",
      "Bogotá D.C.",
      "Av. El Dorado No. 75-25",
      "(601) 315 9000",
      "www.dipro.gov.co",
    ]
  );
  return id;
}

async function ensureAccount(
  client: PoolClient,
  data: {
    organizationId: string;
    username: string;
    email: string;
    name: string;
    role: string;
    systemRole: string;
    department: string;
    color: string;
    grado: string | null;
    cargo: string;
    cedula: string;
    dependencia: string;
    unidad: string;
    area: string;
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
       dependencia, unidad, area, sign_password_hash, sign_password_salt, created_at)
     values
      ($1,$2,$3,$4,$5,$6,$7,'si',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())`,
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
      data.grado,
      data.cargo,
      data.cedula,
      data.dependencia,
      data.unidad,
      data.area,
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

    const orgId = await ensureOrganization(client);
    const second = await client.query<{ id: string }>(
      "select id from organizations where sigla='AURORA' limit 1"
    );
    if (!second.rows[0]) {
      await client.query(
        `insert into organizations
          (id, name, entity_type, nit, sigla, city, address, logo_variant, primary_color, created_at)
         values ($1,$2,'privada',$3,'AURORA',$4,$5,'corporativo','#0e7490',now())`,
        [
          randomUUID(),
          "Consultoría Aurora S.A.S.",
          "901.234.567-8",
          "Medellín",
          "Calle 10 No. 42-18",
        ]
      );
    }
    const bootstrapPassword = readEnv("BOOTSTRAP_ADMIN_PASSWORD") ?? "admin";

    const adminCreated = await ensureAccount(client, {
      organizationId: orgId,
      username: "admin",
      email: "admin@entidad.gov.co",
      name: "Administrador del Sistema",
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
      password: bootstrapPassword,
      signPassword: "FIRMA2026",
    });

    const auroraId = (
      await client.query<{ id: string }>("select id from organizations where sigla='AURORA' limit 1")
    ).rows[0]?.id;
    if (auroraId) {
      await ensureAccount(client, {
        organizationId: auroraId,
        username: "laura.mesa@aurora",
        email: "laura.mesa@aurora.co",
        name: "Laura Mesa Restrepo",
        role: "Directora de Operaciones",
        systemRole: "jefe_gestion",
        department: "Operaciones",
        color: "#34d399",
        grado: null,
        cargo: "Directora de Operaciones",
        cedula: "1020447781",
        dependencia: "Dirección de Operaciones",
        unidad: "Consultoría Aurora S.A.S.",
        area: "Operaciones",
        password: bootstrapPassword,
        signPassword: "FIRMA2026",
      });
      // Segundo funcionario de la empresa privada (para pruebas de destinatario/asistente)
      await ensureAccount(client, {
        organizationId: auroraId,
        username: "mateo.rojas@aurora",
        email: "mateo.rojas@aurora.co",
        name: "Mateo Rojas Cárdenas",
        role: "Gerente Comercial",
        systemRole: "usuario",
        department: "Comercial",
        color: "#f59e0b",
        grado: null,
        cargo: "Gerente Comercial",
        cedula: "1017234890",
        dependencia: "Gerencia Comercial",
        unidad: "Consultoría Aurora S.A.S.",
        area: "Comercial",
        password: bootstrapPassword,
        signPassword: "FIRMA2026",
      });
    }

    // Funcionarios adicionales de la entidad pública (dependencias distintas)
    await ensureAccount(client, {
      organizationId: orgId,
      username: "andres.rios@entidad",
      email: "andres.rios@correo.entidad.gov.co",
      name: "Andrés Ríos Beltrán",
      role: "Asesor Jurídico",
      systemRole: "usuario",
      department: "Legal",
      color: "#a78bfa",
      grado: "Abogado",
      cargo: "Asesor Jurídico Grado 03",
      cedula: "79554120",
      dependencia: "Oficina Asesora Jurídica",
      unidad: "Dirección Administrativa",
      area: "Jurídica",
      password: bootstrapPassword,
      signPassword: "FIRMA2026",
    });
    await ensureAccount(client, {
      organizationId: orgId,
      username: "camila.duarte@entidad",
      email: "camila.duarte@correo.entidad.gov.co",
      name: "Camila Duarte Peña",
      role: "Jefa de Talento Humano",
      systemRole: "usuario",
      department: "Talento Humano",
      color: "#34d399",
      grado: "Especialista",
      cargo: "Jefe Grupo Talento Humano",
      cedula: "52889341",
      dependencia: "Grupo de Administración de Personal",
      unidad: "Dirección de Talento Humano",
      area: "Talento Humano",
      password: bootstrapPassword,
      signPassword: "FIRMA2026",
    });

    const carlosCreated = await ensureAccount(client, {
      organizationId: orgId,
      username: "carlos.gomez@entidad",
      email: "carlos.gomez3224@correo.entidad.gov.co",
      name: "Carlos Ernesto Gomez Rodriguez",
      role: "Jefe Esquema De Seguridad",
      systemRole: "jefe_gestion",
      department: "Seguridad",
      color: "#22d3ee",
      grado: "Mayor",
      cargo: "Jefe Esquema De Seguridad",
      cedula: "1098613224",
      dependencia: "Grupo Protección A Personas E Instalaciones Gubernamentales",
      unidad: "Dirección De Protección Y Servicios Especiales",
      area: "Dirección de Seguridad",
      password: bootstrapPassword,
      signPassword: "FIRMA2026",
    });

    // Si la base no tiene documentos, siembra el entorno de demostración
    // (dos entidades con documentos en cada estado) sin tocar las cuentas.
    try {
      const { seedDemoIfEmpty } = await import("@/db/seed-demo");
      const seeded = await seedDemoIfEmpty();
      if (seeded) console.log("[SIGNUM] Datos de demostración cargados.");
    } catch (e) {
      console.error("[SIGNUM] No se pudieron sembrar datos de demo:", (e as Error).message);
    }

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
      adminCreated,
      carlosCreated,
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
      adminCreated: false,
      carlosCreated: false,
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
