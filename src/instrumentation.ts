/**
 * Hook de instrumentación de Next.js.
 * La importación dinámica evita incluir módulos de Node (pg, fs, crypto) en
 * el paquete Edge. El inicializador solo corre en el servidor Node.js.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
