"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { EssentialsSurface } from "@/features/essentials/ui/EssentialsSurface";

export default function BookingsPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold
      eyebrow="Bookings & essentials"
      title="Before you go"
      description="The practical checklist. For destination-specific essentials — visas, SIMs, customs — ask the assistant; it builds one for your destination."
    >
      <EssentialsSurface tripId={tripId} initialCompleted={data?.essentials} />
    </RouteScaffold>
  );
}
