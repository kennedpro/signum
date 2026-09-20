/**
 * Estado del arranque de la base de datos, compartido por proceso.
 * Lo escribe la instrumentación y lo leen el layout de la consola y /api/health
 * para mostrar un diagnóstico legible en vez de un 500 mudo.
 */
export type BootstrapStatus = "starting" | "retrying" | "ready" | "failed";

export type BootstrapState = {
  status: BootstrapStatus;
  attempt: number;
  database?: string;
  error?: string;
  hints?: string[];
  updatedAt: string;
};

const g = globalThis as typeof globalThis & { __signumBootstrapState?: BootstrapState };

export function setBootstrapState(next: Omit<BootstrapState, "updatedAt">) {
  g.__signumBootstrapState = { ...next, updatedAt: new Date().toISOString() };
}

export function getBootstrapState(): BootstrapState {
  return (
    g.__signumBootstrapState ?? {
      status: "starting",
      attempt: 0,
      updatedAt: new Date().toISOString(),
    }
  );
}
