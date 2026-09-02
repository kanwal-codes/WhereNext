"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { MapSurface } from "@/features/maps/ui/MapSurface";
import { TripWeather } from "@/components/TripWeather";

export default function MapPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold
      eyebrow="Getting around"
      title="Your trip on a map"
      description="Every stop pinned in visit order, day by day — plus a browse mode for tracing transit routes between any two places."
    >
      {data?.trip?.destination && <TripWeather tripId={tripId} location={data.trip.destination} card className="mb-6" />}
      <MapSurface tripId={tripId} />
    </RouteScaffold>
  );
}
