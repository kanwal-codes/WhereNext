"use client";

import { PHONE_V2 } from "@/lib/phone-v2";
import { useMediaQuery } from "@/lib/use-media-query";
import { useTodayData, type TodayData } from "@/features/itinerary/application/useTodayData";
import { TodayPhone } from "@/features/itinerary/ui/TodayPhone";
import { TodayWide } from "@/features/itinerary/ui/TodayWide";

export function TodayView({ tripId }: { tripId: string }) {
  const today = useTodayData(tripId);
  // Phone redesign: the approved Today (a map of the day, one "Next up" card, then what is left).
  const narrow = useMediaQuery("(max-width: 1023.98px)");

  if (!today.data) {
    return <p className="mx-auto max-w-lg px-5 py-16 text-center text-sm text-muted-foreground">Nothing saved for offline yet. Open this trip while online first.</p>;
  }
  const ready = today as TodayData;
  return PHONE_V2 && narrow ? <TodayPhone tripId={tripId} today={ready} /> : <TodayWide tripId={tripId} today={ready} />;
}
