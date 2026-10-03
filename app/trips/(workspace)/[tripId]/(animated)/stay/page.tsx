"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { StaySurface } from "@/features/stays/ui/StaySurface";

export default function StayPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold
      eyebrow="Stay"
      title="Where you’ll come back to each night"
      description="Hotels near your destination. Lock a room and the rest of the plan measures from it."
    >
      <StaySurface tripId={tripId} destination={data?.trip.destination ?? ""} />
    </RouteScaffold>
  );
}
