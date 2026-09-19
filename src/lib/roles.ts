export const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  jefe_gestion: "Jefe de Gestión Documental",
  usuario: "Usuario",
};

export function canViewSecurity(role?: string | null) {
  return role === "admin" || role === "jefe_gestion";
}

export function canManageUsers(role?: string | null) {
  return role === "admin" || role === "jefe_gestion";
}
