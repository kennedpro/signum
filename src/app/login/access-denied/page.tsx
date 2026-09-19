import Link from "next/link";
import { ShieldX, ArrowLeft } from "lucide-react";
import { BrandMark } from "@/components/brand";

export const metadata = { title: "Acceso denegado" };

/** Página en español para el error de ingreso (no carga HTML en el API). */
export default function AccessDenied() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <BrandMark size={56} />
      <ShieldX className="mx-auto mt-5 h-10 w-10 text-rose-400" />
      <h1 className="mt-3 font-display text-2xl font-bold text-slate-100">
        No se pudo iniciar sesión
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
        Vuelva a la pantalla de ingreso y pruebe de nuevo. Si el problema persiste,
        contacte al administrador del entorno.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-2 rounded-md border border-line2 px-5 py-2.5 text-[12.5px] font-bold text-slate-300 transition hover:border-neon/40 hover:text-neonsoft"
      >
        <ArrowLeft className="h-4 w-4" />
        Ir al ingreso
      </Link>
    </div>
  );
}
