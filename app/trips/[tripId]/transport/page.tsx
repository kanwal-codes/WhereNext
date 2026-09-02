"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { TransportSurface } from "@/features/transport/ui/TransportSurface";

export default function TransportPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold eyebrow="Transport" title="Transport" description="Getting between places, and getting there.">
      <TransportSurface tripId={tripId} origin={data?.trip.origin ?? ""} destination={data?.trip.destination ?? ""} />
    </RouteScaffold>
  );
}
