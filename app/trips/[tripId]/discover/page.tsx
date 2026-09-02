"use client";

import { Suspense } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { PageHeader } from "@/components/PageHeader";
import { DiscoverySurface } from "@/features/places/ui/DiscoverySurface";

export default function DiscoverPage() {
  const { tripId, data } = useTripData();
  return (
    <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
      <PageHeader
        eyebrow="Discover"
        title="Places that fit this trip"
        description="Search hotels, food, sights and neighbourhoods. Save what you like; pick two to four to compare."
      />
      <div className="mt-7">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
          <DiscoverySurface tripId={tripId} initialSaved={data?.savedPlaces} />
        </Suspense>
      </div>
    </div>
  );
}
