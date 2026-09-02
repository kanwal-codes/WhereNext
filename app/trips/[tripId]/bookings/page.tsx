"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { EssentialsSurface } from "@/features/essentials/ui/EssentialsSurface";

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold eyebrow="Bookings & essentials" title="Bookings & essentials" description="The practical checklist for this trip — visas, packing, connectivity, customs.">
      <EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} />
    </RouteScaffold>
  );
}
