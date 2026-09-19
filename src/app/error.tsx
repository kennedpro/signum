"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Database, ShieldAlert } from "lucide-react";

type Health = {
  ok: boolean;
  bootstrap?: { status: string; attempt: number; error?: string; hints?: string[]; database?: string };
};

/**
 * Pantalla de error de la aplicación (sustituye al "Internal Server Error"
 * en texto plano). Consulta /api/health para explicar, en lenguaje claro,
 * si el problema es la base de datos y cómo resolverlo.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      setHealth((await res.json()) as Health);
    } catch {
      setHealth({ ok: false });
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void check();
    const t = window.setInterval(() => void check(), 8000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    // En cuanto la base vuelve, se reintenta la página automáticamente.
    if (health?.ok && health.bootstrap?.status === "ready") reset();
  }, [health, reset]);

  const dbProblem = health && !health.ok;
  const b = health?.bootstrap;

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "min(680px, 100%)", border: "1px solid rgba(34,211,238,.25)", borderRadius: 14, background: "rgba(8,20,28,.95)", padding: 28, boxShadow: "0 30px 80px rgba(0,0,0,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 10, background: "rgba(244,63,94,.12)", border: "1px solid rgba(244,63,94,.4)" }}>
            {dbProblem ? <Database size={22} color="#fb7185" /> : <AlertTriangle size={22} color="#fb7185" />}
          </span>
          <div>
            <p style={{ margin: 0, fontSize: 10, letterSpacing: ".22em", color: "#67e8f9", fontWeight: 700 }}>SIGNUM · DIAGNÓSTICO</p>
            <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700 }}>
              {dbProblem ? "La base de datos no está disponible" : "Ocurrió un error en el servidor"}
            </h1>
          </div>
        </div>

        {dbProblem ? (
          <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>
            <p style={{ margin: 0 }}>
              {b?.status === "retrying" || b?.status === "starting"
                ? `SIGNUM está intentando conectar con la base de datos (intento ${b.attempt}). Si usa Neon, la base puede tardar hasta un minuto en despertar.`
                : "SIGNUM no pudo conectar con la base de datos tras varios intentos."}
            </p>
            {b?.error && (
              <pre style={{ marginTop: 12, padding: "10px 12px", background: "#0b1a22", border: "1px solid rgba(255,255,255,.08)", borderRadius: 8, fontSize: 12, whiteSpace: "pre-wrap", color: "#fda4af" }}>{b.error}</pre>
            )}
            {b?.hints?.length ? (
              <ul style={{ margin: "12px 0 0", paddingLeft: 18 }}>
                {b.hints.map((h) => <li key={h} style={{ marginBottom: 4 }}>{h}</li>)}
              </ul>
            ) : null}
            <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "#94a3b8" }}>
              Revise la ventana negra de SIGNUM: allí aparece el detalle. Compruebe la conexión con <code style={{ color: "#67e8f9" }}>npx tsx scripts/check-db.ts</code> y reinicie con <code style={{ color: "#67e8f9" }}>INICIAR-SIGNUM.cmd</code>.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 18, fontSize: 14, lineHeight: 1.6, color: "#cbd5e1" }}>
            <p style={{ margin: 0 }}>La operación no pudo completarse. El detalle técnico quedó registrado en la consola del servidor.</p>
            {error?.digest && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#94a3b8" }}>Referencia: {error.digest}</p>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          <button onClick={() => reset()} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, border: 0, background: "#22d3ee", color: "#06201f", fontWeight: 700, cursor: "pointer" }}>
            <RefreshCw size={16} /> Reintentar
          </button>
          <button onClick={() => void check()} disabled={checking} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,.15)", background: "transparent", color: "#e2e8f0", cursor: "pointer" }}>
            <ShieldAlert size={16} /> {checking ? "Comprobando…" : "Comprobar estado"}
          </button>
          <span style={{ alignSelf: "center", fontSize: 12, color: "#64748b" }}>
            {health ? (health.ok ? "Base de datos: operativa" : `Estado: ${b?.status ?? "sin conexión"}`) : "Comprobando estado…"}
          </span>
        </div>
      </section>
    </main>
  );
}
