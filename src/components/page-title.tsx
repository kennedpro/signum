"use client";

import { useEffect, useSyncExternalStore } from "react";

/* ═══════════════════════════════════════════════════════════════════
   TÍTULO CONTEXTUAL DE LA CABECERA
   Las páginas de servidor pueden publicar un título (p. ej. el tipo
   documental "Informe") que el AppShell muestra en lugar del genérico.
   Almacén mínimo en memoria del cliente, sin dependencias.
   ═══════════════════════════════════════════════════════════════════ */

export type PageTitle = { title: string; sub?: string; code?: string } | null;

let current: PageTitle = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function usePageTitle(): PageTitle {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Publica el título mientras el componente esté montado; lo limpia al salir. */
export function SetPageTitle({ title, sub, code }: { title: string; sub?: string; code?: string }) {
  useEffect(() => {
    current = { title, sub, code };
    emit();
    return () => {
      current = null;
      emit();
    };
  }, [title, sub, code]);
  return null;
}
