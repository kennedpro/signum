export type DocTemplate = {
  key: string;
  name: string;
  description: string;
  category: string;
  slots: number;
  html: string;
};

/**
 * Contenedor fantasma + marcador invisible.
 * El ancla `SGN::SLOT::n` es la guía láser que el motor usa para inyectar
 * el logo y el bloque de texto dinámico sin tocar el resto del documento.
 */
export function slotHtml(index: number, label: string) {
  return `<div data-signature-slot="${index}" data-signature-label="${label}" data-signature-anchor="SGN::SLOT::${index}"></div>`;
}

/** Bloque de cierre con espacio en blanco respetado antes de la firma. */
function closing(label: string, index = 1, salutation = "Atentamente,") {
  return `<p>${salutation}</p><p></p><p></p>${slotHtml(index, label)}`;
}

function twoParties(a: string, b: string) {
  return `<p>Para constancia, las partes suscriben el presente documento mediante firma electrónica.</p><p></p>${slotHtml(
    1,
    a
  )}<p></p><p></p>${slotHtml(2, b)}`;
}

export const TEMPLATES: DocTemplate[] = [
  {
    key: "contrato-servicios",
    name: "Contrato de prestación de servicios",
    description: "Acuerdo bilateral entre proveedor y contratante.",
    category: "Legal",
    slots: 2,
    html: `<h1 style="text-align:center">CONTRATO DE PRESTACIÓN DE SERVICIOS</h1>
<p style="text-align:center"><strong>Entre</strong> <em>[Nombre de la empresa]</em> <strong>y</strong> <em>[Nombre del proveedor]</em></p>
<p></p>
<p>En la ciudad de <em>[Ciudad]</em>, a la fecha de suscripción del presente documento, comparecen las partes que se identifican a continuación, quienes libre y voluntariamente acuerdan celebrar el presente contrato de prestación de servicios, sujeto a las siguientes cláusulas:</p>
<h2>PRIMERA — COMPARECENCIA</h2>
<p><strong>EL CONTRATANTE:</strong> <em>[Razón social]</em>, con NIT/RUC <em>[número]</em>, representada legalmente por <em>[nombre del representante]</em>, en su calidad de <em>[cargo]</em>.</p>
<p><strong>EL CONTRATISTA:</strong> <em>[Nombre completo]</em>, identificado con documento de identidad No. <em>[número]</em>, actuando en nombre propio.</p>
<h2>SEGUNDA — OBJETO</h2>
<p>El objeto del presente contrato es la prestación de servicios profesionales consistentes en: <em>[describir detalladamente los servicios, entregables y alcance]</em>.</p>
<h2>TERCERA — PLAZO DE EJECUCIÓN</h2>
<p>El presente contrato tendrá una duración de <em>[número]</em> meses, contados a partir de la fecha de suscripción, pudiendo ser prorrogado por acuerdo escrito entre las partes.</p>
<h2>CUARTA — VALOR Y FORMA DE PAGO</h2>
<p>El valor total convenido asciende a <em>[valor]</em>, pagaderos mensualmente contra presentación de factura y certificación de cumplimiento de entregables emitida por la supervisión designada.</p>
<h2>QUINTA — OBLIGACIONES</h2>
<ul><li>Cumplir los entregables pactados con los estándares de calidad convenidos.</li><li>Guardar confidencialidad sobre la información sensible de la empresa.</li><li>Informar oportunamente cualquier eventualidad que afecte la ejecución.</li></ul>
<h2>SEXTA — TERMINACIÓN</h2>
<p>Cualquiera de las partes podrá dar por terminado el contrato mediante notificación escrita con al menos treinta (30) días de anticipación.</p>
<p></p>
${twoParties("EL CONTRATANTE", "EL CONTRATISTA")}`,
  },
  {
    key: "nda",
    name: "Acuerdo de confidencialidad (NDA)",
    description: "Protección de información sensible entre partes.",
    category: "Legal",
    slots: 2,
    html: `<h1 style="text-align:center">ACUERDO DE CONFIDENCIALIDAD</h1>
<p style="text-align:center"><em>Non-Disclosure Agreement (NDA)</em></p>
<p></p>
<p>Entre <strong>[Empresa reveladora]</strong> y <strong>[Parte receptora]</strong> se celebra el presente acuerdo de confidencialidad con el fin de proteger la información técnica, comercial y estratégica compartida durante la relación entre las partes.</p>
<h2>1. DEFINICIÓN DE INFORMACIÓN CONFIDENCIAL</h2>
<p>Se considera información confidencial toda aquella de carácter técnico, financiero, comercial u operativo, revelada de forma oral, escrita o electrónica, incluyendo sin limitarse a: planes de negocio, datos de clientes, código fuente, procesos internos y proyecciones financieras.</p>
<h2>2. OBLIGACIONES DE LA PARTE RECEPTORA</h2>
<ul><li>Utilizar la información exclusivamente para los fines autorizados.</li><li>No divulgarla a terceros sin autorización previa y escrita.</li><li>Aplicar las mismas medidas de seguridad que emplea para su propia información sensible.</li><li>Restituir o destruir la información al término de la relación.</li></ul>
<h2>3. EXCEPCIONES</h2>
<p>No serán confidenciales las informaciones que: (a) sean de dominio público sin culpa del receptor; (b) deban revelarse por mandato legal o judicial; (c) ya fueran conocidas legítimamente por el receptor.</p>
<h2>4. VIGENCIA</h2>
<p>El presente acuerdo tendrá vigencia de <em>[número]</em> años desde su suscripción, y las obligaciones subsistirán por igual periodo posterior a su terminación.</p>
<h2>5. LEGISLACIÓN APLICABLE</h2>
<p>Este acuerdo se rige por las leyes del país de constitución de la empresa reveladora, ante los jueces competentes de <em>[jurisdicción]</em>.</p>
<p></p>
${twoParties("PARTE REVELADORA", "PARTE RECEPTORA")}`,
  },
  {
    key: "autorizacion",
    name: "Autorización / Carta de autorización",
    description: "Poder limitado para actuar en nombre de alguien.",
    category: "Administrativo",
    slots: 1,
    html: `<h1 style="text-align:center">CARTA DE AUTORIZACIÓN</h1>
<p></p>
<p>Por medio de la presente, yo, <strong>[Nombre completo]</strong>, identificado con documento No. <em>[número]</em>, en mi calidad de <em>[cargo o calidad]</em>, <strong>AUTORIZO</strong> de manera expresa a:</p>
<p><strong>[Nombre del autorizado]</strong>, identificado con documento No. <em>[número]</em>, para que en mi nombre y representación realice las siguientes gestiones:</p>
<ul><li><em>[Describir gestión 1]</em></li><li><em>[Describir gestión 2]</em></li><li>Recibir notificaciones, firmar documentos y realizar los trámites conexos necesarios.</li></ul>
<h2>ÁMBITO Y VIGENCIA</h2>
<p>La presente autorización tendrá validez desde la fecha de su suscripción y hasta el <em>[fecha de vencimiento]</em>, limitándose exclusivamente a las gestiones descritas.</p>
<h2>RESPONSABILIDAD</h2>
<p>Declaro que los actos ejecutados por el autorizado dentro del ámbito de esta autorización serán válidos y de mi entera responsabilidad.</p>
<p></p>
${closing("EL AUTORIZANTE")}`,
  },
  {
    key: "acta-reunion",
    name: "Acta de reunión / Comité",
    description: "Registro formal de acuerdos y compromisos.",
    category: "Administrativo",
    slots: 2,
    html: `<h1 style="text-align:center">ACTA DE REUNIÓN</h1>
<p style="text-align:center"><em>[Nombre del comité o reunión]</em></p>
<p></p>
<p><strong>Fecha:</strong> <em>[fecha]</em> &nbsp; <strong>Hora:</strong> <em>[hora]</em> &nbsp; <strong>Modalidad:</strong> <em>[presencial / virtual]</em></p>
<h2>1. ASISTENTES</h2>
<ul><li><em>[Nombre — Cargo]</em></li><li><em>[Nombre — Cargo]</em></li></ul>
<h2>2. ORDEN DEL DÍA</h2>
<ol><li>Verificación del quórum y aprobación del orden del día.</li><li>Revisión de compromisos anteriores.</li><li>Temas nuevos.</li><li>Compromisos y cierre.</li></ol>
<h2>3. DESARROLLO</h2>
<p><em>[Describa los puntos tratados, intervenciones relevantes y decisiones adoptadas.]</em></p>
<h2>4. COMPROMISOS</h2>
<ul><li><em>[Compromiso — Responsable — Fecha]</em></li></ul>
<p></p>
<p>Se firma el presente acta en constancia de lo acordado.</p>
<p></p>
${twoParties("PRESIDENTE DEL COMITÉ", "SECRETARIO")}`,
  },
  {
    key: "carta-laboral",
    name: "Carta laboral / Certificación",
    description: "Certificado de vinculación y desempeño.",
    category: "Talento Humano",
    slots: 1,
    html: `<h1 style="text-align:center">CERTIFICACIÓN LABORAL</h1>
<p></p>
<p>El departamento de Talento Humano de <strong>[Nombre de la empresa]</strong>, identificada con NIT/RUC <em>[número]</em>:</p>
<h2 style="text-align:center">CERTIFICA que</h2>
<p>El(la) señor(a) <strong>[Nombre completo]</strong>, identificado(a) con documento No. <em>[número]</em>, labora en esta empresa desde el <em>[fecha de ingreso]</em>, desempeñando el cargo de <strong>[Cargo]</strong>, adscrito(a) al área de <em>[área]</em>, con contrato de tipo <em>[término indefinido / fijo]</em>.</p>
<h2>DESEMPEÑO</h2>
<p>Durante su vinculación ha demostrado responsabilidad, compromiso y excelente disposición para el cumplimiento de sus funciones.</p>
<p></p>
<p>La presente certificación se expide a solicitud del interesado.</p>
<p></p>
${closing("JEFE DE TALENTO HUMANO")}`,
  },
  {
    key: "memorando",
    name: "Memorando institucional",
    description: "Comunicación interna con firma de jefatura.",
    category: "Institucional",
    slots: 1,
    html: `<h1 style="text-align:center">MEMORANDO No. [000-2026]</h1>
<p></p>
<p><strong>PARA:</strong> <em>[Nombre y cargo del destinatario]</em></p>
<p><strong>DE:</strong> <em>[Nombre y cargo del remitente]</em></p>
<p><strong>ASUNTO:</strong> <em>[Asunto del memorando]</em></p>
<p><strong>FECHA:</strong> <em>[Fecha de expedición]</em></p>
<hr>
<p>De manera atenta me permito informar lo siguiente:</p>
<p><em>[Desarrolle el contenido del memorando, indicando antecedentes, situación actual y requerimiento concreto.]</em></p>
<h2>INSTRUCCIONES</h2>
<ul><li><em>[Instrucción 1]</em></li><li><em>[Instrucción 2]</em></li></ul>
<p>Agradezco dar estricto cumplimiento a lo dispuesto, informando por escrito las acciones adelantadas dentro de los términos establecidos.</p>
<p></p>
${closing("JEFE DE LA DEPENDENCIA")}`,
  },
];

export const BLANK_HTML = `<h1>Título del documento</h1><p>Comience a redactar aquí. Use la barra de herramientas para dar formato al texto.</p><p></p><p></p>${closing(
  "FIRMA AUTORIZADA"
)}`;
