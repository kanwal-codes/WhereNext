"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { ItinerarySurface } from "@/features/itinerary/ui/ItinerarySurface";

export default function ItineraryPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold eyebrow="Itinerary" title="Itinerary" description="The plan taking shape, day by day.">
      <ItinerarySurface tripId={tripId} initialItems={data?.itinerary} />
    </RouteScaffold>
  );
}
