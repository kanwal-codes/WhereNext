"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { SkeletonBand } from "@/components/Skeleton";
import { ArrowLeft, Heart } from "lucide-react";
import { RailButton } from "@/components/RailButton";
import { DiscoverySurface } from "@/features/places/ui/DiscoverySurface";

function DiscoverContent({
  view,
  onViewChange,
  onSavedCountChange,
}: {
  view: "results" | "saved";
  onViewChange: (v: "results" | "saved") => void;
  onSavedCountChange: (n: number) => void;
}) {
  const { tripId, data } = useTripData();
  // Arriving from "See more" on a place's nearby recommendations (?q=...) runs that
  // search here instead of landing on the generic mixed feed.
  const initialQuery = useSearchParams().get("q") ?? undefined;
  return (
    <DiscoverySurface
      tripId={tripId}
      initialSaved={data?.savedPlaces}
      initialQuery={initialQuery}
      view={view}
      onViewChange={onViewChange}
      onSavedCountChange={onSavedCountChange}
    />
  );
}

export default function DiscoverPage() {
  const [view, setView] = useState<"results" | "saved">("results");
  const [savedCount, setSavedCount] = useState(0);
  return (
    <RouteScaffold
      eyebrow="Discover"
      title="Somewhere worth going next"
      phoneQuietTitle
      phoneHideSwitcher
      railAction={
        view === "saved" ? (
          <RailButton icon={<ArrowLeft />} onClick={() => setView("results")}>Back to Discover</RailButton>
        ) : (
          <RailButton icon={<Heart />} onClick={() => setView("saved")} ariaLabel={`Saved places, ${savedCount}`}>{`Saved (${savedCount})`}</RailButton>
        )
      }
    >
      <Suspense fallback={<SkeletonBand count={6} className="mt-5" />}>
        <DiscoverContent view={view} onViewChange={setView} onSavedCountChange={setSavedCount} />
      </Suspense>
    </RouteScaffold>
  );
}
