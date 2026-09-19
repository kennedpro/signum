import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { statSync } from "node:fs";
import { join } from "node:path";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };
export const dynamic = "force-dynamic";

/** Paquete de actualización publicado por el entorno de desarrollo (si existe). */
function updatePackInfo() {
  try {
    const file = join(process.cwd(), "public", "descargas", "signum-actualizacion.zip");
    const st = statSync(file);
    return { href: "/descargas/signum-actualizacion.zip", sizeKb: Math.max(1, Math.round(st.size / 1024)) };
  } catch {
    return null;
  }
}

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/");
  return <LoginForm updatePack={updatePackInfo()} />;
}
