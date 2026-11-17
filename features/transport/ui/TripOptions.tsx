"use client";

import { DateField, TimeField } from "@/components/DateTimeField";
import { Minus, Plus } from "lucide-react";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { Sheet } from "@/components/motion-primitives";
import { SheetHeader } from "@/components/SheetHeader";
import { sheetPrimary } from "@/components/motion/sheetActions";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { shiftWhen, todayLocal, type When } from "@/lib/application/travel-time";

const chip = "inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-medium ring-1 ring-border transition-[background-color,transform] hover:bg-accent/40 active:scale-[0.97] disabled:opacity-40";

/**
 * When and who, in one sheet: the day and time to leave (or arrive by), how many are travelling, and, for flights, a return day. It opens from
 * the pills under the ways-to-get-there switch. A bottom sheet on a phone, a dialog on a wide screen. Times are the clock where the journey starts.
 */
export function TripOptionsSheet({
  open,
  onClose,
  when,
  onWhen,
  travellers,
  onTravellers,
  returnDate,
  onReturnDate,
  showReturn,
  tripDates,
}: {
  open: boolean;
  onClose: () => void;
  when: When | null;
  onWhen: (when: When | null) => void;
  travellers: number;
  onTravellers: (n: number) => void;
  returnDate: string;
  onReturnDate: (date: string) => void;
  /** Flights only: the other ways to get there have no return day. */
  showReturn: boolean;
  /** The trip's own days, offered as one tap. */
  tripDates?: { start: string; end?: string | null };
}) {
  const phone = useMediaQuery("(max-width: 1023.98px)");
  const today = todayLocal();
  const setDate = (date: string) => onWhen(date ? { kind: when?.kind ?? "depart", date, time: when?.time ?? "09:00" } : null);

  return (
    <Sheet open={open} onClose={onClose} side={phone ? "bottom" : "center"} ariaLabel="When and who" footer={<button type="button" onClick={onClose} className={sheetPrimary}>Done</button>} padded={phone} className={cn("bg-background", !phone && "icons-fine p-5")}>
      <SheetHeader title="When and who" onClose={onClose} bordered={false} />
      <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto overscroll-contain -mx-1 px-1">
        <div className="space-y-4">
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
              <DateField min={today} value={when?.date ?? ""} onChange={setDate} placeholder="Today" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
              Time
              <TimeField value={when?.time ?? ""} disabled={!when} onChange={(v) => when && v && onWhen({ ...when, time: v })} placeholder="Now" />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip} onClick={() => onWhen(null)} disabled={!when}>
              Now
            </button>
            <button type="button" className={chip} onClick={() => onWhen(shiftWhen(when, -30))}>
              30 min earlier
            </button>
            <button type="button" className={chip} onClick={() => onWhen(shiftWhen(when, 30))}>
              30 min later
            </button>
            {tripDates && (
              <button
                type="button"
                className={chip}
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

          {showReturn && (
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              Return day <span className="font-normal">(optional)</span>
              <DateField min={when?.date ?? today} value={returnDate} onChange={onReturnDate} placeholder="Add a return day" />
            </label>
          )}
        </div>
      </div>
    </Sheet>
  );
}
