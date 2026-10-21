"use client";

import { TripRouteWeather } from "@/components/TripWeather";
import { BookingNotices } from "@/components/overview/BookingNotices";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useMediaQuery } from "@/lib/use-media-query";
import type { StayDecision } from "@/packages/contracts/stay";
import { cn } from "@/lib/utils";
import { textAction } from "@/features/conversation/ui/blocks/ui";
import { PhoneDayView } from "./PhoneDayView";
import { BasedAtCard } from "./BasedAtCard";
import { DaySection } from "./DaySection";
import { useAddStop } from "../application/useAddStop";
import { useBookings } from "../application/useBookings";
import { useItineraryItems } from "../application/useItineraryItems";
import { useOpenPlace } from "../application/useOpenPlace";
import { cityOfDay, dayDate, planCentre, planDays } from "../domain/plan";

export function ItinerarySurface({
  tripId,
  initialItems,
  startDate = null,
  lockedStay = null,
  destination = null,
  trip = null,
  plannedDays = 0,
}: {
  tripId: string;
  initialItems?: Array<Record<string, unknown>>;
  startDate?: string | null;
  lockedStay?: StayDecision | null;
  destination?: string | null;
  /** The trip's own record: its saved cities place each day, and drive the per-city weather. */
  trip?: { destination?: string | null; start_date?: string | null; end_date?: string | null; stops?: unknown } | null;
  /** The trip's planned length: every one of its days is listed (and can be added to) even while it is still empty. */
  plannedDays?: number;
}) {
  // Phone redesign: one day at a time, with a week strip, a timeline and a sheet of actions per stop.
  const narrow = useMediaQuery("(max-width: 1023.98px)");
  const phone = narrow;
  const { items, setItems, itemsByDay, removed, move, moveWithinDay, toggleLock, setTime, reorder, remove, restore } = useItineraryItems({ tripId, initialItems });
  const { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add } = useAddStop({ tripId, setItems });
  const { bookedByDay, conflictsByDay, reservations } = useBookings({ tripId, startDate, items });
  const { openPlace, resolvingTitle } = useOpenPlace({ tripId, trip, startDate, destination });
  const [dragTitle, setDragTitle] = useState<string | null>(null);
  // On a phone a stop's controls (move, lock, remove) stay tucked away until its ⋯ is tapped.
  const [openTools, setOpenTools] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null); // `${day}:${beforeTitle ?? "end"}`
  const cityFor = (d: number) => cityOfDay(trip, startDate, d, bookedByDay);

  // Both derived from `items` alone — memoized so typing in the "add" title input (or any other
  // state change that doesn't touch `items`) doesn't re-scan and re-sort the whole list.
  // Suggestions are ranked toward where the plan already is: the first stop that has a location.
  const near = useMemo(() => planCentre(items), [items]);
  const days = useMemo(() => planDays(items, bookedByDay.keys(), plannedDays), [items, bookedByDay, plannedDays]);

  function onDropAt(toDay: number, beforeTitle: string | null) {
    setDropHint(null);
    const t = dragTitle;
    setDragTitle(null);
    if (t) reorder(t, toDay, beforeTitle);
  }

  const plan = { items, itemsByDay, days, bookedByDay, conflictsByDay, reservations, removed, near, cityFor };
  const actions = { items, setItems, itemsByDay, removed, move, moveWithinDay, toggleLock, setTime, reorder, remove, restore, openPlace, resolvingTitle };
  const adder = { title, setTitle, setPicked, day, setDay, addOpen, setAddOpen, add };
  if (phone) return <PhoneDayView tripId={tripId} startDate={startDate} trip={trip} plan={plan} actions={actions} adder={adder} />;

  return (
    <div className="min-w-0 space-y-8 sm:space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* On a phone the days are one swipeable row that runs to the screen edge, not a block that wraps onto a second line. */}
        <nav aria-label="Jump to a day" className="flex min-w-0 flex-wrap gap-2 max-sm:-mx-5 max-sm:w-[calc(100%+2.5rem)] max-sm:flex-nowrap max-sm:snap-x max-sm:overflow-x-auto max-sm:overscroll-x-contain max-sm:px-5 max-sm:py-1 max-sm:scroll-px-5 no-scrollbar">
          {days.map((d) => (
            <a
              key={d}
              href={`#day-${d}`}
              suppressHydrationWarning
              className="daisy-btn daisy-btn-sm h-9 max-lg:h-10 shrink-0 snap-start rounded-full border-border bg-card px-4 font-medium shadow-none hover:border-foreground/30 hover:bg-accent"
            >
              <span className="font-display tabular-nums">{String(d).padStart(2, "0")}</span>
              <span className="text-muted-foreground">{dayDate(startDate, d)?.split(",")[1]?.trim() ?? `Day ${d}`}</span>
            </a>
          ))}
        </nav>
        <a href={`/trips/${tripId}/today`} className="group inline-flex items-center gap-1 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground max-sm:py-2 max-lg:py-3">
          Today view <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </a>
      </div>

      <BookingNotices tripId={tripId} reservations={reservations} startDate={startDate} endDate={trip?.end_date} />
      {destination && <TripRouteWeather tripId={tripId} trip={trip ?? { destination }} />}

      {lockedStay && <BasedAtCard lockedStay={lockedStay} />}

      {days.map((d) => (
        <DaySection key={d} d={d} startDate={startDate} tripId={tripId} plan={plan} actions={actions} adder={adder} drag={{ dragTitle, setDragTitle, dropHint, setDropHint, onDropAt }} openTools={openTools} setOpenTools={setOpenTools} />
      ))}

      {removed && (
        <p role="status" className="rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
          {removed.title} removed.{" "}
          <button type="button" onClick={() => void restore()} className={cn(textAction, "text-sm underline")}>
            Undo
          </button>
        </p>
      )}
    </div>
  );
}
