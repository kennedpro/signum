"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Users,
  PenSquare,
  Send,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  Check,
  BookMarked,
  UserRound,
  CopyPlus,
  Gavel,
  ClipboardList,
  Mail,
  AlertTriangle,
} from "lucide-react";
import { Panel, SectionTitle, Avatar } from "@/components/bits";
import { DocHeader, type OrgHeader } from "@/components/doc-header";
import { fieldClass } from "@/components/identity-fields";
import { PersonSearch, type PickedPerson } from "@/components/person-search";
import { DepartmentSearch } from "@/components/department-search";
import { DOC_TYPE_LIST, docTypeOf, type DocTypeKey } from "@/lib/doctypes";
import { cn } from "@/lib/utils";

export type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  cargo: string | null;
  department: string;
  color: string;
  photoUrl: string | null;
};

const STEPS = [
  { key: "tipo", label: "Tipo" },
  { key: "datos", label: "Cabecera" },
  { key: "firma", label: "Firma" },
  { key: "asistentes", label: "Revisores" },
  { key: "revisar", label: "Revisar" },
] as const;

const ICONS: Record<DocTypeKey, typeof FileText> = {
  acta: ClipboardList,
  informe: BookMarked,
  memorando: Mail,
  oficio: Send,
  contrato: Gavel,
  certificacion: UserRound,
};

function fromDir(u: DirectoryUser): PickedPerson {
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    cargo: u.cargo ?? "",
    department: u.department,
    photoUrl: u.photoUrl,
    color: u.color,
    external: false,
    companyName: "",
  };
}

