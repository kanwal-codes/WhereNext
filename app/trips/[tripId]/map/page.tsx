"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { MapSurface } from "@/features/maps/ui/MapSurface";

export default function MapPage() {
  const { tripId } = useTripData();
  return (
    <RouteScaffold eyebrow="Map" title="Map" description="Routes and distances between places on this trip.">
      <MapSurface tripId={tripId} />
    </RouteScaffold>
  );
}
