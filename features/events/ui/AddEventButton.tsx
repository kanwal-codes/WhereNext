"use client";

import { useState } from "react";
import { CalendarCheck, Check, Loader2, Plus } from "lucide-react";
import { Tactile } from "@/components/motion-primitives";
import { cn } from "@/lib/utils";
import { CINE_ICON_ACTION } from "@/features/conversation/ui/blocks/CineCard";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { mutate } from "@/lib/client/mutation-queue";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { notifyToast } from "@/lib/application/toast";
import { extractEventDayIndex, extractEventTime } from "@/lib/application/event-schedule";

/** Adds this event to the itinerary as a timed stop — day and time both derived from the
 * event's real schedule (Ticketmaster's embedded time, or the trip's start date), not guessed. */
export function AddEventButton({ tripId, title, rawDate, showTime, latitude, longitude, block = false, icon = false, primary = false }: {
  tripId: string; title: string; rawDate: string | null; showTime?: string | null;
  latitude?: number | null; longitude?: number | null;
  /** Phone dock: a full-height pill that shares the row with the tickets button. */
  block?: boolean;
  /** A round plus on a card (a check once it is on the trip), for places too small for the labelled button. */
  icon?: boolean;
  /** The phone's main action: a full-width black pill, the same as "Add to trip" on a place. */
  primary?: boolean;
}) {
  const data = useTripDataMaybe()?.data ?? null;
  const tripStartDate = (data?.trip as { start_date?: string | null } | null)?.start_date;
  const existing = (data?.itinerary ?? []).find((i: { title?: string }) => i.title?.trim().toLowerCase() === title.trim().toLowerCase()) as { day_index?: number } | undefined;
  const alreadyAdded = Boolean(existing);
  const [busy, setBusy] = useState(false);
  const { guest, openGate } = useGuest();

  async function add() {
    if (guest) return openGate("add events to your itinerary");
    if (busy || alreadyAdded) return;
    setBusy(true);
    try {
      const time = extractEventTime(rawDate, showTime);
      const dayIndex = extractEventDayIndex(rawDate, tripStartDate) ?? 1;
      const res = await mutate("/api/commands", {
        method: "POST",
        body: {
          type: "add_itinerary_item", tripId, title, dayIndex,
          ...(time ? { time } : {}),
          ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
        },
        announce: ["itinerary"],
      });
      if (!res.ok) throw new Error();
      notifyToast(`Added to Day ${dayIndex}${time ? ` at ${new Date(`2000-01-01T${time}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`, "success");
    } catch {
      notifyToast(`Couldn't add ${title} to your trip. Try again.`, "error");
    } finally {
      setBusy(false);
    }
  }

  if (icon) {
    return (
      <button
        type="button"
        disabled={busy || alreadyAdded}
        onClick={() => void add()}
        aria-label={alreadyAdded ? `${title} is on your trip` : `Add ${title} to your trip`}
        className={CINE_ICON_ACTION}
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : alreadyAdded ? <Check className="size-5" aria-hidden /> : <Plus className="size-5" aria-hidden />}
      </button>
    );
  }

  return (
    <Tactile lift={2} className={cn("inline-flex", block && "flex-1")}>
      <button
        type="button"
        disabled={busy || alreadyAdded}
        onClick={() => void add()}
        className={cn(primary ? "btn-primary h-12 w-full px-6 text-[0.9375rem]" : "btn-secondary inline-flex items-center gap-2", !primary && block && "h-12 w-full justify-center rounded-full", alreadyAdded && "!border-coral/35 !bg-coral-soft !text-coral-ink disabled:opacity-100")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarCheck className="size-4" />}
        {alreadyAdded ? (existing?.day_index ? `On Day ${existing.day_index}` : "On your trip") : "Add to trip"}
      </button>
    </Tactile>
  );
}
