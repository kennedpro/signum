/* ═══════════════════════════════════════════════════════════════════
   IDENTIDAD VISUAL — marca futurista SIGNUM
   Hexágono orbital con trazas de circuito y glifo de rúbrica.
   ═══════════════════════════════════════════════════════════════════ */

export function BrandMark({
  size = 40,
  animated = true,
}: {
  size?: number;
  animated?: boolean;
}) {
  const id = "bm";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="8" y1="4" x2="56" y2="60">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="52%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`${id}-f`} x1="12" y1="10" x2="52" y2="54">
          <stop offset="0%" stopColor="#0e2b3a" />
          <stop offset="100%" stopColor="#141033" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo */}
      <circle cx="32" cy="32" r="30" fill={`url(#${id}-glow)`} />

      {/* Hexágono base */}
      <path
        d="M32 3.5 L55.5 17.2 V44.8 L32 58.5 L8.5 44.8 V17.2 Z"
        fill={`url(#${id}-f)`}
        stroke={`url(#${id}-g)`}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Hexágono interior punteado */}
      <path
        d="M32 10 L49.5 20.4 V41.6 L32 52 L14.5 41.6 V20.4 Z"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="0.7"
        strokeDasharray="1.4 3.2"
        opacity="0.65"
      />

      {/* Trazas de circuito */}
      <g stroke="#67e8f9" strokeWidth="1.1" strokeLinecap="round" opacity="0.55">
        <path d="M8.5 26 h6.5 l3-3" />
        <path d="M55.5 38 h-6.5 l-3 3" />
        <path d="M32 58.5 v-5" />
      </g>
      <circle cx="15" cy="26" r="1.5" fill="#67e8f9" />
      <circle cx="49" cy="38" r="1.5" fill="#a78bfa" />

      {/* Glifo de rúbrica: S estilizada */}
      <path
        d="M40 21.5c-3.4-2.6-8.6-3-11.7-.7-3.4 2.5-2.6 6.6 1.4 8.2 2.2.9 4.7 1.1 6.9 2 4 1.6 4.8 5.7 1.4 8.2-3.1 2.3-8.3 1.9-11.7-.7"
        stroke={`url(#${id}-g)`}
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Subrayado de firma */}
      <path
        d="M22 44.5 q10 3.4 20 0"
        stroke="#a78bfa"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {animated && (
        <circle r="1.7" fill="#67e8f9">
          <animateMotion
            dur="4.5s"
            repeatCount="indefinite"
            path="M32 10 L49.5 20.4 V41.6 L32 52 L14.5 41.6 V20.4 Z"
          />
        </circle>
      )}
    </svg>
  );
}

export function BrandWord({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-display text-[17px] font-bold leading-none tracking-[0.2em] text-slate-100">
        SIGNUM
      </p>
      {!compact && (
        <p className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.24em] text-neon/70">
          secure doc console
        </p>
      )}
    </div>
  );
}
