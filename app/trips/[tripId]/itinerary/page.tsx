"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { ItinerarySurface } from "@/features/itinerary/ui/ItinerarySurface";
import { readStayDecision } from "@/packages/contracts/stay";

export default function ItineraryPage() {
  const { tripId, data } = useTripData();
  const lockedStay = readStayDecision((data?.decisions ?? []) as Array<{ kind: string; value: unknown }>);
  return (
    <RouteScaffold eyebrow="Itinerary" title="The plan, day by day" description="Lock what's fixed; move the rest between days.">
      <ItinerarySurface tripId={tripId} initialItems={data?.itinerary} startDate={data?.trip?.start_date ?? null} lockedStay={lockedStay} />
    </RouteScaffold>
  );
}
