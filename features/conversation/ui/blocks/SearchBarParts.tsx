"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronLeft, ChevronRight, Pencil, type LucideIcon } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { cn } from "@/lib/utils";

/** The pieces the flights and stays search bars share: day maths, an editable place, a day with steppers, and the sweep shown while a search loads. */

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** The first day a fare can be searched for: the providers are asked about the future only. */
export const tomorrowIso = () => isoOf(new Date(Date.now() + 864e5));
export const shiftIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return isoOf(d);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 864e5);
export const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });


/** One end of the flight: shows the place; a tap turns it into a search box for another. */
export function PlaceField({ caption, Icon, label, code, endpoint, busy, onPick, srLabel, variant = "pill", className }: { caption: string; Icon: LucideIcon; label: string; code?: string; endpoint: string; busy: boolean; onPick: (label: string) => void; srLabel: string; /** "panel": sits inside a shared panel with its neighbour, the city set large. */ variant?: "pill" | "panel"; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => setDraft(""), [label]);
  useEffect(() => {
    if (!editing) return;
    const away = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [editing]);
  const captionEl = <span className="block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{caption}</span>;
  return (
    <div ref={rootRef} className={cn("relative min-w-0", className)} onKeyDown={(e) => e.key === "Escape" && setEditing(false)}>
      {editing ? (
        <div className={cn(variant === "panel" ? "h-full rounded-[inherit] bg-background px-4 pb-2.5 pt-3 ring-2 ring-inset ring-foreground/25" : "rounded-2xl border border-foreground/30 bg-background px-4 pb-2 pt-2.5 shadow-soft")}>
          {captionEl}
          <DestinationCombobox
            endpoint={endpoint}
            value={draft}
            onChange={setDraft}
            onSelect={(text) => {
              setEditing(false);
              if (text.trim() && text !== label) onPick(text.trim());
            }}
            placeholder={label}
            autoFocus
            inputClassName={cn("w-full bg-transparent font-medium outline-none placeholder:text-muted-foreground", variant === "panel" ? "font-display text-lg tracking-[-0.02em]" : "text-sm")}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft("");
            setEditing(true);
          }}
          aria-label={`${srLabel} ${label}. Change`}
          className={cn(
            "group flex w-full items-center gap-3 text-left transition-[border-color,background-color] duration-200 disabled:pointer-events-none disabled:opacity-60",
            variant === "panel" ? "h-full rounded-[inherit] px-4 py-3.5 hover:bg-muted/50" : "rounded-2xl border border-border bg-background/60 px-4 py-2.5 hover:border-foreground/25 hover:bg-muted/60",
          )}
        >
          <span className={cn("grid shrink-0 place-items-center rounded-full bg-coral-soft text-coral-ink", variant === "panel" ? "size-9" : "size-8")}><Icon className="size-4" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            {captionEl}
            {variant === "panel" ? (
              <span className="mt-0.5 block">
                <span className="block truncate font-display text-lg font-semibold leading-tight tracking-[-0.02em]">{label.split(",")[0]}</span>
                <span className="block truncate text-xs text-muted-foreground">{[label.split(",").slice(1).join(",").trim(), code].filter(Boolean).join(" · ")}</span>
              </span>
            ) : (
              <span className="flex items-baseline gap-2">
                <span className="truncate text-sm font-medium">{label}</span>
                {code && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{code}</span>}
              </span>
            )}
          </span>
          <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-70 group-focus-visible:opacity-70 max-sm:opacity-50" aria-hidden />
        </button>
      )}
    </div>
  );
}


/** A pill that shows the day and opens the browser's own date picker: the real input sits invisibly over it, so a phone gets its native wheel. */
export function DatePill({ date, min, onPick, busy, label }: { date: string | null; min: string; onPick: (iso: string) => void; busy: boolean; label: string }) {
  const reduce = useReducedMotion();
  const text = date ? longDate(date) : "Pick a date";
  return (
    <label className={cn("relative inline-flex h-9 min-w-0 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors hover:bg-muted has-[:focus-visible]:bg-muted has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring max-sm:h-11 max-sm:flex-1 max-sm:justify-center", busy && "pointer-events-none")}>
      <CalendarDays className="size-4 shrink-0 text-coral" aria-hidden />
      <span className="relative inline-flex overflow-hidden whitespace-nowrap tabular-nums sm:min-w-[6.5rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={text} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            {text}
          </motion.span>
        </AnimatePresence>
      </span>
      <input
        type="date"
        aria-label={label}
        value={date ?? ""}
        min={min}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker?.();
          } catch {
            /* the browser opens it from the focus instead */
          }
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </label>
  );
}

export const stepper = "grid size-9 max-sm:hidden place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35";

/** A day with a caption, a step either way, and the picker. */
export function DayControl({ caption, date, min, busy, onPick, prevLabel, nextLabel, dateLabel }: { caption: string; date: string | null; min: string; busy: boolean; onPick: (iso: string) => void; prevLabel: string; nextLabel: string; dateLabel: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="pl-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:pl-0">{caption}</span>
      {/* On a phone the day is one wide, easy-to-hit pill that opens the phone's own date wheel; the one-day steppers are for a pointer. */}
      <div className="inline-flex items-center rounded-full border border-border bg-background/60 max-sm:w-full">
        <button type="button" aria-label={prevLabel} disabled={busy || !date || shiftIso(date, -1) < min} onClick={() => date && onPick(shiftIso(date, -1))} className={stepper}><ChevronLeft className="size-4" aria-hidden /></button>
        <DatePill date={date} min={min} onPick={onPick} busy={busy} label={dateLabel} />
        <button type="button" aria-label={nextLabel} disabled={busy || !date} onClick={() => date && onPick(shiftIso(date, 1))} className={stepper}><ChevronRight className="size-4" aria-hidden /></button>
      </div>
    </div>
  );
}


/** A thin sweep along a bar's edge while a new search loads. */
export function SearchSweep({ busy }: { busy: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
      {busy && !reduce && <motion.span className="absolute inset-y-0 w-1/3 rounded-full bg-coral" initial={{ x: "-100%" }} animate={{ x: "300%" }} transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }} />}
      {busy && reduce && <span className="absolute inset-0 bg-coral/60" />}
    </div>
  );
}
