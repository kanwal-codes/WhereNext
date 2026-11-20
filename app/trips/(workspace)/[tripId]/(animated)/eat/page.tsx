"use client";

import { useState } from "react";
import { ArrowLeft, Heart } from "lucide-react";
import { RailButton } from "@/components/RailButton";
import { RouteScaffold } from "@/components/RouteScaffold";
import { useTripData } from "@/components/TripDataProvider";
import { EatSurface } from "@/features/eat/ui/EatSurface";

export default function EatPage() {
  const { tripId } = useTripData();
  const [view, setView] = useState<"results" | "saved">("results");
  const [savedCount, setSavedCount] = useState(0);
  return (
    <RouteScaffold
      eyebrow="Eat"
      title="Where to eat"
      description="Restaurants, cafés and bars near where you’re going."
      phoneQuietTitle
      phoneHideSwitcher
      railAction={
        view === "saved" ? (
          <RailButton icon={<ArrowLeft />} onClick={() => setView("results")}>Back to places to eat</RailButton>
        ) : (
          <RailButton icon={<Heart />} onClick={() => setView("saved")} ariaLabel={`Saved places, ${savedCount}`}>{`Saved (${savedCount})`}</RailButton>
        )
      }
    >
      <EatSurface tripId={tripId} view={view} onViewChange={setView} onSavedCountChange={setSavedCount} />
    </RouteScaffold>
  );
}
