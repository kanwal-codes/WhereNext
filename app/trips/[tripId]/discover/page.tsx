"use client";

import { Suspense } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { SkeletonCards } from "@/components/Skeleton";
import { DiscoverySurface } from "@/features/places/ui/DiscoverySurface";

export default function DiscoverPage() {
  const { tripId, data } = useTripData();
  return (
    <RouteScaffold
      wide
      eyebrow="Discover"
      title="Everything to do in one place"
      description="A mix built from your trip, then filter by what you're after — food, sights, nightlife, outdoors, activities, events, shopping, stays."
    >
      <Suspense fallback={<SkeletonCards count={6} />}>
        <DiscoverySurface tripId={tripId} initialSaved={data?.savedPlaces} />
      </Suspense>
    </RouteScaffold>
  );
}
