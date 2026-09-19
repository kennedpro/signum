import { slotHtml } from "@/lib/templates";

/* ═══════════════════════════════════════════════════════════════════
   CATÁLOGO DE TIPOS DOCUMENTALES
   Cada tipo define qué se configura ANTES de editar: remitente,
   firmantes, asistentes, participantes y copias de conocimiento.
   ═══════════════════════════════════════════════════════════════════ */

export type DocTypeKey =
  | "acta"
  | "informe"
  | "memorando"
  | "oficio"
  | "contrato"
  | "certificacion";

export type DocTypeDef = {
  key: DocTypeKey;
  label: string;
  short: string;
  description: string;
  /** Requiere lista de asistentes (actas / comités) */
  needsAttendees: boolean;
  /** Requiere participantes o dependencias involucradas (informes) */
  needsParticipants: boolean;
  /** Rótulos sugeridos para cada contenedor de firma */
  defaultSlotLabels: string[];
  minSigners: number;
  maxSigners: number;
  /** APA activo por defecto (informes académicos / técnicos) */
  apaDefault: boolean;
  numberPrefix: string;
};

export const DOC_TYPES: Record<DocTypeKey, DocTypeDef> = {
  acta: {
    key: "acta",
    label: "Acta de reunión o comité",
    short: "ACTA",
    description:
      "Registra orden del día, desarrollo, decisiones y compromisos. Exige lista de asistentes.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    apaDefault: false,
    numberPrefix: "ACTA",
  },
  informe: {
    key: "informe",
    label: "Informe técnico o de gestión",
    short: "INFORME",
    description:
      "Documento analítico con introducción, desarrollo, conclusiones y referencias. Ideal con APA 7.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    // Formato institucional (Arial 11, sencillo) por defecto; APA 7 es opcional
    // y se activa desde el asistente cuando el informe lo requiera.
    apaDefault: false,
    numberPrefix: "INF",
  },
  memorando: {
    key: "memorando",
    label: "Memorando institucional",
    short: "MEMO",
    description: "Comunicación interna con instrucciones concretas y firma de jefatura.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    apaDefault: false,
    numberPrefix: "MEM",
  },
  oficio: {
    key: "oficio",
    label: "Oficio / Comunicación externa",
    short: "OFICIO",
    description: "Comunicación oficial dirigida a una entidad o persona externa.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    apaDefault: false,
    numberPrefix: "OFI",
  },
  contrato: {
    key: "contrato",
    label: "Contrato o convenio",
    short: "CONTRATO",
    description: "Acuerdo bilateral con cláusulas, obligaciones y firma de ambas partes.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    apaDefault: false,
    numberPrefix: "CTO",
  },
  certificacion: {
    key: "certificacion",
    label: "Certificación / Constancia",
    short: "CERT",
    description: "Constancia expedida a solicitud del interesado.",
    needsAttendees: true,
    needsParticipants: false,
    defaultSlotLabels: ["FIRMA AUTORIZADA"],
    minSigners: 1,
    maxSigners: 1,
    apaDefault: false,
    numberPrefix: "CER",
  },
};

export const DOC_TYPE_LIST = Object.values(DOC_TYPES);

/** Nombre breve y legible para cabeceras: "Informe", "Oficio", "Acta"… */
export function docTypeTitle(key?: string | null): string {
  const map: Record<string, string> = {
    acta: "Acta",
    informe: "Informe",
    memorando: "Memorando",
    oficio: "Oficio",
    contrato: "Contrato",
    certificacion: "Certificación",
  };
  return map[key ?? ""] ?? docTypeOf(key).label;
}

export function docTypeOf(key?: string | null): DocTypeDef {
  return DOC_TYPES[(key ?? "memorando") as DocTypeKey] ?? DOC_TYPES.memorando;
}

/* ─── Construcción del cuerpo según la configuración previa ──────── */

export type PartyInput = {
  name: string;
  email: string;
  cargo?: string;
  department?: string;
  slotLabel?: string;
  companyName?: string;
  external?: boolean;
};

