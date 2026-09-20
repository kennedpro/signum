import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata: Metadata = { title: "Cambiar contraseña" };
export const dynamic = "force-dynamic";

export default async function CambiarClavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const mandatory = user.mustChangePassword;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="relative w-full max-w-[400px]">
        <div className="hud scanline overflow-hidden rounded-xl">
          <span className="corner-tl" />
          <span className="corner-br" />
          <div className="hud-grid relative px-7 pb-7 pt-8">
            <div className="mb-6 flex flex-col items-center gap-3 text-center">
              <BrandMark size={56} />
              <div>
                <p className="font-display text-[19px] font-bold tracking-[0.18em] text-slate-50">
                  {mandatory ? "Defina su contraseña" : "Cambiar contraseña"}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-neon/70">
                  {user.name}
                </p>
              </div>
            </div>

            <ChangePasswordForm mandatory={mandatory} />

            {!mandatory && (
              <Link
                href="/"
                className="mt-5 flex items-center justify-center gap-2 text-[11.5px] font-semibold text-slate-500 hover:text-neonsoft"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver a la consola
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
