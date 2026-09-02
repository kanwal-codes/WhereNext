"use client";

import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { BudgetSurface } from "@/features/budget/ui/BudgetSurface";

export default function BudgetPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold eyebrow="Budget" title="Budget" description="A transparent estimate for this trip — an assumption, not a live quote.">
      <BudgetSurface tripId={tripId} durationDays={data?.trip.duration_days} travelers={data?.trip.travelers} />
    </RouteScaffold>
  );
}
