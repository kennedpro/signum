import { formatStampDate } from "@/lib/utils";
import { buildStampLines, GHOST_BOX, type EntityType } from "@/lib/entity";

export type StampData = {
  entityType?: string | null;
  signerName: string;
  signerEmail: string;
  signerGrado?: string | null;
  signerCargo?: string | null;
  signerCedula?: string | null;
  signerDependencia?: string | null;
  signerUnidad?: string | null;
  signerEmpresa?: string | null;
  signerNit?: string | null;
  signerArea?: string | null;
  signerSucursal?: string | null;
  logoVariant?: string | null;
  logoUrl?: string | null;
  signatureData?: string | null;
  hashPost?: string | null;
  hash?: string | null;
  createdAt: string | Date;
};

/* ── Sello holográfico: núcleo compartido ───────────────────────── */
function SealCore({
  accent,
  deep,
  band,
  glyph,
  tag,
}: {
  accent: string;
  deep: string;
  band: string;
  glyph: "shield" | "node";
  tag: string;
}) {
  const uid = glyph;
  return (
    <svg viewBox="0 0 108 128" className="sig-logo" aria-hidden="true">
      <defs>
        <linearGradient id={`sl-${uid}`} x1="12" y1="6" x2="96" y2="96">
          <stop offset="0%" stopColor={accent} />
          <stop offset="100%" stopColor={deep} />
        </linearGradient>
      </defs>

      {/* Anillo orbital exterior */}
      <circle cx="54" cy="52" r="47" fill="none" stroke={accent} strokeWidth="0.6" opacity="0.45" />
      <circle
        cx="54"
        cy="52"
        r="43.5"
        fill="none"
        stroke={accent}
        strokeWidth="2.6"
        strokeDasharray="1.2 5"
        opacity="0.85"
      />
      {/* Marcas cardinales */}
      <g stroke={deep} strokeWidth="2" strokeLinecap="round">
        <path d="M54 5 v6" />
        <path d="M54 93 v6" />
        <path d="M7 52 h6" />
        <path d="M95 52 h6" />
      </g>

      {/* Hexágono principal */}
      <path
        d="M54 13 L86 31.5 V68.5 L54 87 L22 68.5 V31.5 Z"
        fill="#ffffff"
        stroke={`url(#sl-${uid})`}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M54 20 L80 35 V65 L54 80 L28 65 V35 Z"
        fill="none"
        stroke={accent}
        strokeWidth="0.7"
        strokeDasharray="1.2 2.6"
        opacity="0.8"
      />

      {/* Trazas de circuito */}
      <g stroke={accent} strokeWidth="1.1" strokeLinecap="round" opacity="0.7">
        <path d="M22 44 h-7" />
        <path d="M86 60 h7" />
        <path d="M54 87 v6" />
      </g>
      <circle cx="14.5" cy="44" r="1.6" fill={accent} />
      <circle cx="93.5" cy="60" r="1.6" fill={deep} />

      {glyph === "shield" ? (
        <>
          <path
            d="M54 28 L70 34.5 V52 C70 62 63 69.5 54 73.5 C45 69.5 38 62 38 52 V34.5 Z"
            fill={deep}
          />
          <path
            d="M54 33 L66 37.8 V52 C66 59.6 60.6 65.6 54 69 C47.4 65.6 42 59.6 42 52 V37.8 Z"
            fill={accent}
            opacity="0.28"
          />
          <path
            d="M46.5 51.5 l5.5 6 11-13"
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <circle cx="54" cy="50" r="15" fill={deep} />
          <circle cx="54" cy="50" r="15" fill={accent} opacity="0.2" />
          <g stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round">
            <path d="M54 35 v8" />
            <path d="M54 57 v8" />
            <path d="M39 50 h8" />
            <path d="M61 50 h8" />
          </g>
          <circle cx="54" cy="50" r="5.5" fill="#ffffff" />
          <circle cx="54" cy="50" r="2.4" fill={deep} />
        </>
      )}

      {/* Banda de identificación */}
      <path d="M6 66 h96 v18 h-96 z" fill={band} />
      <path d="M6 66 h96 v4 h-96 z" fill="#ffffff" opacity="0.22" />
      <path d="M6 66 l6 -5 M102 84 l-6 5" stroke={band} strokeWidth="2" strokeLinecap="round" />
      <text
        x="54"
        y="79"
        textAnchor="middle"
        fontSize="9.4"
        fontWeight="700"
        letterSpacing="1.5"
        fill="#ffffff"
        fontFamily="var(--ff-sans, sans-serif)"
      >
        {tag}
      </text>

      {/* Base de datos / código */}
      <g stroke={deep} strokeWidth="2.2" strokeLinecap="round" opacity="0.5">
        <path d="M30 104 h10" />
        <path d="M44 104 h4" />
        <path d="M52 104 h14" />
        <path d="M70 104 h8" />
        <path d="M34 112 h8" />
        <path d="M46 112 h16" />
        <path d="M66 112 h8" />
      </g>
    </svg>
  );
}

