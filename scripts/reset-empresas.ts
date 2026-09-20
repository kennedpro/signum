import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "@/db/index";
import {
  organizations,
  users,
  documents,
  recipients,
  signatures,
  auditEvents,
  securityLogs,
  numberingLedger,
  sequences,
  documentMessages,
} from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { hashSignPassword } from "@/lib/crypto-sign";
import { SEED_ORGS, SEED_USERS, SEED_LOGIN_PASSWORD, SEED_SIGN_PASSWORD } from "@/db/seed-data";

/* ═══════════════════════════════════════════════════════════════════
   RESTABLECIMIENTO A DOS EMPRESAS NUEVAS
   · Pública:  Agencia Distrital de Innovación Pública (ADIP)
   · Privada:  Vantara Ingeniería y Tecnología S.A.S. (VANTARA)

   Borra TODO el contenido operativo anterior (documentos, firmas,
   mensajes, bitácoras, numeración, usuarios y empresas) y deja
   únicamente:
   · el administrador de PLATAFORMA (superadmin), sin empresa, que es
     el único perfil capaz de observar las dos empresas a la vez;
   · las cuentas base de cada empresa (admin, jefe de gestión
     documental y funcionarios en dependencias/sucursales distintas,
     para validar que dentro de una misma empresa sí se ven entre sí).

   Los datos exactos viven en src/db/seed-data.ts (fuente única que
   también usa el arranque automático en src/db/bootstrap.ts).

   Uso:  npx tsx scripts/reset-empresas.ts
   ⚠️ Esta operación es IRREVERSIBLE.
   ═══════════════════════════════════════════════════════════════════ */

async function main() {
  console.log("== 1) Borrado del contenido operativo anterior ==");
  // El libro de radicación tiene un disparador de inmutabilidad: se suspende
  // SOLO durante este reinicio autorizado y se restaura al final.
  await db.execute(sql`SET session_replication_role = replica;`);
  try {
    await db.delete(documentMessages);
    await db.delete(signatures);
    await db.delete(recipients);
    await db.delete(auditEvents);
    await db.delete(securityLogs);
    await db.delete(numberingLedger);
    await db.delete(sequences);
    await db.delete(documents);
    await db.delete(users);
    await db.delete(organizations);
  } finally {
    await db.execute(sql`SET session_replication_role = origin;`);
  }
  console.log("  documentos, firmas, mensajes, bitácoras, numeración, usuarios y organizaciones borrados.");

  console.log("\n== 2) Creación de las dos empresas nuevas ==");
  const orgIdBySigla = new Map<string, string>();
  const orgRows = SEED_ORGS.map((o) => {
    const id = randomUUID();
    orgIdBySigla.set(o.sigla, id);
    return {
      id,
      name: o.name,
      entityType: o.entityType,
      nit: o.nit,
      sigla: o.sigla,
      city: o.city,
      address: o.address,
      phone: o.phone,
      website: o.website,
      logoVariant: o.logoVariant,
      primaryColor: o.primaryColor,
    };
  });
  await db.insert(organizations).values(orgRows);
  for (const o of SEED_ORGS) console.log(`  ${o.sigla} · ${o.entityType.toUpperCase()} · ${o.name}`);

  console.log("\n== 3) Cuentas de usuario ==");
  const login = hashPassword(SEED_LOGIN_PASSWORD);
  const sign = hashSignPassword(SEED_SIGN_PASSWORD);

  for (const u of SEED_USERS) {
    const organizationId = u.orgSigla ? orgIdBySigla.get(u.orgSigla) ?? null : null;
    await db.insert(users).values({
      id: randomUUID(),
      organizationId,
      name: u.name,
      email: u.email,
      username: u.username,
      passwordHash: login.hash,
      passwordSalt: login.salt,
      active: "si",
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
      signPasswordHash: sign.hash,
      signPasswordSalt: sign.salt,
      // Cuentas de demostración: credenciales estables, no temporales.
      mustChangePassword: false,
    });
    const scope = u.orgSigla ?? "PLATAFORMA";
    console.log(`  ${scope} · ${u.username} (${u.systemRole})`);
  }

  console.log("\n== Listo ==");
  const orgs = await db.select().from(organizations);
  for (const o of orgs) console.log(`  ${o.sigla} | ${o.entityType} | ${o.name}`);
  console.log(`\n  Contraseña de acceso para todas las cuentas: ${SEED_LOGIN_PASSWORD}`);
  console.log(`  Contraseña de firma para todas las cuentas:  ${SEED_SIGN_PASSWORD}`);
  console.log("\n  Cambie estas contraseñas antes de usar el sistema en producción real.\n");
  await pool.end();
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
