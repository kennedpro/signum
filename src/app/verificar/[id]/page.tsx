import { asc, eq } from "drizzle-orm";
import { ShieldCheck, ShieldX, Fingerprint, KeyRound, FileCheck2, Link2 } from "lucide-react";
import { db } from "@/db";
import { documents, organizations, signatures } from "@/db/schema";
import { sha256 } from "@/lib/crypto-sign";
import { verifyCanonical } from "@/lib/pki";
import { verifyDocumentChain } from "@/lib/audit";
import { BrandMark } from "@/components/brand";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

function Pill({ ok, label }: { ok: boolean | null; label: string }) {
  const cls =
    ok === true
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : ok === false
        ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
        : "border-line2 bg-panel2/60 text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[10px] font-bold ${cls}`}>
      {ok === true ? <ShieldCheck className="h-3 w-3" /> : ok === false ? <ShieldX className="h-3 w-3" /> : null}
      {label}: {ok === true ? "VÁLIDA" : ok === false ? "FALLA" : "N/A"}
    </span>
  );
}

export default async function VerificarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);

  if (!doc) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <ShieldX className="mx-auto h-10 w-10 text-rose-400" />
        <h1 className="mt-4 font-display text-2xl font-bold text-slate-100">Documento no encontrado</h1>
      </div>
    );
  }

  const [org] = doc.organizationId
    ? await db.select().from(organizations).where(eq(organizations.id, doc.organizationId)).limit(1)
    : [null];
  const sigs = await db.select().from(signatures).where(eq(signatures.documentId, id)).orderBy(asc(signatures.slot));
  const chain = await verifyDocumentChain(id);
  const docHashNow = sha256([doc.content]);

  const rows = sigs.map((s) => {
    let p: { documentHash?: string } | null = null;
    try { p = s.canonicalPayload ? JSON.parse(s.canonicalPayload) : null; } catch { p = null; }
    const integridad = p?.documentHash ? p.documentHash === docHashNow : null;
    const consentOk = s.consentText && s.consentHash ? sha256([s.consentText]) === s.consentHash : null;
    const intencion = consentOk === null ? null : consentOk && Boolean(s.otpVerifiedAt);
    const identidad =
      s.signerPublicKey && s.signatureValue && s.canonicalPayload
        ? verifyCanonical(s.signerPublicKey, s.canonicalPayload, s.signatureValue)
        : null;
    return { s, identidad, intencion, integridad };
  });

  const all = (k: "identidad" | "intencion" | "integridad") =>
    rows.length > 0 && rows.every((r) => r[k] !== false);
  const valid = all("identidad") && all("intencion") && all("integridad") && chain.ok;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <BrandMark size={44} />
        <div>
          <p className="font-display text-[17px] font-bold tracking-[0.2em] text-slate-100">SIGNUM</p>
          <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-neon/70">verificación pública de firma</p>
        </div>
      </div>

      <div className={`hud rounded-xl p-6 ${valid ? "border-emerald-400/40" : "border-rose-500/40"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-50">{doc.title}</h1>
            <p className="font-mono text-[10px] text-slate-500">
              {doc.docNumber ?? "sin radicado"} · {org?.name ?? "—"} · {doc.status.toUpperCase()}
            </p>
          </div>
          <span className={`rounded px-3 py-1.5 font-mono text-[11px] font-bold ${valid ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
            {valid ? "DOCUMENTO VÁLIDO" : "REVISAR EVIDENCIA"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Pill ok={all("identidad")} label="IDENTIDAD" />
          <Pill ok={all("intencion")} label="INTENCIÓN" />
          <Pill ok={all("integridad") && chain.ok} label="INTEGRIDAD" />
        </div>

        <div className="mt-5 grid gap-2 text-[11.5px] text-slate-400 sm:grid-cols-2">
          <p className="flex items-center gap-2"><Fingerprint className="h-3.5 w-3.5 text-neon" /> Huella actual SHA-256:
            <span className="ml-1 break-all font-mono text-[10px] text-slate-300">{docHashNow.slice(0, 32)}…</span></p>
          <p className="flex items-center gap-2"><Link2 className="h-3.5 w-3.5 text-neon" /> Cadena de auditoría:
            <span className="ml-1 font-mono text-[10px] text-slate-300">{chain.ok ? `ÍNTEGRA (${chain.length})` : `ROTA #${chain.brokenAt}`}</span></p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {rows.map(({ s, identidad, intencion, integridad }) => (
          <div key={s.id} className="hud rounded-lg p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-bold text-slate-100">{s.signerName}</p>
                <p className="font-mono text-[10px] text-slate-500">
                  {s.signerCargo ?? "—"} · CC {s.signerCedula ?? "—"} · {formatDateTime(s.createdAt)}
                </p>
              </div>
              <span className="rounded border border-line2 px-2 py-0.5 font-mono text-[9px] text-slate-400">
                {s.signatureAlg ?? "SHA-256"} {s.signerKeyFingerprint ? `· ${s.signerKeyFingerprint.slice(0, 23)}…` : ""}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill ok={identidad} label="IDENTIDAD" />
              <Pill ok={intencion} label="INTENCIÓN" />
              <Pill ok={integridad} label="INTEGRIDAD" />
            </div>
            <div className="mt-3 grid gap-1 font-mono text-[9.5px] text-slate-500 sm:grid-cols-2">
              <p><KeyRound className="mr-1 inline h-3 w-3" />Factores: {s.authFactors ?? "—"}</p>
              <p><FileCheck2 className="mr-1 inline h-3 w-3" />OTP verificado: {s.otpVerifiedAt ? "sí" : "no"}</p>
              <p className="sm:col-span-2">Sello de tiempo: {s.ntpSource ?? "—"} · {s.ntpIso ?? "—"}</p>
            </div>
            {s.consentText && (
              <details className="mt-3">
                <summary className="cursor-pointer font-mono text-[10px] text-neon">Declaración de voluntad firmada</summary>
                <p className="mt-2 rounded-md border border-line bg-panel2/50 p-3 text-[11px] leading-relaxed text-slate-300">
                  {s.consentText}
                </p>
              </details>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 font-mono text-[9px] leading-relaxed text-slate-600">
        Fundamento: Ley 527 de 1999 · Decreto 2364 de 2012 · Ley Modelo CNUDMI. La verificación recalcula las huellas
        del contenido, valida cada firma Ed25519 con su clave pública y comprueba el encadenamiento de la bitácora.
        API: <span className="text-slate-500">/api/verificar/{doc.id}</span>
      </p>
    </div>
  );
}
