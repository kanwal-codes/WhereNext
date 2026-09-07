"use client";

import { useState } from "react";
import { useTripData } from "@/components/TripDataProvider";
import { RouteScaffold } from "@/components/RouteScaffold";
import { GettingAroundTabs, MapSurface } from "@/features/maps/ui/MapSurface";
import { TripWeather } from "@/components/TripWeather";

export default function MapPage() {
  const { tripId, data } = useTripData();
  const [tab, setTab] = useState<"trip" | "browse">("trip");
  return (
    <RouteScaffold
      eyebrow="Getting around"
      title="Your trip on a map"
      tabs={<GettingAroundTabs tab={tab} onChange={setTab} />}
    >
      {data?.trip?.destination && <TripWeather tripId={tripId} location={data.trip.destination} card className="mb-6" />}
      <MapSurface tripId={tripId} tab={tab} />
    </RouteScaffold>
  );
}
