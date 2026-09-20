"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Loader2,
  LogIn,
  Lock,
  ShieldCheck,
  User as UserIcon,
  Eye,
  EyeOff,
  AlertTriangle,
  Fingerprint,
  Activity,
} from "lucide-react";
import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/utils";

const DEMO = [
  {
    label: "Administrador de Plataforma",
    login: "superadmin",
    pass: "admin",
    tone: "text-gold",
  },
  {
    label: "Diana Ortiz · ADIP (pública)",
    login: "diana.ortiz@adip",
    pass: "admin",
    tone: "text-plasma",
  },
  {
    label: "Santiago Blandón · Vantara (privada)",
    login: "santiago.blandon@vantara",
    pass: "admin",
    tone: "text-neon",
  },
];

export function LoginForm({ updatePack = null }: { updatePack?: { href: string; sizeKb: number } | null }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });

      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();

      if (!text) {
        throw new Error(res.ok ? "Respuesta vacía del servidor." : `Error del servidor (${res.status}).`);
      }
      let data: { error?: string; ok?: boolean };
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Respuesta no válida del servidor (${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar sesión");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-md border border-line2 bg-panel2/60 py-2.5 pl-10 pr-3 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Fondo técnico */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(700px 380px at 20% 10%, rgba(34,211,238,0.10), transparent 60%), radial-gradient(600px 340px at 85% 90%, rgba(167,139,250,0.10), transparent 60%)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[400px]"
      >
        <div className="hud scanline overflow-hidden rounded-xl">
          <span className="corner-tl" />
          <span className="corner-br" />

          <div className="hud-grid relative px-7 pb-7 pt-8">
            {/* Marca */}
            <div className="mb-7 flex flex-col items-center gap-3 text-center">
              <BrandMark size={62} />
              <div>
                <p className="font-display text-[22px] font-bold tracking-[0.22em] text-slate-50">
                  SIGNUM
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-neon/70">
                  secure doc console
                </p>
              </div>
            </div>

            <p className="mb-4 flex items-center gap-2 font-mono text-[9.5px] font-bold uppercase tracking-[0.2em] text-slate-500">
              <Lock className="h-3 w-3 text-neon" />
              acceso restringido
            </p>

            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Usuario o correo institucional"
                  autoComplete="username"
                  autoFocus
                  className={field}
                />
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete="current-password"
                  className={cn(field, "pr-10")}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-neon"
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] font-medium text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !login || !password}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-neon py-3 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_26px_-6px_rgba(34,211,238,0.9)] disabled:opacity-40 disabled:shadow-none"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {loading ? "Verificando…" : "Ingresar"}
              </button>
            </form>

            {/* Accesos de demostración */}
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                accesos de demostración
              </p>
              <div className="space-y-1.5">
                {DEMO.map((d) => (
                  <button
                    key={d.login}
                    type="button"
                    onClick={() => {
                      setLogin(d.login);
                      setPassword(d.pass);
                      setError(null);
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-line bg-panel/50 px-3 py-2 text-left transition hover:border-neon/40"
                  >
                    <Fingerprint className={cn("h-3.5 w-3.5 shrink-0", d.tone)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11.5px] font-semibold text-slate-200">
                        {d.label}
                      </span>
                      <span className="block truncate font-mono text-[9.5px] text-slate-500">
                        {d.login} · {d.pass}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[8.5px] font-bold text-slate-600">
                      USAR
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-around border-t border-line bg-panel/40 py-2.5">
            {[
              { icon: Lock, label: "TLS" },
              { icon: ShieldCheck, label: "SHA-256" },
              { icon: Activity, label: "AUDIT" },
            ].map((s) => (
              <span
                key={s.label}
                className="flex items-center gap-1.5 font-mono text-[8.5px] font-bold uppercase tracking-wider text-slate-500"
              >
                <s.icon className="h-3 w-3 text-emerald-400" />
                {s.label}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-4 text-center font-mono text-[9px] leading-relaxed text-slate-600">
          TODO ACCESO QUEDA REGISTRADO EN LA PISTA DE AUDITORÍA
          <br />
          DECRETO 2364 DE 2012 · FIRMA ELECTRÓNICA
        </p>

        {/* Paquete de actualización para la instalación local (solo si existe) */}
        {updatePack && (
          <a
            href={updatePack.href}
            download="signum-actualizacion.zip"
            className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-neon/30 bg-neon/5 px-4 py-3 text-left transition hover:border-neon/60 hover:bg-neon/10"
          >
            <span>
              <span className="block font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-neon">
                Actualización para tu PC
              </span>
              <span className="mt-0.5 block text-[11.5px] text-slate-400">
                Descarga <b className="text-slate-200">signum-actualizacion.zip</b> ({updatePack.sizeKb} KB) y ejecuta APLICAR-ACTUALIZACION.cmd
              </span>
            </span>
            <span className="shrink-0 rounded-md bg-neon px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-void">
              Descargar
            </span>
          </a>
        )}
      </motion.div>
    </div>
  );
}
