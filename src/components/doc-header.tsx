import { StampLogo } from "@/components/signature-stamp";

export type OrgHeader = {
  name: string;
  entityType: string;
  nit?: string | null;
  sigla?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  logoVariant?: string | null;
  primaryColor?: string | null;
};

/**
 * CABECERA DE PRIMERA PÁGINA
 * Logo de la empresa + datos institucionales. Se renderiza fuera del
 * contenido editable para que no pueda alterarse desde el editor.
 */
export function DocHeader({
  org,
  docNumber,
  draftCode,
  docTypeShort,
  city,
}: {
  org: OrgHeader;
  docNumber?: string | null;
  draftCode?: string | null;
  docTypeShort?: string;
  city?: string | null;
}) {
  const color = org.primaryColor ?? "#0e7490";
  return (
    <header className="doc-header" style={{ borderColor: color }}>
      <div className="doc-header__logo">
        <StampLogo variant={org.logoVariant} logoUrl={org.logoUrl} color={color} />
      </div>

      <div className="doc-header__body">
        <p className="doc-header__name">{org.name}</p>
        <p className="doc-header__meta">
          {[
            org.sigla ? `Sigla: ${org.sigla}` : null,
            org.nit ? `NIT ${org.nit}` : null,
            org.entityType === "privada" ? "Entidad privada" : "Entidad pública",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="doc-header__meta">
          {[org.address, city ?? org.city, org.phone, org.website].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div className="doc-header__code">
        {docTypeShort && <span className="doc-header__chip">{docTypeShort}</span>}
        {docNumber ? (
          <span className="doc-header__num">Radicado No. {docNumber}</span>
        ) : draftCode ? (
          <span className="doc-header__num doc-header__num--draft">Borrador {draftCode}</span>
        ) : null}
      </div>

      <span className="doc-header__bar" style={{ background: color }} />
    </header>
  );
}
