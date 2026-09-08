"use client";

import { useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { GettingAroundTabs, MapSurface } from "@/features/maps/ui/MapSurface";

export default function MapPage() {
  const { tripId } = useTripData();
  const [tab, setTab] = useState<"trip" | "browse">("trip");
  return (
    <RouteScaffold
      eyebrow="Getting around"
      title={tab === "trip" ? "Your trip on a map" : "Find your way there"}
      tabs={<GettingAroundTabs tab={tab} onChange={setTab} />}
    >
      <MapSurface tripId={tripId} tab={tab} />
    </RouteScaffold>
  );
}
