"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CopyPlus, Loader2, Save, Trash2, Users } from "lucide-react";
import { fieldClass } from "@/components/identity-fields";
import { PersonSearch, type PickedPerson } from "@/components/person-search";
import { DepartmentSearch } from "@/components/department-search";
import { Avatar, Panel } from "@/components/bits";
import type { Document } from "@/db/schema";

/* ═══════════════════════════════════════════════════════════════════
   CONFIGURACIÓN PREVIA (editable en cualquier momento mientras es borrador)
   Muestra y permite ajustar TODO lo definido al crear el documento:
   título · asunto · ciudad · remitente · destinatario · firmante ·
   asistentes (aprueban) · copias de conocimiento.
   ═══════════════════════════════════════════════════════════════════ */

type PartyRow = {
  kind: string;
  userId: string | null;
  name: string;
  email: string;
  cargo: string | null;
  department: string | null;
  dependencia?: string | null;
  external?: boolean | null;
  companyName?: string | null;
  status?: string;
  slotLabel?: string | null;
  color?: string | null;
  photoUrl?: string | null;
};

function toPicked(p: PartyRow, fallbackColor = "#22d3ee"): PickedPerson {
  return {
    userId: p.userId ?? null,
    name: p.name,
    email: p.email,
    cargo: p.cargo ?? "",
    department: p.department ?? p.dependencia ?? "",
    photoUrl: p.photoUrl ?? null,
    color: p.color ?? fallbackColor,
    external: Boolean(p.external),
    companyName: p.companyName ?? "",
  };
}

