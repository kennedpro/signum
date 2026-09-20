import { cn, DOC_STATUS, RECIPIENT_STATUS, initials } from "@/lib/utils";

export function DocStatusBadge({ status }: { status: string }) {
  const meta = DOC_STATUS[status] ?? DOC_STATUS.borrador;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset",
        meta.badge
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function RecipientBadge({ status }: { status: string }) {
  const meta = RECIPIENT_STATUS[status] ?? RECIPIENT_STATUS.pendiente;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset",
        meta.badge
      )}
    >
      {meta.label}
    </span>
  );
}

const AVATAR_SIZES = {
  xs: "h-4 w-4 text-[8px]",
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-[11px]",
  lg: "h-11 w-11 text-[13px]",
  xl: "h-14 w-14 text-[16px]",
} as const;

/** Avatar con foto de perfil en miniatura y respaldo por iniciales. */
export function Avatar({
  name,
  color = "#22d3ee",
  size = "md",
  photoUrl,
  className,
  ring = true,
}: {
  name: string;
  color?: string;
  size?: keyof typeof AVATAR_SIZES;
  photoUrl?: string | null;
  className?: string;
  ring?: boolean;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        title={name}
        className={cn(
          "shrink-0 rounded-md object-cover",
          AVATAR_SIZES[size],
          ring && "ring-1 ring-neon/40",
          className
        )}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-bold text-void",
        AVATAR_SIZES[size],
        className
      )}
      style={{ background: `linear-gradient(140deg, ${color}, ${color}88)` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        <span className="h-1 w-1 rounded-full bg-neon" />
        {children}
      </h3>
      {hint ? <span className="font-mono text-[10px] text-slate-600">{hint}</span> : null}
    </div>
  );
}

export function Panel({
  children,
  className,
  corners = true,
}: {
  children: React.ReactNode;
  className?: string;
  corners?: boolean;
}) {
  return (
    <div className={cn("hud relative rounded-lg", className)}>
      {corners && (
        <>
          <span className="corner-tl" />
          <span className="corner-br" />
        </>
      )}
      {children}
    </div>
  );
}
