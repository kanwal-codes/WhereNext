"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpDown, MapPin, Minus, Plus } from "lucide-react";
import { DestinationCombobox } from "@/components/DestinationCombobox";
import { Sheet, ease } from "@/components/motion-primitives";
import { searchButton } from "@/components/motion/sheetActions";
import { FoldAway } from "@/components/FoldAway";
import { SheetHeader } from "@/components/SheetHeader";
import { SlidingTabs } from "@/features/conversation/ui/blocks/SlidingTabs";
import { cn } from "@/lib/utils";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import { useMediaQuery } from "@/lib/use-media-query";
import { canSearch, MAX_TRAVELLERS, tomorrow, travellersLine, type FlightDraft } from "../domain/flights-page";

const TRIP_TYPES = [{ key: 0, content: <span>Round trip</span> }, { key: 1, content: <span>One way</span> }];
/** Round trip unless the draft is a one-way one: a search that has no days yet (the home page's) starts as the likelier round trip. */
const wantsRound = (d: FlightDraft) => d.ret !== null || d.depart === null;
const longDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A day as a tile. The real date input lies invisibly over it, so a phone opens its own wheel and a desktop its own calendar. */
function DateTile({ caption, value, min, placeholder, disabled, onPick }: { caption: string; value: string | null; min: string; placeholder: string; disabled?: boolean; onPick: (iso: string) => void }) {
  return (
    <label className={cn("relative block rounded-2xl bg-surface px-4 pb-3 pt-2.5 ring-1 ring-border transition-[box-shadow,opacity,transform] duration-200 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/80", disabled ? "opacity-45" : "cursor-pointer active:scale-[0.985]")}>
      <span className="eyebrow block">{caption}</span>
      <span className={cn("mt-0.5 block font-display text-lg font-medium tracking-[-0.015em] tabular-nums", !value && "text-muted-foreground")}>{value ? longDay(value) : placeholder}</span>
      <input
        type="date"
        aria-label={caption}
        value={value ?? ""}
        min={min}
        disabled={disabled}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* the browser opens it from the focus */ } }}
        className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:size-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
      />
    </label>
  );
}

/**
 * The flights search, opened from the header pill: where, which days, how many people. From the top on a phone (the field first, the keyboard never
 * over the answers) and a centred dialog on desktop, the way Directions and the place picker open. Searching is one tap once it is filled in; nothing
 * is searched before that, so no fare is priced for a day nobody chose.
 */
