"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_CM } from "@/lib/page-setup";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════
   REGLA HORIZONTAL FUNCIONAL (modelo Word)

   · Zonas grises = márgenes izquierdo/derecho. Se ARRASTRAN desde el
     límite entre gris y blanco → cambian los márgenes de la página.
   · Triángulo superior  = sangría de primera línea del párrafo actual.
   · Triángulo inferior  = sangría izquierda del párrafo actual.
   · Triángulo derecho   = sangría derecha del párrafo actual.
   · Doble clic en la regla abre "Configurar página".
   Todo en centímetros; la escala respeta el zoom del lienzo.
   ═══════════════════════════════════════════════════════════════════ */

export type RulerIndents = { first: number; left: number; right: number };

type Drag =
  | { kind: "marginLeft" | "marginRight" | "first" | "left" | "hanging" | "right"; startX: number; start: number; startLeft?: number }
  | null;

const PX_PER_CM = 37.7952755906;
const round = (v: number, step = 0.25) => Math.round(v / step) * step;

export function Ruler({
  zoom,
  marginLeft,
  marginRight,
  indents,
  disabled,
  onMargins,
  onIndents,
  onOpenSetup,
  rulerRef,
}: {
  zoom: number;
  marginLeft: number;
  marginRight: number;
  indents: RulerIndents;
  disabled?: boolean;
  onMargins: (m: { left: number; right: number }) => void;
  onIndents: (i: RulerIndents) => void;
  onOpenSetup?: () => void;
  rulerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const scale = (PX_PER_CM * zoom) / 100;
  const widthPx = PAGE_CM.width * scale;
  const [drag, setDrag] = useState<Drag>(null);
  const [live, setLive] = useState<{ ml: number; mr: number; i: RulerIndents }>({ ml: marginLeft, mr: marginRight, i: indents });
  const localRef = useRef<HTMLDivElement>(null);
  const ref = rulerRef ?? localRef;

  useEffect(() => {
    if (!drag) setLive({ ml: marginLeft, mr: marginRight, i: indents });
  }, [marginLeft, marginRight, indents, drag]);

  const cmFromEvent = useCallback(
    (clientX: number) => {
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return 0;
      return (clientX - rect.left) / scale;
    },
    [ref, scale]
  );

  const begin = (kind: NonNullable<Drag>["kind"]) => (ev: React.PointerEvent) => {
    if (disabled) return;
    ev.preventDefault();
    ev.stopPropagation();
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    const startX = cmFromEvent(ev.clientX);
    const start =
      kind === "marginLeft" ? live.ml
      : kind === "marginRight" ? live.mr
      : kind === "first" ? live.i.first
      : kind === "right" ? live.i.right
      : live.i.left;
    setDrag({ kind, startX, start, startLeft: live.i.left });
  };

  const move = (ev: React.PointerEvent) => {
    if (!drag) return;
    const dx = cmFromEvent(ev.clientX) - drag.startX;
    const usable = PAGE_CM.width - live.ml - live.mr;
    setLive((cur) => {
      const n = { ...cur, i: { ...cur.i } };
      switch (drag.kind) {
        case "marginLeft":
          n.ml = round(Math.min(Math.max(drag.start + dx, 0.5), PAGE_CM.width - cur.mr - 6));
          break;
        case "marginRight":
          n.mr = round(Math.min(Math.max(drag.start - dx, 0.5), PAGE_CM.width - cur.ml - 6));
          break;
        case "first":
          n.i.first = round(Math.min(Math.max(drag.start + dx, -cur.i.left), usable - cur.i.left - cur.i.right - 1));
          break;
        case "left": // mueve la sangría izquierda conservando la de primera línea (relativa)
          n.i.left = round(Math.min(Math.max(drag.start + dx, 0), usable - cur.i.right - 1));
          break;
        case "hanging": // mueve izquierda y primera línea juntas (cuadradito de Word)
          n.i.left = round(Math.min(Math.max(drag.start + dx, 0), usable - cur.i.right - 1));
          break;
        case "right":
          n.i.right = round(Math.min(Math.max(drag.start - dx, 0), usable - cur.i.left - 1));
          break;
      }
      return n;
    });
  };

  const end = () => {
    if (!drag) return;
    if (drag.kind === "marginLeft" || drag.kind === "marginRight") onMargins({ left: live.ml, right: live.mr });
    else onIndents(live.i);
    setDrag(null);
  };

  const ticks: React.ReactNode[] = [];
  for (let i = 0; i <= Math.floor(PAGE_CM.width * 2); i++) {
    const cmv = i / 2;
    const major = i % 2 === 0;
    ticks.push(
      <span key={i} className={cn("wd-ruler__tick", major && "is-major")} style={{ left: cmv * scale }}>
        {major && cmv > 0 && cmv < PAGE_CM.width - 0.4 ? <em>{cmv}</em> : null}
      </span>
    );
  }

  const leftPx = live.ml * scale;
  const rightPx = (PAGE_CM.width - live.mr) * scale;
  const firstPx = (live.ml + live.i.left + live.i.first) * scale;
  const hangPx = (live.ml + live.i.left) * scale;
  const rIndentPx = (PAGE_CM.width - live.mr - live.i.right) * scale;
  const fmt = (v: number) => `${v.toFixed(2).replace(".", ",")} cm`;

  return (
    <div
      ref={ref}
      className={cn("wd-ruler", disabled && "is-disabled", drag && "is-dragging")}
      style={{ width: widthPx }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onOpenSetup?.()}
      title={disabled ? "Regla (solo lectura)" : "Arrastra los márgenes o las sangrías · Doble clic: configurar página"}
    >
      <div className="wd-ruler__margin" style={{ left: 0, width: leftPx }} />
      <div className="wd-ruler__margin" style={{ left: rightPx, right: 0 }} />
      {ticks}

      {/* Tiradores de MÁRGENES (borde gris/blanco) */}
      <span className="wd-ruler__grip" style={{ left: leftPx }} onPointerDown={begin("marginLeft")} title={`Margen izquierdo: ${fmt(live.ml)}`} />
      <span className="wd-ruler__grip" style={{ left: rightPx }} onPointerDown={begin("marginRight")} title={`Margen derecho: ${fmt(live.mr)}`} />

      {/* Sangrías del párrafo */}
      <span className="wd-ruler__first" style={{ left: firstPx }} onPointerDown={begin("first")} title={`Sangría de primera línea: ${fmt(live.i.first)}`} />
      <span className="wd-ruler__hang" style={{ left: hangPx }} onPointerDown={begin("left")} title={`Sangría izquierda: ${fmt(live.i.left)}`} />
      <span className="wd-ruler__box" style={{ left: hangPx }} onPointerDown={begin("hanging")} title="Mover ambas sangrías" />
      <span className="wd-ruler__right" style={{ left: rIndentPx }} onPointerDown={begin("right")} title={`Sangría derecha: ${fmt(live.i.right)}`} />

      {drag && (
        <span className="wd-ruler__tip" style={{ left: Math.min(Math.max(
          drag.kind === "marginLeft" ? leftPx : drag.kind === "marginRight" ? rightPx : drag.kind === "first" ? firstPx : drag.kind === "right" ? rIndentPx : hangPx, 40), widthPx - 40) }}>
          {drag.kind === "marginLeft" ? `Margen izq. ${fmt(live.ml)}`
            : drag.kind === "marginRight" ? `Margen der. ${fmt(live.mr)}`
            : drag.kind === "first" ? `1.ª línea ${fmt(live.i.first)}`
            : drag.kind === "right" ? `Sangría der. ${fmt(live.i.right)}`
            : `Sangría izq. ${fmt(live.i.left)}`}
        </span>
      )}
    </div>
  );
}
