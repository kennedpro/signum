"use client";

/* ═══════════════════════════════════════════════════════════════════
   CAPA AMBIENTAL CINEMATOGRÁFICA
   Nebulosas, campo de estrellas, barrido de luz HUD, grano de película
   y viñeta. Puramente decorativa (pointer-events: none, position:
   fixed, sin z-index positivo) — se pinta detrás de todo el contenido
   real y no interfiere con ninguna interacción ni layout existente.
   ═══════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

type Star = { left: number; top: number; size: number; delay: number; duration: number };

/** Generador pseudoaleatorio determinista: mismas estrellas en cada carga,
 * sin desajuste de hidratación entre servidor y cliente. */
function makeStars(count: number, seed: number): Star[] {
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: count }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: 1 + rand() * 1.6,
    delay: rand() * 6,
    duration: 3.2 + rand() * 4.2,
  }));
}

const STARS = makeStars(64, 42);

export function CinematicBackdrop() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Nebulosas — masas de luz que respiran lentamente */}
      <div className="cine-nebula cine-nebula--a" />
      <div className="cine-nebula cine-nebula--b" />

      {/* Campo de estrellas */}
      {mounted && (
        <div className="absolute inset-0">
          {STARS.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-slate-100"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                animation: `cine-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* Barrido de luz tipo HUD cinematográfico */}
      <div className="cine-beam" />

      {/* Grano de película sutil */}
      <div className="film-grain" />

      {/* Viñeta de encuadre */}
      <div className="cine-vignette" />
    </div>
  );
}
