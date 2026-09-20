import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck, Lock, Timer } from "lucide-react";
import { ConsoleFrame, hasConsoleSession } from "@/components/console-frame";
import { BrandMark } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Portal de firma. Con sesión iniciada se muestra DENTRO de la consola
 * (misma barra lateral, cabecera y bandeja que usó el autor); sin sesión,
 * marco público minimalista para firmantes externos.
 */
export default async function FirmarLayout({ children }: { children: ReactNode }) {
  if (await hasConsoleSession()) {
    return (
      <ConsoleFrame>
        <div className="mx-auto max-w-6xl">{children}</div>
      </ConsoleFrame>
    );
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-deep/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={38} />
            <div>
              <p className="font-display text-[15px] font-bold tracking-[0.14em] text-slate-100">
                SIGNUM
              </p>
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neon/70">
                portal de firma segura
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-3 font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500 sm:flex">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-emerald-400" /> TLS
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-emerald-400" /> SHA-256
            </span>
            <span className="flex items-center gap-1.5">
              <Timer className="h-3 w-3 text-emerald-400" /> TIMESTAMP
            </span>
          </div>
        </div>
        <div className="neon-line h-px w-full opacity-60" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-line py-5 text-center">
        <p className="font-mono text-[10px] text-slate-600">
          Documento alojado en el entorno corporativo SIGNUM ·{" "}
          <Link href="/" className="text-neon hover:underline">
            ACCEDER A LA CONSOLA
          </Link>
        </p>
      </footer>
    </div>
  );
}