export function ConfigEditForm({
  doc,
  def,
}: {
  doc: Document;
  def: { short: string; numberPrefix: string; needsAttendees?: boolean; defaultSlotLabels?: string[] };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState(doc.city ?? "Bogotá D.C.");
  const [subject, setSubject] = useState(doc.subject ?? "");
  const [title, setTitle] = useState(doc.title);
  const [sender, setSender] = useState<PickedPerson | null>(null);
  const [dest, setDest] = useState<PickedPerson | null>(null);
  const [signer, setSigner] = useState<PickedPerson | null>(null);
  const [slotLabel, setSlotLabel] = useState(def.defaultSlotLabels?.[0] ?? "FIRMA AUTORIZADA");
  const [attendees, setAttendees] = useState<PickedPerson[]>([]);
  const [copies, setCopies] = useState<PickedPerson[]>([]);
  const [addingAttendee, setAddingAttendee] = useState<PickedPerson | null>(null);
  const [addingCopy, setAddingCopy] = useState<PickedPerson | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/documentos/${doc.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { parties?: PartyRow[] } | null) => {
        if (!alive || !data?.parties) return;
        const p = data.parties;
        const s = p.find((x) => x.kind === "sender");
        const d = p.find((x) => x.kind === "destinatario");
        const sg = p.find((x) => x.kind === "signer");
        if (s) setSender(toPicked(s));
        if (d) setDest(toPicked(d, "#f59e0b"));
        if (sg) { setSigner(toPicked(sg, "#34d399")); if (sg.slotLabel) setSlotLabel(sg.slotLabel); }
        setAttendees(p.filter((x) => x.kind === "attendee").map((x) => toPicked(x, "#a78bfa")));
        setCopies(p.filter((x) => x.kind === "copy").map((x) => toPicked(x, "#38bdf8")));
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [doc.id]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`/api/documentos/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: doc.content,
          city, subject,
          senderId: sender?.userId ?? doc.senderId,
          destinatario: dest ? { ...dest, external: dest.external, companyName: dest.companyName || dest.department } : undefined,
          signer: signer ? { ...signer, slotLabel: slotLabel.trim().toUpperCase() || "FIRMA AUTORIZADA" } : undefined,
          attendees: attendees.map((a) => ({ name: a.name, email: a.email, cargo: a.cargo, department: a.department, userId: a.userId })),
          copies: copies.map((c) => ({ name: c.name, email: c.email, cargo: c.cargo, department: c.department, userId: c.userId })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      router.refresh();
      router.push(`/documentos/${doc.id}`);
      try { new BroadcastChannel("signum-doc").postMessage({ id: doc.id, saved: true, config: true }); } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
      setSaving(false);
    }
  }

  const PersonList = ({
    items, onRemove, icon, empty,
  }: { items: PickedPerson[]; onRemove: (i: number) => void; icon: React.ReactNode; empty: string }) =>
    items.length === 0 ? (
      <p className="mb-2 rounded-md border border-dashed border-line px-3 py-2 text-[11.5px] text-slate-500">{empty}</p>
    ) : (
      <ul className="mb-3 space-y-2">
        {items.map((a, i) => (
          <li key={`${a.email}-${i}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
            {icon}
            <Avatar name={a.name} color={a.color} photoUrl={a.photoUrl} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200">
              {a.name} <span className="font-mono text-[9.5px] text-slate-500">{a.cargo || a.department}</span>
            </span>
            <button type="button" onClick={() => onRemove(i)} className="text-slate-500 hover:text-rose-400" aria-label="Quitar">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-4">
      {loading && (
        <p className="flex items-center gap-2 font-mono text-[10.5px] text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando configuración actual…
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Título *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del documento" className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Asunto</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto" className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Ciudad</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" className={fieldClass} />
        </label>
        <label className="block">
          <span className="mb-1 block font-mono text-[9.5px] font-bold uppercase tracking-wider text-slate-500">Rótulo bajo la firma</span>
          <input value={slotLabel} onChange={(e) => setSlotLabel(e.target.value)} placeholder="FIRMA AUTORIZADA" className={fieldClass} />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Remitente (DE)</p>
          <PersonSearch label="" value={sender} onChange={setSender} />
          <DepartmentSearch
            label="Dependencia remitente"
            value={sender?.department ?? ""}
            onChange={(d) => setSender((s) => (s ? { ...s, department: d } : s))}
          />
        </Panel>
        <Panel className="p-4">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Destinatario (PARA)</p>
          <PersonSearch label="" value={dest} onChange={setDest} allowExternal />
          {dest && !dest.external && (
            <DepartmentSearch
              label="Dependencia destino"
              value={dest.department}
              onChange={(d) => setDest((p) => (p ? { ...p, department: d } : p))}
            />
          )}
        </Panel>
        <Panel className="p-4">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Firmante designado</p>
          <PersonSearch label="" value={signer} onChange={setSigner} />
          <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-slate-600">
            Una sola persona firma. Si cambia el firmante, se emitirán credenciales nuevas al despachar.
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Revisores · aprueban antes de la firma</p>
          <PersonList
            items={attendees}
            onRemove={(i) => setAttendees((arr) => arr.filter((_, idx) => idx !== i))}
            icon={<Users className="h-3.5 w-3.5 text-amber-300" />}
            empty="Sin revisores. Añada a quien deba verificar y aprobar el documento antes de la firma (opcional)."
          />
          <PersonSearch
            label="Añadir revisor"
            value={addingAttendee}
            onChange={(p) => {
              if (p && p.email) {
                setAttendees((arr) => (arr.some((x) => x.email === p.email) ? arr : [...arr, p]));
                setAddingAttendee(null);
              } else setAddingAttendee(p);
            }}
          />
        </Panel>
        <Panel className="p-4 lg:col-span-2">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Copias de conocimiento</p>
          <PersonList
            items={copies}
            onRemove={(i) => setCopies((arr) => arr.filter((_, idx) => idx !== i))}
            icon={<CopyPlus className="h-3.5 w-3.5 text-plasma" />}
            empty="Sin copias. Añada personas o entornos que deban conocer el documento."
          />
          <PersonSearch
            label="Añadir copia"
            value={addingCopy}
            onChange={(p) => {
              if (p && p.email) {
                setCopies((arr) => (arr.some((x) => x.email === p.email) ? arr : [...arr, p]));
                setAddingCopy(null);
              } else setAddingCopy(p);
            }}
          />
        </Panel>
      </div>

      {error && (
        <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[12px] text-rose-300">{error}</p>
      )}
      <div className="flex justify-end">
        <button onClick={save} disabled={saving || loading || !title.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-neon px-5 py-2 text-[12px] font-bold uppercase tracking-wide text-void disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar configuración
        </button>
      </div>
    </div>
  );
}
