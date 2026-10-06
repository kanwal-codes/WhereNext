"use client";

import { useId, useState } from "react";
import { CalendarClock, ChevronDown, Minus, Plus, Users } from "lucide-react";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { cn } from "@/lib/utils";
import { shiftWhen, todayLocal, whenLabel, type When } from "@/lib/application/travel-time";

const field = "h-11 w-full min-w-0 rounded-xl bg-card px-3 text-sm text-foreground ring-1 ring-border outline-none transition-shadow focus:ring-2 focus:ring-ink/80 [color-scheme:light]";
const chip = "inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium ring-1 ring-border transition-[background-color,transform] hover:bg-accent/40 active:scale-[0.97]";

/**
 * When and who: the day and time to leave (or arrive by), how many are travelling, and a return day for flights. Two chips say
 * what is set; they open one card with the controls. Times are the clock at the place the journey starts.
 */
export function TripOptions({
  when,
  onWhen,
  travellers,
  onTravellers,
  returnDate,
  onReturnDate,
  tripDates,
}: {
  when: When | null;
  onWhen: (when: When | null) => void;
  travellers: number;
  onTravellers: (n: number) => void;
  returnDate: string;
  onReturnDate: (date: string) => void;
  /** The trip's own days, offered as one tap. */
  tripDates?: { start: string; end?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const today = todayLocal();
  const setDate = (date: string) => onWhen(date ? { kind: when?.kind ?? "depart", date, time: when?.time ?? "09:00" } : null);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cn(chip, open && "ring-2 ring-ink/80")} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <CalendarClock className="size-4 text-ink-soft" aria-hidden="true" />
          {whenLabel(when)}
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-300", open && "rotate-180")} aria-hidden="true" />
        </button>
        <button type="button" className={chip} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
          <Users className="size-4 text-ink-soft" aria-hidden="true" />
          {travellers} traveller{travellers === 1 ? "" : "s"}
        </button>
      </div>

      <div id={panelId} className={cn("grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden" inert={!open}>
          <div className="mt-3 space-y-4 rounded-[22px] bg-surface p-4 ring-1 ring-border">
            <SegmentedSwitch
              label="Leave or arrive"
              className="w-full [&>*]:flex-1"
              value={when?.kind ?? "depart"}
              onChange={(kind) => onWhen({ kind, date: when?.date ?? today, time: when?.time ?? "09:00" })}
              options={[
                { key: "depart", label: "Leave at" },
                { key: "arrive", label: "Arrive by" },
              ]}
            />

            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Day
                <input type="date" min={today} value={when?.date ?? ""} onChange={(e) => setDate(e.target.value)} className={field} />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                Time
                <input type="time" value={when?.time ?? ""} disabled={!when} onChange={(e) => when && e.target.value && onWhen({ ...when, time: e.target.value })} className={cn(field, "disabled:opacity-50")} />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" className={cn(chip, "h-8 px-3 text-xs")} onClick={() => onWhen(null)} disabled={!when}>
                Now
              </button>
              <button type="button" className={cn(chip, "h-8 px-3 text-xs")} onClick={() => onWhen(shiftWhen(when, -30))}>
                30 min earlier
              </button>
              <button type="button" className={cn(chip, "h-8 px-3 text-xs")} onClick={() => onWhen(shiftWhen(when, 30))}>
                30 min later
              </button>
              {tripDates && (
                <button
                  type="button"
                  className={cn(chip, "h-8 px-3 text-xs")}
                  onClick={() => {
                    onWhen({ kind: "depart", date: tripDates.start, time: when?.time ?? "09:00" });
                    if (tripDates.end) onReturnDate(tripDates.end);
                  }}
                >
                  Trip dates
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Travellers</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-card p-1 ring-1 ring-border">
                <button type="button" aria-label="One fewer traveller" disabled={travellers <= 1} onClick={() => onTravellers(travellers - 1)} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-accent/60 disabled:opacity-35">
                  <Minus className="size-4" aria-hidden="true" />
                </button>
                <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{travellers}</span>
                <button type="button" aria-label="One more traveller" disabled={travellers >= 9} onClick={() => onTravellers(travellers + 1)} className="grid size-8 place-items-center rounded-full transition-colors hover:bg-accent/60 disabled:opacity-35">
                  <Plus className="size-4" aria-hidden="true" />
                </button>
              </span>
            </div>

            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              Return day <span className="font-normal">(flights, optional)</span>
              <input type="date" min={when?.date ?? today} value={returnDate} onChange={(e) => onReturnDate(e.target.value)} className={field} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
