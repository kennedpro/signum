import { NextResponse } from "next/server";
import { SESSION_COOKIE, getSessionUser } from "@/lib/auth";
import { logSecurity } from "@/lib/audit";

export async function POST() {
  const user = await getSessionUser();
  if (user) {
    await logSecurity([
      {
        documentId: null,
        event: "cierre_sesion",
        result: "ok",
        actorName: user.name,
        actorEmail: user.email,
        detail: "Sesión finalizada por el usuario",
      },
    ]);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
