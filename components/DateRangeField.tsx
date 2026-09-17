"use client";

import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { tripWhen } from "@/lib/trip-dates";

/** Local-time YYYY-MM-DD, matching how the rest of the app reads/writes trip dates —
 *  `toISOString()` would shift the date by a day for anyone behind UTC. */
const toISO = (d: Date | undefined): string => {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromISO = (iso: string): Date | undefined => {
  if (!iso) return undefined;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** One real calendar with the range highlighted, replacing two disconnected native date
 *  inputs. Themed entirely through react-day-picker's own CSS custom properties (see
 *  `.wn-calendar` in globals.css) — no re-implementation of its layout. */
export function DateRangeField({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const selected: DateRange | undefined = start || end ? { from: fromISO(start), to: fromISO(end) } : undefined;

  return (
    <div>
      <p className="px-0.5 text-xs text-muted-foreground">{tripWhen(start || null, end || null, null, "Pick your dates")}</p>
      <div className="wn-calendar mt-1.5 flex justify-center rounded-lg border border-border bg-background py-2">
        <DayPicker
          mode="range"
          selected={selected}
          onSelect={(range) => onChange(toISO(range?.from), toISO(range?.to))}
          defaultMonth={fromISO(start) ?? fromISO(end) ?? new Date()}
          numberOfMonths={1}
          showOutsideDays
        />
      </div>
    </div>
  );
}