const InstitutionalSeal = () => (
  <SealCore accent="#d4a017" deep="#0f766e" band="#0f766e" glyph="shield" tag="FIRMA DIGITAL" />
);

const CorporateSeal = ({ color = "#0e7490" }: { color?: string }) => (
  <SealCore accent="#22d3ee" deep={color} band={color} glyph="node" tag="FIRMA DIGITAL" />
);

export function StampLogo({
  variant,
  logoUrl,
  color,
}: {
  variant?: string | null;
  logoUrl?: string | null;
  color?: string;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt="Logo de la organización" className="sig-logo sig-logo--img" />;
  }
  return variant === "corporativo" ? <CorporateSeal color={color} /> : <InstitutionalSeal />;
}

/**
 * BLOQUE DE FIRMA INYECTADO EN EL CONTENEDOR FANTASMA (120 × 44 mm).
 */
export function SignatureStamp({
  data,
  label,
  color = "#0e7490",
}: {
  data: StampData;
  label?: string | null;
  color?: string;
}) {
  const entityType: EntityType = data.entityType === "privada" ? "privada" : "publica";
  const lines = buildStampLines(entityType, {
    name: data.signerName,
    email: data.signerEmail,
    grado: data.signerGrado,
    cargo: data.signerCargo,
    cedula: data.signerCedula,
    dependencia: data.signerDependencia,
    unidad: data.signerUnidad,
    empresa: data.signerEmpresa,
    nit: data.signerNit,
    area: data.signerArea,
    sucursal: data.signerSucursal,
  });
  const fingerprint = data.hashPost ?? data.hash;

  return (
    <div
      className="sig-ghost sig-ghost--signed"
      data-signed="true"
      style={{ width: `${GHOST_BOX.widthMm}mm`, height: `${GHOST_BOX.heightMm}mm` }}
    >
      <div className="sig-ghost__ink">
        {data.signatureData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.signatureData} alt={`Rúbrica de ${data.signerName}`} />
        ) : null}
      </div>
      <div className="sig-ghost__rule" />

      <div className="sig-stamp">
        <span className="sig-stamp__bracket sig-stamp__bracket--tl" />
        <span className="sig-stamp__bracket sig-stamp__bracket--br" />
        <StampLogo variant={data.logoVariant} logoUrl={data.logoUrl} color={color} />
        <div className="sig-stamp__meta">
          <p className="sig-stamp__title">Firmado digitalmente por:</p>
          {lines.map((l) => (
            <p key={l.label} className="sig-stamp__line">
              <span className="sig-stamp__key">{l.label}:</span> {l.value}
            </p>
          ))}
          <p className="sig-stamp__line">{formatStampDate(data.createdAt)}</p>
        </div>
      </div>

      {label ? <p className="sig-ghost__role sig-ghost__role--below">{label}</p> : null}

      {fingerprint ? (
        <p className="sig-ghost__hash">
          <span className="sig-ghost__chip">SHA-256</span>
          <span className="sig-ghost__hex">{fingerprint}</span>
        </p>
      ) : null}
    </div>
  );
}

export function SignatureSlotPlaceholder({
  label,
  index,
  final = false,
}: {
  label?: string | null;
  index: number;
  /** Vista "documento final": espacio limpio (línea + rótulo), sin rótulos técnicos. */
  final?: boolean;
}) {
  return (
    <div
      className={final ? "sig-ghost sig-ghost--empty sig-ghost--final" : "sig-ghost sig-ghost--empty"}
      data-signed="false"
      style={{ width: `${GHOST_BOX.widthMm}mm`, height: `${GHOST_BOX.heightMm}mm` }}
    >
      <span className="sig-anchor" aria-hidden="true">{`SGN::SLOT::${index}`}</span>
      {!final && (
        <span className="sig-ghost__tag">
          Contenedor reservado {GHOST_BOX.widthMm}×{GHOST_BOX.heightMm} mm · Firma {index}
        </span>
      )}
      <div className="sig-ghost__empty-rule" />
      <p className="sig-ghost__role">{label || "FIRMA AUTORIZADA"}</p>
      {!final && (
        <p className="sig-ghost__hint">
          Área protegida. El bloque de firma se inyectará aquí sin desplazar el texto inferior.
        </p>
      )}
    </div>
  );
}
