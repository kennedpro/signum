"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, KeyRound, Loader2, ShieldCheck, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-line2 bg-panel2/60 py-2.5 pl-10 pr-10 text-[13px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

/**
 * Formulario de auto-servicio para cambiar la contraseña PROPIA. Se usa
 * tanto de forma voluntaria (perfil) como de forma obligatoria (cuenta
 * nueva o con clave restablecida por un administrador → mustChangePassword).
 */
export function ChangePasswordForm({ mandatory }: { mandatory: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 6) return setError("La nueva contraseña debe tener al menos 6 caracteres.");
    if (next !== confirm) return setError("La confirmación no coincide con la nueva contraseña.");
    setLoading(true);
    try {
      const res = await fetch("/api/mi-cuenta/clave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar la contraseña.");
      setDone(true);
      setTimeout(() => {
        router.replace("/");
        router.refresh();
      }, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full border border-emerald-400/40 bg-emerald-400/10">
          <ShieldCheck className="h-6 w-6 text-emerald-400" />
        </span>
        <p className="text-[13.5px] font-bold text-slate-100">Contraseña actualizada</p>
        <p className="text-[12px] text-slate-500">Redirigiendo a la consola…</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {mandatory && (
        <p className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-[12px] leading-relaxed text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Su contraseña es temporal. Debe definir una propia antes de continuar.
        </p>
      )}

      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type={show ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Contraseña actual"
          autoComplete="current-password"
          autoFocus
          className={field}
        />
      </div>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type={show ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Nueva contraseña (mínimo 6 caracteres)"
          autoComplete="new-password"
          className={field}
        />
      </div>
      <div className="relative">
        <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirme la nueva contraseña"
          autoComplete="new-password"
          className={field}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 transition hover:text-neon"
          aria-label={show ? "Ocultar" : "Mostrar"}
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
        disabled={loading || !current || next.length < 6 || !confirm}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-md bg-neon py-3 text-[12.5px] font-bold uppercase tracking-wide text-void transition hover:shadow-[0_0_26px_-6px_rgba(34,211,238,0.9)]",
          "disabled:opacity-40 disabled:shadow-none"
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {loading ? "Guardando…" : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}
