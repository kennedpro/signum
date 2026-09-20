"use client";

import { useState } from "react";
import { KeyRound, Loader2, Copy, Check, X, Wand2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-md border border-line2 bg-panel2/60 px-3 py-2 text-[12.5px] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-neon/50";

/**
 * Entorno DEDICADO de restablecimiento de contraseña — deliberadamente
 * separado del formulario de edición de ficha: un administrador solo
 * necesita esto para recuperar el acceso de alguien, sin tocar el resto
 * de sus datos. Puede generar una clave temporal segura o escribir una,
 * y decide si se exige cambiarla en el próximo ingreso.
 */
export function ResetPasswordPanel({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"generate" | "set">("generate");
  const [newPassword, setNewPassword] = useState("");
  const [forceChange, setForceChange] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/usuarios/${userId}/clave`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, newPassword, forceChange }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo restablecer la contraseña.");
      setResult(data.password as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (result) {
    return (
      <div className="rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] p-4">
        <p className="flex items-center gap-2 text-[12.5px] font-bold text-emerald-300">
          <KeyRound className="h-4 w-4" /> Contraseña restablecida para {userName}
        </p>
        <p className="mt-1.5 text-[11.5px] text-slate-400">
          Compártala fuera de banda (no quedará visible de nuevo). {forceChange && "Deberá definir una propia en su próximo ingreso."}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <code className="flex-1 truncate rounded border border-line2 bg-panel/80 px-3 py-2 font-mono text-[13px] text-neonsoft">
            {result}
          </code>
          <button
            onClick={copy}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line2 text-slate-400 hover:border-neon/40 hover:text-neon"
            aria-label="Copiar"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-3 rounded-md border border-line2 px-3 py-1.5 text-[11.5px] font-semibold text-slate-400 hover:text-slate-200"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-amber-400/30 bg-amber-400/[0.05] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[12.5px] font-bold text-amber-300">
          <KeyRound className="h-4 w-4" /> Restablecer contraseña de {userName}
        </p>
        <button onClick={onClose} className="text-slate-500 hover:text-rose-400" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("generate")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[11.5px] font-semibold",
            mode === "generate"
              ? "border-neon/45 bg-neon/12 text-neonsoft"
              : "border-line2 text-slate-400"
          )}
        >
          <Wand2 className="h-3.5 w-3.5" /> Generar automática
        </button>
        <button
          type="button"
          onClick={() => setMode("set")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[11.5px] font-semibold",
            mode === "set" ? "border-neon/45 bg-neon/12 text-neonsoft" : "border-line2 text-slate-400"
          )}
        >
          <Pencil className="h-3.5 w-3.5" /> Escribir una nueva
        </button>
      </div>

      {mode === "set" && (
        <input
          type="text"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Nueva contraseña (mínimo 6 caracteres)"
          className={cn(fieldClass, "mt-2.5")}
        />
      )}

      <label className="mt-3 flex items-center gap-2 text-[11.5px] text-slate-400">
        <input
          type="checkbox"
          checked={forceChange}
          onChange={(e) => setForceChange(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-line2 accent-cyan-400"
        />
        Debe definir una contraseña propia en su próximo ingreso
      </label>

      {error && (
        <p className="mt-2.5 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-300">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={loading || (mode === "set" && newPassword.trim().length < 6)}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-400 px-4 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-40"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Confirmar restablecimiento
      </button>
    </div>
  );
}
