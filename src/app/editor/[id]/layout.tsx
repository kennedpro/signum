import type { ReactNode } from "react";

/** Lienzo claro y a pantalla completa para el editor de escritorio. */
export default function EditorLayout({ children }: { children: ReactNode }) {
  return <div className="editor-shell min-h-screen">{children}</div>;
}
