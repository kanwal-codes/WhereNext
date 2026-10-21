"use client";

import { cloneElement, isValidElement, useId, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Reveal, Sheet } from "@/components/motion-primitives";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/* --------------------------------- pieces -------------------------------- */

export function SettingSection({ id, title, blurb, action, inline = false, children }: { id: string; title: string; blurb: string; action?: ReactNode; /** Phone redesign: stays on the page (the notification switches) instead of opening in a sheet. */ inline?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  if (phone && !inline) {
    return (
      <section id={id} className="scroll-mt-28">
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="flex min-h-[4.25rem] w-full items-center gap-3.5 border-b border-hairline py-2 text-left">
          <span className="min-w-0 flex-1">
            <b className="block font-display text-base leading-tight font-medium tracking-[-0.01em]">{title}</b>
            <span className="text-sm text-ink-soft">{blurb}</span>
          </span>
          <ChevronRight className="size-[1.125rem] shrink-0 text-muted-foreground" aria-hidden />
        </button>
        <Sheet open={open} onClose={() => setOpen(false)} side="bottom" ariaLabel={title} className="rounded-t-4xl bg-background px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="pb-3 font-display text-xl font-medium tracking-[-0.02em]">{title}</p>
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto pb-2">{children}</div>
        </Sheet>
      </section>
    );
  }
  if (phone && inline) {
    return (
      <section id={id} className="scroll-mt-28 pt-6">
        <h2 className="font-display text-xl font-medium tracking-[-0.02em]">{title}</h2>
        <p className="mt-1 text-sm text-ink-soft">{blurb}</p>
        <div className="mt-2 space-y-6">{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className="scroll-mt-28">
      <Reveal y={18}>
       <div className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft sm:p-9">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-2xl tracking-tight sm:text-3xl">{title}</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
        <div className="mt-8 space-y-8">{children}</div>
       </div>
      </Reveal>
    </section>
  );
}

export function Pill({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-foreground">{children}</span>;
}

/** A level shown as filled steps ("Generous" = 4 of 4), so pace and budget read at a glance. */
function Meter({ value, max }: { value: number; max: number }) {
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: max }, (_, i) => <span key={i} className={cn("h-1.5 w-6 rounded-full transition-colors", i <= value ? "bg-coral" : "bg-border")} />)}
    </span>
  );
}

export function ReadRow({ label, value, note, level }: { label: string; value: string; note?: string; level?: { value: number; max: number } }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-4">
      <p className="eyebrow mb-2">{label}</p>
      <p className="flex items-center justify-between gap-3 font-display text-xl tracking-tight text-foreground">
        {value}
        {level && <Meter value={level.value} max={level.max} />}
      </p>
      {note ? <p className="mt-1 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

/** A labelled form field. The label is linked to a plain input, select or textarea inside, so a screen reader announces it. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  const native = isValidElement<{ id?: string }>(children) && typeof children.type === "string" && ["input", "select", "textarea"].includes(children.type);
  const control = native ? cloneElement(children, { id: children.props.id ?? id }) : children;
  const forId = native ? (children.props.id ?? id) : undefined;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label htmlFor={forId} className="text-xs font-medium tracking-wide text-ink-soft">{label}</label>
        {hint}
      </div>
      {control}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
        active ? "border-transparent bg-coral text-background" : "border-border bg-background text-ink-soft hover:border-ink/25 hover:text-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

/** `clearable`: choosing the chosen one again unchooses it, so a preference can go back to "not set". */
export function Segmented({ options, value, onChange, clearable }: { options: string[]; value: string; onChange: (v: string) => void; clearable?: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-border bg-surface p-1">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(clearable && value === o ? "" : o)} className="relative rounded-full px-3.5 py-1.5 text-sm transition-colors">
          {value === o && (
            <motion.span layoutId={`seg-${options.join("")}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
          )}
          <span className={cn("relative", value === o ? "text-primary-foreground" : "text-ink-soft")}>{o}</span>
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { haptic("select"); onChange(!checked); }}
      className={cn("relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors before:absolute before:-inset-2.5 before:content-['']", checked ? "bg-coral" : "bg-border")}
    >
      <motion.span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-soft"
        animate={{ left: checked ? "18px" : "2px" }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
      />
    </button>
  );
}

export function ToggleRow({ title, note, checked, onChange }: { title: string; note: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-border py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{note}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function strengthOf(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

export const asDietaryArray = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" && v ? [v] : []);