export function FlightSearchSheet({ open, onClose, tripId, draft, onSearch, focus }: {
  open: boolean;
  onClose: () => void;
  /** The trip the search belongs to, or null from the home page, where there is none. */
  tripId: string | null;
  draft: FlightDraft;
  onSearch: (next: FlightDraft) => void;
  /** Which part to put the cursor in on opening: the destination by default, or the days when the place is settled. */
  focus?: "to" | "dates";
}) {
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const reduce = useReducedMotion();
  const keyboard = useKeyboardInset(open && phone);
  const [typing, setTyping] = useState(false);
  const [fields, setFields] = useState<FlightDraft>(draft);
  const [round, setRound] = useState(wantsRound(draft));
  const [turn, setTurn] = useState(0);
  const toRef = useRef<HTMLInputElement>(null);
  const min = tomorrow();
  // Each opening starts from what the page holds now (the last search, or what the trip suggests).
  useEffect(() => {
    if (open) { setFields(draft); setRound(wantsRound(draft)); }
  }, [open, draft]);

  const set = (patch: Partial<FlightDraft>) => setFields((f) => ({ ...f, ...patch }));
  const pickDepart = (iso: string) => {
    // Moving the departure carries the return with it, so the trip keeps its length; a return that now falls before it becomes a week.
    const kept = fields.depart && fields.ret ? Math.max(1, Math.round((Date.parse(`${fields.ret}T12:00:00`) - Date.parse(`${fields.depart}T12:00:00`)) / 864e5)) : 7;
    set({ depart: iso, ret: round ? plusDays(iso, kept) : null });
  };
  const toggleRound = (on: boolean) => {
    setRound(on);
    set({ ret: on && fields.depart ? plusDays(fields.depart, 7) : null });
  };
  const ready = canSearch({ ...fields, ret: round ? fields.ret : null });
  const go = () => {
    if (!ready) return;
    onSearch({ ...fields, fromLabel: fields.fromLabel.trim(), toLabel: fields.toLabel.trim(), ret: round ? fields.ret : null });
    onClose();
  };
  const endpoint = tripId ? `/api/trips/${tripId}/flights/places` : "/api/flights/places";
  const field = "h-14 min-w-0 flex-1 bg-transparent font-display text-lg font-medium tracking-[-0.015em] outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:text-muted-foreground/70";
  return (
    <Sheet open={open} onClose={onClose} side={phone ? "top" : "center"} ariaLabel="Search flights" initialFocus={focus === "dates" ? undefined : (toRef as RefObject<HTMLElement | null>)} className={cn("icons-fine max-lg:max-h-[min(88dvh,var(--vvh,88dvh))]! lg:max-w-md lg:p-5", keyboard && typing && "max-lg:min-h-[min(88dvh,var(--vvh,88dvh))]")}>
      <SheetHeader title="Flights" onClose={onClose} bordered={false} />
      <form onSubmit={(e) => { e.preventDefault(); go(); }} className={cn("px-4 pb-5 lg:px-0 lg:pb-0", keyboard && "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-0 pt-1")}>
        <div onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} className="relative rounded-2xl bg-surface ring-1 ring-border transition-shadow focus-within:bg-card focus-within:ring-2 focus-within:ring-ink/80">
          <div className="flex items-center gap-3.5 px-4 pr-16 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:static">
            <span aria-hidden className="grid size-5 shrink-0 place-items-center"><span className="size-3 rounded-[3px] bg-primary" /></span>
            <DestinationCombobox endpoint={endpoint} value={fields.fromLabel} onChange={(v) => set({ fromLabel: v })} onSelect={(v) => set({ fromLabel: v })} placeholder="From" ariaLabel="Flying from" inputClassName={field} quietFocus />
          </div>
          <div className="mx-4 border-t border-border" />
          <div className="flex items-center gap-3.5 px-4 pr-16 [&>div]:min-w-0 [&>div]:flex-1 [&>div]:static">
            <MapPin aria-hidden className="size-5 shrink-0 text-ink-soft" />
            <DestinationCombobox endpoint={endpoint} value={fields.toLabel} onChange={(v) => set({ toLabel: v })} onSelect={(v) => set({ toLabel: v })} placeholder="Where to?" ariaLabel="Flying to" inputClassName={field} inputRef={toRef} quietFocus />
          </div>
          <button
            type="button"
            aria-label="Swap from and to"
            onClick={() => { setTurn((n) => n + 1); set({ fromLabel: fields.toLabel, toLabel: fields.fromLabel }); }}
            className="absolute right-3 top-1/2 z-10 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-ink-soft shadow-soft transition-[color,border-color,transform] duration-200 ease-out hover:border-foreground/25 hover:text-foreground active:scale-[0.94]"
          >
            <motion.span animate={{ rotate: turn * 180 }} transition={{ duration: reduce ? 0 : 0.4, ease }} className="grid place-items-center"><ArrowUpDown className="size-4" aria-hidden /></motion.span>
          </button>
        </div>

        <FoldAway folded={keyboard && typing}>
        <div className="mt-3.5 flex items-center justify-between gap-3">
          <SlidingTabs label="Trip type" className="w-fit daisy-tabs-sm" value={round ? 0 : 1} onChange={(i) => toggleRound(i === 0)} items={TRIP_TYPES} />
          <div className="flex items-center gap-1 rounded-full bg-muted p-1" role="group" aria-label="Travellers">
            <button type="button" aria-label="Fewer travellers" disabled={fields.adults <= 1} onClick={() => set({ adults: fields.adults - 1 })} className="grid size-9 place-items-center rounded-full text-ink-soft transition-[background-color,transform,opacity] active:scale-[0.92] enabled:hover:bg-card disabled:opacity-35"><Minus className="size-4" aria-hidden /></button>
            <span className="min-w-[5.5rem] text-center text-sm font-medium tabular-nums" aria-live="polite">{travellersLine(fields.adults)}</span>
            <button type="button" aria-label="More travellers" disabled={fields.adults >= MAX_TRAVELLERS} onClick={() => set({ adults: fields.adults + 1 })} className="grid size-9 place-items-center rounded-full text-ink-soft transition-[background-color,transform,opacity] active:scale-[0.92] enabled:hover:bg-card disabled:opacity-35"><Plus className="size-4" aria-hidden /></button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <DateTile caption="Depart" value={fields.depart} min={min} placeholder="Pick a day" onPick={pickDepart} />
          <DateTile caption="Return" value={round ? fields.ret : null} min={fields.depart ? plusDays(fields.depart, 1) : min} placeholder={round ? "Pick a day" : "One way"} disabled={!round} onPick={(iso) => set({ ret: iso })} />
        </div>
        </FoldAway>

        {/* With the keyboard up the form scrolls above it and the button stays at its foot, so it is never under the keys. */}
        <div className={cn("mt-4", keyboard ? "sticky bottom-0 -mx-4 rounded-b-4xl bg-background px-4 pb-3 pt-2" : "")}>
          <button type="submit" disabled={!ready} className={searchButton}>Search flights</button>
        </div>
      </form>
    </Sheet>
  );
}
