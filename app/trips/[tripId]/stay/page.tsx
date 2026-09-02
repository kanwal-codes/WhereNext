"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { StaySurface } from "@/features/stays/ui/StaySurface";

export default function StayPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold eyebrow="Stay" title="Stay" description="Where to base yourself, weighed against the places you've saved.">
      <StaySurface tripId={tripId} destination={data?.trip.destination ?? ""} />
    </RouteScaffold>
  );
}
