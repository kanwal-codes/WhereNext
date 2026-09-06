"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { SkeletonCards } from "@/components/Skeleton";
import { DiscoverySurface } from "@/features/places/ui/DiscoverySurface";

function DiscoverContent() {
  const { tripId, data } = useTripData();
  // Arriving from "See more" on a place's nearby recommendations (?q=...) runs that
  // search here instead of landing on the generic mixed feed.
  const initialQuery = useSearchParams().get("q") ?? undefined;
  return <DiscoverySurface tripId={tripId} initialSaved={data?.savedPlaces} initialQuery={initialQuery} />;
}

export default function DiscoverPage() {
  return (
    <RouteScaffold
      wide
      eyebrow="Discover"
      title="Everything to do in one place"
      description="A mix built from your trip, then filter by what you're after — food, sights, nightlife, outdoors, activities, events, shopping, stays."
    >
      <Suspense fallback={<SkeletonCards count={6} />}>
        <DiscoverContent />
      </Suspense>
    </RouteScaffold>
  );
}
