"use client";

import React, { useEffect, useRef, useState } from "react";
import { Heart, Loader2 } from "lucide-react";
import type { Place } from "@/packages/contracts/place";
import { useTripDataMaybe } from "@/components/TripDataProvider";
import { useGuest } from "@/features/identity/ui/GuestProvider";
import { mutate } from "@/lib/client/mutation-queue";
import { notifyToast } from "@/lib/application/toast";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The heart on a place card: save it to the trip's saved places, or let it go. It is filled for a place that is
 * shortlisted or already on a day. A place on a day is the plan's, so the heart does not remove it from there;
 * that is what the add button's menu is for.
 */
export function SaveHeart({ tripId, place, compact = false, light = false }: { tripId: string; place: Place; compact?: boolean; /** On a light ground (a list row) rather than over a photo. */ light?: boolean }) {
  const data = useTripDataMaybe()?.data ?? null;
  const { guest, openGate } = useGuest();
  const itinerary = (data?.itinerary ?? []) as Array<{ title?: string; day_index?: number }>;
  const savedPlaces = (data?.savedPlaces ?? []) as Array<{ places?: { provider_id?: string } | null; provider_id?: string; providerId?: string }>;
  const day = itinerary.find((i) => i.title && norm(i.title) === norm(place.name))?.day_index;
  const savedNow = savedPlaces.some((s) => (s.places?.provider_id ?? s.provider_id ?? s.providerId) === place.providerId);
  const [saved, setSaved] = useState(savedNow);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Follow the trip snapshot when it refreshes, unless a write of ours is still in flight.
  useEffect(() => {
    if (!busyRef.current) setSaved(savedNow);
  }, [savedNow]);

  async function toggle() {
    if (guest) return openGate("save places");
    if (day) return notifyToast(`${place.name} is already on Day ${day}.`, "info");
    if (busyRef.current) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    busyRef.current = true;
    try {
      const res = await mutate(`/api/trips/${tripId}/places/bookmark`, { method: "PUT", body: { place, saved: next }, announce: ["places"] });
      if (!res.ok) throw new Error();
      notifyToast(res.queued ? `${place.name} — saved, will sync when you're back online.` : next ? `${place.name} saved.` : `Removed ${place.name} from the trip.`, res.queued ? "info" : "success");
    } catch {
      setSaved(!next);
      notifyToast(`Couldn’t update ${place.name}. Try again.`, "error");
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const on = saved || Boolean(day);
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={on}
      aria-label={on ? `Remove ${place.name} from saved places` : `Save ${place.name}`}
      className={cn(
        "pointer-events-auto relative z-10 grid shrink-0 place-items-center rounded-full border backdrop-blur-md backdrop-saturate-150 transition-[transform,background-color,color] duration-200 ease-out active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
        compact ? "size-8" : "size-10",
        light
          ? (on ? "border-transparent bg-coral-soft text-coral" : "border-border bg-background text-muted-foreground hover:text-foreground")
          : (on ? "border-transparent bg-white text-coral" : "border-white/25 bg-white/14 text-white hover:bg-white/25"),
      )}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Heart className={cn(compact ? "size-4" : "size-[18px]", "transition-transform duration-200", on && "scale-110 fill-current")} aria-hidden />}
    </button>
  );
}