export type DocConfig = {
  docType: DocTypeKey;
  docNumber: string;
  title: string;
  subject: string;
  city: string;
  apaEnabled: boolean;
  apaAuthors?: string;
  apaInstitution?: string;
  apaCourse?: string;
  apaInstructor?: string;
  sender: { name: string; cargo?: string; department?: string };
  destinatario?: PartyInput | null;
  signers: PartyInput[];
  attendees: PartyInput[];
  participants?: PartyInput[];
  copies: PartyInput[];
};

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function metaBlock(c: DocConfig) {
  const rows: string[] = [];
  const dest = c.destinatario;
  const to = dest
    ? `${dest.name}${dest.cargo ? ` — ${dest.cargo}` : ""}${
        dest.companyName ? ` (${dest.companyName})` : ""
      }`
    : c.signers.length > 0
      ? c.signers.map((s) => `${s.name}${s.cargo ? ` — ${s.cargo}` : ""}`).join("; ")
      : "[Destinatario]";
  rows.push(
    `<p><strong>PARA:</strong> ${esc(to)}</p>`,
    `<p><strong>DE:</strong> ${esc(c.sender.name)}${
      c.sender.cargo ? ` — ${esc(c.sender.cargo)}` : ""
    }</p>`,
    `<p><strong>ASUNTO:</strong> ${esc(c.subject || "[Asunto]")}</p>`,
    `<p><strong>CIUDAD Y FECHA:</strong> ${esc(c.city)}, [fecha de expedición]</p>`
  );
  if (c.copies.length) {
    rows.push(
      `<p><strong>COPIA:</strong> ${esc(
        c.copies.map((x) => `${x.name}${x.department ? ` (${x.department})` : ""}`).join("; ")
      )}</p>`
    );
  }
  return rows.join("");
}

function signatureBlock(c: DocConfig) {
  const salutation =
    c.docType === "contrato"
      ? "<p>Para constancia, las partes suscriben el presente documento mediante firma electrónica.</p>"
      : c.docType === "acta"
        ? "<p>En constancia de lo acordado, se firma la presente acta.</p>"
        : "<p>Atentamente,</p>";

  const slots = c.signers
    .map((s, i) =>
      slotHtml(i + 1, (s.slotLabel || "FIRMA AUTORIZADA").toUpperCase())
    )
    .join("");

  // El espacio de firma va inmediatamente debajo del cierre («Atentamente,»).
  return `${salutation}${slots}`;
}

function attendeesBlock(c: DocConfig) {
  if (!c.attendees.length) return "";
  const items = c.attendees
    .map(
      (a) =>
        `<li>${esc(a.name)}${a.cargo ? ` — ${esc(a.cargo)}` : ""}${
          a.department ? ` (${esc(a.department)})` : ""
        }</li>`
    )
    .join("");
  return `<h2>Asistentes</h2><ul>${items}</ul>`;
}

function participantsBlock(c: DocConfig) {
  if (!c.participants?.length) return "";
  const items = c.participants
    .map(
      (a) =>
        `<li>${esc(a.name)}${a.cargo ? ` — ${esc(a.cargo)}` : ""}${
          a.department ? ` (${esc(a.department)})` : ""
        }</li>`
    )
    .join("");
  return `<h2>Dependencias y participantes</h2><ul>${items}</ul>`;
}

const APA_REFS = `<h2>Referencias</h2>
<p class="apa-ref">Apellido, A. A. (2024). <em>Título del trabajo en cursiva</em> (2.ª ed.). Editorial.</p>
<p class="apa-ref">Apellido, B. B., y Apellido, C. C. (2023). Título del artículo. <em>Nombre de la Revista, 12</em>(3), 45–67. https://doi.org/10.xxxx/xxxxx</p>`;

