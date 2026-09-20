import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export type PersonHit = {
  id: string;
  name: string;
  email: string;
  cargo: string | null;
  department: string;
  color: string;
  photoUrl: string | null;
  grado: string | null;
  cedula: string | null;
  initials: string;
};

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function scorePerson(
  name: string,
  email: string,
  query: string,
  extra: { cargo?: string | null; cedula?: string | null; username?: string | null }
): number {
  const needle = fold(query.trim());
  if (!needle) return 1;
  const n = fold(name);
  const parts = n.split(/\s+/).filter(Boolean);
  const initials = fold(initialsOf(name));
  const compact = needle.replace(/\s+/g, "");
  let score = 0;
  if (n === needle) score += 120;
  if (n.startsWith(needle)) score += 80;
  if (n.includes(needle)) score += 40;
  // Iniciales: CDP → Camila Duarte Peña · CEGR → Carlos Ernesto Gomez Rodriguez
  if (compact.length >= 2 && (initials === compact || initials.startsWith(compact))) score += 95;
  // "ca du" → cada fragmento inicia una palabra del nombre
  const qParts = needle.split(/\s+/).filter(Boolean);
  if (qParts.length > 0 && qParts.every((p) => parts.some((w) => w.startsWith(p)))) score += 70;
  if (fold(email).includes(needle)) score += 25;
  if (extra.username && fold(extra.username).includes(needle)) score += 25;
  if (extra.cedula && extra.cedula.includes(needle)) score += 60;
  if (extra.cargo && fold(extra.cargo).includes(needle)) score += 15;
  return score;
}

/** Busca funcionarios de la entidad activa por nombre, apellidos o iniciales. */
export async function searchPeople(orgId: string | null, q: string, limit = 12) {
  if (!orgId) return [];
  const query = q.trim();
  /**
   * Se traen los funcionarios activos de la entidad y se puntúa en memoria:
   * así las INICIALES (CDP, CEGR) y "nombre apellido" parcial funcionan,
   * cosa que un ILIKE sobre el nombre completo no puede resolver.
   */
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, orgId), eq(users.active, "si")))
    .limit(500);

  return rows
    .map((u) => ({
      u,
      score: scorePerson(u.name, u.email, query, {
        cargo: u.cargo,
        cedula: u.cedula,
        username: u.username,
      }),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ u }) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      cargo: u.cargo ?? u.role,
      department: u.department,
      color: u.color,
      photoUrl: u.photoUrl,
      grado: u.grado,
      cedula: u.cedula,
      initials: initialsOf(u.name),
    }));
}
