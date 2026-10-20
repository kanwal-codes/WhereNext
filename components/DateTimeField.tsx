"use client";

import { CalendarDays, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A date or a time shown the way a person reads it ("Thu, Nov 26", "7:30 PM") with an icon, instead of the browser's own
 * "yyyy-mm-dd" and "--:-- --" boxes. The real native input sits invisibly over the whole field, so a tap still opens the
 * device's own picker (the best one there is on a phone) and keyboard, labels and validation keep working.
 */
type Common = { value: string; onChange: (value: string) => void; disabled?: boolean; required?: boolean; placeholder?: string; className?: string; ariaLabel?: string };

const shell = "relative flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-border bg-background px-4 py-2.5 text-body transition-[background-color,border-color,box-shadow] focus-within:border-ink/25 focus-within:bg-card focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--color-ink)_5%,transparent),0_10px_24px_-14px_color-mix(in_oklab,var(--color-ink)_30%,transparent)] has-[:disabled]:bg-muted has-[:disabled]:text-muted-foreground";

function Shell({ shown, empty, icon: Icon, className, children }: { shown: string; empty: boolean; icon: typeof Clock; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(shell, className)}>
      <span className={cn("min-w-0 truncate tabular-nums", empty && "text-muted-foreground")}>{shown}</span>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {children}
    </span>
  );
}

const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
};
const clock = (hhmm: string) => {
  const d = new Date(`1970-01-01T${hhmm}`);
  return Number.isNaN(d.getTime()) ? hhmm : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export function DateField({ value, onChange, min, max, disabled, required, placeholder = "Add date", className, ariaLabel }: Common & { min?: string; max?: string }) {
  return (
    <Shell shown={value ? longDate(value) : placeholder} empty={!value} icon={CalendarDays} className={className}>
      <input type="date" value={value} min={min} max={max} disabled={disabled} required={required} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
    </Shell>
  );
}

export function TimeField({ value, onChange, disabled, required, placeholder = "Add time", className, ariaLabel }: Common) {
  return (
    <Shell shown={value ? clock(value) : placeholder} empty={!value} icon={Clock} className={className}>
      <input type="time" value={value} disabled={disabled} required={required} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
    </Shell>
  );
}
