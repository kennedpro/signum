export type DocMetaProps = {
  docType: string;
  code: string; // radicado o "Borrador 00000004"
  city: string | null;
  subject: string | null;
  sender: { name: string; cargo: string | null; dependencia?: string | null } | null;
  destinatario: {
    name: string;
    cargo: string | null;
    dependencia: string | null;
    external?: boolean;
    companyName?: string | null;
  } | null;
  createdAt?: string | Date | null;
};

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function longDate(d: string | Date | null | undefined) {
  if (!d) return "[fecha]";
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getDate()} de ${MONTHS[dt.getMonth()]} de ${dt.getFullYear()}`;
}

/**
 * Cabecera tipo oficio institucional (como el gestor documental de referencia):
 * código/radicado, ciudad y fecha, destinatario con cargo y dependencia, asunto.
 * Se renderiza igual en editor, expediente y portal de firma.
 */
export function DocMetaBlock({ meta }: { meta: DocMetaProps }) {
  const { docType, code, city, subject, destinatario, sender, createdAt } = meta;

  return (
    <div className="doc-meta" contentEditable={false}>
      <p className="doc-meta__code">{code}</p>
      {docType !== "acta" && (
        <p className="doc-meta__line">
          {city ?? "Bogotá D.C."}, {longDate(createdAt ?? new Date())}
        </p>
      )}
      <p className="doc-meta__line" />
      {destinatario && (docType === "oficio" || docType === "memorando" || docType === "certificacion") && (
        <>
          <p className="doc-meta__line">
            {docType === "certificacion" ? "Se certifica a" : "Señor(a)"}
          </p>
          <p className="doc-meta__strong">{destinatario.name}</p>
          {destinatario.cargo && <p className="doc-meta__line">{destinatario.cargo}</p>}
          {destinatario.dependencia && (
            <p className="doc-meta__line">{destinatario.dependencia}</p>
          )}
          {destinatario.external && destinatario.companyName && (
            <p className="doc-meta__line">{destinatario.companyName}</p>
          )}
          <p className="doc-meta__line">{city ?? "Bogotá D.C."}</p>
        </>
      )}
      {docType === "informe" && sender && (
        <>
          <p className="doc-meta__line">Elaborado por</p>
          <p className="doc-meta__strong">{sender.name}</p>
          {sender.cargo && <p className="doc-meta__line">{sender.cargo}</p>}
          {sender.dependencia && <p className="doc-meta__line">{sender.dependencia}</p>}
          {destinatario && (
            <>
              <p className="doc-meta__line">Dirigido a</p>
              <p className="doc-meta__strong">{destinatario.name}</p>
              {destinatario.cargo && <p className="doc-meta__line">{destinatario.cargo}</p>}
            </>
          )}
        </>
      )}
      {docType === "acta" && destinatario && (
        <>
          <p className="doc-meta__line">Presidida por</p>
          <p className="doc-meta__strong">{destinatario.name}</p>
        </>
      )}
      {subject && (
        <p className="doc-meta__line doc-meta__subject">
          Asunto: {subject}
        </p>
      )}
      <p className="doc-meta__line" />
    </div>
  );
}
