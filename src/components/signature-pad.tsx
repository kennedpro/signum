"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { PenLine, Type, Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignatureResult = { dataUrl: string; method: "dibujada" | "escrita" };

export type SignaturePadHandle = {
  getSignature: () => Promise<SignatureResult | null>;
  reset: () => void;
};

const PAD_H = 170;

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { onInkChange?: (has: boolean) => void; defaultName?: string }
>(function SignaturePad({ onInkChange, defaultName = "" }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<{ x: number; y: number }[][]>([]);
  const drawingRef = useRef(false);
  const [tab, setTab] = useState<"dibujar" | "escribir">("dibujar");
  const [typed, setTyped] = useState(defaultName);
  const [inked, setInked] = useState(false);

  useEffect(() => setTyped(defaultName), [defaultName]);
  useEffect(() => {
    onInkChange?.(tab === "escribir" ? typed.trim().length > 1 : inked);
  }, [inked, typed, tab, onInkChange]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.6 * dpr;
    for (const stroke of strokesRef.current) {
      if (stroke.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x * dpr, stroke[0].y * dpr);
      for (let i = 1; i < stroke.length - 1; i++) {
        const mx = (stroke[i].x + stroke[i + 1].x) / 2;
        const my = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x * dpr, stroke[i].y * dpr, mx * dpr, my * dpr);
      }
      const last = stroke[stroke.length - 1];
      ctx.lineTo(last.x * dpr, last.y * dpr);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = wrap.clientWidth;
      canvas.width = w * dpr;
      canvas.height = PAD_H * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${PAD_H}px`;
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (ev: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  const start = (ev: React.PointerEvent) => {
    ev.preventDefault();
    drawingRef.current = true;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    strokesRef.current.push([point(ev)]);
    setInked(true);
  };
  const move = (ev: React.PointerEvent) => {
    if (!drawingRef.current) return;
    strokesRef.current[strokesRef.current.length - 1].push(point(ev));
    redraw();
  };
  const end = () => {
    drawingRef.current = false;
  };

  useImperativeHandle(ref, () => ({
    reset: () => {
      strokesRef.current = [];
      redraw();
      setInked(false);
      setTyped("");
    },
    getSignature: async () => {
      if (tab === "escribir") {
        const name = typed.trim();
        if (name.length < 2) return null;
        const c = document.createElement("canvas");
        c.width = 900;
        c.height = 250;
        const ctx = c.getContext("2d")!;
        try {
          await document.fonts.load('110px "Caveat"');
        } catch {
          /* fallback */
        }
        ctx.fillStyle = "#111827";
        ctx.font = '110px "Caveat", cursive';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, c.width / 2, c.height / 2 + 8);
        return { dataUrl: c.toDataURL("image/png"), method: "escrita" };
      }
      if (!inked || strokesRef.current.length === 0) return null;
      return { dataUrl: canvasRef.current!.toDataURL("image/png"), method: "dibujada" };
    },
  }));

  return (
    <div>
      <div className="mb-2 flex items-center gap-1 rounded-md border border-line bg-panel2/60 p-1">
        {(
          [
            { key: "dibujar", label: "Dibujar", icon: PenLine },
            { key: "escribir", label: "Escribir", icon: Type },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[11.5px] font-bold uppercase tracking-wide transition",
              tab === t.key
                ? "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dibujar" ? (
        <div ref={wrapRef} className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            className="sig-canvas w-full rounded-md border border-line2"
          />
          {!inked && (
            <span className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400">
              Trace su rúbrica aquí
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              strokesRef.current = [];
              redraw();
              setInked(false);
            }}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-stone-300 bg-white/90 px-2 py-1 font-mono text-[10px] font-bold text-stone-500 transition hover:text-rose-600"
          >
            <Eraser className="h-3 w-3" />
            LIMPIAR
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Escriba su nombre completo"
            maxLength={60}
            className="w-full rounded-md border border-line2 bg-panel2/60 px-3.5 py-2.5 text-[13px] text-slate-100 outline-none transition focus:border-neon/50"
          />
          <div className="sig-canvas grid h-[92px] place-items-center overflow-hidden rounded-md border border-line2">
            {typed.trim() ? (
              <span
                className="select-none text-stone-900"
                style={{ fontFamily: "var(--ff-hand), cursive", fontSize: 50, lineHeight: 1 }}
              >
                {typed}
              </span>
            ) : (
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-stone-400">
                Vista previa
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
