import { ensureDatabase } from "@/db/bootstrap";
import { setBootstrapState } from "@/lib/bootstrap-state";

/* ═══════════════════════════════════════════════════════════════════
   ARRANQUE RESILIENTE DE LA BASE DE DATOS

   Antes, cualquier excepción aquí (Neon suspendido, red lenta, un fallo
   puntual de conexión) hacía que Next marcara la instrumentación como
   fallida y TODAS las rutas respondieran un "Internal Server Error" en
   texto plano, sin pista alguna para el usuario.

   Ahora:
   · Se reintenta hasta 3 veces con espera creciente (5 s, 10 s, 20 s).
   · Si aun así falla, el servidor ARRANCA igualmente y la aplicación
     muestra una pantalla de diagnóstico con el error real y cómo
     resolverlo; /api/health informa el estado.
   · En cuanto la base responde en un intento posterior, el estado se
     actualiza solo.
   ═══════════════════════════════════════════════════════════════════ */

const RETRY_DELAYS_MS = [5_000, 10_000, 20_000];

function describe(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const hints: string[] = [];
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) {
    hints.push("No se pudo resolver el host de DATABASE_URL: revise la conexión a internet y el nombre del servidor.");
  }
  if (/ECONNREFUSED/i.test(message)) {
    hints.push("El servidor PostgreSQL rechazó la conexión: ¿está encendido? ¿el puerto es el correcto?");
  }
  if (/timeout|ETIMEDOUT|Connection terminated/i.test(message)) {
    hints.push("Tiempo de espera agotado: si usa Neon, la base pudo estar suspendida; suele bastar con reintentar en unos segundos.");
  }
  if (/password authentication|SASL|SCRAM/i.test(message)) {
    hints.push("Usuario o contraseña incorrectos en DATABASE_URL: copie una cadena de conexión nueva desde su proveedor.");
  }
  if (/self.signed|certificate|SSL|TLS/i.test(message)) {
    hints.push("Problema TLS con la base: añada ?sslmode=require al final de DATABASE_URL.");
  }
  if (/schema\.sql/i.test(message)) {
    hints.push("Falta scripts/schema.sql: vuelva a descargar el proyecto completo.");
  }
  if (/Falta DATABASE_URL/i.test(message)) {
    hints.push("Cree el archivo .env con: node scripts/crear-env.mjs");
  }
  return { message, hints };
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function bootstrapWithRetries() {
  for (let attempt = 0; ; attempt++) {
    try {
      setBootstrapState({ status: "starting", attempt: attempt + 1 });
      const result = await ensureDatabase();
      setBootstrapState({ status: "ready", database: result.database, attempt: attempt + 1 });
      console.log(
        `[SIGNUM] Base «${result.database}» lista · esquema actualizado` +
          `${result.superadminCreated ? " · superadmin creado" : ""}` +
          `${result.usersCreated > 0 ? ` · ${result.usersCreated} cuenta(s) sembradas` : ""}`
      );
      return;
    } catch (error) {
      const { message, hints } = describe(error);
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        setBootstrapState({ status: "failed", error: message, hints, attempt: attempt + 1 });
        console.error("\n[SIGNUM] ✗ No fue posible preparar la base de datos tras varios intentos.");
        console.error(`[SIGNUM]   ${message}`);
        for (const h of hints) console.error(`[SIGNUM]   → ${h}`);
        console.error("[SIGNUM]   El servidor queda activo mostrando este diagnóstico. Corrija la causa y reinicie.\n");
        return;
      }
      setBootstrapState({ status: "retrying", error: message, hints, attempt: attempt + 1 });
      console.warn(`[SIGNUM] Intento ${attempt + 1} fallido: ${message}`);
      console.warn(`[SIGNUM] Reintentando en ${delay / 1000} s…`);
      await sleep(delay);
    }
  }
}

// Sin await de nivel superior: el servidor arranca mientras la base se prepara.
void bootstrapWithRetries();