/** Genera el cuerpo inicial del documento a partir de la configuración. */
export function buildDocumentHtml(c: DocConfig): string {
  const t = docTypeOf(c.docType);
  // Sin h1 de título: el tipo y el radicado los muestra la cabecera institucional.
  const head = ``;

  let body = "";

  switch (c.docType) {
    case "acta":
      body = `${head}
<p style="text-align:center"><em>${esc(c.subject || "[Nombre del comité o reunión]")}</em></p>
<p></p>
<p><strong>Ciudad:</strong> ${esc(c.city)} &nbsp; <strong>Fecha:</strong> [fecha] &nbsp; <strong>Hora:</strong> [hora]</p>
<p><strong>Modalidad:</strong> [presencial / virtual] &nbsp; <strong>Lugar:</strong> [sala o enlace]</p>
${attendeesBlock(c)}
<h2>Orden del día</h2>
<ol><li>Verificación del quórum y aprobación del orden del día.</li><li>Revisión de compromisos anteriores.</li><li>Temas nuevos.</li><li>Compromisos y cierre.</li></ol>
<h2>Desarrollo</h2>
<p>[Describa los puntos tratados, intervenciones relevantes y decisiones adoptadas.]</p>
<h2>Decisiones adoptadas</h2>
<ul><li>[Decisión 1]</li><li>[Decisión 2]</li></ul>
<h2>Compromisos</h2>
<ul><li>[Compromiso — Responsable — Fecha]</li></ul>
${signatureBlock(c)}`;
      break;

    case "informe":
      body = `${head}
${participantsBlock(c)}
<h2>Resumen</h2>
<p>[Síntesis del informe en un párrafo de máximo 250 palabras, sin sangría, según APA 7.]</p>
<h2>Introducción</h2>
<p>[Contexto, antecedentes y objetivo general del informe.]</p>
<h2>Metodología</h2>
<p>[Describa el enfoque, las fuentes consultadas y los instrumentos utilizados.]</p>
<h2>Resultados</h2>
<p>[Presente los hallazgos. Cite según APA: (Apellido, 2024, p. 15).]</p>
<h2>Conclusiones</h2>
<ul><li>[Conclusión 1]</li><li>[Conclusión 2]</li></ul>
<h2>Recomendaciones</h2>
<ul><li>[Recomendación 1]</li></ul>
${c.apaEnabled ? APA_REFS : ""}
${signatureBlock(c)}`;
      break;

    case "memorando":
      body = `${head}
<p>De manera atenta me permito informar lo siguiente:</p>
<p>[Desarrolle el contenido, indicando antecedentes, situación actual y requerimiento concreto.]</p>
<h2>Instrucciones</h2>
<ul><li>[Instrucción 1]</li><li>[Instrucción 2]</li></ul>
<p>Agradezco dar estricto cumplimiento a lo dispuesto, informando por escrito las acciones adelantadas.</p>
${signatureBlock(c)}`;
      break;

    case "oficio":
      body = `${head}
<p>Reciba un cordial saludo.</p>
<p>[Exponga de manera clara el motivo de la comunicación, los antecedentes y la solicitud o información que se remite.]</p>
<p>Quedo atento a cualquier aclaración adicional que se estime pertinente.</p>
${signatureBlock(c)}`;
      break;

    case "contrato":
      body = `${head}
<p style="text-align:center"><em>${esc(c.subject || "[Objeto del contrato]")}</em></p>
<p></p>
<p>En la ciudad de ${esc(c.city)}, a la fecha de suscripción, comparecen las partes que se identifican a continuación, quienes acuerdan celebrar el presente contrato:</p>
<h2>Primera — Comparecencia</h2>
${c.signers
  .map(
    (s, i) =>
      `<p><strong>${esc((s.slotLabel || `PARTE ${i + 1}`).toUpperCase())}:</strong> ${esc(
        s.name
      )}${s.cargo ? `, en calidad de ${esc(s.cargo)}` : ""}, identificado con documento No. [número].</p>`
  )
  .join("")}
<h2>Segunda — Objeto</h2>
<p>[Describa detalladamente el objeto, los entregables y el alcance.]</p>
<h2>Tercera — Plazo</h2>
<p>[Número] meses contados a partir de la suscripción.</p>
<h2>Cuarta — Valor y forma de pago</h2>
<p>[Valor total y condiciones de pago.]</p>
<h2>Quinta — Obligaciones</h2>
<ul><li>Cumplir los entregables con los estándares pactados.</li><li>Guardar confidencialidad sobre la información sensible.</li></ul>
<h2>Sexta — Terminación</h2>
<p>Cualquiera de las partes podrá terminar el contrato con treinta (30) días de preaviso escrito.</p>
${signatureBlock(c)}`;
      break;

    case "certificacion":
      body = `${head}
<p></p>
<p>El(la) suscrito(a) ${esc(c.sender.name)}${c.sender.cargo ? `, ${esc(c.sender.cargo)}` : ""},</p>
<h2 style="text-align:center">CERTIFICA que</h2>
<p>[Nombre completo del interesado], identificado(a) con documento No. [número], [describa el hecho que se certifica: vinculación, cargo, fechas y demás datos relevantes].</p>
<h2>Observaciones</h2>
<p>[Información adicional, si aplica.]</p>
<p></p>
<p>La presente certificación se expide en ${esc(c.city)}, a solicitud del interesado.</p>
${signatureBlock(c)}`;
      break;
  }

  return body.replace(/\n+/g, "");
}
