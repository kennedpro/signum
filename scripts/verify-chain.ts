import "dotenv/config";
import { asc } from "drizzle-orm";
import { db } from "../src/db";
import { auditEvents } from "../src/db/schema";

/**
 * Diagnóstico forense de la cadena global de auditoría.
 *   npx tsx scripts/verify-chain.ts
 */
async function main() {
  const all = await db
    .select({
      id: auditEvents.id,
      hash: auditEvents.hash,
      prevHash: auditEvents.prevHash,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id));

  let broken: number | null = null;
  for (let i = 1; i < all.length; i++) {
    if (all[i].prevHash !== all[i - 1].hash) {
      broken = i;
      break;
    }
  }
  console.log(`eslabones: ${all.length}`);
  if (broken === null) {
    console.log("cadena: ÍNTEGRA");
  } else {
    console.log(`cadena: ROTA en #${broken}`);
    console.log("  anterior:", all[broken - 1].hash?.slice(0, 12), all[broken - 1].createdAt.toISOString());
    console.log("  actual  :", all[broken].prevHash?.slice(0, 12), "->", all[broken].hash?.slice(0, 12), all[broken].createdAt.toISOString());
  }
  process.exit(0);
}
main();
