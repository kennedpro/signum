import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { searchPeople } from "@/lib/people-search";

export async function GET(req: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Sesión requerida." }, { status: 401 });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const people = await searchPeople(ctx.orgId, q, 12);
  return NextResponse.json({ people });
}