export function NewDocWizard({
  org,
  me,
}: {
  directory?: DirectoryUser[];
  org: OrgHeader;
  me: DirectoryUser | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [docType, setDocType] = useState<DocTypeKey>("memorando");
  const def = docTypeOf(docType);
  const docNumber = "";
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [city, setCity] = useState(org.city ?? "Bogotá D.C.");
  const [apaEnabled, setApaEnabled] = useState(false);
  const [sender, setSender] = useState<PickedPerson | null>(me ? fromDir(me) : null);
  const [destinatario, setDestinatario] = useState<PickedPerson | null>(null);
  const [signer, setSigner] = useState<PickedPerson | null>(null);
  const [attendees, setAttendees] = useState<PickedPerson[]>([]);
  const [copies, setCopies] = useState<PickedPerson[]>([]);
  const [addingAttendee, setAddingAttendee] = useState<PickedPerson | null>(null);
  const [addingCopy, setAddingCopy] = useState<PickedPerson | null>(null);

  function pickType(k: DocTypeKey) {
    const d = docTypeOf(k);
    setDocType(k);
    setApaEnabled(d.apaDefault);
  }

  const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  const personOk = (p: PickedPerson | null) =>
    Boolean(p && p.name.trim().length >= 3 && emailOk(p.email) && (!p.external || p.companyName.trim()));

  const stepValid = useMemo(() => {
    if (step === 0) return Boolean(docType);
    if (step === 1)
      return title.trim().length >= 3 && personOk(sender) && personOk(destinatario);
    if (step === 2) return personOk(signer);
    if (step === 3) return attendees.every((a) => personOk(a));
    return true;
  }, [step, docType, title, sender, destinatario, signer, attendees]);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docType,
          docNumber,
          title,
          subject,
          city,
          senderId: sender?.userId,
          apaEnabled,
          destinatario,
          signers: signer
            ? [{ ...signer, slotLabel: def.defaultSlotLabels[0] ?? "FIRMA AUTORIZADA" }]
            : [],
          attendees,
          copies,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear");
      // Esta pestaña se queda en la consola (expediente con Enviar a aprobar / firmar, etc.).
      // El editor tipo Word se abre en una pestaña APARTE, sin robar el foco de la actual.
      const editorUrl = `/editor/${data.id}`;
      const w = window.open(editorUrl, `signum-editor-${data.id}`);
      // Volver a traer el foco a la consola (algunos navegadores lo pasan a la pestaña nueva).
      try { window.focus(); } catch {}
      router.replace(`/documentos/${data.id}`);
      router.refresh();
      if (!w) {
        // Bloqueador de ventanas emergentes: se ofrece el enlace en el expediente ("Abrir editor").
        setError("El navegador bloqueó la pestaña del editor. Ábralo desde el botón «Abrir editor» del expediente.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Panel className="p-3">
        <ol className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center gap-1">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-[11.5px] font-bold",
                  i === step
                    ? "bg-neon/15 text-neonsoft ring-1 ring-neon/35"
                    : i < step
                      ? "text-emerald-300"
                      : "text-slate-600"
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded font-mono text-[9px]",
                    i === step ? "bg-neon text-void" : i < step ? "bg-emerald-400/20" : "border border-line2"
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-700" />}
            </li>
          ))}
        </ol>
      </Panel>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.25 }}
        >
          {step === 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DOC_TYPE_LIST.map((t) => {
                const Icon = ICONS[t.key];
                const active = docType === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => pickType(t.key)}
                    className={cn(
                      "hud flex flex-col items-start gap-2 rounded-lg p-4 text-left",
                      active ? "border-neon/50 bg-neon/[0.06]" : "hover:border-neon/30"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", active ? "text-neon" : "text-slate-400")} />
                    <p className="font-display text-[14px] font-bold text-slate-100">{t.label}</p>
                    <p className="text-[11.5px] text-slate-500">{t.description}</p>
                    <span className="font-mono text-[9px] text-slate-500">1 FIRMANTE · REVISORES OPCIONALES</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
              <Panel className="space-y-4 p-5">
                <SectionTitle hint={def.short}>Cabecera del documento</SectionTitle>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Título *"
                  className={fieldClass}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2 rounded-md border border-dashed border-line2 bg-panel2/40 px-3 py-2">
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                      Código
                    </span>
                    <span className="font-mono text-[12px] text-slate-300">
                      se asigna automáticamente
                    </span>
                  </div>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ciudad"
                    className={fieldClass}
                  />
                </div>
                <p className="font-mono text-[9.5px] leading-relaxed text-slate-500">
                  En edición el documento lleva un código provisional (00000001). Al firmarse
                  recibe el radicado oficial consecutivo de la entidad, p. ej.{" "}
                  <span className="text-neon">{def.numberPrefix}-{new Date().getFullYear()}-0001</span>.
                </p>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Asunto"
                  className={fieldClass}
                />
                <PersonSearch label="Remitente (DE)" value={sender} onChange={setSender} />
                <DepartmentSearch
                  label="Dependencia remitente"
                  value={sender?.department ?? ""}
                  onChange={(d) =>
                    setSender((s) =>
                      s
                        ? { ...s, department: d }
                        : {
                            userId: null,
                            name: "",
                            email: "",
                            cargo: "",
                            department: d,
                            photoUrl: null,
                            color: "#22d3ee",
                            external: false,
                            companyName: "",
                          }
                    )
                  }
                />
                <PersonSearch
                  label="Destinatario (PARA)"
                  value={destinatario}
                  onChange={setDestinatario}
                  allowExternal
                />
                {destinatario && !destinatario.external && (
                  <DepartmentSearch
                    label="Dependencia destino (desde su registro)"
                    value={destinatario.department}
                    onChange={(d) => setDestinatario((p) => (p ? { ...p, department: d } : p))}
                  />
                )}
                <p className="font-mono text-[9.5px] leading-relaxed text-slate-500">
                  Al elegir a la persona, cargo y dependencia se toman de su ficha. Puede buscar
                  la dependencia por nombre o por iniciales (TH, OAJ, DIPRO). El remitente por
                  defecto es quien crea el documento.
                </p>
              </Panel>
              <Panel className="p-4">
                <SectionTitle>Cabecera</SectionTitle>
                <div className="overflow-x-auto rounded-md bg-[#fdfcf9] p-3">
                  <div style={{ width: 400 }}>
                    <DocHeader org={org} docNumber={docNumber} draftCode="00000000" docTypeShort={def.short} city={city} />
                  </div>
                </div>
                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3">
                  <span className="text-[12px] text-slate-300">Normas APA 7</span>
                  <input
                    type="checkbox"
                    checked={apaEnabled}
                    onChange={(e) => setApaEnabled(e.target.checked)}
                  />
                </label>
              </Panel>
            </div>
          )}

          {step === 2 && (
            <Panel className="space-y-3 p-5">
              <SectionTitle>Único firmante autorizado</SectionTitle>
              <p className="text-[12.5px] text-slate-400">
                Solo una persona estampa la firma digital. Si designa revisores, ellos aprueban
                antes; cuando todos aprueben, el documento llega automáticamente a este firmante.
              </p>
              <PersonSearch label="Firmante" value={signer} onChange={setSigner} />
            </Panel>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <Panel className="p-5">
                <SectionTitle hint="APROBACIÓN PREVIA · OPCIONAL">Revisores que aprueban</SectionTitle>
                <p className="mb-3 text-[12px] text-slate-400">
                  Pida a otro funcionario que verifique y apruebe el documento antes de enviarlo a
                  firma. Cuando todos los revisores aprueben, el firmante lo recibirá. El destinatario
                  no aprueba: solo recibe el resultado.
                </p>
                <ul className="mb-3 space-y-2">
                  {attendees.map((a, i) => (
                    <li
                      key={`${a.email}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-line px-3 py-2"
                    >
                      <Avatar name={a.name} color={a.color} photoUrl={a.photoUrl} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200">
                        {a.name}
                      </span>
                      <button
                        onClick={() => setAttendees((arr) => arr.filter((_, idx) => idx !== i))}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <PersonSearch
                  label="Añadir revisor"
                  value={addingAttendee}
                  onChange={(p) => {
                    if (p && p.email) {
                      setAttendees((arr) =>
                        arr.some((x) => x.email === p.email) ? arr : [...arr, p]
                      );
                      setAddingAttendee(null);
                    } else setAddingAttendee(p);
                  }}
                />
              </Panel>
              <Panel className="p-5">
                <SectionTitle hint="SOLO LECTURA">Copias de conocimiento</SectionTitle>
                <ul className="mb-3 space-y-2">
                  {copies.map((a, i) => (
                    <li
                      key={`${a.email}-c-${i}`}
                      className="flex items-center gap-2 rounded-md border border-line px-3 py-2"
                    >
                      <CopyPlus className="h-3.5 w-3.5 text-plasma" />
                      <span className="flex-1 truncate text-[12.5px] text-slate-200">{a.name}</span>
                      <button
                        onClick={() => setCopies((arr) => arr.filter((_, idx) => idx !== i))}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <PersonSearch
                  label="Añadir copia"
                  value={addingCopy}
                  onChange={(p) => {
                    if (p && p.email) {
                      setCopies((arr) =>
                        arr.some((x) => x.email === p.email) ? arr : [...arr, p]
                      );
                      setAddingCopy(null);
                    } else setAddingCopy(p);
                  }}
                />
              </Panel>
            </div>
          )}

          {step === 4 && (
            <Panel className="p-5">
              <SectionTitle>Resumen</SectionTitle>
              <dl className="space-y-2 text-[12.5px] text-slate-300">
                <div>
                  <span className="font-mono text-[10px] text-slate-500">TIPO · </span>
                  {def.label}
                </div>
                <div>
                  <span className="font-mono text-[10px] text-slate-500">DE · </span>
                  {sender?.name}
                </div>
                <div>
                  <span className="font-mono text-[10px] text-slate-500">PARA · </span>
                  {destinatario?.name}
                  {destinatario?.external ? ` (${destinatario.companyName})` : ""}
                </div>
                <div>
                  <span className="font-mono text-[10px] text-slate-500">FIRMA · </span>
                  {signer?.name}
                </div>
                <div>
                  <span className="font-mono text-[10px] text-slate-500">ASISTENTES · </span>
                  {attendees.length === 0
                    ? "ninguno — pasará directo a firma"
                    : attendees.map((a) => a.name).join(", ")}
                </div>
              </dl>
              {error && (
                <p className="mt-4 flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </p>
              )}
            </Panel>
          )}
        </motion.div>
      </AnimatePresence>

      <Panel className="flex items-center justify-between p-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || saving}
          className="inline-flex items-center gap-1.5 rounded-md border border-line2 px-4 py-2 text-[12px] font-semibold text-slate-400 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!stepValid}
            className="inline-flex items-center gap-1.5 rounded-md bg-neon px-5 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-40"
          >
            Continuar
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={create}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-neon px-5 py-2 text-[12px] font-bold uppercase tracking-wide text-void"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Crear y editar
          </button>
        )}
      </Panel>
    </div>
  );
}
